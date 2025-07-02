# 🎯 Phase 1C: Real-Time Data Layer

> **Building the foundation for instant friend request notifications and live updates**

---

## 📋 **Overview**

This phase transforms your friends system from static data fetching to real-time, live updates. When someone sends you a friend request, you'll see it instantly without refreshing the page - just like Facebook, Instagram, and other modern social apps.

**Duration**: 4-5 hours  
**Difficulty**: ⭐⭐⭐⭐⭐  
**Prerequisites**: Phase 1A & 1B completed

---

## 🎯 **Learning Goals**

By the end of this phase, you'll understand:

- How real-time listeners work in Firestore
- Event-driven architecture for social features
- Memory management for long-running listeners
- Building reactive UI updates

---

## 🚨 **The Problem with Static Data**

### **Current Issues**

```javascript
// ❌ Static data fetching (what you have now)
async getPendingRequests() {
  return await dataManager.getPendingFriendRequests(userId);
}

// Problems:
// 1. User has to refresh page to see new requests
// 2. No instant notifications when requests arrive
// 3. UI can become stale and confusing
// 4. Poor user experience compared to modern apps
```

### **The Modern Solution: Real-Time Listeners**

```javascript
// ✅ Real-time listeners (what we're building)
listenForFriendRequests((newRequests) => {
  // This runs automatically when data changes!
  uiManager.updateRequestBadge(newRequests.length);
  uiManager.showNotification("New friend request!");
});
```

---

## 🚀 **Step 1: Add Real-Time Infrastructure**

### **1.1 Update data-manager.js with Listener Support**

Add these real-time functions to your data-manager.js:

```javascript
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,  // ← Add this import for real-time
  orderBy,
  limit
} from "firebase/firestore";

// Add to your DataManager class:

/**
 * 📡 Listen for pending friend requests in real-time
 * @param {string} userId - User ID to listen for
 * @param {function} callback - Function called when data changes
 * @returns {function} Unsubscribe function
 */
listenToPendingFriendRequests(userId, callback) {
  try {
    console.log("📡 Setting up real-time listener for friend requests:", userId);

    const requestsRef = collection(db, "friendRequests");
    const q = query(
      requestsRef,
      where("toUserId", "==", userId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const requests = [];
        querySnapshot.forEach((doc) => {
          requests.push({
            id: doc.id,
            ...doc.data(),
          });
        });

        console.log(`📬 Real-time update: ${requests.length} pending requests`);

        // Transform for UI consumption
        const transformedRequests = requests.map(request => ({
          ...request,
          displayName: request.fromUserInfo?.displayName || "Unknown User",
          major: request.fromUserInfo?.major || "Unknown Major",
          university: request.fromUserInfo?.university || "Unknown University"
        }));

        callback(transformedRequests);
      },
      (error) => {
        console.error("❌ Error in friend requests listener:", error);
        callback([]); // Fallback to empty array
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("❌ Error setting up friend requests listener:", error);
    return () => {}; // Return empty unsubscribe function
  }
}

/**
 * 📡 Listen for user's friendships in real-time
 * @param {string} userId - User ID to listen for
 * @param {function} callback - Function called when friendships change
 * @returns {function} Unsubscribe function
 */
listenToUserFriendships(userId, callback) {
  try {
    console.log("📡 Setting up real-time listener for friendships:", userId);

    const friendshipsRef = collection(db, "friendships");
    const q = query(
      friendshipsRef,
      where("users", "array-contains", userId),
      where("isActive", "==", true),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const friendships = [];
        querySnapshot.forEach((doc) => {
          friendships.push({
            id: doc.id,
            ...doc.data(),
          });
        });

        console.log(`👥 Real-time update: ${friendships.length} friendships`);

        // Transform friendship documents into friend objects
        const friends = friendships.map(friendship => {
          const isUser1 = friendship.user1Id === userId;
          const friendInfo = isUser1 ? friendship.user2Info : friendship.user1Info;
          const friendId = isUser1 ? friendship.user2Id : friendship.user1Id;

          return {
            id: friendId,
            friendshipId: friendship.id,
            displayName: friendInfo?.displayName || "Unknown User",
            major: friendInfo?.major || "Unknown Major",
            avatar: friendInfo?.avatar || null,
            friendsSince: friendship.createdAt,
            lastInteraction: friendship.lastInteraction,
            connectionStrength: friendship.connectionStrength || "normal",
            isOnline: false, // TODO: Add real-time status in Phase 5
            mutualFriends: friendship.mutualFriends || 0
          };
        });

        callback(friends);
      },
      (error) => {
        console.error("❌ Error in friendships listener:", error);
        callback([]); // Fallback to empty array
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("❌ Error setting up friendships listener:", error);
    return () => {}; // Return empty unsubscribe function
  }
}

/**
 * 📡 Listen for changes to a specific user's profile
 * @param {string} userId - User ID to listen for
 * @param {function} callback - Function called when profile changes
 * @returns {function} Unsubscribe function
 */
listenToUserProfile(userId, callback) {
  try {
    console.log("📡 Setting up real-time listener for user profile:", userId);

    const userRef = doc(db, "users", userId);

    const unsubscribe = onSnapshot(
      userRef,
      (doc) => {
        if (doc.exists()) {
          const userData = doc.data();
          console.log("👤 Real-time profile update for:", userData.profile?.displayName);
          callback(userData);
        } else {
          console.warn("User document does not exist:", userId);
          callback(null);
        }
      },
      (error) => {
        console.error("❌ Error in user profile listener:", error);
        callback(null);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("❌ Error setting up user profile listener:", error);
    return () => {};
  }
}
```

