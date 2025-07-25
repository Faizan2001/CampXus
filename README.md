# CampXus - University Schedule & Social Platform

A modern, Firebase-powered social scheduling platform designed specifically for university students. CampXus helps you manage your class schedule, discover and connect with classmates, and coordinate study sessions seamlessly. Built with cutting-edge web technologies and real-time social features.

---

## Core Features

### Social Connections & Student Discovery

**Real-time Friends System:**
- **Student Discovery:** Find classmates by name, major, or student ID within your university
- **Friend Requests:** Send, receive, accept, or decline friend requests with instant notifications
- **Real-time Updates:** Get notified immediately when someone sends you a friend request or accepts yours
- **University-Only Access:** Connect only with students from your verified university domain

**Smart Social Features:**
- **Intelligent Search:** Advanced filtering that excludes existing friends and pending requests
- **Status Tracking:** Visual indicators for pending, accepted, and sent friend requests
- **Memory-Efficient:** Optimized real-time listeners with automatic cleanup to prevent performance issues

### Advanced Schedule Management

**Interactive Scheduling:**
- **Dynamic Time Slots:** Create, edit, and manage custom time periods with validation
- **Pin Mode:** Focus editing on specific users with visual lock indicators
- **Real-Time Comparison:** Multi-user schedule overlap detection with color-coded conflicts
  - Available: Perfect meeting times when everyone's free
  - Conflicts: Times when everyone's busy
  - Partial: Mixed availability across users
- **Data Portability:** Complete import/export with JSON validation

### Modern User Experience

**2025 Glassmorphism Design:**
- **Glass-Card Effects:** Advanced backdrop blur with subtle gradients and modern aesthetics
- **Custom Avatar System:** DiceBear API integration with 6+ avatar styles and customization options
- **Real-time Notifications:** Toast notifications for friend activities and system updates
- **Responsive Design:** Mobile-first approach optimized for all device sizes

**Authentication & Security:**
- **University Email Validation:** Exclusive access for verified university students
- **Firebase Authentication:** Secure sign-up/sign-in with email verification
- **Multi-step Profile Setup:** Guided profile creation with avatar customization
- **Privacy Controls:** Manage your searchability and social visibility

---

## Tech Stack

**Modern Single Page Application** with real-time Firebase integration:

### Firebase Backend Services

- **Authentication:** University email validation with Firebase Auth
- **Firestore Database:** Real-time user profiles, friendships, and social data sync
- **Security Rules:** Protected university-only access with social permissions
- **Real-time Listeners:** Live updates for friend requests, notifications, and social interactions

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
- Mobile-first responsive design with container queries
- Specialized modules for schedule grid, friends interface, and social components

### Social & Real-time Features

**Friends System Architecture:**
- Real-time friend request management with instant notifications
- University-filtered student discovery with intelligent search
- Bi-directional friendship data structure following Firebase best practices
- Memory-optimized listeners with automatic cleanup

**Avatar & Profile System:**
- DiceBear API integration with multiple avatar styles
- Real-time avatar customization with live preview
- Profile management with university validation

### Development & Testing

**Modern Development Stack:**
- Vite build system for optimized production bundles
- Jest testing framework with ESM support and proper mocking
- Firebase emulator integration for local development
- Security audit tools and vulnerability scanning

**Performance Optimizations:**
- Smart caching for search results and social data
- Lazy loading and code splitting for optimal performance
- Resource cleanup and memory management for real-time features
- Optimized database queries with data caching

## 📁 Project Structure

