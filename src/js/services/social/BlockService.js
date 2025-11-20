/**
 * BlockService — client-side block list (per-user, localStorage)
 *
 * v1 scope: Hide messages from blocked users in group chats and show
 * block/unblock actions in members list. Persisted per account on device.
 */

const STORAGE_PREFIX = "campxus:blocklist";

class BlockService {
  /**
   * @param {string} userId
   */
  getKey(userId) {
    return `${STORAGE_PREFIX}:${userId || 'anon'}`;
  }

  /**
   * @param {string} userId
   * @returns {Set<string>}
   */
  load(userId) {
    try {
      const raw = localStorage.getItem(this.getKey(userId));
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) return new Set(arr);
      return new Set();
    } catch (_) {
      return new Set();
    }
  }

  /**
   * @param {string} userId
   * @param {Set<string>} set
   */
  save(userId, set) {
    try {
      localStorage.setItem(this.getKey(userId), JSON.stringify(Array.from(set || [])));
    } catch (_) {}
  }

  /**
   * @param {string} userId
   * @param {string} targetId
   */
  block(userId, targetId) {
    if (!userId || !targetId || userId === targetId) return;
    const set = this.load(userId);
    set.add(targetId);
    this.save(userId, set);
  }

  /**
   * @param {string} userId
   * @param {string} targetId
   */
  unblock(userId, targetId) {
    if (!userId || !targetId) return;
    const set = this.load(userId);
    set.delete(targetId);
    this.save(userId, set);
  }

  /**
   * @param {string} userId
   * @param {string} targetId
   * @returns {boolean}
   */
  isBlocked(userId, targetId) {
    if (!userId || !targetId) return false;
    return this.load(userId).has(targetId);
  }

  /**
   * @param {string} userId
   * @returns {string[]}
   */
  list(userId) {
    return Array.from(this.load(userId));
  }
}

export const blockService = new BlockService();
export default blockService;

