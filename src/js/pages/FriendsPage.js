/**
 * 🎨 MeetchuThere Friends UI Controller
 *
 * This module handles all the user interface interactions for the friends page:
 * - Renders search results
 * - Displays friend requests
 * - Shows friends list
 * - Handles button clicks and form submissions
 *
 * 🎓 Learning: This is the "View + Controller" in our simple MVC pattern
 * It manages the UI and connects user actions to the friends manager
 */

import { friendsManager } from "../services/friends/FriendsService.js";
import { escapeHTML } from "../utils/security/sanitize.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import { showModal } from "../components/modals/Modal.js";
import {
  realTimeManager,
  REALTIME_EVENTS,
} from "../services/realtime/RealtimeService.js";
import { dataManager } from "../services/data/DataService.js";
import { currentUser } from "../store/userStore.js";
import {
  renderUserAvatar,
  getAvatarFallback,
} from "../utils/avatar/avatarUtils.js";
import { friendshipPrivacyService } from "../services/friends/FriendshipPrivacyService.js";
import { uiCache } from "../services/cache/UiCacheService.js";
import { pwaCache } from "../services/cache/PWACacheService.js";
import { FriendOptionsMenu } from "../components/friends/FriendOptionsMenu.js";
import { performanceDebugger } from "../utils/dev/performanceDebugger.js";
import { db } from "../lib/firebase/firebase-config.js";
import { AnalyticsService } from "../services/analytics/AnalyticsService.js";
import { onboardingService } from "../services/onboarding/OnboardingService.js";
import {
  showCoachMark,
  hasActiveCoachMarks,
  hideAllCoachMarks,
} from "../services/onboarding/CoachMarkManager.js";
import { logManager } from "../utils/debug/LogManager.js";
import {
  applyQuickAccessOptimisticUpdate,
  buildQuickAccessCacheEntry,
} from "../utils/friends/quickAccessOptimisticCache.js";

function devLog(message, detail = {}) {
  if (!import.meta.env || !import.meta.env.DEV) {
    return;
  }

  if (logManager?.dev?.info) {
    logManager.dev.info(message, detail);
    return;
  }

  console.log(message, detail);
}

// Light wrappers for centralized logging via logManager when available
function logInfo(msg, detail = {}) {
  try {
    if (logManager?.info) return logManager.info(msg, detail);
    if (logManager?.dev?.info) return logManager.dev.info(msg, detail);
  } catch (_) {}
  try {
    console.log(msg, detail);
  } catch (_) {}
}
function logWarn(msg, detail = {}) {
  try {
    if (logManager?.warn) return logManager.warn(msg, detail);
    if (logManager?.dev?.warn) return logManager.dev.warn(msg, detail);
  } catch (_) {}
  try {
    console.warn(msg, detail);
  } catch (_) {}
}
function logError(msg, detail = {}) {
  try {
    if (logManager?.error) return logManager.error(msg, detail);
    if (logManager?.dev?.error) return logManager.dev.error(msg, detail);
  } catch (_) {}
  try {
    console.error(msg, detail);
  } catch (_) {}
}

function isElementVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (element.offsetParent === null && style.position !== "fixed") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isElementInViewport(element, visibilityThreshold = 0.4) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth;

  const intersectionLeft = Math.max(rect.left, 0);
  const intersectionRight = Math.min(rect.right, viewportWidth);
  const intersectionTop = Math.max(rect.top, 0);
  const intersectionBottom = Math.min(rect.bottom, viewportHeight);

  const intersectionWidth = Math.max(0, intersectionRight - intersectionLeft);
  const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop);

  if (intersectionWidth === 0 || intersectionHeight === 0) {
    return false;
  }

  const visibleArea = intersectionWidth * intersectionHeight;
  const totalArea = rect.width * rect.height;

  return totalArea > 0 && visibleArea / totalArea >= visibilityThreshold;
}

function getResponsiveCoachmarkWidth(preferred = 220, minimum = 180) {
  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : preferred;
  const available = viewportWidth - 48;
  return Math.max(minimum, Math.min(preferred, available));
}

// Ensure per-user onboarding: clear any local hint flags when account changes
document.addEventListener("onboarding:user-switched", (e) => {
  try {
    hideAllCoachMarks();
  } catch (_) {}
  try {
    // Reset local flags used to gate hint sequences
    const ui = friendsUI;
    if (ui) {
      ui.friendActionsHintShown = false;
      ui.friendActionsHintPrimed = false;
    }
  } catch (_) {}
  try {
    // Remove any leftover glow classes so the next user doesn't see them
    const desktopLink = document.querySelector(
      '.top-nav .nav-links a.nav-link[data-spa-route="home"]'
    );
    const mobileLink = document.querySelector(
      '.mobile-bottom-nav a.mobile-nav-item[data-spa-route="home"]'
    );
    desktopLink?.classList?.remove?.("onboarding-glow");
    mobileLink?.classList?.remove?.("onboarding-glow");
    document
      .querySelectorAll(".quick-access-star.onboarding-glow")
      ?.forEach((el) => el.classList.remove("onboarding-glow"));
  } catch (_) {}
});

function didUserAcknowledgeHint(reason) {
  return reason === "primary" || reason === "secondary";
}

