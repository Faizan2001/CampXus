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

import { dataManager } from "./data-manager.js";

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

    // Performance monitoring
    this.stats = {
      totalEvents: 0,
      eventsPerSecond: 0,
      lastEventTime: null,
      subscriberCount: 0,
      activeListenerCount: 0,
    };

    // Memory management
    this.memoryMonitor = {
      maxSubscribers: 100, // Prevent memory leaks from too many subscribers
      maxListeners: 20, // Prevent too many active listeners
      gcInterval: 300000, // Garbage collection every 5 minutes
      lastGC: Date.now(),
      warnings: 0,
    };

    // Auto-cleanup timers
    this.cleanupTimer = null;
    this.gcTimer = null;

    // Debug mode flag
    this.debugMode = process.env.NODE_ENV === "development";

    // Start memory monitoring
    this.startMemoryMonitoring();

    this.log("🎛️ RealTimeManager initialized with memory management");
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
    this.updateStats();

    this.log(
      `📡 New subscriber for ${eventType} (${
        this.subscribers.get(eventType).size
      } total)`
    );

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

      this.updateStats();
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

    // Update performance stats
    this.stats.totalEvents++;
    this.stats.lastEventTime = Date.now();
    this.updateEventsPerSecond();
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

    // Emit connection status
    this.emit(REALTIME_EVENTS.CONNECTION_STATUS, {
      isConnected: true,
      userId: userId,
      timestamp: Date.now(),
    });

    this.updateStats();
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
    this.updateStats();
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

  // =========================
  // PERFORMANCE & MONITORING
  // =========================

  /**
   * Update performance statistics
   * @private
   */
  updateStats() {
    this.stats.subscriberCount = Array.from(this.subscribers.values()).reduce(
      (total, set) => total + set.size,
      0
    );
    this.stats.activeListenerCount = this.activeListeners.size;
  }

  /**
   * Update events per second calculation
   * @private
   */
  updateEventsPerSecond() {
    // Simple sliding window calculation
    const now = Date.now();
    const timeWindow = 10000; // 10 seconds

    // This is a simplified version - in production you'd want a proper sliding window
    if (
      this.stats.lastEventTime &&
      now - this.stats.lastEventTime < timeWindow
    ) {
      this.stats.eventsPerSecond =
        this.stats.totalEvents / ((now - this.stats.lastEventTime) / 1000);
    }
  }

  /**
   * Get current status and statistics
   * @returns {Object} Current status
   */
  getStatus() {
    return {
      isListening: this.isListening,
      currentUserId: this.currentUserId,
      subscriberCount: this.stats.subscriberCount,
      activeListenerCount: this.stats.activeListenerCount,
      totalEvents: this.stats.totalEvents,
      eventsPerSecond: Math.round(this.stats.eventsPerSecond * 100) / 100,
      lastEventTime: this.stats.lastEventTime,
      subscribedEvents: Array.from(this.subscribers.keys()),
      activeListeners: Array.from(this.activeListeners.keys()),
    };
  }

  /**
   * Get debug information
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    const status = this.getStatus();

    return {
      ...status,
      detailedSubscribers: Object.fromEntries(
        Array.from(this.subscribers.entries()).map(([event, callbacks]) => [
          event,
          callbacks.size,
        ])
      ),
      memoryUsage: {
        subscribersMap: this.subscribers.size,
        activeListenersMap: this.activeListeners.size,
        totalCallbacks: status.subscriberCount,
      },
    };
  }

  // =========================
  // MEMORY MANAGEMENT
  // =========================

  /**
   * Start memory monitoring and auto-cleanup
   * @private
   */
  startMemoryMonitoring() {
    // Periodic garbage collection
    this.gcTimer = setInterval(() => {
      this.performGarbageCollection();
    }, this.memoryMonitor.gcInterval);

    // Monitor memory usage every minute
    this.cleanupTimer = setInterval(() => {
      this.checkMemoryUsage();
    }, 60000);

    this.log("🧠 Memory monitoring started");
  }

  /**
   * Check memory usage and warn if limits exceeded
   * @private
   */
  checkMemoryUsage() {
    const totalSubscribers = this.stats.subscriberCount;
    const totalListeners = this.stats.activeListenerCount;

    // Check subscriber limits
    if (totalSubscribers > this.memoryMonitor.maxSubscribers) {
      this.memoryMonitor.warnings++;
      console.warn(
        `⚠️ [RealTimeManager] High subscriber count: ${totalSubscribers}/${this.memoryMonitor.maxSubscribers}`
      );

      if (this.memoryMonitor.warnings > 3) {
        this.performEmergencyCleanup();
      }
    }

    // Check listener limits
    if (totalListeners > this.memoryMonitor.maxListeners) {
      console.warn(
        `⚠️ [RealTimeManager] High listener count: ${totalListeners}/${this.memoryMonitor.maxListeners}`
      );
    }

    // Log memory status in debug mode
    if (this.debugMode && (totalSubscribers > 10 || totalListeners > 5)) {
      this.log(
        `🧠 Memory check: ${totalSubscribers} subscribers, ${totalListeners} listeners`
      );
    }
  }

  /**
   * Perform garbage collection on stale subscribers
   * @private
   */
  performGarbageCollection() {
    const before = this.stats.subscriberCount;
    let cleaned = 0;

    // Clean up empty subscriber sets
    for (const [eventType, subscribers] of this.subscribers.entries()) {
      if (subscribers.size === 0) {
        this.subscribers.delete(eventType);
        cleaned++;
      }
    }

    this.memoryMonitor.lastGC = Date.now();
    this.updateStats();

    if (cleaned > 0) {
      this.log(`🧹 Garbage collection: cleaned ${cleaned} empty event types`);
    }

    // Reset warnings if memory usage is back to normal
    if (this.stats.subscriberCount < this.memoryMonitor.maxSubscribers * 0.8) {
      this.memoryMonitor.warnings = 0;
    }
  }

  /**
   * Emergency cleanup when memory limits are exceeded
   * @private
   */
  performEmergencyCleanup() {
    console.warn(
      "🚨 [RealTimeManager] Performing emergency cleanup due to high memory usage"
    );

    // Keep only the most recent subscribers for each event type
    for (const [eventType, subscribers] of this.subscribers.entries()) {
      if (subscribers.size > 10) {
        const subscribersArray = Array.from(subscribers);
        const keepCount = Math.min(5, subscribersArray.length);
        const toKeep = subscribersArray.slice(-keepCount); // Keep last 5

        this.subscribers.set(eventType, new Set(toKeep));
        console.warn(
          `🧹 Emergency cleanup: reduced ${eventType} subscribers from ${subscribersArray.length} to ${keepCount}`
        );
      }
    }

    this.updateStats();
    this.memoryMonitor.warnings = 0;
  }

  /**
   * Get memory usage statistics
   * @returns {Object} Memory usage info
   */
  getMemoryInfo() {
    return {
      subscribers: {
        current: this.stats.subscriberCount,
        max: this.memoryMonitor.maxSubscribers,
        utilization: Math.round(
          (this.stats.subscriberCount / this.memoryMonitor.maxSubscribers) * 100
        ),
      },
      listeners: {
        current: this.stats.activeListenerCount,
        max: this.memoryMonitor.maxListeners,
        utilization: Math.round(
          (this.stats.activeListenerCount / this.memoryMonitor.maxListeners) *
            100
        ),
      },
      garbageCollection: {
        lastRun: this.memoryMonitor.lastGC,
        interval: this.memoryMonitor.gcInterval,
        warnings: this.memoryMonitor.warnings,
      },
      eventTypes: Array.from(this.subscribers.keys()),
      totalMemoryFootprint: this.calculateMemoryFootprint(),
    };
  }

  /**
   * Estimate memory footprint
   * @private
   * @returns {Object} Memory footprint estimate
   */
  calculateMemoryFootprint() {
    // Rough estimation of memory usage
    const subscribersMemory = this.subscribers.size * 100; // Estimated bytes per Map entry
    const listenersMemory = this.activeListeners.size * 200; // Estimated bytes per listener
    const callbacksMemory = this.stats.subscriberCount * 50; // Estimated bytes per callback

    const total = subscribersMemory + listenersMemory + callbacksMemory;

    return {
      total: `${Math.round((total / 1024) * 100) / 100} KB`,
      breakdown: {
        subscribers: `${Math.round((subscribersMemory / 1024) * 100) / 100} KB`,
        listeners: `${Math.round((listenersMemory / 1024) * 100) / 100} KB`,
        callbacks: `${Math.round((callbacksMemory / 1024) * 100) / 100} KB`,
      },
    };
  }

  // =========================
  // CLEANUP & MEMORY MANAGEMENT
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

    // Stop memory monitoring timers
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Reset stats
    this.stats = {
      totalEvents: 0,
      eventsPerSecond: 0,
      lastEventTime: null,
      subscriberCount: 0,
      activeListenerCount: 0,
    };

    // Reset memory monitor
    this.memoryMonitor.warnings = 0;
    this.memoryMonitor.lastGC = Date.now();

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
  console.log("   realTimeManager.getDebugInfo()");
}

// --- END OF FILE ---
