# Uncommitted Changes — “What changed and why?” (Beginner-friendly)

Generated: 2026-01-25

This repo has a lot of uncommitted edits right now. The theme is:

- **Security tightened** (Firestore rules + CSP + XSS defenses)
- **Less memory leaks** (event listeners/timers cleaned up, idempotent init)
- **More reliable app behavior** (better logging, safer async flows)
- **Better performance** (avoid N+1 queries, reduce redundant reads)
- **More tests + tooling** (Jest suites, lint script, docs)

How to read this doc:
- Each “Change” below has **Files**, **Before**, **Now**, and an **ELI5** note.
- At the end there’s an **Appendix** listing *every* file touched (so nothing is missed).

---

## 1) Security: Firestore “no peeking” rules + server-side helpers

### Change: Stop client-side enumeration of `classSpaces`
**Files:** `firestore.rules`, `functions/index.js`, `src/js/services/data/DataService.js`, `src/js/pages/GroupsPage.js`, `src/js/services/groups/ClassSpacesService.js`, `src/js/services/groups/DevSpaceTools.js`

**Before:** The app could `list` (query) the whole `classSpaces` collection from the client. Even if the UI filtered results, the rule still allowed listing, which is a classic “someone could try to enumerate stuff” risk.

**Now:** Firestore rules set `allow list: if false` for `/classSpaces`. The client must call Cloud Functions:
- `listMyClassSpaces` → returns only *your* space IDs
- then the client `get`s each document individually (membership rules still apply)
- left-spaces and dev-clear tools also use Cloud Functions so they still work without list access

**ELI5:** Imagine the “Groups” list was a hallway with many doors. Before, anyone could walk the hallway and *look at door names*. Now, you can’t walk the hallway; you must ask the receptionist for **only your door numbers**.

### Change: Hide `/admin/superAdmins` from clients + move PIN checks to Cloud Functions
**Files:** `firestore.rules`, `functions/index.js`, `src/js/pages/AdminPage.js`, `src/js/services/admin/AdminService.js`

**Before:** The client could read `/admin/superAdmins` to check “am I a super admin?” and compare a hashed admin PIN. That doc also contained sensitive config (PIN hashes).

**Now:** Firestore rules prevent reading `admin/superAdmins` from the client. Admin checks happen via callable functions:
- `isSuperAdmin` (server answers yes/no based on caller auth)
- `verifyAdminPin` (server verifies + enforces lockout)
- `setAdminPin` (server stores a **salted** hash, keeps legacy hash for backward compatibility)

**ELI5:** Before, the app asked “can I see the secret list?” Now it asks the security guard “am I allowed in?” and the guard checks the list privately.

---

## 2) Security: XSS & HTML injection defenses

### Change: Sanitize modal HTML content
**Files:** `src/js/components/modals/Modal.js`, `src/js/utils/security/sanitize.js`

**Before:** When the modal was asked to render HTML (`isHtmlContent`), it could put raw strings into `innerHTML`. If any of that content ever came from user-controlled text, it could become an injection risk.

**Now:** `Modal.js` runs string HTML through `sanitizeHTML()` before assigning to `innerHTML`. `sanitizeHTML()` strips dangerous tags/attributes (`<script>`, event handlers like `onclick=`, `javascript:` URLs, etc.).

**ELI5:** If someone tries to sneak “bad stickers” into a message, the app peels those stickers off before showing it.

### Change: Escape user-controlled text used inside `innerHTML` in Home + Profile setup
**Files:** `src/js/pages/HomePage.js`, `src/js/components/forms/ProfileSetup.js`, `src/js/utils/security/sanitize.js`

**Before:** Some values like names/course labels could be injected into HTML templates without escaping (especially inside attributes), which is risky when building strings for `innerHTML`.

**Now:** The code uses `escapeHTML()` and `escapeAttr()` when interpolating text into HTML strings (examples: compare avatars, slot labels, typeahead items).

**ELI5:** Before, the app pasted text straight onto the page. Now it first wraps the text in “quotes” so it can’t pretend to be real HTML.

---

## 3) Security: Hosting config + CSP tightened

