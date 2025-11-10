# Progress Log — Public Profiles & Class Spaces

Date: 2025-10-27
Status: In progress (dev‑testable UI shipped)

## Done (since implementation started)

- Docs
  - Created implementation folder and finalized PRD: `New-Profile-Implementation/` (PRD, data model, CFs, rules, normalization, plan).
- Schedule → courses[]
  - Normalized parsed courses and saved to `users/{uid}.courses[]` on profile completion.
  - Files: `src/js/utils/schedule/courseNormalization.js`, `ScheduleStorageService.js`, `DataService.js`.
- Groups UI (mobile‑first)
  - Route + template: `#groups` → classroom‑style cards; `#group` → messenger‑style chat.
  - Files: `public/templates/groups.html`, `public/templates/group.html`, `src/js/pages/GroupsPage.js`, `src/js/pages/GroupDetailPage.js`.
  - Styles: `src/css/groups.css` (imported in `src/css/styles.css`).
- Groups dev tooling visibility
  - Was: Create/Clear dev class-space buttons rendered for every authenticated user (even production) because markup was always injected.
  - Now: `shouldShowDevSpaceTools()` checks Vite build mode and optional `window.ENV.ENABLE_DEV_SPACES` flag so buttons only exist in non-production environments, keeping prod users away from dev-only controls.
  - Why: prevents accidental prod mutations and matches requirement that prod users never see dev tooling. File: `src/js/pages/GroupsPage.js`.
- Messaging
  - Client service: `src/js/services/groups/ClassSpacesService.js`.
  - Dev: bypass CF and write directly for `devTest` spaces (rules‑gated) to avoid 401 noise.
- Dev simulation
  - Create/Clear dev spaces (owner‑scoped): `src/js/services/groups/DevSpaceTools.js`.
- Firestore Rules (dev scope only)
  - Allow create/update/delete of `classSpaces` when `devTest==true` and `devOwnerUid==request.auth.uid`.
  - Allow `messages` create for caller under their own `devTest` spaces. File: `firestore.rules`.
- Scheduler timezone
  - `functions/index.js`: `scheduleDailyClassSpaces` and `trimSpaceMessages` configured for `Asia/Dhaka`.
- Navigation
  - Added “Groups” to top and bottom nav (`index.html`).
- Friends page error fix
  - Replaced mixed Firestore instances with `getFirestore()` from same import to stop `collection(...)` type error.
- Profiles — Q/A (PRD)

  - Q/A section in Profile Setup with dropdown to add questions and red minus to remove (cannot remove last one).
  - Default shows 1 question; users can add up to 5, no duplicates.
  - Validation: at least 1 answered with 10–150 chars; 150 max enforced per answer.
  - UI guard: Next Step button disabled on Q/A step until ≥1 valid answer.
  - Saves to `users/{uid}.profile.qnaResponses[]` with `{questionId, question, answer, answeredAt}`; prefill on revisit.
  - Files: `public/templates/profile.html`, `src/js/components/forms/ProfileSetup.js`, `src/js/services/profile/QABankService.js`, `src/css/profile-setup.css`.

- Profiles — Photo Upload (PRD)

  - Added client-side photo upload with auto center-crop and WebP export: 512×512 main + 128×128 thumb.
  - Uploads to `profilePhotos/{uid}/photo.webp` and `.../thumb.webp`; sets `profile.profilePhotoUrl`.
  - Toggle “Use avatar instead of photo” persists `profile.useAvatar`.
  - Files: `public/templates/profile.html`, `src/js/components/forms/ProfileSetup.js`, `src/js/services/profile/ProfilePhotoService.js`.

- Profiles — Interests (PRD)

  - Added Interests chips UI: suggestions + custom add (lowercase, 3–20 chars), up to 10.
  - Icons via Font Awesome Free; chip colors auto-assigned; saves to `profile.interests[]`.
  - Files: `public/templates/profile.html`, `src/js/components/forms/ProfileSetup.js`, `src/js/services/profile/InterestsService.js`, `src/css/profile-setup.css`.

- Profiles — Public Profile View (PRD)

  - Implemented user profile view page accessible at `#user?id=<uid>[&preview=1]`.
  - Displays photo/avatar, interests (color-coded chips), Q/A responses, mutual friends preview, classes in common.
  - Fixed Router query param preservation: passes full hash in `spa:page:load` event detail.
  - Auth-ready timing: waits for `authManager.authReady` before data fetching.
  - Fallback logic: uses friendship doc data when user profile read fails.
  - Glass morphism styling matching profile setup page.
  - Files: `public/templates/user-profile.html`, `src/js/pages/UserProfilePage.js`, `src/js/router/Router.js`.
  - Entry points: Friends page profile icons, Groups member links, Profile Setup "Public View" button.

