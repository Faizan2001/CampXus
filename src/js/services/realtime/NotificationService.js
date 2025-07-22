/**
 * 🔔 Notification Manager for Real-Time Friend Updates
 * 
 * This module handles toast notifications for real-time events like:
 * - New friend requests
 * - Friend request acceptances
 * - Connection status changes
 * - General system notifications
 */

class NotificationManager {
  constructor() {
    this.notifications = [];
    this.maxNotifications = 5;
    this.notificationDuration = 5000; // 5 seconds
    this.container = null;
  }

  /**
   * 📢 Show a friend request notification
   * @param {Object} request - Friend request data
   */
  showFriendRequestNotification(request) {
    const notification = {
      id: `friend_request_${Date.now()}`,
      type: "friend_request",
      title: "New Friend Request",
      message: `${request.displayName} wants to be your friend`,
      data: request,
      timestamp: Date.now(),
      priority: "high"
    };

    this.showNotification(notification);
  }

  /**
   * 🎉 Show a friend accepted notification
   * @param {Object} friend - Friend data
   */
  showFriendAcceptedNotification(friend) {
    const notification = {
      id: `friend_accepted_${Date.now()}`,
      type: "friend_accepted",
      title: "Friend Request Accepted",
      message: `You and ${friend.displayName} are now friends!`,
      data: friend,
      timestamp: Date.now(),
      priority: "high"
    };

    this.showNotification(notification);
  }

  /**
   * 📡 Show connection status notification
   * @param {Object} status - Connection status data
   */
  showConnectionStatusNotification(status) {
    const notification = {
      id: `connection_${Date.now()}`,
      type: status.isConnected ? "connected" : "disconnected",
      title: status.isConnected ? "Connected" : "Disconnected",
      message: status.isConnected ? "Real-time updates active" : "Connection lost - trying to reconnect",
      data: status,
      timestamp: Date.now(),
      priority: "medium",
      duration: status.isConnected ? 2000 : 0 // Auto-hide connection success, keep disconnect visible
    };

    this.showNotification(notification);
  }

  /**
   * 📊 Show general system notification
   * @param {string} message - Message to display
   * @param {string} type - Notification type (success, error, warning, info)
   * @param {string} title - Optional title
   */
  showSystemNotification(message, type = "info", title = null) {
    const notification = {
      id: `system_${Date.now()}`,
      type: type,
      title: title || this.getDefaultTitle(type),
      message: message,
      timestamp: Date.now(),
      priority: this.getPriorityForType(type)
    };

    this.showNotification(notification);
  }

