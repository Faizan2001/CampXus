# 🗄️ Clubs Feature - Data Model

This document defines the Firestore database schema for the Clubs feature.

---

## 📊 Collection Overview

```
firestore/
├── clubs/                      # Club documents
│   └── {clubId}/
│       ├── events/             # Subcollection: club events
│       │   └── {eventId}/
│       │       └── announcements/  # Subcollection: live timeline announcements
│       └── members/            # Subcollection: club membership
├── users/                      # Existing - add clubRoles field
├── notifications/              # Existing - add club notification types
├── safModerators/              # SAF moderator documents (keyed by user UID)
│   └── {userId}                # Individual moderator doc with universityId
├── admin/
│   ├── superAdmins             # Super admin UIDs
│   └── clubConfig              # Global club settings
└── universities/               # Existing - add club settings
```

---

## 📝 Schema Definitions

### 1. Club Document (`/clubs/{clubId}`)

```javascript
{
  // === Identity ===
  clubId: "iub_football_club",              // Auto-generated or slugified
  name: "IUB Football Club",                 // Display name
  description: "Official football club...",  // Max 500 chars

  // === University Fields ===
  // IMPORTANT: Use universityId for programmatic comparisons (e.g., SAF moderator scoping)
  universityId: "iub",                       // University ID (for queries and security rules)
  universityCode: "iub",                     // Alias for universityId (legacy compatibility)
  university: "Independent University, Bangladesh", // Human-readable name (for display)
  universityName: "Independent University, Bangladesh", // Alias for university (legacy)

  // === Branding ===
  logoUrl: "gs://bucket/clubs/iub_football/logo.webp",
  bannerUrl: "gs://bucket/clubs/iub_football/banner.webp",
  accentColor: "blue",                       // Preset palette key
  // Palette options: "blue", "purple", "green", "orange", "red", "pink", "teal", "indigo"

  // === Leadership ===
  presidentId: "user_uid_123",               // Current president
  presidentInfo: {                           // Denormalized for display
    firstName: "Ahmed",
    lastName: "Khan",
    handle: "ahmed",
    avatarConfig: { ... }
  },

  // === Settings ===
  // NOTE: requireSafApproval is DEPRECATED - SAF approval is now mandatory for ALL events
  // This field may still exist on legacy clubs but is no longer used
  requireSafApproval: true,                  // DEPRECATED: Always true now (SAF approval mandatory)
  isActive: true,                            // Can be deactivated by SAF/Admin

  // === Stats (denormalized for performance) ===
  followerCount: 234,
  memberCount: 15,                           // Officials + President
  eventsThisWeek: 2,                         // Updated by Cloud Function
  nextEventDate: Timestamp | null,           // Updated when events change

  // === Development/Testing (optional) ===
  devTest: false,                            // True for dev-only test clubs
  devOwnerUid: null | "dev_uid",             // Dev user treated as president for devTest clubs

  // === Metadata ===
  createdAt: Timestamp,
  createdBy: "admin_uid",                    // Who created this club
  updatedAt: Timestamp,
  lastEventAt: Timestamp | null              // Last approved event time
}
```

**Indexes needed**:

```
clubs: university ASC, isActive ASC, name ASC
clubs: university ASC, nextEventDate ASC
```

---

### 2. Event Document (`/clubs/{clubId}/events/{eventId}`)

