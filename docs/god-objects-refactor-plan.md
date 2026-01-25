# God Objects Refactor Plan (H6)

Goal: Reduce the largest “god object” files into smaller, testable modules without changing runtime behavior.

Guiding rules:
- Keep changes incremental (one extraction per PR).
- Prefer “extract + adapt” over rewrites.
- Add/extend Jest tests for extracted pure logic first.
- Keep page controllers focused on wiring: DOM + services + state.

## Target Files

### `src/js/pages/HomePage.js`
- Extract modules:
  - `src/js/pages/home/onboardingHints.js` (coachmarks + hint queues)
  - `src/js/pages/home/viewModeController.js` (grid/day toggle wiring)
  - `src/js/pages/home/scheduleRender.js` (renderScheduleForCurrentView + helpers)
  - `src/js/pages/home/compareMode.js` (pin mode + compare selection state)
- Tests: `src/js/tests/pages/home/*.test.js` for pure helpers (render selection logic, hint gating).

### `src/js/components/friends/HorizontalFriendsBar.js`
- Extract modules:
  - `src/js/components/friends/presenceBadge.js` (presence rendering + formatting)
  - `src/js/components/friends/quickAccessModel.js` (sorting, caching, derived state)
  - `src/js/components/friends/friendsBarOnboarding.js` (hint orchestration)
- Tests: `src/js/tests/components/friends/*.test.js` for quick-access sorting and state transitions.

### `src/js/pages/FriendsPage.js`
- Extract modules:
  - `src/js/pages/friends/locationPrivacyUi.js` (pending UI + button state updates)
  - `src/js/pages/friends/searchUi.js` (search state + rendering)
  - `src/js/pages/friends/coachmarks.js` (friends page hint queue)
- Tests: `src/js/tests/pages/friends/*.test.js` (pending UI state derivation, cache behavior).

### `src/js/services/location/CampusLocationService.js`
- Extract modules:
  - `src/js/services/location/presenceStateMachine.js` (state transitions, throttling, backoff)
  - `src/js/services/location/ipPresenceDetector.js` (Tier 1 detection wrapper)
  - `src/js/services/location/gpsPresenceDetector.js` (GPS sampling wrapper)
  - `src/js/services/location/locationPermissions.js` (permission checks + prompts)
- Tests: `src/js/tests/services/location/*.test.js` (state machine, throttling, permission gating).

### `src/js/services/data/DataService.js`
- Extract modules:
  - `src/js/services/data/queryBuilders.js` (centralize Firestore query creation)
  - `src/js/services/data/cacheLayer.js` (in-memory + storage cache helpers)
  - `src/js/services/data/userProfileRepo.js` / `friendsRepo.js` / `scheduleRepo.js` (domain repositories)
- Tests: `src/js/tests/services/data/*.test.js` for query builders and caching behavior (no network).

### `src/js/components/forms/ProfileSetup.js`
- Extract modules:
  - `src/js/components/forms/profileSetup/steps.js` (step metadata + navigation)
  - `src/js/components/forms/profileSetup/typeaheads.js` (major + any future typeaheads)
  - `src/js/components/forms/profileSetup/validators.js` (pure validation)
  - `src/js/components/forms/profileSetup/scheduleImportUi.js` (paste/parse wiring)
- Tests: `src/js/tests/components/profileSetup/*.test.js` for validators + step navigation.

## Sequencing (recommended)
1. Extract pure helpers (no DOM/Firebase) + add tests
2. Extract DOM-only controllers (keeps same service calls)
3. Extract service adapters (Tier 1/GPS wrappers) + add tests with mocks
4. Delete dead code/comments after extractions (M1/M2)

