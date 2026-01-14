# 🚀 Clubs Feature - Implementation Plan

This document outlines the phased development approach for the Clubs feature.

---

## 📅 Timeline Overview

| Phase       | Focus              | Duration  | Dependencies |
| ----------- | ------------------ | --------- | ------------ |
| **Phase 1** | Foundation & Data  | 1 week    | None         |
| **Phase 2** | Club Pages & UI    | 1-2 weeks | Phase 1      |
| **Phase 3** | Events System      | 1-2 weeks | Phase 2      |
| **Phase 4** | Live Events & Chat | 1 week    | Phase 3      |
| **Phase 5** | Moderation & Roles | 1 week    | Phase 4      |
| **Phase 6** | Notifications      | 3-4 days  | Phase 5      |
| **Phase 7** | Admin Dashboard    | 3-4 days  | Phase 5      |
| **Phase 8** | Polish & Testing   | 1 week    | All          |

**Total Estimated Time**: 6-8 weeks

---

## 📦 Phase 1: Foundation & Data Layer

### Goals

- Set up Firestore collections and security rules
- Create data service methods
- Seed test data

### Tasks

#### 1.1 Firestore Setup

```
□ Create /clubs collection in Firestore
□ Create /admin/superAdmins document with your UID
□ Create /admin/safModerators document
□ Create /admin/clubConfig document with color palette
□ Add security rules from Firestore-Rules.md
□ Deploy rules: firebase deploy --only firestore:rules
```

#### 1.2 Data Service (`src/js/services/clubs/ClubsDataService.js`)

```javascript
// Methods to implement:
□ getClubsByUniversity(university) → Club[]
□ getClubById(clubId) → Club
□ getClubEvents(clubId, options) → Event[]
□ getClubMembers(clubId) → Member[]
□ followClub(userId, clubId) → void
□ unfollowClub(userId, clubId) → void
□ isFollowingClub(userId, clubId) → boolean
□ getUserFollowedClubs(userId) → Club[]
```

#### 1.3 Test Data

```
□ Create seed script: scripts/seedClubsTestData.js
□ Create 3-5 test clubs for IUB
□ Create 5-10 test events (mix of upcoming/past)
□ Assign yourself as president of one club
□ Test read operations work
```

### Deliverables

- [ ] Security rules deployed
- [ ] ClubsDataService with basic CRUD
- [ ] Test data in Firestore
- [ ] Console verification that reads work

---

## 📦 Phase 2: Club Pages & Core UI

### Goals

- Add Clubs tab to Groups page
- Build club listing page
- Build individual club page (skeleton)

### Tasks

#### 2.1 Router Updates (`src/js/router/Router.js`)

```javascript
□ Add 'clubs' route (inside groups)
□ Add 'club' route for individual club page
□ Add 'admin' route (hidden, for later)
```

#### 2.2 Groups Page Tab Integration (`src/js/pages/GroupsPage.js`)

```javascript
□ Add tab switcher: [Classes] [Clubs]
□ Track active tab in state
□ Render ClubsTab when selected
□ Preserve tab state on navigation
```

#### 2.3 Clubs Tab Component (`src/js/components/clubs/ClubsTab.js`)

```javascript
□ Fetch clubs for user's university
□ Render club cards in grid
□ Handle empty state
□ Handle loading state
□ Click handler → navigate to club page
```

#### 2.4 Club Card Component (`src/js/components/clubs/ClubCard.js`)

```javascript
□ Display: logo, name, follower count, events this week
□ Apply accent color from preset palette
□ Show next event date badge
□ Hover/tap states matching existing group cards
```

#### 2.5 Club Page (`src/js/pages/ClubPage.js`)

```javascript
□ Parse clubId from URL/hash
□ Fetch club data
□ Render header: banner, logo, name, description
□ Render Follow button
□ Render tabs: [Events] [Members]
□ Back button navigation
```

#### 2.6 CSS Styling (`src/css/clubs.css`)

```css
□ .clubs-tab-container
□ .clubs-grid
□ .club-card (match group-card glass style)
□ .club-card-logo
□ .club-card-info
□ .club-card-stats
□ .club-page-header
□ .club-banner
□ .club-tabs (reuse .group-tabs style)
□ Color palette CSS variables
```

### Deliverables

- [ ] Clubs tab visible in Groups page
- [ ] Club cards rendering with real data
- [ ] Individual club page loads
- [ ] Follow/unfollow working
- [ ] Responsive on mobile

---

## 📦 Phase 3: Events System

### Goals

- Display events in club page
- Create event form for officials
- Event approval flow for presidents

### Tasks

#### 3.1 Events Tab Component (`src/js/components/clubs/EventsTab.js`)

