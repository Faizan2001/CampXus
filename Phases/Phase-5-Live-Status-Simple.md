# Phase 5: Live Status & Basic Notifications

## Overview

This phase adds simple live status updates and basic notifications to help students see when their friends are available and get notified about schedule changes. Students will learn how to implement real-time status updates using Firebase and create a simple notification system.

## Learning Objectives

- Display friend online/offline status
- Show current schedule activity (In Class, Free, etc.)
- Send basic notifications for schedule conflicts
- Implement simple presence detection
- Create status update UI components
- Handle real-time status synchronization

## Prerequisites

- Completed Phase 4 (Cloud Storage)
- Basic understanding of Firebase real-time listeners
- Knowledge of browser notifications API
- Understanding of JavaScript event handling

## Implementation Timeline

- **Status System Setup**: 1-2 days
- **Friend Status Display**: 2 days
- **Basic Notifications**: 2-3 days
- **Status UI Components**: 1-2 days
- **Testing & Polish**: 1 day
- **Total Estimated Time**: 7-10 days

---

## Part 1: Basic Status System

### 1.1 Simple Status Manager

Create a basic status management system that tracks user presence and current activity:

**File: `js/status-manager.js`**

```javascript
import { auth, db } from "./firebase-config.js";
import {
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

class SimpleStatusManager {
  constructor() {
    this.currentUser = null;
    this.statusListeners = new Map();
    this.lastActivity = Date.now();
    this.isOnline = navigator.onLine;

    this.setupEventListeners();
    this.startPresenceTracking();
  }

  /**
   * Setup event listeners for user activity and connection status
   */
  setupEventListeners() {
    // Track user activity
    [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ].forEach((event) => {
      document.addEventListener(
        event,
        () => {
          this.lastActivity = Date.now();
        },
        true
      );
    });

    // Track online/offline status
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.updateUserStatus("online");
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.updateUserStatus("offline");
    });

    // Auth state listener
    auth.onAuthStateChanged((user) => {
      if (user && user.emailVerified) {
        this.currentUser = user;
        this.updateUserStatus("online");
        console.log("📡 Status tracking activated for:", user.email);
      } else {
        this.currentUser = null;
        console.log("📡 Status tracking deactivated");
      }
    });
  }

  /**
   * Start presence tracking with periodic updates
   */
  startPresenceTracking() {
    // Update presence every 30 seconds
    setInterval(() => {
      if (this.currentUser && this.isOnline) {
        const now = Date.now();
        const timeSinceActivity = now - this.lastActivity;

        // Consider user idle after 5 minutes of inactivity
        const status = timeSinceActivity > 300000 ? "idle" : "online";
        this.updateUserStatus(status);
      }
    }, 30000);
  }

  /**
   * Update user's status in Firestore
   */
  async updateUserStatus(status) {
    if (!this.currentUser) return;

    try {
      await updateDoc(doc(db, "users", this.currentUser.uid), {
        status: status,
        lastSeen: serverTimestamp(),
        isOnline: status === "online",
      });

      console.log(`📡 Status updated to: ${status}`);
    } catch (error) {
      console.error("❌ Failed to update status:", error);
    }
  }

  /**
   * Get current activity based on schedule
   */
  getCurrentActivity(scheduleData) {
    if (!scheduleData) return "Free";

    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const currentDay = now.getDay();

    // Check if user has any events right now
    for (const user of Object.values(scheduleData.users || {})) {
      for (const event of Object.values(user.events || {})) {
        if (this.isEventActive(event, currentDay, currentTime)) {
          return event.title || "In Class";
        }
      }
    }

    return "Free";
  }

  /**
   * Check if an event is currently active
   */
  isEventActive(event, currentDay, currentTime) {
    if (!event.days || !event.days.includes(currentDay)) {
      return false;
    }

    const startTime = this.parseTime(event.startTime);
    const endTime = this.parseTime(event.endTime);

    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Parse time string (like "09:30") to minutes
   */
  parseTime(timeStr) {
    if (!timeStr) return 0;

    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 100 + minutes;
  }

  /**
   * Listen to a friend's status updates
   */
  listenToFriendStatus(friendId, callback) {
    if (this.statusListeners.has(friendId)) {
      return; // Already listening
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", friendId),
      (doc) => {
        if (doc.exists()) {
          const userData = doc.data();
          callback({
            id: friendId,
            status: userData.status || "offline",
            lastSeen: userData.lastSeen,
            isOnline: userData.isOnline || false,
            displayName: userData.displayName,
            currentActivity: this.getCurrentActivity(userData.scheduleData),
          });
        }
      },
      (error) => {
        console.error(`❌ Error listening to friend ${friendId}:`, error);
      }
    );

    this.statusListeners.set(friendId, unsubscribe);
  }

  /**
   * Stop listening to a friend's status
   */
  stopListeningToFriend(friendId) {
    const unsubscribe = this.statusListeners.get(friendId);
    if (unsubscribe) {
      unsubscribe();
      this.statusListeners.delete(friendId);
    }
  }

  /**
   * Stop all status listeners
   */
  stopAllListeners() {
    this.statusListeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.statusListeners.clear();
  }

  /**
   * Cleanup when user goes offline
   */
  cleanup() {
    if (this.currentUser) {
      this.updateUserStatus("offline");
    }
    this.stopAllListeners();
  }
}

// Export singleton instance
export const statusManager = new SimpleStatusManager();

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  statusManager.cleanup();
});
```

