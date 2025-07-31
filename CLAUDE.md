# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development Environment

```bash
# Generate environment config from .env.local (REQUIRED before development)
npm run dev:config

# Check development setup status
npm run dev:check

# Start Vite development server (for frontend-only development)
npm run dev

# Serve app using Firebase hosting (RECOMMENDED for full development)
npm run dev:serve

# Build for production
npm run build

# Preview production build locally
npm run preview
```

### Testing

```bash
# Run all tests with ESM support
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
- **App Bootstrap**: `src/js/app.js` initializes the SPA and imports all required modules
- **SPA Router**: `src/js/router/Router.js` handles client-side navigation without page reloads
- **Templates**: HTML fragments in `/public/templates/` loaded dynamically by the router
- **Pages**: Dedicated page handlers in `src/js/pages/` (HomePage.js, FriendsPage.js)

### Authentication & Data Flow

The app uses Firebase Authentication with university email validation:

1. **Authentication Service** (`src/js/services/auth/AuthService.js`): Handles all Firebase auth operations
2. **University Validator** (`src/js/services/auth/UniversityValidator.js`): Validates university email domains
3. **User Store** (`src/js/store/userStore.js`): Centralized user state management
4. **Data Service** (`src/js/services/data/DataService.js`): Handles Firestore operations and data persistence

### Module System & Dependencies

The codebase uses ES6 modules with careful dependency management:

- **Services**: Located in `src/js/services/` - business logic and external integrations
  - `auth/` - Authentication and university validation
  - `data/` - Firestore operations and data management
  - `friends/` - Social features and friendship management
  - `realtime/` - Real-time updates and notifications
  - `schedule/` - Schedule management and OCR processing
- **Components**: Located in `src/js/components/` - reusable UI components
- **Pages**: Located in `src/js/pages/` - page-specific handlers
- **Store**: Located in `src/js/store/` - state management
- **Utils**: Located in `src/js/utils/` - helper functions and utilities
- **Development Tools**: Located in `src/js/dev-tools/` - environment setup utilities

### State Management

The application uses a centralized state pattern:

- **User State**: Managed in `src/js/store/userStore.js` with centralized CurrentUserManager
- **Authentication State**: Managed by AuthService with auth state listeners
- **Friends/Social State**: Managed by FriendsService with real-time updates
- **Real-Time Events**: Managed by RealtimeService with event-driven architecture
- **Notifications**: Managed by NotificationService for toast notifications
- **Schedule Data**: Dual storage with Firestore primary + localStorage cache

### CSS Architecture

Modular CSS system with specialized stylesheets:

- `variables.css`: Design system & CSS custom properties
- `layout.css`: SPA structure & navigation
- `components.css`: Reusable UI components with glassmorphism + notification system
- `schedule.css`: Schedule grid & time slot interactions
- `friends-page.css`: Friends system styling with real-time updates
- `profile-setup.css`: Profile setup and avatar customization
- `auth.css`: Authentication modal glassmorphism styling
- `modal.css`: Modal dialogs and overlay styles
- `animations.css`: Transitions, hover effects, and motion
- All CSS is imported through `src/css/styles.css` for proper bundling

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

- `src/js/lib/firebase/env-config.js`: Browser-compatible config generated from .env.local
- Files in `dist/`: Build output from Vite

### Development Workflow

1. Set up `.env.local` with Firebase credentials
2. Run `npm run dev:config` to generate browser config
3. Use `npm run dev:serve` for full Firebase integration (recommended)
4. Use `npm run dev` for faster frontend-only development

### Build System (Vite)

The project uses Vite with optimized configuration in `vite.config.js`:

- **Code Splitting**: Firebase modules split into separate chunk for better caching
- **Asset Organization**: Images, CSS, and JS assets organized with hash naming
- **Source Maps**: Generated for production debugging
- **SPA Support**: `_redirects` file copied to `dist/` for proper routing

## Testing Configuration

### Jest Setup

The project uses Jest with ESM support and custom configuration:

- **Test Environment**: jsdom for DOM testing
- **Module Mapping**: CSS imports mocked with identity-obj-proxy
- **Mocks**: `__mocks__/spa-init.mock.js` prevents CSS imports during testing
- **Setup File**: `jest.setup.js` provides global mocks and DOM elements
- **ESM Support**: Tests run with `NODE_OPTIONS=--experimental-vm-modules`

### Test Structure

- `src/js/tests/core/`: Tests for core application logic
- `src/js/tests/firebase/`: Tests for Firebase integration  
- `src/js/tests/services/`: Tests for service layer (OCR, schedule import)
- `src/js/tests/__mocks__/spa-init.mock.js`: Mock file to prevent CSS imports during testing

### Jest Configuration Details

The Jest configuration in `package.json` includes:

```javascript
{
  "testEnvironment": "jsdom",
  "setupFilesAfterEnv": ["./jest.setup.js"],
  "testMatch": ["**/src/js/tests/**/*.test.js"],
  "transformIgnorePatterns": ["node_modules/(?!(firebase|@firebase)/)"],
  "moduleNameMapper": {
    "^firebase/(.*)$": "<rootDir>/node_modules/firebase/$1",
    "^/src/css/styles\\.css$": "identity-obj-proxy",
    "^/src/.*\\.(css|scss|sass)$": "identity-obj-proxy",
    "^.+\\.(css|scss|sass)$": "identity-obj-proxy",
    "^.*/spa-init\\.js$": "<rootDir>/src/js/tests/__mocks__/spa-init.mock.js",
    "^.*/app\\.js$": "<rootDir>/src/js/tests/__mocks__/spa-init.mock.js"
  },
  "testTimeout": 10000,
  "maxWorkers": 1,
  "forceExit": true
}
```

### Common Test Issues

- CSS import errors: Fixed with moduleNameMapper for absolute paths
- SPA module imports: Mocked via pattern matching to prevent CSS loading
- Firebase modules: Properly transformed with transformIgnorePatterns
- Async teardown issues: Handled with `forceExit: true` and cleanup functions

## Firebase Integration

### Configuration Files

- **Main Config**: `src/js/lib/firebase/firebase-config.js` - Firebase app initialization
- **Environment Config**: `src/js/lib/firebase/env-config.js` - Auto-generated from .env.local
- **Production Config**: `src/js/lib/firebase/firebase-config-production.js` - Production overrides

### Authentication Flow

1. University email validation using domain patterns in UniversityValidator
2. Firebase Authentication with email/password
3. Email verification required before full access
4. Profile setup process with DiceBear avatar customization

### Firestore Database

- **Collections**: `users/`, `friendRequests/`, `friendships/`
- User profiles with structured 5-section organization (profile, universityInfo, avatarConfig, systemInfo, socialInfo)
- Schedule data stored within user documents with privacy controls
- Friends system with bilateral privacy controls for schedule visibility
- Real-time listeners for live data synchronization

### Security Rules

Located in `firestore.rules` with comprehensive access controls:
- University-only access with proper authentication checks
- Bilateral privacy system for friend schedule access
- Read permissions based on friendship status and privacy settings

## Database Architecture & Structure

### Database Design Philosophy

CampXus follows **industry-standard Firebase best practices** for real-time social applications. The database structure is designed for:

- **University-focused social features** (classmate discovery, friend requests)
- **Real-time updates** (instant notifications, live data sync)
- **Scalable architecture** (supports cross-university features)
- **Performance optimization** (efficient queries, data caching)
- **Bilateral privacy controls** (friendship-centric privacy system)

### Core Collections Structure

```
📦 Firestore Database
├── 👥 users/           # User profiles and data
├── 🏫 universities/    # University metadata
├── 📩 friendRequests/  # Friend request management
└── 🤝 friendships/     # Active friendship connections with bilateral privacy
```

### User Document Structure (Industry Standard)

Each user document follows a **5-section organized structure** that perfectly matches Firebase best practices:

```javascript
{
  // 👤 Personal Profile (grouped identity data)
  profile: {
    displayName: "Rollie",
    displayName_lower: "rollie",        // Search optimization
    email: "student@iub.edu.bd",
    firstName: "Rollie",
    firstName_lower: "rollie",          // Search optimization
    lastName: "Mcklean",
    lastName_lower: "mcklean",          // Search optimization
    major: "CSE",
    major_lower: "cse",                 // Search optimization
    startingYear: "2021",
    studentId: "1111.dev",
    bio: "Love coding and building awesome apps!"
  },

  // 🏫 University Information (institutional data)
  universityInfo: {
    university: "iub",                  // Short code
    universityName: "Independent University, Bangladesh",
    studentId: "1111.dev"               // University-specific ID
  },

  // 🎨 Avatar Configuration (visual identity)
  // NOTE: Flexible structure for DiceBear API - different styles have different options
  avatarConfig: {
    style: "miniavs",                   // Avatar style system
    seed: "mi5m6st0xf",                 // Unique seed for generation
    options: {
      // Dynamic fields based on DiceBear style
      backgroundColor: "c0aede,ffd93d", // Example: Gradient colors
      backgroundType: "gradientLinear", // Example: Background style
      hair: "curly",                    // Example: Hair style (style-specific)
      // ... other style-specific options
    }
  },

  // ⚙️ System Information (app metadata)
  systemInfo: {
    uid: "NdLNgYHbg4XoECtUiEjXm9W13xy1",
    profileSetupComplete: true,
    status: "offline",                  // "online" | "offline"
    lastActive: timestamp,
    createdAt: timestamp,
    lastUpdated: timestamp
  },

  // 🤝 Social Information (friends & privacy)
  socialInfo: {
    friendsCount: 0,                    // number - Current friends count
    pendingRequestsCount: 0,            // number - Incoming requests
    privacy: "university",              // string - "university" | "public"
    searchable: true,                   // boolean - Can be found in search
    lastFriendActivity: timestamp       // timestamp - Last social interaction
  }
}
```

### Friend Requests Structure (Real-time Optimized)

```javascript
{
  // Core request data
  fromUserId: "sender-uid",
  toUserId: "recipient-uid",
  status: "pending",                    // "pending" | "accepted" | "rejected"

  // Cached sender info (performance optimization)
  fromUserInfo: {
    displayName: "John Doe",
    major: "Computer Science",
    university: "iub",
    avatarConfig: { /* Flexible DiceBear structure */ }
  },

  // Cached recipient info (for notifications)
  toUserInfo: {
    displayName: "Jane Smith",
    major: "Business Administration",
    university: "iub",
    avatarConfig: { /* Flexible DiceBear structure */ }
  },

  // Timestamps
  createdAt: timestamp,                 // When request was sent
  respondedAt: null                     // When request was responded to
}
```

### Friendships Structure (Bi-directional Optimized)

```javascript
{
  // Bi-directional relationship data
  users: ["user1-uid", "user2-uid"],    // Array for efficient querying
  user1Id: "user1-uid",                 // Direct reference
  user2Id: "user2-uid",                 // Direct reference

  // Cached user info (eliminates extra queries)
  user1Info: {
    displayName: "John Doe",
    major: "Computer Science",
    avatarConfig: { /* Flexible DiceBear structure */ }
  },
  user2Info: {
    displayName: "Jane Smith",
    major: "Business Administration",
    avatarConfig: { /* Flexible DiceBear structure */ }
  },

  // Relationship metadata
  createdAt: timestamp,                 // When friendship was created
  mutualFriends: 0,                     // number - Count of mutual friends
  lastInteraction: timestamp,           // Last interaction between friends

  // 🔐 Bilateral Privacy Controls (2025 Enhancement)
  scheduleVisibility: {
    "user1-uid": true,                  // User1's schedule IS visible to User2
    "user2-uid": false                  // User2's schedule IS NOT visible to User1
  },
  
  privacyMetadata: {
    lastPrivacyUpdate: timestamp,       // When privacy was last modified
    privacyUpdatedBy: "user1-uid",      // Which user made the last change
    privacyVersion: 2                   // Privacy schema version for migrations
  }
}
```

### Database Query Patterns

The structure supports efficient real-time queries:

```javascript
// Find classmates at your university
const classmates = query(
  collection(db, "users"),
  where("universityInfo.university", "==", "iub"),
  where("profile.major", "==", "Computer Science"),
  where("socialInfo.searchable", "==", true)
);