  /**
   * 🔔 Show notification in UI
   * @param {Object} notification - Notification data
   */
  showNotification(notification) {
    // Add to notifications array
    this.notifications.unshift(notification);

    // Keep only recent notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    // Create notification element
    this.createNotificationElement(notification);

    // Auto-remove after duration (unless duration is 0)
    const duration = notification.duration !== undefined ? notification.duration : this.notificationDuration;
    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, duration);
    }

    console.log(`🔔 Notification shown: ${notification.type} - ${notification.message}`);
  }

  /**
   * 🎨 Create notification DOM element
   * @param {Object} notification - Notification data
   */
  createNotificationElement(notification) {
    const container = this.getNotificationContainer();

    const notificationEl = document.createElement("div");
    notificationEl.className = `notification notification-${notification.type} notification-${notification.priority}`;
    notificationEl.id = notification.id;

    // Add click handler class if it's an interactive notification
    if (notification.type === "friend_request") {
      notificationEl.classList.add("notification-clickable");
    }

    notificationEl.innerHTML = `
      <div class="notification-content">
        <div class="notification-icon">
          ${this.getNotificationIcon(notification.type)}
        </div>
        <div class="notification-text">
          <div class="notification-title">${notification.title}</div>
          <div class="notification-message">${notification.message}</div>
          <div class="notification-timestamp">${this.formatTimestamp(notification.timestamp)}</div>
        </div>
        <button class="notification-close" title="Close notification">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    // Add event listeners
    this.addNotificationEventListeners(notificationEl, notification);

    // Add to container
    container.appendChild(notificationEl);

    // Animate in
    requestAnimationFrame(() => {
      notificationEl.classList.add("notification-show");
    });
  }

  /**
   * 🎯 Add event listeners to notification element
   * @param {HTMLElement} element - Notification element
   * @param {Object} notification - Notification data
   */
  addNotificationEventListeners(element, notification) {
    // Close button handler
    const closeButton = element.querySelector(".notification-close");
    if (closeButton) {
      closeButton.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeNotification(notification.id);
      });
    }

    // Click handler for interactive notifications
    if (notification.type === "friend_request") {
      element.addEventListener("click", () => {
        this.handleFriendRequestClick(notification.data);
      });
    }

    // Hover handlers to pause/resume auto-dismiss
    element.addEventListener("mouseenter", () => {
      element.classList.add("notification-paused");
    });

    element.addEventListener("mouseleave", () => {
      element.classList.remove("notification-paused");
    });
  }

  /**
   * 🗑️ Remove notification
   * @param {string} notificationId - ID of notification to remove
   */
  removeNotification(notificationId) {
    const element = document.getElementById(notificationId);
    if (element) {
      element.classList.remove("notification-show");
      element.classList.add("notification-hide");

      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }, 300);
    }

    // Remove from array
    this.notifications = this.notifications.filter(
      (n) => n.id !== notificationId
    );
  }

  /**
   * 📦 Get or create notification container
   * @returns {HTMLElement} Notification container
   */
  getNotificationContainer() {
    if (!this.container) {
      this.container = document.getElementById("notification-container");

      if (!this.container) {
        this.container = document.createElement("div");
        this.container.id = "notification-container";
        this.container.className = "notification-container";
        document.body.appendChild(this.container);
      }
    }

    return this.container;
  }

  /**
   * 🎨 Get icon for notification type
   * @param {string} type - Notification type
   * @returns {string} Icon HTML
   */
  getNotificationIcon(type) {
    const icons = {
      friend_request: "👋",
      friend_accepted: "🎉",
      friend_rejected: "😔",
      connected: "📡",
      disconnected: "⚠️",
      success: "✅",
      error: "❌",
      warning: "⚠️",
      info: "ℹ️",
      default: "🔔",
    };

    return icons[type] || icons.default;
  }

  /**
   * 📅 Format timestamp for display
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {string} Formatted time string
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return "Just now";
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * 🏷️ Get default title for notification type
   * @param {string} type - Notification type
   * @returns {string} Default title
   */
  getDefaultTitle(type) {
    const titles = {
      success: "Success",
      error: "Error",
      warning: "Warning",
      info: "Information",
      connected: "Connected",
      disconnected: "Disconnected"
    };

    return titles[type] || "Notification";
  }

  /**
   * 📊 Get priority for notification type
   * @param {string} type - Notification type
   * @returns {string} Priority level
   */
  getPriorityForType(type) {
    const priorities = {
      error: "high",
      warning: "medium",
      success: "low",
      info: "low",
      connected: "low",
      disconnected: "medium"
    };

    return priorities[type] || "medium";
  }

  /**
   * 👆 Handle friend request notification click
   * @param {Object} requestData - Friend request data
   */
  handleFriendRequestClick(requestData) {
    console.log("Friend request notification clicked:", requestData);

    // For now, just show a system notification
    // In a full implementation, this would navigate to the friends page
    this.showSystemNotification(
      `Click to view friend request from ${requestData.displayName}`,
      "info",
      "Friend Request"
    );

    // TODO: Navigate to friends page
    // if (window.navigateTo) {
    //   window.navigateTo('friends');
    // }
  }

  /**
   * 🔍 Get notification by ID
   * @param {string} notificationId - Notification ID
   * @returns {Object|null} Notification object or null
   */
  getNotification(notificationId) {
    return this.notifications.find(n => n.id === notificationId) || null;
  }

  /**
   * 📊 Get all notifications
   * @returns {Array} Array of notification objects
   */
  getAllNotifications() {
    return [...this.notifications];
  }

  /**
   * 🔢 Get notification count by type
   * @param {string} type - Notification type
   * @returns {number} Count of notifications
   */
  getNotificationCount(type = null) {
    if (type) {
      return this.notifications.filter(n => n.type === type).length;
    }
    return this.notifications.length;
  }

  /**
   * 🧹 Clear all notifications
   */
  clearAll() {
    this.notifications.forEach((notification) => {
      this.removeNotification(notification.id);
    });
    this.notifications = [];
    console.log("🧹 All notifications cleared");
  }

  /**
   * 🧹 Clear notifications by type
   * @param {string} type - Notification type to clear
   */
  clearByType(type) {
    const toRemove = this.notifications.filter(n => n.type === type);
    toRemove.forEach(notification => {
      this.removeNotification(notification.id);
    });
    console.log(`🧹 Cleared ${toRemove.length} notifications of type: ${type}`);
  }

  /**
   * 📊 Get notification system status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      totalNotifications: this.notifications.length,
      maxNotifications: this.maxNotifications,
      defaultDuration: this.notificationDuration,
      hasContainer: !!this.container,
      types: [...new Set(this.notifications.map(n => n.type))],
      priorities: [...new Set(this.notifications.map(n => n.priority))]
    };
  }
}

// Export singleton instance
export const notificationManager = new NotificationManager();

// Add to global scope for debugging
if (typeof window !== "undefined") {
  window.notificationManager = notificationManager;
}