### 1.2 Friends Status Display Component

Create a simple UI component to show friend status:

**File: `js/friends-status.js`**

```javascript
import { statusManager } from "./status-manager.js";
import { auth, db } from "./firebase-config.js";
import { doc, getDoc } from "firebase/firestore";

class FriendsStatusDisplay {
  constructor() {
    this.friendsContainer = null;
    this.friends = new Map();
    this.init();
  }

  /**
   * Initialize the friends status display
   */
  init() {
    this.createStatusContainer();
    this.setupAuthListener();
  }

  /**
   * Create the status container UI
   */
  createStatusContainer() {
    // Create floating friends panel
    const container = document.createElement("div");
    container.id = "friends-status-panel";
    container.innerHTML = `
      <div class="friends-status-header">
        <h3>👥 Friends</h3>
        <button id="toggle-friends-panel" class="toggle-btn">−</button>
      </div>
      <div id="friends-list" class="friends-list">
        <div class="loading">Loading friends...</div>
      </div>
    `;

    // Add styles
    container.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 280px;
      max-height: 400px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      z-index: 1000;
      display: none;
    `;

    document.body.appendChild(container);
    this.friendsContainer = container;

    // Setup toggle functionality
    document
      .getElementById("toggle-friends-panel")
      .addEventListener("click", () => {
        this.togglePanel();
      });
  }

  /**
   * Setup authentication listener
   */
  setupAuthListener() {
    auth.onAuthStateChanged(async (user) => {
      if (user && user.emailVerified) {
        await this.loadFriends();
        this.showPanel();
      } else {
        this.hidePanel();
      }
    });
  }

  /**
   * Load user's friends list
   */
  async loadFriends() {
    if (!auth.currentUser) return;

    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const friendIds = userData.friends || [];

        // Clear previous friends
        this.friends.clear();
        statusManager.stopAllListeners();

        if (friendIds.length === 0) {
          this.showNoFriends();
          return;
        }

        // Load each friend's data and setup listeners
        for (const friendId of friendIds) {
          await this.loadFriendData(friendId);
          this.setupFriendStatusListener(friendId);
        }

        this.updateFriendsDisplay();
      }
    } catch (error) {
      console.error("❌ Failed to load friends:", error);
    }
  }

  /**
   * Load individual friend's data
   */
  async loadFriendData(friendId) {
    try {
      const friendDoc = await getDoc(doc(db, "users", friendId));
      if (friendDoc.exists()) {
        const friendData = friendDoc.data();
        this.friends.set(friendId, {
          id: friendId,
          displayName: friendData.displayName,
          email: friendData.email,
          status: friendData.status || "offline",
          lastSeen: friendData.lastSeen,
          isOnline: friendData.isOnline || false,
          currentActivity: statusManager.getCurrentActivity(
            friendData.scheduleData
          ),
        });
      }
    } catch (error) {
      console.error(`❌ Failed to load friend ${friendId}:`, error);
    }
  }

  /**
   * Setup status listener for a friend
   */
  setupFriendStatusListener(friendId) {
    statusManager.listenToFriendStatus(friendId, (friendStatus) => {
      this.friends.set(friendId, friendStatus);
      this.updateFriendsDisplay();
    });
  }

  /**
   * Update the friends display
   */
  updateFriendsDisplay() {
    const friendsList = document.getElementById("friends-list");
    if (!friendsList) return;

    if (this.friends.size === 0) {
      this.showNoFriends();
      return;
    }

    // Sort friends by online status, then by name
    const sortedFriends = Array.from(this.friends.values()).sort((a, b) => {
      if (a.isOnline !== b.isOnline) {
        return b.isOnline - a.isOnline; // Online first
      }
      return a.displayName.localeCompare(b.displayName);
    });

    friendsList.innerHTML = sortedFriends
      .map((friend) => this.createFriendElement(friend))
      .join("");
  }

  /**
   * Create HTML element for a friend
   */
  createFriendElement(friend) {
    const statusColor = this.getStatusColor(friend.status);
    const statusText = this.getStatusText(friend);
    const timeText = this.getTimeText(friend.lastSeen);

    return `
      <div class="friend-item" data-friend-id="${friend.id}">
        <div class="friend-avatar">
          <div class="avatar-circle" style="background: ${this.getAvatarColor(
            friend.displayName
          )}">
            ${friend.displayName.charAt(0).toUpperCase()}
          </div>
          <div class="status-dot" style="background: ${statusColor}"></div>
        </div>
        <div class="friend-info">
          <div class="friend-name">${friend.displayName}</div>
          <div class="friend-status">${statusText}</div>
          <div class="friend-time">${timeText}</div>
        </div>
      </div>
    `;
  }

  /**
   * Get status color for display
   */
  getStatusColor(status) {
    switch (status) {
      case "online":
        return "#4CAF50";
      case "idle":
        return "#FFC107";
      case "offline":
        return "#9E9E9E";
      default:
        return "#9E9E9E";
    }
  }

  /**
   * Get status text for display
   */
  getStatusText(friend) {
    if (friend.isOnline) {
      return friend.currentActivity || "Online";
    } else {
      return "Offline";
    }
  }

  /**
   * Get formatted time text
   */
  getTimeText(lastSeen) {
    if (!lastSeen || !lastSeen.toDate) return "";

    const now = new Date();
    const seenDate = lastSeen.toDate();
    const diffMs = now - seenDate;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  /**
   * Generate avatar color based on name
   */
  getAvatarColor(name) {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Show no friends message
   */
  showNoFriends() {
    const friendsList = document.getElementById("friends-list");
    if (friendsList) {
      friendsList.innerHTML = `
        <div class="no-friends">
          <p>👥 No friends yet</p>
          <p>Add friends to see their status!</p>
        </div>
      `;
    }
  }

  /**
   * Show the friends panel
   */
  showPanel() {
    if (this.friendsContainer) {
      this.friendsContainer.style.display = "block";
    }
  }

  /**
   * Hide the friends panel
   */
  hidePanel() {
    if (this.friendsContainer) {
      this.friendsContainer.style.display = "none";
    }
  }

  /**
   * Toggle panel visibility
   */
  togglePanel() {
    const friendsList = document.getElementById("friends-list");
    const toggleBtn = document.getElementById("toggle-friends-panel");

    if (friendsList.style.display === "none") {
      friendsList.style.display = "block";
      toggleBtn.textContent = "−";
    } else {
      friendsList.style.display = "none";
      toggleBtn.textContent = "+";
    }
  }
}

// Initialize friends status display
export const friendsStatusDisplay = new FriendsStatusDisplay();
```

---

## Part 2: Basic Notifications

### 2.1 Simple Notification System

Create a basic notification system for schedule conflicts and friend updates:

**File: `js/simple-notifications.js`**

```javascript
class SimpleNotificationManager {
  constructor() {
    this.permission = "default";
    this.init();
  }

  /**
   * Initialize notification system
   */
  async init() {
    // Request notification permission
    if ("Notification" in window) {
      this.permission = await Notification.requestPermission();
      console.log("🔔 Notification permission:", this.permission);
    }
  }

  /**
   * Show a browser notification
   */
  showNotification(title, options = {}) {
    if (this.permission !== "granted") {
      // Fallback to in-app notification
      this.showInAppNotification(title, options.body);
      return;
    }

    const notification = new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...options,
    });

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    return notification;
  }

  /**
   * Show in-app notification (fallback)
   */
  showInAppNotification(title, body) {
    const notification = document.createElement("div");
    notification.className = "in-app-notification";
    notification.innerHTML = `
      <div class="notification-content">
        <strong>${title}</strong>
        ${body ? `<p>${body}</p>` : ""}
        <button class="close-notification">×</button>
      </div>
    `;

    // Style the notification
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      max-width: 300px;
      animation: slideInRight 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Close button functionality
    notification
      .querySelector(".close-notification")
      .addEventListener("click", () => {
        notification.remove();
      });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  /**
   * Notify about schedule conflicts
   */
  notifyScheduleConflict(conflictDetails) {
    this.showNotification("⚠️ Schedule Conflict Detected", {
      body: `You have overlapping events: ${conflictDetails.eventName}`,
      tag: "schedule-conflict",
    });
  }

  /**
   * Notify when friend comes online
   */
  notifyFriendOnline(friendName) {
    this.showNotification("👋 Friend Online", {
      body: `${friendName} is now online`,
      tag: "friend-online",
    });
  }

  /**
   * Notify about friend schedule changes
   */
  notifyFriendScheduleChange(friendName, changeDetails) {
    this.showNotification("📅 Friend Schedule Updated", {
      body: `${friendName} updated their schedule`,
      tag: "friend-schedule-change",
    });
  }

  /**
   * Notify about upcoming events
   */
  notifyUpcomingEvent(eventName, timeUntil) {
    this.showNotification("⏰ Upcoming Event", {
      body: `${eventName} starts in ${timeUntil}`,
      tag: "upcoming-event",
    });
  }
}

