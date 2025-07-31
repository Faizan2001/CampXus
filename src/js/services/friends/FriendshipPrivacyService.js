/**
 * FriendshipPrivacyService - Bilateral Privacy Management for Friendships
 *
 * This service manages schedule privacy controls using the friendship-centric
 * bilateral privacy system, replacing the flawed user-centric approach.
 *
 * Key Features:
 * - Single source of truth per privacy relationship
 * - Bilateral control (each user controls their own visibility)
 * - No conflicts or race conditions
 * - Secure Firestore integration
 */

import {
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
} from "firebase/firestore";
import { db } from "../../lib/firebase/firebase-config.js";
import {
  getFriendshipId,
  isScheduleVisibleToFriend,
  updateScheduleVisibility,
  getPrivacyStatus,
  validateFriendshipDocument,
  PRIVACY_DEFAULTS,
} from "../../utils/friendship-utils.js";
import { notificationManager } from "../realtime/NotificationService.js";

class FriendshipPrivacyService {
  constructor() {
    this.cache = new Map(); // Cache friendship documents for performance
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache expiry
    this.pendingOperations = new Set(); // Track pending operations
  }

  /**
   * Get friendship document with caching and retry mechanism for race conditions
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @param {number} retryCount - Current retry attempt (default: 0)
   * @returns {Object|null} Friendship document or null if not found
   */
  async getFriendshipDocument(userId1, userId2, retryCount = 0) {
    // Add input validation
    if (!userId1 || !userId2) {
      console.error(
        "❌ FriendshipPrivacyService.getFriendshipDocument: Invalid user IDs:",
        { userId1, userId2 }
      );
      return null;
    }

    if (userId1 === userId2) {
      console.error(
        "❌ FriendshipPrivacyService.getFriendshipDocument: Cannot get friendship with same user:",
        userId1
      );
      return null;
    }

    try {
      const friendshipId = getFriendshipId(userId1, userId2);

      // Check cache first
      const cached = this.cache.get(friendshipId);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }

      console.log(
        `🔐 Fetching friendship document: ${friendshipId} (attempt ${
          retryCount + 1
        })`
      );
      const docRef = doc(db, "friendships", friendshipId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const friendshipDoc = docSnap.data();

        // Validate document structure
        const validation = validateFriendshipDocument(friendshipDoc);
        if (!validation.isValid) {
          console.warn(
            "Invalid friendship document structure:",
            validation.errors
          );
          return null;
        }

        // Cache the result
        this.cache.set(friendshipId, {
          data: friendshipDoc,
          timestamp: Date.now(),
        });

        console.log(
          `✅ Successfully fetched friendship document: ${friendshipId}`
        );
        return friendshipDoc;
      }

      // Handle race condition: document might not be available yet
      if (retryCount < 3) {
        console.log(
          `⏳ Friendship document not found, retrying in ${
            (retryCount + 1) * 500
          }ms...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, (retryCount + 1) * 500)
        );
        return this.getFriendshipDocument(userId1, userId2, retryCount + 1);
      }

      console.log(
        `⚠️ Friendship document not found after ${
          retryCount + 1
        } attempts: ${friendshipId}`
      );
      return null;
    } catch (error) {
      console.error("❌ Error fetching friendship document:", error);

      // Handle permission denied errors with retry for race conditions
      if (error.code === "permission-denied" && retryCount < 3) {
        console.log(
          `⏳ Permission error (likely due to Firestore propagation delay), retrying in ${
            (retryCount + 1) * 750
          }ms... (attempt ${retryCount + 2})`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, (retryCount + 1) * 750)
        );
        return this.getFriendshipDocument(userId1, userId2, retryCount + 1);
      }

      if (error.code === "permission-denied") {
        console.error(
          "❌ Permission denied accessing friendship document. Check Firestore rules."
        );
      }
      throw new Error(`Failed to fetch friendship: ${error.message}`);
    }
  }
  /**
   * Check if a user's schedule is visible to their friend
   * @param {string} scheduleOwnerUid - User whose schedule visibility we're checking
   * @param {string} friendUid - Friend who wants to view the schedule
   * @returns {boolean} True if schedule is visible, false if hidden
   */
  async isScheduleVisible(scheduleOwnerUid, friendUid) {
    // Add input validation
    if (!scheduleOwnerUid || !friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.isScheduleVisible: Invalid user IDs:",
        { scheduleOwnerUid, friendUid }
      );
      return false;
    }

    if (scheduleOwnerUid === friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.isScheduleVisible: Cannot check visibility with same user:",
        scheduleOwnerUid
      );
      return false;
    }

    try {
      console.log(
        `🔐 Checking schedule visibility: ${scheduleOwnerUid} → ${friendUid}`
      );
      const friendshipDoc = await this.getFriendshipDocument(
        scheduleOwnerUid,
        friendUid
      );

      if (!friendshipDoc) {
        // No friendship exists, schedule is not visible
        console.log(
          `⚠️ No friendship found between ${scheduleOwnerUid} and ${friendUid}`
        );
        return false;
      }

      const isVisible = isScheduleVisibleToFriend(
        friendshipDoc,
        scheduleOwnerUid
      );
      console.log(
        `✅ Schedule visibility result: ${scheduleOwnerUid} → ${friendUid} = ${isVisible}`
      );
      return isVisible;
    } catch (error) {
      console.error("❌ Error checking schedule visibility:", error);
      // Default to not visible on error for security
      return false;
    }
  }

  /**
   * Update a user's schedule visibility to a specific friend using atomic transactions
   * This prevents race conditions when both users update privacy simultaneously
   * @param {string} userUid - User updating their own visibility
   * @param {string} friendUid - Friend the visibility applies to
   * @param {boolean} isVisible - Whether user's schedule should be visible
   * @returns {boolean} Success status
   */
  async updateScheduleVisibility(userUid, friendUid, isVisible) {
    // Add input validation
    if (!userUid || !friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.updateScheduleVisibility: Invalid user IDs:",
        { userUid, friendUid }
      );
      return false;
    }

    if (userUid === friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.updateScheduleVisibility: Cannot update visibility with same user:",
        userUid
      );
      return false;
    }

    if (typeof isVisible !== "boolean") {
      console.error(
        "❌ FriendshipPrivacyService.updateScheduleVisibility: isVisible must be boolean:",
        isVisible
      );
      return false;
    }

    const friendshipId = getFriendshipId(userUid, friendUid);
    const operationKey = `${friendshipId}_${userUid}`;

    // Prevent duplicate operations
    if (this.pendingOperations.has(operationKey)) {
      console.warn("⚠️ Privacy update already in progress for this friendship");
      return false;
    }

    this.pendingOperations.add(operationKey);

    try {
      console.log(
        `🔐 Updating schedule visibility: ${userUid} → ${friendUid} = ${isVisible}`
      );

      // Use Firestore transaction to prevent race conditions
      const docRef = doc(db, "friendships", friendshipId);
      let friendName = "Unknown";

      const success = await runTransaction(db, async (transaction) => {
        // Read current document state within transaction
        const docSnap = await transaction.get(docRef);
        
        if (!docSnap.exists()) {
          throw new Error("Friendship not found");
        }

        const friendshipDoc = docSnap.data();

        // Validate document structure
        const validation = validateFriendshipDocument(friendshipDoc);
        if (!validation.isValid) {
          throw new Error("Invalid friendship document structure");
        }

        // Get friend name for notification
        friendName = friendshipDoc.user1Id === userUid
          ? friendshipDoc.user2Info.displayName
          : friendshipDoc.user1Info.displayName;

        // Create atomic update - only modify the current user's visibility
        const now = Date.now();
        const updateData = {
          [`scheduleVisibility.${userUid}`]: isVisible,
          "privacyMetadata.lastPrivacyUpdate": now,
          "privacyMetadata.privacyUpdatedBy": userUid,
          "privacyMetadata.privacyVersion": (friendshipDoc.privacyMetadata?.privacyVersion || 0) + 1,
        };

        // Apply the atomic update
        transaction.update(docRef, updateData);

        console.log(
          `🔄 Transaction: Atomically updating ${userUid}'s visibility to ${isVisible}`
        );

        return true;
      });

