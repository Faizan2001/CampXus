# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CampXus (MeetchuThere) is a real-time social scheduling platform for university students, built as a Single Page Application using vanilla JavaScript ES6+ modules, Firebase (Auth + Firestore), and Vite.

**Core Features:**
- Paste-to-import schedule text with automatic course detection
- Real-time friends system with bilateral privacy controls
- Campus presence sharing with adaptive GPS/network detection
- Offline-first architecture with dual storage (Firestore + localStorage)

## Development Commands

```bash
# Development
npm run dev:config         # Generate window.ENV config from .env.local (required before first run)
npm run dev                # Start Vite dev server with host binding (default: localhost:5173)
npm run dev:check          # Validate Firebase/dev setup
npm run dev:serve          # Start with Firebase integration (alternative to npm run dev)

# Testing
npm test                   # Run Jest test suites (jsdom environment)

# Build & Preview
npm run build              # Production build with Vite (generates sitemap, bundles assets)
npm run preview            # Preview production build locally (port 4173)

# Firebase
npm run firebase:emulators # Start local Firebase emulators
npm run firebase:serve     # Serve with Firebase hosting
npm run firebase:deploy    # Deploy to production

# Security
npm run security:audit     # Run npm audit for vulnerabilities
npm run security:fix       # Auto-fix security issues
npm run security:check     # CI-friendly audit check

# SEO
npm run seo:sitemap        # Generate sitemap (auto-run during build)
```

## Architecture & Key Patterns

### SPA Router & Navigation
- **Entry Point:** [index.html](index.html) → [src/js/app.js](src/js/app.js) → [src/js/router/Router.js](src/js/router/Router.js)
- **Flow:** `app.js` bootstraps the app, awaits `authManager.authReady`, then initializes `Router` to render templates from [public/templates/](public/templates/) into `.main-content`
- **Page Controllers:** [src/js/pages/](src/js/pages/) coordinate features per view (HomePage, FriendsPage, NotificationsPage, etc.)
- **Authentication Gates:** Routes marked `requiresAuth: true` redirect to landing if not logged in; profile completion gate enforces setup before accessing protected routes

### State Management
- **User Store:** [src/js/store/userStore.js](src/js/store/userStore.js) holds lightweight client state (currentUser, profile)
- **Transient State:** Keep view-specific state inside components/pages, not in global store
- **Profile Hydration:** [src/js/cache/profileCache.js](src/js/cache/profileCache.js) uses stale-while-revalidate strategy for instant UI fill before auth resolves

### Data Layer & Services
- **Domain Logic:** Lives in [src/js/services/](src/js/services/) (schedule, friends, location, auth, realtime, ui, analytics)
  - `ScheduleStorageService`: Dual storage (Firestore + localStorage) with sync
  - `ScheduleImportService`: Paste-to-import text parsing via `UniversityParser`
  - `FriendsService` + `FriendshipPrivacyService`: Bilateral schedule/location visibility
  - `CampusLocationService` + `LocationIntegration`: Adaptive GPS/network detection with circuit breaker patterns
  - `RealtimeService` + `NotificationService`: Firebase listeners with memory-efficient cleanup
- **Data Access:** [src/js/services/data/DataService.js](src/js/services/data/DataService.js) centralizes Firestore operations

### Privacy & Security
- **Privacy Manager:** [src/js/lib/security/privacyManager.js](src/js/lib/security/privacyManager.js) + `FriendshipPrivacyService` enforce bilateral controls
- **Firestore Rules:** [firestore.rules](firestore.rules) enforce server-side validation (handle uniqueness, friendship privacy, dev email gating)
- **Configuration:** Runtime config injected to `window.ENV` via `npm run dev:config` from `.env.local`; never hardcode secrets

### Realtime & Listeners
- **Listener Lifecycle:** Create listeners in pages/components, clean up in `spa:page:unload` events to prevent memory leaks
- **Listener Detective:** [src/js/core/firestore/dev-tools/MemoryLeakDetective.js](src/js/core/firestore/dev-tools/MemoryLeakDetective.js) tracks active listeners in dev mode
- **Pattern:** Always call `unsubscribe()` or `cleanup()` for Firebase listeners when leaving a page/unmounting a component

