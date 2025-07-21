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

import { currentUser } from "../currentUser.js";
import { dataManager } from "../data-manager.js";
import { realTimeManager, REALTIME_EVENTS } from "../realtime-manager.js";

export class FriendsManager {
  constructor() {
    this.unsubscribers = []; // For cleaning up Firestore listeners
    // No more setupAuthentication or initialization here!
    // We will get the user data on-demand.

    // 🗄️ Initialize search cache for lightning-fast repeated searches
    this.searchCache = new Map();
    this.maxCacheSize = 20; // Store up to 20 recent searches
    this.cacheExpiry = 5 * 60 * 1000; // Cache expires after 5 minutes

    // 🎨 Avatar cache for efficient friends list loading
    this.avatarCache = new Map();
    this.maxAvatarCacheSize = 150; // Cache up to 150 user avatars
    this.avatarCacheExpiry = 30 * 60 * 1000; // Avatar cache expires after 30 minutes
    this.avatarStaleThreshold = 10 * 60 * 1000; // Consider avatar stale after 10 minutes

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
   * 🗄️ Get cached search results (if they exist and aren't expired)
   * @param {string} cacheKey - Unique key for this search
   * @returns {Array|null} Cached results or null if not found/expired
   */
  getCachedSearchResults(cacheKey) {
    const cached = this.searchCache.get(cacheKey);

    if (!cached) {
      return null; // No cache entry
    }

    // Check if cache has expired
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.searchCache.delete(cacheKey);
      console.log("📦 Cache expired for:", cacheKey);
      return null;
    }

    console.log(
      "📦 Using cached search results for:",
      cacheKey,
      `(${cached.results.length} results)`
    );
    return cached.results;
  }

  /**
   * 💾 Cache search results for future instant access
   * @param {string} cacheKey - Unique key for this search
   * @param {Array} results - Search results to cache
   */
  setCachedSearchResults(cacheKey, results) {
    // Remove oldest cache entry if we're at max capacity
    if (this.searchCache.size >= this.maxCacheSize) {
      const firstKey = this.searchCache.keys().next().value;
      this.searchCache.delete(firstKey);
      // Removed old cache entry
    }

    this.searchCache.set(cacheKey, {
      results,
      timestamp: Date.now(),
    });

    console.log(
      "💾 Cached search results for:",
      cacheKey,
      `(${results.length} results)`
    );
  }

  /**
   * 🧹 Clean up expired cache entries (maintenance)
   */
  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, value] of this.searchCache.entries()) {
      if (now - value.timestamp > this.cacheExpiry) {
        this.searchCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  // =========================
  // AVATAR CACHING SYSTEM
  // =========================

  /**
   * 🎨 Get cached avatar data for a user
   * @param {string} userId - User ID to look up
   * @returns {Object|null} Cached avatar data or null
   */
  getCachedAvatarData(userId) {
    const cached = this.avatarCache.get(userId);
    
    if (!cached) {
      return null;
    }

    const now = Date.now();
    
    // If expired, remove and return null
    if (now - cached.timestamp > this.avatarCacheExpiry) {
      this.avatarCache.delete(userId);
      // Avatar cache expired
      return null;
    }

    // Mark if stale (but still usable)
    cached.isStale = now - cached.timestamp > this.avatarStaleThreshold;
    
    return cached;
  }

  /**
   * 🎨 Cache avatar data for a user
   * @param {string} userId - User ID
   * @param {Object} avatarConfig - Avatar configuration
   * @param {Object} userInfo - Additional user info (displayName, major)
   */
  setCachedAvatarData(userId, avatarConfig, userInfo = {}) {
    // Remove oldest entries if at capacity
    if (this.avatarCache.size >= this.maxAvatarCacheSize) {
      const oldestKey = this.avatarCache.keys().next().value;
      this.avatarCache.delete(oldestKey);
      // Removed old avatar cache entry
    }

    this.avatarCache.set(userId, {
      avatarConfig,
      userInfo,
      timestamp: Date.now(),
      isStale: false
    });

    console.log(`🎨 Cached avatar data for user: ${userId}`);
  }

  /**
   * 🎨 Get fresh avatar data for users whose cached data is stale
   * @param {Array<string>} userIds - Array of user IDs to refresh
   * @returns {Promise<Map>} Map of userId -> fresh avatar data
   */
  async refreshStaleAvatars(userIds) {
    if (!userIds.length) return new Map();
    
    console.log(`🔄 Refreshing ${userIds.length} stale avatars...`);
    
    try {
      const refreshedAvatars = new Map();
      
      // Fetch fresh user data one by one (since no batch method exists)
      // Limit concurrent requests to avoid overwhelming the database
      const batchSize = 5;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        
        const promises = batch.map(async (userId) => {
          try {
            const userData = await dataManager.getUserProfile(userId);
            if (userData?.avatarConfig) {
              // Update cache with fresh data
              this.setCachedAvatarData(userId, userData.avatarConfig, {
                displayName: userData.profile?.displayName,
                major: userData.profile?.major
              });
              
              return { userId, avatarConfig: userData.avatarConfig };
            }
          } catch (error) {
            console.warn(`⚠️ Failed to refresh avatar for user ${userId}:`, error);
          }
          return null;
        });
        
        const results = await Promise.all(promises);
        results.forEach(result => {
          if (result) {
            refreshedAvatars.set(result.userId, result.avatarConfig);
          }
        });
      }
      
      // Refreshed avatars
      return refreshedAvatars;
      
    } catch (error) {
      console.error('❌ Error refreshing stale avatars:', error);
      return new Map();
    }
  }

  /**
   * 🧹 Clean up expired avatar cache entries
   */
  cleanupExpiredAvatarCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, cached] of this.avatarCache.entries()) {
      if (now - cached.timestamp > this.avatarCacheExpiry) {
        this.avatarCache.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired avatar cache entries`);
    }
  }

  /**
   * 🗑️ Clear avatar cache for a specific user (when their avatar changes)
   * @param {string} userId - User ID to clear cache for
   */
  clearAvatarCache(userId) {
    if (this.avatarCache.has(userId)) {
      this.avatarCache.delete(userId);
      // Cleared avatar cache
    }
  }

  /**
   * 🧹 Clear all avatar cache (for debugging or complete refresh)
   */
  clearAllAvatarCache() {
    const count = this.avatarCache.size;
    this.avatarCache.clear();
    console.log(`🧹 Cleared all avatar cache: ${count} entries removed`);
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
   * @param {Array} currentRequests - Current outgoing requests
   * @private
   */
  checkForFriendRequestStatusChanges(currentRequests) {
    // Store previous requests for comparison
    if (!this.previousOutgoingRequests) {
      this.previousOutgoingRequests = currentRequests;
      return;
    }

    // Find status changes
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
    import("../notification-manager.js")
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
   * 🔍 Search for students at the same university
   * @param {string} searchTerm - Name or major to search for
   * @returns {Promise<Array>} Array of matching students
   */
  async searchStudents(searchTerm) {
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

    try {
      // Searching for students

      // 2. Fetch users directly using the optimized search function
      const students = await dataManager.findUsersByUniversity(
        userProfile.universityInfo.university,
        searchTerm,
        10 // Limit to 10 results for fast display
      );

      // 3. Use our smart filtering to exclude friends and pending requests
      const filteredStudents = await this.filterSearchResults(students);

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

    try {
      // Filtering search results

      // Get current friendships and pending requests for filtering
      // This runs both queries at the same time (parallel = faster!)
      const [friendships, pendingRequests] = await Promise.all([
        this.getFriendsList(),
        this.getPendingRequests(),
      ]);

      // Create fast lookup sets (like a phone book index - super fast!)
      const friendIds = new Set(friendships.map((f) => f.id));
      const pendingIds = new Set(pendingRequests.map((r) => r.fromUserId));

      console.log(
        `📊 Excluding: ${friendIds.size} friends, ${pendingIds.size} pending requests`
      );

      // Filter out unwanted results
      const filteredResults = searchResults.filter((student) => {
        // Exclude self (double-check, just in case)
        if (student.id === currentUser.uid) {
          return false;
        }

        // Exclude existing friends
        if (friendIds.has(student.id)) {
          console.log(`🤝 Skipping friend: ${student.profile?.displayName}`);
          return false;
        }

        // Exclude users we already sent requests to
        if (pendingIds.has(student.id)) {
          console.log(
            `📤 Skipping pending request: ${student.profile?.displayName}`
          );
          return false;
        }

        return true; // This person is available for new friend request!
      });

      console.log(
        `✅ ${filteredResults.length} students available for friend requests`
      );
      return filteredResults;
    } catch (error) {
      console.error("❌ Error filtering search results:", error);
      // If filtering fails, just return the original results minus current user
      return searchResults.filter((student) => student.id !== currentUser.uid);
    }
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
   * 📊 Monitor search performance and log metrics
   * @param {string} searchType - Type of search ("name_search" or "major_search")
   * @param {number} resultCount - Number of results returned
   * @param {number} searchTime - Time taken in milliseconds
   * @param {string} searchTerm - What was searched for
   */
  logSearchMetrics(searchType, resultCount, searchTime, searchTerm) {
    const metrics = {
      type: searchType,
      term: searchTerm,
      results: resultCount,
      time: Math.round(searchTime), // Round to whole milliseconds
      timestamp: new Date().toISOString(),
      university: currentUser.profile?.universityInfo?.university || "unknown",
    };

    // Color-coded performance logging
    const timeColor = searchTime < 500 ? "🟢" : searchTime < 1000 ? "🟡" : "🔴";
    console.log(`📊 Search Performance ${timeColor}:`, {
      type: searchType,
      term: searchTerm,
      results: `${resultCount} results`,
      speed: `${Math.round(searchTime)}ms`,
      rating: searchTime < 500 ? "FAST" : searchTime < 1000 ? "OK" : "SLOW",
    });

    // TODO: In a real app, you'd send this to an analytics service
    // analytics.track('friend_search_performance', metrics);

    return metrics;
  }

  /**
   * 🔍 Search with performance tracking (enhanced version)
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Search results with performance metrics
   */
  async searchStudentsWithMetrics(searchTerm) {
    const startTime = performance.now();

    try {
      const results = await this.searchStudents(searchTerm);
      const endTime = performance.now();
      const searchTime = endTime - startTime;

      // Log performance metrics
      this.logSearchMetrics(
        "name_search",
        results.length,
        searchTime,
        searchTerm
      );

      return results;
    } catch (error) {
      const endTime = performance.now();
      const searchTime = endTime - startTime;

      // Log failed search metrics
      this.logSearchMetrics("name_search_error", 0, searchTime, searchTerm);
      throw error;
    }
  }

  /**
   * 🎓 Search by major with performance tracking
   * @param {string} major - Major to search for
   * @returns {Promise<Array>} Search results with performance metrics
   */
  async searchByMajorWithMetrics(major) {
    const startTime = performance.now();

    try {
      const results = await this.searchByMajor(major);
      const endTime = performance.now();
      const searchTime = endTime - startTime;

      // Log performance metrics
      this.logSearchMetrics("major_search", results.length, searchTime, major);

      return results;
    } catch (error) {
      const endTime = performance.now();
      const searchTime = endTime - startTime;

      // Log failed search metrics
      this.logSearchMetrics("major_search_error", 0, searchTime, major);
      throw error;
    }
  }

  /**
   * 🚀 Smart search with auto-detection (2025 UX best practice)
   * Automatically searches both names AND majors in one intelligent query
   * @param {string} searchTerm - Search term (name, major, or partial match)
   * @returns {Promise<Array>} Combined search results (cached or fresh)
   */
  async searchStudentsWithCache(searchTerm) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !searchTerm || searchTerm.trim().length < 2) {
      return [];
    }

    const cleanTerm = searchTerm.trim().toLowerCase();

    // Create unique cache key for this smart search
    const cacheKey = `smart_${cleanTerm}_${userProfile.universityInfo.university}`;

    // Try cache first
    const cachedResults = this.getCachedSearchResults(cacheKey);
    if (cachedResults) {
      return cachedResults; // Instant return! ⚡
    }

    // Cache miss - perform smart search with performance tracking
    const results = await this.performSmartSearch(searchTerm);

    // Cache the results for next time (but only if we got results)
    if (results.length > 0) {
      this.setCachedSearchResults(cacheKey, results);
      // Add to search history for future suggestions
      this.addToSearchHistory(searchTerm, "smart");
    }

    return results;
  }

  /**
   * 🧠 Perform intelligent search across names, majors, AND student IDs
   * @param {string} searchTerm - What the user typed
   * @returns {Promise<Array>} Combined and ranked results
   */
  async performSmartSearch(searchTerm) {
    const startTime = performance.now();

    try {
      // Determine search type and run appropriate searches in parallel
      const searchPromises = [];

      // Always search names and majors
      searchPromises.push(
        this.searchStudentsWithMetrics(searchTerm), // Search names
        this.searchByMajorWithMetrics(searchTerm) // Search majors
      );

      // Add ID/email search if the term looks like a student ID
      if (this.isLikelyStudentId(searchTerm)) {
        searchPromises.push(this.searchByIdWithMetrics(searchTerm));
      }

      // Run all searches in parallel for maximum speed! 🚀
      const searchResults = await Promise.all(searchPromises);

      const [nameResults, majorResults, idResults = []] = searchResults;

      // Combine and deduplicate results with intelligent ranking
      const combinedResults = this.combineAndRankResults(
        nameResults,
        majorResults,
        idResults,
        searchTerm
      );

      const endTime = performance.now();
      const searchTime = endTime - startTime;

      // Log smart search performance
      this.logSearchMetrics(
        "smart_search",
        combinedResults.length,
        searchTime,
        searchTerm
      );

      return combinedResults;
    } catch (error) {
      const endTime = performance.now();
      this.logSearchMetrics(
        "smart_search_error",
        0,
        endTime - startTime,
        searchTerm
      );

      // Fallback to name search only if other searches fail
      console.warn(
        "🔄 Smart search partially failed, falling back to name search:",
        error
      );
      return await this.searchStudentsWithMetrics(searchTerm);
    }
  }

  /**
   * 🔍 Check if search term looks like a student ID
   * @param {string} term - Search term to analyze
   * @returns {boolean} True if it looks like a student ID
   */
  isLikelyStudentId(term) {
    const cleanTerm = term.trim();

    // Check if it's all digits (student ID pattern)
    const isAllDigits = /^\d+$/.test(cleanTerm);

    // Check if it's an email with ID pattern (2230992@iub.edu.bd)
    const isStudentEmail = /^\d{7}@\w+\.\w+\.\w+$/.test(cleanTerm);

    // Privacy protection: require at least 4 digits for ID search
    const isLongEnough = cleanTerm.length >= 4;

    return isLongEnough && (isAllDigits || isStudentEmail);
  }

  /**
   * 🎓 Search students by ID or email with progressive privacy
   * @param {string} searchTerm - Student ID or email to search for
   * @returns {Promise<Array>} Matching students
   */
  async searchByIdWithMetrics(searchTerm) {
    const startTime = performance.now();

    try {
      const results = await this.searchById(searchTerm);
      const endTime = performance.now();
      const searchTime = endTime - startTime;

      this.logSearchMetrics(
        "id_search",
        results.length,
        searchTime,
        searchTerm
      );
      return results;
    } catch (error) {
      const endTime = performance.now();
      this.logSearchMetrics(
        "id_search_error",
        0,
        endTime - startTime,
        searchTerm
      );
      throw error;
    }
  }

  /**
   * 🔍 Search students by ID or email (core implementation)
   * @param {string} searchTerm - Student ID or email
   * @returns {Promise<Array>} Matching students with privacy controls
   */
  async searchById(searchTerm) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !searchTerm) {
      return [];
    }

    const cleanTerm = searchTerm.trim().toLowerCase();

    try {
      console.log(`🆔 Searching by ID/email: "${cleanTerm}"`);

      // Progressive privacy based on term length
      let maxResults = this.getIdSearchLimit(cleanTerm);

      // Use the data manager to find users by ID/email
      const students = await dataManager.findUsersByIdOrEmail(
        userProfile.universityInfo.university,
        cleanTerm,
        maxResults
      );

      // Apply smart filtering to exclude friends/pending requests
      const filteredStudents = await this.filterSearchResults(students);

      console.log(
        `✅ Found ${filteredStudents.length} students matching ID/email "${cleanTerm}"`
      );
      return filteredStudents;
    } catch (error) {
      console.error("❌ Error searching by ID/email:", error);
      return [];
    }
  }

  /**
   * 🛡️ Get search result limit based on privacy considerations
   * @param {string} term - Search term
   * @returns {number} Maximum results to return
   */
  getIdSearchLimit(term) {
    const length = term.length;

    if (length >= 7) {
      return 10; // Full ID (7+ digits) - more specific, allow more results
    } else if (length >= 5) {
      return 5; // Partial but specific (5-6 digits) - moderate results
    } else {
      return 3; // Short partial (4 digits) - very limited results for privacy
    }
  }

  /**
   * 🎯 Combine and intelligently rank search results
   * @param {Array} nameResults - Results from name search
   * @param {Array} majorResults - Results from major search
   * @param {Array} idResults - Results from ID/email search
   * @param {string} searchTerm - Original search term for ranking
   * @returns {Array} Ranked and deduplicated results
   */
  combineAndRankResults(nameResults, majorResults, idResults = [], searchTerm) {
    const resultsMap = new Map();
    const term = searchTerm.toLowerCase();

    // Add ID/email results first (highest priority - most specific)
    idResults.forEach((user) => {
      resultsMap.set(user.id, {
        ...user,
        matchType: "id",
        relevance: this.calculateIdRelevance(user, term),
      });
    });

    // Add name results (high priority)
    nameResults.forEach((user) => {
      if (!resultsMap.has(user.id)) {
        resultsMap.set(user.id, {
          ...user,
          matchType: "name",
          relevance: this.calculateNameRelevance(user, term),
        });
      }
    });

    // Add major results (lower priority - least specific)
    majorResults.forEach((user) => {
      if (!resultsMap.has(user.id)) {
        resultsMap.set(user.id, {
          ...user,
          matchType: "major",
          relevance: this.calculateMajorRelevance(user, term),
        });
      }
    });

    // Convert to array and sort by relevance
    const rankedResults = Array.from(resultsMap.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 15); // Limit to top 15 results

    console.log(
      `🧠 Smart search combined: ${idResults.length} ID + ${nameResults.length} name + ${majorResults.length} major = ${rankedResults.length} total results`
    );

    return rankedResults;
  }

  /**
   * 📊 Calculate relevance score for ID/email matches
   * @param {Object} user - User object
   * @param {string} term - Search term (ID or email)
   * @returns {number} Relevance score (higher = better match)
   */
  calculateIdRelevance(user, term) {
    const userEmail = user.email?.toLowerCase() || "";
    const userId = this.extractIdFromEmail(userEmail);

    let score = 0;

    // Check if term is an email or just an ID
    const isEmailSearch = term.includes("@");

    if (isEmailSearch) {
      // Exact email match = highest score
      if (userEmail === term) score += 200;
      // Email starts with term (partial email)
      else if (userEmail.startsWith(term)) score += 180;
    } else {
      // ID search - check against extracted user ID
      if (userId) {
        // Exact ID match = highest score
        if (userId === term) score += 190;
        // ID starts with term (partial ID)
        else if (userId.startsWith(term)) score += 170;
        // ID contains term
        else if (userId.includes(term)) score += 150;
      }
    }

    return score;
  }

  /**
   * 🔢 Extract student ID from email
   * @param {string} email - Student email (e.g., "2230992@iub.edu.bd")
   * @returns {string} Student ID (e.g., "2230992")
   */
  extractIdFromEmail(email) {
    if (!email || !email.includes("@")) return "";
    return email.split("@")[0];
  }

  /**
   * 📊 Calculate relevance score for name matches
   * @param {Object} user - User object
   * @param {string} term - Search term
   * @returns {number} Relevance score (higher = better match)
   */
  calculateNameRelevance(user, term) {
    const displayName = user.profile?.displayName?.toLowerCase() || "";
    const firstName = user.profile?.firstName?.toLowerCase() || "";
    const lastName = user.profile?.lastName?.toLowerCase() || "";

    let score = 0;

    // Exact name match = highest score
    if (displayName === term) score += 100;
    else if (firstName === term || lastName === term) score += 90;
    // Name starts with term = high score
    else if (displayName.startsWith(term)) score += 80;
    else if (firstName.startsWith(term) || lastName.startsWith(term))
      score += 70;
    // Name contains term = medium score
    else if (displayName.includes(term)) score += 50;
    else if (firstName.includes(term) || lastName.includes(term)) score += 40;

    return score;
  }

  /**
   * 📊 Calculate relevance score for major matches
   * @param {Object} user - User object
   * @param {string} term - Search term
   * @returns {number} Relevance score (higher = better match)
   */
  calculateMajorRelevance(user, term) {
    const major = user.profile?.major?.toLowerCase() || "";

    let score = 0;

    // Common major abbreviations (CSE, CSC, etc.)
    if (this.isCommonMajorAbbreviation(term, major)) score += 85;
    // Exact major match
    else if (major === term) score += 80;
    // Major starts with term
    else if (major.startsWith(term)) score += 70;
    // Major contains term
    else if (major.includes(term)) score += 60;

    return score;
  }

  /**
   * 🎓 Check if search term matches common major abbreviations
   * @param {string} term - Search term
   * @param {string} major - User's major
   * @returns {boolean} True if it's a common abbreviation match
   */
  isCommonMajorAbbreviation(term, major) {
    const abbreviations = {
      // Computer Science & Engineering
      cse: [
        "CSE",
        "computer",
        "computer science",
        "computer science and engineering",
      ],
      csc: ["CSC", "computer", "computer science"],
      cs: ["CS", "computer", "computer science"],
      cen: ["CEN", "computer engineering"],
      ece: [
        "ECE",
        "electric",
        "electrical",
        "electrical and computer engineering",
        "electronics and communication",
      ],
      eee: [
        "EEE",
        "electric",
        "electrical",
        "electrical and electronics engineering",
      ],
      mecha: ["ME", "mechanical", "mechanical engineering"],
      ce: ["CE", "civil engineering"],

      // Business Majors
      bba: [
        "BBA",
        "business",
        "bachelor of business administration",
        "business administration",
      ],
      mba: ["MBA", "master of business administration"],
      inb: ["INB", "iternational business", "international business studies"],
      bus: ["BUS", "business", "business studies"],
      fin: ["FIN", "finance", "financial studies"],
      acn: ["ACN", "accounting", "accountancy"],
      mgt: ["MGT", "management", "management studies"],
      mkt: ["MKT", "marketing", "marketing studies"],
      hrm: ["HRM", "human resource management", "human resources"],

      // Science Majors
      math: ["MATH", "mathematics"],
      bio: ["BIO", "biology", "biotechnology"],
      chem: ["CHEM", "chemistry"],
      phy: ["PHY", "physics"],
      microbio: ["MCB", "MICROBIO", "microbiology", "microbial biology"],
      env: ["ENV", "environmental science", "environmental studies"],

      // Communication & Law
      cmn: ["CMN", "communication", "mass communication"],
      law: ["LAW", "legal", "law studies"],
      eng: ["ENG", "english", "english studies"],

      // Economics & Global Studies
      econ: ["ECON", "economics"],
      gsg: ["GSG", "global studies", "global affairs"],
    };

    const possibleMajors = abbreviations[term];
    return possibleMajors
      ? possibleMajors.some((maj) => major.includes(maj))
      : false;
  }

  /**
   * 🎓 Search by major with caching
   * @param {string} major - Major to search for
   * @returns {Promise<Array>} Search results (cached or fresh)
   */
  async searchByMajorWithCache(major) {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile || !major) {
      return [];
    }

    // Create unique cache key for major searches
    const cacheKey = `major_${major.toLowerCase()}_${
      userProfile.universityInfo.university
    }`;

    // Try cache first
    const cachedResults = this.getCachedSearchResults(cacheKey);
    if (cachedResults) {
      return cachedResults; // Instant return! ⚡
    }

    // Cache miss - perform search with performance tracking
    const results = await this.searchByMajorWithMetrics(major);

    // Cache the results for next time
    if (results.length > 0) {
      this.setCachedSearchResults(cacheKey, results);
      // Add to search history for future suggestions
      this.addToSearchHistory(major, "major");
    }

    return results;
  }

  /**
   * 🔄 Clear all cached search results (use when friends list changes)
   */
  clearSearchCache() {
    this.searchCache.clear();
    // Cleared cached search results
  }

  /**
   * 📜 Add search term to history for quick repeat access
   * @param {string} searchTerm - Term that was searched
   * @param {string} searchType - Type of search ("name" or "major")
   */
  addToSearchHistory(searchTerm, searchType = "name") {
    if (!searchTerm || searchTerm.length < 2) return;

    try {
      // Get existing history from localStorage
      const historyKey = "campxus_search_history";
      let history = JSON.parse(localStorage.getItem(historyKey) || "[]");

      // Create search entry
      const searchEntry = {
        term: searchTerm,
        type: searchType,
        timestamp: Date.now(),
        university:
          currentUser.profile?.universityInfo?.university || "unknown",
      };

      // Remove if already exists (to move it to top)
      history = history.filter(
        (entry) => entry.term !== searchTerm || entry.type !== searchType
      );

      // Add to beginning of array
      history.unshift(searchEntry);

      // Keep only recent 10 searches
      history = history.slice(0, 10);

      // Save back to localStorage
      localStorage.setItem(historyKey, JSON.stringify(history));

      console.log(`📜 Added "${searchTerm}" (${searchType}) to search history`);
    } catch (error) {
      console.warn("Could not save search history:", error);
    }
  }

  /**
   * 📖 Get recent search history for suggestions
   * @returns {Array} Recent search terms
   */
  getSearchHistory() {
    try {
      const historyKey = "campxus_search_history";
      const history = JSON.parse(localStorage.getItem(historyKey) || "[]");

      // Filter to current university and recent searches (last 7 days)
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const currentUniversity = currentUser.profile?.universityInfo?.university;

      const filteredHistory = history.filter(
        (entry) =>
          entry.timestamp > weekAgo && entry.university === currentUniversity
      );

      console.log(`📖 Found ${filteredHistory.length} recent searches`);
      return filteredHistory;
    } catch (error) {
      console.warn("Could not load search history:", error);
      return [];
    }
  }

  /**
   * 🗑️ Clear search history
   */
  clearSearchHistory() {
    try {
      localStorage.removeItem("campxus_search_history");
      // Search history cleared
    } catch (error) {
      console.warn("Could not clear search history:", error);
    }
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
        }
        // If status is "rejected", allow sending a new request
        // The existing rejected request will remain in the database for history
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

      // 🎯 STEP 2: Update friend request status to "accepted" (don't delete)
      const updateResult = await dataManager.updateFriendRequestStatus(
        requestId,
        "accepted"
      );
      if (!updateResult.success) {
        console.warn(
          "⚠️ Friendship created but failed to update request status:",
          updateResult.error
        );
        // Don't fail the operation, just log the warning
      }

      // 🎯 STEP 3: Update user social info (friend counts) - TODO in future
      // For now, we'll just log success. In Phase 4, we'll add batch operations
      // to update both users' socialInfo.friendsCount

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

      // 🎯 Update friend request status to "rejected" (don't delete)
      // This allows the sender to see the rejection and send a new request later
      const result = await dataManager.updateFriendRequestStatus(
        requestId,
        "rejected"
      );

      if (result.success) {
        console.log("✅ Friend request rejected successfully");
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

      // 🎯 Transform friendship documents with smart avatar caching
      const friends = [];
      const staleAvatarUserIds = [];

      for (const friendship of friendships) {
        // Determine which user info to show (the friend, not the current user)
        const isUser1 = friendship.user1Id === currentUser.uid;
        const friendInfo = isUser1
          ? friendship.user2Info
          : friendship.user1Info;
        const friendId = isUser1 ? friendship.user2Id : friendship.user1Id;

        // Prioritize fresh data from friendship document over cache
        let avatarConfig = friendInfo?.avatarConfig || null;
        const cachedAvatar = this.getCachedAvatarData(friendId);

        // Clear cache if avatar seed has changed to prevent stale data
        if (avatarConfig?.seed && cachedAvatar?.avatarConfig?.seed && 
            avatarConfig.seed !== cachedAvatar.avatarConfig.seed) {
          this.clearAvatarCache(friendId);
        }

        if (avatarConfig) {
          // Always use fresh data from friendship document if available
          // Update cache with the fresh data
          this.setCachedAvatarData(friendId, avatarConfig, {
            displayName: friendInfo?.displayName,
            major: friendInfo?.major
          });
        } else if (cachedAvatar && !cachedAvatar.isStale) {
          // Only use cached data if no fresh data AND cache isn't stale
          avatarConfig = cachedAvatar.avatarConfig;
        }

        // Mark for background refresh if we have stale cache
        if (cachedAvatar?.isStale) {
          staleAvatarUserIds.push(friendId);
        }

        friends.push({
          // Friend identification
          id: friendId,
          friendshipId: friendship.id,

          // Friend details (cached in friendship document - no extra queries!)
          displayName: friendInfo?.displayName || "Unknown User",
          major: friendInfo?.major || "Unknown Major",
          avatarConfig,

          // Friendship metadata
          friendsSince: friendship.createdAt,
          lastInteraction: friendship.lastInteraction,
          connectionStrength: friendship.connectionStrength || "normal",

          // UI helpers
          isOnline: false, // TODO: Add real-time status in Phase 5
          mutualFriends: friendship.mutualFriends || 0,
        });
      }

      // 🔄 Asynchronously refresh stale avatars in background (non-blocking)
      if (staleAvatarUserIds.length > 0) {
        // Don't await this - let it happen in background
        this.refreshStaleAvatars(staleAvatarUserIds)
          .then((refreshedAvatars) => {
            if (refreshedAvatars.size > 0) {
              
              // Trigger UI update if we have callbacks
              if (this.uiCallbacks.onFriendsListChange) {
                // Re-get friends list with fresh avatars and update UI
                this.getFriendsList().then(updatedFriends => {
                  this.uiCallbacks.onFriendsListChange(updatedFriends);
                });
              }
            }
          })
          .catch(error => {
            console.error('❌ Background avatar refresh failed:', error);
          });
      }

      // 🎯 Sort friends by when they became friends (newest first)
      friends.sort((a, b) => {
        const dateA = a.friendsSince?.toDate?.() || new Date(a.friendsSince);
        const dateB = b.friendsSince?.toDate?.() || new Date(b.friendsSince);
        return dateB - dateA;
      });

      // 🧹 Cleanup expired caches periodically
      if (Math.random() < 0.1) { // 10% chance to run cleanup
        this.cleanupExpiredAvatarCache();
      }

      console.log(`🎉 Successfully processed ${friends.length} friends with smart avatar caching`);
      return friends;
    } catch (error) {
      console.error("❌ Error getting friends list:", error);
      return [];
    }
  }
}

// 🌟 Export a single instance (Singleton pattern)
export const friendsManager = new FriendsManager();
