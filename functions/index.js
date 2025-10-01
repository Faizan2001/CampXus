import { initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { https } from "firebase-functions"; // for potential callable future use
import * as logger from "firebase-functions/logger";

// Initialize Admin SDK once
initAdminApp();
const db = getFirestore();
const messaging = getMessaging();

// -----------------------------
// Helpers
// -----------------------------
function getYyyyMmDd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getTodayKey() { return getYyyyMmDd(); }

// Simple rate limit doc path helper
function rateLimitRef(userId) {
  return db.collection("users").doc(userId).collection("meta").doc("rateLimits");
}

async function incrementRate(userId, key, limitPerDay) {
  const today = getTodayKey();
  const ref = rateLimitRef(userId);
  let allowed = true;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const dayObj = data[today] || {};
    const current = dayObj[key] || 0;
    if (current >= limitPerDay) {
      allowed = false; return;
    }
    dayObj[key] = current + 1;
    tx.set(ref, { [today]: dayObj }, { merge: true });
  });
  return allowed;
}

// Utility: collect all subcollection docs (shallow) and batch delete
async function deleteUserSubcollection(userId, sub) {
  const snap = await db.collection("users").doc(userId).collection(sub).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function deleteUserFriendships(userId) {
  const q = await db.collection("friendships").where("users", "array-contains", userId).get();
  if (q.empty) return 0;
  const batch = db.batch();
  q.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return q.size;
}

async function getUserTokens(userId) {
  const snap = await db.collection("users").doc(userId).collection("fcmTokens").get();
  const tokens = [];
  snap.forEach((doc) => tokens.push(doc.id));
  return tokens;
}

async function removeInvalidTokens(userId, tokens, responses) {
  const batch = db.batch();
  responses.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const err = resp.error;
      // Remove invalid/expired tokens
      if (err && err.code && (String(err.code).includes("registration-token-not-registered") || String(err.code).includes("invalid-argument"))) {
        const token = tokens[idx];
        batch.delete(db.collection("users").doc(userId).collection("fcmTokens").doc(token));
      }
    }
  });
  await batch.commit();
}

async function sendToUser(userId, notification, data = {}) {
  const tokens = await getUserTokens(userId);
  if (!tokens.length) return { success: false, reason: "no_tokens" };
  const message = {
    tokens,
    notification: {
      ...notification,
      icon: notification.icon || "https://meetchuthere.com/icons/icon-192x192.png",
    },
    data,
    android: {
      priority: "high",
      notification: {
        icon: "https://meetchuthere.com/icons/icon-192x192.png",
        color: "#8b7de8", // MeetchuThere brand purple
      },
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: {
        aps: {
          sound: "default",
          "mutable-content": 1,
        }
      },
    },
    webpush: {
      headers: { Urgency: "high" },
      notification: {
        icon: "https://meetchuthere.com/icons/icon-192x192.png",
        badge: "https://meetchuthere.com/icons/icon-72x72.png",
      },
    },
  };
  const resp = await messaging.sendEachForMulticast(message);
  await removeInvalidTokens(userId, tokens, resp);
  return { success: true, sent: resp.successCount, failed: resp.failureCount };
}

async function getUserPrefs(userId) {
  const doc = await db.collection("users").doc(userId).get();
  const data = doc.exists ? doc.data() : {};
  const prefs = data?.notificationPreferences || { friendRequests: true, locationRequests: true, starredPresence: true };
  return { prefs, user: data };
}

// Increment and check daily limit for starred presence per recipient
async function canSendStarredPresenceToday(recipientId) {
  const today = getYyyyMmDd();
  const ref = db.collection("users").doc(recipientId).collection("meta").doc("notificationCounts");
  const doc = await ref.get();
  const counts = doc.exists ? doc.data() : {};
  const current = counts?.[today]?.starredPresence || 0;
  return current < 10; // allow at least 10 per day
}

async function incrementStarredPresenceCount(recipientId) {
  const today = getYyyyMmDd();
  const ref = db.collection("users").doc(recipientId).collection("meta").doc("notificationCounts");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const base = snap.exists ? snap.data() : {};
    const dayObj = base[today] || {};
    const next = (dayObj.starredPresence || 0) + 1;
    tx.set(ref, { [today]: { ...dayObj, starredPresence: next } }, { merge: true });
  });
}

