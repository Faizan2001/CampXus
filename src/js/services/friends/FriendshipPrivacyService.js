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
import { realTimeManager } from "../realtime/RealtimeService.js";

class FriendshipPrivacyService {
  constructor() {
    this.cache = new Map(); // Cache friendship documents for performance
    this.quickAccessCache = new Map(); // Cache quick access status for performance
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache expiry
    this.pendingOperations = new Set(); // Track pending operations

    // Simple memory management
    this.maxCacheSize = 100; // Simple cache limit
    this.maxQuickAccessCacheSize = 200; // Simple cache limit
    this.operationTimeout = 30 * 1000; // 30 second timeout for pending operations
    this.pendingOperationTimers = new Map(); // Track operation timeouts
  }

  /**
   * Get friendship document with caching and retry mechanism for race conditions
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @param {number} retryCount - Current retry attempt (default: 0)
   * @returns {Object|null} Friendship document or null if not found
   */
  async getFriendshipDocument(userId1, userId2) {
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

      console.log(`🔐 Fetching friendship document: ${friendshipId}`);
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

        // Cache the result with simple size limit
        if (this.cache.size >= this.maxCacheSize) {
          const oldestKey = this.cache.keys().next().value;
          this.cache.delete(oldestKey);
        }
        this.cache.set(friendshipId, {
          data: friendshipDoc,
          timestamp: Date.now(),
        });

        console.log(`✅ Successfully fetched friendship document: ${friendshipId}`);
        return friendshipDoc;
      }

