# Clubs Implementation — Progress Log

**Repository:** CampXus  
**Branch:** clubs-implementation  
**Started:** 2025-11-26  
**Last Updated:** 2025-12-04

---

## Implementation Summary

### Phase 1-2: Foundation (2025-11-26) ✅

- Created Firestore data model and rules for clubs
- Added SPA routes: `#clubs`, `#club`, `#messages`
- Created ClubsPage.js, ClubDetailPage.js templates
- Implemented follow/unfollow with optimistic UI
- Fixed Firestore rules for follower count updates

### Phase 3: Events System (2025-11-26) ✅

- Event CRUD with CreateEventModal and EventDetailModal
- Multi-day events with time slots array
- Image upload to Firebase Storage (resize to 1200×675 WebP)
- Custom date picker (calendar) and time picker (iOS-style wheels)
- Overnight event support (e.g., 10PM-1AM)

### Phase 4: Live Events (2025-11-30) ✅

- Mother Card component with active/inactive states
- Auto-escalation: events appear in Live section when in time window
- Manual Go Live/End Event buttons (30 min before start)
- Live badge (🔴) vs NOW badge (🟢)
- Upcoming/Past event dropdowns with 60-second auto-refresh
- Event deep linking via URL parameters

### Phase 5: Moderation & Roles (2025-11-30) ✅

- MembersTab: President + Officials display with promote/demote
- ModerateTab: Pending events approval/rejection (president only)
- Role-based event creation (officials → pending, presidents → approved)
- Firestore rules for role-based access
- Cloud Functions for role sync: `promoteClubOfficial`, `demoteClubOfficial`, `assignClubPresident`, `removeClubMember`

### Phase 6: Notifications (2025-11-30) ✅

- ClubNotificationService for notification type handling
- Cloud Functions triggers:
  - `onClubEventCreated` → notify president
  - `onClubEventStatusChanged` → notify creator + followers
  - `onClubEventStarted` → notify followers on Go Live
  - `sendClubEventReminders` → 15 min before start
  - `cleanupOldClubNotifications` → 30-day retention
- Notifications page: Clubs filter + club notification cards
- Deep linking from notifications to club/event

### Phase 7: Admin Dashboard (2025-12-03) ✅

- Hidden `/admin` route with PIN verification
- Tabs: Overview, Universities, SAF Mods, Clubs
- University CRUD with clubCount sync
- SAF Moderator management (`safModerators/{uid}`)
- Club creation/edit/delete with president assignment
- Admin activity logging (`/adminActivity`)
- Firestore rules for super admin access

### Phase 8: Polish & SAF Flow (2025-12-04) ✅

- SAF approval workflow: `pending_president` → `pending_saf` → `approved`
- SAF Moderator Dashboard (`/#saf`) for per-university event approval
- `approveClubEventSaf` callable with university scoping
- Denormalized data sync on profile changes
- Event image permissions for officials in Storage rules
- Member count integrity via `onClubMemberChanged` trigger

---

## Key Files Created/Modified

### Pages & Components

| File                                           | Purpose                                        |
| ---------------------------------------------- | ---------------------------------------------- |
| `src/js/pages/ClubsPage.js`                    | Clubs list with search, followed-first sorting |
| `src/js/pages/ClubDetailPage.js`               | Club detail with Events/Members/Moderate tabs  |
| `src/js/pages/AdminPage.js`                    | Super admin dashboard                          |
| `src/js/pages/SafModeratePage.js`              | SAF moderator event approval                   |
| `src/js/components/clubs/CreateEventModal.js`  | Event create/edit form                         |
| `src/js/components/clubs/EventDetailModal.js`  | Event detail view with Go Live                 |
| `src/js/components/clubs/MembersTab.js`        | Role management UI                             |
| `src/js/components/clubs/ModerateTab.js`       | Event approval UI                              |
| `src/js/components/clubs/LiveEventsSection.js` | Mother Card component                          |

### Services

| File                                               | Purpose                    |
| -------------------------------------------------- | -------------------------- |
| `src/js/services/clubs/ClubImageService.js`        | Image processing & upload  |
| `src/js/services/clubs/ClubNotificationService.js` | Notification type handling |
| `src/js/services/admin/AdminService.js`            | Admin CRUD operations      |

### CSS

| File                | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `src/css/clubs/`    | All clubs styling (modals, events, members, live) |
| `src/css/admin.css` | Admin dashboard styling                           |

### Cloud Functions (`functions/index.js`)

