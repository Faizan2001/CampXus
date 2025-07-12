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

export class FriendsManager {
  constructor() {
    this.unsubscribers = []; // For cleaning up Firestore listeners
    // No more setupAuthentication or initialization here!
    // We will get the user data on-demand.
    
    // 🗄️ Initialize search cache for lightning-fast repeated searches
    this.searchCache = new Map();
    this.maxCacheSize = 20; // Store up to 20 recent searches
    this.cacheExpiry = 5 * 60 * 1000; // Cache expires after 5 minutes
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

    console.log("📦 Using cached search results for:", cacheKey, `(${cached.results.length} results)`);
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
      console.log("🗑️ Removed old cache entry:", firstKey);
    }

    this.searchCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    });

    console.log("💾 Cached search results for:", cacheKey, `(${results.length} results)`);
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

  /**
   * 🔍 Search for students at the same university
   * @param {string} searchTerm - Name or major to search for
   * @returns {Promise<Array>} Array of matching students
   */
  async searchStudents(searchTerm) {
    // 1. Get the current user's profile, waiting for it if necessary.
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      console.error("❌ User profile not loaded or user not logged in. Cannot search.");
      return [];
    }

    if (!searchTerm || searchTerm.trim().length < 2) {
      return []; // Don't search for very short terms
    }

    try {
      console.log(`🔍 Searching for: "${searchTerm}"`);

      // 2. Fetch users directly using the optimized search function
      const students = await dataManager.findUsersByUniversity(
        userProfile.universityInfo.university,
        searchTerm,
        10 // Limit to 10 results for fast display
      );

      // 3. Use our smart filtering to exclude friends and pending requests
      const filteredStudents = await this.filterSearchResults(students);

      console.log(`✅ Found ${filteredStudents.length} students matching "${searchTerm}"`);
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
      console.log(`🔍 Filtering ${searchResults.length} search results...`);

      // Get current friendships and pending requests for filtering
      // This runs both queries at the same time (parallel = faster!)
      const [friendships, pendingRequests] = await Promise.all([
        this.getFriendsList(),
        this.getPendingRequests()
      ]);

      // Create fast lookup sets (like a phone book index - super fast!)
      const friendIds = new Set(friendships.map(f => f.id));
      const pendingIds = new Set(pendingRequests.map(r => r.fromUserId));

      console.log(`📊 Excluding: ${friendIds.size} friends, ${pendingIds.size} pending requests`);

      // Filter out unwanted results
      const filteredResults = searchResults.filter(student => {
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
          console.log(`📤 Skipping pending request: ${student.profile?.displayName}`);
          return false;
        }

        return true; // This person is available for new friend request!
      });

      console.log(`✅ ${filteredResults.length} students available for friend requests`);
      return filteredResults;

    } catch (error) {
      console.error("❌ Error filtering search results:", error);
      // If filtering fails, just return the original results minus current user
      return searchResults.filter(student => student.id !== currentUser.uid);
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
      university: currentUser.profile?.universityInfo?.university || 'unknown'
    };

    // Color-coded performance logging
    const timeColor = searchTime < 500 ? '🟢' : searchTime < 1000 ? '🟡' : '🔴';
    console.log(`📊 Search Performance ${timeColor}:`, {
      type: searchType,
      term: searchTerm,
      results: `${resultCount} results`,
      speed: `${Math.round(searchTime)}ms`,
      rating: searchTime < 500 ? 'FAST' : searchTime < 1000 ? 'OK' : 'SLOW'
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
      this.logSearchMetrics('name_search', results.length, searchTime, searchTerm);

      return results;
    } catch (error) {
      const endTime = performance.now();
      const searchTime = endTime - startTime;
      
      // Log failed search metrics
      this.logSearchMetrics('name_search_error', 0, searchTime, searchTerm);
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
      this.logSearchMetrics('major_search', results.length, searchTime, major);

      return results;
    } catch (error) {
      const endTime = performance.now();
      const searchTime = endTime - startTime;
      
      // Log failed search metrics
      this.logSearchMetrics('major_search_error', 0, searchTime, major);
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
      this.addToSearchHistory(searchTerm, 'smart');
    }

    return results;
  }

  /**
   * 🧠 Perform intelligent search across names AND majors simultaneously
   * @param {string} searchTerm - What the user typed
   * @returns {Promise<Array>} Combined and ranked results
   */
  async performSmartSearch(searchTerm) {
    const startTime = performance.now();

    try {
      // Run BOTH searches in parallel for maximum speed! 🚀
      const [nameResults, majorResults] = await Promise.all([
        this.searchStudentsWithMetrics(searchTerm),      // Search names
        this.searchByMajorWithMetrics(searchTerm)        // Search majors
      ]);

      // Combine and deduplicate results (name matches get priority)
      const combinedResults = this.combineAndRankResults(nameResults, majorResults, searchTerm);

      const endTime = performance.now();
      const searchTime = endTime - startTime;

      // Log smart search performance
      this.logSearchMetrics('smart_search', combinedResults.length, searchTime, searchTerm);

      return combinedResults;

    } catch (error) {
      const endTime = performance.now();
      this.logSearchMetrics('smart_search_error', 0, endTime - startTime, searchTerm);
      
      // Fallback to name search only if major search fails
      console.warn("🔄 Smart search partially failed, falling back to name search:", error);
      return await this.searchStudentsWithMetrics(searchTerm);
    }
  }

  /**
   * 🎯 Combine and intelligently rank search results
   * @param {Array} nameResults - Results from name search
   * @param {Array} majorResults - Results from major search  
   * @param {string} searchTerm - Original search term for ranking
   * @returns {Array} Ranked and deduplicated results
   */
  combineAndRankResults(nameResults, majorResults, searchTerm) {
    const resultsMap = new Map();
    const term = searchTerm.toLowerCase();

    // Add name results first (higher priority)
    nameResults.forEach(user => {
      resultsMap.set(user.id, {
        ...user,
        matchType: 'name',
        relevance: this.calculateNameRelevance(user, term)
      });
    });

    // Add major results (only if not already included from name search)
    majorResults.forEach(user => {
      if (!resultsMap.has(user.id)) {
        resultsMap.set(user.id, {
          ...user,
          matchType: 'major',
          relevance: this.calculateMajorRelevance(user, term)
        });
      }
    });

    // Convert to array and sort by relevance
    const rankedResults = Array.from(resultsMap.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 15); // Limit to top 15 results

    console.log(`🧠 Smart search combined: ${nameResults.length} name + ${majorResults.length} major = ${rankedResults.length} total results`);
    
    return rankedResults;
  }

  /**
   * 📊 Calculate relevance score for name matches
   * @param {Object} user - User object
   * @param {string} term - Search term  
   * @returns {number} Relevance score (higher = better match)
   */
  calculateNameRelevance(user, term) {
    const displayName = user.profile?.displayName?.toLowerCase() || '';
    const firstName = user.profile?.firstName?.toLowerCase() || '';
    const lastName = user.profile?.lastName?.toLowerCase() || '';

    let score = 0;

    // Exact name match = highest score
    if (displayName === term) score += 100;
    else if (firstName === term || lastName === term) score += 90;
    
    // Name starts with term = high score
    else if (displayName.startsWith(term)) score += 80;
    else if (firstName.startsWith(term) || lastName.startsWith(term)) score += 70;
    
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
    const major = user.profile?.major?.toLowerCase() || '';
    
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
      'cse': ['computer science', 'computer science and engineering'],
      'csc': ['computer science'],
      'cs': ['computer science'],
      'ece': ['electrical and computer engineering', 'electronics and communication'],
      'eee': ['electrical and electronics engineering'],
      'me': ['mechanical engineering'],
      'ce': ['civil engineering'],
      'bba': ['bachelor of business administration', 'business administration'],
      'mba': ['master of business administration'],
      'eng': ['engineering'],
      'math': ['mathematics'],
      'bio': ['biology', 'biotechnology'],
      'chem': ['chemistry'],
      'phys': ['physics']
    };

    const possibleMajors = abbreviations[term];
    return possibleMajors ? possibleMajors.some(maj => major.includes(maj)) : false;
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
    const cacheKey = `major_${major.toLowerCase()}_${userProfile.universityInfo.university}`;

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
      this.addToSearchHistory(major, 'major');
    }

    return results;
  }

  /**
   * 🔄 Clear all cached search results (use when friends list changes)
   */
  clearSearchCache() {
    const cacheSize = this.searchCache.size;
    this.searchCache.clear();
    console.log(`🗑️ Cleared ${cacheSize} cached search results`);
  }

  /**
   * 📜 Add search term to history for quick repeat access
   * @param {string} searchTerm - Term that was searched
   * @param {string} searchType - Type of search ("name" or "major")
   */
  addToSearchHistory(searchTerm, searchType = 'name') {
    if (!searchTerm || searchTerm.length < 2) return;

    try {
      // Get existing history from localStorage
      const historyKey = 'campxus_search_history';
      let history = JSON.parse(localStorage.getItem(historyKey) || '[]');

      // Create search entry
      const searchEntry = {
        term: searchTerm,
        type: searchType,
        timestamp: Date.now(),
        university: currentUser.profile?.universityInfo?.university || 'unknown'
      };

      // Remove if already exists (to move it to top)
      history = history.filter(entry => 
        entry.term !== searchTerm || entry.type !== searchType
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
      const historyKey = 'campxus_search_history';
      const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
      
      // Filter to current university and recent searches (last 7 days)
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const currentUniversity = currentUser.profile?.universityInfo?.university;
      
      const filteredHistory = history.filter(entry => 
        entry.timestamp > weekAgo && 
        entry.university === currentUniversity
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
      localStorage.removeItem('campxus_search_history');
      console.log("🗑️ Search history cleared");
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
      return { success: false, message: "Please log in to send friend requests." };
    }

    if (!targetUserId || !targetUserData) {
      console.error("❌ Target user information missing");
      return { success: false, message: "Invalid user selected" };
    }

    if (targetUserId === currentUser.uid) {
      return { success: false, message: "You cannot send a friend request to yourself!" };
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
      }

      // 3. Create the friend request object
      const requestData = {
        fromUserId: currentUser.uid,
        toUserId: targetUserId,
        status: "pending",
        requestType: "direct",
        message: "",
        fromUserInfo: {
          displayName: userProfile.profile.displayName,
          major: userProfile.profile.major,
          university: userProfile.universityInfo.university,
          avatar: userProfile.avatarConfig,
        },
        toUserInfo: {
          displayName: targetUserData.profile.displayName,
          major: targetUserData.profile.major,
          university: targetUserData.universityInfo.university,
          avatar: targetUserData.avatarConfig,
        },
      };

      // 4. Save to database
      const result = await dataManager.createFriendRequest(requestData);

      if (result.success) {
        console.log("✅ Friend request sent successfully!");
        return { success: true, message: `Friend request sent to ${targetUserData.profile.displayName}!` };
      } else {
        return { success: false, message: "Failed to send friend request. Please try again." };
      }
    } catch (error) {
      console.error("❌ Error sending friend request:", error);
      return { success: false, message: "Something went wrong. Please try again." };
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
      console.log("📬 Getting pending requests for:", userProfile.profile.displayName);
      const pendingRequests = await dataManager.getPendingFriendRequests(currentUser.uid);
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

      // 🎯 STEP 1: Update the friend request status to "accepted"
      const updateResult = await dataManager.updateFriendRequestStatus(
        requestId,
        "accepted"
      );

      if (!updateResult.success) {
        return { success: false, message: "Failed to update request status" };
      }

      // 🎯 STEP 2: Create the friendship document
      const friendshipData = {
        users: [requestData.fromUserId, requestData.toUserId], // Array for easy querying
        user1Id: requestData.fromUserId,
        user2Id: requestData.toUserId,

        // Cache user info from the request (already available!)
        user1Info: {
          displayName: requestData.fromUserInfo.displayName,
          major: requestData.fromUserInfo.major,
          avatar: requestData.fromUserInfo.avatar,
        },

        user2Info: {
          displayName: requestData.toUserInfo.displayName,
          major: requestData.toUserInfo.major,
          avatar:
            requestData.toUserInfo.avatar || userProfile.avatarConfig,
        },

        // Metadata
        friendshipType: "classmate",
        mutualFriends: 0,
        connectionStrength: "normal",
      };

      const friendshipResult = await dataManager.createFriendship(
        friendshipData
      );

      if (!friendshipResult.success) {
        console.error("❌ Failed to create friendship");
        return { success: false, message: "Failed to create friendship" };
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

      // 🎯 Simply update the request status to "rejected"
      // No friendship document is created, no counters updated
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
   * 👥 Get the current user's friends list
   * @returns {Promise<Array>} Array of friends with their info
   */
  async getFriendsList() {
    const userProfile = await currentUser.waitForProfile();
    if (!userProfile) {
      console.error("❌ Cannot get friends list, user not logged in.");
      return [];
    }

    try {
      console.log("👥 Getting friends list for:", userProfile.profile.displayName);
      const friendships = await dataManager.getUserFriendships(currentUser.uid);

      if (!friendships.length) {
        console.log("👥 No friends found");
        return [];
      }

      // 🎯 Transform friendship documents into friend objects for easy UI display
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
          avatar: friendInfo?.avatar || null,

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
