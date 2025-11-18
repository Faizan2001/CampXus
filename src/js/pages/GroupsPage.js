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
            <p>You need to complete your profile setup before accessing class spaces.</p>
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
    this.container.innerHTML = `
      <section class="groups-page">
        ${devTools}
        <div id="groups-list" class="groups-list"></div>
        <div id="groups-empty" class="groups-empty hidden">No class spaces yet. They are created daily at 06:00.</div>
      </section>
    `;
    if (this.showDevTools) {
      this.bindDevTools();
    }

    // Hybrid: cache-first render, then attach realtime listener for fast badges
    await this.loadGroupsHybrid();
  }

  // Cache-first, then realtime listener while viewing the page
  async loadGroupsHybrid() {
    const listEl = this.container.querySelector("#groups-list");
    const emptyEl = this.container.querySelector("#groups-empty");

    const userId = currentUser?.uid;
    if (!userId) return;

    // 1) Try cache for instant paint
    const cached = groupsCache.get(userId, false); // do not soft-refresh
    if (cached && Array.isArray(cached)) {
      console.log("[GroupsPage] Loaded groups from cache (hybrid)");
      this.renderGroups(cached, listEl, emptyEl);
      this.updateCacheIndicator();
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
          this.updateCacheIndicator();
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
  }

  async loadGroups() {
    const listEl = this.container.querySelector("#groups-list");
    const emptyEl = this.container.querySelector("#groups-empty");

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
      this.updateCacheIndicator();
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
      this.updateCacheIndicator();
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
      const preview = s.lastMessagePreview?.content || "";
      const hasUnread = unreadTracker.hasUnread(s.spaceId, s, userId);
      const relativeTime = unreadTracker.getRelativeTime(s);

      const card = document.createElement("div");
      card.className = "group-card";
      card.innerHTML = `
        <div class="group-title">${title}${
        hasUnread ? '<span class="unread-badge"></span>' : ""
      }</div>
        <div class="group-sub">${s.classroom || ""} • ${
        s.dayPattern || ""
      } ${this.slotToDisplay(s)}</div>
        <div class="group-meta">
          <span>${members} classmates</span>
          ${
            relativeTime
              ? `<span class="group-time">• ${relativeTime}</span>`
              : ""
          }
        </div>
        <div class="group-preview">${preview}</div>
      `;
      card.addEventListener("click", async () => {
        try {
          const { navigateTo } = await import("../app.js");
          // Store selected spaceId for router (hash gets normalized)
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

  updateCacheIndicator() {
    const userId = currentUser?.uid;
    if (!userId) return;

    const ageStr = groupsCache.getAgeString(userId);
    let indicator = this.container.querySelector(".cache-indicator");

    if (!indicator && ageStr) {
      const groupsSection = this.container.querySelector(".groups-page");
      if (groupsSection) {
        indicator = document.createElement("div");
        indicator.className = "cache-indicator";
        groupsSection.insertBefore(
          indicator,
          groupsSection.querySelector(".groups-list")
        );
      }
    }

    if (indicator) {
      if (ageStr) {
        indicator.innerHTML = `
          <span class="cache-age">Updated ${ageStr}</span>
          <button class="btn-refresh" title="Refresh groups">
            <span class="refresh-icon">↻</span>
          </button>
        `;

        const refreshBtn = indicator.querySelector(".btn-refresh");
        refreshBtn?.addEventListener("click", async () => {
          if (this.isRefreshing) return;
          this.isRefreshing = true;
          refreshBtn.disabled = true;

          groupsCache.invalidate(userId);
          await this.loadGroups();

          this.isRefreshing = false;
          refreshBtn.disabled = false;
        });
      } else {
        indicator.remove();
      }
    }
  }

  bindDevTools() {
    if (!this.showDevTools) return;
    const createBtn = this.container.querySelector("#btnCreateDevSpaces");
    const clearBtn = this.container.querySelector("#btnClearDevSpaces");
    const triggerBtn = this.container.querySelector("#btnTriggerScheduler");

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
          const projectId = window.ENV?.FIREBASE_PROJECT_ID || "campxus-staging";
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
              `Scheduler executed successfully! Spaces created: ${result.spacesCreated || 0}, Deactivated: ${result.spacesDeactivated || 0}`,
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
          notificationManager.show(`Failed to trigger scheduler: ${e.message}`, "error");
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
    const slot = `${s.dayPattern || ""} ${this.slotToDisplay(s)}`.trim();
    return `${codeOrName} • ${sec} • ${slot}`
      .replace(/\s+•\s+•/g, " •")
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
  if (route !== "groups") return;
  const root =
    document.querySelector("#groups-root") ||
    document.querySelector(".main-content");
  _groupsPageInstance = new GroupsPage();
  await _groupsPageInstance.mount(root);
});
