/**
 * 🔔 CampXus Notifications Page
 * 
 * This module handles the notifications page for location sharing requests
 * and other notification types in the Campus Presence system.
 * 
 * Features:
 * - Location sharing request notifications
 * - Friend request notifications  
 * - Real-time notification updates
 * - Accept/dismiss actions for notifications
 * - Location permission integration
 * 
 * Part of Phase 4.1: Campus Presence Implementation
 */

import { dataManager } from "../services/data/DataService.js";
import { currentUser } from "../store/userStore.js";
import { avatarManager } from "../utils/avatar/avatarManager.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import { campusLocationService } from "../services/location/CampusLocationService.js";
import {
  realTimeManager,
  REALTIME_EVENTS,
} from "../services/realtime/RealtimeService.js";

/**
 * NotificationsPage class handles the complete notifications interface
 * for location sharing requests and other notification types
 */
export class NotificationsPage {
  constructor() {
    this.notifications = [];
    this.unsubscribers = [];
    this.isInitialized = false;
    this.isActive = false;
    
    console.log("🔔 NotificationsPage initialized");
  }

  /**
   * Initialize the notifications page
   * Loads notifications and sets up real-time listeners
   */
  async init() {
    try {
      console.log("🔔 Initializing NotificationsPage...");
      this.isActive = true;
      
      await this.loadNotifications();
      this.setupRealtimeListeners();
      this.render();
      
      this.isInitialized = true;
      console.log("✅ NotificationsPage initialization complete");
    } catch (error) {
      console.error("❌ Error initializing NotificationsPage:", error);
      notificationManager.showErrorNotification("Failed to load notifications");
    }
  }

  /**
   * Load user notifications from the database
   */
  async loadNotifications() {
    try {
      console.log("📊 Loading user notifications...");
      
      if (!currentUser?.uid) {
        console.warn("⚠️ No current user found");
        this.notifications = [];
        return;
      }

      // Load notifications from dataManager
      this.notifications = await dataManager.getUserNotifications(currentUser.uid);
      
      console.log(`📊 Loaded ${this.notifications.length} notifications`);
    } catch (error) {
      console.error("❌ Error loading notifications:", error);
      this.notifications = [];
    }
  }

  /**
   * Set up real-time listeners for notification updates
   */
  setupRealtimeListeners() {
    try {
      console.log("🔄 Setting up real-time notification listeners...");

      // Listen for user profile changes (notifications may be updated)
      const profileUnsubscriber = realTimeManager.on(
        REALTIME_EVENTS.USER_PROFILE,
        async (profile) => {
          console.log("👤 User profile updated, refreshing notifications...");
          await this.loadNotifications();
          this.render();
        }
      );

      // Listen for friendship changes (may affect location sharing notifications)
      const friendshipUnsubscriber = realTimeManager.on(
        REALTIME_EVENTS.FRIENDSHIPS,
        async (friendships) => {
          console.log("🤝 Friendships updated, refreshing notifications...");
          await this.loadNotifications();
          this.render();
        }
      );

      this.unsubscribers.push(profileUnsubscriber, friendshipUnsubscriber);
      
      console.log("✅ Real-time listeners set up successfully");
    } catch (error) {
      console.error("❌ Error setting up real-time listeners:", error);
    }
  }