```javascript
□ Fetch club events (sorted by date)
□ Separate into: upcoming, past
□ Render event cards
□ Show approval status for officials
□ "+ Create Event" button (officials only)
□ "Show past events" accordion
```

#### 3.2 Event Card Component (`src/js/components/clubs/EventCard.js`)

```javascript
□ Display: title, date/time, location, image
□ Time display: "Dec 1, 7:00 PM - 10:00 PM"
□ Multi-day badge: "3-day event"
□ Status badge: Pending / Approved / Live
□ Click → expand or navigate to event detail
```

#### 3.3 Create Event Modal (`src/js/components/clubs/CreateEventModal.js`)

```javascript
□ Form fields: title, description, location
□ Date/time picker (support multiple slots)
□ Image upload with preview
□ Image compression before upload
□ Submit → status: pending_president
□ Validation: required fields, char limits
```

#### 3.4 Event Detail View (`src/js/components/clubs/EventDetail.js`)

```javascript
□ Full event info display
□ Hero image (full width)
□ All time slots for multi-day
□ Location with map link (optional)
□ Edit button (for creator/president)
□ Delete button (for president)
```

#### 3.5 Image Upload Service (`src/js/services/clubs/ClubImageService.js`)

```javascript
□ uploadEventImage(eventId, file) → url
□ uploadClubLogo(clubId, file) → url
□ uploadClubBanner(clubId, file) → url
□ deleteImage(path) → void
□ compressImage(file, maxSizeKB) → blob
□ Enforce aspect ratio validation
```

### Deliverables

- [ ] Events display in club page
- [ ] Create event form working
- [ ] Image upload working
- [ ] Events saved to Firestore
- [ ] Multi-day events supported

---

### 🔀 UX Divergence (2025-12-04)

- Members UI now shows **only President + Officials** (general members hidden for read-only simplicity).
- Role assignment uses the **Friends search component** with an Assign button; results scoped to university (or global for super admin).
- Confirmation modal chooses role (President disabled if already set); adds user as needed.

---

## 📦 Phase 4: Live Events & Announcements

### Goals

- Live Events section on Clubs tab (auto-escalation from all clubs)
- Live timeline with official announcements (one-way broadcast)
- Auto-live (time window) + Manual "Go Live" toggle

### Tasks

#### 4.1 Live Events Section (`src/js/components/clubs/LiveEventsSection.js`)

```javascript
□ Query events where isLive == true OR in time window
□ Filter by user's university
□ Sort by time remaining
□ Pulsing LIVE badge
□ Auto-refresh every 60 seconds
□ Show upcoming events below (greyed)
```

#### 4.2 Live Event Card (`src/js/components/clubs/LiveEventCard.js`)

```javascript
□ Pulsing red dot animation
□ Time remaining countdown
□ Club logo and name
□ Latest announcement preview
□ Click → open live event view
```

#### 4.3 Live Timeline Component (`src/js/components/clubs/LiveTimeline.js`)

```javascript
□ Real-time listener for announcements subcollection
□ Render announcements: avatar, name, role, time, content
□ "Event is now live!" pinned message at top
□ Announcement input (officials only)
□ Post announcement functionality
□ Auto-scroll on new announcements
□ View-only for students (no input shown)
```

#### 4.4 Go Live Flow (Auto + Manual)

```javascript
□ Auto-escalation: Events appear in Live section when currentTime is within timeSlots
□ Manual "Go Live" button (officials, 30 min before to end of event)
□ Update event: isLive=true, startedAt, startedBy, startedByInfo
□ Create "Event is now live!" announcement in announcements subcollection
□ Trigger push notification to followers
□ "End Event" button to manually close
```

#### 4.5 CSS for Live Events (`src/css/clubs/live.css`)

```css
□ .live-events-section / .mother-card
□ .live-event-card (with glow animation)
□ .live-badge (pulsing red) / .now-badge (green)
□ .upcoming-events-section (greyed/collapsed)
□ .live-timeline-container
□ .announcement-item
□ .announcement-input (officials only)
□ .event-live-message (pinned styling)
```

### Deliverables

- [ ] Live events section with Mother Card renders
- [ ] Auto-escalation: events appear when in time window (🟢 NOW badge)
- [ ] Manual Go Live: officials can toggle live (🔴 LIVE badge)
- [ ] Announcements display in real-time on live timeline
- [ ] Officials can post announcements
- [ ] Students view announcements (no input)
- [ ] End Event flow works

---

## 📦 Phase 5: Moderation & Role System

> **Current Implementation Status:** Phase 5 core (president moderation & roles) is complete. SAF dashboard, Cloud Function role management, and admin-level features are deferred to Phase 7. See `progress.md` for details.

### Goals