      // Document doesn't exist (friendship was deleted or never existed)
      console.log(`⚠️ Friendship document not found: ${friendshipId}`);
      return null;
    } catch (error) {
      console.error("❌ Error fetching friendship document:", error);
      // Return null instead of throwing - let callers handle the absence gracefully
      return null;
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

    // Simple timeout to prevent memory leaks
    const timeoutId = setTimeout(() => {
      this.pendingOperations.delete(operationKey);
    }, this.operationTimeout);

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
        friendName =
          friendshipDoc.user1Id === userUid
            ? friendshipDoc.user2Info.displayName
            : friendshipDoc.user1Info.displayName;

        // Create atomic update - only modify the current user's visibility
        const now = Date.now();
        const updateData = {
          [`scheduleVisibility.${userUid}`]: isVisible,
          "privacyMetadata.lastPrivacyUpdate": now,
          "privacyMetadata.privacyUpdatedBy": userUid,
          "privacyMetadata.privacyVersion":
            (friendshipDoc.privacyMetadata?.privacyVersion || 0) + 1,
        };

        // Apply the atomic update
        transaction.update(docRef, updateData);

        console.log(
          `🔄 Transaction: Atomically updating ${userUid}'s visibility to ${isVisible}`
        );

        return true;
      });

      if (success) {
        // Invalidate caches after successful transaction
        this.cache.delete(friendshipId);

        // Invalidate quick access cache for both directions
        this.quickAccessCache.delete(`${userUid}_${friendUid}_quickaccess`);
        this.quickAccessCache.delete(`${friendUid}_${userUid}_quickaccess`);

        // Emit real-time privacy change event after successful update
        try {
          realTimeManager.emitSchedulePrivacyChange(
            userUid, // User who made the change
            friendUid, // Friend affected by the change
            isVisible, // New visibility status
            friendName // Friend's name for enhanced payload
          );
          console.log(
            `🔐 Privacy change event emitted: ${userUid} → ${friendUid} = ${isVisible}`
          );
        } catch (eventError) {
          // Don't fail the transaction if event emission fails
          console.error("❌ Failed to emit privacy change event:", eventError);
        }

        // Log success without showing notification
        console.log(
          `✅ Successfully updated schedule visibility: ${userUid} → ${friendUid} = ${isVisible}`
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error updating schedule visibility:", error);

      // Log error instead of showing notification
      console.error(`Failed to update schedule privacy: ${error.message}`);

      return false;
    } finally {
      this.pendingOperations.delete(operationKey);
      clearTimeout(timeoutId);
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

          // Invalidate caches
          this.cache.delete(friendshipId);

          // Invalidate quick access cache for this friendship
          const [user1Id, user2Id] = friendshipId.split("_");
          this.quickAccessCache.delete(`${user1Id}_${user2Id}_quickaccess`);
          this.quickAccessCache.delete(`${user2Id}_${user1Id}_quickaccess`);
        } catch (error) {
          errors.push(`${friendshipId}: ${error.message}`);
        }
      }

      // Commit batch
      await batch.commit();

      // Emit privacy change events for successful batch operation
      try {
        // Get friend information for event emission
        const friendshipIds = await this.getUserFriendshipIds(userUid);

        for (const friendshipId of friendshipIds) {
          try {
            const [user1Id, user2Id] = friendshipId.split("_");
            const friendUid = user1Id === userUid ? user2Id : user1Id;

            // Get friendship document to extract friend name
            const friendshipDoc = await this.getFriendshipDocument(
              userUid,
              friendUid
            );
            if (friendshipDoc) {
              const friendName =
                friendshipDoc.user1Id === userUid
                  ? friendshipDoc.user2Info.displayName
                  : friendshipDoc.user1Info.displayName;

              realTimeManager.emitSchedulePrivacyChange(
                userUid, // User who made the change
                friendUid, // Friend affected by the change
                isVisible, // New visibility status
                friendName // Friend's name for enhanced payload
              );
            }
          } catch (eventError) {
            console.error(
              `❌ Failed to emit privacy change event for friendship ${friendshipId}:`,
              eventError
            );
          }
        }
        console.log(`🔐 Privacy change events emitted for ${updated} friends`);
      } catch (eventError) {
        // Don't fail the batch operation if event emission fails
        console.error(
          "❌ Failed to emit privacy change events for batch update:",
          eventError
        );
      }

      // Log success instead of showing notification
      const action = isVisible ? "visible" : "hidden";
      console.log(`Schedule ${action} for ${updated} friends ✅`);

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
      console.error(`Failed to update global privacy: ${error.message}`);

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
   * Simple cache clearing
   */
  clearCache() {
    const friendshipCacheSize = this.cache.size;
    const quickAccessCacheSize = this.quickAccessCache.size;

    this.cache.clear();
    this.quickAccessCache.clear();

    console.log(
      `🧹 Privacy cache cleared: ${friendshipCacheSize} friendship + ${quickAccessCacheSize} quick access entries`
    );
  }

  /**
   * Simple cache statistics
   */
  getCacheStats() {
    return {
      friendshipCache: {
        size: this.cache.size,
        maxSize: this.maxCacheSize,
        entries: Array.from(this.cache.keys()),
      },
      quickAccessCache: {
        size: this.quickAccessCache.size,
        maxSize: this.maxQuickAccessCacheSize,
        entries: Array.from(this.quickAccessCache.keys()),
      },
      pendingOperations: Array.from(this.pendingOperations),
      cacheExpiry: this.cacheExpiry,
    };
  }

  /**
   * Check if quick access should be restricted for a user's avatar in friend's quick access bar
   * Phase 1.1 Enhancement: Privacy-Aware Quick Access
   *
   * Logic: If User1's schedule is hidden from User2, then User1's avatar should be disabled
   * in User2's quick access bar (returns true = restricted)
   *
   * @param {string} userUid - User whose avatar is being displayed in quick access
   * @param {string} friendUid - Friend viewing the quick access bar
   * @returns {boolean} True if quick access should be restricted (avatar disabled), false if allowed
   */
  async isQuickAccessRestricted(userUid, friendUid) {
    // Add input validation
    if (!userUid || !friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.isQuickAccessRestricted: Invalid user IDs:",
        { userUid, friendUid }
      );
      return true; // Default to restricted on error for security
    }

    if (userUid === friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.isQuickAccessRestricted: Cannot check quick access with same user:",
        userUid
      );
      return true; // Default to restricted for same user
    }

    try {
      console.log(
        `🔐 Checking quick access restriction: ${userUid} avatar for ${friendUid}`
      );

      // Check schedule visibility using existing caching and error handling
      const isScheduleVisible = await this.isScheduleVisible(
        userUid,
        friendUid
      );

      // If schedule is hidden, quick access should be restricted
      const isRestricted = !isScheduleVisible;

      console.log(
        `✅ Quick access restriction result: ${userUid} → ${friendUid} = ${
          isRestricted ? "RESTRICTED" : "ALLOWED"
        }`
      );

      return isRestricted;
    } catch (error) {
      console.error("❌ Error checking quick access restriction:", error);
      // Default to restricted on error for security
      return true;
    }
  }

  /**
   * Get detailed quick access status for UI components
   * Phase 1.1 Enhancement: Privacy-Aware Quick Access
   *
   * @param {string} userUid - User whose avatar is being displayed
   * @param {string} friendUid - Friend viewing the quick access bar
   * @returns {Object|null} Detailed status for UI display or null if friendship not found
   */
  async getQuickAccessStatus(userUid, friendUid) {
    // Add input validation
    if (!userUid || !friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.getQuickAccessStatus: Invalid user IDs:",
        { userUid, friendUid }
      );
      return null;
    }

    if (userUid === friendUid) {
      console.error(
        "❌ FriendshipPrivacyService.getQuickAccessStatus: Cannot get quick access status with same user:",
        userUid
      );
      return null;
    }

    try {
      const quickAccessCacheKey = `${userUid}_${friendUid}_quickaccess`;

      // Check quick access cache first
      const cached = this.quickAccessCache.get(quickAccessCacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log(
          `📋 Quick access status from cache: ${userUid} → ${friendUid}`
        );
        return cached.data;
      }

      console.log(`🔐 Getting quick access status: ${userUid} → ${friendUid}`);

      const friendshipDoc = await this.getFriendshipDocument(
        userUid,
        friendUid
      );

      if (!friendshipDoc) {
        console.log(
          `⚠️ No friendship found for quick access status: ${userUid} ↔ ${friendUid}`
        );
        return null;
      }

      // Get schedule visibility status
      const isScheduleVisible = isScheduleVisibleToFriend(
        friendshipDoc,
        userUid
      );
      const isQuickAccessRestricted = !isScheduleVisible;

      // Get user info for display
      const userInfo =
        friendshipDoc.user1Id === userUid
          ? friendshipDoc.user1Info
          : friendshipDoc.user2Info;

      const quickAccessStatus = {
        // Core status flags
        scheduleVisible: isScheduleVisible,
        quickAccessRestricted: isQuickAccessRestricted,

        // User information
        userInfo: {
          displayName: userInfo.displayName,
          major: userInfo.major,
          avatarConfig: userInfo.avatarConfig,
        },

        // UI-friendly descriptions
        quickAccess: {
          status: isQuickAccessRestricted ? "restricted" : "allowed",
          avatarEnabled: !isQuickAccessRestricted,
          description: isQuickAccessRestricted
            ? `${userInfo.displayName} has hidden their schedule from you`
            : `${userInfo.displayName}'s schedule is visible - quick access enabled`,
          tooltip: isQuickAccessRestricted
            ? "Avatar disabled - schedule is private"
            : "Click to view schedule",
        },

        // Schedule visibility status (for compatibility with existing UI)
        schedule: {
          visible: isScheduleVisible,
          status: isScheduleVisible ? "visible" : "hidden",
          description: isScheduleVisible
            ? `${userInfo.displayName}'s schedule is visible to you`
            : `${userInfo.displayName} has hidden their schedule from you`,
        },

        // Metadata
        lastUpdated:
          friendshipDoc.privacyMetadata?.lastPrivacyUpdate ||
          friendshipDoc.createdAt,
        privacyVersion: friendshipDoc.privacyMetadata?.privacyVersion || 1,
      };

      // Cache the quick access status with simple size limit
      if (this.quickAccessCache.size >= this.maxQuickAccessCacheSize) {
        const oldestKey = this.quickAccessCache.keys().next().value;
        this.quickAccessCache.delete(oldestKey);
      }
      this.quickAccessCache.set(quickAccessCacheKey, {
        data: quickAccessStatus,
        timestamp: Date.now(),
      });

      console.log(`✅ Quick access status retrieved:`, quickAccessStatus);
      return quickAccessStatus;
    } catch (error) {
      console.error("❌ Error getting quick access status:", error);
      return null;
    }
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

    // The updateScheduleVisibility method already emits the privacy change event
    // so we don't need to emit it again here

    return success ? newVisibility : currentlyVisible;
  }

  /**
   * Simple batch privacy status checks for multiple friends
   */
  async batchGetPrivacyStatus(currentUserUid, friendUids) {
    if (!Array.isArray(friendUids) || friendUids.length === 0) {
      return {};
    }

    const results = {};
    const cacheMisses = [];

    // Check cache first
    for (const friendUid of friendUids) {
      const cacheKey = `${currentUserUid}_${friendUid}_quickaccess`;
      const cached = this.quickAccessCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        results[friendUid] = cached.data;
      } else {
        cacheMisses.push(friendUid);
      }
    }

    // Fetch missing entries
    const fetchPromises = cacheMisses.map((friendUid) =>
      this.getQuickAccessStatus(currentUserUid, friendUid)
        .then((status) => ({ friendUid, status }))
        .catch((error) => {
          console.error(
            `Failed to get privacy status for ${friendUid}:`,
            error
          );
          return { friendUid, status: null };
        })
    );

    const fetchedResults = await Promise.all(fetchPromises);

    // Merge results
    fetchedResults.forEach(({ friendUid, status }) => {
      if (status) {
        results[friendUid] = status;
      }
    });

    console.log(
      `📊 Batch privacy check: ${friendUids.length} users, ${cacheMisses.length} cache misses`
    );
    return results;
  }

  /**
   * Clear caches for a specific friendship (used when unfriending)
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   */
  clearFriendshipCache(userId1, userId2) {
    if (!userId1 || !userId2) {
      console.error("❌ Cannot clear friendship cache: Invalid user IDs");
      return;
    }

    const friendshipId = getFriendshipId(userId1, userId2);

    // Clear friendship document cache
    this.cache.delete(friendshipId);

    // Clear quick access cache for both directions
    this.quickAccessCache.delete(`${userId1}_${userId2}_quickaccess`);
    this.quickAccessCache.delete(`${userId2}_${userId1}_quickaccess`);

    console.log(`🧹 Cleared friendship cache for: ${userId1} ↔ ${userId2}`);
  }

  /**
   * Simple cleanup method
   */
  cleanup() {
    // Clear pending operation timeouts
    if (this.pendingOperationTimers.size > 0) {
      this.pendingOperationTimers.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      this.pendingOperationTimers.clear();
    }

    // Clear caches
    const friendshipCacheSize = this.cache.size;
    const quickAccessCacheSize = this.quickAccessCache.size;
    const pendingOpsCount = this.pendingOperations.size;

    this.clearCache();
    this.pendingOperations.clear();

    console.log(`🧹 FriendshipPrivacyService cleanup completed`);
    console.log(
      `   Cleaned up: ${friendshipCacheSize} friendship + ${quickAccessCacheSize} quick access cache entries + ${pendingOpsCount} pending operations`
    );
  }
}

// Create and export singleton instance
export const friendshipPrivacyService = new FriendshipPrivacyService();

// Export class for testing
export { FriendshipPrivacyService };