- Profiles — Mutual Friends Feature (PRD)
  - Implemented scrollable mutual friends modal showing all shared friends between users.
  - **Data Denormalization**: Added `socialInfo.friendIds` array to each user document containing their friend user IDs for O(n) intersection lookup (per PRD normalization spec).
  - **Cloud Function Trigger**: `onFriendshipWriteUpdateFriendIds` automatically maintains friendIds arrays:
    - On friendship creation: adds friend's userId to both users' friendIds arrays
    - On unfriend/delete: removes friend's userId from both users' friendIds arrays
    - Uses Firestore transactions to ensure atomic updates
  - **Production Backfill**: Deployed one-time HTTP function to populate friendIds for 56 existing users (90 friendships processed).
  - **Modal Component**: Mobile-first bottom sheet (desktop: centered modal) with:
    - Scrollable friend cards showing avatar/photo, name, handle, major
    - 5-color chip cycling for visual variety
    - Click to navigate to friend's profile
    - Smooth animations and glass morphism styling
  - Fix: mutual-friends modal now receives enriched minimal profiles (name, photo, uid) so cards render actual classmates instead of blank placeholders, and profile links work reliably. Files: `src/js/services/data/DataService.js`, `src/js/components/friends/MutualFriendsModal.js`.
  - Files: `src/js/components/friends/MutualFriendsModal.js`, `src/css/mutual-friends-modal.css`, `functions/index.js` (lines 1020-1129).
  - Integration: UserProfilePage displays "X mutual friend(s)" button that opens modal with intersected friendIds.

## How to test (manual)

- Courses save
  - Paste schedule → Complete Profile → check `users/{uid}.courses[]` in Firestore.
- Groups list
  - `#groups` → Create Test Spaces → cards appear; Clear → removed.
- Chat
  - Open card → `#group` → send message. Dev spaces: direct write; prod spaces: CF path.
- Scheduler
  - After 06:00 Asia/Dhaka, buckets with ≥4 members create/refresh spaces.
- Profiles — Q/A
  - Go to Profile Setup → Avatar & Bio step → "Q/A" appears.
  - Use dropdown to add questions (no duplicates). 1 question shown by default.
  - Remove via red minus (disabled when only one remains). Up to 5 questions total.
  - Enter 10–150 chars per answer; counters update.
  - Save with 0 valid answers (>=10 chars) → blocked; with ≥1 valid → profile saves.
  - Verify Firestore: `users/{uid}.profile.qnaResponses[]` stores only answered prompts.
- Profiles — Public View
  - Friends page: click profile icon (id-badge) on friend card → opens `#user?id=<uid>`.
  - Groups members: click profile icon → opens friend's public profile.
  - Profile Setup: click "Public View" button → opens self preview with `&preview=1`.
  - Verify: displays photo, interests chips (5 colors), Q/A, mutual friends, classes in common.
- Profiles — Mutual Friends
  - Open friend's public profile from Friends page.
  - Click "X mutual friend(s)" button in Mutual Friends section.
  - Modal slides up (mobile) or appears centered (desktop) showing all shared friends.
  - Scroll through friend cards, click any to navigate to their profile.
  - Verify: mutual friends list matches intersection of your friendIds and viewed user's friendIds.
  - Future friendships: Add new friend → check both users' `socialInfo.friendIds` arrays updated automatically via Cloud Function trigger.
  - Unfriend: Remove friendship → verify friendIds arrays updated (friend removed from both users).
- Profiles — Social Links

  - Go to Profile Setup → Avatar & Bio step → scroll to "Social Links" section (after Interests).
  - Select platform from dropdown (Instagram, Facebook, LinkedIn, GitHub, X, Custom).
  - Enter username (e.g., "@username" or "username") or full URL → click Add.
  - Verify: link appears as card with platform icon and correct color (Instagram gradient, Facebook blue, etc.).
  - Test validation: invalid formats show error; duplicate URLs rejected.
  - Test username display: LinkedIn shows plain username (e.g., "faizan-syed15"), Instagram/X show @username, Facebook/GitHub show plain username.
  - Add up to 6 links (7th blocked with feedback).
  - Remove links via × button.
  - Save profile → Firestore: `users/{uid}.profile.socialLinks[]` contains `{type, url}` objects.
  - View public profile → Social section shows branded chips; click to open link in new tab.
  - Test mobile responsiveness: chips wrap correctly, touch targets adequate.

