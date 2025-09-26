# Repository Guidelines

## Project Structure & Module Organization
- `src/js/`: ES modules for app logic. Key areas: `pages/` (page controllers), `components/`, `services/` (e.g., `schedule/`, `friends/`, `location/`), `router/`, `store/`, `utils/`, `lib/firebase/`.
- `src/css/`: Modular CSS (kebab-case filenames) imported via `src/js/app.js`.
- `public/templates/`: HTML templates for SPA views.
- `src/js/tests/`: Jest tests under `core/`, `services/`, `firebase/`, with `__mocks__/` for SPA init.
- `index.html`: SPA entry; Vite builds from here.

## Architecture Overview
- SPA flow: `index.html` and `src/js/app.js` bootstrap the app, set logging, await `authManager.authReady`, then initialize `router/Router.js` to render into `.main-content` using `public/templates/*`.
- Presentation: `pages/*` coordinate features per view; `components/*` are reusable UI pieces; styles live in `src/css` and are imported via `app.js` for bundling.
- State: Lightweight client state in `store/userStore.js`; keep transient view state inside modules/components.
- Services: Domain logic in `services/` (e.g., `schedule/`, `friends/`, `location/`). Scheduling uses `ScheduleStorageService`, `ScheduleValidator` (paste-to-import text based); social features via `FriendsService` + `FriendshipPrivacyService`.
- Realtime & notifications: `RealtimeService` and `NotificationService` handle Firebase listeners; ensure listeners are created/cleaned up within pages/components to prevent leaks.
- Data & security: Firestore config/rules (`lib/firebase/*`, `firestore.rules`); runtime config injected to `window.ENV` by `dev:config`.
- Privacy: Enforced via `lib/security/privacyManager.js` and bilateral controls in `FriendshipPrivacyService`—follow these when reading/writing schedule data.
- Logging & dev: `utils/debug/LogManager.js` for structured logs; dev tooling under `core/firestore/dev-tools/*`; Vite bundles ES modules.

## Build, Test, and Development Commands
- `npm run dev`: Generate env config, start Vite with host binding.
- `npm run build`: Production build with Vite.
- `npm run preview`: Serve the production build locally.
- `npm test`: Run Jest (jsdom) tests located in `src/js/tests/**.*.test.js`.
- `npm run dev:config`: Generate `window.ENV` config (auto-used by app; do not edit generated files).
- `npm run dev:check`: Verify local Firebase/dev setup.
- `npm run firebase:emulators`: Start Firebase emulators.
- `npm run firebase:deploy`: Deploy Firebase hosting/services.

## Coding Style & Naming Conventions
- JavaScript: ES6 modules, 2-space indentation, semicolons consistent with current files.
- Naming: `Pages`/`Services` use PascalCase (e.g., `ScheduleImportService.js`), utilities camelCase (e.g., `timeUtils.js`), CSS kebab-case.
- Imports: Prefer relative module paths within `src/js/`; bundle CSS via imports in `app.js`.
- Generated config: `window.ENV` is created by `dev:config`; avoid hardcoding secrets.

## Testing Guidelines
- Framework: Jest with `jsdom`; setup in `jest.setup.js` (mocks `localStorage`, `matchMedia`, and `window.ENV`).
- Location: Place tests in `src/js/tests/**`, name files `*.test.js`.
- Run: `npm test`. Keep tests isolated; use provided mocks instead of network access.
- Aim for high coverage on core logic (`utils/`, `services/`, `router/`). No strict threshold enforced.

## Commit & Pull Request Guidelines
- Commits: Use Conventional Commits (e.g., `feat:`, `fix:`, `refactor:`). Keep messages imperative and scoped (e.g., `feat(schedule): add overlap detection`).
- PRs: Small, focused changes. Include description, linked issues, and screenshots/GIFs for UI changes. Note security/privacy impacts when relevant.
- Before opening: run `npm test`, `npm run build`, and `npm run security:check`.

## Security & Configuration Tips
- Never commit secrets. Use `npm run dev:config` and Firebase emulators for local work.
- Respect privacy modules (`privacyManager`, `FriendshipPrivacyService`)—follow existing patterns for data access and listeners.
