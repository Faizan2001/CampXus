# 🔔 Friends Phase 3A: Real-Time Notifications & Updates

> **Building Live Features - Real-Time Listeners, Notification System, and Live Status Updates**

---

## 📋 **Phase Overview**

This phase implements the real-time features that make the friends system feel alive: instant notifications, live status updates, and real-time synchronization across devices.

### **📅 Timeline**: 1-2 days

### **🎯 Learning Goals**: Firestore real-time listeners, notification API, event-driven architecture

### **✅ Prerequisites**: Phase 2C (Styling) completed

---

## 🏗️ **Real-Time Architecture**

### **Core Components**

```
NotificationManager       # Central notification system
  ├── RealTimeListener    # Firestore real-time listeners
  ├── NotificationUI      # Toast notifications & alerts
  └── StatusUpdater       # Friend status synchronization

EventBus                  # Central event coordination
  ├── FriendEvents        # Friend-related events
  ├── StatusEvents        # Status change events
  └── NotificationEvents  # Notification events
```

### **Real-Time Features**

- **⚡ Instant Updates**: Friend requests, acceptances, status changes
- **🔔 Toast Notifications**: Non-intrusive user feedback
- **📊 Live Status**: Online/offline/away indicators
- **🔄 Cross-Tab Sync**: Updates across multiple browser tabs
- **📱 Background Updates**: Updates when app is not visible

---

## 🎯 **Step 1: Create Notification Manager**

### **New File: `js/core/friends/notifications-manager.js`**

**🎓 Teaching Moment**: The notification manager coordinates between Firestore real-time listeners and UI updates. It uses an event-driven pattern to decouple components and make the system more maintainable.