```
CampXus/
├── .md files/                          # 📚 Complete Documentation Suite
│   ├── UI-Map.md                        # DOM reference & interaction guide
│   ├── SPA-All-that-you-need.md         # SPA development masterclass
│   ├── HOW-TO-ADD-NEW-PAGES.md          # Step-by-step page creation
│   └── Contributing-Guide.md            # Development standards
├── Phases/                             # 🎯 Phase-by-Phase Learning Guides
│   ├── Phase-0-Foundation.md            # Firebase setup & environment
│   ├── Phase-1-Authentication.md        # University auth system
│   ├── Phase-2-Profile-Setup-Simple.md  # Multi-step profile creation
│   └── Phase-3-Friends-Simple.md        # Social connections
├── css/                                # 🎨 Modular Stylesheet Architecture
│   ├── variables.css                    # Design system & theme management
│   ├── layout.css                       # SPA structure & navigation
│   ├── components.css                   # Reusable UI components
│   ├── schedule.css                     # Schedule grid & interactions
│   ├── auth.css                         # Authentication UI styling
│   ├── profile-setup.css               # Multi-step form styling
│   ├── menu.css                         # Theme toggle & navigation
│   ├── modal.css                        # Glassmorphism modal dialogs
│   ├── animations.css                   # Smooth transitions & effects
│   └── responsive-enhancements.css      # Modern responsive features
├── src/js/                             # ⚙️ Modern JavaScript Architecture
│   ├── components/                     # 🎨 Reusable UI Components
│   │   ├── modals/                     # Modal dialogs
│   │   │   └── Modal.js                # Glassmorphism modal system
│   │   ├── navigation/                 # Navigation components
│   │   │   └── Menu.js                 # Theme & navigation management
│   │   └── forms/                      # Form components
│   │       └── ProfileSetup.js         # Multi-step profile system
│   ├── services/                       # 🔧 Business Logic Services
│   │   ├── auth/                       # 🔐 Authentication Services
│   │   │   ├── AuthService.js          # Firebase auth controller
│   │   │   └── UniversityValidator.js  # University email validation
│   │   ├── friends/                    # 👥 Social Features
│   │   │   ├── FriendsService.js       # Friends management logic
│   │   │   └── FriendsTypes.js         # Friends data structures
│   │   ├── data/                       # 📊 Data Management
│   │   │   └── DataService.js          # Firestore operations
│   │   └── realtime/                   # ⚡ Real-time Features
│   │       ├── RealtimeService.js      # Real-time coordination
│   │       └── NotificationService.js  # Toast notifications
│   ├── store/                          # 📦 State Management
│   │   └── userStore.js                # Global user state
│   ├── pages/                          # 📄 Page Controllers
│   │   ├── HomePage.js                 # Main schedule logic & state
│   │   └── FriendsPage.js              # Social connections interface
│   ├── router/                         # 🧭 Navigation System
│   │   └── Router.js                   # Single page navigation router
│   ├── utils/                          # 🛠️ Utility Functions
│   │   ├── time/                       # Time utilities
│   │   │   └── timeUtils.js            # Time parsing & validation
│   │   ├── avatar/                     # Avatar utilities
│   │   │   ├── avatarManager.js        # Custom avatar generation
│   │   │   └── avatarUtils.js          # Avatar rendering helpers
│   │   ├── dom/                        # DOM utilities
│   │   │   └── domElements.js          # Performance DOM caching
│   │   ├── schedule/                   # Schedule utilities
│   │   │   └── exportImport.js         # Data import/export tools
│   │   ├── dev/                        # Development utilities
│   │   │   └── debugHelpers.js         # Debug tools
│   │   └── constants.js                # App configuration
│   ├── lib/                            # 🏗️ Infrastructure & Config
│   │   ├── firebase/                   # 🔥 Firebase Configuration
│   │   │   ├── firebase-config.js      # Environment-based config
│   │   │   └── env-config.js           # Auto-generated browser config
│   │   └── security/                   # 🔐 Security & Privacy
│   │       ├── privacyManager.js       # Privacy controls
│   │       └── securityLogger.js       # Security event logging
│   ├── app.js                          # 🚀 Main Application Entry Point
│   ├── dev-tools/                      # 🛠️ Development Utilities
│   │   ├── generate-env-config.js      # Environment setup
│   │   ├── check-dev-setup.js          # Development validation
│   │   └── env-loader.js               # Config loading utilities
│   └── tests/                          # 🧪 Test Suites
│       ├── core/                       # Core functionality tests
│       └── firebase/                   # Firebase integration tests
├── public/                            # 📄 Static Assets & Templates
│   └── templates/                      # SPA Template System
│       ├── home.html                   # Schedule interface template
│       ├── profile.html                # Profile setup template
│       ├── friends.html                # Social connections template
│       └── about.html                  # About page template
├── pages/                              # 📄 Static Utility Pages
│   └── privacy.html                    # Privacy policy page
├── index.html                          # 🏠 SPA Shell & Main Entry Point
├── firebase.json                       # 🔥 Firebase deployment config
├── package.json                        # Node.js dependencies & scripts
└── README.md                           # 📖 Project overview & setup
```

---

## How It Works

### Core Architecture

CampXus operates as a **modern Single Page Application (SPA)** with real-time Firebase backend integration. The platform combines custom routing, component-based architecture, and memory-efficient real-time systems to deliver a seamless social scheduling experience.

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

---

## Getting Started

### Quick Start for Beginners

1. **Download the project** and open it in your preferred code editor
2. **Set up Firebase** following the guide in [Phase-0-Foundation.md](./Phases/Phase-0-Foundation.md)
3. **Configure environment:** Create `.env.local` with your Firebase credentials
4. **Start developing:** Run `npm run dev:serve` for full Firebase integration

### Detailed Setup

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

## Security & Environment Setup

### Important Security Guidelines

1. **Protect your credentials:** Never commit your `.env.local` file containing Firebase API keys
2. **Use secure development practices:** Always run `npm run dev:serve` for proper environment loading
3. **Validate your setup:** Run `npm run dev:check` to ensure everything is configured correctly
4. **Follow security documentation:** Reference [SECURITY.md](./SECURITY.md) for comprehensive guidelines

### Protected Files and Directories

- Firebase API keys stored securely in `.env.local`
- Auto-generated browser configuration in `src/js/lib/firebase/env-config.js`
- Firebase deployment files in `.firebase/` directory
- University email validation rules and social permissions

### Recommended Development Commands

