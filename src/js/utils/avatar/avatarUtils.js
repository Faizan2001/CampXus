/**
 * 🎨 Avatar Rendering Utilities
 * 
 * Centralized avatar rendering to eliminate code duplication.
 * This ensures consistency across the entire app and makes changes easier.
 * 
 * Benefits:
 * ✅ Single source of truth for avatar rendering
 * ✅ Consistent fallback behavior everywhere  
 * ✅ Easier to maintain and update
 * ✅ Reduces bundle size by eliminating duplicated code
 */

import { avatarManager } from "./avatarManager.js";

/**
 * 🎨 Render user avatar with consistent fallback behavior
 * @param {Object} userData - User data object from any source  
 * @param {boolean} useCache - Whether to use cache-busting for fresh avatars
 * @returns {string} HTML for avatar
 */
export function renderUserAvatar(userData, useCache = true) {
  // Extract avatar config from different data structures
  const avatarConfig = userData?.avatarConfig ||
                      userData?.profile?.avatarConfig || // Added support for nested profile avatar
                      userData?.fromUserInfo?.avatarConfig || 
                      userData?.user1Info?.avatarConfig || 
                      userData?.user2Info?.avatarConfig ||
                      userData?.toUserInfo?.avatarConfig;

  const hasAvatarConfig = !!avatarConfig;

  // Use avatarManager if available and we have config
  if (hasAvatarConfig && avatarManager && typeof avatarManager.generateAvatarUrl === 'function') {
    try {
      // Use cache-busting parameter to ensure fresh avatars when needed
      const avatarUrl = avatarManager.generateAvatarUrl(avatarConfig, useCache);
      
      return `<img src="${avatarUrl}" alt="User Avatar" class="user-avatar-img" loading="lazy">`;
    } catch (error) {
      console.error("❌ Error generating avatar URL, falling back to default.", error);
      return getAvatarFallback();
    }
  } else {
    // Fallback for no config or no avatar manager
    return getAvatarFallback();
  }
}

/**
 * 🎨 Get avatar fallback HTML (consistent across the app)
 * @returns {string} Fallback avatar HTML
 */
export function getAvatarFallback() {
  return `
    <div class="user-avatar">
      <i class="fas fa-user-circle"></i>
    </div>
  `;
}

/**
 * 📱 Get avatar URL only (for cases where you just need the URL)
 * @param {Object} userData - User data object
 * @param {boolean} useCache - Whether to use cache-busting
 * @returns {string|null} Avatar URL or null if no avatar available
 */
export function getAvatarUrl(userData, useCache = true) {
  const avatarConfig = userData?.avatarConfig ||
                      userData?.profile?.avatarConfig ||
                      userData?.fromUserInfo?.avatarConfig || 
                      userData?.user1Info?.avatarConfig || 
                      userData?.user2Info?.avatarConfig ||
                      userData?.toUserInfo?.avatarConfig;

  if (!avatarConfig || !avatarManager || typeof avatarManager.generateAvatarUrl !== 'function') {
    return null;
  }

  try {
    return avatarManager.generateAvatarUrl(avatarConfig, useCache);
  } catch (error) {
    console.error("❌ Error generating avatar URL:", error);
    return null;
  }
}

/**
 * ✅ Check if user has a valid avatar configuration
 * @param {Object} userData - User data object
 * @returns {boolean} True if user has valid avatar config
 */
export function hasValidAvatar(userData) {
  const avatarConfig = userData?.avatarConfig ||
                      userData?.profile?.avatarConfig ||
                      userData?.fromUserInfo?.avatarConfig || 
                      userData?.user1Info?.avatarConfig || 
                      userData?.user2Info?.avatarConfig ||
                      userData?.toUserInfo?.avatarConfig;
  
  return !!(avatarConfig && avatarConfig.style && avatarConfig.seed);
}