      if (success) {
        // Invalidate cache after successful transaction
        this.cache.delete(friendshipId);

        // Log success without showing notification
        console.log(
          `✅ Successfully updated schedule visibility: ${userUid} → ${friendUid} = ${isVisible}`
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error updating schedule visibility:", error);

      // Show error notification
      notificationManager.showSystemNotification(
        `Failed to update schedule privacy: ${error.message}`,
        "error"
      );

      return false;
    } finally {
      this.pendingOperations.delete(operationKey);
    }
  }

  /**
   * Update schedule visibility for multiple friends (batch operation)
   * Useful for global privacy toggle
   * @param {string} userUid - User updating their visibility
   * @param {boolean} isVisible - Whether user's schedule should be visible
   * @returns {Object} Operation results
   */
  async updateScheduleVisibilityForAllFriends(userUid, isVisible) {
    try {
      // Get all friendships for the user
      const friendshipIds = await this.getUserFriendshipIds(userUid);

      if (friendshipIds.length === 0) {
        return { success: true, updated: 0, errors: [] };
      }

      // Create batch operation
      const batch = writeBatch(db);
      const errors = [];
      let updated = 0;

      for (const friendshipId of friendshipIds) {
        try {
          // Create update data for this friendship
          const updateData = updateScheduleVisibility(null, userUid, isVisible);
          const docRef = doc(db, "friendships", friendshipId);
          batch.update(docRef, updateData);
          updated++;

          // Invalidate cache
          this.cache.delete(friendshipId);
        } catch (error) {
          errors.push(`${friendshipId}: ${error.message}`);
        }
      }

      // Commit batch
      await batch.commit();

      // Show notification
      const action = isVisible ? "visible" : "hidden";
      notificationManager.showSystemNotification(
        `Schedule ${action} for ${updated} friends ✅`,
        "success"
      );

      return {
        success: true,
        updated: updated,
        errors: errors,
      };
    } catch (error) {
      console.error(
        "Error updating schedule visibility for all friends:",
        error
      );
      notificationManager.showSystemNotification(
        `Failed to update global privacy: ${error.message}`,
        "error"
      );

      return {
        success: false,
        updated: 0,
        errors: [error.message],
      };
    }
  }

