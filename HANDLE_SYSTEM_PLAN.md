# Global Handle System Implementation Plan (Comprehensive)

Status: Expanded Implementation Spec (Full Feature Completion)
Owner: Faizan
Target Branch: `handle-addition`
Scope: Full replacement of `displayName` with globally unique `handle`; enhanced search, claiming, change cadence, and UI integration.

## 1. Executive Summary

We are promoting a globally unique, immutable-between-weekly-changes `handle` (e.g. `faizan`) as the single canonical public identifier for all social surfaces (friends list, requests, notifications, search). This replaces prior `displayName` fields entirely. A dedicated `/handles/{handle}` mapping collection guarantees uniqueness with an O(1) lookup path. The friends search pipeline gains an early exact-handle branch (`@handle` or plain `handle` if fully matching the regex) and falls back to existing university-scoped fuzzy search (first name, last name, major). No legacy migration needed because the system is pre-launch; mock data may be purged.

---

## 2. Core Decisions (Immutable for MVP)

| Aspect                      | Decision                 | Notes                                             |
| --------------------------- | ------------------------ | ------------------------------------------------- |
| Human friendly name         | Removed                  | Reduces complexity; avatar + major supply context |
| Uniqueness scope            | Global                   | Cross-university discovery allowed via handle     |
| Allowed chars               | `a–z 0–9 _`              | Lowercase only (dots removed)                     |
| Length                      | 3–20                     | Final bound                                       |
| Must start with letter      | Yes                      | Prevent numeric squat handles                     |
| Cannot end with underscore  | Yes                      | Cleaner aesthetics                                |
| Consecutive underscores     | Allowed                  | Relaxed for simplicity & availability             |
| Dots                        | Disallowed (v1)          | Reconsider later                                  |
| Change frequency            | 1 per 1 day              | Client‑enforced (no Cloud Functions)              |
| Old handle reuse            | Immediate allowed        | No parking logic in MVP                           |
| Mentions format             | `@handle`                | Future feature placeholders only                  |
| Cloud Functions             | None                     | Pure client + Firestore transaction               |
| Short handles (3 chars min) | Allowed                  | 2-char removed to reduce scarcity                 |
| Collection for uniqueness   | Yes: `/handles/{handle}` | Doc ID ensures uniqueness                         |
| Exact handle search         | Yes                      | Bypasses university filter                        |
| Prefix handle search        | No (MVP)                 | Could add later with index or Algolia             |

---

## 3. Architecture Overview

### 3.1 Components

- Handle Storage: `/handles/{handle}` – authoritative mapping `handle -> userId`.
- User Profile: `/users/{uid}` – contains `profile.handle` and `systemInfo.lastHandleChangeAt`.
- Search Layer: Enhanced early branch for exact handle; otherwise uses existing multi-field Firestore queries.
- UI Layer: Friends page, requests, notifications, quick access bar, modals all render `@handle · major` (but omit the `@` symbol outside search / mentions contexts where appropriate).
- Validation Utilities: Client-side helper to validate, normalize, and enforce weekly cooldown.

### 3.2 Data Flow (Claim New Handle)

1. User enters candidate → debounce 300ms → availability check (`getDoc(/handles/{candidate})`).
2. If available + passes regex + cooldown: enable [Claim].
3. On claim → Firestore transaction:
   a. Re-read `/handles/{candidate}` (must not exist)
   b. If changing: delete prior `/handles/{old}` (optional in same txn if doc size small) **OR** perform two-step (delete then create) – we will use one transaction containing delete + create + user update.
   c. Create `/handles/{candidate}` with metadata.
   d. Update user doc fields.
4. UI globally invalidates any caches referencing old handle.

### 3.3 Data Flow (Search Exact Handle)

Input normalized → pattern match → direct `getDoc(/handles/{handle})` → if found fetch `/users/{userId}` → adapt friend card shape → render single result.

---

## 4. Data Model (Final State)

### 4.1 Users (`/users/{uid}`)

```
profile: {
  handle: "faizan",
  major: "CSC",
  firstName: "Faizan", // retained internally
  lastName: "Syed",
  ...
}
systemInfo: {
  lastHandleChangeAt: <timestamp>
}
```

Removed: `displayName`, `displayName_lower` (temporary fallbacks will be purged).

