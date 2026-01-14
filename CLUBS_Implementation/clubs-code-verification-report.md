# 🎓 Clubs Feature — Code Verification Report

_Date: 2025-12-06_  
_Source: Codebase only (docs used as checklist, not as truth)_

---

## 1. What I Verified (Checklist)

**Navigation & Routing**
- [✅] `#clubs` route → `ClubsPage` via `Router.js` (`clubs` main nav)
- [✅] `#club?id=…` route → `ClubDetailPage` for an individual club
- [✅] Separate `messages`/class-spaces route (old “Groups”) vs `clubs`

**Clubs Listing & Mother Card**
- [✅] Clubs grid fetches from `/clubs` (up to 50) and renders cards with name, description, follower count
- [✅] “Follow”/“Following” button on each card updates `users.followedClubs` and local follower counts
- [✅] Top-of-page “Mother Card” (`LiveEventsSection`) shows:
  - [✅] Live events carousel when any events qualify
  - [✅] Collapsible “Upcoming” and “Past Events” dropdown sections
  - [✅] Auto-refresh every 60s and safe teardown on page unload

**Individual Club Page**
- [✅] `ClubDetailPage` pulls `/clubs/{clubId}` and renders:
  - Header: banner, logo, club name, university badge
  - Stats: followers, memberCount, eventsThisWeek
  - Follow/Unfollow button with optimistic UI + profile sync
- [✅] Tabbed layout: **Events**, **Members**, and conditional **Moderate** tab
- [✅] Deep link from Mother Card: `#club?id=…&eventId=…` opens the correct club and (if allowed) the event detail modal

**Events & Live Events**
- [✅] Events stored as `/clubs/{clubId}/events/{eventId}` with:
  - `timeSlots[]`, `firstSlotStart`, `lastSlotEnd`, `status`, `isLive`, `createdBy*`, `approvedBy*`, `safApproved*`, etc.
- [✅] `ClubDetailPage`:
  - Paginates events (10 at a time) sorted by `firstSlotStart`
  - Shows **only approved** events to regular students
  - Shows **all** events (approved + pending + rejected) to presidents/officials/dev owners
  - Splits view into **Upcoming** (including currently-live) vs **Past** with a collapsible Past section
- [✅] `CreateEventModal`:
  - Supports multi-day events via multiple `timeSlots`
  - Enforces required fields and basic length limits
  - Writes `status` and metadata consistent with the state machine (`pending_president`, `pending_saf`, `approved`, `rejected`, `cancelled`)
- [✅] `EventDetailModal`:
  - Shows full event info (hero image, schedule, location, description, creator, createdAt)
  - Handles status badges (pending, rejected with reason, cancelled, live)
  - Exposes **Edit** / **Delete** buttons only when the current user is allowed to manage the event
  - Implements **Go Live** / **End Event** controls for eligible users within the proper time window
- [✅] `LiveEventsSection` (“Mother Card” logic):
  - Queries all clubs for the current university and their **approved** events
  - Categorizes into **live**, **upcoming (next 3 days)**, and **past (last 7 days)** based on `timeSlots`, with correct overnight handling
  - Treats an event as live if `isLive === true` **OR** current time sits inside a specific slot window (slot-by-slot, not first→last continuous)
  - Uses compact cards for dropdowns and richer cards for live carousel, wired to navigate into `ClubDetailPage`

**Roles, Permissions & Moderation**
- [✅] Permissions are enforced in **three layers**:
  1. **Firestore rules** (`/clubs`, `/clubs/{clubId}/events`):
     - Authenticated users can read clubs and read **approved** events
     - Presidents/dev owners/officials can read **all** events
     - Event creation/update/delete rules match the described flows:
       - Officials can only create `pending_president` events and edit their own pending/rejected events
       - Presidents/SAF/super admins can approve/reject/update/delete
       - Officials can toggle live state on approved events they created (limited field diff)
  2. **Cloud Functions** (Firebase v2 in `functions/index.js`):
     - Callable functions for role changes and presidency assignments
     - Event triggers for status transitions and notifications
     - Scheduled jobs for reminders and cleanup
  3. **UI gating** (client-side):
     - `ClubDetailPage` checks dev owner, presidentId, createdBy, and `officialIds`/members to decide what tabs and actions to show
     - `MembersTab` + `ModerateTab` only render sensitive controls when the current user is allowed
- [✅] Members & roles:
  - `MembersTab` shows president + officials (with badges), not the full follower list
  - Promotion/demotion/presidency transfer/kick all call cloud functions (`promoteClubOfficial`, `demoteClubOfficial`, `assignClubPresident`, `removeClubMember`)
  - `clubMembers` subcollection + `user.clubRoles` keep roles denormalized and in sync
