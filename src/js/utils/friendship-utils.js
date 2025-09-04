/**
 * Friendship Utilities for Bilateral Privacy System
 *
 * This module provides utilities for managing friendship-centric bilateral privacy
 * controls, replacing the flawed user-centric privacy storage approach.
 */

/**
 * Generate canonical friendship ID from two user IDs
 * Ensures consistent friendship document IDs regardless of parameter order
 *
 * @param {string} uid1 - First user ID
 * @param {string} uid2 - Second user ID
 * @returns {string} Canonical friendship ID
 *
 * @example
 * getFriendshipId("alice123", "bob456") // → "alice123_bob456"
 * getFriendshipId("bob456", "alice123") // → "alice123_bob456" (same result)
 */
export function getFriendshipId(uid1, uid2) {
  if (!uid1 || !uid2) {
    console.error("❌ getFriendshipId: Invalid user IDs provided:", {
      uid1,
      uid2,
    });
    throw new Error("Both user IDs are required for friendship ID generation");
  }

  if (uid1 === uid2) {
    console.error(
      "❌ getFriendshipId: Cannot create friendship ID with same user:",
      uid1
    );
    throw new Error("Cannot create friendship ID with same user");
  }

  return [uid1, uid2].sort().join("_");
}

/**
 * Enhanced friendship document structure with bilateral privacy controls
 *
 * @param {string} user1Id - First user ID
 * @param {string} user2Id - Second user ID
 * @param {Object} user1Data - Cached user1 information
 * @param {Object} user2Data - Cached user2 information
 * @returns {Object} Enhanced friendship document
 */
export function createEnhancedFriendshipDocument(
  user1Id,
  user2Id,
  user1Data,
  user2Data
) {
  const now = Date.now();

  return {
    // Existing friendship structure (from Database-Guide.md)
    users: [user1Id, user2Id],
    user1Id: user1Id,
    user2Id: user2Id,
    createdAt: now,
    lastInteraction: now,
    mutualFriends: 0,

    // Cached user info (from existing structure)
    // NOTE: displayName deprecated in favor of global unique handle
    user1Info: {
      handle: user1Data.profile.handle,
      major: user1Data.profile.major,
      avatarConfig: user1Data.avatarConfig,
    },
    user2Info: {
      handle: user2Data.profile.handle,
      major: user2Data.profile.major,
      avatarConfig: user2Data.avatarConfig,
    },

    // 🔐 NEW: Bilateral Privacy Controls
    scheduleVisibility: {
      [user1Id]: true, // User1's schedule IS visible to User2 (default: visible)
      [user2Id]: true, // User2's schedule IS visible to User1 (default: visible)
    },

    // Privacy metadata for auditing and debugging
    privacyMetadata: {
      lastPrivacyUpdate: now,
      privacyUpdatedBy: null, // Last user who modified privacy settings
      privacyVersion: 1, // For future privacy feature migrations
    },
  };
}

/**
 * Check if a user's schedule is visible to their friend
 *
 * @param {Object} friendshipDoc - Friendship document from Firestore
 * @param {string} scheduleOwnerUid - User whose schedule visibility we're checking
 * @returns {boolean} True if schedule is visible, false if hidden
 */
export function isScheduleVisibleToFriend(
  friendshipDoc,
  scheduleOwnerUid,
  viewerUid
) {
  if (!friendshipDoc) {
    return false;
  }

  // Default to visible if no privacy map found (backward compatibility)
  const vis = friendshipDoc.scheduleVisibility || {};

  // AND-gate: both sides must have their own visibility set to true
  const ownerAllows = vis[scheduleOwnerUid] !== false; // default true
  const viewerAllows = vis[viewerUid] !== false; // default true
  return ownerAllows && viewerAllows;
}

/**
 * Check if a given user has their own schedule sharing enabled in this friendship
 * (unilateral flag for UI copy such as "Your schedule is visible/hidden")
 */
export function isUserScheduleSharingEnabled(friendshipDoc, userUid) {
  if (!friendshipDoc) return true;
  const vis = friendshipDoc.scheduleVisibility || {};
  return vis[userUid] !== false; // default true
}

/**
 * Update schedule visibility for a user in a friendship
 * Returns updated friendship document data for Firestore update
 *
 * @param {Object} friendshipDoc - Current friendship document
 * @param {string} userUid - User updating their own visibility
 * @param {boolean} isVisible - Whether user's schedule should be visible
 * @returns {Object} Update data for Firestore
 */
