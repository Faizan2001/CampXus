# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development Environment
```bash
# Generate environment config from .env.local (required for development)
npm run dev:config

# Validate development setup
npm run dev:check

# Start development server with Firebase serving
npm run dev:serve

# Start Vite development server (for frontend development)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

### Testing
```bash
# Run all tests
npm test

# Run single test file
npm test src/js/tests/core/script.test.js

# Run tests in specific directory
npm test src/js/tests/firebase/
```

### Firebase Development
```bash
# Start Firebase emulators for local development
npm run firebase:emulators

# Serve app using Firebase hosting (recommended for development)
npm run firebase:serve

# Deploy to Firebase hosting
npm run firebase:deploy
```

### Security & Auditing
```bash
# Run security audit
npm run security:audit

# Fix security vulnerabilities
npm run security:fix

# Check security with audit-ci
npm run security:check
```

## Architecture Overview

### Single Page Application (SPA) Structure
CampXus is built as a modern SPA with a custom router system:

- **Entry Point**: `index.html` serves as the shell, all content is dynamically loaded
- **SPA Router** (`src/js/core/spa-router.js`): Handles client-side navigation without page reloads
- **SPA Initialization** (`src/js/core/spa-init.js`): Bootstraps the entire application, imports all modules and CSS
- **Templates**: HTML fragments in `/public/templates/` loaded dynamically by the router

### Authentication & Data Flow
The app uses Firebase Authentication with university email validation:

1. **Authentication Manager** (`src/js/firebase/auth/auth-manager.js`): Handles all Firebase auth operations
2. **University Validator** (`src/js/firebase/auth/university-validator.js`): Validates university email domains
3. **Current User State** (`src/js/core/currentUser.js`): Global user state management
4. **Data Manager** (`src/js/core/data-manager.js`): Handles Firestore operations and data persistence

### Module System & Dependencies
The codebase uses ES6 modules with careful dependency management:

- **Core Modules**: Located in `src/js/core/` - foundation functionality
- **Firebase Integration**: Located in `src/js/firebase/` - authentication and database
- **Friends System**: Located in `src/js/core/friends/` - social features with real-time updates
- **Real-Time System**: Real-time event coordination and notifications
- **Development Tools**: Located in `src/js/dev-tools/` - environment setup utilities
- **Security Layer**: Located in `src/js/security/` - privacy and security management

### State Management
The application uses a centralized state pattern:

- **Main App State**: Managed in `src/js/core/script.js` with exported getState() function
- **User Authentication State**: Managed by AuthManager with event listeners
- **Friends/Social State**: Managed by dedicated friends modules with real-time updates
- **Real-Time Data**: Managed by `realtime-manager.js` with event-driven architecture
- **Notifications**: Managed by `notification-manager.js` for toast notifications
- **Local Storage**: Used for persistence with Firebase cloud sync

### CSS Architecture
Modular CSS system with specialized stylesheets:

- `variables.css`: Design system & CSS custom properties
- `layout.css`: SPA structure & navigation
- `components.css`: Reusable UI components with glassmorphism + notification system
- `schedule.css`: Schedule grid & time slot interactions
- `friends-page.css`: Friends system styling with real-time updates
- All CSS is imported through `spa-init.js` for proper bundling

## Development Environment Setup

### Required Environment Variables (.env.local)
```
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

### Auto-Generated Files (DO NOT EDIT)
- `src/js/firebase/config/env-config.js`: Browser-compatible config generated from .env.local
- Files in `dist/`: Build output from Vite

### Development Workflow
1. Set up `.env.local` with Firebase credentials
2. Run `npm run dev:config` to generate browser config
3. Use `npm run dev:serve` for full Firebase integration
4. Use `npm run dev` for faster frontend-only development

## Testing Configuration

### Jest Setup
The project uses Jest with ESM support and custom configuration:

- **Test Environment**: jsdom for DOM testing
- **Module Mapping**: CSS imports mocked with identity-obj-proxy
- **Mocks**: `__mocks__/spa-init.js` prevents CSS imports during testing
- **Setup File**: `jest.setup.js` provides global mocks and DOM elements

### Test Structure
- `src/js/tests/core/`: Tests for core application logic
- `src/js/tests/firebase/`: Tests for Firebase integration
- `src/js/tests/__mocks__/spa-init.mock.js`: Mock file to prevent CSS imports during testing
- Tests run with `NODE_OPTIONS=--experimental-vm-modules` for ESM support

### Common Test Issues
- CSS import errors: Fixed with moduleNameMapper for absolute paths (`^/src/.*\.(css|scss|sass)$`)
- SPA module imports: Mocked via `^.*/spa-init\.js$` pattern to prevent CSS loading
- Async teardown issues: Handled with `forceExit: true` and cleanup functions

## Firebase Integration

### Authentication Flow
1. University email validation using domain patterns
2. Firebase Authentication with email/password
3. Email verification required before full access
4. Profile setup process with avatar customization

