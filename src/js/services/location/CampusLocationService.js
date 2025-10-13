/**
 * CampusLocationService.js
 *
 * Service for detecting campus presence using geolocation and polygon-based boundary detection.
 * Implements point-in-polygon algorithm to determine if user is physically on campus.
 *
 * Phase 1.1 - Campus Presence Implementation
 */

// Import campus boundary configurations
import { getCampusConfig } from "./UniversityCampusConfig.js";

// Import data manager statically to avoid mixed dynamic/static import warnings
import { dataManager } from "../data/DataService.js";
import { currentUser } from "../../store/userStore.js";

// Import Tier 1 network detection service (FREE)
import { networkDetectionService } from "./NetworkDetectionService.js";
import { locationTierService } from "./LocationTierService.js";

// Import centralized logging system
import { logManager } from "../../utils/debug/LogManager.js";
import { notificationManager } from "../realtime/NotificationService.js";

/**
 * Service class for campus location detection and presence management
 */
export class CampusLocationService {
  /**
   * 🎯 PHASE 2 ENHANCEMENT: Sets up document visibility and lifecycle tracking
   * for better trigger scenario detection
   */
  setupLifecycleTracking() {
    this.wasDocumentHidden = false;

    // Track document visibility changes for tab return detection
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.wasDocumentHidden = true;
        localStorage.setItem(
          "campusLocation_lastActive",
          Date.now().toString()
        );
      } else if (
        document.visibilityState === "visible" &&
        this.wasDocumentHidden
      ) {
        // Tab returned - trigger immediate location update
        logManager.system.init(
          "Tab return detected - triggering location update"
        );
        this.handleTriggerEvent("tab_return");
      }
    });

    // Track authentication events for login detection
    window.addEventListener("storage", (e) => {
      if (e.key === "campusLocation_authTime") {
        logManager.auth.login("Login event detected via storage");
        this.handleTriggerEvent("login");
      }
    });

    logManager.system.init("Lifecycle tracking initialized");
  }

  /*

  /**
   * Start periodic presence polling using the 3-tier system every intervalMs.
   * Emits campus-presence:loading before each poll so UI can show spinner overlay,
   * and ensures database writes via processFreshLocation.
   */
  async startPresencePolling(intervalMs = 20000) {
    try {
      // Guard: require signed-in user and global sharing enabled
      const uid = currentUser?.uid;
      const enabled =
        currentUser?.profile?.systemInfo?.locationSharingEnabled === true;
      // iOS: allow polling start even when permission isn't currently granted
      // so Tier 1 (network) detection can still work without GPS.
      if (!uid || !enabled) {
        // Stop if previously running
        if (this.presencePollingIntervalId) {
          clearInterval(this.presencePollingIntervalId);
          this.presencePollingIntervalId = null;
        }
        logManager.location.info(
          "[CampusLocationService] Presence polling not started (no user or disabled)"
        );
        return;
      }
      // If already started, adjust interval if needed
      if (this.presencePollingIntervalId) {
        if (intervalMs !== this.presencePollingIntervalMs) {
          clearInterval(this.presencePollingIntervalId);
          this.presencePollingIntervalId = null;
        } else {
          return; // already running
        }
      }

      this.presencePollingIntervalMs = intervalMs;

      // Run once immediately, then on interval
      this._runPresencePollSafely();
      this.presencePollingIntervalId = setInterval(
        () => this._runPresencePollSafely(),
        this.presencePollingIntervalMs
      );
      logManager.location.info(
        `Presence polling started: every ${Math.round(intervalMs / 1000)}s`
      );
    } catch (e) {
      logManager.location.warn(
        `Failed to start presence polling: ${e?.message || e}`
      );
    }
  }

  /**
   * Stop presence polling interval if active
   */
  stopPresencePolling() {
    if (this.presencePollingIntervalId) {
      clearInterval(this.presencePollingIntervalId);
      this.presencePollingIntervalId = null;
      logManager.location.info(
        "[CampusLocationService] Presence polling stopped"
      );
    }
  }

  /**
   * Trigger a presence poll immediately (public wrapper)
   */
  async runPresencePollNow() {
    try {
      await this._runPresencePollSafely();
      logManager.location.info(
        "[CampusLocationService] Presence poll executed immediately"
      );
    } catch (e) {
      logManager.location.warn(
        `[CampusLocationService] Immediate presence poll failed: ${
          e?.message || e
        }`
      );
    }
  }

  async _runPresencePollSafely() {
    if (this._isPresencePollRunning) return;
      this._isPresencePollRunning = true;
    try {
      // Guard: do nothing if user not signed in or sharing disabled
      if (
        !currentUser?.uid ||
        currentUser?.profile?.systemInfo?.locationSharingEnabled !== true
      ) {
        return;
      }
      document.dispatchEvent(
        new CustomEvent("campus-presence:loading", {
          detail: { priority: "presence_poll", timestamp: Date.now() },
        })
      );

      let result = await this.getCurrentLocation(false, "presence_poller");
      // If Tier 1 confirmed ON_CAMPUS, do not trigger browser GPS (battery saver)
      const tier1OnCampus =
        result && result.tier === 1 && result.campusStatus === "on_campus";
      // Only enrich with browser GPS when Tier 1 didn't positively confirm on-campus
      if (
        result &&
        !tier1OnCampus &&
        (!result.coords ||
          result.coords.latitude == null ||
          result.coords.longitude == null)
      ) {
        try {
          // Do not attempt browser GPS enrichment unless permission is granted
          if (this.permissionStatus !== "granted") {
            throw new Error("permission_not_granted");
          }
          const browserPos = await this.getBrowserLocationWithTimeout(
            false,
            10000
          );
          if (browserPos?.coords) {
            const enriched = {
              ...result,
              ...{
                coords: {
                  latitude: browserPos.coords.latitude,
                  longitude: browserPos.coords.longitude,
                  accuracy: browserPos.coords.accuracy,
                  altitude: browserPos.coords.altitude ?? null,
                  altitudeAccuracy: browserPos.coords.altitudeAccuracy ?? null,
                  heading: browserPos.coords.heading ?? null,
                  speed: browserPos.coords.speed ?? null,
                },
                timestamp: browserPos.timestamp || Date.now(),
                source: "browser_enhanced",
                provider: "browser_enhanced",
                tier: 2,
                cost: 0,
                shouldWriteToDatabase: true,
              },
            };
            result = enriched;
          }
        } catch (_) {
          // best-effort enrichment; ignore errors
        }
      }
      if (result) await this.processFreshLocation(result);

      document.dispatchEvent(
        new CustomEvent("campus-presence:ready", {
          detail: {
            freshDataLoaded: true,
            source: "presence_poller",
            timestamp: Date.now(),
          },
        })
      );
    } catch (err) {
      // Non-fatal: emit warning-style error for UI to show soft message
      document.dispatchEvent(
        new CustomEvent("campus-presence:error", {
          detail: {
            error: err?.message || String(err),
            severity: "warning",
            timestamp: Date.now(),
          },
        })
      );
    } finally {
      this._isPresencePollRunning = false;
    }
  }

  /**
   * 🚀 PHASE 2 ENHANCEMENT: Handles different trigger events with immediate response
   */
  async handleTriggerEvent(triggerType) {
    try {
      logManager.system.init(`Handling trigger event: ${triggerType}`);

      // Skip if we're already handling an update to prevent conflicts
      if (this.isUpdatingLocation) {
        logManager.system.warn("Update in progress, skipping trigger event");
        return;
      }

      // Immediate presence update with trigger context
      await this.immediatePresenceUpdate(triggerType);

      // For high-priority scenarios, also get fresh GPS if possible
      if (["login", "tab_return", "reload"].includes(triggerType)) {
        // Guard: only request GPS if sharing is enabled
        try {
          if (
            currentUser?.profile?.systemInfo?.locationSharingEnabled !== true
          ) {
            return;
          }
          if (this.permissionStatus !== "granted") {
            return;
          }
        } catch (_) {
          return;
        }
        logManager.location.tier1(
          `High-priority trigger (${triggerType}) - requesting fresh GPS`
        );
        this.requestSingleLocationUpdate();
      }
    } catch (error) {
      logManager.system.error("Failed to handle trigger event", error);
    }
  }

  /**
   * 📍 PHASE 2 ENHANCEMENT: Requests a single fresh GPS location without debouncing
   */
  async requestSingleLocationUpdate() {
    try {
      // Guard: require enabled global sharing and signed-in user
      if (
        !currentUser?.uid ||
        currentUser?.profile?.systemInfo?.locationSharingEnabled !== true
      ) {
        return;
      }
      // 🎯 CRITICAL FIX: Use optimized 3-tier system for immediate location requests
      // This ensures students on university WiFi get INSTANT presence updates
      const locationResult = await this.getCurrentLocation(
        true, // High accuracy for immediate requests
        "immediate_trigger" // High-priority trigger type
      );

      if (locationResult) {
        logManager.location.success("🚀 IMMEDIATE LOCATION SUCCESS:", {
          tier: locationResult.tier,
          method: locationResult.source,
          campusStatus: locationResult.campusStatus,
          responseTime: locationResult.responseTime + "ms",
          batteryOptimized: locationResult.batteryOptimized || false,
          cost: locationResult.cost || 0,
        });

        // 🔋 BATTERY WIN: Log if network detection provided instant result
        if (locationResult.batteryOptimized) {
          console.log(
            "🔋 INSTANT CAMPUS DETECTION: Network WiFi provided immediate result - no GPS needed!"
          );
        }

        // 🛠️ BUG FIX: Only call processFreshLocation - it handles debouncedLocationUpdate internally
        this.processFreshLocation(locationResult);
      } else {
        if (!this._immediateLocationWarned) {
          this._immediateLocationWarned = true;
          logManager.location.warn(
            "All location tiers failed for immediate update"
          );
        } else if (logManager?.dev) {
          logManager.dev.debug(
            "Immediate location tiers failed (suppressed repeat)"
          );
        }
      }
    } catch (error) {
      console.error("❌ IMMEDIATE LOCATION ERROR:", error);
      logManager.location.warn(
        "3-tier system failed for immediate update",
        error
      );

      // 🚨 FALLBACK: Only use raw GPS if 3-tier system completely fails

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            logManager.location.success(
              "📍 Fallback GPS obtained for trigger event",
              {
                position,
              }
            );
            // 🛠️ BUG FIX: Only call processFreshLocation - it handles everything
            this.processFreshLocation(position);
          },
          (fallbackError) => {
            logManager.location.warn(
              "❌ Fallback GPS also failed for trigger event",
              fallbackError
            );
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0, // Force fresh location
          }
        );
      }
    }
  }

  /**
   * 📍 PHASE 2 ENHANCEMENT: Processes fresh location for trigger events
   */
  async processFreshLocation(position) {
    try {
      logManager.location.info(
        "Processing fresh location for trigger event (immediate database write)",
        { position }
      );

      // 🚀 TRIGGER EVENT: Use smart system with trigger flag for immediate database write
      this.debouncedLocationUpdate(position, { isTrigger: true });

      logManager.location.success(
        "Fresh trigger location queued for immediate processing"
      );
    } catch (error) {
      logManager.location.fail("Failed to process fresh location", error);
    }
  }
  constructor() {
    this.isLocationSupported = "geolocation" in navigator;
    this.currentPosition = null;
    this.permissionStatus = null;
    this._permissionListenerAttached = false;
    this._denialSyncInProgress = false;
    this._lastDenialHandledAt = 0;

    // Location tracking properties
    this.trackingWatchId = null;
    this.periodicUpdateInterval = null;
    this.isTracking = false; // 🔋 Flag to track if location tracking is active

    // Debouncing and optimization properties
    this.lastLocationUpdate = null;
    this.locationUpdateDebounceTimeout = null;
    this.minUpdateInterval = 60000; // Minimum 60 seconds between updates
    this.isUpdatingLocation = false; // Prevent concurrent updates

    // 🚀 PHASE 1 FIX: Coordinate change detection
    this.lastSignificantLocation = null; // Cache for coordinate change detection

    // Initialization and health monitoring properties
    this.initializationAttempts = 0;
    this.maxInitializationAttempts = 5;
    this.initializationRetryTimeout = null;
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
    this.isInitialized = false;
    this.initializationErrors = [];

    // Activity tracking properties
    this.isUserCurrentlyActive = false;
    this.lastActivityDetected = null;
    this.activityHeartbeatInterval = null;
    this.isUpdatingActivity = false; // Prevent concurrent activity updates
    // 🔒 PRESENCE OPTIMIZATION: Throttle lastActive writes & respect global toggle
    this.lastLastActiveWrite = 0; // epoch ms of last successful updateUserLastActive
    this.minLastActiveWriteInterval = 120000; // 2 minutes minimum between writes when idle/active

    // 🚀 ADAPTIVE HEARTBEAT SYSTEM - Smart cost optimization
    this.activeHeartbeatInterval = 15000; // 15s when user is actively clicking/scrolling
    this.idleHeartbeatInterval = 60000; // 60s when user is idle but tab visible
    this.currentHeartbeatInterval = 60000; // Current interval being used
    this.activityState = "idle"; // 'active', 'idle', 'background'
    this.lastStateChange = Date.now(); // Track when state changed for cost monitoring

    // 🔧 MOBILE LIFECYCLE MANAGEMENT PROPERTIES
    this.isMobile = this.detectMobileBrowser();
    this.isAppVisible = !document.hidden;
    this.isOnline = navigator.onLine;
    this.wasTrackingBeforeBackground = false;
    this.backgroundStartTime = null;
    this.foregroundResumeTime = null;
    this.visibilityChangeCount = 0;
    this.networkReconnectionAttempts = 0;
    this.maxNetworkReconnectionAttempts = 3;

    // Mobile-specific intervals and timeouts
    this.backgroundGracePeriod = 30000; // 30 seconds grace period before pausing
    this.foregroundResumeTimeout = null;
    this.backgroundPauseTimeout = null;
    this.networkReconnectionTimeout = null;

    // 🎯 PHASE 2 ENHANCEMENT: Trigger scenario tracking
    this.wasDocumentHidden = false;
    this.isFirstLocationUpdate = true; // Track if this is the first location update
    this.lastUpdateTrigger = null; // Track the trigger for the last update

    // Campus Boundary Detection Debouncing (Enhanced API Call Reduction)
    this.campusBoundaryCache = new Map(); // Cache boundary detection results
    this.boundaryDetectionDebounceTimeout = null;
    this.minBoundaryDetectionInterval = 30000; // Minimum 30s between boundary detections
    this.lastBoundaryDetectionTime = null;
    this.activeBoundaryDetections = new Map(); // Track ongoing boundary detections
    this.boundaryDetectionQueue = [];
    this.isBoundaryDetectionThrottled = false;

    //

    // Presence polling (explicit interval regardless of page)
    this.presencePollingIntervalId = null;
    this.presencePollingIntervalMs = 20000;
    this._isPresencePollRunning = false;

    // 🚦 NAVIGATION DEBOUNCE to avoid rapid duplicate presence updates on quick SPA route switches
    this.lastNavigationPresenceUpdateTime = 0;
    this.minNavigationPresenceInterval = 5000; // ms

    // Two-tier system in use: Tier 1 IPinfo Lite, Tier 2 Browser GPS

    // Caching for cost optimization
    this.locationCache = new Map();
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes cache

    // 🎯 STATUS ARBITRATION: Protect high-confidence GPS on-campus from being
    // downgraded by low-confidence network off-campus when tab is hidden.
    this.lastAuthoritativeCampusStatus = null; // 'on_campus' | 'off_campus' | 'unknown'
    this.lastAuthoritativeSource = null; // 'gps' | 'network' | null
    this.lastAuthoritativeTimestamp = 0; // ms
    this.authoritativeHoldMs = 15 * 60 * 1000; // 15 minutes hold window (align with cache)

    logManager.location.info("Service initialized", {
      geolocationSupported: this.isLocationSupported,
      isMobile: this.isMobile,
      isAppVisible: this.isAppVisible,
      isOnline: this.isOnline,
      timestamp: new Date().toISOString(),
    });

    // Initialize activity detection
    this.initializeActivityDetection();

    // 🔧 MOBILE FIX: Initialize mobile lifecycle management
    if (this.isMobile) {
      this.initializeMobileLifecycleHandlers();
      logManager.location.info("📱 Mobile lifecycle management initialized");
    }

    // 🎯 PHASE 2 ENHANCEMENT: Initialize lifecycle tracking for trigger scenarios
    this.setupLifecycleTracking();

    // Initialize passive permission monitoring so we can auto-sync when revoked/granted
    try {
      if (!this._permissionListenerAttached && navigator?.permissions && typeof navigator.permissions.query === "function") {
        navigator.permissions
          .query({ name: "geolocation" })
          .then((permission) => {
            this.permissionStatus = permission.state;
            this.dispatchPermissionChanged(permission.state);
            if (permission.state === "granted") {
              this.autoEnableAfterPermissionGranted();
            }
            permission.addEventListener("change", () => {
              this.permissionStatus = permission.state;
              this.dispatchPermissionChanged(permission.state);
              if (permission.state !== "granted") {
                this.handlePermissionDenied("permissions_api_change");
              }
              if (permission.state === "granted") {
                this.autoEnableAfterPermissionGranted();
              }
            });
            this._permissionListenerAttached = true;
          })
          .catch(() => {});
      }
    } catch (_) {}
  }

  /**
   * Request geolocation permission from the browser
   * This method actually triggers the browser's permission dialog
   * @returns {Promise<{success: boolean, error?: string, message?: string}>}
   */
  async requestLocationPermission() {
    logManager.location.info("Requesting location permission...");

    if (!this.isLocationSupported) {
      logManager.location.fail("Geolocation not supported by browser");
      return {
        success: false,
        error: "unsupported",
        message: "Geolocation not supported",
      };
    }

    try {
      // Guard: require signed-in user; do not prompt for guests
      if (!currentUser?.uid) {
        logManager.location.warn(
          "[CampusLocationService] Permission request blocked - user not signed in"
        );
        return {
          success: false,
          error: "not_signed_in",
          message: "Sign in required",
        };
      }
      // Check if we're on a secure context (HTTPS or localhost)
      const isSecureContext =
        window.isSecureContext ||
        location.protocol === "https:" ||
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1";

      if (!isSecureContext) {
        logManager.location.warn(
          "⚠️ Geolocation requires a secure context (HTTPS or localhost)."
        );
        // Treat as not allowed to keep gating consistent even in dev
        this.permissionStatus = "denied";
        this.dispatchPermissionChanged("denied");
        return { success: false, error: "insecure_context", message: "Secure context required" };
      }

      // 🔧 MOBILE FIX: Detect mobile browser and adjust behavior accordingly
      const isMobile = this.detectMobileBrowser();
      const isIOSSafari = this.detectIOSSafari();
      const isAndroidChrome = this.detectAndroidChrome();

      logManager.location.info("Mobile browser detection:", {
        isMobile,
        isIOSSafari,
        isAndroidChrome,
        userAgent: navigator.userAgent,
      });

      // IMPORTANT: To trigger the browser permission dialog, we must actually call getCurrentPosition
      // Just checking permissions.query doesn't trigger the dialog
      logManager.location.info(
        "Triggering permission dialog with getCurrentPosition..."
      );

      return new Promise((resolve) => {
        // 🔧 MOBILE FIX: Adaptive timeout based on mobile platform
        let timeoutDuration = 15000; // Default 15 seconds for desktop
        if (isIOSSafari) {
          timeoutDuration = 45000; // iOS Safari needs up to 45 seconds
        } else if (isAndroidChrome) {
          timeoutDuration = 35000; // Android Chrome needs up to 35 seconds
        } else if (isMobile) {
          timeoutDuration = 40000; // Other mobile browsers get 40 seconds
        }

        logManager.location.info(
          `Using ${timeoutDuration}ms timeout for ${
            isMobile ? "mobile" : "desktop"
          } platform`
        );

        const permissionOptions = {
          timeout: timeoutDuration,
          enableHighAccuracy: false, // Don't need high accuracy for permission test
          maximumAge: 600000, // 10 minutes cache acceptable for permission test
        };

        // 🔧 MOBILE FIX: iOS Safari permission handling with user interaction context
        if (isIOSSafari) {
          logManager.location.info("Applying iOS Safari permission handling");
          // iOS Safari requires permission requests to be triggered by user interaction
          // We'll log this for debugging mobile permission issues
          logManager.location.info(
            "iOS detected - permission must be user-initiated"
          );
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            logManager.location.success(
              "✅ Location permission GRANTED by user"
            );
            this.permissionStatus = "granted";
            this.currentPosition = position;

            // Auto-enable when permission is granted
            try { this.dispatchPermissionChanged("granted"); } catch (_) {}
            try { this.autoEnableAfterPermissionGranted(); } catch (_) {}

            // Centralized permission monitoring is already attached during initialization.

            resolve({ success: true });
          },
          (error) => {
            logManager.location.info("Location permission result:", {
              code: error.code,
              message: error.message,
              timestamp: new Date().toISOString(),
              platform: isMobile ? "mobile" : "desktop",
              browser: isIOSSafari
                ? "iOS Safari"
                : isAndroidChrome
                ? "Android Chrome"
                : "Other",
            });

            // 🔧 MOBILE FIX: Enhanced mobile-specific error handling
            switch (error.code) {
              case error.PERMISSION_DENIED:
                logManager.location.fail(
                  "❌ Location permission DENIED by user"
                );
                this.permissionStatus = "denied";
                this.dispatchPermissionChanged("denied");
                this.handlePermissionDenied("user_denied_prompt");

                if (isIOSSafari) {
                  logManager.location.info(
                    "📱 iOS Safari: User must enable location in Settings > Safari > Location Services"
                  );
                } else if (isAndroidChrome) {
                  logManager.location.info(
                    "📱 Android Chrome: Check site permissions in browser settings"
                  );
                }
                resolve({
                  success: false,
                  error: "denied",
                  message: "User denied location",
                });
                return;

              case error.POSITION_UNAVAILABLE:
                logManager.location.warn(
                  "⚠️ Location unavailable (GPS off or no signal)"
                );
                this.permissionStatus = "granted"; // Permission granted but location unavailable

                if (isMobile) {
                  logManager.location.info(
                    "📱 Mobile: Try moving outdoors or enabling high accuracy GPS"
                  );
                }
                // Treat unavailable as permission granted (we only needed permission state)
                resolve({ success: true, message: "position_unavailable" });
                return;

              case error.TIMEOUT:
                logManager.location.warn(
                  `⏱️ Location request timeout after ${timeoutDuration}ms`
                );
                this.permissionStatus = "granted"; // Permission granted but timed out

                if (isMobile) {
                  logManager.location.info(
                    "📱 Mobile timeout: GPS acquisition can take longer indoors"
                  );
                  // On mobile timeout, we still consider permission potentially granted
                  // The user will get another chance during actual location tracking
                  resolve({ success: true, message: "timeout_mobile" });
                  return;
                }
                // Desktop timeout - likely granted; continue to resolve below
                resolve({ success: true, message: "timeout" });
                return;

              default:
                logManager.location.info("❓ Unknown location error");
                this.permissionStatus = "prompt";
                resolve({
                  success: false,
                  error: "unknown",
                  message: "Unknown geolocation error",
                });
                return;
            }

            // Fallback resolution (should rarely reach here)
            resolve({
              success: false,
              error: "unhandled",
              message: "Unhandled geolocation error",
            });
          },
          permissionOptions
        );
      });
    } catch (error) {
      logManager.location.fail("Error requesting location permission:", error);
      this.permissionStatus = "denied";
      this.dispatchPermissionChanged("denied");
      return { success: false, error: "exception", message: error?.message };
    }
  }

  /**
   * Two-tier geolocation system
   * - Tier 1: IPinfo Lite as_domain detection (instant campus on/off)
   * - Tier 2: Browser GPS with retries and accuracy gate
   */
  async getCurrentLocation(
    highAccuracy = false,
    trigger = "unknown",
    userId = null
  ) {
    // Delegated to LocationTierService (two-tier pipeline)
    if (!this.isLocationSupported) {
      logManager.system.error("Geolocation not supported");
      return null;
    }
    // If geolocation permission is not granted, still attempt Tier 1 (network) detection
    // without invoking GPS. This avoids prompting outside a user gesture while still
    // allowing automatic presence to work on iOS reopen. Once permission is granted,
    // the full GPS pipeline runs automatically.
    if (this.permissionStatus !== "granted") {
      try {
        const t1 = await networkDetectionService.detectCampusPresence("iub");
        if (t1?.success) {
          return {
            coords: {
              latitude: null,
              longitude: null,
              accuracy: 50,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
            source: "ipinfo_lite_as_domain",
            provider: "network_detection_service",
            tier: 1,
            cost: 0,
            campusStatus: t1.campusStatus,
            confidence: t1.confidence || (t1.campusStatus === "on_campus" ? "high" : "low"),
            userIP: t1.userIP,
            userOrganization: t1.userOrganization,
            matchReason: t1.matchReason,
            responseTime: t1.responseTime || 0,
            shouldWriteToDatabase: true,
            batteryOptimized: true,
          };
        }
      } catch (e) {
        logManager.location.warn(
          `Network-only detection failed (no permission): ${e?.message || e}`
        );
      }
      // If Tier 1 didn't yield a useful result, do not attempt GPS without permission
      return null;
    }

    this.emitPresenceDataLoading();
    try {
      return await locationTierService.getCurrentLocation(
        highAccuracy,
        trigger,
        userId
      );
    } catch (e) {
      logManager.location.fail("3-tier location request failed", e);
      return null;
    }
    // Legacy inline tier pipeline removed. Method delegates to LocationTierService.
  }

  /**
   * Auto-enable global location sharing and start tracking when permission is granted
   */
  async autoEnableAfterPermissionGranted() {
    try {
      const uid = currentUser?.uid;
      if (!uid) return;
      const already =
        currentUser?.profile?.systemInfo?.locationSharingEnabled === true;
      // Preserve user's toggle choice; do not auto-enable sharing.
      if (!already) {
        // User has sharing disabled; nothing to do.
        return;
      }
      // Start tracking (polling + immediate poll) if user already enabled sharing
      try {
        await this.startLocationTracking();
      } catch (_) {}
    } catch (_) {}
  }

  /**
   * 🎯 TIER 2 HELPER: Enhanced browser GPS with custom timeout for 3-tier system
   * @param {boolean} highAccuracy - Whether to request high accuracy
   * @param {number} timeout - Timeout in milliseconds (12000ms for 3-tier system)
   * @returns {Promise<GeolocationPosition>} Browser GPS result
   */
  async getBrowserLocationWithTimeout(highAccuracy = false, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const options = {
        enableHighAccuracy: highAccuracy,
        timeout: timeout,
        maximumAge: 0, // Force fresh location
      };

      if (typeof logManager !== "undefined") {
        logManager.dev.info("📱 [CampusLocationService] Browser GPS request", {
          highAccuracy,
          timeout: `${timeout / 1000}s`,
          options,
        });
      }

      const successCallback = (position) => {
        if (typeof logManager !== "undefined") {
          logManager.location.success(
            `✅ Browser GPS success: ±${Math.round(position.coords.accuracy)}m`
          );
        }
        resolve(position);
      };

      const errorCallback = (error) => {
        const errorMessages = {
          1: "PERMISSION_DENIED",
          2: "POSITION_UNAVAILABLE",
          3: "TIMEOUT",
        };

        const errorType = errorMessages[error.code] || "UNKNOWN_ERROR";
        if (typeof logManager !== "undefined") {
          logManager.location.warn(
            `❌ Browser GPS error: ${errorType}`,
            error.message
          );
        }

        // Create enhanced error with code for permission handling
        const enhancedError = new Error(`${errorType}: ${error.message}`);
        enhancedError.code = error.code;

        // If permission denied mid-session (e.g., Ask Every Time → Deny), auto-sync OFF
        if (error.code === 1) {
          this.permissionStatus = "denied";
          try { this.dispatchPermissionChanged("denied"); } catch (_) {}
          try { this.handlePermissionDenied("gps_call_denied"); } catch (_) {}
        }
        reject(enhancedError);
      };

      navigator.geolocation.getCurrentPosition(
        successCallback,
        errorCallback,
        options
      );
    });
  }

  /**
   * Detect if user is currently on campus for a specific university
   * @param {string} university - University code (e.g., 'iub', 'du')
   * @returns {Promise<{onCampus: boolean, confidence: number, location?: object}>}
   */
  async detectCampusPresence(university, locationData = null) {
    if (typeof logManager !== "undefined") {
      logManager.dev.info(
        "[CampusLocationService] Detecting campus presence for:",
        { university, hasLocationData: !!locationData }
      );
    }

    // 🎯 NEW LOGIC: Check for recent successful TIER 1 ON_CAMPUS results first
    // This prevents boundary detection from overriding successful network detection
    const recentTier1Result = this.getRecentTier1Result(university);
    if (recentTier1Result && recentTier1Result.campusStatus === "on_campus") {
      if (typeof logManager !== "undefined") {
        logManager.dev.info(
          "💡 [CampusLocationService] Using recent TIER 1 ON_CAMPUS result - bypassing boundary detection",
          {
            university,
            tier1Method: recentTier1Result.method,
            tier1Confidence: recentTier1Result.confidence,
            tier1Age: Date.now() - recentTier1Result.timestamp,
            providedLocationData: !!locationData,
          }
        );
      }

      // Convert TIER 1 result to campus presence format
      return {
        onCampus: true,
        confidence: 0.95, // High confidence for network detection
        source: recentTier1Result.method || "ipinfo_lite_as_domain",
        timestamp: Date.now(),
        university: university,
        bypassedBoundaryDetection: true,
        recursiveCallAvoided: !!locationData, // Track optimization
        tier1Result: {
          method: recentTier1Result.method,
          userIP: recentTier1Result.userIP,
          userOrganization: recentTier1Result.userOrganization,
          matchReason: recentTier1Result.matchReason,
        },
      };
    }

    // Check cache first to avoid unnecessary location calls
    const cacheKey = `${university}_boundary_detection`;
    const cachedResult = this.getCachedBoundaryDetection(
      cacheKey,
      locationData
    );
    if (cachedResult) {
      if (typeof logManager !== "undefined") {
        logManager.dev.info(
          "💾 [CampusLocationService] Returning cached campus presence result",
          { university, fromCache: true, providedLocationData: !!locationData }
        );
      }
      return {
        ...cachedResult,
        recursiveCallAvoided: !!locationData, // Track optimization even for cached results
      };
    }

    // Check if we're currently throttled
    if (this.isBoundaryDetectionThrottled) {
      if (typeof logManager !== "undefined") {
        logManager.location.warn(
          "⏳ Campus boundary detection throttled - returning last known result or queuing"
        );
      }

      // Return cached result or queue for later processing
      const lastResult = this.campusBoundaryCache.get(cacheKey);
      if (lastResult) {
        return {
          ...lastResult,
          fromThrottle: true,
          recursiveCallAvoided: !!locationData,
        };
      }
    }

    // Check for active detection to prevent duplicates
    if (this.activeBoundaryDetections.has(university)) {
      if (typeof logManager !== "undefined") {
        logManager.dev.info(
          "🔄 [CampusLocationService] Boundary detection already in progress, returning existing promise"
        );
      }
      return this.activeBoundaryDetections.get(university);
    }

    // Only proceed with boundary detection if TIER 1 was inconclusive or OFF_CAMPUS
    if (typeof logManager !== "undefined") {
      logManager.dev.info(
        "🎯 [CampusLocationService] No recent TIER 1 ON_CAMPUS result found - proceeding with boundary detection",
        { university, hasLocationData: !!locationData }
      );
    }

    // 🚀 PERFORMANCE FIX: Pass locationData to performBoundaryDetection to avoid recursive calls
    const detectionPromise = this.performBoundaryDetection(
      university,
      cacheKey,
      locationData // ⚡ Pass location data to avoid duplicate getCurrentLocation calls
    );
    this.activeBoundaryDetections.set(university, detectionPromise);

    try {
      const result = await detectionPromise;

      // Add tracking flag to result if not already present
      if (result && !result.hasOwnProperty("recursiveCallAvoided")) {
        result.recursiveCallAvoided = !!locationData;
      }

      return result;
    } finally {
      // Clean up active detection tracking
      this.activeBoundaryDetections.delete(university);
    }
  }

  /**
   * Performs the actual boundary detection logic for campus presence
   * @param {string} university - The university identifier
   * @param {string} cacheKey - Cache key for storing results
   * @returns {Promise<Object>} Campus presence detection result
   */
  async performBoundaryDetection(university, cacheKey, locationData = null) {
    try {
      if (typeof logManager !== "undefined") {
        logManager.dev.info(
          "🎯 [CampusLocationService] Starting boundary detection",
          { university, cacheKey, hasLocationData: !!locationData }
        );
      }

      // 🚀 PERFORMANCE FIX: Use provided locationData to avoid recursive getCurrentLocation calls
      let position;
      if (locationData) {
        position = locationData;
        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            "⚡ [CampusLocationService] Using provided locationData - avoiding recursive getCurrentLocation call",
            {
              source: locationData.source,
              tier: locationData.tier,
              campusStatus: locationData.campusStatus,
            }
          );
        }
      } else {
        // Fallback to getting fresh location if no data provided
        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            "🔄 [CampusLocationService] No locationData provided - calling getCurrentLocation as fallback"
          );
        }
        position = await this.getCurrentLocation(
          true,
          "campus-boundary-detection"
        );
      }

      if (!position || !position.coords) {
        const error = "Failed to get location for boundary detection";
        if (typeof logManager !== "undefined") {
          logManager.location.fail(
            "❌ [CampusLocationService] Boundary detection failed - no position",
            { university, error }
          );
        }
        return {
          onCampus: false,
          confidence: 0,
          error: error,
          source: "boundary-detection-error",
          timestamp: Date.now(),
        };
      }

      // 🎯 CRITICAL FIX: Handle TIER 1 network detection results
      // If TIER 1 detected ON_CAMPUS via network, trust that result even with null coordinates
      if (
        (position.source === "ipinfo_lite_as_domain" ||
          position.source === "ip_organization_detection") &&
        position.campusStatus === "on_campus"
      ) {
        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            "🏢 [CampusLocationService] TIER 1 network detection confirmed ON_CAMPUS - trusting network result",
            {
              university,
              userOrganization: position.userOrganization,
              userIP: position.userIP,
              method: position.method,
              confidence: position.confidence,
              recursiveCallAvoided: !!locationData,
            }
          );
        }

        const networkBasedResult = {
          onCampus: true,
          confidence: 0.95, // High confidence for network detection
          source: position.source,
          timestamp: Date.now(),
          university: university,
          networkDetection: {
            userIP: position.userIP,
            userOrganization: position.userOrganization,
            method: position.method,
            responseTime: position.responseTime,
          },
          skippedPolygonCheck: true, // Flag to indicate we bypassed GPS polygon check
          recursiveCallAvoided: !!locationData, // Flag to track performance optimization
        };

        // Cache the network-based result
        this.campusBoundaryCache.set(cacheKey, {
          ...networkBasedResult,
          cachedAt: Date.now(),
        });

        return networkBasedResult;
      }

      // 🎯 VALIDATION: Only proceed with polygon checks if we have valid coordinates
      if (!position.coords.latitude || !position.coords.longitude) {
        if (typeof logManager !== "undefined") {
          logManager.dev.warn(
            "⚠️ [CampusLocationService] No valid coordinates for polygon check - returning OFF_CAMPUS",
            {
              university,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              source: position.source,
              recursiveCallAvoided: !!locationData,
            }
          );
        }

        return {
          onCampus: false,
          confidence: 0,
          error: "No valid coordinates for polygon check",
          source: position.source || "invalid-coordinates",
          timestamp: Date.now(),
          university: university,
          recursiveCallAvoided: !!locationData,
        };
      }

      // Check if location is on campus using polygon detection
      const campusResult = this.isLocationOnCampus(position, university);

      // Cache the result for future use
      const result = {
        ...campusResult,
        position: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
        source: position.source || "boundary-detection",
        timestamp: Date.now(),
        university: university,
        recursiveCallAvoided: !!locationData, // Track performance optimization
      };

      // Cache with 1-minute TTL as defined in getCachedBoundaryDetection
      this.campusBoundaryCache.set(cacheKey, {
        ...result,
        cachedAt: Date.now(),
      });

      if (typeof logManager !== "undefined") {
        logManager.dev.info(
          "✅ [CampusLocationService] Boundary detection completed",
          {
            university,
            onCampus: result.onCampus,
            confidence: result.confidence,
            source: result.source,
            accuracy: position.coords.accuracy,
            recursiveCallAvoided: !!locationData,
          }
        );
      }

      // Apply throttling after successful detection
      this.isBoundaryDetectionThrottled = true;
      setTimeout(() => {
        this.isBoundaryDetectionThrottled = false;
      }, 5000); // 5-second throttle

      return result;
    } catch (error) {
      if (typeof logManager !== "undefined") {
        logManager.location.fail(
          "❌ [CampusLocationService] Boundary detection error",
          {
            university,
            error: error.message,
            stack: error.stack,
            recursiveCallAvoided: !!locationData,
          }
        );
      }

      const errorResult = {
        onCampus: false,
        confidence: 0,
        error: error.message,
        source: "boundary-detection-error",
        timestamp: Date.now(),
        university: university,
        recursiveCallAvoided: !!locationData,
      };

      // Cache error result briefly to prevent immediate retries
      this.campusBoundaryCache.set(cacheKey, {
        ...errorResult,
        cachedAt: Date.now(),
      });

      return errorResult;
    }
  }

  /**
   * Check if a given location is within campus boundaries
   * @param {GeolocationPosition} position - User's current position
   * @param {string} university - University code
   * @returns {{onCampus: boolean, confidence: number, distanceFromCenter?: number}}
   */
  isLocationOnCampus(position, university) {
    if (typeof logManager !== "undefined") {
      logManager.dev.debug(
        "[CampusLocationService] Checking if location is on campus",
        {
          university,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
      );
    }

    // Get campus configuration for the university
    const campusConfig = getCampusConfig(university);
    if (!campusConfig) {
      console.error(
        "[CampusLocationService] No campus configuration found for:",
        university
      );
      return {
        onCampus: false,
        confidence: 0,
        error: "Campus configuration not found",
      };
    }

    const userPoint = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };

    // Check against campus boundary polygon
    const isInside = this.pointInPolygon(userPoint, campusConfig.boundary);

    // Calculate distance from campus center for confidence scoring
    const distanceFromCenter = this.calculateDistance(
      userPoint,
      campusConfig.center
    );

    // Calculate confidence based on accuracy and distance from center
    let confidence = 0;
    if (isInside) {
      // High confidence if inside boundary and good GPS accuracy
      const accuracyFactor = Math.max(0, 1 - position.coords.accuracy / 100);
      const distanceFactor = Math.max(
        0,
        1 - distanceFromCenter / campusConfig.radius
      );
      confidence = Math.min(1, accuracyFactor * 0.6 + distanceFactor * 0.4);
    }

    if (typeof logManager !== "undefined") {
      logManager.dev.debug(
        "[CampusLocationService] Campus boundary check result",
        {
          university,
          isInside,
          confidence: Math.round(confidence * 100),
          distanceFromCenter: Math.round(distanceFromCenter),
          gpsAccuracy: position.coords.accuracy,
          campusRadius: campusConfig.radius,
        }
      );
    }

    return {
      onCampus: isInside,
      confidence: Math.round(confidence * 100) / 100, // Round to 2 decimal places
      distanceFromCenter: Math.round(distanceFromCenter),
    };
  }

  /**
   * Point-in-polygon algorithm implementation (Ray Casting)
   * @param {object} point - Point to test {lat, lng}
   * @param {Array} polygon - Array of points defining the polygon boundary
   * @returns {boolean} True if point is inside polygon
   */
  pointInPolygon(point, polygon) {
    if (typeof logManager !== "undefined") {
      logManager.dev.debug(
        "[CampusLocationService] Running point-in-polygon check",
        {
          point,
          polygonVertices: polygon.length,
        }
      );
    }

    if (!polygon || polygon.length < 3) {
      if (typeof logManager !== "undefined") {
        logManager.location.fail("Invalid polygon - need at least 3 vertices");
      }
      return false;
    }

    let isInside = false;
    const x = point.lng;
    const y = point.lat;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      // Ray casting algorithm
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        isInside = !isInside;
      }
    }

    if (typeof logManager !== "undefined") {
      logManager.dev.debug("[CampusLocationService] Point-in-polygon result", {
        point,
        isInside,
        algorithm: "ray-casting",
      });
    }

    return isInside;
  }

  /**
   * Calculate distance between two geographic points using Haversine formula
   * @param {object} point1 - First point {lat, lng}
   * @param {object} point2 - Second point {lat, lng}
   * @returns {number} Distance in meters
   */
  calculateDistance(point1, point2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (point1.lat * Math.PI) / 180;
    const φ2 = (point2.lat * Math.PI) / 180;
    const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
    const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;

    if (typeof logManager !== "undefined") {
      logManager.dev.debug("[CampusLocationService] Distance calculated", {
        from: point1,
        to: point2,
        distance: Math.round(distance),
        unit: "meters",
      });
    }

    return distance;
  }

  _updateLocalPresenceCache(campusStatus, locationInfo = {}) {
    try {
      if (!campusStatus || campusStatus === "unknown") {
        return;
      }

      const profile = currentUser?.profile;
      if (!profile) {
        return;
      }

      const systemInfo = profile.systemInfo || {};
      if (systemInfo.locationSharingEnabled === false) {
        return;
      }

      const toMillis = (value) => {
        if (!value) return Date.now();
        if (typeof value === "number") return value;
        if (value instanceof Date) return value.getTime();
        if (typeof value.toDate === "function") {
          return value.toDate().getTime();
        }
        if (typeof value.seconds === "number") {
          const millis = value.seconds * 1000;
          const nanos = value.nanoseconds || value.nanoseconds === 0
            ? value.nanoseconds / 1e6
            : 0;
          return millis + nanos;
        }
        return Date.now();
      };

      const timestampMs = toMillis(locationInfo.timestamp || Date.now());

      const existingLocation = systemInfo.lastKnownLocation || {};

      const updatedLocation = {
        ...existingLocation,
        campusStatus,
        timestamp: timestampMs,
      };

      if (Object.prototype.hasOwnProperty.call(locationInfo, "latitude")) {
        updatedLocation.latitude = locationInfo.latitude;
      }

      if (Object.prototype.hasOwnProperty.call(locationInfo, "longitude")) {
        updatedLocation.longitude = locationInfo.longitude;
      }

      if (Object.prototype.hasOwnProperty.call(locationInfo, "accuracy")) {
        updatedLocation.accuracy = locationInfo.accuracy;
      }

      if (Object.prototype.hasOwnProperty.call(locationInfo, "source")) {
        updatedLocation.source = locationInfo.source;
      }

      if (Object.prototype.hasOwnProperty.call(locationInfo, "tier")) {
        updatedLocation.tier = locationInfo.tier;
      }

      const previousStatus = existingLocation.campusStatus;
      const previousLat = existingLocation.latitude;
      const previousLon = existingLocation.longitude;

      const locationChanged =
        previousStatus !== campusStatus ||
        (Object.prototype.hasOwnProperty.call(locationInfo, "latitude") &&
          previousLat !== locationInfo.latitude) ||
        (Object.prototype.hasOwnProperty.call(locationInfo, "longitude") &&
          previousLon !== locationInfo.longitude);

      if (!locationChanged) {
        return;
      }

      const updatedSystemInfo = {
        ...systemInfo,
        lastKnownLocation: updatedLocation,
        lastActive: timestampMs,
        status: "online",
      };

      const updatedProfile = {
        ...profile,
        systemInfo: updatedSystemInfo,
      };

      currentUser.setProfile(updatedProfile);
    } catch (error) {
      console.warn(
        "[CampusLocationService] Failed to update local presence cache:",
        error
      );
    }
  }

  /**
   * Get current permission status
   * @returns {string|null} Permission status: 'granted', 'denied', 'prompt', or null
   */
  getPermissionStatus() {
    return this.permissionStatus;
  }

  /**
   * Check if geolocation is supported by the browser
   * @returns {boolean} True if supported
   */
  isGeolocationSupported() {
    return this.isLocationSupported;
  }

  // 🔧 MOBILE BROWSER DETECTION METHODS
  detectMobileBrowser() {
    const userAgent = navigator.userAgent || window.opera;

    // Check for mobile device indicators
    const mobileRegex =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const isMobileUA = mobileRegex.test(userAgent);

    // Check for touch capability
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Check screen size as additional indicator
    const isSmallScreen =
      window.screen.width <= 768 || window.screen.height <= 768;

    const isMobile = isMobileUA || (hasTouch && isSmallScreen);

    if (typeof logManager !== "undefined") {
      logManager.dev.debug("[CampusLocationService] Mobile detection", {
        isMobileUA,
        hasTouch,
        isSmallScreen,
        result: isMobile,
      });
    }

    return isMobile;
  }

  detectIOSSafari() {
    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isSafari =
      /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS/.test(userAgent);

    // Additional check for iOS WebView
    const isIOSWebView =
      isIOS && !isSafari && !/Chrome|CriOS|FxiOS/.test(userAgent);

    const result = isIOS && (isSafari || isIOSWebView);

    if (typeof logManager !== "undefined") {
      logManager.dev.debug("[CampusLocationService] iOS Safari detection", {
        isIOS,
        isSafari,
        isIOSWebView,
        result,
      });
    }

    return result;
  }

  detectAndroidChrome() {
    const userAgent = navigator.userAgent;
    const isAndroid = /Android/.test(userAgent);
    const isChrome = /Chrome/.test(userAgent) && !/Edge|OPR/.test(userAgent);

    // Check for Android Chrome specifically
    const isChromeAndroid = isAndroid && isChrome;

    if (typeof logManager !== "undefined") {
      logManager.dev.debug("[CampusLocationService] Android Chrome detection", {
        isAndroid,
        isChrome,
        result: isChromeAndroid,
      });
    }

    return isChromeAndroid;
  }

  handleVisibilityChange() {
    const wasVisible = this.isAppVisible;
    this.isAppVisible = !document.hidden;
    this.visibilityChangeCount++;

    if (typeof logManager !== "undefined") {
      logManager.dev.info("📱 Visibility changed", {
        from: wasVisible ? "visible" : "hidden",
        to: this.isAppVisible ? "visible" : "hidden",
        count: this.visibilityChangeCount,
      });
    }

    if (!this.isAppVisible && wasVisible) {
      // App going to background
      this.handleAppGoingToBackground();
    } else if (this.isAppVisible && !wasVisible) {
      // App returning to foreground
      this.handleAppReturningToForeground();
    }
  }

  handleAppGoingToBackground() {
    if (typeof logManager !== "undefined") {
      logManager.dev.info("📱 App going to background - smart pause strategy");
    }

    this.backgroundStartTime = Date.now();
    this.wasTrackingBeforeBackground = this.isTrackingActive();

    // Clear any existing background pause timeout
    if (this.backgroundPauseTimeout) {
      clearTimeout(this.backgroundPauseTimeout);
    }

    // Don't immediately pause - give a grace period for quick app switches
    this.backgroundPauseTimeout = setTimeout(() => {
      if (!this.isAppVisible) {
        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            "📱 Grace period expired - pausing location tracking for battery conservation"
          );
        }

        // Pause location tracking but maintain minimal presence updates
        if (this.wasTrackingBeforeBackground) {
          this.pauseLocationTrackingForBackground();
        }
      }
    }, this.backgroundGracePeriod);
  }

  handleAppReturningToForeground() {
    if (typeof logManager !== "undefined") {
      logManager.dev.info(
        "📱 App returning to foreground - smart resume strategy"
      );
    }

    this.foregroundResumeTime = Date.now();

    // Clear background pause timeout since we're back in foreground
    if (this.backgroundPauseTimeout) {
      clearTimeout(this.backgroundPauseTimeout);
      this.backgroundPauseTimeout = null;
    }

    // Calculate how long we were in background
    const backgroundDuration = this.backgroundStartTime
      ? this.foregroundResumeTime - this.backgroundStartTime
      : 0;

    if (typeof logManager !== "undefined") {
      logManager.dev.info("📱 Background duration", {
        seconds: Math.round(backgroundDuration / 1000),
      });
    }

    // Clear any existing resume timeout
    if (this.foregroundResumeTimeout) {
      clearTimeout(this.foregroundResumeTimeout);
    }

    // Delay resume slightly to let the app stabilize
    this.foregroundResumeTimeout = setTimeout(() => {
      this.resumeLocationTrackingFromBackground();
    }, 1000); // 1 second delay for app stabilization
  }

  pauseLocationTrackingForBackground() {
    logManager.location.info(
      "📱 Pausing location tracking for background mode"
    );
    // Polling-only approach: stop presence polling while in background to save battery
    if (typeof this.stopPresencePolling === "function") {
      this.stopPresencePolling();
    }
  }

  async resumeLocationTrackingFromBackground() {
    logManager.location.info("📱 Resuming location tracking from background");

    try {
      // If we were tracking before background, resume tracking
      if (this.wasTrackingBeforeBackground) {
        logManager.location.info(
          "📱 Restarting location tracking after background period"
        );

        // Force a fresh location reading first
        const currentLocation = await this.getCurrentLocation(
          false,
          "tab_return"
        );

        if (currentLocation) {
          logManager.location.info("📱 Fresh location acquired after resume");

          // Update location immediately
          this.debouncedLocationUpdate(currentLocation, { isTrigger: true }); // App resume = trigger event
        } else {
          logManager.location.warn(
            "📱 Failed to get fresh location after resume"
          );
        }

        // Restart polling and activity heartbeat (startPresencePolling runs one poll immediately)
        await this.startPresencePolling(20000);
        this.startActivityHeartbeat();
        setTimeout(() => this.performHealthCheck(), 5000);
      }

      // Reset background state
      this.wasTrackingBeforeBackground = false;
      this.backgroundStartTime = null;
      this.foregroundResumeTime = null;

      logManager.location.info("📱 Successfully resumed from background mode");
    } catch (error) {
      logManager.location.fail("📱 Error resuming from background:", error);

      // Try to recover by reinitializing
      setTimeout(() => this.autoStartLocationTracking(), 3000);
    }
  }

  handleNetworkReconnection() {
    const wasOnline = this.isOnline;
    this.isOnline = true;

    logManager.location.info(
      `📱 Network reconnected: ${
        wasOnline ? "was online" : "was offline"
      } → online`
    );

    if (!wasOnline) {
      // Clear any existing reconnection timeout
      if (this.networkReconnectionTimeout) {
        clearTimeout(this.networkReconnectionTimeout);
      }

      // Delay reconnection handling to ensure network is stable
      this.networkReconnectionTimeout = setTimeout(() => {
        this.handleNetworkReconnectionRecovery();
      }, 2000);
    }
  }

  handleNetworkDisconnection() {
    this.isOnline = false;

    logManager.location.info(
      "📱 Network disconnected - maintaining location tracking but reducing frequency"
    );

    // Don't stop location tracking completely, but reduce frequency
    // The location system can still work offline for presence detection
  }

  async handleNetworkReconnectionRecovery() {
    logManager.location.info("📱 Recovering from network disconnection");

    this.networkReconnectionAttempts++;

    try {
      // Force a location update to sync with server after reconnection
      if (this.currentPosition) {
        logManager.location.info("📱 Syncing location after network recovery");
        this.debouncedLocationUpdate(this.currentPosition, { isTrigger: true }); // Network reconnection = trigger event
      }

      // Restart health monitoring
      this.startHealthMonitoring();

      // Reset network reconnection attempts
      this.networkReconnectionAttempts = 0;

      logManager.location.info("📱 Network recovery completed successfully");
    } catch (error) {
      logManager.location.fail("📱 Network recovery failed:", error);

      if (
        this.networkReconnectionAttempts < this.maxNetworkReconnectionAttempts
      ) {
        logManager.location.info(
          `📱 Retrying network recovery (${this.networkReconnectionAttempts}/${this.maxNetworkReconnectionAttempts})`
        );

        setTimeout(() => {
          this.handleNetworkReconnectionRecovery();
        }, 5000 * this.networkReconnectionAttempts); // Progressive backoff
      } else {
        logManager.location.fail("📱 Max network recovery attempts reached");
        this.networkReconnectionAttempts = 0; // Reset for next time
      }
    }
  }

  handleAppFocus() {
    logManager.location.info("📱 App gained focus");

    // Additional check if visibility API missed the event
    if (!this.isAppVisible) {
      this.isAppVisible = true;
      this.handleAppReturningToForeground();
    }
  }

  handleAppBlur() {
    logManager.location.info("📱 App lost focus");

    // Additional check if visibility API missed the event
    if (this.isAppVisible) {
      this.isAppVisible = false;
      this.handleAppGoingToBackground();
    }
  }

  handleAppUnload() {
    logManager.location.info("📱 App unloading - cleaning up resources");

    // Clear all timeouts and intervals
    if (this.backgroundPauseTimeout) clearTimeout(this.backgroundPauseTimeout);
    if (this.foregroundResumeTimeout)
      clearTimeout(this.foregroundResumeTimeout);
    if (this.networkReconnectionTimeout)
      clearTimeout(this.networkReconnectionTimeout);

    // Stop location tracking
    this.stopLocationTracking();
  }

  handlePageShow(event) {
    logManager.location.info(
      `📱 Page show event (persisted: ${event.persisted})`
    );

    // If page was loaded from cache (back/forward navigation), ensure proper state
    if (event.persisted && this.isMobile) {
      setTimeout(() => {
        this.handleAppReturningToForeground();
      }, 500);
    }
  }

  handlePageHide(event) {
    logManager.location.info(
      `📱 Page hide event (persisted: ${event.persisted})`
    );

    // Handle page going into back/forward cache
    if (this.isMobile) {
      this.handleAppGoingToBackground();
    }
  }

  // 🎯 SPA NAVIGATION HANDLER: Handle single-page app navigation events
  async handleSPANavigation(event) {
    const { route } = event.detail;
    logManager.location.info(`🎯 SPA navigation detected: ${route}`);

    try {
      // Import required services

      // Only trigger location updates for authenticated users
      if (!currentUser?.uid) {
        logManager.location.info(
          "⏳ No user logged in - skipping navigation location update"
        );
        return;
      }

      // 🚀 SMART NAVIGATION TRIGGERS: Update location for key pages that benefit from fresh data
      const locationRelevantPages = ["home", "friends"];

      if (locationRelevantPages.includes(route)) {
        const now = Date.now();
        if (
          now - this.lastNavigationPresenceUpdateTime <
          this.minNavigationPresenceInterval
        ) {
          logManager.location.info(
            "⏱️ Skipping navigation presence update (debounced)"
          );
          return;
        }
        logManager.location.info(
          `🎯 Navigation to ${route} - triggering immediate location update`
        );

        // Mark this as user activity (navigation is active user behavior)
        this.isUserCurrentlyActive = true;
        this.lastActivityDetected = Date.now();

        // Trigger immediate presence update with navigation context
        const success = await this.immediatePresenceUpdate("spa_navigation");
        if (success) this.lastNavigationPresenceUpdateTime = now;

        if (success) {
          logManager.location.success(
            `✅ Navigation-triggered location update completed for ${route}`
          );
        } else {
          logManager.location.warn(
            `⚠️ Navigation-triggered location update failed for ${route}`
          );
        }
      } else {
        logManager.location.info(
          `ℹ️ Navigation to ${route} - no location update needed`
        );
      }
    } catch (error) {
      logManager.location.fail("❌ SPA navigation handler error:", error);
    }
  }

  // Helper method to get current mobile lifecycle status
  getMobileLifecycleStatus() {
    return {
      isMobile: this.isMobile,
      isAppVisible: this.isAppVisible,
      isOnline: this.isOnline,
      visibilityChangeCount: this.visibilityChangeCount,
      backgroundStartTime: this.backgroundStartTime,
      wasTrackingBeforeBackground: this.wasTrackingBeforeBackground,
      networkReconnectionAttempts: this.networkReconnectionAttempts,
    };
  }

  // =========================
  // IMMEDIATE PRESENCE UPDATE SYSTEM
  // =========================

  /**
   * Phase 1: Immediate presence update (0-1 seconds)
   * Updates user activity timestamp immediately when they open/reload/login
   * Uses cached location if available for instant social feedback
   * @param {string} scenario - 'login', 'reload', 'tab-return', or 'general'
   */
  async immediatePresenceUpdate(scenario = "general") {
    try {
      console.log(
        `[CampusLocationService] 🚀 Phase 1: Immediate presence update (${scenario})`
      );

      // Import required services (statically imported at top where possible)
      // currentUser statically imported
      // dataManager is statically imported elsewhere to avoid duplicate dynamic/static imports
      const { serverTimestamp } = await import("firebase/firestore");

      if (!currentUser?.uid) {
        console.warn(
          "[CampusLocationService] No current user for immediate presence update"
        );
        return false;
      }

      // 🎯 PHASE 2 ENHANCEMENT: Track authentication time for login detection
      if (scenario === "login" || scenario === "initialization") {
        localStorage.setItem("campusLocation_authTime", Date.now().toString());
        console.log(
          "[CampusLocationService] 🔐 Authentication time tracked for login detection"
        );
      }

      // 🔧 FIX: For reload scenarios, fetch fresh coordinates immediately using 3-tier system
      if (
        scenario === "reload" &&
        currentUser?.profile?.systemInfo?.locationSharingEnabled === true
      ) {
        console.log(
          "[CampusLocationService] 🚀 Reload detected - fetching fresh coordinates with 3-tier system..."
        );

        try {
          // Use 3-tier system for reload scenarios
          this.lastUpdateTrigger = "reload"; // Store trigger for accuracy context
          const freshLocation = await this.getCurrentLocation(
            true,
            "reload",
            currentUser.uid
          );

          if (
            freshLocation &&
            freshLocation.coords &&
            freshLocation.shouldWriteToDatabase
          ) {
            // Only proceed if 3-tier system says it's safe to write
            console.log(
              "[CampusLocationService] ✅ 3-tier system provided valid location data - proceeding with campus detection..."
            );

            // 🚀 PERFORMANCE FIX: Pass freshLocation to avoid recursive getCurrentLocation calls
            const campusResult = await this.detectCampusPresence(
              currentUser.university || "iub",
              freshLocation // ⚡ Pass location data to avoid duplicate 3-tier system execution
            );

            if (campusResult && campusResult.onCampus !== undefined) {
              const campusStatus = campusResult.onCampus
                ? "on_campus"
                : "off_campus";
              const coordinates = {
                latitude: freshLocation.coords.latitude,
                longitude: freshLocation.coords.longitude,
                accuracy: freshLocation.coords.accuracy,
                timestamp: freshLocation.timestamp || Date.now(),
              };

              // Update database with fresh coordinates and campus status
              await dataManager.updateUserLocationStatus(
                currentUser.uid,
                campusStatus,
                coordinates
              );

              console.log(
                "[CampusLocationService] ✅ Reload: Fresh location and campus status updated immediately:",
                {
                  campusStatus,
                  accuracy: Math.round(freshLocation.coords.accuracy) + "m",
                  coordinates: `${coordinates.latitude.toFixed(
                    6
                  )}, ${coordinates.longitude.toFixed(6)}`,
                  tier: freshLocation.tier,
                  cost: freshLocation.cost || 0,
                  recursiveCallAvoided: true, // Track performance optimization
                }
              );

              return true;
            }
          } else if (freshLocation && !freshLocation.shouldWriteToDatabase) {
            console.log(
              "[CampusLocationService] ⚠️ 3-tier system blocked database write:",
              {
                reason: "Poor accuracy or invalid coordinates",
                campusStatus: freshLocation.campusStatus || "unknown",
                accuracy: freshLocation.coords?.accuracy,
                tier: freshLocation.tier,
              }
            );

            // Still return success for UI purposes, but don't write to database
            return true;
          }
        } catch (error) {
          console.warn(
            "[CampusLocationService] ⚠️ Fresh location fetch failed for reload, falling back to cached data:",
            error.message
          );
        }
      }

      // 🔧 FALLBACK: Use cached location if available and has coordinates
      const cachedLocation = this.getCachedLocation();
      if (
        cachedLocation &&
        cachedLocation.campusStatus &&
        cachedLocation.coordinates
      ) {
        // Use updateUserLocationStatus for proper systemInfo field handling
        await dataManager.updateUserLocationStatus(
          currentUser.uid,
          cachedLocation.campusStatus,
          cachedLocation.coordinates
        );
        console.log(
          "[CampusLocationService] 💾 Using cached location with coordinates for immediate update:",
          {
            campusStatus: cachedLocation.campusStatus,
            age:
              Math.round((Date.now() - cachedLocation.timestamp) / 1000) + "s",
            scenario,
          }
        );
      } else {
        // Fallback: Direct systemInfo update with proper field handling
        const { doc, updateDoc } = await import("firebase/firestore");
        const { db } = await import("../../lib/firebase/firebase-config.js");

        await dataManager.ensureSystemInfoExists(currentUser.uid);

        await updateDoc(doc(db, "users", currentUser.uid), {
          "systemInfo.lastActive": serverTimestamp(),
          "systemInfo.status": "online",
          "systemInfo.lastUpdated": serverTimestamp(),
        });
        console.log(
          "[CampusLocationService] ⚡ Direct systemInfo update completed (no cached location)"
        );
      }

      console.log(
        `[CampusLocationService] ✅ Phase 1 complete: Immediate presence updated (${scenario})`
      );

      // Trigger animation based on scenario and data availability
      let animationType = "immediate_presence";
      if (cachedLocation) {
        animationType =
          scenario === "login" ? "login_cached" : "cached_location";
      }

      // Create proper location data for animation
      const immediateAnimationData = {
        coordinatesChanged: false, // This is an immediate presence update, not a coordinate change
        campusStatusChanged: false, // Status detection happens in other methods
        hasValidCoordinates:
          cachedLocation &&
          cachedLocation.latitude != null &&
          cachedLocation.longitude != null,
        hasLastActiveUpdate: true, // We're always updating lastActive in immediate presence
        previousStatus: "unknown",
        newStatus: cachedLocation ? cachedLocation.campusStatus : "unknown",
        recursiveCallAvoided: true, // Track performance optimization
        // 🔧 FIX: Include actual coordinate data for UI animations
        coordinates:
          cachedLocation &&
          cachedLocation.latitude != null &&
          cachedLocation.longitude != null
            ? {
                latitude: cachedLocation.latitude,
                longitude: cachedLocation.longitude,
                accuracy: cachedLocation.accuracy,
              }
            : null,
      };

      this.triggerLocationAnimation(animationType, immediateAnimationData);
      console.log(
        `[CampusLocationService] 🟣 Animation triggered: ${animationType}`
      );

      return true;
    } catch (error) {
      console.error(
        "[CampusLocationService] ❌ Immediate presence update failed:",
        error
      );
      return false;
    }
  }

  /**
   * Get cached location from localStorage
   * @returns {Object|null} Cached location data or null if not available/expired
   */
  getCachedLocation() {
    try {
      const cached = localStorage.getItem("meetchuthere_last_location");
      if (!cached) return null;

      const locationData = JSON.parse(cached);

      // Check if cache is expired (24 hours)
      const cacheAge = Date.now() - locationData.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (cacheAge > maxAge) {
        console.log(
          "[CampusLocationService] 🗑️ Cached location expired, removing"
        );
        localStorage.removeItem("meetchuthere_last_location");
        return null;
      }

      logManager.location.info("📦 Found cached location:", {
        campusStatus: locationData.campusStatus,
        ageMinutes: Math.round(cacheAge / 60000),
        accuracy: locationData.accuracy,
      });

      return locationData;
    } catch (error) {
      console.warn(
        "[CampusLocationService] Failed to get cached location:",
        error
      );
      return null;
    }
  }

  /**
   * Get cached boundary detection result
   * @param {string} cacheKey - Cache key for the boundary detection
   * @returns {Object|null} Cached boundary detection result or null if expired/not found
   */
  getCachedBoundaryDetection(cacheKey, locationData = null) {
    try {
      if (!this.campusBoundaryCache.has(cacheKey)) {
        return null;
      }

      const cached = this.campusBoundaryCache.get(cacheKey);

      // If we have fresh coordinates, bypass cache when user moved significantly
      if (locationData?.coords && cached?.position) {
        const movedMeters = this.calculateDistanceMeters(
          cached.position.lat,
          cached.position.lng,
          locationData.coords.latitude,
          locationData.coords.longitude
        );
        // Treat >100m movement as significant; forces fresh boundary check
        if (movedMeters > 100) {
          logManager.location.info(
            `🚶 [CampusLocationService] Significant movement detected (${Math.round(
              movedMeters
            )}m) - bypassing boundary cache for ${cacheKey}`
          );
          this.campusBoundaryCache.delete(cacheKey);
          return null;
        }
      }

      // Check if cache is expired (30s TTL for boundary detection)
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 30 * 1000; // 30 seconds TTL

      if (cacheAge > maxAge) {
        logManager.location.info(
          `🗑️ [CampusLocationService] Boundary detection cache expired for ${cacheKey}`,
          { ageSeconds: Math.round(cacheAge / 1000) }
        );
        this.campusBoundaryCache.delete(cacheKey);
        return null;
      }

      logManager.location.info(
        `💾 [CampusLocationService] Found cached boundary detection for ${cacheKey}`,
        {
          ageSeconds: Math.round(cacheAge / 1000),
          onCampus: cached.onCampus,
          confidence: cached.confidence,
        }
      );

      return cached;
    } catch (error) {
      logManager.location.fail(
        "[CampusLocationService] Failed to get cached boundary detection:",
        error
      );
      return null;
    }
  }

  /**
   * Calculate distance between two lat/lng in meters (Haversine)
   */
  calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 🎯 NEW METHOD: Get recent TIER 1 network detection result
   * Prevents boundary detection from overriding successful organization detection
   * @param {string} university - University code (e.g., "iub")
   * @returns {Object|null} Recent TIER 1 result or null if not found/expired
   */
  getRecentTier1Result(university) {
    try {
      // Check if we have a TIER 1 cache for this university
      if (!this.tier1ResultCache) {
        this.tier1ResultCache = new Map();
      }

      const cacheKey = `tier1_${university}`;
      if (!this.tier1ResultCache.has(cacheKey)) {
        return null;
      }

      const cached = this.tier1ResultCache.get(cacheKey);

      // Check if cache is expired (5 minute TTL for TIER 1 results)
      const cacheAge = Date.now() - cached.timestamp;
      const maxAge = 5 * 60 * 1000; // 5 minutes TTL

      if (cacheAge > maxAge) {
        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            "🗑️ [CampusLocationService] TIER 1 result cache expired",
            {
              university,
              ageMinutes: Math.round(cacheAge / (60 * 1000)),
              method: cached.method,
            }
          );
        }
        this.tier1ResultCache.delete(cacheKey);
        return null;
      }

      if (typeof logManager !== "undefined") {
        logManager.dev.info(
          "💾 [CampusLocationService] Found recent TIER 1 result",
          {
            university,
            ageSeconds: Math.round(cacheAge / 1000),
            campusStatus: cached.campusStatus,
            method: cached.method,
            confidence: cached.confidence,
          }
        );
      }

      return cached;
    } catch (error) {
      if (typeof logManager !== "undefined") {
        logManager.dev.fail(
          "[CampusLocationService] Failed to get recent TIER 1 result:",
          error
        );
      }
      return null;
    }
  }

  /**
   * 🎯 NEW METHOD: Cache TIER 1 network detection result
   * Stores successful network detection results to prevent redundant boundary checks
   * @param {string} university - University code (e.g., "iub")
   * @param {Object} tier1Result - TIER 1 result from network detection
   */
  cacheTier1Result(university, tier1Result) {
    try {
      // Initialize TIER 1 cache if it doesn't exist
      if (!this.tier1ResultCache) {
        this.tier1ResultCache = new Map();
      }

      const cacheKey = `tier1_${university}`;

      // Only cache ON_CAMPUS results (high confidence network detection)
      if (tier1Result.campusStatus === "on_campus") {
        const cacheData = {
          ...tier1Result,
          timestamp: Date.now(),
          cachedAt: Date.now(),
        };

        this.tier1ResultCache.set(cacheKey, cacheData);

        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            "💾 [CampusLocationService] Cached TIER 1 ON_CAMPUS result",
            {
              university,
              method: tier1Result.method,
              userOrganization: tier1Result.userOrganization,
              confidence: tier1Result.confidence,
            }
          );
        }
      }
    } catch (error) {
      if (typeof logManager !== "undefined") {
        logManager.dev.fail(
          "[CampusLocationService] Failed to cache TIER 1 result:",
          error
        );
      }
    }
  }

  /**
   * Cache location data to localStorage
   * @param {Object} locationData - Location data to cache
   */
  setCachedLocation(locationData) {
    try {
      const cacheData = {
        ...locationData,
        timestamp: Date.now(),
      };

      localStorage.setItem(
        "meetchuthere_last_location",
        JSON.stringify(cacheData)
      );

      logManager.location.info("💾 Cached location:", {
        campusStatus: locationData.campusStatus,
        accuracy: locationData.accuracy,
      });
    } catch (error) {
      logManager.location.warn(
        "[CampusLocationService] Failed to cache location:",
        error
      );
    }
  }

  /**
   * Trigger location update animation in HorizontalFriendsBar
   * @param {string} source - Source of the animation trigger
   * @param {Object} locationData - Location update data
   */
  async triggerLocationAnimation(
    source = "location_update",
    locationData = null
  ) {
    try {
      // Import the animation trigger function
      const { triggerUserLocationUpdateAnimation } = await import(
        "../../components/friends/HorizontalFriendsBar.js"
      );

      // Triggering location animation

      // Pass proper data structure to HorizontalFriendsBar
      if (locationData) {
        triggerUserLocationUpdateAnimation(locationData);
      } else {
        // Fallback with basic valid structure to prevent null errors
        triggerUserLocationUpdateAnimation({
          coordinatesChanged: true,
          campusStatusChanged: false,
          hasValidCoordinates: true,
          hasLastActiveUpdate: true,
          previousStatus: "unknown",
          newStatus: "unknown",
        });
      }
    } catch (error) {
      console.warn(
        "[CampusLocationService] Could not trigger location animation:",
        error
      );
    }
  }

  // 🔧 MOBILE-RESILIENT FIREBASE LISTENER MANAGEMENT
  createMobileResilientListener(listenerConfig) {
    console.log(
      `[CampusLocationService] 📱 Creating mobile-resilient Firebase listener: ${listenerConfig.name}`
    );

    const listener = {
      name: listenerConfig.name,
      query: listenerConfig.query,
      callback: listenerConfig.callback,
      errorCallback:
        listenerConfig.errorCallback ||
        this.defaultListenerErrorHandler.bind(this),

      // Connection state
      isConnected: true,
      unsubscribe: null,
      reconnectionAttempts: 0,
      maxReconnectionAttempts: 5,
      reconnectionDelay: 1000,
      maxReconnectionDelay: 30000,

      // Mobile-specific properties
      lastSuccessfulConnection: Date.now(),
      connectionTimeouts: 0,
      networkChangeCount: 0,
      isBackgroundPaused: false,

      // Queued updates for offline resilience
      queuedUpdates: [],
      maxQueueSize: 50,

      // Reconnection management
      reconnectionTimeout: null,
      heartbeatInterval: null,
    };

    this.setupMobileResilientConnection(listener);
    return listener;
  }

  setupMobileResilientConnection(listener) {
    console.log(
      `[CampusLocationService] 📱 Setting up resilient connection for: ${listener.name}`
    );

    const connectListener = () => {
      try {
        // Clear any existing connection
        if (listener.unsubscribe) {
          listener.unsubscribe();
          listener.unsubscribe = null;
        }

        console.log(
          `[CampusLocationService] 📱 Connecting Firebase listener: ${
            listener.name
          } (attempt ${listener.reconnectionAttempts + 1})`
        );

        // Import Firebase dynamically to handle potential import issues
        import("firebase/firestore")
          .then(({ onSnapshot }) => {
            listener.unsubscribe = onSnapshot(
              listener.query,

              // Success callback with mobile-specific enhancements
              (snapshot) => {
                listener.isConnected = true;
                listener.lastSuccessfulConnection = Date.now();
                listener.reconnectionAttempts = 0;
                listener.connectionTimeouts = 0;

                console.log(
                  `[CampusLocationService] 📱 Successful listener update: ${listener.name}`
                );

                // Process any queued updates first (offline resilience)
                if (listener.queuedUpdates.length > 0) {
                  console.log(
                    `[CampusLocationService] 📱 Processing ${listener.queuedUpdates.length} queued updates for ${listener.name}`
                  );
                  listener.queuedUpdates.forEach((update) => {
                    try {
                      listener.callback(update.data, update.metadata);
                    } catch (callbackError) {
                      console.error(
                        `[CampusLocationService] 📱 Error processing queued update:`,
                        callbackError
                      );
                    }
                  });
                  listener.queuedUpdates = [];
                }

                // Process current update
                try {
                  const metadata = {
                    isFromCache: snapshot.metadata?.fromCache || false,
                    hasPendingWrites:
                      snapshot.metadata?.hasPendingWrites || false,
                    connectionAttempts: listener.reconnectionAttempts,
                    isMobileOptimized: true,
                  };

                  listener.callback(snapshot, metadata);
                } catch (callbackError) {
                  console.error(
                    `[CampusLocationService] 📱 Error in listener callback:`,
                    callbackError
                  );
                  listener.errorCallback(callbackError, "callback_error");
                }
              },

              // Error callback with mobile-specific retry logic
              (error) => {
                console.error(
                  `[CampusLocationService] 📱 Firebase listener error for ${listener.name}:`,
                  {
                    code: error.code,
                    message: error.message,
                    connectionAttempts: listener.reconnectionAttempts,
                    isOnline: this.isOnline,
                    isAppVisible: this.isAppVisible,
                  }
                );

                listener.isConnected = false;

                // Handle different error types with mobile-specific strategies
                this.handleMobileListenerError(listener, error);
              }
            );

            // Start connection health monitoring
            this.startListenerHealthMonitoring(listener);
          })
          .catch((importError) => {
            console.error(
              `[CampusLocationService] 📱 Failed to import Firebase modules:`,
              importError
            );
            this.scheduleListenerReconnection(listener);
          });
      } catch (connectionError) {
        console.error(
          `[CampusLocationService] 📱 Error setting up listener connection:`,
          connectionError
        );
        this.scheduleListenerReconnection(listener);
      }
    };

    // Initial connection
    connectListener();
    listener.connect = connectListener;
  }

  handleMobileListenerError(listener, error) {
    const errorType = this.classifyFirebaseError(error);

    console.log(
      `[CampusLocationService] 📱 Handling ${errorType} error for ${listener.name}`
    );

    switch (errorType) {
      case "network_error":
        // Network-related errors - implement exponential backoff
        if (!this.isOnline) {
          console.log(
            `[CampusLocationService] 📱 Device offline - queuing reconnection for ${listener.name}`
          );
          // Will reconnect when network comes back
          return;
        }
        this.scheduleListenerReconnection(listener);
        break;

      case "permission_error":
        // Permission/authentication errors - don't retry immediately
        console.error(
          `[CampusLocationService] 📱 Permission error for ${listener.name} - delayed retry`
        );
        setTimeout(() => {
          this.scheduleListenerReconnection(listener);
        }, 5000);
        break;

      case "firestore_error":
        // Firestore-specific errors - moderate retry
        this.scheduleListenerReconnection(listener);
        break;

      case "unknown_error":
      default:
        // Unknown errors - conservative retry
        this.scheduleListenerReconnection(listener);
        break;
    }

    // Notify error callback
    listener.errorCallback(error, errorType);
  }

  classifyFirebaseError(error) {
    if (!error.code) return "unknown_error";

    const networkErrors = ["unavailable", "cancelled", "deadline-exceeded"];
    const permissionErrors = ["permission-denied", "unauthenticated"];
    const firestoreErrors = ["resource-exhausted", "internal", "unknown"];

    if (networkErrors.includes(error.code)) return "network_error";
    if (permissionErrors.includes(error.code)) return "permission_error";
    if (firestoreErrors.includes(error.code)) return "firestore_error";

    return "unknown_error";
  }

  scheduleListenerReconnection(listener) {
    // Don't schedule if we're already scheduled or at max attempts
    if (
      listener.reconnectionTimeout ||
      listener.reconnectionAttempts >= listener.maxReconnectionAttempts
    ) {
      return;
    }

    listener.reconnectionAttempts++;

    // Calculate exponential backoff delay with jitter
    const baseDelay = Math.min(
      listener.reconnectionDelay *
        Math.pow(2, listener.reconnectionAttempts - 1),
      300000
    ); // Max 5 minutes
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = baseDelay + jitter;

    logManager.location.warn(
      `[CampusLocationService] 📱 Scheduling listener reconnection for ${
        listener.name
      } in ${Math.round(delay / 1000)}s (attempt ${
        listener.reconnectionAttempts
      })`
    );

    listener.reconnectionTimeout = setTimeout(() => {
      listener.reconnectionTimeout = null;

      logManager.location.info(
        `[CampusLocationService] 📱 Attempting to reconnect ${listener.name} (attempt ${listener.reconnectionAttempts})`
      );

      try {
        // Call the listener's reconnection method
        if (listener.reconnect && typeof listener.reconnect === "function") {
          listener.reconnect();
        } else {
          logManager.location.warn(
            `[CampusLocationService] ⚠️ No reconnect method available for ${listener.name}`
          );
        }
      } catch (error) {
        logManager.location.fail(
          `[CampusLocationService] ❌ Failed to reconnect ${listener.name}:`,
          error
        );
        // Schedule another attempt if we haven't exceeded max attempts
        if (listener.reconnectionAttempts < listener.maxReconnectionAttempts) {
          this.scheduleListenerReconnection(listener);
        }
      }
    }, delay);
  }

  startListenerHealthMonitoring(listener) {
    // Clear any existing health monitoring
    if (listener.heartbeatInterval) {
      clearInterval(listener.heartbeatInterval);
    }

    // Start periodic health checks (every 30 seconds on mobile)
    listener.heartbeatInterval = setInterval(() => {
      if (!this.isAppVisible) {
        return; // Skip health checks when backgrounded
      }

      const timeSinceLastConnection =
        Date.now() - listener.lastSuccessfulConnection;
      const healthThreshold = 60000; // 60 seconds

      if (timeSinceLastConnection > healthThreshold && this.isOnline) {
        console.warn(
          `[CampusLocationService] 📱 Health check failed for ${
            listener.name
          } - ${Math.round(timeSinceLastConnection / 1000)}s since last update`
        );

        // Force reconnection
        listener.reconnectionAttempts = 0; // Reset attempts for health-triggered reconnection
        this.scheduleListenerReconnection(listener);
      }
    }, 30000);
  }

  defaultListenerErrorHandler(error, errorType) {
    console.error(
      `[CampusLocationService] 📱 Default listener error handler:`,
      {
        error: error.message,
        errorType,
        timestamp: new Date().toISOString(),
      }
    );
  }

  // Helper method to cleanup mobile-resilient listeners
  cleanupMobileResilientListener(listener) {
    console.log(
      `[CampusLocationService] 📱 Cleaning up resilient listener: ${listener.name}`
    );

    if (listener.unsubscribe) {
      listener.unsubscribe();
      listener.unsubscribe = null;
    }

    if (listener.reconnectionTimeout) {
      clearTimeout(listener.reconnectionTimeout);
      listener.reconnectionTimeout = null;
    }

    if (listener.heartbeatInterval) {
      clearInterval(listener.heartbeatInterval);
      listener.heartbeatInterval = null;
    }

    listener.queuedUpdates = [];
    listener.isConnected = false;
  }

  // 🔧 POLYGON DEBUGGING HELPER
  debugPolygonDetection(userLat, userLng, university = "iub") {
    // Group polygon debug output to reduce console noise while preserving
    // all the diagnostic details for future debugging.
    logManager.dev.groupCollapsed(
      "🔍 [POLYGON DEBUG] Detailed polygon analysis",
      () => {
        const campusConfig = getCampusConfig(university);
        if (!campusConfig) {
          logManager.dev.error(
            `🔍 [POLYGON DEBUG] No campus config found for: ${university}`
          );
          return;
        }

        const userPoint = { lat: userLat, lng: userLng };

        logManager.dev.info("Analysis Details", {
          userLocation: userPoint,
          campusCenter: campusConfig.center,
          boundaryPoints: campusConfig.boundary.length,
        });

        // Calculate distance from center
        const distanceFromCenter = this.calculateDistance(
          userPoint,
          campusConfig.center
        );

        logManager.dev.info("Distance Analysis", {
          distanceFromCenterMeters: Math.round(distanceFromCenter),
          userPoint,
          campusCenter: campusConfig.center,
        });

        // Show boundary coordinate ranges
        const lats = campusConfig.boundary.map((p) => p.lat);
        const lngs = campusConfig.boundary.map((p) => p.lng);
        const boundaryBounds = {
          latMin: Math.min(...lats),
          latMax: Math.max(...lats),
          lngMin: Math.min(...lngs),
          lngMax: Math.max(...lngs),
        };

        logManager.dev.info("Boundary Bounds", boundaryBounds);

        // Check if user is within bounding rectangle
        const withinBounds =
          userLat >= boundaryBounds.latMin &&
          userLat <= boundaryBounds.latMax &&
          userLng >= boundaryBounds.lngMin &&
          userLng <= boundaryBounds.lngMax;

        logManager.dev.info("Bounding Box Check", {
          withinBoundingRectangle: withinBounds,
          userLat,
          userLng,
          bounds: boundaryBounds,
        });

        // Run point-in-polygon with detailed logging
        logManager.dev.info("Running detailed ray casting");
        const isInside = this.debugPointInPolygon(
          userPoint,
          campusConfig.boundary
        );

        logManager.dev.info("Final Result", {
          pointInPolygon: isInside,
          withinBoundingBox: withinBounds,
          distanceFromCenter: Math.round(distanceFromCenter),
          recommendation: isInside
            ? "✅ Should show GREEN dot"
            : "❌ Shows RED dot - check coordinates",
        });
      }
    );
  }

  debugPointInPolygon(point, polygon) {
    console.log(
      "🔍 [RAY CASTING DEBUG] Starting detailed ray casting analysis"
    );

    if (!polygon || polygon.length < 3) {
      console.error(
        "🔍 [RAY CASTING DEBUG] Invalid polygon - need at least 3 vertices"
      );
      return false;
    }

    let isInside = false;
    let intersectionCount = 0;
    const x = point.lng;
    const y = point.lat;

    logManager.dev.debug("🔍 [RAY CASTING DEBUG] Test point:", { x, y });
    logManager.dev.debug(
      "🔍 [RAY CASTING DEBUG] Polygon vertices:",
      polygon.length
    );

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      // Ray casting algorithm with debug info
      const condition1 = yi > y !== yj > y;
      const intersectionX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      const condition2 = x < intersectionX;

      if (condition1 && condition2) {
        isInside = !isInside;
        intersectionCount++;

        console.log(
          `🔍 [RAY CASTING DEBUG] Intersection ${intersectionCount}:`,
          {
            edge: `${i} -> ${j}`,
            edgePoints: { from: { x: xi, y: yi }, to: { x: xj, y: yj } },
            intersectionX,
            rayX: x,
            intersects: true,
            newState: isInside,
          }
        );
      }
    }

    console.log("🔍 [RAY CASTING DEBUG] Ray casting complete:", {
      totalIntersections: intersectionCount,
      finalResult: isInside,
      rule: "Odd intersections = inside, Even intersections = outside",
    });

    return isInside;
  }

  // 🔧 POLYGON BUFFER HELPER - Expand boundary for GPS accuracy tolerance
  createBufferedPolygon(originalPolygon, bufferMeters = 20) {
    console.log(
      `🔍 [POLYGON BUFFER] Creating ${bufferMeters}m buffer around polygon`
    );

    // Simple approach: expand each coordinate by buffer amount in degrees
    // 1 meter ≈ 0.000009 degrees latitude (varies by location)
    // 1 meter ≈ 0.000009 / cos(latitude) degrees longitude

    const bufferLat = bufferMeters * 0.000009; // Latitude buffer in degrees
    const avgLat =
      originalPolygon.reduce((sum, p) => sum + p.lat, 0) /
      originalPolygon.length;
    const bufferLng =
      (bufferMeters * 0.000009) / Math.cos((avgLat * Math.PI) / 180); // Longitude buffer

    console.log(`🔍 [POLYGON BUFFER] Buffer amounts:`, {
      bufferMeters,
      bufferLat: bufferLat.toFixed(8),
      bufferLng: bufferLng.toFixed(8),
      avgLatitude: avgLat.toFixed(6),
    });

    // Find polygon centroid
    const centroid = {
      lat: avgLat,
      lng:
        originalPolygon.reduce((sum, p) => sum + p.lng, 0) /
        originalPolygon.length,
    };

    // Expand each point away from centroid
    const bufferedPolygon = originalPolygon.map((point) => {
      const latDiff = point.lat - centroid.lat;
      const lngDiff = point.lng - centroid.lng;

      // Normalize and apply buffer
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      const factor = distance > 0 ? (distance + bufferLat) / distance : 1;

      return {
        lat: centroid.lat + latDiff * factor,
        lng: centroid.lng + lngDiff * factor,
      };
    });

    console.log(
      `🔍 [POLYGON BUFFER] Created buffered polygon with ${bufferedPolygon.length} points`
    );
    return bufferedPolygon;
  }

  // 🔧 TEST DIFFERENT BUFFER SIZES
  testPolygonWithBuffers(userLat, userLng, university = "iub") {
    logManager.dev.debug(
      "🔍 [BUFFER TEST] Testing polygon with different buffer sizes"
    );
    const campusConfig = getCampusConfig(university);
    if (!campusConfig) return;

    const userPoint = { lat: userLat, lng: userLng };
    const originalResult = this.pointInPolygon(
      userPoint,
      campusConfig.boundary
    );

    console.log("🔍 [BUFFER TEST] Results:", {
      originalPolygon: originalResult,
      buffer10m: this.pointInPolygon(
        userPoint,
        this.createBufferedPolygon(campusConfig.boundary, 10)
      ),
      buffer20m: this.pointInPolygon(
        userPoint,
        this.createBufferedPolygon(campusConfig.boundary, 20)
      ),
      buffer30m: this.pointInPolygon(
        userPoint,
        this.createBufferedPolygon(campusConfig.boundary, 30)
      ),
      buffer50m: this.pointInPolygon(
        userPoint,
        this.createBufferedPolygon(campusConfig.boundary, 50)
      ),
    });
  }

  // 🔧 MOBILE LIFECYCLE MANAGEMENT METHODS
  initializeMobileLifecycleHandlers() {
    if (!this.detectMobileBrowser()) {
      console.log(
        "[CampusLocationService] Desktop detected - skipping mobile lifecycle handlers"
      );
      return;
    }

    console.log(
      "[CampusLocationService] 📱 Initializing mobile app lifecycle handlers"
    );

    // Page Visibility API - handle app going to background/foreground
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    // Network connectivity changes - mobile networks are unstable
    this.handleOnlineStatus = this.handleOnlineStatus.bind(this);
    window.addEventListener("online", this.handleOnlineStatus);
    window.addEventListener("offline", this.handleOnlineStatus);

    // Page focus/blur events - additional mobile lifecycle coverage
    this.handleAppFocus = this.handleAppFocus.bind(this);
    this.handleAppBlur = this.handleAppBlur.bind(this);
    window.addEventListener("focus", this.handleAppFocus);
    window.addEventListener("blur", this.handleAppBlur);

    // 🎯 SPA NAVIGATION: Listen for single-page app navigation events
    document.addEventListener("spa:page:load", (event) => {
      this.handleSPANavigation(event);
    });

    // Battery API if available (experimental but useful for mobile optimization)
    if ("getBattery" in navigator) {
      navigator
        .getBattery()
        .then((battery) => {
          this.batteryLevel = battery.level;
          this.isCharging = battery.charging;

          console.log(
            `[CampusLocationService] 🔋 Battery status: ${Math.round(
              battery.level * 100
            )}% (${battery.charging ? "charging" : "not charging"})`
          );

          battery.addEventListener("levelchange", () => {
            this.batteryLevel = battery.level;
            this.adjustTrackingForBattery();
          });

          battery.addEventListener("chargingchange", () => {
            this.isCharging = battery.charging;
            this.adjustTrackingForBattery();
          });
        })
        .catch((error) => {
          console.log(
            "[CampusLocationService] Battery API not available:",
            error
          );
        });
    }

    // Store initial network status
    this.isOnline = navigator.onLine;
    this.lastOnlineTime = Date.now();

    console.log(
      "[CampusLocationService] 📱 Mobile lifecycle handlers initialized (including SPA navigation)"
    );
  }

  handleVisibilityChange() {
    const isVisible = !document.hidden;
    const now = Date.now();

    console.log(
      `[CampusLocationService] 📱 Visibility changed: ${
        isVisible ? "visible" : "hidden"
      } at ${new Date(now).toISOString()}`
    );

    if (isVisible) {
      // App came to foreground
      const backgroundDuration = now - (this.backgroundTime || now);
      console.log(
        `[CampusLocationService] 📱 App returned to foreground after ${Math.round(
          backgroundDuration / 1000
        )}s`
      );

      // If we were in background for more than 2 minutes, reinitialize location tracking
      if (backgroundDuration > 120000) {
        console.log(
          "[CampusLocationService] 📱 Long background duration - reinitializing location tracking"
        );
        this.handleAppResume();
      } else {
        // Short background - just resume updates
        console.log(
          "[CampusLocationService] 📱 Short background duration - resuming location updates"
        );
        this.resumeLocationTracking();
      }

      this.backgroundTime = null;
    } else {
      // App went to background
      this.backgroundTime = now;
      console.log(
        "[CampusLocationService] 📱 App went to background - pausing intensive location tracking"
      );
      this.pauseLocationTracking();
    }
  }

  handleOnlineStatus() {
    const wasOnline = this.isOnline;
    this.isOnline = navigator.onLine;
    const now = Date.now();

    console.log(
      `[CampusLocationService] 📱 Network status changed: ${
        this.isOnline ? "online" : "offline"
      } at ${new Date(now).toISOString()}`
    );

    if (this.isOnline && !wasOnline) {
      // Just came back online
      const offlineDuration = now - (this.offlineTime || now);
      console.log(
        `[CampusLocationService] 📱 Network restored after ${Math.round(
          offlineDuration / 1000
        )}s offline`
      );

      this.lastOnlineTime = now;
      this.offlineTime = null;

      // Reinitialize if we were offline for more than 30 seconds
      if (offlineDuration > 30000) {
        console.log(
          "[CampusLocationService] 📱 Extended offline period - reinitializing services"
        );
        setTimeout(() => this.handleAppResume(), 2000); // Give network time to stabilize
      }
    } else if (!this.isOnline && wasOnline) {
      // Just went offline
      this.offlineTime = now;
      console.log(
        "[CampusLocationService] 📱 Network lost - pausing network-dependent operations"
      );
    }
  }

  handleAppFocus() {
    logManager.dev.debug("[CampusLocationService] 📱 App gained focus");
    // App focus doesn't always trigger visibility change on mobile
    if (!this.hasFocus) {
      this.hasFocus = true;
      // Resume location tracking if needed
      if (this.isInitialized && this.shouldTrackLocation()) {
        this.resumeLocationTracking();
      }
    }
  }

  handleAppBlur() {
    logManager.dev.debug("[CampusLocationService] 📱 App lost focus");
    this.hasFocus = false;
    // Don't immediately pause - wait for visibility change
    // This prevents unnecessary pause/resume cycles during quick focus changes
  }

  pauseLocationTracking() {
    console.log(
      "[CampusLocationService] 📱 Pausing location tracking for mobile background mode"
    );

    // Store current tracking state
    this.wasPaused = true;
    this.pausedWatchId = this.trackingWatchId;
    this.pausedPeriodicTimer = this.periodicLocationTimer;

    // Stop intensive GPS watching but keep basic heartbeat
    if (this.trackingWatchId) {
      clearInterval(this.trackingWatchId); // 🔋 BATTERY FIX: Clear interval instead of GPS watch
      this.trackingWatchId = null;
      console.log(
        "[CampusLocationService] 📱 Smart interval tracking stopped for background mode"
      );
    }

    // Reduce periodic updates to every 10 minutes instead of 5
    if (this.periodicLocationTimer) {
      clearInterval(this.periodicLocationTimer);
      this.periodicLocationTimer = setInterval(() => {
        if (!document.hidden && navigator.onLine) {
          console.log(
            "[CampusLocationService] 📱 Background periodic location update"
          );
          this.updateLocationAndPresence(false); // Low accuracy for battery saving
        }
      }, 10 * 60 * 1000); // 10 minutes
    }
  }

  resumeLocationTracking() {
    if (!this.wasPaused) {
      console.log(
        "[CampusLocationService] 📱 Location tracking was not paused - no resume needed"
      );
      return;
    }

    console.log(
      "[CampusLocationService] 📱 Resuming location tracking from mobile background"
    );
    this.wasPaused = false;

    // Check if we should still be tracking
    if (!this.shouldTrackLocation()) {
      console.log(
        "[CampusLocationService] 📱 Location tracking no longer needed - staying paused"
      );
      return;
    }

    // Restart polling
    this.startPresencePolling(20000);

    // Immediate location update to refresh presence
    setTimeout(() => this.runPresencePollNow(), 1000);

    this.pausedWatchId = null;
    this.pausedPeriodicTimer = null;
  }

  handleAppResume() {
    console.log(
      "[CampusLocationService] 📱 Handling full app resume - reinitializing location services"
    );

    // Reset initialization state to trigger fresh start
    this.isInitialized = false;
    this.initializationAttempts = 0;

    // Clear any existing timers
    this.stopLocationTracking();

    // Restart the full initialization process
    setTimeout(() => this.autoStartLocationTracking(), 1000);
  }

  adjustTrackingForBattery() {
    if (!this.batteryLevel) return;

    const batteryPercent = Math.round(this.batteryLevel * 100);
    console.log(
      `[CampusLocationService] 🔋 Battery level: ${batteryPercent}% (${
        this.isCharging ? "charging" : "not charging"
      })`
    );

    // If battery is low and not charging, reduce location tracking frequency
    // Polling-only approach: battery adjustment is handled by poll interval settings
  }

  shouldTrackLocation() {
    // Check if location tracking should be active based on current conditions
    return (
      this.isOnline &&
      this.permissionStatus === "granted" &&
      (this.hasFocus || !document.hidden) &&
      this.isInitialized
    );
  }

  cleanupMobileLifecycleHandlers() {
    console.log(
      "[CampusLocationService] 📱 Cleaning up mobile lifecycle handlers"
    );

    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange
    );
    window.removeEventListener("online", this.handleOnlineStatus);
    window.removeEventListener("offline", this.handleOnlineStatus);
    window.removeEventListener("focus", this.handleAppFocus);
    window.removeEventListener("blur", this.handleAppBlur);
  }

  /**
   * Get the last known position
   * @returns {GeolocationPosition|null} Last known position or null
   */
  getLastKnownPosition() {
    return this.currentPosition;
  }

  /**
   * 🚀 ENTERPRISE FIX: Real-time campus presence tracking with mobile-first GPS management
   * Implements aggressive location tracking for accurate campus presence detection
   * @param {Function} callback - Callback function for position updates
   * @returns {number|null} Watch ID for stopping the watch
   */

  /**
   * Stop watching position changes
   * @param {number} watchId - Watch ID returned from watchPosition
   */

  /**
   * Start automatic location tracking for campus presence
   * This method starts watching position and updates database automatically
   * Called when users enable location sharing
   */
  async startLocationTracking() {
    // Repurposed to 3-tier polling only (no watchPosition)
    try {
      if (!currentUser?.uid) return;
      if (currentUser?.profile?.systemInfo?.locationSharingEnabled !== true)
        return;

      // Start presence polling and run an immediate poll for fast update
      await this.startPresencePolling(20000);
      await this.runPresencePollNow();
    } catch (error) {
      console.error("[CampusLocationService] Error starting polling:", error);
    }
  }

  /**
   * Stop automatic location tracking
   */
  stopLocationTracking() {
    // Stop presence polling only; no watchPosition is used
    this.stopPresencePolling();

    // Clear debounce timeout
    if (this.locationUpdateDebounceTimeout) {
      clearTimeout(this.locationUpdateDebounceTimeout);
      this.locationUpdateDebounceTimeout = null;
      logManager.dev.debug(
        "[CampusLocationService] Location update debounce cleared"
      );
    }

    // Stop activity heartbeat and health monitoring
    this.stopActivityHeartbeat();
    this.stopHealthMonitoring();

    // Clear initialization retry timeout
    if (this.initializationRetryTimeout) {
      clearTimeout(this.initializationRetryTimeout);
      this.initializationRetryTimeout = null;
    }

    // Reset state
    this.isUpdatingLocation = false;
    this.lastLocationUpdate = null;
    this.isUpdatingActivity = false;
    this.isInitialized = false;
    this.initializationAttempts = 0;
    this.initializationErrors = [];
    this.isTracking = false; // 🔋 Reset tracking flag

    console.log(
      "[CampusLocationService] ✅ Location polling and health systems stopped"
    );
  }

  /**
   * Broadcast permission state change event
   */
  dispatchPermissionChanged(status) {
    try {
      document.dispatchEvent(
        new CustomEvent("location-permission:changed", {
          detail: { status, timestamp: Date.now() },
        })
      );
    } catch (_) {}
  }

  /**
   * Auto-sync profile and UI when permission is denied
   */
  async handlePermissionDenied(reason = "unknown") {
    try {
      // Avoid duplicate work/notifications within a short window
      if (this._denialSyncInProgress) return;
      this._denialSyncInProgress = true;

      this.stopLocationTracking();

      // Do not auto-flip the user's global preference to OFF on denial.
      // Preserve intent (toggle remains ON) and rely on permissionMissing UI state.

      const now = Date.now();
      if (!this._lastDenialHandledAt || now - this._lastDenialHandledAt > 2500) {
        try {
          notificationManager.showWarningNotification(
            "Campus presence turned off because location permission is not allowed.",
            { duration: 6000 }
          );
        } catch (_) {}
        this._lastDenialHandledAt = now;
      }

      logManager.location.warn(
        `[CampusLocationService] Auto-disabled presence due to permission denial (${reason})`
      );
    } catch (_) {
      // swallow
    } finally {
      this._denialSyncInProgress = false;
    }
  }

  /**
   * 🔋 SMART CAMPUS DETECTION: Optimizes battery by pausing GPS when on campus network
   * This method periodically checks if user is on campus WiFi and pauses GPS tracking accordingly
   */
  async optimizeBatteryWithNetworkDetection() {
    if (!this.networkDetectionService) {
      console.warn(
        "[CampusLocationService] 🔋 Network detection service not available for optimization"
      );
      return;
    }

    try {
      console.log(
        "[CampusLocationService] 🔋 Checking campus network for battery optimization..."
      );

      const networkResult =
        await this.networkDetectionService.detectCampusPresence("iub");

      if (networkResult.success && networkResult.campusStatus === "on_campus") {
        // 🏢 ON CAMPUS NETWORK: Pause GPS to save battery
        console.log(
          "🔋🏢 CAMPUS NETWORK DETECTED - Pausing GPS tracking for battery optimization"
        );
        console.log(`📍 Organization: "${networkResult.userOrganization}"`);
        console.log(`🌐 IP: ${networkResult.userIP}`);
        console.log(
          "⚡ Battery Benefit: GPS tracking paused while on campus WiFi"
        );

        // Temporarily pause GPS tracking
        if (this.trackingWatchId) {
          clearInterval(this.trackingWatchId); // 🔋 BATTERY FIX: Clear interval instead of GPS watch
          this.trackingWatchId = null;
          console.log(
            "🔋 Smart interval tracking paused - will resume when off campus network"
          );
        }

        // Update presence to on-campus without GPS
        this.emitFreshPresenceData(
          { coords: { latitude: 0, longitude: 0, accuracy: 0 } },
          {
            onCampus: true,
            campusStatus: "on_campus",
            method: "network_organization_detection",
            confidence: "high",
            batterySaving: true,
            userOrganization: networkResult.userOrganization,
            userIP: networkResult.userIP,
            timestamp: Date.now(),
          }
        );

        // Schedule next network check in 5 minutes (less frequent on campus)
        setTimeout(
          () => this.optimizeBatteryWithNetworkDetection(),
          5 * 60 * 1000
        );
      } else {
        // 🌐 OFF CAMPUS NETWORK: Resume GPS if needed
        // With polling-only approach, nothing to resume here

        // Schedule next network check in 2 minutes (more frequent off campus)
        setTimeout(
          () => this.optimizeBatteryWithNetworkDetection(),
          2 * 60 * 1000
        );
      }
    } catch (error) {
      console.warn(
        "[CampusLocationService] 🔋 Network optimization check failed:",
        error.message
      );
      // Schedule retry in 3 minutes on error
      setTimeout(
        () => this.optimizeBatteryWithNetworkDetection(),
        3 * 60 * 1000
      );
    }
  }

  /**
   * Debounced location update method to prevent excessive database calls
   * Only updates if minimum time interval has passed since last update
   * @param {GeolocationPosition} position - GPS position data
   */
  debouncedLocationUpdate(locationData, options = {}) {
    // Clear any pending debounce timeout
    if (this.locationUpdateDebounceTimeout) {
      clearTimeout(this.locationUpdateDebounceTimeout);
    }

    // 🚀 SENIOR DEV FIX: Handle both GPS position objects and 3-tier system results
    let position;
    let source = "unknown";
    let tier = "unknown";
    let batteryOptimized = false;

    if (locationData && locationData.coords) {
      // Traditional GPS position object (from requestSingleLocationUpdate)
      position = locationData;
      source = locationData.source || "gps";
      tier = locationData.tier || 2;
      batteryOptimized = locationData.batteryOptimized || false;
    } else if (locationData && locationData.tier) {
      // 3-tier system result (from interval checks)
      position = {
        coords: locationData.coords,
        timestamp: locationData.timestamp,
      };
      source = locationData.source || "3-tier";
      tier = locationData.tier;
      batteryOptimized = locationData.batteryOptimized || false;
    } else {
      console.error(
        "[CampusLocationService] Invalid location data provided to debouncedLocationUpdate"
      );
      return;
    }

    // 🎯 CRITICAL FIX: Handle TIER 1 network detection results with null coordinates
    // For network detection (TIER 1), null coordinates are expected and valid!
    const isNetworkDetection =
      source === "ipinfo_lite_as_domain" ||
      source === "ip_organization_detection" ||
      tier === 1;
    const hasValidCoordinates =
      position.coords && this.isValidCoordinates(position);

    if (!isNetworkDetection && !hasValidCoordinates) {
      console.log(
        `[CampusLocationService] 🔋 Non-network result from tier ${tier} - no valid GPS coordinates to process`
      );
      return;
    }

    // For network detection, we can still proceed without GPS coordinates
    if (isNetworkDetection && !hasValidCoordinates) {
      console.log(
        `[CampusLocationService] 🏢 TIER 1 network detection result - proceeding without GPS coordinates (campusStatus via IP)`
      );
    }

    // 🎯 SMART ACTIVITY CHECK: Only write to database for meaningful interactions
    const isTriggeredUpdate = options.isTrigger || false;
    const isSignificantActivity = this.isSignificantUserActivity();
    const shouldWriteToDatabase =
      isTriggeredUpdate || isSignificantActivity || isNetworkDetection; // Always write network detection results

    const now = Date.now();

    // Smart location update decision (omitted verbose console output)

    // Always update cache for immediate presence updates, regardless of database write decision
    // For network detection, get campus status from the detection result rather than coordinates
    let campusStatus = "unknown";
    if (isNetworkDetection) {
      // For network detection, the campus status should come from the detection result
      // We'll determine this in the database write section
    } else if (hasValidCoordinates) {
      campusStatus = this.getCachedCampusStatus(position) || "unknown";
    }

    // Only update location cache if we have valid coordinates
    if (hasValidCoordinates) {
      this.setCachedLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        campusStatus: campusStatus,
        source: source,
        tier: tier,
        batteryOptimized: batteryOptimized,
      });
    }

    // 🟣 Always trigger animation for any location update (cached or database)
    const locationAnimationData = {
      coordinatesChanged: hasValidCoordinates
        ? this.hasLocationChanged(position, 10)
        : false,
      campusStatusChanged: false, // Status change detection is handled in updateLocationAndPresence
      hasValidCoordinates: hasValidCoordinates,
      hasLastActiveUpdate: shouldWriteToDatabase,
      previousStatus: this.lastKnownCampusStatus || "unknown",
      newStatus: campusStatus,
      source: source,
      tier: tier,
      batteryOptimized: batteryOptimized,
      recursiveCallAvoided: true, // Track performance optimization
      coordinates: hasValidCoordinates
        ? {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }
        : null,
    };

    this.triggerLocationAnimation(
      shouldWriteToDatabase ? `activity_${source}` : "cached_update",
      locationAnimationData
    );

    if (!shouldWriteToDatabase) {
      // SMART SKIP: Not writing to database - user is passively browsing
      return;
    }

    // Check timing constraints for database writes (but allow immediate network detection writes)
    if (
      this.lastLocationUpdate &&
      now - this.lastLocationUpdate < this.minUpdateInterval &&
      !isTriggeredUpdate &&
      !isNetworkDetection
    ) {
      // Skipping database write due to min interval
      return;
    }

    // 🚀 SMART DATABASE WRITE: Only for meaningful user activity or network detection
    const debounceTime = isTriggeredUpdate || isNetworkDetection ? 200 : 10000; // Faster for triggers and network detection

    this.locationUpdateDebounceTimeout = setTimeout(async () => {
      try {
        if (this.isUpdatingLocation) {
          // Location update already in progress, skipping
          return;
        }

        this.isUpdatingLocation = true;
        this.lastLocationUpdate = now;

        // Use statically imported dataManager; only dynamically import currentUser store
        // currentUser statically imported

        if (!currentUser?.uid) {
          console.error(
            "[CampusLocationService] Cannot update location - no current user"
          );
          return;
        }

        // 🚀 PERFORMANCE FIX: Pass position data to avoid recursive getCurrentLocation calls
        const campusPresenceResult = await this.detectCampusPresence(
          "iub",
          position
        );
        let finalCampusStatus =
          campusPresenceResult?.onCampus !== undefined
            ? campusPresenceResult.onCampus
              ? "on_campus"
              : "off_campus"
            : "unknown";

        // 🎯 ARBITRATION: Do not downgrade from recent GPS on_campus to
        // network off_campus when the app is hidden or GPS is paused.
        const nowTs = Date.now();
        const isRecentAuthoritativeOnCampus =
          this.lastAuthoritativeCampusStatus === "on_campus" &&
          this.lastAuthoritativeSource === "gps" &&
          nowTs - this.lastAuthoritativeTimestamp < this.authoritativeHoldMs;

        if (
          isNetworkDetection &&
          finalCampusStatus === "off_campus" &&
          isRecentAuthoritativeOnCampus
        ) {
          logManager.location.info(
            "[CampusLocationService] 🛡️ Arbitration: Preventing downgrade to off_campus based on network; keeping recent GPS on_campus"
          );
          finalCampusStatus = "on_campus";
        }

        // SMART UPDATE: Writing to database (details omitted for console noise)

        // 🎯 CRITICAL FIX: Update user location status with proper coordinate handling
        const locationInfo = hasValidCoordinates
          ? {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
              source: source,
              tier: tier,
              batteryOptimized: batteryOptimized,
            }
          : {
              // For network detection, store null coordinates but include detection metadata
              latitude: null,
              longitude: null,
              accuracy: null,
              timestamp: position.timestamp,
              source: source,
              tier: tier,
              batteryOptimized: batteryOptimized,
              networkDetection: true,
              ipOrganization: position.userOrganization || "Unknown",
            };

        this._updateLocalPresenceCache(finalCampusStatus, {
          latitude: hasValidCoordinates ? position.coords.latitude : null,
          longitude: hasValidCoordinates ? position.coords.longitude : null,
          accuracy: hasValidCoordinates ? position.coords.accuracy : null,
          timestamp: position.timestamp,
          source,
          tier,
        });

        const updateResult = await dataManager.updateUserLocationStatus(
          currentUser.uid,
          finalCampusStatus,
          locationInfo
        );

        if (updateResult.success) {
          // Smart location update successful

          // Update cache with accurate data (only if we have coordinates)
          if (hasValidCoordinates) {
            this.setCachedLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
              campusStatus: finalCampusStatus,
              source: source,
              tier: tier,
              batteryOptimized: batteryOptimized,
            });

            // Record authoritative GPS-based status (used to protect against
            // later low-confidence network downgrades when tab is hidden)
            this.lastAuthoritativeCampusStatus = finalCampusStatus;
            this.lastAuthoritativeSource = "gps";
            this.lastAuthoritativeTimestamp = nowTs;
          }

          // 🟣 Trigger animation for database write
          const databaseWriteAnimationData = {
            coordinatesChanged: hasValidCoordinates
              ? this.hasLocationChanged(position, 10)
              : false,
            campusStatusChanged:
              (this.lastKnownCampusStatus || "unknown") !== finalCampusStatus,
            hasValidCoordinates: hasValidCoordinates,
            hasLastActiveUpdate: true, // Database write always updates lastActive
            previousStatus: this.lastKnownCampusStatus || "unknown",
            newStatus: finalCampusStatus,
            source: source,
            tier: tier,
            batteryOptimized: batteryOptimized,
            recursiveCallAvoided: true,
            coordinates: hasValidCoordinates
              ? {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                }
              : null,
          };

          this.triggerLocationAnimation(
            "database_write",
            databaseWriteAnimationData
          );

          // 🎯 CRITICAL: Update known campus status for presence dots
          this.lastKnownCampusStatus = finalCampusStatus;

          // Emit real-time campus presence change event for friends to see updates
          try {
            const { realTimeManager } = await import(
              "../realtime/RealtimeService.js"
            );
            realTimeManager.emitCampusPresenceChange(
              currentUser.uid,
              finalCampusStatus,
              hasValidCoordinates
                ? {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp,
                    source: source,
                    tier: tier,
                    batteryOptimized: batteryOptimized,
                  }
                : {
                    // For network detection, emit without coordinates
                    latitude: null,
                    longitude: null,
                    accuracy: null,
                    timestamp: position.timestamp,
                    source: source,
                    tier: tier,
                    batteryOptimized: batteryOptimized,
                    networkDetection: true,
                  }
            );
            // Campus presence change event emitted
          } catch (realtimeError) {
            console.warn(
              "[CampusLocationService] ⚠️ Failed to emit presence change event:",
              realtimeError
            );
          }
        } else {
          console.error(
            "[CampusLocationService] ❌ Failed to update location:",
            updateResult.error
          );
        }
      } catch (updateError) {
        console.error(
          "[CampusLocationService] Error in smart location update:",
          updateError
        );
      } finally {
        this.isUpdatingLocation = false;
      }
    }, debounceTime);
  }

  /**
   * 🎯 SMART ACTIVITY DETECTION: Determines if user activity warrants database writes
   */
  isSignificantUserActivity() {
    const now = Date.now();
    const activityThreshold = 5 * 60 * 1000; // 5 minutes of inactivity = passive browsing

    // No recent activity detected = passive browsing
    if (
      !this.lastActivityDetected ||
      now - this.lastActivityDetected > activityThreshold
    ) {
      return false;
    }

    // Check for meaningful interactions (not just passive scrolling)
    const recentActivityWindow = 2 * 60 * 1000; // 2 minutes
    const hasRecentActivity =
      now - this.lastActivityDetected < recentActivityWindow;

    return hasRecentActivity;
  }

  /**
   * 🎯 CACHED CAMPUS STATUS: Get campus status from cached location data
   */
  getCachedCampusStatus(position) {
    try {
      const cachedLocation = this.getCachedLocation();
      if (cachedLocation && cachedLocation.campusStatus) {
        // If position is close to cached position, use cached status
        const distance = this.calculateDistance(
          position.coords.latitude,
          position.coords.longitude,
          cachedLocation.latitude,
          cachedLocation.longitude
        );

        // Within 100 meters = same campus status
        if (distance < 100) {
          return cachedLocation.campusStatus;
        }
      }

      return null;
    } catch (error) {
      console.warn(
        "[CampusLocationService] Failed to get cached campus status:",
        error
      );
      return null;
    }
  }

  /**
   * 🎯 DISTANCE CALCULATION: Simple distance between two coordinates
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Automatically start location tracking if user has location sharing enabled
   * Called when user loads the website or profile is loaded
   * ENHANCED: Robust initialization with retry logic and health monitoring
   */
  /**
   * 🎯 PHASE 2 ENHANCEMENT: Detects the type of trigger that initiated location tracking
   * Helps optimize the immediate presence update strategy based on user context
   */
  detectTriggerScenario() {
    try {
      // Check for page reload indicators using modern Navigation API

      // Modern Navigation API (newer browsers)
      if (
        performance.getEntriesByType &&
        performance.getEntriesByType("navigation").length > 0
      ) {
        const navEntry = performance.getEntriesByType("navigation")[0];
        if (navEntry.type === "reload") {
          return "reload";
        }
        if (navEntry.type === "navigate") {
          return "navigate";
        }
        if (navEntry.type === "back_forward") {
          return "back_forward";
        }
      }

      // Check if this is likely a tab return (document was hidden and now visible)
      if (document.visibilityState === "visible" && this.wasDocumentHidden) {
        return "tab_return";
      }

      // Check for authentication state to detect login
      if (this.isRecentLogin()) {
        return "login";
      }

      // Check if this is an app restart after being idle
      if (this.wasAppIdle()) {
        return "app_restart";
      }

      return "initialization";
    } catch (error) {
      console.warn(
        "[CampusLocationService] Failed to detect trigger scenario:",
        error
      );
      return "initialization";
    }
  }

  /**
   * 🔍 Helper: Checks if this is a recent login scenario
   */
  isRecentLogin() {
    try {
      const authTime = localStorage.getItem("campusLocation_authTime");
      if (!authTime) return false;

      const timeSinceAuth = Date.now() - parseInt(authTime);
      // Consider it a recent login if auth happened within last 30 seconds
      return timeSinceAuth < 30000;
    } catch (error) {
      return false;
    }
  }

  /**
   * 🔍 Helper: Checks if app was idle and is now restarting
   */
  wasAppIdle() {
    try {
      const lastActive = localStorage.getItem("campusLocation_lastActive");
      if (!lastActive) return false;

      const timeSinceActive = Date.now() - parseInt(lastActive);
      // Consider app idle if last activity was more than 5 minutes ago
      return timeSinceActive > 300000;
    } catch (error) {
      return false;
    }
  }

  async autoStartLocationTracking() {
    // Polling-only initialization (3-tier)
    try {
      await this.startPresencePolling(20000);
      await this.runPresencePollNow();
      this.startActivityHeartbeat();
      this.isInitialized = true;
    } catch (error) {
      this.scheduleInitializationRetry(
        error?.message || "Polling auto-start failed"
      );
    }
  }

  /**
   * Schedule initialization retry with exponential backoff
   * @param {string} reason - Reason for retry
   */
  scheduleInitializationRetry(reason) {
    if (this.initializationAttempts >= this.maxInitializationAttempts) {
      console.error(
        `[CampusLocationService] ❌ Maximum initialization attempts (${this.maxInitializationAttempts}) reached. Giving up.`,
        {
          attempts: this.initializationAttempts,
          errors: this.initializationErrors,
          lastReason: reason,
        }
      );
      return;
    }

    this.initializationErrors.push({
      attempt: this.initializationAttempts,
      reason,
      timestamp: new Date().toISOString(),
    });

    // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, 8s, 16s)
    const retryDelay = Math.min(
      Math.pow(2, this.initializationAttempts) * 1000,
      30000
    ); // Max 30s

    console.log(
      `[CampusLocationService] ⏳ Scheduling initialization retry ${
        this.initializationAttempts + 1
      }/${this.maxInitializationAttempts} in ${retryDelay}ms. Reason: ${reason}`
    );

    if (this.initializationRetryTimeout) {
      clearTimeout(this.initializationRetryTimeout);
    }

    this.initializationRetryTimeout = setTimeout(() => {
      this.autoStartLocationTracking();
    }, retryDelay);
  }

  /**
   * Check if user has any friends with mutual location sharing enabled
   * @returns {Promise<boolean>} True if user has location-sharing friends
   */
  async checkForLocationSharingFriends() {
    try {
      // currentUser statically imported

      if (!currentUser?.uid) {
        return false;
      }

      // Get all friendships for current user
      const friendships = await dataManager.getUserFriendships(currentUser.uid);

      // Check if any friendship has mutual location sharing enabled
      for (const friendship of friendships) {
        const locationVisibility = friendship.locationVisibility;
        if (locationVisibility) {
          const userShares = locationVisibility[currentUser.uid];
          const friendShares =
            locationVisibility[
              friendship.user1Id === currentUser.uid
                ? friendship.user2Id
                : friendship.user1Id
            ];

          // If both users have enabled location sharing
          if (userShares && friendShares) {
            console.log(
              "[CampusLocationService] Found mutual location sharing with friend:",
              friendship.user1Id === currentUser.uid
                ? friendship.user2Id
                : friendship.user1Id
            );
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error(
        "[CampusLocationService] Error checking for location sharing friends:",
        error
      );
      return false;
    }
  }

  /**
   * Initialize activity detection using Page Visibility API and passive event listeners
   * Called from constructor to set up battery-efficient activity monitoring
   */
  initializeActivityDetection() {
    logManager.dev.debug(
      "[CampusLocationService] Initializing ADAPTIVE activity detection..."
    );

    // 🛠️ FIX: Mark page load/initialization as user activity
    this.isUserCurrentlyActive = true;
    this.lastActivityDetected = Date.now();
    console.log(
      "[CampusLocationService] 🚀 Page load detected - marked as initial user activity"
    );

    // 🚀 ADAPTIVE: Switch to active state on page load
    this.switchToActiveState();

    // 🚀 ADAPTIVE: Page Visibility API - smart state switching
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // User returned to tab - immediate activity update + switch to active
        this.isUserCurrentlyActive = true;
        this.lastActivityDetected = Date.now();
        this.switchToActiveState();
        console.log(
          "[CampusLocationService] 👁️ User returned to tab - ACTIVE state activated"
        );
      } else {
        // Tab hidden - switch to background (stops heartbeat entirely)
        this.switchToBackgroundState();
        console.log(
          "[CampusLocationService] 👁️ Tab hidden - BACKGROUND state activated"
        );
      }
    });

    // 🚀 ADAPTIVE: Activity events trigger active state
    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];
    const adaptiveActivityHandler = this.throttle(() => {
      this.isUserCurrentlyActive = true;
      this.lastActivityDetected = Date.now();

      // 🚀 ADAPTIVE: Switch to active state on user interaction
      this.switchToActiveState();
    }, 2000); // Reduced throttle to 2 seconds for better responsiveness

    activityEvents.forEach((event) => {
      document.addEventListener(event, adaptiveActivityHandler, {
        passive: true,
        capture: false,
      });
    });

    console.log(
      "[CampusLocationService] ✅ ADAPTIVE activity detection initialized with smart state switching"
    );
  }

  /**
   * Start activity heartbeat system (30-second intervals)
   * Separate from location tracking for better battery efficiency
   */
  /**
   * 🚀 ADAPTIVE ACTIVITY HEARTBEAT - Smart cost optimization for 3000+ users
   * Dynamically adjusts update frequency based on user activity state:
   * - Active: 15s intervals (clicking/scrolling)
   * - Idle: 60s intervals (tab visible, no activity)
   * - Background: Stopped entirely (tab hidden)
   */
  startActivityHeartbeat() {
    if (this.activityHeartbeatInterval) {
      logManager.dev.debug(
        "[CampusLocationService] Activity heartbeat already running"
      );
      return;
    }

    // Start adaptive activity heartbeat

    this.activityHeartbeatInterval = setInterval(async () => {
      // ✅ HARD GUARD: Stop heartbeat entirely if global location sharing is disabled
      try {
        const sharingEnabled =
          currentUser?.profile?.systemInfo?.locationSharingEnabled === true;
        if (!sharingEnabled) {
          // If disabled mid-session, stop further intervals & prevent writes
          this.stopActivityHeartbeat();
          return;
        }
      } catch (_) {
        // best-effort guard
      }

      if (this.isUserCurrentlyActive) {
        try {
          if (this.isUpdatingActivity) {
            // Skip logging to reduce console spam - only log if debugging
            if (window.location.hostname === "localhost") {
              console.log(
                "[CampusLocationService] ⚠️ Activity update in progress, skipping this heartbeat"
              );
            }
            return;
          }

          this.isUpdatingActivity = true;
          // currentUser statically imported

          if (currentUser?.uid) {
            // ⏱️ THROTTLE: Only write if minimum interval passed OR we haven't written yet this state
            const now = Date.now();
            const elapsed = now - this.lastLastActiveWrite;
            if (elapsed >= this.minLastActiveWriteInterval) {
              const writeResult = await dataManager.updateUserLastActive(
                currentUser.uid
              );
              if (writeResult?.success) {
                this.lastLastActiveWrite = now;
              }
            } else {
              // Skip write silently (optimization)
            }

            // Emit activity change event for real-time updates
            try {
              const { realTimeManager } = await import(
                "../realtime/RealtimeService.js"
              );
              realTimeManager.emitUserActivityChange(currentUser.uid, true);
            } catch (realtimeError) {
              console.warn(
                "[CampusLocationService] ⚠️ Failed to emit activity change:",
                realtimeError
              );
            }
          }

          // 🔄 ADAPTIVE LOGIC: Switch to idle state after successful activity update
          if (this.activityState === "active") {
            this.switchToIdleState();
          }
        } catch (error) {
          console.error(
            "[CampusLocationService] Error in adaptive activity heartbeat:",
            error
          );
        } finally {
          this.isUpdatingActivity = false;
        }
      }
    }, this.currentHeartbeatInterval); // 🚀 ADAPTIVE: Uses current adaptive interval

    logManager.dev.debug(
      `[CampusLocationService] ✅ Adaptive activity heartbeat started (${this.activityState} mode)`
    );
  }

  /**
   * Stop activity heartbeat system
   */
  stopActivityHeartbeat() {
    if (this.activityHeartbeatInterval) {
      clearInterval(this.activityHeartbeatInterval);
      this.activityHeartbeatInterval = null;
      logManager.dev.debug(
        "[CampusLocationService] Activity heartbeat stopped"
      );
    }
  }

  /**
   * 🚀 ADAPTIVE STATE MANAGEMENT - Smart cost optimization
   * Switch to ACTIVE state: 15-second intervals for responsive presence updates
   */
  switchToActiveState() {
    if (this.activityState === "active") return; // Already active

    this.activityState = "active";
    this.currentHeartbeatInterval = this.activeHeartbeatInterval;
    this.lastStateChange = Date.now();

    // Switching to ACTIVE state

    this.restartHeartbeatWithNewInterval();
  }

  /**
   * 🚀 ADAPTIVE STATE MANAGEMENT - Smart cost optimization
   * Switch to IDLE state: 60-second intervals for battery efficiency
   */
  switchToIdleState() {
    if (this.activityState === "idle") return; // Already idle

    this.activityState = "idle";
    this.currentHeartbeatInterval = this.idleHeartbeatInterval;
    this.lastStateChange = Date.now();

    // Switching to IDLE state

    this.restartHeartbeatWithNewInterval();
  }

  /**
   * 🚀 ADAPTIVE STATE MANAGEMENT - Smart cost optimization
   * Switch to BACKGROUND state: Stop heartbeat entirely to minimize costs
   */
  switchToBackgroundState() {
    if (this.activityState === "background") return; // Already background

    this.activityState = "background";
    this.lastStateChange = Date.now();

    // Switching to BACKGROUND state (heartbeat stopped)

    this.stopActivityHeartbeat();
  }

  /**
   * 🚀 ADAPTIVE HELPER - Restart heartbeat with new interval
   * Used when switching between active/idle states
   */
  restartHeartbeatWithNewInterval() {
    this.stopActivityHeartbeat();

    // Small delay to ensure clean restart
    setTimeout(() => {
      this.startActivityHeartbeat();
    }, 100);
  }

  /**
   * Utility function to throttle activity detection
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /**
   * Get current user activity status
   * @returns {Object} Activity status information
   */
  getActivityStatus() {
    return {
      isCurrentlyActive: this.isUserCurrentlyActive,
      lastActivityDetected: this.lastActivityDetected,
      heartbeatRunning: this.activityHeartbeatInterval !== null,
      timeSinceLastActivity: this.lastActivityDetected
        ? Date.now() - this.lastActivityDetected
        : null,
    };
  }

  /**
   * Check if location tracking is currently active
   * @returns {boolean} True if tracking is active
   */
  isTrackingActive() {
    return (
      this.presencePollingIntervalId !== null &&
      this.presencePollingIntervalId !== undefined
    );
  }

  /**
   * Start health monitoring system to detect and recover from tracking failures
   * Runs periodic checks to ensure location tracking is working properly
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      console.log(
        "[CampusLocationService] 💊 Health monitoring already running"
      );
      return;
    }

    console.log(
      "[CampusLocationService] 💊 Starting enhanced health monitoring system..."
    );

    // Perform health check every 10 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 10 * 60 * 1000);

    // Perform initial health check
    setTimeout(() => this.performHealthCheck(), 5000);

    // 🚀 ENTERPRISE FIX: Start GPS health monitoring for mobile reliability
    this.setupGPSHealthMonitoring();

    console.log(
      "[CampusLocationService] ✅ Enhanced health monitoring started (10-minute intervals)"
    );
  }

  /**
   * Stop health monitoring system
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logManager.dev.debug(
        "[CampusLocationService] 💊 Health monitoring stopped"
      );
    }
  }

  /**
   * Perform comprehensive health check of location tracking system
   * Detects issues and attempts automatic recovery
   */
  async performHealthCheck() {
    const now = Date.now();
    logManager.dev.debug(
      "[CampusLocationService] 🏥 Performing health check..."
    );

    const healthStatus = {
      timestamp: new Date().toISOString(),
      presencePollingActive: this.presencePollingIntervalId !== null,
      activityHeartbeatActive: this.activityHeartbeatInterval !== null,
      lastLocationUpdate: this.lastLocationUpdate,
      timeSinceLastUpdate: this.lastLocationUpdate
        ? now - this.lastLocationUpdate
        : null,
      isUpdatingLocation: this.isUpdatingLocation,
      locationPermission: this.permissionStatus,
      issues: [],
      actions: [],
    };

    // Check if location updates are stale (no updates in 15 minutes)
    if (
      healthStatus.timeSinceLastUpdate &&
      healthStatus.timeSinceLastUpdate > 15 * 60 * 1000
    ) {
      healthStatus.issues.push("Location updates are stale (>15 minutes)");

      // Attempt to restart location tracking
      if (!this.isUpdatingLocation) {
        console.log(
          "[CampusLocationService] 🔄 Attempting to restart stale location tracking..."
        );
        healthStatus.actions.push("Restarting location tracking");

        try {
          // Stop current tracking
          this.stopLocationTracking();

          // Wait a moment then restart
          setTimeout(async () => {
            await this.startLocationTracking();

            // Ensure presence polling is running
            if (!this.presencePollingIntervalId) {
              await this.startPresencePolling(20000);
            }
          }, 2000);
        } catch (restartError) {
          console.error(
            "[CampusLocationService] ❌ Failed to restart location tracking:",
            restartError
          );
          healthStatus.issues.push(`Restart failed: ${restartError.message}`);
        }
      }
    }

    // Ensure polling is running
    if (!healthStatus.presencePollingActive) {
      console.log(
        "[CampusLocationService] 🆘 Presence polling not active - starting..."
      );
      healthStatus.actions.push("Starting presence polling");
      await this.startPresencePolling(20000);
    }

    // Check if neither tracking method is active
    if (!healthStatus.presencePollingActive) {
      healthStatus.issues.push("No location tracking methods active");

      // Try to start polling
      console.log(
        "[CampusLocationService] 🚨 No tracking active - starting presence polling..."
      );
      healthStatus.actions.push("Start presence polling");

      try {
        await this.startPresencePolling(20000);
        await this.runPresencePollNow();
      } catch (fullRestartError) {
        console.error(
          "[CampusLocationService] ❌ Full restart failed:",
          fullRestartError
        );
        healthStatus.issues.push(
          `Full restart failed: ${fullRestartError.message}`
        );
      }
    }

    this.lastHealthCheck = now;

    // Log health status
    if (healthStatus.issues.length === 0) {
      console.log(
        "[CampusLocationService] ✅ Health check passed - all systems operational"
      );
    } else {
      console.warn("[CampusLocationService] ⚠️ Health check found issues:", {
        issues: healthStatus.issues,
        actions: healthStatus.actions,
        status: healthStatus,
      });
    }

    return healthStatus;
  }

  /**
   * Get comprehensive status of location tracking system
   * Useful for debugging and monitoring
   * @returns {Object} Complete status information
   */
  getLocationTrackingStatus() {
    return {
      isInitialized: this.isInitialized,
      isLocationSupported: this.isLocationSupported,
      permissionStatus: this.permissionStatus,
      tracking: {
        presencePollingActive: this.presencePollingIntervalId !== null,
        activityHeartbeatActive: this.activityHeartbeatInterval !== null,
        isUpdatingLocation: this.isUpdatingLocation,
        lastLocationUpdate: this.lastLocationUpdate,
        timeSinceLastUpdate: this.lastLocationUpdate
          ? Date.now() - this.lastLocationUpdate
          : null,
      },
      initialization: {
        attempts: this.initializationAttempts,
        maxAttempts: this.maxInitializationAttempts,
        errors: this.initializationErrors,
        retryScheduled: this.initializationRetryTimeout !== null,
      },
      health: {
        lastHealthCheck: this.lastHealthCheck,
        healthMonitoringActive: this.healthCheckInterval !== null,
      },
      activity: this.getActivityStatus(),
    };
  }

  /**
   * 🚀 ENTERPRISE FIX: Core location and presence update method
   * Processes location changes and publishes campus status updates
   * @param {boolean} highAccuracy - Whether to use high accuracy GPS
   */
  /**
   * 🚀 ENTERPRISE FIX: Validate coordinates to prevent null database writes
   */
  isValidCoordinates(position) {
    if (!position || !position.coords) {
      logManager.location.warn(
        "[CampusLocationService] ❌ Invalid position object"
      );
      return false;
    }

    const { latitude, longitude, accuracy } = position.coords;

    // Check for null/undefined coordinates
    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined
    ) {
      console.warn(
        "[CampusLocationService] ❌ Null or undefined coordinates detected"
      );
      return false;
    }

    // Check for valid coordinate ranges
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      console.warn(
        "[CampusLocationService] ❌ Coordinates out of valid range:",
        {
          latitude,
          longitude,
        }
      );
      return false;
    }

    // Check for obviously invalid coordinates (0, 0) which often indicates GPS failure
    if (latitude === 0 && longitude === 0) {
      console.warn(
        "[CampusLocationService] ❌ Suspicious coordinates (0, 0) detected"
      );
      return false;
    }

    // Coordinates validated successfully

    return true;
  }

  /**
   * 🚀 ENTERPRISE FIX: Check if location has meaningfully changed using Haversine distance
   */
  hasLocationChanged(newPosition, thresholdMeters = 10) {
    // Always return true if no previous location cached
    if (!this.lastSignificantLocation) {
      // No previous location - treating as changed
      return true;
    }

    const distance = this.calculateDistance(
      this.lastSignificantLocation.latitude,
      this.lastSignificantLocation.longitude,
      newPosition.coords.latitude,
      newPosition.coords.longitude
    );

    const hasChanged = distance >= thresholdMeters;

    console.log("[CampusLocationService] 📏 Location change analysis:", {
      previousLat: this.lastSignificantLocation.latitude,
      previousLng: this.lastSignificantLocation.longitude,
      newLat: newPosition.coords.latitude,
      newLng: newPosition.coords.longitude,
      distance: distance.toFixed(2) + "m",
      threshold: thresholdMeters + "m",
      hasChanged,
    });

    return hasChanged;
  }

  /**
   * 🚀 ENTERPRISE FIX: Determine if location update is worthy of database write and animation
   */
  isLocationUpdateWorthy(position, campusStatusChanged, context = "normal") {
    // 1. Must have valid coordinates
    if (!this.isValidCoordinates(position)) {
      console.warn(
        "[CampusLocationService] 🚫 Location update not worthy - invalid coordinates"
      );
      return { worthy: false, reason: "invalid_coordinates" };
    }

    // 2. Must have reasonable accuracy for campus detection
    const accuracy = position.coords.accuracy;

    // 🔧 FIX: More lenient accuracy requirements for initial/reload scenarios
    let maxAccuracy = 2000; // Default threshold
    if (
      context === "initial" ||
      context === "reload" ||
      context === "first_load"
    ) {
      maxAccuracy = 5000; // Allow up to 5km accuracy for immediate presence indication
      console.log(
        "[CampusLocationService] 🎯 Using relaxed accuracy threshold for " +
          context +
          " scenario: " +
          maxAccuracy +
          "m"
      );
    }

    if (accuracy > maxAccuracy) {
      console.warn(
        "[CampusLocationService] 🚫 Location update not worthy - poor accuracy:",
        accuracy + "m (max: " + maxAccuracy + "m for " + context + ")"
      );
      return { worthy: false, reason: "poor_accuracy", accuracy, context };
    }

    // 3. Either campus status must have changed OR coordinates must have changed meaningfully
    const coordinatesChanged = this.hasLocationChanged(position, 10); // 10-meter threshold

    if (campusStatusChanged || coordinatesChanged) {
      console.log("[CampusLocationService] ✅ Location update worthy:", {
        campusStatusChanged,
        coordinatesChanged,
        accuracy: accuracy + "m",
      });

      // Cache this as the new significant location
      this.lastSignificantLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: accuracy,
        timestamp: position.timestamp || Date.now(),
      };

      return {
        worthy: true,
        reason: "meaningful_change",
        coordinatesChanged,
        campusStatusChanged,
      };
    }

    console.log(
      "[CampusLocationService] 🚫 Location update not worthy - no meaningful change"
    );
    return { worthy: false, reason: "no_meaningful_change" };
  }

  async updateLocationAndPresence(highAccuracy = false) {
    try {
      console.log(
        `[CampusLocationService] 🌍 Updating location and presence (high accuracy: ${highAccuracy})...`
      );

      // Get current location
      const trigger = highAccuracy ? "high_accuracy_request" : "manual_update";
      this.lastUpdateTrigger = trigger; // Store trigger for accuracy context
      const position = await this.getCurrentLocation(highAccuracy, trigger);
      if (!position) {
        console.warn(
          "[CampusLocationService] 📍 No position available for presence update"
        );
        return;
      }

      // 🚀 ENTERPRISE FIX: Validate coordinates before processing
      if (!this.isValidCoordinates(position)) {
        console.error(
          "[CampusLocationService] ❌ Skipping location update - invalid coordinates"
        );
        return;
      }

      // 🚀 PERFORMANCE FIX: Pass position data to avoid recursive getCurrentLocation calls
      const campusPresenceResult = await this.detectCampusPresence(
        "iub",
        position
      );
      const newCampusStatus =
        campusPresenceResult?.onCampus !== undefined
          ? campusPresenceResult.onCampus
            ? "on_campus"
            : "off_campus"
          : "unknown";

      // Track status changes for meaningful updates only
      const previousStatus = this.lastKnownCampusStatus || "unknown";
      const statusChanged = previousStatus !== newCampusStatus;

      console.log(`[CampusLocationService] 🌍 Campus presence update:`, {
        previous: previousStatus,
        current: newCampusStatus,
        changed: statusChanged,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy + "m",
        recursiveCallAvoided: true, // Track optimization
      });

      // Update cached status
      this.lastKnownCampusStatus = newCampusStatus;

      // Update cached location with new status
      this.setCachedLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        campusStatus: newCampusStatus,
      });

      this._updateLocalPresenceCache(newCampusStatus, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        source: "gps",
        tier: 2,
      });

      // 🚀 ENTERPRISE FIX: Only update database and trigger animations for worthy location changes
      // Determine context based on trigger information
      let context = "normal";
      if (this.isFirstLocationUpdate) {
        context = "initial";
        this.isFirstLocationUpdate = false;
      } else if (
        this.lastUpdateTrigger === "reload" ||
        this.lastUpdateTrigger === "first_visit"
      ) {
        context = "reload";
      }

      const updateWorthiness = this.isLocationUpdateWorthy(
        position,
        statusChanged,
        context
      );

      if (updateWorthiness.worthy) {
        console.log(
          `[CampusLocationService] 🔄 Meaningful location change detected: ${updateWorthiness.reason}`
        );

        // Publish real-time campus presence change
        await this.publishCampusStatusChange(
          newCampusStatus,
          previousStatus,
          position
        );

        // Update user profile in database
        await this.updateUserLocationInDatabase(position, newCampusStatus);

        // Notify HorizontalFriendsBar about meaningful status change with coordinate info
        if (
          typeof window !== "undefined" &&
          window.HorizontalFriendsBar?.getInstance
        ) {
          const friendsBar = window.HorizontalFriendsBar.getInstance();
          if (friendsBar && friendsBar.notifyLocationUpdated) {
            friendsBar.notifyLocationUpdated({
              previousStatus,
              newStatus: newCampusStatus,
              coordinatesChanged: updateWorthiness.coordinatesChanged,
              campusStatusChanged: updateWorthiness.campusStatusChanged,
              hasValidCoordinates: true,
              hasLastActiveUpdate: true, // We're updating lastActive in database
              recursiveCallAvoided: true, // Track performance optimization
            });
          }
        }
      } else {
        console.log(
          `[CampusLocationService] ✓ Location update skipped - ${updateWorthiness.reason}`
        );
      }
    } catch (error) {
      console.error(
        "[CampusLocationService] ❌ Failed to update location and presence:",
        error
      );
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: Publish campus status changes to real-time system
   */
  async publishCampusStatusChange(newStatus, previousStatus, position) {
    try {
      // Check if realTimeManager is available
      if (typeof realTimeManager !== "undefined" && realTimeManager.publish) {
        const statusChangeEvent = {
          userId: currentUser?.user?.uid,
          campusStatus: newStatus,
          previousStatus,
          locationData: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          },
          timestamp: Date.now(),
        };

        console.log(
          `[CampusLocationService] 📡 Publishing campus presence change:`,
          statusChangeEvent
        );

        // Publish to real-time system
        realTimeManager.publish("campusPresenceChanged", statusChangeEvent);
      }
    } catch (error) {
      console.error(
        "[CampusLocationService] ❌ Failed to publish campus status change:",
        error
      );
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: Update user location in database
   */
  async updateUserLocationInDatabase(position, campusStatus) {
    try {
      // Check if DataService is available
      if (
        typeof dataManager !== "undefined" &&
        dataManager.updateUserSystemInfo
      ) {
        const locationData = {
          lastKnownLocation: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            campusStatus,
            timestamp: serverTimestamp ? serverTimestamp() : new Date(),
          },
          lastActive: serverTimestamp ? serverTimestamp() : new Date(),
          status: "online",
        };

        console.log(
          `[CampusLocationService] 💾 Updating user location in database:`,
          {
            campusStatus,
            accuracy: position.coords.accuracy + "m",
          }
        );

        await dataManager.updateUserSystemInfo(
          currentUser?.user?.uid,
          locationData
        );
      }
    } catch (error) {
      console.error(
        "[CampusLocationService] ❌ Failed to update user location in database:",
        error
      );
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: GPS Reset System for Mobile Reliability
   * Handles GPS degradation by restarting location tracking with fresh settings
   */
  scheduleGPSReset() {
    // Prevent multiple resets
    if (this.isGPSResetInProgress) {
      console.log(
        "[CampusLocationService] 🛑 GPS reset already in progress - skipping"
      );
      return;
    }

    console.log(
      "[CampusLocationService] 🔄 Scheduling GPS reset for mobile reliability..."
    );

    this.isGPSResetInProgress = true;

    // Schedule reset with short delay to let current operations complete
    setTimeout(() => {
      this.performGPSReset();
    }, 2000);
  }

  /**
   * 🚀 ENTERPRISE FIX: Perform GPS system reset
   * Stops current tracking and restarts with fresh GPS connection
   */
  async performGPSReset() {
    try {
      logManager.dev.debug(
        "[CampusLocationService] 🔄 Performing GPS reset..."
      );

      // Stop current tracking
      if (this.trackingWatchId) {
        clearInterval(this.trackingWatchId); // 🔋 BATTERY FIX: Clear interval instead of GPS watch
        this.trackingWatchId = null;
        logManager.dev.debug(
          "[CampusLocationService] 🔄 Stopped existing smart interval tracking"
        );
      }

      // Clear GPS-related state
      this.currentPosition = null;
      this.poorGPSReadings = 0;
      this.lastSuccessfulGPSUpdate = null;

      // Wait for GPS to stabilize
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Restart location tracking with fresh GPS connection
      console.log(
        "[CampusLocationService] 🔄 Restarting location tracking after GPS reset..."
      );
      await this.startLocationTracking();

      // Perform immediate location update to verify reset worked
      setTimeout(() => {
        this.updateLocationAndPresence(true); // High accuracy for verification
      }, 1000);

      console.log(
        "[CampusLocationService] ✅ GPS reset completed successfully"
      );
    } catch (error) {
      logManager.location.fail(
        "[CampusLocationService] ❌ GPS reset failed:",
        error
      );
    } finally {
      this.isGPSResetInProgress = false;
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: Setup periodic GPS health monitoring
   * Monitors GPS performance and triggers resets when needed
   */
  setupGPSHealthMonitoring() {
    // Don't setup multiple monitors
    if (this.gpsHealthMonitorInterval) {
      return;
    }

    console.log(
      "[CampusLocationService] 🏥 Starting GPS health monitoring system..."
    );

    // Check GPS health every 10 minutes
    this.gpsHealthMonitorInterval = setInterval(() => {
      this.checkGPSHealth();
    }, 10 * 60 * 1000);

    // GPS health monitoring started (10-minute intervals)
  }

  /**
   * 🚀 ENTERPRISE FIX: Check GPS health and trigger reset if needed
   */
  checkGPSHealth() {
    const now = Date.now();
    const timeSinceLastUpdate = this.lastSuccessfulGPSUpdate
      ? now - this.lastSuccessfulGPSUpdate
      : null;

    // If no GPS updates for 15 minutes, trigger reset
    if (timeSinceLastUpdate && timeSinceLastUpdate > 15 * 60 * 1000) {
      console.warn(
        "[CampusLocationService] 🏥 GPS health check failed - no updates for 15+ minutes"
      );
      // Trigger GPS reset due to health check failure
      this.scheduleGPSReset();
      return;
    }

    // Log health status
    // GPS health check passed
  }

  // 💰 COST OPTIMIZATION METHODS

  /**
   * Handle initialization with appropriate trigger detection and fresh data priority
   * 🚀 PERFORMANCE: Now supports non-blocking with fresh data guarantee for presence dots
   */
  async handleInitialization() {
    try {
      // Detect if this is a first visit or reload
      const isFirstVisit = !localStorage.getItem(
        "campusLocationService_visited"
      );
      const isReload =
        sessionStorage.getItem("campusLocationService_reload") === "true";
      const requiresFreshData =
        sessionStorage.getItem("campusPresence_forceFreshData") === "true";

      let trigger = "unknown";
      let priorityMode = "standard";

      if (isFirstVisit) {
        trigger = "first_visit";
        priorityMode = "fresh_data_priority";
        localStorage.setItem("campusLocationService_visited", "true");
        // First visit: fresh data priority mode
      } else if (isReload) {
        trigger = "manual_reload";
        priorityMode = "fresh_data_priority";
        logManager.dev.debug(
          "🎯 Manual reload detected - Fresh data priority mode"
        );
      } else if (requiresFreshData) {
        trigger = "fresh_data_request";
        priorityMode = "fresh_data_priority";
        logManager.dev.debug(
          "🎯 Fresh data required - Priority mode activated"
        );
      } else {
        trigger = "app_init";
        priorityMode = "standard";
        // Normal app initialization
      }

      // Clear reload flag
      sessionStorage.removeItem("campusLocationService_reload");

      // Set priority mode for fresh data requests
      this.priorityMode = priorityMode;

      // For fresh data priority, invalidate cache and emit loading event for presence dots
      if (priorityMode === "fresh_data_priority") {
        this.invalidateLocationCache();
        this.emitPresenceDataLoading();
      }

      // Respect user preference: only request location if signed-in and sharing enabled
      // currentUser statically imported
      const uid = currentUser?.uid;
      const enabled =
        currentUser?.profile?.systemInfo?.locationSharingEnabled === true;
      if (!uid || !enabled) {
        console.log(
          "[CampusLocationService] 🔒 Skipping initial location fetch (no user or sharing disabled)"
        );
        this.emitPresenceDataReady(false /* freshDataLoaded */);
        return;
      }

      // Request initial location with appropriate trigger
      const position = await this.getCurrentLocation(false, trigger);

      if (position) {
        // Initial location acquired

        // 🚀 PERFORMANCE FIX: Pass position data to avoid recursive getCurrentLocation calls
        const presenceResult = await this.detectCampusPresence("iub", position);

        // Initialization presence detection completed

        // For fresh data priority, emit fresh data ready event
        if (priorityMode === "fresh_data_priority") {
          this.emitFreshPresenceData(position, presenceResult);
        }
      } else {
        logManager.location.warn("⚠️ Failed to acquire initial location");

        // Still emit events for UI state management
        if (priorityMode === "fresh_data_priority") {
          this.emitPresenceDataError("Location acquisition failed");
        }
      }
    } catch (error) {
      logManager.location.fail("❌ Failed to handle initialization:", error);

      // Emit error event for fresh data priority mode
      if (this.priorityMode === "fresh_data_priority") {
        this.emitPresenceDataError(error.message);
      }
    }
  }

  /**
   * Mark that a manual reload occurred
   */
  static markManualReload() {
    sessionStorage.setItem("campusLocationService_reload", "true");
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Emit loading event for presence dots
   */
  emitPresenceDataLoading() {
    // Emitting presence data loading event
    // New event for modern components
    document.dispatchEvent(
      new CustomEvent("campus-presence:loading", {
        detail: {
          source: "CampusLocationService",
          timestamp: Date.now(),
          priority: "fresh_data",
        },
      })
    );
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Emit fresh presence data ready event
   */
  emitFreshPresenceData(position, presenceResult) {
    console.log(
      "📡 [CampusLocationService] Emitting fresh presence data ready event"
    );
    // New event for modern components
    document.dispatchEvent(
      new CustomEvent("campus-presence:ready", {
        detail: {
          freshDataLoaded: true,
          source: "CampusLocationService",
          timestamp: Date.now(),
        },
      })
    );
  }

  /**
   * Emit readiness when skipping location (disabled/user not signed-in)
   */
  emitPresenceDataReady(freshDataLoaded = false) {
    document.dispatchEvent(
      new CustomEvent("campus-presence:ready", {
        detail: {
          freshDataLoaded,
          source: "CampusLocationService",
          timestamp: Date.now(),
        },
      })
    );
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Emit presence data error event
   */
  emitPresenceDataError(errorMessage) {
    // Treat transient location acquisition issues as warnings (e.g., no GPS)
    if (logManager?.location) {
      logManager.location.warn("📡 Presence data warning:", errorMessage);
    } else {
      console.warn(
        "📡 [CampusLocationService] Presence data warning:",
        errorMessage
      );
    }
    // New event for modern components
    document.dispatchEvent(
      new CustomEvent("campus-presence:error", {
        detail: {
          source: "CampusLocationService",
          timestamp: Date.now(),
          error: errorMessage,
        },
      })
    );
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Invalidate cached location data for fresh data requests
   * Forces fresh location API calls by clearing existing cache
   */
  invalidateLocationCache() {
    // Invalidate cache for fresh data request

    // Clear browser location cache by setting maximumAge to 0
    this.freshLocationOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0, // Force fresh location
    };

    // Clear any internal service cache
    if (this.lastLocationCache) {
      this.lastLocationCache = null;
    }

    //

    logManager.dev.debug("✅ Location cache invalidated successfully");
  }

  //

  /**
   * Get fallback location from cache
   */
  getFallbackLocation() {
    // Try cached location first
    const cached = this.locationCache.get("last_good");
    if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
      // 1 hour
      return cached.data;
    }

    return null;
  }

  /**
   * Format location response consistently
   */
  formatLocationResponse(location, tier, cost) {
    // Cache good locations
    if (location.coords.accuracy <= 2000) {
      this.locationCache.set("last_good", {
        data: location,
        timestamp: Date.now(),
      });
    }

    // Store current position for the service
    this.currentPosition = {
      coords: location.coords,
      timestamp: location.timestamp,
    };

    return {
      coords: location.coords,
      timestamp: location.timestamp,
      source: location.source,
      provider: location.provider || location.source,
    };
  }
}

// Export singleton instance
export const campusLocationService = new CampusLocationService();

// 🛠️ DEBUGGING: Make campusLocationService globally available for console access and cost monitoring
if (typeof window !== "undefined") {
  window.campusLocationService = campusLocationService;
}
