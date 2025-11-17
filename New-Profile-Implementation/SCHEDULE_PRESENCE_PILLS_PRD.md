# Smart Schedule-Based Presence Pills – Product Requirements Document

**Version:** 1.2.0  
**Status:** Draft – Ready for implementation  
**Created:** November 18, 2025  
**Updated:** November 18, 2025  
**Author:** MeetchuThere Development Team  
**Target Release:** Q1 2026  

---

## Table of Contents

1. [Executive Summary](#executive-summary)  
2. [Problem Statement](#problem-statement)  
3. [Solution Overview](#solution-overview)  
4. [Status Model & Rules (Final)](#status-model--rules-final)  
5. [User Stories](#user-stories)  
6. [Functional Requirements](#functional-requirements)  
7. [Technical Requirements](#technical-requirements)  
8. [Privacy & Security Requirements](#privacy--security-requirements)  
9. [UI/UX Specifications](#uiux-specifications)  
10. [Implementation Phases](#implementation-phases)  
11. [Testing Strategy](#testing-strategy)  
12. [Success Metrics](#success-metrics)  
13. [Risks & Mitigations](#risks--mitigations)  
14. [Acceptance Criteria / Deliverables](#acceptance-criteria--deliverables)  
15. [Appendices](#appendices)  

---

## Executive Summary

### Objective

Turn the horizontal **starred-friends bar** into a smart status row that shows, at a glance, whether friends are:

- In class (busy)  
- Free on campus (good to meet)  
- Off campus (definitely not there)  
- Have no classes today / unknown  

This replaces ambiguous grey dots with **text-based pills** powered by **schedule + GPS**, optimized for mobile.

### Core Ideas

- **Dot → Pill:** Replace tiny presence dots with a **single status pill** attached to each friend avatar.
- **Stable meanings:**
  - Green = “free / on campus”
  - Blue = “in class / busy”
  - Red = “off campus”
  - Grey = “no classes / no data / private”
- **GPS > schedule** for location truth. If GPS says “off campus”, you trust GPS even if schedule says they “should” be in class.

### Expected Impact

- Friends bar feels **alive** instead of “all grey / dead”.
- Users can see **who’s free** from the home screen without opening schedules.
- Stronger daily hook: “Which of my friends are free on campus right now?”

---

## Problem Statement

### Grey Dominance

- Most users don’t keep GPS on.
- Current presence dots = mostly grey.
- Perception: “No one uses MeetchuThere.”

### Color-Only Ambiguity

- Old model:
  - Green = on campus (GPS)
  - Red = off campus (GPS)
  - Grey = unknown
- Users have to **remember color mapping**, and even then they don’t know if someone is *in class* or *free*.

### Wasted Schedule Data

- App already stores **detailed schedules**.
- Presence UI practically ignores them.
- Users manually open each friend’s schedule to see who’s free.

### Mobile UX

- Avatars small, dots tiny, no text.
- On phones, at-a-glance scanning is worse than it needs to be.

---

## Solution Overview

### Pill-Only Status Near Avatars

Each starred friend in the horizontal bar shows:

- A **60–64px avatar**  
- A **status pill** attached to the bottom of the avatar  

Example:

```text
[ avatar ]
[ IN CLASS ]
faizan
```

The pill uses text + color, not color alone.

### Final High-Level Statuses (One Per Friend)

- `IN_CLASS` – currently in class (based on schedule)  
  - Blue pill – `IN CLASS`
- `FREE_ON_CAMPUS` – likely on campus and free  
  - Green pill – `FREE ON CAMPUS` or `ON CAMPUS`
- `OFF_CAMPUS` – definitely not on campus  
  - Red pill – `OFF CAMPUS`
- `NO_CLASSES` – has no classes today  
  - Grey pill – `NO CLASSES`
- `UNKNOWN / NO_DATA / PRIVATE` – no reliable info  
  - Grey pill – `NO DATA` or `PRIVATE`

### Behaviour Summary

- GPS on-campus **and** in-class → `IN_CLASS` (blue pill).
- GPS on-campus **and not** in-class → `FREE_ON_CAMPUS` (green pill).
- GPS off-campus → `OFF_CAMPUS` (red pill), even during a scheduled class (they might be skipping).
- GPS unknown → use schedule heuristics (`IN_CLASS`, `FREE_ON_CAMPUS`, `NO_CLASSES`, or `NO DATA`).

---

## Status Model & Rules (Final)

### Inputs

Per friend:

- `gpsStatus`: `'on' | 'off' | 'unknown'`
- `lastGpsAt`: timestamp
- `scheduleState` (derived for today), one of:
  - `'in_class'`
  - `'between_classes'` (two classes today, currently between them within gap threshold)
  - `'no_class_now_but_later'`
  - `'no_classes_today'`
  - `'no_schedule_data'`
- `privacy`:
  - `isRestricted: boolean`

### Time Logic (Configurable)

- `GPS_PRIORITY_WINDOW_MINUTES`: 30 (GPS freshness)
- `MAX_CAMPUS_GAP_MINUTES`: 180 (3 hours between classes)
- `POST_CLASS_TIMEOUT_MINUTES`: 120 (assume they left campus after this)

### Priority Order

1. **Privacy** – if restricted, don’t use schedule at all.
2. **GPS** – if fresh, trust for on/off campus.
3. **Schedule** – fill in meaning when GPS is unknown.
4. **Fallback** – if both are weak, show neutral / unknown.

### Final State Resolution

#### Step 0 – Privacy

```js
if (friend.isRestricted === true) {
  return {
    state: 'UNKNOWN_PRIVATE',
    pillText: 'PRIVATE',
    color: 'grey',
    metadata: { source: 'none', hasSchedule: false, hasFreshGPS: false }
  };
}
```

No schedule fetch. No inference.

#### Step 1 – GPS Staleness

```js
const gpsFresh =
  gpsStatus === 'on' || gpsStatus === 'off'
    ? minutesSince(lastGpsAt) <= GPS_PRIORITY_WINDOW_MINUTES
    : false;

const effectiveGpsStatus = gpsFresh ? gpsStatus : 'unknown';
```

#### Case A: GPS ON (fresh)

```js
if (effectiveGpsStatus === 'on') {
  if (scheduleState === 'in_class') {
    state = 'IN_CLASS'; // blue
    pillText = 'IN CLASS';
  } else {
    state = 'FREE_ON_CAMPUS'; // green
    pillText = 'FREE ON CAMPUS';
  }
}
```

#### Case B: GPS OFF (fresh)

```js
if (effectiveGpsStatus === 'off') {
  state = 'OFF_CAMPUS'; // red
  pillText = 'OFF CAMPUS';
}
```

Schedule can still be used in expanded view to explain “has class now / later”, but not to override `OFF_CAMPUS`.

#### Case C: GPS UNKNOWN

```js
if (effectiveGpsStatus === 'unknown') {
  switch (scheduleState) {
    case 'in_class':
      state = 'IN_CLASS'; // blue
      pillText = 'IN CLASS';
      break;

    case 'between_classes':
      state = 'FREE_ON_CAMPUS'; // green
      pillText = 'FREE ON CAMPUS';
      break;

    case 'no_class_now_but_later':
      state = 'NO_CLASSES'; // grey
      pillText = 'HAS CLASS LATER';
      break;

    case 'no_classes_today':
      state = 'NO_CLASSES'; // grey
      pillText = 'NO CLASSES';
      break;

    case 'no_schedule_data':
    default:
      state = 'UNKNOWN_NO_DATA'; // grey
      pillText = 'NO DATA';
      break;
  }
}
```

### Status → Pill Mapping

| Final State        | Pill Text                      | Color |
| ------------------ | ------------------------------ | ----- |
| `IN_CLASS`         | IN CLASS                       | Blue  |
| `FREE_ON_CAMPUS`   | FREE ON CAMPUS                 | Green |
| `OFF_CAMPUS`       | OFF CAMPUS                     | Red   |
| `NO_CLASSES`       | NO CLASSES \| HAS CLASS LATER  | Grey  |
| `UNKNOWN_NO_DATA`  | NO DATA                        | Grey  |
| `UNKNOWN_PRIVATE`  | PRIVATE                        | Grey  |

Note: pill text for `FREE_ON_CAMPUS` may be either `FREE ON CAMPUS` or `ON CAMPUS` (short variant); both map to the same `FREE_ON_CAMPUS` state.

---

## User Stories

### US-1 – Fast glance

As a student, when I open MeetchuThere,  
I want the starred friends bar to tell me who is in class, free on campus, or off campus  
so I can decide who to meet without opening every schedule.

### US-2 – Free friend discovery

As a student who has a free period,  
when I see a friend with `FREE ON CAMPUS`,  
I want to tap and see until when they’re free / when their next class is  
so I can decide if it’s worth asking them to meet.

### US-3 – Privacy

As a privacy-conscious student,  
when I restrict my schedule from someone,  
I want them to see only a neutral `PRIVATE` status  
so my class times and inferred presence are not exposed.

### US-4 – “No classes” clarity

As a student checking on weekends or off-days,  
when my friend has no classes,  
I want to see `NO CLASSES` instead of a mysterious grey  
so I know they simply don’t have class, not that they never use the app.

### US-5 – Mobile comfort

As a mobile user,  
when I tap a friend avatar,  
I want big, thumb-friendly targets and readable pills  
so I don’t mis-tap and I understand statuses instantly.

---

## Functional Requirements

### Status Engine

#### FR-1 – Per-friend status

Implement:

```ts
deriveStatus(friend, now) -> {
  state:
    | 'IN_CLASS'
    | 'FREE_ON_CAMPUS'
    | 'OFF_CAMPUS'
    | 'NO_CLASSES'
    | 'UNKNOWN_NO_DATA'
    | 'UNKNOWN_PRIVATE',
  pillText: string,
  color: 'blue' | 'green' | 'red' | 'grey',
  metadata: {
    source: 'gps' | 'schedule' | 'mixed' | 'none',
    hasSchedule: boolean,
    hasFreshGPS: boolean,
    inDayGap: boolean,
    nextClassTime?: Date,
    currentClassEnd?: Date
  }
}
```

#### FR-2 – Batch

`deriveStatusForFriends(friends[], now)` returns a map `{ friendId -> statusInfo }`.

Must process up to `MAX_FRIENDS_PER_BATCH` efficiently.

#### FR-3 – Refresh cadence

Recalculate statuses every `STATUS_UPDATE_INTERVAL_MS` (default 60s) while the view is active.

Also recalc immediately on:

- Schedule updates.
- Privacy changes.
- GPS updates (if available).

### Schedule Usage

#### FR-4 – Today’s classes

For each friend, derive from stored schedule:

- `todayClasses[] = [ {start, end}, ... ]` sorted.
- `scheduleState` as defined above.

Derive `scheduleState` for today as:

- `in_class`: now is inside `[start, end)` of any class today.
- `between_classes`: now is between two classes today **and** gap ≤ `MAX_CAMPUS_GAP_MINUTES`.
- `no_class_now_but_later`: there is at least one class later today, but now is not `in_class` or `between_classes`.
- `no_classes_today`: no classes remaining today (either there were none at all, or all of today’s classes have finished).
- `no_schedule_data`: `schedule` / `timeSlots` missing or invalid.

`no_classes_today` must only be used if a schedule document / `timeSlots` were successfully loaded and parsed for that user and day.  
If the schedule document is missing or invalid, set `scheduleState = 'no_schedule_data'` instead, which maps to `UNKNOWN_NO_DATA` (grey, pill `NO DATA`).

#### FR-5 – Gap logic

Detect `between_classes` if:

- Now is between two classes today, and
- Gap ≤ `MAX_CAMPUS_GAP_MINUTES`.

If the gap between the nearest past and next future class is **greater** than `MAX_CAMPUS_GAP_MINUTES`,  
then `scheduleState = 'no_class_now_but_later'` (because there is still a class later today).  
In GPS-unknown cases this resolves to state `NO_CLASSES` (grey), pill text `HAS CLASS LATER` (not green).

#### FR-6 – After-class timeout

If now is more than `POST_CLASS_TIMEOUT_MINUTES` after last class,  
do **not** treat the user as `FREE_ON_CAMPUS` purely from schedule.  
For GPS-unknown cases, fall back to a neutral grey (`NO_CLASSES` / `NO DATA`)  
instead of trying to show `OFF_CAMPUS`.

Assumption: all classes start and end on the same local calendar day (no cross-midnight blocks).  
Any cross-midnight or late-night schedule edge cases must be handled by the schedule importer and are out of scope for the presence engine.

---

## Technical Requirements

### Presence Service

- **File:** `src/js/services/presence/SchedulePresenceService.js`

Assumption: `gpsStatus` and `lastGpsAt` are provided by the existing Location/GPS service (out of scope for this PRD). This feature does not change how geofencing or GPS sampling works.

```js
export const PRESENCE_STATES = {
  IN_CLASS: 'IN_CLASS',
  FREE_ON_CAMPUS: 'FREE_ON_CAMPUS',
  OFF_CAMPUS: 'OFF_CAMPUS',
  NO_CLASSES: 'NO_CLASSES',
  UNKNOWN_NO_DATA: 'UNKNOWN_NO_DATA',
  UNKNOWN_PRIVATE: 'UNKNOWN_PRIVATE'
};

export const PRESENCE_CONFIG = {
  MAX_CAMPUS_GAP_MINUTES: 180,
  POST_CLASS_TIMEOUT_MINUTES: 120,
  GPS_PRIORITY_WINDOW_MINUTES: 30,
  STATUS_UPDATE_INTERVAL_MS: 60000,
  SCHEDULE_CACHE_TTL_MS: 300000, // 5 min
  STATUS_CACHE_TTL_MS: 60000,    // 1 min
  MAX_FRIENDS_PER_BATCH: 50,
  SCROLL_DEBOUNCE_MS: 500
};

export class SchedulePresenceService {
  static deriveStatus(friend, now = new Date());
  static deriveStatusForFriends(friends, now = new Date());
}
```

#### Friend object requirements

- `friendId` or `userId`
- `schedule` or `timeSlots` (already normalized)
- `gpsStatus`, `lastGpsAt`
- `isRestricted: boolean`

### Presence Pill Component

- **File:** `src/js/components/presence/PresenceIndicator.js`

```js
export function createPresencePill(statusInfo, { expanded = false } = {}): string;
```

- Uses `statusInfo.color` for class: `.presence-pill.blue` \| `.green` \| `.red` \| `.grey`.
- Inserts `statusInfo.pillText` into `.pill-text`.

### Horizontal Friends Bar Integration

- **File:** `src/js/components/friends/HorizontalFriendsBar.js`

Responsibilities:

- Load starred friends (`quickAccessFriends`).
- Fetch schedules only for non-restricted friends.
- Cache schedules for `SCHEDULE_CACHE_TTL_MS`.
- Call `SchedulePresenceService.deriveStatusForFriends` to populate `friend.schedulePresenceStatus`.
- Render pills via `createPresencePill`.

Maintain:

- `selectedFriendId` (for expanded pill).
- `statusUpdateTimer` (60s interval).

Clean up timer in `destroy()`.

### Feature Flag

- Global flag: `enableSchedulePresencePills`.
  - If `false` → fallback to legacy GPS-only dots.
  - If `true` → use pills.

---

## Privacy & Security Requirements

### Privacy Enforcement

#### PRIV-1 – Schedule visibility gate

```js
if (friend.isRestricted === true) {
  // Do not fetch schedule
  // Do not infer schedule-based status
  return {
    state: 'UNKNOWN_PRIVATE',
    pillText: 'PRIVATE',
    color: 'grey'
  };
}
```

#### PRIV-2 – No schedule fetch for restricted

Filter friends before calling any `getUserSchedule()` / Firestore reads:

```js
friends.filter(f => !f.isRestricted);
```

#### PRIV-3 – No subtle leaks

Restricted friend:

- Never show `IN CLASS`, `FREE ON CAMPUS`, `NO CLASSES`.
- No tooltips about “class until X”.
- Only `PRIVATE` (grey).

#### PRIV-4 – Privacy change reactions

On schedule visibility toggle:

- Clear any cached schedule for that friend.
- Recompute presence status.
- Update UI immediately.

#### PRIV-5 – Future global opt-out

- Setting (future): `allowScheduleBasedPresence` (default `true`).
- If `false`, treat user as restricted for all friends.

---

## UI/UX Specifications

### Avatar & Pill Layout

- Avatar diameter: 60–64px.
- Friend card width: ~72–80px.
- Pill placement: bottom of avatar, slightly overlapping.
- Horizontal spacing: 8–12px between avatars.

### Pill Visuals

Base pill:

- Height: 18–20px (collapsed), 22–24px (expanded).
- Font: System UI (`-apple-system`, `Roboto`, etc.).
- Font size: 9–10px.
- Weight: 800–900.
- Text: UPPERCASE or Title Case (`IN CLASS`, `FREE ON CAMPUS`).

Colors:

- `IN_CLASS` → Blue pill.
- `FREE_ON_CAMPUS` → Green pill.
- `OFF_CAMPUS` → Red pill.
- Grey pill → `NO CLASSES`, `NO DATA`, `PRIVATE`.

Animations (optional but nice):

- Light pulse for `IN_CLASS`.
- 200ms smooth expand on tap (transform, not width).

### Interaction

Tap avatar:

- Set `selectedFriendId`.
- Expand that friend’s pill.
- Load their schedule in main panel.

Horizontal scroll:

- Smooth, with avatars + pills staying fixed to avatars.

### Accessibility

ARIA:

```html
<div
  class="friend-avatar-item"
  role="button"
  tabindex="0"
  aria-label="Faizan, free on campus until 4:20 PM">
</div>
```

Screen readers should announce:

- “Faizan, in class until 2:30 PM, button”
- “Faizan, free on campus, button”
- “Faizan, off campus, button”
- “Faizan, private, button”

Keyboard:

- `Tab`: move focus between avatars.
- `Enter` / `Space`: select friend.

Reduced motion:

- Respect `prefers-reduced-motion`:
  - Disable pulse/expand animations or drastically simplify.

---

## Implementation Phases

### Phase 1 – Status Engine

Implement `SchedulePresenceService` with:

- `deriveStatus()`
- `deriveStatusForFriends()`

Centralize all thresholds in `PRESENCE_CONFIG`.

Add unit tests for:

- All state combinations.
- GPS staleness.
- Weekends / no-classes days.

### Phase 2 – Pill Component

- Implement `PresenceIndicator.createPresencePill(statusInfo, { expanded })`.
- Implement CSS for `.presence-pill` and color variants.
- Swap out existing dot usage in the friends bar to pills.

### Phase 3 – Friends Bar Integration

Add `enrichFriendsWithScheduleStatus(friends)`:

- Filter out restricted friends.
- Fetch schedules with caching (5 min TTL).
- Compute status map with `deriveStatusForFriends`.
- Attach `friend.schedulePresenceStatus` used in rendering.
- Add `statusUpdateTimer` (60s) + granular `updateFriendPresenceUI`.

### Phase 4 – Privacy + Edge Cases

- Enforce `isRestricted` gates.
- Confirm no schedule reads for restricted friends.
- Validate behaviour for:
  - All-day no classes.
  - Long gaps.

### Phase 5 – Feature Flag, Analytics & Rollout

- Wire `enableSchedulePresencePills`.
- Add analytics events:
  - `presence_pill_rendered`
  - `presence_status_changed`
  - `friend_tapped_with_pill`
  - `schedule_fetch_failed`
  - `presence_privacy_blocked`
- Optional: A/B test against legacy dots for a small subset of users.

---

## Testing Strategy

### Unit Tests

**SchedulePresenceService:**

- GPS fresh vs stale.
- In-class detection.
- Between-classes gap logic.
- Post-class timeout.
- No-classes day.
- Unknown / no schedule.

**PresenceIndicator:**

- Correct pill classes for each state.
- Correct text for each state.
- Expanded vs collapsed markup.

### Integration Tests

Friends bar:

- Mixed statuses across friends.
- Correct states when privacy flags are toggled.
- Timer-driven updates changing pills.

### Scenario Tests (Key Cases)

- Morning commute (GPS unknown, 45 min before first class): `scheduleState = 'no_class_now_but_later'` → state `NO_CLASSES` (grey), pill `HAS CLASS LATER`. We do **not** show green unless GPS says they’re actually on campus.
- In class: mid-block.
- Between classes (short gap): 1–2 hours gap.
- Between classes (long gap): >3h gap → `scheduleState = 'no_class_now_but_later'` → state `NO_CLASSES` (grey), pill `HAS CLASS LATER`.
- Just finished last class: within 1h, GPS unknown → `NO_CLASSES` (grey), not green.
- Long after last class: >2h after → neutral grey (`NO CLASSES` – we stop assuming they’re still on campus from schedule alone).
- Weekend / no classes: `NO CLASSES`.
- Privacy restricted: `PRIVATE` (grey), no schedule fetch.
- GPS contradicts schedule (off campus during class): `OFF_CAMPUS`.
- Status crosses a class boundary in real-time: `IN_CLASS` → `FREE_ON_CAMPUS` after 60s interval.

### Performance Tests

- 10 friends: total status calculation < 50ms.
- 50 friends: total status calculation < 200ms.
- Schedule fetch cache prevents excessive Firestore reads.

### Accessibility Tests

- Screen reader readouts make sense.
- Keyboard navigation is usable.
- Reduced-motion mode doesn’t feel broken.

---

## Success Metrics

### Primary

Grey/neutral share:

- Baseline: ~70% grey.
- Target: <30% grey (rest colored with meaningful states).

Avatar tap rate:

- Target: +40% taps on friends compared to legacy dots.

User perception:

- In-app survey score on “My friends appear active / it’s easy to see who is free” ≥ 4.5/5.

### Secondary

- Increased messages / coordination after `FREE ON CAMPUS` status.
- No significant increase in “Hide schedule” toggle usage.

---

## Risks & Mitigations

### Technical

- **Slow schedule fetches / high Firestore usage**  
  Mitigation: caching, batching, lazy loading only visible friends.

- **Incorrect inference (e.g., shows free but they went home)**  
  Mitigation: GPS override, conservative thresholds, tune based on real data.

### Privacy

- **Schedule leakage if gates are wrong**  
  Mitigation: explicit checks before any schedule fetch, privacy-focused tests, code review.

### UX

- **Too busy visually**  
  Mitigation: one pill per friend, few states, short labels, consistent colors.

- **User backlash (“overcomplicated”)**  
  Mitigation: feature flag + A/B test, opt-out setting later if needed.

---

## Acceptance Criteria / Deliverables

Feature is **DONE** when:

### Logic

- `SchedulePresenceService` exists with:
  - `deriveStatus(friend, now)`
  - `deriveStatusForFriends(friends, now)`
- Output states match the final model and priority rules.
- `PRESENCE_CONFIG` holds all time-related thresholds.

### UI

- Every starred friend renders a single pill from the allowed set.
- Tap on a friend:
  - Expands pill.
  - Loads schedule pane.

### Privacy

- Restricted friends:
  - Never trigger schedule fetch.
  - Always show `PRIVATE` grey pill.
  - Privacy changes reflect immediately in UI.

### Performance

- Status computation meets performance targets for 10–50 friends.
- No noticeable jank on typical student devices.

### Analytics & Rollout

- `enableSchedulePresencePills` toggle is wired and working.
- Analytics events fire as expected.
- At least a small A/B run or staged rollout is done without breaking core flows.

---

## Appendices

### Appendix A: Configuration Constants

```js
export const PRESENCE_CONFIG = {
  MAX_CAMPUS_GAP_MINUTES: 180,      // 3 hours
  POST_CLASS_TIMEOUT_MINUTES: 120,  // 2 hours
  GPS_PRIORITY_WINDOW_MINUTES: 30,  // GPS freshness window
  SCHEDULE_CACHE_TTL_MS: 300000,    // 5 minutes
  STATUS_CACHE_TTL_MS: 60000,       // 1 minute
  STATUS_UPDATE_INTERVAL_MS: 60000, // 60 seconds
  MAX_FRIENDS_PER_BATCH: 50,
  SCROLL_DEBOUNCE_MS: 500
};
```

### Appendix B: Status State Machine (Simplified)

```text
Start: UNKNOWN

If isRestricted:
  -> UNKNOWN_PRIVATE (PRIVATE, grey)

Else:
  Check GPS (fresh?)
    If ON:
      if in_class -> IN_CLASS (blue)
      else        -> FREE_ON_CAMPUS (green)

    If OFF:
      -> OFF_CAMPUS (red)

    If UNKNOWN:
      if in_class                    -> IN_CLASS (blue)
      else if between_classes        -> FREE_ON_CAMPUS (green)
      else if no_class_now_but_later -> NO_CLASSES (grey, HAS CLASS LATER)
      else if no_classes_today       -> NO_CLASSES (grey, NO CLASSES)
      else                           -> UNKNOWN_NO_DATA (grey, NO DATA)
```

### Appendix C: Privacy Decision Tree

```text
Render friend status
  ↓
Is friend.isRestricted true?
  ├─ Yes:
  │   - Do NOT fetch schedule.
  │   - Show PRIVATE (grey pill).
  │   - No schedule-based tooltips.
  │
  └─ No:
      - Fetch schedule (with cache).
      - Derive scheduleState.
      - Use GPS + schedule to derive final presence state.
      - Show corresponding pill.
```
