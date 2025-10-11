import { initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
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

function getTodayKey() {
  return getYyyyMmDd();
}

// Simple rate limit doc path helper
function rateLimitRef(userId) {
  return db
    .collection("users")
    .doc(userId)
    .collection("meta")
    .doc("rateLimits");
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
      allowed = false;
      return;
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
  snap.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function deleteUserFriendships(userId) {
  const q = await db
    .collection("friendships")
    .where("users", "array-contains", userId)
    .get();
  if (q.empty) return 0;
  const batch = db.batch();
  q.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return q.size;
}

async function getUserTokens(userId) {
  // Return array of { id, isPWA } so callers can choose delivery strategy
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("fcmTokens")
    .get();
  const tokens = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    tokens.push({ id: doc.id, isPWA: d.isPWA === true });
  });
  return tokens;
}

function _shouldDeleteTokenForError(err) {
  const s = `${String(err?.code || "").toLowerCase()} ${String(
    err?.message || ""
  ).toLowerCase()}`;
  return (
    s.includes("registration-token-not-registered") ||
    s.includes("invalid-registration-token") ||
    s.includes("invalid-argument") ||
    s.includes("mismatch") ||
    s.includes("sender") ||
    s.includes("unregistered")
  );
}

async function removeInvalidTokens(userId, tokens, responses) {
  const batch = db.batch();
  responses.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const err = resp.error;
      // Remove invalid/expired tokens
      if (_shouldDeleteTokenForError(err)) {
        const tokenId = tokens[idx];
        batch.delete(
          db.collection("users").doc(userId).collection("fcmTokens").doc(tokenId)
        );
      }
    }
  });
  await batch.commit();
}

async function sendToUser(userId, notification, data = {}) {
  const tokenObjs = await getUserTokens(userId);
  if (!tokenObjs.length) return { success: false, reason: "no_tokens" };

  // Preference logic: If user has at least one PWA-installed token, ONLY send to PWA tokens.
  // This prevents duplicate browser + PWA notifications and respects request to notify only PWA install.
  const pwaTokens = tokenObjs.filter((t) => t.isPWA).map((t) => t.id);
  const chosenTokens = pwaTokens.length
    ? pwaTokens
    : tokenObjs.map((t) => t.id);

  // Build absolute link for FCM WebPush (relative links cause invalid-argument)
  let absoluteLink;
  try {
    const base = process.env.PUBLIC_BASE_URL || "https://meetchuthere.com";
    const rel = (data && data.link) || "/";
    absoluteLink = new URL(rel, base).toString();
  } catch (_) {
    absoluteLink = "https://meetchuthere.com/";
  }

  const safeNotification = {
    title: notification?.title || "",
    body: notification?.body || "",
  };

  const message = {
    tokens: chosenTokens,
    notification: safeNotification,
    data,
    // Android-specific config for PWA notifications (wakes device, shows on lockscreen)
    android: {
      priority: "high",
      notification: {
        channelId: "default",
        priority: "high",
        defaultSound: true,
        defaultVibrateTimings: true,
        defaultLightSettings: true,
        visibility: "public", // Shows on lockscreen
        icon: "icon-192x192",
        color: "#4F46E5", // Your brand color
      },
    },
    // iOS-specific config (APNS)
    apns: {
      headers: {
        "apns-priority": "10", // High priority (wakes device)
        "apns-push-type": "alert",
      },
      payload: {
        aps: {
          alert: {
            title: safeNotification.title,
            body: safeNotification.body,
          },
          sound: "default",
          badge: 1,
          "content-available": 1, // Wakes app in background
          "mutable-content": 1, // Allows notification extensions
          // iOS 15+: ensure banner/lockscreen even in Focus via time-sensitive
          "interruption-level": "time-sensitive",
        },
      },
    },
    // Web-specific config for browser notifications
    webpush: {
      headers: { Urgency: "high" },
      notification: {
        icon: "https://meetchuthere.com/icons/icon-192x192.png",
        badge: "https://meetchuthere.com/icons/notification-badge-96x96.png", // White silhouette for Android status bar
        requireInteraction: false, // true ignored on Android; false better for desktop UX
        renotify: true, // Vibrate/sound on repeat notifications
        vibrate: [200, 100, 200],
        tag: "meetchuthere-notification", // Prevents stacking duplicates
        timestamp: Date.now(),
        actions: [
          { action: "open", title: "View", icon: "https://meetchuthere.com/icons/icon-72x72.png" },
        ],
      },
      // Ensure clicks open the SPA route even when the browser autoshows notifications
      fcmOptions: {
        link: absoluteLink,
      },
    },
  };
  const resp = await messaging.sendEachForMulticast(message);
  await removeInvalidTokens(userId, chosenTokens, resp);
  const errors = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      errors.push({ index: i, code: r.error?.code || "unknown" });
    }
  });
  return {
    success: true,
    sent: resp.successCount,
    failed: resp.failureCount,
    tokensConsidered: tokenObjs.length,
    tokensSent: chosenTokens.length,
    usedPwaOnly: pwaTokens.length > 0,
    errors,
  };
}

