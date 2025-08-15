# 🗺️ CampXus: UI Reference Map & Developer Guide

**Version:** 6.0 (SPA + Firebase + Privacy-Aware Quick Access System)  
**Last Updated:** August 2025

A comprehensive guide to the Single Page Application architecture, Firebase integration, DOM elements, and their interactions in CampXus. This document reflects the current **Privacy-Aware Quick Access System** with bilateral privacy controls, real-time visual indicators, performance optimizations, and advanced social features.

---

## 📌 Table of Contents

1. [SPA Architecture Overview](#-spa-architecture-overview)
2. [Firebase Integration Layer](#-firebase-integration-layer)
3. [Authentication System](#-authentication-system)
4. [Profile Management System](#-profile-management-system)
5. [Privacy-Aware Quick Access System](#-privacy-aware-quick-access-system)
6. [Friends System & Real-Time Features](#-friends-system--real-time-features)
7. [Schedule Management](#-schedule-management)
7. [Key DOM Elements](#-key-dom-elements)
8. [SPA Router & Navigation](#-spa-router--navigation)
9. [CSS Architecture](#-css-architecture)
10. [Testing Framework](#-testing-framework)
11. [Development Workflows](#-development-workflows)

---

## 🌐 SPA Architecture Overview

CampXus is built as a **Single Page Application** with Firebase backend integration:

### Core Philosophy

- **One Shell, Multiple Templates:** `index.html` serves as the app shell, templates are dynamically loaded
- **Route-Based Navigation:** Custom SPA router handles navigation without page reloads
- **Component Lifecycle:** Smart initialization and cleanup for each template
- **State Persistence:** JavaScript objects persist across navigation, templates refresh

### App State Management

| State Object            | Location          | Purpose                             | Persistence   |
| ----------------------- | ----------------- | ----------------------------------- | ------------- |
| `activeUserId`          | `script.js`       | Currently selected user for editing | Memory        |
| `users`                 | `script.js`       | Local schedule data dictionary      | LocalStorage  |
| `selectedUserIds`       | `script.js`       | Users selected for comparison       | Memory        |
| `compareMode`           | `script.js`       | Toggle between edit/compare modes   | Memory        |
| `pinModeActive`         | `script.js`       | Lock editing to active user         | Memory        |
| `currentUser`           | `auth-manager.js` | Firebase authenticated user         | Firebase Auth |
| `spaRouter.currentPage` | `spa-router.js`   | Current route/template              | Memory        |
| `currentRequests`       | `friends-manager.js` | Cached friend requests           | Real-time     |
| `currentFriends`        | `friends-manager.js` | Cached friends list              | Real-time     |
| `activeListeners`       | `realtime-manager.js` | Active Firestore listeners       | Memory        |
| `notifications`         | `notification-manager.js` | Active toast notifications    | Memory        |
| `privacyStatus`         | `HorizontalFriendsBar.js` | Friend privacy states with visual indicators | Real-time |
| `circuitBreakers`       | `HorizontalFriendsBar.js` | Performance protection against infinite loops | Memory |

---

## 🔥 Firebase Integration Layer

### Authentication Architecture

| Component                | File                                    | Purpose                 | Key Methods                                            |
| ------------------------ | --------------------------------------- | ----------------------- | ------------------------------------------------------ |
| **AuthManager**          | `firebase/auth/auth-manager.js`         | Core auth controller    | `signIn()`, `signUp()`, `signOut()`                    |
| **University Validator** | `firebase/auth/university-validator.js` | Email domain validation | `validateUniversityEmail()`, `getFriendlyEmailError()` |
| **Firebase Config**      | `firebase/config/firebase-config.js`    | Environment-based setup | Auto-initialization with security validation           |

### Firestore Data Structure

```javascript
// User Profile Document (users/{uid}) - Enhanced with Privacy & Quick Access
{
  uid: "firebase-user-id",
  email: "student@iub.edu.bd",
  university: "iub",
  universityName: "Independent University, Bangladesh",
  firstName: "John",
  lastName: "Doe",
  studentId: "1234567",
  major: "Computer Science",
  avatarConfig: { /* DiceBear avatar settings */ },
  profileSetupComplete: true,
  quickAccessData: ["friend-uid-1", "friend-uid-2"], // Starred friends
  createdAt: timestamp,
  lastActive: timestamp
}

// Friendship Document (friendships/{id}) - With Bilateral Privacy
{
  users: ["user1-uid", "user2-uid"],
  user1Id: "user1-uid",
  user2Id: "user2-uid",
  scheduleVisibility: {
    "user1-uid": true,  // User1's schedule IS visible to User2
    "user2-uid": false  // User2's schedule IS NOT visible to User1
  },
  privacyMetadata: {
    lastPrivacyUpdate: timestamp,
    privacyUpdatedBy: "user1-uid",
    privacyVersion: 2
  },
  createdAt: timestamp
}
```

### Security Rules

- **University Email Only:** Authentication restricted to verified .edu domains
- **User Data Protection:** Users can only read/write their own profile data
- **Email Verification Required:** Unverified emails are automatically signed out

---

## 🔐 Authentication System

### Modal-Based Authentication UI

| Element             | Selector                         | Purpose                                | Event Listeners                  |
| ------------------- | -------------------------------- | -------------------------------------- | -------------------------------- |
| **Auth Modal**      | `#auth-modal`                    | Container for sign-in/sign-up forms    | Click outside to close           |
| **Sign In Form**    | `#signin-form`                   | Email/password login                   | Form submission                  |
| **Sign Up Form**    | `#signup-form`                   | Account creation with university email | Real-time validation             |
| **Email Inputs**    | `#signin-email`, `#signup-email` | University email validation            | Input events for real-time check |
| **University Info** | `#university-info`               | Shows detected university              | Auto-populated on valid email    |

### Authentication States

| State                  | UI Changes                 | Available Actions            |
| ---------------------- | -------------------------- | ---------------------------- |
| **Unauthenticated**    | Show "Join CampXus" button | Sign in, Sign up             |
| **Authenticated**      | Show user menu with avatar | Profile, Schedule, Sign out  |
| **Profile Incomplete** | Redirect to profile setup  | Complete profile, Skip setup |
| **Profile Complete**   | Full app access            | All features unlocked        |

### Authentication Events

```javascript
// Custom events dispatched by AuthManager
document.addEventListener("profile:setup:complete", (event) => {
  // User completed profile setup
});

document.addEventListener("profile:setup:skip", (event) => {
  // User skipped profile setup
});

// SPA navigation integration
authManager.onAuthStateChanged((user) => {
  // Update UI based on auth state
});
```

## 👤 Profile Management System

### Multi-Step Profile Setup

The profile setup uses a **wizard-style interface** with smart template detection:

| Step                | Focus           | DOM Elements                                            | Validation                          |
| ------------------- | --------------- | ------------------------------------------------------- | ----------------------------------- |
| **Personal Info**   | Basic details   | `#setup-email`, `#setup-student-id`                     | University email, Student ID format |
| **Profile Details** | Academic info   | `#setup-first-name`, `#setup-last-name`, `#setup-major` | Required fields                     |
| **Avatar Creation** | Visual identity | Avatar builder canvas                                   | Color scheme selection              |
| **Completion**      | Final review    | Summary display                                         | Complete profile validation         |

### Profile Setup Architecture

```javascript
// ProfileSetup class lifecycle in SPA context
class ProfileSetup {
  // On first page load or direct navigation
  async initializeSetup()

  // When user navigates back to profile page
  async reinitializeForFreshTemplate()

  // Handle SPA navigation completion
  navigateToHome() // Uses spaRouter.navigateTo() or fallback
}
```

### SPA Integration Challenges & Solutions

**The Template Refresh Problem:**

- **Issue:** User navigates away and back - JavaScript instance persists but HTML template is fresh
- **Detection:** Check if form fields are empty when they should be populated
- **Solution:** `reinitializeForFreshTemplate()` method re-populates fields from cached data

**Event Listeners:**

```javascript
// Listen for SPA navigation to profile page
document.addEventListener("spa:navigation", (event) => {
  if (event.detail.route === "profile") {
    // Handle profile page initialization
  }
});
```

---

## 🔐 Privacy-Aware Quick Access System

### Architecture Overview

The Privacy-Aware Quick Access System provides instant visual feedback when friends restrict schedule access, with real-time updates and performance optimizations:

| Component | File | Purpose | Key Features |
| --- | --- | --- | --- |
| **HorizontalFriendsBar** | `src/js/components/friends/HorizontalFriendsBar.js` | Privacy-aware quick access UI | Visual privacy indicators, circuit breaker protection |
| **FriendshipPrivacyService** | `src/js/services/friends/FriendshipPrivacyService.js` | Privacy control management | Real-time privacy checks, bilateral controls |
| **Privacy Event System** | Integrated with RealtimeService | Immediate privacy updates | Cross-session synchronization |

### Key Privacy Features

#### Visual Privacy Indicators
- **Lock Icons**: Show on restricted friend avatars in horizontal bar
- **Disabled States**: Opacity and grayscale effects for inaccessible schedules
- **Consistent Design**: Glassmorphism styling maintains visual coherence
- **Real-Time Updates**: Visual changes appear instantly across all user sessions

#### Performance Optimizations
- **Circuit Breaker Pattern**: Prevents infinite loops and excessive database updates
- **Debounced Operations**: Batched profile updates (15-second intervals)
- **Immediate Privacy Sync**: Privacy changes bypass batching for instant updates
- **Lightweight Renders**: Privacy-specific visual updates without full re-renders
- **Memory Management**: Automatic cleanup of real-time listeners and timeouts

### Privacy UI Elements

| Element | Selector | Purpose | Privacy Integration |
| --- | --- | --- | --- |
| **Horizontal Friends Bar** | `.horizontal-friends-bar` | Quick access to starred friends | Privacy-aware avatar states |
| **Friend Avatar** | `.friend-avatar` | Individual friend representation | Lock icon overlay for restricted access |
| **Privacy Lock Icon** | `.privacy-lock-icon` | Visual privacy indicator | Appears on restricted friend avatars |
| **Disabled Avatar State** | `.friend-avatar.disabled` | Non-clickable restricted avatar | Reduces opacity, shows "not-allowed" cursor |

### Real-Time Privacy Flow

```javascript
// Privacy change detection and UI update flow
User1 changes privacy → Friendship document updated → 
FriendshipPrivacyService detects change → Privacy event broadcast → 
HorizontalFriendsBar receives update → Lightweight visual update → 
Lock icon appears/disappears instantly
```

---

## 👥 Friends System & Real-Time Features

### Enhanced Architecture Overview

The friends system implements a modern, real-time social experience with privacy-aware features and performance optimizations:

| Component | File | Purpose | Key Features |
| --- | --- | --- | --- |
| **FriendsService** | `src/js/services/friends/FriendsService.js` | Core friends logic | Search, requests, friendships, quick access management |
| **FriendshipPrivacyService** | `src/js/services/friends/FriendshipPrivacyService.js` | Privacy controls | Bilateral privacy, real-time privacy checks |
| **FriendsPage** | `src/js/pages/FriendsPage.js` | Friends interface | Real-time UI updates, privacy-aware friend cards |
| **HorizontalFriendsBar** | `src/js/components/friends/HorizontalFriendsBar.js` | Quick access bar | Privacy indicators, performance optimization |
| **Real-Time Manager** | `src/js/services/realtime/RealtimeService.js` | Event coordination | Privacy-aware publish/subscribe system |
| **Notification Manager** | `src/js/services/realtime/NotificationService.js` | Toast notifications | Privacy interaction feedback |

### Enhanced Real-Time Data Flow

```javascript
// Privacy-aware real-time event flow
Firebase Database Change → Firestore Listener → Privacy Service → Real-Time Manager → 
    ↓                                                                        ↓
Friends Service → UI Components                                    Notification Manager
    ↓               ↓
Quick Access    Privacy Visual
Updates         Indicators
```

### Enhanced UI Elements with Privacy Features

| Element | Selector | Purpose | Real-Time Updates | Privacy Integration |
| --- | --- | --- | --- | --- |
| **Horizontal Friends Bar** | `.horizontal-friends-bar` | Quick access to starred friends | Instant privacy status updates | Lock icons, disabled states |
| **Friends Search** | `#friendSearch` | Find students by name/major | Debounced search with caching | Privacy-aware search results |
| **Friends List** | `#friendsList` | Display current friends | Live updates when friendships change | Privacy status indicators |
| **Friend Requests** | `#friendRequests` | Pending requests | Instant notifications for new requests | Privacy-aware friend cards |
| **Friend Privacy Toggle** | `.privacy-toggle` | Control schedule visibility | Immediate cross-session updates | Bilateral privacy controls |
| **Notification Container** | `#notification-container` | Toast notifications | Privacy interaction feedback | "Schedule access restricted" messages |

### Real-Time Features

#### Friend Request System
- **Instant Notifications**: Toast notifications appear immediately when requests are received
- **Live UI Updates**: Request counts and lists update without page refresh
- **Accept/Reject Actions**: Real-time feedback with success/error notifications

#### Enhanced Notification System with Privacy Feedback
```javascript
// Notification types and styling
{
  friend_request: "👋 New Friend Request",
  friend_accepted: "🎉 Friend Request Accepted", 
  privacy_restricted: "🔒 Schedule access restricted",
  privacy_granted: "🔓 Schedule access granted",
  privacy_updated: "🔄 Privacy settings updated",
  success: "✅ Action Successful",
  error: "❌ Something went wrong",
  connected: "📡 Real-time updates active"
}
```

#### Enhanced Memory Management & Performance
- **Circuit Breaker Protection**: Prevents infinite loops in friend profile updates
- **Automatic Cleanup**: Listeners and timeouts cleaned up on logout/navigation
- **Debounced Operations**: Batched profile updates (15-second intervals) for performance
- **Immediate Privacy Sync**: Privacy changes bypass batching for instant updates
- **Garbage Collection**: Periodic cleanup of stale event subscribers
- **Performance Monitoring**: Memory usage tracking and leak prevention

### Enhanced Database Structure with Privacy Controls

```javascript
// Friend Requests Collection (Unchanged)
{
  id: "request-id",
  fromUserId: "sender-uid",
  toUserId: "recipient-uid", 
  fromUserInfo: { displayName, major, avatar },
  toUserInfo: { displayName, major, avatar },
  status: "pending|accepted|rejected",
  createdAt: timestamp,
  updatedAt: timestamp
}

// Enhanced Friendships Collection with Bilateral Privacy
{
  id: "friendship-id",
  user1Id: "user-1-uid",
  user2Id: "user-2-uid",
  user1Info: { displayName, major, avatar },
  user2Info: { displayName, major, avatar },
  users: ["user-1-uid", "user-2-uid"], // For efficient querying
  
  // Bilateral Privacy Controls (NEW)
  scheduleVisibility: {
    "user-1-uid": true,  // User1's schedule IS visible to User2
    "user-2-uid": false  // User2's schedule IS NOT visible to User1
  },
  
  // Privacy Metadata (NEW)
  privacyMetadata: {
    lastPrivacyUpdate: timestamp,
    privacyUpdatedBy: "user-1-uid",
    privacyVersion: 2  // For future privacy schema migrations
  },
  
  isActive: true,
  createdAt: timestamp,
  lastInteraction: timestamp
}
```

### Enhanced Debug Commands for Privacy System

```javascript
// Available in browser console
debug.help()                     // Show all available commands
debug.status()                   // System status overview
debug.testNotification()         // Test notification system
debug.testPrivacyNotification()  // Test privacy restriction notifications
debug.simulateFriendRequest()    // Create test friend request
debug.simulatePrivacyChange()    // Test privacy status changes
debug.clearNotifications()       // Clear all notifications
debug.circuitBreakerStatus()     // Check circuit breaker states
realTimeManager.getStatus()      // Real-time system status
horizontalFriendsBar.getCircuitBreakerStatus() // Performance monitoring
```

---

## 📅 Enhanced Schedule Management with Privacy Integration

### Privacy-Aware Schedule Grid System

| Component | Element | Purpose | Interactions | Privacy Integration |
| --- | --- | --- | --- | --- |
| **Time Header** | `.time-header` | Display time slots (e.g., "9:00-10:30") | Click to select entire time period | Respects friend privacy settings |
| **Day Columns** | `.day-column` | Monday through Sunday schedule | Drag selection across days | Shows privacy-restricted friend data |
| **Schedule Cells** | `.schedule-cell` | Individual time/day intersections | Click to toggle, hover for tooltip | Tooltip shows privacy restrictions |
| **User Selector** | `#userSelector` | Choose active user for editing | Change event updates UI state | Filters by privacy permissions |
| **Horizontal Friends Bar** | `.horizontal-friends-bar` | Quick access to starred friends | One-tap friend schedule viewing | Visual privacy indicators |

### Enhanced Pin Mode with Privacy Awareness

| State | Visual Indicators | Available Actions | Privacy Considerations |
| --- | --- | --- | --- |
| **Pin Mode Off** | Normal schedule view | Edit any user, compare multiple users | Privacy-filtered friend list |
| **Pin Mode On** | Locked icon, purple accent | Edit only pinned user, visual lock | Respects privacy restrictions |
| **Active User** | Purple-colored time slots | Primary editing target | Own schedule always editable |
| **Privacy Restricted** | Lock icon overlay, disabled state | View-only, "access restricted" notification | Clear visual feedback |

### Schedule Comparison Engine

```javascript
// Color coding for multi-user comparison
const conflictColors = {
  available: "#10b981", // Green - everyone free
  busy: "#ef4444", // Red - everyone busy
  partial: "#f59e0b", // Orange - mixed availability
  active: "#8b5cf6", // Purple - active user's slots
};
```

## 🔧 Key DOM Elements

### SPA Shell Structure (index.html)

| Element               | Selector         | Purpose                    | SPA Behavior                          |
| --------------------- | ---------------- | -------------------------- | ------------------------------------- |
| **App Container**     | `.app-container` | Main application wrapper   | Persistent across navigation          |
| **Top Navigation**    | `.top-nav`       | Global navigation bar      | Always visible, updates active states |
| **Main Content**      | `.main-content`  | Dynamic template container | Content swapped by SPA router         |
| **Loading Indicator** | `.spa-loading`   | Navigation loading state   | Shown during template transitions     |

### Navigation Elements

| Element           | Selector                     | Purpose                 | SPA Integration              |
| ----------------- | ---------------------------- | ----------------------- | ---------------------------- |
| **Logo**          | `[data-spa-route="home"]`    | Navigate to home        | SPA route attribute          |
| **Schedule Link** | `[data-spa-route="home"]`    | Main schedule interface | SPA navigation               |
| **Friends Link**  | `[data-spa-route="friends"]` | Social connections      | SPA navigation               |
| **Profile Menu**  | `#userMenuTrigger`           | User account access     | Dropdown with profile link   |
| **Theme Toggle**  | `.theme-toggle`              | Dark/light mode switch  | Persistent across navigation |

### Authentication Elements (Modal-based)

| Element             | Selector                           | Purpose                        | Event Handling                   |
| ------------------- | ---------------------------------- | ------------------------------ | -------------------------------- |
| **Auth Modal**      | `#auth-modal`                      | Sign-in/sign-up container      | Overlay with backdrop blur       |
| **Tab Buttons**     | `.auth-tab`                        | Switch between sign-in/sign-up | Click handler with active states |
| **Email Fields**    | `#signin-email`, `#signup-email`   | University email input         | Real-time validation             |
| **University Info** | `#university-info`                 | Shows detected university      | Auto-populated display           |
| **Submit Buttons**  | `#signin-button`, `#signup-button` | Form submission                | Loading states with spinners     |

### Schedule Interface Elements (Home Template)

| Element             | Selector                   | Purpose                | Interactions                 |
| ------------------- | -------------------------- | ---------------------- | ---------------------------- |
| **User Selector**   | `#userSelector`            | Choose active user     | Dropdown with user list      |
| **Add User Button** | `.add-user-section button` | Create new user        | Modal trigger                |
| **Compare Button**  | `#compare`                 | Toggle comparison mode | Three-state button           |
| **Pin Mode Button** | `#togglePinModeBtn`        | Lock editing to user   | Visual lock indicator        |
| **Schedule Table**  | `#scheduleTable`           | Main grid interface    | Cell click/drag interactions |
| **Time Headers**    | `.time-header`             | Time period labels     | Click to select column       |
| **Schedule Cells**  | `.schedule-cell`           | Individual time slots  | Hover tooltips, click toggle |

### Profile Setup Elements (Profile Template)

| Element                | Selector                                | Purpose                | Validation                |
| ---------------------- | --------------------------------------- | ---------------------- | ------------------------- |
| **Email Input**        | `#setup-email`                          | University email       | Auto-filled from auth     |
| **Student ID**         | `#setup-student-id`                     | University ID number   | Format validation         |
| **Name Fields**        | `#setup-first-name`, `#setup-last-name` | Personal info          | Required field validation |
| **Major Select**       | `#setup-major`                          | Academic program       | Dropdown selection        |
| **Avatar Builder**     | `.avatar-builder`                       | Custom avatar creation | Interactive color picker  |
| **Step Indicators**    | `.step-indicator`                       | Wizard progress        | Visual progress tracking  |
| **Navigation Buttons** | `#setup-next-btn`, `#setup-prev-btn`    | Wizard navigation      | Step validation           |

### Modal System Elements

| Element              | Selector              | Purpose                  |
| -------------------- | --------------------- | ------------------------ |
| `appModal`           | `#appModal`           | Modal overlay container  |
| `modalContent`       | `.modal-content`      | Modal content wrapper    |
| `modalTitle`         | `#modalTitle`         | Modal title header       |
| `modalMessage`       | `#modalMessage`       | Modal body content       |
| `modalCloseBtn`      | `#modalCloseBtn`      | Close modal button       |
| `modalConfirmBtn`    | `#modalConfirmBtn`    | Confirm action button    |
| `modalCancelBtn`     | `#modalCancelBtn`     | Cancel action button     |
| `modalActionButtons` | `#modalActionButtons` | Action buttons container |

### Time Slot Management Elements

| Element                 | Selector                 | Purpose                    |
| ----------------------- | ------------------------ | -------------------------- |
| `addNewTimeSlotBtn`     | `#addNewTimeSlotBtn`     | Add custom time slots      |
| `addTimeSlotHeaderCell` | `#addTimeSlotHeaderCell` | Header cell for add button |

### Import/Export Elements

| Element          | Selector                 | Purpose                  |
| ---------------- | ------------------------ | ------------------------ |
| `importTextArea` | `#importText`            | JSON import input area   |
| `exportButton`   | `.export-section button` | Export user data trigger |
| `importButton`   | `.import-section button` | Import data trigger      |

---

## 🍔 Navigation & Theme System

**Files:** `js/menu.js`, `css/menu.css`

| Feature               | Implementation                                        |
| --------------------- | ----------------------------------------------------- |
| **Dark/Light Toggle** | `#darkModeToggle` with localStorage persistence       |
| **Page Navigation**   | Three-page structure: Schedule, Friends, About        |
| **Responsive Design** | Mobile-first with glassmorphism effects               |
| **Theme System**      | Auto-detects system preference, remembers user choice |

---

## 👥 User Management & Selection

**Main Section:** `.users-section` in `index.html`

| Component          | CSS Class             | Behavior                           |
| ------------------ | --------------------- | ---------------------------------- |
| **User Item**      | `.user-item`          | Click to select/activate user      |
| **Active State**   | `.user-item.active`   | Purple gradient background         |
| **Selected State** | `.user-item.selected` | Border highlight for comparison    |
| **Delete Button**  | `.delete-btn`         | Remove user with confirmation      |
| **Add User Form**  | `.add-user-section`   | Name and ID inputs with validation |

---

## 📅 Schedule Grid & Time Slots

**Main Component:** `.schedule-section` with dynamic time slots

### Core Features

| Feature               | Description                                            |
| --------------------- | ------------------------------------------------------ |
| **Editable Headers**  | Click time slot headers to edit start/end times        |
| **Custom Time Slots** | Add new time periods via `#addNewTimeSlotBtn`          |
| **Pin Mode**          | Focus editing on one user with visual indicators       |
| **Responsive Grid**   | Horizontal scroll on mobile, optimized for touch       |
| **Sticky Headers**    | Day labels and time headers stay visible during scroll |

### Slot Color Coding

| Color  | CSS Class        | Meaning                            |
| ------ | ---------------- | ---------------------------------- |
| Green  | `.slot-free`     | Time slot is available/free        |
| Red    | `.slot-conflict` | Time slot is busy/conflicted       |
| Orange | `.slot-partial`  | Partial overlap in comparison mode |
| Purple | `.slot-selected` | Selected slot for active user      |

### Interactive Elements

| Element            | Behavior                            |
| ------------------ | ----------------------------------- |
| **Time Headers**   | Click to edit (when user is active) |
| **Schedule Slots** | Click to toggle availability        |
| **Pin Indicators** | Click existing pins to unpin        |
| **Add Pin (+)**    | Click to pin slot in pin mode       |
| **Tooltips**       | Hover for comparison details        |

### Grid Layout Structure

```
Day/Time | 8:00-9:30 | 9:40-11:10 | ... | [+]
---------|-----------|------------|-----|----
Sunday   | [slot]    | [slot]     | ... |
Monday   | [slot]    | [slot]     | ... |
...      | ...       | ...        | ... |
```

### Dynamic Time Slot Management

- **Default Slots:** 6 predefined time periods (8:00-9:30, etc.)
- **Custom Slots:** Users can add/edit their own time periods
- **Validation:** Start time must be before end time
- **Format Support:** HH:MM and H:MM AM/PM formats accepted

---

## 🚀 Advanced Features

**New in Version 3.0** - Enhanced functionality for power users:

### Pin Mode System

**Files:** `js/script.js`, `css/schedule-grid.css`

| Feature               | Implementation                                     |
| --------------------- | -------------------------------------------------- |
| **Pin Mode Toggle**   | `#togglePinModeBtn` activates focused editing mode |
| **Visual Indicators** | Pin icons show locked time slots for active user   |
| **Smart UI Updates**  | Add/remove pin buttons appear dynamically          |
| **State Persistence** | Pin states saved with user data                    |

### Advanced Schedule Features

**Files:** `js/scheduleGeneration.js`, `css/schedule-grid.css`

| Feature                | Description                                         |
| ---------------------- | --------------------------------------------------- |
| **Dynamic Time Slots** | Add/edit custom time periods beyond default 6 slots |
| **Conflict Detection** | Automatic highlighting of scheduling conflicts      |
| **Hover Tooltips**     | Detailed comparison information on hover            |
| **Sticky Navigation**  | Headers remain visible during scroll                |

### Accessibility Enhancements

**Files:** `css/accessibility.css`, various JS modules

| Feature                   | Implementation                              |
| ------------------------- | ------------------------------------------- |
| **Keyboard Navigation**   | Full tab order and keyboard shortcuts       |
| **Screen Reader Support** | ARIA labels and semantic HTML structure     |
| **Focus Management**      | Clear focus indicators and logical tab flow |
| **High Contrast Mode**    | Enhanced visibility for low vision users    |

### Advanced Performance Optimizations

| Feature | Implementation | Privacy Integration |
| --- | --- | --- |
| **Circuit Breaker Pattern** | Prevents infinite loops in HorizontalFriendsBar | Protects against privacy update cascades |
| **Debounced Operations** | Batched profile updates (15-second intervals) | Immediate privacy sync bypasses batching |
| **Lightweight Rendering** | Privacy-specific visual updates | Updates lock icons without full re-renders |
| **Memory Management** | Automatic cleanup of listeners and timeouts | Privacy listeners cleaned up properly |
| **DOM Caching** | Elements cached in `domElements.js` | Fast access for privacy indicator updates |
| **State Management** | Efficient updates with minimal DOM manipulation | Separate privacy and profile update flows |

---

## 💬 Modals & Forms

**System:** `js/modal.js`, `css/modal.css`

| Modal Type           | Trigger               | Purpose                     |
| -------------------- | --------------------- | --------------------------- |
| **Time Slot Editor** | Click schedule header | Edit existing time slots    |
| **Add Time Slot**    | Click "+" button      | Create new time periods     |
| **Confirmations**    | Delete actions        | User confirmation dialogs   |
| **Import/Export**    | Data transfer         | JSON schedule import/export |

---

## 🎨 CSS Architecture & Styling System

### Modular CSS Organization

The styling system is organized into 9 specialized modules for maintainability and performance:

| Module                        | Responsibilities                                       |
| ----------------------------- | ------------------------------------------------------ |
| `styles.css`                  | Design system variables, base typography, layout grid  |
| `glassmorphism.css`           | Modern glass effects, backdrop filters, transparency   |
| `responsive-enhancements.css` | Breakpoints, mobile optimizations, touch interactions  |
| `schedule-grid.css`           | Table layout, slot styling, pin indicators             |
| `user-management.css`         | User list styling, selection states, action buttons    |
| `modal.css`                   | Overlay system, dialog styling, glassmorphism effects  |
| `menu.css`                    | Navigation components, theme toggle, hamburger menu    |
| `animations.css`              | Transitions, hover effects, micro-interactions         |
| `accessibility.css`           | Focus indicators, screen reader support, high contrast |

### Schedule Slot States

| Class            | Applied To        | Effect                            |
| ---------------- | ----------------- | --------------------------------- |
| `.slot`          | Schedule cells    | Base slot styling                 |
| `.slot-free`     | Available slots   | Green background (available)      |
| `.slot-conflict` | Overlapping slots | Red background (busy/conflict)    |
| `.slot-partial`  | Partial conflicts | Orange background (some overlap)  |
| `.slot-selected` | Active slots      | Purple background (user selected) |
| `.slot-restricted` | Privacy-blocked slots | Grayed out with lock icon overlay |

### Interactive States

| Class                       | Applied To          | Effect                          |
| --------------------------- | ------------------- | ------------------------------- |
| `.active`                   | Buttons, user items | Indicates active/selected state |
| `.selected`                 | User items          | Shows comparison selection      |
| `.editable-timeslot-header` | Time headers        | Clickable time slot headers     |
| `.can-pin-indicator`        | Schedule slots      | "+" icon for pin mode           |
| `.pin-indicator`            | Pinned slots        | Pin icon for pinned slots       |
| `.privacy-lock-icon`        | Privacy-restricted elements | Lock icon overlay for restricted access |
| `.friend-avatar.disabled`   | Restricted friend avatars   | Opacity reduction, "not-allowed" cursor |

### Component Classes

| Class          | Applied To      | Effect                        |
| -------------- | --------------- | ----------------------------- |
| `.glass-card`  | Sections        | Glassmorphism container style |
| `.user-item`   | User list items | Individual user styling       |
| `.delete-btn`  | Delete buttons  | User deletion button styling  |
| `.day-label`   | Schedule days   | Day name column styling       |
| `.time-header` | Time columns    | Time slot header styling      |

### Theme & Layout Classes

| Class               | Applied To         | Effect                      |
| ------------------- | ------------------ | --------------------------- |
| `.dark-mode`        | Body               | Dark theme styling          |
| `.content-grid`     | Main layout        | Grid layout container       |
| `.schedule-column`  | Schedule section   | Schedule grid column        |
| `.controls-column`  | Control panels     | Controls sidebar column     |
| `.schedule-wrapper` | Schedule container | Scrollable schedule wrapper |

### Privacy & Performance Classes

| Class | Applied To | Effect | Privacy Integration |
| --- | --- | --- | --- |
| `.privacy-restricted` | Friend elements | Visual indication of restricted access | Shows lock icons and disabled states |
| `.privacy-accessible` | Friend elements | Normal interaction state | Full interaction capabilities |
| `.circuit-breaker-active` | Performance-protected elements | Temporary disabled state | Prevents infinite update loops |
| `.real-time-updating` | Elements receiving updates | Visual feedback during updates | Shows privacy changes in progress |

### Responsive Classes

| Class           | Applied To | Effect                    |
| --------------- | ---------- | ------------------------- |
| `.hide-mobile`  | Elements   | Hidden on mobile devices  |
| `.hide-tablet`  | Elements   | Hidden on tablet devices  |
| `.hide-desktop` | Elements   | Hidden on desktop devices |

---

## 🧪 Enhanced Testing Integration

CampXus includes comprehensive Jest-based testing with 90%+ code coverage, including privacy system and performance optimization testing:

### Enhanced Test Coverage Areas

| Test Suite | Coverage | Privacy Integration |
| --- | --- | --- |
| `script.test.js` | Core state management, user operations, schedule logic | Privacy-aware schedule viewing |
| `modal.test.js` | Modal system, confirmation dialogs, event handling | Privacy restriction notifications |
| `timeUtils.test.js` | Time parsing, validation, format conversion | Time slot privacy filtering |
| `horizontalFriendsBar.test.js` | Quick access bar functionality | Circuit breaker and privacy indicator testing |
| `privacyService.test.js` | Privacy control logic | Bilateral privacy settings, real-time updates |

### Testing Patterns

| Pattern             | Implementation                                       |
| ------------------- | ---------------------------------------------------- |
| **State Testing**   | Mock state manipulation with `_setStateForTesting()` |
| **DOM Testing**     | JSDOM environment for UI component testing           |
| **Event Testing**   | Simulated user interactions and event handling       |
| **Utility Testing** | Unit tests for pure functions and utilities          |

### Enhanced Quality Assurance

| Metric | Current Status | Privacy & Performance |
| --- | --- | --- |
| **Code Coverage** | 90%+ across core functionality | Privacy system and performance optimizations covered |
| **Test Automation** | npm test script with CI/CD integration ready | Privacy change simulation and circuit breaker testing |
| **Mock Strategy** | Comprehensive mocking for external dependencies | Firebase privacy listeners and real-time updates mocked |
| **Edge Case Coverage** | Validation, error handling, and boundary conditions | Privacy edge cases, infinite loop prevention testing |
| **Performance Testing** | Memory leak detection and optimization validation | Circuit breaker effectiveness and cleanup verification |

---

## 🔄 Development Workflows

### SPA Component Development

**Adding a New Page:**

1. Create template in `templates/your-page.html`
2. Add route configuration to `spa-router.js`
3. Add navigation link with `data-spa-route="your-page"`
4. Create component initialization in `js/core/your-page.js`
5. Listen for `spa:navigation` events for setup/cleanup

**Authentication Integration:**

```javascript
// Check auth state in your component
document.addEventListener("spa:navigation", (event) => {
  if (event.detail.route === "protected-page") {
    if (!window.authManager?.getCurrentUser()) {
      // Redirect to auth or show auth modal
      window.authManager?.showAuthModal();
    }
  }
});
```

### Firebase Integration Workflow

**Environment Setup:**

1. Create `.env.local` with Firebase config
2. Run `npm run dev:config` to generate browser config
3. Use `npm run dev:serve` for secure development

**Authentication Flow:**

1. User signs up with university email
2. Email verification required (auto-handled)
3. Profile setup wizard guides user through onboarding
4. Full app access granted after profile completion

### CSS Development Patterns

**Adding New Styles:**

- Add to appropriate module (e.g., `components.css` for UI elements)
- Use CSS custom properties for themeable values
- Follow BEM naming convention for classes
- Test in both light and dark themes

**Responsive Design:**

- Mobile-first approach with `min-width` media queries
- Use modern CSS features (grid, flexbox, container queries)
- Test across different device sizes

### Testing Workflow

**Before Committing:**

```bash
npm test                    # Run all tests
npm run dev:check          # Validate environment
npm run dev:serve          # Test in browser
```

**Writing Tests:**

- Test user interactions and core functionality
- Mock Firebase for authentication tests
- Use descriptive test names and clear assertions
- Aim for 90%+ code coverage

---

## 📚 Learning Resources & References

### For Beginners

- **SPA Concepts:** [SPA-All-that-you-need.md](../SPA-All-that-you-need.md)
- **Phase-by-Phase Learning:** Check `/Phases/` directory
- **Adding New Pages:** [HOW-TO-ADD-NEW-PAGES.md](./HOW-TO-ADD-NEW-PAGES.md)

### For Advanced Developers

- **Architecture Patterns:** Study the modular JavaScript structure
- **Firebase Integration:** Review authentication and database patterns
- **Testing Strategies:** Examine comprehensive Jest test suites
- **Performance Optimization:** Learn from DOM caching and state management

### Quick Reference

- **Router API:** `window.spaRouter.navigateTo(route)`
- **Auth API:** `window.authManager.getCurrentUser()`
- **Theme API:** `document.documentElement.setAttribute('data-theme', 'dark')`
- **Modal API:** `window.showModal({title, message, onConfirm})`

---

_This comprehensive UI reference map serves as your complete guide to understanding and extending the CampXus Privacy-Aware Quick Access System. The enhanced architecture provides real-time privacy controls, performance optimizations, and seamless user experience while maintaining clear separation of concerns and bilateral privacy protection._
