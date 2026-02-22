# Ramadan Timeslot Rollback

## Current strategy (important)
- Canonical schedule data is unchanged (old slot times stay in storage and logic).
- Only UI labels are remapped for Ramadan display.
- Presence keeps the 20-minute post-last-class `FREE` window.

## Ramadan display labels (UI only)
1. `08:00-09:30` -> `08:00-09:15`
2. `09:40-11:10` -> `09:20-10:35`
3. `11:20-12:50` -> `10:40-11:55`
4. `13:00-14:30` -> `12:00-13:15`
5. `14:40-16:10` -> `13:20-14:35`
6. `16:20-17:50` -> `14:40-15:55`

## Where this is implemented
- `src/js/pages/HomePage.js`
  - `DISPLAY_TIMESLOT_LABELS`
  - `getDisplayTimeSlotLabel(...)`
  - `getDisplayTimeSlotLabel12Hour(...)`

## Rollback in one month
1. In `src/js/pages/HomePage.js`, remove `DISPLAY_TIMESLOT_LABELS`.
2. In `src/js/pages/HomePage.js`, replace usage of `getDisplayTimeSlotLabel(...)` with raw `timeSlot.label` where needed.
3. In `src/js/pages/HomePage.js`, replace usage of `getDisplayTimeSlotLabel12Hour(...)` with `convertTimeRangeTo12Hour(timeSlot.label)`.
4. Do not change `src/js/utils/constants.js` for this rollback (it should remain old canonical slots).

## Validate before deploy (now and rollback)
```bash
npm test -- src/js/tests/services/schedule/ScheduleStorageService.test.js
npm test -- src/js/tests/services/presence/SchedulePresenceService.test.js
npm run build
```

## Production deploy checklist
1. Stage intended files only.
2. Run validation commands above.
3. Merge to `main`.
4. Deploy (`npm run firebase:deploy`) if manual.
5. Hard refresh production and verify:
   - grid labels
   - day view label format
   - presence pills (`CLASS`, `FREE`, `NO CLASSES`, `OFF CAMPUS`)