### 4.2 Handle Mapping (`/handles/{handle}`)

```
{
  userId: <uid>,
  createdAt: <timestamp>,
  lastClaimedAt: <timestamp>
}
```

### 4.3 Friend / Request Cached Fields

Replace any `displayName` caches with `handle`:

```
fromUserInfo: { handle, major, university, avatarConfig }
toUserInfo:   { handle, major, university, avatarConfig }
user1Info / user2Info similarly

---
## 5. Firestore Security Rules (Delta Specification)
Add *before* helper functions (ordering not strict but grouped logically):
```

match /handles/{handle} {
allow read: if true;
allow create: if request.auth != null &&
!exists(/databases/$(database)/documents/handles/$(handle)) &&
request.resource.data.userId == request.auth.uid &&
handle.matches('^(?!(?:.\*\__))[a-z]a-z0-9_]{1,18}[a-z0-9]$') && // 3-20, start letter, no double underscore, no trailing underscore
request.resource.data.createdAt == request.time &&
request.resource.data.lastClaimedAt == request.time;
allow delete: if request.auth != null && resource.data.userId == request.auth.uid;
allow update: if false; // Enforce explicit delete + create for changes
}

```
NOTE: Daily limit (1 day) enforced client-side; can later shift to a callable.
No additional composite index required for exact handle lookups.

---
## 6. Client API Surface (Proposed)
| Function | Purpose | Returns |
|----------|---------|---------|
| `validateHandle(raw)` | Normalize + regex test | `{ valid, reason?, normalized }` |
| `checkHandleAvailability(handle)` | Lightweight existence probe | `{ available:boolean }` |
| `claimHandle(newHandle)` | Transactional claim/change | `{ success, error? }` |
| `canChangeHandle(lastTimestamp)` | Cooldown enforcement | `boolean` |
| `lookupUserByHandle(candidate)` | Search layer fast path | user object or `null` |

Pseudocode (Transaction):
```

const userRef = doc(db, 'users', uid);
const handleRef = doc(db, 'handles', newHandle);
const oldHandle = currentUser.profile.handle;
await runTransaction(db, async tx => {
const snapshot = await tx.get(handleRef);
if (snapshot.exists()) throw new Error('taken');
if (oldHandle) {
tx.delete(doc(db, 'handles', oldHandle));
}
const now = serverTimestamp();
tx.set(handleRef, { userId: uid, createdAt: now, lastClaimedAt: now });
tx.update(userRef, {
'profile.handle': newHandle,
'profile.handle_lower': newHandle,
'systemInfo.lastHandleChange': now
});
});
}

````

---
## 7. UI / UX Specification
| Surface | Change |
|---------|--------|
| Profile Setup | Replace display name field with Handle field (live availability pill) |
| Friends List Card | Show `@handle · MAJOR` (omit `@` if you prefer plain style; keep consistent) |
| Friend Requests | Use requesting user's `@handle` |
| Notifications | Use `@handle` in summary lines |
| Search Bar | Accept `@handle` or raw handle; show exact-match result first/only |
| Handle Change UI | Settings modal: input + availability + cooldown message |
| Errors | Inline below input: “Taken”, “Invalid characters”, “Too short”, “You can change again in Xd” |

States for availability indicator:
| State | Color | Text |
|-------|-------|------|
| Idle | Gray | "Enter a handle" |
| ValidAvailable | Green | "Available" |
| ValidTaken | Red | "Taken" |
| Invalid | Red | Specific reason |
| Cooldown | Amber | "Change allowed in Xd" |

---
## 8. Search Behavior (Detailed)
1. Input captured.
2. Quick classification:
   - `isExactHandleCandidate = REGEX.test(normalized)` (strip leading `@`).
3. If candidate length 2–32 and regex passes → direct handle lookup path.
4. If found → Replace previous results with single card; skip fuzzy queries.
5. If not found → Show “No user with that handle” *and* (optional) fallback fuzzy search only if user removed `@` prefix.
6. Fuzzy search continues using firstName_lower, lastName_lower, major_lower (displayName removed).
7. Deduplicate + filter existing friends / pending requests.

Performance: handle path = 1 read (mapping) + 1 read (user) worst case. Acceptable.