  /**
   * Render the notifications page
   */
  render() {
    try {
      console.log("🎨 Rendering NotificationsPage...");
      
      const template = `
        <div class="content-grid">
          <div class="notifications-page">
            <!-- Notifications Header -->
            <section class="glass-card notifications-header">
              <div class="page-title-section">
                <h1 class="page-title">
                  <i class="fas fa-bell"></i>
                  Notifications
                </h1>
                <p class="page-subtitle">
                  Stay updated with friend requests, location sharing invites, and campus connections.
                </p>
              </div>
              <div class="header-actions">
                <button type="button" class="mark-all-read button secondary" ${this.notifications.length === 0 ? 'disabled' : ''}>
                  <i class="fas fa-check-double"></i>
                  Mark All Read
                </button>
              </div>
            </section>

            <!-- Notifications List -->
            <section class="glass-card notifications-list">
              <h3>
                <i class="fas fa-inbox"></i>
                Recent Activity
              </h3>
              <div id="notificationsList" class="notifications-scrollable-container">
                ${this.renderNotifications()}
              </div>
            </section>
          </div>
        </div>
      `;
      
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.innerHTML = template;
        this.setupEventHandlers();
        console.log("✅ NotificationsPage rendered successfully");
      } else {
        console.error("❌ Main content container not found");
      }
    } catch (error) {
      console.error("❌ Error rendering NotificationsPage:", error);
    }
  }

  /**
   * Render the list of notifications
   * @returns {string} HTML string for notifications
   */
  renderNotifications() {
    if (this.notifications.length === 0) {
      return `
        <div class="no-notifications">
          <div class="no-notifications-icon">🔔</div>
          <h4 class="no-notifications-text">All caught up!</h4>
          <p class="no-notifications-subtitle">
            No new notifications right now. When friends send you requests or share their location,
            you'll see them here.
          </p>
          <div class="empty-actions">
            <button type="button" class="button secondary" data-spa-route="friends">
              <i class="fas fa-users"></i>
              Find Friends
            </button>
          </div>
        </div>
      `;
    }

    return this.notifications.map(notification => {
      if (notification.type === "location_share_request") {
        return this.renderLocationShareRequest(notification);
      } else if (notification.type === "friend_request") {
        return this.renderFriendRequest(notification);
      } else if (notification.type === "location_sharing_enabled") {
        return this.renderLocationSharingEnabled(notification);
      }
      
      // Default notification rendering
      return this.renderGenericNotification(notification);
    }).join('');
  }

  /**
   * Render a location sharing request notification
   * @param {Object} notification - The location share request notification
   * @returns {string} HTML string for the notification
   */
  renderLocationShareRequest(notification) {
    const isRead = notification.read || false;
    const readClass = isRead ? 'notification-read' : 'notification-unread';
    
    return `
      <div class="notification-item location-request ${readClass}" data-notification-id="${notification.id}">
        <div class="notification-avatar">
          <img src="${avatarManager.generateAvatarUrl(notification.fromUserInfo.avatarConfig)}" 
               alt="${notification.fromUserInfo.displayName}"
               onerror="this.src='${avatarManager.getAvatarFallback()}'">
        </div>
        
        <div class="notification-content">
          <div class="notification-text">
            <strong>${notification.fromUserInfo.displayName}</strong> wants to share campus locations with you
          </div>
          <div class="notification-details">
            Share your real-time location to see each other on campus
          </div>
          <div class="notification-time">${this.formatTime(notification.createdAt)}</div>
        </div>
        
        <div class="notification-actions">
          <button class="accept-location-btn" data-friendship-id="${notification.locationRequest.friendshipId}">
            Share Location
          </button>
          <button class="dismiss-btn" data-notification-id="${notification.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render a friend request notification
   * @param {Object} notification - The friend request notification
   * @returns {string} HTML string for the notification
   */
  renderFriendRequest(notification) {
    const isRead = notification.read || false;
    const readClass = isRead ? 'notification-read' : 'notification-unread';
    
    return `
      <div class="notification-item friend-request ${readClass}" data-notification-id="${notification.id}">
        <div class="notification-avatar">
          <img src="${avatarManager.generateAvatarUrl(notification.fromUserInfo.avatarConfig)}" 
               alt="${notification.fromUserInfo.displayName}"
               onerror="this.src='${avatarManager.getAvatarFallback()}'">
        </div>
        
        <div class="notification-content">
          <div class="notification-text">
            <strong>${notification.fromUserInfo.displayName}</strong> sent you a friend request
          </div>
          <div class="notification-details">
            ${notification.fromUserInfo.major} • ${notification.fromUserInfo.university}
          </div>
          <div class="notification-time">${this.formatTime(notification.createdAt)}</div>
        </div>
        
        <div class="notification-actions">
          <button class="accept-friend-btn" data-request-id="${notification.friendRequest.requestId}">
            Accept
          </button>
          <button class="dismiss-btn" data-notification-id="${notification.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render a location sharing enabled notification
   * @param {Object} notification - The location sharing enabled notification
   * @returns {string} HTML string for the notification
   */
  renderLocationSharingEnabled(notification) {
    const isRead = notification.read || false;
    const readClass = isRead ? 'notification-read' : 'notification-unread';
    
    return `
      <div class="notification-item location-enabled ${readClass}" data-notification-id="${notification.id}">
        <div class="notification-avatar">
          <img src="${avatarManager.generateAvatarUrl(notification.fromUserInfo.avatarConfig)}" 
               alt="${notification.fromUserInfo.displayName}"
               onerror="this.src='${avatarManager.getAvatarFallback()}'">
        </div>
        
        <div class="notification-content">
          <div class="notification-text">
            <strong>${notification.fromUserInfo.displayName}</strong> is now sharing their location with you
          </div>
          <div class="notification-details">
            You can now see each other on the campus map
          </div>
          <div class="notification-time">${this.formatTime(notification.createdAt)}</div>
        </div>
        
        <div class="notification-actions">
          <button class="dismiss-btn" data-notification-id="${notification.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render a generic notification
   * @param {Object} notification - The generic notification
   * @returns {string} HTML string for the notification
   */
  renderGenericNotification(notification) {
    const isRead = notification.read || false;
    const readClass = isRead ? 'notification-read' : 'notification-unread';
    
    return `
      <div class="notification-item generic ${readClass}" data-notification-id="${notification.id}">
        <div class="notification-content">
          <div class="notification-text">
            ${notification.message || 'New notification'}
          </div>
          <div class="notification-time">${this.formatTime(notification.createdAt)}</div>
        </div>
        
        <div class="notification-actions">
          <button class="dismiss-btn" data-notification-id="${notification.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Set up event handlers for notification interactions
   */
  setupEventHandlers() {
    try {
      console.log("🔧 Setting up notification event handlers...");

      // Handle location sharing acceptance
      document.querySelectorAll('.accept-location-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const friendshipId = e.target.dataset.friendshipId;
          console.log("📍 Accepting location sharing for friendship:", friendshipId);
          await this.acceptLocationSharing(friendshipId);
        });
      });

      // Handle friend request acceptance
      document.querySelectorAll('.accept-friend-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const requestId = e.target.dataset.requestId;
          console.log("👥 Accepting friend request:", requestId);
          await this.acceptFriendRequest(requestId);
        });
      });

      // Handle notification dismissal
      document.querySelectorAll('.dismiss-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const notificationId = e.target.dataset.notificationId;
          console.log("🗑️ Dismissing notification:", notificationId);
          await this.dismissNotification(notificationId);
        });
      });

      // Handle mark all read
      const markAllReadBtn = document.querySelector('.mark-all-read');
      if (markAllReadBtn && !markAllReadBtn.disabled) {
        markAllReadBtn.addEventListener('click', async () => {
          console.log("📖 Marking all notifications as read");
          await this.markAllNotificationsRead();
        });
      }

      console.log("✅ Event handlers set up successfully");
    } catch (error) {
      console.error("❌ Error setting up event handlers:", error);
    }
  }

  /**
   * Accept location sharing with a friend
   * @param {string} friendshipId - The friendship ID to enable location sharing for
   */
  async acceptLocationSharing(friendshipId) {
    try {
      console.log("📍 Processing location sharing acceptance...");

      // Enable location sharing from current user's side
      const result = await dataManager.updateBilateralLocationSharing(
        friendshipId,
        currentUser.uid,
        true
      );

      if (result.success) {
        // Request location permission if not already granted
        if (!campusLocationService.locationPermissionGranted) {
          console.log("📍 Requesting location permission...");
          await campusLocationService.requestLocationPermission();
        }

        // Start tracking location
        await this.startLocationTracking();

        notificationManager.showSuccessNotification("Location sharing enabled!");
        
        // Refresh notifications to update UI
        await this.loadNotifications();
        this.render();
        
        console.log("✅ Location sharing accepted successfully");
      } else {
        throw new Error(result.error || "Failed to enable location sharing");
      }
    } catch (error) {
      console.error("❌ Error accepting location sharing:", error);
      notificationManager.showErrorNotification("Failed to enable location sharing");
    }
  }

  /**
   * Accept a friend request
   * @param {string} requestId - The friend request ID to accept
   */
  async acceptFriendRequest(requestId) {
    try {
      console.log("👥 Processing friend request acceptance...");

      const result = await dataManager.acceptFriendRequest(requestId);

      if (result.success) {
        notificationManager.showSuccessNotification("Friend request accepted!");
        
        // Refresh notifications to update UI
        await this.loadNotifications();
        this.render();
        
        console.log("✅ Friend request accepted successfully");
      } else {
        throw new Error(result.error || "Failed to accept friend request");
      }
    } catch (error) {
      console.error("❌ Error accepting friend request:", error);
      notificationManager.showErrorNotification("Failed to accept friend request");
    }
  }

  /**
   * Dismiss a notification
   * @param {string} notificationId - The notification ID to dismiss
   */
  async dismissNotification(notificationId) {
    try {
      console.log("🗑️ Dismissing notification:", notificationId);

      const result = await dataManager.dismissNotification(notificationId);

      if (result.success) {
        // Remove from local array immediately for responsive UI
        this.notifications = this.notifications.filter(n => n.id !== notificationId);
        this.render();
        
        console.log("✅ Notification dismissed successfully");
      } else {
        throw new Error(result.error || "Failed to dismiss notification");
      }
    } catch (error) {
      console.error("❌ Error dismissing notification:", error);
      notificationManager.showErrorNotification("Failed to dismiss notification");
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead() {
    try {
      console.log("📖 Marking all notifications as read...");

      const result = await dataManager.markAllNotificationsRead(currentUser.uid);

      if (result.success) {
        // Update local notifications
        this.notifications = this.notifications.map(n => ({ ...n, read: true }));
        this.render();
        
        notificationManager.showSuccessNotification("All notifications marked as read");
        console.log("✅ All notifications marked as read");
      } else {
        throw new Error(result.error || "Failed to mark notifications as read");
      }
    } catch (error) {
      console.error("❌ Error marking all notifications as read:", error);
      notificationManager.showErrorNotification("Failed to mark notifications as read");
    }
  }

  /**
   * Start location tracking for the current user
   */
  async startLocationTracking() {
    try {
      console.log("📍 Starting location tracking...");

      if (campusLocationService.locationPermissionGranted) {
        await campusLocationService.startLocationTracking();
        console.log("✅ Location tracking started");
      } else {
        console.log("📍 Location permission not granted, requesting...");
        await campusLocationService.requestLocationPermission();
        
        if (campusLocationService.locationPermissionGranted) {
          await campusLocationService.startLocationTracking();
          console.log("✅ Location tracking started after permission granted");
        }
      }
    } catch (error) {
      console.error("❌ Error starting location tracking:", error);
      notificationManager.showErrorNotification("Failed to start location tracking");
    }
  }

  /**
   * Format timestamp for display
   * @param {Object} timestamp - Firestore timestamp or Date object
   * @returns {string} Formatted time string
   */
  formatTime(timestamp) {
    try {
      let date;
      
      if (timestamp?.toDate) {
        // Firestore timestamp
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else {
        return 'Just now';
      }

      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch (error) {
      console.error("❌ Error formatting time:", error);
      return 'Recently';
    }
  }

  /**
   * Clean up resources when leaving the page
   */
  cleanup() {
    try {
      console.log("🧹 Cleaning up NotificationsPage...");
      
      this.isActive = false;
      
      // Unsubscribe from all real-time listeners
      this.unsubscribers.forEach(unsubscriber => {
        if (typeof unsubscriber === 'function') {
          unsubscriber();
        }
      });
      this.unsubscribers = [];
      
      console.log("✅ NotificationsPage cleanup complete");
    } catch (error) {
      console.error("❌ Error during NotificationsPage cleanup:", error);
    }
  }

  /**
   * Check if the page is currently active
   * @returns {boolean} True if page is active
   */
  isPageActive() {
    return this.isActive && this.isInitialized;
  }
}

// Export singleton instance
export const notificationsPage = new NotificationsPage();

// 🎯 Connect to SPA Router - listen for page load events
console.log("🔔 NotificationsPage: Registering spa:page:load event listener...");
document.addEventListener("spa:page:load", (event) => {
  console.log(
    `🔔 NotificationsPage: Received spa:page:load event for route: ${event.detail.route}`
  );
  if (event.detail.route === "notifications") {
    console.log("🔔 Notifications page loaded, initializing NotificationsPage...");
    notificationsPage.init();
  }
});

// Clean up when leaving the notifications page
document.addEventListener("spa:page:unload", (event) => {
  if (event.detail.route === "notifications") {
    console.log("🔔 Notifications page unloading, cleaning up...");
    notificationsPage.cleanup();
  }
});