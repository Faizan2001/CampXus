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

// Derive a stable WebPush tag per notification type to control stacking/collapsing behavior.
function computeWebpushTag(data = {}) {
  try {
    const type = String(data?.type || "general");
    const today = getYyyyMmDd();
    // Prefer explicit IDs if provided in payload
    const fromUserId = data?.fromUserId || data?.senderId || "";
    const actorId = data?.actorId || data?.fromUserId || "";
    const pingId = data?.pingId || data?.availabilityResponse?.pingId || data?.availabilityPing?.pingId || "";

    switch (type) {
      case "friend_request":
        return `friend-request-${fromUserId || Date.now()}`;
      case "location_request":
        return `location-request-${fromUserId || Date.now()}`;
      case "starred_presence":
        // Collapse repeated presence from same actor within a day; allow stacking across different actors
        return `presence-${actorId || today}-${today}`;
      case "availability_response":
        return `availability-response-${pingId || Date.now()}`;
      case "availability_ping":
        return `availability-ping-${pingId || fromUserId || Date.now()}`;
      default:
        return `meetchuthere-${type}-${today}`;
    }
  } catch (_) {
    return `meetchuthere-notification-${Date.now()}`;
  }
}

// Compute TTL (in seconds) based on type. WebPush respects the `TTL` header.
function computeWebpushTTLSeconds(data = {}) {
  const type = String(data?.type || "general");
  switch (type) {
    case "friend_request":
      return 24 * 60 * 60; // 24h
    case "location_request":
      return 6 * 60 * 60; // 6h
    case "starred_presence":
      return 6 * 60 * 60; // 6h
    case "availability_response":
      return 24 * 60 * 60; // 24h
    default:
      return 24 * 60 * 60; // sensible default
  }
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

  // Enrich data with a server-provided tag so the SW can mirror it for data-only deliveries
  const tag = computeWebpushTag(data);
  const ttlSeconds = computeWebpushTTLSeconds(data);
  const enrichedData = { ...data, notificationTag: tag };

  const baseMessage = {
    notification: safeNotification,
    data: enrichedData,
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
      headers: { Urgency: "high", TTL: String(ttlSeconds) },
      notification: {
        icon: "https://meetchuthere.com/icons/icon-192x192.png",
        badge: "https://meetchuthere.com/icons/notification-badge-96x96.png", // White silhouette for Android status bar
        requireInteraction: false, // true ignored on Android; false better for desktop UX
        renotify: true, // Vibrate/sound on repeat notifications
        vibrate: [200, 100, 200],
        tag, // Per-type/per-entity tag controls stacking behavior
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

  // First attempt: chosenTokens (PWA-only if available)
  let message = { ...baseMessage, tokens: chosenTokens };
  let resp = await messaging.sendEachForMulticast(message);
  await removeInvalidTokens(userId, chosenTokens, resp);
  const errors = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      errors.push({ index: i, code: r.error?.code || "unknown" });
    }
  });

  // Fallback: if we attempted PWA-only and reached zero devices, retry with non-PWA tokens once
  let retriedToNonPwa = false;
  if (pwaTokens.length > 0 && resp.successCount === 0) {
    const nonPwa = tokenObjs.filter((t) => !t.isPWA).map((t) => t.id);
    if (nonPwa.length > 0) {
      retriedToNonPwa = true;
      try {
        const retryMessage = { ...baseMessage, tokens: nonPwa };
        const retryResp = await messaging.sendEachForMulticast(retryMessage);
        await removeInvalidTokens(userId, nonPwa, retryResp);
        retryResp.responses.forEach((r, i) => {
          if (!r.success) {
            errors.push({ index: `retry-${i}`, code: r.error?.code || "unknown" });
          }
        });
        // Merge counts
        resp = {
          ...resp,
          successCount: resp.successCount + retryResp.successCount,
          failureCount: resp.failureCount + retryResp.failureCount,
        };
      } catch (e) {
        // swallow; original resp stands
      }
    }
  }
  return {
    success: true,
    sent: resp.successCount,
    failed: resp.failureCount,
    tokensConsidered: tokenObjs.length,
    tokensSent: chosenTokens.length,
    usedPwaOnly: pwaTokens.length > 0,
    retriedToNonPwa,
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
    const payload = {
      link: "/#notifications",
      type: "friend_request",
      fromUserId: data.fromUserId || "",
    };
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
      const payload = {
        link: "/#notifications",
        type: "location_request",
        fromUserId: data.fromUserId || "",
      };
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
      const payload = {
        link: "/#notifications",
        type: "availability_ping",
        pingId: data?.availabilityPing?.pingId || data?.availabilityPing?.id || "",
        fromUserId: data.fromUserId || "",
      };
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
      const data = {
        link: "/#notifications",
        type: "starred_presence",
        actorId,
      };
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
        // Response notification expires after 5 minutes (backend cleanup)
        // Sender's UI shows response for 10 minutes (local linger)
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        status: "pending",
      });
      // Also send a push to the sender's device (no in-app list item required)
      try {
        const title = "Availability Response";
        const who = fromUserInfo?.handle ? `@${fromUserInfo.handle}` : "A friend";
        const how = (newResp === "available") ? "Available" : "Busy";
        const body = `${who} responded: ${how}`;
        // Link to notify overlay; Router opens overlay without reloading
        const payload = {
          link: "/#notify",
          type: "availability_response",
          pingId: after?.availabilityPing?.pingId || "",
        };
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

// -----------------------------------------------------------------------------
// Class Spaces — Scheduler, Messaging, Trimming (stubs/minimal v1)
// -----------------------------------------------------------------------------

function buildSpaceIdFromCourse(university, course) {
  try {
    if (!university) return "";
    const uni = String(university).toLowerCase().trim();
    const sectionKey = String(course.section || 0).padStart(2, "0");
    if (!course.dayPattern || !course.timeSlot || !course.classroom || sectionKey === "00") return "";
    const useCode = !course.courseName || course.courseName.endsWith("...") || (course.courseName.split(/\s+/).length < 3);
    const nameSlug = useCode && course.courseCode
      ? String(course.courseCode).toLowerCase()
      : String(course.courseName || "").replace(/\s+/g, "-").toLowerCase();
    const day = String(course.dayPattern).toUpperCase();
    const slot = String(course.timeSlot);
    const room = String(course.classroom).toUpperCase();
    // Exclude ambiguous rooms
    if (/^(ONLINE|TBA|NA|NONE)$/i.test(room)) return "";
    return `${uni}__${nameSlug}__sec${sectionKey}__${day}__${slot}__${room}`;
  } catch (_) {
    return "";
  }
}

async function fetchMemberInfo(uid) {
  try {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return {
      handle: d?.profile?.handle || "",
      firstName: d?.profile?.firstName || "",
      lastName: d?.profile?.lastName || "",
      major: d?.profile?.major || "",
      avatarConfig: d?.avatarConfig || null,
      profilePhotoUrl: d?.profile?.profilePhotoUrl || null,
    };
  } catch (_) {
    return null;
  }
}

export const scheduleDailyClassSpaces = onSchedule({ schedule: "every day 06:00", timeZone: "Asia/Dhaka" }, async () => {
  // Build buckets by canonical key using users.courses[]
  const usersSnap = await db.collection("users").get();
  const buckets = new Map(); // key -> Set<uid>
  const index = new Map(); // key -> sample course for metadata
  for (const docSnap of usersSnap.docs) {
    const d = docSnap.data() || {};
    const uni = d?.universityInfo?.university || "";
    const arr = Array.isArray(d?.courses) ? d.courses : [];
    if (!uni || arr.length === 0) continue;
    for (const c of arr) {
      const id = buildSpaceIdFromCourse(uni, c);
      if (!id) continue;
      if (!buckets.has(id)) buckets.set(id, new Set());
      buckets.get(id).add(docSnap.id);
      if (!index.has(id)) index.set(id, { university: uni, course: c });
    }
  }

  // Upsert spaces for buckets with ≥4 members
  for (const [spaceId, set] of buckets) {
    const members = Array.from(set);
    const { university, course } = index.get(spaceId) || {};
    const ref = db.collection("classSpaces").doc(spaceId);
    if (members.length >= 4) {
      // Prepare memberInfo cache (top N to keep doc reasonable; can expand later)
      const memberInfo = {};
      const preview = members.slice(0, 20); // limit info cache; roster UI can lazy fetch
      await Promise.all(
        preview.map(async (uid) => {
          const info = await fetchMemberInfo(uid);
          if (info) memberInfo[uid] = info;
        })
      );

      const payload = {
        spaceId,
        university,
        courseName: course?.courseName || null,
        courseCode: course?.courseCode || null,
        section: course?.section || null,
        dayPattern: course?.dayPattern || null,
        timeSlot: course?.timeSlot || null,
        timeStart: course?.timeStart || null,
        timeEnd: course?.timeEnd || null,
        classroom: course?.classroom || null,
        memberIds: members,
        memberCount: members.length,
        memberInfo,
        active: true,
        lastMemberUpdate: new Date(),
        updatedAt: new Date(),
        createdAt: new Date(),
        visibility: "university",
      };
      await ref.set(payload, { merge: true });
    } else {
      // If space exists, mark inactive but keep history
      const snap = await ref.get();
      if (snap.exists) {
        await ref.set({ active: false, updatedAt: new Date() }, { merge: true });
      }
    }
  }
  logger.info("scheduleDailyClassSpaces completed", { buckets: buckets.size });
});

// Rate-limited message sending via callable (membership checked in CF)
export const sendGroupMessage = https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new https.HttpsError("unauthenticated", "Must be signed in");
  }
  const uid = context.auth.uid;
  const spaceId = String(data?.spaceId || "").trim();
  const content = String(data?.content || "").trim();
  if (!spaceId || !content) {
    throw new https.HttpsError("invalid-argument", "spaceId and content required");
  }
  if (content.length > 500) {
    throw new https.HttpsError("invalid-argument", "Message too long");
  }

  // Rate limit: 1 message per 3 seconds per user per space
  const rateKey = `msg_${spaceId}`;
  const ok = await incrementRate(uid, rateKey, 1000000); // daily cap very high
  // Enforce a short-term throttle using a per-space user doc
  const throttleRef = db.collection("rateLimits").doc(`${spaceId}_${uid}`);
  const now = Date.now();
  const throttleSnap = await throttleRef.get();
  const lastAt = throttleSnap.exists ? throttleSnap.data()?.lastAt || 0 : 0;
  if (now - lastAt < 3000) {
    throw new https.HttpsError("resource-exhausted", "Slow down");
  }
  await throttleRef.set({ lastAt: now }, { merge: true });

  // Membership check
  const spaceDoc = await db.collection("classSpaces").doc(spaceId).get();
  if (!spaceDoc.exists) throw new https.HttpsError("not-found", "Space not found");
  const space = spaceDoc.data() || {};
  const isMember = Array.isArray(space.memberIds) && space.memberIds.includes(uid);
  if (!isMember) throw new https.HttpsError("permission-denied", "Not a member");

  // Write message
  const msgRef = db.collection("classSpaces").doc(spaceId).collection("messages").doc();
  const senderInfo = await fetchMemberInfo(uid);
  await msgRef.set({
    messageId: msgRef.id,
    senderId: uid,
    senderInfo: senderInfo || { handle: "", firstName: "" },
    content,
    createdAt: new Date(),
    edited: false,
    editedAt: null,
    deleted: false,
  });
  await spaceDoc.ref.set(
    {
      lastActivity: new Date(),
      lastMessagePreview: { content: content.slice(0, 140), senderId: uid, createdAt: new Date() },
    },
    { merge: true }
  );
  return { success: true, messageId: msgRef.id };
});

// Nightly trim to 2,000 latest messages per space
export const trimSpaceMessages = onSchedule({ schedule: "every day 03:00", timeZone: "Asia/Dhaka" }, async () => {
  const spaces = await db.collection("classSpaces").where("active", "==", true).get();
  for (const s of spaces.docs) {
    const ref = s.ref.collection("messages");
    const snap = await ref.orderBy("createdAt", "desc").offset(2000).limit(500).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  logger.info("trimSpaceMessages completed");
});