- Groups — Unread Badges

  - Navigate to `#groups` → verify group cards display correctly.
  - Note which cards have activity (check `lastActivity` timestamp in Firestore).
  - Observe: cards with new activity since your last view show a red pulsing dot badge next to the title.
  - Observe: cards display relative time (e.g., "2m ago", "1h ago", "3d ago") in the meta section.
  - Click a card with an unread badge → opens group chat.
  - Return to `#groups` → verify the badge is now gone for that card (marked as viewed).
  - Send a message in another group → return to groups list → verify badge appears on that card.
  - Close browser and reopen → navigate to `#groups` → verify badges persist across sessions (localStorage).
  - Test edge cases: never-viewed groups with activity show badge; groups with no activity show no badge.

- Groups — Profile Completion Gate

  - Sign in with an account that has incomplete profile (missing firstName, lastName, or profileSetupComplete=false).
  - Navigate to `#groups` → verify gate message appears with icon, heading, description, and "Complete Profile" button.
  - Click "Complete Profile" → verify redirect to profile setup page.
  - Try accessing `#group` directly (via URL or link) → verify redirect to profile setup after 1.5s with message in title.
  - Complete profile setup → navigate to `#groups` → verify normal groups page loads (no gate).
  - Verify with complete profile that dev tools buttons appear (if in dev mode).

- Groups — Message Pagination

  - Open a group chat with >50 messages (create test data or wait for active groups).
  - Initial load: verify only 50 most recent messages displayed; "Load Older Messages" button visible at top.
  - Click "Load Older Messages" → button shows "Loading..." state.
  - Verify: older messages load above current messages; scroll position stays anchored (no jump).
  - Verify: button hides when no more messages exist (<50 returned).
  - Send new message → verify auto-scroll to bottom only if already near bottom.
  - Scroll to middle of chat → send new message elsewhere → verify no auto-scroll (preserves position).
  - Load all messages (click Load Older until gone) → verify button disappears when complete.
  - Test with <50 messages total → verify button never appears.

- Moderation — Report Modal (Users)

  - Navigate to group Members tab.
  - Verify: each member (except yourself) has flag icon button next to profile icon.
  - Click flag icon on any member → report modal opens.
  - Verify modal header: "Report User".
  - Try submitting empty → verify "Submit Report" button disabled.
  - Select reason from dropdown (Harassment, Spam, etc.).
  - Enter <50 chars in description → verify button still disabled, counter shows "X / 50 minimum".
  - Enter ≥50 chars → verify button enables, counter shows "X / 500" in green.
  - Click Submit Report → verify button shows "Submitting..." and disables.
  - Verify: success screen shows check icon, "Report Submitted" heading, thank you message.
  - Verify: modal auto-closes after 1.5s.
  - Check Firestore `moderationReports` collection → verify document created with correct fields.

- Moderation — Report Modal (Messages)

  - Navigate to group Chat tab.
  - Verify: messages from others show small flag icon; your own messages don't.
  - Click flag icon on any message → report modal opens.
  - Verify modal header: "Report Message".
  - Follow same validation steps as user reporting.
  - Submit report → verify Firestore document includes `reportedMessageId` and `spaceId`.
  - Test mobile view (<600px): verify modal slides up from bottom.
  - Test desktop: verify modal centered with backdrop blur.
  - Click backdrop or X button → verify modal closes without submitting.

- Groups — List Cache
  - Navigate to `#groups` → first load fetches from Firestore (no cache).
  - Observe: cache indicator appears at top showing "Updated 0m ago" with refresh button (↻).
  - Navigate away (e.g., to profile) and return within 1 minute → instant load from cache (soft refresh).
  - Wait >1 minute, return to `#groups` → cache refreshes from Firestore (soft refresh expired).
  - Observe: cache age updates (e.g., "Updated 2m ago").
  - Wait 5 minutes → navigate to `#groups` → cache expired, fetches fresh data from Firestore.
  - Click refresh button (↻) → button shows loading state, invalidates cache, fetches new data.
  - Verify: cache persists across browser sessions (localStorage).
  - Check console logs: "[GroupsPage] Using cached groups data" when cache hit.
  - Close/reopen browser → navigate to `#groups` → verify cache still works (localStorage persistence).
  - Test error handling: disable network → navigate to `#groups` → verify error message with "Retry" button.
  - Click "Retry" → verify invalidates cache and refetches.
  - Verify cost savings: with 2,000 users and 5-min cache, reads reduced from ~576k/day to ~24k/day (check Firestore usage in Firebase Console over time).

