import { dataManager } from "../services/data/DataService.js";
import { logManager } from "../utils/debug/LogManager.js";
import { unreadTracker } from "../services/groups/UnreadTracker.js";
import { currentUser } from "../store/userStore.js";
import { groupsCache } from "../services/groups/GroupsCache.js";
import { notificationManager } from "../services/realtime/NotificationService.js";

function isNonProductionEnvironment() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      if (import.meta.env.DEV) return true;
      const mode = (import.meta.env.MODE || "").toLowerCase();
      if (mode && mode !== "production") return true;
    }
  } catch (_) {
    /* noop */
  }
  try {
    if (typeof window !== "undefined" && window.ENV) {
      const env = String(window.ENV.ENVIRONMENT || "").toLowerCase();
      if (env && env !== "production") return true;
      if (window.ENV.ENABLE_DEV_SPACES === true) return true;
    }
  } catch (_) {
    /* noop */
  }
  return false;
}

function shouldShowDevSpaceTools() {
  return isNonProductionEnvironment();
}

export class GroupsPage {
  constructor() {
    this.container = null;
    this.unsubscribe = null;
    this.showDevTools = shouldShowDevSpaceTools();
    this.isRefreshing = false;
    this.groupsListener = null; // realtime groups list listener (unsubscribe)
    this.groupsRoot = null; // Cached #groups-root element
    this.pullState = {
      startY: 0,
      active: false,
      distance: 0,
      threshold: 70,
      indicator: null,
      handlers: null,
    };
  }

  async mount(rootEl) {
    this.container = rootEl;

    // Wait for profile data to load before gating (prevents false negatives on fresh page loads)
    try {
      await currentUser.waitForProfile();
    } catch (e) {
      console.error("[GroupsPage] Failed to load profile", e);
    }

    // PRD Requirement: Gate Groups until profile setup is complete
    if (!currentUser.isProfileComplete()) {
      this.container.innerHTML = `
        <section class="groups-page">
          <div class="profile-gate-message">
            <div class="gate-icon">
              <i class="fas fa-user-circle"></i>
            </div>
            <h2>Complete Your Profile First</h2>
            <p>You need to complete your profile setup before accessing groups.</p>
            <button id="completeProfileBtn" class="btn primary">Complete Profile</button>
          </div>
        </section>
      `;
      const btn = this.container.querySelector("#completeProfileBtn");
      if (btn) {
        btn.addEventListener("click", async () => {
          try {
            const { navigateTo } = await import("../app.js");
            window.location.hash = "#profile";
            navigateTo("profile");
          } catch (_) {
            window.location.hash = "#profile";
          }
        });
      }
      return;
    }

    // Cache groups root
    this.groupsRoot =
      document.querySelector("#groups-root") || this.container;

    // Render class spaces list
    await this.renderClassesTab(this.groupsRoot);
  }

  async renderClassesTab(targetEl) {
    // Only show the Trigger Scheduler button when running on localhost (emulator)
    const isLocal =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");
    const triggerBtnHtml = isLocal
      ? '<button id="btnTriggerScheduler" class="btn primary">🚀 Trigger Scheduler Now</button>'
      : "";

    const devTools = this.showDevTools
      ? `
        <div class="dev-tools" id="devTools">
          <button id="btnCreateDevSpaces" class="btn">Create Test Spaces</button>
          <button id="btnClearDevSpaces" class="btn danger">Clear My Test Spaces</button>
          ${triggerBtnHtml}
        </div>`
      : "";
    targetEl.innerHTML = `
      <section class="groups-page">
        ${devTools}
        <p class="tab-description">Spaces are created daily at 06:00 based on matching schedules.</p>
        <div id="groups-list" class="groups-list"></div>
        <div id="groups-empty" class="groups-empty hidden">No class spaces yet. They are created daily at 06:00.</div>
      </section>
    `;
    if (this.showDevTools) {
      this.bindDevTools();
    }

    // Hybrid: cache-first render, then attach realtime listener for fast badges
    await this.loadGroupsHybrid();
    this.setupPullToRefresh();
  }