### Change: Deploy only build output + remove risky CSP allowances
**Files:** `firebase.json`

**Before:** Firebase Hosting `public` pointed at the project root (`"."`), so deploys could accidentally include non-build files. CSP also allowed `unsafe-eval` and included localhost endpoints.

**Now:**
- Hosting `public` is `dist` (only built assets deploy)
- CSP removes `unsafe-eval` and removes localhost `connect-src` entries

**ELI5:** Before, deploy was like “upload the whole backpack.” Now it’s “upload only the homework folder,” and the browser is told “don’t run sketchy code tricks.”

---

## 4) Secrets & env config hygiene

### Change: Remove tracked env config file + load runtime env config safely
**Files:** `src/js/lib/firebase/env-config.js` (deleted), `src/js/lib/firebase/firebase-config.js`, `index.html`, `.gitignore`, `scripts/scrub-git-history-secrets.sh`

**Before:** Firebase config relied on a tracked `src/js/lib/firebase/env-config.js` import and `window.ENV`. That file is exactly the kind of thing that can accidentally contain secrets and end up in git history.

**Now:**
- `src/js/lib/firebase/env-config.js` is removed from git
- `index.html` loads `/env-config.js` (generated by `npm run dev:config`) at runtime
- `firebase-config.js` can read config from **either** `window.ENV` (dev) **or** `import.meta.env` (`VITE_FIREBASE_*` for prod/CI)
- `.gitignore` ignores `public/env-config.js`
- added `scripts/scrub-git-history-secrets.sh` to help remove secret files from git history (destructive, opt-in)

**ELI5:** Before, the “keys” were stored in a file that could get copied into git forever. Now, the app reads keys from a “note taped to the window at runtime,” and there’s a cleanup tool if the old keys ever got committed.

---

## 5) Stability: stop memory leaks (listeners + timers + intervals)

### Change: Make event listeners removable (no anonymous handlers)
**Files (examples):** `src/js/app.js`, `src/js/router/Router.js`, `src/js/services/location/LocationScheduler.js`, `src/js/services/location/CampusLocationService.js`, `src/js/services/pwa/PWAInstallService.js`, `src/js/components/modals/Modal.js`, `src/js/components/clubs/LiveEventsSection.js`, `src/js/components/navigation/Menu.js`, `src/js/services/schedule/ScheduleStorageService.js`, `src/js/components/schedule/ScheduleControlsToggle.js`, `src/js/services/realtime/RealtimeService.js`

**Before:** Many places used inline/anonymous listeners (`addEventListener(() => ...)`) or re-initialized listeners without removing old ones. In a SPA, that can quietly stack up and cause:
- duplicate actions
- extra Firestore listeners
- extra timers/intervals
- slow UI over time

**Now:** Handlers are stored on the instance/module and removed on cleanup/destroy. Many modules are made **idempotent** (safe to call init multiple times).

**ELI5:** Before, every time you opened a page you hired new “workers” and forgot to fire the old ones. Now, workers have name tags and a “clock-out” button.

### Change: Track timers globally to prevent “late DOM writes after navigation”
**Files:** `src/js/utils/timers/TimerRegistry.js` (new), `src/js/app.js`, `src/js/router/Router.js`

**Before:** `setTimeout`/`setInterval` could keep running after you left a page, then try to touch DOM that no longer exists.

**Now:** `TimerRegistry` patches global timers and cleans up route-scoped timers on `spa:page:unload`.

**ELI5:** If you leave the kitchen, the stove timers don’t keep beeping in the living room.

---

## 6) Reliability: better logging + fewer silent failures

### Change: Production console is routed through LogManager
**Files:** `src/js/utils/debug/LogManager.js`

**Before:** Lots of raw `console.*` calls could spam logs in production and bypass LogManager’s throttling/category system.

**Now:** In production, `console.log/info/debug/warn/error` is proxied into LogManager and default log level is effectively stricter (`warn`). In dev/test, you can still enable verbose logs.

**ELI5:** Instead of everyone shouting in a crowded room, messages go through a receptionist who filters and organizes them.

### Change: Global crash-catchers added for async errors
**Files:** `src/js/app.js`

