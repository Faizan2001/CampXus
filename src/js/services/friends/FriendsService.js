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
import { realTimeManager, REALTIME_EVENTS } from "../realtime/RealtimeService.js";

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
    };

    console.log("🎛️ FriendsManager initialized with real-time capabilities");
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
    // Auto-cleanup expired entries periodically
    if (Math.random() < 0.1) { // 10% chance
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
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      console.error("❌ Cannot start real-time listening: User not logged in");
      return;
    }

    if (this.isRealTimeActive) {
      console.log("🎛️ Real-time listening already active");
      return;
    }

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

    // Start the RealTimeManager if it's not already listening
    realTimeManager.startListening(currentUser.uid);

    this.isRealTimeActive = true;
    console.log("✅ Real-time listening started for friends");
  }

  /**
   * 🛑 Stop real-time listening
   */
  stopRealTimeListening() {
    if (!this.isRealTimeActive) {
      return;
    }

    console.log("🛑 Stopping real-time listening for friends...");

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

    console.log("✅ Real-time listening stopped");
  }

  /**
   * 📬 Handle real-time friend requests updates
   * @param {Array} requests - Updated friend requests
   * @private
   */
  handleFriendRequestsUpdate(requests) {
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
  }

  /**
   * 📤 Handle real-time outgoing friend requests updates
   * @param {Array} requests - Updated outgoing friend requests
   * @private
   */
  handleOutgoingFriendRequestsUpdate(requests) {
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
  }

  /**
   * 🔔 Check for friend request status changes and show notifications
   * Enhanced to detect deletions for clean lifecycle approach
   * @param {Array} currentRequests - Current outgoing requests
   * @private
   */
  async checkForFriendRequestStatusChanges(currentRequests) {
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
        this.showFriendRequestStatusNotification(
          currentRequest,
          previousRequest.status
        );
      }
    });

    // 2. NEW: Check for deleted requests (clean lifecycle approach)
    const deletedRequests = this.previousOutgoingRequests.filter((previousRequest) => 
      !currentRequests.find((currentRequest) => currentRequest.id === previousRequest.id)
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
          console.error("❌ Error checking friendship for deleted request:", error);
          return { request: deletedRequest, friendshipExists: false, error };
        }
      });

      const results = await Promise.all(friendshipChecks);
      
      // Process results and show notifications
      results.forEach(({ request: deletedRequest, friendshipExists, error }) => {
        if (error) {
          console.warn("⚠️ Friendship check failed, assuming rejection for:", deletedRequest.id);
        }
        
        if (friendshipExists) {
          // Request was deleted + friendship exists = ACCEPTED
          console.log("🎉 Detected friend request acceptance via deletion + friendship");
          this.showFriendRequestStatusNotification(
            { ...deletedRequest, status: "accepted" },
            deletedRequest.status
          );
        } else {
          // Request was deleted + no friendship = REJECTED
          console.log("❌ Detected friend request rejection via deletion");
          this.showFriendRequestStatusNotification(
            { ...deletedRequest, status: "rejected" },
            deletedRequest.status
          );
        }
      });
    }

    // Update previous requests
    this.previousOutgoingRequests = currentRequests;
  }

  /**
   * 🔔 Show notification for friend request status change
   * @param {Object} request - The friend request that changed
   * @param {string} previousStatus - Previous status
   * @private
   */
  showFriendRequestStatusNotification(request, previousStatus) {
    // Only import notification manager when needed
    import("../realtime/NotificationService.js")
      .then(({ notificationManager }) => {
        if (request.status === "accepted") {
          notificationManager.showFriendAcceptedNotification({
            displayName: request.displayName,
            major: request.major,
            university: request.university,
          });
        } else if (request.status === "rejected") {
          notificationManager.showSystemNotification(
            `${request.displayName} declined your friend request`,
            "info",
            "Friend Request Update"
          );
        }
      })
      .catch((error) => {
        console.error("❌ Error loading notification manager:", error);
      });
  }

  /**
   * 🤝 Handle real-time friendships updates
   * @param {Array} friendships - Updated friendships
   * @private
   */
  handleFriendshipsUpdate(friendships) {
    // Transform friendships data to match existing format
    const transformedFriends = friendships.map((friendship) => ({
      id: friendship.friendId,
      friendshipId: friendship.id,
      displayName: friendship.friendInfo?.displayName || "Unknown User",
      major: friendship.friendInfo?.major || "Unknown Major",
      avatarConfig: friendship.friendInfo?.avatarConfig || null, // ← Fixed: use avatarConfig not avatar
      friendsSince: friendship.createdAt,
      lastInteraction: friendship.lastInteraction,
      connectionStrength: friendship.connectionStrength || "normal",
      isOnline: false,
      mutualFriends: friendship.mutualFriends || 0,
    }));

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
        // Get current friendships and pending requests for filtering
        // This runs both queries at the same time (parallel = faster!)
        const [friendships, pendingRequests] = await Promise.all([
          this.getFriendsList(),
          this.getPendingRequests(),
        ]);

        // Create fast lookup sets and cache them
        filterData = {
          friendIds: new Set(friendships.map((f) => f.id)),
          pendingIds: new Set(pendingRequests.map((r) => r.fromUserId)),
        };

        // Cache for 2 minutes (shorter than general cache since this changes more often)
        this.setCached(cacheKey, filterData);
      } catch (error) {
        console.error("❌ Error getting filter data:", error);
        return searchResults.filter((student) => student.id !== currentUser.uid);
      }
    }

    console.log(
      `📊 Excluding: ${filterData.friendIds.size} friends, ${filterData.pendingIds.size} pending requests`
    );

    // Filter out unwanted results
    const filteredResults = searchResults.filter((student) => {
      return (
        student.id !== currentUser.uid &&
        !filterData.friendIds.has(student.id) &&
        !filterData.pendingIds.has(student.id)
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

    const cacheKey = `major_${major.toLowerCase()}_${userProfile.universityInfo.university}`;

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
          console.log("🗑️ Deleting old rejected request before sending new one");
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

      // 🎯 STEP 1: Create the friendship document
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
      };

      const friendshipResult = await dataManager.createFriendship(
        friendshipData
      );

      if (!friendshipResult.success) {
        console.error("❌ Failed to create friendship");
        return { success: false, message: "Failed to create friendship" };
      }

      // 🎯 STEP 2: Delete the friend request (clean lifecycle approach)
      console.log("🗑️ Deleting friend request after successful friendship creation");
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
   * 💔 Unfriend a user (remove friendship)
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

      // Delete the friendship document
      const result = await dataManager.deleteFriendship(friendshipId);

      if (result.success) {
        // Clear search filter cache since friendship status changed
        this.clearSearchFilterCache();
        
        console.log("✅ Successfully unfriended user:", friendName);
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
        return {
          success: false,
          message: "Failed to unfriend user. Please try again.",
        };
      }
    } catch (error) {
      console.error("❌ Error unfriending user:", error);
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
      if (Math.random() < 0.1) { // 10% chance to run cleanup
        this.cleanupExpiredCache();
      }

      console.log(`🎉 Successfully processed ${friends.length} friends`);
      return friends;
    } catch (error) {
      console.error("❌ Error getting friends list:", error);
      return [];
    }
  }
}

// 🌟 Export a single instance (Singleton pattern)
export const friendsManager = new FriendsManager();
