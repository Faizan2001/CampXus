# 📅 CampXus - University Schedule & Social Platform ✨

A modern, Firebase-powered scheduling platform that helps university students manage schedules, connect with classmates, and coordinate study sessions. Built with cutting-edge web technologies and designed for the university experience.

---

## 🚀 Core Features

### 🎓 **Authentication & University Integration**

- **🏫 University Email Validation:** Exclusive access for verified university students
- **🔐 Firebase Authentication:** Secure sign-up/sign-in with email verification
- **👤 Smart Profile Setup:** Multi-step guided profile creation with avatar customization

### 📅 **Advanced Schedule Management**

- **⏰ Dynamic Time Slots:** Create, edit, and manage custom time periods with validation
- **📌 Pin Mode:** Focus editing on specific users with visual lock indicators
- **🔄 Real-Time Comparison:** Multi-user schedule overlap detection with color-coded conflicts
  - 🟢 **Available:** Perfect meeting times when everyone's free
  - 🔴 **Conflicts:** Times when everyone's busy
  - 🟠 **Partial:** Mixed availability across users
- **📤📥 Data Portability:** Complete import/export with JSON validation

### 🌐 **Modern Single Page Application**

- **⚡ SPA Router:** Instant navigation without page reloads
- **🎨 Glassmorphism Design:** Modern UI with smooth theme transitions
- **📱 Responsive Excellence:** Mobile-first design with container queries
- **♿ Accessibility Ready:** WCAG 2.1 compliant with keyboard navigation
- **🧪 Comprehensive Testing:** Jest-powered test suites for reliability

---

## 🛠️ Tech Stack

**Single Page Application (SPA)** with Firebase integration:

### 🔥 **Firebase Backend Services**

- **Authentication:** University email validation with Firebase Auth
- **Firestore Database:** Real-time user profiles and data sync
- **Security Rules:** Protected university-only access

### 🎨 **Modern Frontend Architecture**

- **Vanilla JavaScript (ES6+ Modules):** Clean, dependency-free codebase
- **SPA Router:** Custom-built for smooth navigation without page reloads
- **Modular CSS (9 specialized modules):**
  - `variables.css` - Design system & CSS custom properties
  - `layout.css` - App structure & navigation components
  - `components.css` - UI elements & glassmorphism cards
  - `schedule.css` - Schedule grid & time slot interactions
  - `menu.css` - Navigation & theme toggle system
  - `modal.css` - Modal dialogs with backdrop effects
  - `animations.css` - Smooth transitions & motion design
  - `auth.css` - Authentication UI components
  - `profile-setup.css` - Multi-step profile creation
  - `responsive-enhancements.css` - Modern responsive features

### ⚙️ **JavaScript Module System (12+ specialized modules)**

- **Core Application Logic:**
  - `script.js` - Main schedule management & state
  - `spa-router.js` - Single page navigation system
  - `domElements.js` - Performance-optimized DOM caching
- **Authentication & Security:**
  - `auth-manager.js` - Firebase authentication controller
  - `university-validator.js` - University email verification
  - `privacy-manager.js` - Data privacy controls
- **User Experience:**
  - `profile-setup.js` - Multi-step profile creation
  - `avatars.js` - Custom avatar generation system
  - `menu.js` - Theme management & navigation
- **Development & Testing:**
  - `Jest test suites` - Comprehensive unit testing
  - `Firebase dev tools` - Environment setup utilities

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

## ⚙️ How It Works

### 🎯 **Core Architecture**

CampXus is built as a **Single Page Application (SPA)** with Firebase backend integration. The app uses a custom SPA router for seamless navigation and modular JavaScript architecture for maintainable code.

### 🔐 **Authentication Flow**

1. **University Verification:** Students sign up with verified university email addresses
2. **Firebase Authentication:** Secure email/password authentication with verification
3. **Profile Setup:** Guided multi-step profile creation with avatar customization
4. **Persistent Sessions:** Stay logged in across browser sessions

### 📅 **Schedule Management System**

- **Dynamic Grid:** Interactive weekly schedule with time slot management
- **Pin Mode:** Lock editing to specific users for focused schedule updates
- **Real-time Comparison:** Color-coded overlap detection across multiple users
- **Smart Persistence:** Data saved locally with Firebase cloud sync

### 🌐 **SPA Navigation**

- **Template System:** Dynamic content loading without page reloads
- **Router Integration:** Browser history and URL management
- **Component Lifecycle:** Smart initialization and cleanup for each page

---

## 🚀 Getting Started

### 🔰 **Quick Start for Beginners**

1. **Download the project** and open it in VS Code
2. **Set up Firebase** (see [Phase-0-Foundation.md](./Phases/Phase-0-Foundation.md))
3. **Configure environment:** Create `.env.local` with your Firebase keys
4. **Start developing:** `npm run dev:serve`

### 🔧 **Detailed Setup**

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

## 🔒 **IMPORTANT: Security & Environment Setup**

### ⚠️ **Before Development**

