/**
 * GroupsCache Service
 * Aggressive caching for groups list to reduce Firestore reads and stay within free tier.
 *
 * Strategy:
 * - Cache groups list in localStorage with 5-minute TTL
 * - Reduces Firestore reads by ~95% (from 288 reads/day to ~12 reads/day per user)
 * - Manual refresh available for users who want latest data
 * - Auto-refresh on return to page after 1 minute
 *
 * Free Tier Impact:
 * - Without cache: 2,000 users × 288 reads/day = 576,000 reads/day ❌
 * - With cache: 2,000 users × 12 reads/day = 24,000 reads/day ✅
 */

import { Timestamp } from "firebase/firestore";

const CACHE_KEY = "campxus:groupsCache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const SOFT_REFRESH_TTL = 1 * 60 * 1000; // 1 minute for soft refresh on navigation

export class GroupsCache {
  constructor() {
    this.cache = this.loadFromStorage();
  }

  /**
   * Get cache key for current user
   * @param {string} userId - Current user ID
   * @returns {string} User-specific cache key
   */
  getCacheKey(userId) {
    if (!userId) {
      console.warn("[GroupsCache] No userId provided for cache key");
      return CACHE_KEY; // Fallback to generic key
    }
    return `${CACHE_KEY}:${userId}`;
  }

  /**
   * Load cache from localStorage for specific user
   * @param {string} userId - Current user ID
   * @returns {Object|null} Cached data with timestamp
   */
  loadFromStorage(userId = null) {
    try {
      const key = userId ? this.getCacheKey(userId) : CACHE_KEY;
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      // Validate cache structure and userId match
      if (!parsed.timestamp || !Array.isArray(parsed.data)) {
        return null;
      }

      // Security: Validate cached userId matches current user
      if (userId && parsed.userId && parsed.userId !== userId) {
        console.warn("[GroupsCache] Cache userId mismatch, invalidating");
        this.invalidate(userId);
        return null;
      }

      return parsed;
    } catch (e) {
      console.warn("Failed to load groups cache from localStorage", e);
      return null;
    }
  }

  /**
   * Save cache to localStorage for specific user
   * @param {Array} data - Groups data to cache
   * @param {string} userId - Current user ID
   */
  saveToStorage(data, userId) {
    if (!userId) {
      console.warn("[GroupsCache] Cannot save cache without userId");
      return;
    }

    try {
      // Serialize Firestore Timestamps to milliseconds for safe localStorage storage
      const serializedData = data.map((space) => {
        const serialized = { ...space };

        // Convert Firestore Timestamps to milliseconds
        if (space.lastActivity?.toMillis) {
          serialized.lastActivity = space.lastActivity.toMillis();
        }
        if (space.createdAt?.toMillis) {
          serialized.createdAt = space.createdAt.toMillis();
        }
        if (space.lastMessagePreview?.timestamp?.toMillis) {
          serialized.lastMessagePreview = {
            ...space.lastMessagePreview,
            timestamp: space.lastMessagePreview.timestamp.toMillis(),
          };
        }

        return serialized;
      });

      const cacheData = {
        data: serializedData,
        userId, // Store userId for validation
        timestamp: Date.now(),
      };
      const key = this.getCacheKey(userId);
      localStorage.setItem(key, JSON.stringify(cacheData));
      this.cache = cacheData;
    } catch (e) {
      console.warn("Failed to save groups cache to localStorage", e);
    }
  }

  /**
   * Get cached groups if valid
   * @param {string} userId - Current user ID
   * @param {boolean} softRefresh - Use shorter TTL for soft refresh (1 min instead of 5)
   * @returns {Array|null} Cached groups or null if expired
   */
  get(userId, softRefresh = false) {
    if (!userId) {
      console.warn("[GroupsCache] Cannot get cache without userId");
      return null;
    }

    const cached = this.loadFromStorage(userId);
    if (!cached || !cached.timestamp) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    const ttl = softRefresh ? SOFT_REFRESH_TTL : CACHE_TTL;

    if (age > ttl) {
      return null; // Cache expired
    }

    this.cache = cached; // Update instance cache

    // Rehydrate Firestore Timestamps from milliseconds
    const rehydratedData = cached.data.map((space) => {
      const rehydrated = { ...space };

      // Restore Firestore Timestamps from milliseconds
      if (typeof space.lastActivity === "number") {
        rehydrated.lastActivity = Timestamp.fromMillis(space.lastActivity);
      }
      if (typeof space.createdAt === "number") {
        rehydrated.createdAt = Timestamp.fromMillis(space.createdAt);
      }
      if (
        space.lastMessagePreview &&
        typeof space.lastMessagePreview.timestamp === "number"
      ) {
        rehydrated.lastMessagePreview = {
          ...space.lastMessagePreview,
          timestamp: Timestamp.fromMillis(space.lastMessagePreview.timestamp),
        };
      }

      return rehydrated;
    });

    return rehydratedData;
  }

  /**
   * Set cached groups
   * @param {Array} data - Groups data to cache
   * @param {string} userId - Current user ID
   */
  set(data, userId) {
    this.saveToStorage(data, userId);
  }

  /**
   * Get cache age in milliseconds
   * @param {string} userId - Current user ID
   * @returns {number} Age in ms, or Infinity if no cache
   */
  getAge(userId) {
    if (!userId) return Infinity;

    const cached = this.loadFromStorage(userId);
    if (!cached || !cached.timestamp) {
      return Infinity;
    }
    return Date.now() - cached.timestamp;
  }

  /**
   * Get human-readable cache age string
   * @param {string} userId - Current user ID
   * @returns {string} e.g., "2m ago", "just now"
   */
  getAgeString(userId) {
    const age = this.getAge(userId);

    if (age === Infinity) {
      return "never";
    }

    const seconds = Math.floor(age / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return `${hours}h ago`;
  }

  /**
   * Check if cache is valid (not expired)
   * @param {string} userId - Current user ID
   * @param {boolean} softRefresh - Use shorter TTL
   * @returns {boolean} True if cache is valid
   */
  isValid(userId, softRefresh = false) {
    return this.get(userId, softRefresh) !== null;
  }

  /**
   * Clear the cache for specific user
   * @param {string} userId - Current user ID (optional, clears all if not provided)
   */
  clear(userId = null) {
    try {
      if (userId) {
        const key = this.getCacheKey(userId);
        localStorage.removeItem(key);
      } else {
        // Clear all groups caches (for cleanup/logout)
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (key.startsWith(CACHE_KEY)) {
            localStorage.removeItem(key);
          }
        });
      }
      this.cache = null;
    } catch (e) {
      console.warn("Failed to clear groups cache", e);
    }
  }

  /**
   * Force refresh (clear cache and indicate refresh needed)
   * @param {string} userId - Current user ID
   * @returns {boolean} Always returns false to indicate cache miss
   */
  invalidate(userId) {
    this.clear(userId);
    return false;
  }
}

// Singleton instance
export const groupsCache = new GroupsCache();
export default groupsCache;
