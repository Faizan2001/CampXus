# 🔐 Clubs Feature - Admin System

This document details the admin dashboard and role management system.

---

## 🎯 Overview

The admin system has three tiers:

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPER ADMIN (You)                        │
│  • Full system access                                       │
│  • Manage SAF moderators                                    │
│  • Manage all clubs & presidents                            │
│  • System maintenance functions                             │
│  • Access /admin dashboard                                  │
├─────────────────────────────────────────────────────────────┤
│                 SAF MODERATORS (per university)             │
│  • Create/delete clubs in their university                  │
│  • Assign club presidents                                   │
│  • Approve events (when required)                           │
│  • Moderate content                                         │
│  • Access "Moderate" tab in Clubs page                      │
├─────────────────────────────────────────────────────────────┤
│                 CLUB PRESIDENTS                             │
│  • Manage their own club                                    │
│  • Approve/reject events                                    │
│  • Promote/demote officials                                 │
│  • Access "Moderate" tab in their club page                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Admin Route (`/admin`)

### Access Requirements

1. **UID Check**: User's UID must be in `/admin/superAdmins.uids`
2. **PIN Verification**: Secondary 6-digit PIN required on entry

### Implementation Flow

```javascript
// Router check for admin route
{
  admin: {
    title: "Admin Dashboard - MeetchuThere",
    template: "/templates/admin.html",
    cssFiles: ["/src/css/admin.css"],
    jsImporters: [() => import("/src/js/pages/AdminPage.js")],
    requiresAuth: true,
    requiresSuperAdmin: true,  // Custom flag
    indexable: false
  }
}

// In Router.js - add super admin check
async checkSuperAdmin() {
  const uid = currentUser?.uid;
  if (!uid) return false;

  try {
    const superAdminsDoc = await getDoc(doc(db, 'admin', 'superAdmins'));
    if (!superAdminsDoc.exists()) return false;
    return superAdminsDoc.data().uids.includes(uid);
  } catch (error) {
    console.error('Super admin check failed:', error);
    return false;
  }
}
```

### PIN Verification

```javascript
// AdminPage.js
class AdminPage {
  constructor() {
    this.isVerified = false;
    this.pinAttempts = 0;
    this.maxAttempts = 3;
  }

  async mount() {
    // Show PIN modal first
    this.showPinModal();
  }

  showPinModal() {
    const modal = document.createElement("div");
    modal.className = "admin-pin-modal";
    modal.innerHTML = `
      <div class="pin-modal-content">
        <div class="pin-modal-icon">🔐</div>
        <h2>Admin Verification</h2>
        <p>Enter your 6-digit admin PIN</p>
        <div class="pin-input-container">
          <input type="password" id="adminPin" maxlength="6" 
                 pattern="[0-9]{6}" inputmode="numeric"
                 autocomplete="off" />
        </div>
        <p class="pin-attempts" id="pinAttempts"></p>
        <button id="verifyPinBtn" class="btn primary">Verify</button>
      </div>
    `;

    document.body.appendChild(modal);

    const input = document.getElementById("adminPin");
    const btn = document.getElementById("verifyPinBtn");

    input.focus();

    btn.addEventListener("click", () => this.verifyPin(input.value));
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.verifyPin(input.value);
    });
  }

  async verifyPin(pin) {
    if (this.pinAttempts >= this.maxAttempts) {
      notificationManager.showErrorNotification(
        "Too many attempts. Please reload."
      );
      return;
    }

    try {
      // Call Cloud Function to verify PIN (hashed comparison server-side)
      const verifyFn = httpsCallable(functions, "verifyAdminPin");
      const result = await verifyFn({ pin });

      if (result.data.success) {
        this.isVerified = true;
        document.querySelector(".admin-pin-modal").remove();
        this.renderDashboard();
      } else {
        this.pinAttempts++;
        document.getElementById("pinAttempts").textContent = `${
          this.maxAttempts - this.pinAttempts
        } attempts remaining`;
        document.getElementById("adminPin").value = "";
        notificationManager.showErrorNotification("Invalid PIN");
      }
    } catch (error) {
      console.error("PIN verification error:", error);
      notificationManager.showErrorNotification("Verification failed");
    }
  }
}
```

---

## 📊 Admin Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ 🔐 Admin Dashboard                            [Logout Admin]│
├─────────────────────────────────────────────────────────────┤
│ [Overview] [Universities] [SAF] [Clubs] [Maintenance]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  OVERVIEW TAB                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ Universities │ │ Total Clubs  │ │ Total Users  │        │
│  │      1       │ │      25      │ │     300      │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ SAF Mods     │ │ Active Events│ │ Pending Events│       │
│  │      2       │ │      8       │ │      3       │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                             │
│  Recent Activity                                            │
│  • 2 minutes ago: New event pending in IUB Football        │
│  • 15 minutes ago: Sara promoted to official               │
│  • 1 hour ago: New club "IUB Chess" created                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏫 Universities Tab

