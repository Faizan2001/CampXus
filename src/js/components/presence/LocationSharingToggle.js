/**
 * LocationSharingToggle Component - Campus Presence Location Controls
 *
 * 🎓 BEGINNER EXPLANATION:
 * This component provides user-friendly controls for location sharing preferences.
 * It's a reusable UI component that can be embedded in FriendsPage, FriendOptionsMenu,
 * and other places where users need to control location sharing.
 *
 * FEATURES:
 * - Global location sharing toggle (enable/disable location sharing globally)
 * - Per-friend location sharing controls (toggle location sharing with individual friends)
 * - Location permission management (handle browser location permission requests)
 * - Visual feedback (show current location sharing status and settings)
 * - Integration with LocationPrivacyService for all privacy operations
 * - Loading states and error handling with user-friendly messages
 * - Responsive design for mobile and desktop
 *
 * WHY THIS APPROACH:
 * - Separation of concerns: component logic separate from service logic
 * - Reusability: can be used in multiple contexts (friends page, settings, etc.)
 * - Event-driven: loose coupling with parent components
 * - Accessibility: proper ARIA labels and keyboard support
 * - Privacy-focused: integrates with bilateral privacy system
 *
 * Part of the Campus Presence System (Phase 3.1)
 *
 * @author MeetchuThere Development Team
 * @version 1.0.0
 */

import { locationPrivacyService } from "../../services/location/LocationPrivacyService.js";
import { currentUser } from "../../store/userStore.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";
import { AnalyticsService } from "../../services/analytics/AnalyticsService.js";

export class LocationSharingToggle {
  /**
   * Initialize the LocationSharingToggle component
   *
   * @param {Object} options - Component configuration options
   * @param {string} options.mode - 'global' | 'friend' - determines the toggle mode
   * @param {string} options.friendId - Required if mode is 'friend' - friend's user ID
   * @param {Object} options.friendData - Optional friend data for display
   * @param {boolean} options.showPermissionHelper - Whether to show permission helper UI
   * @param {boolean} options.showStatus - Whether to show current status text
   * @param {string} options.containerClass - Additional CSS classes for container
   */
  constructor(options = {}) {
    // Validate required options
    if (options.mode === "friend" && !options.friendId) {
      throw new Error('friendId is required when mode is "friend"');
    }

    this.options = {
      mode: "global", // 'global' | 'friend'
      friendId: null,
      friendData: null,
      showPermissionHelper: true,
      showStatus: true,
      containerClass: "",
      ...options,
    };

    // Component state
    this.element = null;
    this.isLoading = false;
    this.currentState = {
      globalEnabled: false,
      friendEnabled: false,
    };

    // Bind methods to preserve context
    this.handleGlobalToggle = this.handleGlobalToggle.bind(this);
    this.handleFriendToggle = this.handleFriendToggle.bind(this);

    console.log(
      `🎯 LocationSharingToggle created in ${this.options.mode} mode`,
      this.options
    );
  }

  /**
   * 🏗️ Create the toggle element with proper structure
   */
  async createElement() {
    const container = document.createElement("div");
    container.className =
      `location-sharing-toggle ${this.options.containerClass}`.trim();
    container.setAttribute("data-mode", this.options.mode);

    if (this.options.friendId) {
      container.setAttribute("data-friend-id", this.options.friendId);
    }

    // Initialize current state
    await this.updateCurrentState();

    // Generate HTML based on mode
    if (this.options.mode === "global") {
      container.innerHTML = this.generateGlobalToggleHTML();
    } else {
      container.innerHTML = this.generateFriendToggleHTML();
    }

    this.element = container;
    this.setupEventHandlers();
    return container;
  }