### Presentation Layer
- **Components:** Reusable UI pieces in [src/js/components/](src/js/components/) (forms, friends, modals, navigation, presence, schedule)
- **CSS:** Modular stylesheets in [src/css/](src/css/) (kebab-case filenames), imported via `app.js` for Vite bundling
- **Templates:** HTML fragments in [public/templates/](public/templates/) (landing, home, profile, friends, notifications, about)

### Logging & Debugging
- **Log Manager:** [src/js/utils/debug/LogManager.js](src/js/utils/debug/LogManager.js) for structured logs (categories: system, auth, location, presence, dev, etc.)
- **Log Profiles:** Control verbosity via `?logs=debug|info|location|presence|critical|quiet` or `localStorage.setItem('meetchuthere:logProfile', 'debug')`
- **Dev Tools:** [src/js/core/firestore/dev-tools/](src/js/core/firestore/dev-tools/) contains environment config generation, dev setup checker, memory leak detective

### Build & Bundling
- **Vite:** [vite.config.js](vite.config.js) handles ES module bundling, code splitting (Firebase chunked separately), asset hashing
- **Production:** `npm run build` drops console/debugger, generates sitemap, bundles CSS/JS with content hashes
- **Preview Mode:** `npm run preview` serves built files locally (port 4173); CSS is already bundled, skip dynamic CSS loading

## Coding Conventions

### Naming
- **Files:** PascalCase for pages/services (`ScheduleImportService.js`), camelCase for utilities (`timeUtils.js`), kebab-case for CSS
- **Variables:** camelCase for local/module-level, SCREAMING_SNAKE_CASE for constants
- **Classes:** PascalCase (SPARouter, ScheduleStorageService)

### ES6 Modules
- **Imports:** Use relative paths within `src/js/`; absolute paths from root for Vite resolution (e.g., `/src/css/styles.css`)
- **Exports:** Prefer named exports for utilities, default export for classes/main entities
- **Lazy Loading:** Use dynamic imports `import('/path/to/module.js')` for code splitting in Router and large services

### Code Style
- **Indentation:** 2 spaces (consistent with existing files)
- **Semicolons:** Use consistently (project convention)
- **String Quotes:** Prefer double quotes for consistency, template literals for interpolation
- **Comments:** Use `//` for single-line, `/* */` for multi-line; `🎯 Learning:` for educational comments, `🔧`, `🛡️`, `🚀` for fixes/security/performance

## Testing Guidelines

### Framework
- **Jest + jsdom:** Setup in [jest.setup.js](jest.setup.js) (mocks localStorage, matchMedia, window.ENV, clipboard, SPA DOM elements)
- **Test Location:** [src/js/tests/](src/js/tests/) with `*.test.js` naming
- **Structure:** Tests organized under `core/`, `services/`, `firebase/` with `__mocks__/` for SPA init

### Running Tests
```bash
npm test                   # Run all tests
npm test -- --watch        # Watch mode
npm test -- path/to/file   # Run specific test file
```

### Best Practices
- **Isolation:** Keep tests independent; use provided mocks instead of network access
- **Coverage Focus:** Prioritize core logic (utils, services, router); no strict threshold enforced
- **Async/Await:** Use async/await for async operations; avoid `done()` callback pattern
- **Cleanup:** Clear timers, listeners, and DOM state in `afterEach` to prevent leaks

## Git & Commit Guidelines

### Commit Messages
- **Format:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
- **Scope:** Use parentheses for scope, e.g., `feat(schedule): add overlap detection`
- **Style:** Imperative mood ("add feature" not "added feature"), 72 char max for subject
- **Examples:**
  - `feat(presence): adaptive location detection with circuit breaker`
  - `fix(router): prevent navigation loops during profile gate`
  - `refactor(friends): extract bilateral privacy logic to service`

### Pull Requests
- **Size:** Small, focused changes (single feature or bug fix)
- **Description:** Include context, linked issues, screenshots/GIFs for UI changes
- **Security/Privacy:** Note impacts when modifying privacy controls or security rules
- **Pre-Submit Checklist:**
  1. `npm test` passes
  2. `npm run build` succeeds
  3. `npm run security:check` passes
  4. Manual testing in dev environment

## Common Patterns & Gotchas

### 1. Listener Cleanup Pattern
```javascript
// In page controller or component
let unsubscribe = null;

function initPage() {
  unsubscribe = realtimeService.subscribe(/* ... */);
}

// Listen for page unload
document.addEventListener('spa:page:unload', (event) => {
  if (event.detail.route === 'home' && unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
});
```

