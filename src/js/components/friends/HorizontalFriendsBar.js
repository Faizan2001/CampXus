/**
 * =============================================================================
 *                    HORIZONTAL FRIENDS BAR COMPONENT
 * =============================================================================
 *
 * Style horizontal scrolling avatar bar for Quick Access friends.
 * Replaces the Users List section in home.html with a modern social interface.
 *
 * --- FEATURES ---
 * ✅ Style horizontal scrolling
 * ✅ User avatar appears first with purple selection ring
 * ✅ Click avatar to load friend's schedule
 * ✅ Real-time updates from Quick Access changes
 * ✅ Purple selection rings and smooth animations
 * ✅ Touch scrolling and mobile optimization
 * ✅ Empty state handling
 * ✅ Privacy-aware disabled avatars for restricted schedules
 * ✅ Disabled state notifications and accessibility
 *
 * --- ARCHITECTURE ---
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ [User] [Friend1] [Friend2*] [Friend3] [Friend4*] [+More]            │
 * │   ↓        ↓        ↓         ↓         ↓         ↓               │
 * │ Purple   Normal  Disabled   Normal   Disabled   Scroll            │
 * │ Ring     Avatar  Avatar     Avatar   Avatar     Hint              │
 * └─────────────────────────────────────────────────────────────────────┘
 * * = Privacy-restricted schedules shown with disabled styling
 *
 * --- USAGE ---
 * const horizontalBar = new HorizontalFriendsBar('horizontal-friends-container');
 * await horizontalBar.init();
 * horizontalBar.selectFriend(friendId); // Programmatic selection
 * horizontalBar.destroy(); // Cleanup
 *
 */

import { friendsManager } from "../../services/friends/FriendsService.js";
import { currentUser } from "../../store/userStore.js";
import { renderUserAvatar } from "../../utils/avatar/avatarUtils.js";
import { dataManager } from "../../services/data/DataService.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";
import { logManager } from "../../utils/debug/LogManager.js";
import {
  realTimeManager,
  REALTIME_EVENTS,
} from "../../services/realtime/RealtimeService.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase/firebase-config.js";
import { PresenceDot } from "../presence/PresenceDot.js";
import { friendshipPrivacyService } from "../../services/friends/FriendshipPrivacyService.js";

// Global instance for external access
let globalHorizontalFriendsBarInstance = null;

// Queue for pending location animations when instance is not ready
let pendingLocationAnimations = [];

/**
 * HorizontalFriendsBar Class
 * Modern Instagram-style horizontal friends bar component
 */
export class HorizontalFriendsBar {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = null;
    this.isInitialized = false;

    // State management
    this.currentUser = null;
    this.quickAccessFriends = [];
    // Guard against stale re-adds after optimistic removals
    this.optimisticRemovals = new Map(); // friendId -> timestamp
    this.selectedFriendId = null; // null = user's own schedule selected
    this.isLoading = false;

    // Compare mode state
    this.compareMode = false;
    this.selectedForCompare = new Set(); // Set of friend IDs selected for comparison
    this._isToggling = false; // Prevent rapid compare mode toggles
    this._lastNotification = null; // Track last notification to prevent duplicates
    this._notificationDebounce = null; // Debounce timer for notifications

    // UI Elements
    this.userContainer = null;
    this.scrollContainer = null;
    this.avatarsContainer = null;
    this.avatarElements = new Map(); // friendId -> HTMLElement

    // Event handling
    this.boundHandlers = null;
    this.realTimeUnsubscriber = null;

    // Touch/scroll optimization
    this.isScrolling = false;
    this.scrollTimeout = null;

    // Memory leak prevention - track all timeouts for proper cleanup
    this.activeTimeouts = new Set();

    // Smart loading: fetch fresh data on first load, use cache afterwards
    this.isFirstLoad = true;

    // ENHANCED: Circuit breaker and sync management properties
    this.isSyncing = false; // Legacy sync protection
    this.isBatchSyncing = false; // Batched sync protection
    this.isPrivacySyncing = false; // Privacy-only sync protection
    this.syncTimeout = null; // Legacy sync timeout
    this.batchSyncTimeout = null; // Batched sync timeout
    this.friendProfileUnsubscribers = []; // Track friend profile listeners
    this.realTimeUnsubscribers = []; // Track all real-time listeners
    this.privacyUnsubscribers = []; // Track privacy listeners for friendship documents

    // Performance optimization: track last database state to prevent unnecessary updates
    this.lastDatabaseState = null;
    this.lastUpdateTimestamp = 0;

    // Debouncing timeout for Quick Access updates
    this.quickAccessUpdateTimeout = null;

    // 🚀 ENTERPRISE FIX: Campus status tracking for smart animations
    this.lastKnownCampusStatus = null; // Track previous campus status for change detection
    this.lastLocationAnimationTime = 0; // Debounce animation timing
    this.isLocationAnimationRunning = false; // Prevent overlapping animations

    // 🚀 Presence loading state control (per user and per friend)
    this.loadingState = { user: false };
    this.friendLoading = new Map(); // friendId -> boolean
    this.initialFreshComplete = false;

    // 🧠 Session-scoped fallback for user's presence dot
    // Persists last known red/green status and lastActive across re-renders
    this._userPresenceFallback = null; // { lastActiveMs, campusStatus, hasLocationSharing, savedAtMs }