- Moderate tab for presidents/SAF
- Role promotion/demotion
- Event approval/rejection UI

### Tasks

#### 5.1 Moderate Tab (`src/js/components/clubs/ModerateTab.js`)

```javascript
□ Only visible to President/SAF/Admin
□ List pending events
□ Approve/Reject buttons
□ Rejection comment input
□ Show who submitted and when
```

#### 5.2 Members Tab Enhancement (`src/js/components/clubs/MembersTab.js`)

```javascript
□ Display president at top with 👑 badge
□ Officials section with role title badges
□ Regular members/followers below
□ "Promote to Official" button (president only)
□ "Remove Official" button (president only)
□ Role title input modal
```

#### 5.3 Role Management Cloud Functions (`functions/clubs/roleManagement.js`)

```javascript
□ promoteToOfficial(clubId, userId, roleTitle)
    - Validate caller is president/SAF/admin
    - Update user's clubRoles
    - Create member document
    - Increment club.memberCount

□ demoteOfficial(clubId, userId)
    - Validate caller is president/SAF/admin
    - Update user's clubRoles
    - Update member document
    - Decrement club.memberCount

□ assignPresident(clubId, userId)
    - Validate caller is SAF/admin
    - Update previous president's clubRoles
    - Update new president's clubRoles
    - Update club.presidentId and presidentInfo
```

#### 5.4 SAF Moderate Page (`src/js/pages/SafModeratePage.js`)

```javascript
□ List all clubs in moderator's university
□ Filter by: needs SAF approval
□ Pending events across all clubs
□ Quick approve/reject actions
□ Create club button
□ Assign president button
```

#### 5.5 Permission Helpers (`src/js/utils/clubs/permissionUtils.js`)

```javascript
□ canCreateEvent(user, clubId) → boolean
□ canApproveEvent(user, clubId) → boolean
□ canEditEvent(user, clubId, event) → boolean
□ canDeleteEvent(user, clubId) → boolean
□ canManageMembers(user, clubId) → boolean
□ canAccessModerateTab(user, clubId) → boolean
□ isSafModerator(user) → boolean
□ isSuperAdmin(user) → boolean
```

### Deliverables

- [ ] Moderate tab works for presidents
- [ ] Event approval flow complete
- [ ] Rejection with comments works
- [ ] Role promotion works
- [ ] SAF can manage multiple clubs
- [ ] Permission checks enforced in UI

---

## 📦 Phase 6: Notifications

### Goals

- Club notification types
- Push notifications for events
- Notifications page integration

### Tasks

#### 6.1 Notification Types (`src/js/services/clubs/ClubNotificationService.js`)

```javascript
□ notifyNewEvent(clubId, eventId)
    - Get all followers
    - Create notification for each
    - Send push notification

□ notifyEventReminder(eventId)
    - Triggered 15 min before event
    - Send to followers

□ notifyEventStarted(eventId)
    - Triggered when official starts event
    - Send to followers

□ notifyEventChanged(eventId)
    - Triggered when approved event is re-approved after edit
    - Send to followers

□ notifyEventCancelled(eventId)
    - Triggered when approved event is deleted
    - Send to followers

□ notifyEventPending(clubId, eventId)
    - Send to president

□ notifyEventApproved(eventId)
    - Send to creator

□ notifyEventRejected(eventId, reason)
    - Send to creator
```

#### 6.2 Cloud Functions for Notifications (`functions/clubs/notifications.js`)

```javascript
□ onCreate trigger for events (notify president of pending)
□ onUpdate trigger for events (notify on approval/rejection)
□ Scheduled function: event reminders (every 5 min check)
□ Push notification integration with existing FCM setup
```

#### 6.3 Notifications Page Integration (`src/js/pages/NotificationsPage.js`)

```javascript
□ Add filter for "Clubs" notifications
□ Club notification card rendering
□ Deep link to event/club on tap
□ Club logo in notification card
```

### Deliverables

- [ ] All notification types implemented
- [ ] Push notifications sending
- [ ] Notifications page shows club notifications
- [ ] Tapping notification navigates correctly
- [ ] Reminder notifications work (15 min before)

---

## 📦 Phase 7: Admin Dashboard

### Goals

- Hidden /admin route
- Super admin controls
- SAF management

### Tasks

#### 7.1 Admin Route (`src/js/router/Router.js`)

```javascript
□ Add 'admin' route
    - Hidden from navigation
    - Requires super admin check
    - Secondary PIN verification
```

#### 7.2 Admin Page (`src/js/pages/AdminPage.js`)

```javascript
□ PIN verification modal on entry
□ Dashboard with sections:
    - Universities overview
    - SAF moderator management
    - Club management
    - System maintenance
```

#### 7.3 SAF Management Section

