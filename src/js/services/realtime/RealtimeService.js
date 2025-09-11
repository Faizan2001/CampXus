/**
 * =============================================================================
 *                        MEETCHUTHERE REAL-TIME MANAGER
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
import { currentUser } from "../../store/userStore.js";

/**
 * Debounce utility to prevent excessive updates on low-end devices
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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
  // Phase-1.3: Privacy events
  SCHEDULE_PRIVACY_CHANGE: "schedulePrivacyChange",
  // Phase-2: Quick Access events
  QUICK_ACCESS_UPDATED: "quickAccessUpdated",
  QUICK_ACCESS_FRIENDS: "quickAccessFriends",
  // Campus Presence Phase
  CAMPUS_PRESENCE_CHANGED: "campusPresenceChanged",
  LOCATION_PRIVACY_CHANGED: "locationPrivacyChanged",
  LOCATION_SHARING_REQUEST: "locationSharingRequest",
  USER_ACTIVITY_CHANGED: "userActivityChanged",
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

    // Debug mode flag: only verbose if explicitly requested via log profile
    const profile =
      typeof window !== "undefined" && window.localStorage
        ? (
            window.localStorage.getItem("meetchuthere:logProfile") || ""
          ).toLowerCase()
        : "";
    this.debugMode =
      process.env.NODE_ENV === "development" &&
      (profile === "debug" || profile === "all");

    // Debounced emitters to reduce CPU usage on low-end devices (300ms delay)
    this.debouncedEmit = debounce(this.emit.bind(this), 300);

    this.log("🎛️ RealTimeManager initialized");

    // Route-aware schedule listener management (pause schedule listener off home to reduce background churn)
    if (typeof document !== "undefined" && !window.__realtimeRouteHooked) {
      window.__realtimeRouteHooked = true;
      document.addEventListener("spa:page:load", (e) => {
        try {
          const route = e?.detail?.route;
          if (route && route !== "home") {
            const sched = this.activeListeners.get("userSchedule");
            if (sched) {
              try {
                sched();
              } catch (_) {}
              this.activeListeners.delete("userSchedule");
              this.log("⏸️ Paused user schedule listener (off home page)");
            }
          } else if (
            route === "home" &&
            this.isListening &&
            this.currentUserId
          ) {
            if (!this.activeListeners.get("userSchedule")) {
              this.setupUserScheduleListener(this.currentUserId);
              this.log("▶️ Resumed user schedule listener (home page)");
            }
          }
        } catch (_) {}
      });
    }
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
  async startListening(userId) {
    // Validate user ID first
    if (!userId) {
      console.warn("⚠️ Cannot start real-time listening without valid user ID");
      return;
    }

    if (this.isListening && this.currentUserId === userId) {
      this.log(`🔄 Already listening for user: ${userId}`);
      return;
    }

    // Stop any existing listeners first
    this.stopListening();

    // Wait for proper authentication before setting up listeners
    try {
      // currentUser statically imported

      // Wait for user to be fully authenticated with timeout
      await currentUser.waitForProfileWithTimeout(5000);

      // Double-check authentication state
      if (!currentUser.isLoggedIn() || currentUser.uid !== userId) {
        console.warn(
          "⚠️ Authentication state mismatch, delaying listener setup"
        );
        return;
      }

      this.currentUserId = userId;
      this.isListening = true;

      this.log(`🚀 Starting real-time listeners for user: ${userId}`);

      // Set up all the real-time listeners with small delays to avoid race conditions
      this.setupFriendRequestsListener(userId);

      // Small delay between listener setups
      await new Promise((resolve) => setTimeout(resolve, 100));
      this.setupOutgoingFriendRequestsListener(userId);

      await new Promise((resolve) => setTimeout(resolve, 100));
      this.setupFriendshipsListener(userId);

      await new Promise((resolve) => setTimeout(resolve, 100));
      this.setupUserProfileListener(userId);

      await new Promise((resolve) => setTimeout(resolve, 100));
      // Phase-1: Schedule listener
      this.setupUserScheduleListener(userId);

      await new Promise((resolve) => setTimeout(resolve, 100));
      // Phase-2: Quick Access listener
      this.setupQuickAccessListener(userId);

      // Emit connection status
      this.emit(REALTIME_EVENTS.CONNECTION_STATUS, {
        isConnected: true,
        userId: userId,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("❌ Error starting real-time listeners:", error);
      this.isListening = false;
      this.currentUserId = null;
    }
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
        async (friendships) => {
          this.log(`🤝 Friendships update: ${friendships.length} friends`);

          // Always trigger bilateral cleanup when friendships change
          // This ensures starred friends are cleaned up even when FriendsService isn't listening
          try {
            const intentionalLogout =
              typeof sessionStorage !== "undefined" &&
              sessionStorage.getItem("intentionalLogout") === "true";
            if (!intentionalLogout) {
              this.log(`🧹 Triggering bilateral cleanup for ${userId}`);
              await this.performBilateralCleanup(userId, friendships);
            } else if (this.debugMode) {
              this.log(
                `ℹ️ Skipping bilateral cleanup (intentional logout in progress)`
              );
            }
          } catch (cleanupError) {
            console.error(`❌ Error in bilateral cleanup:`, cleanupError);
          }

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
      const unsubscribe = dataManager.listenToUserSchedule(
        userId,
        (scheduleData) => {
          this.log(
            `📅 Schedule data update: ${scheduleData ? "Updated" : "Cleared"}`
          );
          this.emit(REALTIME_EVENTS.USER_SCHEDULE, scheduleData);

          // Emit sync status event for notifications
          this.emit(REALTIME_EVENTS.SCHEDULE_SYNC, {
            userId: userId,
            synced: true,
            timestamp: Date.now(),
            syncType: "realtime",
          });
        }
      );

      this.activeListeners.set(listenerId, unsubscribe);
      this.log(`✅ User schedule listener active`);
    } catch (error) {
      console.error(`❌ Failed to setup user schedule listener:`, error);
    }
  }

  /**
   * Set up Quick Access listener (Phase-2)
   * Listens for changes to user's quickAccessData for instant star updates
   * @param {string} userId - User ID to listen for
   * @private
   */
  setupQuickAccessListener(userId) {
    const listenerId = "quickAccess";
    if (!this._quickAccessSignatures) this._quickAccessSignatures = new Map();

    try {
      const unsubscribe = dataManager.listenToUserProfile(
        userId,
        (userProfile) => {
          if (userProfile && userProfile.quickAccessData) {
            const quickAccessFriends =
              userProfile.quickAccessData.starredFriends || [];
            // Build structural signature (ordered ids)
            const sig = quickAccessFriends
              .map((f) => f.friendId || f.userId)
              .filter(Boolean)
              .sort()
              .join("|");
            const lastSig = this._quickAccessSignatures.get(userId);
            const changed = sig !== lastSig;
            this.log(
              `⭐ Quick Access update: ${quickAccessFriends.length} starred friends (structuralChange=${changed})`
            );
            // Always emit raw friends list (lightweight) only if structure changed to reduce UI churn
            if (changed) {
              this._quickAccessSignatures.set(userId, sig);
              this.emit(
                REALTIME_EVENTS.QUICK_ACCESS_FRIENDS,
                quickAccessFriends
              );
              this.emit(REALTIME_EVENTS.QUICK_ACCESS_UPDATED, {
                userId,
                quickAccessFriends,
                count: quickAccessFriends.length,
                timestamp: Date.now(),
              });
            }
          }
        }
      );

      this.activeListeners.set(listenerId, unsubscribe);
      this.log(`✅ Quick Access listener active`);
    } catch (error) {
      console.error(`❌ Failed to setup Quick Access listener:`, error);
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
      subscriberDetails: Array.from(this.subscribers.entries()).map(
        ([event, callbacks]) => ({
          event,
          callbackCount: callbacks.size,
        })
      ),
      memoryUsage: {
        subscribers: this.subscribers.size,
        activeListeners: this.activeListeners.size,
        totalCallbacks: Array.from(this.subscribers.values()).reduce(
          (total, set) => total + set.size,
          0
        ),
      },
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
  // PRIVACY EVENT EMITTERS
  // =========================

  /**
   * Emit schedule privacy change event
   * @param {string} fromUserId - User who initiated the change
   * @param {string} affectedUserId - User affected by the change
   * @param {boolean} scheduleVisibility - New visibility status
   * @param {string} [friendName] - Optional friend name for enhanced payload
   */
  emitSchedulePrivacyChange(
    fromUserId,
    affectedUserId,
    scheduleVisibility,
    friendName = null
  ) {
    // Validate inputs
    if (!fromUserId || !affectedUserId) {
      console.error("❌ emitSchedulePrivacyChange: Invalid user IDs:", {
        fromUserId,
        affectedUserId,
      });
      return;
    }

    if (fromUserId === affectedUserId) {
      console.error(
        "❌ emitSchedulePrivacyChange: Cannot emit privacy change for same user:",
        fromUserId
      );
      return;
    }

    if (typeof scheduleVisibility !== "boolean") {
      console.error(
        "❌ emitSchedulePrivacyChange: scheduleVisibility must be boolean:",
        scheduleVisibility
      );
      return;
    }

    // Only emit if there are active listeners and we're listening
    if (
      !this.isListening ||
      !this.subscribers.has(REALTIME_EVENTS.SCHEDULE_PRIVACY_CHANGE)
    ) {
      this.log(`⏭️ Skipping privacy change event - no active listeners`);
      return;
    }

    try {
      const eventPayload = {
        fromUserId,
        affectedUserId,
        scheduleVisibility,
        timestamp: Date.now(),
        type: "privacy_change",
        // Enhanced payload for UI components
        friendName: friendName || "Unknown",
        action: scheduleVisibility ? "schedule_shown" : "schedule_hidden",
        description: scheduleVisibility
          ? `Schedule is now visible to ${friendName || "friend"}`
          : `Schedule is now hidden from ${friendName || "friend"}`,
      };

      this.log(
        `🔐 Emitting privacy change: ${fromUserId} → ${affectedUserId} = ${scheduleVisibility}`
      );
      this.emit(REALTIME_EVENTS.SCHEDULE_PRIVACY_CHANGE, eventPayload);
    } catch (error) {
      console.error("❌ Error emitting schedule privacy change event:", error);
    }
  }

  /**
   * 🌍 Emit location privacy change event (Campus Presence)
   * @param {string} fromUserId - User who made the change
   * @param {string} affectedUserId - User affected by the change
   * @param {boolean} locationVisibility - New location visibility status
   * @param {string} [friendName] - Optional friend name for enhanced payload
   */
  emitLocationPrivacyChange(
    fromUserId,
    affectedUserId,
    locationVisibility,
    friendName = null
  ) {
    // Validate inputs
    if (!fromUserId || !affectedUserId) {
      console.error("❌ emitLocationPrivacyChange: Invalid user IDs:", {
        fromUserId,
        affectedUserId,
      });
      return;
    }

    if (fromUserId === affectedUserId) {
      console.error(
        "❌ emitLocationPrivacyChange: Cannot emit location privacy change for same user:",
        fromUserId
      );
      return;
    }

    if (typeof locationVisibility !== "boolean") {
      console.error(
        "❌ emitLocationPrivacyChange: locationVisibility must be boolean:",
        locationVisibility
      );
      return;
    }

    // Only emit if there are active listeners and we're listening
    if (
      !this.isListening ||
      !this.subscribers.has(REALTIME_EVENTS.LOCATION_PRIVACY_CHANGED)
    ) {
      this.log(
        `⏭️ Skipping location privacy change event - no active listeners`
      );
      return;
    }

    try {
      const eventPayload = {
        fromUserId,
        affectedUserId,
        locationVisibility,
        timestamp: Date.now(),
        type: "location_privacy_change",
        // Enhanced payload for UI components
        friendName: friendName || "Unknown",
        action: locationVisibility ? "location_shared" : "location_hidden",
        description: locationVisibility
          ? `Location is now shared with ${friendName || "friend"}`
          : `Location sharing disabled with ${friendName || "friend"}`,
      };

      this.log(
        `🌍 Emitting location privacy change: ${fromUserId} → ${affectedUserId} = ${locationVisibility}`
      );
      this.emit(REALTIME_EVENTS.LOCATION_PRIVACY_CHANGED, eventPayload);
    } catch (error) {
      console.error("❌ Error emitting location privacy change event:", error);
    }
  }

  /**
   * 🌍 Emit campus presence change event
   * @param {string} userId - User whose presence changed
   * @param {string} campusStatus - New campus status ('on_campus', 'off_campus', 'unknown')
   * @param {Object} locationData - Location data with coordinates and timestamp
   */
  emitCampusPresenceChange(userId, campusStatus, locationData = null) {
    // Input validation
    if (!userId || typeof userId !== "string") {
      console.error("❌ emitCampusPresenceChange: userId is required:", userId);
      return;
    }

    const validStatuses = ["on_campus", "off_campus", "unknown"];
    if (!validStatuses.includes(campusStatus)) {
      console.error(
        "❌ emitCampusPresenceChange: Invalid campus status:",
        campusStatus
      );
      return;
    }

    // Skip emission if no listeners
    if (
      !this.isListening ||
      !this.subscribers.has(REALTIME_EVENTS.CAMPUS_PRESENCE_CHANGED)
    ) {
      this.log(
        `⏭️ Skipping campus presence change event - no active listeners`
      );
      return;
    }

    try {
      const eventPayload = {
        userId,
        campusStatus,
        locationData,
        timestamp: Date.now(),
        type: "campus_presence_change",
        // Enhanced payload for UI components
        isOnCampus: campusStatus === "on_campus",
        presenceText: this.getCampusPresenceText(campusStatus),
        description: `Campus status updated to: ${campusStatus.replace(
          "_",
          " "
        )}`,
      };

      this.log(
        `🌍 Emitting campus presence change: ${userId} → ${campusStatus}`
      );
      this.emit(REALTIME_EVENTS.CAMPUS_PRESENCE_CHANGED, eventPayload);
    } catch (error) {
      console.error("❌ Error emitting campus presence change event:", error);
    }
  }

  /**
   * Helper method to get human-readable campus presence text
   * @param {string} campusStatus - Campus status
   * @returns {string} Human-readable text
   */
  getCampusPresenceText(campusStatus) {
    switch (campusStatus) {
      case "on_campus":
        return "On Campus";
      case "off_campus":
        return "Off Campus";
      case "unknown":
      default:
        return "Unknown";
    }
  }

  /**
   * 💓 Emit user activity change event (Activity Heartbeat System)
   * @param {string} userId - User whose activity changed
   * @param {boolean} isActive - Whether user is currently active
   */
  emitUserActivityChange(userId, isActive) {
    // Input validation
    if (!userId || typeof userId !== "string") {
      console.error("❌ emitUserActivityChange: userId is required:", userId);
      return;
    }

    if (typeof isActive !== "boolean") {
      console.error(
        "❌ emitUserActivityChange: isActive must be boolean:",
        isActive
      );
      return;
    }

    // Skip emission if no listeners
    if (
      !this.isListening ||
      !this.subscribers.has(REALTIME_EVENTS.USER_ACTIVITY_CHANGED)
    ) {
      this.log(`⏭️ Skipping user activity change event - no active listeners`);
      return;
    }

    try {
      const eventPayload = {
        userId,
        isActive,
        timestamp: Date.now(),
        type: "user_activity_change",
        // Enhanced payload for UI components
        activityText: isActive ? "Active" : "Inactive",
        description: `User is now ${isActive ? "active" : "inactive"}`,
      };

      // Only log in development to reduce console spam in production
      if (this.debugMode) {
        this.log(
          `💓 Emitting user activity change: ${userId} → ${
            isActive ? "active" : "inactive"
          }`
        );
      }
      this.emit(REALTIME_EVENTS.USER_ACTIVITY_CHANGED, eventPayload);
    } catch (error) {
      console.error("❌ Error emitting user activity change event:", error);
    }
  }

  /**
   * Perform bilateral cleanup to remove stale starred friends
   * This is the same logic as in FriendsService but available at system level
   * @param {string} userId - Current user ID
   * @param {Array} currentFriendships - Current friendship documents
   * @private
   */
  async performBilateralCleanup(userId, currentFriendships) {
    try {
      // Skip cleanup during or after logout, or if unauthenticated
      const intentionalLogout =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("intentionalLogout") === "true";
      if (intentionalLogout || !userId) {
        this.log(
          "ℹ️ CLEANUP: Skipping bilateral cleanup (signed out or intentional logout)"
        );
        return;
      }

      // Get current Quick Access friends
      const quickAccessData = await dataManager.getQuickAccessFriends(userId);
      if (quickAccessData?.skipped) {
        this.log(
          "ℹ️ CLEANUP: Quick Access fetch skipped due to logout; aborting cleanup"
        );
        return;
      }
      if (!quickAccessData) {
        this.log(
          `⚠️ Could not get Quick Access data for cleanup (user may not have any)`
        );
        return;
      }

      const quickAccessFriends = quickAccessData.starredFriends || [];
      if (quickAccessFriends.length === 0) {
        this.log(`🔍 No Quick Access friends to validate for ${userId}`);
        return;
      }

      this.log(
        `🔍 CLEANUP: Validating ${quickAccessFriends.length} quickAccess friends against ${currentFriendships.length} current friendships`
      );

      // Extract friend IDs from quickAccess for validation
      const starredFriendIds = quickAccessFriends
        .map((friend) => friend.friendId)
        .filter(Boolean);
      this.log(
        `📋 CLEANUP: Checking these starred friend IDs: ${JSON.stringify(
          starredFriendIds
        )}`
      );

      if (starredFriendIds.length === 0) {
        this.log(`🔍 No valid friend IDs in Quick Access to validate`);
        return;
      }

      // Validate friendship documents exist for each starred friend
      const validationResults = await this.validateFriendshipDocuments(
        userId,
        starredFriendIds,
        currentFriendships
      );

      const validFriends = validationResults
        .filter((result) => result.isValid)
        .map((result) => result.friendId);
      const staleFriends = validationResults
        .filter((result) => !result.isValid)
        .map((result) => result.friendId);

      this.log(
        `✅ CLEANUP: Validated friends (have valid documents): ${JSON.stringify(
          validFriends
        )}`
      );

      if (staleFriends.length > 0) {
        this.log(
          `🔍 CLEANUP: Stale friends to remove: ${JSON.stringify(staleFriends)}`
        );
        this.log(
          `🧹 CLEANUP: Found ${staleFriends.length} stale friends to remove from quickAccess`
        );

        // Remove stale friends from Quick Access
        for (const staleFriendId of staleFriends) {
          const removeResult = await dataManager.removeFromQuickAccess(
            userId,
            staleFriendId
          );
          if (removeResult.success) {
            this.log(
              `🧹 CLEANUP: Successfully removed ${staleFriendId} from quickAccess`
            );
          } else {
            this.log(
              `❌ CLEANUP: Failed to remove ${staleFriendId} from quickAccess: ${removeResult.error}`
            );
          }
        }

        this.log(
          `🧹 CLEANUP: Batch cleanup complete - ${staleFriends.length} stale friends processed`
        );

        // Force clear cache to ensure we get fresh data after cleanup
        const cacheKey = `quick_access_${userId}`;
        dataManager.cache.delete(cacheKey);
        this.log(`🧹 CLEANUP: Cleared cache to ensure fresh Quick Access data`);

        // Emit Quick Access update event so UI components can refresh
        const updatedQuickAccessData = await dataManager.getQuickAccessFriends(
          userId
        );
        if (updatedQuickAccessData) {
          this.emit(REALTIME_EVENTS.QUICK_ACCESS_UPDATED, {
            starredFriends: updatedQuickAccessData.starredFriends || [],
            totalStarred: updatedQuickAccessData.totalStarred || 0,
            lastUpdated: updatedQuickAccessData.lastUpdated,
            source: "bilateral_cleanup",
          });
          this.log(
            `📡 CLEANUP: Emitted Quick Access update event with ${
              updatedQuickAccessData.starredFriends?.length || 0
            } friends`
          );
        }
      } else {
        this.log(
          `✅ CLEANUP: All Quick Access friends have valid friendship documents`
        );
      }
    } catch (error) {
      console.error(`❌ Error in bilateral cleanup:`, error);
    }
  }

  /**
   * Validate that friendship documents exist for the given friend IDs
   * @param {string} userId - Current user ID
   * @param {Array<string>} friendIds - Friend IDs to validate
   * @param {Array} currentFriendships - Current friendship documents
   * @returns {Array} Validation results
   * @private
   */
  async validateFriendshipDocuments(userId, friendIds, currentFriendships) {
    this.log(`🔍 CLEANUP: Validating ${friendIds.length} friendship documents`);

    const results = [];

    for (const friendId of friendIds) {
      // Check if a friendship document exists between current user and this friend
      const friendshipExists = currentFriendships.some(
        (friendship) =>
          friendship.users &&
          friendship.users.includes(userId) &&
          friendship.users.includes(friendId)
      );

      if (!friendshipExists) {
        this.log(`❌ CLEANUP: No friendship document found for ${friendId}`);
        results.push({ friendId, isValid: false });
      } else {
        this.log(`✅ CLEANUP: Valid friendship document found for ${friendId}`);
        results.push({ friendId, isValid: true });
      }
    }

    const validCount = results.filter((r) => r.isValid).length;
    const invalidCount = results.filter((r) => !r.isValid).length;

    this.log(
      `🔍 CLEANUP: Validation complete - ${friendIds.length}/${friendIds.length} checks successful, ${validCount} valid, ${invalidCount} invalid friendships`
    );

    return results;
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
}

// --- END OF FILE ---
