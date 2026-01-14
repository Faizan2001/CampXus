# Implementation Plan — Profiles + Class Spaces

This is the engineering plan aligned with the final PRD.

## Phase 1 — Profiles
- UI
  - Replace Setup Step 2 with: photo upload (client resize 512×512 WebP + 128×128 thumb), avatar toggle, interests chips, curated Q&A (≥1, ≤5 answers), social links (optional).
  - Full profile view for same-university: photo, social links, add friend, bio, interests, Q&A, mutual friends preview (top 3 + view all), classes in common.
  - Gate Groups until `systemInfo.profileSetupComplete === true`.
- Data
  - Add fields only when provided: `profile.minor`, `profile.profilePhotoUrl`, `profile.useAvatar`, `profile.interests[]`, `profile.qnaResponses[]`, `profile.socialLinks[]`.
  - Storage: `profilePhotos/{uid}/photo.webp` and `.../thumb.webp`.

## Phase 2 — Courses[] and Normalization
- Extend schedule paste flow to also produce normalized `courses[]` on save:
  - `{ courseName, courseCode?, section, dayPattern, timeStart, timeEnd, timeSlot, classroom }`.
  - Implement `normalizeCourseForSave(course)` helper.
  - Implement `dataManager.updateUserCourses(userId, courses)` to write `users/{uid}.courses` (omit if empty).

## Phase 3 — Class Spaces (Daily Scheduler)
- Cloud Function `scheduleDailyClassSpaces` (06:00 Asia/Dhaka):
  - Read users with non-empty `courses[]`.
  - Bucket by canonical key (university + courseName + section + dayPattern + timeSlot + classroom).
  - If bucket size ≥4, upsert `classSpaces/{spaceId}` with metadata, `memberIds`, `memberCount`, `memberInfo` cache; ensure no duplicates via deterministic `spaceId` and transaction.
  - Remove members no longer in bucket; mark `active=false` if <4.
  - No instant joins; only batch updates membership.
- UI
  - Groups page cards with: name, room + time, member count, last message preview, unread badge.
  - Insert Groups button between Friends and Notifications; bottom nav <768px else top nav.

## Phase 4 — Messaging
- Cloud Function `sendGroupMessage`:
  - Auth + membership check; rate limit 1 message / 3 seconds per user per group.
  - Write message with serverTimestamp; update `lastActivity` and `lastMessagePreview`.
- Client
  - Listener only on active chat; `orderBy('createdAt')`, `limit(50)`; paginate older via `startAfter`.
  - Detach listeners on navigate.
- Retention
  - Nightly `trimSpaceMessages` to keep ≤2,000 messages per space (batched deletes).

## Phase 5 — Moderation v1
- Report modal (reasons: Harassment, Spam, Impersonation, Inappropriate profile, Other + ≥50 chars) → `moderationReports/{autoId}`.
- Block user UX (client-side hide for now).

## Performance & Cost
- Cache profiles 1h; lazy rosters; attach chat listeners only when open.
- Photo sizes enforced (200–300 KB main + 20–40 KB thumb).
- Admin clears schedules between semesters to reset groups organically (no termKey).