- [✅] SAF moderator dashboard (`SafModeratePage`):
  - Resolves moderator’s university via `/safModerators/{uid}`
  - Filters clubs by `universityId` / `universityCode` / legacy `university`
  - Provides tabs for pending events and clubs management (create/edit/delete, assign president)
- [✅] Admin dashboard (`AdminPage`):
  - Access gated via router flag `requiresSuperAdmin`
  - Has a Clubs tab with table of all clubs, filters, and “Create / Edit / Delete / Assign President” actions
  - Uses `AdminService` + `ClubCreatorModal` + `ClubImageService` for image upload and stats maintenance

**Follow / Unfollow & Stats**
- [✅] Client:
  - `ClubsPage` and `ClubDetailPage` both keep `currentUser.profile.followedClubs` and local follower counts in sync with optimistic updates
  - Buttons are disabled during async operations to avoid “double click” races
- [✅] Cloud Functions (`onClubFollow`):
  - Watches `users.followedClubs` changes, computes follows/unfollows, and updates `clubs.followerCount`
  - Uses `FieldValue.increment` for follows and a transaction for unfollows with a **floor at 0**
- [✅] Admin maintenance (`rebuildClubStats` in `AdminService`):
  - Re-scans all clubs and recomputes `memberCount` (president + officials only) and event counts

**Notifications**
- [✅] Server-side (`functions/index.js`):
  - Firestore triggers for:
    - `onClubEventCreated` (notifies president or SAF moderators, or followers in direct-approval edge cases)
    - `onClubEventStatusChanged` (creator + followers depending on transition)
    - `onClubEventStarted` / related live-event triggers
    - Scheduled reminders 30–35 mins before each time slot for approved events
  - Writes notifications into `/notifications` with `type` values like:
    - `club_new_event`, `club_event_reminder`, `club_event_started`, `club_event_changed`, `club_event_cancelled`
    - `club_event_pending`, `club_event_pending_saf`, `club_event_approved`, `club_event_rejected`, `club_event_president_approved`
  - Scheduled cleanup for old club notifications
- [✅] Client-side:
  - `ClubNotificationService` decides badges/icons/text for each club notification type
  - `NotificationsPage`:
    - Filters by “Clubs”
    - Renders club notifications using `isClubNotification` + `getClubNotificationDisplay`
    - “View” buttons deep-link back to `#club?id=…&eventId=…`

**Data Model & Rules Alignment**
- [✅] `clubs` documents:
  - Fields like `clubId`, `name`, `description`, `universityId/universityCode`, `accentColor`, `presidentId`, `presidentInfo`, `devTest`, `devOwnerUid`, `followerCount`, `memberCount`, `eventsThisWeek`, `nextEventDate`
  - Firestore rules enforce:
    - Only SAF moderators or super admins (plus special dev-test caveats) can create clubs
    - Presidents and dev owners can only change membership-related fields; core fields are frozen without admin-level access
- [✅] `events` documents:
  - Multi-slot scheduling with `timeSlots[]`, `firstSlotStart`, `lastSlotEnd`
  - Status + live-state fields (`status`, `isLive`, `startedAt`, `endedAt`, `rejectedByInfo`, etc.) match what UI and Functions use
- [✅] `members` subcollection:
  - Stores role/type, display name, and metadata
  - Firestore rules currently allow read for authed users and write for super admin (most mutations happen via cloud functions)

**Testing & Safety Nets**
- [✅] Jest tests in `src/js/tests/services/clubs/club-moderation.test.js`:
  - Validate visibility rules (who sees pending/rejected events)
  - Validate `CreateEventModal.isUserPresident()` logic for devTest/president/creator roles
- [✅] Extra safeguards:
  - Consistent HTML-escaping helpers on user-controlled text (`escapeHtml`, `escapeAttr`, `escapeHTML`)
  - Defensive checks for legacy data shapes in Firestore rules (e.g., guarding absent `devTest`, `officialIds`)
  - Pagination and debounce in hot paths (events list, clubs search, live events reload)

---

## 2. How the Clubs Feature Works (From Code)

Think of the feature as three main layers glued together:

```text
┌───────────────┐      ┌────────────────────────┐      ┌─────────────────────┐
│   UI (SPA)    │────▶ │ Firestore + Storage    │ ───▶ │ Cloud Functions     │
│ (ClubsPage,   │◀──── │ (clubs, events,       │ ◀─── │ (triggers, callables│
│  ClubDetail,  │      │  members, notifications)│     │  + schedulers)      │
└───────────────┘      └────────────────────────┘      └─────────────────────┘
```

**Happy Path: student discovering events**