// Export singleton instance
export const notificationManager = new SimpleNotificationManager();
```

### 2.2 CSS Styles for Status and Notifications

Add these styles to your main CSS file:

**File: Add to your main CSS**

```css
/* Friends Status Panel Styles */
.friends-status-header {
  padding: 16px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.friends-status-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.toggle-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.friends-list {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
}

.friend-item {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  border-radius: 8px;
  transition: background-color 0.2s;
  cursor: pointer;
}

.friend-item:hover {
  background-color: #f5f5f5;
}

.friend-avatar {
  position: relative;
  margin-right: 12px;
}

.avatar-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 16px;
}

.status-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid white;
}

.friend-info {
  flex: 1;
  min-width: 0;
}

.friend-name {
  font-weight: 600;
  font-size: 14px;
  color: #333;
  margin-bottom: 2px;
}

.friend-status {
  font-size: 12px;
  color: #666;
  margin-bottom: 2px;
}

.friend-time {
  font-size: 11px;
  color: #999;
}

.no-friends {
  text-align: center;
  padding: 32px 16px;
  color: #666;
}

.no-friends p {
  margin: 8px 0;
}

.loading {
  text-align: center;
  padding: 32px 16px;
  color: #666;
}

/* In-App Notification Styles */
.in-app-notification {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.notification-content {
  position: relative;
}

.notification-content strong {
  display: block;
  margin-bottom: 4px;
  color: #333;
}

.notification-content p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.close-notification {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ddd;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Animations */
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Status indicators in main UI */
.user-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background: #f0f0f0;
}

.user-status.online {
  background: #e8f5e8;
  color: #2e7d32;
}

.user-status.idle {
  background: #fff3e0;
  color: #f57c00;
}

.user-status.offline {
  background: #f5f5f5;
  color: #757575;
}
```

---

## Part 3: Integration with Main App

### 3.1 Update Main Script

Add these imports and integrations to your main `script.js`:

**File: Add to `script.js`**

```javascript
// Add these imports at the top
import { statusManager } from "./status-manager.js";
import { friendsStatusDisplay } from "./friends-status.js";
import { notificationManager } from "./simple-notifications.js";

// Add this to your initialization code
document.addEventListener("DOMContentLoaded", () => {
  // ... your existing initialization ...

  // Initialize status and notification systems
  initializeStatusSystems();
});

/**
 * Initialize status and notification systems
 */
function initializeStatusSystems() {
  console.log("🔔 Initializing status and notification systems...");

  // Setup status update when schedule changes
  const originalSaveState = saveStateToStorage;
  window.saveStateToStorage = function () {
    // Call original save function
    originalSaveState.call(this);

    // Update status with current activity
    if (auth.currentUser) {
      const currentActivity = statusManager.getCurrentActivity({
        users: state.users,
      });

      // Update status in Firestore (this will be picked up by friends)
      statusManager.updateUserStatus("online");
    }
  };

  // Check for upcoming events every minute
  setInterval(checkUpcomingEvents, 60000);

  console.log("✅ Status and notification systems initialized");
}

/**
 * Check for upcoming events and notify
 */
function checkUpcomingEvents() {
  if (!auth.currentUser || !state.users) return;

  const now = new Date();
  const currentTime = now.getHours() * 100 + now.getMinutes();
  const currentDay = now.getDay();

  // Check all user events
  for (const user of Object.values(state.users)) {
    for (const event of Object.values(user.events || {})) {
      if (event.days && event.days.includes(currentDay)) {
        const startTime = statusManager.parseTime(event.startTime);
        const timeDiff = startTime - currentTime;

        // Notify 15 minutes before event
        if (timeDiff > 0 && timeDiff <= 15) {
          notificationManager.notifyUpcomingEvent(
            event.title || "Scheduled Event",
            "15 minutes"
          );
        }
      }
    }
  }
}
```

---

## Part 4: Testing Your Status System

### 4.1 Testing Checklist

Test your live status and notification system:

1. **Status Updates**

   - [ ] Status changes when user is active/idle
   - [ ] Status shows current schedule activity
   - [ ] Friends can see status updates in real-time

2. **Friends Panel**

   - [ ] Shows online/offline friends
   - [ ] Displays current activity
   - [ ] Updates in real-time
   - [ ] Panel can be toggled

3. **Notifications**
   - [ ] Browser notifications work (if permission granted)
   - [ ] In-app notifications work as fallback
   - [ ] Upcoming event notifications work
   - [ ] Friend status change notifications work

### 4.2 Demo the Features

Open your app in two browser windows (different users) and test:

1. Log in as different users who are friends
2. Watch status updates in real-time
3. Change schedule and see activity updates
4. Test notifications for upcoming events

---

## Congratulations! 🎉

You've successfully implemented a live status and notification system! Your CampXus app now features:

- **Real-time Status Updates**: See when friends are online, idle, or offline
- **Activity Tracking**: Know when friends are in class or free
- **Simple Notifications**: Get alerts for upcoming events and friend updates
- **Friends Panel**: A clean interface to monitor friend activity
- **Presence Detection**: Automatic status updates based on user activity

## What Students Learned

- Real-time data synchronization with Firebase
- Browser notifications API
- User presence detection
- Event listeners and activity tracking
- CSS animations and transitions
- Status management patterns

This simplified approach teaches the core concepts of live status systems without overwhelming complexity, perfect for students learning modern web development!
