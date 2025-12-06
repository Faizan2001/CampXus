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
┌─────────────────────────────┬───────┬─────────┬──────────┬──────────┬────────┐
│ Action                      │ Super │ SAF Mod │ President│ Official │ Member │
│                             │ Admin │ (scoped)│          │          │        │
├─────────────────────────────┼───────┼─────────┼──────────┼──────────┼────────┤
│ Access /admin               │   ✓   │    ✗    │    ✗     │    ✗     │   ✗    │
│ Manage SAF Moderators       │   ✓   │    ✗    │    ✗     │    ✗     │   ✗    │
│ Create Universities         │   ✓   │    ✗    │    ✗     │    ✗     │   ✗    │
│ Create Clubs (own univ)     │   ✓   │    ✓    │    ✗     │    ✗     │   ✗    │
│ Delete Clubs (own univ)     │   ✓   │    ✓    │    ✗     │    ✗     │   ✗    │
│ Assign President            │   ✓   │    ✓    │    ✗     │    ✗     │   ✗    │
├─────────────────────────────┼───────┼─────────┼──────────┼──────────┼────────┤
│ SAF Approve/Reject Events   │   ✓   │    ✓    │    ✗     │    ✗     │   ✗    │
│ President Approve Events    │   ✓   │    ✗    │    ✓     │    ✗     │   ✗    │
│ Promote to Official         │   ✓   │    ✓    │    ✓     │    ✗     │   ✗    │
│ Demote Official             │   ✓   │    ✓    │    ✓     │    ✗     │   ✗    │
│ Delete Club Events          │   ✓   │    ✓    │    ✓     │    ✗     │   ✗    │
├─────────────────────────────┼───────┼─────────┼──────────┼──────────┼────────┤
│ Create Events               │   ✓   │    ✓    │    ✓     │    ✓     │   ✗    │
│ Go Live / End Event         │   ✓   │    ✓    │    ✓     │    ✓*    │   ✗    │
│ Edit Own Events             │   ✓   │    ✓    │    ✓     │    ✓     │   ✗    │
├─────────────────────────────┼───────┼─────────┼──────────┼──────────┼────────┤
│ Follow/Unfollow Club        │   ✓   │    ✓    │    ✓     │    ✓     │   ✓    │
│ View Club Events            │   ✓   │    ✓    │    ✓     │    ✓     │   ✓    │
└─────────────────────────────┴───────┴─────────┴──────────┴──────────┴────────┘

* Officials can only Go Live/End events they created
** SAF Mod (scoped) = SAF moderators can only manage clubs within their assigned university
```

---

## Event Approval Flow

**SAF approval is MANDATORY for all events.** Events must go through the full approval chain before becoming visible to students.

### Official Creates Event

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
│ status:          │
│ pending_saf      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐         ┌──────────────────┐
│  SAF MODERATOR   │────────▶│     REJECTED     │
│    reviews       │  reject │ (with feedback)  │
└────────┬─────────┘         └──────────────────┘
         │ approve
         ▼
┌──────────────────┐
│     APPROVED     │
│ (queued to go    │
│  live on date)   │
└──────────────────┘
```

### President Creates Event

```
┌──────────────┐
│  PRESIDENT   │
│ creates event│
└──────┬───────┘
       │ (auto-approved by president)
       ▼
┌──────────────────┐
│ status:          │
│ pending_saf      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐         ┌──────────────────┐
│  SAF MODERATOR   │────────▶│     REJECTED     │
│    reviews       │  reject │ (with feedback)  │
└────────┬─────────┘         └──────────────────┘
         │ approve
         ▼
┌──────────────────┐
│     APPROVED     │
│ (queued to go    │
│  live on date)   │
└──────────────────┘
```

### Super Admin or SAF Moderator Creates Event

```
┌────────────────────┐
│  SUPER ADMIN or    │
│  SAF MODERATOR     │
│  creates event     │
└────────┬───────────┘
         │ (auto-approved, bypasses all review)
         ▼
┌──────────────────┐
│     APPROVED     │
│ (queued to go    │
│  live on date)   │
└──────────────────┘
```

**Key Rules:**

- Officials create events → President approves → SAF approves → Queued for scheduled date/time
- Presidents create events → SAF approves → Queued for scheduled date/time
- **Super Admins** create events → **Directly approved** → Queued for scheduled date/time (bypass all approval)
- **SAF Moderators** (for clubs in their university) create events → **Directly approved** → Queued for scheduled date/time (bypass all approval)
- All approved events are queued and go live automatically when their scheduled date/time arrives
- SAF moderators receive notifications when new events are pending their review

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
