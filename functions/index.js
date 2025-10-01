import { initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
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