```javascript
/**
 * 🔔 Friends Notification Manager
 * Handles real-time updates, notifications, and cross-tab synchronization
 *
 * @author CampXus Development Team
 * @created Phase 3A - Real-Time Notifications
 */

import { friendsManager } from "./friends-manager.js";
import { dataManager } from "../data-manager.js";

class NotificationsManager {
  constructor() {
    // 🎯 Notification system state
    this.state = {
      isListening: false,
      activeListeners: new Map(),
      notificationQueue: [],
      lastSeen: new Map(),
      crossTabSupported: typeof BroadcastChannel !== "undefined",
    };

    // 🎛️ Configuration
    this.config = {
      notificationDuration: 5000,
      maxNotifications: 5,
      statusUpdateInterval: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 1000,
    };

    // 📡 Event bus for cross-component communication
    this.eventBus = new EventTarget();

    // 📺 Cross-tab communication
    if (this.state.crossTabSupported) {
      this.broadcastChannel = new BroadcastChannel("campxus-friends");
      this.setupCrossTabSync();
    }

    // 🎯 Initialize
    this.init();
  }

  /**
   * 🚀 Initialize the notification system
   */
  async init() {
    try {
      console.log("🔔 Initializing Notifications Manager...");

      // Set up event listeners
      this.setupEventListeners();

      // Initialize notification permissions
      await this.initializeNotificationPermissions();

      // Set up real-time listeners
      await this.setupRealTimeListeners();

      // Start status monitoring
      this.startStatusMonitoring();

      console.log("✅ Notifications Manager initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Notifications Manager:", error);
    }
  }

  /**
   * 🎧 Set up event listeners
   */
  setupEventListeners() {
    // Listen for friend-related events
    this.addEventListener(
      "friend-request-received",
      this.handleFriendRequestReceived.bind(this)
    );
    this.addEventListener(
      "friend-request-accepted",
      this.handleFriendRequestAccepted.bind(this)
    );
    this.addEventListener(
      "friend-status-changed",
      this.handleFriendStatusChanged.bind(this)
    );
    this.addEventListener(
      "friend-request-declined",
      this.handleFriendRequestDeclined.bind(this)
    );

    // Page visibility changes
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );

    // Window focus/blur
    window.addEventListener("focus", this.handleWindowFocus.bind(this));
    window.addEventListener("blur", this.handleWindowBlur.bind(this));

    // Before unload (cleanup)
    window.addEventListener("beforeunload", this.cleanup.bind(this));
  }

  /**
   * 📡 Set up cross-tab synchronization
   */
  setupCrossTabSync() {
    this.broadcastChannel.addEventListener("message", (event) => {
      const { type, data } = event.data;

      switch (type) {
        case "notification":
          this.showNotification(data, false); // Don't broadcast back
          break;
        case "status-update":
          this.updateFriendStatus(data.uid, data.status, false);
          break;
        case "friend-update":
          this.handleCrossTabFriendUpdate(data);
          break;
      }
    });
  }

  /**
   * 🔔 Initialize browser notification permissions
   */
  async initializeNotificationPermissions() {
    if (!("Notification" in window)) {
      console.log("📱 Browser notifications not supported");
      return;
    }

    if (Notification.permission === "default") {
      try {
        const permission = await Notification.requestPermission();
        console.log(`🔔 Notification permission: ${permission}`);
      } catch (error) {
        console.log("❌ Failed to request notification permission:", error);
      }
    }
  }

  /**
   * 👂 Set up Firestore real-time listeners
   */
  async setupRealTimeListeners() {
    try {
      const currentUser = dataManager.getCurrentUser();
      if (!currentUser) {
        console.log("⚠️ No user logged in, skipping real-time listeners");
        return;
      }

      console.log("👂 Setting up real-time listeners...");

      // Listen for friend requests received
      this.setupFriendRequestsListener(currentUser.uid);

      // Listen for friend status changes
      this.setupFriendsStatusListener(currentUser.uid);

      // Listen for sent request updates
      this.setupSentRequestsListener(currentUser.uid);

      this.state.isListening = true;
      console.log("✅ Real-time listeners active");
    } catch (error) {
      console.error("❌ Failed to setup real-time listeners:", error);
      // Retry after delay
      setTimeout(() => this.setupRealTimeListeners(), this.config.retryDelay);
    }
  }

  /**
   * 📥 Set up listener for incoming friend requests
   */
  setupFriendRequestsListener(userId) {
    const unsubscribe = dataManager.listenToFriendRequests(
      userId,
      "received",
      (requests) => this.handleReceivedRequestsUpdate(requests)
    );

    this.state.activeListeners.set("friend-requests-received", unsubscribe);
  }

  /**
   * 📤 Set up listener for sent request updates
   */
  setupSentRequestsListener(userId) {
    const unsubscribe = dataManager.listenToFriendRequests(
      userId,
      "sent",
      (requests) => this.handleSentRequestsUpdate(requests)
    );

    this.state.activeListeners.set("friend-requests-sent", unsubscribe);
  }

  /**
   * 👥 Set up listener for friends status changes
   */
  setupFriendsStatusListener(userId) {
    const unsubscribe = dataManager.listenToFriendsStatus(userId, (friends) =>
      this.handleFriendsStatusUpdate(friends)
    );

    this.state.activeListeners.set("friends-status", unsubscribe);
  }

  /**
   * 📥 Handle received friend requests updates
   */
  handleReceivedRequestsUpdate(requests) {
    requests.forEach((request) => {
      const lastSeen = this.state.lastSeen.get(`request-${request.uid}`);
      const requestTime =
        request.timestamp?.toDate?.() || new Date(request.timestamp);

      // Only notify for new requests
      if (!lastSeen || requestTime > lastSeen) {
        this.dispatchEvent("friend-request-received", request);
        this.state.lastSeen.set(`request-${request.uid}`, requestTime);
      }
    });
  }

  /**
   * 📤 Handle sent requests updates
   */
  handleSentRequestsUpdate(requests) {
    // Check for accepted/declined requests
    const currentSentRequests = new Set(requests.map((r) => r.uid));

    // Compare with previous state to detect changes
    const previousRequests = this.state.lastSentRequests || new Set();

    // Find requests that were removed (likely accepted or declined)
    for (const uid of previousRequests) {
      if (!currentSentRequests.has(uid)) {
        // Request was removed - need to check if it became a friendship
        this.checkRequestOutcome(uid);
      }
    }

    this.state.lastSentRequests = currentSentRequests;
  }

  /**
   * 👥 Handle friends status updates
   */
  handleFriendsStatusUpdate(friends) {
    friends.forEach((friend) => {
      const lastStatus = this.state.lastSeen.get(`status-${friend.uid}`);

      if (lastStatus && lastStatus !== friend.status) {
        this.dispatchEvent("friend-status-changed", {
          uid: friend.uid,
          name: friend.displayName,
          oldStatus: lastStatus,
          newStatus: friend.status,
        });
      }

      this.state.lastSeen.set(`status-${friend.uid}`, friend.status);
    });
  }

  /**
   * 🔍 Check the outcome of a sent request
   */
  async checkRequestOutcome(uid) {
    try {
      // Check if they're now a friend
      const friends = await friendsManager.getFriends();
      const isFriend = friends.some((friend) => friend.uid === uid);

      if (isFriend) {
        // Request was accepted
        const friend = friends.find((f) => f.uid === uid);
        this.dispatchEvent("friend-request-accepted", friend);
      } else {
        // Request was likely declined
        this.dispatchEvent("friend-request-declined", { uid });
      }
    } catch (error) {
      console.error("❌ Failed to check request outcome:", error);
    }
  }

  /**
   * 📥 Handle friend request received event
   */
  handleFriendRequestReceived(event) {
    const request = event.detail;

    console.log("📥 Friend request received:", request.displayName);

    // Show notification
    this.showNotification({
      type: "friend-request",
      title: "New Friend Request",
      message: `${request.displayName} wants to be your friend`,
      icon: "👥",
      actions: [
        { label: "Accept", action: "accept-request", data: request.uid },
        { label: "View", action: "view-requests", data: null },
      ],
    });

    // Update UI
    this.broadcastToTabs("friend-update", {
      type: "request-received",
      data: request,
    });

    // Show browser notification if page not visible
    if (document.hidden) {
      this.showBrowserNotification(
        "New Friend Request",
        `${request.displayName} wants to be your friend`,
        request.avatar
      );
    }
  }

  /**
   * ✅ Handle friend request accepted event
   */
  handleFriendRequestAccepted(event) {
    const friend = event.detail;

    console.log("✅ Friend request accepted:", friend.displayName);

    this.showNotification({
      type: "friend-accepted",
      title: "Friend Request Accepted",
      message: `${friend.displayName} accepted your friend request`,
      icon: "🎉",
      actions: [
        { label: "Message", action: "message-friend", data: friend.uid },
        { label: "View Profile", action: "view-profile", data: friend.uid },
      ],
    });

    this.broadcastToTabs("friend-update", {
      type: "request-accepted",
      data: friend,
    });
  }

  /**
   * 🔄 Handle friend status changed event
   */
  handleFriendStatusChanged(event) {
    const { uid, name, oldStatus, newStatus } = event.detail;

    console.log(`🔄 ${name} status: ${oldStatus} → ${newStatus}`);

    // Only show notifications for meaningful status changes
    if (oldStatus === "offline" && newStatus === "online") {
      this.showNotification({
        type: "status-change",
        title: "Friend Online",
        message: `${name} is now online`,
        icon: "🟢",
        duration: 3000,
      });
    }

    this.broadcastToTabs("status-update", { uid, status: newStatus });
  }

  /**
   * ❌ Handle friend request declined event
   */
  handleFriendRequestDeclined(event) {
    const { uid } = event.detail;

    console.log("❌ Friend request was declined:", uid);

    // Subtle notification - don't make user feel bad
    this.showNotification({
      type: "info",
      title: "Request Update",
      message: "A friend request was not accepted",
      icon: "ℹ️",
      duration: 3000,
    });
  }

  /**
   * 🔔 Show in-app notification
   */
  showNotification(notification, shouldBroadcast = true) {
    // Add to queue
    this.state.notificationQueue.push({
      id: Date.now() + Math.random(),
      ...notification,
      timestamp: new Date(),
    });

    // Limit queue size
    if (this.state.notificationQueue.length > this.config.maxNotifications) {
      this.state.notificationQueue.shift();
    }

    // Display notification
    this.displayNotification(notification);

    // Broadcast to other tabs
    if (shouldBroadcast) {
      this.broadcastToTabs("notification", notification);
    }
  }

  /**
   * 📺 Display notification in UI
   */
  displayNotification(notification) {
    const container = this.getNotificationContainer();
    const element = this.createNotificationElement(notification);

    container.appendChild(element);

    // Animate in
    requestAnimationFrame(() => {
      element.classList.add("show");
    });

    // Auto-hide after duration
    const duration = notification.duration || this.config.notificationDuration;
    setTimeout(() => {
      this.hideNotification(element);
    }, duration);
  }

  /**
   * 📦 Get or create notification container
   */
  getNotificationContainer() {
    let container = document.getElementById("notification-container");

    if (!container) {
      container = document.createElement("div");
      container.id = "notification-container";
      container.className = "notification-container";
      document.body.appendChild(container);

      // Add styles
      this.addNotificationStyles();
    }

    return container;
  }

  /**
   * 🎨 Create notification element
   */
  createNotificationElement(notification) {
    const element = document.createElement("div");
    element.className = `notification notification-${notification.type}`;

    element.innerHTML = `
      <div class="notification-content">
        <div class="notification-icon">${notification.icon}</div>
        <div class="notification-text">
          <div class="notification-title">${notification.title}</div>
          <div class="notification-message">${notification.message}</div>
        </div>
        <button class="notification-close" aria-label="Close notification">×</button>
      </div>
      ${
        notification.actions
          ? this.createNotificationActions(notification.actions)
          : ""
      }
    `;

    // Add event listeners
    const closeBtn = element.querySelector(".notification-close");
    closeBtn.addEventListener("click", () => this.hideNotification(element));

    // Add action listeners
    notification.actions?.forEach((action, index) => {
      const btn = element.querySelector(`[data-action-index="${index}"]`);
      if (btn) {
        btn.addEventListener("click", () => {
          this.handleNotificationAction(action);
          this.hideNotification(element);
        });
      }
    });

    return element;
  }

  /**
   * 🎯 Create notification action buttons
   */
  createNotificationActions(actions) {
    const actionsHtml = actions
      .map(
        (action, index) => `
      <button class="notification-action" data-action-index="${index}">
        ${action.label}
      </button>
    `
      )
      .join("");

    return `<div class="notification-actions">${actionsHtml}</div>`;
  }

  /**
   * 🎯 Handle notification action
   */
  handleNotificationAction(action) {
    console.log("🎯 Notification action:", action.action, action.data);

    // Dispatch custom event for the action
    this.dispatchEvent("notification-action", {
      action: action.action,
      data: action.data,
    });
  }

  /**
   * 👋 Hide notification
   */
  hideNotification(element) {
    element.classList.add("hide");
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, 300);
  }

  /**
   * 🔔 Show browser notification
   */
  showBrowserNotification(title, body, icon) {
    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification(title, {
        body,
        icon: icon || "/images/notification-icon.png",
        badge: "/images/badge-icon.png",
        tag: "campxus-friends",
        renotify: true,
      });

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      // Handle click
      notification.addEventListener("click", () => {
        window.focus();
        notification.close();
      });
    }
  }

  /**
   * 📡 Broadcast message to other tabs
   */
  broadcastToTabs(type, data) {
    if (this.state.crossTabSupported) {
      this.broadcastChannel.postMessage({ type, data });
    }
  }

  /**
   * 📊 Start status monitoring
   */
  startStatusMonitoring() {
    // Update own status periodically
    this.statusInterval = setInterval(() => {
      this.updateOwnStatus();
    }, this.config.statusUpdateInterval);

    // Set initial status
    this.updateOwnStatus();
  }

  /**
   * 🔄 Update own status
   */
  async updateOwnStatus() {
    try {
      const status = document.hidden ? "away" : "online";
      await dataManager.updateUserStatus(status);
    } catch (error) {
      console.error("❌ Failed to update status:", error);
    }
  }

  /**
   * 👁️ Handle page visibility change
   */
  handleVisibilityChange() {
    if (document.hidden) {
      this.updateOwnStatus(); // Set to away
    } else {
      this.updateOwnStatus(); // Set to online
      this.markNotificationsAsRead();
    }
  }

  /**
   * 🎯 Handle window focus
   */
  handleWindowFocus() {
    this.updateOwnStatus();
    this.markNotificationsAsRead();
  }

  /**
   * 🌫️ Handle window blur
   */
  handleWindowBlur() {
    // Will be handled by visibility change
  }

  /**
   * ✅ Mark notifications as read
   */
  markNotificationsAsRead() {
    // Clear browser notifications
    if ("Notification" in window) {
      // Note: Can't programmatically close browser notifications in most browsers
    }

    // Update last seen timestamps
    const now = new Date();
    this.state.lastSeen.set("last-activity", now);
  }

  /**
   * 🎧 Add event listener
   */
  addEventListener(type, handler) {
    this.eventBus.addEventListener(type, handler);
  }

  /**
   * 📢 Dispatch event
   */
  dispatchEvent(type, detail) {
    const event = new CustomEvent(type, { detail });
    this.eventBus.dispatchEvent(event);
  }

  /**
   * 🔄 Update friend status in UI
   */
  updateFriendStatus(uid, status, shouldBroadcast = true) {
    // Update in UI
    const statusIndicators = document.querySelectorAll(
      `[data-uid="${uid}"] .status-indicator`
    );
    statusIndicators.forEach((indicator) => {
      indicator.className = `status-indicator ${status}`;
    });

    if (shouldBroadcast) {
      this.broadcastToTabs("status-update", { uid, status });
    }
  }

  /**
   * 📡 Handle cross-tab friend update
   */
  handleCrossTabFriendUpdate(data) {
    // Refresh UI based on update type
    switch (data.type) {
      case "request-received":
        // Refresh pending requests
        if (typeof window.friendsUI?.loadPendingRequests === "function") {
          window.friendsUI.loadPendingRequests();
        }
        break;
      case "request-accepted":
        // Refresh friends list
        if (typeof window.friendsUI?.loadFriendsList === "function") {
          window.friendsUI.loadFriendsList();
        }
        break;
    }
  }

  /**
   * 🎨 Add notification styles
   */
  addNotificationStyles() {
    if (document.getElementById("notification-styles")) return;

    const style = document.createElement("style");
    style.id = "notification-styles";
    style.textContent = `
      .notification-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        max-width: 400px;
        pointer-events: none;
      }
      
      .notification {
        background: var(--friends-surface);
        border-radius: var(--friends-radius-lg);
        box-shadow: var(--friends-shadow-xl);
        border: 1px solid var(--friends-border-light);
        margin-bottom: var(--friends-space-3);
        overflow: hidden;
        transform: translateX(400px);
        transition: all var(--friends-transition-base);
        pointer-events: auto;
      }
      
      .notification.show {
        transform: translateX(0);
      }
      
      .notification.hide {
        transform: translateX(400px);
        opacity: 0;
      }
      
      .notification-content {
        display: flex;
        align-items: flex-start;
        gap: var(--friends-space-3);
        padding: var(--friends-space-4);
      }
      
      .notification-icon {
        font-size: var(--friends-text-xl);
        flex-shrink: 0;
      }
      
      .notification-text {
        flex: 1;
        min-width: 0;
      }
      
      .notification-title {
        font-weight: 600;
        color: var(--friends-text-primary);
        margin-bottom: var(--friends-space-1);
      }
      
      .notification-message {
        font-size: var(--friends-text-sm);
        color: var(--friends-text-secondary);
        line-height: 1.4;
      }
      
      .notification-close {
        background: none;
        border: none;
        font-size: var(--friends-text-lg);
        color: var(--friends-text-tertiary);
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        flex-shrink: 0;
      }
      
      .notification-close:hover {
        color: var(--friends-text-primary);
      }
      
      .notification-actions {
        display: flex;
        gap: var(--friends-space-2);
        padding: 0 var(--friends-space-4) var(--friends-space-4);
      }
      
      .notification-action {
        padding: var(--friends-space-2) var(--friends-space-3);
        border: 1px solid var(--friends-border-medium);
        background: var(--friends-surface);
        color: var(--friends-text-primary);
        border-radius: var(--friends-radius-md);
        cursor: pointer;
        font-size: var(--friends-text-sm);
        transition: all var(--friends-transition-fast);
      }
      
      .notification-action:hover {
        background: var(--friends-primary-500);
        color: white;
        border-color: var(--friends-primary-500);
      }
      
      .notification-friend-request {
        border-left: 4px solid var(--friends-primary-500);
      }
      
      .notification-friend-accepted {
        border-left: 4px solid var(--friends-success);
      }
      
      .notification-status-change {
        border-left: 4px solid var(--friends-info);
      }
      
      @media (max-width: 480px) {
        .notification-container {
          left: 10px;
          right: 10px;
          top: 10px;
          max-width: none;
        }
        
        .notification {
          transform: translateY(-100px);
        }
        
        .notification.show {
          transform: translateY(0);
        }
        
        .notification.hide {
          transform: translateY(-100px);
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * 🧹 Cleanup when page unloads
   */
  cleanup() {
    // Unsubscribe from all listeners
    this.state.activeListeners.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });

    // Clear intervals
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }

    // Close broadcast channel
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    // Set status to offline
    this.updateOwnStatus();

    console.log("🧹 Notifications Manager cleaned up");
  }
}

