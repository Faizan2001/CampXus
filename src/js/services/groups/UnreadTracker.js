/**
 * UnreadTracker Service
 * Tracks when users last viewed each class space to calculate unread message counts.
 * Persists to localStorage for cross-session consistency.
 * User-scoped to prevent cross-account data leakage.
 */

const STORAGE_KEY = "campxus:unreadTracker";

export class UnreadTracker {
  constructor() {
    this.viewedTimes = {}; // Current user's viewed times (loaded on-demand)
    this.currentUserId = null; // Track which user's data is loaded
  }

  /**
   * Get storage key for specific user
   * @param {string} userId - User ID
   * @returns {string} User-specific storage key
   */
  getStorageKey(userId) {
    if (!userId) return STORAGE_KEY; // Fallback
    return `${STORAGE_KEY}:${userId}`;
  }

  /**
   * Load viewed timestamps from localStorage for specific user
   * @param {string} userId - User ID
   * @returns {Object} Map of spaceId -> ISO timestamp
   */
  loadFromStorage(userId) {
    if (!userId) {
      console.warn("[UnreadTracker] No userId provided");
      return {};
    }

    try {
      const key = this.getStorageKey(userId);
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn("Failed to load unread tracker from localStorage", e);
      return {};
    }
  }

  /**
   * Persist viewed timestamps to localStorage for current user
   */
  saveToStorage() {
    if (!this.currentUserId) {
      console.warn("[UnreadTracker] Cannot save without currentUserId");
      return;
    }

    try {
      const key = this.getStorageKey(this.currentUserId);
      localStorage.setItem(key, JSON.stringify(this.viewedTimes));
    } catch (e) {
      console.warn("Failed to save unread tracker to localStorage", e);
    }
  }

  /**
   * Ensure correct user's data is loaded
   * @param {string} userId - User ID
   */
  ensureUserLoaded(userId) {
    if (!userId) return;

    // If switching users, load the new user's data
    if (this.currentUserId !== userId) {
      this.currentUserId = userId;
      this.viewedTimes = this.loadFromStorage(userId);
    }
  }

  /**
   * Mark a space as viewed at the current time
   * @param {string} spaceId - The space ID
   * @param {string} userId - Current user ID
   */
  markAsViewed(spaceId, userId) {
    if (!spaceId || !userId) return;

    this.ensureUserLoaded(userId);
    this.viewedTimes[spaceId] = new Date().toISOString();
    this.saveToStorage();

    // Dispatch event so navigation badges can recalculate
    try {
      document.dispatchEvent(
        new CustomEvent("classspace:viewed", { detail: { spaceId, userId } })
      );
    } catch (error) { console.debug("Suppressed error", error); }
  }

  /**
   * Get the last viewed timestamp for a space
   * @param {string} spaceId - The space ID
   * @param {string} userId - Current user ID
   * @returns {Date|null} Last viewed date or null if never viewed
   */
  getLastViewedTime(spaceId, userId) {
    if (!spaceId || !userId) return null;

    this.ensureUserLoaded(userId);

    if (!this.viewedTimes[spaceId]) return null;
    try {
      return new Date(this.viewedTimes[spaceId]);
    } catch (e) {
      return null;
    }
  }

  /**
   * Calculate unread count for a space based on lastActivity timestamp
   * @param {string} spaceId - The space ID
   * @param {Object} space - The space object with lastActivity timestamp
   * @param {string} userId - Current user ID
   * @returns {boolean} True if there are unread messages
   */
  hasUnread(spaceId, space, userId) {
    if (!spaceId || !space || !userId) return false;

    this.ensureUserLoaded(userId);

    // If the most recent message was sent by the current user, treat it as read.
    // This prevents "unread" badges for the sender immediately after sending.
    const lastSenderId =
      space.lastMessagePreview?.senderId ||
      space.lastMessagePreview?.fromUserId ||
      null;
    if (lastSenderId && lastSenderId === userId) return false;

    const lastViewed = this.getLastViewedTime(spaceId, userId);
    const lastActivity = space.lastActivity?.toDate?.() || null;

    // If never viewed and there's activity, it's unread
    if (!lastViewed && lastActivity) return true;

    // If viewed but no activity, it's read
    if (lastViewed && !lastActivity) return false;

    // Compare timestamps
    if (lastViewed && lastActivity) {
      return lastActivity > lastViewed;
    }

    return false;
  }

  /**
   * Get relative time string for last activity
   * @param {Object} space - The space object with lastActivity timestamp
   * @returns {string} Relative time string (e.g., "2m ago", "1h ago", "3d ago")
   */
  getRelativeTime(space) {
    if (!space?.lastActivity?.toDate) return "";

    try {
      const activityDate = space.lastActivity.toDate();
      const now = new Date();
      const diffMs = now - activityDate;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      // Older than a week, show date
      return activityDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch (e) {
      return "";
    }
  }

  /**
   * Clear all viewed times (useful for testing/reset)
   */
  clearAll() {
    this.viewedTimes = {};
    this.saveToStorage();
  }

  /**
   * Remove tracking for a specific space
   * @param {string} spaceId - The space ID
   */
  clearSpace(spaceId) {
    if (!spaceId) return;
    delete this.viewedTimes[spaceId];
    this.saveToStorage();
  }
}

// Singleton instance
export const unreadTracker = new UnreadTracker();
export default unreadTracker;
