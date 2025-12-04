import { initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { https } from "firebase-functions"; // for v1 callable functions
import * as logger from "firebase-functions/logger";

// Initialize Admin SDK once
initAdminApp();
const db = getFirestore();
const messaging = getMessaging();

// -----------------------------
// Security: Input Validation Helpers
// -----------------------------
// SECURITY: Validate document IDs to prevent injection attacks
const VALID_DOC_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validates a Firestore document ID format
 * @param {string} id - The document ID to validate
 * @param {string} fieldName - Name of the field for error messages
 * @throws {HttpsError} If the ID is invalid
 */
function validateDocumentId(id, fieldName = "id") {
  if (!id || typeof id !== "string") {
    throw new https.HttpsError(
      "invalid-argument",
      `${fieldName} is required and must be a string`
    );
  }
  if (!VALID_DOC_ID_PATTERN.test(id)) {
    throw new https.HttpsError(
      "invalid-argument",
      `${fieldName} contains invalid characters. Only alphanumeric, underscore, and hyphen are allowed.`
    );
  }
}

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

/**
 * SECURITY: Rate limit helper for admin/moderator actions
 * Prevents abuse even from privileged accounts
 * @param {string} userId - The user performing the action
 * @param {string} actionKey - Unique key for this action type
 * @param {number} limitPerDay - Maximum actions per day (default: 100)
 */
async function enforceAdminRateLimit(userId, actionKey, limitPerDay = 100) {
  const allowed = await incrementRate(userId, `admin_${actionKey}`, limitPerDay);
  if (!allowed) {
    throw new https.HttpsError(
      "resource-exhausted",
      `Rate limit exceeded for ${actionKey}. Please try again tomorrow.`
    );
  }
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
          db
            .collection("users")
            .doc(userId)
            .collection("fcmTokens")
            .doc(tokenId)
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
    const pingId =
      data?.pingId ||
      data?.availabilityResponse?.pingId ||
      data?.availabilityPing?.pingId ||
      "";

    switch (type) {
      case "friend_request":
        return `friend-request-${fromUserId || Date.now()}`;
      case "location_request":
        return `location-request-${fromUserId || Date.now()}`;
      case "starred_presence":
        // Collapse repeated presence from same actor within a day; allow stacking across different actors
        return `presence-${actorId || today}-${today}`;
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
          {
            action: "open",
            title: "View",
            icon: "https://meetchuthere.com/icons/icon-72x72.png",
          },
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
            errors.push({
              index: `retry-${i}`,
              code: r.error?.code || "unknown",
            });
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

// -----------------------------
// Admin helpers
// -----------------------------

async function assertSuperAdmin(context) {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
  // SECURITY: Additional check to ensure we're truly in a development environment
  const isLocalhost = process.env.GCLOUD_PROJECT === "demo-project" || 
                      process.env.FIREBASE_CONFIG?.includes("localhost");

  if (!context.auth) {
    // In emulator, be lenient so local admin tools work even if the
    // client fails to attach an ID token correctly. In production we
    // still require a valid authenticated context.
    // SECURITY FIX: Require BOTH emulator flag AND localhost check
    if (isEmulator && isLocalhost) {
      logger.warn(
        "assertSuperAdmin: missing auth in emulator (localhost verified), allowing call for local development"
      );
      return { uid: "emulator-dev", config: {} };
    }

    throw new https.HttpsError("unauthenticated", "Must be logged in");
  }

  const snap = await db.doc("admin/superAdmins").get();
  const data = snap.exists ? snap.data() || {} : {};
  const uids = Array.isArray(data.uids) ? data.uids : [];

  if (!uids.includes(context.auth.uid)) {
    throw new https.HttpsError("permission-denied", "Not authorized");
  }

  return { uid: context.auth.uid, config: data };
}

async function assertSafModerator(context) {
  if (!context.auth) {
    throw new https.HttpsError("unauthenticated", "Must be logged in");
  }

  const uid = context.auth.uid;
  const snap = await db.collection("safModerators").doc(uid).get();
  if (!snap.exists) {
    throw new https.HttpsError("permission-denied", "Not a SAF moderator");
  }

  return { uid, moderator: snap.data() || {} };
}

async function getSuperAdminUids() {
  const snap = await db.doc("admin/superAdmins").get();
  const data = snap.exists ? snap.data() || {} : {};
  return Array.isArray(data.uids) ? data.uids : [];
}

async function assertClubRoleManager(uid, club) {
  if (!uid) {
    throw new https.HttpsError("unauthenticated", "Must be logged in");
  }

  const superAdmins = await getSuperAdminUids();
  if (superAdmins.includes(uid)) {
    return { role: "superAdmin" };
  }

  const isDevOwner = club?.devTest === true && club?.devOwnerUid === uid;
  const isPresident =
    club?.presidentId === uid || club?.createdBy === uid || isDevOwner;

  if (isPresident) {
    return { role: "president" };
  }

  const safSnap = await db.collection("safModerators").doc(uid).get();
  if (safSnap.exists) {
    const moderator = safSnap.data() || {};
    const moderatorUniversityId = moderator.universityId || null;
    if (
      moderatorUniversityId &&
      club?.universityId &&
      moderatorUniversityId === club.universityId
    ) {
      return { role: "saf" };
    }
  }

  throw new https.HttpsError(
    "permission-denied",
    "Not authorized to manage club roles"
  );
}

async function setUserClubRole(userId, clubId, club, role, title) {
  const userRef = db.collection("users").doc(userId);
  const payload = {
    role,
    title: title || (role === "president" ? "President" : "Official"),
    clubId,
    clubName: club?.name || null,
    universityId: club?.universityId || null,
    universityCode: club?.universityCode || club?.university || null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await userRef.set(
    {
      clubRoles: {
        [clubId]: payload,
      },
    },
    { merge: true }
  );
}

async function clearUserClubRole(userId, clubId) {
  const userRef = db.collection("users").doc(userId);
  await userRef.set(
    {
      clubRoles: {
        [clubId]: FieldValue.delete(),
      },
    },
    { merge: true }
  );
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

// SAF moderator management via callable functions
export const addSafModerator = https.onCall(async (data, context) => {
  const { uid: callerUid } = await assertSuperAdmin(context);
  
  // SECURITY: Rate limit admin actions
  await enforceAdminRateLimit(callerUid, "addSafModerator", 50);
  
  const { uid, displayName, universityId } = data || {};

  // SECURITY: Validate document ID format to prevent injection
  validateDocumentId(uid, "uid");
  if (universityId) {
    validateDocumentId(universityId, "universityId");
  }

  const safRef = db.collection("safModerators").doc(uid);
  await safRef.set(
    {
      uid,
      displayName: displayName || null,
      universityId: universityId || null,
      addedAt: FieldValue.serverTimestamp(),
      addedBy: callerUid,
    },
    { merge: true }
  );

  if (universityId) {
    const uniRef = db.collection("universities").doc(universityId);
    const uniSnap = await uniRef.get();
    if (uniSnap.exists) {
      await uniRef.update({
        safCount: (uniSnap.data().safCount || 0) + 1,
      });
    }
  }

  logger.info("addSafModerator completed", {
    moderatorUid: uid,
    universityId,
    callerUid,
  });

  return { success: true };
});

// Promote a member to official and sync user.clubRoles
export const promoteClubOfficial = https.onCall(async (data, context) => {
  const callerUid = context.auth?.uid;
  if (!callerUid) {
    throw new https.HttpsError("unauthenticated", "Must be logged in");
  }

  // SECURITY: Rate limit club management actions
  await enforceAdminRateLimit(callerUid, "clubMemberManagement", 200);

  const clubId = String(data?.clubId || "").trim();
  const userId = String(data?.userId || "").trim();
  const roleTitle = typeof data?.roleTitle === "string" ? data.roleTitle : null;

  // SECURITY: Validate document ID format to prevent injection
  validateDocumentId(clubId, "clubId");
  validateDocumentId(userId, "userId");

  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new https.HttpsError("not-found", "Club not found");
  }
  const club = { id: clubSnap.id, ...clubSnap.data() };

  // Fetch user profile for denormalized member entry
  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) {
    throw new https.HttpsError("not-found", "User not found");
  }
  const userData = userSnap.data() || {};

  await assertClubRoleManager(callerUid, club);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(clubRef);
    if (!snap.exists) {
      throw new https.HttpsError("not-found", "Club not found");
    }
    const current = snap.data() || {};
    const members = Array.isArray(current.members) ? [...current.members] : [];

    const memberEntry = {
      uid: userId,
      role: "official",
      name:
        userData.profile?.displayName ||
        [userData.profile?.firstName, userData.profile?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        null,
      displayName:
        userData.profile?.displayName ||
        [userData.profile?.firstName, userData.profile?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        null,
      photoUrl:
        userData.profile?.profilePhotoUrl || userData.profile?.photoUrl || null,
      avatarConfig: userData.avatarConfig || null,
      joinedAt: FieldValue.serverTimestamp(),
    };

    let found = false;
    const updatedMembers = members.map((m) => {
      if (m.uid === userId) {
        found = true;
        return { ...memberEntry, ...m, role: "official" };
      }
      return m;
    });
    if (!found) {
      updatedMembers.push(memberEntry);
    }

    const uniqueOfficialIds = new Set(
      Array.isArray(current.officialIds) ? current.officialIds : []
    );
    uniqueOfficialIds.add(userId);

    // D6: memberCount = president + officials only
    const hasPresident = !!current.presidentId;
    const newMemberCount = uniqueOfficialIds.size + (hasPresident ? 1 : 0);

    tx.update(clubRef, {
      members: updatedMembers,
      officialIds: Array.from(uniqueOfficialIds),
      memberCount: newMemberCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await setUserClubRole(userId, clubId, club, "official", roleTitle);

  logger.info("promoteClubOfficial: success", {
    clubId,
    userId,
    callerUid,
  });

  return { success: true };
});

// Demote an official back to member and clear user.clubRoles entry
export const demoteClubOfficial = https.onCall(async (data, context) => {
  const callerUid = context.auth?.uid;
  if (!callerUid) {
    throw new https.HttpsError("unauthenticated", "Must be logged in");
  }

  // SECURITY: Rate limit club management actions
  await enforceAdminRateLimit(callerUid, "clubMemberManagement", 200);

  const clubId = String(data?.clubId || "").trim();
  const userId = String(data?.userId || "").trim();

  // SECURITY: Validate document ID format to prevent injection
  validateDocumentId(clubId, "clubId");
  validateDocumentId(userId, "userId");

  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new https.HttpsError("not-found", "Club not found");
  }
  const club = { id: clubSnap.id, ...clubSnap.data() };

  await assertClubRoleManager(callerUid, club);

  if (club.presidentId === userId) {
    throw new https.HttpsError(
      "failed-precondition",
      "Use assignClubPresident to change the president"
    );
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(clubRef);
    if (!snap.exists) {
      throw new https.HttpsError("not-found", "Club not found");
    }
    const current = snap.data() || {};
    const members = Array.isArray(current.members) ? [...current.members] : [];

    const updatedMembers = members.map((m) => {
      if (m.uid === userId) {
        const { role, ...rest } = m;
        return { ...rest, role: "member" };
      }
      return m;
    });

    const updatedOfficialIds = (
      Array.isArray(current.officialIds) ? current.officialIds : []
    ).filter((id) => id !== userId);

    // R3: Demoted official becomes regular member, not removed
    // memberCount = president + officials only (D6)
    const officialCount = updatedOfficialIds.length;
    const hasPresident = !!current.presidentId;
    const newMemberCount = officialCount + (hasPresident ? 1 : 0);

    tx.update(clubRef, {
      members: updatedMembers,
      officialIds: updatedOfficialIds,
      memberCount: newMemberCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await clearUserClubRole(userId, clubId);

  logger.info("demoteClubOfficial: success", {
    clubId,
    userId,
    callerUid,
  });

  return { success: true };
});

// Assign a new president and keep clubRoles in sync for old/new presidents
export const assignClubPresident = https.onCall(async (data, context) => {
  const callerUid = context.auth?.uid;
  if (!callerUid) {
    throw new https.HttpsError("unauthenticated", "Must be logged in");
  }

  // SECURITY: Rate limit club management actions
  await enforceAdminRateLimit(callerUid, "clubMemberManagement", 200);

  const clubId = String(data?.clubId || "").trim();
  const userId = String(data?.userId || "").trim();

  // SECURITY: Validate document ID format to prevent injection
  validateDocumentId(clubId, "clubId");
  validateDocumentId(userId, "userId");

  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new https.HttpsError("not-found", "Club not found");
  }
  const club = { id: clubSnap.id, ...clubSnap.data() };

  await assertClubRoleManager(callerUid, club);

  const userSnap = await db.collection("users").doc(userId).get();
  if (!userSnap.exists) {
    throw new https.HttpsError("not-found", "User not found");
  }
  const userData = userSnap.data() || {};

  const memberEntry = {
    uid: userId,
    role: "president",
    name:
      userData.profile?.displayName ||
      [userData.profile?.firstName, userData.profile?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      null,
    displayName:
      userData.profile?.displayName ||
      [userData.profile?.firstName, userData.profile?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      null,
    photoUrl:
      userData.profile?.profilePhotoUrl || userData.profile?.photoUrl || null,
    avatarConfig: userData.avatarConfig || null,
    joinedAt: FieldValue.serverTimestamp(),
  };

  const previousPresidentId = club.presidentId || null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(clubRef);
    if (!snap.exists) {
      throw new https.HttpsError("not-found", "Club not found");
    }
    const current = snap.data() || {};
    const members = Array.isArray(current.members) ? [...current.members] : [];

    // R3: Old president is completely removed from club (no connection)
    // Filter out the old president entirely, don't just demote to member
    let updatedMembers = members.filter((m) => m.uid !== previousPresidentId);

    // Update or add new president
    updatedMembers = updatedMembers.map((m) => {
      if (m.uid === userId) {
        return { ...memberEntry, ...m, role: "president" };
      }
      return m;
    });

    if (!updatedMembers.some((m) => m.uid === userId)) {
      updatedMembers.push(memberEntry);
    }

    // Remove new president from officialIds (can't be both)
    // Also remove old president from officialIds if they were there
    const updatedOfficialIds = (
      Array.isArray(current.officialIds) ? current.officialIds : []
    ).filter((id) => id !== userId && id !== previousPresidentId);

    // D6: memberCount = president + officials only
    const newMemberCount = updatedOfficialIds.length + 1; // +1 for president

    tx.update(clubRef, {
      presidentId: userId,
      members: updatedMembers,
      officialIds: updatedOfficialIds,
      memberCount: newMemberCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  // Ensure denormalized member info is present (in case legacy members lacked it)
  try {
    const latest = await clubRef.get();
    const data = latest.exists ? latest.data() || {} : {};
    const members = Array.isArray(data.members) ? [...data.members] : [];
    let changed = false;
    const enrichedMembers = members.map((m) => {
      if (m.uid !== userId) return m;
      changed = true;
      return {
        ...m,
        ...memberEntry,
        role: "president",
      };
    });
    if (!enrichedMembers.some((m) => m.uid === userId)) {
      enrichedMembers.push(memberEntry);
      changed = true;
    }
    if (changed) {
      // D6: memberCount = president + officials only
      const officialIds = Array.isArray(data.officialIds)
        ? data.officialIds
        : [];
      const newMemberCount = officialIds.length + 1;
      await clubRef.update({
        members: enrichedMembers,
        memberCount: newMemberCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    logger.warn("assignClubPresident: denorm update skipped", {
      error: String(e),
      clubId,
      userId,
    });
  }

  await setUserClubRole(userId, clubId, club, "president", "President");
  if (previousPresidentId && previousPresidentId !== userId) {
    await clearUserClubRole(previousPresidentId, clubId);
  }

  logger.info("assignClubPresident: success", {
    clubId,
    userId,
    callerUid,
    previousPresidentId,
  });

  return { success: true };
});

// Remove a member from the club (kick) and clear user.clubRoles
export const removeClubMember = https.onCall(async (data, context) => {
  const callerUid = context.auth?.uid;
  if (!callerUid) {
    throw new https.HttpsError("unauthenticated", "Must be logged in");
  }

  // SECURITY: Rate limit club management actions
  await enforceAdminRateLimit(callerUid, "clubMemberManagement", 200);

  const clubId = String(data?.clubId || "").trim();
  const userId = String(data?.userId || "").trim();

  // SECURITY: Validate document ID format to prevent injection
  validateDocumentId(clubId, "clubId");
  validateDocumentId(userId, "userId");

  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new https.HttpsError("not-found", "Club not found");
  }
  const club = { id: clubSnap.id, ...clubSnap.data() };

  await assertClubRoleManager(callerUid, club);

  // Do not allow kicking the sitting president
  if (club.presidentId === userId) {
    throw new https.HttpsError(
      "failed-precondition",
      "Cannot remove the current president; transfer presidency first"
    );
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(clubRef);
    if (!snap.exists) {
      throw new https.HttpsError("not-found", "Club not found");
    }
    const current = snap.data() || {};
    const members = Array.isArray(current.members) ? current.members : [];
    const updatedMembers = members.filter((m) => m.uid !== userId);
    const updatedOfficialIds = (
      Array.isArray(current.officialIds) ? current.officialIds : []
    ).filter((id) => id !== userId);

    // D6: memberCount = president + officials only
    const hasPresident = !!current.presidentId;
    const newMemberCount = updatedOfficialIds.length + (hasPresident ? 1 : 0);

    tx.update(clubRef, {
      members: updatedMembers,
      officialIds: updatedOfficialIds,
      memberCount: newMemberCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await clearUserClubRole(userId, clubId);

  logger.info("removeClubMember: success", {
    clubId,
    userId,
    callerUid,
  });

  return { success: true };
});

// SAF event approval: pending_saf -> approved for clubs in moderator's university
export const approveClubEventSaf = https.onCall(async (data, context) => {
  const { uid: moderatorUid, moderator } = await assertSafModerator(context);

  // SECURITY: Rate limit SAF moderation actions
  await enforceAdminRateLimit(moderatorUid, "safEventModeration", 100);

  const clubId = String(data?.clubId || "").trim();
  const eventId = String(data?.eventId || "").trim();

  // SECURITY: Validate document ID format to prevent injection
  validateDocumentId(clubId, "clubId");
  validateDocumentId(eventId, "eventId");

  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new https.HttpsError("not-found", "Club not found");
  }

  const club = clubSnap.data() || {};
  const moderatorUniversityId = moderator.universityId || null;
  // Clubs use 'university' field (e.g., 'iub'), not 'universityId'
  const clubUniversityId =
    club.universityId || club.universityCode || club.university || null;

  // Enforce university scope for SAF moderators (must be present and matching)
  if (!moderatorUniversityId) {
    throw new https.HttpsError(
      "permission-denied",
      "SAF moderator is not scoped to a university"
    );
  }
  if (!clubUniversityId) {
    throw new https.HttpsError(
      "permission-denied",
      "Club is not scoped to a university"
    );
  }
  if (moderatorUniversityId !== clubUniversityId) {
    throw new https.HttpsError(
      "permission-denied",
      "Cannot moderate clubs outside your university"
    );
  }

  const eventRef = clubRef.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    throw new https.HttpsError("not-found", "Event not found");
  }

  const event = eventSnap.data() || {};
  if (event.status !== "pending_saf") {
    throw new https.HttpsError(
      "failed-precondition",
      "Only events with status 'pending_saf' can be SAF-approved"
    );
  }

  await eventRef.update({
    status: "approved",
    safApprovedBy: moderatorUid,
    safApprovedAt: FieldValue.serverTimestamp(),
  });

  logger.info("approveClubEventSaf: SAF approved event", {
    clubId,
    eventId,
    moderatorUid,
  });

  return { success: true };
});

// SAF event rejection: pending_saf -> rejected with reason
export const rejectClubEventSaf = https.onCall(async (data, context) => {
  const { uid: moderatorUid, moderator } = await assertSafModerator(context);

  // SECURITY: Rate limit SAF moderation actions
  await enforceAdminRateLimit(moderatorUid, "safEventModeration", 100);

  const clubId = String(data?.clubId || "").trim();
  const eventId = String(data?.eventId || "").trim();
  const reason = String(data?.reason || "").trim();

  // SECURITY: Validate document ID format to prevent injection
  validateDocumentId(clubId, "clubId");
  validateDocumentId(eventId, "eventId");

  if (!reason) {
    throw new https.HttpsError(
      "invalid-argument",
      "Parameter 'reason' is required for rejection"
    );
  }

  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new https.HttpsError("not-found", "Club not found");
  }

  const club = clubSnap.data() || {};
  const moderatorUniversityId = moderator.universityId || null;
  const clubUniversityId =
    club.universityId || club.universityCode || club.university || null;

  // Enforce university scope
  if (!moderatorUniversityId) {
    throw new https.HttpsError(
      "permission-denied",
      "SAF moderator is not scoped to a university"
    );
  }
  if (!clubUniversityId) {
    throw new https.HttpsError(
      "permission-denied",
      "Club is not scoped to a university"
    );
  }
  if (moderatorUniversityId !== clubUniversityId) {
    throw new https.HttpsError(
      "permission-denied",
      "Cannot moderate clubs outside your university"
    );
  }

  const eventRef = clubRef.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    throw new https.HttpsError("not-found", "Event not found");
  }

  const event = eventSnap.data() || {};
  if (event.status !== "pending_saf") {
    throw new https.HttpsError(
      "failed-precondition",
      "Only events with status 'pending_saf' can be SAF-rejected"
    );
  }

  // Get moderator info for rejectedByInfo
  const modUserSnap = await db.collection("users").doc(moderatorUid).get();
  const modUserData = modUserSnap.exists ? modUserSnap.data() : {};
  // User profile data is nested under .profile (consistent with rest of codebase)
  const profile = modUserData.profile || modUserData;
  const rejectedByInfo = {
    firstName: profile.firstName || null,
    lastName: profile.lastName || null,
    displayName:
      profile.displayName ||
      [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
      null,
    name:
      profile.displayName ||
      [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
      null,
  };

  await eventRef.update({
    status: "rejected",
    rejectedBy: moderatorUid,
    rejectedAt: FieldValue.serverTimestamp(),
    rejectedByInfo,
    rejectionReason: reason,
    safRejected: true, // Flag to indicate SAF rejection (not president rejection)
  });

  logger.info("rejectClubEventSaf: SAF rejected event", {
    clubId,
    eventId,
    moderatorUid,
    reason,
  });

  return { success: true };
});

export const removeSafModerator = https.onCall(async (data, context) => {
  const { uid: callerUid } = await assertSuperAdmin(context);
  
  // SECURITY: Rate limit admin actions
  await enforceAdminRateLimit(callerUid, "removeSafModerator", 50);
  
  const { uid } = data || {};

  // SECURITY: Validate document ID format to prevent injection
  validateDocumentId(uid, "uid");

  const modRef = db.collection("safModerators").doc(uid);
  const modSnap = await modRef.get();
  const universityId = modSnap.exists
    ? modSnap.data()?.universityId || null
    : null;

  await modRef.delete();

  if (universityId) {
    const uniRef = db.collection("universities").doc(universityId);
    const uniSnap = await uniRef.get();
    if (uniSnap.exists && (uniSnap.data().safCount || 0) > 0) {
      await uniRef.update({
        safCount: (uniSnap.data().safCount || 0) - 1,
      });
    }
  }

  logger.info("removeSafModerator completed", {
    moderatorUid: uid,
    universityId,
    callerUid,
  });

  return { success: true };
});

// -----------------------------
// Triggers
// -----------------------------

// 0) Sync avatar/photo changes across cached locations when a user profile updates
export const syncUserAvatarPhotoChanges = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    try {
      const userId = event.params.userId;
      const beforeSnap = event.data?.before;
      const afterSnap = event.data?.after;
      if (!beforeSnap || !afterSnap) {
        logger.warn(
          "syncUserAvatarPhotoChanges: missing before/after snapshot",
          {
            userId,
          }
        );
        return;
      }

      const before = beforeSnap.data();
      const after = afterSnap.data();
      if (!before || !after) {
        logger.warn("syncUserAvatarPhotoChanges: before/after data missing", {
          userId,
        });
        return;
      }

      const beforeAvatar = before.avatarConfig || null;
      const afterAvatar = after.avatarConfig || null;
      const avatarChanged =
        JSON.stringify(beforeAvatar) !== JSON.stringify(afterAvatar);

      const beforePhoto = before.profile?.profilePhotoUrl || null;
      const afterPhoto = after.profile?.profilePhotoUrl || null;
      const photoChanged = beforePhoto !== afterPhoto;

      const beforeUseAvatar = before.profile?.useAvatar;
      const afterUseAvatar = after.profile?.useAvatar;
      const useAvatarChanged = beforeUseAvatar !== afterUseAvatar;

      const beforeHandle = before.profile?.handle || null;
      const afterHandle = after.profile?.handle || null;
      const handleChanged = beforeHandle !== afterHandle;

      const beforeMajor = before.profile?.major || null;
      const afterMajor = after.profile?.major || null;
      const majorChanged = beforeMajor !== afterMajor;

      const beforeUniversity = before.universityInfo?.university || null;
      const afterUniversity = after.universityInfo?.university || null;
      const universityChanged = beforeUniversity !== afterUniversity;

      if (
        !avatarChanged &&
        !photoChanged &&
        !useAvatarChanged &&
        !handleChanged &&
        !majorChanged &&
        !universityChanged
      ) {
        // Nothing relevant changed for cached avatar/photo fields
        return;
      }

      const updatedUserInfo = {
        handle: afterHandle,
        major: afterMajor || "Unknown",
        university: afterUniversity || "unknown",
        avatarConfig: afterAvatar || null,
        profilePhotoUrl: afterPhoto || null,
        // Default to photo-first when useAvatar is not explicitly set
        useAvatar: typeof afterUseAvatar === "boolean" ? afterUseAvatar : false,
      };

      logger.info("syncUserAvatarPhotoChanges: detected profile change", {
        userId,
        avatarChanged,
        photoChanged,
        useAvatarChanged,
        handleChanged,
        majorChanged,
        universityChanged,
      });

      let batch = db.batch();
      let pendingWrites = 0;

      const flushIfNeeded = async () => {
        if (pendingWrites > 0) {
          await batch.commit();
          batch = db.batch();
          pendingWrites = 0;
        }
      };

      const queueUpdate = async (ref, data) => {
        batch.update(ref, data);
        pendingWrites += 1;
        if (pendingWrites >= 400) {
          await flushIfNeeded();
        }
      };

      // Helper: build a richer profile object for clubs/events
      const denormProfile = {
        handle: updatedUserInfo.handle,
        major: updatedUserInfo.major,
        university: updatedUserInfo.university,
        avatarConfig: updatedUserInfo.avatarConfig,
        profilePhotoUrl: updatedUserInfo.profilePhotoUrl,
        useAvatar: updatedUserInfo.useAvatar,
      };

      // 0) Clubs & events: presidentInfo, member userInfo, event createdByInfo/startedByInfo

      // 0a) Clubs where user is president → update presidentInfo
      const presidentClubsSnap = await db
        .collection("clubs")
        .where("presidentId", "==", userId)
        .get();

      for (const clubDoc of presidentClubsSnap.docs) {
        const updates = {
          presidentInfo: denormProfile,
        };
        await queueUpdate(clubDoc.ref, updates);
      }

      // 0b) Club members where this user is a member → update userInfo
      // Some docs may use `uid`, others `userId`; update both shapes.
      const memberByUidSnap = await db
        .collectionGroup("members")
        .where("uid", "==", userId)
        .get()
        .catch((err) => {
          logger.error("syncUserAvatarPhotoChanges: members uid query failed", {
            userId,
            error: String(err),
          });
          return { empty: true, docs: [] };
        });

      const memberByUserIdSnap = await db
        .collectionGroup("members")
        .where("userId", "==", userId)
        .get()
        .catch((err) => {
          logger.error(
            "syncUserAvatarPhotoChanges: members userId query failed",
            {
              userId,
              error: String(err),
            }
          );
          return { empty: true, docs: [] };
        });

      const memberDocs = [
        ...(memberByUidSnap.docs || []),
        ...(memberByUserIdSnap.docs || []),
      ];

      for (const memberDoc of memberDocs) {
        const data = memberDoc.data() || {};
        const updates = {
          userInfo: {
            ...(data.userInfo || {}),
            handle: denormProfile.handle,
            major: denormProfile.major,
            university: denormProfile.university,
            avatarConfig: denormProfile.avatarConfig,
            profilePhotoUrl: denormProfile.profilePhotoUrl,
            useAvatar: denormProfile.useAvatar,
          },
        };
        await queueUpdate(memberDoc.ref, updates);
      }

      // 0c) Club events created by this user → update createdByInfo
      const createdEventsSnap = await db
        .collectionGroup("events")
        .where("createdBy", "==", userId)
        .get()
        .catch((err) => {
          logger.error(
            "syncUserAvatarPhotoChanges: events createdBy query failed",
            {
              userId,
              error: String(err),
            }
          );
          return { empty: true, docs: [] };
        });

      for (const eventDoc of createdEventsSnap.docs) {
        const data = eventDoc.data() || {};
        const createdByInfo = data.createdByInfo || {};
        const updates = {
          createdByInfo: {
            ...createdByInfo,
            handle: denormProfile.handle,
            avatarConfig: denormProfile.avatarConfig,
            profilePhotoUrl: denormProfile.profilePhotoUrl,
            useAvatar: denormProfile.useAvatar,
          },
        };
        await queueUpdate(eventDoc.ref, updates);
      }

      // 0d) Live events started by this user → update startedByInfo
      const startedEventsSnap = await db
        .collectionGroup("events")
        .where("startedBy", "==", userId)
        .get()
        .catch((err) => {
          logger.error(
            "syncUserAvatarPhotoChanges: events startedBy query failed",
            {
              userId,
              error: String(err),
            }
          );
          return { empty: true, docs: [] };
        });

      for (const eventDoc of startedEventsSnap.docs) {
        const data = eventDoc.data() || {};
        const startedByInfo = data.startedByInfo || {};
        const updates = {
          startedByInfo: {
            ...startedByInfo,
            handle: denormProfile.handle,
            avatarConfig: denormProfile.avatarConfig,
            profilePhotoUrl: denormProfile.profilePhotoUrl,
            useAvatar: denormProfile.useAvatar,
          },
        };
        await queueUpdate(eventDoc.ref, updates);
      }

      // 1) Friend requests where user is sender (fromUserInfo)
      const outgoingReqSnap = await db
        .collection("friendRequests")
        .where("fromUserId", "==", userId)
        .get();

      for (const docSnap of outgoingReqSnap.docs) {
        const updates = {
          "fromUserInfo.handle": updatedUserInfo.handle,
          "fromUserInfo.major": updatedUserInfo.major,
          "fromUserInfo.university": updatedUserInfo.university,
        };
        // Always propagate avatar/photo changes (including removals)
        if (avatarChanged) {
          updates["fromUserInfo.avatarConfig"] = updatedUserInfo.avatarConfig;
        }
        if (photoChanged) {
          updates["fromUserInfo.profilePhotoUrl"] =
            updatedUserInfo.profilePhotoUrl;
        }
        if (typeof updatedUserInfo.useAvatar === "boolean") {
          updates["fromUserInfo.useAvatar"] = updatedUserInfo.useAvatar;
        }
        await queueUpdate(docSnap.ref, updates);
      }

      // 2) Friend requests where user is receiver (toUserInfo)
      const incomingReqSnap = await db
        .collection("friendRequests")
        .where("toUserId", "==", userId)
        .get();

      for (const docSnap of incomingReqSnap.docs) {
        const updates = {
          "toUserInfo.handle": updatedUserInfo.handle,
          "toUserInfo.major": updatedUserInfo.major,
          "toUserInfo.university": updatedUserInfo.university,
        };
        // Always propagate avatar/photo changes (including removals)
        if (avatarChanged) {
          updates["toUserInfo.avatarConfig"] = updatedUserInfo.avatarConfig;
        }
        if (photoChanged) {
          updates["toUserInfo.profilePhotoUrl"] =
            updatedUserInfo.profilePhotoUrl;
        }
        if (typeof updatedUserInfo.useAvatar === "boolean") {
          updates["toUserInfo.useAvatar"] = updatedUserInfo.useAvatar;
        }
        await queueUpdate(docSnap.ref, updates);
      }

      // 3) Friendships where user is involved (user1Info/user2Info)
      const friendshipsSnap = await db
        .collection("friendships")
        .where("users", "array-contains", userId)
        .get();

      for (const docSnap of friendshipsSnap.docs) {
        const data = docSnap.data() || {};
        const updates = {};
        const prefix =
          data.user1Id === userId
            ? "user1Info"
            : data.user2Id === userId
            ? "user2Info"
            : null;

        if (prefix) {
          updates[`${prefix}.handle`] = updatedUserInfo.handle;
          updates[`${prefix}.major`] = updatedUserInfo.major;
          updates[`${prefix}.university`] = updatedUserInfo.university;
          // Always propagate avatar/photo changes (including removals)
          if (avatarChanged) {
            updates[`${prefix}.avatarConfig`] = updatedUserInfo.avatarConfig;
          }
          if (photoChanged) {
            updates[`${prefix}.profilePhotoUrl`] =
              updatedUserInfo.profilePhotoUrl;
          }
          if (typeof updatedUserInfo.useAvatar === "boolean") {
            updates[`${prefix}.useAvatar`] = updatedUserInfo.useAvatar;
          }
        }
        if (Object.keys(updates).length > 0) {
          await queueUpdate(docSnap.ref, updates);
        }
      }

      // 4) Notifications where user is the sender (fromUserInfo)
      const notificationsSnap = await db
        .collection("notifications")
        .where("fromUserId", "==", userId)
        .get();

      for (const docSnap of notificationsSnap.docs) {
        const updates = {
          "fromUserInfo.handle": updatedUserInfo.handle,
          "fromUserInfo.major": updatedUserInfo.major,
          "fromUserInfo.university": updatedUserInfo.university,
        };
        // Always propagate avatar/photo changes (including removals)
        if (avatarChanged) {
          updates["fromUserInfo.avatarConfig"] = updatedUserInfo.avatarConfig;
        }
        if (photoChanged) {
          updates["fromUserInfo.profilePhotoUrl"] =
            updatedUserInfo.profilePhotoUrl;
        }
        if (typeof updatedUserInfo.useAvatar === "boolean") {
          updates["fromUserInfo.useAvatar"] = updatedUserInfo.useAvatar;
        }
        await queueUpdate(docSnap.ref, updates);
      }

      // 5) Quick Access: users who have this user starred
      // Requires quickAccessData.starredFriendIds: string[] on user docs
      const quickAccessSnap = await db
        .collection("users")
        .where("quickAccessData.starredFriendIds", "array-contains", userId)
        .get();

      for (const userDoc of quickAccessSnap.docs) {
        const userData = userDoc.data() || {};
        const qa = userData.quickAccessData || {};
        const starredFriends = Array.isArray(qa.starredFriends)
          ? qa.starredFriends
          : [];

        let hasChanges = false;
        const updatedStarredFriends = starredFriends.map((friend) => {
          const fid = friend.friendId || friend.userId;
          if (fid === userId) {
            hasChanges = true;
            return {
              ...friend,
              handle: updatedUserInfo.handle,
              major: updatedUserInfo.major,
              avatarConfig: updatedUserInfo.avatarConfig,
              profilePhotoUrl: updatedUserInfo.profilePhotoUrl,
              useAvatar: updatedUserInfo.useAvatar,
            };
          }
          return friend;
        });

        if (hasChanges) {
          // Update the entire array to avoid Firestore converting it to an object
          await queueUpdate(userDoc.ref, {
            "quickAccessData.starredFriends": updatedStarredFriends,
            "quickAccessData.lastUpdated": FieldValue.serverTimestamp(),
          });
        }
      }

      // Commit any remaining writes
      await flushIfNeeded();

      logger.info("syncUserAvatarPhotoChanges: sync complete", {
        userId,
      });
    } catch (err) {
      logger.error("syncUserAvatarPhotoChanges: failed", {
        error: String(err),
      });
    }
  }
);

// 0b) Maintain club followerCount when a user's followedClubs array changes
export const onClubFollow = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    const userId = event.params.userId;
    try {
      const beforeSnap = event.data?.before;
      const afterSnap = event.data?.after;
      if (!beforeSnap || !afterSnap) {
        logger.warn("onClubFollow: missing before/after snapshot", { userId });
        return;
      }

      const beforeData = beforeSnap.data() || {};
      const afterData = afterSnap.data() || {};

      const beforeClubsRaw = beforeData.followedClubs;
      const afterClubsRaw = afterData.followedClubs;

      const beforeClubs = Array.isArray(beforeClubsRaw)
        ? beforeClubsRaw.filter((id) => typeof id === "string")
        : [];
      const afterClubs = Array.isArray(afterClubsRaw)
        ? afterClubsRaw.filter((id) => typeof id === "string")
        : [];

      // Compute set-diff for follows/unfollows
      const newFollows = afterClubs.filter((id) => !beforeClubs.includes(id));
      const unfollows = beforeClubs.filter((id) => !afterClubs.includes(id));

      if (newFollows.length === 0 && unfollows.length === 0) {
        return;
      }

      // De-duplicate within each list for safety
      const uniqueNewFollows = [...new Set(newFollows)];
      const uniqueUnfollows = [...new Set(unfollows)];

      // Process follows (can use increment safely)
      if (uniqueNewFollows.length > 0) {
        let batch = db.batch();
        let opsInBatch = 0;
        const batchSize = 400;

        for (const clubId of uniqueNewFollows) {
          const clubRef = db.collection("clubs").doc(clubId);
          batch.update(clubRef, {
            followerCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          opsInBatch++;

          if (opsInBatch >= batchSize) {
            await batch.commit();
            batch = db.batch();
            opsInBatch = 0;
          }
        }

        if (opsInBatch > 0) {
          await batch.commit();
        }
      }

      // Process unfollows with transaction to enforce floor of 0 (R24)
      for (const clubId of uniqueUnfollows) {
        try {
          const clubRef = db.collection("clubs").doc(clubId);
          await db.runTransaction(async (tx) => {
            const clubDoc = await tx.get(clubRef);
            if (!clubDoc.exists) return;

            const currentCount = clubDoc.data()?.followerCount || 0;
            const newCount = Math.max(0, currentCount - 1); // R24: Never go below 0

            tx.update(clubRef, {
              followerCount: newCount,
              updatedAt: FieldValue.serverTimestamp(),
            });
          });
        } catch (txErr) {
          logger.warn("onClubFollow: transaction failed for unfollow", {
            clubId,
            error: String(txErr),
          });
        }
      }

      logger.info("onClubFollow: follower counts updated", {
        userId,
        newFollows: uniqueNewFollows.length,
        unfollows: uniqueUnfollows.length,
      });
    } catch (err) {
      logger.error("onClubFollow: failed", {
        userId,
        error: String(err),
      });
    }
  }
);

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

    // Club notifications for the new Clubs feature
    if (typeof data.type === "string" && data.type.startsWith("club_")) {
      const toUserId = data.userId;
      if (!toUserId) return;

      const clubId = data.clubId || "";
      const eventId = data.eventId || "";

      // Deep link to club or specific event inside the SPA
      let link = "/#notifications";
      if (clubId) {
        link = `/#club?id=${clubId}${eventId ? `&eventId=${eventId}` : ""}`;
      }

      const notification = {
        title: data.title || "Club update",
        body: data.message || "",
      };

      const payload = {
        link,
        type: data.type,
        clubId,
        eventId,
      };

      try {
        const res = await sendToUser(toUserId, notification, payload);
        logger.info("Club notification push sent", {
          type: data.type,
          toUserId,
          clubId,
          eventId,
          ...res,
        });
      } catch (err) {
        logger.error("Error sending club notification push", {
          type: data.type,
          toUserId,
          clubId,
          eventId,
          error: String(err),
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
    const beforeStatus =
      before?.systemInfo?.lastKnownLocation?.campusStatus || "unknown";
    const afterStatus =
      after?.systemInfo?.lastKnownLocation?.campusStatus || "unknown";

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
          logger.info("Starred presence push result", {
            friendId,
            actorId,
            ...res,
          });
        })
      );
    }
    await Promise.allSettled(sendPromises);
  }
);

// (Availability ping/response Cloud Functions removed as the feature was deprecated)
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

// -----------------------------
// Clubs: Event notifications & cleanup
// -----------------------------

async function createClubNotificationForUser(userId, data) {
  const ref = db.collection("notifications").doc();
  await ref.set({
    userId,
    type: data.type,
    clubId: data.clubId || "",
    eventId: data.eventId || null,
    title: data.title || "",
    message: data.message || "",
    clubInfo: data.clubInfo || null,
    createdAt: FieldValue.serverTimestamp(),
    status: "pending",
    readAt: null,
  });
}

async function notifyClubFollowers(clubId, notificationData) {
  const followersSnapshot = await db
    .collection("users")
    .where("followedClubs", "array-contains", clubId)
    .get();

  if (followersSnapshot.empty) {
    logger.info("No followers to notify for club", { clubId });
    return;
  }

  let batch = db.batch();
  let countInBatch = 0;
  let total = 0;

  for (const userDoc of followersSnapshot.docs) {
    const notifRef = db.collection("notifications").doc();
    batch.set(notifRef, {
      userId: userDoc.id,
      clubId,
      type: notificationData.type,
      eventId: notificationData.eventId || null,
      title: notificationData.title || "",
      message: notificationData.message || "",
      clubInfo: notificationData.clubInfo || null,
      createdAt: FieldValue.serverTimestamp(),
      status: "pending",
      readAt: null,
    });
    countInBatch += 1;
    total += 1;

    if (countInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  logger.info("Sent club follower notifications", {
    clubId,
    type: notificationData.type,
    total,
  });
}

// R12: Helper to notify ALL users in a university (for live event notifications)
async function notifyAllUniversityUsers(
  universityCode,
  clubId,
  notificationData
) {
  // Query all users with matching university code
  const usersSnapshot = await db
    .collection("users")
    .where("universityInfo.university", "==", universityCode)
    .get();

  if (usersSnapshot.empty) {
    logger.info("No users to notify for university", {
      universityCode,
      clubId,
    });
    return;
  }

  let batch = db.batch();
  let countInBatch = 0;
  let total = 0;

  for (const userDoc of usersSnapshot.docs) {
    const notifRef = db.collection("notifications").doc();
    batch.set(notifRef, {
      userId: userDoc.id,
      clubId,
      type: notificationData.type,
      eventId: notificationData.eventId || null,
      title: notificationData.title || "",
      message: notificationData.message || "",
      clubInfo: notificationData.clubInfo || null,
      createdAt: FieldValue.serverTimestamp(),
      status: "pending",
      readAt: null,
    });
    countInBatch += 1;
    total += 1;

    // Firestore batch limit is 500, we use 400 to be safe
    if (countInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  logger.info("Sent university-wide notifications for live event", {
    universityCode,
    clubId,
    type: notificationData.type,
    total,
  });
}

async function updateClubEventStats(clubId) {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const eventsThisWeekSnap = await db
    .collection(`clubs/${clubId}/events`)
    .where("status", "==", "approved")
    .where("firstSlotStart", ">=", now)
    .where("firstSlotStart", "<=", weekFromNow)
    .get();

  const nextEventSnap = await db
    .collection(`clubs/${clubId}/events`)
    .where("status", "==", "approved")
    .where("firstSlotStart", ">=", now)
    .orderBy("firstSlotStart", "asc")
    .limit(1)
    .get();

  const updates = {
    eventsThisWeek: eventsThisWeekSnap.size,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!nextEventSnap.empty) {
    updates.nextEventDate = nextEventSnap.docs[0].data().firstSlotStart;
  } else {
    updates.nextEventDate = null;
  }

  await db.doc(`clubs/${clubId}`).update(updates);
}

// When a club event is created, notify the president about pending approval
export const onClubEventCreated = onDocumentCreated(
  "clubs/{clubId}/events/{eventId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { clubId, eventId } = event.params;

    // Only handle events that are pending president approval or already approved
    if (data.status !== "pending_president" && data.status !== "approved") {
      return;
    }

    const clubSnap = await db.doc(`clubs/${clubId}`).get();
    if (!clubSnap.exists) {
      logger.warn("Club not found for event", { clubId, eventId });
      return;
    }
    const club = clubSnap.data() || {};

    if (data.status === "pending_president") {
      // Determine who should review this event:
      // 1) presidentId (if set)
      // 2) devOwnerUid for devTest clubs (matches firestore.rules isClubPresident)
      // 3) createdBy as a final fallback (initial seeding / legacy clubs)
      let reviewerUid = club.presidentId || null;
      if (!reviewerUid && club.devTest && club.devOwnerUid) {
        reviewerUid = club.devOwnerUid;
      }
      if (!reviewerUid && club.createdBy) {
        reviewerUid = club.createdBy;
      }

      if (!reviewerUid) {
        logger.info(
          "No president/devOwner/creator to notify for pending event",
          {
            clubId,
            eventId,
          }
        );
        return;
      }

      await createClubNotificationForUser(reviewerUid, {
        type: "club_event_pending",
        clubId,
        eventId,
        title: "New Event Pending Approval",
        message: `"${data.title || "Event"}" is waiting for your review`,
        clubInfo: {
          name: club.name || "",
          logoUrl: club.logoUrl || null,
          accentColor: club.accentColor || null,
        },
      });

      logger.info("Notified reviewer of pending event", {
        clubId,
        eventId,
        reviewerUid,
      });
      return;
    }

    if (data.status === "approved") {
      // Auto-approved event (created by president/devOwner) — behave like a freshly approved event:
      // notify creator and followers, and refresh club event stats.

      if (data.createdBy) {
        await createClubNotificationForUser(data.createdBy, {
          type: "club_event_approved",
          clubId,
          eventId,
          title: "Event Approved! 🎉",
          message: `"${data.title || "Your event"}" is now live`,
          clubInfo: {
            name: club.name || "",
            logoUrl: club.logoUrl || null,
            accentColor: club.accentColor || null,
          },
        });
      }

      await notifyClubFollowers(clubId, {
        type: "club_new_event",
        eventId,
        title: `New event from ${club.name || "a club"}`,
        message: data.title || "",
        clubInfo: {
          name: club.name || "",
          logoUrl: club.logoUrl || null,
          accentColor: club.accentColor || null,
        },
      });

      await updateClubEventStats(clubId);

      logger.info("Handled auto-approved event on creation", {
        clubId,
        eventId,
        createdBy: data.createdBy || null,
      });
    }
  }
);

// When event status changes (approved / rejected / cancelled), notify creator and followers
export const onClubEventStatusChanged = onDocumentUpdated(
  "clubs/{clubId}/events/{eventId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const { clubId, eventId } = event.params;

    if (before.status === after.status) {
      return;
    }

    const clubSnap = await db.doc(`clubs/${clubId}`).get();
    if (!clubSnap.exists) {
      logger.warn("Club not found for event status change", {
        clubId,
        eventId,
      });
      return;
    }
    const club = clubSnap.data() || {};

    // Event approved (either first time or after edits)
    if (after.status === "approved" && before.status !== "approved") {
      if (after.createdBy) {
        await createClubNotificationForUser(after.createdBy, {
          type: "club_event_approved",
          clubId,
          eventId,
          title: "Event Approved! 🎉",
          message: `"${after.title || "Your event"}" is now live`,
          clubInfo: {
            name: club.name || "",
            logoUrl: club.logoUrl || null,
            accentColor: club.accentColor || null,
          },
        });
      }

      const isReapproval =
        before.status === "pending_president" && before.approvedAt != null;

      if (isReapproval) {
        await notifyClubFollowers(clubId, {
          type: "club_event_changed",
          eventId,
          title: `${club.name || "A club"} updated an event`,
          message: `"${after.title || "Event"}" has been updated`,
          clubInfo: {
            name: club.name || "",
            logoUrl: club.logoUrl || null,
            accentColor: club.accentColor || null,
          },
        });
      } else {
        await notifyClubFollowers(clubId, {
          type: "club_new_event",
          eventId,
          title: `New event from ${club.name || "a club"}`,
          message: after.title || "",
          clubInfo: {
            name: club.name || "",
            logoUrl: club.logoUrl || null,
            accentColor: club.accentColor || null,
          },
        });
      }

      await updateClubEventStats(clubId);
    }

    // Event rejected
    if (after.status === "rejected" && after.createdBy) {
      await createClubNotificationForUser(after.createdBy, {
        type: "club_event_rejected",
        clubId,
        eventId,
        title: "Event Not Approved",
        message:
          after.rejectionReason ||
          `"${after.title || "Your event"}" was not approved`,
        clubInfo: {
          name: club.name || "",
          logoUrl: club.logoUrl || null,
          accentColor: club.accentColor || null,
        },
      });
    }

    // Event re-submitted for president review (rejected -> pending_president)
    if (after.status === "pending_president" && before.status === "rejected") {
      // Determine reviewer (same logic as onClubEventCreated)
      let reviewerUid = club.presidentId || null;
      if (!reviewerUid && club.devTest && club.devOwnerUid) {
        reviewerUid = club.devOwnerUid;
      }
      if (!reviewerUid && club.createdBy) {
        reviewerUid = club.createdBy;
      }

      if (reviewerUid) {
        await createClubNotificationForUser(reviewerUid, {
          type: "club_event_pending",
          clubId,
          eventId,
          title: "Event Resubmitted for Approval",
          message: `"${
            after.title || "Event"
          }" was updated and is waiting for your review again`,
          clubInfo: {
            name: club.name || "",
            logoUrl: club.logoUrl || null,
            accentColor: club.accentColor || null,
          },
        });

        logger.info("Notified reviewer of resubmitted event", {
          clubId,
          eventId,
          reviewerUid,
        });
      } else {
        logger.info("No reviewer found for resubmitted pending event", {
          clubId,
          eventId,
        });
      }
    }

    // Event cancelled after being approved
    if (after.status === "cancelled" && before.status === "approved") {
      await notifyClubFollowers(clubId, {
        type: "club_event_cancelled",
        eventId,
        title: "Event cancelled",
        message: `"${after.title || "An event"}" from ${
          club.name || "a club"
        } has been cancelled`,
        clubInfo: {
          name: club.name || "",
          logoUrl: club.logoUrl || null,
          accentColor: club.accentColor || null,
        },
      });

      await updateClubEventStats(clubId);
    }

    // Log when a live event is stopped (either manually or due to edit)
    // This provides an audit trail for live event management
    const wasLiveStopped = !before.liveStoppedAt && after.liveStoppedAt;
    if (wasLiveStopped) {
      const stopReason = after.liveStopReason || "manual";
      const stoppedBy = after.liveStoppedBy || "unknown";

      // Log to adminActivity for audit trail
      await db.collection("adminActivity").add({
        action: "club_event_live_stopped",
        clubId,
        eventId,
        eventTitle: after.title || "Untitled Event",
        clubName: club.name || "Unknown Club",
        stoppedBy,
        stopReason,
        timestamp: FieldValue.serverTimestamp(),
      });

      logger.info("Live event stopped", {
        clubId,
        eventId,
        stopReason,
        stoppedBy,
      });
    }
  }
);

// When an event is marked as started (isLive toggles to true), notify ALL users in the university
// R12: Live event notifications go to all users, not just followers
export const onClubEventStarted = onDocumentUpdated(
  "clubs/{clubId}/events/{eventId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    if (before.isLive === true || after.isLive !== true) {
      return;
    }

    const { clubId, eventId } = event.params;
    const clubSnap = await db.doc(`clubs/${clubId}`).get();
    if (!clubSnap.exists) {
      logger.warn("Club not found for event start", { clubId, eventId });
      return;
    }
    const club = clubSnap.data() || {};

    // R12: Notify ALL users in the same university, not just followers
    const universityCode = club.universityCode || club.university || null;

    if (universityCode) {
      // Notify all users at this university
      await notifyAllUniversityUsers(universityCode, clubId, {
        type: "club_event_started",
        eventId,
        title: "🔴 Event is LIVE!",
        message: `"${after.title || "An event"}" from ${
          club.name || "a club"
        } is happening now!`,
        clubInfo: {
          name: club.name || "",
          logoUrl: club.logoUrl || null,
          accentColor: club.accentColor || null,
        },
      });

      logger.info("Event started, notified all university users", {
        clubId,
        eventId,
        universityCode,
      });
    } else {
      // Fallback to followers only if no university code
      await notifyClubFollowers(clubId, {
        type: "club_event_started",
        eventId,
        title: "🔴 Event is LIVE!",
        message: `"${after.title || "An event"}" is happening now!`,
        clubInfo: {
          name: club.name || "",
          logoUrl: club.logoUrl || null,
          accentColor: club.accentColor || null,
        },
      });

      logger.info("Event started, notified followers (no university code)", {
        clubId,
        eventId,
      });
    }
  }
);

// Scheduled: send 30-minute reminders for approved events (each time slot)
// For multi-day events, sends a reminder 30 minutes before EACH day's slot
export const sendClubEventReminders = onSchedule(
  "every 5 minutes",
  async () => {
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const thirtyFiveMinutesFromNow = new Date(now.getTime() + 35 * 60 * 1000);

    // Get all approved events (we'll check each time slot individually)
    const approvedEventsSnap = await db
      .collectionGroup("events")
      .where("status", "==", "approved")
      .get();

    if (approvedEventsSnap.empty) return;

    for (const eventDoc of approvedEventsSnap.docs) {
      const eventData = eventDoc.data() || {};
      const timeSlots = eventData.timeSlots || [];

      if (timeSlots.length === 0) continue;

      // Track which slots have had reminders sent
      const remindersSentForSlots = eventData.remindersSentForSlots || [];

      // Check each time slot for 30-minute reminder window
      for (let slotIndex = 0; slotIndex < timeSlots.length; slotIndex++) {
        const slot = timeSlots[slotIndex];
        const slotKey = `${slot.date}_${slot.startTime}`;

        // Skip if reminder already sent for this slot
        if (remindersSentForSlots.includes(slotKey)) continue;

        const slotStart = new Date(`${slot.date}T${slot.startTime}`);

        // Check if slot starts within 30-35 minutes from now
        if (
          slotStart >= thirtyMinutesFromNow &&
          slotStart < thirtyFiveMinutesFromNow
        ) {
          const clubRef = eventDoc.ref.parent.parent;
          if (!clubRef) continue;

          const clubSnap = await clubRef.get();
          if (!clubSnap.exists) continue;
          const club = clubSnap.data() || {};
          const clubId = clubSnap.id;

          // Mark this slot's reminder as sent
          await eventDoc.ref.update({
            remindersSentForSlots: [...remindersSentForSlots, slotKey],
          });

          // Get followers to notify
          const followersSnap = await db
            .collection("users")
            .where("followedClubs", "array-contains", clubId)
            .get();

          if (followersSnap.empty) {
            logger.info("No followers for reminder", {
              clubId,
              eventId: eventDoc.id,
              slotKey,
            });
            continue;
          }

          let batch = db.batch();
          let countInBatch = 0;
          let total = 0;

          // Format date for display
          const slotDate = new Date(slot.date + "T00:00:00");
          const dateStr = slotDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

          for (const userDoc of followersSnap.docs) {
            const notifRef = db.collection("notifications").doc();
            batch.set(notifRef, {
              userId: userDoc.id,
              type: "club_event_reminder",
              clubId,
              eventId: eventDoc.id,
              slotKey,
              title: "⏰ Event starting soon!",
              message: `"${
                eventData.title || "An event"
              }" starts in 30 minutes${
                timeSlots.length > 1 ? ` (${dateStr})` : ""
              }`,
              clubInfo: {
                name: club.name || "",
                logoUrl: club.logoUrl || null,
                accentColor: club.accentColor || null,
              },
              createdAt: FieldValue.serverTimestamp(),
              status: "pending",
              readAt: null,
            });
            countInBatch += 1;
            total += 1;

            if (countInBatch >= 400) {
              await batch.commit();
              batch = db.batch();
              countInBatch = 0;
            }
          }

          if (countInBatch > 0) {
            await batch.commit();
          }

          logger.info("Sent event reminders for slot", {
            clubId,
            eventId: eventDoc.id,
            slotKey,
            total,
          });
        }
      }
    }
  }
);

// Scheduled: cleanup club notifications older than 30 days
export const cleanupOldClubNotifications = onSchedule(
  "every sunday 04:00",
  async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const clubTypes = [
      "club_new_event",
      "club_event_reminder",
      "club_event_changed",
      "club_event_started",
      "club_event_cancelled",
      "club_event_pending",
      "club_event_approved",
      "club_event_rejected",
    ];

    let totalDeleted = 0;

    for (const type of clubTypes) {
      const oldSnap = await db
        .collection("notifications")
        .where("type", "==", type)
        .where("createdAt", "<", thirtyDaysAgo)
        .limit(400)
        .get();

      if (oldSnap.empty) continue;

      const batch = db.batch();
      oldSnap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();

      totalDeleted += oldSnap.size;
    }

    logger.info("Cleanup old club notifications complete", {
      totalDeleted,
    });
  }
);

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

// 9) Maintain club memberCount based on /clubs/{clubId}/members subcollection
// Per data model: memberCount = count of officials + president (not regular members)
export const onClubMemberChanged = onDocumentWritten(
  "clubs/{clubId}/members/{memberId}",
  async (event) => {
    const { clubId } = event.params;

    try {
      const membersSnap = await db
        .collection("clubs")
        .doc(clubId)
        .collection("members")
        .get();

      // Count only president and officials, not regular members
      let memberCount = 0;
      for (const memberDoc of membersSnap.docs) {
        const role = memberDoc.data()?.role;
        if (role === "president" || role === "official") {
          memberCount++;
        }
      }

      await db.collection("clubs").doc(clubId).update({
        memberCount,
        updatedAt: new Date(),
      });

      logger.info("onClubMemberChanged: memberCount updated", {
        clubId,
        memberCount,
        totalMembers: membersSnap.size,
      });
    } catch (error) {
      logger.error("onClubMemberChanged: failed to update memberCount", {
        clubId,
        error: String(error),
      });
    }
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
    if (
      !course.dayPattern ||
      !course.timeSlot ||
      !course.classroom ||
      sectionKey === "00"
    )
      return "";
    const useCode =
      !course.courseName ||
      course.courseName.endsWith("...") ||
      course.courseName.split(/\s+/).length < 3;
    const nameSlug =
      useCode && course.courseCode
        ? String(course.courseCode).toLowerCase()
        : String(course.courseName || "")
            .replace(/\s+/g, "-")
            .toLowerCase();
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

export const scheduleDailyClassSpaces = onSchedule(
  { schedule: "every day 06:00", timeZone: "Asia/Dhaka" },
  async () => {
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

    // Upsert spaces for buckets with ≥3 members (production threshold per PRD)
    for (const [spaceId, set] of buckets) {
      const members = Array.from(set);
      const { university, course } = index.get(spaceId) || {};
      const ref = db.collection("classSpaces").doc(spaceId);
      if (members.length >= 3) {
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
          await ref.set(
            { active: false, updatedAt: new Date() },
            { merge: true }
          );
        }
      }
    }
    logger.info("scheduleDailyClassSpaces completed", {
      buckets: buckets.size,
    });
  }
);

// Rate-limited message sending via callable (membership checked in CF)
export const sendGroupMessage = https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new https.HttpsError("unauthenticated", "Must be signed in");
  }
  const uid = context.auth.uid;
  const spaceId = String(data?.spaceId || "").trim();
  const content = String(data?.content || "").trim();
  if (!spaceId || !content) {
    throw new https.HttpsError(
      "invalid-argument",
      "spaceId and content required"
    );
  }
  if (content.length > 500) {
    throw new https.HttpsError("invalid-argument", "Message too long");
  }

  // Rate limit: 1 message per 2 seconds per user per space
  const rateKey = `msg_${spaceId}`;
  const ok = await incrementRate(uid, rateKey, 1000000); // daily cap very high
  // Enforce a short-term throttle using a per-space user doc
  const throttleRef = db.collection("rateLimits").doc(`${spaceId}_${uid}`);
  const now = Date.now();
  const throttleSnap = await throttleRef.get();
  const lastAt = throttleSnap.exists ? throttleSnap.data()?.lastAt || 0 : 0;
  if (now - lastAt < 2000) {
    throw new https.HttpsError("resource-exhausted", "Slow down");
  }
  await throttleRef.set({ lastAt: now }, { merge: true });

  // Membership check
  const spaceDoc = await db.collection("classSpaces").doc(spaceId).get();
  if (!spaceDoc.exists)
    throw new https.HttpsError("not-found", "Space not found");
  const space = spaceDoc.data() || {};
  const isMember =
    Array.isArray(space.memberIds) && space.memberIds.includes(uid);
  if (!isMember)
    throw new https.HttpsError("permission-denied", "Not a member");

  // Write message
  const msgRef = db
    .collection("classSpaces")
    .doc(spaceId)
    .collection("messages")
    .doc();
  const senderInfo = await fetchMemberInfo(uid);
  await msgRef.set({
    messageId: msgRef.id,
    senderId: uid,
    senderInfo: senderInfo || { handle: "", firstName: "" },
    content,
    createdAt: FieldValue.serverTimestamp(),
    edited: false,
    editedAt: null,
    deleted: false,
  });
  // Coalesce metadata updates to reduce write pressure: update if >10s or sender changed
  try {
    const spaceData = spaceDoc.data() || {};
    const lastTs = spaceData.lastActivity?.toDate?.() || new Date(0);
    const timeSince = Date.now() - lastTs.getTime();
    const lastSender = spaceData.lastMessagePreview?.senderId || null;
    const shouldUpdate = timeSince > 10000 || lastSender !== uid;
    if (shouldUpdate) {
      await spaceDoc.ref.set(
        {
          lastActivity: FieldValue.serverTimestamp(),
          lastMessagePreview: {
            content: content.slice(0, 140),
            senderId: uid,
            createdAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    }
  } catch (e) {
    logger.warn("sendGroupMessage: metadata coalescing failed", String(e));
  }
  return { success: true, messageId: msgRef.id };
});

// Nightly trim to 2,000 latest messages per space
export const trimSpaceMessages = onSchedule(
  { schedule: "every day 03:00", timeZone: "Asia/Dhaka" },
  async () => {
    const spaces = await db
      .collection("classSpaces")
      .where("active", "==", true)
      .get();
    for (const s of spaces.docs) {
      const ref = s.ref.collection("messages");
      const snap = await ref
        .orderBy("createdAt", "desc")
        .offset(2000)
        .limit(500)
        .get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    logger.info("trimSpaceMessages completed");
  }
);

// =============================================================================
// � MANUAL CLASS SPACES SCHEDULER TRIGGER (for staging/testing)
// =============================================================================

/**
 * Manual trigger for scheduleDailyClassSpaces
 * Usage: Call this HTTPS endpoint to run the scheduler on-demand
 * URL: https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/triggerClassSpaceScheduler
 *
 * For security, this should be protected in production (add auth check)
 */
export const triggerClassSpaceScheduler = https.onRequest(async (req, res) => {
  // Basic CORS for staging/manual testing
  try {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    // ---------------- SECURITY GUARDRAILS ----------------
    // EMULATOR ONLY: This endpoint is disabled for hosted environments (staging/prod).
    const isEmulator =
      !!process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FUNCTIONS_EMULATOR === "true";
    if (!isEmulator) {
      return res.status(403).json({
        success: false,
        error: "Manual scheduler is emulator-only",
      });
    }

    logger.info("Manual scheduler trigger called (emulator)");

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

    let spacesCreated = 0;
    let spacesDeactivated = 0;

    // Upsert spaces for buckets with ≥2 members (lowered from 4 for staging)
    for (const [spaceId, set] of buckets) {
      const members = Array.from(set);
      const { university, course } = index.get(spaceId) || {};
      const ref = db.collection("classSpaces").doc(spaceId);

      if (members.length >= 2) {
        // Prepare memberInfo cache
        const memberInfo = {};
        const preview = members.slice(0, 20);
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
        spacesCreated++;
      } else {
        // If space exists, mark inactive but keep history
        const snap = await ref.get();
        if (snap.exists) {
          await ref.set(
            { active: false, updatedAt: new Date() },
            { merge: true }
          );
          spacesDeactivated++;
        }
      }
    }

    logger.info("Manual scheduler completed", {
      totalBuckets: buckets.size,
      spacesCreated,
      spacesDeactivated,
    });

    res.status(200).json({
      success: true,
      message: "Class spaces scheduler executed successfully",
      totalBuckets: buckets.size,
      spacesCreated,
      spacesDeactivated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Manual scheduler trigger failed", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =============================================================================
// �👥 FRIENDSHIP DENORMALIZATION
// =============================================================================

/**
 * Trigger: When a friendship is created or deleted
 * Purpose: Update socialInfo.friendIds arrays for both users
 * Enables: Efficient mutual friends display without querying friendships collection
 */
export const onFriendshipWriteUpdateFriendIds = onDocumentWritten(
  "friendships/{friendshipId}",
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;

    // Determine the two user IDs from the friendship document
    let user1Id, user2Id;

    if (after && after.exists) {
      // Created or updated - use the 'after' data
      const data = after.data();
      user1Id = data.user1Id;
      user2Id = data.user2Id;
    } else if (before && before.exists) {
      // Deleted - use the 'before' data
      const data = before.data();
      user1Id = data.user1Id;
      user2Id = data.user2Id;
    } else {
      logger.warn("onFriendshipWriteUpdateFriendIds: No valid data found");
      return;
    }

    if (!user1Id || !user2Id) {
      logger.warn("onFriendshipWriteUpdateFriendIds: Missing user IDs", {
        user1Id,
        user2Id,
      });
      return;
    }

    // Determine if this is a create or delete
    const wasCreated = !before?.exists && after?.exists;
    const wasDeleted = before?.exists && !after?.exists;

    if (!wasCreated && !wasDeleted) {
      // Just an update to the friendship doc (e.g., privacy settings)
      // friendIds don't need to change
      logger.info(
        "onFriendshipWriteUpdateFriendIds: Friendship updated (not create/delete), skipping"
      );
      return;
    }

    logger.info("onFriendshipWriteUpdateFriendIds: Processing", {
      user1Id,
      user2Id,
      wasCreated,
      wasDeleted,
    });

    try {
      // Update both users in parallel
      await Promise.all([
        updateUserFriendIds(user1Id, user2Id, wasCreated),
        updateUserFriendIds(user2Id, user1Id, wasCreated),
      ]);

      logger.info(
        "onFriendshipWriteUpdateFriendIds: Successfully updated both users"
      );
    } catch (error) {
      logger.error(
        "onFriendshipWriteUpdateFriendIds: Error updating friendIds",
        error
      );
    }
  }
);

/**
 * Helper: Update a single user's friendIds array
 * @param {string} userId - The user whose friendIds to update
 * @param {string} friendId - The friend to add/remove
 * @param {boolean} isAdd - true to add, false to remove
 */
async function updateUserFriendIds(userId, friendId, isAdd) {
  const userRef = db.collection("users").doc(userId);

  try {
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);

      if (!userSnap.exists) {
        logger.warn(`updateUserFriendIds: User ${userId} not found`);
        return;
      }

      const userData = userSnap.data();
      const socialInfo = userData.socialInfo || {};
      let friendIds = socialInfo.friendIds || [];

      if (isAdd) {
        // Add friend if not already present
        if (!friendIds.includes(friendId)) {
          friendIds.push(friendId);
          logger.info(`Adding ${friendId} to ${userId}'s friendIds`);
        }
      } else {
        // Remove friend
        friendIds = friendIds.filter((id) => id !== friendId);
        logger.info(`Removing ${friendId} from ${userId}'s friendIds`);
      }

      // Update the document
      tx.update(userRef, {
        "socialInfo.friendIds": friendIds,
      });
    });
  } catch (error) {
    logger.error(`updateUserFriendIds: Error for user ${userId}`, error);
    throw error;
  }
}

// =============================================================================
// 📨 MESSAGE ON-CREATE TRIGGER (direct write path)
// =============================================================================

export const onMessageCreate = onDocumentCreated(
  "classSpaces/{spaceId}/messages/{messageId}",
  async (event) => {
    try {
      const { spaceId, messageId } = event.params || {};
      const snap = event.data;
      if (!snap) return;
      const message = snap.data();
      if (!message) return;

      const senderId = message.senderId || "";
      const content = String(message.content || "").trim();
      if (!senderId || !content) return;

      // Post-hoc rate limiting: 1 message / 3s per user per space
      const throttleRef = db
        .collection("rateLimits")
        .doc(`${spaceId}_${senderId}`);
      const now = Date.now();
      let violated = false;
      try {
        await db.runTransaction(async (tx) => {
          const throttleSnap = await tx.get(throttleRef);
          const lastAt = throttleSnap.exists
            ? throttleSnap.data()?.lastAt || 0
            : 0;
          if (now - lastAt < 2000) {
            // 2s window
            // Violation: delete message and record
            tx.delete(snap.ref);
            tx.set(
              throttleRef,
              {
                lastAt,
                violations: FieldValue.increment(1),
                lastViolation: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            violated = true;
            logger.warn("Rate limit violation (onCreate)", {
              spaceId,
              senderId,
              messageId,
            });
            return;
          }
          tx.set(throttleRef, { lastAt: now }, { merge: true });
        });
      } catch (e) {
        logger.warn("onMessageCreate: rate-limit txn failed", String(e));
      }

      if (violated) {
        // Short-circuit: do not recreate the doc or update metadata
        return;
      }

      // Ensure messageId and senderInfo snapshot exist for UI rendering
      try {
        const info = await fetchMemberInfo(senderId);
        const setPayload = { messageId: event.params?.messageId || snap.id };
        if (info) setPayload.senderInfo = info;
        await snap.ref.set(setPayload, { merge: true });
      } catch (_) {}

      // Update parent space metadata with 10s coalescing or when sender changes
      try {
        const spaceRef = db.collection("classSpaces").doc(spaceId);
        const spaceDoc = await spaceRef.get();
        if (!spaceDoc.exists) return;
        const data = spaceDoc.data() || {};
        const lastTs = data.lastActivity?.toDate?.() || new Date(0);
        const timeSince = Date.now() - lastTs.getTime();
        const lastSender = data.lastMessagePreview?.senderId || null;
        const shouldUpdate = timeSince > 10000 || lastSender !== senderId;
        if (shouldUpdate) {
          await spaceRef.set(
            {
              lastActivity: FieldValue.serverTimestamp(),
              lastMessagePreview: {
                content: content.slice(0, 140),
                senderId,
                createdAt: FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );
        }
      } catch (e) {
        logger.warn("onMessageCreate: metadata update failed", String(e));
      }
    } catch (err) {
      logger.error("onMessageCreate failed", err);
    }
  }
);

// -----------------------------
// R21: Scheduled Cleanup for Old Club Events (90 days)
// -----------------------------
// Runs weekly to clean up approved events older than 90 days
// and pending/rejected events older than 30 days
export const cleanupOldClubEvents = onSchedule(
  "every sunday 03:00",
  async () => {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalDeleted = 0;
    let imagesDeleted = 0;

    // Get all clubs
    const clubsSnap = await db.collection("clubs").get();

    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id;

      // Get events for this club
      const eventsSnap = await db
        .collection("clubs")
        .doc(clubId)
        .collection("events")
        .get();

      for (const eventDoc of eventsSnap.docs) {
        const event = eventDoc.data();
        const lastSlotEnd = event.lastSlotEnd?.toDate?.();
        const createdAt = event.createdAt?.toDate?.();
        const status = event.status || "pending_president";

        let shouldDelete = false;

        // Approved events: delete after 90 days past lastSlotEnd
        if (
          status === "approved" &&
          lastSlotEnd &&
          lastSlotEnd < ninetyDaysAgo
        ) {
          shouldDelete = true;
        }

        // Pending/rejected events: delete after 30 days from creation
        if (
          (status === "pending_president" ||
            status === "pending_saf" ||
            status === "rejected") &&
          createdAt &&
          createdAt < thirtyDaysAgo
        ) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          try {
            // Delete announcements subcollection first
            const announcementsSnap = await eventDoc.ref
              .collection("announcements")
              .get();
            const batch = db.batch();
            announcementsSnap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();

            // Track image for R20 orphaned cleanup verification
            if (event.imageUrl) {
              imagesDeleted++;
              // Note: Actual Storage deletion would require getStorage().bucket().file(path).delete()
              // For now we just track the count; images are cleaned separately
            }

            // Delete event document
            await eventDoc.ref.delete();
            totalDeleted++;
          } catch (error) {
            logger.error(`Error deleting event ${eventDoc.id}:`, error);
          }
        }
      }
    }

    logger.info("Cleanup old club events complete", {
      totalDeleted,
      imagesDeleted,
    });
  }
);

// -----------------------------
// R21: Callable Function for Dev Testing (Manual Trigger)
// -----------------------------
// Allows super admins to manually trigger the 90-day cleanup for testing

export const manualCleanupOldEvents = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  // Verify super admin
  const superAdminsDoc = await db.doc("admin/superAdmins").get();
  const superAdminUids = superAdminsDoc.exists
    ? superAdminsDoc.data()?.uids || []
    : [];
  if (!superAdminUids.includes(uid)) {
    throw new HttpsError("permission-denied", "Super admin access required");
  }

  const { daysOld = 90, dryRun = true } = request.data || {};

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  let eventsFound = 0;
  let eventsDeleted = 0;
  const eventsList = [];

  // Get all clubs
  const clubsSnap = await db.collection("clubs").get();

  for (const clubDoc of clubsSnap.docs) {
    const clubId = clubDoc.id;
    const clubName = clubDoc.data()?.name || clubId;

    const eventsSnap = await db
      .collection("clubs")
      .doc(clubId)
      .collection("events")
      .get();

    for (const eventDoc of eventsSnap.docs) {
      const event = eventDoc.data();
      const lastSlotEnd = event.lastSlotEnd?.toDate?.();

      if (lastSlotEnd && lastSlotEnd < cutoffDate) {
        eventsFound++;
        eventsList.push({
          clubName,
          eventId: eventDoc.id,
          title: event.title || "Untitled",
          endDate: lastSlotEnd.toISOString(),
          imageUrl: event.imageUrl || null,
        });

        if (!dryRun) {
          try {
            // Delete announcements first
            const announcementsSnap = await eventDoc.ref
              .collection("announcements")
              .get();
            const batch = db.batch();
            announcementsSnap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();

            await eventDoc.ref.delete();
            eventsDeleted++;
          } catch (error) {
            logger.error(`Error deleting event ${eventDoc.id}:`, error);
          }
        }
      }
    }
  }

  logger.info("Manual cleanup old events", {
    uid,
    daysOld,
    dryRun,
    eventsFound,
    eventsDeleted,
  });

  return {
    success: true,
    dryRun,
    daysOld,
    eventsFound,
    eventsDeleted,
    events: eventsList.slice(0, 50), // Limit to first 50 for response size
  };
});

// -----------------------------
// R20: Orphaned Image Cleanup (Callable)
// -----------------------------
// Lists and optionally deletes orphaned event images from Storage
export const verifyOrphanedImages = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  // Verify super admin
  const superAdminsDoc = await db.doc("admin/superAdmins").get();
  const superAdminUids = superAdminsDoc.exists
    ? superAdminsDoc.data()?.uids || []
    : [];
  if (!superAdminUids.includes(uid)) {
    throw new HttpsError("permission-denied", "Super admin access required");
  }

  const { dryRun = true } = request.data || {};
  const storage = getStorage();
  const bucket = storage.bucket();

  // Collect all imageUrls from existing events and clubs
  const existingImageUrls = new Set();
  const existingImagePaths = new Set();

  const clubsSnap = await db.collection("clubs").get();

  for (const clubDoc of clubsSnap.docs) {
    const clubData = clubDoc.data() || {};

    // Add club logo and banner
    if (clubData.logoUrl) existingImageUrls.add(clubData.logoUrl);
    if (clubData.bannerUrl) existingImageUrls.add(clubData.bannerUrl);

    const eventsSnap = await db
      .collection("clubs")
      .doc(clubDoc.id)
      .collection("events")
      .get();

    for (const eventDoc of eventsSnap.docs) {
      const imageUrl = eventDoc.data()?.imageUrl;
      if (imageUrl) {
        existingImageUrls.add(imageUrl);
      }
    }
  }

  // Extract storage paths from URLs
  for (const url of existingImageUrls) {
    if (url.startsWith("gs://")) {
      existingImagePaths.add(url.replace(/^gs:\/\/[^/]+\//, ""));
    } else if (url.includes("firebasestorage.googleapis.com")) {
      const match = url.match(/\/o\/([^?]+)/);
      if (match) {
        existingImagePaths.add(decodeURIComponent(match[1]));
      }
    }
  }

  // List all files in clubEvents and clubAssets folders
  const orphanedFiles = [];
  let deletedCount = 0;

  const prefixes = ["clubEvents/", "clubAssets/"];

  for (const prefix of prefixes) {
    try {
      const [files] = await bucket.getFiles({ prefix });

      for (const file of files) {
        const filePath = file.name;
        if (!existingImagePaths.has(filePath)) {
          orphanedFiles.push({
            path: filePath,
            size: file.metadata.size,
            created: file.metadata.timeCreated,
          });

          if (!dryRun) {
            try {
              await file.delete();
              deletedCount++;
            } catch (deleteErr) {
              logger.warn("Failed to delete orphaned file", {
                path: filePath,
                error: String(deleteErr),
              });
            }
          }
        }
      }
    } catch (listErr) {
      logger.error("Failed to list files in prefix", {
        prefix,
        error: String(listErr),
      });
    }
  }

  logger.info("Orphaned image verification/cleanup complete", {
    uid,
    dryRun,
    totalReferencedImages: existingImageUrls.size,
    orphanedFound: orphanedFiles.length,
    deleted: deletedCount,
  });

  return {
    success: true,
    dryRun,
    totalReferencedImages: existingImageUrls.size,
    orphanedFound: orphanedFiles.length,
    deleted: dryRun ? 0 : deletedCount,
    orphanedFiles: orphanedFiles.slice(0, 100), // Limit response size
  };
});
