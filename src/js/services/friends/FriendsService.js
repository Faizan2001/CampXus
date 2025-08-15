/**
 * 🎯 CampXus Friends Manager
 *
 * This module handles all the core friends functionality including:
 * - Search for students at the same university
 * - Send and manage friend requests
 * - Accept/reject friend requests
 * - Maintain friends list
 * - Real-time updates for social interactions
 *
 * 🎓 Learning: This is the "Model" in our simple MVC pattern
 * It contains all the business logic and data management for friends
 */

import { currentUser } from "../../store/userStore.js";
import { dataManager } from "../data/DataService.js";
import {
  realTimeManager,
  REALTIME_EVENTS,
} from "../realtime/RealtimeService.js";
import { notificationManager } from "../realtime/NotificationService.js";
import { friendshipPrivacyService } from "./FriendshipPrivacyService.js";

export class FriendsManager {
  constructor() {
    this.unsubscribers = []; // For cleaning up Firestore listeners
    // No more setupAuthentication or initialization here!
    // We will get the user data on-demand.

    // 🗄️ Simple TTL-based cache for search results and user data
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes TTL for all cached data

    // 🎛️ Real-time integration
    this.isRealTimeActive = false;
    this.uiCallbacks = {
      onFriendRequestsChange: null,
      onOutgoingFriendRequestsChange: null,
      onFriendsListChange: null,
      onConnectionStatusChange: null,
      // ⭐ Phase-2: Quick Access real-time callback
      onQuickAccessUpdated: null,
    };

    // 🔒 Auth state tracking to prevent false notifications
    this.isAuthStateChanging = false;

    // 🎯 Phase 1: Optimistic updates event system
    this.optimisticEventListeners = new Map();

    console.log(
      "🎛️ FriendsManager initialized with real-time capabilities and optimistic updates"
    );
  }

  /**
   * 📦 Simple cache get with TTL expiration
   * @param {string} key - Cache key
   * @returns {*} Cached data or null if expired/missing
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * 💾 Simple cache set with automatic TTL cleanup
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   */
  setCached(key, data) {
    // Auto-cleanup expired entries when cache grows large
    if (this.cache.size > 50) {
      this.cleanupExpiredCache();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * 🧹 Clean up expired cache entries
   */
  cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 🗑️ Clear specific cache entry
   * @param {string} key - Cache key to clear
   */
  clearCache(key) {
    this.cache.delete(key);
  }

  /**
   * 🧹 Clear all cache entries
   */
  clearAllCache() {
    this.cache.clear();
  }

  /**
   * 🧹 Clear search filter cache when friendships change
   * This ensures search results are updated when someone becomes a friend
   */
  clearSearchFilterCache() {
    const cacheKey = `filter_data_${currentUser.uid}`;
    this.clearCache(cacheKey);
    console.log("🧹 Cleared search filter cache due to friendship change");
  }

  // =========================
  // REAL-TIME INTEGRATION
  // =========================

  /**
   * 🎛️ Start real-time listening for friend updates
   * This connects the FriendsManager to the RealTimeManager for instant updates
   */
  async startRealTimeListening() {
    try {
      // Wait for proper authentication with timeout
      const userProfile = await currentUser.waitForProfileWithTimeout(5000);
      if (!userProfile) {
        console.error(
          "❌ Cannot start real-time listening: User not logged in"
        );
        return;
      }

      // Additional validation
      if (!currentUser.isLoggedIn() || !currentUser.uid) {
        console.warn(
          "⚠️ Authentication not fully established, delaying real-time listeners"
        );
        return;
      }

      if (this.isRealTimeActive) {
        console.log("🎛️ Real-time listening already active");
        return;
      }

      // Prevent race conditions by setting flag immediately
      this.isRealTimeActive = true;
      console.log("🎛️ Starting real-time listening for friends...");

      // Subscribe to friend requests changes
      const friendRequestsUnsubscribe = realTimeManager.on(
        REALTIME_EVENTS.FRIEND_REQUESTS,
        (requests) => {
          console.log("📬 Real-time friend requests update:", requests.length);
          this.handleFriendRequestsUpdate(requests);
        }
      );

      // Subscribe to outgoing friend requests changes
      const outgoingRequestsUnsubscribe = realTimeManager.on(
        REALTIME_EVENTS.OUTGOING_FRIEND_REQUESTS,
        (requests) => {
          console.log(
            "📤 Real-time outgoing friend requests update:",
            requests.length
          );
          this.handleOutgoingFriendRequestsUpdate(requests);
        }
      );

      // Subscribe to friendships changes
      const friendshipsUnsubscribe = realTimeManager.on(
        REALTIME_EVENTS.FRIENDSHIPS,
        (friendships) => {
          console.log("🤝 Real-time friendships update:", friendships.length);
          this.handleFriendshipsUpdate(friendships);
        }
      );

      // Subscribe to connection status
      const connectionUnsubscribe = realTimeManager.on(
        REALTIME_EVENTS.CONNECTION_STATUS,
        (status) => {
          console.log("📡 Real-time connection status:", status);
          this.handleConnectionStatusUpdate(status);
        }
      );

      // Store unsubscribers for cleanup
      this.unsubscribers.push(
        friendRequestsUnsubscribe,
        outgoingRequestsUnsubscribe,
        friendshipsUnsubscribe,
        connectionUnsubscribe
      );

      // Start the RealTimeManager with proper error handling
      await realTimeManager.startListening(currentUser.uid);

      console.log("✅ Real-time listening started for friends");
    } catch (error) {
      console.error("❌ Error starting real-time listening:", error);
      this.isRealTimeActive = false;
      // Clean up any partial subscriptions
      this.stopRealTimeListening();
    }
  }

  /**
   * 🛑 Stop real-time listening
   */
  stopRealTimeListening() {
    if (!this.isRealTimeActive) {
      return;
    }

    console.log("🛑 Stopping real-time listening for friends...");

    // Set auth state changing flag to prevent false notifications
    this.isAuthStateChanging = true;

    // Unsubscribe from all real-time events
    this.unsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.error("❌ Error unsubscribing:", error);
      }
    });

    this.unsubscribers = [];
    this.isRealTimeActive = false;

    // Clear previous requests state to prevent false notifications on next login
    this.previousOutgoingRequests = null;

    // PHASE 1: Clean up optimistic event listeners
    this.optimisticEventListeners.clear();

    // Clear the flag after a short delay to allow cleanup to complete
    setTimeout(() => {
      this.isAuthStateChanging = false;
    }, 1000);

