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
import { safeImageUrl } from "../security/sanitize.js";

/**
 * Internal: extract avatar-related fields from different shapes
 * (user document, profile object, cached friendInfo/fromUserInfo/etc.)
 */
function extractAvatarFields(userData = {}) {
  const profile = userData.profile || {};
  const fromUserInfo = userData.fromUserInfo || {};
  const toUserInfo = userData.toUserInfo || {};
  const user1Info = userData.user1Info || {};
  const user2Info = userData.user2Info || {};

  const sources = [
    userData,
    profile,
    fromUserInfo,
    toUserInfo,
    user1Info,
    user2Info,
  ];

  let avatarConfig = null;
  let profilePhotoUrl = null;
  let profilePhotoThumbUrl = null;
  let useAvatar;

  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    if (!avatarConfig && src.avatarConfig) {
      avatarConfig = src.avatarConfig;
    }
    // 🛡️ Photo URLs are user-writable: only accept ones that are safe for
    // an <img src>. Every avatar in the app is rendered through this function.
    if (!profilePhotoUrl && src.profilePhotoUrl) {
      profilePhotoUrl = safeImageUrl(src.profilePhotoUrl);
    }
    if (!profilePhotoThumbUrl && src.profilePhotoThumbUrl) {
      profilePhotoThumbUrl = safeImageUrl(src.profilePhotoThumbUrl);
    }
    if (
      typeof useAvatar === "undefined" &&
      typeof src.useAvatar === "boolean"
    ) {
      useAvatar = src.useAvatar;
    }
  }

  return { avatarConfig, profilePhotoUrl, profilePhotoThumbUrl, useAvatar };
}

/**
 * 🎨 Render user avatar with consistent fallback behavior
 * @param {Object} userData - User data object from any source
 * @param {boolean|Object} useCacheOrOptions - Back-compat boolean or options:
 *   { useCache?: boolean, loading?: "lazy"|"eager", decoding?: "async"|"sync"|"auto",
 *     fetchpriority?: "high"|"low"|"auto", referrerpolicy?: string }
 * @returns {string} HTML for avatar
 */
export function renderUserAvatar(userData, useCacheOrOptions = true) {
  try {
    const options =
      useCacheOrOptions && typeof useCacheOrOptions === "object"
        ? useCacheOrOptions
        : { useCache: useCacheOrOptions };

    const useCache =
      typeof options.useCache === "boolean" ? options.useCache : true;
    const preferThumb = options.preferThumb === true;
    const loading = options.loading || "lazy";
    const decoding = options.decoding || "async";
    const fetchpriority = options.fetchpriority || null;
    const referrerpolicy = options.referrerpolicy || null;

    const { profilePhotoThumbUrl, useAvatar } = extractAvatarFields(
      userData || {}
    );
    const avatarUrl =
      preferThumb && profilePhotoThumbUrl && useAvatar !== true
        ? profilePhotoThumbUrl
        : getAvatarUrl(userData, useCache);
    if (avatarUrl) {
      const attrs = [
        `src="${avatarUrl}"`,
        `alt="User Avatar"`,
        `class="user-avatar-img"`,
        `loading="${loading}"`,
        `decoding="${decoding}"`,
      ];
      if (fetchpriority) attrs.push(`fetchpriority="${fetchpriority}"`);
      if (referrerpolicy) attrs.push(`referrerpolicy="${referrerpolicy}"`);
      return `<img ${attrs.join(" ")}>`;
    }
  } catch (error) {
    console.error("❌ Error rendering avatar, falling back to default.", error);
  }
  return getAvatarFallback();
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
  const { avatarConfig, profilePhotoUrl, useAvatar } = extractAvatarFields(
    userData || {}
  );

  // Prefer photo when available, unless user explicitly chose avatar
  if (profilePhotoUrl && useAvatar !== true) {
    return profilePhotoUrl;
  }

  if (!avatarConfig) {
    return null;
  }

  try {
    if (!avatarManager || typeof avatarManager.generateAvatarUrl !== "function") {
      return null;
    }

    if (
      typeof avatarManager.isValidAvatarConfig === "function" &&
      !avatarManager.isValidAvatarConfig(avatarConfig)
    ) {
      return null;
    }

    // When useCache is true, do NOT bust cache (avoid adding timestamp),
    // so avatars remain stable across re-renders.
    // 🛡️ avatarConfig is user-writable too; validate the generated URL
    return safeImageUrl(
      avatarManager.generateAvatarUrl(avatarConfig, !useCache)
    );
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
  const { avatarConfig } = extractAvatarFields(userData || {});

  return !!(avatarConfig && avatarConfig.style && avatarConfig.seed);
}
