# University Time Slots Guide

This guide explains how time slots are initialized, saved, and rendered, and how to add support for new universities.

## Current Behavior

- Firestore is the source of truth for a user’s time slots (`users/{uid}/scheduleData.timeSlots`).
- Day view and grid view always render from `scheduleData.timeSlots` (per user). Local storage is used only as a cache.
- IUB (Independent University, Bangladesh) defaults:
  - If a signed-in user’s email ends with `@iub.edu.bd` and they have no existing `timeSlots`, the app initializes these 6 slots and saves immediately:
    - 08:00–09:30
    - 09:40–11:10
    - 11:20–12:50
    - 13:00–14:30
    - 14:40–16:10
    - 16:20–17:50
- Imports for IUB users append extra rows only for classes that start after 17:50 (e.g., 18:30–20:00, 18:30–21:30). Those are saved to Firestore timeSlots.
- Non‑IUB users have no defaults. Imports or manual edits create their timeSlots and those are saved.
- Editing time slots via the UI replaces and persists the user’s `timeSlots`. Subsequent sessions render from those values.
- Comparison mode merges differing time ranges using a unified timeline; identical time ranges compare normally.

## Files to Edit

- `src/js/services/schedule/ScheduleStorageService.js`
  - `loadUserSchedule(userId)`: Initializes university defaults for first-time users and saves them to Firestore.
  - `convertToHomePageFormat(firestoreData, userId)`: Converts Firestore data to UI format and applies university-specific defaults if `timeSlots` are missing (only for the current user).

- `src/js/services/schedule/ScheduleImportService.js`
  - `convertToMeetchuThereFormat(validatedCourses)`: Builds the per-user `timeSlots` for imported schedules.
    - For IUB: start with the 6 defaults; append any slots that start after 17:50.
    - For others: start empty; add all detected time ranges.

- `src/js/pages/HomePage.js`
  - `createEmptyUser(userId)`: Returns base timeSlots and matrices based on university (IUB → defaults, others → empty).
  - Grid + Day view renderers: always use `user.timeSlots` (no static fallback).

- `src/js/utils/constants.js`
  - `DEFAULT_TIMESLOTS`: Defines IUB’s 6 standard slots (used as defaults only for IUB users).

## Add a New University

Goal: Show university-specific default time slots for first-time users of that university; persist in Firestore as their source of truth.

1) Define the default time slots

- Edit `src/js/utils/constants.js` and add a constant for your university’s default slots (example):

```js
export const NSU_DEFAULT_TIMESLOTS = [
  { start: "08:30", end: "10:00", label: "08:30-10:00" },
  { start: "10:10", end: "11:40", label: "10:10-11:40" },
  // ...
];
```

2) Initialize defaults on first load

- In `ScheduleStorageService.loadUserSchedule(userId)`, detect the university by email domain or `currentUser.profile.universityInfo.university` and, if the user has no timeSlots, initialize and save:

```js
const email = (currentUser.user?.email || "").toLowerCase();
const uni = (currentUser.profile?.universityInfo?.university || "").toLowerCase();
const isNsu = email.endsWith("@nsu.edu.bd") || uni === "nsu";
// if isNsu && no timeSlots → set `NSU_DEFAULT_TIMESLOTS`, create matrices, save
```

3) Render defaults when Firestore has no timeSlots (current user only)

- In `ScheduleStorageService.convertToHomePageFormat`, when `firestoreData.timeSlots` is missing/empty, apply your new defaults for the current user of that university.

4) Import logic (optional)

- If you want to restrict dynamic slot creation (like IUB’s rule to append only slots after a threshold), update `ScheduleImportService.convertToMeetchuThereFormat` with your university’s rule.

5) Tests (optional)

- Add/update tests in `src/js/tests/services/schedule-import.test.js` to reflect dynamic/imported slot handling for the new university if needed.

## Notes

- Firestore remains the single source of truth for per-user timeRanges. Local cache is a performance optimization only.
- Comparison mode requires no changes for new universities; the unified schedule automatically merges time boundaries for differing time sets.

