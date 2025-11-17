# MeetchuThere

A real-time social scheduling platform for university students. Connect with classmates, share schedules, and coordinate study sessions with privacy controls and campus presence features.

## Local Development

- Always run BOTH:
  npm run firebase:emulators # Terminal 1 (keep running)
  npm run dev # Terminal 2 (keep running)

## Overview

CampXus helps university students manage their schedules and connect with classmates through:

- **Smart Schedule Management**: Paste schedule text to detect courses, create custom time slots, and compare availability with friends
- **Social Discovery**: Find classmates by handle or student ID within your university
- **Real-time Friends System**: Send friend requests, manage connections, and view schedules with bilateral privacy controls
- **Campus Presence**: Share location status with adaptive GPS and network detection
- **Cross-device Sync**: Automatic synchronization across all devices with offline support

## Features

### Schedule Management

- Paste-to-import schedule text (automatic course detection)
- Dynamic time slot creation and editing
- Real-time schedule comparison and conflict detection
- Dual storage (Firestore + localStorage) with offline support
- University-specific time slot defaults (IUB supported)

### Social Features

- University email validation for secure access
- Friend discovery by exact handle (@username) or student ID
- Real-time friend requests and notifications
- Bilateral privacy controls for schedule visibility
- Horizontal friends bar with privacy indicators

### Campus Integration

- Adaptive location detection (network and GPS)
- Campus presence sharing with privacy controls
- University-specific configurations
- Real-time presence updates

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+ modules), Single Page Application
- **Backend**: Firebase (Authentication, Firestore, Real-time listeners)
- **Build**: Vite with optimized code splitting
- **Testing**: Jest with jsdom environment

## Quick Start

### Prerequisites

- Node.js 16+
- Firebase project with Authentication and Firestore enabled

### Installation

1. **Clone and install:**

   ```bash
   git clone https://github.com/Faizan2001/CampXus.git
   cd CampXus
   npm install
   ```

2. **Firebase setup:**
   Create `.env.local` with your Firebase config:

   ```bash
   FIREBASE_API_KEY=your_api_key_here
   FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   FIREBASE_APP_ID=your_app_id
   ```

3. **Start development:**
   ```bash
   npm run dev:config  # Generate environment config
   npm run dev:serve   # Start with Firebase integration (recommended)
   # OR
   npm run dev         # Frontend-only development
   ```

## Development Commands

```bash
# Development
npm run dev:config         # Generate environment configuration
npm run dev:check          # Validate development setup
npm run dev:serve          # Start with Firebase integration
npm run dev                # Start Vite dev server

# Testing
npm test                   # Run Jest test suites

# Firebase
npm run firebase:emulators             # Start local Firebase emulators
npm run firebase:emulators:persist    # Start emulators + save/restore data on exit
npm run firebase:emulators:export     # Export current emulator data
npm run firebase:serve                # Serve with Firebase hosting
npm run firebase:deploy               # Deploy to production

# Security
npm run security:audit     # Security vulnerability scan
npm run security:fix       # Fix vulnerabilities
npm run security:check     # Audit with CI tools

# Build
npm run build              # Production build
npm run preview            # Preview production build
```

## Project Structure

```
CampXus/
├── src/
│   ├── js/
│   │   ├── components/              # Reusable UI components
│   │   │   ├── forms/
│   │   │   ├── friends/             # Friends system components
│   │   │   ├── modals/
│   │   │   ├── navigation/
│   │   │   ├── presence/            # Campus presence components
│   │   │   └── schedule/
│   │   ├── services/                # Business logic services
│   │   │   ├── auth/                # Authentication
│   │   │   ├── data/                # Data management
│   │   │   ├── friends/             # Social features
│   │   │   ├── location/            # Campus presence
│   │   │   ├── realtime/            # Real-time updates
│   │   │   ├── schedule/            # Schedule management
│   │   │   ├── ui/                  # UI services
│   │   │   └── analytics/           # Analytics
│   │   ├── pages/                   # Page controllers
│   │   ├── router/                  # SPA navigation
│   │   ├── store/                   # State management
│   │   ├── utils/                   # Utility functions
│   │   ├── lib/                     # Infrastructure
│   │   ├── core/                    # Core system files
│   │   ├── cache/                   # Caching layer
│   │   ├── tests/                   # Test suites
│   │   └── app.js                   # Application entry point
│   └── css/                         # Modular stylesheets
├── public/
│   └── templates/                   # SPA templates
├── .md files/                       # Documentation
├── Phases/                          # Development phases
├── index.html                       # Application shell
├── firebase.json                    # Firebase configuration
├── firestore.indexes.json          # Database indexes
├── jest.setup.js                    # Testing configuration
├── vite.config.js                   # Build configuration
└── package.json                     # Dependencies and scripts
```

## Architecture

CampXus is built as a modern Single Page Application with:

- **Custom Router**: Client-side navigation without page reloads
- **Component Architecture**: Modular, reusable components with lifecycle management
- **Real-time System**: Firebase listeners with memory-efficient cleanup
- **Privacy System**: Bilateral privacy controls with instant synchronization
- **Performance Optimization**: Circuit breaker patterns and intelligent caching

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Run tests: `npm test`
4. Submit a pull request

### Focus Areas

- Mobile experience improvements
- New university integrations
- Enhanced privacy features
- Performance optimizations
- Accessibility enhancements

## Security

- Firebase API keys are safe for client-side use (protected by security rules)
- University email validation ensures student-only access
- Privacy controls protect user data and schedule visibility
- Regular security audits with automated vulnerability scanning

## License

ISC License - see repository for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Faizan2001/CampXus/issues)
- **Documentation**: See `.md files/` directory for detailed guides
- **Development**: Check `CLAUDE.md` for development instructions

---

Built for university students, by university students.