## Next (suggested)

- Profiles polish (PRD Phase 1)
  - Social links input UI in Profile Setup (save to `profile.socialLinks[]`)
  - Mutual friends "View all" modal expansion (optional enhancement)
- Groups polish (Implementation Plan)
  - Unread badge + last message time on group cards
  - Message pagination ("Load older") + scroll anchoring
  - Member chips (tiny avatars) in Members tab with profile links
- Moderation v1
  - Report modal (reasons + 50+ char rationale) → `moderationReports/{autoId}`
  - Basic block UX (client-side hide)
- CF/rules hardening
  - Keep messages CF‑only for non‑dev spaces; ensure callable receives ID token
  - Optionally set region in client `getFunctions(app, 'us-central1')`
- Minor UX polish
  - "Preview mode"/"Limited view" banner on profile (optional)
  - Styling fixes for Interests chips on dark backgrounds if needed

## Notes

- 401 on `sendGroupMessage` during dev is expected when CF auth isn’t attached; dev spaces now bypass CF to avoid console noise.
- “Write/channel 400 terminate” logs are WebChannel teardown events and benign.

---

- Profiles — Social Links (PRD)

  - Implemented social links feature with support for 6 platforms: Instagram, Facebook, LinkedIn, GitHub, X (Twitter), Custom URLs.
  - Profile Setup UI: dropdown selector + input field + add button; displays added links as cards with platform icons and colors.
  - Validation: platform-specific URL/username patterns; supports @username, username, or full URL formats; auto-normalizes to full URLs.
  - Max 6 links enforced; duplicate detection; inline validation feedback.
  - Saves to `users/{uid}.profile.socialLinks[]` with `{type, url}` structure.
  - Public Profile View: displays social links as branded chips with platform-specific colors (Instagram gradient, Facebook blue, LinkedIn blue, GitHub gray, X black, Custom purple gradient).
  - Platform-specific username display: LinkedIn shows username after /in/, Facebook/GitHub show plain username, Instagram/X show @username, Custom shows domain.
  - Accessibility: aria-label added to input field for screen readers.
  - Files: `src/js/services/profile/SocialLinksService.js`, `src/js/components/forms/ProfileSetup.js`, `src/js/pages/UserProfilePage.js`, `public/templates/profile.html`, `public/templates/user-profile.html`, `src/css/profile-setup.css`, `src/css/user-profile.css`.

- Groups — Unread Badges

  - Implemented unread tracking system using localStorage to persist last-viewed timestamps per space.
  - **UnreadTracker Service**: Created `src/js/services/groups/UnreadTracker.js` with methods:
    - `markAsViewed(spaceId, userId)`: Records current timestamp when user views a space
    - `hasUnread(spaceId, space, userId)`: Compares lastActivity with lastViewedTime to determine unread status
    - `getRelativeTime(space)`: Formats lastActivity as relative time string (e.g., "2m ago", "1h ago", "3d ago")
    - Persists to localStorage under key `campxus:unreadTracker:{userId}` for cross-session consistency
  - **User Scoping (Security Fix)**:
    - **Problem**: Global storage key leaked viewing history between accounts on same device.
    - **Solution**: Storage keys include userId: `campxus:unreadTracker:{userId}`
    - `ensureUserLoaded(userId)`: Automatically loads correct user's data when switching accounts
    - `currentUserId` tracking: Prevents cross-account data contamination
    - **Impact**: Each user's unread state is isolated; no viewing history leakage between accounts.
  - **GroupsPage Integration**: Updated group cards to display:
    - Red pulsing dot badge (`.unread-badge`) next to title when `hasUnread()` returns true
    - Relative time display in meta section showing when last activity occurred
  - **GroupDetailPage Integration**: Automatically calls `markAsViewed()` when user opens a chat, clearing the unread state
  - **CSS Styling**: Added animated pulsing badge with gradient background and glow effect in `groups.css`
  - Files: `src/js/services/groups/UnreadTracker.js`, `src/js/pages/GroupsPage.js`, `src/js/pages/GroupDetailPage.js`, `src/css/groups.css`.

