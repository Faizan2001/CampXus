/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PWA DATA CACHE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Purpose: Persist critical user data for instant PWA startup
 *
 * This cache stores data in localStorage (persists across sessions/restarts)
 * for instant display when the PWA opens, even offline.
 *
 * Cached Data:
 * - User's avatar URL
 * - Quick Access friends list (IDs + basic info)
 * - User's schedule data
 *
 * Strategy: Stale-While-Revalidate
 * 1. Show cached data immediately
 * 2. Fetch fresh data in background
 * 3. Update UI when fresh data arrives
 */

import { logManager } from "../../utils/debug/LogManager.js";

const CACHE_PREFIX = "meetchuthere:pwa:";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days hard expiry

/**
 * Get current timestamp
 */
function now() {
  return Date.now();
}

/**
 * Safely parse JSON
 */
function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

/**
 * PWA Data Cache
 */
export const pwaCache = {
  /**
   * Cache keys for different data types
   */
  keys: {
    userAvatar: (uid) => `${CACHE_PREFIX}avatar:${uid}`,
    quickAccessFriends: (uid) => `${CACHE_PREFIX}quickAccess:${uid}`,
    userSchedule: (uid) => `${CACHE_PREFIX}schedule:${uid}`,
    friendsProfiles: (uid) => `${CACHE_PREFIX}friendProfiles:${uid}`,
  },

  /**
   * Store data in cache with TTL
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, data, ttlMs = DEFAULT_TTL_MS) {
    if (!key || data === undefined) return false;

    try {
      const record = {
        data,
        savedAt: now(),
        expiresAt: now() + ttlMs,
        version: 1,
      };
      localStorage.setItem(key, JSON.stringify(record));
      return true;
    } catch (e) {
      // Storage might be full or disabled
      logManager.system.warn("[PWA Cache] Failed to save", {
        key,
        message: e?.message,
      });
      return false;
    }
  },

  /**
   * Get data from cache
   * @param {string} key - Cache key
   * @returns {object|null} - { data, age, isStale, isExpired } or null
   */
  get(key) {
    if (!key) return null;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const record = safeParse(raw);
      if (!record || !record.savedAt) return null;

      const age = now() - record.savedAt;
      const isStale = now() > record.expiresAt;
      const isExpired = age > MAX_AGE_MS;

      // Remove if hard expired
      if (isExpired) {
        localStorage.removeItem(key);
        return null;
      }

      return {
        data: record.data,
        age,
        isStale,
        isExpired: false,
        savedAt: record.savedAt,
      };
    } catch (err) {
      logManager.dev.debug("JSON parse failed for cache data", err);
      return null;
    }
  },

  /**
   * Get just the data (convenience method)
   * @param {string} key - Cache key
   * @returns {any|null} - Cached data or null
   */
  getData(key) {
    const result = this.get(key);
    return result ? result.data : null;
  },

  /**
   * Remove a cache entry
   * @param {string} key - Cache key
   */
  remove(key) {
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch (error) { console.debug("Suppressed error", error); }
  },

  /**
   * Clear all PWA cache entries for a user
   * @param {string} uid - User ID
   */
  clearUser(uid) {
    if (!uid) return;

    const keysToRemove = [
      this.keys.userAvatar(uid),
      this.keys.quickAccessFriends(uid),
      this.keys.userSchedule(uid),
      this.keys.friendsProfiles(uid),
    ];

    keysToRemove.forEach((key) => this.remove(key));
  },

  /**
   * Clear all PWA cache entries
   */
  clearAll() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (error) { console.debug("Suppressed error", error); }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // HIGH-LEVEL HELPERS FOR SPECIFIC DATA TYPES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Cache user's avatar URL
   */
  saveUserAvatar(uid, avatarUrl) {
    return this.set(
      this.keys.userAvatar(uid),
      avatarUrl,
      7 * 24 * 60 * 60 * 1000
    );
  },

  /**
   * Get cached avatar URL
   */
  getUserAvatar(uid) {
    return this.getData(this.keys.userAvatar(uid));
  },

  /**
   * Cache Quick Access friends list
   * @param {string} uid - User ID
   * @param {Array} friends - Array of friend objects with basic info
   */
  saveQuickAccessFriends(uid, friends) {
    // Only cache essential fields to minimize storage
    const minimalFriends = (friends || [])
      .map((f) => ({
        displayName: f.displayName || f.profile?.displayName || "",
        handle: f.handle || f.profile?.handle || "",
        // Cache enough fields for the Home friends bar to render a real photo/avatar instantly.
        profilePhotoUrl:
          f.profilePhotoUrl || f.profile?.profilePhotoUrl || null,
        profilePhotoThumbUrl:
          f.profilePhotoThumbUrl || f.profile?.profilePhotoThumbUrl || null,
        avatarConfig: f.avatarConfig || f.profile?.avatarConfig || null,
        useAvatar:
          typeof (f.useAvatar ?? f.profile?.useAvatar) === "boolean"
            ? f.useAvatar ?? f.profile?.useAvatar
            : undefined,
        uid: f.uid || f.id || "",
        // Include friendId/userId for compatibility with HorizontalFriendsBar
        friendId: f.friendId || f.userId || f.uid || f.id || "",
        userId: f.userId || f.friendId || f.uid || f.id || "",
      }))
      .slice(0, 20); // Max 20 friends

    return this.set(
      this.keys.quickAccessFriends(uid),
      minimalFriends,
      DEFAULT_TTL_MS
    );
  },

  /**
   * Get cached Quick Access friends
   */
  getQuickAccessFriends(uid) {
    return this.getData(this.keys.quickAccessFriends(uid));
  },

  /**
   * Check if we have cached data for instant startup
   * @param {string} uid - User ID
   * @returns {boolean} - True if we have enough data for instant display
   */
  hasInstantStartupData(uid) {
    if (!uid) return false;

    const avatar = this.get(this.keys.userAvatar(uid));
    const schedule = this.get(this.keys.userSchedule(uid));

    // We need at least avatar for instant startup
    return !!(avatar && !avatar.isExpired);
  },
};

// Export for use throughout the app
export default pwaCache;
