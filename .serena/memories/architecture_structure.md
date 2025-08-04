# CampXus Architecture & Structure

## Single Page Application (SPA) Architecture

### Core SPA Components
- **Entry Point**: `index.html` serves as the shell, all content is dynamically loaded
- **App Bootstrap**: `src/js/app.js` initializes the SPA and imports all required modules
- **SPA Router**: `src/js/router/Router.js` handles client-side navigation without page reloads
- **Templates**: HTML fragments in `/public/templates/` loaded dynamically by the router
- **Pages**: Dedicated page handlers in `src/js/pages/` (HomePage.js, FriendsPage.js)

### Directory Structure
```
src/js/
├── components/           # Reusable UI Components
│   ├── forms/           # Form components (ProfileSetup.js)
│   ├── modals/          # Modal dialogs (Modal.js)
│   ├── navigation/      # Navigation components (Menu.js)
│   └── friends/         # Friends-specific components
├── services/            # Business Logic Services
│   ├── auth/           # Authentication & university validation
│   ├── data/           # Firestore operations & data management
│   ├── friends/        # Social features & friendship management
│   ├── realtime/       # Real-time updates & notifications
│   └── schedule/       # Schedule management & OCR processing
├── pages/              # Page Controllers
│   ├── HomePage.js     # Schedule management page
│   └── FriendsPage.js  # Social features page
├── router/             # Navigation System
│   └── Router.js       # Custom SPA router
├── store/              # State Management
│   └── userStore.js    # Centralized user state
├── utils/              # Utility Functions
│   ├── avatar/         # Avatar management
│   ├── dom/            # DOM utilities
│   ├── schedule/       # Schedule utilities
│   └── time/           # Time utilities
└── lib/                # Infrastructure & Config
    ├── firebase/       # Firebase configuration
    └── security/       # Security & privacy
```

## Authentication & Data Flow

### Authentication Architecture
1. **University Validation**: `UniversityValidator.js` validates university email domains
2. **Firebase Auth**: `AuthService.js` handles all Firebase auth operations
3. **User Store**: `userStore.js` provides centralized user state management
4. **Profile Setup**: Multi-step guided setup with avatar customization

### Data Layer Architecture
- **Primary Storage**: Firestore for persistent, real-time data
- **Cache Layer**: localStorage for instant UI response
- **Real-time Sync**: Cross-device synchronization
- **Offline Support**: Queue changes when offline, sync when reconnected

## State Management Pattern

### Centralized State
- **User State**: Managed in `userStore.js` with CurrentUserManager
- **Authentication State**: Managed by AuthService with auth state listeners
- **Friends/Social State**: Managed by FriendsService with real-time updates
- **Real-Time Events**: Managed by RealtimeService with event-driven architecture

### Memory-Efficient Real-Time System
- **Event Coordination**: `RealtimeService.js` with publish/subscribe pattern
- **Automatic Cleanup**: Listeners automatically cleaned up to prevent memory leaks
- **Smart Caching**: 5-minute TTL for search results and friend data
- **Notification Service**: `NotificationService.js` for user feedback

## Database Architecture

### Firestore Collections
- **users/**: User profiles with 5-section organized structure
- **friendRequests/**: Friend request management with cached user info
- **friendships/**: Active friendship connections with bilateral privacy
- **universities/**: University metadata (read-only)

### Security Model
- **University-Only Access**: Firestore security rules enforce university email verification
- **Bilateral Privacy**: Friends system with individual schedule visibility controls
- **Authentication Required**: All operations require Firebase authentication
- **Data Protection**: Privacy controls in `privacyManager.js`

## Build System (Vite)

### Development Configuration
- **Fast Development**: Hot module replacement for rapid development
- **Firebase Integration**: Development server with Firebase emulators
- **Environment Management**: Auto-generated browser config from `.env.local`

### Production Optimization
- **Code Splitting**: Firebase modules split into separate chunks
- **Asset Organization**: Images, CSS, and JS with hash naming
- **Source Maps**: Generated for production debugging
- **SPA Support**: `_redirects` file for proper routing

## Testing Architecture

### Jest Configuration
- **Test Environment**: jsdom for DOM testing
- **ESM Support**: Full ES6 module support with proper configuration
- **Module Mapping**: CSS imports mocked with identity-obj-proxy
- **Firebase Testing**: Proper transformIgnorePatterns for Firebase modules

### Test Structure
- **Core Tests**: `src/js/tests/core/` - Application logic
- **Service Tests**: `src/js/tests/services/` - Business logic layer
- **Firebase Tests**: `src/js/tests/firebase/` - Integration tests
- **Mocks**: `__mocks__/` directory for test doubles

## Performance Optimizations

### Client-Side Performance
- **DOM Caching**: Elements cached in `domElements.js`
- **Smart Queries**: Optimized Firestore queries with indexed fields
- **Lazy Loading**: Dynamic template loading
- **Memory Management**: Proper cleanup of listeners and components

### Real-Time Performance
- **Connection Pooling**: Efficient Firebase listener management
- **Data Caching**: Local storage for frequently accessed data
- **Conflict Resolution**: Smart merge strategies for offline/online sync
- **Bandwidth Optimization**: Minimal data transfer with targeted updates