  // Cache-first, then realtime listener while viewing the page
  async loadGroupsHybrid() {
    const targetEl = this.groupsRoot || this.container;
    const listEl = targetEl.querySelector("#groups-list");
    const emptyEl = targetEl.querySelector("#groups-empty");

    const userId = currentUser?.uid;
    if (!userId) return;

    // 1) Try cache for instant paint
    const cached = groupsCache.get(userId, false); // do not soft-refresh
    if (cached && Array.isArray(cached)) {
      console.log("[GroupsPage] Loaded groups from cache (hybrid)");
      this.renderGroups(cached, listEl, emptyEl);
    } else {
      listEl.innerHTML = '<div class="loading">Loading groups...</div>';
    }

    // 2) Attach realtime listener for live updates (red dot, relative time)
    await this.attachGroupsListener(userId, listEl, emptyEl);
  }

  async attachGroupsListener(userId, listEl, emptyEl) {
    // Detach existing if any
    this.detachGroupsListener();

    try {
      const { collection, query, where, onSnapshot } = await import(
        "firebase/firestore"
      );
      const { db } = await import("../lib/firebase/firebase-config.js");

      const q = query(
        collection(db, "classSpaces"),
        where("memberIds", "array-contains", userId)
      );

      this.groupsListener = onSnapshot(
        q,
        (snapshot) => {
          const spaces = [];
          snapshot.forEach((docSnap) => {
            spaces.push({ spaceId: docSnap.id, ...docSnap.data() });
          });
          // Sort newest activity first (desc)
          spaces.sort((a, b) => {
            const at = a.lastActivity?.toMillis?.() || 0;
            const bt = b.lastActivity?.toMillis?.() || 0;
            return bt - at;
          });

          // Update cache for next navigation
          groupsCache.set(spaces, userId);

          // Render immediately
          this.renderGroups(spaces, listEl, emptyEl);
          console.log(`[GroupsPage] Realtime update: ${spaces.length} groups`);
        },
        (error) => {
          console.error("[GroupsPage] Realtime listener error:", error);
          listEl.innerHTML = `
            <div class="error-message">
              <p>Failed to load groups</p>
              <button class="btn-retry">Retry</button>
            </div>
          `;
          listEl.querySelector(".btn-retry")?.addEventListener("click", () => {
            this.loadGroupsHybrid();
          });
        }
      );
    } catch (e) {
      console.error("[GroupsPage] Failed to attach realtime listener:", e);
      // Fallback to one-shot load if realtime fails
      await this.loadGroups();
    }
  }

  detachGroupsListener() {
    if (typeof this.groupsListener === "function") {
      try {
        this.groupsListener();
      } catch (_) {}
      this.groupsListener = null;
      console.log("[GroupsPage] Detached realtime listener");
    }
  }

  unmount() {
    this.detachGroupsListener();
    this.teardownPullToRefresh();
    // Clean up clubs instance if active
    if (this.clubsInstance) {
      this.clubsInstance.unmount();
      this.clubsInstance = null;
    }
  }

  async loadGroups() {
    const targetEl = this.groupsRoot || this.container;
    const listEl = targetEl.querySelector("#groups-list");
    const emptyEl = targetEl.querySelector("#groups-empty");

    // Get current user ID for cache scoping
    const userId = currentUser?.uid;
    if (!userId) {
      console.warn("[GroupsPage] No user ID available");
      return;
    }

    // Check cache first (with soft refresh on navigation)
    const cached = groupsCache.get(userId, true); // true = soft refresh (1min TTL)
    if (cached) {
      console.log("[GroupsPage] Using cached groups data");
      this.renderGroups(cached, listEl, emptyEl);
      return;
    }

    // Cache miss - fetch from Firestore
    listEl.innerHTML = '<div class="loading">Loading groups...</div>';

    try {
      // Minimal fetch: query classSpaces where memberIds contains current user
      const spaces = await dataManager.getUserClassSpaces();

      // Save to cache
      groupsCache.set(spaces, userId);
      this.renderGroups(spaces, listEl, emptyEl);
    } catch (error) {
      console.error("[GroupsPage] Error loading groups:", error);
      listEl.innerHTML = `
        <div class="error-message">
          <p>Failed to load groups</p>
          <button class="btn-retry">Retry</button>
        </div>
      `;

      listEl.querySelector(".btn-retry")?.addEventListener("click", () => {
        groupsCache.invalidate(userId);
        this.loadGroups();
      });
    }
  }

