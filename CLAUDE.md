# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development Environment

```bash
# Generate environment config from .env.local (required for development)
npm run dev:config

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

## Database Architecture & Structure

### Database Design Philosophy

CampXus follows **industry-standard Firebase best practices** for real-time social applications. The database structure is designed for:

- **University-focused social features** (classmate discovery, friend requests)
- **Real-time updates** (instant notifications, live data sync)
- **Scalable architecture** (supports cross-university features)
- **Performance optimization** (efficient queries, data caching)

### Core Collections Structure

```
📦 Firestore Database
├── 👥 users/           # User profiles and data
├── 🏫 universities/    # University metadata
├── 📩 friendRequests/  # Friend request management
└── 🤝 friendships/     # Active friendship connections
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
  lastInteraction: timestamp            // Last interaction between friends
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
- Avatar rendering via `avatarManager.generateAvatarUrl()` from `src/js/core/avatars.js`
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
- `FRIENDS-SYSTEM-LIFECYCLE.md`: Comprehensive technical documentation of the complete friends system lifecycle (145 lines)
- `/Phases/`: Step-by-step learning guides for different development phases
- `/.md files/`: Detailed documentation including UI maps and SPA development guides
- `src/js/dev-tools/firebase-dev-tools-README.md`: Firebase development setup guide

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