```text
Student
  │
  │  #clubs
  ▼
ClubsPage
  │  - Shows Live Mother Card (LiveEventsSection)
  │  - Shows grid of clubs (sorted: followed first, then popular)
  │
  ├─ taps live event  ─────────┐
  │                            │
  └─ taps club card ───────┐   │
                            ▼   ▼
                        ClubDetailPage (#club?id=...)
                          │
                          ├─ Events tab: upcoming + past events
                          ├─ Members tab: president + officials
                          └─ Moderate tab (if president/official)
```

**Event lifecycle (from code’s perspective)**

```text
CreateEventModal
  └─ writes /clubs/{club}/events/{event}
       status = pending_president

Club president (ModerateTab)
  └─ updates status → pending_saf
         ▲
         │   SAF dashboard (SafModeratePage)
         └── updates status → approved / rejected

Cloud Functions
  ├─ onClubEventCreated / onClubEventStatusChanged
  │    ├─ notify president / SAF / creator
  │    └─ notify followers when approved/live/changed/cancelled
  └─ periodic reminders (30–35 min before each slot)

LiveEventsSection
  └─ consumes approved events + `isLive` state
       → renders Live / Upcoming / Past
```

**Roles graph**

```text
Super Admin  ── manages ──► SAF Moderators ── manage ──► Clubs in their university
                               │
                               ▼
                           Presidents ── manage ──► Officials
                               │                     │
                               ▼                     ▼
                             Events  ◄────────────  Create/Go Live
                               ▲
                               │
                           Students (view + follow only)
```

Overall, the codebase implements a clean three-tier permission model where:
- Students mostly read and follow.
- Officials create drafts and can Go Live for approved events they created.
- Presidents/SAF/Admin do the heavy lifting: approval, moderation, and club management.

---

## 3. Notable Gaps & Differences vs. the Docs (From Code)

These are the main “mind the gap” spots where the current implementation deviates from, or doesn’t yet fully cover, what the CLUBS docs describe:

- **Live announcement timeline UI**
  - Cloud Functions write event “live” announcements into `announcements` subcollections, and admin cleanup deletes them.
  - I don’t see a dedicated **Live Timeline / Announcements** UI component wired into the app yet (no `LiveTimeline` JS in `src/js/components/clubs`).
  - Today, “live” is represented via badges and countdown on the event detail modal + the Mother Card, but the one-way announcement feed appears incomplete on the client side.

- **University-wide announcement events**
  - Data model mentions `isUniversityAnnouncement` and a special SAF/Admin “university announcement” flow.
  - I don’t see any concrete UI or server-side branching for that flag in the current code (no filters or badges that treat these differently from regular events).

- **Admin maintenance via Cloud Functions vs. client**
  - The docs talk about callable maintenance functions (e.g., `clearOldEvents`, `rebuildClubStats`) under `functions/admin/`.
  - In practice, `rebuildClubStats` is implemented as a **client-side** maintenance helper in `AdminService`, which is fine but slightly different from the “callable function” architecture sketched in the docs.

- **Dev Test Clubs creation button**
  - `ClubsPage` exposes a **“Create Test Club”** button in dev mode (based on hostname) for any user.
  - Firestore rules, however, only allow dev-test club creation by **super admins** (and require `devTest: true` and matching `devOwnerUid`).
  - This means non-super-admin dev users will see a button that will likely fail at the security layer—harmless but a bit confusing.

- **SAF moderator storage layout**
  - The current code uses a `safModerators` collection (docs have both collection and alternative admin-based mapping).
  - The implemented approach is consistent and scoped by `universityId`; any remaining differences in the Cloud-Functions docs look like a past draft, not an active mismatch.

None of these are dangerous; they’re more “feature still in progress” or “implementation detail differs from the planning doc.” The core flows (discover clubs, follow clubs, create/approve events, see live events, manage roles, and receive notifications) are all present and wired together coherently.

---

## 4. TL;DR in Plain English

- The **core Clubs feature is implemented end-to-end**: routing, list page, individual club page, role system, event lifecycle, live events “Mother Card”, SAF/Admin tools, Firestore rules, Cloud Functions, and notification wiring all work together and generally match the intent of the CLUBS docs.
- **Permissions feel sane**: presidents and officials can do what you’d expect, SAF has per-university power, and the rules, UI, and backend triggers all agree on who can see and change what.
- **Live events and notifications are first-class**: going live, reminding followers, and cleaning up old noise is all handled on the backend, with a solid UI surface on the Clubs tab and event detail modal.
- The main missing “doc promises” are the **live announcement timeline UI** and the **special university-announcement badge flow**; everything else is surprisingly aligned for a feature of this size.

If you’d like, I can next:
- Turn this checklist into a repeatable QA script, or
- Drill into any one area (e.g., Firestore rules, Cloud Functions, or UI flows) with more detailed notes.

