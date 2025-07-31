# CampXus - University Schedule & Social Platform

A modern, Firebase-powered social scheduling platform designed specifically for university students. CampXus helps you manage your class schedule, discover and connect with classmates, and coordinate study sessions seamlessly.

## Features

### Social Connections & Student Discovery

**Friends System:**
- Find classmates by name, major, or student ID within your university
- Send, receive, accept, or decline friend requests with instant notifications
- Real-time updates for friend activities and connection status
- University-only access ensures you connect only with verified students

**Smart Social Features:**
- Advanced filtering that excludes existing friends and pending requests
- Visual indicators for pending, accepted, and sent friend requests
- Memory-efficient real-time listeners with automatic cleanup

### Advanced Schedule Management

**Enhanced Schedule Storage:**
- Dual storage strategy: Firestore primary + localStorage cache for instant UI response
- Cross-device real-time sync: Schedule updates appear instantly across all devices
- Offline capability: Queue changes when offline, automatically sync when reconnected
- Privacy controls: Private, friends-only, or public schedule visibility
- Schema versioning for future-proof data structure with migration support

**Interactive Scheduling:**
- Dynamic time slots: Create, edit, and manage custom time periods with validation
- Pin mode: Focus editing on specific users with visual lock indicators
- Real-time comparison: Multi-user schedule overlap detection with color-coded conflicts
- Data portability: Complete import/export with JSON validation

### Modern User Experience

**Design:**
- Modern glassmorphism design with backdrop blur effects
- Custom avatar system with multiple styles and customization options
- Real-time notifications for friend activities and system updates
- Responsive design optimized for all device sizes

**Authentication & Security:**
- University email validation for exclusive student access
- Firebase Authentication with secure sign-up/sign-in and email verification
- Multi-step profile setup with guided avatar customization
- Privacy controls for managing searchability and social visibility

## Tech Stack

**Single Page Application** with real-time Firebase integration:

### Backend Services

- **Authentication:** University email validation with Firebase Auth
- **Database:** Firestore for real-time user profiles, friendships, and schedule storage
- **Schedule Storage:** Dual storage strategy with Firestore + localStorage
- **Security Rules:** Protected university-only access with schedule privacy controls
- **Real-time Listeners:** Live updates for schedules, friend requests, and notifications

### Frontend Architecture

**Vanilla JavaScript (ES6+ Modules):**
- Clean, dependency-free codebase with modern JavaScript patterns
- Component-based architecture with proper lifecycle management
- Memory-efficient real-time event system with automatic cleanup

**SPA Router System:**
- Custom-built router for instant navigation without page reloads
- Dynamic template loading with proper state management
- Browser history integration and URL management

**Modular CSS Architecture:**
- Design system with CSS custom properties and theme management
- Glassmorphism components with advanced backdrop blur effects
- Mobile-first responsive design
- Specialized modules for schedule grid, friends interface, and social components

### Development & Testing

**Development Stack:**
- Vite build system for optimized production bundles
- Jest testing framework with ESM support and proper mocking
- Firebase emulator integration for local development
- Security audit tools and vulnerability scanning

**Performance Optimizations:**
- Smart caching for search results and social data
- Lazy loading and code splitting for optimal performance
- Resource cleanup and memory management for real-time features
- Optimized database queries with data caching

## Project Structure

