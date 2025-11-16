/**
 * 🎯 MeetchuThere Friends Manager
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
        handle: request.handle || request.fromUserInfo?.handle || "unknown",
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
        handle: request.handle || request.toUserInfo?.handle || "unknown",
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
          handle: request.handle,
          major: request.major,
          university: request.university,
        });
      } else if (request.status === "rejected") {
        console.log(
          `@${request.handle || "unknown"} declined your friend request`
        );
      }
    } catch (error) {
      console.error("❌ Error showing notification:", error);
      // Fallback: Log notification that would have been shown
      console.log(
        `📢 Notification (fallback): Friend request ${request.status} - @${
          request.handle || "unknown"
        }`
      );
    }
  }

  /**
   * 🤝 Handle real-time friendships updates
   * @param {Array} friendships - Updated friendships
   * @private
   */
  async handleFriendshipsUpdate(friendships) {
    console.log(
      `🔄 FRIENDS: handleFriendshipsUpdate called with ${friendships.length} friendships`
    );
    console.log(
      `🔄 FRIENDS: Friendship data:`,
      friendships.map((f) => ({
        id: f.id,
        friendId: f.friendId,
        users: f.users,
      }))
    );

    // Transform friendships data to match existing format
    const transformedFriends = friendships.map((friendship) => ({
      id: friendship.friendId,
      friendshipId: friendship.id,
      handle: friendship.friendInfo?.handle || "unknown",
      major: friendship.friendInfo?.major || "Unknown Major",
      avatarConfig: friendship.friendInfo?.avatarConfig || null,
      profilePhotoUrl: friendship.friendInfo?.profilePhotoUrl || null,
      useAvatar:
        typeof friendship.friendInfo?.useAvatar === "boolean"
          ? friendship.friendInfo.useAvatar
          : undefined,
      friendsSince: friendship.createdAt,
      lastInteraction: friendship.lastInteraction,
      connectionStrength: friendship.connectionStrength || "normal",
      isOnline: false,
      mutualFriends: friendship.mutualFriends || 0,
    }));

    // NOTE: Bilateral cleanup is now handled by RealtimeService system-wide
    // This eliminates redundancy and ensures cleanup happens regardless of which page is active

    // Update internal friendship state
    this.friendships = transformedFriends;

    // Update the UI if the friends page is active
    if (this.isUICallbacksActive && this.uiCallbacks?.onFriendshipsUpdated) {
      this.uiCallbacks.onFriendshipsUpdated(transformedFriends);
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
   * 🔎 Unified search: handle prefix (top 3) or exact student ID.
   * - Handle: prefix match on `handles` collection by documentId, limit 3.
   * - ID: exact match on users.universityInfo.studentId within viewer's university.
   */
  async searchStudentsHandleAware(rawTerm) {
    const term = (rawTerm || "").trim();
    if (term.length < 1) return [];

    const viewerProfile =
      (await currentUser
        .waitForProfileWithTimeout?.(5000)
        .catch(() => null)) || (await currentUser.waitForProfile());
    if (!viewerProfile) return [];

    // Student ID exact (6+ digits)
    if (/^\d{6,}$/.test(term)) {
      try {
        const results = await dataManager.findUserByStudentIdExact(
          viewerProfile.universityInfo.university,
          term,
          1
        );
        return await this.filterSearchResults(results);
      } catch (error) {
        console.error("❌ Student ID lookup error:", error);
        return [];
      }
    }

    // Handle prefix (3+ chars, optional @)
    const normalized = term.startsWith("@")
      ? term.slice(1).toLowerCase()
      : term.toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,}$/.test(normalized)) {
      return [];
    }

    try {
      const {
        getDocs,
        collection,
        query,
        orderBy,
        startAt,
        endAt,
        limit,
        doc,
        getDoc,
        documentId,
      } = await import("firebase/firestore");
      const { db } = await import("../../lib/firebase/firebase-config.js");

      // Prefix query on documentId (handle string)
      const handlesRef = collection(db, "handles");
      const q = query(
        handlesRef,
        orderBy(documentId()),
        startAt(normalized),
        endAt(normalized + "\uf8ff"),
        limit(3)
      );
      const snap = await getDocs(q);
      if (snap.empty) return [];

      const viewerUniversityId = viewerProfile?.universityInfo?.university;
      const viewerUniversityName =
        viewerProfile?.universityInfo?.universityName?.toLowerCase?.();

      const candidates = [];
      for (const d of snap.docs) {
        const userId = d.data()?.userId;
        if (!userId) continue;
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) continue;
        const userData = userSnap.data();
        if (!userData?.socialInfo?.searchable) continue;

        // Enforce same university until cross-university is supported
        const targetUniversityId = userData?.universityInfo?.university;
        const targetUniversityName =
          userData?.universityInfo?.universityName?.toLowerCase?.();
        const sameUniversityById =
          viewerUniversityId &&
          targetUniversityId &&
          viewerUniversityId === targetUniversityId;
        const sameUniversityByName =
          viewerUniversityName &&
          targetUniversityName &&
          viewerUniversityName === targetUniversityName;
        if (!(sameUniversityById || sameUniversityByName)) continue;

        candidates.push({
          id: userId,
          profile: {
            handle: userData.profile?.handle,
            handle_lower: userData.profile?.handle_lower,
            major: userData.profile?.major,
            major_lower: userData.profile?.major_lower,
            profilePhotoUrl: userData.profile?.profilePhotoUrl || null,
            useAvatar:
              typeof userData.profile?.useAvatar === "boolean"
                ? userData.profile.useAvatar
                : undefined,
          },
          universityInfo: userData.universityInfo || {},
          avatarConfig: userData.avatarConfig || null,
          profilePhotoUrl: userData.profile?.profilePhotoUrl || null,
          useAvatar:
            typeof userData.profile?.useAvatar === "boolean"
              ? userData.profile.useAvatar
              : undefined,
        });
      }

      // Prefer exact match first, then lexicographic
      candidates.sort((a, b) => {
        const aExact = (a.profile?.handle_lower || a.profile?.handle || "").toLowerCase() === normalized;
        const bExact = (b.profile?.handle_lower || b.profile?.handle || "").toLowerCase() === normalized;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const ah = (a.profile?.handle_lower || a.profile?.handle || "").toLowerCase();
        const bh = (b.profile?.handle_lower || b.profile?.handle || "").toLowerCase();
        return ah.localeCompare(bh);
      });

      // Filter out existing friends and incoming pending requests
      return await this.filterSearchResults(candidates);
    } catch (error) {
      console.error("❌ Handle prefix search error:", error);
      return [];
    }
  }

  /**
   * �🚫 Filter out existing friends and pending requests from search results
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
   * 🔍 Search students with caching (convenience method)
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Search results (cached when possible)
   */
  async searchStudentsWithCache(searchTerm) {
    // Handle-aware path; caching for other modes removed as we only support handle/ID
    return this.searchStudentsHandleAware(searchTerm);
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
      const targetProfile = targetUserData?.profile || {};
      const targetUniversityInfo = targetUserData?.universityInfo || {};
      const targetHandle =
        targetProfile.handle || targetProfile.handle_lower || "unknown";
      console.log("📩 Sending friend request to handle:", targetHandle);

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
          handle: userProfile.profile.handle,
          major: userProfile.profile.major,
          university: userProfile.universityInfo.university,
          avatarConfig: userProfile.avatarConfig,
          profilePhotoUrl:
            userProfile.profile.profilePhotoUrl || null,
          useAvatar:
            typeof userProfile.profile.useAvatar === "boolean"
              ? userProfile.profile.useAvatar
              : undefined,
        },
        toUserInfo: {
          handle:
            targetProfile.handle || targetProfile.handle_lower || targetUserId,
          major: targetProfile.major || targetProfile.major_lower || "",
          university:
            targetUniversityInfo.university ||
            targetUniversityInfo.universityName ||
            "",
          avatarConfig: targetUserData?.avatarConfig,
          profilePhotoUrl:
            targetUserData?.profile?.profilePhotoUrl || null,
          useAvatar:
            typeof targetUserData?.profile?.useAvatar === "boolean"
              ? targetUserData.profile.useAvatar
              : undefined,
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
          message: `Friend request sent to @${requestData.toUserInfo.handle}!`,
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
        "📬 Getting pending requests for handle:",
        userProfile.profile.handle
      );
      const pendingRequests = await dataManager.getPendingFriendRequests(
        currentUser.uid
      );
      console.log(`✅ Found ${pendingRequests.length} pending friend requests`);
      return pendingRequests.map((request) => ({
        ...request,
        handle: request.fromUserInfo?.handle || "unknown",
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
        requestData.fromUserInfo?.handle
      );

      // 🎯 STEP 1: Create the friendship document first
      // (We'll delete the request after successful friendship creation)

      // 🎯 STEP 1: Create the friendship document with bilateral privacy
      
      // Build user info objects with only defined values (Firestore doesn't allow undefined)
      const user1Info = {
        handle: requestData.fromUserInfo.handle,
        major: requestData.fromUserInfo.major,
      };
      
      // Add avatar/photo fields only if they exist
      const user1AvatarConfig = requestData.fromUserInfo.avatarConfig || requestData.fromUserInfo.avatar;
      if (user1AvatarConfig) {
        user1Info.avatarConfig = user1AvatarConfig;
      }
      if (requestData.fromUserInfo.profilePhotoUrl) {
        user1Info.profilePhotoUrl = requestData.fromUserInfo.profilePhotoUrl;
      }
      if (requestData.fromUserInfo.useAvatar !== undefined) {
        user1Info.useAvatar = requestData.fromUserInfo.useAvatar;
      }
      
      const user2Info = {
        handle: requestData.toUserInfo.handle,
        major: requestData.toUserInfo.major,
      };
      
      // Add avatar/photo fields only if they exist
      const user2AvatarConfig = requestData.toUserInfo.avatarConfig || 
                                 requestData.toUserInfo.avatar || 
                                 userProfile.avatarConfig;
      if (user2AvatarConfig) {
        user2Info.avatarConfig = user2AvatarConfig;
      }
      const user2PhotoUrl = requestData.toUserInfo.profilePhotoUrl || userProfile.profilePhotoUrl;
      if (user2PhotoUrl) {
        user2Info.profilePhotoUrl = user2PhotoUrl;
      }
      const user2UseAvatar = requestData.toUserInfo.useAvatar !== undefined 
                              ? requestData.toUserInfo.useAvatar 
                              : userProfile.useAvatar;
      if (user2UseAvatar !== undefined) {
        user2Info.useAvatar = user2UseAvatar;
      }
      
      const friendshipData = {
        users: [requestData.fromUserId, requestData.toUserId], // Array for easy querying
        user1Id: requestData.fromUserId,
        user2Id: requestData.toUserId,
        createdAt: new Date(),
        mutualFriends: 0,
        lastInteraction: new Date(),
        user1Info,
        user2Info,

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
      const friendName = requestData.fromUserInfo?.handle || "new_friend";

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
      const senderName = requestData?.fromUserInfo?.handle || "user";
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
      const friendName = friendInfo.handle || "friend";
      console.log("💔 Unfriending user:", friendName);

      // 🎯 PHASE 1: Optimistic Updates - Publish optimistic unfriending event FIRST
      console.log(
        "🚀 Publishing optimistic unfriending event for immediate UI update"
      );
      this.publishOptimisticUnfriending(friendId, friendInfo);

      // ⭐ Ensure Quick Access no longer contains this friend for the current user
      // Capture whether they were starred to optionally restore on rollback
      let wasStarred = false;
      try {
        wasStarred = await this.isInQuickAccess(friendId);
        if (wasStarred) {
          const qaResult = await this.removeFromQuickAccess(friendId);
          if (!qaResult.success) {
            console.warn(
              "⚠️ Failed to remove from Quick Access during unfriend (will proceed):",
              qaResult.message
            );
          }
        }
      } catch (qaErr) {
        console.warn(
          "⚠️ Quick Access cleanup failed during unfriend (non-fatal):",
          qaErr?.message || qaErr
        );
      }

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
            handle: friendName,
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

      // If we removed from Quick Access earlier and unfriend failed, best-effort restore star
      try {
        const stillFriends = true; // Unfriend failed implies still friends
        if (stillFriends) {
          const isStarredNow = await this.isInQuickAccess(friendId);
          if (!isStarredNow && friendInfo && friendInfo.handle) {
            await this.addToQuickAccess(friendId, friendInfo);
          }
        }
      } catch (_) {
        /* non-fatal */
      }

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
      console.log("👥 Getting friends list for:", userProfile.profile.handle);
      const friendships = await dataManager.getUserFriendships(currentUser.uid);

      if (!friendships.length) {
        console.log("👥 No friends found");
        return [];
      }

      // 🎯 Transform friendship documents with avatar + photo handling
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
          handle: friendInfo?.handle || "unknown",
          major: friendInfo?.major || "Unknown Major",
          avatarConfig: friendInfo?.avatarConfig || null,
          profilePhotoUrl: friendInfo?.profilePhotoUrl || null,
          useAvatar:
            typeof friendInfo?.useAvatar === "boolean"
              ? friendInfo.useAvatar
              : undefined,

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
    if (notificationManager && friendInfo.handle) {
      notificationManager.showSystemNotification(
        `Unfriending @${friendInfo.handle}...`,
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
    if (notificationManager && friendInfo.handle) {
      notificationManager.showSystemNotification(
        `Failed to unfriend @${friendInfo.handle}. Please try again.`,
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
      const friendName = friendInfo.handle || "friend";
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
        handle: friendInfo.handle,
        major: friendInfo.major,
        avatarConfig: friendInfo.avatarConfig,
        profilePhotoUrl: friendInfo.profilePhotoUrl || null,
        starredAt: now,
        lastInteraction: now, // For recent-first ordering
      };

      if (typeof friendInfo.useAvatar === "boolean") {
        quickAccessEntry.useAvatar = friendInfo.useAvatar;
      }

      // 🌍 Campus Presence: Add friendshipId if available (required for bilateral location sharing)
      if (friendInfo.friendshipId) {
        quickAccessEntry.friendshipId = friendInfo.friendshipId;
      } else {
        console.warn(
          `⚠️ friendshipId not available for @${friendInfo.handle} - location sharing may not work`
        );
      }

      // Save to database via dataManager
      const result = await dataManager.addToQuickAccess(
        currentUser.uid,
        quickAccessEntry
      );

      if (result.success) {
        // Clear FriendsService cache to force fresh read from DataManager
        this.clearCache(`quick_access_${currentUser.uid}`);
        // DON'T clear DataManager cache - it was just optimistically updated with fresh data!
        // Clearing it would force a Firestore read that returns stale data due to eventual consistency
        // dataManager.clearCache(`quick_access_${currentUser.uid}`);

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
        // Clear FriendsService cache to force fresh read from DataManager
        this.clearCache(`quick_access_${currentUser.uid}`);
        // DON'T clear DataManager cache - it was just optimistically updated with fresh data!
        // Clearing it would force a Firestore read that returns stale data due to eventual consistency
        // dataManager.clearCache(`quick_access_${currentUser.uid}`);

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
    const uid = currentUser.uid || (await currentUser.waitForUid());
    if (!userProfile || !uid) {
      console.warn(
        "⚠️ Quick Access fetch aborted – auth/profile not ready yet"
      );
      return [];
    }

    try {
      console.log(
        "📋 Getting Quick Access friends for handle:",
        userProfile.profile.handle
      );

      // Get Quick Access data from database
      const quickAccessData = await dataManager.getQuickAccessFriends(uid);

      if (!quickAccessData || !quickAccessData.starredFriends) {
        console.log("📋 No Quick Access friends found");
        return [];
      }

      // Ensure starredFriends is an array (defensive check)
      const rawFriends = quickAccessData.starredFriends;
      if (!Array.isArray(rawFriends)) {
        console.warn('⚠️ [FriendsService] starredFriends is not an array:', typeof rawFriends, rawFriends);
        return [];
      }

      // Sort by recent-first ordering (most recently interacted with first)
      const sortedFriends = rawFriends.sort((a, b) => {
        const dateA =
          a.lastInteraction?.toDate?.() ||
          new Date(a.lastInteraction || a.starredAt);
        const dateB =
          b.lastInteraction?.toDate?.() ||
          new Date(b.lastInteraction || b.starredAt);
        return dateB - dateA; // Most recent first
      });

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
        "🔐 Getting Quick Access friends with privacy status for handle:",
        userProfile.profile.handle
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
            // 🌍 Campus Presence: Ensure friendshipId is available for bilateral location sharing
            // Optimal approach: deterministically derive from UIDs (canonical doc id is sorted uid1_uid2)
            let friendshipId = friend.friendshipId;
            if (!friendshipId && currentUser?.uid && friend.friendId) {
              const a = currentUser.uid;
              const b = friend.friendId;
              friendshipId = a < b ? `${a}_${b}` : `${b}_${a}`;
              // Cache the derived ID for downstream consumers
              friend.friendshipId = friendshipId;
              // Reduce noise: log at debug level instead of warning
              if (process.env.NODE_ENV === "development") {
                console.debug(
                  `🔧 Derived friendshipId for @${friend.handle}: ${friendshipId}`
                );
              }
            }

            // Check if quick access should be restricted for this friend
            const isRestricted =
              await friendshipPrivacyService.isQuickAccessRestricted(
                friend.friendId,
                currentUser.uid
              );

            // Add privacy status to existing friend data
            return {
              ...friend, // Keep all existing friend data intact
              friendshipId: friendshipId, // 🌍 Campus Presence: Ensure friendshipId is available
              // Privacy status flags for UI components
              isRestricted: isRestricted, // For UI disabled state
              canViewSchedule: !isRestricted, // Semantic flag for clarity
              privacyStatus: {
                avatarEnabled: !isRestricted,
                tooltip: isRestricted
                  ? "Avatar disabled - schedule is private"
                  : "Click to view schedule",
                description: isRestricted
                  ? `@${friend.handle} has hidden their schedule from you`
                  : `@${friend.handle}'s schedule is visible - quick access enabled`,
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
                description: `Privacy status unavailable for @${friend.handle}`,
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

  // =========================
  // CAMPUS PRESENCE FEATURES (Phase 3)
  // =========================

  /**
   * 📍 Request location sharing with a friend
   * Enables location sharing from current user's side and notifies the friend
   * @param {string} friendId - The friend's user ID to request location sharing with
   * @param {string} friendshipId - The friendship document ID
   * @returns {Promise<Object>} Success/failure result with notification details
   */
  async requestLocationSharing(friendId, friendshipId) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return { success: false, message: "Please log in to share location." };
    }

    if (!friendId || !friendshipId) {
      console.error(
        "❌ Missing friend ID or friendship ID for location sharing"
      );
      return { success: false, message: "Invalid friend data" };
    }

    if (friendId === currentUser.uid) {
      return {
        success: false,
        message: "You cannot request location sharing with yourself!",
      };
    }

    try {
      console.log("📍 Requesting location sharing with friend:", friendId);

      // 🚧 Prevent duplicate pending requests (spam guard)
      try {
        const hasPending = await dataManager.hasPendingOutgoingLocationShareRequest(
          currentUser.uid,
          friendId,
          friendshipId
        );
        if (hasPending) {
          return {
            success: false,
            message: "Location request already sent and pending.",
          };
        }
      } catch (_) {
        // Non-fatal; continue
      }

      // 1. Enable location sharing from current user's side
      const result = await dataManager.updateBilateralLocationSharing(
        friendshipId,
        currentUser.uid,
        true
      );

      if (!result.success) {
        console.error("❌ Failed to enable location sharing:", result.error);
        return {
          success: false,
          message: "Failed to enable location sharing.",
        };
      }

      // 2. Create notification for the friend
      const notificationData = {
        userId: friendId,
        type: "location_share_request",
        fromUserId: currentUser.uid,
        fromUserInfo: {
          handle: userProfile.profile.handle,
          avatarConfig: userProfile.avatarConfig,
          major: userProfile.profile.major,
          profilePhotoUrl:
            userProfile.profile.profilePhotoUrl || null,
          useAvatar:
            typeof userProfile.profile.useAvatar === "boolean"
              ? userProfile.profile.useAvatar
              : undefined,
        },
        locationRequest: {
          friendshipId: friendshipId,
          currentStatus: "pending_both",
          requestedAt: new Date(),
        },
        status: "pending",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        actionButtons: ["accept", "dismiss"],
      };

      await dataManager.createNotification(notificationData);

      console.log("✅ Location sharing request sent successfully!");
      return {
        success: true,
        message: `Location sharing request sent to @${userProfile.profile.handle}!`,
        friendId: friendId,
        friendshipId: friendshipId,
        requestedAt: new Date(),
      };
    } catch (error) {
      console.error("❌ Error requesting location sharing:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * 👥 Enhanced getFriendsList with location context
   * Gets friends list and adds location sharing status for each friend
   * @param {boolean} includeLocationData - Whether to include location sharing context (default: false)
   * @returns {Promise<Array>} Array of friends with optional location sharing context
   */
  async getFriendsListWithLocation(includeLocationData = false) {
    try {
      console.log("👥📍 Getting friends list with location context...");

      // Get the standard friends list first
      const friendsList = await this.getFriendsList();

      if (!includeLocationData || friendsList.length === 0) {
        console.log(
          "👥 Returning standard friends list (no location data requested)"
        );
        return friendsList;
      }

      // Add location sharing status to each friend
      const friendsWithLocation = await Promise.all(
        friendsList.map(async (friend) => {
          try {
            // Check mutual location sharing status
            const hasMutualSharing = await this.checkMutualLocationSharing(
              friend.friendshipId
            );
            const canSeeLocation = await this.canSeeLocation(friend.id);

            return {
              ...friend,
              // Location sharing context
              hasLocationSharing: hasMutualSharing,
              canSeeLocation: canSeeLocation,
              presenceDisplay: this.calculatePresenceDisplay(friend),
              locationSharing: {
                mutual: hasMutualSharing,
                canView: canSeeLocation,
                status: hasMutualSharing ? "active" : "inactive",
                lastUpdated: new Date(), // Placeholder - will be real data in Phase 4
              },
            };
          } catch (error) {
            console.error(
              `❌ Error adding location context for friend ${friend.id}:`,
              error
            );
            // Return friend without location data on error
            return {
              ...friend,
              hasLocationSharing: false,
              canSeeLocation: false,
              presenceDisplay: "offline",
              locationSharing: {
                mutual: false,
                canView: false,
                status: "unknown",
                lastUpdated: null,
              },
            };
          }
        })
      );

      console.log(
        `✅ Enhanced ${friendsWithLocation.length} friends with location context`
      );
      return friendsWithLocation;
    } catch (error) {
      console.error("❌ Error getting friends list with location:", error);
      // Fallback to standard friends list
      return this.getFriendsList();
    }
  }

  /**
   * 🔍 Check if both users enabled location sharing
   * Queries the friendship document to verify mutual location sharing
   * @param {string} friendshipId - The friendship document ID
   * @returns {Promise<boolean>} True if both users have enabled location sharing
   */
  async checkMutualLocationSharing(friendshipId) {
    if (!friendshipId) {
      console.error("❌ Missing friendship ID for location sharing check");
      return false;
    }

    try {
      console.log(
        "🔍 Checking mutual location sharing for friendship:",
        friendshipId
      );

      // Query friendship document for location visibility settings
      const friendshipData = await dataManager.getFriendshipById(friendshipId);

      if (!friendshipData) {
        console.error("❌ Friendship document not found:", friendshipId);
        return false;
      }

      // Check if both users have enabled location sharing
      const locationVisibility = friendshipData.locationVisibility || {};
      const user1Sharing = locationVisibility[friendshipData.user1Id] || false;
      const user2Sharing = locationVisibility[friendshipData.user2Id] || false;

      const hasMutualSharing = user1Sharing && user2Sharing;

      console.log(
        `✅ Mutual location sharing check: ${friendshipId} = ${
          hasMutualSharing ? "ENABLED" : "DISABLED"
        } (User1: ${user1Sharing}, User2: ${user2Sharing})`
      );

      return hasMutualSharing;
    } catch (error) {
      console.error("❌ Error checking mutual location sharing:", error);
      return false;
    }
  }

  /**
   * 👁️ Helper to check location visibility for a specific friend
   * Determines if current user can see the specified friend's location
   * @param {string} friendId - The friend's user ID to check visibility for
   * @returns {Promise<boolean>} True if friend's location is visible to current user
   */
  async canSeeLocation(friendId) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !friendId) {
      console.error(
        "❌ Cannot check location visibility: missing user or friend data"
      );
      return false;
    }

    try {
      console.log(`👁️ Checking location visibility for friend: ${friendId}`);

      // Get friendship data between current user and friend
      const friendshipData = await dataManager.getFriendshipBetweenUsers(
        currentUser.uid,
        friendId
      );

      if (!friendshipData) {
        console.error(
          `❌ No friendship found between ${currentUser.uid} and ${friendId}`
        );
        return false;
      }

      // Check if friend has enabled location sharing with current user
      const locationVisibility = friendshipData.locationVisibility || {};
      const friendLocationVisible = locationVisibility[friendId] || false;

      console.log(
        `✅ Location visibility check: ${friendId} = ${
          friendLocationVisible ? "VISIBLE" : "HIDDEN"
        }`
      );

      return friendLocationVisible;
    } catch (error) {
      console.error(
        `❌ Error checking location visibility for ${friendId}:`,
        error
      );
      return false;
    }
  }

  /**
   * 🎯 Calculate presence display status for friend
   * Determines how friend should be displayed based on location and online status
   * @param {Object} friend - Friend object with location and status data
   * @returns {string} Presence display status ("online", "nearby", "campus", "offline")
   */
  calculatePresenceDisplay(friend) {
    if (!friend) {
      return "offline";
    }

    // TODO: Phase 4 - Implement real presence calculation based on:
    // - Location sharing status
    // - Real-time location data
    // - Campus proximity
    // - Online status

    // Placeholder logic for Phase 3
    if (friend.hasLocationSharing) {
      return "campus"; // Friend has location sharing enabled
    }

    if (friend.isOnline) {
      return "online"; // Friend is online but no location
    }

    return "offline"; // Default status
  }

  /**
   * 📍 Get location sharing status for a specific friendship
   * Provides detailed location sharing information for UI components
   * @param {string} friendshipId - The friendship document ID
   * @returns {Promise<Object|null>} Location sharing status or null if not found
   */
  async getLocationSharingStatus(friendshipId) {
    if (!friendshipId) {
      console.error("❌ Missing friendship ID for location sharing status");
      return null;
    }

    try {
      console.log(
        "📍 Getting location sharing status for friendship:",
        friendshipId
      );

      const friendshipData = await dataManager.getFriendshipById(friendshipId);

      if (!friendshipData) {
        console.error("❌ Friendship document not found:", friendshipId);
        return null;
      }

      const locationVisibility = friendshipData.locationVisibility || {};
      const user1Id = friendshipData.user1Id;
      const user2Id = friendshipData.user2Id;

      const status = {
        friendshipId: friendshipId,
        users: {
          [user1Id]: {
            sharingEnabled: locationVisibility[user1Id] || false,
            handle: friendshipData.user1Info?.handle || "user1",
          },
          [user2Id]: {
            sharingEnabled: locationVisibility[user2Id] || false,
            handle: friendshipData.user2Info?.handle || "user2",
          },
        },
        mutualSharing:
          (locationVisibility[user1Id] || false) &&
          (locationVisibility[user2Id] || false),
        lastUpdated:
          friendshipData.locationSharingMetadata?.lastUpdated || null,
        updatedBy: friendshipData.locationSharingMetadata?.updatedBy || null,
      };

      console.log("✅ Location sharing status retrieved:", status);
      return status;
    } catch (error) {
      console.error("❌ Error getting location sharing status:", error);
      return null;
    }
  }

  /**
   * 🔄 Toggle location sharing with a friend
   * Enables or disables location sharing from current user's side
   * @param {string} friendshipId - The friendship document ID
   * @param {boolean} enabled - Whether to enable or disable location sharing
   * @returns {Promise<Object>} Success/failure result with updated status
   */
  async toggleLocationSharing(friendshipId, enabled) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      return {
        success: false,
        message: "Please log in to manage location sharing.",
      };
    }

    if (!friendshipId) {
      console.error("❌ Missing friendship ID for location sharing toggle");
      return { success: false, message: "Invalid friendship data" };
    }

    try {
      console.log(
        `🔄 ${
          enabled ? "Enabling" : "Disabling"
        } location sharing for friendship:`,
        friendshipId
      );

      // Update location sharing status
      const result = await dataManager.updateBilateralLocationSharing(
        friendshipId,
        currentUser.uid,
        enabled
      );

      if (result.success) {
        console.log(
          `✅ Successfully ${enabled ? "enabled" : "disabled"} location sharing`
        );

        // 🌍 Handle location tracking based on toggle
        this.handleLocationTrackingToggle(enabled);

        return {
          success: true,
          message: `Location sharing ${enabled ? "enabled" : "disabled"}`,
          friendshipId: friendshipId,
          enabled: enabled,
          updatedAt: new Date(),
        };
      } else {
        console.error("❌ Failed to update location sharing:", result.error);
        return {
          success: false,
          message: "Failed to update location sharing. Please try again.",
        };
      }
    } catch (error) {
      console.error("❌ Error toggling location sharing:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  }

  /**
   * Handle location tracking when location sharing is toggled
   * @param {boolean} enabled - Whether location sharing was enabled or disabled
   */
  async handleLocationTrackingToggle(enabled) {
    try {
      // Dynamically import campus location service to avoid circular dependencies
      const { campusLocationService } = await import(
        "../location/CampusLocationService.js"
      );

      if (enabled) {
        // Location sharing was enabled - check if tracking should start
        console.log(
          "🌍 Location sharing enabled - checking if automatic tracking should start..."
        );
        setTimeout(() => {
          campusLocationService.autoStartLocationTracking();
        }, 500);
      } else {
        // Location sharing was disabled - check if tracking should stop
        console.log(
          "🌍 Location sharing disabled - checking if tracking should stop..."
        );

        // Small delay to ensure database changes are reflected
        setTimeout(async () => {
          const hasLocationSharingFriends =
            await campusLocationService.checkForLocationSharingFriends();
          if (!hasLocationSharingFriends) {
            console.log(
              "🌍 No more location sharing friends - stopping location tracking"
            );
            campusLocationService.stopLocationTracking();
          } else {
            console.log(
              "🌍 Still have location sharing friends - continuing tracking"
            );
          }
        }, 500);
      }
    } catch (error) {
      console.error("🌍 Error handling location tracking toggle:", error);
    }
  }
}

// 🌟 Export a single instance (Singleton pattern)
export const friendsManager = new FriendsManager();

// Only expose globally for development/debugging (like dataManager)
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.friendsManager = friendsManager;
}