```
┌─────────────────────────────────────────────────────────────┐
│ UNIVERSITIES                          [+ Add University]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ IUB - Independent University Bangladesh          [Edit] │ │
│ │ • 25 clubs  • 300 users  • 2 SAF moderators             │ │
│ │ • Last activity: 2 minutes ago                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ NSU - North South University                     [Edit] │ │
│ │ • 0 clubs  • 0 users  • 0 SAF moderators                │ │
│ │ • Status: Pending setup                                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 👮 SAF Moderators Tab

```
┌─────────────────────────────────────────────────────────────┐
│ SAF MODERATORS                          [+ Add Moderator]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Filter by University: [All ▼]                               │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👤 Dr. Rahman                                  [Remove] │ │
│ │ • rahman@iub.edu.bd                                     │ │
│ │ • University: IUB                                       │ │
│ │ • Assigned: Nov 15, 2025                                │ │
│ │ • Clubs managed: 12 events approved, 3 clubs created    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 👤 Ms. Fatima                                  [Remove] │ │
│ │ • fatima@iub.edu.bd                                     │ │
│ │ • University: IUB                                       │ │
│ │ • Assigned: Nov 20, 2025                                │ │
│ │ • Clubs managed: 5 events approved, 1 clubs created     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Add Moderator Modal

```html
<div class="add-moderator-modal">
  <h2>Add SAF Moderator</h2>
  <form id="addModeratorForm">
    <div class="form-group">
      <label>University</label>
      <select name="university" required>
        <option value="iub">IUB</option>
        <!-- Other universities -->
      </select>
    </div>
    <div class="form-group">
      <label>User Handle or Email</label>
      <input
        type="text"
        name="userIdentifier"
        placeholder="@handle or email"
        required
      />
    </div>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="closeModal()">
        Cancel
      </button>
      <button type="submit" class="btn primary">Add Moderator</button>
    </div>
  </form>
</div>
```

---

## 🎭 Clubs Tab

```
┌─────────────────────────────────────────────────────────────┐
│ CLUBS                                      [+ Create Club]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Filter: [All Universities ▼] [All Status ▼] [Search...]    │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🏈 IUB Football Club                    [Edit] [Delete] │ │
│ │ • President: Ahmed Khan (@ahmed)                        │ │
│ │ • 234 followers • 15 officials                          │ │
│ │ • 3 events this week                                    │ │
│ │ • SAF Approval: Required                                │ │
│ │ • Status: Active                                        │ │
│ │                                          [Change Pres.] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎭 IUB Drama Society                    [Edit] [Delete] │ │
│ │ • President: None assigned                              │ │
│ │ • 45 followers • 0 officials                            │ │
│ │ • 0 events this week                                    │ │
│ │ • SAF Approval: Not required                            │ │
│ │ • Status: Active                                        │ │
│ │                                          [Assign Pres.] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Create Club Modal

```html
<div class="create-club-modal">
  <h2>Create New Club</h2>
  <form id="createClubForm">
    <div class="form-group">
      <label>University *</label>
      <select name="university" required>
        <option value="iub">IUB</option>
      </select>
    </div>
    <div class="form-group">
      <label>Club Name *</label>
      <input type="text" name="name" maxlength="100" required />
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea name="description" maxlength="500"></textarea>
    </div>
    <div class="form-group">
      <label>Accent Color *</label>
      <div class="color-palette">
        <button
          type="button"
          class="color-option"
          data-color="blue"
          style="background: linear-gradient(135deg, #667eea, #764ba2)"
        ></button>
        <button
          type="button"
          class="color-option"
          data-color="purple"
          style="background: linear-gradient(135deg, #9b67f8, #c471ed)"
        ></button>
        <button
          type="button"
          class="color-option"
          data-color="green"
          style="background: linear-gradient(135deg, #11998e, #38ef7d)"
        ></button>
        <button
          type="button"
          class="color-option"
          data-color="orange"
          style="background: linear-gradient(135deg, #f2994a, #f2c94c)"
        ></button>
        <button
          type="button"
          class="color-option"
          data-color="red"
          style="background: linear-gradient(135deg, #eb5757, #ff6b6b)"
        ></button>
        <button
          type="button"
          class="color-option"
          data-color="pink"
          style="background: linear-gradient(135deg, #ec4899, #f472b6)"
        ></button>
        <button
          type="button"
          class="color-option"
          data-color="teal"
          style="background: linear-gradient(135deg, #14b8a6, #2dd4bf)"
        ></button>
        <button
          type="button"
          class="color-option"
          data-color="indigo"
          style="background: linear-gradient(135deg, #6366f1, #818cf8)"
        ></button>
      </div>
      <input type="hidden" name="accentColor" value="blue" />
    </div>
    <div class="form-group">
      <label>Logo (Optional)</label>
      <input type="file" name="logo" accept="image/*" />
    </div>
    <div class="form-group">
      <label>Banner (Optional)</label>
      <input type="file" name="banner" accept="image/*" />
    </div>
    <div class="form-group">
      <label>
        <input type="checkbox" name="requireSafApproval" />
        Require SAF approval for events
      </label>
    </div>
    <div class="form-group">
      <label>Assign President (Optional)</label>
      <input type="text" name="presidentHandle" placeholder="@handle" />
    </div>
    <div class="form-actions">
      <button type="button" class="btn secondary" onclick="closeModal()">
        Cancel
      </button>
      <button type="submit" class="btn primary">Create Club</button>
    </div>
  </form>
