# CampXus - Codebase Structure Overview

## Project Architecture

CampXus is built as a modern Single Page Application (SPA) with a custom router system and Firebase backend integration.

### Root Structure
```
CampXus/
├── src/js/                 # Main application code
├── src/css/               # Modular stylesheet architecture  
├── public/templates/      # SPA template system
├── functions/            # Firebase Cloud Functions
├── NEW-Plan/             # Development phase documentation
└── index.html            # SPA shell and main entry point
```

## Core Application Structure (`src/js/`)

### Services Layer (`services/`)
**Business logic and external integrations:**
- `auth/` - Authentication and university validation
- `data/` - Firestore operations and data management  
- `friends/` - Social features and friendship management
- `realtime/` - Real-time updates and notifications
- `schedule/` - Schedule management and OCR processing
- `location/` - Campus presence and location detection

### Components Layer (`components/`)
**Reusable UI components:**
- `forms/` - Form components (ProfileSetup.js)
- `friends/` - Friends system UI (HorizontalFriendsBar.js)
- `modals/` - Modal dialogs
- `navigation/` - Navigation components

### Pages Layer (`pages/`)
**Page-specific controllers:**
- `HomePage.js` - Schedule management interface
- `FriendsPage.js` - Social features interface

### Core Infrastructure
- `router/` - SPA navigation system
- `store/` - Centralized state management  
- `lib/` - Firebase configuration and security
- `utils/` - Helper functions and utilities
- `app.js` - Application entry point

## Key Architectural Patterns

### SPA Navigation System
- Custom router with dynamic template loading
- Browser history integration
- Route-based authentication checks

### Real-time Data Flow
- Firebase real-time listeners for live updates
- Centralized state management via userStore
- Event-driven communication between components

### Location Detection (3-Tier System)
- **Tier 1:** Network/IP detection (FREE, instant)
- **Tier 2:** Browser GPS (FREE, 3 attempts)  
- **Tier 3:** Google Geolocation API (PAID, limited usage)

### Privacy Architecture
- Bilateral privacy controls in friendship system
- Individual schedule visibility settings per friendship
- Real-time privacy synchronization across sessions

## Database Structure (Firestore)

### Collections
- `users/` - User profiles with 5-section organization
- `friendRequests/` - Pending friend requests
- `friendships/` - Active friendship connections
- `universities/` - University metadata

### Data Flow Patterns
- Dual storage strategy (Firestore + localStorage cache)
- Real-time listeners with automatic cleanup
- Optimized queries with proper indexing