# ⚡ Clubs Feature - Cloud Functions

This document defines the Firebase Cloud Functions required for the Clubs feature.

---

## 📋 Functions Overview

| Function                      | Trigger        | Purpose                              |
| ----------------------------- | -------------- | ------------------------------------ |
| `onClubFollow`                | Firestore      | Update follower counts               |
| `onClubUnfollow`              | Firestore      | Update follower counts               |
| `promoteToOfficial`           | HTTPS Callable | Role management                      |
| `demoteOfficial`              | HTTPS Callable | Role management                      |
| `assignPresident`             | HTTPS Callable | President assignment                 |
| `approveClubEventSaf`         | HTTPS Callable | SAF approval of events               |
| `rejectClubEventSaf`          | HTTPS Callable | SAF rejection of events              |
| `onEventCreated`              | Firestore      | Notify president & SAF moderators    |
| `onEventStatusChanged`        | Firestore      | Notify creator, SAF mods & followers |
| `onEventStarted`              | Firestore      | Notify followers                     |
| `sendEventReminders`          | Scheduled      | 15-min reminders                     |
| `cleanupOldEvents`            | Scheduled      | 90-day retention                     |
| `cleanupExpiredAnnouncements` | Scheduled      | 24-hour TTL                          |
| `updateWeeklyEventCounts`     | Scheduled      | Stats refresh                        |
| `manualCleanupOldEvents`      | HTTPS Callable | Dev testing for cleanup              |
| `verifyOrphanedImages`        | HTTPS Callable | Check orphaned images                |

---

## 📋 Notification Helpers

| Helper Function                    | Purpose                                  |
| ---------------------------------- | ---------------------------------------- |
| `createClubNotificationForUser`    | Send notification to a specific user     |
| `notifyClubFollowers`              | Send notification to all club followers  |
| `notifySafModeratorsForUniversity` | Send notification to SAF mods for a univ |
| `notifyAllUniversityUsers`         | Send notification to all users in a univ |

---

## 📁 File Structure

```
functions/
├── index.js                    # Main exports
├── clubs/
│   ├── follows.js             # Follow/unfollow triggers
│   ├── roleManagement.js      # Role HTTPS callables
│   ├── eventTriggers.js       # Event Firestore triggers
│   ├── notifications.js       # Notification senders
│   └── cleanup.js             # Scheduled cleanup
└── admin/
    └── maintenance.js         # Admin maintenance functions
```

---

## 🔧 Function Implementations

### 1. Follow/Unfollow Triggers (`clubs/follows.js`)

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * When a user follows a club (adds clubId to followedClubs array)
 * Increment the club's followerCount
 */