async function areFriends(userA, userB) {
  // Query friendships where users contains A, then check if also contains B
  const q = await db.collection("friendships").where("users", "array-contains", userA).get();
  for (const doc of q.docs) {
    const data = doc.data();
    if (Array.isArray(data.users) && data.users.includes(userB)) {
      return { exists: true, data };
    }
  }
  return { exists: false, data: null };
}

function isStarredBy(recipientUser, actorId) {
  const list = recipientUser?.quickAccessData?.starredFriends || [];
  // Expect objects like { friendId: "..." }
  return list.some((f) => (typeof f === "string" ? f === actorId : f?.friendId === actorId));
}

// -----------------------------
// Triggers
// -----------------------------

// 1) Friend Requests → notify recipient automatically
export const onFriendRequestCreated = onDocumentCreated("friendRequests/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const toUserId = data.toUserId;
  if (!toUserId) return;

  // Spam limit: sender daily friend requests (e.g. 40/day)
  if (data.fromUserId) {
    const ok = await incrementRate(data.fromUserId, "friendRequestsSent", 40);
    if (!ok) {
      logger.warn("Friend request rate limit exceeded", { user: data.fromUserId });
      return; // silently drop push but still allow Firestore doc; alternative: delete doc
    }
  }

  const { prefs } = await getUserPrefs(toUserId);
  if (prefs.friendRequests === false) {
    logger.info("Recipient disabled friendRequests push", { toUserId });
    return;
  }

  const handle = data?.fromUserInfo?.handle ? `@${data.fromUserInfo.handle}` : "Someone";
  const notification = {
    title: "New Friend Request",
    body: `${handle} wants to be your friend`,
  };
  const payload = { link: "/#friends", type: "friend_request" };
  const res = await sendToUser(toUserId, notification, payload);
  logger.info("Friend request push sent", res);
});

// 2) Location share requests (existing notifications collection)
export const onNotificationCreated = onDocumentCreated("notifications/{id}", async (event) => {
  const data = event.data?.data();
  if (!data || data.type !== "location_share_request") return;
  const toUserId = data.userId;
  if (!toUserId) return;

  // Spam limit: location share requests per sender (e.g. 60/day)
  if (data.fromUserId) {
    const ok = await incrementRate(data.fromUserId, "locationRequestsSent", 60);
    if (!ok) {
      logger.warn("Location request rate limit exceeded", { user: data.fromUserId });
      return;
    }
  }

  const { prefs } = await getUserPrefs(toUserId);
  if (prefs.locationRequests === false) {
    logger.info("Recipient disabled locationRequests push", { toUserId });
    return;
  }

  const handle = data?.fromUserInfo?.handle ? `@${data.fromUserInfo.handle}` : "A friend";
  const notification = {
    title: "Location Request",
    body: `${handle} requested to share location`,
  };
  const payload = { link: "/#notifications", type: "location_request" };
  const res = await sendToUser(toUserId, notification, payload);
  logger.info("Location request push sent", res);
});

// 3) Starred presence alert when a user becomes ON CAMPUS
export const onUserPresenceUpdated = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  const beforeStatus = before?.systemInfo?.lastKnownLocation?.campusStatus || "unknown";
  const afterStatus = after?.systemInfo?.lastKnownLocation?.campusStatus || "unknown";
  if (beforeStatus === afterStatus) return;

  // Only react to transitions to on_campus
  if (afterStatus !== "on_campus") return;

  const actorId = event.params.userId;

  // Find friends via friendships where users contains actorId
  const friendshipsSnap = await db.collection("friendships").where("users", "array-contains", actorId).get();
  if (friendshipsSnap.empty) return;

  // Cache actor handle for nicer text
  const actorDoc = await db.collection("users").doc(actorId).get();
  const actorHandle = actorDoc.exists && actorDoc.data()?.profile?.handle ? `@${actorDoc.data().profile.handle}` : "A friend";

  // For each friend, check starred + privacy + prefs, then send (up to daily limit)
  const sendPromises = [];
  for (const fr of friendshipsSnap.docs) {
    const friendship = fr.data();
    const friendId = (friendship.user1Id === actorId) ? friendship.user2Id : friendship.user1Id;
    if (!friendId) continue;

    const { prefs, user: recipientUser } = await getUserPrefs(friendId);
    if (prefs.starredPresence === false) continue;

    // Must be starred by recipient
    if (!isStarredBy(recipientUser, actorId)) continue;

    // Check bilateral location visibility allows recipient to see actor
    const vis = friendship?.locationVisibility || {};
    const canSee = vis[friendId] === true || vis?.[friendId] === "true"; // tolerate string boolean
    if (!canSee) continue;

    // Rate limit: max 10 per day per recipient
    const okToday = await canSendStarredPresenceToday(friendId);
    if (!okToday) continue;

    const notification = {
      title: "On Campus",
      body: `${actorHandle} just arrived on campus`,
    };
    const data = { link: "/#friends", type: "starred_presence" };
    sendPromises.push((async () => {
      const res = await sendToUser(friendId, notification, data);
      await incrementStarredPresenceCount(friendId);
      logger.info("Starred presence push result", { friendId, ...res });
    })());
  }
  await Promise.allSettled(sendPromises);
});

