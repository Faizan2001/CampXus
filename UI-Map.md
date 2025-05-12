# 🗺️ MeetchuThere: UI Reference Map & Developer Guide

**Version:** 1.0
**Last Updated:** [Date of last update]

This document serves as a comprehensive reference for the Document Object Model (DOM) elements used in the "MeetchuThere" application. It maps HTML elements to their corresponding JavaScript interactions and CSS styling, facilitating easier onboarding for new developers and serving as a quick-glance guide for ongoing development and debugging.

---

## 📌 Table of Contents

1.  [Global JavaScript State & Key Variables](#-global-javascript-state--key-variables)
2.  [Header Section](#-header-section)
3.  [User Management Section (`<section class="users">`)](#-user-management-section-section-classusers)
    *   [Add User Form (`<div class="add-user">`)](#-add-user-form-div-classadd-user)
    *   [User List Display (`<div id="userList">`)](#-user-list-display-div-iduserlist)
    *   [Schedule Comparison Control](#-schedule-comparison-control)
4.  [Schedule Grid Section (`<section class="schedule">`)](#-schedule-grid-section-section-classschedule)
    *   [Schedule Table (`<table id="schedule">`)](#-schedule-table-table-idschedule)
    *   [Slot Tooltip (`<div id="slotTooltip">`)](#-slot-tooltip-div-idslottooltip)
5.  [Export/Import Section (`<div class="export-import">`)](#-exportimport-section-div-classexport-import)
6.  [Key CSS Utility & State Classes](#-key-css-utility--state-classes)
7.  [Key User Workflows & Interactions](#-key-user-workflows--interactions)
8.  [How to Use This Document](#-how-to-use-this-document)

---

## 🌎 Global JavaScript State & Key Variables

These variables are central to the application's logic and are defined in `script.js`.

| 🔤 Variable        | 🧬 Type    | 🧠 Description & Key Functions                                                                                                |
| :------------------ | :--------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `activeUser`      | `String`   | Stores the ID of the user whose schedule is currently being edited. `null` if no user is active or in compare mode. Set by `setActiveUser()`. |
| `users`           | `Object`   | A dictionary holding all user data, keyed by `userId`. Each user object contains `id`, `name`, and a 2D `schedule` array. Managed by `createUser()`, `deleteUser()`, `saveUsersToStorage()`, `loadUsersFromStorage()`, `importSchedule()`. |
| `selectedUsers`   | `Set`      | A set of `userId`s for users selected for schedule comparison. Managed by `toggleUserSelection()`. Cleared when `compareMode` changes. |
| `compareMode`     | `Boolean`  | Toggles the application between schedule editing mode (`false`) and schedule comparison mode (`true`). Toggled by `compareSchedules()`. |

---

## 🗣️ Header Section

| 🔧 UI Element      | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                  | 🧠 Key JavaScript Interactions | 🎨 Relevant CSS Classes |
| :--------------- | :------------------------- | :-------------------------------------------------------- | :----------------------------- | :---------------------- |
| Application Title| `header > h1`              | Displays the main title "MeetchuThere" of the application. | N/A (Static content)           | `h1` (for gradient text & underline) |

---

## 🧑‍🤝‍🧑 User Management Section (`<section class="users">`)

This section handles the creation of new users, lists existing users, and allows toggling into comparison mode.

### ➕ Add User Form (`<div class="add-user">`)

| 🔧 UI Element       | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                                                    | 🧠 Key JavaScript Interactions                                                                          | 🎨 Relevant CSS Classes |
| :------------------ | :------------------------- | :------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------ | :---------------------- |
| Name Input Field    | `input#userName`           | Text input for the new user's name.                                                         | Value read by `addNewUser()`. Input event listener for `/[^a-zA-Z\s]/g` validation.                     | General `input` styles  |
| User ID Input Field | `input#userId`             | Text input for the new user's unique ID (numeric).                                          | Value read by `addNewUser()`. Input event listener for `/[^0-9]/g` and `/^0+/` validation.             | General `input` styles  |
| "Add User" Button | `div.add-user > button`    | Submits the new user's name and ID.                                                         | `onclick="addNewUser()"` which calls `createUser()` and `setActiveUser()`. Resets input fields.       | General `button` styles |
| Form Container      | `div.add-user`             | Wrapper for the user addition form elements.                                                | N/A                                                                                                     | `.add-user` (grid layout) |

### 📋 User List Display (`<div id="userList">`)

| 🔧 UI Element         | 🔍 DOM Selector (ID/Class)         | 📝 Description & Purpose                                                                                                   | 🧠 Key JavaScript Interactions                                                                                                          | 🎨 Relevant CSS Classes      |
| :-------------------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------- |
| User List Container | `div#userList`                     | Dynamically populated container displaying all registered users.                                                           | Content generated by `renderUserList()`.                                                                                                | `.user-list` (flex layout)   |
| User Item             | `div.user-item` (dynamic)          | Container for an individual user's display name button and delete button.                                                  | Class `active` added if `activeUser === userId`. Class `selected` added if `selectedUsers.has(userId)`.                               | `.user-item`, `.active`, `.selected` |
| User Name Button      | `div.user-item > button:first-child` (dynamic) | Displays user's name. Click behavior depends on `compareMode`.                                                 | If `compareMode` is `false`: `onclick="setActiveUser(userId)"`. <br> If `compareMode` is `true`: `onclick="toggleUserSelection(userId)"`. | General `button` styles      |
| Delete User Button  | `button.delete-btn` (dynamic)      | Allows deletion of the associated user.                                                                                    | `onclick="deleteUser(userId)"`.                                                                                                         | `.delete-btn` (specific red styling) |

### ⚖️ Schedule Comparison Control

| 🔧 UI Element            | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                                                                                | 🧠 Key JavaScript Interactions                                           | 🎨 Relevant CSS Classes |
| :----------------------- | :------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- | :---------------------- |
| "Compare Schedules" Button | `button#compare`           | Toggles the application between schedule editing mode and schedule comparison mode. Visual state changes when active. | `onclick="compareSchedules()"`. Toggles `compareMode`, clears `selectedUsers` and `activeUser`. Adds/removes `active` class. | `#compare`, `.active` (when compare mode is on) |

---

## 🗓️ Schedule Grid Section (`<section class="schedule">`)

Displays the weekly schedule and allows users to mark their availability or view compared availability.

### 📊 Schedule Table (`<table id="schedule">`)

| 🔧 UI Element           | 🔍 DOM Selector (ID/Class)           | 📝 Description & Purpose                                                                                                                   | 🧠 Key JavaScript Interactions                                                                                                                                                                    | 🎨 Relevant CSS Classes                      |
| :---------------------- | :----------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------- |
| Schedule Table          | `table#schedule`                     | The main table structure displaying days of the week (rows) and time slots (columns).                                                      | N/A (Structure)                                                                                                                                                                                   | General `table`, `th`, `td` styles           |
| Time Slot Cell          | `td.slot`                            | Represents an individual time slot. Clickable to toggle availability (edit mode) or show tooltip (compare mode). Has `data-day` and `data-time` attributes. | Click listener: If not `compareMode`, calls `toggleSlot(day, time)`. If `compareMode`, calls `showSlotTooltip(slot, day, time)`. <br> Mouseenter listener: If `compareMode`, calls `showSlotTooltip(slot, day, time)`. <br> Mouseleave listener: Calls `hideSlotTooltip()`. | `.slot` (base styling, cursor)               |
| Selected Time Slot    | `td.slot.slot-selected`              | A time slot marked as busy/unavailable by the `activeUser`.                                                                                | Class added/removed by `updateSlotDisplay()` based on `users[activeUser].schedule[day][time]`.                                                                                                 | `.slot-selected` (e.g., purple background)   |
| Free Time Slot (Compare)| `td.slot.slot-free`                  | In compare mode, indicates all `selectedUsers` are free during this time slot.                                                             | Class added by `updateSlotDisplay()` if all selected users are free.                                                                                                                              | `.slot-free` (e.g., green background)        |
| Conflict Time Slot (Compare)| `td.slot.slot-conflict`            | In compare mode, indicates all `selectedUsers` are busy/unavailable during this time slot.                                                 | Class added by `updateSlotDisplay()` if all selected users are busy.                                                                                                                              | `.slot-conflict` (e.g., red background)      |
| Partial Conflict Slot (Compare)| `td.slot.slot-partial`             | In compare mode, indicates some `selectedUsers` are free and some are busy during this time slot.                                          | Class added by `updateSlotDisplay()` if there's a mix of availability.                                                                                                                            | `.slot-partial` (e.g., orange background)    |

### 💬 Slot Tooltip (`<div id="slotTooltip">`)

| 🔧 UI Element | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                                                              | 🧠 Key JavaScript Interactions                                                                                                                                    | 🎨 Relevant CSS Classes |
| :------------ | :------------------------- | :---------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------- |
| Slot Tooltip  | `div#slotTooltip`          | A small pop-up that appears when hovering over a time slot in `compareMode`, showing who is free/busy. | Display style (`block`/`none`), position, and `textContent` are managed by `showSlotTooltip()` and `hideSlotTooltip()`. Content depends on `selectedUsers` availability. | `.slot-tooltip`         |

---

## 📤📥 Export/Import Section (`<div class="export-import">`)

Allows users to export their schedule data or import existing schedule data.

| 🔧 UI Element               | 🔍 DOM Selector (ID/Class)   | 📝 Description & Purpose                                                                                                   | 🧠 Key JavaScript Interactions                                                                                                                                                              | 🎨 Relevant CSS Classes |
| :-------------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------- |
| "Export Current User" Button| `div.export-import > button` (first one) | Exports the `activeUser`'s schedule data as a JSON string.                                                                 | `onclick="exportCurrentUser()"`. Copies JSON to clipboard and (intended) displays it in `textarea#exportText`. *(Note: `exportText` textarea is missing in current HTML)*                     | General `button` styles |
| Import Data Textarea        | `textarea#importText`        | A multi-line input field where users can paste JSON data representing a user's schedule to be imported.                      | Value read by `importSchedule()`.                                                                                                                                                           | General `textarea` styles |
| "Import User" Button        | `div.export-import > button` (second one) | Imports the schedule data from the `textarea#importText`.                                                                  | `onclick="importSchedule()"`. Parses JSON, validates format, updates `users` object, calls `saveUsersToStorage()` and `updateUI()`.                                                         | General `button` styles |
| *(Intended Export Textarea)*| *(textarea#exportText)*      | *(This element is referenced in `exportCurrentUser()` JS but not present in HTML. Expected to display exported JSON.)*          | *(Value set by `exportCurrentUser()`.)*                                                                                                                                                   | *(General `textarea` styles)* |

---

## 🎨 Key CSS Utility & State Classes

These classes are dynamically applied by JavaScript or are key for styling specific states/components.

| 🎨 Class                | 📍 Applied To                                | 🧠 Purpose & Visual Effect                                                              |
| :---------------------- | :------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `.active`               | `div.user-item`, `button#compare`            | Highlights the currently active user in the list or indicates compare mode is on.       |
| `.selected`             | `div.user-item`                              | Highlights users chosen for comparison in `compareMode`.                                |
| `.delete-btn`           | `div.user-item > button.delete-btn`          | Styles the user deletion button (e.g., red background).                                 |
| `.slot`                 | `td.slot`                                    | Base class for all interactive schedule time slots.                                     |
| `.slot-selected`        | `td.slot`                                    | Indicates a time slot is marked as busy/unavailable by the `activeUser` (e.g., purple). |
| `.slot-free`            | `td.slot`                                    | In compare mode: all selected users are free (e.g., green).                             |
| `.slot-conflict`        | `td.slot`                                    | In compare mode: all selected users are busy (e.g., red).                               |
| `.slot-partial`         | `td.slot`                                    | In compare mode: mixed availability among selected users (e.g., orange).                |
| `.app`                  | `div.app`                                    | Main application container; provides overall layout, padding, background.               |
| `.add-user`             | `div.add-user`                               | Styles the layout for the user name and ID input fields and the "Add User" button.      |
| `.user-list`            | `div#userList`                               | Styles the layout for the list of user items (e.g., flex wrap).                         |
| `.slot-tooltip`         | `div#slotTooltip`                            | Styles the popup providing details about slot availability in compare mode.             |

---

## 🔄 Key User Workflows & Interactions

1.  **Adding a New User:**
    1.  User types name into `input#userName`.
    2.  User types unique ID into `input#userId`.
    3.  User clicks "Add User" button (`div.add-user > button`).
    4.  `addNewUser()` is called:
        *   Validates inputs.
        *   Calls `createUser(name, userId)` to add to `users` object.
        *   Calls `setActiveUser(userId)` to make the new user current.
        *   Input fields are cleared.
        *   `updateUI()` refreshes the `div#userList` and schedule grid.

2.  **Editing a User's Schedule (Not in Compare Mode):**
    1.  User clicks on a user's name button in `div#userList`.
    2.  `setActiveUser(userId)` is called, setting `activeUser`.
    3.  `updateUI()` highlights the active user and displays their schedule.
    4.  User clicks on a `td.slot` in `table#schedule`.
    5.  The slot's click listener calls `toggleSlot(day, time)`.
        *   Modifies `users[activeUser].schedule[day][time]`.
        *   Calls `saveUsersToStorage()`.
        *   Calls `updateUI()`, which re-renders the slot with `.slot-selected` class if true.

3.  **Comparing Schedules:**
    1.  User clicks "Compare Schedules" button (`button#compare`).
    2.  `compareSchedules()` is called:
        *   `compareMode` is toggled (e.g., to `true`).
        *   `selectedUsers` set is cleared.
        *   `activeUser` is set to `null`.
        *   `button#compare` gets `.active` class.
        *   `updateUI()` re-renders the UI. Schedule slots are now plain.
    3.  User clicks on multiple user name buttons in `div#userList`.
    4.  `toggleUserSelection(userId)` is called for each, adding/removing user ID from `selectedUsers`.
    5.  `updateUI()` highlights selected users and calls `renderScheduleGrid()`.
        *   `updateSlotDisplay()` determines if each `td.slot` should be `.slot-free`, `.slot-conflict`, or `.slot-partial` based on availability of all users in `selectedUsers`.
    6.  User hovers over a `td.slot`.
    7.  Slot's mouseenter listener (if `compareMode` is true) calls `showSlotTooltip(slot, day, time)`.
        *   Tooltip (`div#slotTooltip`) is displayed with names of free/busy users for that slot.
    8.  Mouse leaves slot: `hideSlotTooltip()` is called.
    9.  User clicks "Compare Schedules" button again to exit compare mode.

---

## 📖 How to Use This Document

✅ Use this document to:

*   **Understand Element-Logic Links:** Quickly identify which JavaScript functions interact with specific DOM elements.
*   **Locate Selectors:** Easily find the correct `id` or `class` for CSS styling or JavaScript manipulation.
*   **Debug Interactions:** Trace user actions through the DOM, JavaScript functions, and state changes.
*   **Onboard New Developers:** Provide a clear map of the application's frontend structure and behavior.
*   **Reference Global State:** Understand the core data structures (`users`, `activeUser`, etc.) that drive the UI.
*   **Identify Styling Hooks:** See which CSS classes are responsible for specific visual states.

---