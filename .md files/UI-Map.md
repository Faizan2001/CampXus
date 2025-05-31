# 🗺️ CampXus: UI Reference Map & Developer Guide

**Version:** 3.0 (Modular Architecture with Advanced Features)
**Last Updated:** December 2024

A comprehensive guide to DOM elements, their JavaScript interactions, and CSS styling in the CampXus scheduling application. This document reflects the current modular architecture with 9 CSS modules and 8 JavaScript modules, including advanced features like pin mode, glassmorphism design, and comprehensive testing.

---

## 📌 Table of Contents

1. [Global App State](#-global-app-state)
2. [Modular Architecture Overview](#-modular-architecture-overview)
3. [Key DOM Elements](#-key-dom-elements)
4. [Navigation & Theme System](#-navigation--theme-system)
5. [User Management & Selection](#-user-management--selection)
6. [Schedule Grid & Time Slots](#-schedule-grid--time-slots)
7. [Advanced Features](#-advanced-features)
8. [Modals & Forms](#-modals--forms)
9. [CSS Architecture & Styling System](#-css-architecture--styling-system)
10. [Key User Workflows](#-key-user-workflows)
11. [Testing Integration](#-testing-integration)

---

## 🌎 Global App State

Central data store managed in `js/script.js`:

| Variable          | Type        | Description                                              |
| ----------------- | ----------- | -------------------------------------------------------- |
| `activeUserId`    | String/null | ID of currently selected user for editing                |
| `users`           | Object      | Dictionary of user objects with schedules and time slots |
| `selectedUserIds` | Set         | User IDs selected for comparison mode                    |
| `compareMode`     | Boolean     | Toggle between edit and compare modes                    |
| `pinModeActive`   | Boolean     | Lock editing to active user only                         |

---

## 🏗️ Modular Architecture Overview

CampXus follows a modular architecture with separation of concerns:

### JavaScript Modules (8 Core Modules)

| Module                  | Purpose                                     | Dependencies           |
| ----------------------- | ------------------------------------------- | ---------------------- |
| `script.js`             | Main application logic and state management | All other modules      |
| `domElements.js`        | DOM element caching and initialization      | None                   |
| `modal.js`              | Modal system for dialogs and confirmations  | domElements            |
| `menu.js`               | Navigation and theme management             | domElements            |
| `timeUtils.js`          | Time parsing and validation utilities       | None                   |
| `scheduleGeneration.js` | Schedule grid rendering and interactions    | domElements, timeUtils |
| `userManagement.js`     | User creation, deletion, and selection      | domElements, modal     |
| `storageManager.js`     | Data persistence and import/export          | None                   |

### CSS Modules (9 Styling Modules)

| Module                        | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `styles.css`                  | Base styles and design system foundation      |
| `glassmorphism.css`           | Glassmorphism effects and visual aesthetics   |
| `responsive-enhancements.css` | Mobile-first responsive design                |
| `schedule-grid.css`           | Schedule table layout and interactions        |
| `user-management.css`         | User list styling and selection states        |
| `modal.css`                   | Modal dialogs and overlay system              |
| `menu.css`                    | Navigation and theme toggle components        |
| `animations.css`              | Transitions, hover effects, and interactions  |
| `accessibility.css`           | Screen reader support and keyboard navigation |

### Testing Modules (3 Test Files)

| Test File           | Coverage                                    |
| ------------------- | ------------------------------------------- |
| `script.test.js`    | Core state management and utility functions |
| `modal.test.js`     | Modal system functionality                  |
| `timeUtils.test.js` | Time parsing and validation                 |

---

## 🔧 Key DOM Elements

Cached in `js/domElements.js` for performance:

### User Management Elements

| Element             | Selector                   | Purpose                       |
| ------------------- | -------------------------- | ----------------------------- |
| `userNameInput`     | `#userName`                | New user name input           |
| `userIdInput`       | `#userId`                  | New user ID input             |
| `userListContainer` | `#userList`                | Container for user list items |
| `addUserButton`     | `.add-user-section button` | Add new user trigger          |

### Schedule & Comparison Elements

| Element            | Selector            | Purpose                  |
| ------------------ | ------------------- | ------------------------ |
| `scheduleTable`    | `#scheduleTable`    | Main schedule grid       |
| `compareButton`    | `#compare`          | Toggle compare mode      |
| `togglePinModeBtn` | `#togglePinModeBtn` | Toggle pin mode          |
| `slotTooltip`      | `#slotTooltip`      | Hover tooltips for slots |

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

### Performance Optimizations

| Feature              | Implementation                                      |
| -------------------- | --------------------------------------------------- |
| **DOM Caching**      | Elements cached in `domElements.js` for fast access |
| **Modular Loading**  | CSS/JS loaded only when needed                      |
| **State Management** | Efficient updates with minimal DOM manipulation     |
| **Local Storage**    | Persistent data without server dependencies         |

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

### Interactive States

| Class                       | Applied To          | Effect                          |
| --------------------------- | ------------------- | ------------------------------- |
| `.active`                   | Buttons, user items | Indicates active/selected state |
| `.selected`                 | User items          | Shows comparison selection      |
| `.editable-timeslot-header` | Time headers        | Clickable time slot headers     |
| `.can-pin-indicator`        | Schedule slots      | "+" icon for pin mode           |
| `.pin-indicator`            | Pinned slots        | Pin icon for pinned slots       |

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

### Responsive Classes

| Class           | Applied To | Effect                    |
| --------------- | ---------- | ------------------------- |
| `.hide-mobile`  | Elements   | Hidden on mobile devices  |
| `.hide-tablet`  | Elements   | Hidden on tablet devices  |
| `.hide-desktop` | Elements   | Hidden on desktop devices |

---

## 🧪 Testing Integration

CampXus includes comprehensive Jest-based testing with 90%+ code coverage:

### Test Coverage Areas

| Test Suite          | Coverage                                               |
| ------------------- | ------------------------------------------------------ |
| `script.test.js`    | Core state management, user operations, schedule logic |
| `modal.test.js`     | Modal system, confirmation dialogs, event handling     |
| `timeUtils.test.js` | Time parsing, validation, format conversion            |

### Testing Patterns

| Pattern             | Implementation                                       |
| ------------------- | ---------------------------------------------------- |
| **State Testing**   | Mock state manipulation with `_setStateForTesting()` |
| **DOM Testing**     | JSDOM environment for UI component testing           |
| **Event Testing**   | Simulated user interactions and event handling       |
| **Utility Testing** | Unit tests for pure functions and utilities          |

### Quality Assurance

| Metric                 | Current Status                                      |
| ---------------------- | --------------------------------------------------- |
| **Code Coverage**      | 90%+ across core functionality                      |
| **Test Automation**    | npm test script with CI/CD integration ready        |
| **Mock Strategy**      | Comprehensive mocking for external dependencies     |
| **Edge Case Coverage** | Validation, error handling, and boundary conditions |

---

## 🔄 Key User Workflows

### Basic Operations

1. **Add User**: Input name/ID → Click "Add User" → User appears in list with default schedule
2. **Edit Schedule**: Select user → Click schedule slots to toggle availability (green/red)
3. **Delete User**: Click red delete button → Confirm deletion in modal dialog

### Advanced Schedule Management

4. **Custom Time Slots**:
   - Click "+" button in header → Enter start/end times → Validate format → Add to schedule
   - Click existing time headers → Edit start/end times → Update all users' schedules
5. **Pin Mode Workflow**:
   - Select active user → Enable pin mode → Click "+" on free slots to pin
   - Pinned slots show pin icon → Click pin icon to unpin
   - Pin mode focuses editing on selected user only

### Comparison & Analysis

6. **Compare Schedules**:
   - Enable compare mode → Select multiple users from list
   - View color-coded overlaps → Hover for detailed tooltips
   - Identify conflicts (red) and partial overlaps (orange)
7. **Import/Export Data**:
   - Export: Select user → Click export → Copy JSON to clipboard
   - Import: Paste JSON data → Validate format → Merge into application

### UI & Theme Management

8. **Theme Toggle**: Switch between dark/light modes with automatic persistence
9. **Responsive Navigation**: Mobile hamburger menu → Desktop persistent navigation
10. **Keyboard Navigation**: Tab through elements → Enter to activate → Escape to close modals

### Error Handling Workflows

- **Validation Errors**: Invalid time formats show inline error messages
- **Conflict Detection**: Overlapping time slots highlighted in comparison mode
- **Data Recovery**: LocalStorage backup prevents data loss on refresh
- **Modal Confirmations**: Critical actions (delete user) require confirmation

---

## 🧠 JavaScript Functions Reference

### Core State Management (`js/script.js`)

| Function                 | Purpose                                | Parameters                        |
| ------------------------ | -------------------------------------- | --------------------------------- |
| `getState()`             | Returns current app state              | None                              |
| `createUserObject()`     | Creates new user with default schedule | name, userId, currentUsers        |
| `deleteUserFromState()`  | Removes user from state                | userId, currentState              |
| `toggleSlotInSchedule()` | Toggles slot availability              | dayIndex, timeIndex, userSchedule |

### UI Rendering Functions (`js/scheduleGeneration.js`)

| Function                | Purpose                                 | Parameters                        |
| ----------------------- | --------------------------------------- | --------------------------------- |
| `updateUI()`            | Re-renders entire interface             | None                              |
| `renderScheduleGrid()`  | Renders schedule table                  | None                              |
| `renderUserList()`      | Renders user list with selection states | None                              |
| `determineSlotStatus()` | Calculates slot color/state             | dayIndex, timeIndex, currentState |

### User Management (`js/userManagement.js`)

| Function                      | Purpose                        | Trigger               |
| ----------------------------- | ------------------------------ | --------------------- |
| `handleAddNewUser()`          | Creates new user               | Add User button click |
| `handleDeleteUser()`          | Removes user with confirmation | Delete button click   |
| `handleToggleCompareMode()`   | Switches comparison mode       | Compare button click  |
| `handleTogglePinMode()`       | Toggles pin mode               | Pin Mode button click |
| `handleTimeSlotHeaderClick()` | Opens time slot editor         | Time header click     |

### Time Slot Management (`js/timeUtils.js`)

| Function                          | Purpose                               | Parameters            |
| --------------------------------- | ------------------------------------- | --------------------- |
| `handleAddNewTimeSlotClick()`     | Opens add time slot modal             | None                  |
| `addCustomTimeSlotToActiveUser()` | Adds new time period                  | startTime, endTime    |
| `openEditTimeSlotModal()`         | Opens edit modal for existing slot    | slotIndex, userObject |
| `processTimeSlotEdit()`           | Validates and saves time slot changes | slotIndex, userObject |

### Modal System (`js/modal.js`)

| Function      | Purpose                       | Parameters                            |
| ------------- | ----------------------------- | ------------------------------------- |
| `showModal()` | Displays modal with content   | {title, content, onConfirm, onCancel} |
| `hideModal()` | Closes currently open modal   | None                                  |
| `initModal()` | Sets up modal event listeners | domElements                           |

### Utility Functions (`js/timeUtils.js`)

| Function              | Purpose                            | Parameters   |
| --------------------- | ---------------------------------- | ------------ |
| `parseTime()`         | Converts time string to 24h format | timeString   |
| `isValidTimeFormat()` | Validates time format              | timeString   |
| `isTimeBefore()`      | Compares two time strings          | time1, time2 |
| `convertToHHMM()`     | Standardizes time format           | timeString   |

### Storage Management (`js/storageManager.js`)

| Function                 | Purpose                             | Parameters |
| ------------------------ | ----------------------------------- | ---------- |
| `loadStateFromStorage()` | Loads saved data from localStorage  | None       |
| `saveStateToStorage()`   | Saves current state to localStorage | state      |
| `exportUserData()`       | Exports user data as JSON           | userId     |
| `importUserData()`       | Imports JSON data into app          | jsonData   |

---

_This comprehensive map covers all essential UI components, interactions, and implementation details in the current modular architecture. Each module serves a specific purpose and works together to create a cohesive, maintainable, and well-tested application._

## 📚 Additional Resources

- **Architecture Guide**: See the modular structure with 9 CSS and 8 JavaScript modules
- **Testing Patterns**: Review `js/*.test.js` files for comprehensive unit test examples
- **Responsive Design**: Check `css/responsive-enhancements.css` for mobile-first optimizations
- **Theme System**: Examine `js/menu.js` for advanced dark/light mode implementation
- **Modal Components**: Study `css/modal.css` for glassmorphism modal styling
- **Accessibility**: Reference `css/accessibility.css` for inclusive design patterns
- **Performance**: Review `js/domElements.js` for efficient DOM caching strategies
- **State Management**: Analyze `js/script.js` for centralized state handling patterns
