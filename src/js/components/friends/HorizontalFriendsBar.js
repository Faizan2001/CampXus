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

    console.log(
      `🏗️ HorizontalFriendsBar created for container: ${containerId}`
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

      // Get Quick Access friends with privacy status using enhanced FriendsService
      const quickAccessData =
        await friendsManager.getQuickAccessFriendsWithPrivacy(
          !shouldUseFreshData
        );
      this.quickAccessFriends = quickAccessData || [];

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
   * Render Quick Access friends avatars with privacy-aware disabled states
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
      `👥 ${this.quickAccessFriends.length} friend avatars rendered with privacy status`
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
      "📡 Setting up real-time listeners for HorizontalFriendsBar..."
    );

    // Direct database listener for user profile changes (includes quickAccessData)
    if (currentUser?.user?.uid && this.dataManager?.listenToUserProfile) {
      console.log(
        "📡 Setting up direct database listener for user profile changes"
      );

      const userProfileUnsubscriber = this.dataManager.listenToUserProfile(
        currentUser.user.uid,
        (userProfile) => {
          console.log("📡 Real-time user profile update:", userProfile);

          // Check if quickAccessData changed
          const quickAccessData = userProfile?.quickAccessData;
          if (quickAccessData?.starredFriends) {
            console.log(
              "📡 Starred friends updated in database:",
              quickAccessData.starredFriends
            );
            this.quickAccessFriends = quickAccessData.starredFriends;
            this.render();
            console.log(
              "✅ HorizontalFriendsBar updated with fresh database data"
            );
          }
        }
      );

      if (userProfileUnsubscriber) {
        this.realTimeUnsubscribers = [userProfileUnsubscriber];
      }
    }

    // Listen for friend profile updates to sync starred friends data
    if (this.dataManager?.listenToUserProfile) {
      console.log("📡 Setting up profile change listeners for starred friends");

      this.friendProfileUnsubscribers = [];

      // Set up listeners for each starred friend's profile
      this.setupStarredFriendProfileListeners();
    }

    // Fallback: Listen for Quick Access updates from FriendsService
    if (friendsManager.registerUICallbacks) {
      friendsManager.registerUICallbacks({
        onQuickAccessUpdated: (quickAccessData) => {
          console.log(
            "⭐ Fallback Quick Access update in HorizontalFriendsBar:",
            quickAccessData
          );
          this.handleRealTimeQuickAccessUpdate(quickAccessData);
        },
      });
    }

    // Listen for schedule privacy changes (Phase 4.1)
    const privacyChangeUnsubscriber = realTimeManager.on(
      REALTIME_EVENTS.SCHEDULE_PRIVACY_CHANGE,
      (privacyEvent) => {
        console.log(
          "🔒 Privacy change event received in HorizontalFriendsBar:",
          privacyEvent
        );
        this.handlePrivacyChange(privacyEvent);
      }
    );

    // Add privacy listener to unsubscribers
    if (!this.realTimeUnsubscribers) {
      this.realTimeUnsubscribers = [];
    }
    this.realTimeUnsubscribers.push(privacyChangeUnsubscriber);

    console.log(
      "✅ Real-time listeners set up successfully (including privacy changes)"
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
   * Handle profile updates for starred friends
   * Updates the local starred friends data and syncs to database efficiently
   */
  async handleStarredFriendProfileUpdate(friendId, friendProfile) {
    try {
      console.log(
        `📡 Profile update for starred friend ${friendId}:`,
        friendProfile?.profile?.displayName || friendProfile?.displayName
      );

      // 🔍 DEBUG: Log the actual structure we're receiving
      console.log(`🔍 DEBUG: Full profile update structure for ${friendId}:`, {
        hasProfile: !!friendProfile?.profile,
        hasDisplayName: !!friendProfile?.displayName,
        hasAvatarConfig: !!friendProfile?.avatarConfig,
        hasNestedAvatarConfig: !!friendProfile?.profile?.avatarConfig,
        topLevelKeys: friendProfile ? Object.keys(friendProfile) : [],
        profileKeys: friendProfile?.profile
          ? Object.keys(friendProfile.profile)
          : [],
      });

      // Find the friend in our starred friends list
      const friendIndex = this.quickAccessFriends.findIndex(
        (f) => f.friendId === friendId
      );
      if (friendIndex === -1) {
        console.log(
          `📡 Friend ${friendId} not in starred friends, ignoring profile update`
        );
        return;
      }

      const currentFriend = this.quickAccessFriends[friendIndex];

      // 🔧 Fix: Check both nested and direct structure for display name and avatar
      const newDisplayName =
        friendProfile?.profile?.displayName || friendProfile?.displayName;
      const newAvatarConfig =
        friendProfile?.profile?.avatarConfig || friendProfile?.avatarConfig;

      // Debug logging for profile comparison
      console.log(`🔍 DEBUG: Profile update comparison for ${friendId}:`, {
        currentDisplayName: currentFriend.displayName,
        newDisplayName: newDisplayName,
        currentAvatarConfig: currentFriend.avatarConfig,
        newAvatarConfig: newAvatarConfig,
        hasNewAvatar: !!newAvatarConfig,
        hasCurrentAvatar: !!currentFriend.avatarConfig,
      });

      // Check if the profile data actually changed
      const nameChanged =
        newDisplayName && newDisplayName !== currentFriend.displayName;

      // Improved avatar comparison with better error handling
      let avatarChanged = false;
      if (newAvatarConfig) {
        if (!currentFriend.avatarConfig) {
          // If current is null/undefined but new exists, it's a change
          avatarChanged = true;
        } else {
          try {
            // Try JSON comparison with error handling
            const currentStr = JSON.stringify(currentFriend.avatarConfig);
            const newStr = JSON.stringify(newAvatarConfig);
            avatarChanged = currentStr !== newStr;
          } catch (error) {
            // If JSON comparison fails, assume it's a change to be safe
            console.warn(
              `⚠️ JSON comparison failed for ${friendId}, assuming avatar changed:`,
              error
            );
            avatarChanged = true;
          }
        }
      }

      console.log(`🔍 DEBUG: Change detection for ${friendId}:`, {
        nameChanged,
        avatarChanged,
        willUpdate: nameChanged || avatarChanged,
      });

      if (!nameChanged && !avatarChanged) {
        console.log(
          `📡 No meaningful changes for friend ${friendId}, skipping update`
        );
        return;
      }

      console.log(
        `📡 Profile changes detected for ${currentFriend.displayName}: name=${nameChanged}, avatar=${avatarChanged}`
      );

      // Update local data
      if (nameChanged && newDisplayName) {
        this.quickAccessFriends[friendIndex].displayName = newDisplayName;
      }
      if (avatarChanged && newAvatarConfig) {
        this.quickAccessFriends[friendIndex].avatarConfig = newAvatarConfig;
      }

      // Re-render immediately for instant UI feedback
      this.render();

      // Debounced database sync to prevent excessive writes
      this.debouncedSyncStarredFriends();

      console.log(
        `✅ Updated starred friend profile for ${
          newDisplayName || currentFriend.displayName
        }`
      );
    } catch (error) {
      console.error(
        `❌ Error handling profile update for friend ${friendId}:`,
        error
      );
    }
  }

  /**
   * Debounced sync of starred friends data to database
   * Prevents excessive database writes while ensuring data consistency
   */
  debouncedSyncStarredFriends() {
    // Clear any existing timeout
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    // Set a new timeout to sync after 2 seconds of no more changes
    this.syncTimeout = setTimeout(async () => {
      try {
        const currentUserProfile = await currentUser.waitForProfile();
        if (!currentUserProfile?.uid || !this.quickAccessFriends?.length) {
          return;
        }

        console.log("🔄 Syncing updated starred friends data to database...");

        // Update the database with the fresh profile data
        const userDocRef = doc(db, "users", currentUserProfile.uid);
        await updateDoc(userDocRef, {
          "quickAccessData.starredFriends": this.quickAccessFriends,
          "quickAccessData.lastUpdated": serverTimestamp(),
        });

        console.log("✅ Starred friends data synced to database");
      } catch (error) {
        console.warn(
          "⚠️ Failed to sync starred friends data (non-critical):",
          error
        );
      }
    }, 2000); // 2 second debounce
  }

  /**
   * Handle real-time Quick Access updates
   */
  async handleRealTimeQuickAccessUpdate(quickAccessData) {
    try {
      console.log(
        "⭐ Processing real-time Quick Access update in horizontal bar"
      );

      const { quickAccessFriends = [] } = quickAccessData;

      // Update internal state
      this.quickAccessFriends = quickAccessFriends;

      // Set up new profile listeners for the updated starred friends list
      await this.setupStarredFriendProfileListeners();

      // Re-render the friends bar
      this.render();

      // Maintain current selection if still valid
      if (this.selectedFriendId) {
        const stillExists = quickAccessFriends.some(
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
      console.error("❌ Error handling real-time Quick Access update:", error);
    }
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
    this.addTrackedTimeout(async () => {
      await this.forceUserSelection();
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
   * Clean up resources and event listeners
   */
  destroy() {
    console.log("🧹 Destroying HorizontalFriendsBar...");

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

    // Clear timeouts
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // 🧹 MEMORY LEAK FIX: Clear all tracked timeouts
    this.activeTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.activeTimeouts.clear();

    // Clear all real-time listeners (privacy changes, profile updates)
    if (this.realTimeUnsubscribers && this.realTimeUnsubscribers.length > 0) {
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

    // Clear sync timeout
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    // Clean up friend profile listeners
    if (this.friendProfileUnsubscribers) {
      this.friendProfileUnsubscribers.forEach((unsubscriber) => {
        if (typeof unsubscriber === "function") {
          unsubscriber();
        }
      });
      this.friendProfileUnsubscribers = [];
    }

    // Clear references
    this.avatarElements.clear();
    this.container = null;
    this.userContainer = null;
    this.scrollContainer = null;
    this.avatarsContainer = null;
    this.boundHandlers = null;

    this.isInitialized = false;
    console.log("✅ HorizontalFriendsBar destroyed successfully");
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