// 🚀 Create and export the manager instance
export const notificationsManager = new NotificationsManager();

// 🎯 Make it available globally for debugging
if (typeof window !== "undefined") {
  window.notificationsManager = notificationsManager;
}
```

---

## 🔄 **Step 2: Enhance Data Manager with Real-Time Listeners**

### **Update: `js/core/data-manager.js` - Add Real-Time Methods**

**🎓 Teaching Moment**: Firestore real-time listeners automatically update your app when data changes. We'll add methods to listen for specific changes and properly clean up listeners to prevent memory leaks.

```javascript
// Add these methods to the existing DataManager class

/**
 * 👂 Listen to friend requests real-time updates
 */
listenToFriendRequests(userId, type = 'received', callback) {
  const db = this.getFirestore();

  let query;
  if (type === 'received') {
    query = db.collection('friend_requests')
      .where('to', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('timestamp', 'desc');
  } else {
    query = db.collection('friend_requests')
      .where('from', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('timestamp', 'desc');
  }

  console.log(`👂 Setting up ${type} friend requests listener for user: ${userId}`);

  const unsubscribe = query.onSnapshot((snapshot) => {
    const requests = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      requests.push({
        id: doc.id,
        uid: type === 'received' ? data.from : data.to,
        displayName: data.fromDisplayName || data.toDisplayName,
        avatar: data.fromAvatar || data.toAvatar,
        university: data.fromUniversity || data.toUniversity,
        major: data.fromMajor || data.toMajor,
        year: data.fromYear || data.toYear,
        timestamp: data.timestamp,
        type: type
      });
    });

    console.log(`📥 ${type} requests update: ${requests.length} requests`);
    callback(requests);

  }, (error) => {
    console.error(`❌ Error listening to ${type} friend requests:`, error);
  });

  return unsubscribe;
}