</div>
```

---

## 🔧 Maintenance Tab

```
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM MAINTENANCE                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ⚠️ These actions are irreversible. Use with caution.        │
│                                                             │
│ DATA CLEANUP                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🗑️ Clear Old Events                                      │ │
│ │ Delete all events older than 90 days (approved)          │ │
│ │ Delete all pending/rejected events older than 30 days    │ │
│ │                                           [Run Cleanup]  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🗑️ Clear Expired Announcements                           │ │
│ │ Delete all announcements past their expiry time          │ │
│ │                                           [Run Cleanup]  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ SEMESTER RESET                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📅 Clear University Schedules                            │ │
│ │ University: [Select ▼]                                   │ │
│ │ Warning: This will clear ALL student schedules for the   │ │
│ │ selected university. Students will need to re-import.    │ │
│ │                                    [Clear Schedules]     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ DATA INTEGRITY                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔄 Rebuild Club Stats                                    │ │
│ │ Recalculate follower counts, member counts, and event   │ │
│ │ statistics for all clubs.                                │ │
│ │                                           [Rebuild]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔄 Sync Denormalized Data                                │ │
│ │ Update all denormalized user info in clubs, events,      │ │
│ │ and member documents.                                    │ │
│ │                                              [Sync]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## ☁️ Admin Cloud Functions