**Before:** If a Promise rejected and nobody caught it (or an error bubbled to window), it could fail silently or be hard to debug.

**Now:** The app registers `window` handlers for `unhandledrejection` and `error` and logs details through LogManager (best-effort, won’t crash the app if logging fails).

**ELI5:** There’s now a “front desk” that writes down “something broke” even if no one else noticed.

### Change: Catch blocks and promise chains are less “silent”
**Files (examples):** `src/js/app.js`, `src/js/pages/HomePage.js`, `src/js/pages/FriendsPage.js`, `src/js/services/auth/AuthService.js`, `src/js/services/cache/PWACacheService.js`, `src/js/services/location/*`, many others in `src/js/**`

**Before:** There were many `catch (_) {}` blocks that hid real bugs. Some `.then()` chains could fail without visibility.

**Now:** Many empty catches are replaced with debug logs (usually via LogManager). `app.js` also adds global `unhandledrejection` + `error` handlers.

**ELI5:** Before, errors were swept under the rug. Now, they’re at least written down in a notebook (without crashing the app).

---

## 7) Performance: remove N+1 Firestore reads

### Change: Live events no longer do “one query per club”
**Files:** `src/js/components/clubs/LiveEventsSection.js`

**Before:** For each club, it queried that club’s events subcollection. With many clubs, that becomes N+1 queries (slow and expensive).

**Now:** It prefers a `collectionGroup("events")` query with chunked `clubId in (...)` filters (and falls back to per-club queries if indexes/data don’t support it yet). Event handlers are also delegated so re-render doesn’t add more listeners.

**ELI5:** Instead of going store-to-store asking “any events?”, you ask the mall directory once.

### Change: Admin stats rebuild avoids per-club scanning when possible
**Files:** `src/js/services/admin/AdminService.js`

**Before:** Rebuilding counts could do per-club subcollection reads.

**Now:** It tries `collectionGroup` scans to pre-count members/events, then falls back per-club if needed.

**ELI5:** Count everything in one big spreadsheet first; only check drawers individually if the spreadsheet is missing.

---

## 8) Location/presence system: safer lifecycle + dev-only globals

### Change: CampusLocationService made more “SPA-safe”
**Files:** `src/js/services/location/CampusLocationService.js`, `src/js/services/location/LocationScheduler.js`, `src/js/services/location/LocationIntegration.js`, `src/js/services/location/NetworkDetectionService.js`

**Before:** Repeated init could attach duplicate listeners; some cleanup was incomplete; various “magic numbers” were inline; debug globals were always exposed.

**Now:**
- key timings/thresholds are constants
- listeners are bound once and removed on cleanup
- permission and battery listeners are attached defensively and cleaned up
- debug globals are exposed only in dev-like environments

**ELI5:** Location tracking is like a sensor system. Before, you could accidentally plug the same sensor in twice. Now, it checks “am I already plugged in?” and also unplugs properly when you leave.

---

## 9) Notifications + privacy: safer UX wiring

### Change: Friend-request notification click actually navigates somewhere
**Files:** `src/js/services/realtime/NotificationService.js`

**Before:** Clicking a friend-request notification didn’t have real navigation behavior (it was basically a TODO).

**Now:** It best-effort navigates to the Friends page (tries `navigateTo("friends")`, otherwise falls back to setting `#friends`).

**ELI5:** Clicking the “go to the thing” notification now actually takes you to the thing.

### Change: Notifications page lifecycle logging + safer cleanup
**Files:** `src/js/pages/NotificationsPage.js`, `src/js/components/notifications/PushPermissionBanner.js`, `src/js/services/realtime/PushMessagingService.js`

**Before:** Some of the notifications/push flows had silent catch blocks and less structured cleanup/logging.

**Now:** Errors are logged (mostly via LogManager), dev globals are gated to dev, and page load/unload handlers are named so they don’t stack up.

**ELI5:** The notifications area is now less “mystery meat” when something goes wrong.

### Change: Privacy consent banner removes inline `onclick` HTML
**Files:** `src/js/lib/security/privacyManager.js`

**Before:** The consent banner used inline HTML `onclick="..."`, which is harder to audit, harder to remove, and worse for security policies.