```
CampXus/
├── src/
│   ├── js/
│   │   ├── components/                 # Reusable UI Components
│   │   │   ├── forms/                  # Form components
│   │   │   │   └── ProfileSetup.js
│   │   │   ├── modals/                 # Modal dialogs
│   │   │   │   └── Modal.js
│   │   │   └── navigation/             # Navigation components
│   │   │       └── Menu.js
│   │   ├── services/                   # Business Logic Services
│   │   │   ├── auth/                   # Authentication Services
│   │   │   │   ├── AuthService.js
│   │   │   │   └── UniversityValidator.js
│   │   │   ├── data/                   # Data Management
│   │   │   │   └── DataService.js      # Enhanced with Phase-1 schedule storage
│   │   │   ├── friends/                # Social Features
│   │   │   │   ├── FriendsService.js
│   │   │   │   └── FriendsTypes.js
│   │   │   ├── realtime/               # Real-time Features
│   │   │   │   ├── NotificationService.js
│   │   │   │   └── RealtimeService.js
│   │   │   └── schedule/               # Schedule Management & Import
│   │   │       ├── OcrService.js
│   │   │       ├── ScheduleImportService.js
│   │   │       ├── ScheduleStorageService.js
│   │   │       ├── ScheduleValidator.js
│   │   │       └── UniversityParser.js
│   │   ├── pages/                      # Page Controllers
│   │   │   ├── FriendsPage.js
│   │   │   └── HomePage.js
│   │   ├── router/                     # Navigation System
│   │   │   └── Router.js
│   │   ├── store/                      # State Management
│   │   │   └── userStore.js
│   │   ├── utils/                      # Utility Functions
│   │   │   ├── avatar/                 # Avatar Management
│   │   │   │   ├── avatarManager.js
│   │   │   │   └── avatarUtils.js
│   │   │   ├── dev/                    # Development Helpers
│   │   │   │   └── debugHelpers.js
│   │   │   ├── dom/                    # DOM Utilities
│   │   │   │   └── domElements.js
│   │   │   ├── schedule/               # Schedule Utilities
│   │   │   │   └── exportImport.js
│   │   │   ├── time/                   # Time Utilities
│   │   │   │   └── timeUtils.js
│   │   │   └── constants.js
│   │   ├── lib/                        # Infrastructure & Config
│   │   │   ├── firebase/               # Firebase Configuration
│   │   │   │   ├── env-config.js       # Auto-generated (DO NOT EDIT)
│   │   │   │   ├── firebase-config.js
│   │   │   │   └── firebase-config-production.js
│   │   │   └── security/               # Security & Privacy
│   │   │       ├── privacyManager.js
│   │   │       └── securityLogger.js
│   │   ├── core/                       # Core System Files
│   │   │   └── firestore/
│   │   │       └── MIGRATION_SUMMARY.md
│   │   ├── dev-tools/                  # Development Tools
│   │   │   ├── check-dev-setup.js
│   │   │   ├── env-loader.js
│   │   │   ├── generate-env-config.js
│   │   │   ├── firebase-dev-tools-README.md
│   │   │   └── firebase-setup-guide.md
│   │   ├── tests/                      # Test Suites
│   │   │   ├── core/                   # Core Logic Tests
│   │   │   │   ├── profile-setup.test.js
│   │   │   │   ├── scheduleEditor.test.js
│   │   │   │   ├── script.test.js
│   │   │   │   └── timeUtils.test.js
│   │   │   ├── firebase/               # Firebase Integration Tests
│   │   │   │   └── university-validator.test.js
│   │   │   ├── services/               # Service Layer Tests
│   │   │   │   ├── ocr-integration.test.js
│   │   │   │   ├── ocr-service.test.js
│   │   │   │   └── schedule-import.test.js
│   │   │   └── __mocks__/              # Test Mocks
│   │   │       └── spa-init.mock.js
│   │   └── app.js                      # Application Entry Point
│   └── css/                            # Modular Stylesheet Architecture
│       ├── animations.css
│       ├── auth.css
│       ├── components.css
│       ├── friends-page.css
│       ├── layout.css
│       ├── menu.css
│       ├── modal.css
│       ├── profile-setup.css
│       ├── responsive-enhancements.css
│       ├── schedule.css
│       ├── styles.css
│       └── variables.css
├── public/
│   └── templates/                      # SPA Template System
│       ├── about.html
│       ├── friends.html
│       ├── home.html
│       └── profile.html
├── functions/                          # Firebase Cloud Functions
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
├── NEW-Plan/                           # Development Phase Documentation
│   ├── Phase-0-Schedule-Import-System.md
│   ├── Phase-1-Schedule-Storage-Foundation.md
│   ├── Phase-2-Quick-Access-Friends-System.md
│   ├── Phase-3-Horizontal-Friends-Bar-UI.md
│   ├── Phase-4-Schedule-Viewing-Integration.md
│   ├── Phase-5-Intuitive-Schedule-Comparison.md
│   └── Phase-6-Performance-And-Polish.md
├── Phases/                             # Legacy Phase Documentation
├── .md files/                          # Project Documentation
│   ├── Contributing-Guide.md
│   ├── Database-Guide.md
│   ├── HOW-TO-ADD-NEW-PAGES.md
│   ├── SECURITY.md
│   ├── SPA-All-that-you-need.md
│   ├── tests-roadmap.md
│   └── UI-Map.md
├── index.html                          # SPA Shell & Main Entry Point
├── firebase.json                       # Firebase deployment config
├── firestore.indexes.json             # Firestore database indexes
├── jest.setup.js                       # Jest testing configuration
├── vite.config.js                      # Vite build configuration
├── package.json                        # Node.js dependencies & scripts
├── CLAUDE.md                           # Claude Code development instructions
└── README.md                           # Project documentation
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase project with Authentication and Firestore enabled

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/CampXus.git
   cd CampXus
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Firebase Setup:**
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Authentication (Email/Password) and Firestore Database
   - Copy your config to `.env.local`:

   ```bash
   FIREBASE_API_KEY=your_api_key_here
   FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   FIREBASE_APP_ID=your_app_id
   ```

4. **Development Commands:**
   ```bash
   npm run dev:config    # Generate browser-compatible config
   npm run dev:check     # Validate your setup
   npm run dev:serve     # Start development server
   npm test              # Run test suites
   ```

## Available Scripts

```bash
# Development
npm run dev:config         # Generate environment configuration
npm run dev:check          # Validate development environment setup
npm run dev:serve          # Start development server with Firebase integration
npm run dev                # Start Vite development server (frontend only)

# Testing
npm test                   # Run comprehensive Jest test suites

