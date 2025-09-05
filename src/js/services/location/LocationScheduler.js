/**
 * LocationScheduler.js
 *
 * Orchestrates Tier 1 (network) vs GPS timing based on:
 * - Current SPA route (home vs others)
 * - Tab visibility and window focus
 * - Network changes and login events
 *
 * Desired behavior implemented:
 * - Home page load: run Tier 1 immediately; if off-campus then run a GPS burst at t=0s,+20s,+40s.
 *   If stable off-campus after burst, slow GPS polling to 60–90s. Otherwise, adaptive backoff 20→30→45→90s.
 *   Reset back to 20s on focus/network change while staying on Home.
 * - Other pages: run Tier 1 every 90–120s; only run GPS on focus, login, or manual refresh.
 * - When tab hidden: pause GPS completely; keep Tier 1 at 90–120s for coarse updates.
 */

import { networkDetectionService } from "./NetworkDetectionService.js";
import { campusLocationService } from "./CampusLocationService.js";
import { logManager } from "../../utils/debug/LogManager.js";
import { currentUser } from "../../store/userStore.js";

class LocationScheduler {
  constructor() {
    this.currentRoute = null; // 'home' | other
    this.visible = !document.hidden;
    this.online = navigator.onLine;
    this.started = false;

    // Timers/handles
    this.tier1Timer = null; // jittered Tier 1 loop (other pages or when hidden)
    this.gpsTimer = null; // adaptive GPS timer for Home
    this.gpsBurstTimeouts = [];

    // GPS adaptive backoff config for Home
    this.gpsIntervals = [20000, 30000, 45000, 90000];
    this.gpsBackoffIndex = 0;
    this.offCampusStable = false;
    this.lastGpsStatuses = []; // ring buffer of last statuses: 'on' | 'off'

    // Guard to avoid re-entrant scheduling
    this._scheduling = false;
  }

  start() {
    if (this.started) return;
    this.started = true;

    // Ensure the service's own generic polling doesn't fight with us
    try { campusLocationService.stopPresencePolling(); } catch (_) {}

    document.addEventListener("spa:page:load", (e) => {
      const route = e?.detail?.route || "home";
      this.onRouteChange(route);
    });
    document.addEventListener("spa:page:unload", (e) => {
      const route = e?.detail?.route;
      this.onPageUnload(route);
    });

    document.addEventListener("visibilitychange", () => this.onVisibilityChange());
    window.addEventListener("focus", () => this.onFocus());
    window.addEventListener("online", () => this.onOnline());
    window.addEventListener("offline", () => this.onOffline());

    // Login event bridging (service already listens to this for its triggers)
    window.addEventListener("storage", (e) => {
      if (e.key === "campusLocation_authTime") {
        this.onLogin();
      }
    });

    // Try to sync with current route (in case we start before first page event)
    const initialRoute = (window.location.hash || "#home").replace("#", "") || "home";
    this.onRouteChange(initialRoute);

    logManager.location.info("LocationScheduler started");
  }

  destroy() {
    this.clearAllTimers();
    this.started = false;
  }

  // ----- Route/visibility/network handlers -----
  async onRouteChange(route) {
    this.currentRoute = route;
    this.visible = !document.hidden;
    this.online = navigator.onLine;

    // Stop generic polling so scheduler governs
    try { campusLocationService.stopPresencePolling(); } catch (_) {}

    this.clearAllTimers();

    if (!this.isSharingEnabled()) {
      logManager.location.info("[Scheduler] Location sharing disabled - timers paused");
      return;
    }

    if (!this.visible) {
      // Hidden tab → GPS paused, keep Tier 1 coarse
      this.startTier1CoarseLoop();
      return;
    }

    if (route === "home") {
      await this.enterHomeMode();
    } else {
      await this.enterOtherPagesMode();
    }
  }

  onPageUnload(_route) {
    // Clean up when leaving a route
    this.clearAllTimers();
  }

  onVisibilityChange() {
    this.visible = !document.hidden;
    if (!this.isSharingEnabled()) return;

    if (!this.visible) {
      // Pause GPS completely, run Tier 1 coarse
      this.pauseGps();
      this.startTier1CoarseLoop();
      logManager.location.info("[Scheduler] Tab hidden → GPS paused; Tier 1 coarse active");
    } else {
      // Visible again: adapt based on route
      this.clearTier1LoopIfHome();
      if (this.currentRoute === "home") {
        this.resetGpsBackoffTo20();
        this.scheduleNextGps(0); // run immediately
      } else {
        // Other pages: no continuous GPS; Tier 1 loop continues
      }
    }
  }