**Now:** Buttons use `data-privacy-action` + `addEventListener`, and the banner avoids duplicate insertion.

**ELI5:** Instead of hiding button logic *inside the HTML string*, we wire the buttons properly after the banner is created.

---

## 10) Schedule + OCR: safer image handling + cleaner offline listeners

### Change: OCR image loading uses `addEventListener(..., { once:true })`
**Files:** `src/js/services/schedule/OcrService.js`, `src/js/tests/services/ocr-service.test.js`

**Before:** `img.onload` / `img.onerror` assignments can be overwritten and are harder to test/make one-shot.

**Now:** OCR uses `img.addEventListener("load"/"error", ..., { once: true })` and the test mock image was updated to support listeners.

**ELI5:** Instead of “replace the doorbell,” we “add a doorbell listener that rings once.”

### Change: Schedule storage cleans up online/offline listeners
**Files:** `src/js/services/schedule/ScheduleStorageService.js`

**Before:** Network listeners could be added multiple times if setup ran more than once.

**Now:** Online/offline listeners are stored and removed during cleanup.

**ELI5:** No more stacking multiple “you’re back online!” announcers.

---

## 11) Admin UX: audit trail for “search then assign”

### Change: Admin user searches can be audit-logged (optional)
**Files:** `src/js/components/shared/UserSearchAssign.js`, `src/js/services/admin/AdminService.js`

**Before:** Admin assignment flows could search users, but there wasn’t a built-in, consistent audit event for “admin searched for X”.

**Now:** `UserSearchAssign` accepts an `audit` option and (when enabled) logs throttled audit events via `logAdminAuditEvent(...)`. Failures are also logged best-effort, without breaking UX.

**ELI5:** When an admin looks people up, the system can leave a breadcrumb trail (without slowing the UI).

---

## 12) Tooling + docs + tests (so future-you suffers less)

### Change: Add a tiny repo-specific lint + emulator test runner
**Files:** `scripts/lint.js` (new), `package.json`

**Before:** No quick “project rules” lint, and emulator-backed tests were manual.

**Now:**
- `npm run lint` checks for patterns the repo is trying to eliminate (e.g. `.then(`, `.onclick =`)
- `npm run test:emulators` runs Jest inside `firebase emulators:exec` for Firestore/Auth/Functions

**ELI5:** It’s a small checklist script that yells “hey, don’t do the leak-prone patterns again.”

### Change: Add docs + a bigger test suite
**Files:** `TECHNICAL_DEBT.md` (new), `docs/god-objects-refactor-plan.md` (new), plus many new tests under `src/js/tests/**`

**Before:** Lots of improvements were “tribal knowledge” and many services had no tests.

**Now:** There’s a technical debt tracker + a refactor plan, plus new Jest tests for pages and services (admin/analytics/cache/clubs/data/groups/location/onboarding/profile/schedule/social/ui).

**ELI5:** You now have a map, a to-do list, and some safety rails.

---

## Appendix A — Full file list (so nothing is “forgotten”)