### 2. Privacy-Aware Data Access
```javascript
// Always check privacy before reading friend schedules
const canView = await friendshipPrivacyService.canViewSchedule(friendId);
if (!canView) {
  // Show privacy indicator, not schedule data
}
```

### 3. Dual Storage Sync
```javascript
// ScheduleStorageService handles sync automatically
await scheduleStorageService.saveSchedule(userId, scheduleData);
// ↑ Writes to both Firestore and localStorage, handles offline queue
```

### 4. Authentication State Checks
```javascript
// Use Firebase auth as source of truth, not just store
const isAuthenticated = !!authManager?.auth?.currentUser;
// Store may be hydrated optimistically; always validate against Firebase
```

### 5. Router Navigation
```javascript
// Use router.navigateTo() for programmatic navigation
import { navigateTo } from '/src/js/app.js';
navigateTo('home'); // Not window.location.hash = '#home'
```

### 6. Window.ENV Configuration
```javascript
// Runtime config is injected by npm run dev:config
const apiKey = window.ENV.FIREBASE_API_KEY; // Not hardcoded
// Regenerate config after .env.local changes
```

### 7. Avoiding Full Document Loads in Templates
```javascript
// Router validates templates to prevent loading index.html instead of fragments
// If you see "full HTML document" errors, check that template file exists in public/templates/
```

## Security & Configuration

### Environment Setup
1. Create `.env.local` in project root with Firebase config:
   ```
   FIREBASE_API_KEY=your_api_key
   FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   FIREBASE_APP_ID=your_app_id
   ```
2. Run `npm run dev:config` to generate `src/js/lib/firebase/env-config.js`
3. Never commit secrets or generated config files

### Firestore Security
- **Rules:** [firestore.rules](firestore.rules) enforce server-side validation
- **Dev Accounts:** Use `*.dev@iub.edu.bd` emails during development (gated by `devAccountCreationEnabled` toggle)
- **Production:** Only verified university emails can create accounts
- **Privacy:** Schedule/location visibility enforced via bilateral privacy rules

### Reserved Handles
- Sync with `handleUtils.js` when modifying reserved handles: admin, system, support, root, null, undefined, iub

## Performance Tips

### 1. Lazy Load Heavy Services
```javascript
// Import location services only after auth and when needed
const { campusLocationService } = await import('./services/location/CampusLocationService.js');
```

### 2. Cache Profiles with SWR
```javascript
// profileCache.js uses stale-while-revalidate for instant UI
const hydrated = profileCache.tryHydrate(currentUser, authManager?.auth);
```

### 3. Debounce Location Updates
```javascript
// LocationScheduler handles debouncing automatically; avoid manual location fetches
locationScheduler.start(); // Manages intervals intelligently
```

### 4. Circuit Breaker for GPS
```javascript
// CampusLocationService uses circuit breaker to prevent excessive GPS calls
// Fallback to network detection when GPS fails repeatedly
```

## Important Files Reference

- **SPA Initialization:** [src/js/app.js](src/js/app.js)
- **Routing Logic:** [src/js/router/Router.js](src/js/router/Router.js)
- **Authentication:** [src/js/services/auth/AuthService.js](src/js/services/auth/AuthService.js)
- **User State:** [src/js/store/userStore.js](src/js/store/userStore.js)
- **Data Layer:** [src/js/services/data/DataService.js](src/js/services/data/DataService.js)
- **Privacy Controls:** [src/js/services/friends/FriendshipPrivacyService.js](src/js/services/friends/FriendshipPrivacyService.js)
- **Schedule Import:** [src/js/services/schedule/ScheduleImportService.js](src/js/services/schedule/ScheduleImportService.js)
- **Campus Presence:** [src/js/services/location/CampusLocationService.js](src/js/services/location/CampusLocationService.js)
- **Logging:** [src/js/utils/debug/LogManager.js](src/js/utils/debug/LogManager.js)
- **Firestore Rules:** [firestore.rules](firestore.rules)
- **Build Config:** [vite.config.js](vite.config.js)
- **Test Setup:** [jest.setup.js](jest.setup.js)

## Additional Resources

- **Implementation Plans:** [CAMPUS_PRESENCE_IMPLEMENTATION_PLAN.md](CAMPUS_PRESENCE_IMPLEMENTATION_PLAN.md) for campus presence feature
- **Repository Guidelines:** [AGENTS.md](AGENTS.md) contains additional coding conventions and architecture details