/**
 * 👥 Listen to friends status updates
 */
listenToFriendsStatus(userId, callback) {
  const db = this.getFirestore();

  const query = db.collection('friendships')
    .where('users', 'array-contains', userId);

  console.log(`👂 Setting up friends status listener for user: ${userId}`);

  const unsubscribe = query.onSnapshot(async (snapshot) => {
    const friendUIDs = [];

    // Extract friend UIDs from friendships
    snapshot.forEach(doc => {
      const data = doc.data();
      const friendUID = data.users.find(uid => uid !== userId);
      if (friendUID) {
        friendUIDs.push(friendUID);
      }
    });

    if (friendUIDs.length === 0) {
      callback([]);
      return;
    }

    // Get current status for each friend
    try {
      const friends = await this.getUsersStatus(friendUIDs);
      console.log(`👥 Friends status update: ${friends.length} friends`);
      callback(friends);
    } catch (error) {
      console.error('❌ Error fetching friends status:', error);
    }

  }, (error) => {
    console.error('❌ Error listening to friends status:', error);
  });

  return unsubscribe;
}

/**
 * 📊 Get status for multiple users
 */
async getUsersStatus(userIds) {
  if (userIds.length === 0) return [];

  const db = this.getFirestore();
  const users = [];

  // Firestore 'in' queries are limited to 10 items
  const chunks = this.chunkArray(userIds, 10);

  for (const chunk of chunks) {
    const query = db.collection('users')
      .where('uid', 'in', chunk);

    const snapshot = await query.get();

    snapshot.forEach(doc => {
      const data = doc.data();
      users.push({
        uid: data.uid,
        displayName: data.displayName,
        avatar: data.avatar,
        status: data.status || 'offline',
        lastSeen: data.lastSeen,
        university: data.university,
        major: data.major,
        year: data.year
      });
    });
  }

  return users;
}