  setupPullToRefresh() {
    const page = this.container?.querySelector(".groups-page");
    const listEl = this.container?.querySelector("#groups-list");
    if (!page || !listEl) return;

    const indicator = document.createElement("div");
    indicator.className = "pull-refresh-indicator";
    indicator.innerHTML = `
      <span class="refresh-icon">↻</span>
    `;
    indicator.style.display = "none";
    const setTransform = (val) => {
      const y = typeof val === "number" ? `${val}px` : val;
      indicator.style.transform = `translate(-50%, ${y})`;
    };
    page.insertBefore(indicator, listEl);
    this.pullState.indicator = indicator;

    const getY = (evt) =>
      evt?.touches?.[0]?.clientY ?? evt?.clientY ?? 0;

    const canStart = () => {
      const scrollTop =
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        page.scrollTop ||
        0;
      return scrollTop <= 0;
    };

    const resetIndicator = () => {
      if (!this.pullState.indicator) return;
      setTransform("-120%");
      this.pullState.indicator.style.display = "none";
      this.pullState.indicator.classList.remove(
        "ready",
        "refreshing",
        "success"
      );
    };

    const onStart = (evt) => {
      if (this.isRefreshing || !canStart()) return;
      this.pullState.active = true;
      this.pullState.startY = getY(evt);
      this.pullState.distance = 0;
      indicator.style.display = "flex";
      setTransform("-120%");
      indicator.classList.remove("ready", "refreshing", "success");
    };

    const onMove = (evt) => {
      if (!this.pullState.active) return;
      const currentY = getY(evt);
      const distance = Math.max(0, currentY - this.pullState.startY);
      this.pullState.distance = distance;

      if (distance === 0) {
        resetIndicator();
        return;
      }

      const translate = Math.min(distance / 2, this.pullState.threshold * 1.5);
      indicator.style.display = "flex";
      setTransform(translate);
      const ready = distance > this.pullState.threshold;
      indicator.classList.toggle("ready", ready);
    };

    const onEnd = async () => {
      if (!this.pullState.active) return;
      const shouldRefresh = this.pullState.distance > this.pullState.threshold;
      this.pullState.active = false;
      this.pullState.distance = 0;
      if (shouldRefresh) {
        await this.triggerPullRefresh();
      } else {
        resetIndicator();
      }
    };

    page.addEventListener("touchstart", onStart, { passive: true });
    page.addEventListener("touchmove", onMove, { passive: true });
    page.addEventListener("touchend", onEnd);
    page.addEventListener("mousedown", onStart);
    page.addEventListener("mousemove", onMove);
    page.addEventListener("mouseup", onEnd);

    this.pullState.handlers = { onStart, onMove, onEnd, resetIndicator };
  }

  async triggerPullRefresh() {
    if (this.isRefreshing) return;
    const { resetIndicator } = this.pullState.handlers || {};
    const indicatorEl = this.pullState.indicator;

    if (indicatorEl) {
      indicatorEl.style.display = "flex";
      indicatorEl.classList.add("refreshing");
      indicatorEl.style.transform = "translate(-50%, 0)";
    }

    this.isRefreshing = true;
    try {
      const userId = currentUser?.uid;
      if (userId) {
        groupsCache.invalidate(userId);
      }
      await this.loadGroups();
      indicatorEl?.classList.add("success");
    } finally {
      this.isRefreshing = false;
      setTimeout(() => {
        resetIndicator?.();
      }, 600);
    }
  }

  teardownPullToRefresh() {
    const page = this.container?.querySelector(".groups-page");
    if (page && this.pullState.handlers) {
      const { onStart, onMove, onEnd } = this.pullState.handlers;
      page.removeEventListener("touchstart", onStart);
      page.removeEventListener("touchmove", onMove);
      page.removeEventListener("touchend", onEnd);
      page.removeEventListener("mousedown", onStart);
      page.removeEventListener("mousemove", onMove);
      page.removeEventListener("mouseup", onEnd);
    }

    if (this.pullState.indicator?.parentNode) {
      this.pullState.indicator.parentNode.removeChild(this.pullState.indicator);
    }

    this.pullState = {
      startY: 0,
      active: false,
      distance: 0,
      threshold: 70,
      indicator: null,
      handlers: null,
    };
  }

