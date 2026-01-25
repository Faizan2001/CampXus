/**
 * BlockService — per-user block list (Firestore + local fallback)
 *
 * Scope:
 * - Hide messages from blocked users in group chats and show block/unblock actions.
 * - Persist across devices by storing blocks in Firestore under:
 *   /users/{userId}/blocks/{targetId}
 * - Keep localStorage as a fast/offline fallback.
 */

const STORAGE_PREFIX = "campxus:blocklist";

class BlockService {
  constructor() {
    this._cache = new Map(); // userId -> Set(targetId)
    this._unsub = new Map(); // userId -> unsubscribe
  }

  /**
   * @param {string} userId
   */
  getKey(userId) {
    return `${STORAGE_PREFIX}:${userId || "anon"}`;
  }

  /**
   * @param {string} userId
   * @returns {Set<string>}
   */
  loadLocal(userId) {
    try {
      const raw = localStorage.getItem(this.getKey(userId));
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) return new Set(arr);
      return new Set();
    } catch (err) {
      logManager.dev.debug("Storage access failed for block list", err);
      return new Set();
    }
  }

  /**
   * @param {string} userId
   * @param {Set<string>} set
   */
  saveLocal(userId, set) {
    try {
      localStorage.setItem(
        this.getKey(userId),
        JSON.stringify(Array.from(set || []))
      );
    } catch (error) { console.debug("Suppressed error", error); }
  }

  getSet(userId) {
    if (!userId) return new Set();
    const cached = this._cache.get(userId);
    if (cached) return cached;
    const set = this.loadLocal(userId);
    this._cache.set(userId, set);
    return set;
  }

  /**
   * Start syncing block list from Firestore into memory/localStorage.
   * Safe to call multiple times.
   * @param {string} userId
   * @returns {Promise<Function|null>} unsubscribe
   */
  async startSync(userId) {
    if (!userId) return null;
    if (this._unsub.has(userId)) return this._unsub.get(userId);

    try {
      const [{ db }, { collection, onSnapshot }] = await Promise.all([
        import("../../lib/firebase/firebase-config.js"),
        import("firebase/firestore"),
      ]);

      const ref = collection(db, "users", userId, "blocks");
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const set = new Set();
          snap.forEach((d) => set.add(d.id));
          this._cache.set(userId, set);
          this.saveLocal(userId, set);
        },
        (err) => {
          // Keep local cache if listener fails
          console.warn("[BlockService] blocks listener error:", err);
        }
      );

      this._unsub.set(userId, unsub);
      return unsub;
    } catch (e) {
      console.warn("[BlockService] startSync failed (using local only):", e);
      return null;
    }
  }

  stopSync(userId) {
    const unsub = this._unsub.get(userId);
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch (error) { console.debug("Suppressed error", error); }
    }
    this._unsub.delete(userId);
  }

  async persistBlock(userId, targetId, isBlocked) {
    try {
      const [{ db }, { doc, setDoc, deleteDoc, serverTimestamp, getDoc }] =
        await Promise.all([
          import("../../lib/firebase/firebase-config.js"),
          import("firebase/firestore"),
        ]);

      const ref = doc(db, "users", userId, "blocks", targetId);
      if (isBlocked) {
        // Avoid an "update" write: rules only allow create/delete
        const existing = await getDoc(ref);
        if (existing.exists()) return;
        await setDoc(
          ref,
          {
            targetId,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        await deleteDoc(ref);
      }
    } catch (e) {
      // Non-fatal: local fallback still applies
      console.warn("[BlockService] persistBlock failed:", e);
    }
  }

  /**
   * @param {string} userId
   * @param {string} targetId
   */
  block(userId, targetId) {
    if (!userId || !targetId || userId === targetId) return;
    const set = this.getSet(userId);
    set.add(targetId);
    this.saveLocal(userId, set);
    void this.persistBlock(userId, targetId, true);
  }

  /**
   * @param {string} userId
   * @param {string} targetId
   */
  unblock(userId, targetId) {
    if (!userId || !targetId) return;
    const set = this.getSet(userId);
    set.delete(targetId);
    this.saveLocal(userId, set);
    void this.persistBlock(userId, targetId, false);
  }

  /**
   * @param {string} userId
   * @param {string} targetId
   * @returns {boolean}
   */
  isBlocked(userId, targetId) {
    if (!userId || !targetId) return false;
    return this.getSet(userId).has(targetId);
  }

  /**
   * @param {string} userId
   * @returns {string[]}
   */
  list(userId) {
    return Array.from(this.getSet(userId));
  }
}

export const blockService = new BlockService();
export default blockService;
