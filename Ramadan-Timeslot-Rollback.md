# Ramadan Timeslot Rollback

## Why this file exists
We switched IUB base schedule slots to Ramadan timings and added:
- legacy-slot auto migration for existing users
- a 20-minute `FREE` grace window after last class

This file explains:
1. How to rollback to old slots later
2. What to do now before/after deploying to production

## Current Ramadan slot set (active now)
1. `08:00-09:15`
2. `09:20-10:35`
3. `10:40-11:55`
4. `12:00-13:15`
5. `13:20-14:35`
6. `14:40-15:55`

## Old slot set (rollback target)
1. `08:00-09:30`
2. `09:40-11:10`
3. `11:20-12:50`
4. `13:00-14:30`
5. `14:40-16:10`
6. `16:20-17:50`

## Rollback steps (when Ramadan ends)
1. In `src/js/utils/constants.js`, set `DEFAULT_TIMESLOTS` back to the old slot set.
2. In `src/js/utils/constants.js`, restore `TIME_SLOT_INFERENCE_MAP` entries to match the old slots.
3. In `src/js/services/schedule/ScheduleStorageService.js`, set `LEGACY_IUB_BASE_TIMESLOTS` to the Ramadan set (the "old" side for that moment).
4. Keep `_migrateLegacyIubBaseSlots()` unchanged so it maps detected legacy slots to `DEFAULT_TIMESLOTS` (which will be old again after step 1).
5. Keep `timeSlots` in signature checks in `src/js/pages/HomePage.js` (do not remove).

## Validation commands (before rollback deploy)
```bash
npm test -- src/js/tests/services/schedule/ScheduleStorageService.test.js
npm test -- src/js/tests/services/presence/SchedulePresenceService.test.js
npm run build
```

Optional full checks:
```bash
npm test
npm run security:check
```

## What to do now for production (current Ramadan release)

### Before merging to `main`
1. Make sure intended files are staged (timeslots, presence change, migration/signature fixes).
2. Avoid committing unrelated generated changes unless intentional (for example `src/js/lib/firebase/env-config.js` if it was auto-generated locally).
3. Run:
```bash
npm test -- src/js/tests/services/schedule/ScheduleStorageService.test.js
npm test -- src/js/tests/services/presence/SchedulePresenceService.test.js
npm run build
```
4. Commit and merge to `main`.

### Deploy to production
If your pipeline auto-deploys on `main`, merging is enough.

If manual deploy is required:
```bash
npm run firebase:deploy
```

### After deploy (important)
1. Open production and hard refresh once.
2. Verify schedule grid labels show Ramadan slots.
3. Verify day view shows 12-hour times correctly.
4. Verify presence behavior:
- during class => `CLASS`
- between classes => `FREE`
- up to 20 minutes after last class => `FREE`
- after 20 minutes => `NO CLASSES`
5. Check at least one existing user account with previously saved schedule to confirm legacy migration applied.

## Suggested commit message (current release)
`feat(schedule): apply Ramadan time slots with legacy migration and post-class free window`
