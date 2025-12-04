# Clubs Implementation - Requirements & Goals

**Document Version**: 1.0  
**Created**: December 3, 2025  
**Last Updated**: December 3, 2025  
**Status**: Active

---

## 📋 Table of Contents

1. [Terminology](#terminology)
2. [Core Requirements](#core-requirements)
3. [Decisions Log](#decisions-log)
4. [Implementation Checklist](#implementation-checklist)
5. [Change Log](#change-log)

---

## Terminology

| Term              | Definition                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| **Follower**      | A user who follows a club to receive notifications. NOT shown in club details. Read-only privileges. |
| **Member**        | Synonym for Follower in data model context.                                                          |
| **Official**      | A user promoted by the President with action privileges. Custom role titles allowed.                 |
| **President**     | The club leader with full management powers. One per club, can lead multiple clubs.                  |
| **SAF Moderator** | Student Affairs staff who can manage clubs within their university.                                  |
| **Super Admin**   | System owner with god-mode access across all universities.                                           |

---

## Core Requirements

### R1: Navigation Structure

- **Requirement**: Clubs is a **top-level tab** in main navigation (not a sub-tab of Groups).
- **Status**: ✅ Implemented
- **Action**: Fix any docs that say otherwise.

### R2: Members Tab Content

- **Requirement**: Members tab shows **only President + Officials**. Followers are NOT displayed.
- **Followers** just follow for notifications; they don't appear in club details.
- **Status**: ✅ Implemented
- **Action**: MembersTab.js hides followers; docs updated.

### R3: President Removal Behavior

- **Requirement**: When a president is replaced, they **lose all roles** - not an official, not a follower.
- They become a regular user with no connection to the club.
- **Status**: ✅ Implemented
- **Action**: assignClubPresident Cloud Function removes old president completely.

### R4: Club Deletion Safety

- **Requirement**: Deleting a club requires SAF/Super Admin to **type the club's exact name** to confirm.
- **Who can delete**: Both SAF moderators and Super Admin.
- **Status**: ✅ Implemented
- **Action**: Name-confirmation modal added to AdminPage.js delete flow.

### R5: Event Rejection Details

- **Requirement**: Rejection must include:
  - President's name (who rejected it)
  - Rejection reason (minimum 15 characters)
- **Status**: ✅ Implemented
- **Action**: Validation + rejector name display in ModerateTab.js and EventDetailModal.js.

### R6: Officials Viewing Pending Events

- **Requirement**: Officials CAN see **all pending events** in Moderate tab but CANNOT approve/reject them.
- Example: Official A posts event, Official B can see it pending, but only President can approve.
- **Status**: ✅ Implemented
- **Action**: Moderate tab shown to officials in read-only mode.

### R7: Live Event Editing Behavior

- **Requirement**: If a live event is edited, it **immediately stops being live** until re-approved.
- **Status**: ✅ Implemented
- **Action**: CreateEventModal.js sets `isLive: false` when event is edited.

### R8: Event End Behavior

- **Requirement**: Ending an event is **permanent**. No restart capability. Event moves to Past.
- **Status**: ✅ Implemented

### R9: Event End Time

- **Requirement**: End time is **always required**. No open-ended events.
- **Status**: ✅ Implemented

### R10: Go Live Time Window

- **Requirement**: Go Live button appears **30 minutes before event start** for all events.
- Officials/President can click it to make event Live even if start time is still 30 mins away.
- Event reminders are sent **30 minutes before EACH time slot** for multi-day events.
- **Status**: ✅ Implemented

### R11: Notification Batching

- **Requirement**: When many notifications occur, send them in **batches** to optimize Firebase costs.
- **Status**: ✅ Implemented
- **Action**: Cloud Functions use 400-doc batches.

### R12: Live Event Notifications

- **Requirement**: **All users** receive live notifications when any event goes Live (not just followers).
- Future: Add user setting to turn off live notifications (not needed now).
- **Status**: ✅ Implemented
- **Action**: notifyAllUniversityUsers function in Cloud Functions.

### R13: Club Notification Badge

- **Requirement**: Club notifications show a badge on the **Clubs nav item** (desktop top-nav, mobile bottom-nav).
- Badge clears when user visits/navigates to Clubs page.
- **Status**: ✅ Implemented
- **Action**: Menu.js clubs indicator added.

### R14: Multi-Club Presidency

- **Requirement**: A person CAN be president of **multiple clubs**.
- **Status**: ✅ Implemented (data model allows it)

### R15: Club Without President

- **Requirement**: SAF and Admin can manage clubs with **no president assigned**.
- **Status**: ✅ Implemented

### R16: Vice President / Named Official Roles

- **Requirement**: Officials can have **custom role titles** (e.g., "Vice President", "Treasurer").
- These officials have official powers, NOT president powers.
- **Status**: ✅ Implemented (roleTitle field exists)

### R17: Club Search & Sorting

- **Requirement**:
  - Search bar at top to find clubs by name
  - Default sort: **followed clubs first**, then alphabetical
- **Status**: ✅ Implemented
- **Action**: Search input + sorting logic added to ClubsPage.js.

### R18: Followed Clubs First

- **Requirement**: Followed clubs appear at the **top** of the clubs grid.
- **Status**: ✅ Implemented (part of R17)

### R19: Club Categories

- **Requirement**: NOT needed for now.
- **Status**: N/A

### R20: Orphaned Image Cleanup

- **Requirement**:
  - Verify and delete orphaned images when event/club is deleted
  - `verifyOrphanedImages` callable function can list and optionally delete orphans
  - `deleteClub` function now deletes all associated images from Storage
- **Status**: ✅ Implemented
- **Action**: verifyOrphanedImages callable with dryRun option, deleteClub with Storage cleanup.

### R21: Event Retention Period

- **Requirement**: 90 days is sufficient.
- **Need**: A way to **test this in dev**.
- **Status**: ✅ Implemented
- **Action**: manualCleanupOldEvents callable function added with dryRun option.

### R22: Announcement Cleanup

- **Requirement**:
  - Announcements (NOT live chat - live chat does not exist) are deleted **24 hours after event ends**.
  - Only officials/president can post announcements during live events.
  - Users can view announcements on live events AND past events (until 24h after event end).
- **Status**: ✅ Implemented
- **Action**: All "live chat" references removed from docs; announcements-only system.

### R23: SAF Moderator Storage

- **Requirement**: Use the most efficient single source of truth for SAF moderators.
- **Status**: ✅ Implemented
- **Action**: Consolidated to /safModerators/{uid} storage location.

### R24: Follower Count Safety

- **Requirement**: Follower count can **never go below 0**.
- **Status**: ✅ Implemented
- **Action**: Cloud Function uses transaction with Math.max(0, count) for unfollows.

### R25: Multi-Day Event Live Behavior

- **Requirement**: Events spanning multiple days should only go live on their **set dates and time ranges**.
- Example: Event on Dec 1, 3, 5 should NOT show as live on Dec 2.
- **Status**: ✅ Implemented
- **Action**: LiveEventsSection.js checks each slot individually for live status.

### R26: Event Pagination

- **Requirement**: Load **10 events at a time** with pagination.
- **Status**: ✅ Implemented
- **Action**: ClubDetailPage.js has Load More pagination.

### R27: Image Loading Optimization

- **Requirement**: Implement best practice (lazy loading / thumbnails).
- **Status**: ✅ Implemented
- **Action**: Lazy loading added for all club images.

### R28: Mandatory SAF Approval

- **Requirement**: **ALL events must be approved by SAF moderators** before becoming visible to users.
- Event flow: Official creates → `pending_president` → President approves → `pending_saf` → SAF approves → `approved`
- President-created events skip directly to `pending_saf`.
- The `requireSafApproval` field is deprecated; SAF approval is now mandatory.
- **Status**: ✅ Implemented
- **Action**: CreateEventModal.js, ModerateTab.js updated to enforce mandatory SAF approval.

### R29: Club Creation via Admin/SAF Only

- **Requirement**: Clubs can ONLY be created via Admin or SAF dashboard.
- The "Create Test Club" button was removed from ClubsPage.
- DevTest clubs are only created via Firebase emulators.
- **Status**: ✅ Implemented
- **Action**: Removed createTestClub button from ClubsPage.js.

---

## Decisions Log

### D1: Official Detection Method

- **Decision**: Use `club.officialIds` array on club doc as source of truth.
- **Rationale**: More efficient for Firestore queries; single read to check role.
- **Sync**: `users.{uid}.clubRoles` updated by Cloud Functions for user-centric queries.

### D2: Follower Count Updates

- **Decision**: Use **Cloud Function only** (onClubFollow trigger).
- **Rationale**: Avoids double-counting from client writes.
- **Action**: Remove direct client writes to followerCount.

### D3: Live Chat vs Announcements

- **Decision**: **Announcements only**. No live chat concept.
- **Action**: Remove all "liveChat" references from docs and code.

### D4: Firestore Rules Documentation

- **Decision**: Make rules documentation **copy-paste safe** with correct syntax.
- **Action**: Fix syntax issues and add null-safety checks.

### D5: Missing Event Fields

- **Decision**: Add `endedAt`, `endedBy`, `reminderSent` to official Event data model.
- **Action**: Update Data-Model.md.

### D6: Data Count Fields

- **Decision**:
  - `memberCount` = **Officials + President** (people with power)
  - `followerCount` = **Anyone who follows** (for notifications)
  - Members Tab UI shows: **Only Officials + President** (not followers)
- **Status**: ✅ Confirmed

---

## Implementation Checklist

### Priority 1: Critical Fixes

- [x] R2: Update MembersTab to show only President + Officials ✅ (Already implemented in MembersTab.js)
- [x] R4: Add club deletion name confirmation modal ✅ (AdminPage.js)
- [x] R5: Add rejection reason validation (15 chars) + show rejector name ✅ (ModerateTab.js)
- [x] R6: Show Moderate tab to officials (read-only) ✅ (ModerateTab.js)
- [x] R7: Stop live event when edited ✅ (CreateEventModal.js)
- [x] D3: Remove all liveChat references, ensure announcements-only ✅ (Data-Model.md, Firestore-Rules.md, PRD.md, Cloud-Functions.md, Implementation-Plan.md, Admin-System.md, progress.md)

### Priority 2: Features

- [x] R13: Add club notification badge to nav ✅ (Menu.js - clubs indicator)
- [x] R17: Add club search + followed-first sorting ✅ (ClubsPage.js)
- [x] R18: Add followed-first sorting ✅ (ClubsPage.js)
- [x] R26: Add event pagination (10 at a time) ✅ (ClubDetailPage.js)
- [x] R27: Add lazy loading for images ✅ (ClubDetailPage.js, ClubsPage.js, EventDetailModal.js, LiveEventsSection.js)

### Priority 3: Optimization

- [x] R11: Implement notification batching ✅ (Already implemented - Cloud Functions use 400-doc batches)
- [x] R12: Live event notifications to ALL university users ✅ (functions/index.js - notifyAllUniversityUsers)
- [x] D2: Remove client-side followerCount writes, use Cloud Function only ✅ (Already correct - client only does optimistic UI, Cloud Function handles Firestore)
- [x] R24: Add follower count floor (min 0) ✅ (ClubsPage.js, ClubDetailPage.js)

### Priority 4: Documentation

- [x] R1: Fix docs saying Clubs is sub-tab of Groups ✅ (README.md, PRD.md)
- [x] R22: Remove liveChat from docs, announcements only ✅ (All docs updated)
- [x] D5: Add missing fields to Data-Model.md ✅ (devTest, devOwnerUid, rejectorName, liveStoppedAt)
- [x] D4: Fix Firestore rules doc syntax ✅ (Added null-safety checks to helper functions)
- [x] R23: Consolidate SAF moderator storage location ✅ (Updated Data-Model.md, Firestore-Rules.md to use /safModerators/{uid})

### Priority 5: Dev Tools

- [x] R21: Add dev testing method for 90-day cleanup ✅ (manualCleanupOldEvents callable function)
- [x] R20: Add orphaned image cleanup verification ✅ (verifyOrphanedImages callable function)

---

## Change Log

All changes to this document and related implementation should be logged here.

| Date       | Author | Change Description                                                                   | Related Requirement |
| ---------- | ------ | ------------------------------------------------------------------------------------ | ------------------- |
| 2025-12-03 | System | Initial document creation                                                            | All                 |
| 2025-12-03 | Agent  | Implemented officials read-only view in ModerateTab                                  | R6                  |
| 2025-12-03 | Agent  | Added 15-char min rejection reason + president name display                          | R5                  |
| 2025-12-03 | Agent  | Added club deletion name confirmation in AdminPage                                   | R4                  |
| 2025-12-03 | Agent  | Added club search and followed-first sorting in ClubsPage                            | R17, R18            |
| 2025-12-03 | Agent  | Added CSS for new UI elements                                                        | R4, R5, R6, R17     |
| 2025-12-03 | Agent  | Added R7: Stop live event when edited (sets isLive=false, status=pending_president)  | R7                  |
| 2025-12-03 | Agent  | Added R12: Live event notifications to ALL university users via Cloud Function       | R12                 |
| 2025-12-03 | Agent  | Added R24: Follower count floor (Math.max(0, count))                                 | R24                 |
| 2025-12-03 | Agent  | Removed all liveChat references from docs, replaced with announcements               | D3, R22             |
| 2025-12-03 | Agent  | Added R13: Clubs notification badge on nav (Menu.js)                                 | R13                 |
| 2025-12-03 | Agent  | Added R26: Event pagination with Load More button (10 at a time)                     | R26                 |
| 2025-12-03 | Agent  | Added R27: Lazy loading for all club images                                          | R27                 |
| 2025-12-03 | Agent  | Verified R2, R11, D2 already implemented                                             | R2, R11, D2         |
| 2025-12-03 | Agent  | Fixed docs for nav location (top-level, not sub-tab)                                 | R1                  |
| 2025-12-03 | Agent  | Added missing fields to Data-Model.md                                                | D5                  |
| 2025-12-03 | Agent  | Fixed Firestore rules null-safety in helper functions                                | D4                  |
| 2025-12-03 | Agent  | Updated SAF moderator storage to /safModerators/{uid}                                | R23                 |
| 2025-12-03 | Agent  | Added cleanupOldClubEvents scheduled function (weekly, 90-day cleanup)               | R21                 |
| 2025-12-03 | Agent  | Added manualCleanupOldEvents callable for dev testing with dryRun                    | R21                 |
| 2025-12-03 | Agent  | Added verifyOrphanedImages callable for orphaned image verification                  | R20                 |
| 2025-12-04 | Agent  | Fixed R5: Added rejection info display to EventDetailModal (rejector name + reason)  | R5                  |
| 2025-12-04 | Agent  | Fixed demoteClubOfficial bug: was using undefined previousPresidentId variable       | Bug Fix             |
| 2025-12-04 | Agent  | Fixed R3: assignClubPresident now removes old president completely                   | R3                  |
| 2025-12-04 | Agent  | Fixed D6: memberCount now only counts president + officials (not followers)          | D6                  |
| 2025-12-04 | Agent  | Fixed R25: Multi-day events check each slot individually for live status             | R25                 |
| 2025-12-04 | Agent  | Updated Firestore rules: isSafModerator() helper + SAF can create/delete clubs       | R4                  |
| 2025-12-04 | Agent  | Updated Data-Model.md with rejection fields (rejectedBy, rejectedByInfo, rejectedAt) | D5                  |
| 2025-12-04 | Agent  | Updated Data-Model.md with live stop fields (liveStoppedBy, liveStopReason)          | D5                  |
| 2025-12-04 | Agent  | Updated Admin-System.md to use /safModerators/{uid} storage path                     | R23                 |
| 2025-12-04 | Agent  | Synced all Core Requirements status flags with Implementation Checklist              | All                 |
| 2025-12-04 | Agent  | Fixed ClubsPage.js duplicate code block syntax error                                 | Bug Fix             |
| 2025-12-04 | Agent  | Fixed rejectedByInfo/createdByInfo name field handling (firstName+lastName support)  | R5                  |
| 2025-12-04 | Agent  | Made SAF approval mandatory for ALL events (R28)                                     | R28                 |
| 2025-12-04 | Agent  | Removed Create Test Club button from ClubsPage (R29)                                 | R29                 |
| 2025-12-04 | Agent  | Changed event reminders from 15 to 30 minutes before start                           | R10                 |
| 2025-12-04 | Agent  | Updated reminders to send for EACH time slot in multi-day events                     | R10                 |
| 2025-12-04 | Agent  | Fixed followerCount floor using transaction (R24)                                    | R24                 |
| 2025-12-04 | Agent  | Fixed SAF approval universityId field matching (club.university vs universityId)     | R28                 |
| 2025-12-04 | Agent  | Added deleteClub image cleanup from Firebase Storage                                 | R20                 |
| 2025-12-04 | Agent  | Made verifyOrphanedImages actually list and delete orphan files                      | R20                 |
| 2025-12-04 | Agent  | Deprecated requireSafApproval field in Data-Model.md                                 | R28                 |
| 2025-12-04 | Agent  | Added remindersSentForSlots field to Event model for multi-day tracking              | R10                 |

---

## Update Instructions

When making changes related to this document:

1. **Before implementing**: Check this document for requirements.
2. **After implementing**:
   - Update the status in Core Requirements (❌ → 🔄 → ✅)
   - Add entry to Change Log
   - Update Implementation Checklist
3. **Format for Change Log entries**:
   ```
   | YYYY-MM-DD | Author | Brief description of change | R# or D# |
   ```

---

_End of Requirements & Goals Document_