async function getUserPrefs(userId) {
  const doc = await db.collection("users").doc(userId).get();
  const data = doc.exists ? doc.data() : {};
  const prefs = data?.notificationPreferences || {
    friendRequests: true,
    locationRequests: true,
    starredPresence: true,
  };
  return { prefs, user: data };
}

// Check and mark starred presence notification in a single transaction (prevents race conditions)
async function tryMarkStarredPresenceSent(recipientId, actorId) {
  const today = getYyyyMmDd();
  // Store in separate doc per recipient per day to avoid field count limits
  const ref = db
    .collection("users")
    .doc(recipientId)
    .collection("meta")
    .doc(`presenceNotifications_${today}`);

  let alreadySent = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    // Check if already sent
    if (data[actorId]) {
      alreadySent = true;
      return; // Exit transaction without marking
    }

    // Mark as sent
    data[actorId] = Date.now();
    tx.set(ref, data, { merge: true });
  });

  return !alreadySent; // Return true if we successfully marked (= notification should send)
}

async function areFriends(userA, userB) {
  // Query friendships where users contains A, then check if also contains B
  const q = await db
    .collection("friendships")
    .where("users", "array-contains", userA)
    .get();
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
  return list.some((f) =>
    typeof f === "string" ? f === actorId : f?.friendId === actorId
  );
}

// -----------------------------
// Triggers
// -----------------------------

// 1) Friend Requests → notify recipient automatically
export const onFriendRequestCreated = onDocumentCreated(
  "friendRequests/{id}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const toUserId = data.toUserId;
    if (!toUserId) return;

    // Spam limit: sender daily friend requests (e.g. 40/day)
    if (data.fromUserId) {
      const ok = await incrementRate(data.fromUserId, "friendRequestsSent", 40);
      if (!ok) {
        logger.warn("Friend request rate limit exceeded", {
          user: data.fromUserId,
        });
        return; // silently drop push but still allow Firestore doc; alternative: delete doc
      }
    }

    const { prefs } = await getUserPrefs(toUserId);
    if (prefs.friendRequests === false) {
      logger.info("Recipient disabled friendRequests push", { toUserId });
      return;
    }

    const handle = data?.fromUserInfo?.handle
      ? `@${data.fromUserInfo.handle}`
      : "Someone";
    const notification = {
      title: "New Friend Request",
      body: `${handle} wants to be your friend`,
    };
    const payload = { link: "/#notifications", type: "friend_request" };
    const res = await sendToUser(toUserId, notification, payload);
    logger.info("Friend request push sent", res);
  }
);