| Function                      | Trigger   | Purpose                            |
| ----------------------------- | --------- | ---------------------------------- |
| `onClubEventCreated`          | Firestore | Notify president of pending events |
| `onClubEventStatusChanged`    | Firestore | Notify on approval/rejection       |
| `onClubEventStarted`          | Firestore | Notify followers on Go Live        |
| `sendClubEventReminders`      | Scheduled | 15-min reminders                   |
| `cleanupOldClubNotifications` | Scheduled | 30-day cleanup                     |
| `promoteClubOfficial`         | Callable  | Promote to official                |
| `demoteClubOfficial`          | Callable  | Demote from official               |
| `assignClubPresident`         | Callable  | Transfer presidency                |
| `removeClubMember`            | Callable  | Kick member                        |
| `approveClubEventSaf`         | Callable  | SAF approval step                  |
| `addSafModerator`             | Callable  | Add SAF mod                        |
| `removeSafModerator`          | Callable  | Remove SAF mod                     |
| `manualCleanupOldEvents`      | Callable  | Dev testing for 90-day cleanup     |
| `verifyOrphanedImages`        | Callable  | Check orphaned images              |

---

## Navigation Structure (Final)

```
Main Navigation
├── Schedule      (nav icon)
├── Friends       (nav icon)
├── Clubs         (nav icon) ← Campus organizations & events
├── Messages      (nav icon) ← Class spaces messaging
└── Notifications (top-right icon)

Hidden Routes:
├── /admin        ← Super admin dashboard (PIN protected)
└── /saf          ← SAF moderator dashboard
```

---

## Data Model Overview

### Collections

- `clubs/{clubId}` — Club documents with presidentId, officialIds, followerCount
- `clubs/{clubId}/events/{eventId}` — Events with timeSlots, status, isLive
- `clubs/{clubId}/members/{uid}` — Membership with role (president/official/member)
- `clubs/{clubId}/events/{eventId}/announcements/{id}` — Live event announcements
- `safModerators/{uid}` — SAF moderator records with universityId scope
- `universities/{id}` — University configuration
- `admin/superAdmins` — Super admin UIDs and PIN hash
- `adminActivity/{id}` — Admin action log

### Event Status Flow

```
Officials create → pending_president
Presidents create (no SAF) → approved
Presidents create (SAF required) → pending_saf
President approves (no SAF) → approved
President approves (SAF required) → pending_saf
SAF approves → approved
```

---

## Recent Changes (2025-12-04)

### Bug Fixes

- **demoteClubOfficial**: Fixed undefined `previousPresidentId` variable → now uses `userId`
- **assignClubPresident (R3)**: Old president now completely removed from club (not kept as member)
- **memberCount (D6)**: Now correctly counts only president + officials (not all members)
- **Multi-day live (R25)**: LiveEventsSection checks each time slot individually for live status

### Live Stop Field Consistency

- **Field naming**: Renamed `stoppedAt/stoppedBy/stoppedReason` to `liveStoppedAt/liveStoppedBy/liveStopReason` in CreateEventModal.js to match Data-Model.md
- **LiveEventsSection**: Now treats events with `liveStoppedAt` as "past" even if time window hasn't finished
- **Cloud Function logging**: `onClubEventStatusChanged` now logs live stops to `adminActivity` collection for audit trail
- **liveStopReason values**: `"edited"` (event was edited while live) or `"manual"` (explicit stop)

### EventDetailModal Enhancement

- Added rejection info panel showing rejector name and reason (R5)
- New CSS styling in `.rejection-info-panel`

### Firestore Rules

- Added `isSafModerator()` helper function
- Club creation: Now only SAF moderators or super admins can create clubs (not any verified user)
- Club deletion: SAF moderators can now delete clubs (in addition to super admins and owners)

### Data-Model.md Updates (D5)

- Added rejection fields: `rejectedBy`, `rejectedByInfo`, `rejectedAt`
- Added live stop fields: `liveStoppedBy`, `liveStopReason`

### Admin-System.md Updates (R23)

- Fixed SAF moderator storage path from `admin/safModerators` to `/safModerators/{uid}`
- Updated `addSafModerator` and `removeSafModerator` function docs

### Requirements_Goals.md Sync

- All Core Requirements status flags updated to match Implementation Checklist
- All 27 requirements now marked as ✅ Implemented

### Dev Tools (R20, R21)

- `manualCleanupOldEvents` — Callable for testing 90-day cleanup with dryRun option
- `verifyOrphanedImages` — Callable to check orphaned Storage images
- Added `getStorage` and `onCall`/`HttpsError` imports to functions

### SAF Hardening

- Presidents can no longer approve `pending_saf` events
- SAF callable enforces university scoping strictly
- ModerateTab hides `pending_saf` events from presidents

### Requirements Complete

All 27 requirements from initial review implemented. See `Requirements_Goals.md` for full checklist.

---

## Commands

```bash
# Development
npm run dev           # Start Vite dev server
npm run dev:config    # Generate window.ENV config

# Testing
npm test              # Run Jest tests

# Firebase
npm run firebase:emulators   # Start emulators
npm run firebase:deploy      # Deploy to production

# Build
npm run build         # Production build
npm run preview       # Preview production build
```

---

_End of Progress Log_
