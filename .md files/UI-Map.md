# 🗺️ MeetchuThere: UI Reference Map & Developer Guide

**Version:** 1.4 (Integrates Pin Mode, Dynamic & Editable Time Slots)
**Last Updated:** May 22, 2025

A guide to DOM elements, their JavaScript interactions, and CSS styling in the MeetchuThere app, aiding development and debugging.

---

## 📌 Table of Contents

1.  [Global App State (`state` in `js/script.js`)](#-global-app-state-state-in-jsscriptjs)
2.  [Exported DOM References (`DOM_ELEMENTS` in `js/script.js`)](#-exported-dom-references-dom_elements-in-jsscriptjs)
3.  [Navigation Menu (Hamburger - All Pages)](#-navigation-menu-hamburger---all-pages)
4.  [Custom Modal (All Pages)](#-custom-modal-all-pages)
5.  [Header Section (All Pages)](#-header-section-all-pages)
6.  [User Management (`<section class="users">` - `index.html`)](#-user-management-section-classusers---indexhtml)
7.  [Schedule Grid (`<section class="schedule">` - `index.html`)](#-schedule-grid-section-classschedule---indexhtml)
8.  [Export/Import (`<div class="export-import">` - `index.html`)](#-exportimport-div-classexport-import---indexhtml)
9.  [Content Sections (Other Pages)](#-content-sections-other-pages)
10. [Key CSS Utility & State Classes](#-key-css-utility--state-classes)
11. [Key User Workflows](#-key-user-workflows)
12. [How to Use This Document](#-how-to-use-this-document)

---

## 🌎 Global App State (`state` in `js/script.js`)

Central data store for `index.html` logic, managed in `js/script.js`. Modified by handler functions.

| Variable in `state` | Type      | Description & Key Modifying Handlers                                                                  |
| :------------------ | :-------- | :---------------------------------------------------------------------------------------------------- |
| `activeUserId`      | `String`  | ID of user being edited. Set by `handleSetActiveUser()`.                                              |
| `users`             | `Object`  | Dictionary of users (`id`, `name`, `schedule`, `timeSlots`, `pinnedSlots`). Managed by user handlers. |
| `selectedUserIds`   | `Set`     | User IDs for comparison. Modified by `handleToggleUserSelectionForCompare()`.                         |
| `compareMode`       | `Boolean` | Toggles edit/compare mode. Set by `handleToggleCompareMode()`.                                        |
| `pinModeActive`     | `Boolean` | Toggles pin mode for focused schedule editing. Set by `handleTogglePinMode()`.                        |

_Test helpers: `getState()`, `_setStateForTesting()`, `_resetStateForTesting()` exported from `js/script.js`._

---

## EXPORTED DOM REFERENCES (`DOM_ELEMENTS` in `js/script.js`)

A cached object of frequently accessed DOM elements from `index.html`, exported from `js/script.js`.

| Key in `DOM_ELEMENTS`   | Points To (Selector)                      |
| :---------------------- | :---------------------------------------- |
| `userNameInput`         | `input#userName`                          |
| `userIdInput`           | `input#userId`                            |
| `userListContainer`     | `div#userList`                            |
| `compareButton`         | `button#compare`                          |
| `togglePinModeBtn`      | `button#togglePinModeBtn`                 |
| `scheduleTable`         | `table#scheduleTable`                     |
| `slotTooltip`           | `div#slotTooltip`                         |
| `importTextArea`        | `textarea#importText`                     |
| `addUserButton`         | `div.add-user button`                     |
| `exportButton`          | `div.export-import button:nth-of-type(1)` |
| `importButton`          | `div.export-import button:nth-of-type(2)` |
| `appModal`              | `div#appModal`                            |
| `modalTitle`            | `h3#modalTitle`                           |
| `modalMessage`          | `p#modalMessage`                          |
| `modalCloseBtn`         | `button#modalCloseBtn`                    |
| `modalActionButtons`    | `div#modalActionButtons`                  |
| `modalConfirmBtn`       | `button#modalConfirmBtn`                  |
| `modalCancelBtn`        | `button#modalCancelBtn`                   |
| `addNewTimeSlotBtn`     | `button#addNewTimeSlotBtn`                |
| `addTimeSlotHeaderCell` | `th#addTimeSlotHeaderCell`                |

---

## 🍔 Navigation Menu (Hamburger - All Pages)

Logic in `js/menu.js` (via `initMenu()`), styles in `css/menu.css`.

| UI Element       | Selector (ID/Class)   | Description & Purpose                                 | JS Interactions (from `js/menu.js`) | CSS Classes (from `css/menu.css`)     |
| :--------------- | :-------------------- | :---------------------------------------------------- | :---------------------------------- | :------------------------------------ |
| Hamburger Button | `button#hamburgerBtn` | Toggles nav panel; animates bars to 'X'.              | Calls internal `toggleMenu()`.      | `.hamburger-button`, `.hamburger-bar` |
| Navigation Panel | `nav#navPanel`        | Slide-out menu with page links.                       | Visibility via `toggleMenu()`.      | `.nav-panel`                          |
| Navigation Link  | `a.nav-link`          | Links to pages (Schedule, Friends, About).            | Closes menu on click before nav.    | `.nav-link`                           |
| Overlay          | `div#overlay`         | Dims background when menu is open; click closes menu. | Calls internal `toggleMenu()`.      | `.overlay`                            |
| Body (Menu Open) | `body.menu-open`      | Class on `<body>` to trigger menu open state styles.  | Applied/removed by `toggleMenu()`.  | `.menu-open`                          |

---

## 💬 Custom Modal (All Pages)

Reusable modal for notifications and confirmations. Logic in `js/script.js` (`showAppModal`, `hideAppModal`), styles in `css/modal.css`.

| UI Element           | Selector (ID/Class)      | Description & Purpose                                | JS Interactions (from `js/script.js`)                                 | CSS Classes (from `css/modal.css`)  |
| :------------------- | :----------------------- | :--------------------------------------------------- | :-------------------------------------------------------------------- | :---------------------------------- |
| Modal Overlay        | `div#appModal`           | Full-screen overlay; container for modal content.    | Visibility & content set by `showAppModal()`, `hideAppModal()`.       | `.modal-overlay`, `.active`         |
| Modal Content Box    | `.modal-content`         | The main dialog box.                                 | Houses title, message, buttons.                                       | `.modal-content`                    |
| Modal Title          | `h3#modalTitle`          | Title of the modal.                                  | Text set by `showAppModal()`.                                         | `.modal-title`                      |
| Modal Message        | `p#modalMessage`         | Main message/text of the modal.                      | Text set by `showAppModal()`.                                         | `.modal-message`                    |
| OK Button            | `button#modalCloseBtn`   | Default button for simple notifications.             | Click calls `hideAppModal()`. Visibility managed by `showAppModal()`. | `.modal-close-btn`, `.modal-button` |
| Action Buttons Div   | `div#modalActionButtons` | Container for Yes/No buttons in confirmation modals. | Visibility managed by `showAppModal()`.                               | `.modal-action-buttons`             |
| Confirm (Yes) Button | `button#modalConfirmBtn` | "Yes" button for confirmations.                      | Click executes `confirmModalCallback`, then `hideAppModal()`.         | `.modal-button`, `.confirm`         |
| Cancel (No) Button   | `button#modalCancelBtn`  | "No" button for confirmations.                       | Click calls `hideAppModal()`.                                         | `.modal-button`, `.cancel`          |

---

## 🗣️ Header Section (All Pages)

| UI Element        | Selector (ID/Class) | Description & Purpose      | JS Interactions | CSS Classes (from `css/styles.css`) |
| :---------------- | :------------------ | :------------------------- | :-------------- | :---------------------------------- |
| Application Title | `header > h1`       | Main title "MeetchuThere". | N/A             | `h1` (gradient text)                |

---

## 🧑‍🤝‍🧑 User Management (`<section class="users">` - `index.html`)

User creation, listing, and comparison controls on `index.html`. Logic in `js/script.js`.

| UI Element            | Selector / `DOM_ELEMENTS` Key | Description & Purpose                                       | JS Interactions (from `js/script.js`)                                                | CSS Classes                                                              |
| :-------------------- | :---------------------------- | :---------------------------------------------------------- | :----------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| Section Heading       | `section.users > h2`          | "Manage & Compare Schedules" title.                         | N/A                                                                                  | `h2` styles                                                              |
| Name Input            | `userNameInput`               | Input for new user's name.                                  | Value read by `handleAddNewUser()`; live validation.                                 | `input` styles                                                           |
| User ID Input         | `userIdInput`                 | Input for new user's ID (numeric).                          | Value read by `handleAddNewUser()`; live validation.                                 | `input` styles                                                           |
| "Add User" Button     | `addUserButton`               | Submits new user details.                                   | Click calls `handleAddNewUser()`.                                                    | `button` styles                                                          |
| User List Container   | `userListContainer`           | Displays registered users.                                  | Content by `renderUserList()`. Delegated clicks handled by `setupEventListeners()`.  | `.user-list`                                                             |
| User Item (dynamic)   | `div.user-item`               | Represents a user in the list. `data-user-id`.              | Clicks call `handleSetActiveUser()` or `handleToggleUserSelectionForCompare()`.      | `.user-item`, `.active`, `.selected`                                     |
| Delete User Btn (dyn) | `button.delete-btn`           | Deletes user. `data-delete-user-id`.                        | Clicks call `handleDeleteUser()` (shows confirmation modal).                         | `.delete-btn`                                                            |
| Button Row            | `div.button-row`              | Container for Compare and Pin Mode buttons.                 | N/A                                                                                  | `.button-row`                                                            |
| "Compare" Button      | `compareButton`               | Toggles comparison mode. Dynamic text & state.              | Click calls `handleToggleCompareMode()`. State via `getCompareButtonDynamicState()`. | `#compare`, `.active`, `.control-button` (and its state styles)          |
| "Pin Mode" Button     | `togglePinModeBtn`            | Toggles pin mode for focused editing. Dynamic text & state. | Click calls `handleTogglePinMode()`. State via `getPinModeButtonDynamicState()`.     | `#togglePinModeBtn`, `.active`, `.control-button` (and its state styles) |

---

## 🗓️ Schedule Grid (`<section class="schedule">` - `index.html`)

Weekly schedule display on `index.html`. Logic in `js/script.js`.

| UI Element                | Selector / `DOM_ELEMENTS` Key | Description & Purpose                                                             | JS Interactions (from `js/script.js`)                                                                              | CSS Classes                                                                |
| :------------------------ | :---------------------------- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| Schedule Table            | `scheduleTable`               | Main table for days/time slots.                                                   | Delegated `click`, `mouseover`, `mouseout` for `.slot` elements. Headers can be clickable.                         | `table`, `th`, `td` styles                                                 |
| Time Slot Header (dyn)    | `th.editable-timeslot-header` | Clickable header for an existing time slot (when active user). `data-slot-index`. | Click calls `handleTimeSlotHeaderClick()` -> `openEditTimeSlotModal()`.                                            | `.editable-timeslot-header`                                                |
| Add Time Slot Button      | `addNewTimeSlotBtn`           | '+' button in header to add a new custom time slot for active user.               | Click calls `handleAddNewTimeSlotClick()`.                                                                         | `#addNewTimeSlotBtn`, `.add-timeslot-btn`                                  |
| Add Time Slot Header Cell | `addTimeSlotHeaderCell`       | `<th>` container for the `addNewTimeSlotBtn`.                                     | N/A                                                                                                                | `#addTimeSlotHeaderCell`                                                   |
| Time Slot (dyn)           | `td.slot`                     | Individual time slot. `data-day`, `data-time`.                                    | Click calls `handleToggleScheduleSlot()`. Hover for `handleShowSlotTooltip()`. Classes via `renderScheduleGrid()`. | `.slot`, `.slot-selected`, `.slot-free`, `.slot-conflict`, `.slot-partial` |
| Slot Tooltip              | `slotTooltip`                 | Pop-up in compare mode showing availability.                                      | Managed by `handleShowSlotTooltip()` & `handleHideSlotTooltip()`.                                                  | `.slot-tooltip`                                                            |

---

## 📤📥 Export/Import (`<div class="export-import">` - `index.html`)

Data export/import on `index.html`. Logic in `js/script.js`.

| UI Element      | Selector / `DOM_ELEMENTS` Key | Description & Purpose           | JS Interactions (from `js/script.js`)    | CSS Classes       |
| :-------------- | :---------------------------- | :------------------------------ | :--------------------------------------- | :---------------- |
| "Export" Button | `exportButton`                | Exports active user's schedule. | Click calls `handleExportCurrentUser()`. | `button` styles   |
| Import Textarea | `importTextArea`              | Area to paste JSON for import.  | Value read by `handleImportSchedule()`.  | `textarea` styles |
| "Import" Button | `importButton`                | Imports schedule from textarea. | Click calls `handleImportSchedule()`.    | `button` styles   |

---

## 📄 Content Sections (Other Pages)

Placeholder content on `pages/friends.html`, `pages/about.html`.

| UI Element           | Selector (ID/Class)            | Description & Purpose                | JS Interactions | CSS Classes (from `css/styles.css`) |
| :------------------- | :----------------------------- | :----------------------------------- | :-------------- | :---------------------------------- |
| Friends Page Content | `section.friends-page-content` | Main content area for Friends page.  | Placeholder     | `.page-content`                     |
| About Page Content   | `section.about-page-content`   | Main content area for About page.    | Placeholder     | `.page-content`                     |
| Placeholder Div      | `div.content-placeholder`      | Box for "Content coming soon!" text. | N/A             | `.content-placeholder`              |

---

## 🎨 Key CSS Utility & State Classes

Dynamically applied or key for styling. Globals in `css/styles.css`, menu in `css/menu.css`, modal in `css/modal.css`.

| Class                                               | Applied To                                                      | Purpose & Visual Effect                                                   |
| :-------------------------------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------ |
| `.menu-open`                                        | `body`                                                          | Indicates hamburger menu is open.                                         |
| `.active`                                           | `.user-item`, `#compare`, `#togglePinModeBtn`, `.modal-overlay` | Highlights active user/state, shows modal.                                |
| `.selected`                                         | `.user-item`                                                    | Highlights user selected for comparison.                                  |
| `.slot-selected` etc.                               | `td.slot`                                                       | Colors schedule slots based on availability (purple, green, red, orange). |
| `.app`                                              | `div.app`                                                       | Main app layout container.                                                |
| `.page-content`                                     | `section` on sub-pages                                          | Styles content areas of `friends.html`, `about.html`.                     |
| `.modal-button` etc.                                | Buttons inside modal                                            | Styles for modal buttons (`.confirm`, `.cancel`).                         |
| `.control-button`                                   | `#compare`, `#togglePinModeBtn`                                 | Base style for Compare and Pin Mode buttons.                              |
| `:disabled` (on control buttons)                    | `#compare`, `#togglePinModeBtn`                                 | Styles for disabled state (greyed out).                                   |
| `:not(.active):not(:disabled)` (on control buttons) | `#compare`, `#togglePinModeBtn`                                 | Styles for enabled but "OFF" state (e.g., red background).                |
| `.active` (on control buttons)                      | `#compare`, `#togglePinModeBtn`                                 | Styles for enabled and "ON" state (e.g., green background).               |
| `.editable-timeslot-header`                         | `th` in schedule table                                          | Indicates a time slot header is clickable for editing.                    |
| `.button-row`                                       | `div` wrapping compare/pin buttons                              | Flex container for aligning these buttons.                                |

---

## 🔄 Key User Workflows

1.  **Menu Navigation:** User clicks `#hamburgerBtn` -> `js/menu.js` toggles `.menu-open` on `body`, `nav#navPanel` slides in. Clicking `a.nav-link` navigates.
2.  **Add User (`index.html`):** Input to `#userName`, `#userId` -> Click `addUserButton` -> `handleAddNewUser()` updates `state` & UI.
3.  **Edit Schedule (`index.html`):** Click `.user-item` -> `handleSetActiveUser()`. Click `td.slot` -> `handleToggleScheduleSlot()`.
4.  **Compare Schedules (`index.html`):** Click `#compare` -> `handleToggleCompareMode()`. Click `.user-item`s -> `handleToggleUserSelectionForCompare()`. Hover `td.slot` -> `handleShowSlotTooltip()`.
5.  **Toggle Pin Mode (`index.html`):** (Requires active user, compare mode off) Click `#togglePinModeBtn` -> `handleTogglePinMode()` updates `state.pinModeActive` and UI. Button text/style changes. Schedule editing is now pinned to the active user.
6.  **Add Custom Time Slot (`index.html`):** (Requires active user) Click `button#addNewTimeSlotBtn` -> `handleAddNewTimeSlotClick()` shows modal. Input start/end times -> "Add Slot" calls `addCustomTimeSlotToActiveUser()`. Updates `state.users[activeUserId].timeSlots` and `schedule` matrix, then UI.
7.  **Edit Custom Time Slot (`index.html`):** (Requires active user) Click `th.editable-timeslot-header` -> `handleTimeSlotHeaderClick()` calls `openEditTimeSlotModal()`. Input new start/end times -> "Save Changes" calls `processTimeSlotEdit()`. Updates `state.users[activeUserId].timeSlots`, then UI.
8.  **Delete User (`index.html`):** Click `.delete-btn` in `.user-item` -> `handleDeleteUser()` shows confirmation modal. If "Yes", user is removed from `state` & UI.
9.  **Show Notification/Confirmation Modal:** Functions like `handleAddNewUser` (on error) or `handleDeleteUser` call `showAppModal()` from `js/script.js`.

---

## 📖 How to Use This Document

- **Find Elements:** Use "Selector / `DOM_ELEMENTS` Key" to locate elements.
- **Understand Logic:** See "JS Interactions" for related JavaScript functions.
- **Styling:** Refer to "CSS Classes" for styling hooks.
- **Debug:** Trace workflows using the "Key User Workflows" section.