/**
 * 🔄 Update user status
 */
async updateUserStatus(status) {
  const currentUser = this.getCurrentUser();
  if (!currentUser) throw new Error('No user logged in');

  const db = this.getFirestore();
  const userRef = db.collection('users').doc(currentUser.uid);

  await userRef.update({
    status: status,
    lastSeen: new Date()
  });

  console.log(`🔄 Status updated to: ${status}`);
}

/**
 * 📡 Listen to user's own data changes
 */
listenToUserData(userId, callback) {
  const db = this.getFirestore();
  const userRef = db.collection('users').doc(userId);

  console.log(`👂 Setting up user data listener for: ${userId}`);

  const unsubscribe = userRef.onSnapshot((doc) => {
    if (doc.exists) {
      const userData = doc.data();
      console.log('📡 User data updated:', userData.displayName);
      callback(userData);
    }
  }, (error) => {
    console.error('❌ Error listening to user data:', error);
  });

  return unsubscribe;
}

/**
 * 🗂️ Helper method to chunk arrays
 */
chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

---

## 🔗 **Step 3: Integrate Notifications with Friends UI**

### **Update: `js/core/friends/friends-ui.js` - Add Notification Integration**

**🎓 Teaching Moment**: We'll connect the notification system to the UI controller so that real-time updates automatically refresh the interface and show appropriate feedback to users.