// 2) Location share requests (existing notifications collection)
export const onNotificationCreated = onDocumentCreated(
  "notifications/{id}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    // Handle different notification types on create
    if (data.type === "location_share_request") {
      const toUserId = data.userId;
      if (!toUserId) return;

      // Spam limit: location share requests per sender (e.g. 60/day)
      if (data.fromUserId) {
        const ok = await incrementRate(
          data.fromUserId,
          "locationRequestsSent",
          60
        );
        if (!ok) {
          logger.warn("Location request rate limit exceeded", {
            user: data.fromUserId,
          });
          return;
        }
      }

      const { prefs } = await getUserPrefs(toUserId);
      if (prefs.locationRequests === false) {
        logger.info("Recipient disabled locationRequests push", { toUserId });
        return;
      }

      const handle = data?.fromUserInfo?.handle
        ? `@${data.fromUserInfo.handle}`
        : "A friend";
      const notification = {
        title: "Location Request",
        body: `${handle} requested to share location`,
      };
      const payload = { link: "/#notifications", type: "location_request" };
      const res = await sendToUser(toUserId, notification, payload);
      logger.info("Location request push sent", res);
      return;
    }

    if (data.type === "availability_ping") {
      // Initial push for availability ping so recipient sees device banner
      const toUserId = data.userId;
      if (!toUserId) return;
      const handle = data?.fromUserInfo?.handle
        ? `@${data.fromUserInfo.handle}`
        : "A friend";
      const notification = {
        title: "Are you free?",
        body: `${handle} wants to know if you're free`,
      };
      const payload = { link: "/#notifications", type: "availability_ping" };
      try {
        const res = await sendToUser(toUserId, notification, payload);
        logger.info("Availability ping push sent", res);
      } catch (e) {
        logger.warn("Failed to send availability ping push", {
          toUserId,
          err: String(e),
        });
      }
      return;
    }
  }
);

// 3) Starred presence alert when a user becomes ON CAMPUS
// ⚠️ LIMITATION: Firestore v2 onDocumentUpdated fires on ANY field change
// Cannot filter to only systemInfo.lastKnownLocation changes at trigger level
// We compensate with early exit checks to minimize processing
export const onUserPresenceUpdated = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // 🚀 EARLY EXIT: Check if campus status actually changed
    const beforeStatus = before?.systemInfo?.lastKnownLocation?.campusStatus || "unknown";
    const afterStatus = after?.systemInfo?.lastKnownLocation?.campusStatus || "unknown";

    // Skip if status didn't change (most common case for profile/friend updates)
    if (beforeStatus === afterStatus) return;

    // Only react to transitions to on_campus
    if (afterStatus !== "on_campus") return;

    const actorId = event.params.userId;

    // Find friends via friendships where users contains actorId
    const friendshipsSnap = await db
      .collection("friendships")
      .where("users", "array-contains", actorId)
      .get();
    if (friendshipsSnap.empty) return;

    // Cache actor handle for nicer text
    const actorDoc = await db.collection("users").doc(actorId).get();
    const actorHandle =
      actorDoc.exists && actorDoc.data()?.profile?.handle
        ? `@${actorDoc.data().profile.handle}`
        : "A friend";

    // 🚀 OPTIMIZATION: Collect friend IDs and batch fetch their user docs
    const friendIds = friendshipsSnap.docs
      .map((fr) => {
        const friendship = fr.data();
        return friendship.user1Id === actorId
          ? friendship.user2Id
          : friendship.user1Id;
      })
      .filter(Boolean);

    if (friendIds.length === 0) return;

    // Batch fetch friend user docs in chunks of 10 (Firestore getAll limit)
    const friendDataMap = {};
    for (let i = 0; i < friendIds.length; i += 10) {
      const chunk = friendIds.slice(i, i + 10);
      const friendDocs = await db.getAll(
        ...chunk.map((id) => db.collection("users").doc(id))
      );
      friendDocs.forEach((doc) => {
        if (doc.exists) friendDataMap[doc.id] = doc.data();
      });
    }

    // For each friend, check starred + privacy + prefs, then send (up to daily limit)
    const sendPromises = [];
    for (const fr of friendshipsSnap.docs) {
      const friendship = fr.data();
      const friendId =
        friendship.user1Id === actorId
          ? friendship.user2Id
          : friendship.user1Id;
      if (!friendId) continue;

      const recipientUser = friendDataMap[friendId];
      if (!recipientUser) continue;

      const prefs = recipientUser?.notificationPreferences || {
        friendRequests: true,
        locationRequests: true,
        starredPresence: true,
      };
      if (prefs.starredPresence === false) continue;

      // Must be starred by recipient
      if (!isStarredBy(recipientUser, actorId)) continue;

      // Check bilateral location visibility allows recipient to see actor
      const vis = friendship?.locationVisibility || {};
      const canSee = vis[actorId] === true || vis?.[actorId] === "true";
      if (!canSee) continue;

      // Rate limit: one notification per actor per recipient per day (atomic check-and-set)
      const shouldSend = await tryMarkStarredPresenceSent(friendId, actorId);
      if (!shouldSend) continue;

      const notification = {
        title: "On Campus",
        body: `${actorHandle} just arrived on campus`,
      };
      const data = { link: "/#notifications", type: "starred_presence" };
      sendPromises.push(
        sendToUser(friendId, notification, data).then((res) => {
          logger.info("Starred presence push result", { friendId, actorId, ...res });
        })
      );
    }
    await Promise.allSettled(sendPromises);
  }
);