  renderGroups(spaces, listEl, emptyEl) {
    listEl.innerHTML = "";
    if (!spaces || spaces.length === 0) {
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");

    const userId = currentUser?.uid;

    for (const s of spaces) {
      const title = this.buildTitle(s);
      const members = s.memberCount || s.memberIds?.length || 0;
      const preview = s.lastMessagePreview?.content || "No messages yet";
      const hasUnread = unreadTracker.hasUnread(s.spaceId, s, userId);
      const relativeTime = unreadTracker.getRelativeTime(s);

      // Dynamic styling based on course code
      const courseCode = s.courseCode || (s.courseName ? s.courseName.substring(0, 3) : "GEN");
      const { hue, icon } = this.getCourseStyle(courseCode);

      const card = document.createElement("div");
      card.className = "group-card";
      // Inject hue as CSS variable for the stylesheet to use
      card.style.setProperty("--course-hue", hue);
      
      card.innerHTML = `
        <div class="card-icon-container">
          <i class="fas ${icon}"></i>
        </div>
        <div class="card-content">
          <div class="card-header">
            <div class="course-badge">${courseCode}</div>
            ${hasUnread ? '<div class="unread-indicator"></div>' : ""}
          </div>
          <h3 class="group-title">${title}</h3>
          <div class="card-meta">
            <span class="meta-item"><i class="far fa-clock"></i> ${this.slotToDisplay(s)}</span>
            <span class="meta-item"><i class="fas fa-map-marker-alt"></i> ${s.classroom || "TBD"}</span>
          </div>
          <div class="card-footer">
            <div class="preview-text">${preview}</div>
            <div class="member-info">
              <i class="fas fa-user-friends"></i> ${members}
              ${relativeTime ? `<span class="time-ago">• ${relativeTime}</span>` : ""}
            </div>
          </div>
        </div>
      `;

      card.addEventListener("click", async () => {
        logManager.dev.debug("[GroupsPage] Group card clicked", { spaceId: s.spaceId });
        try {
          const { navigateTo } = await import("../app.js");
          try {
            sessionStorage.setItem("group:spaceId", s.spaceId);
          } catch (_) {}
          window.location.hash = `#group`;
          navigateTo("group");
        } catch (_) {
          try {
            sessionStorage.setItem("group:spaceId", s.spaceId);
          } catch (_) {}
          window.location.hash = `#group`;
        }
      });
      listEl.appendChild(card);
    }
  }

  getCourseStyle(code) {
    const c = (code || "").toUpperCase().replace(/[^A-Z]/g, "");
    let hue = 0;
    let icon = "fa-book";

    // Categories
    if (c.startsWith("CSE") || c.startsWith("CS") || c.startsWith("SWE")) {
      hue = 230; // Blue/Purple
      icon = "fa-laptop-code";
    } else if (c.startsWith("EEE") || c.startsWith("EE")) {
      hue = 40; // Gold
      icon = "fa-bolt";
    } else if (c.startsWith("MAT") || c.startsWith("MTH")) {
      hue = 270; // Purple
      icon = "fa-square-root-alt";
    } else if (c.startsWith("PHY")) {
      hue = 330; // Pink
      icon = "fa-atom";
    } else if (c.startsWith("CHE") || c.startsWith("BIO")) {
      hue = 150; // Green
      icon = "fa-flask";
    } else if (c.startsWith("ENG") || c.startsWith("HUM")) {
      hue = 300; // Magenta
      icon = "fa-feather-alt";
    } else if (c.startsWith("BBA") || c.startsWith("ECO")) {
      hue = 190; // Cyan
      icon = "fa-chart-line";
    } else {
      // Hash based generation for others
      let hash = 0;
      for (let i = 0; i < c.length; i++) {
        hash = c.charCodeAt(i) + ((hash << 5) - hash);
      }
      hue = Math.abs(hash % 360);
    }
    
    return { hue, icon };
  }

  bindDevTools() {
    if (!this.showDevTools) return;
    const targetEl = this.groupsRoot || this.container;
    const createBtn = targetEl.querySelector("#btnCreateDevSpaces");
    const clearBtn = targetEl.querySelector("#btnClearDevSpaces");
    const triggerBtn = targetEl.querySelector("#btnTriggerScheduler");

    if (createBtn) {
      createBtn.addEventListener("click", async () => {
        createBtn.disabled = true;
        try {
          const { createDevSpacesForUser } = await import(
            "../services/groups/DevSpaceTools.js"
          );
          await createDevSpacesForUser(2);
          await this.loadGroups();
        } catch (e) {
          console.error("Create test spaces failed", e);
          notificationManager.show("Failed to create test spaces", "error");
        } finally {
          createBtn.disabled = false;
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        clearBtn.disabled = true;
        try {
          const { clearMyDevSpaces } = await import(
            "../services/groups/DevSpaceTools.js"
          );
          await clearMyDevSpaces();
          await this.loadGroups();
        } catch (e) {
          console.error("Clear test spaces failed", e);
          notificationManager.show("Failed to clear test spaces", "error");
        } finally {
          clearBtn.disabled = false;
        }
      });
    }

    if (triggerBtn) {
      triggerBtn.addEventListener("click", async () => {
        triggerBtn.disabled = true;
        const originalText = triggerBtn.innerHTML;
        triggerBtn.innerHTML = "⏳ Triggering scheduler...";

        try {
          // Compute Function URL based on environment (emulator vs deployed)
          const projectId =
            window.ENV?.FIREBASE_PROJECT_ID || "campxus-staging";
          const region = "us-central1";
          const isLocal =
            typeof window !== "undefined" &&
            (window.location.hostname === "localhost" ||
              window.location.hostname === "127.0.0.1");
          const functionUrl = isLocal
            ? `http://127.0.0.1:5001/${projectId}/${region}/triggerClassSpaceScheduler`
            : `https://${region}-${projectId}.cloudfunctions.net/triggerClassSpaceScheduler`;

          console.log("[GroupsPage] Triggering scheduler at:", functionUrl);

          const response = await fetch(functionUrl, {
            method: "GET",
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          console.log("[GroupsPage] Scheduler result:", result);

          if (result.success) {
            triggerBtn.innerHTML = "✅ Success!";
            notificationManager.show(
              `Scheduler executed successfully! Spaces created: ${
                result.spacesCreated || 0
              }, Deactivated: ${result.spacesDeactivated || 0}`,
              "success"
            );

            // Invalidate cache and reload groups
            const userId = currentUser?.uid;
            if (userId) {
              groupsCache.invalidate(userId);
            }
            await this.loadGroups();
          } else {
            throw new Error(result.error || "Unknown error");
          }
        } catch (e) {
          console.error("[GroupsPage] Trigger scheduler failed:", e);
          triggerBtn.innerHTML = "❌ Failed";
          notificationManager.show(
            `Failed to trigger scheduler: ${e.message}`,
            "error"
          );
        } finally {
          setTimeout(() => {
            triggerBtn.innerHTML = originalText;
            triggerBtn.disabled = false;
          }, 2000);
        }
      });
    }
  }

  slotToDisplay(s) {
    try {
      const start = s.timeStart || "";
      const end = s.timeEnd || "";
      return start && end ? `${start}–${end}` : "";
    } catch (_) {
      return "";
    }
  }

  buildTitle(s) {
    const codeOrName =
      s.courseCode ||
      (s.courseName ? this.toTitleCase(s.courseName) : "Course");
    const sec = s.section ? `S-${parseInt(s.section, 10)}` : "";
    // User requested to remove the slot part from the title
    return `${codeOrName} • ${sec}`
      .replace(/\s+•\s*$/, "")
      .replace(/•\s*$/, "");
  }

  toTitleCase(str) {
    return String(str || "")
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }
}

export default GroupsPage;

// Wire to SPA router lifecycle
let _groupsPageInstance = null;

document.addEventListener("spa:page:unload", () => {
  if (_groupsPageInstance) {
    _groupsPageInstance.unmount();
    _groupsPageInstance = null;
  }
});

document.addEventListener("spa:page:load", async (event) => {
  const route = event?.detail?.route;
  if (route !== "messages") return;
  const root =
    document.querySelector("#groups-root") ||
    document.querySelector(".main-content");
  _groupsPageInstance = new GroupsPage();
  await _groupsPageInstance.mount(root);
});