```javascript
{
  // === Identity ===
  eventId: "evt_abc123",                     // Auto-generated
  clubId: "iub_football_club",               // Parent reference

  // === Content ===
  title: "Annual Football Tournament",       // Max 100 chars
  description: "Join us for the biggest...", // Max 1000 chars
  location: "IUB Main Ground",               // Text, max 200 chars
  imageUrl: "gs://bucket/events/evt_abc123/hero.webp" | null,

  // === Scheduling (supports multi-day and overnight events) ===
  timeSlots: [
    {
      date: "2025-12-01",                    // YYYY-MM-DD format
      startTime: "19:00",                    // HH:mm 24-hour format
      endTime: "22:00"
    },
    {
      date: "2025-12-03",
      startTime: "19:00",
      endTime: "22:00"
    }
  ],
  // OVERNIGHT EVENTS: If endTime < startTime (e.g., "22:00" to "01:00"),
  // the event ends on the NEXT DAY. The system handles this automatically
  // by adding 1 day to the end date during calculations.

  // Computed fields (for querying)
  firstSlotStart: Timestamp,                 // Earliest start across all slots
  lastSlotEnd: Timestamp,                    // Latest end across all slots (adjusted for overnight)

  // === Status ===
  status: "approved",
  // Possible values:
  // - "draft"              : Not submitted
  // - "pending_president"  : Awaiting president approval
  // - "pending_saf"        : Awaiting SAF approval (if required)
  // - "approved"           : Visible to students
  // - "rejected"           : Not approved
  // - "cancelled"          : Was approved, now cancelled

  // === Rejection Info (populated when status = "rejected") ===
  rejectedBy: "president_uid" | null,        // UID of who rejected
  rejectedByInfo: {                          // Denormalized for display (R5)
    firstName: "Ahmed",
    lastName: "Khan"
  } | null,
  rejectedAt: Timestamp | null,              // When rejection occurred
  rejectionReason: null | "Please add more details about registration",

  // === Live Event State ===
  isLive: false,                             // True when officially started
  startedAt: Timestamp | null,               // When "Start Event" was pressed
  startedBy: "official_uid" | null,
  startedByInfo: {                           // Denormalized
    firstName: "...",
    lastName: "...",
    role: "Event Coordinator"
  } | null,

  // === Live Stop Fields ===
  liveStoppedAt: Timestamp | null,           // When live was stopped (edit during live OR explicit stop)
  liveStoppedBy: "uid" | null,               // Who stopped it (R7)
  liveStopReason: "edited" | "manual" | null, // Why it was stopped

  // === Flags ===
  isUniversityAnnouncement: false,           // SAF/Admin bypass badge

  // === Reminder Tracking (for multi-day events) ===
  remindersSentForSlots: ["2025-12-01_17:00", "2025-12-03_17:00"],  // Slot keys for which reminders have been sent

  // === Authorship ===
  createdBy: "official_uid",
  createdByInfo: {
    firstName: "...",
    lastName: "...",
    role: "Secretary"
  },
  createdAt: Timestamp,

  // === Approval Trail ===
  approvedBy: "president_uid" | null,
  approvedAt: Timestamp | null,
  safApprovedBy: "saf_uid" | null,
  safApprovedAt: Timestamp | null,

  // === Updates ===
  updatedAt: Timestamp,
  updatedBy: "uid" | null,
  editHistory: [                             // Optional: track edits
    {
      editedAt: Timestamp,
      editedBy: "uid",
      fieldsChanged: ["title", "description"]
    }
  ]
}
```

**Indexes needed**:

```
events: status ASC, firstSlotStart ASC
events: clubId ASC, status ASC, firstSlotStart DESC
events: isLive ASC, lastSlotEnd ASC
```

---

### 3. Live Announcement (`/clubs/{clubId}/events/{eventId}/announcements/{announcementId}`)

```javascript
{
  announcementId: "ann_xyz789",

  // === Content ===
  content: "Registration is now open at the entrance!",  // Max 500 chars

  // === Author (officials only) ===
  postedBy: "official_uid",
  posterInfo: {
    firstName: "Ahmed",
    lastName: "Khan",
    handle: "ahmed",
    avatarConfig: { ... },
    role: "Event Coordinator"                // Their club role
  },

  // === Announcement Types ===
  type: "update",
  // Possible values:
  // - "update"            : Regular official announcement
  // - "event_live"        : Auto-generated when Go Live clicked
  // - "event_ended"       : Auto-generated when event ends

  // === Metadata ===
  createdAt: Timestamp,

  // === Cleanup marker ===
  expiresAt: Timestamp                       // eventEndTime + 24 hours
}
```