    console.log("✅ Real-time listening stopped");
  }

  /**
   * 📬 Handle real-time friend requests updates
   * @param {Array} requests - Updated friend requests
   * @private
   */
  handleFriendRequestsUpdate(requests) {
    try {
      // Transform the data for UI consistency
      const transformedRequests = requests.map((request) => ({
        ...request,
        displayName:
          request.displayName ||
          request.fromUserInfo?.displayName ||
          "Unknown User",
        major: request.major || request.fromUserInfo?.major || "Unknown Major",
        university:
          request.university ||
          request.fromUserInfo?.university ||
          "Unknown University",
      }));

      // Notify UI callback if registered
      if (this.uiCallbacks.onFriendRequestsChange) {
        this.uiCallbacks.onFriendRequestsChange(transformedRequests);
      }
    } catch (error) {
      console.error("❌ Error handling friend requests update:", error);
    }
  }

  /**
   * 📤 Handle real-time outgoing friend requests updates
   * @param {Array} requests - Updated outgoing friend requests
   * @private
   */
  handleOutgoingFriendRequestsUpdate(requests) {
    try {
      // Transform the data for UI consistency
      const transformedRequests = requests.map((request) => ({
        ...request,
        displayName:
          request.displayName ||
          request.toUserInfo?.displayName ||
          "Unknown User",
        major: request.major || request.toUserInfo?.major || "Unknown Major",
        university:
          request.university ||
          request.toUserInfo?.university ||
          "Unknown University",
      }));

      // Check for status changes that need notifications
      this.checkForFriendRequestStatusChanges(transformedRequests);

      // Notify UI callback if registered
      if (this.uiCallbacks.onOutgoingFriendRequestsChange) {
        this.uiCallbacks.onOutgoingFriendRequestsChange(transformedRequests);
      }
    } catch (error) {
      console.error(
        "❌ Error handling outgoing friend requests update:",
        error
      );
    }
  }

  /**
   * 🔔 Check for friend request status changes and show notifications
   * Enhanced to detect deletions for clean lifecycle approach
   * @param {Array} currentRequests - Current outgoing requests
   * @private
   */
  async checkForFriendRequestStatusChanges(currentRequests) {
    // Skip processing during auth state changes to prevent false notifications
    if (this.isAuthStateChanging) {
      console.log(
        "⏸️ Skipping friend request status check during auth state change"
      );
      return;
    }

    // Store previous requests for comparison
    if (!this.previousOutgoingRequests) {
      this.previousOutgoingRequests = currentRequests;
      return;
    }

    // 1. Check for traditional status changes (pending → accepted/rejected)
    currentRequests.forEach((currentRequest) => {
      const previousRequest = this.previousOutgoingRequests.find(
        (req) => req.id === currentRequest.id
      );

      if (previousRequest && previousRequest.status !== currentRequest.status) {
        this.showFriendRequestStatusNotification(currentRequest);
      }
    });

    // 2. NEW: Check for deleted requests (clean lifecycle approach)
    const deletedRequests = this.previousOutgoingRequests.filter(
      (previousRequest) =>
        !currentRequests.find(
          (currentRequest) => currentRequest.id === previousRequest.id
        )
    );

    // 3. For each deleted request, determine if it was accepted or rejected (parallel execution)
    if (deletedRequests.length > 0) {
      const friendshipChecks = deletedRequests.map(async (deletedRequest) => {
        try {
          const friendshipExists = await dataManager.checkFriendshipExists(
            deletedRequest.fromUserId,
            deletedRequest.toUserId
          );
          return { request: deletedRequest, friendshipExists, error: null };
        } catch (error) {
          console.error(
            "❌ Error checking friendship for deleted request:",
            error
          );
          return { request: deletedRequest, friendshipExists: false, error };
        }
      });

      const results = await Promise.all(friendshipChecks);

      // Process results and show notifications
      results.forEach(
        ({ request: deletedRequest, friendshipExists, error }) => {
          if (error) {
            // Don't assume rejection for permission errors during auth state changes
            if (error.code === "permission-denied") {
              console.warn(
                "⚠️ Friendship check permission denied (likely auth state change), skipping notification:",
                deletedRequest.id
              );
              return; // Skip notification for permission errors
            }
            console.warn(
              "⚠️ Friendship check failed, assuming rejection for:",
              deletedRequest.id
            );
          }

          if (friendshipExists) {
            // Request was deleted + friendship exists = ACCEPTED
            console.log(
              "🎉 Detected friend request acceptance via deletion + friendship"
            );
            this.showFriendRequestStatusNotification({
              ...deletedRequest,
              status: "accepted",
            });
          } else {
            // Request was deleted + no friendship = REJECTED
            console.log("❌ Detected friend request rejection via deletion");
            this.showFriendRequestStatusNotification({
              ...deletedRequest,
              status: "rejected",
            });
          }
        }
      );
    }

    // Update previous requests
    this.previousOutgoingRequests = currentRequests;
  }

  /**
   * 🔔 Show notification for friend request status change
   * @param {Object} request - The friend request that changed
   * @private
   */
  showFriendRequestStatusNotification(request) {
    try {
      if (request.status === "accepted") {
        notificationManager.showFriendAcceptedNotification({
          displayName: request.displayName,
          major: request.major,
          university: request.university,
        });
      } else if (request.status === "rejected") {
        console.log(`${request.displayName} declined your friend request`);
      }
    } catch (error) {
      console.error("❌ Error showing notification:", error);
      // Fallback: Log notification that would have been shown
      console.log(
        `📢 Notification (fallback): Friend request ${request.status} - ${request.displayName}`
      );
    }
  }

  /**
   * 🤝 Handle real-time friendships updates
   * @param {Array} friendships - Updated friendships
   * @private
   */
  async handleFriendshipsUpdate(friendships) {
    console.log(`🔄 FRIENDS: handleFriendshipsUpdate called with ${friendships.length} friendships`);
    console.log(`🔄 FRIENDS: Friendship data:`, friendships.map(f => ({ id: f.id, friendId: f.friendId, users: f.users })));

    // Transform friendships data to match existing format
    const transformedFriends = friendships.map((friendship) => ({
      id: friendship.friendId,
      friendshipId: friendship.id,
      displayName: friendship.friendInfo?.displayName || "Unknown User",
      major: friendship.friendInfo?.major || "Unknown Major",
      avatarConfig: friendship.friendInfo?.avatarConfig || null,
      friendsSince: friendship.createdAt,
      lastInteraction: friendship.lastInteraction,
      connectionStrength: friendship.connectionStrength || "normal",
      isOnline: false,
      mutualFriends: friendship.mutualFriends || 0,
    }));

    // 🔄 PHASE 2: Enhanced bilateral cleanup with document validation
    try {
      console.log(`🔄 PHASE 2: Starting bilateral cleanup validation`);
      const currentUserUid = currentUser?.uid;
      console.log(`🔄 PHASE 2: Current user UID: ${currentUserUid}`);
      if (currentUserUid) {
        // Get current friend IDs from real-time data
        const currentFriendIds = new Set(
          transformedFriends.map((f) => f.id).filter(Boolean)
        );

        // Get current quickAccessData
        const { dataManager } = await import("../data/DataService.js");
        const quickAccessData = await dataManager.getQuickAccessFriends(
          currentUserUid
        );

        if (quickAccessData?.starredFriends?.length > 0) {
          console.log(
            `🔍 PHASE 2: Validating ${quickAccessData.starredFriends.length} quickAccess friends against ${currentFriendIds.size} current friendships`
          );

          // Extract friend IDs from starred friends objects
          const starredFriendIds = quickAccessData.starredFriends.map(
            (friend) => friend.friendId
          );
          console.log(
            `📋 PHASE 2: Checking these starred friend IDs:`,
            starredFriendIds
          );

          // PHASE 2: Validate friendship documents exist for each starred friend
          const validatedFriends = await this.validateFriendshipDocuments(
            starredFriendIds,
            currentUserUid
          );

          console.log(
            `✅ PHASE 2: Validated friends (have valid documents):`,
            Array.from(validatedFriends)
          );

          // Find friends whose documents no longer exist (regardless of real-time data)
          // If friendship document is gone, remove from starred friends immediately
          const staleFormerFriends = starredFriendIds.filter(
            (friendId) => !validatedFriends.has(friendId)
          );

          console.log(
            `🔍 PHASE 2: Stale friends to remove:`,
            staleFormerFriends
          );

          // PHASE 2: Batch remove stale friends for performance
          if (staleFormerFriends.length > 0) {
            console.log(
              `🧹 PHASE 2: Found ${staleFormerFriends.length} stale friends to remove from quickAccess`
            );
            await this.batchRemoveFromQuickAccess(
              currentUserUid,
              staleFormerFriends
            );

            // Clear caches to ensure UI updates properly
            console.log(
              `🧹 PHASE 2: Clearing caches after stale friend removal`
            );
            this.clearCache(`quick_access_${currentUserUid}`);
            const { dataManager } = await import("../data/DataService.js");
            dataManager.clearCache(`quick_access_${currentUserUid}`);
          } else {
            console.log(
              `✅ PHASE 2: All quickAccess friends validated successfully - no cleanup needed`
            );
          }
        }
      }
    } catch (error) {
      console.warn("⚠️ Error during enhanced quickAccessData cleanup:", error);
    }

    // Notify UI callback if registered
    if (this.uiCallbacks.onFriendsListChange) {
      this.uiCallbacks.onFriendsListChange(transformedFriends);
    }
  }

  /**
   * 📡 Handle real-time connection status updates
   * @param {Object} status - Connection status
   * @private
   */
  handleConnectionStatusUpdate(status) {
    console.log("📡 Connection status update:", status);

    // Notify UI callback if registered
    if (this.uiCallbacks.onConnectionStatusChange) {
      this.uiCallbacks.onConnectionStatusChange(status);
    }
  }

  /**
   * 🎯 Register UI callbacks for real-time updates
   * @param {Object} callbacks - Object with callback functions
   */
  registerUICallbacks(callbacks) {
    this.uiCallbacks = {
      onFriendRequestsChange: callbacks.onFriendRequestsChange || null,
      onOutgoingFriendRequestsChange:
        callbacks.onOutgoingFriendRequestsChange || null,
      onFriendsListChange: callbacks.onFriendsListChange || null,
      onConnectionStatusChange: callbacks.onConnectionStatusChange || null,
      // ⭐ Phase-2: Quick Access real-time callback
      onQuickAccessUpdated: callbacks.onQuickAccessUpdated || null,
    };

    console.log("🎯 UI callbacks registered for real-time updates");
  }

  /**
   * 🔍 Search for students at the same university (with optional caching)
   * @param {string} searchTerm - Name or major to search for
   * @param {boolean} useCache - Whether to use caching (default: false)
   * @returns {Promise<Array>} Array of matching students
   */
  async searchStudents(searchTerm, useCache = false) {
    // 1. Get the current user's profile, waiting for it if necessary.
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      console.error(
        "❌ User profile not loaded or user not logged in. Cannot search."
      );
      return [];
    }

    if (!searchTerm || searchTerm.trim().length < 2) {
      return []; // Don't search for very short terms
    }

    const cleanTerm = searchTerm.trim().toLowerCase();

    // If caching is requested, try cache first
    if (useCache) {
      const cacheKey = `search_${cleanTerm}_${userProfile.universityInfo.university}`;
      const cachedResults = this.getCached(cacheKey);
      if (cachedResults) {
        console.log("📦 Using cached search results");
        return cachedResults;
      }
    }

    try {
      // 2. Fetch users directly using the optimized search function
      const students = await dataManager.findUsersByUniversity(
        userProfile.universityInfo.university,
        searchTerm,
        10 // Limit to 10 results for fast display
      );

      // 3. Use our smart filtering to exclude friends and pending requests
      const filteredStudents = await this.filterSearchResults(students);

      // Cache results if caching was requested and we got results
      if (useCache && filteredStudents.length > 0) {
        const cacheKey = `search_${cleanTerm}_${userProfile.universityInfo.university}`;
        this.setCached(cacheKey, filteredStudents);
      }

      console.log(
        `✅ Found ${filteredStudents.length} students matching "${searchTerm}"`
      );
      return filteredStudents;
    } catch (error) {
      console.error("❌ Error searching students:", error);
      return [];
    }
  }

  /**
   * 🚫 Filter out existing friends and pending requests from search results
   * @param {Array} searchResults - Raw search results from database
   * @returns {Promise<Array>} Filtered results ready for display
   */
  async filterSearchResults(searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return [];
    }

    // Cache key for filtering data
    const cacheKey = `filter_data_${currentUser.uid}`;
    let filterData = this.getCached(cacheKey);

    if (!filterData) {
      try {
        // Get current friendships and incoming pending requests for filtering
        // This runs both queries at the same time (parallel = faster!)
        const [friendships, incomingRequests] = await Promise.all([
          this.getFriendsList(),
          this.getPendingRequests(),
        ]);

        // Create fast lookup sets and cache them
        // Only filter out actual friends and users who sent requests TO me (not users I sent requests to)
        filterData = {
          friendIds: new Set(friendships.map((f) => f.id)),
          incomingRequestIds: new Set(
            incomingRequests.map((r) => r.fromUserId)
          ),
        };

        // Cache for 2 minutes (shorter than general cache since this changes more often)
        this.setCached(cacheKey, filterData);
      } catch (error) {
        console.error("❌ Error getting filter data:", error);
        return searchResults.filter(
          (student) => student.id !== currentUser.uid
        );
      }
    }

    console.log(
      `📊 Excluding: ${filterData.friendIds.size} friends, ${filterData.incomingRequestIds.size} incoming requests`
    );

    // Filter out unwanted results
    const filteredResults = searchResults.filter((student) => {
      return (
        student.id !== currentUser.uid &&
        !filterData.friendIds.has(student.id) &&
        !filterData.incomingRequestIds.has(student.id)
      );
    });

    console.log(
      `✅ ${filteredResults.length} students available for friend requests`
    );
    return filteredResults;
  }

  /**
   * 🎓 Search students by major (find your classmates!)
   * @param {string} major - Major to search for (e.g., "Computer Science")
   * @returns {Promise<Array>} Students in that major
   */
  async searchByMajor(major) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !major) {
      return [];
    }

    try {
      console.log(`🎓 Searching for ${major} students...`);

      // Use the data manager to find users by major
      // The major_lower field was created in Phase 1A for fast searching
      const students = await dataManager.findUsersByMajor(
        userProfile.universityInfo.university,
        major,
        15 // Slightly higher limit for major search
      );

      // Apply smart filtering
      const filteredStudents = await this.filterSearchResults(students);

      console.log(`✅ Found ${filteredStudents.length} ${major} students`);
      return filteredStudents;
    } catch (error) {
      console.error("❌ Error searching by major:", error);
      return [];
    }
  }

  /**
   * 🔍 Search students with caching (convenience method)
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Search results (cached when possible)
   */
  async searchStudentsWithCache(searchTerm) {
    // Use the consolidated search function with caching enabled
    return this.searchStudents(searchTerm, true);
  }

  /**
   * 🎓 Search by major with caching (convenience method)
   * @param {string} major - Major to search for
   * @returns {Promise<Array>} Search results (cached when possible)
   */
  async searchByMajorWithCache(major) {
    // Use the existing searchByMajor with caching logic
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !major) {
      return [];
    }

    const cacheKey = `major_${major.toLowerCase()}_${
      userProfile.universityInfo.university
    }`;

    // Try cache first
    const cachedResults = this.getCached(cacheKey);
    if (cachedResults) {
      console.log("📦 Using cached major search results");
      return cachedResults;
    }

    // Perform search and cache results
    const results = await this.searchByMajor(major);
    if (results.length > 0) {
      this.setCached(cacheKey, results);
    }

    return results;
  }

  /**
   * 📩 Send a friend request to another student
   * @param {string} targetUserId - The user ID to send request to
   * @param {Object} targetUserData - Basic info about the target user
   * @returns {Promise<Object>} Success/failure result
   */
  async sendFriendRequest(targetUserId, targetUserData) {
    // 1. Get the current user's profile, waiting for it if necessary.
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return {
        success: false,
        message: "Please log in to send friend requests.",
      };
    }

    if (!targetUserId || !targetUserData) {
      console.error("❌ Target user information missing");
      return { success: false, message: "Invalid user selected" };
    }

    if (targetUserId === currentUser.uid) {
      return {
        success: false,
        message: "You cannot send a friend request to yourself!",
      };
    }

    try {
      console.log(
        "📩 Sending friend request to:",
        targetUserData.profile?.displayName
      );

      // 2. Check if request already exists
      const existingRequest = await dataManager.checkExistingFriendRequest(
        currentUser.uid,
        targetUserId
      );

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          return { success: false, message: "Friend request already sent!" };
        } else if (existingRequest.status === "accepted") {
          return { success: false, message: "You are already friends!" };
        } else if (existingRequest.status === "rejected") {
          // Delete the old rejected request before creating a new one
          console.log(
            "🗑️ Deleting old rejected request before sending new one"
          );
          await dataManager.deleteFriendRequest(existingRequest.id);
        }
      }

      // 3. Create the friend request object
      const requestData = {
        fromUserId: currentUser.uid,
        toUserId: targetUserId,
        status: "pending",
        fromUserInfo: {
          displayName: userProfile.profile.displayName,
          major: userProfile.profile.major,
          university: userProfile.universityInfo.university,
          avatarConfig: userProfile.avatarConfig,
        },
        toUserInfo: {
          displayName: targetUserData.profile.displayName,
          major: targetUserData.profile.major,
          university: targetUserData.universityInfo.university,
          avatarConfig: targetUserData.avatarConfig,
        },
      };

      // 4. Save to database
      const result = await dataManager.createFriendRequest(requestData);

      if (result.success) {
        // Clear search filter cache since pending request status changed
        this.clearSearchFilterCache();

        console.log("✅ Friend request sent successfully!");
        return {
          success: true,
          message: `Friend request sent to ${targetUserData.profile.displayName}!`,
        };
      } else {
        return {
          success: false,
          message: "Failed to send friend request. Please try again.",
        };
      }
    } catch (error) {
      console.error("❌ Error sending friend request:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * 📬 Get pending friend requests for current user
   * @returns {Promise<Array>} Array of pending requests
   */
  async getPendingRequests() {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      console.error("❌ User not logged in. Cannot get pending requests.");
      return [];
    }

    try {
      console.log(
        "📬 Getting pending requests for:",
        userProfile.profile.displayName
      );
      const pendingRequests = await dataManager.getPendingFriendRequests(
        currentUser.uid
      );
      console.log(`✅ Found ${pendingRequests.length} pending friend requests`);
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
   * ✅ Accept a friend request
   * @param {string} requestId - The request ID to accept
   * @param {Object} requestData - The request data
   * @returns {Promise<Object>} Success/failure result
   */
  async acceptFriendRequest(requestId, requestData) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return { success: false, message: "Please log in to accept requests." };
    }

    if (!requestId || !requestData) {
      console.error("❌ Missing request ID or data");
      return { success: false, message: "Invalid request data" };
    }

    // 🔒 Security check: Make sure this request is actually for the current user
    if (requestData.toUserId !== currentUser.uid) {
      console.error("❌ Security violation: Request not for current user");
      return {
        success: false,
        message: "You can only accept your own friend requests",
      };
    }

    try {
      console.log(
        "✅ Accepting friend request from:",
        requestData.fromUserInfo?.displayName
      );

      // 🎯 STEP 1: Create the friendship document first
      // (We'll delete the request after successful friendship creation)

      // 🎯 STEP 1: Create the friendship document with bilateral privacy
      const friendshipData = {
        users: [requestData.fromUserId, requestData.toUserId], // Array for easy querying
        user1Id: requestData.fromUserId,
        user2Id: requestData.toUserId,
        createdAt: new Date(),
        mutualFriends: 0,
        lastInteraction: new Date(),

        // Cache user info from the request (already available!)
        user1Info: {
          displayName: requestData.fromUserInfo.displayName,
          major: requestData.fromUserInfo.major,
          avatarConfig:
            requestData.fromUserInfo.avatarConfig ||
            requestData.fromUserInfo.avatar,
        },

        user2Info: {
          displayName: requestData.toUserInfo.displayName,
          major: requestData.toUserInfo.major,
          avatarConfig:
            requestData.toUserInfo.avatarConfig ||
            requestData.toUserInfo.avatar ||
            userProfile.avatarConfig,
        },

        // 🔐 NEW: Bilateral Privacy Controls (default to visible)
        scheduleVisibility: {
          [requestData.fromUserId]: true, // User1's schedule IS visible to User2 (default: visible)
          [requestData.toUserId]: true, // User2's schedule IS visible to User1 (default: visible)
        },

        // Privacy metadata for auditing and debugging
        privacyMetadata: {
          lastPrivacyUpdate: new Date(),
          privacyUpdatedBy: null, // Last user who modified privacy settings
          privacyVersion: 1, // For future privacy feature migrations
        },
      };

      const friendshipResult = await dataManager.createFriendship(
        friendshipData
      );

      if (!friendshipResult.success) {
        console.error("❌ Failed to create friendship");
        return { success: false, message: "Failed to create friendship" };
      }

      // 🎯 STEP 2: Delete the friend request (clean lifecycle approach)
      console.log(
        "🗑️ Deleting friend request after successful friendship creation"
      );
      const deleteResult = await dataManager.deleteFriendRequest(requestId);
      if (!deleteResult.success) {
        console.warn(
          "⚠️ Friendship created but failed to delete request:",
          deleteResult.error
        );
        // Don't fail the operation, just log the warning
      }

      // 🎯 STEP 3: Clear search filter cache since friendship status changed
      this.clearSearchFilterCache();

      console.log("🎉 Friend request accepted successfully!");
      const friendName = requestData.fromUserInfo?.displayName || "New friend";

      return {
        success: true,
        message: `You are now friends with ${friendName}!`,
        friendshipId: friendshipResult.friendshipId,
      };
    } catch (error) {
      console.error("❌ Error accepting friend request:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * ❌ Reject a friend request
   * @param {string} requestId - The request ID to reject
   * @param {Object} requestData - The request data (optional, for user feedback)
   * @returns {Promise<Object>} Success/failure result
   */
  async rejectFriendRequest(requestId, requestData = null) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return { success: false, message: "Please log in to reject requests." };
    }

    if (!requestId) {
      console.error("❌ Missing request ID");
      return { success: false, message: "Invalid request" };
    }

    try {
      const senderName = requestData?.fromUserInfo?.displayName || "User";
      console.log("❌ Rejecting friend request from:", senderName);

      // 🎯 Delete the friend request (clean lifecycle approach)
      // Real-time listeners will detect the deletion and show rejection notification
      console.log("🗑️ Deleting friend request to reject it");
      const result = await dataManager.deleteFriendRequest(requestId);

      if (result.success) {
        console.log("✅ Friend request rejected successfully via deletion");
        return {
          success: true,
          message: `Friend request from ${senderName} was declined`,
        };
      } else {
        return {
          success: false,
          message: "Failed to reject request. Please try again.",
        };
      }
    } catch (error) {
      console.error("❌ Error rejecting friend request:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * 💔 Unfriend a user (remove friendship) with optimistic updates
   * @param {string} friendId - The ID of the friend to unfriend
   * @param {string} friendshipId - The friendship document ID
   * @param {Object} friendInfo - Friend's info for confirmation message
   * @returns {Promise<Object>} Success/failure result
   */
  async unfriendUser(friendId, friendshipId, friendInfo = {}) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return { success: false, message: "Please log in to manage friends." };
    }

    if (!friendId || !friendshipId) {
      console.error("❌ Missing friend ID or friendship ID");
      return { success: false, message: "Invalid friend data" };
    }

    if (friendId === currentUser.uid) {
      return {
        success: false,
        message: "You cannot unfriend yourself!",
      };
    }

    try {
      const friendName = friendInfo.displayName || "Friend";
      console.log("💔 Unfriending user:", friendName);

      // 🎯 PHASE 1: Optimistic Updates - Publish optimistic unfriending event FIRST
      console.log(
        "🚀 Publishing optimistic unfriending event for immediate UI update"
      );
      this.publishOptimisticUnfriending(friendId, friendInfo);

      // Delete the friendship document
      const result = await dataManager.deleteFriendship(friendshipId);

      if (result.success) {
        // Clear search filter cache since friendship status changed
        this.clearSearchFilterCache();

        console.log("✅ Successfully unfriended user:", friendName);

        // Publish success confirmation event
        this.publishOptimisticSuccess(friendId, {
          ...friendInfo,
          action: "unfriend",
          confirmed: true,
        });

        return {
          success: true,
          message: `You are no longer friends with ${friendName}`,
          unfriendedUser: {
            id: friendId,
            displayName: friendName,
          },
        };
      } else {
        console.error("❌ Failed to delete friendship:", result.error);

        // 🔄 PHASE 1: Error Recovery - Roll back optimistic updates
        console.log(
          "🔄 Rolling back optimistic unfriending due to database error"
        );
        this.rollbackOptimisticUnfriending(friendId, friendInfo);

        return {
          success: false,
          message: "Failed to unfriend user. Please try again.",
        };
      }
    } catch (error) {
      console.error("❌ Error unfriending user:", error);

      // 🔄 PHASE 1: Error Recovery - Roll back optimistic updates
      console.log(
        "🔄 Rolling back optimistic unfriending due to unexpected error"
      );
      this.rollbackOptimisticUnfriending(friendId, friendInfo);

      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * 👥 Get the current user's friends list with smart avatar caching
   * @returns {Promise<Array>} Array of friends with their info
   */
  async getFriendsList() {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      console.error("❌ Cannot get friends list, user not logged in.");
      return [];
    }

    try {
      console.log(
        "👥 Getting friends list for:",
        userProfile.profile.displayName
      );
      const friendships = await dataManager.getUserFriendships(currentUser.uid);

      if (!friendships.length) {
        console.log("👥 No friends found");
        return [];
      }

      // 🎯 Transform friendship documents with simple avatar handling
      const friends = friendships.map((friendship) => {
        // Determine which user info to show (the friend, not the current user)
        const isUser1 = friendship.user1Id === currentUser.uid;
        const friendInfo = isUser1
          ? friendship.user2Info
          : friendship.user1Info;
        const friendId = isUser1 ? friendship.user2Id : friendship.user1Id;

        return {
          // Friend identification
          id: friendId,
          friendshipId: friendship.id,

          // Friend details (cached in friendship document - no extra queries!)
          displayName: friendInfo?.displayName || "Unknown User",
          major: friendInfo?.major || "Unknown Major",
          avatarConfig: friendInfo?.avatarConfig || null,

          // Friendship metadata
          friendsSince: friendship.createdAt,
          lastInteraction: friendship.lastInteraction,
          connectionStrength: friendship.connectionStrength || "normal",

          // UI helpers
          isOnline: false, // TODO: Add real-time status in Phase 5
          mutualFriends: friendship.mutualFriends || 0,
        };
      });

      // 🎯 Sort friends by when they became friends (newest first)
      friends.sort((a, b) => {
        const dateA = a.friendsSince?.toDate?.() || new Date(a.friendsSince);
        const dateB = b.friendsSince?.toDate?.() || new Date(b.friendsSince);
        return dateB - dateA;
      });

      // 🧹 Cleanup expired caches periodically
      if (Math.random() < 0.1) {
        // 10% chance to run cleanup
        this.cleanupExpiredCache();
      }

      console.log(`🎉 Successfully processed ${friends.length} friends`);
      return friends;
    } catch (error) {
      console.error("❌ Error getting friends list:", error);
      return [];
    }
  }

  // =========================
  // PHASE 1: OPTIMISTIC UPDATES EVENT SYSTEM
  // =========================

  /**
   * 🎯 Phase 1: Publish optimistic unfriending event for immediate UI response
   * @param {string} friendId - The friend being unfriended
   * @param {Object} friendInfo - Friend's display information
   */
  publishOptimisticUnfriending(friendId, friendInfo) {
    const event = {
      type: "optimistic-unfriending",
      friendId,
      friendInfo,
      timestamp: Date.now(),
      userId: currentUser.uid,
    };

    console.log("🚀 Publishing optimistic unfriending event:", event);
    this.publishOptimisticEvent("optimistic-unfriending", event);

    // Also notify via notification service for user feedback
    if (notificationManager && friendInfo.displayName) {
      notificationManager.showSystemNotification(
        `Unfriending ${friendInfo.displayName}...`,
        "info",
        { duration: 2000 }
      );
    }
  }

  /**
   * 🎯 Phase 1: Publish optimistic success confirmation
   * @param {string} friendId - The friend ID
   * @param {Object} eventData - Success event data
   */
  publishOptimisticSuccess(friendId, eventData) {
    const event = {
      type: "optimistic-success",
      friendId,
      ...eventData,
      timestamp: Date.now(),
      userId: currentUser.uid,
    };

    console.log("✅ Publishing optimistic success event:", event);
    this.publishOptimisticEvent("optimistic-success", event);
  }

  /**
   * 🔄 Phase 1: Roll back optimistic unfriending on database operation failure
   * @param {string} friendId - The friend ID
   * @param {Object} friendInfo - Friend's display information
   */
  rollbackOptimisticUnfriending(friendId, friendInfo) {
    const event = {
      type: "optimistic-rollback",
      friendId,
      friendInfo,
      action: "unfriend",
      timestamp: Date.now(),
      userId: currentUser.uid,
    };

    console.log("🔄 Publishing optimistic rollback event:", event);
    this.publishOptimisticEvent("optimistic-rollback", event);

    // Show error notification
    if (notificationManager && friendInfo.displayName) {
      notificationManager.showSystemNotification(
        `Failed to unfriend ${friendInfo.displayName}. Please try again.`,
        "error",
        { duration: 4000 }
      );
    }
  }

  /**
   * 🎯 Phase 1: Generic optimistic event publisher
   * @param {string} eventType - Type of optimistic event
   * @param {Object} eventData - Event data to publish
   */
  publishOptimisticEvent(eventType, eventData) {
    // Emit via realTimeManager for consistency with existing event system
    if (realTimeManager && typeof realTimeManager.emit === "function") {
      realTimeManager.emit(eventType, eventData);
    }

    // Also trigger local listeners
    const listeners = this.optimisticEventListeners.get(eventType) || [];
    listeners.forEach((listener) => {
      try {
        listener(eventData);
      } catch (error) {
        console.error(
          `❌ Error in optimistic event listener for ${eventType}:`,
          error
        );
      }
    });
  }

  /**
   * 🎯 Phase 1: Subscribe to optimistic events
   * @param {string} eventType - Type of event to listen for
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  onOptimisticEvent(eventType, callback) {
    if (!this.optimisticEventListeners.has(eventType)) {
      this.optimisticEventListeners.set(eventType, []);
    }

    const listeners = this.optimisticEventListeners.get(eventType);
    listeners.push(callback);

    console.log(`🎯 Added optimistic event listener for: ${eventType}`);

    // Return unsubscribe function
    return () => {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
        console.log(`🎯 Removed optimistic event listener for: ${eventType}`);
      }
    };
  }

  // =========================
  // PHASE 2: FRIENDSHIP DOCUMENT VALIDATION LAYER
  // =========================

  /**
   * 🔍 PHASE 2: Validate friendship documents exist for given friend IDs
   * @param {Array<string>} friendIds - Friend IDs to validate
   * @param {string} currentUserUid - Current user's UID
   * @returns {Promise<Set<string>>} Set of friend IDs with valid friendship documents
   */
  async validateFriendshipDocuments(friendIds, currentUserUid) {
    const validFriends = new Set();

    if (!friendIds || friendIds.length === 0) {
      console.log("🔍 PHASE 2: No friend IDs to validate");
      return validFriends;
    }

    console.log(
      `🔍 PHASE 2: Validating ${friendIds.length} friendship documents`
    );

    // Batch check friendship documents for performance
    const friendshipChecks = friendIds.map(async (friendId) => {
      try {
        const friendshipExists = await dataManager.checkFriendshipExists(
          currentUserUid,
          friendId
        );

        if (friendshipExists) {
          validFriends.add(friendId);
          console.log(
            `✅ PHASE 2: Friendship document validated for ${friendId}`
          );
        } else {
          console.log(
            `❌ PHASE 2: No friendship document found for ${friendId}`
          );
        }

        return { friendId, exists: friendshipExists };
      } catch (error) {
        console.error(
          `❌ PHASE 2: Error validating friendship for ${friendId}:`,
          error
        );
        return { friendId, exists: false, error };
      }
    });

    // Execute all validation checks in parallel
    const results = await Promise.allSettled(friendshipChecks);

    // Log summary
    const successfulChecks = results.filter(
      (r) => r.status === "fulfilled"
    ).length;
    const validCount = validFriends.size;
    const invalidCount = friendIds.length - validCount;

    console.log(
      `🔍 PHASE 2: Validation complete - ${successfulChecks}/${friendIds.length} checks successful, ${validCount} valid, ${invalidCount} invalid friendships`
    );

    return validFriends;
  }

  /**
   * 🧹 PHASE 2: Batch remove friends from quickAccess for performance
   * @param {string} userId - User ID to clean up
   * @param {Array<string>} friendIds - Friend IDs to remove
   * @returns {Promise<void>}
   */
  async batchRemoveFromQuickAccess(userId, friendIds) {
    if (!friendIds || friendIds.length === 0) {
      console.log("🧹 PHASE 2: No friends to remove from quickAccess");
      return;
    }

    console.log(
      `🧹 PHASE 2: Batch removing ${friendIds.length} stale friends from quickAccess`
    );

    // Efficient batch removal with error handling
    const removePromises = friendIds.map(async (friendId) => {
      try {
        const result = await dataManager.removeFromQuickAccess(
          userId,
          friendId
        );
        if (result.success) {
          console.log(
            `🧹 PHASE 2: Successfully removed ${friendId} from quickAccess`
          );
        } else {
          console.warn(
            `⚠️ PHASE 2: Failed to remove ${friendId} from quickAccess:`,
            result.error
          );
        }
        return { friendId, success: result.success };
      } catch (error) {
        console.error(
          `❌ PHASE 2: Error removing ${friendId} from quickAccess:`,
          error
        );
        return { friendId, success: false, error };
      }
    });

    // Execute all removals in parallel with error resilience
    const results = await Promise.allSettled(removePromises);

    // Log summary
    const successfulRemovals = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;

    console.log(
      `🧹 PHASE 2: Batch cleanup complete - ${successfulRemovals}/${friendIds.length} friends successfully removed from quickAccess`
    );

    // Clear relevant caches after batch operations
    this.clearCache(`quick_access_${userId}`);
    if (dataManager.clearCache) {
      dataManager.clearCache(`quick_access_${userId}`);
    }
  }

  // =========================
  // PHASE-2: QUICK ACCESS FRIENDS SYSTEM
  // ========================="

  /**
   * ⭐ Add a friend to Quick Access (starred friends)
   * @param {string} friendId - The friend's user ID
   * @param {Object} friendInfo - Friend's display information
   * @returns {Promise<Object>} Success/failure result
   */
  async addToQuickAccess(friendId, friendInfo) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return {
        success: false,
        message: "Please log in to manage Quick Access.",
      };
    }

    if (!friendId || !friendInfo) {
      console.error("❌ Missing friend ID or info for Quick Access");
      return { success: false, message: "Invalid friend data" };
    }

    if (friendId === currentUser.uid) {
      return {
        success: false,
        message: "You cannot add yourself to Quick Access!",
      };
    }

    try {
      const friendName = friendInfo.displayName || "Friend";
      console.log("⭐ Adding to Quick Access:", friendName);

      // Check if friend is already in Quick Access
      const isAlreadyStarred = await this.isInQuickAccess(friendId);
      if (isAlreadyStarred) {
        // Update the interaction timestamp for recent-first ordering
        await this.updateQuickAccessOrder(friendId);
        return {
          success: true,
          message: `${friendName} is already in your Quick Access!`,
        };
      }

      // Create Quick Access entry with recent-first metadata
      const now = new Date();
      const quickAccessEntry = {
        friendId: friendId,
        displayName: friendInfo.displayName,
        major: friendInfo.major,
        avatarConfig: friendInfo.avatarConfig,
        starredAt: now,
        lastInteraction: now, // For recent-first ordering
      };

      // Save to database via dataManager
      const result = await dataManager.addToQuickAccess(
        currentUser.uid,
        quickAccessEntry
      );

      if (result.success) {
        // Clear Quick Access cache to force fresh data
        this.clearCache(`quick_access_${currentUser.uid}`);
        // Also clear DataManager cache
        dataManager.clearCache(`quick_access_${currentUser.uid}`);

        // ⭐ Trigger UI callback for immediate update (before real-time sync)
        if (this.uiCallbacks.onQuickAccessUpdated) {
          // Get updated Quick Access data and trigger callback
          this.getQuickAccessFriends(false)
            .then((quickAccessFriends) => {
              this.uiCallbacks.onQuickAccessUpdated({
                userId: currentUser.uid,
                quickAccessFriends: quickAccessFriends,
                count: quickAccessFriends.length,
                timestamp: Date.now(),
                action: "added",
                friendId: friendId,
              });
            })
            .catch((error) => {
              console.warn(
                "⚠️ Failed to trigger Quick Access UI callback:",
                error
              );
            });
        }

        console.log("✅ Successfully added to Quick Access:", friendName);
        return {
          success: true,
          message: `${friendName} added to Quick Access!`,
          friendId: friendId,
        };
      } else {
        return {
          success: false,
          message: "Failed to add to Quick Access. Please try again.",
        };
      }
    } catch (error) {
      console.error("❌ Error adding to Quick Access:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * ❌ Remove a friend from Quick Access (unstar)
   * @param {string} friendId - The friend's user ID to remove
   * @returns {Promise<Object>} Success/failure result
   */
  async removeFromQuickAccess(friendId) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return {
        success: false,
        message: "Please log in to manage Quick Access.",
      };
    }

    if (!friendId) {
      console.error("❌ Missing friend ID for Quick Access removal");
      return { success: false, message: "Invalid friend data" };
    }

    try {
      console.log("❌ Removing from Quick Access:", friendId);

      // Check if friend is in Quick Access
      const isCurrentlyStarred = await this.isInQuickAccess(friendId);
      if (!isCurrentlyStarred) {
        return {
          success: true,
          message: "Friend is not in Quick Access",
        };
      }

      // Remove from database via dataManager
      const result = await dataManager.removeFromQuickAccess(
        currentUser.uid,
        friendId
      );

      if (result.success) {
        // Clear Quick Access cache to force fresh data
        this.clearCache(`quick_access_${currentUser.uid}`);
        // Also clear DataManager cache
        dataManager.clearCache(`quick_access_${currentUser.uid}`);

        // ⭐ Trigger UI callback for immediate update (before real-time sync)
        if (this.uiCallbacks.onQuickAccessUpdated) {
          // Get updated Quick Access data and trigger callback
          this.getQuickAccessFriends(false)
            .then((quickAccessFriends) => {
              this.uiCallbacks.onQuickAccessUpdated({
                userId: currentUser.uid,
                quickAccessFriends: quickAccessFriends,
                count: quickAccessFriends.length,
                timestamp: Date.now(),
                action: "removed",
                friendId: friendId,
              });
            })
            .catch((error) => {
              console.warn(
                "⚠️ Failed to trigger Quick Access UI callback:",
                error
              );
            });
        }

        console.log("✅ Successfully removed from Quick Access:", friendId);
        return {
          success: true,
          message: "Removed from Quick Access!",
          removedFriendId: friendId,
        };
      } else {
        return {
          success: false,
          message: "Failed to remove from Quick Access. Please try again.",
        };
      }
    } catch (error) {
      console.error("❌ Error removing from Quick Access:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * 📋 Get Quick Access friends with recent-first ordering (unlimited)
   * @param {boolean} useCache - Whether to use caching (default: true)
   * @returns {Promise<Array>} Array of starred friends, ordered by most recent interaction first
   */
  async getQuickAccessFriends(useCache = true) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      console.error("❌ Cannot get Quick Access friends, user not logged in.");
      return [];
    }

    // Try cache first if requested
    if (useCache) {
      const cacheKey = `quick_access_${currentUser.uid}`;
      const cachedResults = this.getCached(cacheKey);
      if (cachedResults) {
        console.log("📦 Using cached Quick Access friends");
        return cachedResults;
      }
    }

    try {
      console.log(
        "📋 Getting Quick Access friends for:",
        userProfile.profile.displayName
      );

      // Get Quick Access data from database
      const quickAccessData = await dataManager.getQuickAccessFriends(
        currentUser.uid
      );

      if (!quickAccessData || !quickAccessData.starredFriends) {
        console.log("📋 No Quick Access friends found");
        return [];
      }

      // Sort by recent-first ordering (most recently interacted with first)
      const sortedFriends = quickAccessData.starredFriends.sort((a, b) => {
        const dateA =
          a.lastInteraction?.toDate?.() ||
          new Date(a.lastInteraction || a.starredAt);
        const dateB =
          b.lastInteraction?.toDate?.() ||
          new Date(b.lastInteraction || b.starredAt);
        return dateB - dateA; // Most recent first
      });

      // Cache results for performance
      if (useCache && sortedFriends.length > 0) {
        const cacheKey = `quick_access_${currentUser.uid}`;
        this.setCached(cacheKey, sortedFriends);
      }

      console.log(
        `✅ Found ${sortedFriends.length} Quick Access friends (unlimited system!)`
      );
      return sortedFriends;
    } catch (error) {
      console.error("❌ Error getting Quick Access friends:", error);
      return [];
    }
  }

  /**
   * 🔐 Phase 1.2: Get Quick Access friends with privacy status for UI components
   * This method enhances the existing quick access data with privacy information
   * WITHOUT modifying any database operations or existing method signatures
   *
   * @param {boolean} useCache - Whether to use caching (default: true)
   * @returns {Promise<Array>} Array of starred friends with privacy status added
   */
  async getQuickAccessFriendsWithPrivacy(useCache = true) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      console.error(
        "❌ Cannot get Quick Access friends with privacy, user not logged in."
      );
      return [];
    }

    try {
      console.log(
        "🔐 Getting Quick Access friends with privacy status for:",
        userProfile.profile.displayName
      );

      // Get existing Quick Access friends (unchanged method)
      const friends = await this.getQuickAccessFriends(useCache);

      if (friends.length === 0) {
        console.log(
          "📋 No Quick Access friends to enhance with privacy status"
        );
        return [];
      }

      // Enhance each friend with privacy status (NO DB CHANGES)
      const enhancedFriends = await Promise.all(
        friends.map(async (friend) => {
          try {
            // Check if quick access should be restricted for this friend
            const isRestricted =
              await friendshipPrivacyService.isQuickAccessRestricted(
                friend.friendId,
                currentUser.uid
              );

            // Add privacy status to existing friend data
            return {
              ...friend, // Keep all existing friend data intact
              // Privacy status flags for UI components
              isRestricted: isRestricted, // For UI disabled state
              canViewSchedule: !isRestricted, // Semantic flag for clarity
              privacyStatus: {
                avatarEnabled: !isRestricted,
                tooltip: isRestricted
                  ? "Avatar disabled - schedule is private"
                  : "Click to view schedule",
                description: isRestricted
                  ? `${friend.displayName} has hidden their schedule from you`
                  : `${friend.displayName}'s schedule is visible - quick access enabled`,
              },
            };
          } catch (error) {
            console.error(
              `❌ Error checking privacy for friend ${friend.friendId}:`,
              error
            );
            // Default to restricted on error for security
            return {
              ...friend,
              isRestricted: true,
              canViewSchedule: false,
              privacyStatus: {
                avatarEnabled: false,
                tooltip: "Avatar disabled - privacy check failed",
                description: `Privacy status unavailable for ${friend.displayName}`,
              },
            };
          }
        })
      );

      console.log(
        `✅ Enhanced ${enhancedFriends.length} Quick Access friends with privacy status`
      );

      // Log summary for debugging
      const restrictedCount = enhancedFriends.filter(
        (f) => f.isRestricted
      ).length;
      const allowedCount = enhancedFriends.length - restrictedCount;
      console.log(
        `🔐 Privacy summary: ${allowedCount} enabled, ${restrictedCount} restricted avatars`
      );

      return enhancedFriends;
    } catch (error) {
      console.error(
        "❌ Error getting Quick Access friends with privacy:",
        error
      );
      return [];
    }
  }

  /**
   * 🔐 Phase 1.2: Check if Quick Access should be restricted for a specific friend
   * This is a convenience method that uses the FriendshipPrivacyService directly
   *
   * @param {string} friendId - The friend's user ID to check
   * @returns {Promise<boolean>} True if quick access should be restricted (avatar disabled)
   */
  async isQuickAccessRestricted(friendId) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !friendId) {
      console.error(
        "❌ Cannot check Quick Access restriction: missing user or friend data"
      );
      return true; // Default to restricted for security
    }

    try {
      console.log(
        `🔐 Checking Quick Access restriction for friend: ${friendId}`
      );

      const isRestricted =
        await friendshipPrivacyService.isQuickAccessRestricted(
          friendId,
          currentUser.uid
        );

      console.log(
        `✅ Quick Access restriction result: ${friendId} = ${
          isRestricted ? "RESTRICTED" : "ALLOWED"
        }`
      );

      return isRestricted;
    } catch (error) {
      console.error(
        `❌ Error checking Quick Access restriction for ${friendId}:`,
        error
      );
      // Default to restricted on error for security
      return true;
    }
  }

  /**
   * 🔐 Phase 1.2: Check if current user can view a friend's schedule
   * This is a convenience method that uses the FriendshipPrivacyService directly
   *
   * @param {string} friendId - The friend's user ID whose schedule we want to view
   * @returns {Promise<boolean>} True if schedule is visible, false if hidden
   */
  async canViewFriendSchedule(friendId) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !friendId) {
      console.error(
        "❌ Cannot check schedule visibility: missing user or friend data"
      );
      return false; // Default to not visible for security
    }

    try {
      console.log(`🔐 Checking schedule visibility for friend: ${friendId}`);

      const canView = await friendshipPrivacyService.isScheduleVisible(
        friendId,
        currentUser.uid
      );

      console.log(
        `✅ Schedule visibility result: ${friendId} = ${
          canView ? "VISIBLE" : "HIDDEN"
        }`
      );

      return canView;
    } catch (error) {
      console.error(
        `❌ Error checking schedule visibility for ${friendId}:`,
        error
      );
      // Default to not visible on error for security
      return false;
    }
  }

  /**
   * 🔐 Phase 1.2: Get detailed privacy status for a specific friend
   * This provides comprehensive privacy information for UI components
   *
   * @param {string} friendId - The friend's user ID
   * @returns {Promise<Object|null>} Detailed privacy status or null if friendship not found
   */
  async getFriendPrivacyStatus(friendId) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !friendId) {
      console.error(
        "❌ Cannot get friend privacy status: missing user or friend data"
      );
      return null;
    }

    try {
      console.log(`🔐 Getting privacy status for friend: ${friendId}`);

      const privacyStatus = await friendshipPrivacyService.getQuickAccessStatus(
        friendId,
        currentUser.uid
      );

      if (privacyStatus) {
        console.log(
          `✅ Privacy status retrieved for ${friendId}:`,
          privacyStatus.quickAccess.status
        );
      } else {
        console.log(`⚠️ No privacy status found for friend: ${friendId}`);
      }

      return privacyStatus;
    } catch (error) {
      console.error(`❌ Error getting privacy status for ${friendId}:`, error);
      return null;
    }
  }

  /**
   * ❓ Check if a friend is in Quick Access
   * @param {string} friendId - The friend's user ID to check
   * @returns {Promise<boolean>} True if friend is starred, false otherwise
   */
  async isInQuickAccess(friendId) {
    if (!friendId) {
      return false;
    }

    try {
      // Get Quick Access friends (with caching)
      const quickAccessFriends = await this.getQuickAccessFriends(true);

      // Check if friendId exists in the starred friends array
      const isStarred = quickAccessFriends.some(
        (friend) => friend.friendId === friendId
      );

      console.log(
        `❓ Quick Access check for ${friendId}:`,
        isStarred ? "⭐ STARRED" : "☆ NOT STARRED"
      );
      return isStarred;
    } catch (error) {
      console.error("❌ Error checking Quick Access status:", error);
      return false;
    }
  }

  /**
   * 🔄 Update Quick Access order (move friend to top of recent-first list)
   * @param {string} friendId - The friend's user ID to update
   * @returns {Promise<Object>} Success/failure result
   */
  async updateQuickAccessOrder(friendId) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return {
        success: false,
        message: "Please log in to update Quick Access.",
      };
    }

    if (!friendId) {
      console.error("❌ Missing friend ID for Quick Access order update");
      return { success: false, message: "Invalid friend data" };
    }

    try {
      console.log("🔄 Updating Quick Access order for:", friendId);

      // Update last interaction timestamp in database
      const result = await dataManager.updateQuickAccessOrder(
        currentUser.uid,
        friendId,
        new Date()
      );

      if (result.success) {
        // Clear cache to force refresh with new ordering
        this.clearCache(`quick_access_${currentUser.uid}`);

        console.log(
          "✅ Successfully updated Quick Access order for:",
          friendId
        );
        return {
          success: true,
          message: "Quick Access order updated",
          updatedFriendId: friendId,
        };
      } else {
        return {
          success: false,
          message: "Failed to update Quick Access order. Please try again.",
        };
      }
    } catch (error) {
      console.error("❌ Error updating Quick Access order:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * ⭐ Toggle Quick Access status (star/unstar)
   * @param {string} friendId - The friend's user ID
   * @param {Object} friendInfo - Friend's display information (required for adding)
   * @returns {Promise<Object>} Success/failure result with current status
   */
  async toggleQuickAccess(friendId, friendInfo) {
    try {
      // Check current status
      const isCurrentlyStarred = await this.isInQuickAccess(friendId);

      if (isCurrentlyStarred) {
        // Remove from Quick Access
        const result = await this.removeFromQuickAccess(friendId);
        return {
          ...result,
          isStarred: false,
          action: "removed",
        };
      } else {
        // Add to Quick Access
        const result = await this.addToQuickAccess(friendId, friendInfo);
        return {
          ...result,
          isStarred: true,
          action: "added",
        };
      }
    } catch (error) {
      console.error("❌ Error toggling Quick Access:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
        isStarred: false,
        action: "error",
      };
    }
  }
}

// 🌟 Export a single instance (Singleton pattern)
export const friendsManager = new FriendsManager();

// Only expose globally for development/debugging (like dataManager)
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.friendsManager = friendsManager;
  console.log(
    "🛠️ FriendsManager available globally as window.friendsManager for debugging"
  );
}
