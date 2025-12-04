# Role Hierarchy System

## Overview

```
                    ┌─────────────────────┐
                    │    SUPER ADMIN      │
                    │   (System Owner)    │
                    └──────────┬──────────┘
                               │
                               │ manages
                               ▼
        ┌──────────────────────────────────────────┐
        │                                          │
        ▼                                          ▼
┌───────────────────┐                    ┌─────────────────┐
│  SAF MODERATORS   │                    │   UNIVERSITIES  │
│  (Per University) │                    │   & CLUBS       │
└────────┬──────────┘                    └─────────────────┘
         │
         │ manages clubs in their university
         ▼
┌─────────────────────────────────────────────────────────┐
│                     CLUB LEVEL                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│    ┌─────────────────┐                                  │
│    │    PRESIDENT    │  (1 per club)                    │
│    │       👑        │                                  │
│    └────────┬────────┘                                  │
│             │                                           │
│             │ promotes/demotes                          │
│             ▼                                           │
│    ┌─────────────────┐                                  │
│    │    OFFICIALS    │  (multiple)                      │
│    │       ⭐        │                                  │
│    └────────┬────────┘                                  │
│             │                                           │
│             ▼                                           │
│    ┌─────────────────┐                                  │
│    │    MEMBERS      │  (followers who joined)          │
│    │       👤        │                                  │
│    └─────────────────┘                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Permission Matrix

```
┌────────────────────────┬───────┬─────┬──────────┬──────────┬────────┐
│ Action                 │ Super │ SAF │ President│ Official │ Member │
│                        │ Admin │ Mod │          │          │        │
├────────────────────────┼───────┼─────┼──────────┼──────────┼────────┤
│ Access /admin          │   ✓   │  ✗  │    ✗     │    ✗     │   ✗    │
│ Manage SAF Moderators  │   ✓   │  ✗  │    ✗     │    ✗     │   ✗    │
│ Create Universities    │   ✓   │  ✗  │    ✗     │    ✗     │   ✗    │
│ Create Clubs           │   ✓   │  ✓  │    ✗     │    ✗     │   ✗    │
│ Delete Any Club        │   ✓   │  ✓  │    ✗     │    ✗     │   ✗    │
│ Assign President       │   ✓   │  ✓  │    ✗     │    ✗     │   ✗    │
├────────────────────────┼───────┼─────┼──────────┼──────────┼────────┤
│ Approve/Reject Events  │   ✓   │  ✓  │    ✓     │    ✗     │   ✗    │
│ Promote to Official    │   ✓   │  ✓  │    ✓     │    ✗     │   ✗    │
│ Demote Official        │   ✓   │  ✓  │    ✓     │    ✗     │   ✗    │
│ Delete Club Events     │   ✓   │  ✓  │    ✓     │    ✗     │   ✗    │
├────────────────────────┼───────┼─────┼──────────┼──────────┼────────┤
│ Create Events          │   ✓   │  ✓  │    ✓     │    ✓     │   ✗    │
│ Go Live / End Event    │   ✓   │  ✓  │    ✓     │    ✓*    │   ✗    │
│ Edit Own Events        │   ✓   │  ✓  │    ✓     │    ✓     │   ✗    │
├────────────────────────┼───────┼─────┼──────────┼──────────┼────────┤
│ Follow/Unfollow Club   │   ✓   │  ✓  │    ✓     │    ✓     │   ✓    │
│ View Club Events       │   ✓   │  ✓  │    ✓     │    ✓     │   ✓    │
└────────────────────────┴───────┴─────┴──────────┴──────────┴────────┘

* Officials can only Go Live/End events they created
```

---

## Event Approval Flow

```
┌──────────────┐
│   OFFICIAL   │
│ creates event│
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ status:          │
│ pending_president│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐         ┌──────────────────┐
│    PRESIDENT     │────────▶│     REJECTED     │
│    reviews       │  reject │ (with feedback)  │
└────────┬─────────┘         └──────────────────┘
         │ approve
         ▼
┌──────────────────┐
│     APPROVED     │
│ (visible to all) │
└──────────────────┘
```

Presidents and Super Admins auto-approve their own events.

---

## Club Management Scope

```
┌─────────────────────────────────────────────────────────────────┐
│                        SUPER ADMIN                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Can manage ALL universities and ALL clubs                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      SAF MODERATOR                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Can manage clubs ONLY in their assigned university        │  │
│  │                                                           │  │
│  │   University: IUB                                         │  │
│  │   ├── IUB Football Club     ✓                             │  │
│  │   ├── IUB Drama Society     ✓                             │  │
│  │   └── IUB Chess Club        ✓                             │  │
│  │                                                           │  │
│  │   Other Universities:                                     │  │
│  │   └── Any Club              ✗ (out of scope)              │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       PRESIDENT                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Can manage ONLY their own club                            │  │
│  │                                                           │  │
│  │   IUB Football Club         ✓ (their club)                │  │
│  │   IUB Drama Society         ✗                             │  │
│  │   IUB Chess Club            ✗                             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Access Hierarchy

```
/admin/superAdmins
    │
    └── uids: [uid1, uid2]     <-- Only these can access /admin
    └── pinHash: "sha256..."   <-- Secondary verification


/safModerators/{uid}
    │
    └── universityId: "iub"    <-- Scope of their power
    └── addedBy: superAdminUid


/clubs/{clubId}
    │
    ├── presidentId: uid       <-- Full club control
    ├── officialIds: [...]     <-- Can create events
    ├── members: [...]         <-- Basic access
    │
    └── /events/{eventId}
        └── createdBy: uid     <-- Officials edit own events only
        └── status: "approved" <-- Set by president
```

---

## UI Access by Role

```
┌─────────────────────────────────────────────────────────────┐
│                    Navigation & Tabs                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SUPER ADMIN sees:                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [/admin] Overview | Universities | SAF | Clubs | Maint│   │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  PRESIDENT sees (in their club):                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [Events] [Members] [Moderate]                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  OFFICIAL sees (in their club):                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [Events] [Members]                                  │    │
│  │ + Create Event button                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  MEMBER sees:                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [Events] [Members]                                  │    │
│  │ (view only)                                         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