1. **Never commit API keys!** Your `.env.local` file contains sensitive credentials
2. **Use secure development:** Always run `npm run dev:serve` for proper environment loading
3. **Verify security:** Run `npm run dev:check` to validate your setup
4. **Read security docs:** See [SECURITY.md](./SECURITY.md) for complete guidelines

### 🛡️ **What's Protected**

- 🔐 Firebase API keys (stored securely in `.env.local`)
- 🔐 Auto-generated browser config (`src/js/lib/firebase/env-config.js`)
- 🔐 Firebase deployment files (`.firebase/` directory)
- 🔐 University email validation rules

### ✅ **Development Commands**

```bash
# ✅ SECURE: Environment-based development
npm run dev:serve

# ✅ SECURE: Validate your setup
npm run dev:check

# ❌ INSECURE: Don't edit HTML files to add keys directly
# ❌ INSECURE: Don't commit .env.local or env-config.js
```

**Firebase Keys in Client Code:**
Firebase API keys are safe to expose in client-side code - they're **not secret keys**. The real security comes from Firebase Security Rules, which control database access based on user authentication.

## 🧠 Developer Guide

### 🏗️ **Architecture Overview**

CampXus follows a **modular SPA architecture** with clear separation of concerns:

- **SPA Router** (`spa-router.js`) - Navigation and template management
- **Authentication System** (`firebase/auth/`) - University-verified login
- **Profile Management** (`profile-setup.js`) - Multi-step guided setup
- **Schedule Engine** (`script.js`) - Core scheduling functionality
- **Theme System** (`menu.js`) - Dark/light themes with smooth transitions

### 🔧 **Adding New Features**

**Schedule Features:**

- Start in `js/core/script.js` for core logic
- Update templates in `templates/home.html`
- Add styles to `css/schedule.css`

**New SPA Pages:**

1. Create template in `templates/your-page.html`
2. Add route to `spa-router.js`
3. Add navigation link with `data-spa-route="your-page"`
4. See [HOW-TO-ADD-NEW-PAGES.md](./.md%20files/HOW-TO-ADD-NEW-PAGES.md)

**Authentication Features:**

- Extend `firebase/auth/auth-manager.js`
- Update university validation in `university-validator.js`

### 📚 **Learning Resources**

- **Complete SPA Guide:** [SPA-All-that-you-need.md](./SPA-All-that-you-need.md)
- **Phase-by-Phase Learning:** Check `/Phases/` directory
- **UI Reference:** [UI-Map.md](./.md%20files/UI-Map.md)
- **Contributing:** [Contributing-Guide.md](./.md%20files/Contributing-Guide.md)

---

## 🎯 Roadmap

### 🚀 **Current Features (Live)**

- ✅ Firebase Authentication with university email validation
- ✅ Multi-step profile setup with avatar customization
- ✅ Single Page Application with smooth navigation
- ✅ Advanced schedule management with pin mode
- ✅ Real-time schedule comparison and conflict detection
- ✅ Responsive design with glassmorphism effects
- ✅ Theme switching and accessibility features

### 🎯 **Phase 3: Social Connections (In Progress)**

- 🔄 Friend discovery by university domain
- 🔄 Friend requests and connections system
- 🔄 Social schedule sharing and collaboration

### 🎯 **Phase 4: Cloud Sync & Real-time (Planned)**

- 📋 Real-time schedule updates across devices
- 📋 Cloud storage for persistent data sync
- 📋 Live collaboration features

### 🌟 **Future Enhancements**

- 📱 Progressive Web App (PWA) capabilities
- 📧 Email notifications for schedule conflicts
- 🗓️ Calendar export (ICS format)
- 🤖 AI-powered meeting time suggestions
- 🎨 Custom theme creation tools

### 🏫 **University Expansion**

- Currently supporting IUB (Independent University, Bangladesh)
- Planned expansion to more universities
- Easy configuration for new institutions

---

### 🔧 **Environment Management**

The app uses a smart environment system that adapts to different deployment contexts:

**Development Mode:**

- Environment variables loaded from `.env.local`
- Auto-generation of browser-compatible configuration
- Development Firebase emulators support

**Production Mode:**

- Configuration injected by hosting platform (Vercel, Netlify, etc.)
- Automatic environment detection and setup
- Optimized build process for performance

**Available Scripts:**

```bash
npm run dev:check          # Validate development environment
npm run dev:config         # Generate browser-compatible config
npm run dev:serve          # Start development server with environment
npm test                   # Run comprehensive Jest test suites
npm run firebase:emulators # Start Firebase local emulators
```

---

## 🤝 Contributing

We welcome contributions! Check out [Contributing-Guide.md](./.md%20files/Contributing-Guide.md) for detailed guidelines.

**Key Principles:**

- 🎯 Keep the university focus - features should serve student needs
- 🎨 Maintain responsive, accessible design standards
- 🧪 Write tests for new functionality
- 📚 Update documentation for any new features
- 🔐 Follow security best practices for authentication

**Getting Started:**

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Follow the Phase guides in `/Phases/` directory
4. Test your changes: `npm test`
5. Submit a pull request with clear description

Let's make university scheduling effortless for students everywhere! 🎓✨