// Get pending friend requests (real-time)
const pendingRequests = query(
  collection(db, "friendRequests"),
  where("toUserId", "==", currentUserId),
  where("status", "==", "pending"),
  orderBy("createdAt", "desc")
);

// Get friends list (bi-directional)
const myFriends = query(
  collection(db, "friendships"),
  where("users", "array-contains", currentUserId)
);
```

### Performance Optimizations

1. **Data Caching**: User info cached in friend requests and friendships
2. **Search Optimization**: `_lower` fields for case-insensitive search
3. **Bi-directional Queries**: `users` array enables efficient friendship queries
4. **Real-time Listeners**: `onSnapshot()` for instant updates

### Database Architecture Benefits

- **✅ Industry Standard**: Follows Firebase best practices for social apps
- **✅ Real-time Ready**: Optimized for instant notifications and live updates
- **✅ Scalable**: Supports university-wide and cross-university features
- **✅ Performance**: Efficient queries with minimal database reads
- **✅ Future-proof**: Extensible for mutual friends, messaging, etc.

### Friend Request Lifecycle (Logical Data Management)

Friend requests follow a clean, logical lifecycle:

1. **📩 Pending Requests** → Stored in `friendRequests/` collection
2. **✅ Accepted Requests** → Move to `friendships/` collection, **delete** from `friendRequests/`
3. **❌ Rejected Requests** → **Delete** from `friendRequests/` (no permanent storage needed)

This approach:

- ✅ **Reduces database clutter** - No "accepted" or "rejected" requests lingering around
- ✅ **Improves query performance** - Smaller `friendRequests/` collection with only active requests
- ✅ **Follows logical data lifecycle** - Requests are temporary, friendships are permanent
- ✅ **Prevents data confusion** - Clear separation between active requests and established friendships

```javascript
// ✅ Accept Request: Create friendship + Delete request
async function acceptFriendRequest(requestId, requestData) {
  // 1. Create friendship document
  await createFriendship(friendshipData);

  // 2. Delete the friend request (cleanup)
  await deleteFriendRequest(requestId);
}