```javascript
// Add to the existing FriendsUIController class imports
import { notificationsManager } from './notifications-manager.js';

// Add these methods to the existing FriendsUIController class

/**
 * 🔔 Initialize notification integration
 */
initializeNotifications() {
  // Listen for notification actions
  notificationsManager.addEventListener('notification-action', (event) => {
    this.handleNotificationAction(event.detail);
  });

  // Listen for friend updates
  notificationsManager.addEventListener('friend-request-received', () => {
    this.refreshPendingRequests();
    this.refreshStats();
  });

  notificationsManager.addEventListener('friend-request-accepted', () => {
    this.refreshFriendsList();
    this.refreshPendingRequests();
    this.refreshStats();
  });

  notificationsManager.addEventListener('friend-status-changed', (event) => {
    this.updateFriendStatusInUI(event.detail);
  });

  console.log('🔔 Notification integration initialized');
}

/**
 * 🎯 Handle notification actions
 */
async handleNotificationAction(detail) {
  const { action, data } = detail;

  try {
    switch (action) {
      case 'accept-request':
        await this.handleAcceptRequest(data);
        this.showSuccess('Friend request accepted!');
        break;

      case 'view-requests':
        this.handleTabChange('pending');
        break;

      case 'message-friend':
        this.handleMessage(data);
        break;

      case 'view-profile':
        this.viewUserProfile(data);
        break;

      default:
        console.log(`🤷 Unknown notification action: ${action}`);
    }
  } catch (error) {
    console.error(`❌ Notification action failed: ${action}`, error);
    this.showError('Action failed. Please try again.');
  }
}

/**
 * 🔄 Refresh pending requests
 */
async refreshPendingRequests() {
  if (this.elements.activeTab === 'pending') {
    await this.loadPendingRequests();
  }
}

/**
 * 🔄 Refresh friends list
 */
async refreshFriendsList() {
  if (this.elements.activeTab === 'friends') {
    await this.loadFriendsList();
  }
}

/**
 * 🔄 Update friend status in UI
 */
updateFriendStatusInUI(statusUpdate) {
  const { uid, newStatus } = statusUpdate;

  // Update status indicators
  const statusIndicators = document.querySelectorAll(`[data-uid="${uid}"] .status-indicator`);
  statusIndicators.forEach(indicator => {
    indicator.className = `status-indicator ${newStatus}`;
  });

  // Update any status text
  const statusTexts = document.querySelectorAll(`[data-uid="${uid}"] .friend-status`);
  statusTexts.forEach(text => {
    text.textContent = this.formatStatus(newStatus);
  });
}

/**
 * 📄 Format status for display
 */
formatStatus(status) {
  switch (status) {
    case 'online': return 'Online';
    case 'away': return 'Away';
    case 'offline': return 'Offline';
    default: return 'Unknown';
  }
}

/**
 * 👤 View user profile (placeholder)
 */
viewUserProfile(uid) {
  console.log(`👤 Viewing profile for user: ${uid}`);
  // TODO: Implement profile view in future phase
  this.showSuccess('Profile view coming soon!');
}

// Update the init method to include notifications
async init() {
  try {
    console.log('🎨 Initializing Friends UI Controller...');

    // Initialize theme system
    this.initializeTheme();

    // Initialize mobile optimizations
    this.initializeMobileOptimizations();

    // Initialize notifications
    this.initializeNotifications();

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupUI());
    } else {
      this.setupUI();
    }

  } catch (error) {
    console.error('❌ Failed to initialize Friends UI:', error);
    this.showError('Failed to load friends page');
  }
}

// Enhanced error handling with notification support
showError(message) {
  // Use notification system if available
  if (notificationsManager) {
    notificationsManager.showNotification({
      type: 'error',
      title: 'Error',
      message: message,
      icon: '❌',
      duration: 5000
    });
  } else {
    // Fallback to modal system
    if (typeof showToast === 'function') {
      showToast(message, 'error');
    } else {
      console.error('Error:', message);
      alert(message);
    }
  }
}

// Enhanced success handling with notification support
showSuccess(message) {
  // Use notification system if available
  if (notificationsManager) {
    notificationsManager.showNotification({
      type: 'success',
      title: 'Success',
      message: message,
      icon: '✅',
      duration: 3000
    });
  } else {
    // Fallback to modal system
    if (typeof showToast === 'function') {
      showToast(message, 'success');
    } else {
      console.log('Success:', message);
    }
  }
}
```

