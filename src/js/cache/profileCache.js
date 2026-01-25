/**
 * Lightweight Profile Hydration Cache
 * ------------------------------------------------------
 * Purpose: Instant UI population of the signed-in user's
 * profile (handle, names, avatar) while Firestore fetches
 * fresh data in the background (stale‑while‑revalidate).
 *
 * Data Model (localStorage):
 *   key: meetchuthere:profileCache:v1
 *   value: {
 *     version: 1,
 *     uid: string,
 *     savedAt: epoch_ms,
 *     profile: { ...full firestore user doc subset... }
 *   }
 *
 * TTL Strategy:
 *  - Soft TTL: 6h (used to mark stale; still hydrated but flagged)
 *  - Hard TTL: 72h (discard entirely)
 *
 * Events Emitted:
 *  - profile:cache:available  (cache present & not hard-expired)
 *  - profile:hydrated         (applied to userStore)
 *  - profile:cache:updated    (saved new snapshot)
 *  - profile:cache:cleared    (cleared on logout/reset)
 */

import { logManager } from "../utils/debug/LogManager.js";
import { pwaCache } from "../services/cache/PWACacheService.js";

const CACHE_KEY = "meetchuthere:profileCache:v1";
const VERSION = 1;
const SOFT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const HARD_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function now() {
  return Date.now();
}

export const profileCache = {
  /** Load raw cache (no side-effects) */
  loadRaw() {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed || parsed.version !== VERSION || !parsed.uid) return null;
    const age = now() - (parsed.savedAt || 0);
    if (age > HARD_TTL_MS) {
      // Hard expire
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return { ...parsed, age, isStale: age > SOFT_TTL_MS };
  },

  /** Lightweight accessor used during bootstrap */
  peek() {
    return this.loadRaw();
  },

  /** Persist profile snapshot */
  save(uid, fullProfileDoc) {
    if (!uid || !fullProfileDoc) return false;
    try {
      const snapshot = {
        version: VERSION,
        uid,
        savedAt: now(),
        profile: fullProfileDoc,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));

      // 📱 Also save avatar to PWA cache for instant PWA startup
      const avatarUrl =
        fullProfileDoc?.profile?.avatarUrl || fullProfileDoc?.avatarUrl;
      if (avatarUrl) {
        pwaCache.saveUserAvatar(uid, avatarUrl);
      }

      document.dispatchEvent(
        new CustomEvent("profile:cache:updated", {
          detail: { uid, savedAt: snapshot.savedAt },
        })
      );
      logManager.dev.debug("Profile cache saved", { uid });
      return true;
    } catch (e) {
      logManager.system.warn("profileCache.save failed", {
        message: e?.message,
      });
      return false;
    }
  },

  /** Remove cache entirely */
  clear() {
    localStorage.removeItem(CACHE_KEY);
    document.dispatchEvent(
      new CustomEvent("profile:cache:cleared", { detail: { at: now() } })
    );
  },

  /**
   * Attempt hydration: if auth user uid matches cache.uid and userStore lacks profile.
   * @param {object} currentUserMgr currentUser singleton
   * @param {object} auth Firebase auth instance (optional)
   * @returns {boolean} true if hydrated
   */
  tryHydrate(currentUserMgr, auth, options = {}) {
    const { optimistic = false } = options;
    try {
      const cached = this.loadRaw();
      if (!cached) return false;

      // Emit availability early (even if not applied yet)
      document.dispatchEvent(
        new CustomEvent("profile:cache:available", {
          detail: { uid: cached.uid, age: cached.age, isStale: cached.isStale },
        })
      );

      let authUser = auth?.currentUser;
      if (!authUser) {
        if (!optimistic) return false; // Wait for real auth
        // Create a lightweight placeholder so UI can show profile fields
        authUser = {
          uid: cached.uid,
          email: cached.profile?.profile?.email || "",
        };
      }
      if (authUser.uid !== cached.uid) return false;

      // Only hydrate if profile not already present
      if (!currentUserMgr.profile) {
        // Ensure user object seeded
        if (!currentUserMgr.user) currentUserMgr.setUser(authUser);
        currentUserMgr.setProfile(cached.profile);
        document.dispatchEvent(
          new CustomEvent("profile:hydrated", {
            detail: {
              source: "cache",
              uid: cached.uid,
              age: cached.age,
              isStale: cached.isStale,
              optimistic: !auth?.currentUser,
            },
          })
        );
        logManager.system.init(
          `Hydrated profile from cache (stale=${cached.isStale})`
        );
        return true;
      }
      return false;
    } catch (e) {
      logManager.system.warn("profileCache.tryHydrate failed", {
        message: e?.message,
      });
      return false;
    }
  },
};

// Expose in dev for inspection
const __DEV__ =
  typeof window !== "undefined" &&
  (import.meta?.env?.DEV ||
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NODE_ENV === "development") ||
    (window.ENV && window.ENV.ENVIRONMENT !== "production"));
if (__DEV__) {
  window.__profileCache = profileCache;
}
