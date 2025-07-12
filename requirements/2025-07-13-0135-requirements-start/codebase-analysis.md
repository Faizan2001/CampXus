# Codebase Analysis

## Technology Stack
- **Frontend**: Single Page Application (SPA) with Vanilla JavaScript ES6+ modules
- **Backend**: Firebase (Authentication, Firestore Database)
- **Build Tool**: Vite 7.0.2
- **Testing**: Jest with JSDOM environment
- **CSS**: Modular CSS architecture (9 specialized modules)

## Architecture Overview
**University Schedule & Social Platform** - A Firebase-powered scheduling platform for university students

### Core Components:
1. **Authentication System** (`firebase/auth/`)
   - University email validation
   - Firebase Authentication with email verification
   - Protected university-only access

2. **Single Page Application** (`core/`)
   - Custom SPA router for seamless navigation
   - Template-based content loading
   - Modular JavaScript architecture (12+ modules)

3. **Schedule Management** (`core/script.js`)
   - Dynamic weekly schedule grid
   - Real-time multi-user comparison
   - Pin mode for focused editing
   - Import/export functionality

4. **Profile System** (`core/profile-setup.js`)
   - Multi-step guided profile creation
   - Avatar customization system
   - University verification integration

5. **Friends System** (`core/friends/`) - Currently in Phase 3 development
   - Student search by university domain
   - Friend requests and connections
   - Social schedule sharing (planned)

## Current Development Phase
**Phase 3: Friends Features** - Currently on `friends-features` branch
- Friends page structure and modular JavaScript setup complete
- Ready for implementation of search, friend requests, and friends list functionality

## File Structure
```
src/js/
├── core/                    # Core application logic
│   ├── friends/            # Friends system (Phase 3)
│   ├── script.js          # Main schedule management
│   ├── spa-router.js      # Navigation system
│   └── profile-setup.js   # Profile creation
├── firebase/              # Firebase integration
│   ├── auth/             # Authentication system
│   └── config/           # Environment configuration
├── security/             # Privacy and security controls
└── tests/               # Jest test suites

templates/                # SPA page templates
├── home.html            # Schedule interface
├── friends.html         # Social connections
├── profile.html         # Profile setup
└── about.html          # About page
```

## Key Patterns and Conventions
- ES6 modules with clear separation of concerns
- Modular CSS with component-specific stylesheets
- Firebase-first architecture for authentication and data
- University email validation for access control
- Mobile-first responsive design with glassmorphism effects
- Comprehensive Jest testing for reliability