# Firebase
npm run firebase:emulators # Start Firebase local emulators
npm run firebase:serve     # Serve app using Firebase hosting
npm run firebase:deploy    # Deploy to Firebase hosting

# Security
npm run security:audit     # Run security vulnerability scan
npm run security:fix       # Fix security vulnerabilities
npm run security:check     # Check security with audit-ci

# Build
npm run build              # Build for production
npm run preview            # Preview production build locally
```

## Architecture Overview

CampXus operates as a modern Single Page Application (SPA) with real-time Firebase backend integration. The platform combines custom routing, component-based architecture, and memory-efficient real-time systems to deliver a seamless social scheduling experience.

### Authentication & University Integration

1. **University Verification:** Students register using verified university email addresses
2. **Firebase Authentication:** Secure email/password authentication with verification requirements
3. **Profile Creation:** Guided multi-step setup with custom avatar selection and personalization
4. **Social Profile:** Configure privacy settings and searchability preferences

### Real-time Social System

**Friend Discovery:**
- Search for classmates by name, major, or student ID within your university
- Smart filtering excludes existing friends and pending requests
- Real-time search results with instant availability updates

**Connection Management:**
- Send friend requests with immediate delivery notifications
- Receive instant alerts for incoming requests and responses
- Track request status with visual indicators and live updates
- Memory-efficient listeners automatically clean up to prevent performance issues

### Schedule Coordination

**Interactive Scheduling:**
- Dynamic weekly grid with drag-and-drop time slot management
- Pin mode for focused editing on specific user schedules
- Real-time availability comparison with color-coded conflict detection
- Smart data persistence combining local storage with cloud synchronization

**Social Integration:**
- View friend schedules and find optimal meeting times
- Coordinate study sessions based on mutual availability
- Share schedule updates with connected classmates

## Security & Environment Setup

### Important Security Guidelines

1. **Protect your credentials:** Never commit your `.env.local` file containing Firebase API keys
2. **Use secure development practices:** Always run `npm run dev:serve` for proper environment loading
3. **Validate your setup:** Run `npm run dev:check` to ensure everything is configured correctly

### Protected Files and Directories

- Firebase API keys stored securely in `.env.local`
- Auto-generated browser configuration in `src/js/lib/firebase/env-config.js`
- Firebase deployment files in `.firebase/` directory
- University email validation rules and social permissions

**Note on Firebase API Keys:**
Firebase API keys are safe for client-side use as they are not secret keys. Security is enforced through Firebase Security Rules, which control database access based on user authentication and university validation.

## Contributing

We welcome contributions from developers who want to help improve the university student experience!

### Key Principles

- **Student-Focused:** Features should address real university student needs and challenges
- **Responsive Design:** Maintain mobile-first, accessible design standards
- **Testing:** Write comprehensive tests for new functionality
- **Documentation:** Update docs and guides for any new features
- **Security:** Follow best practices for authentication and user data protection
- **Performance:** Ensure real-time features are memory-efficient and optimized

### Getting Started

1. **Fork the repository** and set up your development environment
2. **Create a feature branch:** `git checkout -b feature/your-feature-name`
3. **Test thoroughly:** Run `npm test` to ensure all tests pass
4. **Submit a pull request** with a clear description of your changes

### Development Focus Areas

- **Social Features:** Enhance the friends system with new discovery and interaction features
- **Real-time Performance:** Optimize memory usage and connection management
- **University Integration:** Add support for new universities and institutional features
- **Mobile Experience:** Improve mobile UI/UX and touch interactions
- **Accessibility:** Enhance keyboard navigation and screen reader support

## Roadmap

### Current Features

- Firebase Authentication with university email validation
- Multi-step profile setup with custom avatar system
- Single Page Application with smooth navigation
- Advanced schedule management with pin mode and conflict detection
- Enhanced Schedule Storage with dual Firestore+localStorage strategy
- Cross-device real-time schedule synchronization
- Offline schedule editing with automatic sync when reconnected
- Enhanced privacy controls for schedule visibility
- Real-time Friends System with instant notifications
- Student discovery and connection features
- Friend request management with live updates
- Modern glassmorphism design
- Responsive design optimized for all device sizes
- Theme switching and accessibility features

### Future Enhancements

- Mutual friends discovery and suggestions
- Social schedule sharing and collaboration
- Group study session coordination
- Enhanced notification system with preferences
- Progressive Web App (PWA) capabilities for offline access
- Email notifications for friend requests and schedule conflicts
- Calendar export functionality (ICS format)
- AI-powered meeting time suggestions based on friend availability
- Custom theme creation tools and personalization options
- Cross-university networking and collaboration features

### University Support

- **Currently Supporting:** Independent University, Bangladesh (IUB)
- **Expansion Ready:** Easy configuration system for adding new universities
- **Scalable Architecture:** Designed to support multiple institutions simultaneously

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please:

1. Check the existing [Issues](https://github.com/your-username/CampXus/issues)
2. Create a new issue with detailed information about your problem
3. For security-related issues, please email us directly

---

Let's make university life more connected and organized for students everywhere!