// Availability ping: create response notification to sender and delete original
export const onAvailabilityPingResponded = onDocumentUpdated(
  "notifications/{id}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;
    if (after.type !== "availability_ping") return;

    const id = event.params?.id;
    const prevResp = before?.response || null;
    const newResp = after?.response || null;
    const statusChangedToResponded = before?.status !== "responded" && after?.status === "responded";
    const responseAdded = !prevResp && (newResp === "available" || newResp === "busy");
    if (!statusChangedToResponded && !responseAdded) return;

    const senderId = after.fromUserId; // original sender
    const respondentId = after.userId; // recipient who responded
    if (!senderId || !respondentId) return;

    // Build fromUserInfo for respondent
    let fromUserInfo = { handle: "friend", avatarConfig: null };
    try {
      const respDoc = await db.collection("users").doc(respondentId).get();
      if (respDoc.exists) {
        const ud = respDoc.data();
        fromUserInfo = {
          handle: ud?.profile?.handle || ud?.profile?.firstName || "friend",
          avatarConfig: ud?.avatarConfig || ud?.profile?.avatarConfig || null,
        };
      }
    } catch (e) {
      logger.warn("Failed to fetch respondent user info", { respondentId, err: String(e) });
    }

    // Create a response notification for the sender
    try {
      await db.collection("notifications").add({
        userId: senderId,
        fromUserId: respondentId,
        fromUserInfo,
        type: "availability_response",
        response: newResp || after.status || "available",
        availabilityResponse: { pingId: after?.availabilityPing?.pingId || "" },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        status: "pending",
      });
      // Also send a push to the sender's device (no in-app list item required)
      try {
        const title = "Availability Response";
        const who = fromUserInfo?.handle ? `@${fromUserInfo.handle}` : "A friend";
        const how = (newResp === "available") ? "Available" : "Busy";
        const body = `${who} responded: ${how}`;
        // Link to notify overlay; Router opens overlay without reloading
        const payload = { link: "/#notify", type: "availability_response" };
        await sendToUser(senderId, { title, body }, payload);
      } catch (pushErr) {
        logger.warn("Failed to send availability response push", { senderId, err: String(pushErr) });
      }
    } catch (e) {
      logger.error("Failed creating availability_response notification", { senderId, respondentId, err: String(e) });
    }

    // Do not delete the original availability_ping; keep until expiresAt so
    // sender cooldown remains enforced across devices/sessions.
  }
);