  /**
   * 🌍 Generate HTML for global location sharing toggle
   */
  generateGlobalToggleHTML() {
    const { globalEnabled, permissionMissing } = this.currentState;
    const permissionState = permissionMissing ? "missing" : "granted";
    const needsPermission = !!(globalEnabled && permissionMissing);

    return `
      <button class="location-toggle-switch ${
        globalEnabled ? "enabled" : "disabled"
      }"
              type="button"
              role="switch"
              aria-checked="${globalEnabled}"
              aria-label="Toggle campus presence sharing with friends"
              ${needsPermission ? 'data-permission-missing="true"' : ""}
              data-permission-state="${permissionState}"
              ${
                needsPermission
                  ? 'title="Location permission required to resume sharing"'
                  : ""
              }
              data-action="toggle-global"
              ${this.isLoading ? "disabled" : ""}>
        <span class="location-toggle-text location-toggle-off">OFF</span>
        <span class="location-toggle-text location-toggle-on">ON</span>
        <span class="location-toggle-slider"></span>
      </button>
    `;
  }

  /**
   * 👥 Generate HTML for friend-specific location sharing toggle
   */
  generateFriendToggleHTML() {
    const { friendEnabled } = this.currentState;
    // Using global unique handle for identity display (displayName deprecated)
    const friendName = this.options.friendData?.handle
      ? `@${this.options.friendData.handle}`
      : this.options.friendData?.firstName || "this friend";

    return `
      <div class="toggle-section friend-location-toggle">
        <div class="toggle-header">
          <h4 class="toggle-title">
            <i class="fas fa-user-friends" aria-hidden="true"></i>
            Location Sharing with ${friendName}
          </h4>
        </div>

        <div class="toggle-controls">
          <div class="toggle-row friend-toggle">
            <label class="toggle-label">
              <span class="label-text">Share location with ${friendName}</span>
              <span class="label-description">Allow ${friendName} to see when you're on campus</span>
            </label>
            <div class="toggle-switch-wrapper">
              <button class="toggle-switch ${
                friendEnabled ? "enabled" : "disabled"
              }"
                      type="button"
                      role="switch"
                      aria-checked="${friendEnabled}"
                      aria-label="Toggle location sharing with ${friendName}"
                      data-action="toggle-friend"
                      ${this.isLoading ? "disabled" : ""}>
                <span class="toggle-slider"></span>
                <span class="toggle-text">${friendEnabled ? "ON" : "OFF"}</span>
              </button>
            </div>
          </div>
        </div>

        ${
          this.isLoading
            ? `
          <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <span class="loading-text">Updating sharing settings...</span>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  /**
   * 🎯 Setup event handlers for user interactions
   */
  setupEventHandlers() {
    if (!this.element) return;

    // Global toggle handler
    const globalToggle = this.element.querySelector(
      '[data-action="toggle-global"]'
    );
    if (globalToggle) {
      globalToggle.addEventListener("click", this.handleGlobalToggle);
    }

    // Friend toggle handler
    const friendToggle = this.element.querySelector(
      '[data-action="toggle-friend"]'
    );
    if (friendToggle) {
      friendToggle.addEventListener("click", this.handleFriendToggle);
    }

    // Keyboard navigation
    this.element.addEventListener("keydown", this.handleKeyDown.bind(this));

    // Listen for permission changes to refresh UI state automatically
    this._onPermissionChanged = async (_e) => {
      try {
        // Refresh UI state on any permission change (denied/granted)
        await this.refresh();
      } catch (_) {}
    };
    document.addEventListener(
      "location-permission:changed",
      this._onPermissionChanged
    );

    console.log("🎯 Event handlers attached to LocationSharingToggle");
  }

  /**
   * 🌍 Handle global location sharing toggle
   */
  async handleGlobalToggle(e) {
    e.preventDefault();
    if (this.isLoading) return;

    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.error("No current user found for global toggle");
      notificationManager.show(
        "Please sign in to change location settings",
        "error"
      );
      return;
    }

    const newEnabled = !this.currentState.globalEnabled;
    console.log(
      `🌍 Global location toggle: ${this.currentState.globalEnabled} → ${newEnabled}`
    );

    this.setLoading(true);

    try {
      // When turning ON, attempt to get permission within this user gesture,
      // but do not block enabling if permission remains missing. The toggle is
      // the source of truth; GPS will start automatically once permission is granted.
      if (newEnabled === true) {
        try {
          const { campusLocationService } = await import(
            "../../services/location/CampusLocationService.js"
          );
          let status = campusLocationService.getPermissionStatus?.() || null;
          if (status !== "granted") {
            await campusLocationService.requestLocationPermission();
            status = campusLocationService.getPermissionStatus?.() || null;
          }
          this.currentState.permissionMissing = status !== "granted";
          if (this.currentState.permissionMissing) {
            notificationManager.showWarningNotification(
              "Location permission is not enabled. We'll use Wi‑Fi/IP until you enable it.",
              { duration: 5000 }
            );
          }
        } catch (_) {
          // Best effort; proceed and allow network-only mode
          this.currentState.permissionMissing = true;
        }
      }

      // Update global preferences
      const success = await locationPrivacyService.setGlobalLocationPreferences(
        currentUserUid,
        {
          enabled: newEnabled,
          shareWithFriends: newEnabled,
          updateTimestamp: new Date(),
        }
      );

      if (success) {
        this.currentState.globalEnabled = newEnabled;
        this.updateToggleState();

        notificationManager.show(
          `Location sharing ${newEnabled ? "enabled" : "disabled"}`,
          "success"
        );

        // Emit event for parent components
        this.emitStateChangeEvent("global", newEnabled);

        // 🌍 Handle location tracking based on global toggle
        this.handleLocationTrackingForGlobalToggle(newEnabled);

        // � Analytics: global location sharing toggle
        try {
          AnalyticsService.trackLocationSharingToggle("global", newEnabled, {
            scope: "global",
          });
        } catch {}

        // �🟡 Immediate UI feedback: refresh user's presence dot to grey when disabled
        try {
          const { getHorizontalFriendsBarInstance } = await import(
            "../../components/friends/HorizontalFriendsBar.js"
          );
          const bar =
            getHorizontalFriendsBarInstance &&
            getHorizontalFriendsBarInstance();
          if (bar && typeof bar.updateUserPresencePill === "function") {
            bar.updateUserPresencePill({
              locationSharingEnabled: newEnabled,
              lastKnownLocation: null,
              lastActive: null,
            });
          }
        } catch (e) {
          // Non-fatal: UI will update on Firestore realtime listener
        }
      } else {
        throw new Error("Failed to update global location preferences");
      }
    } catch (error) {
      console.error("Error updating global location sharing:", error);
      notificationManager.show("Failed to update location settings", "error");
    }

    this.setLoading(false);
  }