const FRIENDS_HINT_RETRY_DELAY = 600;
const FRIENDS_HINT_MAX_ATTEMPTS = 8;
// Serialize friends page hints to ensure only one coachmark is visible at a time
let friendsHintQueue = Promise.resolve();
function enqueueFriendHint(taskFn) {
  friendsHintQueue = friendsHintQueue
    .then(() => taskFn())
    .catch(() => {})
    .then(() => delay(120));
  return friendsHintQueue;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showCoachMarkWithRetries(
  { targetResolver, buildConfig },
  options = {}
) {
  const attempts = options.attempts ?? FRIENDS_HINT_MAX_ATTEMPTS;
  const delayMs = options.delayMs ?? FRIENDS_HINT_RETRY_DELAY;
  let tries = 0;

  while (tries < attempts) {
    if (hasActiveCoachMarks()) {
      await delay(delayMs);
      continue;
    }

    const target =
      typeof targetResolver === "function"
        ? targetResolver()
        : document.querySelector(targetResolver);

    if (target instanceof Element) {
      try {
        target.scrollIntoView({
          block: "center",
          inline: "center",
          behavior: tries === 0 ? "auto" : "smooth",
        });
      } catch (_) {
        /* ignore scroll errors */
      }
      await delay(140);

      const config =
        typeof buildConfig === "function" ? buildConfig(target) : buildConfig;
      if (!config) return false;
      const mark = showCoachMark({
        ...config,
        target,
      });

      if (mark) {
        if (typeof mark.update === "function") {
          requestAnimationFrame(() => mark.update());
          requestAnimationFrame(() => mark.update());
        }
        const result = await mark.waitForClose;
        if (didUserAcknowledgeHint(result?.reason)) {
          return true;
        }
      }
    }

    tries += 1;
    await delay(delayMs);
  }

  return false;
}

class FriendsUI {
  constructor() {
    this.elements = {};
    this.isInitialized = false;

    // 📋 Real-time friend request tracking for search results
    this.pendingRequestsMap = new Map(); // userId -> requestId
    this.outgoingRequestsMap = new Map(); // userId -> requestData (includes status)
    this.realTimeSubscriptions = [];

    // 🔧 Performance monitoring
    this.realTimeUnsubscriber = null; // Single unsubscriber for Quick Access
    this.isActive = false; // Track if page is currently active

    // 👥 Current friends data for unfriend functionality
    this.currentFriendsData = [];

    // 📬 Current friend requests data for accept/reject functionality
    this.currentFriendRequestsData = [];

    // 🔔 Notification debouncing
    this.lastFriendsNotificationTime = 0;

    // 🎯 Event listener management to prevent memory leaks
    this.listenersSetup = false;
    this.boundHandlers = null;

    // 🔗 Friend option menus for individual privacy controls
    this.friendOptionMenus = new Map(); // friendId -> FriendOptionsMenu instance

    // 🔒 Privacy update flag to prevent unnecessary re-renders
    this.isUpdatingPrivacy = false;

    // Removed global exposure (window.friendsPage) for security/privacy

    // Debounce timers for targeted privacy UI updates
    this.privacyUpdateTimers = new Map(); // friendId -> timeoutId

    // Track last known mutual status per friend to show success once
    this.mutualStatus = new Map(); // friendId -> boolean

    // Track first-time handshake for location sharing (mutualSharingEnabled)
    this.mutualLocationHandshake = new Map(); // friendId -> boolean

    // Track latest per-friend location visibility (my vs friend) from snapshots
    this.locationVisibilityState = new Map(); // friendId -> { my: boolean, friend: boolean }

    // Track outgoing pending location requests I have sent (from me -> friend)
    this.outgoingLocationRequestsMap = new Map(); // friendId -> boolean
    // Track incoming pending location requests sent to me (from friend -> me)
    this.incomingLocationRequestsMap = new Map(); // friendId -> boolean
    // Track last applied pending-UI state to avoid flicker
    this._pendingLocationUi = new Map(); // friendId -> boolean

    this.friendActionsHintShown = false;
    this.friendActionsHintPrimed = false;

    // Track delegated click handler for friendsList to avoid duplicate bindings
    this._delegatedClickBound = null;
    this.friendsListEventHandler = null;

    // Keep track of which friend's drawer is open so we can restore it after re-renders
    this.lastOpenDrawerFriendId = null;
    this._restoringDrawer = false; // guard against restore loops
    this._onDrawerToggleClick = null; // store toggle handler for cleanup
    this._refreshingStates = new Set(); // debounce refreshFriendActionsState per friend

    // Gate to serialize coachmarks on Friends page
    this.hintsBusy = false;

    // Prevent real-time sync from briefly undoing a user's star click on slow networks
    this._pendingQuickAccessToggles = new Map(); // friendId -> { desiredStarred, expiresAt }
  }

  /**
   * 🚀 Initialize the friends UI when the page loads
   */
  async init() {
    try {
      // Clean up any existing listeners first to prevent duplicates
      this.cleanup();

      this.isActive = true;

      // Always re-cache elements since DOM might have changed
      this.cacheElements();

      // Always set up event listeners since DOM elements are recreated
      this.setupEventListeners();

      // Paint from cache immediately to avoid empty UI on slow devices
      try {
        await this.renderCachedFriendsIfAvailable();
      } catch (_) {}

      // 🎛️ Set up real-time integration
      this.setupRealTimeCallbacks();

      // 📋 Set up real-time friend request status tracking
      this.setupFriendRequestStatusTracking();

      // Privacy controls are now individual per friend via bilateral privacy system

      this.isInitialized = true;

      // 📬 Seed pending location-share requests BEFORE initial render so pending clocks persist on first open
      await this.seedOutgoingPendingLocationRequests();
      await this.seedIncomingPendingLocationRequests();

      // 📡 Then attach realtime listeners for subsequent changes
      await this.setupOutgoingLocationRequestsListener();
      await this.setupIncomingLocationRequestsListener();

      // Always load initial data on page visit (caches seeded above ensure immediate pending UI)
      this.loadInitialData();

      console.log(
        "🎨 Friends UI initialized successfully with real-time updates and privacy controls"
      );
    } catch (error) {
      console.error("❌ Error initializing Friends UI:", error);
    }
  }

  /**
   * 📝 Cache DOM element references for better performance
   */
  cacheElements() {
    this.elements = {
      // Search elements
      searchInput: document.getElementById("friendSearch"),
      searchBtn: document.querySelector(".friends-search .search-btn"),
      // Container elements
      friendsList: document.getElementById("friendsList"),

      // Future: Add more elements as we build them
    };

    // Log which elements we found/missed
    Object.entries(this.elements).forEach(([key, element]) => {
      if (!element) {
        console.warn(`⚠️  Element not found: ${key}`);
      }
    });
  }

  /**
   * 🎯 Set up event listeners for user interactions (optimized to prevent memory leaks)
   */
  setupEventListeners() {
    // Always re-cache DOM elements to ensure we have fresh references
    console.log("🔄 Re-caching DOM elements for event listeners...");
    this.cacheElements();

    // For SPA applications, always reset listeners on page load to ensure they work
    if (this.listenersSetup) {
      console.log("🔄 SPA navigation detected, resetting event listeners...");
      this.listenersSetup = false; // Reset flag to allow re-setup
    }

    // Store bound functions for consistent reference
    if (!this.boundHandlers) {
      this.boundHandlers = {
        searchInput: (e) => this.handleSearchInput(e),
        searchKeypress: (e) => {
          if (e.key === "Enter") {
            this.handleSearch();
          }
        },
        searchClick: () => this.handleSearch(),
      };
    }

    // Search functionality with safety checks
    if (this.elements.searchInput) {
      console.log("✅ Search input element found, setting up listeners...");
      try {
        this.elements.searchInput.addEventListener(
          "input",
          this.boundHandlers.searchInput
        );
        this.elements.searchInput.addEventListener(
          "keypress",
          this.boundHandlers.searchKeypress
        );
        console.log("✅ Search input listeners attached successfully");
      } catch (error) {
        console.warn("⚠️ Could not set up search input listeners:", error);
        return;
      }
    } else {
      console.warn(
        "⚠️ Search input element not found (ID: friendSearch) - search functionality disabled"
      );
      console.log(
        "🔍 Available elements with 'search' in ID:",
        Array.from(document.querySelectorAll('[id*="search"]')).map(
          (el) => el.id
        )
      );
    }

    if (this.elements.searchBtn) {
      try {
        this.elements.searchBtn.addEventListener(
          "click",
          this.boundHandlers.searchClick
        );
      } catch (error) {
        console.warn("⚠️ Could not set up search button listener:", error);
        return;
      }
    } else {
      console.warn("⚠️ Search button element not found");
    }

    // Mark listeners as set up to prevent duplicates
    this.listenersSetup = true;
    console.log("🎯 Event listeners set up successfully (optimized)");
  }

  /**
   * 📬 Listen for my outgoing pending location-share requests so we remove pending when friend dismisses
   */
  async setupOutgoingLocationRequestsListener() {
    try {
      let myUid = currentUser?.state?.user?.uid;
      if (!myUid) {
        try {
          // Wait briefly for auth/profile to be ready on cold start or after sign-in
          await currentUser.waitForProfileWithTimeout?.(3000);
        } catch (err) {
          logWarn("Profile wait timeout during auth setup", {
            context: "setupOutgoingLocationRequestsListener",
            error: err?.message || String(err),
          });
        }
        myUid = currentUser?.state?.user?.uid;
        if (!myUid) {
          logWarn("⚠️ Auth not ready for outgoing loc-requests listener");
          return;
        }
      }

      const { collection, query, where, onSnapshot } = await import(
        "firebase/firestore"
      );

      const q = query(
        collection(db, "notifications"),
        where("fromUserId", "==", myUid),
        where("type", "==", "location_share_request"),
        where("status", "==", "pending")
      );

      if (this._outgoingLocReqUnsub) {
        try {
          this._outgoingLocReqUnsub();
        } catch (_) {}
      }
      this._outgoingLocReqUnsub = onSnapshot(
        q,
        (snap) => {
          // Rebuild map from snapshot
          this.outgoingLocationRequestsMap.clear();
          snap.docs.forEach((d) => {
            const data = d.data();
            const recipientId = data.userId; // friend id
            if (recipientId)
              this.outgoingLocationRequestsMap.set(recipientId, true);
          });

          // Update visible cards without full re-render
          try {
            (this.currentFriendsData || []).forEach((friend) => {
              const vis = this.locationVisibilityState.get(friend.id) || {
                my: false,
                friend: false,
              };
              const hasPending =
                this.outgoingLocationRequestsMap.get(friend.id) === true;
              const handshake = this.mutualLocationHandshake.get(friend.id);
              const shouldShowPending =
                (handshake !== true && hasPending) ||
                (!!vis.my && !vis.friend && hasPending);
              if (!shouldShowPending) {
                try {
                  this.outgoingLocationRequestsMap?.set(friend.id, false);
                } catch (_) {}
              }
              this._applyPendingUiIfChanged(
                friend.id,
                friend.handle,
                shouldShowPending
              );
            });
          } catch (_) {}
        },
        (err) =>
          console.warn("⚠️ Outgoing location-requests listener error", err)
      );
    } catch (e) {
      console.warn(
        "⚠️ Failed to set up outgoing location-requests listener:",
        e
      );
    }
  }

  /**
   * 📬 Listen for incoming pending location-share requests sent TO me (friend -> me)
   */
  async setupIncomingLocationRequestsListener() {
    try {
      let myUid = currentUser?.state?.user?.uid;
      if (!myUid) {
        try {
          await currentUser.waitForProfileWithTimeout?.(3000);
        } catch (err) {
          logWarn("Profile wait timeout during auth setup", {
            context: "setupIncomingLocationRequestsListener",
            error: err?.message || String(err),
          });
        }
        myUid = currentUser?.state?.user?.uid;
        if (!myUid) {
          logWarn("⚠️ Auth not ready for incoming loc-requests listener");
          return;
        }
      }

      const { collection, query, where, onSnapshot } = await import(
        "firebase/firestore"
      );

      const q = query(
        collection(db, "notifications"),
        where("userId", "==", myUid),
        where("type", "==", "location_share_request"),
        where("status", "==", "pending")
      );

      if (this._incomingLocReqUnsub) {
        try {
          this._incomingLocReqUnsub();
        } catch (_) {}
      }
      this._incomingLocReqUnsub = onSnapshot(
        q,
        (snap) => {
          // Rebuild incoming map from snapshot
          this.incomingLocationRequestsMap.clear();
          snap.docs.forEach((d) => {
            const data = d.data();
            const senderId = data.fromUserId; // friend id
            if (senderId) this.incomingLocationRequestsMap.set(senderId, true);
          });

          // Update visible cards without full re-render
          try {
            (this.currentFriendsData || []).forEach((friend) => {
              const vis = this.locationVisibilityState.get(friend.id) || {
                my: false,
                friend: false,
              };
              const outgoing =
                this.outgoingLocationRequestsMap.get(friend.id) === true;
              const incoming =
                this.incomingLocationRequestsMap.get(friend.id) === true;
              const hasPending = outgoing || incoming;
              const handshake = this.mutualLocationHandshake.get(friend.id);
              const shouldShowPending =
                hasPending && (!handshake || (vis.my && !vis.friend));
              if (!shouldShowPending) {
                try {
                  this.incomingLocationRequestsMap?.set(friend.id, false);
                } catch (_) {}
              }
              this._applyPendingUiIfChanged(
                friend.id,
                friend.handle,
                shouldShowPending
              );
            });
          } catch (_) {}
        },
        (err) =>
          logWarn("⚠️ Incoming location-requests listener error", { err })
      );
    } catch (e) {
      logWarn("⚠️ Failed to set up incoming location-requests listener:", {
        error: e,
      });
    }
  }

  /**
   * 🚀 One-shot seed: load pending outgoing location-share requests from Firestore
   * Ensures the pending icon persists across reload/sign-in before realtime fires.
   */
  async seedOutgoingPendingLocationRequests() {
    try {
      let myUid = currentUser?.state?.user?.uid;
      if (!myUid) {
        try {
          await currentUser.waitForProfileWithTimeout?.(3000);
        } catch (err) {
          logWarn("Profile wait timeout during seed", {
            context: "seedOutgoingPendingLocationRequests",
            error: err?.message || String(err),
          });
        }
        myUid = currentUser?.state?.user?.uid;
        if (!myUid) return; // auth not ready; realtime listener will handle later
      }

      const { collection, query, where, getDocs } = await import(
        "firebase/firestore"
      );
      const q = query(
        collection(db, "notifications"),
        where("fromUserId", "==", myUid),
        where("type", "==", "location_share_request"),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);

      // Build the map once from snapshot
      const newMap = new Map();
      const now = Date.now();
      snap.docs.forEach((d) => {
        const data = d.data();
        // Skip expired
        const exp = data.expiresAt?.toDate?.()?.getTime?.() || null;
        if (exp && exp < now) return;
        const recipientId = data.userId; // friend id
        if (recipientId) newMap.set(recipientId, true);
      });

      // Replace existing map state
      this.outgoingLocationRequestsMap.clear();
      newMap.forEach((v, k) => this.outgoingLocationRequestsMap.set(k, v));

      // Apply UI state to visible cards without full re-render
      try {
        (this.currentFriendsData || []).forEach((friend) => {
          const vis = this.locationVisibilityState.get(friend.id) || {
            my: false,
            friend: false,
          };
          const hasPending =
            this.outgoingLocationRequestsMap.get(friend.id) === true;
          const handshake = this.mutualLocationHandshake.get(friend.id);
          const shouldShowPending =
            (handshake !== true && hasPending) ||
            (!!vis.my && !vis.friend && hasPending);
          if (!shouldShowPending) {
            try {
              this.outgoingLocationRequestsMap?.set(friend.id, false);
            } catch (_) {}
          }
          this._applyPendingUiIfChanged(
            friend.id,
            friend.handle,
            shouldShowPending
          );
        });
      } catch (_) {}

      logInfo("📌 Seeded pending outgoing location requests from Firestore", {
        count: newMap.size,
      });
    } catch (e) {
      logWarn("⚠️ Failed to seed outgoing location-requests from Firestore", {
        error: e,
      });
    }
  }

  /**
   * 🚀 One-shot seed: load pending INCOMING location-share requests from Firestore
   */
  async seedIncomingPendingLocationRequests() {
    try {
      let myUid = currentUser?.state?.user?.uid;
      if (!myUid) {
        try {
          await currentUser.waitForProfileWithTimeout?.(3000);
        } catch (err) {
          logWarn("Profile wait timeout during seed", {
            context: "seedIncomingPendingLocationRequests",
            error: err?.message || String(err),
          });
        }
        myUid = currentUser?.state?.user?.uid;
        if (!myUid) return;
      }

      const { collection, query, where, getDocs } = await import(
        "firebase/firestore"
      );
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", myUid),
        where("type", "==", "location_share_request"),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);

      const newMap = new Map();
      const now = Date.now();
      snap.docs.forEach((d) => {
        const data = d.data();
        const exp = data.expiresAt?.toDate?.()?.getTime?.() || null;
        if (exp && exp < now) return;
        const senderId = data.fromUserId; // friend id
        if (senderId) newMap.set(senderId, true);
      });

      this.incomingLocationRequestsMap.clear();
      newMap.forEach((v, k) => this.incomingLocationRequestsMap.set(k, v));

      try {
        (this.currentFriendsData || []).forEach((friend) => {
          const vis = this.locationVisibilityState.get(friend.id) || {
            my: false,
            friend: false,
          };
          const outgoing =
            this.outgoingLocationRequestsMap.get(friend.id) === true;
          const incoming = newMap.get(friend.id) === true;
          const hasPending = outgoing || incoming;
          const handshake = this.mutualLocationHandshake.get(friend.id);
          const shouldShowPending =
            hasPending && (!handshake || (vis.my && !vis.friend));
          if (!shouldShowPending) {
            try {
              this.incomingLocationRequestsMap?.set(friend.id, false);
            } catch (_) {}
          }
          this._applyPendingUiIfChanged(
            friend.id,
            friend.handle,
            shouldShowPending
          );
        });
      } catch (_) {}

      logInfo("📌 Seeded pending INCOMING location requests from Firestore", {
        count: newMap.size,
      });
    } catch (e) {
      logWarn("⚠️ Failed to seed incoming location-requests from Firestore", {
        error: e,
      });
    }
  }

  /**
   * 🧹 Remove event listeners to prevent duplicates
   */
  removeEventListeners() {
    if (this.boundHandlers) {
      try {
        if (this.elements.searchInput) {
          this.elements.searchInput.removeEventListener(
            "input",
            this.boundHandlers.searchInput
          );
          this.elements.searchInput.removeEventListener(
            "keypress",
            this.boundHandlers.searchKeypress
          );
        }

        if (this.elements.searchBtn) {
          this.elements.searchBtn.removeEventListener(
            "click",
            this.boundHandlers.searchClick
          );
        }
      } catch (error) {
        console.warn("⚠️ Error removing event listeners:", error);
      }
    }
  }

  /**
   * 🎛️ Set up real-time callbacks for instant UI updates
   */
  setupRealTimeCallbacks() {
    logInfo("🎛️ Setting up real-time UI callbacks...");

    // Register callbacks with the friends manager using the registerUICallbacks method
    if (friendsManager.registerUICallbacks) {
      friendsManager.registerUICallbacks({
        onFriendRequestsChange: (requests) => {
          logInfo("📬 Real-time friend requests update in UI:", {
            count: requests.length,
          });
          this.displayFriendRequests(requests);

          // Update pending requests map for search button states
          const currentUserData = currentUser;
          if (currentUserData?.uid) {
            this.updatePendingRequestsMap(requests, currentUserData.uid);
            this.updateSearchResultsButtons();
          }

          // Show a more subtle notification for request updates
          if (requests.length > 0) {
            this.showRealTimeNotification(
              `${requests.length} friend request${
                requests.length !== 1 ? "s" : ""
              }`
            );
          }
        },

        onOutgoingFriendRequestsChange: (requests) => {
          logInfo("📤 Real-time outgoing friend requests update in UI:", {
            count: requests.length,
          });

          // Update outgoing requests map for button states
          this.updateOutgoingRequestsMap(requests);

          // Update search results buttons based on outgoing request status
          this.updateSearchResultsButtons();

          // Re-filter search results to hide accepted friend requests
          this.filterSearchResultsForAcceptedRequests();
        },

        onFriendsListChange: async (friends) => {
          logInfo("🤝 Real-time friends list update in UI:", {
            count: friends.length,
          });

          // Skip re-rendering during privacy updates to prevent flickering
          if (this.isUpdatingPrivacy) {
            logInfo("🔒 Skipping friends list refresh during privacy update");
            // Still update lightweight UI bits that don't close drawers
            this.currentFriendsData = friends;
            this.updateSearchResultsButtons();
            this.filterSearchResultsForAcceptedRequests();
            return;
          }

          // Avoid heavy re-render if item set is unchanged (patch in place)
          try {
            const idsSig = friends
              .map((f) => f.id)
              .filter(Boolean)
              .sort()
              .join(";");
            const structureUnchanged = this._lastFriendsIdsSig === idsSig;

            if (!this.isUpdatingPrivacy && !structureUnchanged) {
              await this.displayFriendsList(friends);
              this._lastFriendsIdsSig = idsSig;
            } else {
              // Patch lightweight UI bits only
              this.currentFriendsData = friends;
              try {
                await this.updateAllQuickAccessStars(friends);
                await this.updateAllFriendCardsBilateralPrivacy(friends);
              } catch (_) {}
            }
          } catch (_) {
            // Fallback to full render on any error
            if (!this.isUpdatingPrivacy) {
              await this.displayFriendsList(friends);
            }
          }

          // Update search button states (hide buttons for existing friends)
          this.updateSearchResultsButtons();

          // Filter out friends from search results
          this.filterSearchResultsForAcceptedRequests();

          // Show a more subtle notification for friends list updates (debounced)
          if (
            friends.length > 0 &&
            (!this.lastFriendsNotificationTime ||
              Date.now() - this.lastFriendsNotificationTime > 2000)
          ) {
            this.showRealTimeNotification(
              `${friends.length} friend${
                friends.length !== 1 ? "s" : ""
              } connected`
            );
            this.lastFriendsNotificationTime = Date.now();
          }
        },

        onConnectionStatusChange: (status) => {
          logInfo("📡 Real-time connection status in UI:", status);
          this.displayConnectionStatus(status);

          // Log connection status instead of showing notification
          const statusText = status.isConnected
            ? "Connected - Real-time updates active"
            : "Disconnected - Connection lost, trying to reconnect";
          console.log(`📡 ${statusText}`);
        },

        onNewFriendRequest: (request) => {
          logInfo("🔔 New friend request received in UI:", {
            handle: request.handle,
          });

          // Show prominent notification for new friend requests
          notificationManager.showFriendRequestNotification(request);
        },

        // ⭐ Phase-2: Quick Access real-time updates (primary handler)
        onQuickAccessUpdated: (quickAccessData) => {
          logInfo("⭐ Real-time Quick Access update in UI:", {
            count: (quickAccessData?.items || quickAccessData)?.length || 0,
          });
          this.handleRealTimeQuickAccessUpdate(quickAccessData);
        },
      });
    }

    // ⭐ Phase 4.1: Listen for schedule privacy changes
    if (realTimeManager && realTimeManager.on) {
      const privacyChangeUnsubscriber = realTimeManager.on(
        REALTIME_EVENTS.SCHEDULE_PRIVACY_CHANGE,
        (privacyEvent) => {
          console.log(
            "🔒 Privacy change event received in FriendsPage:",
            privacyEvent
          );
          this.handlePrivacyChange(privacyEvent);
        }
      );

      // Store unsubscriber for cleanup
      if (!this.realTimeSubscriptions) {
        this.realTimeSubscriptions = [];
      }
      this.realTimeSubscriptions.push(privacyChangeUnsubscriber);
    }

    // Start real-time listening in the friends manager
    if (friendsManager.startRealTimeListening) {
      friendsManager.startRealTimeListening();
    }

    // ⭐ Quick Access updates are handled via onQuickAccessUpdated callback above
    // No need for separate setupQuickAccessRealTimeListener to prevent duplicates

    logInfo("✅ Real-time UI callbacks set up successfully");
  }

  /**
   * 📋 Set up real-time friend request status tracking for search results
   * This efficiently tracks pending requests to show correct button states
   */
  setupFriendRequestStatusTracking() {
    const currentUserData = currentUser;
    if (!currentUserData?.uid) {
      console.warn("⚠️ No current user for friend request status tracking");
      return;
    }

    logInfo("📋 Setting up real-time friend request status tracking...");

    // NOTE: Real-time subscriptions are handled by setupRealTimeCallbacks()
    // to avoid duplicate subscribers. This method only loads initial data.

    // Initial load of pending requests
    this.loadInitialPendingRequests(currentUserData.uid);

    logInfo("✅ Friend request status tracking set up successfully");
  }

  /**
   * 📋 Load initial pending requests to populate the map
   * @param {string} currentUserId - Current user's ID
   */
  async loadInitialPendingRequests(currentUserId) {
    try {
      console.log(
        `📋 Loading initial outgoing requests for user: ${currentUserId}`
      );

      // Get ALL outgoing requests (not just pending ones)
      const outgoingRequests = await dataManager.getAllOutgoingFriendRequests(
        currentUserId
      );

      // Update the outgoing requests map
      this.updateOutgoingRequestsMap(outgoingRequests);

      console.log(
        `📋 Loaded ${outgoingRequests.length} initial outgoing requests`
      );
    } catch (error) {
      console.error("❌ Error loading initial outgoing requests:", error);
    }
  }

  /**
   * 📋 Update the pending requests map when real-time changes occur
   * @param {Array} requests - All friend requests from real-time listener
   * @param {string} currentUserId - Current user's ID
   */
  updatePendingRequestsMap(requests, currentUserId) {
    // Clear and rebuild the map
    this.pendingRequestsMap.clear();

    // Only track incoming pending requests (requests TO current user)
    const incomingPendingRequests = requests.filter(
      (request) =>
        request.toUserId === currentUserId && request.status === "pending"
    );

    incomingPendingRequests.forEach((request) => {
      this.pendingRequestsMap.set(request.fromUserId, request.id);
    });

    console.log(
      `📋 Updated pending requests map: ${this.pendingRequestsMap.size} incoming pending`
    );
  }

  /**
   * 📋 Update the outgoing requests map when real-time changes occur
   * @param {Array} requests - All outgoing friend requests from real-time listener
   */
  updateOutgoingRequestsMap(requests) {
    // Clear and rebuild the map
    this.outgoingRequestsMap.clear();

    // Store all outgoing requests with their current status
    requests.forEach((request) => {
      this.outgoingRequestsMap.set(request.toUserId, {
        id: request.id,
        status: request.status,
        handle: request.handle,
        createdAt: request.createdAt,
        respondedAt: request.respondedAt,
      });
    });

    console.log(
      `📋 Updated outgoing requests map: ${this.outgoingRequestsMap.size} total requests`
    );
  }

  /**
   * 📋 Update search result buttons based on current friend request status
   * This runs whenever friend requests or friendships change
   */
  async updateSearchResultsButtons() {
    const searchResults = document.getElementById("searchResults");
    if (!searchResults) {
      console.log(
        "📋 No search results container found, skipping button update"
      );
      return;
    }

    const studentCards = searchResults.querySelectorAll(".student-card");
    console.log(`📋 Updating ${studentCards.length} search result buttons`);

    // If outgoing requests map is empty (e.g., after browser reload), reload it
    if (this.outgoingRequestsMap.size === 0) {
      const currentUserData = currentUser;
      if (currentUserData?.uid) {
        console.log(
          "📋 Outgoing requests map empty, reloading from database..."
        );
        await this.loadInitialPendingRequests(currentUserData.uid);
      }
    }

    studentCards.forEach((card) => {
      const studentId = card.dataset.studentId;
      const button = card.querySelector(
        ".btn-send-request, .btn-request-sent, .btn-pending-request"
      );

      if (!button || !studentId) {
        console.log(`📋 No button or studentId found for card`);
        return;
      }

      // Check if there's a pending outgoing request to this user
      const outgoingRequest = this.outgoingRequestsMap.get(studentId);
      const hasPendingRequest =
        outgoingRequest && outgoingRequest.status === "pending";

      console.log(
        `📋 Student ${studentId}: outgoingRequest =`,
        outgoingRequest,
        `hasPendingRequest = ${hasPendingRequest}`
      );

      if (hasPendingRequest) {
        // Show pending state
        console.log(`📋 Setting button to pending state for ${studentId}`);
        button.className = "btn-pending-request";
        button.innerHTML = '<i class="fas fa-clock"></i>';
        button.disabled = true;
        button.setAttribute("title", "Friend request pending");
      } else {
        // Show send request state
        console.log(`📋 Setting button to send request state for ${studentId}`);
        button.className = "btn-send-request";
        button.innerHTML = '<i class="fas fa-user-plus"></i> Add';
        button.disabled = false;
      }
    });
  }

  /**
   * 🔔 Show a subtle real-time update notification
   * @param {string} message - Message to show
   */
  showRealTimeNotification(message) {
    // Log real-time updates instead of showing notifications
    console.log(`📡 Real-time Update: ${message}`);
  }

  /**
   * 📡 Display connection status
   * @param {Object} status - Connection status object
   */
  displayConnectionStatus(status) {
    // For now, just log it. In a full implementation, you might show an indicator
    if (status.isConnected) {
      console.log("📡 Connected to real-time updates");
    } else {
      console.log("📡 Disconnected from real-time updates");
    }
  }

  /**
   * 📊 Load initial data when page opens
   */
  async loadInitialData() {
    try {
      // Show loading state (no-op placeholder, we keep cached content visible)
      this.showLoadingState();

      // Load friends list
      await this.refreshFriendsList();
    } catch (error) {
      console.error("❌ Error loading initial data:", error);
    } finally {
      this.hideLoadingState();
    }
  }

  /**
   * 🔍 Handle search input changes (with debouncing)
   */
  handleSearchInput(event) {
    const searchTerm = event.target.value.trim();
    console.log(
      `🔍 Search input changed: "${searchTerm}" (length: ${searchTerm.length})`
    );

    // Clear previous timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Debounce search to avoid too many requests
    // Trigger when input is:
    // - a handle prefix (3+ chars, optional @), or
    // - a numeric student ID with 6+ digits (exact lookup)
    this.searchTimeout = setTimeout(() => {
      const isHandleCandidate = (() => {
        const t = searchTerm.startsWith("@")
          ? searchTerm.slice(1).toLowerCase()
          : searchTerm.toLowerCase();
        // Allow prefix: start with a letter, then letters/digits/underscore, length >= 3
        return /^[a-z][a-z0-9_]{2,}$/.test(t);
      })();
      const isIdCandidate = /^\d{6,}$/.test(searchTerm);

      if (isHandleCandidate || isIdCandidate) {
        console.log(`🔍 Performing search for: "${searchTerm}"`);
        this.performSearch(searchTerm);
      } else if (searchTerm.length === 0) {
        // Only clear when completely empty
        console.log("🧹 Search term empty, clearing results");
        this.clearSearchResults();
      } else {
        console.log("🔍 Input not a handle or 6+ digit ID yet");
      }
    }, 250); // Wait 250ms after user stops typing
  }

  /**
   * 🔍 Handle search button click
   */
  async handleSearch() {
    const searchTerm = this.elements.searchInput?.value.trim();

    const isHandleCandidate = (() => {
      if (!searchTerm) return false;
      const t = searchTerm.startsWith("@")
        ? searchTerm.slice(1).toLowerCase()
        : searchTerm.toLowerCase();
      return /^[a-z][a-z0-9_]{2,}$/.test(t);
    })();
    const isIdCandidate = !!searchTerm && /^\d{6,}$/.test(searchTerm);

    if (!isHandleCandidate && !isIdCandidate) {
      this.showMessage(
        "Enter a handle (e.g., @alice) or a 6+ digit student ID",
        "warning"
      );
      return;
    }

    await this.performSearch(searchTerm);
  }

  /**
   * 🔍 Perform the actual search
   */
  async performSearch(searchTerm) {
    try {
      // Track request sequence to avoid race conditions
      this._searchSeq = (this._searchSeq || 0) + 1;
      const seq = this._searchSeq;
      // Show search loading state
      this.showSearchLoading();

      // Search using friends manager
      const results = await friendsManager.searchStudentsWithCache(searchTerm);

      // Display results only if this is the latest request
      if (seq === this._searchSeq) {
        this.displaySearchResults(results);
      } else {
        console.log("⏭️ Discarding stale search results");
      }
    } catch (error) {
      console.error("❌ Search error:", error);
      this.showMessage(
        "Error searching for students. Please try again.",
        "error"
      );
    } finally {
      this.hideSearchLoading();
    }
  }

  /**
   * 📋 Display search results
   */
  displaySearchResults(results) {
    console.log("📋 Displaying search results:", results);

    // Find or create search results container
    const searchSection = document.querySelector(".friends-search");
    let resultsContainer = document.getElementById("searchResults");

    if (!resultsContainer) {
      resultsContainer = document.createElement("div");
      resultsContainer.id = "searchResults";
      resultsContainer.className = "search-results";
      // Prefer attaching to the input wrapper so we can anchor dropdown width/position
      const inputWrapper = searchSection.querySelector(".search-input-wrapper");
      if (inputWrapper) {
        inputWrapper.appendChild(resultsContainer);
      } else {
        searchSection.appendChild(resultsContainer);
      }
    }

    // Filter out users who are already friends (accepted requests)
    const filteredResults = results.filter((student) => {
      const outgoingRequest = this.outgoingRequestsMap.get(student.id);
      // Hide users who have accepted friend requests - they should be in friends list
      return !(outgoingRequest && outgoingRequest.status === "accepted");
    });

    if (filteredResults.length === 0) {
      resultsContainer.innerHTML = `
        <div class="search-results-header">
          <h4>Search Results (0)</h4>
          <button class="btn-clear-search" title="Clear search results">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="search-results-container">
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <p>No students found matching your search</p>
          </div>
        </div>
      `;
      resultsContainer.classList.add("show");
      return;
    }

    // Display search results with compact mobile-friendly meta line
    this.latestSearchResults = filteredResults;

    const resultsHTML = filteredResults
      .map((student) => {
        const handle =
          student.profile?.handle || student.profile?.handle_lower || "Unknown";
        const major =
          student.profile?.major ||
          student.profile?.major_lower ||
          "Unknown Major";
        const uniName =
          student.universityInfo?.universityName ||
          student.universityInfo?.university ||
          "";
        const isIub = this.isIubUniversity(student.universityInfo);
        const majorLine = isIub ? `${major} · IUB` : major;
        const universityLine = isIub
          ? ""
          : escapeHTML(uniName || "Unknown University");

        return `
      <div class="student-card" data-student-id="${student.id}">
        <div class="student-avatar">
          ${this.renderAvatar(student)}
        </div>
        <div class="student-info">
          <h4 class="student-name">${escapeHTML(handle)}</h4>
          <p class="student-major">${escapeHTML(majorLine)}</p>
          ${
            universityLine
              ? `<p class="student-university">${universityLine}</p>`
              : ""
          }
        </div>
        <div class="student-actions">
          ${this.renderFriendRequestButton(student)}
        </div>
      </div>
    `;
      })
      .join("");

    resultsContainer.innerHTML = `
      <div class="search-results-header">
        <h4>Search Results (${filteredResults.length})</h4>
        <button class="btn-clear-search" title="Clear search results">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="search-results-container">
        <div class="students-grid">
          ${resultsHTML}
        </div>
      </div>
    `;

    // Add smooth dropdown animation
    resultsContainer.classList.add("show");

    // Use event delegation - single listener on container, prevent duplicates
    if (!this.boundHandlers) this.boundHandlers = {};
    if (!this.boundHandlers.searchResultsClick) {
      this.boundHandlers.searchResultsClick = (e) => {
        if (e.target.closest(".btn-send-request")) {
          const button = e.target.closest(".btn-send-request");
          const studentId = button.dataset.studentId;
          if (button.disabled) return;
          const student =
            this.latestSearchResults?.find((s) => s.id === studentId) ||
            (results || []).find((s) => s.id === studentId);
          this.handleSendFriendRequest(studentId, student);
        }
        if (e.target.closest(".btn-clear-search")) {
          this.clearSearchResults();
        }
      };
    }
    if (!this._searchResultsListenerAttached) {
      resultsContainer.addEventListener(
        "click",
        this.boundHandlers.searchResultsClick
      );
      this._searchResultsListenerAttached = true;
    }

    // Update button states and filter friends from search results
    // Use setTimeout to ensure DOM is fully rendered before updating
    setTimeout(() => {
      this.updateSearchResultsButtons();
      this.filterSearchResultsForAcceptedRequests();
    }, 0);
  }

  /**
   * 🏫 Determine if a university is IUB
   * @param {Object} universityInfo
   * @returns {boolean}
   */
  isIubUniversity(universityInfo) {
    if (!universityInfo) return false;
    const id = (universityInfo.university || "").toLowerCase();
    const name = (universityInfo.universityName || "").toLowerCase();
    return id === "iub" || name === "independent university, bangladesh";
  }

  /**
   * 🧹 Clear search results with smooth animation
   */
  clearSearchResults() {
    console.log("🧹 Clearing search results");

    const resultsContainer = document.getElementById("searchResults");
    if (resultsContainer) {
      // Remove delegated listener to avoid duplicate handlers on next render
      if (
        this._searchResultsListenerAttached &&
        this.boundHandlers?.searchResultsClick
      ) {
        try {
          resultsContainer.removeEventListener(
            "click",
            this.boundHandlers.searchResultsClick
          );
        } catch (_) {}
        this._searchResultsListenerAttached = false;
      }
      // Remove show class for smooth animation
      resultsContainer.classList.remove("show");

      // Remove element after animation completes
      setTimeout(() => {
        if (resultsContainer.parentNode) {
          resultsContainer.remove();
        }
      }, 300); // Match CSS transition duration
    }

    // DON'T clear search input - let user keep their search term
    // if (this.elements.searchInput) {
    //   this.elements.searchInput.value = "";
    // }
  }

  /**
   * 🧹 Filter search results to hide cards for accepted friend requests and current friends
   * This is called when outgoing requests or friends list are updated in real-time
   */
  filterSearchResultsForAcceptedRequests() {
    const searchResults = document.getElementById("searchResults");
    if (!searchResults) {
      return; // No search results to filter
    }

    const studentCards = searchResults.querySelectorAll(".student-card");
    let removedCount = 0;

    // Create a set of current friend IDs for fast lookup
    const currentFriendIds = new Set(
      this.currentFriendsData.map((friend) => friend.id)
    );

    studentCards.forEach((card) => {
      const studentId = card.dataset.studentId;
      const outgoingRequest = this.outgoingRequestsMap.get(studentId);

      // Hide users who are now friends (either accepted requests or existing friends)
      const shouldRemove =
        (outgoingRequest && outgoingRequest.status === "accepted") || // Old logic for non-clean lifecycle
        currentFriendIds.has(studentId); // New logic: hide current friends

      if (shouldRemove) {
        console.log(
          `📋 Removing search card for friend/accepted request: ${studentId}`
        );
        card.style.opacity = "0.5";
        card.style.transform = "scale(0.9)";

        // Remove card after animation
        setTimeout(() => {
          if (card.parentNode) {
            card.remove();
            removedCount++;

            // Check if we need to show empty state
            const remainingCards =
              searchResults.querySelectorAll(".student-card");
            if (remainingCards.length === 0) {
              this.showSearchResultsEmptyState(searchResults);
            }
          }
        }, 300);
      }
    });

    if (removedCount > 0) {
      console.log(
        `📋 Filtered out ${removedCount} friends/accepted requests from search results`
      );
    }
  }

  /**
   * 🏳️ Show empty state for search results
   * @param {HTMLElement} resultsContainer - Search results container
   */
  showSearchResultsEmptyState(resultsContainer) {
    const resultsContentContainer = resultsContainer.querySelector(
      ".search-results-container"
    );
    if (resultsContentContainer) {
      resultsContentContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🤝</div>
          <p>All found users are now your friends!</p>
        </div>
      `;
    }
  }

  /**
   * 👥 Refresh the friends list display
   */
  async refreshFriendsList() {
    try {
      const friends = await friendsManager.getFriendsList();
      await this.displayFriendsList(friends);
    } catch (error) {
      console.error("❌ Error refreshing friends list:", error);
    }
  }

  _friendsListHasNonSkeletonContent() {
    const html = this.elements?.friendsList?.innerHTML || "";
    return html.trim().length > 0 && !html.includes("skeleton-loader");
  }

  /**
   * 👥 Display the friends list with bilateral privacy support
   */
  async displayFriendsList(friends) {
    if (!this.elements.friendsList) return;

    // Store friends data for unfriend functionality
    this.currentFriendsData = friends;

    if (friends.length === 0) {
      // Show empty state (it's already in the HTML)
      this.elements.friendsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <h4>No friends yet!</h4>
          <p>Start connecting with your classmates to see shared study times and plan group sessions.</p>
        </div>
      `;
      console.log("👥 No friends to display");
      return;
    }

    console.log("👥 Displaying friends:", friends);

    // Track item-set signature to decide future diff strategy
    try {
      this._lastFriendsIdsSig = friends
        .map((f) => f.id)
        .filter(Boolean)
        .sort()
        .join(";");
    } catch (_) {}

    this._diffAndRenderFriends(friends);

    // Persist for next navigation to minimize empty-state flicker
    try {
      const uid = currentUser?.state?.user?.uid;
      if (uid) uiCache.set(uiCache.keys.friendsList(uid), friends, 120_000);
    } catch (_) {}

    // 🔗 Render friend options menus for each friend card with bilateral privacy
    await this.renderFriendOptionsMenus(friends);

    // ⏱️ Apply any known pending states from caches immediately (no network)
    this._applyPendingStateFromCachesForAllFriends();

    // 🚀 Fast-path: prefetch friendship docs in parallel and clear "unknown" states
    // ASAP for both schedule and location buttons before realtime settles
    try {
      await this._fastPrefetchFriendshipStatesAndApply(friends);
    } catch (_) {}

    // ⭐ Update Quick Access star states for all friend cards
    await this.updateAllQuickAccessStars(friends);

    // 🔐 Update all friend cards with their actual bilateral privacy status (no artificial delay)
    // Then set up direct friendship document listeners for immediate icon updates
    try {
      await this.updateAllFriendCardsBilateralPrivacy(friends);
      await this.setupFriendCardPrivacyListeners(friends);
      this.maybeShowFriendActionsHint(friends);
    } catch (_) {}

    // 🧭 Attach drawer toggle interactions (delegated once)
    this._ensureFriendActionDrawerHandlers();

    // If a drawer was open before the re-render, restore it (guard against cycles)
    if (this.lastOpenDrawerFriendId && !this._restoringDrawer) {
      const fid = this.lastOpenDrawerFriendId;
      const card = this.elements.friendsList?.querySelector(
        `.friend-card[data-friend-id="${fid}"]`
      );
      if (card && !card.classList.contains("drawer-open")) {
        this._restoringDrawer = true;
        requestAnimationFrame(() => {
          try {
            this.toggleFriendActionsDrawer(fid, true);
          } catch (e) {
            logWarn("Restore drawer failed", { friendId: fid, error: e });
          } finally {
            this._restoringDrawer = false;
          }
        });
      }
    }
  }

  _diffAndRenderFriends(friends) {
    const listEl = this.elements?.friendsList;
    if (!listEl) return;

    const existingCards = new Map();
    const existingDropdowns = new Map();

    listEl.querySelectorAll(".friend-card").forEach((card) => {
      const id = card.dataset.friendId;
      if (id) existingCards.set(id, card);
    });
    listEl.querySelectorAll(".friend-actions-dropdown").forEach((dd) => {
      const id = dd.dataset.friendId;
      if (id) existingDropdowns.set(id, dd);
    });

    const frag = document.createDocumentFragment();

    friends.forEach((friend) => {
      const id = friend?.id;
      if (!id) return;

      let card = existingCards.get(id);
      if (!card) {
        card = document.createElement("div");
        card.className = "friend-card";
        card.dataset.friendId = id;
      }
      card.innerHTML = this._buildFriendCardInner(friend);
      frag.appendChild(card);
      existingCards.delete(id);

      let dropdown = existingDropdowns.get(id);
      if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.className = "friend-actions-dropdown";
        dropdown.dataset.friendId = id;
      }
      dropdown.setAttribute("aria-hidden", "true");
      dropdown.innerHTML = this._buildFriendDropdownInner(friend);
      frag.appendChild(dropdown);
      existingDropdowns.delete(id);
    });

    // Remove stale elements
    existingCards.forEach((el) => el.remove());
    existingDropdowns.forEach((el) => el.remove());

    // Replace list content
    listEl.innerHTML = "";
    listEl.appendChild(frag);
  }

  _buildFriendCardInner(friend) {
    return `
      <div class="friend-avatar">
        ${this.renderAvatar(friend)}
        ${friend.isOnline ? '<div class="online-indicator"></div>' : ""}
      </div>
      <div class="friend-info">
        <h4 class="friend-name">${escapeHTML(friend.handle || "unknown")}</h4>
        <p class="friend-major">${escapeHTML(friend.major)}</p>
        ${
          friend.mutualFriends > 0
            ? `
          <p class="mutual-friends">
            <i class="fas fa-users"></i>
            ${friend.mutualFriends} mutual friends
          </p>
        `
            : ""
        }
        ${this.renderScheduleAccessStatus(friend)}
      </div>
      <div class="friend-actions" data-friend-id="${friend.id}">
        <div class="friend-actions-compact">
          <a class="profile-view-btn" 
             href="#user?id=${encodeURIComponent(friend.id)}&from=friends"
             aria-label="View profile"
             title="View profile">
            <i class="fas fa-id-badge" aria-hidden="true"></i>
          </a>
          <button class="drawer-toggle-btn" 
                  data-friend-id="${friend.id}"
                  aria-expanded="false" 
                  aria-label="Show more options"
                  title="More options">
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </button>
          <button class="quick-access-star" 
                  data-friend-id="${friend.id}"
                  aria-label="Add to Quick Access"
                  title="Add to Quick Access">
            <i class="fas fa-star" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }

  _buildFriendDropdownInner(friend) {
    return `
      <button class="mutual-location-btn unknown" 
              data-friend-id="${friend.id}"
              aria-label="Mutual location status"
              title="Mutual location status">
        <i class="fas fa-map-marker-alt"></i>
      </button>
      <button class="mutual-schedule-btn unknown" 
              data-friend-id="${friend.id}"
              aria-label="Mutual schedule status"
              title="Mutual schedule status">
        <i class="fas fa-calendar"></i>
      </button>
      <div class="friend-options-container" data-friend-id="${friend.id}">
        <!-- FriendOptionsMenu will be rendered here -->
      </div>
    `;
  }

  /**
   * 🚀 Fast prefetch of friendship state to clear "unknown" button states quickly
   * Runs right after initial render; uses parallel reads and applies DOM updates
   * without waiting for realtime listeners or deeper privacy rendering.
   *
   * - Populates caches: scheduleVisibilityState, mutualStatus, locationVisibilityState,
   *   mutualLocationHandshake
   * - Immediately clears `.unknown` on mutual buttons and sets basic classes/icons
   */
  async _fastPrefetchFriendshipStatesAndApply(friends) {
    const currentUserUid = currentUser?.state?.user?.uid;
    if (!currentUserUid || !Array.isArray(friends) || friends.length === 0)
      return;

    // Build friendship IDs deterministically
    const entries = friends
      .map((f) => {
        const friendId = f.id || f.uid || f.friendId;
        if (!friendId || friendId === currentUserUid) return null;
        const friendshipId =
          f.friendshipId && typeof f.friendshipId === "string"
            ? f.friendshipId
            : currentUserUid < friendId
            ? `${currentUserUid}_${friendId}`
            : `${friendId}_${currentUserUid}`;
        return { friend: f, friendId, friendshipId };
      })
      .filter(Boolean);

    if (entries.length === 0) return;

    // Parallel fetch all friendship docs
    const docs = await Promise.all(
      entries.map(async ({ friendId, friendshipId }) => {
        try {
          const doc = await dataManager.getFriendshipDocument(friendshipId);
          return { friendId, friendshipId, doc };
        } catch (e) {
          return { friendId, friendshipId, doc: null };
        }
      })
    );

    // Update caches from docs
    docs.forEach(({ friendId, doc }) => {
      if (!doc) return;
      const sched = doc.scheduleVisibility || {};
      const loc = doc.locationVisibility || {};
      const handshake =
        doc.locationSharingMetadata?.mutualSharingEnabled === true;

      // Cache schedule mutual and my-side for quick icon application
      const mySched = sched[currentUserUid] === true;
      const friendSched = sched[friendId] === true;
      const mutualSched = mySched && friendSched;
      try {
        if (!this.scheduleVisibilityState)
          this.scheduleVisibilityState = new Map();
        this.scheduleVisibilityState.set(friendId, { my: !!mySched });
        if (!this.mutualStatus) this.mutualStatus = new Map();
        this.mutualStatus.set(friendId, !!mutualSched);
      } catch (_) {}

      // Cache location
      const myLoc = loc[currentUserUid] === true;
      const friendLoc = loc[friendId] === true;
      try {
        if (!this.locationVisibilityState)
          this.locationVisibilityState = new Map();
        this.locationVisibilityState.set(friendId, {
          my: !!myLoc,
          friend: !!friendLoc,
        });
        if (!this.mutualLocationHandshake)
          this.mutualLocationHandshake = new Map();
        this.mutualLocationHandshake.set(friendId, !!handshake);
      } catch (_) {}
    });

    // Apply DOM updates in a single pass
    entries.forEach(({ friend, friendId }) => {
      // Pending takes precedence: replace the location button with clock if needed
      const outgoingPending =
        this.outgoingLocationRequestsMap?.get(friendId) === true;
      const incomingPending =
        this.incomingLocationRequestsMap?.get(friendId) === true;
      const hasPending = outgoingPending || incomingPending;
      if (hasPending) {
        this._applyPendingUiIfChanged(friendId, friend.handle, true);
        // Skip normal location button tweaks when pending
      } else {
        // Location button: set classes and clear unknown quickly from cached doc
        const locBtn = document.querySelector(
          `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-location-btn`
        );
        const locIcon = locBtn?.querySelector("i");
        if (locBtn && locIcon) {
          const locState = this.locationVisibilityState?.get(friendId) || {
            my: false,
            friend: false,
          };
          const mutualLoc = !!(locState.my && locState.friend);
          locIcon.className = "fas fa-map-marker-alt";
          locBtn.classList.toggle("restricted", !mutualLoc);
          locBtn.classList.toggle("mine-visible", !!locState.my);
          locBtn.classList.toggle("mine-hidden", !locState.my);
          locBtn.classList.remove("unknown");
        }
      }

      // Schedule button: set mutual state and clear unknown
      const schedBtn = document.querySelector(
        `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-schedule-btn`
      );
      const schedIcon = schedBtn?.querySelector("i");
      if (schedBtn && schedIcon) {
        const mutual = this.mutualStatus?.get(friendId) === true;
        const mySched =
          this.scheduleVisibilityState?.get(friendId)?.my === true;
        schedIcon.className = mutual
          ? "fas fa-calendar-check"
          : "fas fa-calendar-times";
        schedBtn.classList.toggle("restricted", !mutual);
        schedBtn.classList.toggle("mine-visible", !!mySched);
        schedBtn.classList.toggle("mine-hidden", !mySched);
        schedBtn.classList.remove("unknown");
      }
    });
  }

  /**
   * 🧭 Ensure delegated handlers for the friend action drawer exist
   */
  _ensureFriendActionDrawerHandlers() {
    if (!this.elements?.friendsList) {
      console.warn("⚠️ friendsList container not found for drawer handlers");
      return;
    }

    if (!this._drawerHandlersAttached) {
      // Toggle button inside friends list (store handler for cleanup)
      if (!this._onDrawerToggleClick) {
        this._onDrawerToggleClick = (e) => {
          const toggleBtn = e.target.closest(".drawer-toggle-btn");
          if (toggleBtn) {
            const friendCard = toggleBtn.closest(".friend-card");
            const friendId = friendCard?.dataset.friendId;
            const expand = !friendCard?.classList.contains("drawer-open");
            this.toggleFriendActionsDrawer(friendId, expand);

            // First-time toast
            try {
              const key = "friendActionsDrawerHintShown";
              if (!localStorage.getItem(key) && expand) {
                notificationManager?.showSystemNotification?.(
                  "Privacy and more options live here.",
                  "info",
                  { duration: 2200 }
                );
                localStorage.setItem(key, "1");
              }
            } catch (err) {
              logWarn("Drawer hint notification failed", { error: err });
            }
          }
        };
      }
      this.elements.friendsList.addEventListener(
        "click",
        this._onDrawerToggleClick
      );

      // Close on outside click (ignore when modal/coachmark overlays are active)
      this._onDocumentClickCloseDrawer = (ev) => {
        const anyOpen = document.querySelector(".friend-card.drawer-open");
        if (!anyOpen) return;

        // If a modal or coachmark overlay is active, don't auto-close the drawer
        const modalActive = document.querySelector(".modal-overlay.active");
        const coachmarkActive = document.querySelector(
          ".coachmark-overlay, .coachmark-overlay.active"
        );
        try {
          if (hasActiveCoachMarks && hasActiveCoachMarks()) return;
        } catch (_) {}
        if (modalActive || coachmarkActive) return;

        const withinOpen = ev.target.closest?.(".friend-card.drawer-open");
        const withinDropdown = ev.target.closest?.(
          ".options-dropdown, .friend-options-menu, .glassmorphism-dropdown-active, .friend-actions-dropdown"
        );
        if (!withinOpen && !withinDropdown) {
          this.toggleFriendActionsDrawer(anyOpen.dataset.friendId, false);
        }
      };
      document.addEventListener("click", this._onDocumentClickCloseDrawer);

      // Note: We intentionally do NOT stopPropagation on capture for clicks inside
      // the dropdown, so delegated handlers on friendsList still receive them.
      // The outside-click closer already ignores clicks that originate within
      // '.friend-actions-dropdown' or friend option menus.

      // Close on Escape
      this._onKeydownCloseDrawer = (ev) => {
        if (ev.key === "Escape") {
          // If a modal or coachmark overlay is active, don't also close the drawer
          const modalActive = document.querySelector(".modal-overlay.active");
          const coachmarkActive = document.querySelector(
            ".coachmark-overlay, .coachmark-overlay.active"
          );
          try {
            if (hasActiveCoachMarks && hasActiveCoachMarks()) return;
          } catch (_) {}
          if (modalActive || coachmarkActive) return;

          const openCard = document.querySelector(".friend-card.drawer-open");
          if (openCard)
            this.toggleFriendActionsDrawer(openCard.dataset.friendId, false);
        }
      };
      document.addEventListener("keydown", this._onKeydownCloseDrawer);

      this._drawerHandlersAttached = true;
    }
  }

  /**
   * 🧭 Toggle the slide-out actions drawer for a friend card
   * @param {string} friendId
   * @param {boolean} expand
   */
  toggleFriendActionsDrawer(friendId, expand = undefined) {
    if (!friendId) return;
    const card = this.elements.friendsList?.querySelector(
      `.friend-card[data-friend-id="${friendId}"]`
    );
    if (!card) return;

    const toggleBtn = card.querySelector(".drawer-toggle-btn");
    const drawer = document.querySelector(
      `.friend-actions-dropdown[data-friend-id="${friendId}"]`
    );
    if (!toggleBtn || !drawer) return;

    const willExpand = expand ?? !card.classList.contains("drawer-open");
    logInfo("[Drawer] toggleFriendActionsDrawer", { friendId, willExpand });

    if (willExpand) {
      // Close others first for cleanliness
      document.querySelectorAll(".friend-card.drawer-open").forEach((el) => {
        if (el !== card)
          this.toggleFriendActionsDrawer(el.dataset.friendId, false);
      });

      card.classList.add("drawer-open");
      toggleBtn.setAttribute("aria-expanded", "true");
      drawer.setAttribute("aria-hidden", "false");
      const icon = toggleBtn.querySelector("i.fas");
      if (icon) {
        icon.classList.remove("fa-chevron-down");
        icon.classList.add("fa-chevron-up");
      }

      // Lazily refresh icons/pending state now that the drawer is visible
      try {
        this.refreshFriendActionsState(friendId);
      } catch (e) {
        logWarn("⚠️ Failed to refresh friend action state on open", {
          error: e,
        });
      }

      // Remember which drawer is open
      this.lastOpenDrawerFriendId = friendId;
    } else {
      card.classList.remove("drawer-open");
      toggleBtn.setAttribute("aria-expanded", "false");
      drawer.setAttribute("aria-hidden", "true");
      const icon = toggleBtn.querySelector("i.fas");
      if (icon) {
        icon.classList.remove("fa-chevron-up");
        icon.classList.add("fa-chevron-down");
      }

      // Clear tracker if we just closed the tracked drawer
      if (this.lastOpenDrawerFriendId === friendId) {
        this.lastOpenDrawerFriendId = null;
      }
    }
  }

  /**
   * 🔄 Apply the latest known privacy/location state to a specific card's drawer.
   * Runs when a drawer opens (lazy UI update per requirement).
   */
  async refreshFriendActionsState(friendId) {
    if (!friendId) return;
    // Simple re-entrancy guard per friend to avoid concurrent refresh races
    if (!this._refreshingStates) this._refreshingStates = new Set();
    if (this._refreshingStates.has(friendId)) {
      logInfo("🔁 Skipping refresh; one already in progress for friend", {
        friendId,
      });
      return;
    }
    this._refreshingStates.add(friendId);
    try {
      const card = this.elements.friendsList?.querySelector(
        `.friend-card[data-friend-id="${friendId}"]`
      );
      if (!card) return;

      const friend = this.currentFriendsData?.find((f) => f.id === friendId);
      const friendHandle = friend?.handle || "friend";

      // Schedule button: reflect mutual + my visibility (only if known)
      const scheduleBtn = document.querySelector(
        `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-schedule-btn`
      );
      if (scheduleBtn) {
        // Clear unknown placeholder state when resolving real status
        scheduleBtn.classList.remove("unknown");
        const icon = scheduleBtn.querySelector("i");
        let hasMutualKnown = this.mutualStatus?.has(friendId);
        let mutualAllowed = this.mutualStatus?.get(friendId) === true;
        let mySchedState = (this.scheduleVisibilityState || new Map()).get(
          friendId
        ) || { my: null };

        // If unknown, fetch once now to fill caches immediately
        if (!hasMutualKnown || mySchedState.my === null) {
          try {
            const currentUserUid = currentUser?.state?.user?.uid;
            if (currentUserUid) {
              const friendshipId =
                currentUserUid < friendId
                  ? `${currentUserUid}_${friendId}`
                  : `${friendId}_${currentUserUid}`;
              const friendshipDoc = await dataManager.getFriendshipDocument(
                friendshipId
              );
              const vis = friendshipDoc?.scheduleVisibility || {};
              const isMutual =
                vis[currentUserUid] === true && vis[friendId] === true;
              this.mutualStatus?.set(friendId, !!isMutual);
              if (!this.scheduleVisibilityState)
                this.scheduleVisibilityState = new Map();
              this.scheduleVisibilityState.set(friendId, {
                my: vis[currentUserUid] === true,
              });
              hasMutualKnown = true;
              mutualAllowed = !!isMutual;
              mySchedState = { my: vis[currentUserUid] === true };
            }
          } catch (_) {}
        }

        if (icon && hasMutualKnown) {
          icon.className = mutualAllowed
            ? "fas fa-calendar-check"
            : "fas fa-calendar-times";
          scheduleBtn.classList.toggle("restricted", !mutualAllowed);
        }
        if (mySchedState.my !== null) {
          scheduleBtn.classList.toggle("mine-visible", !!mySchedState.my);
          scheduleBtn.classList.toggle(
            "mine-hidden",
            mySchedState.my === false
          );
        }
      }

      // Location button: compute pending vs. normal classes lazily
      let hasVisKnown = this.locationVisibilityState?.has(friendId);
      let vis = (this.locationVisibilityState || new Map()).get(friendId) || {
        my: null,
        friend: null,
      };
      let handshakeEnabled =
        (this.mutualLocationHandshake || new Map()).get(friendId) === true;
      let hasPending =
        (this.outgoingLocationRequestsMap || new Map()).get(friendId) ===
          true ||
        (this.incomingLocationRequestsMap || new Map()).get(friendId) === true;

      // If unknown, fetch once now to fill caches immediately
      if (!hasVisKnown || vis.my === null || vis.friend === null) {
        try {
          const currentUserUid = currentUser?.state?.user?.uid;
          if (currentUserUid) {
            const friendshipId =
              currentUserUid < friendId
                ? `${currentUserUid}_${friendId}`
                : `${friendId}_${currentUserUid}`;
            const friendshipDoc = await dataManager.getFriendshipDocument(
              friendshipId
            );
            const loc = friendshipDoc?.locationVisibility || {};
            vis = {
              my: loc[currentUserUid] === true,
              friend: loc[friendId] === true,
            };
            handshakeEnabled =
              friendshipDoc?.locationSharingMetadata?.mutualSharingEnabled ===
              true;
            if (!this.locationVisibilityState)
              this.locationVisibilityState = new Map();
            this.locationVisibilityState.set(friendId, { ...vis });
            this.mutualLocationHandshake?.set(friendId, !!handshakeEnabled);
            hasVisKnown = true;
          }
        } catch (_) {}
      }

      // Source of truth: verify with Firestore notifications if local map says not pending
      if (!hasPending) {
        try {
          const currentUserUid = currentUser?.state?.user?.uid;
          if (currentUserUid) {
            const friendshipId =
              currentUserUid < friendId
                ? `${currentUserUid}_${friendId}`
                : `${friendId}_${currentUserUid}`;
            const exists =
              await dataManager.hasPendingOutgoingLocationShareRequest(
                currentUserUid,
                friendId,
                friendshipId
              );
            if (exists) {
              hasPending = true;
              try {
                this.outgoingLocationRequestsMap?.set(friendId, true);
              } catch (_) {}
            }
            // Also check if friend has sent me a pending request (incoming)
            try {
              const { collection, query, where, getDocs } = await import(
                "firebase/firestore"
              );
              const q = query(
                collection(db, "notifications"),
                where("userId", "==", currentUserUid),
                where("type", "==", "location_share_request"),
                where("status", "==", "pending")
              );
              const snap = await getDocs(q);
              const anyFromFriend = snap.docs.some(
                (d) => d.data()?.fromUserId === friendId
              );
              if (anyFromFriend) {
                hasPending = true;
                this.incomingLocationRequestsMap?.set(friendId, true);
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // If a pending request exists, show clock when either handshake isn’t yet enabled
      // or when my side is sharing but friend isn’t yet.
      const shouldShowPending =
        hasPending && (!handshakeEnabled || (!!vis.my && !vis.friend));

      // Apply pending UI if needed (idempotent); if not pending, ensure normal state
      this._applyPendingUiIfChanged(friendId, friendHandle, shouldShowPending);

      if (!shouldShowPending && hasVisKnown) {
        // Clear unknown placeholder state when we have visibility info
        const locBtnUnknown = document.querySelector(
          `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-location-btn`
        );
        locBtnUnknown?.classList?.remove("unknown");
        // Clear local optimistic pending marker if no longer pending
        try {
          this.outgoingLocationRequestsMap?.set(friendId, false);
        } catch (_) {}
        const locBtn = document.querySelector(
          `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-location-btn`
        );
        const locIcon = locBtn?.querySelector("i");
        const mutualLoc = vis.my === true && vis.friend === true;
        if (locBtn && locIcon) {
          locIcon.className = "fas fa-map-marker-alt";
          locBtn.classList.toggle("restricted", !mutualLoc);
          if (vis.my !== null) {
            locBtn.classList.toggle("mine-visible", !!vis.my);
            locBtn.classList.toggle("mine-hidden", vis.my === false);
          }
        }
      }
    } finally {
      // Clear re-entrancy guard
      this._refreshingStates.delete(friendId);
    }
  }

  /**
   * ⚡ Apply pending state immediately from cached maps after rendering friends
   * to avoid waiting for any network calls. Idempotent.
   */
  _applyPendingStateFromCachesForAllFriends() {
    try {
      (this.currentFriendsData || []).forEach((friend) => {
        const friendId = friend.id;
        const friendHandle = friend.handle;
        const outgoing =
          this.outgoingLocationRequestsMap.get(friendId) === true;
        const incoming =
          this.incomingLocationRequestsMap.get(friendId) === true;
        const hasPending = outgoing || incoming;
        if (!hasPending) return;
        // If we don't yet know handshake/visibility, still render pending clock to be safe
        this._applyPendingUiIfChanged(friendId, friendHandle, true);
      });
    } catch (_) {}
  }

  async maybeShowFriendActionsHint(friends) {
    if (!Array.isArray(friends) || friends.length === 0) {
      this.friendActionsHintPrimed = false;
      devLog(
        "[Friends Onboarding] Friend actions hint skipped - no friends yet"
      );
      return;
    }

    if (this.friendActionsHintShown || this.friendActionsHintPrimed) return;

    await onboardingService.init().catch(() => {});
    if (!onboardingService.shouldShow("friendActionsHintSeen")) {
      devLog("[Friends Onboarding] Friend actions hint suppressed by service");
      return;
    }

    const firstCard = this.elements.friendsList?.querySelector(".friend-card");
    if (!firstCard) {
      logInfo("[Friends Onboarding] Waiting for first friend card");
      setTimeout(
        () => this.maybeShowFriendActionsHint(friends),
        FRIENDS_HINT_RETRY_DELAY
      );
      return;
    }

    // Ensure the external actions drawer is open for the first card so buttons exist in DOM
    const firstFriendId = firstCard.dataset.friendId;
    const wasOpen = firstCard.classList.contains("drawer-open");
    if (firstFriendId) {
      try {
        logInfo("[Friends Onboarding] Ensuring drawer open before hints", {
          friendId: firstFriendId,
          wasOpen,
        });
        this.toggleFriendActionsDrawer(firstFriendId, true);
      } catch (e) {
        logWarn("[Friends Onboarding] Failed to open drawer before hints", {
          error: e,
        });
      }
    }

    // Query actions from the external dropdown sibling, not inside the card
    const dropdown = this.elements.friendsList?.querySelector(
      `.friend-actions-dropdown[data-friend-id="${firstFriendId}"]`
    );
    const locationBtn = dropdown?.querySelector(".mutual-location-btn");
    const scheduleBtn = dropdown?.querySelector(".mutual-schedule-btn");
    const starBtn = firstCard.querySelector(".quick-access-star");

    if (!locationBtn || !scheduleBtn || !starBtn) {
      logInfo("[Friends Onboarding] Friend action buttons not ready", {
        hasLocationBtn: !!locationBtn,
        hasScheduleBtn: !!scheduleBtn,
        hasStarBtn: !!starBtn,
      });
      setTimeout(
        () => this.maybeShowFriendActionsHint(friends),
        FRIENDS_HINT_RETRY_DELAY
      );
      return;
    }

    if (hasActiveCoachMarks() || this.hintsBusy) {
      devLog(
        "[Friends Onboarding] Another coachmark active, retrying friend actions hint"
      );
      setTimeout(
        () => this.maybeShowFriendActionsHint(friends),
        FRIENDS_HINT_RETRY_DELAY
      );
      return;
    }

    this.friendActionsHintShown = true;
    this.hintsBusy = true;
    logInfo("[Friends Onboarding] Starting friend actions hint sequence", {
      friendId: firstFriendId,
      wasOpen,
    });

    const ensureOpen = () => {
      try {
        const cardNow = this.elements.friendsList?.querySelector(
          `.friend-card[data-friend-id="${firstFriendId}"]`
        );
        const isOpenNow = cardNow?.classList?.contains("drawer-open");
        if (!isOpenNow) {
          logInfo("[Friends Onboarding] Re-opening drawer for hint step", {
            friendId: firstFriendId,
          });
          this.toggleFriendActionsDrawer(firstFriendId, true);
        }
      } catch (e) {
        logWarn("[Friends Onboarding] Failed to ensure drawer open", {
          error: e,
        });
      }
    };

    const steps = [
      // 1) Quick Access star first
      {
        targetResolver: () =>
          this.elements.friendsList?.querySelector(
            `.quick-access-star[data-friend-id="${firstFriendId}"]`
          ),
        buildConfig: () => ({
          id: "friend-actions-star",
          title: "Star friends",
          description:
            "Star this friend to see their updates on the schedule page.",
          highlightShape: "circle",
          responsivePlacement: { mobile: "bottom", desktop: "top" },
          maxWidth: getResponsiveCoachmarkWidth(200, 176),
          primaryButton: { text: "Next" },
        }),
      },
      // 2) Drawer toggle button hint – then open the drawer after acknowledge
      {
        targetResolver: () =>
          this.elements.friendsList?.querySelector(
            `.friend-card[data-friend-id="${firstFriendId}"] .drawer-toggle-btn`
          ),
        buildConfig: () => ({
          id: "friend-actions-drawer-toggle",
          title: "Privacy & Options",
          description:
            "Open this drawer for privacy toggles, and other options.",
          highlightShape: "circle",
          responsivePlacement: { mobile: "bottom", desktop: "top" },
          maxWidth: getResponsiveCoachmarkWidth(200, 176),
          primaryButton: { text: "Next" },
          onPrimary: () => {
            try {
              logInfo("[Friends Onboarding] Opening drawer after toggle hint", {
                friendId: firstFriendId,
              });
              this.toggleFriendActionsDrawer(firstFriendId, true);
            } catch (e) {
              logWarn("[Friends Onboarding] Failed opening drawer after hint", {
                error: e,
              });
            }
          },
        }),
      },
      // 3) Mutual location
      {
        targetResolver: () => {
          ensureOpen();
          return this.elements.friendsList?.querySelector(
            `.friend-actions-dropdown[data-friend-id="${firstFriendId}"] .mutual-location-btn`
          );
        },
        buildConfig: () => ({
          id: "friend-actions-location",
          title: "Location Privacy",
          description:
            "Toggle this button to hide/share your campus presence with this friend.",
          highlightShape: "circle",
          responsivePlacement: { mobile: "bottom", desktop: "top" },
          maxWidth: getResponsiveCoachmarkWidth(200, 176),
          primaryButton: { text: "Next" },
        }),
      },
      // 4) Mutual schedule
      {
        targetResolver: () => {
          ensureOpen();
          return this.elements.friendsList?.querySelector(
            `.friend-actions-dropdown[data-friend-id="${firstFriendId}"] .mutual-schedule-btn`
          );
        },
        buildConfig: () => ({
          id: "friend-actions-schedule",
          title: "Schedule Privacy",
          description:
            "Toggle this button to hide/share your schedule with this friend.",
          highlightShape: "circle",
          responsivePlacement: { mobile: "bottom", desktop: "top" },
          maxWidth: getResponsiveCoachmarkWidth(200, 176),
          primaryButton: { text: "Next" },
        }),
      },
      // 5) More options button
      {
        targetResolver: () => {
          ensureOpen();
          return this.elements.friendsList?.querySelector(
            `.friend-actions-dropdown[data-friend-id="${firstFriendId}"] .friend-options-container .options-button`
          );
        },
        buildConfig: () => ({
          id: "friend-actions-more",
          title: "More options",
          description: "Unfriending and other options are here.",
          highlightShape: "circle",
          responsivePlacement: { mobile: "top", desktop: "left" },
          maxWidth: getResponsiveCoachmarkWidth(200, 176),
          primaryButton: { text: "Done" },
        }),
      },
    ];

    for (const step of steps) {
      devLog("[Friends Onboarding] Showing friend action hint", {
        id: step.buildConfig().id,
      });
      const shown = await showCoachMarkWithRetries(step, {
        attempts: FRIENDS_HINT_MAX_ATTEMPTS,
        delayMs: FRIENDS_HINT_RETRY_DELAY,
      });

      if (!shown) {
        devLog("[Friends Onboarding] Friend action hint aborted", {
          id: step.buildConfig().id,
        });
        this.friendActionsHintShown = false;
        this.friendActionsHintPrimed = false;
        this.hintsBusy = false;
        return;
      }
      logInfo("[Friends Onboarding] Friend action hint acknowledged", {
        id: step.buildConfig().id,
      });
    }

    // Restore drawer state to original if we opened it only for hints
    try {
      if (!wasOpen) {
        logInfo("[Friends Onboarding] Restoring drawer closed state", {
          friendId: firstFriendId,
        });
        this.toggleFriendActionsDrawer(firstFriendId, false);
      }
    } catch (_) {}

    // After the full sequence, encourage starring with a subtle glow on the first card's star
    try {
      // Re-query the DOM by friendId in case the card re-rendered during hints
      const firstStar = this.elements.friendsList?.querySelector(
        `.quick-access-star[data-friend-id="${firstFriendId}"]`
      );
      if (firstStar && !firstStar.classList.contains("starred")) {
        firstStar.classList.add("onboarding-glow");
        // Remove glow when user interacts with the star
        const removeGlow = () => firstStar.classList.remove("onboarding-glow");
        firstStar.addEventListener("click", removeGlow, { once: true });
      }
    } catch (_) {}

    onboardingService
      .markSeen("friendActionsHintSeen", { allowPending: true })
      .catch(() => {})
      .finally(() => {
        this.friendActionsHintShown = false;
        this.friendActionsHintPrimed = true;
        this.hintsBusy = false;
      });
  }

  /**
   * ✨ After first star, glow the Schedule nav item and prepare friends bar hint
   */
  applyScheduleNavGlowAfterFirstStar() {
    try {
      // Avoid duplicates (namespace by UID for per-user state)
      const uid = currentUser?.uid || "guest";
      const glowKey = `campxus:onboarding:postStarNavGlow:${uid}`;
      const showHintKey = `campxus:onboarding:showFriendsBarHint:${uid}`;
      if (sessionStorage.getItem(glowKey) === "1") return;

      const isMobile = window.innerWidth <= 768;
      const desktopLink = document.querySelector(
        '.top-nav .nav-links a.nav-link[data-spa-route="home"]'
      );
      const mobileLink = document.querySelector(
        '.mobile-bottom-nav a.mobile-nav-item[data-spa-route="home"]'
      );

      const target = isMobile ? mobileLink : desktopLink;
      if (target) {
        target.classList.add("onboarding-glow");
        // Clicking schedule should remove glow and queue the friends bar hint on Home
        const handler = () => {
          try {
            target.classList.remove("onboarding-glow");
          } catch (_) {}
          sessionStorage.setItem(showHintKey, "1");
          sessionStorage.removeItem(glowKey);
          target.removeEventListener("click", handler);
        };
        target.addEventListener("click", handler);
        sessionStorage.setItem(glowKey, "1");

        // Fallback: if user navigates to schedule without clicking the glowing link,
        // convert the glow intent into a friends-bar hint on next home load.
        const onSpaLoad = (e) => {
          try {
            if (!e?.detail || e.detail.route !== "home") return;
            // Convert outstanding glow intent into showFriendsBarHint
            if (sessionStorage.getItem(glowKey) === "1") {
              try {
                target.classList.remove("onboarding-glow");
              } catch (_) {}
              sessionStorage.setItem(showHintKey, "1");
              sessionStorage.removeItem(glowKey);
            }
          } finally {
            document.removeEventListener("spa:page:load", onSpaLoad);
          }
        };
        document.addEventListener("spa:page:load", onSpaLoad, { once: true });
      }
    } catch (_) {}
  }

  /**
   * 📬 Refresh friend requests display
   */
  async refreshFriendRequests() {
    try {
      const requests = await friendsManager.getPendingRequests();
      this.displayFriendRequests(requests);
    } catch (error) {
      console.error("❌ Error refreshing friend requests:", error);
    }
  }

  /**
   * 📬 Display friend requests
   */
  displayFriendRequests(requests) {
    if (!this.elements.friendRequests) return;

    // Store friend requests data for accept/reject functionality
    this.currentFriendRequestsData = requests;

    if (requests.length === 0) {
      // Show empty state (it's already in the HTML)
      this.elements.friendRequests.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📬</div>
          <p>No pending friend requests</p>
        </div>
      `;
      console.log("📬 No friend requests to display");
      return;
    }

    console.log("📬 Displaying friend requests:", requests);

    const requestsHTML = requests
      .map(
        (request) => `
      <div class="friend-request-card" data-request-id="${request.id}">
                <div class="request-avatar">
          ${this.renderAvatar(request)}
        </div>
        <div class="request-info">
      <h4 class="request-name">@${escapeHTML(request.handle || "unknown")}</h4>
      <p class="request-major">${escapeHTML(request.major)}</p>
      <p class="request-university">${escapeHTML(request.university)}</p>
          <p class="request-time">
            <i class="fas fa-clock"></i>
            ${this.formatTimeAgo(request.createdAt)}
          </p>
        </div>
        <div class="request-actions">
          <button class="btn-accept-request" data-request-id="${
            request.id
          }" data-request-name="${escapeHTML(request.handle)}">
            <i class="fas fa-check"></i>
            Accept
          </button>
          <button class="btn-reject-request" data-request-id="${
            request.id
          }" data-request-name="${escapeHTML(request.handle)}">
            <i class="fas fa-times"></i>
            Decline
          </button>
        </div>
      </div>
    `
      )
      .join("");

    this.elements.friendRequests.innerHTML = requestsHTML;

    // Use event delegation - single listener, no memory leaks
    this.elements.friendRequests.addEventListener("click", async (e) => {
      if (e.target.closest(".btn-accept-request")) {
        const button = e.target.closest(".btn-accept-request");

        // Check if button is already disabled (processing)
        if (button.disabled) return;

        const requestId = button.dataset.requestId;
        await this.handleAcceptFriendRequest(
          requestId,
          this.currentFriendRequestsData.find((r) => r.id === requestId)
        );
      }

      if (e.target.closest(".btn-reject-request")) {
        const button = e.target.closest(".btn-reject-request");

        // Check if button is already disabled (processing)
        if (button.disabled) return;

        const requestId = button.dataset.requestId;
        await this.handleRejectFriendRequest(
          requestId,
          this.currentFriendRequestsData.find((r) => r.id === requestId)
        );
      }
    });
  }

  /**
   * ⏳ Show loading state
   */
  showLoadingState() {
    if (this.elements.friendsList) {
      const hasContent =
        this.elements.friendsList.innerHTML.trim().length > 0 &&
        !this.elements.friendsList.innerHTML.includes("skeleton-loader");
      if (hasContent) return;
      // Create 5 skeleton items
      const skeletons = Array(5)
        .fill('<div class="skeleton-loader"></div>')
        .join("");
      this.elements.friendsList.innerHTML = skeletons;
    }
  }

  /**
   * ✅ Hide loading state
   */
  hideLoadingState() {
    // The render function will overwrite the content, so we just need to ensure
    // we don't leave skeletons if the list is empty (handled by renderFriends)
    if (
      this.elements.friendsList &&
      this.elements.friendsList.innerHTML.includes("skeleton-loader")
    ) {
      this.elements.friendsList.innerHTML = "";
    }
  }

  /**
   * 🔍 Show search loading state
   */
  showSearchLoading() {
    const searchInput = this.elements.searchInput;
    if (searchInput) {
      searchInput.parentElement.classList.add("is-loading");
      // Add a spinner icon if not present
      let spinner = searchInput.parentElement.querySelector(".fa-spinner");
      if (!spinner) {
        const icon = searchInput.parentElement.querySelector(".fa-search");
        if (icon) {
          icon.classList.remove("fa-search");
          icon.classList.add("fa-spinner", "fa-spin");
        }
      }
    }
  }

  /**
   * 🔍 Hide search loading state
   */
  hideSearchLoading() {
    const searchInput = this.elements.searchInput;
    if (searchInput) {
      searchInput.parentElement.classList.remove("is-loading");
      // Restore search icon
      const icon = searchInput.parentElement.querySelector(".fa-spinner");
      if (icon) {
        icon.classList.remove("fa-spinner", "fa-spin");
        icon.classList.add("fa-search");
      }
    }
  }

  /**
   * 💬 Show user feedback messages
   */
  showMessage(message, type = "info") {
    try {
      notificationManager.show(message, type);
    } catch (e) {
      // Fallback if notificationManager isn't ready
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * 🎨 Render avatar using centralized utility (eliminates duplication)
   * @param {Object} userData - User data object from any source
   * @returns {string} HTML for avatar
   */
  renderAvatar(userData) {
    // Use the centralized avatar utility with cache-busting for fresh avatars
    // This ensures consistent avatar rendering across the entire app
    return renderUserAvatar(userData, false);
  }

  /**
   * Pre-render from cached friends list if available, then background-refresh.
   */
  async renderCachedFriendsIfAvailable() {
    try {
      const uid = currentUser?.state?.user?.uid;
      if (!uid) return;
      const cached = uiCache.get(uiCache.keys.friendsList(uid));
      if (
        Array.isArray(cached) &&
        cached.length > 0 &&
        this.elements?.friendsList
      ) {
        console.log("👥 Rendering friends from cache before fresh fetch", {
          count: cached.length,
        });
        await this.displayFriendsList(cached);
      }
    } catch (_) {
      // ignore
    }
  }

  /**
   * 🔒 Render enhanced schedule access status for friend cards (Phase 2.3)
   *
   * ENHANCED EXPLANATION:
   * This method creates dual privacy indicators showing both sides of the privacy relationship:
   * 1. "Your Schedule" - Current user's schedule visibility to this friend
   * 2. "Their Schedule" - Friend's schedule visibility to current user
   * 3. "Location Sharing" - Bilateral location sharing status between both users
   *
   * PRIVACY STATES SHOWN:
   * - Green eye = Schedule is visible/accessible
   * - Red lock = Schedule is hidden/restricted
   * - Green location icon = Bilateral location sharing enabled
   * - Red location icon = Location sharing disabled/restricted
   * - Clear messaging explains why avatars are disabled in quick access
   *
   * INTEGRATION WITH PHASE 1.2:
   * - Connects to quick access disabled avatar logic
   * - Shows why certain friends can't be viewed in schedule comparison
   * - Consistent messaging across all privacy components
   *
   * @param {Object} friend - Friend data object
   * @returns {string} HTML for enhanced dual privacy indicators with location sharing
   */
  renderScheduleAccessStatus(friend) {
    // Removed old inline indicators. All icons live in friend-actions.
    return ``;
  }

  /**
   * ⏰ Format time ago for friend requests
   * @param {Date|Object} timestamp - Timestamp from Firestore
   * @returns {string} Formatted time string
   */
  formatTimeAgo(timestamp) {
    if (!timestamp) return "Recently";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString();
  }

  /**
   * 📅 Format friends since date
   * @param {Date|Object} timestamp - Friendship start date
   * @returns {string} Formatted date string
   */
  formatFriendsSince(timestamp) {
    if (!timestamp) return "Recently";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  }

  /**
   * 📩 Handle sending friend request
   * @param {string} studentId - Target student ID
   * @param {Object} studentData - Student data object
   */
  async handleSendFriendRequest(studentId, studentData) {
    try {
      const buttonSel = `[data-student-id="${studentId}"].btn-send-request`;
      const buttonEl = document.querySelector(buttonSel);
      const targetHandle =
        studentData?.profile?.handle ||
        buttonEl?.dataset.studentName ||
        "unknown";

      if (!studentData) {
        try {
          studentData = await friendsManager.getUserSummary?.(studentId);
        } catch (err) {
          console.warn(
            "⚠️ Failed to fetch user summary via friendsManager",
            err
          );
        }
      }

      if (!studentData) {
        try {
          studentData = await dataManager.getUserProfileMinimal?.(studentId);
        } catch (err) {
          console.warn(
            "⚠️ Failed to fetch minimal profile for",
            studentId,
            err
          );
        }
      }

      console.log(`📩 Sending friend request to: @${targetHandle}`);

      // Show loading state on button
      const button = buttonEl;
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      }

      const result = await friendsManager.sendFriendRequest(
        studentId,
        studentData
      );

      if (result.success) {
        this.showMessage(result.message, "success");

        // 📋 Let the real-time system handle the button state updates
        // The real-time outgoing friend request listener will automatically update the
        // outgoingRequestsMap when the request is created in the database, which will
        // trigger the button to show the pending state through updateSearchResultsButtons()

        // Show immediate feedback by updating the button manually while we wait for real-time
        if (button) {
          console.log(
            `📋 Immediately updating button for ${studentId} to pending state`
          );
          button.className = "btn-pending-request";
          button.innerHTML = '<i class="fas fa-clock"></i>';
          button.disabled = true;
          button.setAttribute("title", "Friend request pending");
        }
        // 📊 Analytics: friend request sent
        try {
          AnalyticsService.trackFriendRequest("sent", {
            target_handle: targetHandle,
          });
        } catch {}
      } else {
        this.showMessage(result.message, "error");

        // Log error instead of showing notification
        console.error(result.message);

        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-user-plus"></i> Add';
        }
      }
    } catch (error) {
      console.error("❌ Error sending friend request:", error);
      const errorMessage = "Failed to send friend request. Please try again.";
      this.showMessage(errorMessage, "error");

      // Log error instead of showing notification
      console.error(errorMessage);

      // Reset button on error
      const button = document.querySelector(
        `[data-student-id="${studentId}"].btn-send-request, [data-student-id="${studentId}"].btn-pending-request`
      );
      if (button) {
        button.className = "btn-send-request";
        button.innerHTML = '<i class="fas fa-user-plus"></i> Add';
        button.disabled = false;
      }
    }
  }

  /**
   * ✅ Handle accepting friend request
   * @param {string} requestId - Request ID
   * @param {Object} requestData - Request data object
   */
  async handleAcceptFriendRequest(requestId, requestData) {
    try {
      // Safety check for requestData
      if (!requestData) {
        console.error("❌ No request data provided for accept operation");
        this.showMessage("Invalid request data", "error");
        return;
      }

      const senderName =
        requestData.handle ||
        requestData.fromUserInfo?.handle ||
        "Unknown User";

      console.log(`✅ Accepting friend request from: ${senderName}`);

      // Show loading state on button
      const button = document.querySelector(
        `[data-request-id="${requestId}"].btn-accept-request`
      );
      if (button) {
        button.disabled = true;
        button.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Accepting...';
      }

      const result = await friendsManager.acceptFriendRequest(
        requestId,
        requestData
      );

      if (result.success) {
        this.showMessage(result.message, "success");

        // Remove the request card
        const card = document.querySelector(`[data-request-id="${requestId}"]`);
        if (card) {
          card.style.opacity = "0.5";
          setTimeout(() => card.remove(), 500);
        }

        // Refresh the friend requests and friends list
        await this.refreshFriendRequests();
        await this.refreshFriendsList();

        // 📊 Analytics: friend request accepted
        try {
          const senderHandle =
            requestData?.handle ||
            requestData?.fromUserInfo?.handle ||
            "unknown";
          AnalyticsService.trackFriendRequest("accepted", {
            source_handle: senderHandle,
          });
        } catch {}
      } else {
        this.showMessage(result.message, "error");

        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-check"></i> Accept';
        }
      }
    } catch (error) {
      console.error("❌ Error accepting friend request:", error);
      const errorMessage = "Failed to accept friend request. Please try again.";
      this.showMessage(errorMessage, "error");

      // Log error instead of showing notification
      console.error(errorMessage);
    }
  }

  /**
   * ❌ Handle rejecting friend request
   * @param {string} requestId - Request ID
   * @param {Object} requestData - Request data object
   */
  async handleRejectFriendRequest(requestId, requestData) {
    try {
      // Safety check for requestData
      if (!requestData) {
        console.error("❌ No request data provided for reject operation");
        this.showMessage("Invalid request data", "error");
        return;
      }

      const senderName =
        requestData.handle ||
        requestData.fromUserInfo?.handle ||
        "Unknown User";

      console.log(`❌ Rejecting friend request from: ${senderName}`);

      // Show loading state on button
      const button = document.querySelector(
        `[data-request-id="${requestId}"].btn-reject-request`
      );
      if (button) {
        button.disabled = true;
        button.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Declining...';
      }

      const result = await friendsManager.rejectFriendRequest(
        requestId,
        requestData
      );

      if (result.success) {
        this.showMessage(result.message, "info");

        // Remove the request card
        const card = document.querySelector(`[data-request-id="${requestId}"]`);
        if (card) {
          card.style.opacity = "0.5";
          setTimeout(() => card.remove(), 500);
        }

        // Refresh the friend requests
        await this.refreshFriendRequests();

        // 📊 Analytics: friend request rejected
        try {
          const senderHandle =
            requestData?.handle ||
            requestData?.fromUserInfo?.handle ||
            "unknown";
          AnalyticsService.trackFriendRequest("rejected", {
            source_handle: senderHandle,
          });
        } catch {}
      } else {
        this.showMessage(result.message, "error");

        // Reset button
        if (button) {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-times"></i> Decline';
        }
      }
    } catch (error) {
      console.error("❌ Error rejecting friend request:", error);
      const errorMessage = "Failed to reject friend request. Please try again.";
      this.showMessage(errorMessage, "error");

      // Log error instead of showing notification
      console.error(errorMessage);
    }
  }

  /**
   * 📅 Handle viewing friend's schedule with privacy-aware checks (Phase 3.2)
   * @param {string} friendId - Friend's user ID
   * @param {string} friendName - Friend's display name
   */
  async handleViewFriendSchedule(friendId, friendName) {
    try {
      console.log(
        `📅 Attempting to view schedule for: ${friendName} (ID: ${friendId})`
      );

      const currentUserData = currentUser;
      if (!currentUserData?.uid) {
        console.error("❌ No current user found for privacy checks");
        notificationManager.showSystemNotification(
          "Authentication error - please sign in again",
          "error",
          { duration: 5000 }
        );
        return;
      }

      // Check privacy status using Phase 1 FriendshipPrivacyService
      console.log(`🔒 Checking schedule privacy for friend: ${friendId}`);
      const isRestricted =
        await friendshipPrivacyService.isQuickAccessRestricted(
          friendId,
          currentUserData.uid
        );

      if (isRestricted) {
        // Show restriction notification (standardized with HorizontalFriendsBar)
        console.log(`🔒 Schedule access restricted for ${friendName}`);
        notificationManager.showPrivacyNotification(
          friendName,
          "schedule",
          "access",
          { duration: 3000, type: "warning" }
        );
      } else {
        // Allow schedule access (placeholder for now)
        console.log(`✅ Schedule access allowed for ${friendName}`);
        this.showMessage(
          `Schedule comparison with ${friendName} coming soon!`,
          "info"
        );
      }
    } catch (error) {
      console.error(
        `❌ Error checking schedule privacy for ${friendName}:`,
        error
      );

      // Graceful fallback for privacy check failures
      notificationManager.showSystemNotification(
        "Unable to verify schedule access - please try again",
        "warning",
        { duration: 4000 }
      );
    }
  }

  /**
   * ⚙️ Handle friend menu options
   * @param {string} friendId - Friend's user ID
   */
  handleFriendMenu(friendId) {
    console.log(`⚙️ Friend menu for: ${friendId}`);

    // Find the friend's information from the current friends list
    const friend = this.currentFriendsData.find((f) => f.id === friendId);
    if (!friend) {
      console.error("❌ Friend not found in current data");
      this.showMessage("Friend not found", "error");
      return;
    }

    // Show unfriend confirmation modal
    showModal({
      title: "Unfriend Confirmation",
      content: `Are you sure you want to unfriend <strong>@${escapeHTML(
        friend.handle
      )}</strong>?<br><br>This action cannot be undone.`,
      isHtmlContent: true,
      showConfirmationButtons: true,
      confirmText: "Unfriend",
      cancelText: "Cancel",
      onConfirm: () => {
        this.performUnfriend(friend);
        return true; // Allow modal to close
      },
      onCancel: () => {
        console.log("💭 Unfriend cancelled by user");
      },
    });
  }

  /**
   * 💔 Perform the unfriend operation
   * @param {Object} friend - Friend object to unfriend
   * @private
   */
  async performUnfriend(friend) {
    try {
      console.log(
        "💔 Performing unfriend operation for handle:",
        friend.handle
      );

      // Show loading state
      this.showMessage("Unfriending...", "info");

      // Call the friends manager to unfriend the user
      const result = await friendsManager.unfriendUser(
        friend.id,
        friend.friendshipId,
        friend
      );

      if (result.success) {
        console.log("✅ Unfriend successful");
        this.showMessage(result.message, "success");

        // 📊 Analytics: unfriend action
        try {
          AnalyticsService.trackFriendRequest("unfriended", {
            target_handle: friend?.handle || "unknown",
          });
        } catch {}

        // The real-time listener will automatically update the friends list
        // No need to manually refresh since we have real-time updates
      } else {
        console.error("❌ Unfriend failed:", result.message);
        this.showMessage(result.message, "error");
      }
    } catch (error) {
      console.error("❌ Error during unfriend operation:", error);
      this.showMessage("Failed to unfriend user. Please try again.", "error");
    }
  }

  /**
   * 📋 Render the appropriate friend request button based on current status
   * @param {Object} student - Student data object
   * @returns {string} HTML for the friend request button
   */
  renderFriendRequestButton(student) {
    const studentId = student.id;
    const studentName = student.profile?.handle;

    // Check if there's an outgoing request to this user
    const outgoingRequest = this.outgoingRequestsMap.get(studentId);

    if (outgoingRequest && outgoingRequest.status === "pending") {
      return `
        <button class="btn-pending-request" data-student-id="${studentId}" data-student-name="${studentName}" disabled title="Friend request pending">
          <i class="fas fa-clock"></i>
        </button>
      `;
    }

    // For any other case (no request, rejected, or accepted) - show send request button
    // Users won't know if they were rejected, they can just send another request
    return `
      <button class="btn-send-request" data-student-id="${studentId}" data-student-name="${studentName}">
        <i class="fas fa-user-plus"></i>
        Add
      </button>
    `;
  }

  /**
   * 🔗 Render FriendOptionsMenu components with bilateral privacy and location controls
   *
   * ENHANCED MENU EXPLANATION:
   * This creates the three-dots menu for each friend card with options like:
   * - Hide/Show My Schedule (bilateral privacy - user controls their own visibility)
   * - Share location/Hide location (campus presence - user controls location sharing per friend)
   * - Unfriend
   *
   * Uses the new FriendshipPrivacyService for proper bilateral privacy management
   * and LocationPrivacyService for individual friend location sharing.
   *
   * @param {Array} friends - Array of friend objects
   */
  async renderFriendOptionsMenus(friends) {
    // Clean up existing menus first
    this.cleanupFriendOptionsMenus();

    // Render menus with bilateral privacy and location support
    const menuPromises = friends.map(async (friend) => {
      const friendId = friend.id || friend.uid;
      const container = this.elements.friendsList.querySelector(
        `.friend-options-container[data-friend-id="${friendId}"]`
      );

      if (container) {
        try {
          // Create new menu instance with bilateral privacy and location controls
          const menu = new FriendOptionsMenu(friend, {
            enableLocationSharing: true, // Enable location sharing option
            enableSchedulePrivacy: true, // Keep existing schedule privacy
            enableUnfriend: true, // Keep existing unfriend option
          });

          // Store reference for cleanup
          this.friendOptionMenus.set(friendId, menu);

          // Render into container (async for bilateral privacy and location setup)
          await menu.render(container);

          console.log(
            `🔗 Rendered enhanced menu with location controls for @${friend.handle}`
          );
        } catch (error) {
          console.error(
            `❌ Failed to render enhanced menu for @${friend.handle}:`,
            error
          );
          // Fallback: render without menu
        }
      } else {
        console.warn(`⚠️ Container not found for friend ${friendId}`);
      }
    });

    // Wait for all menus to render
    await Promise.all(menuPromises);

    // Set up event listeners for menu events
    this.setupFriendMenuEventListeners();
  }

  /**
   * 🎯 Set up event listeners for friend menu events
   *
   * ENHANCED EXPLANATION:
   * The FriendOptionsMenu components emit custom events when users interact with them.
   * We listen for these events and handle them appropriately.
   * Now includes location sharing change events in addition to privacy and unfriend events.
   */
  setupFriendMenuEventListeners() {
    const list = this.elements.friendsList;
    if (!list) {
      console.warn(
        "⚠️ friendsList element not found; cannot bind menu listeners"
      );
      return;
    }

    // Remove existing listeners to prevent duplicates
    if (this.friendsListEventHandler) {
      list.removeEventListener(
        "unfriend-requested",
        this.friendsListEventHandler
      );
      list.removeEventListener(
        "location-sharing-changed",
        this.friendsListEventHandler
      );
    }

    // Create bound handler for cleanup - handles unfriend and location sharing events
    // Privacy changes are handled directly in FriendOptionsMenu to prevent flickering
    this.friendsListEventHandler = (e) => {
      if (e.type === "unfriend-requested") {
        this.handleUnfriendRequested(e.detail);
      } else if (e.type === "location-sharing-changed") {
        this.handleLocationSharingChanged(e.detail);
      }
    };

    // Add event listeners - includes new location sharing events
    list.addEventListener("unfriend-requested", this.friendsListEventHandler);
    list.addEventListener(
      "location-sharing-changed",
      this.friendsListEventHandler
    );

    // Delegated click handler for all interactive controls
    if (this._delegatedClickBound) {
      list.removeEventListener("click", this._delegatedClickBound);
    }

    this._delegatedClickBound = async (e) => {
      const target = e.target;
      if (!target) return;
      // Debug trace for clicks (safe in browser without Node's process)
      try {
        const isDev =
          (typeof import.meta !== "undefined" &&
            import.meta.env &&
            import.meta.env.DEV) ||
          (typeof process !== "undefined" &&
            process?.env?.NODE_ENV !== "production");
        if (isDev) {
          console.log(
            "[FriendsList] click:",
            target.className || target.tagName
          );
        }
      } catch (_) {}

      // ⭐ Quick Access star button
      if (target.closest(".quick-access-star")) {
        const starButton = target.closest(".quick-access-star");
        const friendId = starButton.dataset.friendId;
        if (!friendId) return;
        if (starButton.disabled) return; // debounce
        await this.handleQuickAccessToggle(friendId, starButton);
        e.stopPropagation();
        return;
      }

      // 📅 Mutual schedule status toggle
      if (target.closest(".mutual-schedule-btn")) {
        const btn = target.closest(".mutual-schedule-btn");
        if (!btn) return;
        const friendId =
          btn?.dataset.friendId ||
          btn.closest(".friend-actions-dropdown")?.dataset.friendId;
        const friend = this.currentFriendsData.find((f) => f.id === friendId);
        if (!friendId || !friend) return;

        if (btn.classList.contains("loading")) return;
        btn.classList.add("loading");

        try {
          const userUid = currentUser.state?.user?.uid;
          if (!userUid) throw new Error("Not signed in");

          this.isUpdatingPrivacy = true; // suppress heavy re-renders

          // Optimistic flip: compute target state from current UI
          const iconEl = btn.querySelector("i");
          const wasVisible = btn.classList.contains("mine-visible");
          const targetVisible = !wasVisible;

          // Apply optimistic classes and icon immediately
          btn.classList.toggle("mine-visible", targetVisible);
          btn.classList.toggle("mine-hidden", !targetVisible);
          if (iconEl) {
            iconEl.className = targetVisible
              ? "fas fa-calendar-check"
              : "fas fa-calendar-times";
          }

          // Persist change
          const newVisible =
            await friendshipPrivacyService.toggleScheduleVisibility(
              userUid,
              friendId
            );

          // If backend result differs from optimistic target, correct it
          if (!!newVisible !== targetVisible) {
            btn.classList.toggle("mine-visible", !!newVisible);
            btn.classList.toggle("mine-hidden", !newVisible);
            if (iconEl) {
              iconEl.className = newVisible
                ? "fas fa-calendar-check"
                : "fas fa-calendar-times";
            }
          }

          if (newVisible) {
            setTimeout(() => {
              const mutual = this.mutualStatus.get(friendId);
              const stillRed = btn.classList.contains("restricted");
              if (mutual === false || stillRed === true) {
                showModal({
                  title: "Mutual Sharing Required",
                  content: `You made your schedule visible, but @${friend.handle} is still hidden. Both must share to enable mutual access.`,
                  showConfirmationButtons: true,
                  confirmText: "OK",
                  cancelText: "",
                });
              }
            }, 350);
          }

          if (newVisible) {
            notificationManager.showSystemNotification(
              `Your schedule is now visible to @${friend.handle}`,
              "success",
              { duration: 2500 }
            );
          } else {
            notificationManager.showSystemNotification(
              `You hid your schedule from @${friend.handle}`,
              "info",
              { duration: 2500 }
            );
          }
        } catch (err) {
          console.error("❌ Failed to toggle schedule visibility:", err);
          // Revert optimistic UI
          try {
            const iconEl = btn.querySelector("i");
            const wasVisible = !btn.classList.contains("mine-hidden");
            btn.classList.toggle("mine-visible", wasVisible);
            btn.classList.toggle("mine-hidden", !wasVisible);
            if (iconEl) {
              iconEl.className = wasVisible
                ? "fas fa-calendar-check"
                : "fas fa-calendar-times";
            }
          } catch (_) {}
          notificationManager.showSystemNotification(
            "Failed to update schedule privacy",
            "error",
            { duration: 3500 }
          );
        } finally {
          btn.classList.remove("loading");
          setTimeout(() => {
            this.isUpdatingPrivacy = false;
          }, 800);
          try {
            await this.refreshFriendActionsState(friendId);
          } catch (_) {}
        }

        e.stopPropagation();
        return;
      }

      // 📍 Mutual location status toggle with first-time request flow
      if (target.closest(".mutual-location-btn")) {
        const btn = target.closest(".mutual-location-btn");
        if (!btn) return;
        const friendId =
          btn?.dataset.friendId ||
          btn.closest(".friend-actions-dropdown")?.dataset.friendId;
        const friend = this.currentFriendsData.find((f) => f.id === friendId);
        if (!friendId || !friend) return;

        if (btn.classList.contains("loading")) return;
        btn.classList.add("loading");

        try {
          const userUid = currentUser.state?.user?.uid;
          if (!userUid) throw new Error("Not signed in");

          // Gate heavy realtime list refreshes while we toggle location privacy
          this.isUpdatingPrivacy = true;

          let friendshipId = friend.friendshipId;
          if (!friendshipId) {
            friendshipId =
              userUid < friendId
                ? `${userUid}_${friendId}`
                : `${friendId}_${userUid}`;
          }

          let mutualMeta = this.mutualLocationHandshake.get(friendId);
          if (typeof mutualMeta !== "boolean") {
            const friendshipDoc = await dataManager.getFriendshipDocument(
              friendshipId
            );
            mutualMeta =
              friendshipDoc?.locationSharingMetadata?.mutualSharingEnabled ===
              true;
          }

          if (!mutualMeta) {
            showModal({
              title: "Send Location Share Request",
              content: `Send location sharing request to @${friend.handle}? They will be notified. You only need to do this once.`,
              showConfirmationButtons: true,
              confirmText: "Send Request",
              cancelText: "Cancel",
              onConfirm: async () => {
                const revertUi = () => {
                  // Clear local pending markers and revert UI
                  try {
                    this.outgoingLocationRequestsMap?.set(friendId, false);
                  } catch (_) {}
                  this._applyPendingUiIfChanged(friendId, friend.handle, false);
                  btn.classList.remove("mine-visible");
                  btn.classList.add("mine-hidden");
                };
                // Optimistically mark as pending in local maps and UI
                try {
                  this.outgoingLocationRequestsMap?.set(friendId, true);
                } catch (_) {}
                this._applyPendingUiIfChanged(friendId, friend.handle, true);
                btn.classList.add("mine-visible");
                btn.classList.remove("mine-hidden");
                try {
                  // Gate realtime updates specifically during the request mutation
                  this.isUpdatingPrivacy = true;
                  const result = await friendsManager.requestLocationSharing(
                    friendId,
                    friendshipId
                  );
                  if (result?.success) {
                    notificationManager.showSystemNotification(
                      `Request sent to @${friend.handle}`,
                      "success",
                      { duration: 2500 }
                    );
                  } else {
                    revertUi();
                    notificationManager.showSystemNotification(
                      result?.message || "Failed to send request",
                      "error",
                      { duration: 3500 }
                    );
                  }
                } catch (reqErr) {
                  console.error(
                    "❌ Failed to send location share request:",
                    reqErr
                  );
                  revertUi();
                  notificationManager.showSystemNotification(
                    "Failed to send request",
                    "error",
                    { duration: 3500 }
                  );
                } finally {
                  // Refresh only this friend's actions and release gating shortly after
                  try {
                    await this.refreshFriendActionsState(friendId);
                  } catch (_) {}
                  setTimeout(() => {
                    this.isUpdatingPrivacy = false;
                  }, 800);
                }
                return true;
              },
            });
          } else {
            let state = this.locationVisibilityState.get(friendId);
            if (!state) {
              const friendshipDoc = await dataManager.getFriendshipDocument(
                friendshipId
              );
              const vis = friendshipDoc?.locationVisibility || {};
              state = {
                my: vis[userUid] === true,
                friend: vis[friendId] === true,
              };
            }

            if (state.my === true && state.friend === false) {
              showModal({
                title: "Mutual Location Sharing Required",
                content: `@${friend.handle} has hidden their location. Both must share to see each other.`,
                showConfirmationButtons: true,
                confirmText: "OK",
                cancelText: "",
              });
              e.stopPropagation();
              return;
            }

            const wasEnabled = !!state?.my;
            const targetEnabled = !wasEnabled;
            btn.classList.toggle("mine-visible", targetEnabled);
            btn.classList.toggle("mine-hidden", !targetEnabled);

            let newEnabled = targetEnabled;
            try {
              newEnabled =
                await friendshipPrivacyService.toggleLocationVisibility(
                  userUid,
                  friendId
                );
            } catch (toggleErr) {
              btn.classList.toggle("mine-visible", wasEnabled);
              btn.classList.toggle("mine-hidden", !wasEnabled);
              throw toggleErr;
            }

            if (newEnabled) {
              setTimeout(() => {
                const vis = this.locationVisibilityState.get(friendId);
                const isMutualNow =
                  vis && vis.my === true && vis.friend === true;
                if (!isMutualNow) {
                  showModal({
                    title: "Mutual Location Sharing Required",
                    content: `You enabled location sharing, but @${friend.handle} is still hidden. Both must share to see each other.`,
                    showConfirmationButtons: true,
                    confirmText: "OK",
                    cancelText: "",
                  });
                }
              }, 400);
            }
          }
        } catch (err) {
          console.error("❌ Failed to toggle/request location sharing:", err);
          notificationManager.showSystemNotification(
            "Failed to update location sharing",
            "error",
            { duration: 3500 }
          );
        } finally {
          btn.classList.remove("loading");
          try {
            await this.refreshFriendActionsState(friendId);
          } catch (_) {}
          // Release gating shortly after to let realtime updates settle without re-rendering
          setTimeout(() => {
            this.isUpdatingPrivacy = false;
          }, 800);
        }

        e.stopPropagation();
        return;
      }

      // 👥 Friend avatar click handling for schedule viewing
      if (target.closest(".friend-avatar")) {
        const avatarElement = target.closest(".friend-avatar");
        const friendCard = avatarElement.closest(".friend-card");
        if (friendCard) {
          const friendId = friendCard.dataset.friendId;
          const friend = this.currentFriendsData.find((f) => f.id === friendId);
          if (friend && friendId) {
            console.log(`👥 Friend avatar clicked: @${friend.handle}`);
            await this.handleViewFriendSchedule(friendId, friend.handle);
          } else {
            console.warn("⚠️ Friend data not found for avatar click");
          }
        }
      }
    };

    list.addEventListener("click", this._delegatedClickBound);

    console.log(
      "🎯 Friend menu event listeners set up (with delegated clicks and location sharing support)"
    );
  }

  /**
   * 🔒 Handle bilateral privacy change events from friend menus
   * @param {Object} detail - Event detail with friendId, myScheduleVisible, privacyStatus, friend
   */
  handlePrivacyChanged(detail) {
    const { friendId, myScheduleVisible, privacyStatus, friend } = detail;

    console.log(
      `🔒 Bilateral privacy changed for @${friend.handle}:`,
      privacyStatus
    );

    // Update the friend card to reflect new bilateral privacy state
    this.updateFriendCardBilateralPrivacyIndicator(friendId, privacyStatus);

    // Privacy changes are now silent - no notifications needed
  }

  /**
   * 👋 Handle unfriend requests from friend menus
   * @param {Object} detail - Event detail with friendId, friendName, friend
   */
  handleUnfriendRequested(detail) {
    const { friendId, friendName, friend } = detail;

    console.log(`👋 Unfriend requested for ${friendName}`);

    // Use existing unfriend logic
    this.handleUnfriend(friendId, friendName, friend);
  }

  /**
   * 📍 Handle location sharing changes from friend menus
   * @param {Object} detail - Event detail with type, enabled, friendId, etc.
   */
  handleLocationSharingChanged(detail) {
    const { type, enabled, friendId, component } = detail;

    console.log(`📍 Location sharing changed:`, detail);

    if (type === "friend" && friendId) {
      const friend = this.currentFriendsData.find((f) => f.id === friendId);
      const friendName = friend?.handle || "friend";

      // Log the change
      console.log(
        `📍 Location sharing with ${friendName} is now ${
          enabled ? "enabled" : "disabled"
        }`
      );

      // The LocationSharingToggle component already handles the actual service calls
      // and shows success/error notifications, so we just need to log here

      // Optional: Update any UI indicators if needed in the future
      // this.updateFriendLocationSharingIndicator(friendId, enabled);
    } else if (type === "global") {
      console.log(
        `📍 Global location sharing is now ${enabled ? "enabled" : "disabled"}`
      );

      // Optional: Update global indicators if needed in the future
      // this.updateGlobalLocationSharingIndicator(enabled);
    }
  }

  /**
   * 📡 Listen to friendship documents for visible cards and update the mutual icon immediately
   */
  async setupFriendCardPrivacyListeners(friends) {
    try {
      const currentUserUid = currentUser?.state?.user?.uid;
      if (!currentUserUid) return;

      const { doc, onSnapshot } = await import("firebase/firestore");

      // Clean up previous observers/listeners
      if (!this.friendshipPrivacyUnsubscribers)
        this.friendshipPrivacyUnsubscribers = new Map();
      if (this.friendshipPrivacyObserver) {
        try {
          this.friendshipPrivacyObserver.disconnect();
        } catch (_) {}
      }
      // Detach all existing listeners
      this.friendshipPrivacyUnsubscribers.forEach((unsub) => {
        try {
          if (typeof unsub === "function") unsub();
        } catch (_) {}
      });
      this.friendshipPrivacyUnsubscribers.clear();

      const attach = (friendId) => {
        if (this.friendshipPrivacyUnsubscribers.has(friendId)) return;
        const friendshipId =
          currentUserUid < friendId
            ? `${currentUserUid}_${friendId}`
            : `${friendId}_${currentUserUid}`;
        const ref = doc(db, "friendships", friendshipId);
        const unsub = onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const vis = data.scheduleVisibility || {};
            const mutualAllowed =
              vis[currentUserUid] === true && vis[friendId] === true;
            const myVisible = vis[currentUserUid] === true;
            // Cache schedule state lazily
            if (!this.scheduleVisibilityState)
              this.scheduleVisibilityState = new Map();
            this.scheduleVisibilityState.set(friendId, { my: !!myVisible });
            this.mutualStatus.set(friendId, mutualAllowed);

            // Reflect schedule changes immediately in DOM (drawer may be closed)
            const schedBtn = document.querySelector(
              `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-schedule-btn`
            );
            const schedIcon = schedBtn?.querySelector("i");
            if (schedBtn && schedIcon) {
              schedIcon.className = mutualAllowed
                ? "fas fa-calendar-check"
                : "fas fa-calendar-times";
              schedBtn.classList.toggle("restricted", !mutualAllowed);
              schedBtn.classList.toggle("mine-visible", !!myVisible);
              schedBtn.classList.toggle("mine-hidden", !myVisible);
            }

            // Update mutual-location button from locationVisibility and metadata
            const loc = data.locationVisibility || {};
            const mutualLoc =
              loc[currentUserUid] === true && loc[friendId] === true;
            const myLoc = loc[currentUserUid] === true;
            const friendLoc = loc[friendId] === true;
            // Pending UI based on outgoing notifications + visibility
            const friendObj = this.currentFriendsData.find(
              (f) => f.id === friendId
            );
            let outgoingPending =
              this.outgoingLocationRequestsMap.get(friendId) === true;
            let incomingPending =
              this.incomingLocationRequestsMap.get(friendId) === true;
            let hasPending = outgoingPending || incomingPending;
            // On cold start after refresh, if both maps are false, verify Firestore quickly
            if (!hasPending) {
              (async () => {
                try {
                  const exists =
                    await dataManager.hasPendingOutgoingLocationShareRequest(
                      currentUserUid,
                      friendId,
                      friendshipId
                    );
                  if (exists) {
                    outgoingPending = true;
                    hasPending = true;
                    try {
                      this.outgoingLocationRequestsMap?.set(friendId, true);
                    } catch (_) {}
                  }
                } catch (_) {}
                if (!hasPending) {
                  try {
                    const { collection, query, where, getDocs } = await import(
                      "firebase/firestore"
                    );
                    const q = query(
                      collection(db, "notifications"),
                      where("userId", "==", currentUserUid),
                      where("type", "==", "location_share_request"),
                      where("status", "==", "pending")
                    );
                    const snap = await getDocs(q);
                    const anyFromFriend = snap.docs.some(
                      (d) => d.data()?.fromUserId === friendId
                    );
                    if (anyFromFriend) {
                      incomingPending = true;
                      hasPending = true;
                      try {
                        this.incomingLocationRequestsMap?.set(friendId, true);
                      } catch (_) {}
                    }
                  } catch (_) {}
                }
                // Re-apply after verification
                const verifiedShouldShowPending =
                  hasPending && (!handshakeEnabled || (myLoc && !friendLoc));
                this._applyPendingUiIfChanged(
                  friendId,
                  friendObj?.handle,
                  verifiedShouldShowPending
                );
              })();
            }
            const handshakeEnabled =
              data.locationSharingMetadata?.mutualSharingEnabled === true;
            const shouldShowPending =
              (!handshakeEnabled && hasPending) ||
              (!!myLoc && !friendLoc && hasPending);
            // Cache location states lazily
            this.mutualLocationHandshake.set(friendId, handshakeEnabled);
            this.locationVisibilityState.set(friendId, {
              my: !!myLoc,
              friend: !!friendLoc,
            });

            // Reflect pending/normal state immediately (drawer may be closed)
            this._applyPendingUiIfChanged(
              friendId,
              friendObj?.handle,
              shouldShowPending
            );
            if (!shouldShowPending) {
              // Clear local optimistic pending marker when snapshot says not pending
              try {
                this.outgoingLocationRequestsMap?.set(friendId, false);
                this.incomingLocationRequestsMap?.set(friendId, false);
              } catch (_) {}
              const locBtn = document.querySelector(
                `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-location-btn`
              );
              const locIcon = locBtn?.querySelector("i");
              if (locBtn && locIcon) {
                locIcon.className = "fas fa-map-marker-alt";
                locBtn.classList.toggle("restricted", !mutualLoc);
                locBtn.classList.toggle("mine-visible", !!myLoc);
                locBtn.classList.toggle("mine-hidden", !myLoc);
              }
            }
          },
          (err) => {
            console.warn("⚠️ Friendship listener error", friendshipId, err);
          }
        );
        this.friendshipPrivacyUnsubscribers.set(friendId, unsub);
      };

      const detach = (friendId) => {
        const unsub = this.friendshipPrivacyUnsubscribers.get(friendId);
        if (unsub) {
          try {
            unsub();
          } catch (_) {}
          this.friendshipPrivacyUnsubscribers.delete(friendId);
        }
      };

      // IntersectionObserver to attach listeners only for visible cards
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const card = entry.target;
              const friendId = card?.dataset?.friendId;
              if (!friendId || friendId === currentUserUid) return;
              if (entry.isIntersecting) {
                attach(friendId);
              } else {
                detach(friendId);
              }
            });
          },
          { root: null, threshold: 0 }
        );

        this.friendshipPrivacyObserver = observer;
        // Observe all current friend cards
        friends.forEach((f) => {
          const fid = f.id || f.uid || f.friendId;
          if (!fid || fid === currentUserUid) return;
          const card = this.elements.friendsList?.querySelector(
            `.friend-card[data-friend-id="${fid}"]`
          );
          if (card) observer.observe(card);
        });
      } else {
        // Fallback: attach listeners for all cards
        friends.forEach((f) => {
          const fid = f.id || f.uid || f.friendId;
          if (!fid || fid === currentUserUid) return;
          attach(fid);
        });
      }
    } catch (e) {
      console.warn("⚠️ Failed to set up friend card privacy listeners:", e);
    }
  }

  /**
   * ⭐ Handle Quick Access star toggle (star/unstar friends)
   * @param {string} friendId - Friend's user ID
   * @param {HTMLElement} starButton - The star button element
   */
  async handleQuickAccessToggle(friendId, starButton) {
    try {
      // Snapshot Quick Access count (use cache) to detect first-star case
      let quickAccessBefore = 0;
      try {
        const before = await friendsManager.getQuickAccessFriends(true);
        quickAccessBefore = Array.isArray(before) ? before.length : 0;
      } catch (_) {}

      // Find the friend's information from the current friends list
      const friend = this.currentFriendsData.find((f) => f.id === friendId);
      if (!friend) {
        console.error("❌ Friend not found in current data");
        console.error("Friend not found");
        return;
      }

      // Instant UI: flip immediately, but do NOT derive the backend operation from DOM state.
      // The DOM can be stale during slow hydration / real-time delays; FriendsService is the source of truth.
      const uiWasStarred = starButton.classList.contains("starred");
      const uiNextStarred = !uiWasStarred;

      // Mark as pending so real-time sync can't momentarily flicker the UI
      this._pendingQuickAccessToggles.set(friendId, {
        desiredStarred: uiNextStarred,
        expiresAt: Date.now() + 2000,
      });

      // Optimistic UI: flip immediately and show fast "working" feedback
      this.updateStarButtonState(starButton, uiNextStarred);
      starButton.classList.add("loading");
      starButton.disabled = true; // debounce
      starButton.style.opacity = "0.85";

      console.log(`⭐ Toggling Quick Access for: @${friend.handle}`);

      const friendInfo = {
        handle: friend.handle,
        major: friend.major,
        avatarConfig: friend.avatarConfig,
        profilePhotoUrl: friend.profilePhotoUrl || null,
        profilePhotoThumbUrl: friend.profilePhotoThumbUrl || null,
        useAvatar:
          typeof friend.useAvatar === "boolean" ? friend.useAvatar : undefined,
        friendshipId: friend.friendshipId, // 🌍 Campus Presence: Required for bilateral location sharing checks
      };

      // Optimistic cache: update session/PWA cache so Schedule's friends bar can render instantly
      this._optimisticallyUpdateQuickAccessCaches(
        friendId,
        friend,
        uiNextStarred
      );

      let result;
      try {
        // Source of truth toggle (internally checks current Quick Access state from cache/Firestore)
        result = await friendsManager.toggleQuickAccess(friendId, friendInfo);
      } catch (e) {
        result = { success: false, message: e?.message || String(e) };
      }

      if (!result.success) {
        // Revert UI on failure
        this.updateStarButtonState(starButton, uiWasStarred);
        // Revert optimistic cache as well
        this._optimisticallyUpdateQuickAccessCaches(friendId, friend, uiWasStarred);
        console.error(result.message || "Failed to update Quick Access");
        console.error(
          `❌ Quick Access toggle failed for @${friend.handle}:`,
          result.message
        );

        // Best-effort reconcile: if the DOM was stale, refresh just this star from cached truth
        friendsManager
          .isInQuickAccess(friendId)
          .then((actualStarred) => {
            if (!starButton?.isConnected) return;
            this.updateStarButtonState(starButton, actualStarred);
            this._optimisticallyUpdateQuickAccessCaches(
              friendId,
              friend,
              actualStarred
            );
          })
          .catch(() => {});
      } else {
        const finalStarred =
          typeof result.isStarred === "boolean" ? result.isStarred : uiNextStarred;

        // Ensure UI/cache reflect the service-reported truth (handles stale DOM cases safely)
        this.updateStarButtonState(starButton, finalStarred);
        this._optimisticallyUpdateQuickAccessCaches(friendId, friend, finalStarred);

        const actionText =
          result.action === "removed" ? "removed from" : "added to";
        console.log(`@${friend.handle} ${actionText} Quick Access!`);
        console.log(`✅ Quick Access toggle successful for @${friend.handle}`);

        // If we just added and it was the first one, guide user to Schedule
        if (result.action === "added" && quickAccessBefore === 0) {
          this.applyScheduleNavGlowAfterFirstStar();
        }
      }
    } catch (error) {
      console.error("❌ Error in Quick Access toggle:", error);
      console.error("Something went wrong. Please try again.");
    } finally {
      // Re-enable button
      starButton.disabled = false;
      starButton.classList.remove("loading");
      starButton.style.opacity = "1";

      // Clear pending marker once the toggle attempt completes (success or failure).
      // Real-time sync will reconcile any residual differences.
      this._pendingQuickAccessToggles.delete(friendId);
    }
  }

  _optimisticallyUpdateQuickAccessCaches(friendId, friend, shouldBeStarred) {
    try {
      const uid =
        currentUser?.uid ||
        currentUser?.user?.uid ||
        currentUser?.state?.user?.uid;
      if (!uid) return;

      const key = uiCache.keys.quickAccessFriends(uid);
      const sessionList = uiCache.get(key);
      const persistedList = pwaCache.getQuickAccessFriends(uid);
      const base = Array.isArray(sessionList)
        ? sessionList
        : Array.isArray(persistedList)
          ? persistedList
          : [];

      const entry = buildQuickAccessCacheEntry(friendId, friend);
      if (!entry) return;

      const next = applyQuickAccessOptimisticUpdate(
        base,
        entry,
        shouldBeStarred ? "add" : "remove"
      );

      // Keep it around long enough for immediate navigation, but not "forever" in session.
      uiCache.set(key, next, 5 * 60 * 1000);
      // Persist a minimal snapshot for cold-start instant render
      pwaCache.saveQuickAccessFriends(uid, next);
    } catch (_) {
      // non-fatal
    }
  }

  /**
   * 🎨 Update star button visual state
   * @param {HTMLElement} starButton - The star button element
   * @param {boolean} isStarred - Whether the friend is starred
   */
  updateStarButtonState(starButton, isStarred) {
    const icon = starButton.querySelector("i");
    if (!icon) {
      console.warn("⚠️ Star button icon not found");
      return;
    }

    const friendId = starButton.dataset.friendId;
    console.log(
      `⭐ Updating star button for friend ${friendId}: isStarred=${isStarred}`
    );

    if (isStarred) {
      // Friend is starred - golden star
      icon.className = "fas fa-star";
      starButton.classList.add("starred");
      starButton.setAttribute("aria-label", "Remove from Quick Access");
      starButton.title = "Remove from Quick Access";
      console.log(`⭐ Set star to STARRED (golden) for friend ${friendId}`);
    } else {
      // Friend is not starred - outline star
      icon.className = "far fa-star";
      starButton.classList.remove("starred");
      starButton.setAttribute("aria-label", "Add to Quick Access");
      starButton.title = "Add to Quick Access";
      console.log(
        `⭐ Set star to NOT STARRED (outline) for friend ${friendId}`
      );
    }
  }

  /**
   * ⭐ Update Quick Access star states for all friend cards
   * @param {Array} friends - Array of friend objects
   */
  async updateAllQuickAccessStars(friends) {
    console.log(
      `⭐ Updating Quick Access star states for ${friends.length} friends`
    );

    try {
      // Always fetch a fresh snapshot of Quick Access friends from FriendsService.
      // FriendsService will still leverage DataManager's cache under the hood,
      // but this bypasses any stale in-memory TTL cache inside FriendsService itself.
      const quickAccessFriends = await friendsManager.getQuickAccessFriends(
        false
      );
      const starredFriendIds = new Set(
        (quickAccessFriends || [])
          .map((friend) => friend.friendId || friend.userId || friend.uid || friend.id)
          .filter(Boolean)
      );

      friends.forEach((friend) => {
        const friendId = friend.id;
        const isStarred = starredFriendIds.has(friendId);

        const starButton = this.elements.friendsList.querySelector(
          `.quick-access-star[data-friend-id="${friendId}"]`
        );

        if (starButton) {
          // If user just clicked this star, don't let background sync flicker it.
          const pending = this._pendingQuickAccessToggles.get(friendId);
          if (pending) {
            if (pending.expiresAt <= Date.now()) {
              this._pendingQuickAccessToggles.delete(friendId);
            } else if (pending.desiredStarred !== isStarred) {
              return;
            } else {
              this._pendingQuickAccessToggles.delete(friendId);
            }
          }
          this.updateStarButtonState(starButton, isStarred);
          console.log(
            `⭐ Updated star state for @${friend.handle}: ${
              isStarred ? "starred" : "not starred"
            }`
          );
        } else {
          console.warn(`⚠️ Star button not found for friend ${friendId}`);
        }
      });

      console.log(`✅ Quick Access star states updated for all friends`);
    } catch (error) {
      console.error("❌ Error updating all Quick Access star states:", error);
    }
  }

  /**
   * 👋 Handle unfriend operation (creates confirmation modal and calls performUnfriend)
   * @param {string} friendId - Friend's user ID
   * @param {string} friendName - Friend's display name
   * @param {Object} friend - Complete friend object (optional, will be found if not provided)
   */
  handleUnfriend(friendId, friendName, friend = null) {
    console.log(`👋 Handling unfriend request for ${friendName}`);

    // Find the friend object if not provided
    let friendObj = friend;
    if (!friendObj) {
      friendObj = this.currentFriendsData.find((f) => f.id === friendId);
      if (!friendObj) {
        console.error("❌ Friend not found in current data");
        this.showMessage("Friend not found", "error");
        return;
      }
    }

    // Show unfriend confirmation modal
    showModal({
      title: "Unfriend Confirmation",
      content: `Are you sure you want to unfriend <strong>${friendName}</strong>?<br><br>This action cannot be undone.`,
      isHtmlContent: true,
      showConfirmationButtons: true,
      confirmText: "Unfriend",
      cancelText: "Cancel",
      onConfirm: () => {
        this.performUnfriend(friendObj);
        return true; // Allow modal to close
      },
      onCancel: () => {
        console.log("💭 Unfriend cancelled by user");
      },
    });
  }

  /**
   * 🎨 Update privacy indicator in friend card
   * @param {string} friendId - Friend's user ID
   * @param {boolean} canSeeSchedule - Whether friend can see schedule
   */
  updateFriendCardPrivacyIndicator(friendId, canSeeSchedule) {
    const friendCard = this.elements.friendsList.querySelector(
      `.friend-card[data-friend-id="${friendId}"]`
    );

    if (friendCard) {
      const statusElement = friendCard.querySelector(".schedule-access");

      if (statusElement) {
        // Check if this is a bilateral privacy element - if so, don't override with can-see/cannot-see
        if (statusElement.classList.contains("bilateral-privacy")) {
          // Skip regular privacy update for bilateral privacy elements
          // They are managed by the bilateral privacy system
          return;
        }

        // Update classes for regular (non-bilateral) privacy elements
        statusElement.className = `schedule-access ${
          canSeeSchedule ? "can-see" : "cannot-see"
        }`;

        // Update icon
        const icon = statusElement.querySelector("i");
        if (icon) {
          icon.className = canSeeSchedule ? "fas fa-eye" : "fas fa-eye-slash";
        }

        // Update text
        const textSpan = statusElement.querySelector("span");
        if (textSpan) {
          textSpan.textContent = canSeeSchedule
            ? "Can see your schedule"
            : "Cannot see your schedule";
        }

        console.log(`🎨 Updated privacy indicator for ${friendId}`);
      }
    }
  }

  /**
   * 🎨 Update enhanced bilateral privacy indicators in friend card (Phase 2.3)
   * @param {string} friendId - Friend's user ID
   * @param {Object} privacyStatus - Bilateral privacy status from FriendshipPrivacyService
   */
  updateFriendCardBilateralPrivacyIndicator(friendId, privacyStatus) {
    const friendCard = this.elements.friendsList.querySelector(
      `.friend-card[data-friend-id="${friendId}"]`
    );

    if (friendCard && privacyStatus) {
      // Compute mutual schedule visibility (both sides must allow)
      const mutualAllowed = Boolean(
        (privacyStatus.mySchedule?.visible ?? true) &&
          (privacyStatus.friendSchedule?.visible ?? true)
      );

      // Update icon inside actions row and inline indicator (if present)
      const indicator = friendCard.querySelector(".mutual-schedule-indicator");
      // New UI: the schedule button/icon lives in the external drawer sibling
      const actionBtn = document.querySelector(
        `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-schedule-btn i`
      );
      if (indicator) {
        indicator.classList.remove(
          "mutual-allowed",
          "mutual-restricted",
          "mutual-unknown"
        );
        indicator.classList.add(
          mutualAllowed ? "mutual-allowed" : "mutual-restricted",
          "privacy-changed"
        );

        const icon = indicator.querySelector("i");
        if (icon)
          icon.className = mutualAllowed
            ? "fas fa-calendar-check"
            : "fas fa-calendar-times";

        const friend = this.currentFriendsData.find((f) => f.id === friendId);
        const friendName = friend?.handle || "Friend";
        const titleText = mutualAllowed
          ? `Mutual: You and ${friendName} can view each other's schedules`
          : `Restricted: Schedule sharing is not mutual`;
        indicator.title = titleText;
      }

      if (actionBtn) {
        actionBtn.className = mutualAllowed
          ? "fas fa-calendar-check"
          : "fas fa-calendar-times";
      }

      // Apply glow based on current user's own schedule visibility
      const actionBtnContainer = document.querySelector(
        `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-schedule-btn`
      );
      if (actionBtnContainer) {
        const myVisible = privacyStatus.mySchedule?.visible === true;
        actionBtnContainer.classList.toggle("mine-visible", !!myVisible);
        actionBtnContainer.classList.toggle("mine-hidden", !myVisible);
      }

      // Toggle restricted class on the action button container
      if (actionBtnContainer) {
        actionBtnContainer.classList.toggle("restricted", !mutualAllowed);
      }

      console.log(
        `🎨 Updated mutual schedule status for ${friendId}: ${
          mutualAllowed ? "ALLOWED" : "RESTRICTED"
        }`
      );
    }
  }

  /**
   * 🎨 Update a single privacy indicator element
   * @param {HTMLElement} element - The privacy indicator element
   * @param {Object} privacyState - Privacy state object {visible, description}
   * @param {string} type - "user" or "friend" to determine messaging
   * @param {string} friendId - Friend ID for logging
   * @private
   */
  // Legacy one-way indicators removed; using single mutual icon now

  /**
   * 🔐 Update all friend cards with bilateral privacy status after initial render
   * @param {Array} friends - Array of friend objects
   */
  async updateAllFriendCardsBilateralPrivacy(friends) {
    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.warn("⚠️ No current user found for bilateral privacy updates");
      return;
    }

    if (!friends || !Array.isArray(friends) || friends.length === 0) {
      console.log("📋 No friends to update bilateral privacy for");
      return;
    }

    console.log(
      `🔐 Updating bilateral privacy for ${friends.length} friend cards`
    );

    const privacyPromises = friends.map(async (friend) => {
      const friendId = friend.id || friend.uid || friend.friendId;

      if (!friendId) {
        console.warn("⚠️ Friend object missing ID:", friend);
        return;
      }

      if (friendId === currentUserUid) {
        console.warn(
          "⚠️ Skipping bilateral privacy update for self:",
          friendId
        );
        return;
      }

      try {
        console.log(
          `🔐 Updating enhanced bilateral privacy for friend: ${friendId} (@${friend.handle})`
        );

        // Get bilateral privacy status for this friendship
        const privacyStatus = await friendshipPrivacyService.getPrivacyStatus(
          currentUserUid,
          friendId
        );

        if (privacyStatus) {
          // Update mutual schedule icon in actions + inline indicator
          this.updateFriendCardBilateralPrivacyIndicator(
            friendId,
            privacyStatus
          );

          // Also update action button background color class (green/red)
          const btn = document.querySelector(
            `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-schedule-btn`
          );
          if (btn) {
            const mutualAllowed = Boolean(
              (privacyStatus.mySchedule?.visible ?? true) &&
                (privacyStatus.friendSchedule?.visible ?? true)
            );
            btn.classList.toggle("restricted", !mutualAllowed);
          }
          console.log(
            `✅ Updated enhanced bilateral privacy for @${friend.handle}`
          );
        } else {
          console.warn(
            `⚠️ No privacy status found for friendship: ${currentUserUid} ↔ ${friendId}`
          );

          // Set default privacy states if no status found
          const defaultPrivacyStatus = {
            mySchedule: { visible: true, description: "visible to them" },
            friendSchedule: { visible: true, description: "accessible to you" },
          };

          this.updateFriendCardBilateralPrivacyIndicator(
            friendId,
            defaultPrivacyStatus
          );
          console.log(
            `🔧 Applied default privacy status for @${friend.handle}`
          );
        }

        // 📍 Update location sharing indicators
        await this.updateFriendCardLocationSharingIndicator(friendId, friend);
      } catch (error) {
        console.warn(
          `⚠️ Failed to update enhanced bilateral privacy for @${friend.handle}:`,
          error
        );

        // Apply fallback privacy status on error
        const fallbackPrivacyStatus = {
          mySchedule: { visible: true, description: "status unknown" },
          friendSchedule: {
            visible: false,
            description: "access restricted (error)",
          },
        };

        this.updateFriendCardBilateralPrivacyIndicator(
          friendId,
          fallbackPrivacyStatus
        );
      }
    });

    // Wait for all privacy updates to complete
    await Promise.all(privacyPromises);

    console.log(`✅ Bilateral privacy updated for all friend cards`);
  }

  /**
   * 📍 Update friend card location sharing indicator based on bilateral location sharing status
   * @param {string} friendId - Friend's user ID
   * @param {Object} friend - Friend data object
   */
  async updateFriendCardLocationSharingIndicator(friendId, friend) {
    try {
      const currentUserUid = currentUser.state?.user?.uid;
      if (!currentUserUid) {
        console.warn("⚠️ No current user found for location sharing update");
        return;
      }

      console.log(
        `📍 Updating location sharing indicator for: @${friend.handle}`
      );

      // Get the friendship document to check bilateral location sharing
      const friendshipId = friend.friendshipId;
      if (!friendshipId) {
        console.warn(`⚠️ No friendship ID found for @${friend.handle}`);
        this.updateLocationSharingVisualIndicator(
          friendId,
          false,
          "Friendship not found"
        );
        return;
      }

      // Get friendship document from DataService
      const friendship = await dataManager.getFriendshipDocument(friendshipId);
      if (!friendship) {
        console.warn(`⚠️ Friendship document not found: ${friendshipId}`);
        this.updateLocationSharingVisualIndicator(
          friendId,
          false,
          "Friendship data not available"
        );
        return;
      }

      // Check bilateral location sharing status
      const locationVisibility = friendship.locationVisibility || {};
      const currentUserSharing = locationVisibility[currentUserUid] === true;
      const friendSharing = locationVisibility[friendId] === true;
      const mutualLocationSharing = currentUserSharing && friendSharing;

      console.log(`📍 Location sharing status for @${friend.handle}:`, {
        currentUserSharing,
        friendSharing,
        mutualLocationSharing,
        locationVisibility,
      });

      // Update last-known visibility state for this friend
      this.locationVisibilityState.set(friendId, {
        my: !!currentUserSharing,
        friend: !!friendSharing,
      });

      // Determine pending from both outgoing and incoming notifications
      let outgoingPending =
        this.outgoingLocationRequestsMap.get(friendId) === true;
      let incomingPending =
        this.incomingLocationRequestsMap.get(friendId) === true;
      let hasPending = outgoingPending || incomingPending;

      // If maps don't show pending (e.g., fresh reload), verify against Firestore directly
      if (!hasPending) {
        try {
          const exists =
            await dataManager.hasPendingOutgoingLocationShareRequest(
              currentUserUid,
              friendId,
              friendshipId
            );
          if (exists) {
            hasPending = true;
            outgoingPending = true;
            try {
              this.outgoingLocationRequestsMap?.set(friendId, true);
            } catch (_) {}
          }
        } catch (_) {}

        // Also verify pending requests sent BY friend TO me (incoming)
        if (!hasPending) {
          try {
            const { collection, query, where, getDocs } = await import(
              "firebase/firestore"
            );
            const q = query(
              collection(db, "notifications"),
              where("userId", "==", currentUserUid),
              where("type", "==", "location_share_request"),
              where("status", "==", "pending")
            );
            const snap = await getDocs(q);
            const anyFromFriend = snap.docs.some(
              (d) => d.data()?.fromUserId === friendId
            );
            if (anyFromFriend) {
              hasPending = true;
              incomingPending = true;
              try {
                this.incomingLocationRequestsMap?.set(friendId, true);
              } catch (_) {}
            }
          } catch (_) {}
        }
      }

      const handshakeEnabled =
        friendship.locationSharingMetadata?.mutualSharingEnabled === true;
      const shouldShowPending =
        hasPending &&
        (!handshakeEnabled || (currentUserSharing && !friendSharing));

      // Update the action button (mutual-location-btn)
      const friendCard = this.elements.friendsList.querySelector(
        `.friend-card[data-friend-id="${friendId}"]`
      );

      // Apply pending UI if needed (idempotent)
      this._applyPendingUiIfChanged(friendId, friend.handle, shouldShowPending);

      // If not pending, ensure normal button reflects latest classes
      if (!shouldShowPending) {
        // New UI: location button in external drawer sibling
        const btn = document.querySelector(
          `.friend-actions-dropdown[data-friend-id="${friendId}"] .mutual-location-btn`
        );
        const icon = btn?.querySelector("i");
        if (btn && icon) {
          icon.className = "fas fa-map-marker-alt";
          btn.classList.toggle("restricted", !mutualLocationSharing);
          btn.classList.toggle("mine-visible", !!currentUserSharing);
          btn.classList.toggle("mine-hidden", !currentUserSharing);
          btn.classList.remove("unknown");
          btn.title = mutualLocationSharing
            ? "Mutual: You and this friend share location"
            : currentUserSharing && !friendSharing
            ? "You share location, they don't"
            : !currentUserSharing && friendSharing
            ? "They share location, you don't"
            : "Location sharing disabled";
        }
      }

      console.log(
        `✅ Updated location sharing indicator for @${friend.handle}`
      );
    } catch (error) {
      console.error(
        `❌ Error updating location sharing indicator for @${friend.handle}:`,
        error
      );
      this.updateLocationSharingVisualIndicator(
        friendId,
        false,
        "Error checking location status"
      );
    }
  }

  /**
   * Replace/restore the mutual-location button with a pending clock button (disabled) while awaiting response
   */
  _setLocationRequestPendingUI(friendId, friendHandle, isPending) {
    try {
      const friendCard = this.elements.friendsList?.querySelector(
        `.friend-card[data-friend-id="${friendId}"]`
      );
      if (!friendCard) return;
      const actions = friendCard.querySelector(".friend-actions");
      if (!actions) return;

      const externalDrawer = document.querySelector(
        `.friend-actions-dropdown[data-friend-id="${friendId}"]`
      );
      const internalDrawer = friendCard.querySelector(".friend-actions-drawer");
      const container = externalDrawer || internalDrawer || actions;
      if (!container) return;

      const existingPending = container.querySelector(
        `.btn-pending-request[data-student-id="${friendId}"]`
      );
      // Prefer the external drawer's location button for replacement
      let locationBtn = externalDrawer?.querySelector(".mutual-location-btn");
      if (!locationBtn) {
        locationBtn = container.querySelector(".mutual-location-btn");
      }

      if (isPending) {
        // Already pending – nothing to do
        if (existingPending && container.contains(existingPending)) return;

        // Create pending clock button and replace the location button
        const pendingBtn = document.createElement("button");
        pendingBtn.className = "btn-pending-request";
        pendingBtn.setAttribute("data-student-id", friendId);
        pendingBtn.setAttribute("data-friend-id", friendId);
        pendingBtn.setAttribute("data-student-name", friendHandle || "friend");
        pendingBtn.setAttribute("disabled", "");
        pendingBtn.setAttribute("title", "Location share request pending");
        pendingBtn.innerHTML = '<i class="fas fa-clock"></i>';

        if (locationBtn && locationBtn.parentElement === container) {
          container.replaceChild(pendingBtn, locationBtn);
        } else if (locationBtn && locationBtn.parentElement) {
          locationBtn.parentElement.replaceChild(pendingBtn, locationBtn);
        } else {
          const anchor = container.firstChild || null;
          container.insertBefore(pendingBtn, anchor);
        }
      } else {
        // Remove pending and ensure location button exists with correct classes (no green flash)
        if (existingPending && container.contains(existingPending)) {
          const newLocBtn = document.createElement("button");
          newLocBtn.className = "mutual-location-btn";
          newLocBtn.setAttribute("data-friend-id", friendId);
          newLocBtn.setAttribute("aria-label", "Mutual location status");
          newLocBtn.setAttribute("title", "Mutual location status");
          newLocBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i>';

          // Apply state-aware classes immediately
          const vis = this.locationVisibilityState.get(friendId) || {
            my: false,
            friend: false,
          };
          const mutual = vis.my === true && vis.friend === true;
          if (!mutual) newLocBtn.classList.add("restricted");
          if (vis.my) newLocBtn.classList.add("mine-visible");
          if (!vis.my) newLocBtn.classList.add("mine-hidden");

          const parent = existingPending.parentElement;
          if (parent) {
            parent.replaceChild(newLocBtn, existingPending);
          } else if (container) {
            const anchor = container.firstChild || null;
            container.insertBefore(newLocBtn, anchor);
            if (existingPending.remove) existingPending.remove();
          }
        }
      }
    } catch (error) {
      logError("DOM manipulation failed in _setLocationRequestPendingUI", {
        friendId,
        error: error?.message || String(error),
      });
    }
  }

  /**
   * Idempotent wrapper to apply pending UI only when state changes (prevents flicker)
   */
  _applyPendingUiIfChanged(friendId, friendHandle, shouldShowPending) {
    const prev = this._pendingLocationUi.get(friendId) === true;
    if (prev === !!shouldShowPending) return; // no change → no DOM churn
    this._pendingLocationUi.set(friendId, !!shouldShowPending);
    this._setLocationRequestPendingUI(
      friendId,
      friendHandle,
      !!shouldShowPending
    );
  }

  /**
   * 🎨 Update the visual location sharing indicator in the friend card
   * @param {string} friendId - Friend's user ID
   * @param {boolean} isMutualSharingEnabled - Whether bilateral location sharing is enabled
   * @param {string} statusMessage - Status message for tooltip
   */
  updateLocationSharingVisualIndicator() {}

  /**
   * 🧹 Clean up friend options menus and real-time listeners
   */
  cleanupFriendOptionsMenus() {
    this.friendOptionMenus.forEach((menu, friendId) => {
      try {
        menu.destroy();
      } catch (error) {
        console.warn(`⚠️ Error destroying menu for friend ${friendId}:`, error);
      }
    });

    this.friendOptionMenus.clear();

    // Remove event listeners
    if (this.friendsListEventHandler) {
      this.elements.friendsList.removeEventListener(
        "privacy-changed",
        this.friendsListEventHandler
      );
      this.elements.friendsList.removeEventListener(
        "unfriend-requested",
        this.friendsListEventHandler
      );
      this.elements.friendsList.removeEventListener(
        "location-sharing-changed",
        this.friendsListEventHandler
      );
      this.friendsListEventHandler = null;
    }

    console.log("🧹 Friend options menus cleaned up");
  }

  /**
   * ⭐ Handle real-time Quick Access updates from other tabs/sessions
   * Updates the star states without refetching data
   * @param {Object} quickAccessData - Quick Access update data
   */
  async handleRealTimeQuickAccessUpdate(quickAccessData) {
    try {
      console.log(
        "⭐ Processing real-time Quick Access update:",
        quickAccessData
      );

      const quickAccessFriends = Array.isArray(quickAccessData)
        ? quickAccessData
        : Array.isArray(quickAccessData?.quickAccessFriends)
          ? quickAccessData.quickAccessFriends
          : Array.isArray(quickAccessData?.items)
            ? quickAccessData.items
            : [];

      // Convert quickAccessFriends array to Set for efficient lookup
      const starredFriendIds = new Set(
        (quickAccessFriends || [])
          .map((qaf) => qaf.friendId || qaf.userId || qaf.uid || qaf.id)
          .filter(Boolean)
      );

      // Update all star buttons based on the new Quick Access data
      const allStarButtons =
        this.elements.friendsList?.querySelectorAll(".quick-access-star") || [];

      allStarButtons.forEach((starButton) => {
        const friendId = starButton.dataset.friendId;
        if (friendId) {
          const isStarred = starredFriendIds.has(friendId);
          // If the user just clicked this star, prefer the click for a short window.
          const pending = this._pendingQuickAccessToggles.get(friendId);
          if (pending) {
            if (pending.expiresAt <= Date.now()) {
              this._pendingQuickAccessToggles.delete(friendId);
            } else if (pending.desiredStarred !== isStarred) {
              return;
            } else {
              this._pendingQuickAccessToggles.delete(friendId);
            }
          }
          this.updateStarButtonState(starButton, isStarred);
        }
      });

      console.log(
        `⭐ Updated ${allStarButtons.length} star button states from real-time sync`
      );

      // Skip notifications for real-time updates
      // The main star/unstar actions already show success notifications
    } catch (error) {
      console.error("❌ Error handling real-time Quick Access update:", error);
    }
  }

  /**
   * 🔒 Handle schedule privacy change events (Phase 4.1)
   * Updates bilateral privacy indicators when friends change their privacy settings
   * @param {Object} privacyEvent - Privacy change event data
   */
  async handlePrivacyChange(privacyEvent) {
    try {
      console.log(
        "🔒 Processing privacy change event in FriendsPage:",
        privacyEvent
      );

      // Extract data using the correct field names from the event
      const { fromUserId, affectedUserId, scheduleVisibility, friendName } =
        privacyEvent;

      const currentUserUid = currentUser?.user?.uid;

      if (!currentUserUid) {
        console.log("🔒 No current user - skipping privacy update");
        return;
      }

      // Check if this privacy change affects the current user
      // In bilateral privacy: fromUserId changed their schedule visibility to affectedUserId
      const isCurrentUserAffected =
        fromUserId === currentUserUid || // Current user changed their own privacy
        affectedUserId === currentUserUid; // Privacy change affects current user

      if (!isCurrentUserAffected) {
        console.log(
          "🔒 Privacy change doesn't affect current user - skipping update"
        );
        return;
      }

      console.log(
        `🔒 Current user IS affected by privacy change: ${
          friendName || "Friend"
        } ${scheduleVisibility ? "showed" : "hid"} their schedule`
      );

      // Update only the affected friend card to avoid heavy re-render
      const friendId =
        fromUserId === currentUserUid ? affectedUserId : fromUserId;
      if (!friendId) return;

      // Let the onSnapshot listener update the UI; just handle success toast here
      const existingTimer = this.privacyUpdateTimers.get(friendId);
      if (existingTimer) clearTimeout(existingTimer);
      const timerId = setTimeout(() => {
        const now = this.mutualStatus.get(friendId);
        const prev = this._prevMutualStatus || new Map();
        const was = prev.get(friendId);
        if (was === false && now === true) {
          const friendObj = this.currentFriendsData.find(
            (f) => f.id === friendId
          );
          const friendName = friendObj?.handle || "friend";
          notificationManager.showSystemNotification(
            `Mutual schedule sharing enabled with ${friendName}`,
            "success",
            { duration: 2000 }
          );
        }
        if (!this._prevMutualStatus) this._prevMutualStatus = new Map();
        this._prevMutualStatus.set(friendId, now);
        this.privacyUpdateTimers.delete(friendId);
      }, 150);
      this.privacyUpdateTimers.set(friendId, timerId);

      logInfo("✅ Privacy change processed successfully in FriendsPage");
    } catch (error) {
      logError("❌ Error handling privacy change in FriendsPage:", { error });
    }
  }

  /**
   * 🧹 Cleanup when leaving the page (improved memory leak prevention)
   */
  cleanup() {
    try {
      this.isActive = false;

      // Clean up friend options menus first
      this.cleanupFriendOptionsMenus();

      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = null;
      }

      // Clean up real-time subscriptions with error handling
      if (this.realTimeSubscriptions && this.realTimeSubscriptions.length > 0) {
        console.log(
          `🧹 Cleaning up ${this.realTimeSubscriptions.length} real-time subscriptions`
        );
        this.realTimeSubscriptions.forEach((unsubscribe, index) => {
          try {
            if (typeof unsubscribe === "function") {
              unsubscribe();
            }
          } catch (error) {
            console.warn(
              `⚠️ Error unsubscribing from real-time listener ${index}:`,
              error
            );
          }
        });
        this.realTimeSubscriptions = [];
      }

      // Remove delegated click handler on friendsList if bound
      try {
        if (this._delegatedClickBound && this.elements?.friendsList) {
          this.elements.friendsList.removeEventListener(
            "click",
            this._delegatedClickBound
          );
        }
      } catch (_) {}
      this._delegatedClickBound = null;

      // Remove stored chevron toggle handler if attached
      try {
        if (this._onDrawerToggleClick && this.elements?.friendsList) {
          this.elements.friendsList.removeEventListener(
            "click",
            this._onDrawerToggleClick
          );
        }
      } catch (_) {}
      this._onDrawerToggleClick = null;

      // Clean up Quick Access unsubscriber
      if (this.realTimeUnsubscriber) {
        try {
          this.realTimeUnsubscriber();
          this.realTimeUnsubscriber = null;
        } catch (error) {
          console.warn(
            "⚠️ Error cleaning up Quick Access unsubscriber:",
            error
          );
        }
      }

      // Stop real-time listening in friends manager
      if (friendsManager.stopRealTimeListening) {
        try {
          friendsManager.stopRealTimeListening();
        } catch (error) {
          console.warn(
            "⚠️ Error stopping friends manager real-time listening:",
            error
          );
        }
      }

      // Clear pending requests map safely
      if (this.pendingRequestsMap) {
        this.pendingRequestsMap.clear();
      }
      if (this.outgoingRequestsMap) {
        this.outgoingRequestsMap.clear();
      }
      // Reset last-applied pending UI state so new DOM can re-apply pending correctly on return
      if (this._pendingLocationUi) {
        this._pendingLocationUi.clear();
      }
      // Clear cached visibility/handshake maps to force fresh snapshot-driven UI when returning
      if (this.locationVisibilityState) {
        this.locationVisibilityState.clear();
      }
      if (this.mutualLocationHandshake) {
        this.mutualLocationHandshake.clear();
      }
      // Clean up outgoing location-requests listener
      if (this._outgoingLocReqUnsub) {
        try {
          this._outgoingLocReqUnsub();
        } catch (_) {}
        this._outgoingLocReqUnsub = null;
      }
      // Clean up incoming location-requests listener
      if (this._incomingLocReqUnsub) {
        try {
          this._incomingLocReqUnsub();
        } catch (_) {}
        this._incomingLocReqUnsub = null;
      }

      // Clear friend data arrays
      this.currentFriendsData = [];
      this.currentFriendRequestsData = [];
      if (this.incomingLocationRequestsMap) {
        this.incomingLocationRequestsMap.clear();
      }
      if (this.outgoingLocationRequestsMap) {
        this.outgoingLocationRequestsMap.clear();
      }

      // Reset drawer/misc state and transient sets to avoid leaks across sessions
      this.lastOpenDrawerFriendId = null;
      this._restoringDrawer = false;
      if (
        this._refreshingStates &&
        typeof this._refreshingStates.clear === "function"
      ) {
        this._refreshingStates.clear();
      }
      if (
        this._pendingLocationUi &&
        typeof this._pendingLocationUi.clear === "function"
      ) {
        this._pendingLocationUi.clear();
      }
      if (
        this.mutualLocationHandshake &&
        typeof this.mutualLocationHandshake.clear === "function"
      ) {
        this.mutualLocationHandshake.clear();
      }
      if (
        this.scheduleVisibilityState &&
        typeof this.scheduleVisibilityState.clear === "function"
      ) {
        this.scheduleVisibilityState.clear();
      }

      // Detach friendship privacy listeners and observer if any
      if (this.friendshipPrivacyUnsubscribers) {
        try {
          this.friendshipPrivacyUnsubscribers.forEach((unsub) => {
            try {
              if (typeof unsub === "function") unsub();
            } catch (_) {}
          });
        } catch (_) {}
        this.friendshipPrivacyUnsubscribers.clear();
      }
      if (this.friendshipPrivacyObserver) {
        try {
          this.friendshipPrivacyObserver.disconnect();
        } catch (_) {}
        this.friendshipPrivacyObserver = null;
      }

      // Remove event listeners to prevent memory leaks
      try {
        this.removeEventListeners();
      } catch (error) {
        console.warn("⚠️ Error removing event listeners:", error);
      }

      // Detach global drawer listeners if attached
      try {
        if (this._onDocumentClickCloseDrawer) {
          document.removeEventListener(
            "click",
            this._onDocumentClickCloseDrawer
          );
          this._onDocumentClickCloseDrawer = null;
        }
        if (this._onKeydownCloseDrawer) {
          document.removeEventListener("keydown", this._onKeydownCloseDrawer);
          this._onKeydownCloseDrawer = null;
        }
        this._drawerHandlersAttached = false;
      } catch (_) {}

      // Remove search results delegated listener if attached
      const resultsContainer = document.getElementById("searchResults");
      if (
        resultsContainer &&
        this._searchResultsListenerAttached &&
        this.boundHandlers?.searchResultsClick
      ) {
        try {
          resultsContainer.removeEventListener(
            "click",
            this.boundHandlers.searchResultsClick
          );
        } catch (_) {}
        this._searchResultsListenerAttached = false;
      }

      // Reset listener setup flag so they can be set up again if needed
      this.listenersSetup = false;

      logInfo("🧹 Friends UI cleaned up completely");
    } catch (error) {
      logError("❌ Error during Friends UI cleanup:", { error });
    }
  }
}