```javascript
□ List all SAF moderators by university
□ Add SAF moderator form
□ Remove SAF moderator button
□ View moderator activity log
```

#### 7.4 Club Management Section

```javascript
□ List all clubs across universities
□ Create club form
□ Assign/change president
□ Deactivate/delete club
□ View club stats
```

#### 7.5 Maintenance Section

```javascript
□ "Clear old events" button (90+ days)
□ "Clear university schedules" button (semester reset)
□ "Rebuild follower counts" button
□ "View system stats" (read/write counts if available)
```

#### 7.6 Admin Cloud Functions (`functions/admin/`)

```javascript
□ addSafModerator(university, userId)
□ removeSafModerator(university, userId)
□ clearOldEvents(daysOld)
□ clearUniversitySchedules(university)
□ rebuildClubStats()
```

### Deliverables

- [ ] /admin route accessible only to you
- [ ] PIN verification working
- [ ] SAF management working
- [ ] Club management working
- [ ] Maintenance functions working

---

## 📦 Phase 8: Polish & Testing

### Goals

- Bug fixes
- Performance optimization
- User testing
- Documentation

### Tasks

#### 8.1 Performance Optimization

```
□ Implement club data caching (like groupsCache)
□ Lazy load event images
□ Pagination for large event lists
□ Debounce live events refresh
□ Optimize Firestore queries with proper indexes
```

#### 8.2 Error Handling

```
□ Network error states
□ Permission denied handling
□ Image upload failure recovery
□ Graceful degradation for missing data
```

#### 8.3 Accessibility

```
□ ARIA labels on interactive elements
□ Keyboard navigation
□ Screen reader testing
□ Color contrast verification
```

#### 8.4 Testing

```
□ Unit tests for permission utils
□ Unit tests for data service
□ Integration tests for key flows
□ Manual testing checklist (all user types)
□ Cross-browser testing (Chrome, Safari, Firefox)
□ Mobile testing (iOS Safari, Android Chrome)
```

#### 8.5 Documentation

```
□ Update AGENTS.md with clubs patterns
□ Add inline code documentation
□ Create user guide for club admins
□ Create SAF moderator guide
```

### Deliverables

- [ ] No critical bugs
- [ ] Performance targets met (<2s load)
- [ ] All user flows tested
- [ ] Documentation complete
- [ ] Ready for production

---

## 🗂️ File Structure

```
src/js/
├── pages/
│   ├── GroupsPage.js          # Modified: add tabs
│   ├── ClubPage.js            # NEW
│   ├── SafModeratePage.js     # NEW
│   └── AdminPage.js           # NEW
├── components/
│   └── clubs/
│       ├── ClubsTab.js        # NEW
│       ├── ClubCard.js        # NEW
│       ├── EventsTab.js       # NEW
│       ├── EventCard.js       # NEW
│       ├── MembersTab.js      # NEW
│       ├── ModerateTab.js     # NEW
│       ├── LiveEventsSection.js  # NEW
│       ├── LiveEventCard.js   # NEW
│       ├── LiveEventChat.js   # NEW
│       ├── CreateEventModal.js   # NEW
│       └── EventDetail.js     # NEW
├── services/
│   └── clubs/
│       ├── ClubsDataService.js    # NEW
│       ├── ClubImageService.js    # NEW
│       ├── ClubNotificationService.js  # NEW
│       └── ClubPermissions.js     # NEW
└── utils/
    └── clubs/
        └── permissionUtils.js     # NEW

src/css/
└── clubs.css                      # NEW

public/templates/
├── club.html                      # NEW
└── admin.html                     # NEW

functions/
├── clubs/
│   ├── roleManagement.js          # NEW
│   ├── notifications.js           # NEW
│   └── cleanup.js                 # NEW
└── admin/
    └── maintenance.js             # NEW
```

---

## ✅ Pre-Launch Checklist

Before going live:

```
□ All phases completed
□ Security rules tested thoroughly
□ Test data cleaned up
□ Production indexes deployed
□ Cloud Functions deployed
□ FCM configured for club notifications
□ At least 5 real clubs seeded
□ SAF moderator assigned and trained
□ Club presidents assigned and trained
□ Monitoring/alerting set up
□ Rollback plan documented
```

---

## 🔗 Related Documents

- [PRD.md](./PRD.md) — Full requirements
- [Data-Model.md](./Data-Model.md) — Schema details
- [Firestore-Rules.md](./Firestore-Rules.md) — Security rules
- [UI-Specs.md](./UI-Specs.md) — Design specs
- [Cloud-Functions.md](./Cloud-Functions.md) — Backend functions
- [Admin-System.md](./Admin-System.md) — Admin details

---

_End of Implementation Plan_