  onFocus() {
    if (!this.isSharingEnabled()) return;
    if (this.currentRoute === "home") {
      this.resetGpsBackoffTo20();
      this.scheduleNextGps(0);
      logManager.location.info("[Scheduler] Focus → GPS reset to 20s baseline (immediate run)");
    } else {
      // GPS only on focus (single shot) for other pages
      this.runSingleGpsUpdate("focus");
    }
  }

  onOnline() {
    this.online = true;
    if (!this.isSharingEnabled()) return;
    if (this.currentRoute === "home") {
      this.resetGpsBackoffTo20();
      this.scheduleNextGps(0);
      logManager.location.info("[Scheduler] Network online → GPS reset to 20s baseline");
    } else {
      // Keep Tier1 loop; no GPS on other pages
      this.startTier1CoarseLoop(true);
    }
  }

  onOffline() {
    this.online = false;
    // Tier1 loop will naturally fail; GPS calls will fail too; keep quiet
  }

  onLogin() {
    if (!this.isSharingEnabled()) return;
    if (this.currentRoute !== "home") {
      // GPS single on login when not on Home
      this.runSingleGpsUpdate("login");
    } else {
      this.resetGpsBackoffTo20();
      this.scheduleNextGps(0);
    }
  }

  // ----- Modes -----
  async enterHomeMode() {
    this.offCampusStable = false;
    this.gpsBackoffIndex = 0;
    this.lastGpsStatuses = [];

    // 1) Run Tier 1 immediately
    const t1 = await this.runTier1Once("home_load");

    // 2) If Tier 1 fails or says off-campus → GPS burst
    const offCampus = !(t1 && t1.campusStatus === "on_campus");
    if (offCampus) {
      await this.runGpsBurst();
    }

    // 3) Continue with adaptive GPS
    if (this.offCampusStable) {
      // Stable off-campus → slow GPS: 60–90s jitter
      this.scheduleNextGps(this.rand(60000, 90000));
    } else {
      this.scheduleNextGps(this.gpsIntervals[this.gpsBackoffIndex]);
    }
  }

  async enterOtherPagesMode() {
    // Start Tier 1 coarse loop only; no continuous GPS
    await this.runTier1Once("page_load");
    this.startTier1CoarseLoop();
  }

  // ----- Tier 1 (network/IP) -----
  async runTier1Once(reason = "manual") {
    if (!this.online) return null;
    try {
      const start = Date.now();
      const t1 = await networkDetectionService.detectCampusPresence("iub");
      if (t1?.success) {
        const result = {
          coords: null, // no GPS coords for Tier 1
          timestamp: Date.now(),
          source: t1.method || "ipinfo_lite_as_domain",
          tier: 1,
          campusStatus: t1.campusStatus,
          provider: "network_detection_service",
          shouldWriteToDatabase: true,
          batteryOptimized: true,
          responseTime: Date.now() - start,
          userIP: t1.userIP,
          userOrganization: t1.userOrganization,
          matchReason: t1.matchReason,
        };
        // Feed into service for UI + DB
        campusLocationService.processFreshLocation(result);
        logManager.location.tier1(
          `[Scheduler] Tier 1 (${reason}): ${String(t1.campusStatus).toUpperCase()}`
        );
        return result;
      }
    } catch (e) {
      logManager.location.warn(`[Scheduler] Tier 1 failed: ${e?.message || e}`);
    }
    return null;
  }

  startTier1CoarseLoop(force = false) {
    if (this.tier1Timer && !force) return;
    this.clearTier1Loop();
    const runOnce = async () => {
      if (!this.isSharingEnabled()) return;
      await this.runTier1Once("coarse_loop");
      const nextDelay = this.rand(90000, 120000); // 90–120s
      this.tier1Timer = setTimeout(runOnce, nextDelay);
    };
    runOnce();
  }

  clearTier1Loop() {
    if (this.tier1Timer) {
      clearTimeout(this.tier1Timer);
      this.tier1Timer = null;
    }
  }

  clearTier1LoopIfHome() {
    if (this.currentRoute === "home") {
      this.clearTier1Loop();
    }
  }