---

## 🚀 **Step 2: Create Real-Time Event System**

### **2.1 Create Real-Time Event Manager**

Create a new file `js/core/realtime-manager.js`:

```javascript
/**
 * 🎮 Real-Time Event Manager for CampXus
 *
 * Manages all real-time listeners and coordinates updates between
 * the data layer and UI components.
 */

import { dataManager } from "./data-manager.js";

class RealTimeManager {
  constructor() {
    this.listeners = new Map(); // Track active listeners
    this.eventCallbacks = new Map(); // Event type -> array of callbacks
    this.isInitialized = false;
    this.currentUserId = null;
  }

  /**
   * 🚀 Initialize real-time system for a user
   * @param {string} userId - Current user ID
   */
  initialize(userId) {
    if (this.isInitialized && this.currentUserId === userId) {
      console.log("Real-time manager already initialized for this user");
      return;
    }

    console.log("🚀 Initializing real-time manager for:", userId);

    // Clean up existing listeners
    this.cleanup();

    this.currentUserId = userId;
    this.setupCoreListeners();
    this.isInitialized = true;
  }

  /**
   * 📡 Set up core real-time listeners
   */
  setupCoreListeners() {
    // Listen for friend requests
    const requestsUnsubscribe = dataManager.listenToPendingFriendRequests(
      this.currentUserId,
      (requests) => this.handleFriendRequestsUpdate(requests)
    );
    this.listeners.set("friendRequests", requestsUnsubscribe);

    // Listen for friendships
    const friendshipsUnsubscribe = dataManager.listenToUserFriendships(
      this.currentUserId,
      (friends) => this.handleFriendsListUpdate(friends)
    );
    this.listeners.set("friendships", friendshipsUnsubscribe);

    // Listen for profile changes
    const profileUnsubscribe = dataManager.listenToUserProfile(
      this.currentUserId,
      (profile) => this.handleProfileUpdate(profile)
    );
    this.listeners.set("profile", profileUnsubscribe);

    console.log("✅ Core real-time listeners established");
  }

  /**
   * 📬 Handle friend requests updates
   * @param {Array} requests - Updated friend requests
   */
  handleFriendRequestsUpdate(requests) {
    console.log(`📬 Friend requests updated: ${requests.length} pending`);

    // Emit event to all subscribers
    this.emit("friendRequestsChanged", {
      requests,
      count: requests.length,
      hasNew: requests.length > 0,
    });

    // Check for new requests (simple heuristic)
    if (requests.length > 0) {
      const latestRequest = requests[0];
      const requestAge =
        Date.now() - latestRequest.createdAt?.toDate?.()?.getTime();

      // If request is less than 5 seconds old, it's probably new
      if (requestAge < 5000) {
        this.emit("newFriendRequest", latestRequest);
      }
    }
  }

  /**
   * 👥 Handle friends list updates
   * @param {Array} friends - Updated friends list
   */
  handleFriendsListUpdate(friends) {
    console.log(`👥 Friends list updated: ${friends.length} friends`);

    this.emit("friendsListChanged", {
      friends,
      count: friends.length,
    });
  }

  /**
   * 👤 Handle profile updates
   * @param {Object} profile - Updated profile
   */
  handleProfileUpdate(profile) {
    if (profile) {
      console.log("👤 Profile updated:", profile.profile?.displayName);
      this.emit("profileChanged", profile);
    }
  }

  /**
   * 📢 Subscribe to real-time events
   * @param {string} eventType - Type of event to listen for
   * @param {function} callback - Function to call when event occurs
   */
  on(eventType, callback) {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }

    this.eventCallbacks.get(eventType).push(callback);
    console.log(`📢 Subscribed to ${eventType} events`);
  }

  /**
   * 🔇 Unsubscribe from real-time events
   * @param {string} eventType - Type of event to stop listening for
   * @param {function} callback - Specific callback to remove
   */
  off(eventType, callback) {
    if (this.eventCallbacks.has(eventType)) {
      const callbacks = this.eventCallbacks.get(eventType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * 🎯 Emit event to all subscribers
   * @param {string} eventType - Type of event
   * @param {any} data - Event data
   */
  emit(eventType, data) {
    if (this.eventCallbacks.has(eventType)) {
      const callbacks = this.eventCallbacks.get(eventType);
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${eventType} callback:`, error);
        }
      });
    }
  }

  /**
   * 🔧 Get current status of real-time system
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      currentUserId: this.currentUserId,
      activeListeners: Array.from(this.listeners.keys()),
      eventSubscriptions: Array.from(this.eventCallbacks.keys()),
    };
  }

  /**
   * 🧹 Clean up all listeners
   */
  cleanup() {
    console.log("🧹 Cleaning up real-time listeners");

    // Unsubscribe from all Firestore listeners
    for (const [name, unsubscribe] of this.listeners) {
      try {
        unsubscribe();
        console.log(`✅ Cleaned up ${name} listener`);
      } catch (error) {
        console.error(`Error cleaning up ${name} listener:`, error);
      }
    }

    this.listeners.clear();
    this.eventCallbacks.clear();
    this.isInitialized = false;
    this.currentUserId = null;
  }
}

