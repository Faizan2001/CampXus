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
import {
  realTimeManager,
  REALTIME_EVENTS,
} from "../../services/realtime/RealtimeService.js";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase/firebase-config.js";
import { PresenceDot } from "../presence/PresenceDot.js";

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

    console.log(
      `🏗️ HorizontalFriendsBar created with enhanced loop prevention and privacy optimization for container: ${containerId}`
    );
  }

  /**
   * Initialize the horizontal friends bar
   * Sets up UI, loads data, and starts real-time listeners
   */
  async init() {
    try {
      console.log("🚀 Initializing HorizontalFriendsBar...");

      // Get container element
      this.container = document.getElementById(this.containerId);
      if (!this.container) {
        throw new Error(`Container element not found: ${this.containerId}`);
      }

      // Get current user data
      this.currentUser = currentUser?.profile;
      if (!this.currentUser) {
        throw new Error("Current user not available");
      }

      // Create the UI structure
      this.createUIStructure();

      // Set up event handlers
      this.setupEventHandlers();

      // Load initial data
      await this.loadQuickAccessFriends();

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
        console.log("🔍 DEBUG: User selection called after DOM ready");
      }, 50);

      // Add global debug function for testing selection rings
      window.testSelectionRings = () => {
        console.log("🔍 Testing selection rings...");
        this.avatarElements.forEach((element, friendId) => {
          const ring = element.querySelector(".selection-ring");
          console.log(`Ring for ${friendId}:`, {
            element,
            ring,
            hasSelected: element.classList.contains("selected"),
            ringOpacity: ring ? getComputedStyle(ring).opacity : "N/A",
            ringDisplay: ring ? getComputedStyle(ring).display : "N/A",
            ringWidth: ring ? getComputedStyle(ring).width : "N/A",
            ringHeight: ring ? getComputedStyle(ring).height : "N/A",
          });
        });
      };

      console.log("🔍 Added window.testSelectionRings() for debugging");

      // Add test function to window for debugging avatar comparison
      window.testAvatarComparison = () => {
        console.log("🧪 Testing avatar comparison logic...");

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
            displayName: this.quickAccessFriends[friendIndex].displayName,
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
            displayName: friend.displayName,
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
                displayName: this._validateString(
                  friend.displayName,
                  `Friend ${index} displayName`,
                  "Unknown User"
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

      this.isInitialized = true;
      console.log("✅ HorizontalFriendsBar initialized successfully");

      // Debug: Verify user selection after initialization
      console.log("🔍 DEBUG: User selection state after init:", {
        selectedFriendId: this.selectedFriendId,
        userElementExists: this.avatarElements.has("user"),
        userElementSelected: this.avatarElements
          .get("user")
          ?.classList.contains("selected"),
      });
    } catch (error) {
      console.error("❌ Failed to initialize HorizontalFriendsBar:", error);
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

      this.isLoading = true;
      this.showLoadingState();

      // Smart cache strategy: Always fetch fresh data on init, but use cache for subsequent loads
      const shouldUseFreshData = !useCache || this.isFirstLoad;
      this.isFirstLoad = false; // Mark as no longer first load

      // Get Quick Access friends with privacy status
      console.log(
        "[HorizontalFriendsBar] Loading friends with location context for presence dots..."
      );
      const quickAccessData =
        await friendsManager.getQuickAccessFriendsWithPrivacy(
          !shouldUseFreshData
        );

      // 🌍 Campus Presence: Enhance friends with location data using extracted method
      const quickAccessWithLocation = await this.enhanceFriendsWithLocationData(quickAccessData);

      console.log(
        "[HorizontalFriendsBar] Enhanced friends with location data:",
        quickAccessWithLocation.length
      );

      // Debug: Log presence data summary
      const presenceSummary = quickAccessWithLocation.map((friend) => ({
        name: friend.displayName,
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

      console.log(
        `🔍 DEBUG: Validated ${validatedFriends.length}/${
          (quickAccessWithLocation || []).length
        } friends during load with presence data`
      );

      this.quickAccessFriends = validatedFriends;

      // Set up profile listeners for starred friends to detect avatar/name changes
      if (this.quickAccessFriends.length > 0) {
        await this.setupStarredFriendProfileListeners();
      }

      // Note: Database updates are handled by HomePage, not here
      // This eliminates infinite loops from real-time listeners

      console.log(
        `📊 Loaded ${this.quickAccessFriends.length} Quick Access friends${
          shouldUseFreshData ? " (fresh)" : " (cached)"
        }`
      );
    } catch (error) {
      console.error("❌ Failed to load Quick Access friends:", error);
      this.quickAccessFriends = [];
    } finally {
      this.isLoading = false;
      this.hideLoadingState();
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

    console.log("🎨 Rendering HorizontalFriendsBar...");

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
    const userAvatarHtml = `
      <div class="friend-avatar-item user-avatar" 
           data-friend-id="user" 
           data-friend-name="${this.currentUser.displayName || "You"}"
           role="button"
           tabindex="0"
           aria-label="View your schedule">
        <div class="avatar-container">
          <div class="avatar-image">
            ${renderUserAvatar(this.currentUser, true)}
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
      console.log("👤 User avatar rendered and stored in avatarElements");
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
      const ariaLabel = isDisabled
        ? `${friend.displayName}'s schedule is private - access restricted`
        : `View ${friend.displayName}'s schedule`;
      const tooltip =
        friend.privacyStatus?.tooltip ||
        (isDisabled ? "Schedule access restricted" : "Click to view schedule");

      // Add presence dot based on location sharing status
      const presenceDot = PresenceDot.create(
        friend.lastActive,
        friend.lastKnownLocation,
        friend.hasLocationSharing
      );

      console.log(
        `[HorizontalFriendsBar] Rendering friend ${friend.displayName} with presence:`,
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
             data-friend-name="${friend.displayName}"
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
          <div class="avatar-label">${friend.displayName}</div>
        </div>
      `;

      container.insertAdjacentHTML("beforeend", friendAvatarHtml);

      // Store reference
      const friendElement = container.querySelector(
        `[data-friend-id="${friend.friendId || friend.userId}"]`
      );
      this.avatarElements.set(friend.friendId || friend.userId, friendElement);
    });

    console.log(
      `👥 ${this.quickAccessFriends.length} friend avatars rendered with privacy status and presence dots`
    );
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
    console.log("🏳️ Empty state rendered");
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
    const isRestricted = avatarItem.dataset.privacyRestricted === "true";

    console.log(`👆 Avatar clicked: ${friendName} (${friendId})`);
    console.log(
      `🔴 DEBUG COMPARE: Click in ${
        this.compareMode ? "COMPARE MODE" : "NORMAL MODE"
      }`
    );

    // Prevent multiple clicks while processing
    if (avatarItem.classList.contains("loading")) return;

    // Check if avatar is disabled due to privacy restrictions
    if (isRestricted && !avatarItem.classList.contains("user-avatar")) {
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
        displayName: currentUser?.profile?.displayName || "You",
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
              displayName: friend.displayName || friendName || "Unknown",
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
    const displayName = friendId === "user" ? "your" : `${friendName}'s`;
    console.log(`Viewing ${displayName} schedule`);
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

      // Force the selection ring to be visible immediately for debugging
      const ring = selectedElement.querySelector(".selection-ring");
      if (ring) {
        // Force the ring to be visible by setting inline styles as backup
        ring.style.opacity = "1";
        ring.style.transform = "scale(1.12)";
        ring.style.borderColor = "#9333ea";
        ring.style.borderWidth = "3px";
        ring.style.zIndex = "2";

        console.log(`🔍 DEBUG: Forced ring styles for ${selectedFriendId}`);
      }

      // Debug the ring element
      console.log(`🔍 DEBUG: Selected element for ${selectedFriendId}:`, {
        element: selectedElement,
        hasSelectedClass: selectedElement.classList.contains("selected"),
        ringFound: !!ring,
        ringStyles: ring ? getComputedStyle(ring) : null,
        ringOpacity: ring ? getComputedStyle(ring).opacity : "N/A",
        ringDisplay: ring ? getComputedStyle(ring).display : "N/A",
        ringTransform: ring ? getComputedStyle(ring).transform : "N/A",
      });

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

    // Show tooltip for first-time users
    this.showCompareTooltip();

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
        return friend ? friend.displayName : id;
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
        return friend ? friend.displayName : id;
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

  /**
   * Show compare mode tooltip for first-time users
   */
  showCompareTooltip() {
    // Only show if user hasn't seen it before
    const hasSeenTooltip = localStorage.getItem("campxus_compare_tooltip_seen");
    if (hasSeenTooltip) return;

    // Mark as seen
    localStorage.setItem("campxus_compare_tooltip_seen", "true");

    // Show tooltip in console
    console.log(
      "💭 Select friends to compare schedules. Tap [⚖️] again to exit compare mode."
    );
  }

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
        displayName: this.currentUser?.displayName || "You",
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
          displayName: friend.displayName,
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
      eventDetail.selectedUsersData.map((u) => u.displayName)
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
    console.log(
      "📡 Setting up smart real-time listeners for HorizontalFriendsBar..."
    );

    // ENHANCED: Smart database listener with change detection to prevent loops
    if (currentUser?.user?.uid && dataManager?.listenToUserProfile) {
      console.log("📡 Setting up smart database listener with loop prevention");

      const userProfileUnsubscriber = dataManager.listenToUserProfile(
        currentUser.user.uid,
        (userProfile) => {
          // ENHANCED CIRCUIT BREAKER: Don't process database updates during ANY sync operations
          if (
            this.isBatchSyncing ||
            this.isPrivacySyncing ||
            window.profile_updates_in_progress
          ) {
            console.log(
              "🛑 CIRCUIT BREAKER: Ignoring database update during our own sync operations"
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

              this.quickAccessFriends = newFriendsData;
              this.render();

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
        if (window.location.hostname === 'localhost') {
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
        if (window.location.hostname === 'localhost') {
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
        if (window.location.hostname === 'localhost') {
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

    console.log(
      "✅ Smart real-time listeners set up successfully with optimized privacy, presence, and activity updates"
    );
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

    // Extract schedule visibility for current user
    const scheduleVisibility = friendshipData.scheduleVisibility;
    if (!scheduleVisibility) return;

    // Check if this friend's schedule is visible to current user
    const isScheduleVisible = scheduleVisibility[friendId] === true;

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
        : "This user has hidden their schedule from you",
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
    // ENHANCED CIRCUIT BREAKER: Only block PROFILE updates, not privacy updates
    const profileUpdateKey = `profile_updating_${friendId}`;
    if (this[profileUpdateKey]) {
      console.log(`🔄 Profile update lock active for ${friendId}, skipping`);
      return;
    }

    // Check if this is a privacy-only update (bypass circuit breaker)
    const isPrivacyUpdate = this.isPrivacyOnlyUpdate(friendProfile);
    if (isPrivacyUpdate) {
      console.log(
        `🔒 Detected privacy-only update for ${friendId}, bypassing circuit breaker`
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
      console.log(`📡 Profile update for ${friendId}`);

      const friendIndex = this.quickAccessFriends.findIndex(
        (f) => f.friendId === friendId || f.userId === friendId
      );
      if (friendIndex === -1) {
        console.log(
          `📡 Friend ${friendId} not in starred list, ignoring update`
        );
        return;
      }

      const currentFriend = this.quickAccessFriends[friendIndex];

      // Extract new data with comprehensive fallback structure
      const newDisplayName =
        friendProfile?.profile?.displayName ||
        friendProfile?.displayName ||
        currentFriend.displayName;

      const newAvatarConfig =
        friendProfile?.profile?.avatarConfig ||
        friendProfile?.avatarConfig ||
        currentFriend.avatarConfig;

      // ENHANCED change detection - exclude privacy changes (handled separately)
      const nameChanged =
        newDisplayName && newDisplayName !== currentFriend.displayName;
      const avatarChanged =
        newAvatarConfig &&
        !this.deepEqual(currentFriend.avatarConfig, newAvatarConfig);

      if (!nameChanged && !avatarChanged) {
        console.log(
          `📡 No significant profile changes for ${currentFriend.displayName}, skipping update`
        );
        return;
      }

      console.log(
        `📡 Applying UI-only profile update for ${currentFriend.displayName}`,
        {
          nameChanged: nameChanged
            ? `${currentFriend.displayName} → ${newDisplayName}`
            : false,
          avatarChanged,
        }
      );

      // LOCAL UPDATE ONLY - Do NOT sync to database immediately
      const updatedFriend = { ...currentFriend };
      let hasLocalUpdates = false;

      if (nameChanged) {
        const validatedName = this._validateString(
          newDisplayName,
          `Profile update displayName for ${friendId}`,
          currentFriend.displayName
        );
        if (validatedName && validatedName !== currentFriend.displayName) {
          updatedFriend.displayName = validatedName;
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

      if (hasLocalUpdates) {
        // Update local state for immediate UI refresh
        this.quickAccessFriends[friendIndex] = updatedFriend;

        // Only update UI for profile changes, do NOT trigger database sync
        this.debouncedRender();

        console.log(
          `✅ Profile UI updated for ${updatedFriend.displayName} (no database sync)`
        );

        // Schedule a batched database sync for profile changes only (longer delay)
        this.scheduleBatchedDatabaseSync();
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
      friendProfile?.profile?.displayName !== undefined ||
      friendProfile?.profile?.avatarConfig !== undefined ||
      friendProfile?.displayName !== undefined ||
      friendProfile?.avatarConfig !== undefined;

    return (hasPrivacyStatus || hasIsRestricted) && !hasProfileChanges;
  }

  /**
   * Handle privacy changes separately from profile updates for immediate response
   * This bypasses the circuit breaker to ensure privacy changes are always immediate
   */
  async handlePrivacyStatusUpdate(friendId, newPrivacyStatus) {
    // NO CIRCUIT BREAKER for privacy updates - they must be immediate per R3.1
    console.log(
      `🔒 IMMEDIATE privacy update for ${friendId}:`,
      newPrivacyStatus
    );

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
          `🔒 No privacy changes for ${currentFriend.displayName}, skipping`
        );
        return;
      }

      console.log(
        `🔒 CRITICAL privacy change detected for ${currentFriend.displayName}:`,
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
        `✅ IMMEDIATE privacy update completed for ${updatedFriend.displayName}`
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
        console.log(
          `🔒 No existing avatar element for ${friendId}, doing full re-render`
        );
        this.render();
        return;
      }

      console.log(
        `🔒 Updating privacy visuals for ${updatedFriend.displayName}`
      );

      // Update the avatar's classes and attributes based on new privacy status
      const avatarImg = existingElement.querySelector(".friend-avatar-img");
      const lockIcon = existingElement.querySelector(".privacy-lock-icon");

      if (updatedFriend.isRestricted) {
        // Add disabled styling
        existingElement.classList.add("disabled");
        avatarImg?.classList.add("grayscale");

        // Add/update lock icon
        if (!lockIcon) {
          const lockElement = document.createElement("div");
          lockElement.className = "privacy-lock-icon";
          lockElement.innerHTML = "🔒";
          lockElement.title =
            updatedFriend.privacyStatus?.tooltip ||
            "Schedule access restricted";
          existingElement.appendChild(lockElement);
        } else {
          lockIcon.title =
            updatedFriend.privacyStatus?.tooltip ||
            "Schedule access restricted";
        }
      } else {
        // Remove disabled styling
        existingElement.classList.remove("disabled");
        avatarImg?.classList.remove("grayscale");

        // Remove lock icon
        if (lockIcon) {
          lockIcon.remove();
        }
      }

      // Update tooltip for the entire avatar
      existingElement.title =
        updatedFriend.privacyStatus?.tooltip || updatedFriend.displayName;

      console.log(
        `✅ Privacy visuals updated for ${updatedFriend.displayName} without full re-render`
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
        displayName: this._validateString(
          friend.displayName,
          `Privacy sync displayName`,
          "Unknown User"
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
            displayName: this._validateString(
              friend.displayName,
              `Friend ${index} displayName`,
              "Unknown User"
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
      const currentName = String(currentFriend.displayName || "")
        .trim()
        .toLowerCase();
      const newName = String(newProfile.displayName || "")
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
          currentFriend.displayName
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
              displayName: this._validateString(
                friend.displayName,
                `Friend ${index} displayName`,
                "Unknown User"
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
        "displayName",
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
      if (window.location.hostname === 'localhost') {
        console.log(
          "⭐ Processing real-time Quick Access update in horizontal bar"
        );
      }

      const { quickAccessFriends = [] } = quickAccessData;

      // Validate incoming data to prevent undefined values
      const validatedFriends = quickAccessFriends.filter((friend) => {
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

      console.log(
        `🔍 DEBUG: Real-time update validated ${validatedFriends.length}/${quickAccessFriends.length} friends`
      );

      // Check if the friend list actually changed to prevent unnecessary operations
      const currentFriendIds = (this.quickAccessFriends || []).map(f => f.friendId || f.userId).sort();
      const newFriendIds = validatedFriends.map(f => f.friendId || f.userId).sort();
      const friendListChanged = JSON.stringify(currentFriendIds) !== JSON.stringify(newFriendIds);

      if (!friendListChanged) {
        console.log("📡 Quick Access friend list unchanged, skipping expensive operations");
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
          const quickAccessWithPrivacy = await friendsManager.getQuickAccessFriendsWithPrivacy(false);
          const friendsWithLocation = await this.enhanceFriendsWithLocationData(quickAccessWithPrivacy);
          
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

          console.log("✅ Real-time Quick Access update processed successfully");
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
        timestamp
      });

      // Find if this user is in our Quick Access friends
      const friendIndex = this.quickAccessFriends.findIndex(
        friend => friend.friendId === userId || friend.userId === userId
      );

      if (friendIndex === -1) {
        console.log(`🌍 User ${userId} not in Quick Access friends, ignoring presence update`);
        return;
      }

      // Update friend's location data in our local state
      const friend = this.quickAccessFriends[friendIndex];
      friend.lastKnownLocation = {
        ...friend.lastKnownLocation,
        campusStatus,
        ...locationData
      };
      friend.lastActive = new Date(timestamp);

      console.log(`🌍 Updated friend ${friend.displayName}'s presence data:`, {
        campusStatus: friend.lastKnownLocation?.campusStatus,
        hasLocationSharing: friend.hasLocationSharing
      });

      // Update only the presence dot for this specific friend
      this.updateFriendPresenceDot(friendIndex, friend);

      console.log(`✅ Campus presence update processed for ${friend.displayName}`);
    } catch (error) {
      console.error('❌ Error handling campus presence update:', error);
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
        console.log(`🔄 Cached avatar element stale for ${friend.displayName}, finding fresh reference`);
        
        // Find the element fresh from the DOM
        const container = document.querySelector('.horizontal-friends-bar .friends-avatars');
        if (container) {
          avatarElement = container.querySelector(`[data-friend-id="${friendId}"]`);
          
          if (avatarElement) {
            // Update the cache with the fresh reference
            this.avatarElements.set(friendId, avatarElement);
            console.log(`✅ Fresh avatar element found and cached for ${friend.displayName}`);
          }
        }
      }
      
      if (!avatarElement) {
        console.warn(`🌍 Avatar element not found for friend ${friend.displayName} (ID: ${friendId})`);
        return;
      }

      // Find the existing presence dot within the avatar
      const existingPresenceDot = avatarElement.querySelector('.presence-dot');
      if (!existingPresenceDot) {
        console.warn(`🌍 Presence dot element not found for friend ${friend.displayName}`);
        return;
      }

      // Generate new presence dot HTML
      const newPresenceDot = PresenceDot.create(
        friend.lastActive,
        friend.lastKnownLocation,
        friend.hasLocationSharing
      );

      // Create a temporary container to parse the HTML
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = newPresenceDot;
      const newPresenceDotElement = tempContainer.querySelector('.presence-dot');

      if (newPresenceDotElement) {
        // Replace the old presence dot with the new one
        existingPresenceDot.replaceWith(newPresenceDotElement);
        
        console.log(`🌍 ✅ Updated presence dot for ${friend.displayName}:`, {
          newClass: newPresenceDotElement.className,
          newText: newPresenceDotElement.querySelector('.dot-text')?.textContent,
          campusStatus: friend.lastKnownLocation?.campusStatus
        });
      } else {
        console.warn(`🌍 Failed to create new presence dot element for ${friend.displayName}`);
      }
    } catch (error) {
      console.error(`❌ Error updating presence dot for ${friend.displayName}:`, error);
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
        timestamp
      });

      // Find if this user is in our Quick Access friends
      const friendIndex = this.quickAccessFriends.findIndex(
        friend => friend.friendId === userId || friend.userId === userId
      );

      if (friendIndex === -1) {
        console.log(`💓 User ${userId} not in Quick Access friends, ignoring activity update`);
        return;
      }

      // Update friend's lastActive timestamp in our local state
      const friend = this.quickAccessFriends[friendIndex];
      friend.lastActive = new Date(timestamp);

      console.log(`💓 Updated friend ${friend.displayName}'s activity timestamp:`, {
        newLastActive: friend.lastActive,
        isActive,
        hasLocationSharing: friend.hasLocationSharing
      });

      // Update only the presence dot for this specific friend
      // This will show solid dot (no text) for active users, timer dots for inactive
      this.updateFriendPresenceDot(friendIndex, friend);

      console.log(`✅ User activity update processed for ${friend.displayName}`);
    } catch (error) {
      console.error('❌ Error handling user activity update:', error);
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

    console.log(`[HorizontalFriendsBar] Enhancing ${friends.length} friends with location data...`);

    const enhancedFriends = await Promise.all(
      friends.map(async (friend) => {
        try {
          // Get friend's full profile to access location data
          const friendProfile = await dataManager.getUserProfile(friend.friendId || friend.userId);
          
          // Extract location information from systemInfo
          const systemInfo = friendProfile?.systemInfo || {};
          const globalLocationEnabled = Boolean(systemInfo.locationSharingEnabled);
          const lastActive = systemInfo.lastActive || null;
          const lastKnownLocation = systemInfo.lastKnownLocation || null;
          
          // 🔑 CRITICAL: Check bilateral location sharing consent
          let canSeeLocation = false;
          let bilateralStatus = null;
          
          if (globalLocationEnabled && friend.friendshipId) {
            try {
              const friendship = await dataManager.getFriendshipDocument(friend.friendshipId);
              if (friendship?.locationVisibility) {
                const friendSharesWithMe = friendship.locationVisibility[friend.friendId || friend.userId] === true;
                bilateralStatus = {
                  friendSharesWithMe,
                  friendshipId: friend.friendshipId,
                  locationVisibility: friendship.locationVisibility
                };
                canSeeLocation = friendSharesWithMe;
              }
            } catch (bilateralError) {
              console.warn(`[HorizontalFriendsBar] Error checking bilateral consent for ${friend.displayName}:`, bilateralError);
            }
          }
          
          // Only enable location sharing if both global setting AND bilateral consent are true
          const hasLocationSharing = globalLocationEnabled && canSeeLocation;
          
          console.log(`[HorizontalFriendsBar] Enhanced location data for ${friend.displayName}:`, {
            globalLocationEnabled,
            canSeeLocation,
            hasLocationSharing,
            hasLastActive: !!lastActive,
            hasLocation: !!lastKnownLocation,
            campusStatus: lastKnownLocation?.campusStatus,
            bilateralStatus
          });

          return {
            ...friend,
            hasLocationSharing,
            lastActive,
            lastKnownLocation,
            globalLocationEnabled,
            canSeeLocation,
            bilateralStatus
          };
        } catch (error) {
          console.error(`[HorizontalFriendsBar] Error enhancing location data for ${friend.displayName || 'unknown'}:`, error);
          return {
            ...friend,
            hasLocationSharing: false,
            lastActive: null,
            lastKnownLocation: null,
            globalLocationEnabled: false,
            canSeeLocation: false,
            bilateralStatus: null
          };
        }
      })
    );

    console.log(`[HorizontalFriendsBar] Enhanced ${enhancedFriends.length} friends with location data`);
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
        friendInfo.displayName || friendId
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
        `🚀 PHASE 3: Removed ${friendInfo.displayName} from UI immediately (${previousLength} → ${newLength})`
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
      this.showUnfriendingFeedback(friendInfo.displayName || "Friend");
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
        friendInfo.displayName || friendId
      }`
    );

    // Show error notification
    this.showDebouncedNotification(
      `Failed to unfriend ${
        friendInfo.displayName || "friend"
      }. Please try again.`,
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
        friendInfo.displayName || friendId
      }`
    );

    // Show success notification
    this.showDebouncedNotification(
      `You are no longer friends with ${friendInfo.displayName || "friend"}`,
      "success",
      3000
    );

    // The real-time listeners will handle the final cleanup automatically
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
}