// ❌ Reject Request: Simply delete request
async function rejectFriendRequest(requestId) {
  // Just delete - no friendship created
  await deleteFriendRequest(requestId);
}
```

This structure perfectly supports real-time friend requests, friendships, mutual friends discovery, and unfriending features while maintaining excellent performance and scalability.

## Key Architectural Patterns

### SPA Navigation

- Use router's `navigateTo(route)` method for programmatic navigation
- Add `data-spa-route="route-name"` to links for automatic routing
- Templates loaded dynamically from `/public/templates/` with proper cleanup
- Route authentication checks for protected pages (friends page requires auth)

### Error Handling

- Custom error classes: `AuthError`, `ValidationError` in AuthService
- Centralized error handling with user-friendly messages
- NotificationService for toast notifications
- Comprehensive error boundaries in Router with offline detection

### Module Communication

- Service-based architecture with clear separation of concerns
- Real-time event system via RealtimeService with publish/subscribe pattern
- Centralized state management via userStore
- Careful ES6 module imports to avoid circular dependencies
- Memory management with proper cleanup for real-time listeners

### Performance Considerations

- DOM element caching in `src/js/utils/dom/domElements.js`
- CSS and JS code splitting through Vite configuration
- Smart caching for search results and friend data (5-minute TTL)
- Optimized Firestore queries with indexed fields

## Adding New Features

### New SPA Pages

1. Create template in `/public/templates/your-page.html`
2. Add route configuration in `src/js/router/Router.js`
3. Create page handler in `src/js/pages/YourPage.js`
4. Add navigation links with `data-spa-route="your-page"`
5. Import page handler in `src/js/app.js`

### Schedule Features

- Core logic in `src/js/pages/HomePage.js`
- Service layer in `src/js/services/schedule/`
- UI updates in `/public/templates/home.html`
- Styling in `src/css/schedule.css`

### Authentication Features

- Extend `src/js/services/auth/AuthService.js` for new auth operations
- Update `src/js/services/auth/UniversityValidator.js` for new domain patterns
- Modify `src/js/components/forms/ProfileSetup.js` for additional profile fields

### Firebase Operations

- Add new operations to `src/js/services/data/DataService.js`
- Update Firestore security rules in `firestore.rules`
- Test with Firebase emulators first using `npm run firebase:emulators`

### Friends System Features

- Core logic in `src/js/services/friends/FriendsService.js`
- UI components in `src/js/pages/FriendsPage.js`
- Avatar rendering via `src/js/utils/avatar/avatarManager.js`
- Real-time updates via `src/js/services/realtime/RealtimeService.js`
- Toast notifications via `src/js/services/realtime/NotificationService.js`
- Styling in `src/css/friends-page.css`

### Real-Time System

- **Data Layer**: Real-time listeners in `src/js/services/data/DataService.js`
- **Event Coordination**: `src/js/services/realtime/RealtimeService.js` with publish/subscribe pattern
- **Memory Management**: Automatic cleanup of listeners to prevent memory leaks
- **Notifications**: `src/js/services/realtime/NotificationService.js` for user feedback
- **Debug Tools**: `src/js/utils/dev/debugHelpers.js` with console commands for testing

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
- Use `npm run dev:check` to verify development environment setup
- Use `npm run dev:serve` for full Firebase integration testing (recommended)
- Use `npm run dev` for faster frontend-only development
- Check browser console for module import errors

### Real-Time System Debugging

- Use debug helper functions in browser console for testing
- Test notifications via NotificationService
- Monitor real-time listeners and cleanup
- Check authentication state before real-time operations

### SPA Navigation

- Don't use traditional `<a href>` links - use `data-spa-route` attributes
- Router handles navigation with `navigateTo()` method
- Templates are loaded dynamically from `/public/templates/`
- Always test browser back/forward button functionality
- Protected routes (like friends) require authentication

### Firebase Authentication

- AuthService handles all authentication operations
- UniversityValidator ensures only university emails can register
- Proper auth state listeners prevent race conditions
- User profile setup required after initial registration

### CSS and Styling

- CSS is modularly organized and imported through `src/css/styles.css`
- Use absolute paths for assets (`/src/css/` not relative paths)
- Vite handles CSS bundling for both development and production
- Test responsive design across different screen sizes

## Useful Files for Reference

- `README.md`: Complete project overview and setup instructions
- `/Phases/`: Step-by-step learning guides for different development phases
- `/NEW-Plan/`: Phase-based development plan for schedule import system
- `src/js/dev-tools/firebase-dev-tools-README.md`: Firebase development setup guide
- `src/js/dev-tools/firebase-setup-guide.md`: Detailed Firebase configuration guide
- `vite.config.js`: Build configuration with manual chunks and asset optimization
- `firebase.json`: Firebase hosting and functions configuration
- `firestore.rules`: Database security rules with university-only access

# Using Gemini CLI for Large Codebase Analysis

When analyzing large codebases or multiple files that might exceed context limits, use the Gemini CLI with its massive
context window. Use `gemini -p` to leverage Google Gemini's large context capacity.

## File and Directory Inclusion Syntax

Use the `@` syntax to include files and directories in your Gemini prompts. The paths should be relative to WHERE you run the
gemini command:

### Examples:

**Single file analysis:**

````bash
gemini -p "@src/main.py Explain this file's purpose and structure"

Multiple files:
gemini -p "@package.json @src/index.js Analyze the dependencies used in the code"

Entire directory:
gemini -p "@src/ Summarize the architecture of this codebase"

Multiple directories:
gemini -p "@src/ @tests/ Analyze test coverage for the source code"

Current directory and subdirectories:
gemini -p "@./ Give me an overview of this entire project"

#
Or use --all_files flag:
gemini --all_files -p "Analyze the project structure and dependencies"

Implementation Verification Examples

Check if a feature is implemented:
gemini -p "@src/ @lib/ Has dark mode been implemented in this codebase? Show me the relevant files and functions"

Verify authentication implementation:
gemini -p "@src/ @middleware/ Is JWT authentication implemented? List all auth-related endpoints and middleware"

Check for specific patterns:
gemini -p "@src/ Are there any React hooks that handle WebSocket connections? List them with file paths"

Verify error handling:
gemini -p "@src/ @api/ Is proper error handling implemented for all API endpoints? Show examples of try-catch blocks"

Check for rate limiting:
gemini -p "@backend/ @middleware/ Is rate limiting implemented for the API? Show the implementation details"

Verify caching strategy:
gemini -p "@src/ @lib/ @services/ Is Redis caching implemented? List all cache-related functions and their usage"

Check for specific security measures:
gemini -p "@src/ @api/ Are SQL injection protections implemented? Show how user inputs are sanitized"

Verify test coverage for features:
gemini -p "@src/payment/ @tests/ Is the payment processing module fully tested? List all test cases"

When to Use Gemini CLI

Use gemini -p when:
- Analyzing entire codebases or large directories
- Comparing multiple large files
- Need to understand project-wide patterns or architecture
- Current context window is insufficient for the task
- Working with files totaling more than 100KB
- Verifying if specific features, patterns, or security measures are implemented
- Checking for the presence of certain coding patterns across the entire codebase

Important Notes

- Paths in @ syntax are relative to your current working directory when invoking gemini
- The CLI will include file contents directly in the context
- No need for --yolo flag for read-only analysis
- Gemini's context window can handle entire codebases that would overflow Claude's context
- When checking implementations, be specific about what you're looking for to get accurate results # Using Gemini CLI for Large Codebase Analysis


When analyzing large codebases or multiple files that might exceed context limits, use the Gemini CLI with its massive
context window. Use `gemini -p` to leverage Google Gemini's large context capacity.


## File and Directory Inclusion Syntax


Use the `@` syntax to include files and directories in your Gemini prompts. The paths should be relative to WHERE you run the
 gemini command:


### Examples:


**Single file analysis:**
```bash
gemini -p "@src/main.py Explain this file's purpose and structure"