  /**
   * 👥 Handle friend-specific location sharing toggle
   */
  async handleFriendToggle(e) {
    e.preventDefault();
    if (this.isLoading || !this.options.friendId) return;

    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.error("No current user found for friend toggle");
      notificationManager.show(
        "Please sign in to change location settings",
        "error"
      );
      return;
    }

    const newEnabled = !this.currentState.friendEnabled;
    const friendName = this.options.friendData?.handle
      ? `@${this.options.friendData.handle}`
      : this.options.friendData?.firstName || "friend";

    console.log(
      `👥 Friend location toggle for ${friendName}: ${this.currentState.friendEnabled} → ${newEnabled}`
    );

    this.setLoading(true);

    try {
      let success;

      if (newEnabled) {
        success = await locationPrivacyService.enableLocationSharingWith(
          currentUserUid,
          this.options.friendId
        );
      } else {
        success = await locationPrivacyService.disableLocationSharingWith(
          currentUserUid,
          this.options.friendId
        );
      }

      if (success) {
        this.currentState.friendEnabled = newEnabled;
        this.updateToggleState();

        notificationManager.show(
          `Location sharing with ${friendName} ${
            newEnabled ? "enabled" : "disabled"
          }`,
          "success"
        );

        // Emit event for parent components
        this.emitStateChangeEvent("friend", newEnabled, this.options.friendId);

        // 📊 Analytics: friend-specific location sharing toggle
        try {
          AnalyticsService.trackLocationSharingToggle("friend", newEnabled, {
            friend_id: this.options.friendId,
            friend_handle: this.options.friendData?.handle || "unknown",
          });
        } catch {}
      } else {
        throw new Error("Failed to update friend location preferences");
      }
    } catch (error) {
      console.error("Error updating friend location sharing:", error);
      notificationManager.show(
        `Failed to update location sharing with ${friendName}`,
        "error"
      );
    }