---
## 9. Rate Limiting (Weekly Cooldown) – Client Strategy
Computation: `(Date.now() - lastHandleChange.toMillis()) >= 7 * 24 * 60 * 60 * 1000`.
UI: If not met → disable claim button + show countdown.
Edge: First-time claim (no timestamp) → allowed.

Risk (user fiddles with dev tools): Could attempt second change earlier. Still blocked logically because transaction allows it—but we decided to allow reuse. If stronger enforcement desired later: move logic to Cloud Function.

---
## 10. Error Handling Matrix
| Error | Detection Layer | User Message | Recovery |
|-------|-----------------|--------------|----------|
| Invalid characters | Client regex | "Only letters, numbers, . and _" | Edit input |
| Too short/long | Client regex | "Handle must be 2–32 chars" | Edit input |
| Taken (race) | Transaction exception | "Just taken. Try another" | Retry with new handle |
| Cooldown active | Client check | "You can change again in Xd" | Wait |
| Network fail | Promise catch | "Network error – retry" | Retry button |

---
## 11. Testing Strategy
### 11.1 Unit Tests (Ideal Future – outline)
| Module | Test | Cases |
|--------|------|-------|
| handleUtils | validateHandle | valid, invalid chars, length bounds |
| handleUtils | canChangeHandle | boundary exactly 7d, just before, just after |
| searchService | classify input | with @, without @, invalid patterns |

### 11.2 Integration
1. Claim new handle → verify appears on friends list.
2. Search by `@handle` → single result.
3. Search by partial major → still returns results (unchanged path).
4. Change handle → old handle no longer resolves; new one does.
5. Attempt second change < 7d → blocked (UI).
6. Duplicate claim (open two tabs) → one succeeds, other shows taken.

### 11.3 Negative Tests
| Attempt | Expected |
|---------|----------|
| Uppercase input | Lowercased automatically |
| Space in input | Rejected (invalid chars) |
| Emoji | Rejected |
| Very long (>32) | Rejected |

---
## 12. Rollout Steps (Execution Order)
1. Add utilities + rules + `/handles` support (no UI changes yet) → build passes.
2. Implement handle claim UI in profile setup (or first-run gate) – since pre-launch, can force claim.
3. Replace displayName references across services/pages.
4. Remove `displayName` search path + index reference.
5. Implement search early-exit handle logic.
6. Add handle change (settings modal / temporary button) + cooldown logic.
7. Remove stale code + add mention TODO comments.
8. Final QA using test checklist.

---
## 13. Performance Considerations
| Aspect | Impact | Mitigation |
|--------|--------|------------|
| Availability checks | 1 read per 300ms pause | Debounce + only after regex pass |
| Exact search | 2 reads worst | Acceptable (no caching needed) |
| Handle change | 1 txn (≤3 ops) | Rare (weekly max) |

---
## 14. Future Enhancements (Backlog)
| Feature | Rationale |
|---------|-----------|
| Reserved words / profanity list | Prevent impersonation / abuse |
| Cloud Function enforcement | Strong server-side cooldown + auditing |
| Mention autocomplete | Social interactions & notifications |
| Handle prefix suggestions | Better discovery UX |
| Tightened regex (no leading/trailing dot/underscore) | Consistency & aesthetics |
| Historical handle parking | Prevent rapid impersonation after change |
| Full-text name indexing (Algolia/Meilisearch) | Scale beyond Firestore query limits |

---
## 15. Risk & Mitigation
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Race condition on popular handle | Low (pre-launch) | Medium | Transaction already prevents overwrite |
| User bypasses cooldown | Medium | Low | Not critical pre-launch; later Cloud Function |
| UI desync after handle change | Medium | Low | Broadcast event / refresh current user state |
| Forgotten reference to displayName | Medium | Medium | Grep + ESLint rule (optional) |

---
## 16. Developer Checklist (Execution Tracking)
[] Finalize `handleUtils.js` (DONE)
[] `/handles` rules block (DONE – tighten regex PENDING)
[] Remove index referencing `profile.displayName_lower` (PENDING)
[] Purge remaining `displayName` fallbacks (IN PROGRESS)
[] Transactional claim logic w/ cooldown & old handle release (DONE)
[] Exact handle fast-path in search (DONE – full audit PENDING)
[] Enforce handle required on profile step 0 (DONE)
[] Availability pill + styled feedback (DONE)
[] Post-setup handle change UI (PENDING)
[] Cooldown UI outside setup (PENDING)
[] Migration script (PENDING)
[] Final QA + grep (PENDING)
[] Remove legacy mirror fields in payloads (PENDING)
[] Reserved handles enforcement server-side (PENDING)
[] Mentions TODO stub (DONE)
[] Align server rules regex (PENDING)