// Export singleton instance
export const realTimeManager = new RealTimeManager();

// Add to global scope for debugging
if (typeof window !== "undefined") {
  window.realTimeManager = realTimeManager;
}
```

---

## 🚀 **Step 3: Update Friends Manager for Real-Time**

### **3.1 Integrate Real-Time Events**

Update your `friends-manager.js` to use real-time events:

```javascript
// Add this import at the top
import { realTimeManager } from "../realtime-manager.js";

// Update the FriendsManager class:

class FriendsManager {
  constructor() {
    this.currentUser = null;
    this.userProfile = null;
    this.unsubscribers = []; // Keep for backward compatibility

    // Real-time data storage
    this.currentRequests = [];
    this.currentFriends = [];

    // UI update callbacks
    this.uiCallbacks = {
      onRequestsUpdate: null,
      onFriendsUpdate: null,
      onNewRequest: null,
    };

    // Initialize when authentication state changes
    this.setupAuthentication();
  }

  /**
   * 🚀 Initialize the friends system for the current user
   */
  async initializeFriendsSystem() {
    if (!this.currentUser) return;

    try {
      // Get current user's profile from Firestore using the Data Manager
      const userProfile = await dataManager.getUserProfile(
        this.currentUser.uid
      );

      if (userProfile) {
        this.userProfile = userProfile;
        console.log(
          "🎯 Friends system ready for:",
          this.userProfile.profile.displayName
        );

        // 🚀 Initialize real-time system
        this.setupRealTimeListeners();
      } else {
        console.warn(
          "⚠️ Could not find user profile for UID:",
          this.currentUser.uid
        );
      }
    } catch (error) {
      console.error("❌ Error initializing friends system:", error);
    }
  }

