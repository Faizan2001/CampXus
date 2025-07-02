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

import { authManager } from "../../firebase/auth/auth-manager.js";
import { dataManager } from "../data-manager.js";

class FriendsManager {
  constructor() {
    this.currentUser = null;
    this.userProfile = null;
    this.unsubscribers = []; // For cleaning up Firestore listeners

    // Initialize when authentication state changes
    this.setupAuthentication();
  }

  /**
   * 🔐 Set up authentication integration
   * This connects our friends system to the auth system
   */
  setupAuthentication() {
    authManager.onAuthStateChanged((user) => {
      if (user) {
        this.currentUser = user;
        this.initializeFriendsSystem();
      } else {
        this.cleanup();
      }
    });
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
      } else {
        console.warn(
          "⚠️ Could not find user profile for UID:",
          this.currentUser.uid
        );
      }
    } catch (error) {
      console.error("❌ Error initializing friends system:", error);
      // We can add more robust error handling here later
    }
  }

  /**
   * 🔍 Search for students at the same university
   * @param {string} searchTerm - Name or major to search for
   * @returns {Promise<Array>} Array of matching students
   */
  async searchStudents(searchTerm) {
    // 1. Guard clauses: Ensure we have the necessary data to proceed.
    if (!this.userProfile || !this.currentUser) {
      console.error("❌ User profile not loaded. Cannot search.");
      return []; // Return empty if profile isn't loaded
    }
    if (!searchTerm || searchTerm.trim().length < 2) {
      return []; // Don't search for very short terms
    }

    try {
      console.log(`🔍 Searching for: "${searchTerm}"`);
      const lowerCaseSearchTerm = searchTerm.toLowerCase();

      // 2. Fetch all users from the same university using the data manager.
      const allStudents = await dataManager.findUsersByUniversity(
        this.userProfile.universityInfo.university
      );

      // 3. Filter the results on the client-side.
      const filteredStudents = allStudents.filter((student) => {
        // Exclude the current user from the results.
        if (student.id === this.currentUser.uid) {
          return false;
        }

        // Check for a match in displayName or major (case-insensitive).
        const displayName = student.profile?.displayName?.toLowerCase() || "";
        const major = student.profile?.major?.toLowerCase() || "";

        return (
          displayName.includes(lowerCaseSearchTerm) ||
          major.includes(lowerCaseSearchTerm)
        );
      });

      // 4. Return the top 10 results for performance.
      return filteredStudents.slice(0, 10);
    } catch (error) {
      console.error("❌ Error searching students:", error);
      // In case of an error, return an empty array to prevent UI breakage.
      return [];
    }
  }

  /**
   * 📩 Send a friend request to another student
   * @param {string} targetUserId - The user ID to send request to
   * @param {Object} targetUserData - Basic info about the target user
   * @returns {Promise<Object>} Success/failure result
   */
  async sendFriendRequest(targetUserId, targetUserData) {
    // 🛡️ Input validation: Make sure we have everything we need
    if (!this.currentUser || !this.userProfile) {
      console.error("❌ User not authenticated or profile not loaded");
      return {
        success: false,
        message: "Please log in and complete your profile",
      };
    }

    if (!targetUserId || !targetUserData) {
      console.error("❌ Target user information missing");
      return { success: false, message: "Invalid user selected" };
    }

    // 🚫 Prevent sending request to yourself
    if (targetUserId === this.currentUser.uid) {
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

      // 🔍 Check if request already exists (prevents duplicates)
      const existingRequest = await dataManager.checkExistingFriendRequest(
        this.currentUser.uid,
        targetUserId
      );

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          return { success: false, message: "Friend request already sent!" };
        } else if (existingRequest.status === "accepted") {
          return { success: false, message: "You are already friends!" };
        }
      }

      // 📝 Create the friend request data using our data structure
      const requestData = {
        fromUserId: this.currentUser.uid,
        toUserId: targetUserId,
        status: "pending",
        requestType: "direct",
        message: "",

        // 👤 Cache user info for quick display (no extra queries needed later)
        fromUserInfo: {
          displayName: this.userProfile.profile.displayName,
          major: this.userProfile.profile.major,
          university: this.userProfile.universityInfo.university,
          avatar: this.userProfile.avatarConfig,
        },

        toUserInfo: {
          displayName: targetUserData.profile.displayName,
          major: targetUserData.profile.major,
          university: targetUserData.universityInfo.university,
          avatar: targetUserData.avatarConfig,
        },
      };

      // 💾 Save to database using our data manager
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
    // 🛡️ Ensure user is authenticated and profile is loaded
    if (!this.currentUser || !this.userProfile) {
      console.error("❌ User not authenticated or profile not loaded");
      return [];
    }

    try {
      console.log(
        "📬 Getting pending requests for:",
        this.userProfile.profile.displayName
      );

      // 🔍 Use our data manager to fetch pending requests
      const pendingRequests = await dataManager.getPendingFriendRequests(
        this.currentUser.uid
      );

      console.log(`✅ Found ${pendingRequests.length} pending friend requests`);

      // 🎯 Return the requests with all cached user info for quick display
      return pendingRequests.map((request) => ({
        ...request,
        // Add a helper property for easy UI display
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
    // 🛡️ Input validation
    if (!this.currentUser || !this.userProfile) {
      console.error("❌ User not authenticated or profile not loaded");
      return { success: false, message: "Please log in first" };
    }

    if (!requestId || !requestData) {
      console.error("❌ Missing request ID or data");
      return { success: false, message: "Invalid request data" };
    }

    // 🔒 Security check: Make sure this request is actually for the current user
    if (requestData.toUserId !== this.currentUser.uid) {
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
            requestData.toUserInfo.avatar || this.userProfile.avatarConfig,
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
    // 🛡️ Input validation
    if (!this.currentUser || !this.userProfile) {
      console.error("❌ User not authenticated or profile not loaded");
      return { success: false, message: "Please log in first" };
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
    // 🛡️ Ensure user is authenticated and profile is loaded
    if (!this.currentUser || !this.userProfile) {
      console.error("❌ User not authenticated or profile not loaded");
      return [];
    }

    try {
      console.log(
        "👥 Getting friends list for:",
        this.userProfile.profile.displayName
      );

      // 🔍 Use our data manager to fetch friendships
      const friendships = await dataManager.getUserFriendships(
        this.currentUser.uid
      );

      console.log(`✅ Found ${friendships.length} friendships`);

      // 🎯 Transform friendship documents into friend objects for easy UI display
      const friends = friendships.map((friendship) => {
        // Determine which user info to show (the friend, not the current user)
        const isUser1 = friendship.user1Id === this.currentUser.uid;
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

  /**
   * 🔴 Clean up listeners when user logs out
   */
  cleanup() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.currentUser = null;
    this.userProfile = null;
  }
}

// 🌟 Export a single instance (Singleton pattern)
export const friendsManager = new FriendsManager();
