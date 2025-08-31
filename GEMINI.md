
# CampXus Project Overview (GEMINI.md)

This document provides a comprehensive overview of the CampXus project, its architecture, and development conventions to be used as a guide for AI-assisted development.

## 1. Project Overview

**CampXus** is a Single Page Application (SPA) designed as a social platform for university students. Its core purpose is to help students connect by sharing their class schedules and real-time campus presence.

### Key Features:

*   **Authentication:** Secure user sign-up and sign-in restricted to specific university email domains.
*   **Schedule Management:** Users can input their class schedules, including custom time slots, course codes, and classroom locations.
*   **Real-time Presence:** The application detects if a user is physically on campus using a multi-tiered location detection system and displays their status.
*   **Friend System:** Users can send, accept, and manage friend requests.
*   **Schedule Comparison:** Users can compare their schedules with friends to find common free times.
*   **Real-time Sync:** Schedule and presence data are synced in real-time across devices using Firestore listeners.

### Technology Stack:

*   **Frontend:** Vanilla JavaScript (ES6 Modules), HTML5, CSS3
*   **Build Tool:** Vite
*   **Backend & Database:** Google Firebase
    *   **Firestore:** NoSQL database for all user profiles, schedules, and friend data.
    *   **Firebase Authentication:** For managing user accounts.
    *   **Firebase Hosting:** For deploying the application.
*   **Testing:** Jest

## 2. Building and Running the Project

All necessary commands are defined in `package.json`.

*   **Install Dependencies:**
    ```bash
    npm install
    ```

*   **Run Development Server:** Starts the Vite dev server, typically on `http://localhost:5173`.
    ```bash
    npm run dev
    ```

*   **Run Tests:** Executes the test suite using Jest.
    ```bash
    npm run test
    ```

*   **Build for Production:** Creates a production-ready build in the `dist/` directory.
    ```bash
    npm run build
    ```

*   **Firebase Emulators:** The project is configured to work with Firebase emulators for local development (Auth, Firestore, Storage). Refer to `firebase.json` for configuration details.

## 3. Development Conventions & Architecture

The application follows a modular, service-oriented architecture on the frontend.

### Application Structure:

*   **`index.html`**: The main entry point of the SPA.
*   **`src/js/app.js`**: The main JavaScript entry point. It initializes the router and authentication services.
*   **`src/js/router/Router.js`**: A simple client-side router that dynamically loads page content and associated JavaScript modules from `public/templates/` and `src/js/pages/` respectively.
*   **`src/js/pages/`**: Contains the primary logic for each "page" of the application (e.g., `HomePage.js`, `FriendsPage.js`).
*   **`src/js/services/`**: This is the core of the application's logic, broken down into services:
    *   **`AuthService.js`**: Handles all aspects of user authentication, including the sign-in/sign-up UI modal and communication with Firebase Auth.
    *   **`DataService.js`**: Acts as a "Repository" or a single source of truth for all Firestore database interactions. It includes caching, offline support, and methods for fetching and saving all application data (profiles, schedules, friends).
    *   **`CampusLocationService.js`**: Manages the complex logic for detecting a user's physical presence on campus. It uses a cost-optimized 3-tier system (IP detection, Browser Geolocation, Google Geolocation API) and a point-in-polygon algorithm to check against university boundaries defined in `UniversityCampusConfig.js`.
    *   **`ScheduleStorageService.js`**: A dedicated service for loading and saving user schedule data, acting as a layer between `HomePage.js` and `DataService.js`.
*   **`src/js/store/userStore.js`**: A lightweight global state manager for the currently authenticated user's state (auth status, profile, schedule data).
*   **`src/js/utils/`**: Contains helper functions, constants, and utilities for tasks like DOM manipulation, time conversion, and avatar generation.
*   **`public/`**: Contains static assets, including HTML templates for each page.

### Data Flow:

1.  **Authentication**: `AuthService` manages login. On success, it fetches or creates a user profile via `DataService`.
2.  **State Initialization**: The `currentUser` store is updated with the user's profile and auth state.
3.  **Page Load**: The `Router` loads the appropriate page module (e.g., `HomePage.js`).
4.  **Data Fetching**: The page module (`HomePage.js`) uses `ScheduleStorageService` and `DataService` to load the necessary data (like the user's schedule) from Firestore.
5.  **UI Interaction**: The user interacts with the UI (e.g., clicking a time slot). `HomePage.js` updates its local state.
6.  **Data Persistence**: Changes are saved back to Firestore via a debounced call in `HomePage.js` that goes through the `ScheduleStorageService` and `DataService`. This prevents excessive database writes.
7.  **Real-time Updates**: `ScheduleStorageService` sets up a real-time Firestore listener. If data changes on the backend, the `HomePage.js` UI is automatically updated.