Multiple files:
gemini -p "@package.json @src/index.js Analyze the dependencies used in the code"


Entire directory:
gemini -p "@src/ Summarize the architecture of this codebase"


Multiple directories:
gemini -p "@src/ @tests/ Analyze test coverage for the source code"


Current directory and subdirectories:
gemini -p "@./ Give me an overview of this entire project"
# Or use --all_files flag:
gemini --all_files -p "Analyze the project structure and dependencies"


Implementation Verification Examples


Check if a feature is implemented:
gemini -p "@src/ @lib/ Has dark mode been implemented in this codebase? Show me the relevant files and functions"


Verify authentication implementation:
gemini -p "@src/ @middleware/ Is JWT authentication implemented? List all auth-related endpoints and middleware"


Check for specific patterns:
gemini -p "@src/ Are there any React hooks that handle WebSocket connections? List them with file paths"


Verify error handling:
gemini -p "@src/ @api/ Is proper error handling implemented for all API endpoints? Show examples of try-catch blocks"


Check for rate limiting:
gemini -p "@backend/ @middleware/ Is rate limiting implemented for the API? Show the implementation details"


Verify caching strategy:
gemini -p "@src/ @lib/ @services/ Is Redis caching implemented? List all cache-related functions and their usage"


Check for specific security measures:
gemini -p "@src/ @api/ Are SQL injection protections implemented? Show how user inputs are sanitized"


Verify test coverage for features:
gemini -p "@src/payment/ @tests/ Is the payment processing module fully tested? List all test cases"


When to Use Gemini CLI


Use gemini -p when:
- Analyzing entire codebases or large directories
- Comparing multiple large files
- Need to understand project-wide patterns or architecture
- Current context window is insufficient for the task
- Working with files totaling more than 100KB
- Verifying if specific features, patterns, or security measures are implemented
- Checking for the presence of certain coding patterns across the entire codebase


Important Notes


- Paths in @ syntax are relative to your current working directory when invoking gemini
- The CLI will include file contents directly in the context
- No need for --yolo flag for read-only analysis
- Gemini's context window can handle entire codebases that would overflow Claude's context
- When checking implementations, be specific about what you're looking for to get accurate results
````