- Groups — Profile Completion Gate (PRD Critical Requirement)

  - Implemented profile completion check before allowing Groups access (PRD: "Migration: Completing profile is required before accessing Groups").
  - **GroupsPage Gate**: Displays friendly message with icon and "Complete Profile" button when `!currentUser.isProfileComplete()`.
  - **GroupDetailPage Gate**: Redirects to profile setup after 1.5s if accessed directly without complete profile.
  - **Race Condition Fix**:
    - **Problem**: `isProfileComplete()` checked synchronously before profile data loaded from Firestore, causing false negatives for complete users on fresh page loads.
    - **Solution**: Added `await currentUser.waitForProfile()` before gate check to ensure profile data is loaded.
    - **Impact**: Complete users no longer stuck on "Complete Your Profile" screen on fresh tabs/devices.
  - **Styling**: Added centered gate message with glassmorphism styling matching app design system.
  - **User Check**: Uses `currentUser.isProfileComplete()` which validates `systemInfo.profileSetupComplete`, `firstName`, `lastName`, and `email`.
  - Files: `src/js/pages/GroupsPage.js`, `src/js/pages/GroupDetailPage.js`, `src/css/groups.css`.

- Groups — Message Pagination (PRD Requirement)

  - Implemented "Load Older Messages" button with scroll anchoring (PRD: "Pagination (limit 50), listener only on active chat").
  - **Load Older Button**: Appears when ≥50 messages loaded and more messages exist; positioned at top of chat.
  - **Scroll Anchoring**: Preserves scroll position when loading older messages (prevents jump to bottom).
  - **Service Implementation**:
    - `listenToMessages()`: Uses `orderBy("createdAt", "desc")` + `limit(50)` to fetch latest 50 messages, then reverses in-memory for chronological display.
    - `loadMore()`: Uses `orderBy("createdAt", "desc")` + `startAfter(firstDoc)` to page backward through older messages, reverses for display.
    - **Fix Applied**: Changed from ascending order (which showed oldest first) to descending order (shows latest first), matching PRD requirement.
  - **Pagination Cursor Preservation (Critical Fix)**:
    - **Problem**: Realtime listener overwrote `this.lastDocs` on every update, destroying pagination cursor when new messages arrived.
    - **Solution**: Added separate `this.earliestDoc` field that preserves the pagination cursor across realtime updates.
    - **Minimal Fix Logic**:
      - `this.earliestDoc` set ONLY on initial load (`if (this.earliestDoc === null)`)
      - Realtime listener NEVER overwrites `this.earliestDoc` (only updates `this.lastDocs` for deduplication)
      - "Load Older" handler uses `this.earliestDoc` as cursor, updates it to `docs[0]` from loadMore result
    - **Impact**: Users can continue paginating backward indefinitely, even with constant realtime message arrivals.
  - **Message Update Handling (Critical Fix)**:
    - **Problem**: Realtime listener filtered out existing message IDs (`!existingIds.has(m.id)`), so message edits, deletions, and moderation actions were ignored; stale copies remained in UI forever.
    - **Solution**: Replace existing messages instead of filtering them out using Map-based update logic.
    - **Implementation**:
      - Create map of existing messages by ID for O(1) lookup
      - For each incoming message: if ID exists, replace at same index; if new, append
      - Re-sort chronologically after updates to maintain order
    - **Impact**: Message edits, deletions, and moderation status changes now reflect in realtime; users see current state instead of stale cached copies.
  - **Pagination Button Visibility (Critical Fix)**:
    - **Problem**: "Load Older Messages" button injected with `hidden` class in template, but code never removed it when initial load had ≥50 messages; button stayed `display:none` forever, making pagination completely unusable.
    - **Solution**: Remove `hidden` class in `listenToMessages` when initial snapshot contains a full page (≥50 items).
    - **Implementation**: Added check after setting `earliestDoc`: if `items.length >= 50`, set `hasMoreMessages = true` and `loadOlderBtn.classList.remove('hidden')`.
    - **Impact**: Pagination button now appears when more history exists; users can load messages beyond latest 50; feature is now actually usable.
  - **State Management**: Tracks `allMessages`, `hasMoreMessages`, `isLoadingMore`, `earliestDoc` (pagination cursor), `lastDocs` (latest window for deduplication).
  - **Auto-scroll Logic**: Scrolls to bottom only for new messages or when already at bottom (not when viewing history).
  - Files: `src/js/pages/GroupDetailPage.js`, `src/js/services/groups/ClassSpacesService.js`, `public/templates/group.html`, `src/css/groups.css`.

- Groups — Members: Add Friend (PRD)

  - Added inline "Add Friend" action to each member row (excluding self) in the Members tab.
  - Uses denormalized `socialInfo.friendIds` from the current user's profile to hide the button for existing friends and render a disabled "Friends" state.
  - On click, sends friend request via `friendsManager.sendFriendRequest(uid, targetUserData)` using cached member info and the space university for the minimal payload.
  - Button states: default (user-plus icon) → sending (spinner) → pending (clock icon, disabled) on success; alerts on error.
  - Accessibility: aria-labels/tooltips added.
  - Files: `src/js/pages/GroupDetailPage.js`, `src/css/groups.css`.