### Tracked files modified (unstaged)
```text
M .gitignore
M firebase.json
M firestore.rules
M functions/index.js
M index.html
M jest.setup.js
M package-lock.json
M package.json
M public/sitemap.xml
M src/js/app.js
M src/js/cache/profileCache.js
M src/js/components/clubs/ClubCreatorModal.js
M src/js/components/clubs/CreateEventModal.js
M src/js/components/clubs/EventDetailModal.js
M src/js/components/clubs/ImageCropperModal.js
M src/js/components/clubs/LiveEventsSection.js
M src/js/components/forms/ProfileSetup.js
M src/js/components/friends/HorizontalFriendsBar.js
M src/js/components/modals/Modal.js
M src/js/components/navigation/Menu.js
M src/js/components/notifications/PushPermissionBanner.js
M src/js/components/presence/LocationPermissionBanner.js
M src/js/components/presence/LocationSharingToggle.js
M src/js/components/schedule/ScheduleControlsToggle.js
M src/js/components/shared/UserSearchAssign.js
M src/js/core/firestore/dev-tools/MemoryLeakDetective.js
M src/js/core/firestore/dev-tools/check-dev-setup.js
M src/js/core/firestore/dev-tools/generate-env-config.js
D src/js/lib/firebase/env-config.js
M src/js/lib/firebase/firebase-config.js
M src/js/lib/security/privacyManager.js
M src/js/pages/AdminPage.js
M src/js/pages/ClubDetailPage.js
M src/js/pages/ClubsPage.js
M src/js/pages/FriendsPage.js
M src/js/pages/GroupDetailPage.js
M src/js/pages/GroupsPage.js
M src/js/pages/HomePage.js
M src/js/pages/LandingPage.js
M src/js/pages/NotificationsPage.js
M src/js/pages/SafModeratePage.js
M src/js/pages/UserProfilePage.js
M src/js/router/Router.js
M src/js/services/admin/AdminService.js
M src/js/services/analytics/AnalyticsService.js
M src/js/services/auth/AuthService.js
M src/js/services/cache/PWACacheService.js
M src/js/services/clubs/ClubImageService.js
M src/js/services/data/DataService.js
M src/js/services/friends/FriendsService.js
M src/js/services/friends/FriendshipPrivacyService.js
M src/js/services/groups/ClassSpacesService.js
M src/js/services/groups/DevSpaceTools.js
M src/js/services/groups/UnreadTracker.js
M src/js/services/location/CampusLocationService.js
M src/js/services/location/LocationIntegration.js
M src/js/services/location/LocationScheduler.js
M src/js/services/location/NetworkDetectionService.js
M src/js/services/location/UniversityCampusConfig.js
M src/js/services/profile/ProfilePhotoService.js
M src/js/services/pwa/PWAInstallService.js
M src/js/services/realtime/NotificationService.js
M src/js/services/realtime/PushMessagingService.js
M src/js/services/realtime/RealtimeService.js
M src/js/services/schedule/OcrService.js
M src/js/services/schedule/ScheduleStorageService.js
M src/js/services/social/BlockService.js
M src/js/services/ui/ViewModeManager.js
M src/js/store/userStore.js
M src/js/tests/core/script.test.js
M src/js/tests/services/NotificationService.security.test.js
M src/js/tests/services/ocr-service.test.js
M src/js/utils/avatar/avatarManager.js
M src/js/utils/debug/LogManager.js
M src/js/utils/dev/DevOnboardingTools.js
M src/js/utils/dev/debugHelpers.js
M src/js/utils/dev/performanceDebugger.js
M src/js/utils/firebase/functionsHelper.js
M src/js/utils/security/sanitize.js
```

### New untracked files
```text
TECHNICAL_DEBT.md
docs/god-objects-refactor-plan.md
scripts/lint.js
scripts/scrub-git-history-secrets.sh
src/js/tests/pages/PageControllers.test.js
src/js/tests/services/admin/AdminService.mutations.test.js
src/js/tests/services/analytics/AnalyticsService.test.js
src/js/tests/services/cache/PWACacheService.test.js
src/js/tests/services/clubs/ClubImageService.test.js
src/js/tests/services/clubs/ClubNotificationService.test.js
src/js/tests/services/data/DataService.offline.test.js
src/js/tests/services/groups/ClassSpacesService.test.js
src/js/tests/services/location/CampusLocationService.test.js
src/js/tests/services/location/LocationIntegration.test.js
src/js/tests/services/location/LocationPrivacyService.test.js
src/js/tests/services/location/LocationScheduler.test.js
src/js/tests/services/location/LocationTierService.test.js
src/js/tests/services/location/NetworkDetectionService.test.js
src/js/tests/services/location/UniversityCampusConfig.test.js
src/js/tests/services/onboarding/OnboardingService.test.js
src/js/tests/services/profile/InterestsService.test.js
src/js/tests/services/profile/ProfilePhotoService.test.js
src/js/tests/services/schedule/ComparisonService.test.js
src/js/tests/services/schedule/ScheduleDataService.test.js
src/js/tests/services/social/BlockService.mutations.test.js
src/js/tests/services/ui/ViewModeManager.test.js
src/js/utils/timers/TimerRegistry.js
```