    logManager.ui.init(
      `HorizontalFriendsBar created for container: ${containerId}`
    );
  }

  /**
   * Initialize the horizontal friends bar
   * Sets up UI, loads data, and starts real-time listeners
   */
  async init() {
    try {
      logManager.ui.init("Initializing HorizontalFriendsBar");

      // Get container element
      this.container = document.getElementById(this.containerId);
      if (!this.container) {
        throw new Error(`Container element not found: ${this.containerId}`);
      }

      // Establish fresh-data state BEFORE any render so presence dots start as loading
      this.loadingState.user =
        sessionStorage.getItem("campusPresence_forceFreshData") === "true";

      // Get current user data
      this.currentUser = currentUser?.profile;
      if (!this.currentUser) {
        throw new Error("Current user not available");
      }

      // Create the UI structure
      this.createUIStructure();

      // Set up Campus Presence fresh data listeners early so we catch initial events
      this.setupFreshDataEventListeners();

      // Set up event handlers
      this.setupEventHandlers();

      // Load initial data
      await this.loadQuickAccessFriends(true);

      // Render the friends bar
      this.render();

      // Set up real-time listeners
      this.setupRealTimeListeners();

      // Force clean initial state - ensure no compare mode artifacts
      this.avatarElements.forEach((element, friendId) => {
        element.classList.remove("compare-mode-available", "compare-selected");
        const checkmark = element.querySelector(".compare-checkmark");
        if (checkmark) checkmark.remove();
      });

      // Default select user's own schedule after DOM is ready
      this.addTrackedTimeout(async () => {
        await this.selectUser();
        logManager.dev.debug("User selection called after DOM ready");
      }, 50);

      // Add global debug function for testing selection rings
      window.testSelectionRings = () => {
        logManager.dev.test("Testing selection rings");
        this.avatarElements.forEach((element, friendId) => {
          const ring = element.querySelector(".selection-ring");
          logManager.dev.debug(`Ring for ${friendId}`, {
            hasSelected: element.classList.contains("selected"),
            ringOpacity: ring ? getComputedStyle(ring).opacity : "N/A",
          });
        });
      };

      logManager.dev.debug("Added window.testSelectionRings() for debugging");

      // Add test function to window for debugging avatar comparison
      window.testAvatarComparison = () => {
        logManager.dev.test("Testing avatar comparison logic");

        const testCases = [
          {
            name: "Same objects",
            current: { hair: "short", eyes: "blue" },
            new: { hair: "short", eyes: "blue" },
            expected: false,
          },
          {
            name: "Different objects",
            current: { hair: "short", eyes: "blue" },
            new: { hair: "long", eyes: "blue" },
            expected: true,
          },
          {
            name: "Current null, new object",
            current: null,
            new: { hair: "short", eyes: "blue" },
            expected: true,
          },
          {
            name: "Current undefined, new object",
            current: undefined,
            new: { hair: "short", eyes: "blue" },
            expected: true,
          },
          {
            name: "Both null",
            current: null,
            new: null,
            expected: false,
          },
          {
            name: "Circular reference test",
            current: { hair: "short" },
            new: (() => {
              const obj = { hair: "long" };
              obj.self = obj;
              return obj;
            })(),
            expected: true,
          },
        ];

        testCases.forEach((test) => {
          let avatarChanged = false;
          if (test.new) {
            if (!test.current) {
              avatarChanged = true;
            } else {
              try {
                const currentStr = JSON.stringify(test.current);
                const newStr = JSON.stringify(test.new);
                avatarChanged = currentStr !== newStr;
              } catch (error) {
                console.warn("JSON comparison failed, assuming changed");
                avatarChanged = true;
              }
            }
          }

          const passed = avatarChanged === test.expected;
          console.log(
            `${passed ? "✅" : "❌"} ${test.name}: ${avatarChanged} (expected ${
              test.expected
            })`
          );
        });
      };

      // Add function to simulate a profile update
      window.simulateProfileUpdate = (friendId) => {
        const friendIndex = this.quickAccessFriends.findIndex(
          (f) => f.friendId === friendId
        );
        if (friendIndex === -1) {
          console.error(`Friend ${friendId} not found in quick access`);
          return;
        }

        const mockProfile = {
          profile: {
            handle: this.quickAccessFriends[friendIndex].handle,
            avatarConfig: {
              hair: "updated_" + Date.now(),
              eyes: "new_color",
            },
          },
        };

        console.log("🧪 Simulating profile update:", mockProfile);
        this.handleStarredFriendProfileUpdate(friendId, mockProfile);
      };

      console.log(
        "🔍 Added window.testAvatarComparison() and window.simulateProfileUpdate() for debugging"
      );

      // Add comprehensive debug method for Firebase validation issues
      window.debugHorizontalFriendsBar = () => {
        console.group("🔍 HorizontalFriendsBar Debug Report");

        console.log("📊 Current State:", {
          friendsCount: this.quickAccessFriends?.length || 0,
          selectedFriendId: this.selectedFriendId,
          isLoading: this.isLoading,
          isSyncing: this.isSyncing,
          compareMode: this.compareMode,
        });

        console.log("👥 Friends Data:");
        this.quickAccessFriends?.forEach((friend, index) => {
          console.log(`  Friend ${index}:`, {
            friendId: friend.friendId,
            userId: friend.userId,
            handle: friend.handle,
            hasAvatarConfig: !!friend.avatarConfig,
            isRestricted: friend.isRestricted,
            privacyStatus: friend.privacyStatus,
            undefinedFields: Object.entries(friend)
              .filter(([k, v]) => v === undefined)
              .map(([k]) => k),
          });
        });

        console.log("🔥 Firebase Validation:");
        const validationResults =
          this.quickAccessFriends?.map((friend, index) => {
            return {
              index,
              isValid: this._validateFirebaseData([friend]),
              validatedData: {
                friendId: this._validateString(
                  friend.friendId,
                  `Friend ${index} friendId`
                ),
                userId: this._validateString(
                  friend.userId,
                  `Friend ${index} userId`
                ),
                handle: this._validateString(
                  friend.handle,
                  `Friend ${index} handle`,
                  "unknown_handle"
                ),
                avatarConfig: this._validateAvatarConfig(
                  friend.avatarConfig,
                  `Friend ${index} avatarConfig`
                ),
                isRestricted: Boolean(friend.isRestricted),
                privacyStatus: this._validateString(
                  friend.privacyStatus,
                  `Friend ${index} privacyStatus`,
                  "unknown"
                ),
              },
            };
          }) || [];

        console.table(validationResults);

        console.groupEnd();

        return {
          friends: this.quickAccessFriends,
          validationResults,
          allValid: validationResults.every((r) => r.isValid),
        };
      };

      console.log(
        "🔍 Added window.debugHorizontalFriendsBar() for comprehensive debugging"
      );

      // Add global function for testing location animation
      window.testLocationAnimation = () => {
        console.log("🗺 Testing location update animation...");
        this.notifyLocationUpdated();
      };

      console.log(
        "🗺 Added window.testLocationAnimation() for testing location updates"
      );

      // Store global instance for external access
      globalHorizontalFriendsBarInstance = this;

      this.isInitialized = true;
      logManager.ui.init("HorizontalFriendsBar initialized successfully");

      // Process any queued location animations
      this.processQueuedLocationAnimations();

      // Debug: Verify user selection after initialization (only in debug mode)
      logManager.dev.debug("User selection state after init", {
        selectedFriendId: this.selectedFriendId,
        userElementExists: this.avatarElements.has("user"),
      });
    } catch (error) {
      logManager.ui.error("Failed to initialize HorizontalFriendsBar", error);
      this.showErrorState(error.message);
    }
  }

  /**
   * Create the UI structure for the horizontal friends bar
   */
  createUIStructure() {
    this.container.innerHTML = `
      <div class="horizontal-friends-bar">
        <div class="user-avatar-container" id="${this.containerId}-user">
          <!-- User avatar will be rendered here (FIXED - not scrollable) -->
        </div>
        <div class="friends-scroll-container" id="${this.containerId}-scroll">
          <div class="friends-avatars-list" id="${this.containerId}-avatars">
            <!-- Friend avatars will be rendered here (SCROLLABLE) -->
          </div>
        </div>
        <div class="compare-button-container" id="${this.containerId}-compare">
          <button class="btn-compare compare-button round-compare-btn" 
                  type="button" 
                  title="Toggle Compare Mode"
                  id="roundCompareBtn">
            <i class="fas fa-balance-scale"></i>
          </button>
        </div>
      </div>
    `;

    // Cache references
    this.userContainer = document.getElementById(`${this.containerId}-user`);
    this.scrollContainer = document.getElementById(
      `${this.containerId}-scroll`
    );
    this.avatarsContainer = document.getElementById(
      `${this.containerId}-avatars`
    );
    this.compareButtonContainer = document.getElementById(
      `${this.containerId}-compare`
    );

    console.log(
      "🎨 UI structure created for HorizontalFriendsBar with round compare button"
    );
  }

  /**
   * Set up event handlers for user interactions
   */
  setupEventHandlers() {
    if (!this.boundHandlers) {
      this.boundHandlers = {
        avatarClick: (e) => this.handleAvatarClick(e),
        scrollStart: () => this.handleScrollStart(),
        scrollEnd: () => this.handleScrollEnd(),
        refreshClick: () => this.handleRefreshClick(),
        keyboardNav: (e) => this.handleKeyboardNavigation(e),
      };
    }

    // Avatar clicks using event delegation
    this.container.addEventListener("click", this.boundHandlers.avatarClick);

    // Scroll handling on the FRIENDS scroll container (not user container)
    if (this.scrollContainer) {
      this.scrollContainer.addEventListener(
        "scroll",
        this.boundHandlers.scrollStart,
        { passive: true }
      );
    }

    // Refresh button
    this.container.addEventListener("click", (e) => {
      if (e.target.closest(".btn-refresh-friends")) {
        this.boundHandlers.refreshClick();
      }
    });

    // Compare button (mobile)
    this.container.addEventListener("click", (e) => {
      if (e.target.closest(".btn-compare")) {
        this.handleToggleCompareMode();
      }
    });

    // Keyboard navigation
    this.container.addEventListener("keydown", this.boundHandlers.keyboardNav);

    console.log("🎯 Event handlers set up for HorizontalFriendsBar");
  }

  /**
   * Load Quick Access friends from FriendsService
   * @param {boolean} useCache - Whether to use cached data (default: true)
   */
  async loadQuickAccessFriends(useCache = true) {
    try {
      console.log(
        `📊 Loading Quick Access friends${
          useCache ? " (using cache)" : " (bypassing cache)"
        }...`
      );

      const firstLoad = this.isFirstLoad;
      this.isLoading = true;
      // Do not overlay big loader on first paint; we want avatars + loading dots to show
      if (!firstLoad) this.showLoadingState();

      // Cache-first on first paint for speed; otherwise honor caller's preference
      const cachePreferred = useCache || firstLoad;

      // Get Quick Access friends with privacy status
      console.log(
        "[HorizontalFriendsBar] Loading friends with location context for presence dots..."
      );
      const quickAccessData =
        await friendsManager.getQuickAccessFriendsWithPrivacy(cachePreferred);

      // On first paint, avoid heavy per-friend profile fetch. Render ASAP with loading dots,
      // then hydrate presence/lastActive in the background.
      let quickAccessWithLocation = [];
      if (firstLoad) {
        quickAccessWithLocation = quickAccessData;
        // Background enhancement for presence data
        this.addTrackedTimeout(async () => {
          try {
            const hydrated = await this.enhanceFriendsWithLocationData(
              quickAccessData
            );
            // Only apply if component is still alive
            if (!this.isInitialized) return;
            this.quickAccessFriends = hydrated;
            // Refresh presence dots with latest data without blowing away timers
            this.refreshPresenceDotsWithLatestData();
            // Ensure profile listeners are bound
            await this.setupStarredFriendProfileListeners();
          } catch (bgErr) {
            console.warn("⚠️ Background enhancement failed:", bgErr);
          }
        }, 0);
      } else {
        // 🌍 Campus Presence: Enhance friends with location data (non-first paints)
        quickAccessWithLocation = await this.enhanceFriendsWithLocationData(
          quickAccessData
        );
      }

      console.log(
        "[HorizontalFriendsBar] Enhanced friends with location data:",
        quickAccessWithLocation.length
      );

      // Debug: Log presence data summary
      const presenceSummary = quickAccessWithLocation.map((friend) => ({
        name: friend.handle,
        hasLocationSharing: friend.hasLocationSharing,
        hasLastActive: !!friend.lastActive,
        hasLocation: !!friend.lastKnownLocation,
        campusStatus: friend.lastKnownLocation?.campusStatus,
      }));
      console.log(
        "[HorizontalFriendsBar] Presence data summary:",
        presenceSummary
      );

      // Validate and clean data to prevent Firebase errors
      const validatedFriends = (quickAccessWithLocation || []).filter(
        (friend) => {
          if (!friend || typeof friend !== "object") {
            console.warn(
              "⚠️ Load: Filtered out invalid friend object:",
              friend
            );
            return false;
          }

          // Must have at least one valid ID
          if (!friend.friendId && !friend.userId) {
            console.warn(
              "⚠️ Load: Filtered out friend without valid ID:",
              friend
            );
            return false;
          }

          return true;
        }
      );

      // Validation completed (reduced logging for console noise)

      this.quickAccessFriends = validatedFriends;

      // Set up profile listeners (skip await on first paint; background task handles it)
      if (this.quickAccessFriends.length > 0 && !firstLoad) {
        await this.setupStarredFriendProfileListeners();
      }

      // Note: Database updates are handled by HomePage, not here
      // This eliminates infinite loops from real-time listeners

      console.log(
        `📊 Loaded ${this.quickAccessFriends.length} Quick Access friends${
          cachePreferred ? " (cached-first)" : " (fresh)"
        }`
      );
    } catch (error) {
      console.error("❌ Failed to load Quick Access friends:", error);
      this.quickAccessFriends = [];
    } finally {
      this.isLoading = false;
      if (!this.isFirstLoad) this.hideLoadingState();
      this.isFirstLoad = false;
    }
  }

  /**
   * Render the friends bar with user and friend avatars
   */
  render() {
    if (!this.userContainer || !this.avatarsContainer) {
      console.error("❌ User or avatars container not found");
      return;
    }

    // Rendering HorizontalFriendsBar

    // Clear existing avatars
    this.userContainer.innerHTML = "";
    this.avatarsContainer.innerHTML = "";
    this.avatarElements.clear();

    // 1. Render user's avatar in FIXED container (not scrollable)
    this.renderUserAvatar(this.userContainer);

    // 2. Render Quick Access friends in SCROLLABLE container
    this.renderFriendsAvatars(this.avatarsContainer);

    // 3. Update scroll indicators
    this.updateScrollIndicators();

    // 4. Immediately ensure user is selected after render (no timeout needed)
    this.forceUserSelection();

    console.log(
      `✅ Rendered ${
        this.quickAccessFriends.length + 1
      } avatars in HorizontalFriendsBar`
    );
  }

  /**
   * Render user's own avatar (always first)
   */
  renderUserAvatar(container) {
    // Get user's current location data from profile
    const userProfile = currentUser.profile;
    const systemInfo = userProfile?.systemInfo || {};

    // Use effective presence data (fallback to last known good state when partial data arrives)
    const effective = this._getEffectiveUserPresence(systemInfo);

    // Create presence dot for user's own avatar with fresh data priority
    const userPresenceDot = PresenceDot.createWithFreshDataPriority(
      effective.lastActive,
      effective.lastKnownLocation,
      effective.hasLocationSharing,
      this.loadingState.user || false
    );

    // Creating user presence dot (debug details removed)

    const userAvatarHtml = `
      <div class="friend-avatar-item" 
           data-friend-id="user" 
           data-friend-name="${this.currentUser.handle || "You"}"
           role="button"
           tabindex="0"
           aria-label="View your schedule">
        <div class="avatar-container">
          <div class="avatar-image">
            ${renderUserAvatar(this.currentUser, true)}
            ${userPresenceDot}
            <div class="selection-ring"></div>
          </div>
        </div>
        <div class="avatar-label">Me</div>
      </div>
    `;

    container.insertAdjacentHTML("beforeend", userAvatarHtml);

    // Store reference immediately (this should work since insertAdjacentHTML is synchronous)
    const userElement = container.querySelector('[data-friend-id="user"]');
    if (userElement) {
      this.avatarElements.set("user", userElement);
      // User avatar rendered with presence dot and location indicator

      // Set up location update animation listener
      this.setupUserLocationUpdateListener(userElement);
    } else {
      console.error("❌ Failed to find user avatar element after rendering");
    }
  }

  /**
   * Render Quick Access friends avatars with privacy-aware disabled states and presence dots
   */
  renderFriendsAvatars(container) {
    this.quickAccessFriends.forEach((friend, index) => {
      // Determine if avatar should be disabled based on privacy status
      const isDisabled = friend.isRestricted || false;
      const disabledClass = isDisabled ? "disabled" : "";
      const friendLabel = friend.handle || "unknown";
      const ariaLabel = isDisabled
        ? `${friendLabel}'s schedule is private - access restricted`
        : `View ${friendLabel}'s schedule`;
      const tooltip =
        friend.privacyStatus?.tooltip ||
        (isDisabled ? "Schedule access restricted" : "Click to view schedule");

      // Add presence dot based on location sharing status with fresh data priority
      const presenceDot = PresenceDot.createWithFreshDataPriority(
        friend.lastActive,
        friend.lastKnownLocation,
        friend.hasLocationSharing,
        this.friendLoading.get(friend.friendId || friend.userId) || false
      );

      console.log(
        `[HorizontalFriendsBar] Rendering friend ${friendLabel} with presence:`,
        {
          hasLastActive: !!friend.lastActive,
          hasLocation: !!friend.lastKnownLocation,
          hasLocationSharing: friend.hasLocationSharing,
          campusStatus: friend.lastKnownLocation?.campusStatus,
          presenceDotPreview: presenceDot.substring(0, 50) + "...",
        }
      );

      const friendAvatarHtml = `
        <div class="friend-avatar-item ${disabledClass}" 
             data-friend-id="${friend.friendId || friend.userId}" 
     data-friend-name="${friendLabel}"
             data-privacy-restricted="${isDisabled}"
             title="${tooltip}"
             role="button"
             tabindex="0"
             aria-label="${ariaLabel}">
          <div class="avatar-container">
            <div class="avatar-image">
              ${renderUserAvatar(friend, true)}
              ${presenceDot}
              <div class="selection-ring"></div>
            </div>
          </div>
      <div class="avatar-label">${friendLabel}</div>
        </div>
      `;

      container.insertAdjacentHTML("beforeend", friendAvatarHtml);

      // Store reference
      const friendElement = container.querySelector(
        `[data-friend-id="${friend.friendId || friend.userId}"]`
      );
      this.avatarElements.set(friend.friendId || friend.userId, friendElement);
    });

    // Friend avatars rendered with privacy status and presence dots
  }

  /**
   * Render empty state when no Quick Access friends
   */
  renderEmptyState(container) {
    const emptyStateHtml = `
      <div class="friends-empty-state">
        <div class="empty-icon">⭐</div>
        <div class="empty-text">
          <p>No starred friends yet</p>
          <small>Star friends from the Friends page to see them here</small>
        </div>
      </div>
    `;

    container.insertAdjacentHTML("beforeend", emptyStateHtml);
    // Empty state rendered
  }

  /**
   * Handle avatar click events with privacy-aware restrictions
   */
  async handleAvatarClick(event) {
    // Ignore clicks on compare button or its children
    if (
      event.target.closest(".btn-compare") ||
      event.target.closest(".compare-button-container")
    ) {
      return;
    }

    const avatarItem = event.target.closest(".friend-avatar-item");
    if (!avatarItem) return;

    const friendId = avatarItem.dataset.friendId;
    const friendName = avatarItem.dataset.friendName;
    let isRestricted = avatarItem.dataset.privacyRestricted === "true";

    console.log(`👆 Avatar clicked: ${friendName} (${friendId})`);
    console.log(
      `🔴 DEBUG COMPARE: Click in ${
        this.compareMode ? "COMPARE MODE" : "NORMAL MODE"
      }`
    );

    // Prevent multiple clicks while processing
    if (avatarItem.classList.contains("loading")) return;

    // If dataset says not restricted, double-check with live privacy to avoid race conditions
    if (!isRestricted && friendId !== "user") {
      try {
        const liveRestricted = await friendsManager.isQuickAccessRestricted(
          friendId
        );
        if (liveRestricted === true) {
          isRestricted = true;
          // Update DOM to reflect disabled state immediately
          avatarItem.dataset.privacyRestricted = "true";
          avatarItem.classList.add("disabled");
        }
      } catch (e) {
        // On error, do not block normal flow; fallback to current flag
      }
    }

    // If dataset says restricted, verify live again to allow immediate unblocks after privacy changes
    if (isRestricted && friendId !== "user") {
      try {
        const liveRestricted = await friendsManager.isQuickAccessRestricted(
          friendId
        );
        if (liveRestricted === false) {
          // Privacy now allows access; update DOM and continue selection
          isRestricted = false;
          avatarItem.dataset.privacyRestricted = "false";
          avatarItem.classList.remove("disabled");
        }
      } catch (e) {
        // If check fails, keep current restricted state
      }
    }

    // Check if avatar is disabled due to privacy restrictions (after live verification)
    if (isRestricted && friendId !== "user") {
      console.log(
        `🔒 Access restricted for ${friendName} - showing notification`
      );
      // Show standardized privacy notification
      notificationManager.showPrivacyNotification(
        friendName,
        "schedule",
        "access",
        { duration: 3000, type: "warning" }
      );
      return;
    }

    if (this.compareMode) {
      // In compare mode: toggle selection for comparison
      console.log(
        `🔴 DEBUG COMPARE: Toggling comparison selection for ${friendName}`
      );
      this.toggleCompareSelection(friendId, friendName);
    } else {
      // Normal mode: select this friend's schedule
      console.log(`👤 DEBUG NORMAL: Selecting ${friendName}'s schedule`);
      await this.selectFriend(friendId, friendName);
    }
  }

  /**
   * Select a friend's schedule (or user's own)
   */
  async selectFriend(friendId, friendName = null, forceSelection = false) {
    // 🎯 NEW: Skip deselection logic if this is a forced selection (like initial load)
    if (!forceSelection) {
      // Check if this friend is already selected
      const isUserCurrentlySelected =
        friendId === "user" && this.selectedFriendId === null;
      const isFriendCurrentlySelected =
        friendId !== "user" && this.selectedFriendId === friendId;
      const currentlySelected =
        isUserCurrentlySelected || isFriendCurrentlySelected;

      if (currentlySelected && friendId !== "user") {
        // 🎯 FIXED: If clicking on already selected friend, deselect and show empty state
        console.log(`🔄 Deselecting friend: ${friendId}, showing empty state`);
        this.deselectAll();
        return;
      } else if (currentlySelected && friendId === "user") {
        // If clicking on already selected user, deselect them (show empty schedule)
        console.log(`🔄 Deselecting user avatar, showing empty schedule`);
        this.deselectAll();
        return;
      }
    } else {
      console.log(
        `🎯 Force selecting ${friendId} - skipping deselection logic`
      );
    }

    console.log(`🎯 Selecting friend: ${friendId}`);

    // Log schedule data in Firestore format for any selected avatar
    if (friendId === "user" && currentUser?.scheduleData) {
      // Log user's schedule data
      const scheduleData = currentUser.scheduleData;
      console.log(`🟢🔴 User's Schedule Data (Firestore Format):`, {
        userId: currentUser?.user?.uid || "unknown",
        handle: currentUser?.profile?.handle || "you",
        timeSlots: scheduleData.timeSlots || [],
        schedule: scheduleData.schedule || [],
        slotInfo: scheduleData.slotInfo || [],
        pinnedSlots: scheduleData.pinnedSlots || [],
        metadata: {
          lastModified: scheduleData.lastModified || new Date(),
          version: scheduleData.version || 1,
          source: "HorizontalFriendsBar_UserSelection",
        },
      });
    } else if (friendId !== "user") {
      // Log friend's schedule data by fetching it dynamically
      const friend = this.quickAccessFriends.find(
        (f) => (f.friendId || f.userId) === friendId
      );
      if (friend) {
        // Fetch the friend's schedule data from Firestore
        try {
          const friendScheduleData = await dataManager.getUserSchedule(
            friendId
          );
          if (friendScheduleData && typeof friendScheduleData === "object") {
            console.log(`🟢🔴 Friend's Schedule Data (Firestore Format):`, {
              userId: friend.userId || friendId,
              friendId: friend.friendId || friendId,
              handle: friend.handle || friendName || "unknown",
              timeSlots: friendScheduleData.timeSlots || [],
              schedule: friendScheduleData.schedule || [],
              slotInfo: friendScheduleData.slotInfo || [],
              pinnedSlots: friendScheduleData.pinnedSlots || [],
              metadata: {
                lastModified: friendScheduleData.lastModified || new Date(),
                version: friendScheduleData.version || 1,
                source: "HorizontalFriendsBar_FriendSelection",
              },
            });
          } else {
            console.log(
              `🟢🔴 Friend's Schedule Data: No schedule data found in Firestore for ${
                friendName || friendId
              }`
            );
          }
        } catch (error) {
          console.log(
            `🟢🔴 Friend's Schedule Data: Error fetching schedule for ${
              friendName || friendId
            }:`,
            error
          );
        }
      } else {
        console.log(
          `🟢🔴 Friend's Schedule Data: Friend not found in quickAccessFriends for ${
            friendName || friendId
          }`
        );
      }
    }

    // Update selection state
    this.selectedFriendId = friendId === "user" ? null : friendId;

    // Update visual selection
    this.updateVisualSelection(friendId);

    // Update status text
    this.updateSelectionStatus(friendName || friendId);

    // Emit event for schedule loading (to be handled by HomePage.js)
    this.emitScheduleChangeEvent(friendId, friendName);

    // Show feedback in console
    const label = friendId === "user" ? "your" : `${friendName}'s`;
    console.log(`Viewing ${label} schedule`);
  }

  /**
   * Select user's own schedule (default state)
   */
  async selectUser() {
    console.log("🔍 DEBUG: selectUser() called");
    console.log(
      '🔍 DEBUG: avatarElements.has("user"):',
      this.avatarElements.has("user")
    );
    console.log("🔍 DEBUG: avatarElements size:", this.avatarElements.size);

    // Ensure user element exists before selecting
    const userElement = this.avatarElements.get("user");
    if (!userElement) {
      console.error(
        "❌ DEBUG: User avatar element not found in avatarElements"
      );
      // Try to find it in DOM directly
      if (!this.container) {
        console.error("❌ DEBUG: Container is null, cannot query DOM");
        return;
      }
      const userElementDirect = this.container.querySelector(
        '[data-friend-id="user"]'
      );
      if (userElementDirect) {
        console.log(
          "🔍 DEBUG: Found user element directly in DOM, adding to avatarElements"
        );
        this.avatarElements.set("user", userElementDirect);
      } else {
        console.error("❌ DEBUG: User element not found in DOM either");
        return;
      }
    }

    await this.selectFriend("user", "You", true); // Force selection to skip deselection logic
  }

  /**
   * Deselect all avatars and show empty schedule
   */
  deselectAll() {
    console.log("🔍 DEBUG: deselectAll() called - clearing all selections");

    // Clear selection state
    this.selectedFriendId = "none"; // Special value to indicate no selection

    // Update visual selection (clear all rings)
    this.updateVisualSelection(null);

    // Update status text
    this.updateSelectionStatus("No Schedule Selected");

    // Emit event for empty schedule display
    this.emitScheduleChangeEvent(null, null, true); // isEmptySchedule = true

    // Show feedback in console
    console.log("No schedule selected");
  }

  /**
   * Update visual selection rings
   */
  updateVisualSelection(selectedFriendId) {
    console.log(
      `🔍 DEBUG: updateVisualSelection called for: ${selectedFriendId}`
    );

    // Remove selection from all avatars and clear any inline styles
    this.avatarElements.forEach((element, friendId) => {
      element.classList.remove("selected");
      const ring = element.querySelector(".selection-ring");
      if (ring) {
        // Clear all inline styles to allow CSS to take over
        ring.style.opacity = "";
        ring.style.transform = "";
        ring.style.borderColor = "";
        ring.style.borderWidth = "";
        ring.style.zIndex = "";
        ring.style.display = "";

        console.log(
          `🔍 DEBUG: Cleared inline styles from ${friendId}, ring found: ${!!ring}`
        );
      }
    });

    // If selectedFriendId is null, don't select any avatar (empty schedule state)
    if (selectedFriendId === null) {
      console.log(
        "🔍 DEBUG: No avatar selected - showing empty schedule state"
      );
      return;
    }

    // Add selection to clicked avatar
    const selectedElement = this.avatarElements.get(selectedFriendId);
    if (selectedElement) {
      selectedElement.classList.add("selected");

      // Rely on CSS for ring appearance; avoid inline styles that can distort shape
      const ring = selectedElement.querySelector(".selection-ring");
      console.log(`🔍 DEBUG: Selected element for ${selectedFriendId}:`, {
        element: selectedElement,
        hasSelectedClass: selectedElement.classList.contains("selected"),
        ringFound: !!ring,
        ringStyles: ring ? getComputedStyle(ring) : null,
        ringOpacity: ring ? getComputedStyle(ring).opacity : "N/A",
        ringDisplay: ring ? getComputedStyle(ring).display : "N/A",
        ringTransform: ring ? getComputedStyle(ring).transform : "N/A",
      });

      // Debug info logged above

      // Scroll to selected avatar if needed
      this.scrollToAvatar(selectedElement);
    } else {
      console.log(
        `❌ DEBUG: No element found for selectedFriendId: ${selectedFriendId}`
      );
    }

    // Force update compare UI only if in compare mode, otherwise clean up any compare artifacts
    if (!this.compareMode) {
      // Clean up any lingering compare mode classes and elements when not in compare mode
      this.avatarElements.forEach((element, friendId) => {
        element.classList.remove("compare-mode-available", "compare-selected");
        const checkmark = element.querySelector(".compare-checkmark");
        if (checkmark) checkmark.remove();
      });
    }

    console.log(`🎨 Visual selection updated for: ${selectedFriendId}`);
  }

  /**
   * Update selection status text
   */
  updateSelectionStatus(friendName) {
    const statusElement = this.container.querySelector(".current-selection");
    if (statusElement) {
      if (friendName === "No Schedule Selected") {
        statusElement.textContent = friendName;
      } else {
        const displayText =
          friendName === "You" || friendName === "user"
            ? "Your Schedule"
            : `${friendName}'s Schedule`;
        statusElement.textContent = displayText;
      }
    }
  }

  /**
   * Emit schedule change event for HomePage.js to handle
   */
  emitScheduleChangeEvent(friendId, friendName, isEmptySchedule = false) {
    const eventDetail = {
      friendId: friendId === "user" ? null : friendId,
      friendName: friendName,
      isUserSchedule: friendId === "user",
      isEmptySchedule: isEmptySchedule,
      timestamp: Date.now(),
    };

    console.log("📡 Emitting schedule:change event:", eventDetail);

    document.dispatchEvent(
      new CustomEvent("schedule:change", {
        detail: eventDetail,
        bubbles: true,
      })
    );
  }

  /**
   * Scroll to a specific avatar element
   */
  scrollToAvatar(avatarElement) {
    if (!this.scrollContainer || !avatarElement) return;

    const containerRect = this.scrollContainer.getBoundingClientRect();
    const avatarRect = avatarElement.getBoundingClientRect();

    // Check if avatar is outside visible area
    const isOutsideLeft = avatarRect.left < containerRect.left;
    const isOutsideRight = avatarRect.right > containerRect.right;

    if (isOutsideLeft || isOutsideRight) {
      // Scroll to make avatar visible
      const scrollLeft = this.scrollContainer.scrollLeft;
      const avatarOffsetLeft = avatarElement.offsetLeft;
      const containerWidth = this.scrollContainer.clientWidth;
      const avatarWidth = avatarElement.offsetWidth;

      let targetScrollLeft;
      if (isOutsideLeft) {
        targetScrollLeft = avatarOffsetLeft - 20; // 20px padding
      } else {
        targetScrollLeft = avatarOffsetLeft - containerWidth + avatarWidth + 20;
      }

      // Smooth scroll to target position
      this.scrollContainer.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth",
      });
    }
  }

  /**
   * Handle scroll start
   */
  handleScrollStart() {
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    this.isScrolling = true;
    this.container.classList.add("scrolling");

    // Update scroll indicators
    this.updateScrollIndicators();

    // Set timeout for scroll end
    this.scrollTimeout = setTimeout(() => {
      this.handleScrollEnd();
    }, 150);
  }

  /**
   * Handle scroll end
   */
  handleScrollEnd() {
    this.isScrolling = false;
    this.container.classList.remove("scrolling");

    // Update scroll indicators
    this.updateScrollIndicators();
  }

  /**
   * Update scroll indicators
   */
  updateScrollIndicators() {
    if (!this.scrollContainer) return;

    const scrollLeft = this.scrollContainer.scrollLeft;
    const scrollWidth = this.scrollContainer.scrollWidth;
    const clientWidth = this.scrollContainer.clientWidth;

    // Update scroll indicator position
    const indicator = this.container.querySelector(".scroll-indicator-thumb");
    if (indicator && scrollWidth > clientWidth) {
      const progress = scrollLeft / (scrollWidth - clientWidth);
      const maxPosition = 100 - (clientWidth / scrollWidth) * 100;
      indicator.style.left = `${progress * maxPosition}%`;

      // Show/hide scroll indicator
      this.container.classList.toggle("has-scroll", scrollWidth > clientWidth);
    } else {
      this.container.classList.remove("has-scroll");
    }
  }

  /**
   * Force user selection immediately after render
   * This ensures the purple ring appears right away
   * 🎯 FIXED: Respect compare mode - don't force selection in compare mode
   */
  forceUserSelection() {
    console.log(
      "🔍 DEBUG: forceUserSelection() called immediately after render",
      {
        compareMode: this.compareMode,
        selectedFriendId: this.selectedFriendId,
        isInitialized: this.isInitialized,
      }
    );

    // 🎯 NEW: Don't force user selection in compare mode - allow empty selections
    if (this.compareMode) {
      console.log("🔍 DEBUG: In compare mode - skipping forced user selection");
      return;
    }

    // Reset selection state
    this.selectedFriendId = null;

    // Clear selection from all avatars first
    this.avatarElements.forEach((element, friendId) => {
      element.classList.remove("selected");
      const ring = element.querySelector(".selection-ring");
      if (ring) {
        // Clear inline styles
        ring.style.opacity = "";
        ring.style.transform = "";
        ring.style.borderColor = "";
        ring.style.borderWidth = "";
        ring.style.zIndex = "";
        ring.style.display = "";
      }
    });

    // Get user element and select it
    const userElement = this.avatarElements.get("user");
    if (!userElement) {
      console.error("❌ DEBUG: User element not found for force selection");
      return;
    }

    // Force add selected class
    userElement.classList.add("selected");

    // Force ring visibility with inline styles for user only
    const ring = userElement.querySelector(".selection-ring");
    if (ring) {
      ring.style.opacity = "1";
      ring.style.transform = "scale(1.12)";
      ring.style.borderColor = "#9333ea";
      ring.style.borderWidth = "3px";
      ring.style.zIndex = "2";
      ring.style.display = ""; // Remove display override to use CSS

      console.log("🔍 DEBUG: Forced user ring visibility with inline styles");
    } else {
      console.error("❌ DEBUG: User ring element not found");
    }

    // 🎯 NEW: Set the selectedFriendId state and emit schedule change event
    this.selectedFriendId = null; // null represents user's own schedule

    // Emit schedule change event to update HomePage
    this.emitScheduleChangeEvent("user", "You");

    console.log("🔍 DEBUG: User selection forced successfully");
  }

  /**
   * Ensure user is selected by default - fallback method
   * This method ensures the purple ring appears on the user avatar
   * especially when there are no starred friends
   * 🎯 FIXED: Respect compare mode - don't auto-select in compare mode
   */
  async ensureUserSelected() {
    console.log("🔍 DEBUG: ensureUserSelected() called");

    // Check if container exists
    if (!this.container) {
      console.error("❌ DEBUG: Container is null in ensureUserSelected()");
      return;
    }

    // 🎯 NEW: Don't auto-select user in compare mode - allow empty selections
    if (this.compareMode) {
      console.log(
        "🔍 DEBUG: In compare mode - allowing empty selection, not auto-selecting user"
      );
      return;
    }

    // Check if any friend is currently selected
    let hasSelection = false;
    this.avatarElements.forEach((element, friendId) => {
      if (element.classList.contains("selected")) {
        hasSelection = true;
        console.log(`🔍 DEBUG: Found selected element: ${friendId}`);
      }
    });

    // Only ensure user is selected if not in compare mode and no other friend is selected
    if (!hasSelection || this.selectedFriendId === null) {
      console.log("🔍 DEBUG: No selection found, selecting user");
      await this.selectUser();
    }
  }

  /**
   * Handle refresh button click
   */
  async handleRefreshClick() {
    console.log("🔄 Refreshing Quick Access friends...");

    try {
      await this.loadQuickAccessFriends();
      this.render();

      // Ensure user is selected after refresh
      this.addTrackedTimeout(async () => {
        await this.ensureUserSelected();
      }, 50);

      console.log("Quick Access friends refreshed");
    } catch (error) {
      console.error("❌ Failed to refresh friends:", error);
    }
  }

  /**
   * Handle keyboard navigation
   */
  handleKeyboardNavigation(event) {
    const { key } = event;

    if (!["ArrowLeft", "ArrowRight", "Enter", " "].includes(key)) return;

    event.preventDefault();

    const focusedElement = document.activeElement;
    const avatarItem = focusedElement.closest(".friend-avatar-item");

    if (!avatarItem) return;

    if (key === "Enter" || key === " ") {
      // Activate current avatar
      this.handleAvatarClick({ target: avatarItem });
      return;
    }

    // Navigate between avatars
    const allAvatars = Array.from(
      this.container.querySelectorAll(".friend-avatar-item")
    );
    const currentIndex = allAvatars.indexOf(avatarItem);

    let nextIndex = currentIndex;
    if (key === "ArrowLeft" && currentIndex > 0) {
      nextIndex = currentIndex - 1;
    } else if (key === "ArrowRight" && currentIndex < allAvatars.length - 1) {
      nextIndex = currentIndex + 1;
    }

    if (nextIndex !== currentIndex) {
      allAvatars[nextIndex].focus();
      this.scrollToAvatar(allAvatars[nextIndex]);
    }
  }

  /**
   * Handle long press for compare mode activation
   */
  handleAvatarLongPress(event) {
    // Long press functionality removed - compare mode only activates via button
    return;
  }

  /**
   * Toggle compare mode on/off
   */
  handleToggleCompareMode() {
    // Prevent rapid successive clicks
    if (this._isToggling) {
      console.log("🚫 Compare mode toggle already in progress, ignoring");
      return;
    }

    this._isToggling = true;

    console.log(
      `� DEBUG COMPARE: Toggle compare mode - current state: ${this.compareMode}`
    );

    if (this.compareMode) {
      this.deactivateCompareMode();
    } else {
      this.activateCompareMode();
    }

    // Reset toggle flag after a short delay
    setTimeout(() => {
      this._isToggling = false;
    }, 500);
  }

  /**
   * Activate compare mode
   */
  activateCompareMode() {
    console.log("� DEBUG COMPARE: Activating compare mode");

    this.compareMode = true;
    this.selectedForCompare.clear();

    console.log(
      "🔴 DEBUG COMPARE: Compare mode activated - cleared all selections"
    );

    // Immediately clear all purple selection rings when entering compare mode
    this.avatarElements.forEach((element, friendId) => {
      element.classList.remove("selected");
      const selectionRing = element.querySelector(".selection-ring");
      if (selectionRing) {
        selectionRing.classList.remove("compare-selected-ring");
        // Clear any inline styles to hide purple rings instantly
        selectionRing.style.opacity = "";
        selectionRing.style.transform = "";
        selectionRing.style.borderColor = "";
        selectionRing.style.borderWidth = "";
        selectionRing.style.zIndex = "";
        selectionRing.style.display = "";
      }
      console.log(
        `🔴 DEBUG COMPARE: Cleared purple selection from ${friendId}`
      );
    });

    // Update UI to show compare mode
    this.updateCompareUI();

    // (removed) First-time tooltip was unused and stored in localStorage

    // Emit event for other components
    this.emitCompareModeEvent(true);

    this.showDebouncedNotification(
      "Compare mode activated - Tap friends to compare schedules",
      "info",
      3000
    );
  }

  /**
   * Deactivate compare mode
   */
  deactivateCompareMode() {
    console.log("� DEBUG COMPARE: Deactivating compare mode");

    // Debug: Show what was previously selected before clearing
    console.log("🔴 DEBUG COMPARE: Previously selected for comparison:", {
      selectedIds: Array.from(this.selectedForCompare),
      selectedNames: Array.from(this.selectedForCompare).map((id) => {
        if (id === "user") return "You";
        const friend = this.quickAccessFriends.find(
          (f) => (f.friendId || f.userId) === id
        );
        return friend ? friend.handle || id : id;
      }),
      totalSelected: this.selectedForCompare.size,
    });

    this.compareMode = false;
    this.selectedForCompare.clear();

    console.log(
      "🔴 DEBUG COMPARE: Compare mode deactivated - cleared all selections"
    );

    // Update UI to exit compare mode
    this.updateCompareUI();

    // Emit event for other components
    this.emitCompareModeEvent(false);

    this.showDebouncedNotification("Compare mode deactivated", "info", 1500);
  }

  syncCompareMode(isActive) {
    console.log(
      `🔄 Syncing compare mode: ${isActive ? "activate" : "deactivate"}`
    );

    this.compareMode = isActive;

    if (!isActive) {
      this.selectedForCompare.clear();
    }

    // Update UI without emitting events (prevents infinite loop)
    this.updateCompareUI();
  }

  /**
   * Toggle friend selection for comparison with privacy checks
   */
  toggleCompareSelection(friendId, friendName) {
    // Check if this friend is restricted (privacy-aware comparison)
    const friend = this.quickAccessFriends.find(
      (f) => (f.friendId || f.userId) === friendId
    );

    if (friend && friend.isRestricted) {
      console.log(`🔒 Cannot compare ${friendName} - privacy restricted`);
      notificationManager.showPrivacyNotification(
        friendName,
        "schedule",
        "access",
        {
          duration: 3000,
          type: "warning",
          message: `${friendName}'s schedule is private - cannot include in comparison`,
        }
      );
      return;
    }

    if (this.selectedForCompare.has(friendId)) {
      // Remove from selection
      this.selectedForCompare.delete(friendId);
      console.log(
        `🔴 DEBUG COMPARE: Removed ${friendName} (${friendId}) from comparison`
      );
    } else {
      // Add to selection
      this.selectedForCompare.add(friendId);
      console.log(
        `🔴 DEBUG COMPARE: Added ${friendName} (${friendId}) to comparison`
      );
    }

    // Debug: Show all currently selected users for comparison
    console.log(`🔴 DEBUG COMPARE: Currently selected for comparison:`, {
      selectedIds: Array.from(this.selectedForCompare),
      selectedNames: Array.from(this.selectedForCompare).map((id) => {
        if (id === "user") return "You";
        const friend = this.quickAccessFriends.find(
          (f) => (f.friendId || f.userId) === id
        );
        return friend ? friend.handle || id : id;
      }),
      totalSelected: this.selectedForCompare.size,
    });

    // Update visual selection
    this.updateCompareSelectionUI();

    // Emit comparison update event
    this.emitComparisonUpdateEvent();

    // Show feedback
    const action = this.selectedForCompare.has(friendId)
      ? "added to"
      : "removed from";
    this.showDebouncedNotification(
      `${friendName} ${action} comparison`,
      "info",
      1500
    );
  }

  /**
   * Update UI for compare mode state
   */
  updateCompareUI() {
    const compareButton = this.container.querySelector(".btn-compare");
    const container = this.container.querySelector(".horizontal-friends-bar");

    if (compareButton) {
      compareButton.classList.toggle("active", this.compareMode);

      // Update button text and icon based on state
      const icon = compareButton.querySelector("i");
      if (icon) {
        icon.className = this.compareMode
          ? "fas fa-times-circle"
          : "fas fa-balance-scale";
      }

      // Update title attribute
      compareButton.title = this.compareMode
        ? "Exit Compare Mode"
        : "Toggle Compare Mode";
    }

    if (container) {
      container.classList.toggle("compare-mode", this.compareMode);
    }

    // Update all avatar visual states ONLY when in compare mode or exiting it
    this.updateCompareSelectionUI();

    // Show/hide compare button based on friends availability
    this.updateCompareButtonVisibility();
  }

  /**
   * Update visual selection for compare mode with privacy awareness
   */
  updateCompareSelectionUI() {
    console.log(
      `🔴 DEBUG COMPARE: Updating UI - compareMode: ${
        this.compareMode
      }, selected: [${Array.from(this.selectedForCompare).join(", ")}]`
    );

    this.avatarElements.forEach((element, friendId) => {
      const isSelected = this.selectedForCompare.has(friendId);
      const isRestricted = element.dataset.privacyRestricted === "true";

      element.classList.toggle("compare-selected", isSelected);

      // Debug logging for each avatar
      console.log(
        `🔴 DEBUG COMPARE: Avatar ${friendId} - isSelected: ${isSelected}, compareMode: ${this.compareMode}, isRestricted: ${isRestricted}`
      );

      // Add selection indicator if in compare mode
      if (this.compareMode) {
        // Only add compare-mode-available if not restricted (disabled avatars can't participate)
        if (!isRestricted || friendId === "user") {
          element.classList.add("compare-mode-available");
        }

        // Remove normal selection state when in compare mode
        element.classList.remove("selected");

        // Update the selection ring for compare mode
        const selectionRing = element.querySelector(".selection-ring");
        if (selectionRing) {
          if (isSelected && (!isRestricted || friendId === "user")) {
            // Apply red glow animation for selected items in compare mode
            selectionRing.classList.add("compare-selected-ring");
            console.log(
              `🔴 DEBUG COMPARE: Applied red selection ring to ${friendId}`
            );
          } else {
            // Remove compare selection styling
            selectionRing.classList.remove("compare-selected-ring");
            console.log(
              `🔴 DEBUG COMPARE: Removed red selection ring from ${friendId}`
            );
          }
        }

        // Remove any old checkmarks if they exist
        const checkmark = element.querySelector(".compare-checkmark");
        if (checkmark) checkmark.remove();
      } else {
        element.classList.remove("compare-mode-available", "compare-selected");
        // Clean up compare selection styling when not in compare mode
        const selectionRing = element.querySelector(".selection-ring");
        if (selectionRing) {
          selectionRing.classList.remove("compare-selected-ring");
          console.log(
            `🔴 DEBUG COMPARE: Cleaned up red selection ring from ${friendId} (exiting compare mode)`
          );
        }
        // Remove any old checkmarks
        const checkmark = element.querySelector(".compare-checkmark");
        if (checkmark) checkmark.remove();

        // Restore user selection state when exiting compare mode
        if (friendId === "user") {
          element.classList.add("selected");
          console.log(
            `🔴 DEBUG COMPARE: Restored user selection state after exiting compare mode`
          );
        }
      }
    });
  }

  /**
   * Update compare button visibility based on available friends
   */
  updateCompareButtonVisibility() {
    const compareButton = this.container.querySelector(".btn-compare");
    if (compareButton) {
      // Show compare button only if user has friends to compare with
      const hasFriends = this.quickAccessFriends.length > 0;
      compareButton.style.display = hasFriends ? "flex" : "none";
    }
  }

  // (removed) compare tooltip method and localStorage tracking

  /**
   * Emit compare mode change event
   */
  emitCompareModeEvent(isActive) {
    const eventDetail = {
      compareMode: isActive,
      selectedFriends: Array.from(this.selectedForCompare),
      timestamp: Date.now(),
    };

    console.log("📡 Emitting compare:mode event:", eventDetail);

    document.dispatchEvent(
      new CustomEvent("compare:mode", {
        detail: eventDetail,
        bubbles: true,
      })
    );
  }

  /**
   * Emit comparison update event when selection changes
   */
  emitComparisonUpdateEvent() {
    // Build detailed user data for comparison
    const selectedUsersData = [];

    // Add user's own data if selected for comparison
    if (this.selectedForCompare.has("user")) {
      selectedUsersData.push({
        userId: "user",
        friendId: "user",
        handle: this.currentUser?.handle || "you",
        isCurrentUser: true,
        profile: this.currentUser,
      });
    }

    // Add friend data for selected friends
    this.quickAccessFriends.forEach((friend) => {
      const friendId = friend.friendId || friend.userId;
      if (this.selectedForCompare.has(friendId)) {
        selectedUsersData.push({
          userId: friend.userId,
          friendId: friendId,
          handle: friend.handle,
          isCurrentUser: false,
          profile: friend,
        });
      }
    });

    const eventDetail = {
      selectedFriends: Array.from(this.selectedForCompare),
      selectedUsersData: selectedUsersData,
      compareMode: this.compareMode,
      userCount: selectedUsersData.length,
      hasUser: this.selectedForCompare.has("user"),
      timestamp: Date.now(),
    };

    console.log("📡 Emitting compare:selection event:", eventDetail);
    console.log(
      "🔴 DEBUG COMPARE: Event detail - userCount:",
      eventDetail.userCount,
      "users:",
      eventDetail.selectedUsersData.map((u) => u.handle)
    );

    document.dispatchEvent(
      new CustomEvent("compare:selection", {
        detail: eventDetail,
        bubbles: true,
      })
    );
  }

  /**
   * Set up real-time listeners for Quick Access changes and privacy updates
   */
  setupRealTimeListeners() {
    logManager.realtimeListener(
      "Setting up",
      "smart listeners",
      "HorizontalFriendsBar"
    );

    // ENHANCED: Smart database listener with change detection to prevent loops
    if (currentUser?.user?.uid && dataManager?.listenToUserProfile) {
      logManager.realtimeListener(
        "Setting up",
        "database listener with loop prevention"
      );

      const userProfileUnsubscriber = dataManager.listenToUserProfile(
        currentUser.user.uid,
        async (userProfile) => {
          // ENHANCED CIRCUIT BREAKER: Don't process database updates during ANY sync operations
          if (
            this.isBatchSyncing ||
            this.isPrivacySyncing ||
            window.profile_updates_in_progress
          ) {
            logManager.dev.debug(
              "CIRCUIT BREAKER: Ignoring database update during sync operations"
            );
            return;
          }

          console.log("📡 External database update received:", userProfile);

          // Check if quickAccessData changed from external source
          const quickAccessData = userProfile?.quickAccessData;
          if (quickAccessData?.starredFriends) {
            // ENHANCED: Only update if data actually changed (prevent unnecessary renders)
            const newFriendsData = quickAccessData.starredFriends;
            const hasActualChanges = !this.deepEqual(
              this.quickAccessFriends,
              newFriendsData
            );

            if (hasActualChanges) {
              console.log(
                "📡 External starred friends update detected, applying:",
                {
                  currentCount: this.quickAccessFriends?.length || 0,
                  newCount: newFriendsData.length,
                  source: "external_database_change",
                }
              );

              // FIXED: Preserve location context during external updates to prevent grey dots
              // Re-enhance the new friends data with location context before rendering
              console.log(
                "🔄 Re-enhancing external friends data with location context..."
              );
              const enhancedFriends = await this.enhanceFriendsWithLocationData(
                newFriendsData
              );

              // OPTIMIZATION: Only do full render if friend list structure changed (added/removed friends)
              const structureChanged =
                this.quickAccessFriends.length !== enhancedFriends.length ||
                !enhancedFriends.every((friend) =>
                  this.quickAccessFriends.find(
                    (existing) =>
                      (existing.friendId || existing.userId) ===
                      (friend.friendId || friend.userId)
                  )
                );

              this.quickAccessFriends = enhancedFriends;

              if (structureChanged) {
                console.log(
                  "🔄 Friend list structure changed, doing full render"
                );
                this.render();
              } else {
                console.log(
                  "🎨 Friend list unchanged, updating presence dots only"
                );
                // Update presence dots individually to preserve timer state
                // Use the fresh enhanced friends data for accurate presence dots
                enhancedFriends.forEach((friend, index) => {
                  this.updateFriendPresenceDot(index, friend);
                });
              }

              // Re-setup privacy listeners for new friend list
              this.setupFriendshipPrivacyListeners();

              console.log(
                "✅ HorizontalFriendsBar updated with external database data"
              );
            } else {
              console.log(
                "📡 Database update contained no actual changes, skipping render"
              );
            }
          }
        }
      );

      if (userProfileUnsubscriber) {
        this.realTimeUnsubscribers = [userProfileUnsubscriber];
      }
    }

    // ENHANCED: Smart friend profile listeners with batch processing
    if (dataManager?.listenToUserProfile) {
      console.log(
        "📡 Setting up smart profile change listeners for starred friends"
      );

      this.friendProfileUnsubscribers = [];

      // Set up listeners for each starred friend's profile
      this.setupStarredFriendProfileListeners();
    }

    // NEW: Set up real-time privacy listeners for immediate privacy updates
    if (currentUser?.user?.uid) {
      console.log(
        "🔒 Setting up real-time privacy listeners for friendship documents"
      );
      this.setupFriendshipPrivacyListeners();
    }

    // Fallback: Listen for Quick Access updates from FriendsService (external changes only)
    if (friendsManager.registerUICallbacks) {
      friendsManager.registerUICallbacks({
        onQuickAccessUpdated: (quickAccessData) => {
          // ENHANCED: Only process if not from our own update operations
          if (
            !this.isBatchSyncing &&
            !this.isPrivacySyncing &&
            !window.profile_updates_in_progress
          ) {
            console.log(
              "⭐ External Quick Access update in HorizontalFriendsBar:",
              quickAccessData
            );
            this.handleRealTimeQuickAccessUpdate(quickAccessData);
          } else {
            console.log(
              "🛑 Ignoring Quick Access update from our own sync operations"
            );
          }
        },
      });
    }

    // 🎯 PHASE 3: Subscribe to optimistic unfriending events for immediate UI updates
    console.log(
      "🎯 PHASE 3: Setting up optimistic event listeners for immediate UI response"
    );

    this.optimisticUnfriendingUnsubscriber = friendsManager.onOptimisticEvent(
      "optimistic-unfriending",
      (data) => {
        console.log("🚀 PHASE 3: Optimistic unfriending event received:", data);
        this.handleOptimisticUnfriending(data);
      }
    );

    this.optimisticRollbackUnsubscriber = friendsManager.onOptimisticEvent(
      "optimistic-rollback",
      (data) => {
        console.log("🔄 PHASE 3: Optimistic rollback event received:", data);
        this.handleOptimisticRollback(data);
      }
    );

    this.optimisticSuccessUnsubscriber = friendsManager.onOptimisticEvent(
      "optimistic-success",
      (data) => {
        console.log("✅ PHASE 3: Optimistic success event received:", data);
        this.handleOptimisticSuccess(data);
      }
    );

    // Listen for schedule privacy changes (Phase 4.1) - Enhanced with immediate handling
    const privacyChangeUnsubscriber = realTimeManager.on(
      REALTIME_EVENTS.SCHEDULE_PRIVACY_CHANGE,
      (privacyEvent) => {
        console.log(
          "🔒 IMMEDIATE: Privacy change event received in HorizontalFriendsBar:",
          privacyEvent
        );

        // Handle privacy changes immediately (bypass circuit breaker)
        this.handlePrivacyChange(privacyEvent);

        // Also update privacy status if it affects our starred friends
        if (privacyEvent.affectedUserId) {
          const newPrivacyStatus = {
            avatarEnabled: privacyEvent.scheduleVisibility,
            tooltip: privacyEvent.scheduleVisibility
              ? "Click to view schedule"
              : "Schedule access restricted",
            description: privacyEvent.scheduleVisibility
              ? "Schedule is visible - quick access enabled"
              : "This user has hidden their schedule from you",
            lastUpdated: new Date().toISOString(),
            source: "realtime_event",
          };

          this.handlePrivacyStatusUpdate(
            privacyEvent.affectedUserId,
            newPrivacyStatus
          );
        }
      }
    );

    // Add privacy listener to unsubscribers
    if (!this.realTimeUnsubscribers) {
      this.realTimeUnsubscribers = [];
    }
    this.realTimeUnsubscribers.push(privacyChangeUnsubscriber);

    // Listen for Quick Access updates from RealtimeService (centralized cleanup)
    const quickAccessUnsubscriber = realTimeManager.on(
      REALTIME_EVENTS.QUICK_ACCESS_UPDATED,
      (quickAccessData) => {
        // Only log in development to reduce console spam in production
        if (window.location.hostname === "localhost") {
          console.log(
            "⭐ REALTIME: Quick Access update event received in HorizontalFriendsBar:",
            quickAccessData
          );
        }

        // Handle the Quick Access update to refresh the UI
        this.handleRealTimeQuickAccessUpdate(quickAccessData);
      }
    );
    this.realTimeUnsubscribers.push(quickAccessUnsubscriber);

    // Listen for campus presence changes to update presence dots in real-time
    const campusPresenceUnsubscriber = realTimeManager.on(
      REALTIME_EVENTS.CAMPUS_PRESENCE_CHANGED,
      (presenceEvent) => {
        // Only log in development to reduce console spam in production
        if (window.location.hostname === "localhost") {
          console.log(
            "🌍 REALTIME: Campus presence change received in HorizontalFriendsBar:",
            presenceEvent
          );
        }

        // Handle the campus presence update to refresh presence dots
        this.handleCampusPresenceUpdate(presenceEvent);
      }
    );
    this.realTimeUnsubscribers.push(campusPresenceUnsubscriber);

    // Listen for user activity changes to update presence dots (solid vs timer dots)
    const activityUnsubscriber = realTimeManager.on(
      REALTIME_EVENTS.USER_ACTIVITY_CHANGED,
      (activityEvent) => {
        // Only log in development to reduce console spam in production
        if (window.location.hostname === "localhost") {
          console.log(
            "💓 REALTIME: User activity change received in HorizontalFriendsBar:",
            activityEvent
          );
        }

        // Handle the activity change to refresh presence dots (solid vs timer)
        this.handleUserActivityUpdate(activityEvent);
      }
    );
    this.realTimeUnsubscribers.push(activityUnsubscriber);

    // Smart real-time listeners set up successfully

    // 🚀 FRESH DATA PRIORITY: Set up Campus Presence fresh data event listeners
    this.setupFreshDataEventListeners();
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Set up event listeners for Campus Presence fresh data
   * Handles loading states and fresh data updates for presence dots
   */
  setupFreshDataEventListeners() {
    if (this._freshDataListenersSetup) return; // Idempotent
    // Setting up Campus Presence fresh data event listeners

    // Track whether we're currently waiting for fresh data (user only by default)
    this.loadingState.user =
      sessionStorage.getItem("campusPresence_forceFreshData") === "true";

    // 🎯 NEW: Listen for campus presence loading events (from app.js background init)
    document.addEventListener("campus-presence:loading", (event) => {
      // Campus presence loading started
      const priority = event?.detail?.priority || "fresh_data";
      if (priority === "presence_poll") {
        this.loadingState.user = true;
      } else {
        this.loadingState.user = true;
        if (!this.initialFreshComplete) {
          this.quickAccessFriends.forEach((f) => {
            const key = f.friendId || f.userId || f.uid;
            if (key) this.friendLoading.set(key, true);
          });
        }
      }
      this.showPresenceDotsLoading(priority);
    });

    // 🎯 NEW: Listen for campus presence ready events (from app.js background init)
    document.addEventListener("campus-presence:ready", (event) => {
      // Campus presence ready
      this.loadingState.user = false;

      if (event.detail.freshDataLoaded) {
        // Fresh data was loaded - refreshing presence dots
        if (!this.initialFreshComplete) {
          this.initialFreshComplete = true;
          this.friendLoading.clear();
        }
        this.refreshPresenceDotsWithLatestData();
      } else {
        // Using cached data - showing existing presence dots
        this.hidePresenceDotsLoading();
      }
    });

    // 🎯 NEW: Listen for priority location fetch events
    document.addEventListener("campus-presence:fetching-fresh", (event) => {
      // Priority location fetch started
      // Keep loading state active during priority fetch
      this.loadingState.user = true;
    });

    // 🎯 NEW: Listen for campus presence errors
    document.addEventListener("campus-presence:error", (event) => {
      console.error(
        "❌ [HorizontalFriendsBar] Campus presence error:",
        event.detail.error
      );
      this.loadingState.user = false;
      this.hidePresenceDotsLoading();
    });

    this._freshDataListenersSetup = true;
    // LEGACY: Keep existing event listeners for backward compatibility
    document.addEventListener("campus-presence:data-loading", (event) => {
      if (this.initialFreshComplete) return;
      logManager.dev.debug("Legacy data loading event");
      this.loadingState.user = true;
      this.showPresenceDotsLoading("legacy");
    });

    document.addEventListener("campus-presence:fresh-data-ready", (event) => {
      if (this.initialFreshComplete) return;
      logManager.location.info("Legacy fresh data received:", event.detail);
      this.loadingState.user = false;
      this.updatePresenceDotsWithFreshData(event.detail.locationData);
    });

    document.addEventListener("campus-presence:data-error", (event) => {
      if (this.initialFreshComplete) return;
      console.error(
        "❌ [HorizontalFriendsBar] Legacy data error:",
        event.detail.error
      );
      this.loadingState.user = false;
      this.hidePresenceDotsLoading();
    });

    console.log("✅ Enhanced fresh data event listeners set up successfully");
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Show loading state on presence dots
   */
  showPresenceDotsLoading(priority = "fresh_data") {
    logManager.dev.debug("Showing loading state on presence dots", {
      priority,
    });

    // Update user's own presence dot
    if (this.userAvatarElement) {
      const userDot = this.userAvatarElement.querySelector(".presence-dot");
      if (userDot && !userDot.classList.contains("spinner-overlay")) {
        userDot.classList.add("spinner-overlay");
        userDot.title = "Loading fresh location data...";
      }
    }

    // Update friends' presence dots if they have location sharing
    // For first fresh load, we show overlay on friends too.
    // For periodic presence polling, only show overlay on user's dot to avoid noise.
    if (priority !== "presence_poll") {
      this.quickAccessFriends.forEach((friend) => {
        const key = friend.friendId || friend.userId || friend.uid;
        if (!this.friendLoading.get(key)) return; // only overlay friends marked as loading
        const avatarElement = this.avatarElements.get(key);
        if (avatarElement) {
          const friendDot = avatarElement.querySelector(".presence-dot");
          if (friendDot && !friendDot.classList.contains("spinner-overlay")) {
            friendDot.classList.add("spinner-overlay");
            friendDot.title = "Loading fresh location data...";
          }
        }
      });
    }
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Update presence dots with fresh location data
   */
  updatePresenceDotsWithFreshData(freshLocationData) {
    logManager.dev.debug(
      "Updating presence dots with fresh data:",
      freshLocationData
    );

    // Update user's presence dot if current user has location sharing
    if (this.currentUser && this.userAvatarElement) {
      const systemInfo = this.currentUser.systemInfo;
      if (systemInfo?.locationSharingEnabled) {
        const userDot = this.userAvatarElement.querySelector(".presence-dot");
        if (userDot) {
          // Import PresenceDot dynamically to avoid circular imports
          import("../../components/presence/PresenceDot.js")
            .then(({ PresenceDot }) => {
              PresenceDot.updateWithFreshData(
                userDot,
                systemInfo.lastActive,
                systemInfo.lastKnownLocation,
                systemInfo.locationSharingEnabled
              );
              // Ensure spinner is cleared after update
              userDot.classList.remove("spinner-overlay");
              userDot.title = "";
            })
            .catch((error) => {
              console.error("Failed to load PresenceDot:", error);
              this.hidePresenceDotsLoading();
            });
        }
      }
    }

    // Update friends' presence dots
    this.quickAccessFriends.forEach((friend) => {
      if (friend.hasLocationSharing) {
        const key = friend.friendId || friend.userId || friend.uid;
        const avatarElement = this.avatarElements.get(key);
        if (avatarElement) {
          const friendDot = avatarElement.querySelector(".presence-dot");
          if (friendDot) {
            import("../../components/presence/PresenceDot.js")
              .then(({ PresenceDot }) => {
                PresenceDot.updateWithFreshData(
                  friendDot,
                  friend.lastActive,
                  friend.lastKnownLocation,
                  friend.hasLocationSharing
                );
                friendDot.classList.remove("spinner-overlay");
                friendDot.title = "";
              })
              .catch((error) => {
                console.error("Failed to load PresenceDot for friend:", error);
              });
          }
        }
      }
    });
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Hide loading state on presence dots
   */
  hidePresenceDotsLoading() {
    console.log(
      "⏹️ [HorizontalFriendsBar] Hiding loading overlay on presence dots"
    );

    // Remove overlay from user's dot
    if (this.userAvatarElement) {
      const userDot = this.userAvatarElement.querySelector(".presence-dot");
      if (userDot) userDot.classList.remove("spinner-overlay");
    }

    // Remove overlay from friends' dots
    this.quickAccessFriends.forEach((friend) => {
      const key = friend.friendId || friend.userId || friend.uid;
      const avatarElement = this.avatarElements.get(key);
      if (avatarElement) {
        const friendDot = avatarElement.querySelector(".presence-dot");
        if (friendDot) friendDot.classList.remove("spinner-overlay");
      }
    });
  }

  /**
   * 🎯 FRESH DATA PRIORITY: Refresh presence dots with latest data after background load
   */
  refreshPresenceDotsWithLatestData() {
    // Refreshing presence dots with latest data

    try {
      // Update user's presence dot with latest data
      if (this.currentUser && this.userAvatarElement) {
        const systemInfo = this.currentUser.systemInfo;
        if (systemInfo) {
          this.updateUserPresenceDot(systemInfo);
        }
      }

      // Update friends' presence dots with latest data
      if (this.quickAccessFriends && this.quickAccessFriends.length > 0) {
        this.quickAccessFriends.forEach((friend, index) => {
          if (friend && friend.hasLocationSharing) {
            this.updateFriendPresenceDot(index, friend);
          }
        });
        // Refreshed friend presence dots with latest data
      }

      // All presence dots refreshed with latest data
    } catch (error) {
      console.error(
        "❌ [HorizontalFriendsBar] Failed to refresh presence dots:",
        error
      );
      // Fallback to hiding loading state
      this.hidePresenceDotsLoading();
    }
  }

  /**
   * Handle schedule privacy change events (Phase 4.1)
   * Updates avatar disabled states when friends change their privacy settings
   */
  async handlePrivacyChange(privacyEvent) {
    try {
      console.log(
        "🔒 Processing privacy change event in HorizontalFriendsBar:",
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

      // Clear all relevant caches to ensure fresh data
      try {
        const { friendshipPrivacyService } = await import(
          "../../services/friends/FriendshipPrivacyService.js"
        );
        friendshipPrivacyService.clearFriendshipCache(
          fromUserId,
          affectedUserId
        );
        console.log("🧹 Cleared friendship privacy cache for real-time update");
      } catch (error) {
        console.warn("⚠️ Failed to clear friendship privacy cache:", error);
      }

      // Clear Quick Access cache in FriendsManager to ensure fresh avatar data
      try {
        const cacheKey = `quick_access_${currentUser?.user?.uid}`;
        if (friendsManager.clearCache) {
          friendsManager.clearCache(cacheKey);
          console.log("🧹 Cleared Quick Access cache for fresh avatar data");
        }
      } catch (error) {
        console.warn("⚠️ Failed to clear Quick Access cache:", error);
      }

      // Reload Quick Access friends with updated privacy status
      // IMPORTANT: Force cache refresh to get updated avatar data and privacy status
      await this.loadQuickAccessFriends(false); // false = bypass cache

      // Re-render avatars with updated privacy-aware disabled states
      this.render();

      // Maintain current selection if still valid
      if (this.selectedFriendId) {
        const stillExists = this.quickAccessFriends.some(
          (f) => (f.friendId || f.userId) === this.selectedFriendId
        );

        if (!stillExists) {
          // Friend no longer available, fallback to user's schedule
          await this.selectUser();
        } else {
          // Re-select to maintain visual state
          this.updateVisualSelection(this.selectedFriendId);
        }
      } else {
        // Ensure user is selected after privacy update
        await this.ensureUserSelected();
      }

      console.log(
        "✅ Privacy change processed successfully in HorizontalFriendsBar"
      );
    } catch (error) {
      console.error(
        "❌ Error handling privacy change in HorizontalFriendsBar:",
        error
      );
    }
  }

  /**
   * Set up profile listeners for each starred friend to detect avatar/name changes
   */
  async setupStarredFriendProfileListeners() {
    if (!this.quickAccessFriends?.length) {
      console.log("📡 No starred friends to set up profile listeners for");
      return;
    }

    console.log(
      `📡 Setting up profile listeners for ${this.quickAccessFriends.length} starred friends`
    );

    // Clean up existing listeners first
    if (this.friendProfileUnsubscribers) {
      this.friendProfileUnsubscribers.forEach((unsubscriber) => {
        if (typeof unsubscriber === "function") {
          unsubscriber();
        }
      });
    }

    // Initialize or reset the unsubscribers array
    this.friendProfileUnsubscribers = [];

    // Set up a listener for each starred friend
    for (const friend of this.quickAccessFriends) {
      if (!friend.friendId) continue;

      try {
        const unsubscriber = dataManager.listenToUserProfile(
          friend.friendId,
          (friendProfile) => {
            this.handleStarredFriendProfileUpdate(
              friend.friendId,
              friendProfile
            );
          }
        );

        if (unsubscriber) {
          this.friendProfileUnsubscribers.push(unsubscriber);
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to set up profile listener for friend ${friend.friendId}:`,
          error
        );
      }
    }

    console.log(
      `✅ Set up ${this.friendProfileUnsubscribers.length} friend profile listeners`
    );
  }

  /**
   * Set up real-time listeners for friendship document changes to catch privacy updates
   * This ensures immediate privacy change detection per requirement R3.1
   */
  async setupFriendshipPrivacyListeners() {
    if (!this.quickAccessFriends || this.quickAccessFriends.length === 0) {
      console.log("🔒 No starred friends, skipping privacy listeners setup");
      return;
    }

    console.log(
      `🔒 Setting up privacy listeners for ${this.quickAccessFriends.length} starred friends`
    );

    // Clean up existing privacy listeners first
    if (this.privacyUnsubscribers) {
      this.privacyUnsubscribers.forEach((unsubscriber) => {
        if (typeof unsubscriber === "function") {
          unsubscriber();
        }
      });
    }

    // Initialize privacy listeners array
    this.privacyUnsubscribers = [];

    const currentUserUid = currentUser?.user?.uid;
    if (!currentUserUid) {
      console.warn("🔒 No current user for privacy listeners");
      return;
    }

    // Import Firestore functions needed for direct document listening
    const { doc, onSnapshot } = await import("firebase/firestore");

    // Set up friendship document listeners for each starred friend
    for (const friend of this.quickAccessFriends) {
      if (!friend.friendId) continue;

      try {
        // Use canonical ordering for friendship document ID (smaller userId first)
        const friendshipId =
          currentUserUid < friend.friendId
            ? `${currentUserUid}_${friend.friendId}`
            : `${friend.friendId}_${currentUserUid}`;

        // Listen to the canonical friendship document ID
        const friendshipDocRef = doc(db, "friendships", friendshipId);

        const unsubscriber = onSnapshot(
          friendshipDocRef,
          (docSnapshot) => {
            if (docSnapshot.exists()) {
              const friendshipData = docSnapshot.data();
              console.log(
                `🔒 REAL-TIME: Friendship privacy updated for ${friendshipId}`
              );
              this.handleFriendshipPrivacyChange(
                friend.friendId,
                friendshipData
              );
            } else {
              // Friendship deleted - let the centralized friendship listener handle cleanup
              console.log(
                `🔒 REAL-TIME: Friendship document ${friendshipId} deleted - relying on centralized cleanup`
              );
            }
          },
          (error) => {
            console.warn(
              `⚠️ Error listening to friendship document ${friendshipId}:`,
              error
            );
          }
        );

        if (unsubscriber) {
          this.privacyUnsubscribers.push(unsubscriber);
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to set up privacy listener for friend ${friend.friendId}:`,
          error
        );
      }
    }

    console.log(
      `✅ Set up ${this.privacyUnsubscribers.length} privacy listeners for friendship documents`
    );
  }

  /**
   * Handle real-time friendship document changes that affect privacy
   */
  handleFriendshipPrivacyChange(friendId, friendshipData) {
    if (!friendshipData) return;

    console.log(
      `🔒 REAL-TIME: Friendship privacy change detected for ${friendId}:`,
      friendshipData
    );

    const currentUserUid = currentUser?.user?.uid;
    if (!currentUserUid) return;

    // Ensure any cached privacy data is invalidated for fresh checks
    try {
      friendshipPrivacyService.clearFriendshipCache(currentUserUid, friendId);
    } catch (e) {
      // Non-fatal; proceed with UI update regardless
    }

    // Extract schedule visibility for current user
    const scheduleVisibility = friendshipData.scheduleVisibility;
    if (!scheduleVisibility) return;

    // Mutual (AND) gating: both sides must allow to view
    const friendAllows = scheduleVisibility[friendId] === true;
    const currentUserAllows = scheduleVisibility[currentUserUid] === true;
    const isScheduleVisible = friendAllows && currentUserAllows;

    console.log(
      `🔒 Schedule visibility for ${friendId} → ${currentUserUid}: ${isScheduleVisible}`
    );

    // Create updated privacy status object
    const newPrivacyStatus = {
      avatarEnabled: isScheduleVisible,
      tooltip: isScheduleVisible
        ? "Click to view schedule"
        : "Schedule access restricted",
      description: isScheduleVisible
        ? "Schedule is visible - quick access enabled"
        : "Schedule access is restricted",
      lastUpdated: new Date().toISOString(),
      source: "friendship_document_change",
    };

    // Trigger immediate privacy update (bypasses circuit breaker)
    this.handlePrivacyStatusUpdate(friendId, newPrivacyStatus);
  }

  /**
   * Handle profile updates for starred friends
   * Updates the local starred friends data and syncs to database efficiently
   * FIXED: Prevents infinite loops with proper change detection and re-entrancy protection
   */
  async handleStarredFriendProfileUpdate(friendId, friendProfile) {
    // ⚡ Presence-first fast path: if this update contains presence info,
    // bypass profile circuit breakers and update the dot immediately.
    const presenceInfo = friendProfile?.systemInfo?.lastKnownLocation;
    const presenceLastActive = friendProfile?.systemInfo?.lastActive;
    if (presenceInfo || presenceLastActive) {
      try {
        const friendIndex = this.quickAccessFriends.findIndex(
          (f) => f.friendId === friendId || f.userId === friendId
        );
        if (friendIndex !== -1) {
          const current = this.quickAccessFriends[friendIndex];
          const updated = { ...current };
          if (presenceInfo) updated.lastKnownLocation = presenceInfo;
          if (presenceLastActive) updated.lastActive = presenceLastActive;

          // Save and update dot immediately (no full re-render)
          this.quickAccessFriends[friendIndex] = updated;
          this.updateFriendPresenceDot(friendIndex, updated);
          logManager.presence?.debug?.(
            `⚡ Presence fast-path applied for ${friendId}`
          );
          return; // Presence handled; skip profile processing
        }
      } catch (e) {
        console.warn(
          `⚠️ Presence fast-path failed for ${friendId}, falling back to profile path:`,
          e
        );
      }
    }

    // ENHANCED CIRCUIT BREAKER: Only block PROFILE updates, not privacy updates
    const profileUpdateKey = `profile_updating_${friendId}`;
    if (this[profileUpdateKey]) {
      logManager.profileUpdate(friendId, "skipped - lock active");
      return;
    }

    // Check if this is a privacy-only update (bypass circuit breaker)
    const isPrivacyUpdate = this.isPrivacyOnlyUpdate(friendProfile);
    if (isPrivacyUpdate) {
      logManager.dev.debug(
        `Privacy-only update for ${friendId}, bypassing circuit breaker`
      );
      return this.handlePrivacyStatusUpdate(
        friendId,
        friendProfile?.privacyStatus
      );
    }

    // PROFILE UPDATE CIRCUIT BREAKER: Prevent infinite profile update loops
    const globalProfileKey = "profile_updates_in_progress";
    if (window[globalProfileKey]) {
      console.log(
        `🛑 PROFILE CIRCUIT BREAKER: Global profile updates in progress, blocking ${friendId}`
      );
      return;
    }

    // Activate profile update locks
    window[globalProfileKey] = true;
    this[profileUpdateKey] = true;

    try {
      logManager.profileUpdate(friendId, "processing");

      const friendIndex = this.quickAccessFriends.findIndex(
        (f) => f.friendId === friendId || f.userId === friendId
      );
      if (friendIndex === -1) {
        logManager.dev.debug(
          `📡 Friend ${friendId} not in starred list, ignoring update`
        );
        return;
      }

      const currentFriend = this.quickAccessFriends[friendIndex];

      // Extract new data with comprehensive fallback structure
      const newHandle =
        friendProfile?.profile?.handle ||
        friendProfile?.handle ||
        currentFriend.handle;

      const newAvatarConfig =
        friendProfile?.profile?.avatarConfig ||
        friendProfile?.avatarConfig ||
        currentFriend.avatarConfig;

      // Get lastActive for presence detection
      const newLastActive = friendProfile?.systemInfo?.lastActive;
      const currentLastActive = currentFriend.lastActive;

      // ENHANCED change detection - exclude privacy changes (handled separately)
      const nameChanged = newHandle && newHandle !== currentFriend.handle;
      const avatarChanged =
        newAvatarConfig &&
        !this.deepEqual(currentFriend.avatarConfig, newAvatarConfig);
      const lastActiveChanged =
        newLastActive &&
        (!currentLastActive ||
          newLastActive.toMillis() !== currentLastActive.toMillis());

      if (!nameChanged && !avatarChanged && !lastActiveChanged) {
        console.log(
          `📡 No significant profile changes for ${currentFriend.handle}, skipping update`
        );
        return;
      }

      // Applying UI-only profile update

      // LOCAL UPDATE ONLY - Do NOT sync to database immediately
      const updatedFriend = { ...currentFriend };
      let hasLocalUpdates = false;

      if (nameChanged) {
        const validatedHandle = this._validateString(
          newHandle,
          `Profile update handle for ${friendId}`,
          currentFriend.handle
        );
        if (validatedHandle && validatedHandle !== currentFriend.handle) {
          updatedFriend.handle = validatedHandle;
          hasLocalUpdates = true;
        }
      }

      if (avatarChanged) {
        const validatedConfig = this._validateAvatarConfig(
          newAvatarConfig,
          `Profile update avatarConfig for ${friendId}`
        );
        if (
          validatedConfig &&
          !this.deepEqual(currentFriend.avatarConfig, validatedConfig)
        ) {
          updatedFriend.avatarConfig = validatedConfig;
          hasLocalUpdates = true;
        }
      }

      if (lastActiveChanged) {
        // Update lastActive timestamp for presence detection
        updatedFriend.lastActive = newLastActive;
        hasLocalUpdates = true;

        // Also update presence dot immediately since activity changed
        const friendIndex = this.quickAccessFriends.findIndex(
          (f) => (f.friendId || f.userId) === friendId
        );
        if (friendIndex !== -1) {
          this.updateFriendPresenceDot(friendIndex, updatedFriend);
          // Updated presence dot due to activity change
        }
      }

      if (hasLocalUpdates) {
        // Update local state for immediate UI refresh
        this.quickAccessFriends[friendIndex] = updatedFriend;

        // Only trigger full re-render for profile changes (name/avatar), not for presence updates
        if (nameChanged || avatarChanged) {
          this.debouncedRender();
          // Profile UI updated (no database sync)
          // Schedule a batched database sync for profile changes only (longer delay)
          this.scheduleBatchedDatabaseSync();
        } else if (lastActiveChanged) {
          // Presence updated (no full re-render)
        }
      }
    } catch (error) {
      console.error(`❌ Error in profile update for ${friendId}:`, error);
    } finally {
      // Clear processing flags with staggered timing
      setTimeout(() => {
        this[profileUpdateKey] = false;
      }, 500);

      setTimeout(() => {
        window[globalProfileKey] = false;
      }, 1000);
    }
  }

  /**
   * Detect if this is a privacy-only update vs profile update
   */
  isPrivacyOnlyUpdate(friendProfile) {
    // Check if only privacy-related fields are present
    const hasPrivacyStatus = friendProfile?.privacyStatus !== undefined;
    const hasIsRestricted = friendProfile?.isRestricted !== undefined;

    // Check if profile fields are missing or unchanged
    const hasProfileChanges =
      friendProfile?.profile?.avatarConfig !== undefined ||
      friendProfile?.avatarConfig !== undefined ||
      friendProfile?.profile?.handle !== undefined ||
      friendProfile?.handle !== undefined;

    return (hasPrivacyStatus || hasIsRestricted) && !hasProfileChanges;
  }

  /**
   * Handle privacy changes separately from profile updates for immediate response
   * This bypasses the circuit breaker to ensure privacy changes are always immediate
   */
  async handlePrivacyStatusUpdate(friendId, newPrivacyStatus) {
    // NO CIRCUIT BREAKER for privacy updates - they must be immediate per R3.1
    logManager.realtimeListener("processing", "privacy update", friendId);

    try {
      // Find the friend in our starred friends list
      const friendIndex = this.quickAccessFriends.findIndex(
        (f) => f.friendId === friendId || f.userId === friendId
      );

      if (friendIndex === -1) {
        console.log(
          `🔒 Friend ${friendId} not in starred list, ignoring privacy update`
        );
        return;
      }

      const currentFriend = this.quickAccessFriends[friendIndex];

      // Check if privacy status actually changed
      const currentPrivacyStatus = currentFriend.privacyStatus;
      const hasPrivacyChanged = !this.deepEqual(
        currentPrivacyStatus,
        newPrivacyStatus
      );

      if (!hasPrivacyChanged) {
        console.log(
          `🔒 No privacy changes for ${currentFriend.handle}, skipping`
        );
        return;
      }

      console.log(
        `🔒 CRITICAL privacy change detected for ${currentFriend.handle}:`,
        {
          from: currentPrivacyStatus,
          to: newPrivacyStatus,
        }
      );

      // Update privacy status immediately
      const updatedFriend = {
        ...currentFriend,
        privacyStatus: newPrivacyStatus,
        // Update isRestricted based on privacy status
        isRestricted: !newPrivacyStatus?.avatarEnabled,
      };

      this.quickAccessFriends[friendIndex] = updatedFriend;

      // OPTIMIZED: Privacy-only visual update without triggering selection events
      this.renderPrivacyUpdate(friendId, updatedFriend);

      // IMMEDIATE database sync for privacy changes (no batching)
      this.syncPrivacyChangesImmediately([updatedFriend]);

      console.log(
        `✅ IMMEDIATE privacy update completed for ${updatedFriend.handle}`
      );
    } catch (error) {
      console.error(
        `❌ Error in immediate privacy update for ${friendId}:`,
        error
      );
    }
  }

  /**
   * Lightweight privacy-only visual update that doesn't trigger selection events
   * This prevents redundant UI re-renders and schedule change events
   */
  renderPrivacyUpdate(friendId, updatedFriend) {
    try {
      // Find the existing avatar element for this friend
      const existingElement = this.avatarElements.get(friendId);
      if (!existingElement) {
        // Instance not fully ready or friend not visible; skip instead of forcing full re-render
        console.log(
          `🔒 No existing avatar element for ${friendId}, skipping privacy re-render (component not ready or offscreen)`
        );
        return;
      }

      console.log(`🔒 Updating privacy visuals for ${updatedFriend.handle}`);

      // Update the avatar's classes and attributes based on new privacy status
      const avatarImg = existingElement.querySelector(".user-avatar-img");

      if (updatedFriend.isRestricted) {
        // Add disabled styling only (no lock icon)
        existingElement.classList.add("disabled");
        avatarImg?.classList.add("grayscale");
      } else {
        // Remove disabled styling
        existingElement.classList.remove("disabled");
        avatarImg?.classList.remove("grayscale");
      }

      // Always remove any existing lock icon remnants for cleanliness
      const existingLock = existingElement.querySelector(".privacy-lock-icon");
      if (existingLock) existingLock.remove();

      // Update tooltip for the entire avatar
      existingElement.title =
        updatedFriend.privacyStatus?.tooltip || updatedFriend.handle;

      console.log(
        `✅ Privacy visuals updated for ${updatedFriend.handle} without full re-render`
      );
    } catch (error) {
      console.error(
        `❌ Error updating privacy visuals for ${friendId}, falling back to full render:`,
        error
      );
      this.render();
    }
  }

  /**
   * Immediate sync for privacy changes only - bypasses batching system
   */
  async syncPrivacyChangesImmediately(updatedFriends) {
    // OPTIMIZATION: Set flag to prevent circular updates during privacy sync
    if (this.isPrivacySyncing) {
      console.log("🔒 Privacy sync already in progress, skipping duplicate");
      return;
    }

    this.isPrivacySyncing = true;

    try {
      const currentUserProfile = await currentUser.waitForProfile();
      if (!currentUserProfile?.uid) {
        console.warn("⚠️ No user profile for immediate privacy sync");
        return;
      }

      console.log("🔒 IMMEDIATE: Syncing privacy changes to database");

      // Find and update only the friends with privacy changes
      const currentQuickAccess = [...this.quickAccessFriends];

      // Update the affected friends in the full list
      updatedFriends.forEach((updatedFriend) => {
        const index = currentQuickAccess.findIndex(
          (f) =>
            f.friendId === updatedFriend.friendId ||
            f.userId === updatedFriend.userId
        );
        if (index !== -1) {
          currentQuickAccess[index] = updatedFriend;
        }
      });

      // Validate data for Firebase (simplified for privacy updates)
      const cleanFriendsData = currentQuickAccess.map((friend) => ({
        friendId: this._validateString(
          friend.friendId,
          `Privacy sync friendId`
        ),
        // Note: quickAccessFriends use friendId, not userId
        userId: this._validateString(
          friend.friendId,
          `Privacy sync userId (using friendId)`
        ),
        handle: this._validateString(
          friend.handle,
          `Privacy sync handle`,
          "unknown_user"
        ),
        avatarConfig: this._validateAvatarConfig(
          friend.avatarConfig,
          `Privacy sync avatarConfig`
        ),
        isRestricted: Boolean(friend.isRestricted),
        // Keep privacy status as rich object for full functionality
        privacyStatus: friend.privacyStatus || {
          avatarEnabled: false,
          tooltip: "Schedule access restricted",
        },
      }));

      // OPTIMIZATION: Use merge instead of update to reduce profile change triggers
      const userDocRef = doc(db, "users", currentUserProfile.uid);
      await updateDoc(userDocRef, {
        "quickAccessData.starredFriends": cleanFriendsData,
        "quickAccessData.lastUpdated": serverTimestamp(),
        // Add flag to identify this as a privacy-only update
        "quickAccessData.lastPrivacyUpdate": serverTimestamp(),
      });

      console.log("✅ IMMEDIATE: Privacy changes synced to database");
    } catch (error) {
      console.error("❌ Failed to sync privacy changes immediately:", error);
    } finally {
      // Clear flag after a short delay to prevent race conditions
      setTimeout(() => {
        this.isPrivacySyncing = false;
      }, 1000);
    }
  }

  /**
   * Schedule a batched database sync with much longer delay to prevent infinite loops
   * This breaks the circular dependency by separating UI updates from database writes
   */
  scheduleBatchedDatabaseSync() {
    // Clear any existing batch sync timer
    if (this.batchSyncTimeout) {
      clearTimeout(this.batchSyncTimeout);
    }

    // Much longer delay (15 seconds) to batch multiple updates and prevent loops
    this.batchSyncTimeout = setTimeout(() => {
      console.log("📦 Executing batched database sync...");
      this.executeBatchedDatabaseSync();
    }, 15000); // 15 second delay for batching

    console.log("⏰ Scheduled batched database sync in 15 seconds");
  }

  /**
   * Execute the actual database sync with enhanced validation
   */
  async executeBatchedDatabaseSync() {
    // Prevent concurrent syncs
    if (this.isBatchSyncing) {
      console.log("🔄 Batch sync already in progress, skipping");
      return;
    }

    this.isBatchSyncing = true;

    try {
      const currentUserProfile = await currentUser.waitForProfile();
      if (!currentUserProfile?.uid || !this.quickAccessFriends?.length) {
        console.log("⚠️ No user profile or friends data for batch sync");
        return;
      }

      console.log("📦 Executing batched database sync for starred friends");

      // Enhanced data validation with proper field mapping
      const cleanFriendsData = this.quickAccessFriends
        .filter((friend) => {
          if (!friend || typeof friend !== "object") {
            console.warn("⚠️ Filtered out invalid friend object:", friend);
            return false;
          }

          // Must have at least one valid ID
          if (!friend.friendId && !friend.userId) {
            console.warn("⚠️ Filtered out friend without valid ID:", friend);
            return false;
          }

          return true;
        })
        .map((friend, index) => {
          // CRITICAL FIX: Ensure proper field mapping between userId and friendId
          const primaryId = friend.friendId || friend.userId;
          const secondaryId = friend.userId || friend.friendId;

          const validatedFriend = {
            friendId: this._validateString(
              primaryId,
              `Friend ${index} friendId`
            ),
            userId: this._validateString(secondaryId, `Friend ${index} userId`),
            handle: this._validateString(
              friend.handle,
              `Friend ${index} handle`,
              "unknown_user"
            ),
            avatarConfig: this._validateAvatarConfig(
              friend.avatarConfig,
              `Friend ${index} avatarConfig`
            ),
            isRestricted: Boolean(friend.isRestricted),
            // CRITICAL FIX: Ensure privacyStatus is always a string
            privacyStatus: this._validatePrivacyStatus(
              friend.privacyStatus,
              `Friend ${index} privacyStatus`
            ),
          };

          return validatedFriend;
        });

      if (!cleanFriendsData.length) {
        console.warn("⚠️ No valid friends data to sync after validation");
        return;
      }

      // Final validation check
      const validationResult = this._validateFirebaseData(cleanFriendsData);
      if (!validationResult) {
        console.error("❌ Data validation failed, aborting sync");
        return;
      }

      console.log("📦 Syncing validated data to Firebase:", {
        count: cleanFriendsData.length,
        validation: "passed",
      });

      const userDocRef = doc(db, "users", currentUserProfile.uid);
      await updateDoc(userDocRef, {
        "quickAccessData.starredFriends": cleanFriendsData,
        "quickAccessData.lastUpdated": serverTimestamp(),
      });

      console.log("✅ Batched starred friends sync completed successfully");
    } catch (error) {
      console.error("❌ Batch sync failed:", error);

      // Enhanced error debugging
      if (error.message?.includes("undefined")) {
        console.error("🚨 FIREBASE UNDEFINED ERROR in batch sync:", {
          friendsCount: this.quickAccessFriends?.length,
          errorMessage: error.message,
          stackTrace: error.stack,
        });
      }
    } finally {
      this.isBatchSyncing = false;
    }
  }

  /**
   * Robust deep equality check for objects
   */
  deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return obj1 === obj2;
    if (typeof obj1 !== "object" || typeof obj2 !== "object")
      return obj1 === obj2;

    try {
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);

      if (keys1.length !== keys2.length) return false;

      for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!this.deepEqual(obj1[key], obj2[key])) return false;
      }

      return true;
    } catch (error) {
      // Fallback to JSON comparison if deep comparison fails
      try {
        return JSON.stringify(obj1) === JSON.stringify(obj2);
      } catch {
        return false; // Assume different if comparison fails
      }
    }
  }

  /**
   * Check if profile changes are significant enough to warrant updates
   */
  hasSignificantProfileChange(currentFriend, newProfile) {
    try {
      // Enhanced null/undefined protection
      if (!currentFriend || !newProfile) {
        console.log("🔍 Change detection: Missing data", {
          currentFriend: !!currentFriend,
          newProfile: !!newProfile,
        });
        return false;
      }

      // ENHANCED: Check display name changes with better normalization
      const currentName = String(currentFriend.handle || "")
        .trim()
        .toLowerCase();
      const newName = String(newProfile.handle || "")
        .trim()
        .toLowerCase();
      const nameChanged = currentName !== newName && newName !== "";

      if (nameChanged) {
        console.log("🔍 Display name change detected:", {
          from: currentName,
          to: newName,
        });
      }

      // ENHANCED: Deep avatar comparison with better error handling
      let avatarChanged = false;
      try {
        const currentAvatar = currentFriend.avatarConfig;
        const newAvatar = newProfile.avatarConfig;

        // Handle cases where avatar might be null/undefined
        if (!currentAvatar && !newAvatar) {
          avatarChanged = false; // Both are null/undefined
        } else if (!currentAvatar || !newAvatar) {
          avatarChanged = true; // One is null, other isn't
        } else {
          // Both exist, do deep comparison
          avatarChanged = !this.deepEqual(currentAvatar, newAvatar);
        }

        if (avatarChanged) {
          console.log("🔍 Avatar config change detected:", {
            currentType: typeof currentAvatar,
            newType: typeof newAvatar,
            currentSeed: currentAvatar?.seed,
            newSeed: newAvatar?.seed,
          });
        }
      } catch (avatarError) {
        console.warn(
          "⚠️ Error comparing avatars, assuming change:",
          avatarError
        );
        avatarChanged = true; // Assume change on error to be safe
      }

      // ENHANCED: Additional significant change detection
      let otherChanges = false;

      // Check for changes in privacy or restriction status that might affect UI
      if (currentFriend.isRestricted !== newProfile.isRestricted) {
        console.log("🔍 Restriction status change detected:", {
          from: currentFriend.isRestricted,
          to: newProfile.isRestricted,
        });
        otherChanges = true;
      }

      // Check for status changes that might affect display
      const currentStatus = String(
        currentFriend.privacyStatus || ""
      ).toLowerCase();
      const newStatus = String(newProfile.privacyStatus || "").toLowerCase();
      if (currentStatus !== newStatus) {
        console.log("🔍 Privacy status change detected:", {
          from: currentStatus,
          to: newStatus,
        });
        otherChanges = true;
      }

      const hasChanges = nameChanged || avatarChanged || otherChanges;

      if (hasChanges) {
        console.log("🔍 SIGNIFICANT changes detected:", {
          nameChanged,
          avatarChanged,
          otherChanges,
          friendId: currentFriend.friendId || currentFriend.userId,
        });
      } else {
        console.log(
          "🔍 No significant changes detected for friend:",
          currentFriend.handle || "Unknown User"
        );
      }

      return hasChanges;
    } catch (error) {
      console.error("❌ Error in change detection:", error);
      // Return true on error to ensure updates aren't missed
      return true;
    }
  }

  /**
   * Debounced render to prevent excessive UI updates
   */
  debouncedRender() {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }

    this.renderTimeout = setTimeout(() => {
      this.render();
      this.renderTimeout = null;
    }, 100); // Quick debounce for UI responsiveness
  }

  /**
   * Debounced sync of starred friends data to database
   * Prevents excessive database writes while ensuring data consistency
   * ENHANCED: Better protection against infinite loops + Firebase validation
   */
  debouncedSyncStarredFriends() {
    // DEPRECATED: This method is now used only for urgent syncs
    // Most updates should use scheduleBatchedDatabaseSync() instead
    console.log(
      "⚠️ URGENT: Using immediate sync (deprecated - prefer batched sync)"
    );

    // Clear any existing timeout
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    // Prevent sync if already syncing
    if (this.isSyncing) {
      console.log("🔄 Sync already in progress, skipping");
      return;
    }

    // CIRCUIT BREAKER: Check global state
    if (window.horizontalFriendsBar_updating) {
      console.log(
        "🛑 CIRCUIT BREAKER: Global update in progress, skipping sync"
      );
      return;
    }

    // Shorter debounce for urgent syncs only
    this.syncTimeout = setTimeout(async () => {
      // Additional protection against rapid calls
      if (this.isSyncing || window.horizontalFriendsBar_updating) return;

      this.isSyncing = true;
      window.horizontalFriendsBar_updating = true;

      try {
        const currentUserProfile = await currentUser.waitForProfile();
        if (!currentUserProfile?.uid || !this.quickAccessFriends?.length) {
          return;
        }

        console.log(
          "🔄 URGENT: Syncing starred friends to database immediately"
        );

        // Use enhanced validation and cleaning to prevent Firebase errors
        const cleanFriendsData = this.quickAccessFriends
          .filter((friend) => {
            if (!friend || typeof friend !== "object") {
              console.warn("⚠️ Filtered out invalid friend object:", friend);
              return false;
            }

            if (!friend.friendId && !friend.userId) {
              console.warn("⚠️ Filtered out friend without valid ID:", friend);
              return false;
            }

            return true;
          })
          .map((friend, index) => {
            // Enhanced field mapping with proper validation
            const primaryId = friend.friendId || friend.userId;
            const secondaryId = friend.userId || friend.friendId;

            const validatedFriend = {
              friendId: this._validateString(
                primaryId,
                `Friend ${index} friendId`
              ),
              userId: this._validateString(
                secondaryId,
                `Friend ${index} userId`
              ),
              handle: this._validateString(
                friend.handle,
                `Friend ${index} handle`,
                "unknown_user"
              ),
              avatarConfig: this._validateAvatarConfig(
                friend.avatarConfig,
                `Friend ${index} avatarConfig`
              ),
              isRestricted: Boolean(friend.isRestricted),
              privacyStatus: this._validatePrivacyStatus(
                friend.privacyStatus,
                `Friend ${index} privacyStatus`
              ),
            };

            return validatedFriend;
          });

        // Enhanced validation check
        if (!cleanFriendsData.length) {
          console.warn("⚠️ No valid friends data to sync after validation");
          return;
        }

        // Final validation with enhanced method
        if (!this._validateFirebaseDataEnhanced(cleanFriendsData)) {
          console.error("❌ Enhanced validation failed, aborting urgent sync");
          return;
        }

        console.log("🔄 URGENT: Writing validated data to Firebase:", {
          count: cleanFriendsData.length,
          validation: "passed",
          type: "urgent_sync",
        });

        const userDocRef = doc(db, "users", currentUserProfile.uid);
        await updateDoc(userDocRef, {
          "quickAccessData.starredFriends": cleanFriendsData,
          "quickAccessData.lastUpdated": serverTimestamp(),
        });

        console.log("✅ URGENT: Starred friends synced to database");
      } catch (error) {
        console.error("⚠️ Failed to sync starred friends (urgent):", error);

        // Enhanced error logging for debugging
        if (error.message?.includes("undefined")) {
          console.error("🚨 FIREBASE UNDEFINED ERROR in urgent sync:", {
            friendsCount: this.quickAccessFriends?.length,
            sampleFriend: this.quickAccessFriends?.[0],
            errorMessage: error.message,
            stackTrace: error.stack,
          });
        }
      } finally {
        this.isSyncing = false;

        // FIXED: Immediate release of global lock to prevent blocking legitimate operations
        // Reduced from 2000ms to 100ms to allow proper operation flow
        setTimeout(() => {
          window.horizontalFriendsBar_updating = false;
        }, 100);
      }
    }, 1000); // 1 second for urgent syncs
  }

  /**
   * Validates string fields, ensuring no undefined values reach Firebase
   * @param {any} value - The value to validate
   * @param {string} fieldName - Field name for debugging
   * @param {string} fallback - Default value if invalid
   * @returns {string|null} - Valid string or null (never undefined)
   */
  _validateString(value, fieldName, fallback = null) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (value === undefined) {
      console.warn(
        `⚠️ Found undefined value for ${fieldName}, using fallback: ${fallback}`
      );
    } else if (value !== null && value !== fallback) {
      console.warn(
        `⚠️ Invalid value for ${fieldName}:`,
        value,
        `using fallback: ${fallback}`
      );
    }

    return fallback;
  }

  /**
   * Validates avatar config object, ensuring Firebase compatibility
   * @param {any} avatarConfig - Avatar configuration to validate
   * @param {string} fieldName - Field name for debugging
   * @returns {object|null} - Valid avatar config or null
   */
  _validateAvatarConfig(avatarConfig, fieldName) {
    if (!avatarConfig || typeof avatarConfig !== "object") {
      console.warn(`⚠️ Invalid avatarConfig for ${fieldName}:`, avatarConfig);
      return null;
    }

    // Ensure no undefined values in avatar config
    const cleanConfig = {};
    for (const [key, value] of Object.entries(avatarConfig)) {
      if (value !== undefined) {
        cleanConfig[key] = value;
      } else {
        console.warn(
          `⚠️ Removed undefined ${key} from ${fieldName} avatarConfig`
        );
      }
    }

    return Object.keys(cleanConfig).length > 0 ? cleanConfig : null;
  }

  /**
   * Validates that data structure contains no undefined values
   * @param {any} data - Data to validate
   * @returns {boolean} - True if data is Firebase-safe
   */
  _validateFirebaseData(data) {
    try {
      const jsonString = JSON.stringify(data);
      return !jsonString.includes("undefined");
    } catch (error) {
      console.error("❌ Error validating Firebase data:", error);
      return false;
    }
  }

  /**
   * Validate privacy status ensuring it's always a string, never an object
   * @param {*} value - The privacy status value to validate
   * @param {string} fieldName - Field name for logging
   * @returns {string} - Valid privacy status string
   */
  /**
   * Validate privacy status preserving rich object structure for UI functionality
   * @param {*} value - The privacy status value to validate
   * @param {string} fieldName - Field name for logging
   * @returns {Object} - Valid privacy status object with consistent structure
   */
  _validatePrivacyStatus(value, fieldName) {
    // Handle rich privacy status objects (preserve them for full functionality)
    if (value && typeof value === "object" && !Array.isArray(value)) {
      console.log(
        `🔒 ${fieldName} is a rich privacy object (preserving):`,
        value
      );

      // Ensure required fields exist with defaults
      const validatedPrivacyStatus = {
        avatarEnabled: Boolean(value.avatarEnabled),
        tooltip: String(value.tooltip || "Schedule access status unknown"),
        description: String(
          value.description || "Privacy status not specified"
        ),
        // Preserve any additional fields
        ...value,
      };

      return validatedPrivacyStatus;
    }

    // Handle string values (convert to rich object)
    if (typeof value === "string" && value.trim()) {
      const statusString = value.trim().toLowerCase();

      console.log(
        `🔒 ${fieldName} is string, converting to rich object:`,
        statusString
      );

      // Convert common string values to rich objects
      if (
        statusString.includes("restricted") ||
        statusString.includes("hidden") ||
        statusString === "false"
      ) {
        return {
          avatarEnabled: false,
          tooltip: "Schedule access restricted",
          description: "This user has hidden their schedule from you",
        };
      } else if (
        statusString.includes("enabled") ||
        statusString.includes("visible") ||
        statusString === "true"
      ) {
        return {
          avatarEnabled: true,
          tooltip: "Click to view schedule",
          description: "Schedule is visible - quick access enabled",
        };
      }

      // Unknown string value
      return {
        avatarEnabled: false,
        tooltip: "Schedule access unknown",
        description: `Privacy status: ${statusString}`,
      };
    }

    // Handle boolean values
    if (typeof value === "boolean") {
      console.log(
        `🔒 ${fieldName} is boolean, converting to rich object:`,
        value
      );
      return {
        avatarEnabled: value,
        tooltip: value
          ? "Click to view schedule"
          : "Schedule access restricted",
        description: value
          ? "Schedule is visible - quick access enabled"
          : "This user has hidden their schedule from you",
      };
    }

    // Handle null, undefined, or invalid values
    if (value === null || value === undefined) {
      console.log(
        `🔒 ${fieldName} is null/undefined, using default restricted status`
      );
      return {
        avatarEnabled: false,
        tooltip: "Schedule access unknown",
        description: "Privacy status not available",
      };
    }

    // Fallback for any other type
    console.warn(
      `🔒 ${fieldName} has unexpected type (${typeof value}), defaulting to restricted:`,
      value
    );
    return {
      avatarEnabled: false,
      tooltip: "Schedule access restricted",
      description: "Unable to determine privacy status",
    };
  }

  /**
   * Enhanced Firebase data validation with detailed error reporting
   * @param {Array} data - Array of friend objects to validate
   * @returns {boolean} - True if data is valid for Firebase
   */
  _validateFirebaseDataEnhanced(data) {
    if (!Array.isArray(data)) {
      console.error("❌ Data is not an array:", typeof data);
      return false;
    }

    for (let i = 0; i < data.length; i++) {
      const friend = data[i];

      // Check for null or undefined objects
      if (!friend || typeof friend !== "object") {
        console.error(`❌ Friend ${i} is not a valid object:`, friend);
        return false;
      }

      // Check each required field
      const requiredFields = [
        "friendId",
        "userId",
        "handle",
        "avatarConfig",
        "privacyStatus",
      ];
      for (const field of requiredFields) {
        const value = friend[field];

        // Check for undefined values (Firebase killer)
        if (value === undefined) {
          console.error(`❌ Friend ${i} has undefined ${field}:`, friend);
          return false;
        }

        // Special validation for specific fields
        if (field === "privacyStatus" && typeof value === "object") {
          console.error(
            `❌ Friend ${i} privacyStatus is an object (should be string):`,
            value
          );
          return false;
        }

        if (field === "avatarConfig" && typeof value !== "object") {
          console.error(
            `❌ Friend ${i} avatarConfig is not an object:`,
            typeof value
          );
          return false;
        }
      }
    }

    console.log("✅ Firebase data validation passed for all friends");
    return true;
  }

  /**
   * Handle real-time Quick Access updates
   * OPTIMIZED: Added intelligent change detection and debouncing to prevent excessive re-renders
   */
  async handleRealTimeQuickAccessUpdate(quickAccessData) {
    try {
      // Only log in development to reduce console spam in production
      if (window.location.hostname === "localhost") {
        console
          .log
          // Processing real-time Quick Access update (logging reduced)"
          ();
      }

      const { quickAccessFriends = [] } = quickAccessData;

      // Validate incoming data to prevent undefined values
      let validatedFriends = quickAccessFriends.filter((friend) => {
        if (!friend || typeof friend !== "object") {
          console.warn(
            "⚠️ Real-time update: Filtered out invalid friend object:",
            friend
          );
          return false;
        }

        // Must have at least one valid ID
        if (!friend.friendId && !friend.userId) {
          console.warn(
            "⚠️ Real-time update: Filtered out friend without valid ID:",
            friend
          );
          return false;
        }

        return true;
      });

      // 🚀 Robustness: Ignore stale re-adds for recently unfriended friends
      try {
        const now = Date.now();
        const TTL_MS = 15000; // 15s guard window
        validatedFriends = validatedFriends.filter((f) => {
          const id = f.friendId || f.userId;
          const ts = this.optimisticRemovals.get(id);
          const shouldIgnore = ts && now - ts < TTL_MS;
          if (shouldIgnore) {
            console.log(
              `⏭️ Ignoring stale re-add for recently unfriended ${id} (within ${TTL_MS}ms)`
            );
          }
          return !shouldIgnore;
        });

        // Clean up guards that are now confirmed removed (no longer in list)
        for (const [id, ts] of this.optimisticRemovals.entries()) {
          const stillIn = validatedFriends.some(
            (f) => (f.friendId || f.userId) === id
          );
          if (!stillIn && now - ts >= 0) {
            this.optimisticRemovals.delete(id);
          }
        }
      } catch (_) {}

      console
        .log
        // Real-time update validated (logging reduced)
        ();

      // Check if the friend list actually changed to prevent unnecessary operations
      const currentFriendIds = (this.quickAccessFriends || [])
        .map((f) => f.friendId || f.userId)
        .sort();
      const newFriendIds = validatedFriends
        .map((f) => f.friendId || f.userId)
        .sort();
      const friendListChanged =
        JSON.stringify(currentFriendIds) !== JSON.stringify(newFriendIds);

      if (!friendListChanged) {
        console
          .log
          // Friend list unchanged, skipping operations (logging reduced)"
          ();
        return;
      }

      // Debounce rapid updates to prevent cascade re-renders
      if (this.quickAccessUpdateTimeout) {
        clearTimeout(this.quickAccessUpdateTimeout);
      }

      this.quickAccessUpdateTimeout = setTimeout(async () => {
        try {
          // 🌍 Campus Presence: Get friends with full privacy and location data for presence dots
          // Only fetch fresh data when the friend list actually changed
          const quickAccessWithPrivacy =
            await friendsManager.getQuickAccessFriendsWithPrivacy(false);
          let friendsWithLocation = await this.enhanceFriendsWithLocationData(
            quickAccessWithPrivacy
          );

          // Apply the same guard to enhanced list (defense-in-depth)
          try {
            const now2 = Date.now();
            const TTL_MS2 = 15000;
            friendsWithLocation = friendsWithLocation.filter((f) => {
              const id = f.friendId || f.userId;
              const ts = this.optimisticRemovals.get(id);
              return !(ts && now2 - ts < TTL_MS2);
            });
          } catch (_) {}

          // Update internal state with location-enhanced data
          this.quickAccessFriends = friendsWithLocation;

          // Set up new profile listeners for the updated starred friends list
          await this.setupStarredFriendProfileListeners();

          // Re-render the friends bar
          this.render();

          // Maintain current selection if still valid
          if (this.selectedFriendId) {
            const stillExists = validatedFriends.some(
              (f) => (f.friendId || f.userId) === this.selectedFriendId
            );

            if (!stillExists) {
              // Friend was unstarred, fallback to user's schedule
              await this.selectUser();
            } else {
              // Re-select the current friend to maintain visual state
              this.updateVisualSelection(this.selectedFriendId);
            }
          } else {
            // No friend selected or user should be selected, ensure user is selected
            await this.ensureUserSelected();
          }

          console.log(
            "✅ Real-time Quick Access update processed successfully"
          );
        } catch (error) {
          console.error("❌ Error in debounced Quick Access update:", error);
        }
      }, 250); // 250ms debounce to prevent rapid-fire updates
    } catch (error) {
      console.error("❌ Error handling real-time Quick Access update:", error);
    }
  }

  /**
   * Handle real-time campus presence changes to update presence dots
   * Updates individual friend's presence dot without full re-render
   */
  handleCampusPresenceUpdate(presenceEvent) {
    try {
      const { userId, campusStatus, locationData, timestamp } = presenceEvent;

      console.log(`🌍 Processing campus presence update for user ${userId}:`, {
        campusStatus,
        hasLocationData: !!locationData,
        timestamp,
      });

      // 🔧 FIXED: Handle current user's own campus presence changes
      const isCurrentUser = userId === currentUser?.user?.uid;
      if (isCurrentUser) {
        console.log(
          `🌍 Current user's campus presence changed: ${campusStatus}`
        );

        // 🚀 ENTERPRISE FIX: Track campus status changes for smart animation
        const previousStatus = this.lastKnownCampusStatus || "unknown";
        const campusStatusChange = {
          previousStatus,
          newStatus: campusStatus,
        };

        // Update tracked status
        this.lastKnownCampusStatus = campusStatus;

        // Trigger smart location update animation with status change context
        console.log(
          "[HorizontalFriendsBar] Triggering smart location animation for campus presence change:",
          campusStatusChange
        );
        this.triggerLocationUpdateAnimation(campusStatusChange);

        // For current user, we don't need to update the friends list,
        // but we should trigger a re-enhancement of friends data to reflect
        // our own location sharing status in bilateral calculations
        this.refreshLocationDataForCurrentUser(
          campusStatus,
          locationData,
          timestamp
        );
        return;
      }

      // Find if this user is in our Quick Access friends
      const friendIndex = this.quickAccessFriends.findIndex(
        (friend) => friend.friendId === userId || friend.userId === userId
      );

      if (friendIndex === -1) {
        console.log(
          `🌍 User ${userId} not in Quick Access friends, ignoring presence update`
        );
        return;
      }

      // Update friend's location data in our local state
      const friend = this.quickAccessFriends[friendIndex];
      friend.lastKnownLocation = {
        ...friend.lastKnownLocation,
        campusStatus,
        ...locationData,
      };
      friend.lastActive = new Date(timestamp);

      console.log(
        `🌍 Updated friend ${
          friend.handle || friend.friendId || "Unknown User"
        }'s presence data:`,
        {
          campusStatus: friend.lastKnownLocation?.campusStatus,
          hasLocationSharing: friend.hasLocationSharing,
        }
      );

      // Update only the presence dot for this specific friend
      this.updateFriendPresenceDot(friendIndex, friend);

      console.log(
        `✅ Campus presence update processed for ${
          friend.handle || "Unknown User"
        }`
      );
    } catch (error) {
      console.error("❌ Error handling campus presence update:", error);
    }
  }

  /**
   * Update individual friend's presence dot without full component re-render
   * @param {number} friendIndex - Index of friend in quickAccessFriends array
   * @param {Object} friend - Friend data object
   */
  updateFriendPresenceDot(friendIndex, friend) {
    try {
      const friendId = friend.friendId || friend.userId;

      // Try to get the avatar element from the cached map first
      let avatarElement = this.avatarElements.get(friendId);

      // If cached element is missing or disconnected from DOM, find it fresh
      if (!avatarElement || !avatarElement.isConnected) {
        console.log(
          `🔄 Cached avatar element stale for ${
            friend.handle || friend.friendId || "Unknown User"
          }, finding fresh reference`
        );

        // Find the element fresh from the DOM
        const container = document.querySelector(
          ".horizontal-friends-bar .friends-avatars"
        );
        if (container) {
          avatarElement = container.querySelector(
            `[data-friend-id="${friendId}"]`
          );

          if (avatarElement) {
            // Update the cache with the fresh reference
            this.avatarElements.set(friendId, avatarElement);
            console.log(
              `✅ Fresh avatar element found and cached for ${
                friend.handle || "Unknown User"
              }`
            );
          }
        }
      }

      if (!avatarElement) {
        // Component not mounted or avatar not in DOM; skip quietly
        return;
      }

      // Find the existing presence dot within the avatar
      const existingPresenceDot = avatarElement.querySelector(".presence-dot");
      if (!existingPresenceDot) {
        // No presence dot element yet; skip quietly
        return;
      }

      // Smooth in-place update to avoid flicker
      PresenceDot.updateWithFreshData(
        existingPresenceDot,
        friend.lastActive,
        friend.lastKnownLocation,
        friend.hasLocationSharing
      );

      // Stop spinner for this friend after fresh data applied
      this.friendLoading.set(friendId, false);
      existingPresenceDot.classList.remove("spinner-overlay");
      existingPresenceDot.title = "";
    } catch (error) {
      console.error(
        `❌ Error updating presence dot for ${
          friend.handle || "Unknown User"
        }:`,
        error
      );
    }
  }

  /**
   * 🔧 FIXED: Handle current user's own campus presence changes
   * This method updates the bilateral location sharing calculations when the current user's location changes
   * @param {string} campusStatus - New campus status ('on_campus', 'off_campus', 'unknown')
   * @param {Object} locationData - Location data object
   * @param {number} timestamp - Timestamp of the change
   */
  async refreshLocationDataForCurrentUser(
    campusStatus,
    locationData,
    timestamp
  ) {
    try {
      console.log(
        `🌍 Refreshing location data for current user: ${campusStatus}`
      );

      // Update current user's location info in store if available
      if (currentUser?.profile?.systemInfo) {
        currentUser.profile.systemInfo.lastKnownLocation = {
          ...currentUser.profile.systemInfo.lastKnownLocation,
          campusStatus,
          ...locationData,
          timestamp,
        };
        currentUser.profile.systemInfo.lastActive = new Date(timestamp);
      }

      // Re-enhance friends data to reflect updated bilateral permissions
      // This ensures presence dots get updated with the latest location sharing status
      if (this.quickAccessFriends.length > 0) {
        console.log(
          `🌍 Re-enhancing ${this.quickAccessFriends.length} friends with updated location data`
        );
        const refreshedFriends = await this.enhanceFriendsWithLocationData(
          this.quickAccessFriends
        );

        // Update each friend's presence dot individually without full re-render
        refreshedFriends.forEach((friend, index) => {
          this.quickAccessFriends[index] = friend;
          this.updateFriendPresenceDot(index, friend);
        });

        console.log(
          `✅ Refreshed location data for current user and updated ${refreshedFriends.length} presence dots`
        );
      }
    } catch (error) {
      console.error(
        "❌ Error refreshing location data for current user:",
        error
      );
    }
  }

  /**
   * Handle user activity change events for real-time presence dot updates
   * Updates presence dots to show solid dots for active users vs timer dots for inactive
   * @param {Object} activityEvent - Activity event with userId, isActive, timestamp
   */
  handleUserActivityUpdate(activityEvent) {
    try {
      const { userId, isActive, timestamp } = activityEvent;

      console.log(`💓 Processing user activity update for ${userId}:`, {
        isActive,
        timestamp,
      });

      // Find if this user is in our Quick Access friends
      const friendIndex = this.quickAccessFriends.findIndex(
        (friend) => friend.friendId === userId || friend.userId === userId
      );

      if (friendIndex === -1) {
        console.log(
          `💓 User ${userId} not in Quick Access friends, ignoring activity update`
        );
        return;
      }

      // Update friend's lastActive timestamp in our local state
      const friend = this.quickAccessFriends[friendIndex];
      friend.lastActive = new Date(timestamp);

      console.log(
        `💓 Updated friend ${
          friend.handle || "Unknown User"
        }'s activity timestamp:`,
        {
          newLastActive: friend.lastActive,
          isActive,
          hasLocationSharing: friend.hasLocationSharing,
        }
      );

      // Update only the presence dot for this specific friend
      // This will show solid dot (no text) for active users, timer dots for inactive
      this.updateFriendPresenceDot(friendIndex, friend);

      console.log(
        `✅ User activity update processed for ${
          friend.handle || "Unknown User"
        }`
      );
    } catch (error) {
      console.error("❌ Error handling user activity update:", error);
    }
  }

  /**
   * 🌍 Campus Presence: Enhance friends with location data for presence dots
   * Extracted from loadQuickAccessFriends to reuse in real-time updates
   */
  async enhanceFriendsWithLocationData(friends) {
    if (!friends || friends.length === 0) {
      return [];
    }

    console.log(
      `[HorizontalFriendsBar] Enhancing ${friends.length} friends with location data...`
    );

    // Get current user ID for friendship document reconstruction
    const currentUserUid = currentUser?.user?.uid;

    const enhancedFriends = await Promise.all(
      friends.map(async (friend) => {
        try {
          // Get friend's full profile to access location data (bypass cache for fresh lastActive)
          const friendId = friend.friendId || friend.userId;
          const friendDoc = await getDoc(doc(db, "users", friendId));
          const friendProfile = friendDoc.exists() ? friendDoc.data() : null;

          // Extract location information from systemInfo
          const systemInfo = friendProfile?.systemInfo || {};
          const globalLocationEnabled = Boolean(
            systemInfo.locationSharingEnabled
          );
          const lastActive = systemInfo.lastActive || null;
          const lastKnownLocation = systemInfo.lastKnownLocation || null;

          // 🔑 CRITICAL: Reconstruct friendshipId if missing (happens during external updates)
          let friendshipId = friend.friendshipId;
          if (
            !friendshipId &&
            currentUserUid &&
            (friend.friendId || friend.userId)
          ) {
            const friendId = friend.friendId || friend.userId;
            friendshipId =
              currentUserUid < friendId
                ? `${currentUserUid}_${friendId}`
                : `${friendId}_${currentUserUid}`;

            console.log(
              `[HorizontalFriendsBar] 🔧 Reconstructed missing friendshipId for ${
                friend.handle || "Unknown User"
              }: ${friendshipId}`
            );
          }

          // 🔑 CRITICAL: Check bilateral location sharing consent
          let canSeeLocation = false;
          let bilateralStatus = null;

          if (globalLocationEnabled && friendshipId) {
            try {
              const friendship = await dataManager.getFriendshipDocument(
                friendshipId
              );
              if (friendship?.locationVisibility) {
                // 🐛 FIXED: More robust friend ID lookup for real-time updates
                const friendId = friend.friendId || friend.userId;
                const friendSharesWithMe =
                  friendship.locationVisibility[friendId] === true;
                const iShareWithFriend =
                  friendship.locationVisibility[currentUserUid] === true;

                // 🔍 DEBUG: Enhanced debugging for real-time updates
                console.log(
                  `[HorizontalFriendsBar] 🔍 Bilateral consent check for ${
                    friend.handle || "Unknown User"
                  }:`,
                  {
                    friendId,
                    friendshipId: friendshipId, // Use the reconstructed one
                    locationVisibility: friendship.locationVisibility,
                    friendSharesWithMe,
                    availableKeys: Object.keys(friendship.locationVisibility),
                  }
                );

                bilateralStatus = {
                  friendSharesWithMe,
                  iShareWithFriend,
                  friendshipId: friendshipId, // Use the reconstructed one
                  locationVisibility: friendship.locationVisibility,
                  lookupKey: friendId,
                };
                // AND-gate: only show presence if BOTH share
                canSeeLocation = friendSharesWithMe && iShareWithFriend;
              } else {
                console.warn(
                  `[HorizontalFriendsBar] ⚠️ No locationVisibility found in friendship document for ${
                    friend.handle || "Unknown User"
                  }`
                );
              }
            } catch (bilateralError) {
              console.warn(
                `[HorizontalFriendsBar] Error checking bilateral consent for ${
                  friend.handle || "Unknown User"
                }:`,
                bilateralError
              );
            }
          } else {
            console.log(
              `[HorizontalFriendsBar] 🔍 Skipping bilateral check for ${
                friend.handle || "Unknown User"
              }: globalLocationEnabled=${globalLocationEnabled}, friendshipId=${friendshipId}`
            );
          }

          // Presence dot should be grey unless BOTH users share (per-friend), independent of global
          const hasLocationSharing = canSeeLocation;

          console.log(
            `[HorizontalFriendsBar] Enhanced location data for ${
              friend.handle || "Unknown User"
            }:`,
            {
              globalLocationEnabled,
              canSeeLocation,
              hasLocationSharing,
              hasLastActive: !!lastActive,
              hasLocation: !!lastKnownLocation,
              campusStatus: lastKnownLocation?.campusStatus,
              bilateralStatus,
            }
          );

          return {
            ...friend,
            friendshipId: friendshipId, // Ensure friendshipId is preserved/reconstructed
            hasLocationSharing,
            lastActive,
            lastKnownLocation,
            globalLocationEnabled,
            canSeeLocation,
            bilateralStatus,
          };
        } catch (error) {
          console.error(
            `[HorizontalFriendsBar] Error enhancing location data for ${
              friend.handle || "unknown"
            }:`,
            error
          );

          // Still try to reconstruct friendshipId even in error case
          let friendshipId = friend.friendshipId;
          if (
            !friendshipId &&
            currentUserUid &&
            (friend.friendId || friend.userId)
          ) {
            const friendId = friend.friendId || friend.userId;
            friendshipId =
              currentUserUid < friendId
                ? `${currentUserUid}_${friendId}`
                : `${friendId}_${currentUserUid}`;
          }

          return {
            ...friend,
            friendshipId: friendshipId,
            hasLocationSharing: false,
            lastActive: null,
            lastKnownLocation: null,
            globalLocationEnabled: false,
            canSeeLocation: false,
            bilateralStatus: null,
          };
        }
      })
    );

    console.log(
      `[HorizontalFriendsBar] Enhanced ${enhancedFriends.length} friends with location data`
    );
    return enhancedFriends;
  }

  /**
   * Show loading state
   */
  showLoadingState() {
    const avatarsContainer = document.getElementById(
      `${this.containerId}-avatars`
    );
    if (avatarsContainer) {
      avatarsContainer.innerHTML = `
        <div class="friends-loading-state">
          <div class="loading-spinner"></div>
          <p>Loading friends...</p>
        </div>
      `;
    }
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    // Loading state is replaced by render()
  }

  /**
   * Show error state
   */
  showErrorState(errorMessage) {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="horizontal-friends-bar error-state">
        <div class="error-content">
          <div class="error-icon">❌</div>
          <h4>Failed to load friends</h4>
          <p>${errorMessage}</p>
          <button class="btn-retry" onclick="window.location.reload()">
            <i class="fas fa-redo"></i>
            Retry
          </button>
        </div>
      </div>
    `;
  }

  // =========================
  // PHASE 3: OPTIMISTIC EVENT HANDLERS
  // =========================

  /**
   * 🚀 PHASE 3: Handle optimistic unfriending event for immediate UI update
   * @param {Object} data - Optimistic unfriending event data
   */
  handleOptimisticUnfriending(data) {
    const { friendId, friendInfo } = data;

    console.log(
      `🚀 PHASE 3: Handling optimistic unfriending for ${
        friendInfo.handle || friendId
      }`
    );

    // Remove from local starred friends immediately (optimistic)
    const previousLength = this.quickAccessFriends.length;
    this.quickAccessFriends = this.quickAccessFriends.filter(
      (friend) => (friend.friendId || friend.userId) !== friendId
    );

    const newLength = this.quickAccessFriends.length;

    if (newLength < previousLength) {
      console.log(
        `🚀 PHASE 3: Removed @${
          friendInfo.handle || "unknown"
        } from UI immediately (${previousLength} → ${newLength})`
      );

      // Update UI immediately
      this.render();

      // If the unfriended user was selected, switch to user's schedule
      if (this.selectedFriendId === friendId) {
        console.log(
          `🚀 PHASE 3: Unfriended user was selected, switching to user schedule`
        );
        this.selectedFriendId = null;
        this.updateVisualSelection(null);

        // Emit event to load user's schedule
        this.emitScheduleChangeEvent(null, "Your Schedule");
      }

      // Show user feedback
      this.showUnfriendingFeedback(friendInfo.handle || "Friend");
    } else {
      console.log(
        `🚀 PHASE 3: Friend ${friendId} was not in starred friends list`
      );
    }
  }

  /**
   * 🔄 PHASE 3: Handle optimistic rollback on database operation failure
   * @param {Object} data - Rollback event data
   */
  handleOptimisticRollback(data) {
    const { friendId, friendInfo } = data;

    console.log(
      `🔄 PHASE 3: Rolling back optimistic unfriending for ${
        friendInfo.handle || friendId
      }`
    );

    // Show error notification
    this.showDebouncedNotification(
      `Failed to unfriend ${friendInfo.handle || "friend"}. Please try again.`,
      "error",
      4000
    );

    // Refresh from server data to restore correct state
    console.log(
      `🔄 PHASE 3: Refreshing data from server to restore correct state`
    );
    this.refreshFromServer();
  }

  /**
   * ✅ PHASE 3: Handle optimistic success confirmation
   * @param {Object} data - Success event data
   */
  handleOptimisticSuccess(data) {
    const { friendId, friendInfo } = data;

    console.log(
      `✅ PHASE 3: Optimistic unfriending confirmed for ${
        friendInfo.handle || friendId
      }`
    );

    // Show success notification
    this.showDebouncedNotification(
      `You are no longer friends with ${friendInfo.handle || "friend"}`,
      "success",
      3000
    );

    // Keep a short-lived guard to ignore any late/stale re-add events
    try { this.optimisticRemovals.set(friendId, Date.now()); } catch (_) {}
  }

  /**
   * 📢 PHASE 3: Show unfriending feedback notification
   * @param {string} friendName - Name of friend being unfriended
   */
  showUnfriendingFeedback(friendName) {
    this.showDebouncedNotification(
      `Unfriending ${friendName}...`,
      "info",
      2000
    );
  }

  /**
   * 🔄 PHASE 3: Refresh data from server to restore correct state
   */
  async refreshFromServer() {
    try {
      console.log("🔄 PHASE 3: Refreshing starred friends from server");

      // Fetch fresh data without cache
      const freshData = await friendsManager.getQuickAccessFriendsWithPrivacy(
        false
      );

      if (freshData) {
        this.quickAccessFriends = freshData;
        this.render();
        console.log("✅ PHASE 3: Successfully refreshed from server");
      }
    } catch (error) {
      console.error("❌ PHASE 3: Error refreshing from server:", error);
    }
  }

  /**
   * Programmatic API to get current selection
   */
  getCurrentSelection() {
    return {
      friendId: this.selectedFriendId,
      isUserSchedule: this.selectedFriendId === null,
      friendsCount: this.quickAccessFriends.length,
    };
  }

  /**
   * Get fresh QuickAccess friends data (not cached)
   * This ensures HomePage gets the most up-to-date data for avatar generation
   */
  getFreshQuickAccessFriends() {
    // Return the current instance data, which is kept up-to-date by real-time listeners
    return this.quickAccessFriends;
  }

  /**
   * Programmatic API to refresh data
   */
  async refresh() {
    await this.loadQuickAccessFriends();
    this.render();

    // Ensure user is selected after programmatic refresh
    this.addTrackedTimeout(() => {
      this.forceUserSelection();
    }, 100);
  }

  /**
   * 🧹 Memory leak prevention - tracked setTimeout wrapper
   * @param {Function} callback - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timeout ID
   */
  addTrackedTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      this.activeTimeouts.delete(timeoutId);
      callback();
    }, delay);

    this.activeTimeouts.add(timeoutId);
    return timeoutId;
  }

  /**
   * 🔗 Generate friendship ID from two user IDs
   * @param {string} uid1 - First user ID
   * @param {string} uid2 - Second user ID
   * @returns {string} Canonical friendship ID
   */
  generateFriendshipId(uid1, uid2) {
    if (!uid1 || !uid2 || uid1 === uid2) {
      console.error("❌ Cannot generate friendship ID with invalid user IDs:", {
        uid1,
        uid2,
      });
      return null;
    }
    return [uid1, uid2].sort().join("_");
  }

  /**
   * Clean up resources and event listeners
   */
  destroy() {
    console.log("🧹 Destroying HorizontalFriendsBar with enhanced cleanup...");

    // Remove event listeners
    if (this.container && this.boundHandlers) {
      this.container.removeEventListener(
        "click",
        this.boundHandlers.avatarClick
      );
      this.container.removeEventListener(
        "keydown",
        this.boundHandlers.keyboardNav
      );
    }

    if (this.scrollContainer && this.boundHandlers) {
      this.scrollContainer.removeEventListener(
        "scroll",
        this.boundHandlers.scrollStart
      );
    }

    // Clear all timeout variations
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // ENHANCED: Clear new sync timeouts
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    if (this.batchSyncTimeout) {
      clearTimeout(this.batchSyncTimeout);
      this.batchSyncTimeout = null;
    }

    // 🧹 MEMORY LEAK FIX: Clear all tracked timeouts
    this.activeTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.activeTimeouts.clear();

    // ENHANCED: Clear processing locks to prevent stuck states
    const processingKeys = Object.keys(this).filter((key) =>
      key.startsWith("processing_")
    );
    processingKeys.forEach((key) => {
      this[key] = false;
    });

    // Clear global circuit breaker flags
    if (typeof window !== "undefined") {
      window.horizontalFriendsBar_updating = false;
      window.profile_updates_in_progress = false;
    }

    // Clear all real-time listeners (privacy changes, profile updates)
    if (this.realTimeUnsubscribers && this.realTimeUnsubscribers.length > 0) {
      console.log(
        `🧹 Cleaning up ${this.realTimeUnsubscribers.length} real-time listeners`
      );
      this.realTimeUnsubscribers.forEach((unsubscriber) => {
        if (typeof unsubscriber === "function") {
          unsubscriber();
        }
      });
      this.realTimeUnsubscribers = [];
    }

    // Legacy cleanup for single unsubscriber (keeping for compatibility)
    if (this.realTimeUnsubscriber) {
      this.realTimeUnsubscriber();
      this.realTimeUnsubscriber = null;
    }

    // NEW: Clean up privacy listeners for friendship documents
    if (this.privacyUnsubscribers && this.privacyUnsubscribers.length > 0) {
      console.log(
        `🧹 Cleaning up ${this.privacyUnsubscribers.length} privacy listeners`
      );
      this.privacyUnsubscribers.forEach((unsubscriber) => {
        if (typeof unsubscriber === "function") {
          unsubscriber();
        }
      });
      this.privacyUnsubscribers = [];
    }

    // 🎯 PHASE 3: Clean up optimistic event listeners
    if (this.optimisticUnfriendingUnsubscriber) {
      console.log("🧹 PHASE 3: Cleaning up optimistic unfriending listener");
      this.optimisticUnfriendingUnsubscriber();
      this.optimisticUnfriendingUnsubscriber = null;
    }

    if (this.optimisticRollbackUnsubscriber) {
      console.log("🧹 PHASE 3: Cleaning up optimistic rollback listener");
      this.optimisticRollbackUnsubscriber();
      this.optimisticRollbackUnsubscriber = null;
    }

    if (this.optimisticSuccessUnsubscriber) {
      console.log("🧹 PHASE 3: Cleaning up optimistic success listener");
      this.optimisticSuccessUnsubscriber();
      this.optimisticSuccessUnsubscriber = null;
    }

    // Clear notification debouncing
    if (this._notificationDebounce) {
      clearTimeout(this._notificationDebounce);
      this._notificationDebounce = null;
    }

    // Clear profile update timeout
    if (this.profileUpdateTimeout) {
      clearTimeout(this.profileUpdateTimeout);
      this.profileUpdateTimeout = null;
    }

    // Clear render timeout
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
    }

    // ENHANCED: Reset all sync flags
    this.isSyncing = false;
    this.isBatchSyncing = false;
    this.isPrivacySyncing = false;

    // ENHANCED: Clean up friend profile listeners with detailed logging
    if (this.friendProfileUnsubscribers) {
      console.log(
        `🧹 Cleaning up ${this.friendProfileUnsubscribers.length} friend profile listeners`
      );
      this.friendProfileUnsubscribers.forEach((unsubscriber) => {
        if (typeof unsubscriber === "function") {
          unsubscriber();
        }
      });
      this.friendProfileUnsubscribers = [];
    }

    // Remove debug helper from window if it exists
    if (typeof window !== "undefined" && window.debugStarredFriends) {
      delete window.debugStarredFriends;
    }

    // Clear references
    this.avatarElements.clear();
    this.container = null;
    this.userContainer = null;
    this.scrollContainer = null;
    this.avatarsContainer = null;
    this.boundHandlers = null;

    // ENHANCED: Clear performance tracking data
    this.lastDatabaseState = null;
    this.lastUpdateTimestamp = 0;

    this.isInitialized = false;

    // Clear global instance if this was the active one
    if (globalHorizontalFriendsBarInstance === this) {
      globalHorizontalFriendsBarInstance = null;
    }

    console.log(
      "✅ HorizontalFriendsBar destroyed successfully with enhanced cleanup including privacy listeners"
    );
  }

  /**
   * Show notification with debouncing to prevent duplicates
   */
  showDebouncedNotification(message, type = "info", duration = 3000) {
    // Clear any pending notification
    if (this._notificationDebounce) {
      clearTimeout(this._notificationDebounce);
    }

    // Don't show duplicate notifications
    if (this._lastNotification === message) {
      console.log(`🔕 Suppressing duplicate notification: ${message}`);
      return;
    }

    this._lastNotification = message;

    // Debounce the notification (now just logs to console)
    this._notificationDebounce = setTimeout(() => {
      console.log(`[${type.toUpperCase()}] ${message}`);
      this._notificationDebounce = null;

      // Clear the last notification after a delay to allow future notifications
      this.addTrackedTimeout(() => {
        this._lastNotification = null;
      }, duration + 1000);
    }, 100); // Small delay to group rapid calls
  }

  // =========================
  // USER PRESENCE AND LOCATION UPDATE METHODS
  // =========================

  /**
   * Set up location update listener for user's own avatar
   * @param {HTMLElement} userElement - The user avatar element
   */
  setupUserLocationUpdateListener(userElement) {
    console.log(
      "[HorizontalFriendsBar] Setting up user location update listener"
    );

    // Store reference for location updates
    this.userAvatarElement = userElement;

    // Listen for real-time user profile changes that include location updates
    if (currentUser.uid) {
      this.listenToUserLocationUpdates(currentUser.uid);
    }

    // Set up periodic presence dot refresh
    this.setupUserPresenceRefresh();
  }

  /**
   * Listen to user's own location and presence updates
   * @param {string} userId - Current user's ID
   */
  listenToUserLocationUpdates(userId) {
    if (!userId) return;

    console.log(
      "[HorizontalFriendsBar] Starting user location update listener"
    );

    // Listen for campus presence changes via RealtimeService
    try {
      // Subscribe to campus presence change events
      const unsubscribe = realTimeManager.on(
        "campusPresenceChanged",
        (data) => {
          if (data.userId === userId) {
            console.log(
              "[HorizontalFriendsBar] User location update detected via campus presence:",
              data
            );
            this.handleUserLocationUpdate({ systemInfo: data.locationData });
          }
        }
      );

      // Store unsubscriber for cleanup
      this.realTimeUnsubscribers.push(() => {
        realTimeManager.off("campusPresenceChanged", unsubscribe);
      });

      console.log(
        "[HorizontalFriendsBar] Successfully set up user location listener via RealtimeService"
      );
    } catch (error) {
      console.error(
        "[HorizontalFriendsBar] Failed to set up user location listener:",
        error
      );
    }
  }

  /**
   * Handle user's location data update
   * @param {Object} userData - Updated user data from Firestore or RealtimeService
   */
  handleUserLocationUpdate(userData) {
    if (!this.userAvatarElement) return;

    // Handle different data structures from campus presence vs profile updates
    let systemInfo;
    let hasLocationUpdate = false;

    if (userData?.systemInfo) {
      // Direct profile update - use systemInfo structure
      systemInfo = userData.systemInfo;
      hasLocationUpdate = systemInfo.lastKnownLocation && systemInfo.lastActive;
    } else if (userData?.locationData && userData?.campusStatus) {
      // Campus presence event - convert to systemInfo structure
      systemInfo = {
        lastKnownLocation: {
          ...userData.locationData,
          campusStatus: userData.campusStatus,
        },
        lastActive: userData.locationData?.timestamp || userData.timestamp,
        locationSharingEnabled: true, // Presence events only fire when sharing is enabled
        status: "online", // User is active if generating location events
      };
      hasLocationUpdate = true;

      console.log(
        "[HorizontalFriendsBar] 🔄 Converted campus presence to systemInfo:",
        {
          campusStatus: userData.campusStatus,
          hasLocationData: !!userData.locationData,
          timestamp: userData.timestamp,
        }
      );
    } else {
      console.warn(
        "[HorizontalFriendsBar] Invalid user location update data structure:",
        userData
      );
      return;
    }

    console.log("[HorizontalFriendsBar] User location update received:", {
      hasLocation: !!systemInfo.lastKnownLocation,
      hasLastActive: !!systemInfo.lastActive,
      locationSharingEnabled: systemInfo.locationSharingEnabled,
      campusStatus: systemInfo.lastKnownLocation?.campusStatus,
      source: userData?.systemInfo ? "profile_update" : "campus_presence",
    });

    // Update presence dot immediately
    this.updateUserPresenceDot(systemInfo);

    // Trigger location update animation for location updates
    if (hasLocationUpdate) {
      // 🚀 ENTERPRISE FIX: Track campus status changes for smart animation
      const newCampusStatus = systemInfo.lastKnownLocation?.campusStatus;
      const previousStatus = this.lastKnownCampusStatus || "unknown";

      const campusStatusChange = {
        previousStatus,
        newStatus: newCampusStatus,
      };

      // Update tracked status
      this.lastKnownCampusStatus = newCampusStatus;

      console.log(
        "[HorizontalFriendsBar] Triggering smart location update animation with status change:",
        campusStatusChange
      );
      this.triggerLocationUpdateAnimation(campusStatusChange);
    }
  }

  /**
   * Update the user's presence dot with new location data
   * @param {Object} systemInfo - User's system info with location data
   */
  updateUserPresenceDot(systemInfo) {
    if (!this.userAvatarElement || !this.isInitialized) return;

    // 🛡️ SAFETY CHECK: Verify element is still in DOM
    if (!document.contains(this.userAvatarElement)) {
      console.warn(
        "[HorizontalFriendsBar] User avatar element detached from DOM, skipping update"
      );
      return;
    }

    // Find existing presence dot
    const existingDot = this.userAvatarElement.querySelector(".presence-dot");

    // Compute effective presence with session fallback
    const effective = this._getEffectiveUserPresence(
      systemInfo,
      /*saveFallback*/ true
    );

    // Create new presence dot
    const newPresenceDot = PresenceDot.createWithFreshDataPriority(
      effective.lastActive,
      effective.lastKnownLocation,
      effective.hasLocationSharing,
      this.loadingState.user || false
    );

    if (existingDot && document.contains(existingDot)) {
      try {
        // Smooth in-place update to avoid flicker
        PresenceDot.updateWithFreshData(
          existingDot,
          effective.lastActive,
          effective.lastKnownLocation,
          effective.hasLocationSharing
        );
      } catch (error) {
        console.warn(
          "[HorizontalFriendsBar] Presence dot in-place update failed:",
          error
        );
        // Fallback: force recreate entire dot structure
        this.recreateUserPresenceDot(systemInfo);
      }
    } else {
      // Add new presence dot if none exists
      const avatarImage = this.userAvatarElement.querySelector(".avatar-image");
      if (avatarImage && document.contains(avatarImage)) {
        const selectionRing = avatarImage.querySelector(".selection-ring");
        if (selectionRing) {
          selectionRing.insertAdjacentHTML("beforebegin", newPresenceDot);
        } else {
          avatarImage.insertAdjacentHTML("beforeend", newPresenceDot);
        }
      }
    }

    // Stop spinner for user after fresh data applied
    this.loadingState.user = false;
    // Remove overlay if any lingering
    const finalDot = this.userAvatarElement.querySelector(".presence-dot");
    if (finalDot) finalDot.classList.remove("spinner-overlay");
    // User presence dot updated
  }

  /**
   * 🔄 EMERGENCY FALLBACK: Completely recreate user presence dot structure
   */
  recreateUserPresenceDot(systemInfo) {
    if (!this.userAvatarElement || !document.contains(this.userAvatarElement))
      return;

    try {
      // Remove any existing presence dots
      const existingDots =
        this.userAvatarElement.querySelectorAll(".presence-dot");
      existingDots.forEach((dot) => {
        if (dot.parentNode) dot.parentNode.removeChild(dot);
      });

      // Create new presence dot using effective presence
      const effective = this._getEffectiveUserPresence(systemInfo);
      const newPresenceDot = PresenceDot.createWithFreshDataPriority(
        effective.lastActive,
        effective.lastKnownLocation,
        effective.hasLocationSharing,
        this.loadingState.user || false
      );

      // Add to avatar image
      const avatarImage = this.userAvatarElement.querySelector(".avatar-image");
      if (avatarImage) {
        avatarImage.insertAdjacentHTML("beforeend", newPresenceDot);
      }

      console.log(
        "[HorizontalFriendsBar] User presence dot recreated from scratch"
      );
    } catch (error) {
      console.error(
        "[HorizontalFriendsBar] Failed to recreate presence dot:",
        error
      );
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: Smart location update animation with debouncing and campus status tracking
   * Only triggers animation on meaningful location changes (campus status transitions)
   */

  /**
   * Build effective presence for the current user using live systemInfo,
   * falling back to last known red/green status within 12 hours.
   * Optionally saves improved data back to a session-scoped cache.
   * @param {Object} systemInfo
   * @param {boolean} saveFallback
   * @returns {{lastActive: any, lastKnownLocation: {campusStatus?: string}|null, hasLocationSharing: boolean}}
   */
  _getEffectiveUserPresence(systemInfo = {}, saveFallback = false) {
    try {
      const normalize = (v) => {
        try {
          return PresenceDot.normalizeTimestamp(v);
        } catch {
          return null;
        }
      };

      // Load fallback from session once if not loaded
      if (!this._userPresenceFallback) {
        this._userPresenceFallback = this._loadUserPresenceFallback();
      }

      // Determine sharing flag
      let hasLocationSharing =
        typeof systemInfo.locationSharingEnabled === "boolean"
          ? systemInfo.locationSharingEnabled
          : this._userPresenceFallback?.hasLocationSharing ?? false;

      // If sharing disabled explicitly, clear cache and return grey state
      if (systemInfo.locationSharingEnabled === false) {
        this._clearUserPresenceFallback();
        return {
          lastActive: null,
          lastKnownLocation: null,
          hasLocationSharing: false,
        };
      }

      // Determine lastActive using live data first, then fallback
      let lastActive = systemInfo.lastActive || null;
      if (!lastActive && this._userPresenceFallback?.lastActiveMs) {
        lastActive = this._userPresenceFallback.lastActiveMs; // number OK; PresenceDot supports numbers
      }

      // Determine campus status using live data first, then fallback
      let campusStatus = systemInfo.lastKnownLocation?.campusStatus;
      if (!campusStatus || campusStatus === "unknown") {
        campusStatus = this._userPresenceFallback?.campusStatus;
      }

      // Expiry: if lastActive is older than 12h, treat as no presence
      if (lastActive) {
        const lastActiveDate = normalize(lastActive);
        if (!lastActiveDate) {
          lastActive = null;
        } else {
          const minutesAgo = Math.floor(
            (Date.now() - lastActiveDate.getTime()) / (1000 * 60)
          );
          if (minutesAgo > 12 * 60) {
            lastActive = null;
          }
        }
      }

      // If no valid lastActive or no valid campusStatus, we cannot colorize
      const hasValidStatus =
        campusStatus === "on_campus" || campusStatus === "off_campus";
      const lastKnownLocation = hasValidStatus ? { campusStatus } : null;

      // Optionally persist improved data back to session cache
      if (
        saveFallback &&
        hasLocationSharing === true &&
        lastActive &&
        hasValidStatus
      ) {
        const lastActiveDate = normalize(lastActive);
        if (lastActiveDate) {
          this._saveUserPresenceFallback({
            lastActiveMs: lastActiveDate.getTime(),
            campusStatus,
            hasLocationSharing: true,
          });
        }
      }

      return {
        lastActive,
        lastKnownLocation,
        hasLocationSharing: !!hasLocationSharing,
      };
    } catch (e) {
      // On any unexpected error, fall back to safe grey state
      return {
        lastActive: null,
        lastKnownLocation: null,
        hasLocationSharing: false,
      };
    }
  }

  _loadUserPresenceFallback() {
    try {
      const raw = sessionStorage.getItem("campusPresence_userDotFallback");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed) return null;
      // Basic shape validation
      if (
        typeof parsed.lastActiveMs === "number" &&
        (parsed.campusStatus === "on_campus" ||
          parsed.campusStatus === "off_campus") &&
        typeof parsed.hasLocationSharing === "boolean"
      ) {
        // Enforce TTL on load
        const ageMin = Math.floor(
          (Date.now() - parsed.lastActiveMs) / (1000 * 60)
        );
        if (ageMin <= 12 * 60 && parsed.hasLocationSharing) {
          return parsed;
        }
      }
    } catch (_) {}
    return null;
  }

  _saveUserPresenceFallback({
    lastActiveMs,
    campusStatus,
    hasLocationSharing,
  }) {
    try {
      this._userPresenceFallback = {
        lastActiveMs,
        campusStatus,
        hasLocationSharing,
        savedAtMs: Date.now(),
      };
      sessionStorage.setItem(
        "campusPresence_userDotFallback",
        JSON.stringify(this._userPresenceFallback)
      );
    } catch (_) {}
  }

  _clearUserPresenceFallback() {
    try {
      this._userPresenceFallback = null;
      sessionStorage.removeItem("campusPresence_userDotFallback");
    } catch (_) {}
  }

  triggerLocationUpdateAnimation(locationUpdate = null) {
    if (!this.userAvatarElement) return;

    // Use presence dot spinner overlay to indicate update (replaces indicator)
    const presenceDot = this.userAvatarElement.querySelector(".presence-dot");
    if (!presenceDot) return;

    // 🛡️ ENHANCED ANIMATION DEBOUNCING: Prevent rapid successive animations
    const now = Date.now();
    const minAnimationInterval = 10000; // Increased to 10 seconds between animations to reduce pulse frequency

    if (
      this.lastLocationAnimationTime &&
      now - this.lastLocationAnimationTime < minAnimationInterval
    ) {
      console.log(
        "[HorizontalFriendsBar] 🛑 Animation debounced - too frequent (within 10s)"
      );
      return;
    }

    // 🚀 ENTERPRISE FIX: Enhanced validation for meaningful location updates
    if (locationUpdate) {
      const {
        coordinatesChanged,
        campusStatusChanged,
        hasValidCoordinates,
        hasLastActiveUpdate,
        previousStatus,
        newStatus,
      } = locationUpdate;

      // 🔧 TIER 1 FIX: Allow animations for campus status changes even without GPS coordinates
      // TIER 1 network detection can detect campus presence without coordinates
      if (
        !campusStatusChanged &&
        (!hasValidCoordinates || !locationUpdate.coordinates)
      ) {
        console.log(
          "[HorizontalFriendsBar] 🛑 Animation skipped - no campus status change and coordinates are null/invalid",
          {
            campusStatusChanged,
            hasValidCoordinates,
            hasCoordinatesObject: !!locationUpdate.coordinates,
            coordinates: locationUpdate.coordinates,
          }
        );
        return;
      }

      if (!hasLastActiveUpdate) {
        console.log(
          "[HorizontalFriendsBar] 🛑 Animation skipped - no lastActive update"
        );
        return;
      }

      if (!coordinatesChanged && !campusStatusChanged) {
        console.log(
          "[HorizontalFriendsBar] 🛑 Animation skipped - no meaningful coordinate or status change"
        );
        return;
      }

      // 🛡️ ADDITIONAL SAFETY: Only animate for significant campus status changes
      // Skip animation for minor coordinate changes without campus status changes
      if (
        coordinatesChanged &&
        !campusStatusChanged &&
        previousStatus === newStatus
      ) {
        console.log(
          "[HorizontalFriendsBar] 🛑 Animation skipped - minor coordinate change without campus status change"
        );
        return;
      }

      // Skip animation for unknown status transitions (GPS failures)
      if (newStatus === "unknown" && previousStatus !== "unknown") {
        console.log(
          "[HorizontalFriendsBar] 🛑 Animation skipped - status became unknown (GPS failure)"
        );
        return;
      }

      // 🚀 CRITICAL FIX: Skip animations when previous status is unknown (common on app start)
      // This prevents continuous animations during initial GPS acquisition
      if (previousStatus === "unknown" && newStatus !== "unknown") {
        console.log(
          "[HorizontalFriendsBar] 🛑 Animation skipped - previous status unknown (initial GPS acquisition)"
        );
        return;
      }

      console.log(
        "[HorizontalFriendsBar] 🌍 Meaningful location update validated for animation:",
        {
          coordinatesChanged,
          campusStatusChanged,
          hasValidCoordinates,
          hasLastActiveUpdate,
          statusTransition: `${previousStatus} → ${newStatus}`,
        }
      );
    } else {
      console.log(
        "[HorizontalFriendsBar] ⚠️ No locationUpdate data provided - proceeding with basic animation"
      );
    }

    // 🛡️ ANIMATION STATE MANAGEMENT: Prevent overlapping animations
    if (this.isLocationAnimationRunning) {
      console.log(
        "[HorizontalFriendsBar] 🛑 Animation already running - skipping"
      );
      return;
    }

    console.log(
      "[HorizontalFriendsBar] ✨ Triggering smart location update animation"
    );

    this.lastLocationAnimationTime = now;
    this.isLocationAnimationRunning = true;

    // Add spinner overlay briefly to show update
    presenceDot.classList.add("spinner-overlay");
    setTimeout(() => {
      presenceDot.classList.remove("spinner-overlay");
      this.isLocationAnimationRunning = false;
    }, 2000);
  }

  /**
   * Set up periodic refresh of user presence dot
   */
  setupUserPresenceRefresh() {
    // 🚀 REAL-TIME: Set up direct user profile listener for immediate presence updates
    if (currentUser?.uid) {
      console.log(
        "[HorizontalFriendsBar] Setting up real-time user profile listener for immediate presence updates"
      );

      const unsubscribe = dataManager.listenToUserProfile(
        currentUser.uid,
        (profileData) => {
          if (profileData?.systemInfo) {
            // 🛡️ SAFETY: Validate timestamp data to prevent grey→timer flickering
            const systemInfo = profileData.systemInfo;
            const hasValidTimestamp =
              systemInfo.lastActive &&
              (systemInfo.lastActive.toDate || systemInfo.lastActive.seconds);

            if (!hasValidTimestamp) {
              // Skipping presence update - incomplete timestamp data
              return;
            }

            logManager.realtimeListener(
              "updating",
              "user presence dot",
              "real-time profile"
            );

            // Update presence dot immediately with new profile data
            this.updateUserPresenceDot(systemInfo);
          }
        }
      );

      // Store unsubscriber for cleanup
      this.realTimeUnsubscribers.push(unsubscribe);
    }

    // Also keep periodic refresh for time updates (every 30 seconds)
    const refreshInterval = setInterval(() => {
      if (!this.isInitialized || !this.userAvatarElement) {
        clearInterval(refreshInterval);
        return;
      }

      // Get current user data and refresh presence dot for time updates only
      // 🔧 FIX: Use currentUser.systemInfo directly (not currentUser.profile.systemInfo)
      if (currentUser?.systemInfo) {
        this.updateUserPresenceDot(currentUser.systemInfo);
      }
    }, 30000); // 30 seconds for time display updates

    // Store interval for cleanup
    this.activeTimeouts.add(refreshInterval);
  }

  /**
   * 🚀 ENTERPRISE FIX: Enhanced public method to manually trigger location update animation
   * (Can be called from location service when coordinates are updated)
   * @param {Object} locationUpdate - Location update data with coordinates and status
   */
  notifyLocationUpdated(locationUpdate = null) {
    logManager.dev.debug(
      "Location update notification received:",
      locationUpdate
    );

    // If locationUpdate is provided from CampusLocationService, use it directly
    if (locationUpdate && typeof locationUpdate === "object") {
      // Using provided location update data
      this.triggerLocationUpdateAnimation(locationUpdate);
      return;
    }

    // Fallback: Try to get current user status for context
    const systemInfo = currentUser?.profile?.systemInfo;
    const lastKnownLocation = systemInfo?.lastKnownLocation;

    if (!lastKnownLocation) {
      console.log(
        "[HorizontalFriendsBar] 🛑 No location data available - skipping animation"
      );
      return;
    }

    const currentStatus = lastKnownLocation.campusStatus;
    const previousStatus = this.lastKnownCampusStatus || "unknown";
    const hasValidCoordinates =
      lastKnownLocation.latitude != null &&
      lastKnownLocation.longitude != null &&
      !isNaN(lastKnownLocation.latitude) &&
      !isNaN(lastKnownLocation.longitude);

    const fallbackLocationUpdate = {
      previousStatus,
      newStatus: currentStatus,
      coordinatesChanged: true, // Assume coordinates changed if we're being notified
      campusStatusChanged: previousStatus !== currentStatus,
      hasValidCoordinates,
      hasLastActiveUpdate: systemInfo?.lastActive != null,
      coordinates: hasValidCoordinates
        ? {
            latitude: lastKnownLocation.latitude,
            longitude: lastKnownLocation.longitude,
          }
        : null,
    };

    // Using fallback location update data

    // Update tracked status
    this.lastKnownCampusStatus = currentStatus;

    this.triggerLocationUpdateAnimation(fallbackLocationUpdate);
  }

  /**
   * Process any queued location animations from early initialization
   */
  processQueuedLocationAnimations() {
    if (pendingLocationAnimations.length === 0) {
      return;
    }

    console.log(
      `[HorizontalFriendsBar] Processing ${pendingLocationAnimations.length} queued location animations`
    );

    // Process the most recent animation (last one in queue)
    const mostRecentAnimation =
      pendingLocationAnimations[pendingLocationAnimations.length - 1];

    // Check if the animation is recent enough (within 30 seconds)
    const now = Date.now();
    const age = now - mostRecentAnimation.timestamp;
    const maxAge = 30000; // 30 seconds

    if (age <= maxAge) {
      console.log("[HorizontalFriendsBar] Processing recent queued animation");
      this.notifyLocationUpdated(mostRecentAnimation.locationUpdate);
    } else {
      console.log(
        "[HorizontalFriendsBar] Skipping stale queued animations (too old)"
      );
    }

    // Clear the queue
    pendingLocationAnimations.length = 0;
  }

  /**
   * Get current user presence status for external access
   * @returns {Object} User presence status information
   */
  getUserPresenceStatus() {
    const userProfile = currentUser.profile;
    const systemInfo = userProfile?.systemInfo || {};

    return {
      hasLocationSharing: systemInfo.locationSharingEnabled || false,
      lastActive: systemInfo.lastActive,
      lastKnownLocation: systemInfo.lastKnownLocation,
      campusStatus: systemInfo.lastKnownLocation?.campusStatus,
      isPresenceVisible: !!(
        systemInfo.lastActive && systemInfo.lastKnownLocation
      ),
    };
  }
}

// =========================
// GLOBAL ACCESS FUNCTIONS
// =========================

/**
 * Get the current global HorizontalFriendsBar instance
 * @returns {HorizontalFriendsBar|null} The current instance or null if none exists
 */
export function getHorizontalFriendsBarInstance() {
  return globalHorizontalFriendsBarInstance;
}

/**
 * Trigger location update animation on user avatar (if instance exists)
 * This function can be called from external services like CampusLocationService
 * @param {Object} locationUpdate - Location update data with coordinates and status
 */
export function triggerUserLocationUpdateAnimation(locationUpdate = null) {
  if (
    globalHorizontalFriendsBarInstance &&
    globalHorizontalFriendsBarInstance.isInitialized
  ) {
    logManager.dev.debug("External trigger: Location update animation");
    globalHorizontalFriendsBarInstance.notifyLocationUpdated(locationUpdate);
  } else {
    // Queue the animation for when the instance becomes available
    console.log(
      "[HorizontalFriendsBar] Queueing location animation - instance not ready yet"
    );
    pendingLocationAnimations.push({
      locationUpdate,
      timestamp: Date.now(),
    });

    // Limit queue size to prevent memory leaks
    if (pendingLocationAnimations.length > 10) {
      pendingLocationAnimations = pendingLocationAnimations.slice(-5); // Keep only the last 5
      console.log(
        "[HorizontalFriendsBar] Trimmed animation queue to prevent memory leaks"
      );
    }
  }
}

/**
 * Get user presence status (if instance exists)
 * @returns {Object|null} User presence status or null if no instance
 */
export function getUserPresenceStatus() {
  if (globalHorizontalFriendsBarInstance) {
    return globalHorizontalFriendsBarInstance.getUserPresenceStatus();
  }
  return null;
}

/**
 * Check if HorizontalFriendsBar is currently active
 * @returns {boolean} True if an instance exists and is initialized
 */
export function isHorizontalFriendsBarActive() {
  return globalHorizontalFriendsBarInstance?.isInitialized || false;
    // Record optimistic removal timestamp
    try { this.optimisticRemovals.set(friendId, Date.now()); } catch (_) {}
    // Clear optimistic guard so the friend can reappear
    this.optimisticRemovals.delete(friendId);
}
