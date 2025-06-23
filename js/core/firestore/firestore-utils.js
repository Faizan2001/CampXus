/**
 * =============================================================================
 *                        FIRESTORE UTILITIES FOR ORGANIZED DATA
 * =============================================================================
 *
 * Helper functions to work with the new organized Firestore structure.
 * Makes data access and manipulation easier and more consistent.
 *
 * =============================================================================
 */

import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config/firebase-config.js";

/**
 * 🔍 DATA FETCHING UTILITIES
 * =============================================================================
 */

/**
 * Get a user's complete profile data
 * @param {string} userId - User ID to fetch
 * @returns {Promise<Object|null>} User data or null if not found
 */
export async function getUserProfile(userId) {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    return userDoc.exists() ? userDoc.data() : null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

/**
 * Get formatted user data for display
 * @param {Object} userData - Raw user data from Firestore
 * @returns {Object} Formatted user data
 */
export function formatUserData(userData) {
  if (!userData) return null;

  return {
    // Basic identity
    uid: userData.uid,
    email: userData.profile?.email || "",
    displayName: userData.profile?.displayName || "",

    // Personal info
    fullName: `${userData.profile?.firstName || ""} ${
      userData.profile?.lastName || ""
    }`.trim(),
    firstName: userData.profile?.firstName || "",
    lastName: userData.profile?.lastName || "",
    bio: userData.profile?.bio || "",
    major: userData.profile?.major || "",
    startingYear: userData.profile?.startingYear || "",

    // University info
    university: userData.universityInfo?.university || "",
    universityName: userData.universityInfo?.universityName || "",
    studentId: userData.universityInfo?.studentId || "",

    // Avatar data
    avatarConfig: userData.avatarConfig || null,

    // System status
    isOnline: userData.systemInfo?.status === "online",
    isProfileComplete: userData.systemInfo?.profileSetupComplete || false,
    lastActive: userData.systemInfo?.lastActive,
    createdAt: userData.systemInfo?.createdAt,
  };
}

/**
 * 📝 DATA UPDATE UTILITIES
 * =============================================================================
 */

/**
 * Update user's profile information
 * @param {string} userId - User ID
 * @param {Object} profileData - Profile data to update
 */
export async function updateUserProfile(userId, profileData) {
  const updates = {
    "systemInfo.lastUpdated": serverTimestamp(),
  };

  // Add profile updates with proper paths
  if (profileData.firstName !== undefined)
    updates["profile.firstName"] = profileData.firstName;
  if (profileData.lastName !== undefined)
    updates["profile.lastName"] = profileData.lastName;
  if (profileData.bio !== undefined) updates["profile.bio"] = profileData.bio;
  if (profileData.major !== undefined)
    updates["profile.major"] = profileData.major;
  if (profileData.startingYear !== undefined)
    updates["profile.startingYear"] = profileData.startingYear;
  if (profileData.email !== undefined)
    updates["profile.email"] = profileData.email;
  if (profileData.displayName !== undefined)
    updates["profile.displayName"] = profileData.displayName;

  await updateDoc(doc(db, "users", userId), updates);
}

/**
 * Update user's avatar configuration
 * @param {string} userId - User ID
 * @param {Object} avatarConfig - New avatar configuration
 */
export async function updateUserAvatar(userId, avatarConfig) {
  await updateDoc(doc(db, "users", userId), {
    avatarConfig: avatarConfig,
    "systemInfo.lastUpdated": serverTimestamp(),
  });
}

/**
 * Update user's online status
 * @param {string} userId - User ID
 * @param {string} status - "online" or "offline"
 */
export async function updateUserStatus(userId, status) {
  await updateDoc(doc(db, "users", userId), {
    "systemInfo.status": status,
    "systemInfo.lastActive": serverTimestamp(),
    "systemInfo.lastUpdated": serverTimestamp(),
  });
}

/**
 * Mark user as online
 * @param {string} userId - User ID
 */
export async function setUserOnline(userId) {
  return updateUserStatus(userId, "online");
}

/**
 * Mark user as offline
 * @param {string} userId - User ID
 */
export async function setUserOffline(userId) {
  return updateUserStatus(userId, "offline");
}

/**
 * Update user's bio
 * @param {string} userId - User ID
 * @param {string} bio - New bio text
 */
export async function updateUserBio(userId, bio) {
  await updateDoc(doc(db, "users", userId), {
    "profile.bio": bio,
    "systemInfo.lastUpdated": serverTimestamp(),
  });
}

/**
 * 🎯 SPECIALIZED GETTERS
 * =============================================================================
 */

/**
 * Get user's display name and avatar for UI components
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Display data
 */
export async function getUserDisplayData(userId) {
  const userData = await getUserProfile(userId);
  if (!userData) return null;

  return {
    name:
      `${userData.profile?.firstName || ""} ${
        userData.profile?.lastName || ""
      }`.trim() ||
      userData.profile?.displayName ||
      "",
    avatar: userData.avatarConfig,
    isOnline: userData.systemInfo?.status === "online",
    lastActive: userData.systemInfo?.lastActive,
  };
}

/**
 * Get user's university information
 * @param {string} userId - User ID
 * @returns {Promise<Object>} University data
 */
export async function getUserUniversityInfo(userId) {
  const userData = await getUserProfile(userId);
  if (!userData) return null;

  return {
    university: userData.universityInfo?.university,
    universityName: userData.universityInfo?.universityName,
    studentId: userData.universityInfo?.studentId,
    major: userData.profile?.major,
    startingYear: userData.profile?.startingYear,
  };
}

/**
 * 🔍 VALIDATION UTILITIES
 * =============================================================================
 */

/**
 * Check if user has completed profile setup
 * @param {Object} userData - User data
 * @returns {boolean} True if profile is complete
 */
export function isProfileComplete(userData) {
  if (!userData) return false;

  return !!(
    userData.systemInfo?.profileSetupComplete &&
    userData.profile?.firstName &&
    userData.profile?.lastName &&
    userData.profile?.major &&
    userData.profile?.startingYear &&
    userData.universityInfo?.studentId &&
    userData.profile?.email
  );
}

/**
 * Check if user is online
 * @param {Object} userData - User data
 * @returns {boolean} True if user is online
 */
export function isUserOnline(userData) {
  return userData?.systemInfo?.status === "online";
}

/**
 * 📊 QUERY HELPERS
 * =============================================================================
 */

/**
 * Get field path for Firestore queries
 * @param {string} section - Data section (profile, universityInfo, systemInfo)
 * @param {string} field - Field name
 * @returns {string} Firestore field path
 */
export function getFieldPath(section, field) {
  return `${section}.${field}`;
}

// Common field paths for queries
export const FIELD_PATHS = {
  // Profile fields
  FIRST_NAME: "profile.firstName",
  LAST_NAME: "profile.lastName",
  BIO: "profile.bio",
  MAJOR: "profile.major",
  STARTING_YEAR: "profile.startingYear",
  EMAIL: "profile.email",
  DISPLAY_NAME: "profile.displayName",

  // University fields
  UNIVERSITY: "universityInfo.university",
  UNIVERSITY_NAME: "universityInfo.universityName",
  STUDENT_ID: "universityInfo.studentId",

  // System fields
  PROFILE_COMPLETE: "systemInfo.profileSetupComplete",
  STATUS: "systemInfo.status",
  LAST_ACTIVE: "systemInfo.lastActive",
  CREATED_AT: "systemInfo.createdAt",
};

/**
 * 🎨 AVATAR UTILITIES
 * =============================================================================
 */

/**
 * Generate avatar URL from user data
 * @param {Object} userData - User data containing avatarConfig
 * @returns {string|null} Avatar URL or null
 */
export function getAvatarUrl(userData) {
  if (!userData?.avatarConfig || !window.avatarManager) {
    return null;
  }

  return window.avatarManager.generateAvatarUrl(userData.avatarConfig);
}

/**
 * Get avatar configuration for editing
 * @param {Object} userData - User data
 * @returns {Object|null} Avatar config or null
 */
export function getAvatarConfig(userData) {
  return userData?.avatarConfig || null;
}

export default {
  // Data fetching
  getUserProfile,
  formatUserData,
  getUserDisplayData,
  getUserUniversityInfo,

  // Data updates
  updateUserProfile,
  updateUserAvatar,
  updateUserStatus,
  setUserOnline,
  setUserOffline,
  updateUserBio,

  // Validation
  isProfileComplete,
  isUserOnline,

  // Utilities
  getFieldPath,
  FIELD_PATHS,
  getAvatarUrl,
  getAvatarConfig,
};