  /**
   * Get privacy status for a friendship (for UI display)
   * @param {string} currentUserUid - Current user's ID
   * @param {string} friendUid - Friend's user ID
   * @returns {Object|null} Privacy status or null if friendship not found
   */
  async getPrivacyStatus(currentUserUid, friendUid) {
    // Add input validation
    if (!currentUserUid || !friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.getPrivacyStatus: Invalid user IDs:",
        { currentUserUid, friendUid }
      );
      return null;
    }

    if (currentUserUid === friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.getPrivacyStatus: Cannot get privacy status with same user:",
        currentUserUid
      );
      return null;
    }

    try {
      console.log(
        `🔐 Getting privacy status: ${currentUserUid} ↔ ${friendUid}`
      );
      const friendshipDoc = await this.getFriendshipDocument(
        currentUserUid,
        friendUid
      );

      if (!friendshipDoc) {
        console.log(
          `⚠️ No friendship found for privacy status: ${currentUserUid} ↔ ${friendUid}`
        );
        return null;
      }

      const privacyStatus = getPrivacyStatus(
        friendshipDoc,
        currentUserUid,
        friendUid
      );
      console.log(`✅ Privacy status retrieved:`, privacyStatus);
      return privacyStatus;
    } catch (error) {
      console.error("❌ Error getting privacy status:", error);
      return null;
    }
  }

  /**
   * Get all friendship IDs for a user
   * @param {string} userUid - User ID
   * @returns {Array<string>} Array of friendship IDs
   */
  async getUserFriendshipIds(userUid) {
    try {
      const q = query(
        collection(db, "friendships"),
        where("users", "array-contains", userUid)
      );

      const querySnapshot = await getDocs(q);
      const friendshipIds = [];

      querySnapshot.forEach((doc) => {
        friendshipIds.push(doc.id);
      });

      return friendshipIds;
    } catch (error) {
      console.error("Error getting user friendship IDs:", error);
      return [];
    }
  }

  /**
   * Get privacy statistics for a user
   * @param {string} userUid - User ID
   * @returns {Object} Privacy statistics
   */
  async getPrivacyStatistics(userUid) {
    try {
      const friendshipIds = await this.getUserFriendshipIds(userUid);
      let visibleCount = 0;
      let hiddenCount = 0;
      let totalFriends = friendshipIds.length;

      for (const friendshipId of friendshipIds) {
        const [user1Id, user2Id] = friendshipId.split("_");
        const friendUid = user1Id === userUid ? user2Id : user1Id;

        const isVisible = await this.isScheduleVisible(userUid, friendUid);
        if (isVisible) {
          visibleCount++;
        } else {
          hiddenCount++;
        }
      }

      return {
        totalFriends,
        visibleCount,
        hiddenCount,
        visibilityPercentage:
          totalFriends > 0
            ? Math.round((visibleCount / totalFriends) * 100)
            : 0,
      };
    } catch (error) {
      console.error("Error getting privacy statistics:", error);
      return {
        totalFriends: 0,
        visibleCount: 0,
        hiddenCount: 0,
        visibilityPercentage: 0,
      };
    }
  }

  /**
   * Clear cache (useful for testing or debugging)
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics (for debugging)
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
      pendingOperations: Array.from(this.pendingOperations),
    };
  }

  /**
   * Check if user can see friend's schedule (convenience method)
   * @param {string} userUid - User who wants to view
   * @param {string} friendUid - Friend whose schedule to view
   * @returns {boolean} True if user can see friend's schedule
   */
  async canViewFriendsSchedule(userUid, friendUid) {
    return await this.isScheduleVisible(friendUid, userUid);
  }

  /**
   * Toggle schedule visibility (convenience method)
   * @param {string} userUid - User toggling their visibility
   * @param {string} friendUid - Friend the visibility applies to
   * @returns {boolean} New visibility state
   */
  async toggleScheduleVisibility(userUid, friendUid) {
    const currentlyVisible = await this.isScheduleVisible(userUid, friendUid);
    const newVisibility = !currentlyVisible;

    const success = await this.updateScheduleVisibility(
      userUid,
      friendUid,
      newVisibility
    );

    return success ? newVisibility : currentlyVisible;
  }
}

// Create and export singleton instance
export const friendshipPrivacyService = new FriendshipPrivacyService();

// Export class for testing
export { FriendshipPrivacyService };
