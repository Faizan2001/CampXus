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
  - Go to Profile Setup → Avatar & Bio step → “Q/A” appears.
  - Use dropdown to add questions (no duplicates). 1 question shown by default.
  - Remove via red minus (disabled when only one remains). Up to 5 questions total.
  - Enter 10–150 chars per answer; counters update.
  - Save with 0 valid answers (>=10 chars) → blocked; with ≥1 valid → profile saves.
  - Verify Firestore: `users/{uid}.profile.qnaResponses[]` stores only answered prompts.

## Next (suggested)
- Profile view page (photo/avatar, interests, Q/A, mutual
    friends, classes in common), then Groups polish and CF
    hardening.
- Groups polish
  - Unread badge + last message time on cards
  - Message pagination (“Load older”) and scroll anchoring
  - Member chips (tiny avatars) in Members tab
- Profiles (v1)
  - Photo upload (512×512 WebP + 128 thumb) + `useAvatar` toggle
  - Interests chips (predefined + custom, 3–20 chars, ≤10)
  - Profile view rendering (show Q&A, interests)
  - Gate Groups until `profileSetupComplete === true`
- CF/rules hardening
  - Keep messages CF‑only for non‑dev spaces; ensure callable receives ID token (optionally set region in client `getFunctions(app, 'us-central1')`)
- Dev ergonomics (optional)
  - Suppress presence location polling on non‑home routes during dev


## Notes
- 401 on `sendGroupMessage` during dev is expected when CF auth isn’t attached; dev spaces now bypass CF to avoid console noise.
- “Write/channel 400 terminate” logs are WebChannel teardown events and benign.

---

## Open TODOs (checkpoint)
- [ ] Groups: unread badge on cards (count + recent time)
- [ ] Groups: message pagination (load older + scroll anchor)
- [ ] Groups: members tab avatar chips and profile click‑through
- [ ] Profiles: photo upload (512×512 WebP + 128 thumb) + `useAvatar` toggle
- [ ] Profiles: interests chips (predefined + custom, 3–20 chars, ≤10)
- [x] Profiles: curated Q&A (≥1, ≤5); require ≥1; store and prefill on setup
- [ ] Gate Groups until `systemInfo.profileSetupComplete === true`
- [ ] CF/auth hardening for production sendGroupMessage (ensure ID token; region `us-central1`)
- [ ] Rules QA: deny direct client writes to non‑dev messages; keep dev path only under `devTest`

## Where To Work (file map)
- Groups list cards: `src/js/pages/GroupsPage.js`
- Group chat view: `src/js/pages/GroupDetailPage.js`
- Group data services: `src/js/services/groups/ClassSpacesService.js`
- Dev simulation: `src/js/services/groups/DevSpaceTools.js`
- Firestore rules: `firestore.rules`
- Cloud Functions (scheduler, trim, callable): `functions/index.js`
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
  - Cloud Function callable in place; dev fallback implemented for `devTest` spaces to avoid CF auth friction.
  - Rules updated to allow dev owner create/update/delete and messages create for dev spaces only.
  - Trim and scheduler jobs present and timezone set (Asia/Dhaka).
- Dev simulation
  - Create/Clear Test Spaces tools; owner‑scoped.
- Fixes
  - Friends page Firestore import mismatch fixed via `getFirestore()`; removed duplicate header on Groups page.

## Pick‑Up Checklist (next session)
1) Pull latest rules and deploy if not deployed yet
   - `firebase deploy --only firestore:rules`
2) Start dev server, sign in, paste a schedule if needed (to populate `courses[]`).
3) Navigate to `#groups` → Create Test Spaces → verify cards render and open a space.
4) Chat test
   - Send a message in a `devTest` space (should save without CF 401 noise).
   - Optional: test a scheduler‑made space (prod path) and confirm callable works.
5) QA goals to start implementing next (choose one):
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
