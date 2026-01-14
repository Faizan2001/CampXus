/**
 * Lightweight UI cache with TTL for cross-page, same-session reuse.
 * Avoids flicker by seeding views with recent data and applying background diffs.
 *
 * Keys are namespaced per-user. Storage is sessionStorage-backed with in-memory fallback.
 */

const memCache = new Map(); // key -> { data, expiresAt }

function now() {
  return Date.now();
}

function buildKey(ns, userId) {
  return `${ns}::${userId || "anon"}`;
}

function set(key, data, ttlMs = 60_000) {
  const record = { data, expiresAt: now() + ttlMs };
  memCache.set(key, record);
  try {
    sessionStorage.setItem(key, JSON.stringify(record));
  } catch (_) {
    // ignore storage failures
  }
}

function get(key) {
  // Prefer memory
  const inMem = memCache.get(key);
  if (inMem && inMem.expiresAt > now()) return inMem.data;
  if (inMem) memCache.delete(key);

  // Fallback to sessionStorage
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.expiresAt && parsed.expiresAt > now()) {
      // hydrate mem
      memCache.set(key, parsed);
      return parsed.data;
    }
    sessionStorage.removeItem(key);
  } catch (_) {
    // ignore parse/storage errors
  }
  return null;
}

export const uiCache = {
  // generic access
  set,
  get,

  // Convenience helpers for this app
  keys: {
    horizontalPresence(userId) {
      return buildKey("ui.horizontalPresence", userId);
    },
    friendsList(userId) {
      return buildKey("ui.friendsList", userId);
    },
    quickAccessFriends(userId) {
      return buildKey("ui.quickAccessFriends", userId);
    },
  },
};
