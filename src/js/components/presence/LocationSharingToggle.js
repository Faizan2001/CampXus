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
 * @author CampXus Development Team
 * @version 1.0.0
 */

import { locationPrivacyService } from "../../services/location/LocationPrivacyService.js";
import { campusLocationService } from "../../services/location/CampusLocationService.js";
import { currentUser } from "../../store/userStore.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";

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
    if (options.mode === 'friend' && !options.friendId) {
      throw new Error('friendId is required when mode is "friend"');
    }

    this.options = {
      mode: 'global', // 'global' | 'friend'
      friendId: null,
      friendData: null,
      showPermissionHelper: true,
      showStatus: true,
      containerClass: '',
      ...options
    };

    // Component state
    this.element = null;
    this.isLoading = false;
    this.currentState = {
      globalEnabled: false,
      friendEnabled: false,
      hasPermission: false,
      permissionStatus: 'prompt' // 'granted' | 'denied' | 'prompt'
    };

    // Bind methods to preserve context
    this.handleGlobalToggle = this.handleGlobalToggle.bind(this);
    this.handleFriendToggle = this.handleFriendToggle.bind(this);
    this.handlePermissionRequest = this.handlePermissionRequest.bind(this);

    console.log(`🎯 LocationSharingToggle created in ${this.options.mode} mode`, this.options);
  }

  /**
   * 🏗️ Create the toggle element with proper structure
   */
  async createElement() {
    const container = document.createElement("div");
    container.className = `location-sharing-toggle ${this.options.containerClass}`.trim();
    container.setAttribute("data-mode", this.options.mode);
    
    if (this.options.friendId) {
      container.setAttribute("data-friend-id", this.options.friendId);
    }

    // Initialize current state
    await this.updateCurrentState();

    // Generate HTML based on mode
    if (this.options.mode === 'global') {
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
    const { globalEnabled, hasPermission, permissionStatus } = this.currentState;
    const needsPermission = !hasPermission && permissionStatus !== 'denied';
    const permissionDenied = permissionStatus === 'denied';

    return `
      <div class="toggle-section global-location-toggle">
        <div class="toggle-header">
          <h3 class="toggle-title">
            <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
            Location Sharing
          </h3>
          ${this.options.showStatus ? `
            <div class="location-status ${this.getStatusClass()}">
              <i class="fas ${this.getStatusIcon()}" aria-hidden="true"></i>
              <span class="status-text">${this.getStatusText()}</span>
            </div>
          ` : ''}
        </div>

        <div class="toggle-controls">
          <div class="toggle-row main-toggle">
            <label class="toggle-label">
              <span class="label-text">Share my location with friends</span>
              <span class="label-description">Allow friends to see when you're on campus</span>
            </label>
            <div class="toggle-switch-wrapper">
              <button class="toggle-switch ${globalEnabled ? 'enabled' : 'disabled'}"
                      type="button"
                      role="switch"
                      aria-checked="${globalEnabled}"
                      aria-label="Toggle global location sharing"
                      data-action="toggle-global"
                      ${this.isLoading ? 'disabled' : ''}>
                <span class="toggle-slider"></span>
                <span class="toggle-text">${globalEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>

          ${needsPermission ? `
            <div class="permission-helper">
              <div class="permission-notice">
                <i class="fas fa-info-circle" aria-hidden="true"></i>
                <span>Location permission required</span>
              </div>
              <button class="permission-request-btn btn-primary"
                      type="button"
                      data-action="request-permission"
                      ${this.isLoading ? 'disabled' : ''}>
                <i class="fas fa-unlock" aria-hidden="true"></i>
                Grant Permission
              </button>
            </div>
          ` : ''}

          ${permissionDenied ? `
            <div class="permission-denied">
              <div class="denied-notice">
                <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
                <span>Location access was denied</span>
              </div>
              <p class="denied-help">
                To enable location sharing, please allow location access in your browser settings 
                and refresh the page.
              </p>
            </div>
          ` : ''}
        </div>

        ${this.isLoading ? `
          <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <span class="loading-text">Updating location settings...</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 👥 Generate HTML for friend-specific location sharing toggle
   */
  generateFriendToggleHTML() {
    const { friendEnabled } = this.currentState;
    const friendName = this.options.friendData?.displayName || 'this friend';

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
              <button class="toggle-switch ${friendEnabled ? 'enabled' : 'disabled'}"
                      type="button"
                      role="switch"
                      aria-checked="${friendEnabled}"
                      aria-label="Toggle location sharing with ${friendName}"
                      data-action="toggle-friend"
                      ${this.isLoading ? 'disabled' : ''}>
                <span class="toggle-slider"></span>
                <span class="toggle-text">${friendEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        </div>

        ${this.isLoading ? `
          <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <span class="loading-text">Updating sharing settings...</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 🎯 Setup event handlers for user interactions
   */
  setupEventHandlers() {
    if (!this.element) return;

    // Global toggle handler
    const globalToggle = this.element.querySelector('[data-action="toggle-global"]');
    if (globalToggle) {
      globalToggle.addEventListener('click', this.handleGlobalToggle);
    }

    // Friend toggle handler
    const friendToggle = this.element.querySelector('[data-action="toggle-friend"]');
    if (friendToggle) {
      friendToggle.addEventListener('click', this.handleFriendToggle);
    }

    // Permission request handler
    const permissionBtn = this.element.querySelector('[data-action="request-permission"]');
    if (permissionBtn) {
      permissionBtn.addEventListener('click', this.handlePermissionRequest);
    }

    // Keyboard navigation
    this.element.addEventListener('keydown', this.handleKeyDown.bind(this));

    console.log('🎯 Event handlers attached to LocationSharingToggle');
  }

  /**
   * 🌍 Handle global location sharing toggle
   */
  async handleGlobalToggle(e) {
    e.preventDefault();
    if (this.isLoading) return;

    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.error('No current user found for global toggle');
      notificationManager.show('Please sign in to change location settings', 'error');
      return;
    }

    const newEnabled = !this.currentState.globalEnabled;
    console.log(`🌍 Global location toggle: ${this.currentState.globalEnabled} → ${newEnabled}`);

    this.setLoading(true);

    try {
      // Check permission first if enabling
      if (newEnabled && !this.currentState.hasPermission) {
        const permissionGranted = await this.requestLocationPermission();
        if (!permissionGranted) {
          this.setLoading(false);
          return;
        }
      }

      // Update global preferences
      const success = await locationPrivacyService.setGlobalLocationPreferences(
        currentUserUid,
        {
          enabled: newEnabled,
          shareWithFriends: newEnabled,
          updateTimestamp: new Date()
        }
      );

      if (success) {
        this.currentState.globalEnabled = newEnabled;
        this.updateToggleState();
        
        notificationManager.show(
          `Location sharing ${newEnabled ? 'enabled' : 'disabled'}`,
          'success'
        );

        // Emit event for parent components
        this.emitStateChangeEvent('global', newEnabled);

        // 🌍 Handle location tracking based on global toggle
        this.handleLocationTrackingForGlobalToggle(newEnabled);
      } else {
        throw new Error('Failed to update global location preferences');
      }
    } catch (error) {
      console.error('Error updating global location sharing:', error);
      notificationManager.show('Failed to update location settings', 'error');
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
      console.error('No current user found for friend toggle');
      notificationManager.show('Please sign in to change location settings', 'error');
      return;
    }

    const newEnabled = !this.currentState.friendEnabled;
    const friendName = this.options.friendData?.displayName || 'friend';
    
    console.log(`👥 Friend location toggle for ${friendName}: ${this.currentState.friendEnabled} → ${newEnabled}`);

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
          `Location sharing with ${friendName} ${newEnabled ? 'enabled' : 'disabled'}`,
          'success'
        );

        // Emit event for parent components
        this.emitStateChangeEvent('friend', newEnabled, this.options.friendId);
      } else {
        throw new Error('Failed to update friend location preferences');
      }
    } catch (error) {
      console.error('Error updating friend location sharing:', error);
      notificationManager.show(`Failed to update location sharing with ${friendName}`, 'error');
    }

    this.setLoading(false);
  }

  /**
   * 🔓 Handle location permission request
   */
  async handlePermissionRequest(e) {
    e.preventDefault();
    if (this.isLoading) return;

    console.log('🔓 Requesting location permission');
    this.setLoading(true);

    try {
      const permissionGranted = await this.requestLocationPermission();
      
      if (permissionGranted) {
        notificationManager.show('Location permission granted!', 'success');
        // Re-render to update UI
        await this.updateCurrentState();
        this.updateToggleState();
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
      notificationManager.show('Failed to request location permission', 'error');
    }

    this.setLoading(false);
  }

  /**
   * 🔐 Request location permission from browser
   * @returns {boolean} Whether permission was granted
   */
  async requestLocationPermission() {
    try {
      const result = await campusLocationService.requestLocationPermission();
      
      if (result.success) {
        this.currentState.hasPermission = true;
        this.currentState.permissionStatus = 'granted';
        return true;
      } else {
        this.currentState.hasPermission = false;
        this.currentState.permissionStatus = result.error === 'denied' ? 'denied' : 'prompt';
        
        if (result.error === 'denied') {
          notificationManager.show(
            'Location access denied. Please enable in browser settings.',
            'warning'
          );
        } else {
          notificationManager.show(result.message || 'Location permission required', 'info');
        }
        return false;
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
      this.currentState.hasPermission = false;
      this.currentState.permissionStatus = 'denied';
      return false;
    }
  }

  /**
   * 📊 Update current state from services
   */
  async updateCurrentState() {
    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.warn('No current user for state update');
      return;
    }

    try {
      // Get permission status
      const permissionStatus = await campusLocationService.getPermissionStatus();
      this.currentState.permissionStatus = permissionStatus;
      this.currentState.hasPermission = permissionStatus === 'granted';

      // Get global preferences
      if (this.options.mode === 'global') {
        const globalPrefs = await locationPrivacyService.getGlobalLocationPreferences(currentUserUid);
        this.currentState.globalEnabled = globalPrefs?.enabled ?? false;
      }

      // Get friend-specific preferences
      if (this.options.mode === 'friend' && this.options.friendId) {
        const canAccess = await locationPrivacyService.canAccessLocation(
          this.options.friendId,
          currentUserUid
        );
        this.currentState.friendEnabled = canAccess;
      }

      console.log('📊 Current state updated:', this.currentState);
    } catch (error) {
      console.error('Error updating current state:', error);
    }
  }

  /**
   * 🎨 Update toggle visual state
   */
  updateToggleState() {
    if (!this.element) return;

    // Update global toggle
    const globalToggle = this.element.querySelector('[data-action="toggle-global"]');
    if (globalToggle) {
      const enabled = this.currentState.globalEnabled;
      globalToggle.className = `toggle-switch ${enabled ? 'enabled' : 'disabled'}`;
      globalToggle.setAttribute('aria-checked', enabled);
      
      const toggleText = globalToggle.querySelector('.toggle-text');
      if (toggleText) {
        toggleText.textContent = enabled ? 'ON' : 'OFF';
      }
    }

    // Update friend toggle
    const friendToggle = this.element.querySelector('[data-action="toggle-friend"]');
    if (friendToggle) {
      const enabled = this.currentState.friendEnabled;
      friendToggle.className = `toggle-switch ${enabled ? 'enabled' : 'disabled'}`;
      friendToggle.setAttribute('aria-checked', enabled);
      
      const toggleText = friendToggle.querySelector('.toggle-text');
      if (toggleText) {
        toggleText.textContent = enabled ? 'ON' : 'OFF';
      }
    }

    // Update status display
    if (this.options.showStatus) {
      const statusElement = this.element.querySelector('.location-status');
      if (statusElement) {
        statusElement.className = `location-status ${this.getStatusClass()}`;
        
        const statusIcon = statusElement.querySelector('i');
        const statusText = statusElement.querySelector('.status-text');
        
        if (statusIcon) {
          statusIcon.className = `fas ${this.getStatusIcon()}`;
        }
        if (statusText) {
          statusText.textContent = this.getStatusText();
        }
      }
    }
  }

  /**
   * 🏷️ Get CSS class for current status
   */
  getStatusClass() {
    if (!this.currentState.hasPermission) return 'status-no-permission';
    if (this.currentState.globalEnabled) return 'status-enabled';
    return 'status-disabled';
  }

  /**
   * 🎯 Get icon for current status
   */
  getStatusIcon() {
    if (!this.currentState.hasPermission) return 'fa-lock';
    if (this.currentState.globalEnabled) return 'fa-check-circle';
    return 'fa-times-circle';
  }

  /**
   * 📝 Get text for current status
   */
  getStatusText() {
    if (!this.currentState.hasPermission) return 'Permission required';
    if (this.currentState.globalEnabled) return 'Location sharing enabled';
    return 'Location sharing disabled';
  }

  /**
   * ⏳ Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;
    
    if (!this.element) return;

    // Update loading overlay
    const overlay = this.element.querySelector('.loading-overlay');
    if (overlay) {
      overlay.style.display = loading ? 'flex' : 'none';
    }

    // Disable/enable buttons
    const buttons = this.element.querySelectorAll('button');
    buttons.forEach(button => {
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
      component: this
    };

    this.element.dispatchEvent(
      new CustomEvent('location-sharing-changed', {
        bubbles: true,
        detail: eventData
      })
    );

    console.log('📡 Location sharing change event emitted:', eventData);
  }

  /**
   * ⌨️ Handle keyboard navigation
   */
  handleKeyDown(e) {
    // Handle Enter and Space for toggle buttons
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.toggle-switch')) {
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
      if (this.options.mode === 'global') {
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
      console.error('❌ Parent element is required to render LocationSharingToggle');
      return;
    }

    if (!this.element) {
      await this.createElement();
    }

    parentElement.appendChild(this.element);
    console.log(`🎭 LocationSharingToggle rendered in ${this.options.mode} mode`);
  }

  /**
   * 🔄 Refresh component state and UI
   */
  async refresh() {
    await this.updateCurrentState();
    this.updateToggleState();
    console.log('🔄 LocationSharingToggle refreshed');
  }

  /**
   * 🌍 Handle location tracking when global location sharing is toggled
   * @param {boolean} enabled - Whether global location sharing was enabled or disabled
   */
  async handleLocationTrackingForGlobalToggle(enabled) {
    try {
      // Dynamically import campus location service to avoid circular dependencies
      const { campusLocationService } = await import('../../services/location/CampusLocationService.js');
      
      if (enabled) {
        // Global location sharing was enabled - start tracking if conditions are met
        console.log('🌍 Global location sharing enabled - checking if automatic tracking should start...');
        setTimeout(async () => {
          try {
            // Start 3-tier presence polling (it executes one poll immediately)
            await campusLocationService.startPresencePolling(20000);
          } catch (e) {
            console.warn('⚠️ Failed to start presence polling after enabling:', e?.message || e);
          }
        }, 150);
      } else {
        // Global location sharing was disabled - stop tracking immediately
        console.log('🌍 Global location sharing disabled - stopping location tracking');
        campusLocationService.stopLocationTracking();
        // Stop background polling
        if (typeof campusLocationService.stopPresencePolling === 'function') {
          campusLocationService.stopPresencePolling();
        }
      }
    } catch (error) {
      console.error('🌍 Error handling location tracking for global toggle:', error);
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

    console.log(`🧹 LocationSharingToggle destroyed (${this.options.mode} mode)`);
  }
}

// Development helper for testing
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.LocationSharingToggle = LocationSharingToggle;
  console.log('[LocationSharingToggle] Component loaded and available globally for testing');
}