// Periodic cleanup: remove expired availability ping/response docs
export const cleanupExpiredAvailabilityPings = onSchedule("every 5 minutes", async () => {
  const now = new Date();
  try {
    const coll = db.collection("notifications");
    const types = ["availability_ping", "availability_response"];
    for (const t of types) {
      const snap = await coll.where("type", "==", t).where("expiresAt", "<", now).get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      logger.info("Cleaned up expired availability docs", { type: t, count: snap.size });
    }
  } catch (e) {
    logger.warn("Failed cleanupExpiredAvailabilityPings", { err: String(e) });
  }
});
// 4) Token write trigger for server-side dedupe (browser -> PWA upgrade)
export const onFcmTokenWrite = onDocumentWritten(
  "users/{userId}/fcmTokens/{tokenId}",
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return; // deleted handled separately
    if (after.isPWA !== true || !after.deviceKey) return; // only act on new PWA token
    const { userId, tokenId } = event.params;
    const snap = await db
      .collection("users")
      .doc(userId)
      .collection("fcmTokens")
      .get();
    const batch = db.batch();
    let removed = 0;
    snap.forEach((docSnap) => {
      if (docSnap.id === tokenId) return;
      const d = docSnap.data();
      if (d.deviceKey === after.deviceKey) {
        batch.delete(docSnap.ref);
        removed++;
      }
    });
    if (removed > 0) {
      await batch.commit();
      logger.info("Server token dedupe complete", { userId, removed });
    }
  }
);

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
    tokens.forEach((t) => {
      const d = t.data();
      const ts = d?.updatedAt?.toMillis?.() || d?.createdAt?.toMillis?.();
      if (ts && ts < cutoff) {
        batch.delete(t.ref);
        localDeleted++;
      }
    });
    if (localDeleted > 0) {
      await batch.commit();
      totalDeleted += localDeleted;
    }
  }
  logger.info("Stale token cleanup finished", { totalDeleted });
});

// 6) Daily stats aggregation
export const aggregateDailyStats = onSchedule("every day 00:10", async () => {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const dayKey = getTodayKey();
  const usersSnap = await db.collection("users").get();
  let active24h = 0,
    new24h = 0,
    pwaInstalls = 0;
  for (const u of usersSnap.docs) {
    const d = u.data();
    const lastActive = d?.systemInfo?.lastActive?.toMillis?.();
    if (lastActive && lastActive > since) active24h++;
    const createdAt = d?.systemInfo?.createdAt?.toMillis?.();
    if (createdAt && createdAt > since) new24h++;
    // quick check for at least one PWA token
    const pwaSnap = await u.ref
      .collection("fcmTokens")
      .where("isPWA", "==", true)
      .limit(1)
      .get()
      .catch(() => null);
    if (pwaSnap && !pwaSnap.empty) pwaInstalls++;
  }
  const friendshipCount = (
    await db.collection("friendships").count().get()
  ).data().count;
  await db.collection("systemStats").doc(dayKey).set(
    {
      date: dayKey,
      activeUsers24h: active24h,
      newUsers24h: new24h,
      totalUsers: usersSnap.size,
      totalFriendships: friendshipCount,
      pwaInstalls,
      generatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  logger.info("Daily stats aggregated", { dayKey, active24h, pwaInstalls });
});

// 7) Cascade cleanup when a user document is deleted
export const onUserDeleted = onDocumentDeleted(
  "users/{userId}",
  async (event) => {
    const { userId } = event.params;
    // Delete fcmTokens, meta, other lightweight subcollections
    const subs = ["fcmTokens", "meta"];
    let total = 0;
    for (const s of subs) {
      total += await deleteUserSubcollection(userId, s);
    }
    const friendshipsRemoved = await deleteUserFriendships(userId);
    logger.info("Cascade user cleanup", {
      userId,
      subDocsDeleted: total,
      friendshipsRemoved,
    });
  }
);

// 8) Debug: send a test push to the authenticated user (or provided target)
// Debug test endpoints removed for production