```javascript
// functions/admin/maintenance.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

/**
 * Verify admin PIN (hashed comparison)
 */
exports.verifyAdminPin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  // Check super admin
  const superAdminsDoc = await db.doc("admin/superAdmins").get();
  if (
    !superAdminsDoc.exists ||
    !superAdminsDoc.data().uids.includes(context.auth.uid)
  ) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Not a super admin"
    );
  }

  const { pin } = data;
  const storedHash = superAdminsDoc.data().pinHash;

  // Use bcrypt or similar for real implementation
  const crypto = require("crypto");
  const inputHash = crypto.createHash("sha256").update(pin).digest("hex");

  if (inputHash === storedHash) {
    return { success: true };
  }

  return { success: false };
});

/**
 * Add SAF moderator
 * SAF moderator documents are stored at /safModerators/{uid} (not under /admin/)
 */
exports.addSafModerator = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  // Verify super admin
  const superAdminsDoc = await db.doc("admin/superAdmins").get();
  if (
    !superAdminsDoc.exists ||
    !superAdminsDoc.data().uids.includes(context.auth.uid)
  ) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized");
  }

  const { university, userId, name, email } = data;

  // Create SAF moderator document at /safModerators/{uid}
  await db.doc(`safModerators/${userId}`).set({
    uid: userId,
    displayName: name,
    email,
    universityId: university,
    addedAt: admin.firestore.FieldValue.serverTimestamp(),
    addedBy: context.auth.uid,
  });

  // Update user's safModeratorFor
  await db.doc(`users/${userId}`).update({
    safModeratorFor: admin.firestore.FieldValue.arrayUnion(university),
  });

  return { success: true };
});

/**
 * Remove SAF moderator
 * SAF moderator documents are stored at /safModerators/{uid}
 */
exports.removeSafModerator = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  const superAdminsDoc = await db.doc("admin/superAdmins").get();
  if (
    !superAdminsDoc.exists ||
    !superAdminsDoc.data().uids.includes(context.auth.uid)
  ) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized");
  }

  const { university, userId } = data;

  // Delete SAF moderator document at /safModerators/{uid}
  await db.doc(`safModerators/${userId}`).delete();

  // Update user's safModeratorFor
  await db.doc(`users/${userId}`).update({
    safModeratorFor: admin.firestore.FieldValue.arrayRemove(university),
  });

  return { success: true };
});

/**
 * Clear university schedules (semester reset)
 */
exports.clearUniversitySchedules = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be logged in"
      );
    }

    const superAdminsDoc = await db.doc("admin/superAdmins").get();
    if (
      !superAdminsDoc.exists ||
      !superAdminsDoc.data().uids.includes(context.auth.uid)
    ) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Not authorized"
      );
    }

    const { university } = data;

    // Get all users from university
    const usersSnapshot = await db
      .collection("users")
      .where("universityInfo.university", "==", university)
      .get();

    // Clear schedules in batches
    const batchSize = 400;
    let batch = db.batch();
    let count = 0;

    for (const userDoc of usersSnapshot.docs) {
      batch.update(userDoc.ref, {
        "scheduleData.schedule": {},
        "scheduleData.slotInfo": {},
        "scheduleData.metadata.isEmpty": true,
        "scheduleData.metadata.totalClasses": 0,
        "scheduleData.metadata.lastModified":
          admin.firestore.FieldValue.serverTimestamp(),
      });

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

    console.log(
      `Cleared schedules for ${usersSnapshot.size} users in ${university}`
    );

    return { success: true, cleared: usersSnapshot.size };
  }
);

/**
 * Rebuild club statistics
 */
exports.rebuildClubStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  const superAdminsDoc = await db.doc("admin/superAdmins").get();
  if (
    !superAdminsDoc.exists ||
    !superAdminsDoc.data().uids.includes(context.auth.uid)
  ) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized");
  }

  const clubs = await db.collection("clubs").get();
  let updated = 0;

  for (const clubDoc of clubs.docs) {
    const clubId = clubDoc.id;

    // Count followers
    const followersCount = await db
      .collection("users")
      .where("followedClubs", "array-contains", clubId)
      .count()
      .get();

    // Count members (officials + president)
    const membersCount = await db
      .collection(`clubs/${clubId}/members`)
      .where("role", "in", ["official", "president"])
      .where("isActive", "==", true)
      .count()
      .get();

    // Count events this week
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const eventsThisWeek = await db
      .collection(`clubs/${clubId}/events`)
      .where("status", "==", "approved")
      .where("firstSlotStart", ">=", now)
      .where("firstSlotStart", "<=", weekFromNow)
      .count()
      .get();

    // Get next event
    const nextEvent = await db
      .collection(`clubs/${clubId}/events`)
      .where("status", "==", "approved")
      .where("firstSlotStart", ">=", now)
      .orderBy("firstSlotStart", "asc")
      .limit(1)
      .get();

    // Update club
    await clubDoc.ref.update({
      followerCount: followersCount.data().count,
      memberCount: membersCount.data().count,
      eventsThisWeek: eventsThisWeek.data().count,
      nextEventDate: nextEvent.empty
        ? null
        : nextEvent.docs[0].data().firstSlotStart,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    updated++;
  }

  return { success: true, updated };
});

/**
 * Manual cleanup trigger
 */
exports.runManualCleanup = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be logged in"
    );
  }

  const superAdminsDoc = await db.doc("admin/superAdmins").get();
  if (
    !superAdminsDoc.exists ||
    !superAdminsDoc.data().uids.includes(context.auth.uid)
  ) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized");
  }

  const { type } = data;

  switch (type) {
    case "events":
      // Call the cleanup function logic directly
      // (Similar to cleanupOldEvents scheduled function)
      break;
    case "announcements":
      // Call the announcements cleanup logic
      break;
    default:
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Unknown cleanup type"
      );
  }

  return { success: true };
});
```

---

## 🔐 Initial Setup

### 1. Create Super Admin Document

```javascript
// Run once to set up your admin access
// (Use Firebase Console or Admin SDK)

const adminData = {
  uids: ["YOUR_FIREBASE_UID_HERE"],
  pinHash: "SHA256_HASH_OF_YOUR_PIN", // Use crypto to generate
  updatedAt: serverTimestamp(),
};

await setDoc(doc(db, "admin", "superAdmins"), adminData);
```

### 2. Generate PIN Hash

```javascript
const crypto = require("crypto");
const pin = "123456"; // Your chosen 6-digit PIN
const hash = crypto.createHash("sha256").update(pin).digest("hex");
console.log("PIN Hash:", hash);
```

### 3. Set isSuperAdmin on User Doc

```javascript
// Update your user document
await updateDoc(doc(db, "users", "YOUR_UID"), {
  isSuperAdmin: true,
});
```

---

## 🔗 Related Documents

- [PRD.md](./PRD.md) — Role definitions
- [Firestore-Rules.md](./Firestore-Rules.md) — Permission rules
- [Cloud-Functions.md](./Cloud-Functions.md) — Admin functions
- [Implementation-Plan.md](./Implementation-Plan.md) — Phase 7 details

---

_End of Admin System_