- CF/Rules Hardening — QA Complete

  - Verified Firestore rules prevent direct client writes to messages under non‑dev spaces; only allow creates when parent `classSpaces/{spaceId}` has `devTest==true` and `devOwnerUid==request.auth.uid`.
  - Confirmed classSpaces metadata writes are CF‑only except the narrowly scoped dev path; attempts to flip a prod doc into dev are blocked by checks on both `resource.data` and `request.resource.data`.
  - Client uses callable CF (`sendGroupMessage`) with explicit region `us-central1` to avoid auth/region mismatch.
  - No rule changes required; documented QA outcome.
  - Files: `firestore.rules`, `src/js/services/groups/ClassSpacesService.js`, `functions/index.js`.

- Moderation v1 — Report Modal (PRD Phase 5)

  - Implemented report modal with reason selection and description validation (PRD: "Report modal: reason in {Harassment, Spam, Impersonation, Inappropriate profile, Other} + required description ≥50 chars").
  - **ReportModal Component**: Reusable modal for reporting users or messages with 5 reason categories.
  - **Validation**: Enforces minimum 50 characters for description; real-time character counter shows progress (green at 50+).
  - **Firestore Integration**: Writes to `moderationReports/{autoId}` collection with `reporterId`, `reason`, `description`, `createdAt`, and type-specific fields.
  - **Firestore Rules**: Added security rule allowing authenticated users to create reports (validates `reporterId` matches auth.uid and `createdAt` is server time); reads/updates/deletes reserved for admin panel.
  - **User Reporting**: Report button on each member in Members tab (excludes self).
  - **Message Reporting**: Small flag icon on each message bubble (only for others' messages).
  - **Success State**: Shows success animation after submission, auto-closes after 1.5s.
  - **Mobile-First**: Bottom sheet on mobile (<600px), centered modal on desktop; smooth animations.
  - **CSS Scope Pollution Fix (Critical)**:
    - **Problem**: Report modal CSS used bare selectors (`.form-group`, `.char-count`, `.form-help`) that globally overrode ALL form styles across the app (profile setup, auth, friends, etc.).
    - **Solution**: Scoped all selectors under `.report-modal` prefix to isolate styles to the modal only.
    - **Impact**: Profile setup forms, auth forms, and other app forms no longer affected by report modal styles; prevents unintended styling conflicts.
  - Files: `src/js/components/modals/ReportModal.js`, `src/css/report-modal.css`, `src/js/pages/GroupDetailPage.js`, `public/templates/group.html`, `src/css/groups.css`, `firestore.rules` (lines 182-190).

- Groups — List Cache (Free Tier Optimization)
  - **Problem**: Real-time onSnapshot listeners for groups list would cause excessive Firestore reads at scale.
    - 2,000 users × 20 groups × 15 members = ~576,000 reads/day (11× over free tier limit of 50k).
  - **Solution**: Implemented 5-minute localStorage cache reducing reads by 95% (2,000 users → ~24,000 reads/day).
  - **GroupsCache Service**: Created `src/js/services/groups/GroupsCache.js` with:
    - `CACHE_KEY`: 'campxus:groupsCache' (base key, scoped per user)
    - `CACHE_TTL`: 5 minutes (300,000ms) - hard expiration
    - `SOFT_REFRESH_TTL`: 1 minute (60,000ms) - refreshes on navigation if stale
    - Methods: `get(userId, softRefresh)`, `set(data, userId)`, `getAge(userId)`, `getAgeString(userId)`, `isValid(userId, softRefresh)`, `clear(userId)`, `invalidate(userId)`
  - **User Scoping (Security Fix)**:
    - Cache keys include userId: `campxus:groupsCache:{userId}`
    - Validates cached userId matches current user on retrieval
    - Prevents privacy leak when switching accounts on same device
    - Auto-invalidates cache if userId mismatch detected
  - **Timestamp Rehydration (Critical Fix)**:
    - **Problem**: Firestore Timestamp objects lost `.toDate()` method when serialized to JSON, breaking unread badges and relative time display.
    - **Solution**: Serialize timestamps to milliseconds before saving, rehydrate to Firestore Timestamp objects on retrieval.
    - **Implementation**: `saveToStorage()` converts `lastActivity`, `createdAt`, `lastMessagePreview.timestamp` to milliseconds; `get()` restores using `Timestamp.fromMillis()`.
    - **Impact**: Unread badges and "Xm ago" text now work correctly when loading from cache.
  - **GroupsPage Integration**:
    - `loadGroups()`: Checks cache first with soft refresh (1min TTL on navigation), fetches from Firestore only if expired/invalid.
    - `renderGroups()`: Separated rendering logic from data fetching for cache hits.
    - `updateCacheIndicator()`: Displays "Updated Xm ago" text with manual refresh button (↻ icon).
    - `isRefreshing`: Flag to prevent concurrent refresh operations.
  - **UI Elements**:
    - Cache age indicator at top of groups list showing last refresh time.
    - Manual refresh button allowing users to force cache invalidation.
    - Loading states and error handling with retry logic.
  - **Cost Savings Calculation**:
    - Without cache: 2,000 users × 288 reads/day = 576,000 reads/day
    - With 5-min cache: 2,000 users × 12 reads/day = 24,000 reads/day (95% reduction)
    - Stays well within free tier limit of 50,000 reads/day
  - **User Experience**:
    - Initial page load: checks cache (soft refresh with 1min TTL)
    - Cache hit: instant render with age indicator
    - Cache miss: fetch from Firestore, save to cache, display with refresh button
    - Navigation: soft refresh ensures data is <1min old when returning to groups page
    - Manual refresh: users can force update anytime via refresh button
    - Account switching: cache automatically cleared/invalidated to prevent data leaks
  - Files: `src/js/services/groups/GroupsCache.js`, `src/js/pages/GroupsPage.js`, `src/css/groups.css`.

## Open TODOs (checkpoint)

- [x] Profiles: social links input UI in Profile Setup (Instagram, LinkedIn, etc.)
- [x] Profiles: mutual friends "View all" modal expansion (optional)
- [x] Groups: unread badge on cards (count + recent time)
- [x] Groups: message pagination (load older + scroll anchor)
- [x] Groups: members tab avatar chips with profile click‑through
- [x] Gate Groups until `systemInfo.profileSetupComplete === true`
- [x] Moderation: report modal → `moderationReports/{autoId}`
- [x] Moderation: basic block UX (client-side hide)
- [x] CF/auth hardening for production sendGroupMessage (ensure ID token; region `us-central1`)
- [x] Rules QA: deny direct client writes to non‑dev messages; keep dev path only under `devTest`
- [x] Messaging v2: serverTimestamp() + 10s metadata coalescing
- [x] Messaging v2: enable direct client writes with rules membership check
- [x] Messaging v2: onCreate trigger adds senderInfo, enforces post‑hoc rate limit, coalesces metadata
- [x] Profiles: photo upload (512×512 WebP + 128 thumb) + `useAvatar` toggle
- [x] Profiles: interests chips (predefined + custom, 3–20 chars, ≤10)
- [x] Profiles: curated Q&A (≥1, ≤5); require ≥1; store and prefill on setup
- [x] Profiles: public profile view (photo, interests, Q/A, mutual friends, classes in common)
- [x] Profiles: same-university gate (privacy note for other universities)
- [x] Profiles: friend action state ("Friends"/"Pending"/"Add Friend")
- [x] Profiles: "View profile" icons on Friends cards and Group members
- [x] Profiles: mutual friends modal (scrollable, mobile-first)
- [x] Profiles: denormalized friendIds with auto-sync Cloud Function

## Where To Work (file map)

- Groups list cards: `src/js/pages/GroupsPage.js`
- Group chat view: `src/js/pages/GroupDetailPage.js`
- Group data services: `src/js/services/groups/ClassSpacesService.js`
- Dev simulation: `src/js/services/groups/DevSpaceTools.js`
- Firestore rules: `firestore.rules`
- Cloud Functions (scheduler, trim, callable): `functions/index.js`
- Cloud Functions (message onCreate trigger): `functions/index.js`
- Courses normalization: `src/js/utils/schedule/courseNormalization.js`
- Schedule save hook: `src/js/services/schedule/ScheduleStorageService.js`
- Profile setup (for v1 fields): `src/js/components/forms/ProfileSetup.js`

## Manual Test Matrix

- Courses[]
  - Paste schedule → Complete Profile → expect `users/{uid}.courses[]` populated and normalized.
- Groups list
  - Dev: Create Test Spaces → cards appear; Clear → removed.
  - Prod: After 06:00 Asia/Dhaka scheduler, spaces appear for ≥4 matching users.
- Chat
  - Dev spaces: message send writes directly; no 401; bubbles render; lastActivity/preview updates.
  - Prod spaces: message send via CF; verify rate limit; retention trim (2,000) runs nightly.
- Rules
  - Non‑dev spaces: deny client message writes; allow reads only.
  - Dev spaces: allow owner to create/update/delete classSpace; allow messages create under that space.

## Deployment Notes

- Rules: `firebase deploy --only firestore:rules`
- Functions (when changed):
  - `firebase deploy --only functions:scheduleDailyClassSpaces,functions:sendGroupMessage,functions:trimSpaceMessages`
- Client Functions region (optional to avoid 401 if region mismatch): use `getFunctions(app, 'us-central1')` in the client.

## Known Dev Noise / Non‑issues

- Firestore WebChannel “Write/channel … 400 terminate”: benign stream teardowns.
- Geolocation warning: “Only request geolocation information in response to a user gesture.” Safe to ignore during Groups testing; presence system may trigger on focus.

## Quick Commands

```
firebase deploy --only firestore:rules
firebase deploy --only functions:scheduleDailyClassSpaces,functions:sendGroupMessage,functions:trimSpaceMessages
```

---

## Session Recap (today)

- Docs & scaffolding
  - Final PRD + implementation docs under `New-Profile-Implementation/`.
  - Added this `progress.md` and later expanded with actionable TODOs and test matrix.
- Data path
  - Normalized courses on schedule save and wrote `users/{uid}.courses[]`.
- Class Spaces
  - Groups list route + template and Group detail route + template.
  - Messenger‑style chat (with “me” vs “other” bubbles) and members tab.
  - Mobile‑first card grid and chat UI (`src/css/groups.css`).
  - Navigation buttons added (top + bottom nav).
- Messaging
  - Phase 1: Migrated to serverTimestamp() for message and metadata times.
  - Phase 1: Added 10s metadata coalescing to reduce write pressure on `classSpaces` parent.
  - Phase 2: Enabled direct client writes with strict Firestore Rules (membership + validation).
  - Phase 2: Added onCreate trigger to populate senderInfo, enforce post‑hoc 1/3s rate limit, and coalesce metadata.
  - Dev test spaces continue to work with direct writes; callable kept as fallback.
  - Trim and scheduler jobs present and timezone set (Asia/Dhaka).
- Dev simulation
  - Create/Clear Test Spaces tools; owner‑scoped.
- Fixes
  - Friends page Firestore import mismatch fixed via `getFirestore()`; removed duplicate header on Groups page.

## Pick‑Up Checklist (next session)

1. Pull latest rules and deploy if not deployed yet
   - `firebase deploy --only firestore:rules`
2. Start dev server, sign in, paste a schedule if needed (to populate `courses[]`).
3. Navigate to `#groups` → Create Test Spaces → verify cards render and open a space.
4. Chat test
   - Send a message in a `devTest` space (should save without CF 401 noise).
   - Optional: test a scheduler‑made space (prod path) and confirm callable works.
5. QA goals to start implementing next (choose one):
   - Unread badge + last message time on cards (GroupsPage.js + DataService.getUserClassSpaces)
   - Chat pagination (“Load older” via startAfter) + scroll anchoring (GroupDetailPage.js + ClassSpacesService)
   - Profile v1 save/display (ProfileSetup.js, DataService.updateUserProfile, Storage rules)

## File Entry Points (open these first)

- UI: `src/js/pages/GroupsPage.js`, `src/js/pages/GroupDetailPage.js`
- Services: `src/js/services/groups/ClassSpacesService.js`, `src/js/services/groups/DevSpaceTools.js`
- Styles: `src/css/groups.css`
- Templates: `public/templates/groups.html`, `public/templates/group.html`
- Rules: `firestore.rules`
- Functions: `functions/index.js`
- Profile (next): `src/js/components/forms/ProfileSetup.js`

## Known Issues / Tips

- CF 401 on `sendGroupMessage` indicates missing ID token. Dev spaces bypass the CF path; for prod spaces, set region in client: `getFunctions(app, 'us-central1')` and ensure you’re signed in before calling.
- Presence logs/noise are expected on route changes; they don’t affect Groups.
- Profiles — Photo
- Click “Upload Photo” → choose image → preview shows; toggle “Use avatar” switches view.
- Save profile → Firestore: `profile.profilePhotoUrl` set; Storage: `profilePhotos/{uid}/...` exists.

- Profiles — Interests
- Tap suggested chips or add custom (3–20 chars, lowercase) → up to 10.
- Save profile → Firestore: `profile.interests[]` populated.
