/**
 * =============================================================================
 *                        CAMPXUS REAL-TIME MANAGER
 * =============================================================================
 *
 * Centralized real-time event coordination system for all live data updates.
 *
 * Think of this as a radio station 📻 that broadcasts real-time events to all
 * parts of the app that want to listen. It manages Firebase listeners and
 * coordinates data flow between components.
 *
 * --- ARCHITECTURE BENEFITS ---
 * ✅ Memory Management: Automatically cleans up listeners to prevent leaks
 * ✅ Event Coordination: Single source of truth for all real-time events
 * ✅ Performance: Efficient listener management and data caching
 * ✅ Debugging: Centralized logging and status monitoring
 * ✅ Scalability: Easy to add new real-time features
 *
 * --- HOW IT WORKS ---
 * 1. Components register for events they care about
 * 2. RealTimeManager sets up Firebase listeners
 * 3. When data changes, events are broadcast to all subscribers
 * 4. Components react to events and update their UI
 * 5. Cleanup happens automatically when components unmount
 *
 * --- USAGE EXAMPLES ---
 *
 * // Subscribe to friend requests
 * const unsubscribe = realTimeManager.on('friendRequests', (requests) => {
 *   updateFriendRequestsUI(requests);
 * });
 *
 * // Subscribe to friendships
 * realTimeManager.on('friendships', (friends) => {
 *   updateFriendsListUI(friends);
 * });
 *
 * // Start listening for a specific user
 * realTimeManager.startListening(userId);
 *
 * // Stop all listeners when component unmounts
 * realTimeManager.stopListening();
 *
 * // Cleanup when done
 * unsubscribe();
 *
 */

import { dataManager } from "../data/DataService.js";

/**
 * Real-Time Event Types
 * These are the events that components can subscribe to
 */
export const REALTIME_EVENTS = {
  FRIEND_REQUESTS: "friendRequests",
  OUTGOING_FRIEND_REQUESTS: "outgoingFriendRequests",
  FRIENDSHIPS: "friendships",
  USER_PROFILE: "userProfile",
  USER_STATUS: "userStatus",
  CONNECTION_STATUS: "connectionStatus",
  // Phase-1: Schedule events
  USER_SCHEDULE: "userSchedule",
  SCHEDULE_SYNC: "scheduleSync",
};

/**
 * Real-Time Manager Class
 * Manages all real-time listeners and event broadcasting
 */
class RealTimeManager {
  constructor() {
    // Event emitter pattern - like a radio station with different channels
    this.subscribers = new Map(); // event -> Set of callback functions
    this.activeListeners = new Map(); // listenerId -> unsubscribe function
    this.isListening = false;
    this.currentUserId = null;

    // Debug mode flag
    this.debugMode = process.env.NODE_ENV === "development";

    this.log("🎛️ RealTimeManager initialized");
  }

  // =========================
  // CORE EVENT SYSTEM
  // =========================

  /**
   * Subscribe to a real-time event
   * @param {string} eventType - Event type from REALTIME_EVENTS
   * @param {function} callback - Function to call when event fires
   * @returns {function} Unsubscribe function
   */
  on(eventType, callback) {
    if (!Object.values(REALTIME_EVENTS).includes(eventType)) {
      console.error(`❌ Invalid event type: ${eventType}`);
      return () => {};
    }

    if (typeof callback !== "function") {
      console.error(`❌ Callback must be a function for event: ${eventType}`);
      return () => {};
    }

    // Initialize subscribers set for this event type
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    // Add the callback to subscribers
    this.subscribers.get(eventType).add(callback);

    this.log(`📡 New subscriber for ${eventType}`);

    // Return unsubscribe function
    return () => {
      this.off(eventType, callback);
    };
  }

