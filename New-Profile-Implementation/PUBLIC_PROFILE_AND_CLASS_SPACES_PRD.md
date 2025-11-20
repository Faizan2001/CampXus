# Public Profile & Class Spaces — PRD (Final)

Project: CampXus (MeetchuThere)
Version: 1.0 (Finalized)
Date: 2025-10-27
Status: Locked for implementation

## Executive Summary
Enhance Profiles and introduce automatic Class Spaces (group chats) created when 4+ students share the same section, day pattern, time slot, and classroom. This PRD reflects the final decisions, removes deferred items (e.g., NSFW Vision), and adds guardrails for cost and abuse prevention.

## Locked Decisions
- Profile visibility: Full profile visible to same‑university users (photo, social links, add friend, bio, interests, Q&A, classes in common, mutual friends preview).
- Q&A: Curated bank only; at least 1 answer required; up to 5 answers; initial bank ~8.
- Interests: Predefined + custom (lowercase, 3–20 chars), max 10; chips UI.
- Photo: Single profile photo; client-resized to 512×512 WebP (~200–300 KB) + 128×128 thumb; avatar is default until photo uploaded.
- Migration: Completing profile is required before accessing Groups.
- Groups: Create spaces only when 4+ matching users; labs are distinct spaces; single-day classes included.
- Canonical key: university + courseName + section + dayPattern + timeSlot + classroom (normalized). Course code is auxiliary for naming. No termKey (admin clears schedules each semester).
- Daily scheduler: 06:00 Asia/Dhaka; no instant joins on paste.
- Messaging: Firestore subcollection; 2,000 message retention per space; 1 message / 3 seconds rate limit per user via CF; standard Firestore encryption (no E2EE v1).
- Moderation v1: Report user/message with reasons (Harassment, Spam, Impersonation, Inappropriate profile, Other) + min 50-char rationale; basic block UX.
- Navigation: Groups button sits between Friends and Notifications; bottom nav <768px else top nav (only one visible).
- Storage and rules: New fields created only when user saves; Storage restricted to owner; size/content-type checks.

## Feature Overview
### Public Profiles
- Profile customization step: photo upload (WebP 512×512 + thumb) or avatar; interests chips; curated Q&A (≥1, ≤5 answers).
- Full profile view inside university: photo, social links, add friend, bio, interests, Q&A, mutual friends preview (top 3 + view all), classes in common with the viewer.
- Mutual friends: Denormalize `socialInfo.friendIds` for each user; intersect on view; fetch up to 3 via `in` query.

### Class Spaces
- Space creation when 4+ students match the canonical anchor: section + dayPattern + timeSlot + classroom (with university and normalized fields). Course name/code used for display only.
- Spaces list page shows cards (Google Classroom style).
- Space view has two tabs: Chat (real-time) and Members (friend-card style; link to full profile; add friend).

### Messaging
- Real-time Firestore messages under `classSpaces/{spaceId}/messages`.
- Pagination (limit 50), listener only on active chat, detach on navigate.
- Retention: keep latest 2,000 per space (nightly trim or on thresholds).
- Send rate limit: 1 message per 3 seconds per user per group (Cloud Function enforced).

## Requirements
### Profiles
- New/updated fields (created only when provided):
  - `profile.minor: string | null`
  - `profile.profilePhotoUrl: string | null`
  - `profile.useAvatar: boolean`
  - `profile.interests: string[]` (≤10)
  - `profile.qnaResponses: {questionId, question, answer, answeredAt}[]` (1–5)
  - `profile.socialLinks?: {type: 'instagram'|'facebook'|'linkedin'|'github'|'x'|'custom', url: string}[]` (optional)
- Gate Groups until `systemInfo.profileSetupComplete === true`.

### Courses for Grouping
- On schedule save (text paste flow), populate `users/{uid}.courses[]` with normalized entries derived from parser output:
  - `{ courseName, courseCode?, section, dayPattern, timeStart, timeEnd, timeSlot, classroom }`
- Keep existing `scheduleData` intact for the grid; `courses[]` is for grouping only.

### Canonical Key and Naming
- Normalization:
  - courseName: trimmed, collapse spaces, lowercase; strip diacritics; fallback to courseCode if name truncated (…/too short/low alpha ratio).
  - section: integer; zero‑padded for key (e.g., "02"); display as `S-2`.
  - dayPattern: canonical tokens: ST (Sun+Tue), MW (Mon+Wed), AR (Thu+Sat), TR (Tue+Thu), MWF, and single days S/M/T/W/A/F/R.
  - timeSlot: `HHmm-HHmm` (24h), derived from `startTime/endTime` (round to nearest known slot boundary if needed).
  - classroom: uppercase; remove spaces/hyphens; lab rooms (GPLab, CENLAB2, etc.) treated as normal classrooms; exclude ONLINE/TBA/NA/NONE from creation.
  - university: canonical short code (e.g., `iub`).
- spaceId format: `${university}__${courseNameSlugOrCode}__sec${section}__${dayPattern}__${timeSlot}__${classroom}`.
- Display name: `"{courseCodeOrName} • S-{n} • {dayPattern} {HH:mm–HH:mm}"`.

### Space Lifecycle & Membership
- Scheduler (06:00 Asia/Dhaka) reads users’ `courses[]`, buckets by canonical key, and upserts spaces for buckets with `count ≥ 4`.
- Add/remove members to reflect current buckets; set `active=false` if <4 (preserve history); archive after semester via admin schedule clear (no termKey used).
- No instant joins on paste; only scheduler adds new members/spaces.

### Messaging Model
- `classSpaces/{spaceId}`: metadata (anchor fields, memberIds[], memberCount, lastActivity, lastMessagePreview, active, createdAt/updatedAt, visibility: 'university').
- `classSpaces/{spaceId}/messages/{messageId}`: senderId, senderInfo snapshot, content, createdAt, edited flags, deleted.
- `classSpaces/{spaceId}/members/{uid}` optional; member roster may be kept denormalized in root (memberInfo map) to avoid extra reads.

### Moderation & Safety v1
- Report modal: reason in {Harassment, Spam, Impersonation, Inappropriate profile, Other} + required description ≥50 chars → write to `moderationReports/{autoId}`.
- Block UX (client-side hide for now); server enforcement can follow later.
- Skip NSFW Vision filtering v1.

### UI & Navigation
- Groups button sits between Friends and Notifications; bottom nav `<768px`, top nav otherwise (only one visible at a time).
- Profiles accessible from member cards and friend cards; full profile within university.

## Cost & Performance Guardrails
- Storage: 512×512 WebP (~200–300 KB) + 128×128 thumb (~20–40 KB) per user; delete replaced images; expect ~0.8–1.5 GB at 5k users.
- Reads/Writes: attach listeners only to active chat; paginate 50; lazy load rosters; cache profiles (1h TTL); use `memberIds` array for `array-contains` lookups.
- Functions: single daily scheduler; message trim nightly or on thresholds.

## Out of Scope / Deferred
- NSFW Cloud Vision filtering (can be added later).
- End-to-end encrypted messaging.
- Reactions, attachments, or rich media in chat.

---

This PRD is the single source of truth for v1 implementation. See companion docs in this folder for engineering details.