// 🌟 Export a single instance
export const friendsUI = new FriendsUI();

// 🎯 This is the crucial part that connects the UI to the router.
// We listen for the event dispatched by the router when a page is loaded.
logInfo("🎧 Friends UI: Registering spa:page:load event listener...");
document.addEventListener("spa:page:load", (event) => {
  logInfo("🎧 Friends UI: Received spa:page:load", {
    route: event.detail.route,
  });
  if (event.detail.route === "friends") {
    logInfo("🎨 Friends page loaded, initializing UI...");
    // Use the singleton instance instead of creating a new one
    friendsUI.init();

    // Also try to kick off friend action hints shortly after load,
    // if the user already has friends rendered.
    setTimeout(() => {
      try {
        const data = friendsUI.currentFriendsData || [];
        if (
          !friendsUI.friendActionsHintShown &&
          !friendsUI.friendActionsHintPrimed &&
          data.length > 0
        ) {
          friendsUI.maybeShowFriendActionsHint(data);
        }
      } catch (_) {
        /* non-fatal */
      }
    }, 1100);

    // (window.friendsManager removed; use ES module import instead)
  }
});

// Clean up when leaving the friends page
document.addEventListener("spa:page:unload", (event) => {
  if (event.detail.route === "friends") {
    friendsUI.cleanup();
  }
});
