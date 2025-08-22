# CampXus - University Schedule & Social Platform

## Project Overview

CampXus is a comprehensive Firebase-powered social scheduling platform designed specifically for university students. It combines intelligent schedule management with advanced social features, privacy-aware friend systems, and real-time collaboration tools to create a seamless campus networking experience.

The application is built as a modern Single Page Application (SPA) using vanilla JavaScript with ES6+ modules. It leverages Firebase for backend services including authentication, real-time database (Firestore), and cloud functions. The frontend uses a custom router for navigation and a modular CSS architecture with glassmorphism design principles.

Key features include:
- University email-validated authentication
- Advanced friends system with bilateral privacy controls
- Real-time schedule management with dual storage (Firestore + localStorage)
- Horizontal friends bar for quick access
- Mobile-responsive design
- Campus presence/location sharing features

## Technology Stack

### Backend & Services
- **Firebase Authentication**: University email validation and secure sign-up/sign-in
- **Firestore**: Real-time user profiles, friendships, and schedule storage
- **Firebase Cloud Functions**: Serverless backend logic
- **Firebase Hosting**: Web application deployment

### Frontend Architecture
- **Vanilla JavaScript (ES6+ Modules)**: Clean, dependency-free codebase
- **Custom SPA Router**: Instant navigation without page reloads
- **Component-Based Architecture**: Modular UI components (e.g., HorizontalFriendsBar, Menu, Modal)
- **Modular CSS**: Glassmorphism design with CSS custom properties and responsive layout
- **Real-Time Listeners**: Live updates for schedules, friend requests, and notifications

### Development & Testing
- **Vite**: Build tool for optimized development and production bundles
- **Jest**: Testing framework with ESM support
- **Firebase Emulator**: Local development environment
- **NPM Scripts**: Standardized development and deployment commands

## Project Structure

```
CampXus/
├── src/
│   ├── js/
│   │   ├── components/                 # Reusable UI Components
│   │   │   ├── forms/
│   │   │   ├── friends/
│   │   │   ├── modals/
│   │   │   └── navigation/
│   │   ├── services/                   # Business Logic Services
│   │   │   ├── auth/
│   │   │   ├── data/
│   │   │   ├── friends/
│   │   │   ├── realtime/
│   │   │   └── schedule/
│   │   ├── pages/                      # Page Controllers
│   │   ├── router/                     # Navigation System
│   │   ├── store/                      # State Management (userStore)
│   │   ├── utils/                      # Utility Functions
│   │   ├── lib/                        # Infrastructure & Config
│   │   ├── core/                       # Core System Files
│   │   ├── dev-tools/                  # Development Tools
│   │   └── tests/                      # Test Suites
│   └── css/                            # Modular Stylesheet Architecture
├── public/
│   └── templates/                      # SPA Template System
├── functions/                          # Firebase Cloud Functions
└── ...
```

## Key Modules and Components

### Authentication (AuthService.js)
The authentication system handles user sign-up, sign-in, email verification, and session management. It uses Firebase Authentication and enforces university email validation. The system integrates with `userStore.js` to manage the current user's state.

### User State Management (userStore.js)
A centralized module (`currentUser`) for managing the currently authenticated user's state, including their Firebase Auth object and Firestore profile data. Provides methods for checking login status, profile completion, and waiting for profile data to load.

### Schedule Management (HomePage.js, ScheduleStorageService.js)
The schedule system is centered in `HomePage.js` which manages the UI state for viewing and editing schedules. `ScheduleStorageService.js` implements a dual storage strategy using Firestore as the primary store and localStorage as a cache for instant UI updates and offline support.

### Friends System (FriendsService.js, FriendsPage.js)
The friends system allows users to search for classmates, send/accept/reject friend requests, and manage their friends list. It includes advanced features like bilateral privacy controls for schedule visibility and a horizontal friends bar for quick access.

### Real-Time Updates (RealtimeService.js, NotificationService.js)
These services handle real-time communication using Firebase listeners. `RealtimeService.js` coordinates events across the application, while `NotificationService.js` manages user notifications for friend requests and system messages.

### UI Components
- **HorizontalFriendsBar.js**: A key UI element for quick access to starred friends' schedules with privacy-aware disabled states.
- **Router.js**: Custom SPA router for client-side navigation.
- **Modal.js**: Reusable modal dialog system.
- **Menu.js**: Navigation menu with authentication state integration.

## Building and Running

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Firebase project with Authentication and Firestore enabled

### Installation
1. Clone the repository
2. Run `npm install` to install dependencies

### Available Scripts
- `npm run dev`: Start the Vite development server
- `npm run dev:serve`: Start development server with Firebase integration
- `npm run build`: Build for production
- `npm test`: Run comprehensive Jest test suites
- `npm run firebase:emulators`: Start Firebase local emulators
- `npm run firebase:deploy`: Deploy to Firebase hosting

### Environment Setup
Firebase API keys are stored in a `.env.local` file (not committed) and automatically converted to a browser-compatible config file during the build process.

## Development Conventions

### Code Style
- Uses vanilla JavaScript with ES6+ modules
- Follows a component-based architecture with clear separation of concerns
- Employs a modular CSS approach with custom properties for theming

### State Management
- Centralized state management for the current user via `userStore.js`
- Local component state for UI-specific data
- Real-time updates coordinated through `RealtimeService.js`

### Testing
- Jest is used for unit and integration testing
- Tests are colocated with the code they test in `src/js/tests/`
- Mocks are used to isolate units under test

### Security
- University email validation for exclusive student access
- Firebase Security Rules enforce data access policies
- Sensitive credentials are stored in `.env.local` and not committed