```bash
# Secure environment-based development
npm run dev:serve

# Validate your development setup
npm run dev:check

# Generate environment configuration
npm run dev:config

# Run comprehensive test suites
npm test
```

**Note on Firebase API Keys:**
Firebase API keys are safe for client-side use as they are not secret keys. Security is enforced through Firebase Security Rules, which control database access based on user authentication and university validation.

## Developer Guide

### Architecture Overview

CampXus follows a **modular SPA architecture** with clear separation of concerns:

- **SPA Router System** - Navigation and dynamic template management
- **Real-time Friends System** - Social connections with live updates and memory management
- **Authentication & University Integration** - Secure, university-verified access control
- **Schedule Engine** - Interactive scheduling with conflict detection
- **Avatar & Profile System** - Customizable user profiles with DiceBear integration
- **Theme System** - Modern glassmorphism design with dark/light mode support

### Adding New Features

**Social & Friends Features:**
- Core logic in `src/js/core/friends/friends-manager.js`
- UI components in `src/js/core/friends/friends-ui.js`
- Real-time coordination via `src/js/core/realtime-manager.js`
- Styling in `src/css/friends-page.css`

**Schedule Features:**
- Core functionality in `src/js/core/script.js`
- Template updates in `public/templates/home.html`
- Styling additions in `src/css/schedule.css`

**New SPA Pages:**
1. Create template in `public/templates/your-page.html`
2. Add route configuration in `spa-router.js`
3. Add navigation link with `data-spa-route="your-page"`
4. Reference [HOW-TO-ADD-NEW-PAGES.md](./.md%20files/HOW-TO-ADD-NEW-PAGES.md)

**Real-time Features:**
- Data layer functions in `data-manager.js` for Firebase listeners
- Event coordination through `realtime-manager.js`
- Notification system via `notification-manager.js`
- Memory management with automatic cleanup functions

### Learning Resources

- **Complete SPA Development:** [SPA-All-that-you-need.md](./SPA-All-that-you-need.md)
- **Structured Learning Path:** Phase-by-phase guides in `/Phases/` directory
- **UI/UX Reference:** [UI-Map.md](./.md%20files/UI-Map.md)
- **Friends System Technical Details:** [FRIENDS-SYSTEM-LIFECYCLE.md](./FRIENDS-SYSTEM-LIFECYCLE.md)
- **Contributing Guidelines:** [Contributing-Guide.md](./.md%20files/Contributing-Guide.md)

---

## Roadmap

### Current Features (Live & Production Ready)

- ✅ Firebase Authentication with university email validation
- ✅ Multi-step profile setup with custom avatar system
- ✅ Single Page Application with smooth navigation
- ✅ Advanced schedule management with pin mode and conflict detection
- ✅ **Real-time Friends System with instant notifications**
- ✅ **Student discovery and connection features**
- ✅ **Friend request management with live updates**
- ✅ **Glassmorphism design with modern UI/UX**
- ✅ **Real-time data synchronization across devices**
- ✅ Responsive design optimized for all device sizes
- ✅ Theme switching and accessibility features

### Phase 4: Enhanced Social Features (In Development)

- 🔄 Mutual friends discovery and suggestions
- 🔄 Social schedule sharing and collaboration
- 🔄 Group study session coordination
- 🔄 Enhanced notification system with preferences

### Future Enhancements

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

---

### Environment Management

The application uses an intelligent environment system that adapts to different deployment contexts:

**Development Mode:**
- Environment variables loaded from `.env.local`
- Auto-generation of browser-compatible configuration
- Firebase emulator integration for local testing
- Real-time debugging tools and console helpers

**Production Mode:**
- Configuration injected by hosting platform (Vercel, Netlify, Firebase Hosting)
- Automatic environment detection and setup
- Optimized build process with Vite for maximum performance
- Production-ready Firebase Security Rules

**Available Development Scripts:**

```bash
npm run dev:check          # Validate development environment setup
npm run dev:config         # Generate browser-compatible configuration
npm run dev:serve          # Start development server with Firebase integration
npm run dev                # Start Vite development server (frontend only)
npm test                   # Run comprehensive Jest test suites
npm run firebase:emulators # Start Firebase local emulators
npm run security:audit     # Run security vulnerability scan
```

---

## Contributing

We welcome contributions from developers who want to help improve the university student experience! Check out [Contributing-Guide.md](./.md%20files/Contributing-Guide.md) for detailed guidelines.

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
3. **Follow the Phase guides** in the `/Phases/` directory for structured development
4. **Test thoroughly:** Run `npm test` to ensure all tests pass
5. **Submit a pull request** with a clear description of your changes

### Development Focus Areas

- **Social Features:** Enhance the friends system with new discovery and interaction features
- **Real-time Performance:** Optimize memory usage and connection management
- **University Integration:** Add support for new universities and institutional features
- **Mobile Experience:** Improve mobile UI/UX and touch interactions
- **Accessibility:** Enhance keyboard navigation and screen reader support

Let's make university life more connected and organized for students everywhere!
