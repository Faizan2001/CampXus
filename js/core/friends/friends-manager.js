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
    try {
      // TODO: Implement friend request sending
      console.log("📩 Sending friend request to:", targetUserId);

      return { success: true, message: "Friend request sent!" };
    } catch (error) {
      console.error("❌ Error sending friend request:", error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 📬 Get pending friend requests for current user
   * @returns {Promise<Array>} Array of pending requests
   */
  async getPendingRequests() {
    try {
      // TODO: Implement fetching pending requests
      console.log("📬 Getting pending requests...");

      return [];
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
    try {
      // TODO: Implement friend request acceptance
      console.log("✅ Accepting friend request:", requestId);

      return { success: true, message: "Friend request accepted!" };
    } catch (error) {
      console.error("❌ Error accepting friend request:", error);
      return { success: false, message: "Failed to accept request" };
    }
  }

  /**
   * ❌ Reject a friend request
   * @param {string} requestId - The request ID to reject
   * @returns {Promise<Object>} Success/failure result
   */
  async rejectFriendRequest(requestId) {
    try {
      // TODO: Implement friend request rejection
      console.log("❌ Rejecting friend request:", requestId);

      return { success: true, message: "Friend request rejected" };
    } catch (error) {
      console.error("❌ Error rejecting friend request:", error);
      return { success: false, message: "Failed to reject request" };
    }
  }

  /**
   * 👥 Get the current user's friends list
   * @returns {Promise<Array>} Array of friends
   */
  async getFriendsList() {
    try {
      // TODO: Implement friends list retrieval
      console.log("👥 Getting friends list...");

      return [];
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