exports.onClubFollow = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const beforeClubs = before.followedClubs || [];
    const afterClubs = after.followedClubs || [];

    // Find newly followed clubs
    const newFollows = afterClubs.filter((c) => !beforeClubs.includes(c));

    // Find unfollowed clubs
    const unfollows = beforeClubs.filter((c) => !afterClubs.includes(c));

    const batch = db.batch();

    // Increment follower count for new follows
    for (const clubId of newFollows) {
      const clubRef = db.collection("clubs").doc(clubId);
      batch.update(clubRef, {
        followerCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Decrement follower count for unfollows
    for (const clubId of unfollows) {
      const clubRef = db.collection("clubs").doc(clubId);
      batch.update(clubRef, {
        followerCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (newFollows.length > 0 || unfollows.length > 0) {
      await batch.commit();
      console.log(
        `Updated follower counts: +${newFollows.length} -${unfollows.length}`
      );
    }

    return null;
  });
```

---

### 2. Role Management (`clubs/roleManagement.js`)

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * Validate caller has permission to manage roles for a club
 */
async function validateRoleManager(callerUid, clubId) {
  // Check super admin
  const superAdminsDoc = await db.doc("admin/superAdmins").get();
  if (superAdminsDoc.exists && superAdminsDoc.data().uids.includes(callerUid)) {
    return { authorized: true, role: "admin" };
  }

  // Get club to check university
  const clubDoc = await db.doc(`clubs/${clubId}`).get();
  if (!clubDoc.exists) {
    return { authorized: false, error: "Club not found" };
  }
  const club = clubDoc.data();

  // Check SAF moderator
  const safDoc = await db.doc("admin/safModerators").get();
  if (safDoc.exists) {
    const safData = safDoc.data();
    const uniMods = safData[club.university]?.moderators || [];
    if (uniMods.some((m) => m.uid === callerUid)) {
      return { authorized: true, role: "saf" };
    }
  }

  // Check club president
  if (club.presidentId === callerUid) {
    return { authorized: true, role: "president" };
  }

  return { authorized: false, error: "Not authorized to manage roles" };
}

/**
 * Promote a user to club official
 */
exports.promoteToOfficial = functions.https.onCall(async (data, context) => {
  // Verify authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  const { clubId, userId, roleTitle } = data;

  if (!clubId || !userId || !roleTitle) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields"
    );
  }

  // Validate caller permission
  const validation = await validateRoleManager(context.auth.uid, clubId);
  if (!validation.authorized) {
    throw new functions.https.HttpsError("permission-denied", validation.error);
  }

  // Get club info
  const clubDoc = await db.doc(`clubs/${clubId}`).get();
  const club = clubDoc.data();

  // Get user info
  const userDoc = await db.doc(`users/${userId}`).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("not-found", "User not found");
  }
  const user = userDoc.data();

  // Verify same university
  if (user.universityInfo?.university !== club.university) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "User not from same university"
    );
  }

  const batch = db.batch();

  // Update user's clubRoles
  const userRef = db.doc(`users/${userId}`);
  batch.update(userRef, {
    [`clubRoles.${clubId}`]: {
      role: "official",
      title: roleTitle,
      clubName: club.name,
      assignedBy: context.auth.uid,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });

  // Create/update member document
  const memberRef = db.doc(`clubs/${clubId}/members/${userId}`);
  batch.set(
    memberRef,
    {
      userId,
      role: "official",
      roleTitle,
      assignedBy: context.auth.uid,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      userInfo: {
        firstName: user.profile?.firstName || "",
        lastName: user.profile?.lastName || "",
        handle: user.profile?.handle || "",
        avatarConfig: user.avatarConfig || null,
        major: user.profile?.major || "",
      },
      isActive: true,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Update club member count
  const clubRef = db.doc(`clubs/${clubId}`);
  batch.update(clubRef, {
    memberCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  console.log(`Promoted ${userId} to official (${roleTitle}) in ${clubId}`);

  return { success: true };
});

/**
 * Demote an official back to regular follower
 */
exports.demoteOfficial = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  const { clubId, userId } = data;

  if (!clubId || !userId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields"
    );
  }

  const validation = await validateRoleManager(context.auth.uid, clubId);
  if (!validation.authorized) {
    throw new functions.https.HttpsError("permission-denied", validation.error);
  }

  // Can't demote president via this function
  const clubDoc = await db.doc(`clubs/${clubId}`).get();
  if (clubDoc.data().presidentId === userId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Cannot demote president via this function"
    );
  }

  const batch = db.batch();

  // Remove from user's clubRoles
  const userRef = db.doc(`users/${userId}`);
  batch.update(userRef, {
    [`clubRoles.${clubId}`]: admin.firestore.FieldValue.delete(),
  });

  // Update member document
  const memberRef = db.doc(`clubs/${clubId}/members/${userId}`);
  batch.update(memberRef, {
    role: "follower",
    roleTitle: null,
    isActive: false,
  });

  // Decrement club member count
  const clubRef = db.doc(`clubs/${clubId}`);
  batch.update(clubRef, {
    memberCount: admin.firestore.FieldValue.increment(-1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  console.log(`Demoted ${userId} from official in ${clubId}`);

  return { success: true };
});

/**
 * Assign a new president to a club (SAF/Admin only)
 */
exports.assignPresident = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  const { clubId, userId } = data;

  if (!clubId || !userId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required fields"
    );
  }

  const validation = await validateRoleManager(context.auth.uid, clubId);
  if (!validation.authorized) {
    throw new functions.https.HttpsError("permission-denied", validation.error);
  }

  // Only SAF and Admin can assign president
  if (validation.role === "president") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Presidents cannot transfer presidency"
    );
  }

  const clubDoc = await db.doc(`clubs/${clubId}`).get();
  const club = clubDoc.data();
  const previousPresidentId = club.presidentId;

  const userDoc = await db.doc(`users/${userId}`).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("not-found", "User not found");
  }
  const newPresident = userDoc.data();

  // Verify same university
  if (newPresident.universityInfo?.university !== club.university) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "User not from same university"
    );
  }

  const batch = db.batch();

  // Remove president role from previous president
  if (previousPresidentId) {
    const prevPresRef = db.doc(`users/${previousPresidentId}`);
    batch.update(prevPresRef, {
      [`clubRoles.${clubId}`]: admin.firestore.FieldValue.delete(),
    });

    // Update their member doc
    const prevMemberRef = db.doc(
      `clubs/${clubId}/members/${previousPresidentId}`
    );
    batch.update(prevMemberRef, {
      role: "follower",
      roleTitle: null,
    });
  }

  // Add president role to new president
  const newPresRef = db.doc(`users/${userId}`);
  batch.update(newPresRef, {
    [`clubRoles.${clubId}`]: {
      role: "president",
      title: "President",
      clubName: club.name,
      assignedBy: context.auth.uid,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });

  // Create/update member document for new president
  const memberRef = db.doc(`clubs/${clubId}/members/${userId}`);
  batch.set(
    memberRef,
    {
      userId,
      role: "president",
      roleTitle: "President",
      assignedBy: context.auth.uid,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      userInfo: {
        firstName: newPresident.profile?.firstName || "",
        lastName: newPresident.profile?.lastName || "",
        handle: newPresident.profile?.handle || "",
        avatarConfig: newPresident.avatarConfig || null,
        major: newPresident.profile?.major || "",
      },
      isActive: true,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Update club document
  const clubRef = db.doc(`clubs/${clubId}`);
  batch.update(clubRef, {
    presidentId: userId,
    presidentInfo: {
      firstName: newPresident.profile?.firstName || "",
      lastName: newPresident.profile?.lastName || "",
      handle: newPresident.profile?.handle || "",
      avatarConfig: newPresident.avatarConfig || null,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  console.log(`Assigned ${userId} as president of ${clubId}`);

  return { success: true };
});
```

---

### 3. Event Triggers (`clubs/eventTriggers.js`)

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { sendClubNotification } = require("./notifications");

const db = admin.firestore();

/**
 * When an event is created, notify the club president
 */
exports.onEventCreated = functions.firestore
  .document("clubs/{clubId}/events/{eventId}")
  .onCreate(async (snapshot, context) => {
    const { clubId, eventId } = context.params;
    const event = snapshot.data();

    // Only notify if status is pending
    if (event.status !== "pending_president") {
      return null;
    }

    // Get club to find president
    const clubDoc = await db.doc(`clubs/${clubId}`).get();
    const club = clubDoc.data();

    if (!club.presidentId) {
      console.log("No president to notify");
      return null;
    }

    // Send notification to president
    await sendClubNotification({
      userId: club.presidentId,
      type: "club_event_pending",
      clubId,
      eventId,
      title: "New Event Pending Approval",
      message: `"${event.title}" is waiting for your review`,
      clubInfo: {
        name: club.name,
        logoUrl: club.logoUrl,
        accentColor: club.accentColor,
      },
    });

    console.log(
      `Notified president ${club.presidentId} of pending event ${eventId}`
    );
    return null;
  });

/**
 * When an event status changes (approved, rejected, cancelled)
 */
exports.onEventStatusChanged = functions.firestore
  .document("clubs/{clubId}/events/{eventId}")
  .onUpdate(async (change, context) => {
    const { clubId, eventId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    if (before.status === after.status) {
      return null;
    }

    const clubDoc = await db.doc(`clubs/${clubId}`).get();
    const club = clubDoc.data();

    // Event was approved
    if (after.status === "approved" && before.status !== "approved") {
      // Notify creator
      await sendClubNotification({
        userId: after.createdBy,
        type: "club_event_approved",
        clubId,
        eventId,
        title: "Event Approved! 🎉",
        message: `"${after.title}" is now live`,
        clubInfo: {
          name: club.name,
          logoUrl: club.logoUrl,
          accentColor: club.accentColor,
        },
      });

      // Notify all followers (new event)
      const isReapproval =
        before.status === "pending_president" && before.approvedAt != null;

      if (isReapproval) {
        // Event was edited and re-approved
        await notifyClubFollowers(clubId, {
          type: "club_event_changed",
          eventId,
          title: `${club.name} updated an event`,
          message: `"${after.title}" has been updated`,
          clubInfo: {
            name: club.name,
            logoUrl: club.logoUrl,
            accentColor: club.accentColor,
          },
        });
      } else {
        // New event
        await notifyClubFollowers(clubId, {
          type: "club_new_event",
          eventId,
          title: `New event from ${club.name}`,
          message: after.title,
          clubInfo: {
            name: club.name,
            logoUrl: club.logoUrl,
            accentColor: club.accentColor,
          },
        });
      }

      // Update club stats
      await updateClubEventStats(clubId);
    }

    // Event was rejected
    if (after.status === "rejected") {
      await sendClubNotification({
        userId: after.createdBy,
        type: "club_event_rejected",
        clubId,
        eventId,
        title: "Event Not Approved",
        message: after.rejectionReason || `"${after.title}" was not approved`,
        clubInfo: {
          name: club.name,
          logoUrl: club.logoUrl,
          accentColor: club.accentColor,
        },
      });
    }

    // Event was cancelled (deleted after approval)
    if (after.status === "cancelled" && before.status === "approved") {
      await notifyClubFollowers(clubId, {
        type: "club_event_cancelled",
        eventId,
        title: `Event cancelled`,
        message: `"${after.title}" from ${club.name} has been cancelled`,
        clubInfo: {
          name: club.name,
          logoUrl: club.logoUrl,
          accentColor: club.accentColor,
        },
      });

      await updateClubEventStats(clubId);
    }

    return null;
  });

/**
 * When an event is marked as started (isLive becomes true)
 */
exports.onEventStarted = functions.firestore
  .document("clubs/{clubId}/events/{eventId}")
  .onUpdate(async (change, context) => {
    const { clubId, eventId } = context.params;
    const before = change.before.data();
    const after = change.after.data();

    // Check if event just started
    if (!before.isLive && after.isLive) {
      const clubDoc = await db.doc(`clubs/${clubId}`).get();
      const club = clubDoc.data();

      // Create "Event is now live!" announcement
      await db
        .collection(`clubs/${clubId}/events/${eventId}/announcements`)
        .add({
          content: "Event is now live! 🎉",
          postedBy: after.startedBy,
          posterInfo: after.startedByInfo,
          type: "event_live",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: after.lastSlotEnd
            ? new Date(
                after.lastSlotEnd.toDate().getTime() + 24 * 60 * 60 * 1000
              )
            : new Date(Date.now() + 48 * 60 * 60 * 1000),
        });

      // Notify followers
      await notifyClubFollowers(clubId, {
        type: "club_event_started",
        eventId,
        title: "🔴 Event is LIVE!",
        message: `"${after.title}" is happening now!`,
        clubInfo: {
          name: club.name,
          logoUrl: club.logoUrl,
          accentColor: club.accentColor,
        },
      });

      console.log(`Event ${eventId} started, notified followers`);
    }

    return null;
  });

/**
 * Helper: Notify all followers of a club
 */
async function notifyClubFollowers(clubId, notificationData) {
  // Query users who follow this club
  const followersSnapshot = await db
    .collection("users")
    .where("followedClubs", "array-contains", clubId)
    .get();

  const batch = db.batch();
  let count = 0;

  for (const userDoc of followersSnapshot.docs) {
    const notifRef = db.collection("notifications").doc();
    batch.set(notifRef, {
      userId: userDoc.id,
      clubId,
      ...notificationData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "pending",
      readAt: null,
    });
    count++;

    // Firestore batch limit is 500
    if (count >= 400) {
      await batch.commit();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(
    `Sent ${notificationData.type} to ${followersSnapshot.size} followers`
  );
}

/**
 * Helper: Update club event statistics
 */
async function updateClubEventStats(clubId) {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Count events this week
  const eventsThisWeek = await db
    .collection(`clubs/${clubId}/events`)
    .where("status", "==", "approved")
    .where("firstSlotStart", ">=", now)
    .where("firstSlotStart", "<=", weekFromNow)
    .get();

  // Find next event date
  const nextEvent = await db
    .collection(`clubs/${clubId}/events`)
    .where("status", "==", "approved")
    .where("firstSlotStart", ">=", now)
    .orderBy("firstSlotStart", "asc")
    .limit(1)
    .get();

  const updates = {
    eventsThisWeek: eventsThisWeek.size,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!nextEvent.empty) {
    updates.nextEventDate = nextEvent.docs[0].data().firstSlotStart;
  } else {
    updates.nextEventDate = null;
  }

  await db.doc(`clubs/${clubId}`).update(updates);
}
```

---

### 4. Scheduled Cleanup (`clubs/cleanup.js`)

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * Clean up events older than 90 days
 * Runs daily at 3:00 AM UTC
 */
exports.cleanupOldEvents = functions.pubsub
  .schedule("0 3 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    console.log(`Cleaning up events older than ${ninetyDaysAgo.toISOString()}`);

    // Query old approved events
    const oldEvents = await db
      .collectionGroup("events")
      .where("status", "==", "approved")
      .where("lastSlotEnd", "<", ninetyDaysAgo)
      .get();

    console.log(`Found ${oldEvents.size} old events to delete`);

    let deleteCount = 0;

    for (const eventDoc of oldEvents.docs) {
      try {
        // Delete event images from Storage
        const event = eventDoc.data();
        if (event.imageUrl) {
          // Parse storage path and delete
          // (Implementation depends on your storage structure)
        }

        // Delete announcements subcollection first
        const announcementDocs = await eventDoc.ref
          .collection("announcements")
          .get();
        const batch = db.batch();
        announcementDocs.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();

        // Delete event document
        await eventDoc.ref.delete();
        deleteCount++;
      } catch (error) {
        console.error(`Error deleting event ${eventDoc.id}:`, error);
      }
    }

    // Also clean up rejected/pending events older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const staleEvents = await db
      .collectionGroup("events")
      .where("status", "in", [
        "pending_president",
        "pending_saf",
        "rejected",
        "draft",
      ])
      .where("createdAt", "<", thirtyDaysAgo)
      .get();

    for (const eventDoc of staleEvents.docs) {
      try {
        await eventDoc.ref.delete();
        deleteCount++;
      } catch (error) {
        console.error(`Error deleting stale event ${eventDoc.id}:`, error);
      }
    }

    console.log(`Deleted ${deleteCount} total events`);
    return null;
  });

/**
 * Clean up expired announcements
 * Runs every hour
 */
exports.cleanupExpiredAnnouncements = functions.pubsub
  .schedule("0 * * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    const now = new Date();

    const expiredAnnouncements = await db
      .collectionGroup("announcements")
      .where("expiresAt", "<", now)
      .get();

    console.log(`Found ${expiredAnnouncements.size} expired announcements`);

    // Delete in batches
    const batchSize = 400;
    let batch = db.batch();
    let count = 0;

    for (const annDoc of expiredAnnouncements.docs) {
      batch.delete(annDoc.ref);
      count++;

      if (count >= batchSize) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    console.log(`Deleted ${expiredAnnouncements.size} expired announcements`);
    return null;
  });

/**
 * Update weekly event counts for all clubs
 * Runs daily at 00:05 UTC
 */
exports.updateWeeklyEventCounts = functions.pubsub
  .schedule("5 0 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    const clubs = await db
      .collection("clubs")
      .where("isActive", "==", true)
      .get();

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const clubDoc of clubs.docs) {
      try {
        const eventsThisWeek = await db
          .collection(`clubs/${clubDoc.id}/events`)
          .where("status", "==", "approved")
          .where("firstSlotStart", ">=", now)
          .where("firstSlotStart", "<=", weekFromNow)
          .get();

        const nextEvent = await db
          .collection(`clubs/${clubDoc.id}/events`)
          .where("status", "==", "approved")
          .where("firstSlotStart", ">=", now)
          .orderBy("firstSlotStart", "asc")
          .limit(1)
          .get();

        await clubDoc.ref.update({
          eventsThisWeek: eventsThisWeek.size,
          nextEventDate: nextEvent.empty
            ? null
            : nextEvent.docs[0].data().firstSlotStart,
        });
      } catch (error) {
        console.error(`Error updating stats for club ${clubDoc.id}:`, error);
      }
    }

    console.log(`Updated event counts for ${clubs.size} clubs`);
    return null;
  });

/**
 * Send event reminders (15 minutes before)
 * Runs every 5 minutes
 */
exports.sendEventReminders = functions.pubsub
  .schedule("*/5 * * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    const now = new Date();
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
    const twentyMinutesFromNow = new Date(now.getTime() + 20 * 60 * 1000);

    // Find events starting in ~15 minutes that haven't sent reminders
    const upcomingEvents = await db
      .collectionGroup("events")
      .where("status", "==", "approved")
      .where("firstSlotStart", ">=", fifteenMinutesFromNow)
      .where("firstSlotStart", "<", twentyMinutesFromNow)
      .get();

    for (const eventDoc of upcomingEvents.docs) {
      const event = eventDoc.data();

      // Check if reminder already sent (use a flag)
      if (event.reminderSent) continue;

      // Get club info
      const clubId = eventDoc.ref.parent.parent.id;
      const clubDoc = await db.doc(`clubs/${clubId}`).get();
      const club = clubDoc.data();

      // Mark reminder as sent
      await eventDoc.ref.update({ reminderSent: true });

      // Notify followers
      const followersSnapshot = await db
        .collection("users")
        .where("followedClubs", "array-contains", clubId)
        .get();

      const batch = db.batch();

      for (const userDoc of followersSnapshot.docs) {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          userId: userDoc.id,
          type: "club_event_reminder",
          clubId,
          eventId: eventDoc.id,
          title: "⏰ Event starting soon!",
          message: `"${event.title}" starts in 15 minutes`,
          clubInfo: {
            name: club.name,
            logoUrl: club.logoUrl,
            accentColor: club.accentColor,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "pending",
          readAt: null,
        });
      }

      await batch.commit();
      console.log(
        `Sent reminder for event ${eventDoc.id} to ${followersSnapshot.size} followers`
      );
    }

    return null;
  });

/**
 * Clean up old club notifications (30+ days)
 * Runs weekly on Sunday at 4:00 AM UTC
 */
exports.cleanupOldClubNotifications = functions.pubsub
  .schedule("0 4 * * 0")
  .timeZone("UTC")
  .onRun(async (context) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Club notification types
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
      const oldNotifications = await db
        .collection("notifications")
        .where("type", "==", type)
        .where("createdAt", "<", thirtyDaysAgo)
        .limit(400)
        .get();

      if (oldNotifications.empty) continue;

      const batch = db.batch();
      oldNotifications.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      totalDeleted += oldNotifications.size;
    }

    console.log(`Deleted ${totalDeleted} old club notifications`);
    return null;
  });

/**
 * Manual Cleanup for Dev Testing (R21)
 * Allows super admins to trigger cleanup with custom parameters
 */
exports.manualCleanupOldEvents = onCall(async (request) => {
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
        });

        if (!dryRun) {
          // Delete announcements first
          const announcementsSnap = await eventDoc.ref
            .collection("announcements")
            .get();
          const batch = db.batch();
          announcementsSnap.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();

          await eventDoc.ref.delete();
          eventsDeleted++;
        }
      }
    }
  }

  return {
    success: true,
    dryRun,
    daysOld,
    eventsFound,
    eventsDeleted,
    events: eventsList.slice(0, 50), // Limit response size
  };
});

/**
 * Orphaned Image Verification (R20)
 * Lists all event image URLs to verify against Storage
 */
exports.verifyOrphanedImages = onCall(async (request) => {
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

  const existingImageUrls = [];
  const clubsSnap = await db.collection("clubs").get();

  for (const clubDoc of clubsSnap.docs) {
    const eventsSnap = await db
      .collection("clubs")
      .doc(clubDoc.id)
      .collection("events")
      .get();

    for (const eventDoc of eventsSnap.docs) {
      const imageUrl = eventDoc.data()?.imageUrl;
      if (imageUrl) {
        existingImageUrls.push({
          clubId: clubDoc.id,
          eventId: eventDoc.id,
          imageUrl,
        });
      }
    }
  }

  return {
    success: true,
    totalEventsWithImages: existingImageUrls.size,
    images: existingImageUrls.slice(0, 100), // Limit response
    message: "Compare against Storage bucket listing to find orphans",
  };
});
```

---

### 5. Notification Sender (`clubs/notifications.js`)

```javascript
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * Send a club notification to a specific user
 */
async function sendClubNotification(data) {
  const { userId, type, clubId, eventId, title, message, clubInfo } = data;

  // Create notification document
  const notificationRef = db.collection("notifications").doc();
  await notificationRef.set({
    userId,
    type,
    clubId,
    eventId: eventId || null,
    title,
    message,
    clubInfo: clubInfo || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "pending",
    readAt: null,
  });

  // Send push notification via FCM
  try {
    // Get user's FCM tokens
    const tokensSnapshot = await db
      .collection(`users/${userId}/fcmTokens`)
      .get();

    if (tokensSnapshot.empty) {
      console.log(`No FCM tokens for user ${userId}`);
      return;
    }

    const tokens = tokensSnapshot.docs.map((doc) => doc.data().token);

    const payload = {
      notification: {
        title,
        body: message,
        icon: clubInfo?.logoUrl || "/icons/icon-192x192.png",
      },
      data: {
        type,
        clubId: clubId || "",
        eventId: eventId || "",
        click_action: eventId
          ? `/#club?id=${clubId}&event=${eventId}`
          : `/#club?id=${clubId}`,
      },
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      ...payload,
    });

    console.log(
      `Push sent to ${response.successCount}/${tokens.length} devices for user ${userId}`
    );

    // Clean up invalid tokens
    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        resp.error?.code === "messaging/registration-token-not-registered"
      ) {
        db.doc(`users/${userId}/fcmTokens/${tokens[idx]}`).delete();
      }
    });
  } catch (error) {
    console.error(`Error sending push to ${userId}:`, error);
  }
}

module.exports = { sendClubNotification };
```

---

## 📦 Deployment

### Deploy all club functions:

```bash
firebase deploy --only functions:onClubFollow,functions:promoteToOfficial,functions:demoteOfficial,functions:assignPresident,functions:onEventCreated,functions:onEventStatusChanged,functions:onEventStarted,functions:cleanupOldEvents,functions:cleanupExpiredAnnouncements,functions:updateWeeklyEventCounts,functions:sendEventReminders,functions:cleanupOldClubNotifications
```

### Or deploy by file:

```bash
firebase deploy --only functions:clubs-follows
firebase deploy --only functions:clubs-roleManagement
firebase deploy --only functions:clubs-eventTriggers
firebase deploy --only functions:clubs-cleanup
```

---

## 🔗 Related Documents

- [Data-Model.md](./Data-Model.md) — Schema definitions
- [Firestore-Rules.md](./Firestore-Rules.md) — Security rules
- [Implementation-Plan.md](./Implementation-Plan.md) — Build phases

---

_End of Cloud Functions_
