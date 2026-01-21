/**
 * Quick Access (⭐) optimistic cache helpers.
 *
 * Goal: Make UI feel instant by updating session/PWA caches immediately on star/unstar,
 * while Firestore writes happen in the background.
 */

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildQuickAccessCacheEntry(friendId, friend = {}) {
  const id = normalizeId(friendId) || normalizeId(friend?.id) || normalizeId(friend?.uid);
  if (!id) return null;

  const handle =
    (typeof friend?.handle === "string" && friend.handle.trim()) || friend?.profile?.handle || "";

  const entry = {
    friendId: id,
    userId: id,
    uid: id,
    handle,
    major: friend?.major || friend?.profile?.major || null,
    profilePhotoUrl: friend?.profilePhotoUrl || friend?.profile?.profilePhotoUrl || null,
    profilePhotoThumbUrl:
      friend?.profilePhotoThumbUrl || friend?.profile?.profilePhotoThumbUrl || null,
    avatarConfig: friend?.avatarConfig || friend?.profile?.avatarConfig || null,
    lastInteraction: new Date(),
  };

  if (typeof friend?.useAvatar === "boolean") {
    entry.useAvatar = friend.useAvatar;
  } else if (typeof friend?.profile?.useAvatar === "boolean") {
    entry.useAvatar = friend.profile.useAvatar;
  }

  if (friend?.friendshipId) entry.friendshipId = friend.friendshipId;

  return entry;
}

export function applyQuickAccessOptimisticUpdate(currentList, entry, action) {
  const list = Array.isArray(currentList) ? currentList.slice() : [];
  const id = normalizeId(entry?.friendId) || normalizeId(entry?.userId) || normalizeId(entry?.uid);
  if (!id) return list;

  const without = list.filter((f) => {
    const fid =
      normalizeId(f?.friendId) || normalizeId(f?.userId) || normalizeId(f?.uid) || normalizeId(f?.id);
    return fid !== id;
  });

  if (action === "remove") return without;

  // Default: add to front (recent-first UX)
  return [entry, ...without];
}