---
## 17. Glossary
| Term | Meaning |
|------|---------|
| Handle | Unique global identifier for a user (e.g. `faizan`) |
| Cooldown | Minimum enforced interval between handle changes |
| Exact Handle Search | Direct mapping lookup bypassing fuzzy search |

---
## 18. Acceptance Criteria (Definition of Done)
1. User cannot proceed past first profile step without a valid & available handle.
2. Searching `@handle` yields single exact match or empty state.
3. Fuzzy search uses first/last/major only.
4. Requests & notifications render handle only.
5. Cooldown enforced in transaction and surfaced in UI.
6. Codebase free of functional `displayName` usage.
7. Rules regex matches client regex exactly.
8. No indexes reference deprecated fields.
9. Old handle released instantly.
10. Reserved handles blocked.
11. Debounced availability (no excessive reads).
12. Logging standardized on handle.

---
## 19. Next Concrete Implementation Step
Proceed with Phase 1: introduce utilities + rules update + index edit + mapping collection usage scaffolding, then pause for manual verification before cascading UI refactors.

---
## 20. TODO(mentions) Placeholder Example
```js
// TODO(mentions): implement @handle parsing in rich text inputs.
// Strategy: regex /(^|\s)@([a-z0-9._]{2,32})/g → resolve via /handles/{match}.
````

---

## 21. Added / Clarified Requirements (Post-Discussion)

| Requirement                                                 | Rationale                  | Status        |
| ----------------------------------------------------------- | -------------------------- | ------------- |
| Handle mandatory at profile step 0                          | Ensures universal identity | DONE          |
| Availability pill styling & animation                       | Clear UX feedback          | DONE          |
| Dots removed, underscores rules tightened                   | Simpler regex & appearance | DONE          |
| Start letter, no trailing underscore, no double underscores | Readability & aesthetics   | DONE          |
| Length 3–20                                                 | Balance scarcity & layout  | DONE          |
| Reserved handles set                                        | Impersonation prevention   | DONE (client) |
| Cooldown timestamp `lastHandleChangeAt`                     | Accurate enforcement       | DONE          |
| Old handle deleted in txn                                   | Free namespace             | DONE          |
| Migration/backfill script                                   | Future safety              | PENDING       |
| Rules regex alignment                                       | Prevent bypass             | PENDING       |
| Purge displayName fallbacks                                 | Identity purity            | IN PROGRESS   |
| Post-setup change UI                                        | Usability                  | PENDING       |
| Mention parsing stub                                        | Future mentions            | DONE          |

## 22. Implementation Status Matrix

| Area                     | Implemented    | Gap                               |
| ------------------------ | -------------- | --------------------------------- |
| Validation regex         | YES (client)   | Server rules broader              |
| Uniqueness mapping       | YES            | -                                 |
| Cooldown txn enforcement | YES            | Need settings UI surfacing        |
| Old handle release       | YES            | -                                 |
| Search exact path        | PARTIAL (core) | Audit all entry points            |
| displayName purge        | PARTIAL        | Remove remaining fallbacks        |
| Reserved handles         | YES (client)   | Add to rules                      |
| Migration                | NO             | Add script if legacy users appear |
| Rules regex alignment    | NO             | Update rules file                 |
| Post-setup change UI     | NO             | Implement                         |
| Logging standardization  | PARTIAL        | Ensure all services updated       |

End of comprehensive plan.

---

## 23. Fast Rehydration & Stale-While-Revalidate Strategy (Conventional Best Practice)

Goal: Eliminate "flash of empty inputs" on Profile / Friends / Notifications pages after hard reload by instantly painting cached identity + lightweight friend metadata, then refreshing in background.

### 23.1 Principles

1. Instant UX: Never show blank required identity fields if the user has previously loaded them.
2. Minimal Cache: Persist only non-sensitive, frequently-needed identity & friend summary.
3. Stale-While-Revalidate: Hydrate from local cache synchronously, mark as stale, fetch fresh, then reconcile.
4. Diff Before Write: Avoid unnecessary DOM churn if nothing changed.
5. Safe Fallback: If cache corrupt or mismatched UID → discard gracefully.

### 23.2 Cached Shape (v1)

Key: `cx_profile_cache_v1_<uid>` (localStorage; can migrate to IndexedDB later)

```
{
  version: 1,
  uid: <uid>,
  updatedAt: <ms epoch>,
  profile: {
    handle,
    firstName,
    lastName,
    major,
    avatarConfig,   // minimal (seed/style only)
    university: { emailStub, studentId }
  },
  friendsIndex: [ { id, handle, avatarKey, restricted } ], // optional v1.1
  counters: { unreadNotifications }
}
```

### 23.3 Lifecycle (Simplified)

```
bootstrapApp() {
  const authUser = firebase.auth().currentUser;
  const snap = loadCache(authUser?.uid);
  if (snap) {
    currentUser.hydrateFromCache(snap.profile);
    paintProfileInputs(snap.profile); // synchronous pre-fill
    markState('profileStale', true);
  } else {
    showSkeleton('profile');
  }
  // Fire async revalidation
  fetchFreshProfile(authUser.uid).then(fresh => {
    if (!deepEqualSubset(fresh, snap?.profile)) {
      currentUser.update(fresh);
      updateInputsIfDirty(fresh);
      saveCache(fresh);
    }
    clearState('profileStale');
  }).catch(reportSoftError);
}
```

### 23.4 UI States

| State            | Inputs                | Indicator                      |
| ---------------- | --------------------- | ------------------------------ |
| Cold (no cache)  | Skeleton placeholders | Subtle shimmer                 |
| Hydrated (stale) | Filled from cache     | Tiny spinner / dot near header |
| Fresh            | Filled & confirmed    | Indicator removed              |

### 23.5 TTL & Invalidations

| Scenario        | Action                                                    |
| --------------- | --------------------------------------------------------- |
| Cache age > 10m | Still use (better than empty) but force immediate refresh |
| Logout          | Remove key namespace for prior uid                        |
| Handle change   | Immediately update cache + broadcast (optional)           |
| Version bump    | Ignore old (version mismatch)                             |

### 23.6 Multi-Tab Coherence (Optional v2)

Use `BroadcastChannel('cx_profile')` to announce `{ uid, updatedAt }`; if newer timestamp received → rehydrate & optionally soft-refresh.

### 23.7 Error Handling

| Issue            | Handling                           |
| ---------------- | ---------------------------------- |
| JSON parse fails | Wipe key; treat as cold start      |
| UID mismatch     | Wipe key; cold start               |
| Partial fields   | Fill what exists; queue full fetch |

### 23.8 Why Not More Now?

- IndexedDB unnecessary until size / perf pressure.
- No hashing/ETag: simple timestamp diff adequate pre-scale.
- No complex friend presence caching: presence & schedules remain live-sourced.

### 23.9 Minimal Implementation Tasks

| Task                                                       | Effort  |
| ---------------------------------------------------------- | ------- |
| Add `profileCache.js` (get/set/clear, validate)            | ~40 LOC |
| Inject hydration before `ProfileSetup` / friends page init | ~15 LOC |
| Add stale flag + tiny spinner CSS                          | ~20 LOC |
| Hook save after successful profile fetch / handle claim    | ~10 LOC |
| Optional friendsIndex caching                              | ~25 LOC |

### 23.10 Future Upgrade Path

| Need                     | Upgrade                                        |
| ------------------------ | ---------------------------------------------- |
| Larger friend metadata   | Move to IndexedDB store (object store per uid) |
| Offline schedule preview | Add schedule digest hash + selective caching   |
| Conflict resolution      | Introduce per-field version / etag             |

### 23.11 Acceptance for Rehydration Feature

1. Hard reload on profile page instantly shows populated handle & name (no flash empty).
2. Network throttled (Slow 3G) still yields filled fields within 50ms of script execution.
3. Changing handle updates cache and survives reload.
4. Cache cleared on logout; switching accounts never leaks prior data.

---

END SECTION 23