// 4) Token write trigger for server-side dedupe (browser -> PWA upgrade)
export const onFcmTokenWrite = onDocumentWritten("users/{userId}/fcmTokens/{tokenId}", async (event) => {
  const after = event.data?.after?.data();
  if (!after) return; // deleted handled separately
  if (after.isPWA !== true || !after.deviceKey) return; // only act on PWA token
  const { userId, tokenId } = event.params;
  const snap = await db.collection("users").doc(userId).collection("fcmTokens").get();
  const batch = db.batch();
  let removed = 0;
  snap.forEach(docSnap => {
    if (docSnap.id === tokenId) return;
    const d = docSnap.data();
    if (d.deviceKey === after.deviceKey && d.isPWA !== true) {
      batch.delete(docSnap.ref);
      removed++;
    }
  });
  if (removed > 0) {
    await batch.commit();
    logger.info("Server token dedupe complete", { userId, removed });
  }
});

// 5) Monthly stale token cleanup (older than 90 days by updatedAt or createdAt)
export const cleanupStaleTokens = onSchedule("1 of month 00:30", async () => {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const usersSnap = await db.collection("users").get();
  let totalDeleted = 0;
  for (const userDoc of usersSnap.docs) {
    const tokens = await userDoc.ref.collection("fcmTokens").get();
    if (tokens.empty) continue;
    const batch = db.batch();
    let localDeleted = 0;
    tokens.forEach(t => {
      const d = t.data();
      const ts = d?.updatedAt?.toMillis?.() || d?.createdAt?.toMillis?.();
      if (ts && ts < cutoff) { batch.delete(t.ref); localDeleted++; }
    });
    if (localDeleted > 0) { await batch.commit(); totalDeleted += localDeleted; }
  }
  logger.info("Stale token cleanup finished", { totalDeleted });
});

// 6) Daily stats aggregation
export const aggregateDailyStats = onSchedule("every day 00:10", async () => {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const dayKey = getTodayKey();
  const usersSnap = await db.collection("users").get();
  let active24h = 0, new24h = 0, pwaInstalls = 0;
  for (const u of usersSnap.docs) {
    const d = u.data();
    const lastActive = d?.systemInfo?.lastActive?.toMillis?.();
    if (lastActive && lastActive > since) active24h++;
    const createdAt = d?.systemInfo?.createdAt?.toMillis?.();
    if (createdAt && createdAt > since) new24h++;
    // quick check for at least one PWA token
    const pwaSnap = await u.ref.collection("fcmTokens").where("isPWA", "==", true).limit(1).get().catch(()=>null);
    if (pwaSnap && !pwaSnap.empty) pwaInstalls++;
  }
  const friendshipCount = (await db.collection("friendships").count().get()).data().count;
  await db.collection("systemStats").doc(dayKey).set({
    date: dayKey,
    activeUsers24h: active24h,
    newUsers24h: new24h,
    totalUsers: usersSnap.size,
    totalFriendships: friendshipCount,
    pwaInstalls,
    generatedAt: new Date().toISOString()
  }, { merge: true });
  logger.info("Daily stats aggregated", { dayKey, active24h, pwaInstalls });
});

// 7) Cascade cleanup when a user document is deleted
export const onUserDeleted = onDocumentDeleted("users/{userId}", async (event) => {
  const { userId } = event.params;
  // Delete fcmTokens, meta, other lightweight subcollections
  const subs = ["fcmTokens", "meta"];
  let total = 0;
  for (const s of subs) {
    total += await deleteUserSubcollection(userId, s);
  }
  const friendshipsRemoved = await deleteUserFriendships(userId);
  logger.info("Cascade user cleanup", { userId, subDocsDeleted: total, friendshipsRemoved });
});