**Note**: Announcements are one-way broadcasts from officials. No replies or reactions. Auto-deleted by Cloud Function after `expiresAt`.

---

### 4. Club Member (`/clubs/{clubId}/members/{userId}`)

```javascript
{
  userId: "user_uid_456",

  // === Role ===
  role: "official",
  // Possible values:
  // - "president"    : Club leader (only one)
  // - "official"     : Has posting privileges
  // - "follower"     : Just following (optional to store, or use user doc)

  roleTitle: "Videographer",                 // Custom display title

  // === Assignment ===
  assignedBy: "president_uid",
  assignedAt: Timestamp,

  // === Denormalized User Info ===
  userInfo: {
    firstName: "Sara",
    lastName: "Ahmed",
    handle: "sara",
    avatarConfig: { ... },
    major: "CSC"
  },

  // === Status ===
  isActive: true,                            // Can be deactivated without removing
  joinedAt: Timestamp
}
```

**Alternative**: For followers, you may choose NOT to create member docs and only store `followedClubs` array in user doc. Member docs are primarily for officials/president for role management.

---

### 5. User Document Additions (`/users/{userId}`)

Add these fields to existing user schema:

```javascript
{
  // ... existing fields ...

  // === Club Following ===
  followedClubs: ["club_id_1", "club_id_2"],  // Array of club IDs
  followedClubsCount: 5,                       // Denormalized count

  // === Club Roles (if any) ===
  clubRoles: {
    "iub_football_club": {
      role: "official",                        // "president" | "official"
      title: "Videographer",
      clubName: "IUB Football Club",           // Denormalized for UI
      assignedBy: "president_uid",
      assignedAt: Timestamp
    },
    "iub_debate_club": {
      role: "president",
      title: "President",
      clubName: "IUB Debate Club",
      assignedBy: "admin_uid",
      assignedAt: Timestamp
    }
  },

  // === SAF Moderator Status ===
  safModeratorFor: [],                         // ["iub"] if SAF for that university

  // === Super Admin (you only) ===
  isSuperAdmin: false                          // true only for your account
}
```

---

### 6. SAF Moderator Document (`/safModerators/{userId}`)

SAF (Student Activities Forum) moderators are stored as individual documents keyed by user UID.

```javascript
{
  uid: "saf_user_uid",
  displayName: "Dr. Rahman",
  universityId: "iub",                        // University they moderate
  addedAt: Timestamp,
  addedBy: "admin_uid"                        // Who assigned them
}
```

---

### 7. Admin Documents (`/admin/...`)

#### `/admin/superAdmins`

```javascript
{
  uids: ["your_firebase_uid"],                 // Array of super admin UIDs
  pinHash: "hashed_pin_here",                  // For secondary verification
  updatedAt: Timestamp
}
```

#### `/admin/clubConfig`

```javascript
{
  // Global settings
  colorPalette: [
    { key: "blue", primary: "#667eea", secondary: "#764ba2" },
    { key: "purple", primary: "#9b67f8", secondary: "#c471ed" },
    { key: "green", primary: "#11998e", secondary: "#38ef7d" },
    { key: "orange", primary: "#f2994a", secondary: "#f2c94c" },
    { key: "red", primary: "#eb5757", secondary: "#ff6b6b" },
    { key: "pink", primary: "#ec4899", secondary: "#f472b6" },
    { key: "teal", primary: "#14b8a6", secondary: "#2dd4bf" },
    { key: "indigo", primary: "#6366f1", secondary: "#818cf8" }
  ],

  // Image constraints
  maxEventImageSizeKB: 1024,
  maxLogoSizeKB: 200,
  maxBannerSizeKB: 500,

  // Retention settings (in days)
  eventRetentionDays: 90,
  announcementRetentionHours: 24,  // Announcements deleted 24h after event ends
  rejectedEventRetentionDays: 30,

  updatedAt: Timestamp
}
```

---

### 7. Club Notifications (`/notifications/{notificationId}`)

Extend existing notification schema:

