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
 *
 * --- ARCHITECTURE ---
 * ┌─────────────────────────────────────────────────────────┐
 * │ [User] [Friend1] [Friend2] [Friend3] [Friend4] [+More]  │
 * │   ↓        ↓        ↓        ↓        ↓        ↓      │
 * │ Purple   Normal   Normal   Normal   Normal   Scroll   │
 * │ Ring     Avatar   Avatar   Avatar   Avatar   Hint     │
 * └─────────────────────────────────────────────────────────┘
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
import { notificationManager } from "../../services/realtime/NotificationService.js";

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

      // Default select user's own schedule
      this.selectUser();

      this.isInitialized = true;
      console.log("✅ HorizontalFriendsBar initialized successfully");
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

    console.log("🎨 UI structure created for HorizontalFriendsBar");
  }

  /**
   * Set up event handlers for user interactions
   */
  setupEventHandlers() {
    if (!this.boundHandlers) {
      this.boundHandlers = {
        avatarClick: (e) => this.handleAvatarClick(e),
        avatarLongPress: (e) => this.handleAvatarLongPress(e),
        scrollStart: () => this.handleScrollStart(),
        scrollEnd: () => this.handleScrollEnd(),
        refreshClick: () => this.handleRefreshClick(),
        keyboardNav: (e) => this.handleKeyboardNavigation(e),
      };
    }

    // Avatar clicks using event delegation
    this.container.addEventListener("click", this.boundHandlers.avatarClick);

    // Long press for future multi-select
    this.container.addEventListener(
      "touchstart",
      this.boundHandlers.avatarLongPress,
      { passive: true }
    );

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
   */
  async loadQuickAccessFriends() {
    try {
      console.log("📊 Loading Quick Access friends...");

      this.isLoading = true;
      this.showLoadingState();

      // Get Quick Access friends using existing FriendsService
      const quickAccessData = await friendsManager.getQuickAccessFriends();
      this.quickAccessFriends = quickAccessData || [];

      console.log(
        `📊 Loaded ${this.quickAccessFriends.length} Quick Access friends`
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
      <div class="friend-avatar-item user-avatar selected" 
           data-friend-id="user" 
           data-friend-name="${this.currentUser.displayName || "You"}"
           role="button"
           tabindex="0"
           aria-label="View your schedule">
        <div class="avatar-container">
          <div class="avatar-image">
            ${renderUserAvatar(this.currentUser, true)}
          </div>
          <div class="selection-ring"></div>
        </div>
        <div class="avatar-label">Me</div>
      </div>
    `;

    container.insertAdjacentHTML("beforeend", userAvatarHtml);

    // Store reference
    const userElement = container.querySelector('[data-friend-id="user"]');
    this.avatarElements.set("user", userElement);

    console.log("👤 User avatar rendered");
  }

  /**
   * Render Quick Access friends avatars
   */
  renderFriendsAvatars(container) {
    this.quickAccessFriends.forEach((friend, index) => {
      const friendAvatarHtml = `
        <div class="friend-avatar-item" 
             data-friend-id="${friend.friendId || friend.userId}" 
             data-friend-name="${friend.displayName}"
             role="button"
             tabindex="0"
             aria-label="View ${friend.displayName}'s schedule">
          <div class="avatar-container">
            <div class="avatar-image">
              ${renderUserAvatar(friend, true)}
            </div>
            <div class="selection-ring"></div>
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

    console.log(`👥 ${this.quickAccessFriends.length} friend avatars rendered`);
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
   * Handle avatar click events
   */
  handleAvatarClick(event) {
    const avatarItem = event.target.closest(".friend-avatar-item");
    if (!avatarItem) return;

    const friendId = avatarItem.dataset.friendId;
    const friendName = avatarItem.dataset.friendName;

    console.log(`👆 Avatar clicked: ${friendName} (${friendId})`);

    // Prevent multiple clicks while processing
    if (avatarItem.classList.contains("loading")) return;

    if (this.compareMode) {
      // In compare mode: toggle selection for comparison
      this.toggleCompareSelection(friendId, friendName);
    } else {
      // Normal mode: select this friend's schedule
      this.selectFriend(friendId, friendName);
    }
  }

  /**
   * Select a friend's schedule (or user's own)
   */
  selectFriend(friendId, friendName = null) {
    // Check if this friend is already selected
    const currentlySelected = (friendId === "user" && this.selectedFriendId === null) || 
                            (friendId !== "user" && this.selectedFriendId === friendId);
    
    if (currentlySelected && friendId !== "user") {
      // If clicking on already selected friend (not user), deselect and fallback to user
      console.log(`🔄 Deselecting friend: ${friendId}, falling back to user`);
      this.selectUser();
      return;
    } else if (currentlySelected && friendId === "user") {
      // If clicking on already selected user, keep them selected (user always stays selected)
      console.log(`👤 User avatar already selected, keeping selection`);
      return;
    }

    console.log(`🎯 Selecting friend: ${friendId}`);

    // Update selection state
    this.selectedFriendId = friendId === "user" ? null : friendId;

    // Update visual selection
    this.updateVisualSelection(friendId);

    // Update status text
    this.updateSelectionStatus(friendName || friendId);

    // Emit event for schedule loading (to be handled by HomePage.js)
    this.emitScheduleChangeEvent(friendId, friendName);

    // Show feedback
    const displayName = friendId === "user" ? "your" : `${friendName}'s`;
    notificationManager.showSystemNotification(
      `Viewing ${displayName} schedule`,
      "info",
      1500
    );
  }

  /**
   * Select user's own schedule (default state)
   */
  selectUser() {
    this.selectFriend("user", "You");
  }

  /**
   * Update visual selection rings
   */
  updateVisualSelection(selectedFriendId) {
    // Remove selection from all avatars
    this.avatarElements.forEach((element, friendId) => {
      element.classList.remove("selected");
    });

    // Add selection to clicked avatar
    const selectedElement = this.avatarElements.get(selectedFriendId);
    if (selectedElement) {
      selectedElement.classList.add("selected");

      // Scroll to selected avatar if needed
      this.scrollToAvatar(selectedElement);
    }

    console.log(`🎨 Visual selection updated for: ${selectedFriendId}`);
  }

  /**
   * Update selection status text
   */
  updateSelectionStatus(friendName) {
    const statusElement = this.container.querySelector(".current-selection");
    if (statusElement) {
      const displayText =
        friendName === "You" || friendName === "user"
          ? "Your Schedule"
          : `${friendName}'s Schedule`;
      statusElement.textContent = displayText;
    }
  }

  /**
   * Emit schedule change event for HomePage.js to handle
   */
  emitScheduleChangeEvent(friendId, friendName) {
    const eventDetail = {
      friendId: friendId === "user" ? null : friendId,
      friendName: friendName,
      isUserSchedule: friendId === "user",
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
   * Handle refresh button click
   */
  async handleRefreshClick() {
    console.log("🔄 Refreshing Quick Access friends...");

    try {
      await this.loadQuickAccessFriends();
      this.render();

      notificationManager.showSystemNotification(
        "Quick Access friends refreshed",
        "success",
        2000
      );
    } catch (error) {
      console.error("❌ Failed to refresh friends:", error);
      notificationManager.showSystemNotification(
        "Failed to refresh friends",
        "error",
        3000
      );
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
    const avatarItem = event.target.closest(".friend-avatar-item");
    if (!avatarItem || this.compareMode) return;

    // Activate compare mode via long press
    console.log("👆 Long press detected - activating compare mode");
    this.activateCompareMode();

    // Provide haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }

  /**
   * Toggle compare mode on/off
   */
  handleToggleCompareMode() {
    if (this.compareMode) {
      this.deactivateCompareMode();
    } else {
      this.activateCompareMode();
    }
  }

  /**
   * Activate compare mode
   */
  activateCompareMode() {
    console.log("🔄 Activating compare mode");

    this.compareMode = true;
    this.selectedForCompare.clear();

    // Update UI to show compare mode
    this.updateCompareUI();

    // Show tooltip for first-time users
    this.showCompareTooltip();

    // Emit event for other components
    this.emitCompareModeEvent(true);

    notificationManager.showSystemNotification(
      "Compare mode activated - Tap friends to compare schedules",
      "info",
      3000
    );
  }

  /**
   * Deactivate compare mode
   */
  deactivateCompareMode() {
    console.log("🔄 Deactivating compare mode");

    this.compareMode = false;
    this.selectedForCompare.clear();

    // Update UI to exit compare mode
    this.updateCompareUI();

    // Emit event for other components
    this.emitCompareModeEvent(false);

    notificationManager.showSystemNotification(
      "Compare mode deactivated",
      "info",
      1500
    );
  }

  /**
   * Toggle friend selection for comparison
   */
  toggleCompareSelection(friendId, friendName) {
    if (this.selectedForCompare.has(friendId)) {
      // Remove from selection
      this.selectedForCompare.delete(friendId);
      console.log(`➖ Removed ${friendName} from comparison`);
    } else {
      // Add to selection
      this.selectedForCompare.add(friendId);
      console.log(`➕ Added ${friendName} to comparison`);
    }

    // Update visual selection
    this.updateCompareSelectionUI();

    // Emit comparison update event
    this.emitComparisonUpdateEvent();

    // Show feedback
    const action = this.selectedForCompare.has(friendId)
      ? "added to"
      : "removed from";
    notificationManager.showSystemNotification(
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
    }

    if (container) {
      container.classList.toggle("compare-mode", this.compareMode);
    }

    // Update all avatar visual states
    this.updateCompareSelectionUI();

    // Show/hide compare button based on friends availability
    this.updateCompareButtonVisibility();
  }

  /**
   * Update visual selection for compare mode
   */
  updateCompareSelectionUI() {
    this.avatarElements.forEach((element, friendId) => {
      const isSelected = this.selectedForCompare.has(friendId);
      element.classList.toggle("compare-selected", isSelected);

      // Add selection indicator if in compare mode
      if (this.compareMode) {
        element.classList.add("compare-mode-available");

        // Add/remove checkmark
        let checkmark = element.querySelector(".compare-checkmark");
        if (isSelected && !checkmark) {
          checkmark = document.createElement("div");
          checkmark.className = "compare-checkmark";
          checkmark.innerHTML = '<i class="fas fa-check"></i>';
          element.appendChild(checkmark);
        } else if (!isSelected && checkmark) {
          checkmark.remove();
        }
      } else {
        element.classList.remove("compare-mode-available", "compare-selected");
        const checkmark = element.querySelector(".compare-checkmark");
        if (checkmark) checkmark.remove();
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

    // Show tooltip
    notificationManager.showSystemNotification(
      "💭 Select friends to compare schedules. Tap [⚖️] again to exit compare mode.",
      "info",
      5000
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
    const eventDetail = {
      selectedFriends: Array.from(this.selectedForCompare),
      friendsData: this.quickAccessFriends.filter((f) =>
        this.selectedForCompare.has(f.friendId || f.userId)
      ),
      timestamp: Date.now(),
    };

    console.log("📡 Emitting compare:selection event:", eventDetail);

    document.dispatchEvent(
      new CustomEvent("compare:selection", {
        detail: eventDetail,
        bubbles: true,
      })
    );
  }

  /**
   * Set up real-time listeners for Quick Access changes
   */
  setupRealTimeListeners() {
    console.log(
      "📡 Setting up real-time listeners for HorizontalFriendsBar..."
    );

    // Listen for Quick Access updates from FriendsService
    if (friendsManager.registerUICallbacks) {
      friendsManager.registerUICallbacks({
        onQuickAccessUpdated: (quickAccessData) => {
          console.log(
            "⭐ Real-time Quick Access update in HorizontalFriendsBar:",
            quickAccessData
          );
          this.handleRealTimeQuickAccessUpdate(quickAccessData);
        },
      });
    }

    console.log("✅ Real-time listeners set up successfully");
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

      // Re-render the friends bar
      this.render();

      // Maintain current selection if still valid
      if (this.selectedFriendId) {
        const stillExists = quickAccessFriends.some(
          (f) => (f.friendId || f.userId) === this.selectedFriendId
        );

        if (!stillExists) {
          // Friend was unstarred, fallback to user's schedule
          this.selectUser();
        } else {
          // Re-select the current friend to maintain visual state
          this.updateVisualSelection(this.selectedFriendId);
        }
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
   * Programmatic API to refresh data
   */
  async refresh() {
    await this.loadQuickAccessFriends();
    this.render();
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
        "touchstart",
        this.boundHandlers.avatarLongPress
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

    // Clear real-time listeners
    if (this.realTimeUnsubscriber) {
      this.realTimeUnsubscriber();
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
}