  /**
   * 📡 Set up real-time listeners
   */
  setupRealTimeListeners() {
    // Initialize real-time manager
    realTimeManager.initialize(this.currentUser.uid);

    // Subscribe to friend request updates
    realTimeManager.on("friendRequestsChanged", (data) => {
      this.currentRequests = data.requests;
      console.log(`📬 Received ${data.count} friend requests via real-time`);

      // Notify UI
      if (this.uiCallbacks.onRequestsUpdate) {
        this.uiCallbacks.onRequestsUpdate(data);
      }
    });

    // Subscribe to new friend request notifications
    realTimeManager.on("newFriendRequest", (request) => {
      console.log(`🔔 New friend request from ${request.displayName}`);

      // Notify UI
      if (this.uiCallbacks.onNewRequest) {
        this.uiCallbacks.onNewRequest(request);
      }
    });

    // Subscribe to friends list updates
    realTimeManager.on("friendsListChanged", (data) => {
      this.currentFriends = data.friends;
      console.log(`👥 Received ${data.count} friends via real-time`);

      // Notify UI
      if (this.uiCallbacks.onFriendsUpdate) {
        this.uiCallbacks.onFriendsUpdate(data);
      }
    });

    console.log("✅ Real-time listeners set up for friends system");
  }

  /**
   * 🎛️ Register UI update callbacks
   * @param {Object} callbacks - UI callback functions
   */
  setUICallbacks(callbacks) {
    this.uiCallbacks = { ...this.uiCallbacks, ...callbacks };
    console.log("🎛️ UI callbacks registered");
  }

  /**
   * 📬 Get pending friend requests (now uses cached real-time data)
   * @returns {Promise<Array>} Array of pending requests
   */
  async getPendingRequests() {
    // Return cached data if available (updated in real-time)
    if (this.currentRequests.length >= 0) {
      console.log("📦 Returning cached friend requests");
      return this.currentRequests;
    }

    // Fallback to manual fetch if no real-time data yet
    console.log("📡 Fetching friend requests manually (fallback)");
    return await this.getPendingRequestsManual();
  }

  /**
   * 📬 Manual fetch for friend requests (fallback)
   * @returns {Promise<Array>} Array of pending requests
   */
  async getPendingRequestsManual() {
    // Your existing implementation
    if (!this.currentUser || !this.userProfile) {
      console.error("❌ User not authenticated or profile not loaded");
      return [];
    }

    try {
      console.log(
        "📬 Getting pending requests for:",
        this.userProfile.profile.displayName
      );

      const pendingRequests = await dataManager.getPendingFriendRequests(
        this.currentUser.uid
      );

      return pendingRequests.map((request) => ({
        ...request,
        displayName: request.fromUserInfo?.displayName || "Unknown User",
        major: request.fromUserInfo?.major || "Unknown Major",
        university: request.fromUserInfo?.university || "Unknown University",
      }));
    } catch (error) {
      console.error("❌ Error getting pending requests:", error);
      return [];
    }
  }

  /**
   * 👥 Get the current user's friends list (now uses cached real-time data)
   * @returns {Promise<Array>} Array of friends with their info
   */
  async getFriendsList() {
    // Return cached data if available (updated in real-time)
    if (this.currentFriends.length >= 0) {
      console.log("📦 Returning cached friends list");
      return this.currentFriends;
    }

    // Fallback to manual fetch if no real-time data yet
    console.log("📡 Fetching friends list manually (fallback)");
    return await this.getFriendsListManual();
  }

  /**
   * 👥 Manual fetch for friends list (fallback)
   */
  async getFriendsListManual() {
    // Your existing implementation stays the same
    // ... (keep your current getFriendsList implementation)
  }

  /**
   * 🔴 Clean up listeners when user logs out
   */
  cleanup() {
    console.log("🧹 Cleaning up friends manager");

    // Clean up real-time manager
    realTimeManager.cleanup();

    // Clear cached data
    this.currentRequests = [];
    this.currentFriends = [];
    this.uiCallbacks = {
      onRequestsUpdate: null,
      onFriendsUpdate: null,
      onNewRequest: null,
    };

    // Clear user data
    this.currentUser = null;
    this.userProfile = null;
  }
}
```

---

## 🚀 **Step 4: Create Notification System**

### **4.1 Create Notification Manager**

Create `js/core/notification-manager.js`:

```javascript
/**
 * 🔔 Notification Manager for Real-Time Friend Updates
 */

class NotificationManager {
  constructor() {
    this.notifications = [];
    this.maxNotifications = 5;
    this.notificationDuration = 5000; // 5 seconds
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

    // Auto-remove after duration
    setTimeout(() => {
      this.removeNotification(notification.id);
    }, this.notificationDuration);
  }