### Firestore Database
- User profiles stored with university validation
- Schedule data synchronized across devices
- Friends/social connections with real-time updates
- Friend requests with instant notifications
- Real-time listeners for live data synchronization

### Security Rules
Located in `firestore.rules` - university-only access with proper authentication checks

## Key Architectural Patterns

### SPA Navigation
- Use `navigateTo(route)` function for programmatic navigation
- Add `data-spa-route="route-name"` to links for automatic routing
- Templates loaded dynamically with proper cleanup

### Error Handling
- Custom error classes: `AuthError`, `ValidationError`
- Centralized error handling in auth operations
- User-friendly error messages with technical logging

### Module Communication
- Event-driven architecture for loose coupling
- Real-time event system with publish/subscribe pattern
- State managers with observer patterns
- Careful import/export to avoid circular dependencies
- Memory management with proper cleanup for real-time listeners

### Performance Considerations
- DOM element caching in `domElements.js`
- Lazy loading of modules through dynamic imports
- CSS and JS bundling through Vite for production

## Adding New Features

### New SPA Pages
1. Create template in `/public/templates/your-page.html`
2. Add route configuration in `spa-router.js`
3. Add navigation links with `data-spa-route="your-page"`
4. Import any required CSS/JS in `spa-init.js`

### Schedule Features
- Core logic in `src/js/core/script.js`
- UI updates in templates, specifically `home.html`
- Styling in `src/css/schedule.css`

### Authentication Features
- Extend `auth-manager.js` for new auth operations
- Update `university-validator.js` for new domain patterns
- Modify `profile-setup.js` for additional profile fields

### Firebase Operations
- Add new operations to `data-manager.js`
- Update Firestore security rules as needed
- Test with Firebase emulators first

### Friends System Features
- Core logic in `src/js/core/friends/friends-manager.js`
- UI components in `src/js/core/friends/friends-ui.js`
- Real-time updates via `src/js/core/realtime-manager.js`
- Toast notifications via `src/js/core/notification-manager.js`
- Styling in `src/css/friends-page.css`

### Real-Time System
- **Data Layer**: `listenToPendingFriendRequests()`, `listenToUserFriendships()`, `listenToUserProfile()` in `data-manager.js`
- **Event Coordination**: `realtime-manager.js` with publish/subscribe pattern
- **Memory Management**: Automatic cleanup of listeners to prevent memory leaks
- **Fallback Systems**: Manual data fetching when real-time fails
- **Debug Tools**: `debug-helpers.js` with console commands for testing

## Code Style Guidelines

### JavaScript
- Use ES6+ features consistently (const/let, arrow functions, async/await)
- Follow modular architecture with clear imports/exports
- Include JSDoc comments for complex functions
- Handle errors explicitly with try-catch blocks

### CSS
- Use CSS custom properties for consistent theming
- Follow BEM methodology for class naming
- Responsive design with mobile-first approach
- Leverage CSS Grid and Flexbox appropriately

### HTML
- Semantic HTML5 elements
- Accessibility attributes (ARIA labels, alt text)
- Progressive enhancement principles

## Security Considerations

### Environment Security
- Never commit `.env.local` or `env-config.js`
- Firebase API keys are safe in client code (protected by security rules)
- Use HTTPS in production (enforced by hosting config)

### User Data Protection
- University email validation prevents unauthorized access
- Firestore security rules enforce authentication
- Privacy controls in `privacy-manager.js`

### Development Security
- Regular security audits with `npm run security:audit`
- Content Security Policy headers in hosting config
- Input validation for all user-provided data

## Common Pitfalls

### Development Issues
- Always run `npm run dev:config` after changing `.env.local`
- Use `npm run dev:serve` for full Firebase integration testing
- Check browser console for module import errors

### Real-Time System Debugging
- Use `debug.help()` in browser console for available commands
- Test notifications with `debug.testNotification()`
- Check system status with `debug.status()`
- Monitor real-time events with `realTimeManager.getStatus()`
- Force cleanup with `realTimeManager.cleanup()`

### SPA Navigation
- Don't use traditional `<a href>` links - use `data-spa-route` or `navigateTo()`
- Always clean up event listeners when navigating between pages
- Test browser back/forward button functionality

### Firebase Authentication
- Handle authentication state changes with listeners
- Check if user is authenticated before accessing protected features
- Implement proper loading states during auth operations

### CSS and Styling
- Import CSS through `spa-init.js`, not individual HTML templates
- Use absolute paths for assets (`/src/css/` not `../css/`)
- Test both development and production builds for styling consistency

## Useful Files for Reference

- `README.md`: Complete project overview and setup instructions
- `/Phases/`: Step-by-step learning guides for different development phases
- `/.md files/`: Detailed documentation including UI maps and SPA development guides
- `src/js/dev-tools/firebase-dev-tools-README.md`: Firebase development setup guide