---

## ✅ **Phase 3A Checklist**

### **Completed Tasks**

- [x] 🔔 Created comprehensive notification management system
- [x] 👂 Implemented Firestore real-time listeners for friend data
- [x] 📡 Added cross-tab synchronization with BroadcastChannel
- [x] 🔔 Integrated browser notifications with permission handling
- [x] 📊 Added real-time status monitoring and updates
- [x] 🎯 Created notification action handling system
- [x] 🎨 Built responsive notification UI components
- [x] 📱 Added mobile-optimized notification display

### **Next Phase**: [Phase 3B - Event Handling & Polish](./Friends-Phase-3B-Events.md)

---

## 🎓 **Learning Summary**

In this phase, you learned:

1. **🔔 Real-Time Systems**: Building responsive apps with Firestore listeners
2. **📡 Event-Driven Architecture**: Decoupling components with custom events
3. **📱 Cross-Tab Communication**: Synchronizing state across browser tabs
4. **🔔 Browser Notifications**: Engaging users with native notifications
5. **📊 Status Management**: Tracking and displaying real-time user status
6. **⚡ Performance**: Efficient listener management and cleanup
7. **🎯 User Experience**: Providing instant feedback and smooth interactions

**🎯 Key Takeaway**: Real-time features transform a static application into a dynamic, engaging experience. The notification system acts as the nervous system of your app, keeping users informed and connected. Proper event management and cleanup ensure your real-time features enhance rather than degrade performance.

The notification manager creates a seamless bridge between backend data changes and frontend updates, making the friends system feel alive and responsive to user interactions.