  /**
   * 🎨 Create notification DOM element
   * @param {Object} notification - Notification data
   */
  createNotificationElement(notification) {
    const container = this.getNotificationContainer();

    const notificationEl = document.createElement("div");
    notificationEl.className = `notification notification-${notification.type}`;
    notificationEl.id = notification.id;

    notificationEl.innerHTML = `
      <div class="notification-content">
        <div class="notification-icon">
          ${this.getNotificationIcon(notification.type)}
        </div>
        <div class="notification-text">
          <div class="notification-title">${notification.title}</div>
          <div class="notification-message">${notification.message}</div>
        </div>
        <button class="notification-close" onclick="notificationManager.removeNotification('${
          notification.id
        }')">
          ×
        </button>
      </div>
    `;

    // Add click handler for friend requests
    if (notification.type === "friend_request") {
      notificationEl.addEventListener("click", () => {
        this.handleFriendRequestClick(notification.data);
      });
    }

    // Add to container
    container.appendChild(notificationEl);

    // Animate in
    requestAnimationFrame(() => {
      notificationEl.classList.add("notification-show");
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
    let container = document.getElementById("notification-container");

    if (!container) {
      container = document.createElement("div");
      container.id = "notification-container";
      container.className = "notification-container";
      document.body.appendChild(container);
    }

    return container;
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
      default: "🔔",
    };

    return icons[type] || icons.default;
  }

  /**
   * 👆 Handle friend request notification click
   * @param {Object} requestData - Friend request data
   */
  handleFriendRequestClick(requestData) {
    // Navigate to friends page or show accept/reject modal
    console.log("Friend request notification clicked:", requestData);

    // TODO: Implement navigation to friends page
    // spa.navigateTo('/friends');

    // Or show quick action modal
    // this.showQuickActionModal(requestData);
  }

  /**
   * 🧹 Clear all notifications
   */
  clearAll() {
    this.notifications.forEach((notification) => {
      this.removeNotification(notification.id);
    });
    this.notifications = [];
  }
}

// Export singleton
export const notificationManager = new NotificationManager();

// Add to global scope for debugging
if (typeof window !== "undefined") {
  window.notificationManager = notificationManager;
}
```

---

## ✅ **Phase 1C Checklist**

- [ ] Added real-time listener functions to data-manager.js
- [ ] Created RealTimeManager for event coordination
- [ ] Updated friends-manager.js for real-time integration
- [ ] Implemented notification system
- [ ] Set up event-driven architecture
- [ ] Added proper cleanup for memory management
- [ ] Created fallback mechanisms for manual data fetching
- [ ] Tested real-time updates with multiple browser tabs

---

## 🧪 **Testing Your Real-Time System**

### **Test 1: Multi-Tab Real-Time Updates**

1. Open your app in two browser tabs
2. Log in as different users
3. Send a friend request from tab 1
4. Verify tab 2 shows the request instantly

### **Test 2: Real-Time Notification**

```javascript
// In browser console of tab 1:
friendsManager.sendFriendRequest("target-user-id", targetUserData);

// Tab 2 should instantly show:
// - Updated friend request count
// - Notification popup
// - Real-time UI update
```

### **Test 3: Memory Management**

```javascript
// Check for memory leaks
console.log("Active listeners:", realTimeManager.getStatus());

// After logout:
friendsManager.cleanup();
console.log("After cleanup:", realTimeManager.getStatus());
```

---

## 🎓 **What You Learned**

### **Real-Time Architecture**

- **Event-Driven Design**: Components communicate via events
- **Firestore Listeners**: `onSnapshot` for real-time data
- **Memory Management**: Proper cleanup to prevent leaks
- **Fallback Systems**: Manual fetch when real-time fails

### **Modern UX Patterns**

- **Instant Notifications**: Users see updates immediately
- **Reactive UI**: Interface updates without user action
- **Background Sync**: Data updates even when app is inactive
- **Optimistic Updates**: UI updates before server confirmation

### **Performance Considerations**

- **Listener Efficiency**: Only subscribe to necessary data
- **Event Throttling**: Prevent UI spam from rapid updates
- **Cache Strategy**: Balance real-time with cached data
- **Connection Management**: Handle offline/online transitions

---

## 🚀 **Ready for Next Phase?**

Your app now has a solid real-time foundation! Friends requests appear instantly, and the UI stays synchronized across all devices.

**Next**: [Phase 1D: Security & Atomic Operations →](./Friends-Phase-1D-Security.md)

---

**Previous**: [← Phase 1B: Search](./Friends-Phase-1B-Search.md) | **Next**: [Phase 1D: Security →](./Friends-Phase-1D-Security.md)