```javascript
{
  // === Standard fields ===
  userId: "recipient_uid",
  fromUserId: "sender_uid" | null,
  createdAt: Timestamp,
  status: "pending",                          // "pending" | "read" | "dismissed"
  readAt: Timestamp | null,

  // === Club-specific fields ===
  type: "club_new_event",
  // Club notification types:
  // - "club_new_event"           : New event from followed club
  // - "club_event_reminder"      : 15 min before event
  // - "club_event_changed"       : Event details updated
  // - "club_event_started"       : Event went live
  // - "club_event_cancelled"     : Event was cancelled
  // - "club_event_pending"       : Event awaiting president approval (to president)
  // - "club_event_pending_saf"   : Event awaiting SAF approval (to SAF moderators)
  // - "club_event_president_approved" : President approved, now awaiting SAF (to creator)
  // - "club_event_approved"      : Event was fully approved (to creator)
  // - "club_event_rejected"      : Event was rejected (to creator)

  // === References ===
  clubId: "iub_football_club",
  eventId: "evt_abc123" | null,

  // === Display ===
  title: "New Event from IUB Football",
  message: "Annual Tournament - December 1st",

  // === Club Info (denormalized) ===
  clubInfo: {
    name: "IUB Football Club",
    logoUrl: "...",
    accentColor: "blue"
  }
}
```

---

## 🔄 Denormalization Strategy

To minimize Firestore reads, we denormalize frequently-accessed data:

| Source       | Denormalized To         | Fields                      | Update Trigger               |
| ------------ | ----------------------- | --------------------------- | ---------------------------- |
| User profile | Club.presidentInfo      | name, handle, avatar        | Profile update               |
| User profile | Event.createdByInfo     | name, role                  | Profile update               |
| User profile | Announcement.senderInfo | name, handle, avatar, role  | Profile update               |
| User profile | ClubMember.userInfo     | name, handle, avatar, major | Profile update               |
| Club stats   | Club.followerCount      | count                       | Follow/unfollow              |
| Club stats   | Club.eventsThisWeek     | count                       | Event approved (daily reset) |
| Event dates  | Club.nextEventDate      | timestamp                   | Event change                 |

**Cloud Function triggers** handle denormalization updates.

---

## 📐 Read/Write Estimation

### Assumptions

- 1 university, 25 clubs, 300 active students
- 15 events per club per semester (3 months)
- 50% of students follow 5 clubs each
- Peak: 100 concurrent users

### Daily Estimates (Active Day)

| Operation          | Count | Type                                                    |
| ------------------ | ----- | ------------------------------------------------------- |
| Load Clubs list    | 200   | 200 reads (25 clubs × 8 page loads)                     |
| Load Club page     | 150   | 450 reads (150 × 3 docs: club + events query + members) |
| View event         | 100   | 100 reads                                               |
| Load announcements | 50    | 250 reads (50 × 5 messages avg)                         |
| Follow/unfollow    | 20    | 60 writes (user + club counter + member doc)            |
| Create event       | 5     | 10 writes (event + notification)                        |
| Approve event      | 5     | 15 writes (event + notification + club stats)           |
| Post announcement  | 30    | 30 writes                                               |

**Daily Total**: ~1,100 reads, ~115 writes

**Free Tier**: 50K reads/day, 20K writes/day ✅ **Well within limits**

---

## 🧹 Cleanup Queries

### Delete events older than 90 days

```javascript
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

const oldEvents = await db
  .collectionGroup("events")
  .where("lastSlotEnd", "<", ninetyDaysAgo)
  .where("status", "==", "approved")
  .get();
```

### Delete expired announcements (24h after event ends)

```javascript
const now = new Date();

const expiredAnnouncements = await db
  .collectionGroup("announcements")
  .where("expiresAt", "<", now)
  .get();
```

---

## 🔗 Related Documents

- [Firestore-Rules.md](./Firestore-Rules.md) — Security rules
- [Cloud-Functions.md](./Cloud-Functions.md) — Cleanup functions
- [Implementation-Plan.md](./Implementation-Plan.md) — Build order

---

_End of Data Model_