  /**
   * Unsubscribe from a real-time event
   * @param {string} eventType - Event type to unsubscribe from
   * @param {function} callback - Callback function to remove
   */
  off(eventType, callback) {
    if (this.subscribers.has(eventType)) {
      this.subscribers.get(eventType).delete(callback);

      // Clean up empty event types
      if (this.subscribers.get(eventType).size === 0) {
        this.subscribers.delete(eventType);
      }

      this.log(`📡 Unsubscribed from ${eventType}`);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} eventType - Event type to emit
   * @param {*} data - Data to send with the event
   * @private
   */
  emit(eventType, data) {
    if (!this.subscribers.has(eventType)) {
      return; // No subscribers for this event
    }

    const callbacks = this.subscribers.get(eventType);
    this.log(`📢 Broadcasting ${eventType} to ${callbacks.size} subscribers`);

    // Call all subscriber callbacks
    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`❌ Error in ${eventType} callback:`, error);
      }
    });
  }

  // =========================
  // LISTENER MANAGEMENT
  // =========================

  /**
   * Start real-time listening for a specific user
   * @param {string} userId - User ID to start listening for
   */
  startListening(userId) {
    if (this.isListening && this.currentUserId === userId) {
      this.log(`🔄 Already listening for user: ${userId}`);
      return;
    }

    // Stop any existing listeners first
    this.stopListening();

    this.currentUserId = userId;
    this.isListening = true;

    this.log(`🚀 Starting real-time listeners for user: ${userId}`);

    // Set up all the real-time listeners
    this.setupFriendRequestsListener(userId);
    this.setupOutgoingFriendRequestsListener(userId);
    this.setupFriendshipsListener(userId);
    this.setupUserProfileListener(userId);
    // Phase-1: Schedule listener
    this.setupUserScheduleListener(userId);

    // Emit connection status
    this.emit(REALTIME_EVENTS.CONNECTION_STATUS, {
      isConnected: true,
      userId: userId,
      timestamp: Date.now(),
    });
  }

  /**
   * Stop all real-time listening
   */
  stopListening() {
    if (!this.isListening) {
      return;
    }

    this.log(
      `🛑 Stopping all real-time listeners for user: ${this.currentUserId}`
    );

    // Unsubscribe from all active listeners
    this.activeListeners.forEach((unsubscribe, listenerId) => {
      try {
        unsubscribe();
        this.log(`✅ Stopped listener: ${listenerId}`);
      } catch (error) {
        console.error(`❌ Error stopping listener ${listenerId}:`, error);
      }
    });

    // Clear all listeners
    this.activeListeners.clear();
    this.isListening = false;

    // Emit disconnection status
    this.emit(REALTIME_EVENTS.CONNECTION_STATUS, {
      isConnected: false,
      userId: this.currentUserId,
      timestamp: Date.now(),
    });

    this.currentUserId = null;
  }

  /**
   * Set up friend requests listener
   * @param {string} userId - User ID to listen for
   * @private
   */
  setupFriendRequestsListener(userId) {
    const listenerId = "friendRequests";

    try {
      const unsubscribe = dataManager.listenToPendingFriendRequests(
        userId,
        (requests) => {
          this.log(`📬 Friend requests update: ${requests.length} pending`);
          this.emit(REALTIME_EVENTS.FRIEND_REQUESTS, requests);
        }
      );

      this.activeListeners.set(listenerId, unsubscribe);
      this.log(`✅ Friend requests listener active`);
    } catch (error) {
      console.error(`❌ Failed to setup friend requests listener:`, error);
    }
  }

  /**
   * Set up outgoing friend requests listener
   * @param {string} userId - User ID to listen for
   * @private
   */
  setupOutgoingFriendRequestsListener(userId) {
    const listenerId = "outgoingFriendRequests";

    try {
      const unsubscribe = dataManager.listenToOutgoingFriendRequests(
        userId,
        (requests) => {
          this.log(
            `📤 Outgoing friend requests update: ${requests.length} total`
          );
          this.emit(REALTIME_EVENTS.OUTGOING_FRIEND_REQUESTS, requests);
        }
      );

      this.activeListeners.set(listenerId, unsubscribe);
      this.log(`✅ Outgoing friend requests listener active`);
    } catch (error) {
      console.error(
        `❌ Failed to setup outgoing friend requests listener:`,
        error
      );
    }
  }

  /**
   * Set up friendships listener
   * @param {string} userId - User ID to listen for
   * @private
   */
  setupFriendshipsListener(userId) {
    const listenerId = "friendships";

    try {
      const unsubscribe = dataManager.listenToUserFriendships(
        userId,
        (friendships) => {
          this.log(`🤝 Friendships update: ${friendships.length} friends`);
          this.emit(REALTIME_EVENTS.FRIENDSHIPS, friendships);
        }
      );

      this.activeListeners.set(listenerId, unsubscribe);
      this.log(`✅ Friendships listener active`);
    } catch (error) {
      console.error(`❌ Failed to setup friendships listener:`, error);
    }
  }

  /**
   * Set up user profile listener
   * @param {string} userId - User ID to listen for
   * @private
   */
  setupUserProfileListener(userId) {
    const listenerId = "userProfile";

    try {
      const unsubscribe = dataManager.listenToUserProfile(userId, (profile) => {
        this.log(`👤 User profile update for: ${userId}`);
        this.emit(REALTIME_EVENTS.USER_PROFILE, profile);
      });

      this.activeListeners.set(listenerId, unsubscribe);
      this.log(`✅ User profile listener active`);
    } catch (error) {
      console.error(`❌ Failed to setup user profile listener:`, error);
    }
  }

  /**
   * Set up user schedule listener (Phase-1)
   * @param {string} userId - User ID to listen for
   * @private
   */
  setupUserScheduleListener(userId) {
    const listenerId = "userSchedule";

    try {
      const unsubscribe = dataManager.listenToUserSchedule(userId, (scheduleData) => {
        this.log(`📅 Schedule data update: ${scheduleData ? 'Updated' : 'Cleared'}`);
        this.emit(REALTIME_EVENTS.USER_SCHEDULE, scheduleData);
        
        // Emit sync status event for notifications
        this.emit(REALTIME_EVENTS.SCHEDULE_SYNC, {
          userId: userId,
          synced: true,
          timestamp: Date.now(),
          syncType: 'realtime'
        });
      });

      this.activeListeners.set(listenerId, unsubscribe);
      this.log(`✅ User schedule listener active`);
    } catch (error) {
      console.error(`❌ Failed to setup user schedule listener:`, error);
    }
  }

  // =========================
  // STATUS & DEBUG
  // =========================

  /**
   * Get current status
   * @returns {Object} Current status
   */
  getStatus() {
    return {
      isListening: this.isListening,
      currentUserId: this.currentUserId,
      subscriberCount: Array.from(this.subscribers.values()).reduce(
        (total, set) => total + set.size,
        0
      ),
      activeListenerCount: this.activeListeners.size,
      subscribedEvents: Array.from(this.subscribers.keys()),
      activeListeners: Array.from(this.activeListeners.keys()),
    };
  }

  /**
   * Get comprehensive debug information
   * @returns {Object} Detailed debug information
   */
  getDebugInfo() {
    return {
      ...this.getStatus(),
      debugMode: this.debugMode,
      subscriberDetails: Array.from(this.subscribers.entries()).map(([event, callbacks]) => ({
        event,
        callbackCount: callbacks.size
      })),
      memoryUsage: {
        subscribers: this.subscribers.size,
        activeListeners: this.activeListeners.size,
        totalCallbacks: Array.from(this.subscribers.values()).reduce(
          (total, set) => total + set.size,
          0
        )
      }
    };
  }


  // =========================
  // CLEANUP
  // =========================

  /**
   * Clean up all resources and stop listening
   * Call this when the app is shutting down or user logs out
   */
  cleanup() {
    this.log("🧹 Cleaning up RealTimeManager...");

    // Stop all listeners
    this.stopListening();

    // Clear all subscribers
    this.subscribers.clear();

    this.log("✅ RealTimeManager cleanup complete");
  }

  /**
   * Restart listening with the same user (useful for reconnection)
   */
  restart() {
    if (this.currentUserId) {
      const userId = this.currentUserId;
      this.stopListening();
      setTimeout(() => {
        this.startListening(userId);
      }, 100); // Small delay to ensure clean restart
    }
  }

  // =========================
  // UTILITIES
  // =========================

  /**
   * Debug logging
   * @param {string} message - Message to log
   * @private
   */
  log(message) {
    if (this.debugMode) {
      console.log(`[RealTimeManager] ${message}`);
    }
  }

  /**
   * Force emit an event (for testing)
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  forceEmit(eventType, data) {
    this.log(`🧪 Force emitting ${eventType} for testing`);
    this.emit(eventType, data);
  }
}

// Export singleton instance
export const realTimeManager = new RealTimeManager();

// Development helpers
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.realTimeManager = realTimeManager;
  window.REALTIME_EVENTS = REALTIME_EVENTS;

  console.log("🎛️ RealTimeManager available globally for debugging");
  console.log("💡 Usage:");
  console.log('   realTimeManager.startListening("user-id")');
  console.log('   realTimeManager.on("friendRequests", callback)');
  console.log("   realTimeManager.getStatus()");
}

// --- END OF FILE ---