export function updateScheduleVisibility(friendshipDoc, userUid, isVisible) {
  if (!friendshipDoc || !friendshipDoc.scheduleVisibility) {
    throw new Error(
      "Friendship document with current schedule visibility is required."
    );
  }

  const now = Date.now();
  const friendUid = friendshipDoc.users.find((id) => id !== userUid);

  if (!friendUid) {
    throw new Error("Could not determine friend's UID from friendship document.");
  }

  // Construct the complete, updated objects for the security rule.
  const newScheduleVisibility = {
    ...friendshipDoc.scheduleVisibility,
    [userUid]: isVisible,
  };

  const newPrivacyMetadata = {
    ...friendshipDoc.privacyMetadata,
    lastPrivacyUpdate: now,
    privacyUpdatedBy: userUid,
    privacyVersion: (friendshipDoc.privacyMetadata?.privacyVersion || 0) + 1,
  };

  return {
    scheduleVisibility: newScheduleVisibility,
    privacyMetadata: newPrivacyMetadata,
  };
}

/**
 * Get user-friendly privacy status for UI display
 *
 * @param {Object} friendshipDoc - Friendship document
 * @param {string} currentUserUid - Current user's ID
 * @param {string} friendUid - Friend's user ID
 * @returns {Object} Privacy status for both users
 */
export function getPrivacyStatus(friendshipDoc, currentUserUid, friendUid) {
  // For UI labels, show unilateral states (your setting and their setting)
  const currentUserVisible = isUserScheduleSharingEnabled(
    friendshipDoc,
    currentUserUid
  );
  const friendVisible = isUserScheduleSharingEnabled(friendshipDoc, friendUid);

  return {
    // Current user's privacy status
    mySchedule: {
      visible: currentUserVisible,
      status: currentUserVisible ? "visible" : "hidden",
      description: currentUserVisible
        ? "Your schedule is visible to this friend"
        : "You hid your schedule from this friend",
    },

    // Friend's privacy status
    friendSchedule: {
      visible: friendVisible,
      status: friendVisible ? "visible" : "hidden",
      description: friendVisible
        ? "Friend's schedule is visible to you"
        : "Friend hid their schedule from you",
    },
  };
}

/**
 * Validate friendship document structure
 *
 * @param {Object} friendshipDoc - Friendship document to validate
 * @returns {Object} Validation result with success and errors
 */
export function validateFriendshipDocument(friendshipDoc) {
  const errors = [];

  // Check required fields
  if (
    !friendshipDoc.users ||
    !Array.isArray(friendshipDoc.users) ||
    friendshipDoc.users.length !== 2
  ) {
    errors.push(
      "Friendship document must have users array with exactly 2 user IDs"
    );
  }

  if (!friendshipDoc.user1Id || !friendshipDoc.user2Id) {
    errors.push("Friendship document must have user1Id and user2Id fields");
  }

  // Check privacy structure
  if (friendshipDoc.scheduleVisibility) {
    const visibilityKeys = Object.keys(friendshipDoc.scheduleVisibility);
    if (visibilityKeys.length !== 2) {
      errors.push("scheduleVisibility must have exactly 2 user IDs as keys");
    }

    for (const key of visibilityKeys) {
      if (!friendshipDoc.users.includes(key)) {
        errors.push(
          `scheduleVisibility key ${key} must be one of the users in the friendship`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Migration helper: Convert old user-centric privacy to friendship-centric
 * This is for future migration from the flawed user-centric storage
 *
 * @param {Object} user1PrivacySettings - User1's old privacy settings
 * @param {Object} user2PrivacySettings - User2's old privacy settings
 * @param {string} user1Id - User1's ID
 * @param {string} user2Id - User2's ID
 * @returns {Object} Bilateral privacy settings for friendship document
 */
export function migrateToBilateralPrivacy(
  user1PrivacySettings,
  user2PrivacySettings,
  user1Id,
  user2Id
) {
  // Default to visible if no settings found
  let user1Visible = true;
  let user2Visible = true;

  // Check if user1 had hidden their schedule from user2
  if (user1PrivacySettings?.individualSettings?.[user2Id] === true) {
    user1Visible = false; // User1 had hidden their schedule from user2
  }

  // Check if user2 had hidden their schedule from user1
  if (user2PrivacySettings?.individualSettings?.[user1Id] === true) {
    user2Visible = false; // User2 had hidden their schedule from user1
  }

  return {
    [user1Id]: user1Visible,
    [user2Id]: user2Visible,
  };
}

// Export constants for consistency
export const PRIVACY_DEFAULTS = {
  DEFAULT_VISIBILITY: true, // New friendships default to visible schedules
  PRIVACY_VERSION: 1, // Current privacy schema version
};

export const PRIVACY_STATUSES = {
  VISIBLE: "visible",
  HIDDEN: "hidden",
};