  // ----- GPS scheduling -----
  async runGpsBurst() {
    // GPS burst: t=0, +20s, +40s
    this.cancelGpsBurst();
    const attempts = [0, 20000, 40000];
    const statuses = [];

    const runAttempt = async (idx) => {
      const pos = await this.safeGetGps(12000, false, `burst_${idx + 1}`);
      if (pos) {
        // Update DB/UI immediately
        campusLocationService.processFreshLocation(pos);
        // Evaluate campus boundary for stability check
        try {
          const presence = await campusLocationService.detectCampusPresence("iub", pos);
          const s = presence?.onCampus ? "on" : "off";
          statuses.push(s);
          this.pushStatus(s);
        } catch (_) {}
      }
    };

    // Schedule attempts
    for (let i = 0; i < attempts.length; i++) {
      const to = setTimeout(() => runAttempt(i), attempts[i]);
      this.gpsBurstTimeouts.push(to);
    }

    // After the burst completes (~45s), decide stability
    const finalize = setTimeout(() => {
      const offCount = statuses.filter((s) => s === "off").length;
      this.offCampusStable = offCount >= 2; // stable if 2+ say off-campus
      logManager.location.info(
        `[Scheduler] GPS burst complete → stableOffCampus=${this.offCampusStable}`
      );
    }, 45000);
    this.gpsBurstTimeouts.push(finalize);
  }

  cancelGpsBurst() {
    this.gpsBurstTimeouts.forEach((t) => clearTimeout(t));
    this.gpsBurstTimeouts = [];
  }

  scheduleNextGps(delayMs) {
    if (!this.visible) return; // GPS paused when hidden
    if (this.gpsTimer) clearTimeout(this.gpsTimer);
    this.gpsTimer = setTimeout(async () => {
      await this.runSingleGpsUpdate("timer");

      if (this.offCampusStable) {
        // Slow polling 60–90s
        this.scheduleNextGps(this.rand(60000, 90000));
      } else {
        // Adaptive backoff through 20→30→45→90
        if (this.gpsBackoffIndex < this.gpsIntervals.length - 1) {
          this.gpsBackoffIndex += 1;
        }
        this.scheduleNextGps(this.gpsIntervals[this.gpsBackoffIndex]);
      }
    }, Math.max(0, delayMs));
  }

  resetGpsBackoffTo20() {
    this.gpsBackoffIndex = 0;
  }

  pauseGps() {
    if (this.gpsTimer) {
      clearTimeout(this.gpsTimer);
      this.gpsTimer = null;
    }
    this.cancelGpsBurst();
  }

  async runSingleGpsUpdate(reason = "manual") {
    if (!this.visible || !this.isSharingEnabled()) return;
    const pos = await this.safeGetGps(12000, false, reason);
    if (!pos) return;

    // Update DB/UI
    campusLocationService.processFreshLocation(pos);

    // Track stability from recent samples
    try {
      const presence = await campusLocationService.detectCampusPresence("iub", pos);
      this.pushStatus(presence?.onCampus ? "on" : "off");
      // Mark off-campus stable if two recent are off
      if (!this.offCampusStable) {
        const lastTwo = this.lastGpsStatuses.slice(-2);
        if (lastTwo.length === 2 && lastTwo[0] === "off" && lastTwo[1] === "off") {
          this.offCampusStable = true;
          logManager.location.info("[Scheduler] Off-campus stabilized (last two GPS results)");
        }
      }
    } catch (_) {}
  }

  async safeGetGps(timeoutMs, highAccuracy, tag) {
    try {
      const pos = await campusLocationService.getBrowserLocationWithTimeout(
        !!highAccuracy,
        timeoutMs
      );
      logManager.location.success(
        `📍 [Scheduler] GPS success (${tag}) ±${Math.round(pos?.coords?.accuracy || 0)}m`
      );
      return pos;
    } catch (e) {
      logManager.location.warn(`⚠️ [Scheduler] GPS failed (${tag}): ${e?.message || e}`);
      return null;
    }
  }

  pushStatus(s) {
    this.lastGpsStatuses.push(s);
    if (this.lastGpsStatuses.length > 4) this.lastGpsStatuses.shift();
  }

  // ----- Utilities -----
  isSharingEnabled() {
    try {
      return (
        !!currentUser?.user?.uid &&
        currentUser?.profile?.systemInfo?.locationSharingEnabled === true
      );
    } catch (_) {
      return false;
    }
  }

  rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  clearAllTimers() {
    this.clearTier1Loop();
    this.pauseGps();
  }

  // Manual refresh hook (exposed)
  manualRefresh() {
    if (this.currentRoute === "home") {
      this.resetGpsBackoffTo20();
      this.scheduleNextGps(0);
    } else {
      // Other pages: run Tier 1 + one GPS
      this.runTier1Once("manual_refresh");
      this.runSingleGpsUpdate("manual_refresh");
    }
  }
}

export const locationScheduler = new LocationScheduler();

// Dev helpers
if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname.startsWith("127."))) {
  window.locationScheduler = locationScheduler;
}

