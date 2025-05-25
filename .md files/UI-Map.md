# 🗺️ CampXus: UI Reference Map & Developer Guide

**Version:** 2.0 (Modern Responsive Design with Enhanced Features)
**Last Updated:** May 25, 2025

A guide to DOM elements, their JavaScript interactions, and CSS styling in the CampXus app, aiding development and debugging.

---

## 📌 Table of Contents

1. [Global App State](#-global-app-state)
2. [Key DOM Elements](#-key-dom-elements)
3. [Navigation & Theme System](#-navigation--theme-system)
4. [User Management & Selection](#-user-management--selection)
5. [Schedule Grid & Time Slots](#-schedule-grid--time-slots)
6. [Modals & Forms](#-modals--forms)
7. [CSS Classes & States](#-css-classes--states)
8. [Key User Workflows](#-key-user-workflows)

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

## 💬 Modals & Forms

**System:** `js/modal.js`, `css/modal.css`

| Modal Type           | Trigger               | Purpose                     |
| -------------------- | --------------------- | --------------------------- |
| **Time Slot Editor** | Click schedule header | Edit existing time slots    |
| **Add Time Slot**    | Click "+" button      | Create new time periods     |
| **Confirmations**    | Delete actions        | User confirmation dialogs   |
| **Import/Export**    | Data transfer         | JSON schedule import/export |

---

## 🎨 CSS Classes & States

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

### UI Rendering Functions

| Function                | Purpose                                 | Parameters                        |
| ----------------------- | --------------------------------------- | --------------------------------- |
| `updateUI()`            | Re-renders entire interface             | None                              |
| `renderScheduleGrid()`  | Renders schedule table                  | None                              |
| `renderUserList()`      | Renders user list with selection states | None                              |
| `determineSlotStatus()` | Calculates slot color/state             | dayIndex, timeIndex, currentState |

### Event Handlers

| Function                      | Purpose                        | Trigger               |
| ----------------------------- | ------------------------------ | --------------------- |
| `handleAddNewUser()`          | Creates new user               | Add User button click |
| `handleDeleteUser()`          | Removes user with confirmation | Delete button click   |
| `handleToggleCompareMode()`   | Switches comparison mode       | Compare button click  |
| `handleTogglePinMode()`       | Toggles pin mode               | Pin Mode button click |
| `handleTimeSlotHeaderClick()` | Opens time slot editor         | Time header click     |

### Time Slot Management

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

---

_This comprehensive map covers all essential UI components, interactions, and implementation details. For specific code examples and testing patterns, refer to the modular JavaScript files in the `js/` directory and their corresponding test files._

## 📚 Additional Resources

- **Testing Patterns**: See `js/*.test.js` files for unit test examples
- **Responsive Design**: Check `css/responsive-enhancements.css` for mobile optimizations
- **Theme System**: Review `js/menu.js` for dark/light mode implementation
- **Modal Components**: Examine `css/modal.css` for glassmorphism modal styling