    this.setLoading(false);
  }

  /**
   * 📊 Update current state from services
   */
  async updateCurrentState() {
    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.warn("No current user for state update");
      return;
    }

    try {
      // Get global preferences
      if (this.options.mode === "global") {
        const globalPrefs =
          await locationPrivacyService.getGlobalLocationPreferences(
            currentUserUid
          );
        this.currentState.globalEnabled = globalPrefs?.enabled ?? false;
        // Track permission state without overriding user's saved preference.
        // On iOS/Safari, geolocation permission often resets between sessions
        // (e.g., "Allow Once"). Reflect that as a "permission missing" state
        // but do not flip the user's global preference OFF in the UI.
        try {
          const { campusLocationService } = await import(
            "../../services/location/CampusLocationService.js"
          );
          const status = campusLocationService.getPermissionStatus?.() || null;
          this.currentState.permissionMissing = status !== "granted";
        } catch (_) {
          // best-effort; leave permissionMissing undefined if detection fails
        }
      }

      // Get friend-specific preferences
      if (this.options.mode === "friend" && this.options.friendId) {
        const canAccess = await locationPrivacyService.canAccessLocation(
          this.options.friendId,
          currentUserUid
        );
        this.currentState.friendEnabled = canAccess;
      }

      console.log("📊 Current state updated:", this.currentState);
    } catch (error) {
      console.error("Error updating current state:", error);
    }
  }

  /**
   * 🎨 Update toggle visual state
   */
  updateToggleState() {
    if (!this.element) return;

    // Support both global (new class) and friend (legacy class) toggles
    const toggle = this.element.querySelector(
      this.options.mode === "global"
        ? ".location-toggle-switch"
        : ".toggle-switch"
    );
    if (toggle) {
      const enabled =
        this.options.mode === "global"
          ? this.currentState.globalEnabled
          : this.currentState.friendEnabled;

      if (toggle.classList.contains("location-toggle-switch")) {
        toggle.className = `location-toggle-switch ${
          enabled ? "enabled" : "disabled"
        }`;
      } else if (toggle.classList.contains("toggle-switch")) {
        toggle.className = `toggle-switch ${enabled ? "enabled" : "disabled"}`;
      }
      toggle.setAttribute("aria-checked", enabled);

      // Reflect permission status attributes on the toggle for styling/UX
      if (this.options.mode === "global") {
        const permissionMissing = !!this.currentState.permissionMissing;
        const permissionState = permissionMissing ? "missing" : "granted";
        const needsPermission = !!(
          this.currentState.globalEnabled && permissionMissing
        );

        toggle.setAttribute("data-permission-state", permissionState);

        if (needsPermission) {
          toggle.setAttribute("data-permission-missing", "true");
          toggle.setAttribute(
            "title",
            "Location permission required to resume sharing"
          );
        } else {
          toggle.removeAttribute("data-permission-missing");
          toggle.removeAttribute("title");
        }
      }
    }
  }

  /**
   * ⏳ Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;

    if (!this.element) return;

    // Update loading overlay
    const overlay = this.element.querySelector(".loading-overlay");
    if (overlay) {
      overlay.style.display = loading ? "flex" : "none";
    }

    // Disable/enable buttons
    const buttons = this.element.querySelectorAll("button");
    buttons.forEach((button) => {
      button.disabled = loading;
    });
  }

  /**
   * 📡 Emit state change event for parent components
   */
  emitStateChangeEvent(type, enabled, friendId = null) {
    if (!this.element) return;

    const eventData = {
      type, // 'global' | 'friend'
      enabled,
      friendId,
      component: this,
    };

    this.element.dispatchEvent(
      new CustomEvent("location-sharing-changed", {
        bubbles: true,
        detail: eventData,
      })
    );

    console.log("📡 Location sharing change event emitted:", eventData);
  }

  /**
   * ⌨️ Handle keyboard navigation
   */
  handleKeyDown(e) {
    // Handle Enter and Space for toggle buttons (support both class names and ARIA role)
    const isSwitch = e.target.matches(
      '.location-toggle-switch, .toggle-switch, [role="switch"]'
    );
    if ((e.key === "Enter" || e.key === " ") && isSwitch) {
      e.preventDefault();
      e.target.click();
    }
  }

  /**
   * 🔄 Update component with new options
   */
  async updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };

    // Re-render if element exists
    if (this.element) {
      await this.updateCurrentState();

      // Update HTML content
      if (this.options.mode === "global") {
        this.element.innerHTML = this.generateGlobalToggleHTML();
      } else {
        this.element.innerHTML = this.generateFriendToggleHTML();
      }

      this.setupEventHandlers();
    }
  }

  /**
   * 🎭 Render the component into a parent element
   */
  async render(parentElement) {
    if (!parentElement) {
      console.error(
        "❌ Parent element is required to render LocationSharingToggle"
      );
      return;
    }

    if (!this.element) {
      await this.createElement();
    }

    parentElement.appendChild(this.element);
    console.log(
      `🎭 LocationSharingToggle rendered in ${this.options.mode} mode`
    );
  }

  /**
   * 🔄 Refresh component state and UI
   */
  async refresh() {
    await this.updateCurrentState();
    // Re-render inner content to reflect permission helper visibility
    if (this.element) {
      if (this.options.mode === "global") {
        this.element.innerHTML = this.generateGlobalToggleHTML();
      } else {
        this.element.innerHTML = this.generateFriendToggleHTML();
      }
      this.setupEventHandlers();
    }
    this.updateToggleState();
    console.log("🔄 LocationSharingToggle refreshed");
  }

  /**
   * 🌍 Handle location tracking when global location sharing is toggled
   * @param {boolean} enabled - Whether global location sharing was enabled or disabled
   */
  async handleLocationTrackingForGlobalToggle(enabled) {
    try {
      // Dynamically import campus location service to avoid circular dependencies
      const { campusLocationService } = await import(
        "../../services/location/CampusLocationService.js"
      );

      if (enabled) {
        // Global location sharing was enabled - start tracking if conditions are met
        console.log(
          "🌍 Global location sharing enabled - checking if automatic tracking should start..."
        );
        setTimeout(async () => {
          try {
            // Prefer the LocationScheduler orchestration if available
            try {
              const { locationScheduler } = await import(
                "../../services/location/LocationScheduler.js"
              );
              locationScheduler.start();
              // Kick an immediate refresh according to current route
              locationScheduler.manualRefresh();
            } catch (e) {
              // Fallback: start presence polling if scheduler not available
              await campusLocationService.startPresencePolling(20000);
            }
          } catch (e) {
            console.warn(
              "⚠️ Failed to start presence polling after enabling:",
              e?.message || e
            );
          }
        }, 150);
      } else {
        // Global location sharing was disabled - stop tracking immediately
        console.log(
          "🌍 Global location sharing disabled - stopping location tracking"
        );
        campusLocationService.stopLocationTracking();
        // Stop background polling
        if (typeof campusLocationService.stopPresencePolling === "function") {
          campusLocationService.stopPresencePolling();
        }
      }
    } catch (error) {
      console.error(
        "🌍 Error handling location tracking for global toggle:",
        error
      );
    }
  }

  /**
   * 🧹 Clean up event listeners and DOM
   */
  destroy() {
    if (!this.element) return;

    // Remove all event listeners by cloning element
    if (this.element.parentNode) {
      const cleanElement = this.element.cloneNode(true);
      this.element.parentNode.replaceChild(cleanElement, this.element);
    }

    this.element = null;
    this.isLoading = false;

    // Remove global listeners
    if (this._onPermissionChanged) {
      document.removeEventListener(
        "location-permission:changed",
        this._onPermissionChanged
      );
      this._onPermissionChanged = null;
    }

    console.log(
      `🧹 LocationSharingToggle destroyed (${this.options.mode} mode)`
    );
  }
}

// Removed global window.LocationSharingToggle exposure (import directly where needed)
