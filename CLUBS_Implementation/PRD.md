# 📋 Clubs Feature - Product Requirements Document (PRD)

**Product**: MeetchuThere  
**Feature**: Clubs Hub  
**Version**: 1.0  
**Author**: Faizan Syed  
**Date**: November 26, 2025  
**Status**: Draft

---

## 📖 Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [User Segments](#3-user-segments)
4. [Feature Requirements](#4-feature-requirements)
5. [User Flows](#5-user-flows)
6. [Permissions & Roles](#6-permissions--roles)
7. [Notifications](#7-notifications)
8. [Data Retention Policy](#8-data-retention-policy)
9. [Success Metrics](#9-success-metrics)
10. [Open Questions (Resolved)](#10-open-questions-resolved)

---

## 1. Overview

### 1.1 What is this?

The **Clubs Feature** is a centralized hub within MeetchuThere where university students can:

- Discover all clubs at their university
- See **Live Events** happening right now on campus
- Browse **Upcoming Events** in chronological order
- Follow clubs to receive notifications about new events
- View club pages with event history and member information

### 1.2 Why are we building this?

**Problem**: Students miss out on campus events because:

- Club information is scattered across Instagram, Facebook, WhatsApp groups
- No single place to see "what's happening RIGHT NOW on campus"
- Students don't know which clubs exist or how to join them

**Solution**: A unified, real-time view of campus club activity integrated into MeetchuThere's existing Groups infrastructure.

### 1.3 How does it fit into MeetchuThere?

```
Groups Tab (existing)
├── Classes (tab) ← Current class spaces
└── Clubs (tab) ← NEW: Clubs hub
    ├── Live Events section
    ├── Upcoming Events section (greyed out, below Live)
    └── Club cards grid
        └── Individual Club Page
            ├── Events tab
            ├── Members tab (with officer badges)
            └── Moderate tab (authorized users only)
```

---

## 2. Goals & Non-Goals

### 2.1 Goals ✅

| Goal                       | Success Criteria                                                 |
| -------------------------- | ---------------------------------------------------------------- |
| Centralize club discovery  | Students can find all university clubs in one place              |
| Surface live events        | Events auto-appear in "Live" section during their time window    |
| Enable event notifications | Followed clubs trigger push notifications for new/live events    |
| Simple club management     | Presidents can manage events and officials with minimal friction |
| SAF oversight              | Student Affairs can moderate content before it goes live         |
| Multi-university scalable  | Each university has isolated club data                           |
| Cost-efficient             | Stay within Firebase free tier for 1 university                  |

### 2.2 Non-Goals ❌

| Non-Goal                         | Reason                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| Comments/reactions on events     | Keep it clean; clubs have social media for engagement           |
| Announcements feed               | Clubs make unnecessary announcements; focus on events only      |
| Club chat rooms                  | Out of scope; use existing class spaces pattern if needed later |
| Video uploads                    | Phase 2 / Premium feature (excluded from this PRD)              |
| Cross-university club visibility | Students only see their own university's clubs                  |
| Self-service club creation       | Admin/SAF creates clubs manually for quality control            |

---

## 3. User Segments

### 3.1 Students (View + Follow)

**Who**: Any verified university student using MeetchuThere

**Can do**:

- Browse all clubs at their university
- View club pages (events, members)
- Follow/unfollow clubs
- Receive notifications for followed clubs
- View live event chats (read-only)

**Cannot do**:

- Create clubs, events, or posts
- Post in live event chats
- Access moderation features

---

### 3.2 Club Officials

**Who**: Students promoted by Club President

**Roles** (custom titles assigned by President):

- Videographer, Editor, Secretary, Treasurer, etc.
- Role is a display title, not a permission level

**Can do** (everything Students can, plus):

- Create events (requires President approval)
- Edit events they created (requires re-approval if already approved)
- Post in live event chats
- Mark "Event has started" during time window

**Cannot do**:

- Approve events
- Promote/demote other members
- Delete club content

---

### 3.3 Club President

**Who**: One student per club, assigned by Admin or SAF

**Can do** (everything Officials can, plus):

- Approve/reject events from officials
- Promote students to Officials (assign custom role titles)
- Demote officials back to regular students
- Edit any event in their club
- Delete events from their club
- Enable/disable SAF approval requirement for their club

**Cannot do**:

- Transfer presidency (only Admin/SAF can do this)
- Delete the club itself
- Moderate other clubs

---

### 3.4 SAF Moderators (Student Affairs)

**Who**: University staff assigned by Admin

**Scope**: All clubs within their assigned university

**Can do** (everything Presidents can across all clubs, plus):

- Create new clubs
- Assign/reassign Club Presidents
- Approve/reject events (when club requires SAF approval)
- Delete any event or club
- Leave rejection comments visible to club officials
- Push "University Announcement" events (bypass club flow)
- View moderation dashboard for all pending content

**Cannot do**:

- Manage SAF moderators (only Admin can)
- Access other universities' clubs
- Modify admin settings

---

### 3.5 Admin (Super Admin - You)

**Who**: Faizan (hardcoded UID in Firestore `/admin/superAdmins`)

**Can do** (god mode):

- Everything SAF can do, across ALL universities
- Promote/demote SAF moderators
- Create/delete universities
- Access `/admin` dashboard
- Run maintenance functions (clear schedules, data cleanup)
- Manage system-wide settings

**Access**: Hidden `/admin` route with secondary PIN verification

---

## 4. Feature Requirements

### 4.1 Clubs Listing Page

**Location**: Groups → Clubs tab

**Layout**:

```
┌─────────────────────────────────────────────────┐
│  [Classes]  [Clubs]           ← Tab switcher    │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐│
│  │  🔴 LIVE EVENTS               [3 live now]  ││
│  │  ───────────────────────────────────────────││
│  │  ┌───────┐ ┌───────┐ ┌───────┐              ││
│  │  │Event 1│ │Event 2│ │Event 3│  ← scroll    ││
│  │  └───────┘ └───────┘ └───────┘              ││
│  │                                              ││
│  │  ▼ Upcoming (5)      ▼ Past Events (12)     ││
│  │  (expandable dropdown sections)             ││
│  └─────────────────────────────────────────────┘│
│  ← "Mother Card" - permanent, contains all     │
│     events from all clubs                       │
├─────────────────────────────────────────────────┤
│  ALL CLUBS                                      │
│  ┌─────┐ ┌─────┐ ┌─────┐                       │
│  │Club │ │Club │ │Club │  ← Grid               │
│  └─────┘ └─────┘ └─────┘                       │
│  ┌─────┐ ┌─────┐ ┌─────┐                       │
│  │Club │ │Club │ │Club │                       │
│  └─────┘ └─────┘ └─────┘                       │
└─────────────────────────────────────────────────┘
```

**Live Events "Mother Card"**:

A permanent card at the top of the Clubs page that aggregates all events from all clubs:

**States**:

- **Active** (≥1 live event): Colorful/glowing, pulsing red dot, vibrant
- **Inactive** (0 live events): Greyed out, shows "No live events right now"

**Contains**:

- Live Events carousel (horizontal scroll)
- Expandable "Upcoming Events" dropdown with count
- Expandable "Past Events" dropdown with count

**Auto-escalation**: Events automatically appear in this card based on their time window:

- **Live**: `isLive === true` OR `currentTime` within event's start-end window
- **Upcoming**: `startTime > currentTime`
- **Past**: `endedAt` exists OR 24h after event end time

**Club Card displays**:

- Club logo (circular, left side)
- Club name
- Follower count
- "X events this week" badge
- Next event date (if any)
- Club accent color (from preset palette)

**Behaviors**:

- Tap club card → Navigate to Club Page (full page, with back button)
- Tap event card → Navigate to Club Page with event expanded
- SAF moderators see "Moderate" button in header
- Pull-to-refresh updates events

---

### 4.2 Live Events Section (Inside Mother Card)

**Definition**: Events where `currentTime` is within the event's time window OR `isLive === true` (officially started by an official).

**Event Card (Live) displays**:

- 🔴 Pulsing "LIVE" badge (red) - auto-live from time window
- 🟢 "OFFICIALLY LIVE" badge (green + ✓) - official clicked Go Live
- Event title (header)
- Club logo + name
- Location (text)
- Time remaining ("Ends in 2h 30m")
- Live chat preview (latest message)

**Live Event Timeline** (Announcements Only):

- Opens when tapping live event card
- **Announcement feed** — Officials broadcast updates, students view only
- No back-and-forth chat; purely one-way communication
- Message format: `[Avatar] [Name - Role] [Timestamp]: Announcement`
- Auto-deletes 24 hours after event ends
- "Event is now live!" message shown at top when event starts

**Auto-refresh**: Every 60 seconds for live event list

---

### 4.3 Upcoming Events Section (Dropdown in Mother Card)

**Definition**: Events where `startTime > currentTime` (not yet started)

**Display**:

- Greyed out styling (lower opacity)
- Sorted chronologically (soonest first)
- Shows below Live Events with a divider

**Event Card (Upcoming) displays**:

- Event title
- Club logo + name
- Date + time range
- Location
- "Starts in X days/hours"

---

### 4.4 Individual Club Page

**Navigation**: Full page with back button (returns to Clubs listing)

**Header**:

```
┌─────────────────────────────────────────┐
│ [←]                         [Follow ♡]  │
│ ┌─────────────────────────────────────┐ │
│ │         CLUB BANNER IMAGE           │ │
│ └─────────────────────────────────────┘ │
│     [Logo]                              │
│     Club Name                           │
│     123 followers                       │
│     "Club description goes here..."     │
├─────────────────────────────────────────┤
│  [Events]  [Members]  [Moderate*]       │
└─────────────────────────────────────────┘
* Moderate tab only visible to President/SAF/Admin
```

**Tabs**:

#### Events Tab

- Lists all club events (upcoming + past)
- Upcoming events at top
- Past events below (collapsed by default, "Show past events")
- "+ Create Event" button (officials only)
- Event cards show approval status for officials

#### Members Tab

- Club President at top with 👑 badge
- Officials section with custom role badges
- Regular members/followers below
- Search/filter by name
- Officials can't see moderation actions here

#### Moderate Tab (Authorized only)

- **Visible to**: Club President, SAF, Admin
- **Shows**: Pending events awaiting approval
- **Actions**: Approve / Reject (with optional comment)
- Rejection comments visible to event creator

---

### 4.5 Create Event Flow

**Who can create**: Officials, President, SAF, Admin

**Required fields**:

- Event title (header)
- Description (text, max 1000 chars)
- Date(s) + time range(s) — supports multi-day events
- Location (text)

**Optional fields**:

- Hero image (one image, HD, Facebook aspect ratios)
- University Announcement badge (SAF/Admin only)

**Multi-day event format**:

```json
{
  "timeSlots": [
    { "date": "2025-12-01", "startTime": "19:00", "endTime": "22:00" },
    { "date": "2025-12-03", "startTime": "19:00", "endTime": "22:00" },
    { "date": "2025-12-05", "startTime": "19:00", "endTime": "22:00" }
  ]
}
```

**Approval flow**:

1. Official creates event → Status: `pending_president`
2. President approves → Status: `approved` (or `pending_saf` if SAF approval enabled)
3. If SAF approval enabled: SAF approves → Status: `approved`
4. Approved events appear in Upcoming Events

**Edit flow**:

- Editing an approved event changes status back to `pending_president`
- Requires re-approval before changes go live

---

### 4.6 Follow/Unfollow Clubs

**Follow button**: Heart icon in club page header

**States**:

- Not followed: Outlined heart "Follow"
- Followed: Filled heart "Following"

**Storage**:

- User document: `followedClubs: [clubId1, clubId2, ...]`
- Club document: `followerCount: 123` (incremented/decremented)

**Effects**:

- Following enables notifications for that club
- Unfollowing stops all notifications from that club

---

## 5. User Flows

### 5.1 Student Discovers Live Event

```
Student opens MeetchuThere
    → Taps Groups tab
    → Taps "Clubs" tab
    → Sees "LIVE EVENTS" section with pulsing badges
    → Taps live event card
    → Views live chat (read-only)
    → Sees "Event has started by [Official Name]" at top
    → Reads announcements from officials
```

### 5.2 Student Follows a Club

```
Student browses Clubs grid
    → Taps club card
    → Views club page
    → Taps "Follow" button
    → Button changes to "Following"
    → Student receives notification when club posts new event
```

### 5.3 Official Creates Event

```
Official opens club they're assigned to
    → Taps "Events" tab
    → Taps "+ Create Event"
    → Fills in title, description, dates, times, location
    → Optionally uploads hero image
    → Taps "Submit for Approval"
    → Event appears in "Pending" state
    → President receives notification of pending event
```

### 5.4 President Approves Event

```
President opens their club
    → Taps "Moderate" tab
    → Sees pending events list
    → Taps event to preview
    → Taps "Approve" or "Reject"
    → If rejected, optionally adds comment
    → Event status updates
    → Official receives notification of decision
```

### 5.5 SAF Creates University Announcement

```
SAF opens Clubs page
    → Taps "Moderate" button in header
    → Taps "+ University Announcement"
    → Creates event with "University Announcement" badge enabled
    → Event bypasses club flow, immediately visible
    → All students see it (no follow required)
```

### 5.6 Event Goes Live (Auto or Manual)

```
Automatic: When current time enters event's time window
    → Event automatically appears in Live Events section
    → Shows 🟢 "NOW" badge (happening now)

Manual: Official clicks "Go Live" button
    → Event shows 🔴 "LIVE" badge (officially started)
    → "Event is now live!" announcement posted to timeline
    → Followers receive push notification
    → Officials can now post announcements to the live timeline
```

---

## 6. Permissions & Roles

### 6.1 Permission Matrix

| Action                        | Student | Official | President | SAF | Admin |
| ----------------------------- | ------- | -------- | --------- | --- | ----- |
| View clubs/events             | ✅      | ✅       | ✅        | ✅  | ✅    |
| Follow clubs                  | ✅      | ✅       | ✅        | ✅  | ✅    |
| Create event                  | ❌      | ✅       | ✅        | ✅  | ✅    |
| Edit own event                | ❌      | ✅       | ✅        | ✅  | ✅    |
| Edit any event in club        | ❌      | ❌       | ✅        | ✅  | ✅    |
| Delete events                 | ❌      | ❌       | ✅        | ✅  | ✅    |
| Approve events                | ❌      | ❌       | ✅        | ✅  | ✅    |
| Post announcements (live)     | ❌      | ✅       | ✅        | ✅  | ✅    |
| Start event                   | ❌      | ✅       | ✅        | ✅  | ✅    |
| Promote officials             | ❌      | ❌       | ✅        | ✅  | ✅    |
| Assign president              | ❌      | ❌       | ❌        | ✅  | ✅    |
| Create clubs                  | ❌      | ❌       | ❌        | ✅  | ✅    |
| Delete clubs                  | ❌      | ❌       | ❌        | ✅  | ✅    |
| Push university announcements | ❌      | ❌       | ❌        | ✅  | ✅    |
| Manage SAF moderators         | ❌      | ❌       | ❌        | ❌  | ✅    |
| Access /admin dashboard       | ❌      | ❌       | ❌        | ❌  | ✅    |

### 6.2 Role Assignment Flow

```
Admin (You)
    │
    ├── Creates club document
    │
    ├── Assigns SAF Moderator (per university)
    │       └── SAF can then:
    │           ├── Create more clubs
    │           └── Assign Club Presidents
    │
    └── Or directly assigns Club President
            └── President can then:
                └── Promote students to Officials
                    (with custom role titles)
```

### 6.3 Role Storage

**User document addition**:

```javascript
{
  // ... existing fields ...
  clubRoles: {
    "club_123": {
      role: "president",        // "president" | "official" | "member"
      title: "President",       // Custom display title
      assignedBy: "admin_uid",
      assignedAt: Timestamp
    },
    "club_456": {
      role: "official",
      title: "Videographer",
      assignedBy: "president_uid",
      assignedAt: Timestamp
    }
  },
  safModeratorFor: ["iub"],     // Array of university codes (SAF only)
  isSuperAdmin: false           // Only true for you
}
```

---

## 7. Notifications

### 7.1 Notification Types

| Type                   | Trigger                             | Recipients     | Message                                   |
| ---------------------- | ----------------------------------- | -------------- | ----------------------------------------- |
| `club_new_event`       | Event approved                      | Club followers | "🎉 [Club] posted a new event: [Title]"   |
| `club_event_reminder`  | 15 min before event                 | Club followers | "⏰ [Event] starts in 15 minutes!"        |
| `club_event_changed`   | Approved event edited & re-approved | Club followers | "📝 [Club] updated event: [Title]"        |
| `club_event_started`   | Official presses "Start" button     | Club followers | "🔴 [Event] is happening NOW!"            |
| `club_event_cancelled` | Event deleted after approval        | Club followers | "❌ [Club] cancelled: [Title]"            |
| `club_event_pending`   | Official submits event              | President      | "📋 New event pending approval: [Title]"  |
| `club_event_approved`  | President/SAF approves              | Event creator  | "✅ Your event was approved: [Title]"     |
| `club_event_rejected`  | President/SAF rejects               | Event creator  | "❌ Your event was not approved: [Title]" |

### 7.2 Notification Delivery

1. **In-app toast**: Immediate visual feedback (3-5 seconds)
2. **Push notification**: Browser push via FCM (existing infrastructure)
3. **Notifications page**: Persistent list at `/notifications`

### 7.3 Notification Storage

```javascript
// /notifications/{notificationId}
{
  userId: "recipient_uid",
  type: "club_new_event",
  clubId: "club_123",
  eventId: "event_456",
  title: "New Event from IUB Football",
  message: "Annual Tournament starting December 1st",
  createdAt: Timestamp,
  readAt: null,                    // null = unread
  status: "pending"                // "pending" | "read" | "dismissed"
}
```

---

## 8. Data Retention Policy

### 8.1 Automatic Cleanup (Cloud Functions)

| Data Type               | Retention                     | Cleanup Schedule |
| ----------------------- | ----------------------------- | ---------------- |
| Approved events         | 90 days after `endTime`       | Daily at 3:00 AM |
| Rejected/pending events | 30 days after creation        | Daily at 3:00 AM |
| Event images            | Deleted when event deleted    | Immediate        |
| Live chat messages      | 24 hours after event ends     | Hourly check     |
| Club notifications      | 30 days                       | Weekly cleanup   |
| Club follower count     | Maintained until club deleted | N/A              |

### 8.2 Manual Cleanup Triggers

Admin dashboard provides:

- "Clear old events" button (all events > 90 days)
- "Clear all schedules for [University]" (semester reset)
- "Rebuild follower counts" (data integrity check)

### 8.3 Storage Optimization

- Event images: Compressed to max 1MB, 16:9 or 1:1 aspect ratio
- Club logos: Max 200KB, 1:1 aspect ratio
- Club banners: Max 500KB, 3:1 aspect ratio
- Automatic WebP conversion where supported

---

## 9. Success Metrics

### 9.1 Engagement Metrics

| Metric                      | Target (Month 1)       | Target (Month 3)       |
| --------------------------- | ---------------------- | ---------------------- |
| Students visiting Clubs tab | 50% of DAU             | 70% of DAU             |
| Club follows per student    | 3 clubs avg            | 5 clubs avg            |
| Live event views            | 20% of online students | 40% of online students |
| Event creation rate         | 5 events/club/month    | 10 events/club/month   |

### 9.2 Technical Metrics

| Metric                 | Target                 |
| ---------------------- | ---------------------- |
| Firestore reads/day    | < 30K (free tier safe) |
| Firestore writes/day   | < 15K (free tier safe) |
| Storage used           | < 500MB first semester |
| Page load time (Clubs) | < 2 seconds            |

---

## 10. Open Questions (Resolved)

All questions from requirements gathering have been resolved:

| #   | Question                 | Decision                                                |
| --- | ------------------------ | ------------------------------------------------------- |
| 1   | Navigation location      | Groups → Clubs tab (Option A)                           |
| 2   | Club page navigation     | Full page with back button                              |
| 3   | SAF dashboard access     | "Moderate" tab in Clubs page                            |
| 4   | President delegation     | Can delegate approval to officials: No (President only) |
| 5   | Co-presidents            | No, one president per club                              |
| 6   | Club creation            | Admin/SAF only, manual                                  |
| 7   | Approval flow            | Official → President → (optionally SAF) → Live          |
| 8   | Event status transitions | Upcoming → Live (when started) → Past (24h after)       |
| 9   | Announcements            | Dropped — events only                                   |
| 10  | Follow mechanism         | Explicit click, can unfollow                            |
| 11  | Notification delivery    | Toast + Push + Notifications page                       |
| 12  | Scale estimate           | 20-30 clubs, 15-30 events/semester                      |
| 13  | Image specs              | HD, Facebook aspect ratios, one per event               |
| 14  | Multi-university         | Isolated per university                                 |
| 15  | Live/Upcoming layout     | Single scroll, Live on top, Upcoming greyed below       |
| 16  | Admin dashboard          | Hidden /admin route with PIN verification               |
| 17  | SAF scope                | Locked to their university                              |
| 18  | President transfer       | SAF/Admin only                                          |
| 19  | Multi-day events         | One doc with array of time slots                        |
| 20  | Event edit               | Requires re-approval                                    |
| 21  | University announcements | Optional badge, bypasses club flow                      |
| 22  | Video feature            | Excluded from this PRD (Phase 2)                        |
| 23  | Data retention           | 90 days events, 24h live chat                           |
| 24  | Color picker             | Preset palette                                          |
| 25  | Live announcements       | Officials only (one-way broadcast, no chat)             |
| 26  | Event start trigger      | Manual button by official OR auto when in time window   |
| 27  | Membership storage       | Hybrid (user doc + club followerCount)                  |
| 28  | Event images             | One hero image per event                                |
| 29  | Officers display         | Inside Members tab with role badge                      |
| 30  | Overnight events         | Supported (e.g., 10PM-1AM = ends next day)              |

---

## 10.1 Event Lifecycle Clarification

This section clarifies exactly how events transition through the Mother Card sections.

### Event State Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EVENT LIFECYCLE                                     │
│                                                                             │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                │
│   │  UPCOMING   │ ───▶ │    LIVE     │ ───▶ │    PAST     │                │
│   │  (future)   │      │  (now)      │      │  (ended)    │                │
│   └─────────────┘      └─────────────┘      └─────────────┘                │
│                                                                             │
│   Criteria:            Criteria:            Criteria:                       │
│   • startTime > now    • isLive=true OR     • endedAt exists OR            │
│   • Within 3 days      • now >= startTime   • now > endTime + 24h          │
│                          AND now <= endTime                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### When Events Appear in Each Section

**UPCOMING (Dropdown in Mother Card)**

- Event `status` is "approved"
- Current time is BEFORE the event's `firstSlotStart`
- Event starts within the next 3 days
- Sorted by start time (soonest first)
- Shows "In 2 days", "Tomorrow", "In 3 hours" badges

**LIVE (Mother Card Carousel - Active State)**
An event appears as LIVE when EITHER:

1. **Auto-Live**: Current time is within the event's time window (`firstSlotStart <= now <= lastSlotEnd`)
2. **Manually Live**: An official clicked "Go Live" button (`isLive === true`)

Badge differences:

- 🔴 **LIVE** (red pulsing) — Auto-live because current time is in window
- 🟢 **OFFICIALLY LIVE** (green + ✓) — Official confirmed event has started

**PAST (Dropdown in Mother Card)**
An event moves to PAST when EITHER:

1. An official clicked "End Event" (`endedAt` timestamp exists)
2. 24 hours have passed since the event's `lastSlotEnd` time

Shows events from the last 7 days only.

### Overnight Events Support

Events can span past midnight. Example: 10:00 PM to 1:00 AM

- `startTime`: "22:00" on Dec 1
- `endTime`: "01:00" (interpreted as next day, Dec 2)

The system automatically handles this by detecting when `endTime < startTime` and adding a day to the end date calculation.

### Mother Card States

**ACTIVE State** (≥1 live event):

- Colorful gradient border with glow animation
- Shows "X events live now" with pulsing red dot
- Live events carousel is visible
- Upcoming/Past dropdowns available

**INACTIVE State** (0 live events):

- Greyed out subtle card
- Shows "No live events" message
- Calendar icon with "Check back during scheduled events"
- Upcoming/Past dropdowns still available

---

## Appendix A: Glossary

| Term           | Definition                                                  |
| -------------- | ----------------------------------------------------------- |
| **Club**       | A university organization with events and members           |
| **Event**      | A scheduled activity hosted by a club                       |
| **Live Event** | An event currently happening (within time window + started) |
| **Official**   | A club member with posting privileges                       |
| **President**  | The club leader who approves content and manages officials  |
| **SAF**        | Student Affairs — university staff who moderate clubs       |
| **Admin**      | Super admin (you) with full system access                   |
| **Follow**     | Subscribe to a club's notifications                         |

---

## Appendix B: Related Documents

- [Data-Model.md](./Data-Model.md) — Firestore schema
- [Implementation-Plan.md](./Implementation-Plan.md) — Development phases
- [UI-Specs.md](./UI-Specs.md) — Design specifications
- [Admin-System.md](./Admin-System.md) — Admin dashboard details

---

_End of PRD_
