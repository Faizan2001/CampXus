# 🗺️ MeetchuThere: UI Reference Map & Developer Guide

**Version:** 1.3 (Integrates custom modal, including confirmation)
**Last Updated:** 17 May, 2025

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

| Variable in `state` | Type     | Description & Key Modifying Handlers                                     |
| :------------------ | :------- | :----------------------------------------------------------------------- |
| `activeUserId`      | `String` | ID of user being edited. Set by `handleSetActiveUser()`.                 |
| `users`             | `Object` | Dictionary of users (`id`, `name`, `schedule`). Managed by user handlers. |
| `selectedUserIds`   | `Set`    | User IDs for comparison. Modified by `handleToggleUserSelectionForCompare()`. |
| `compareMode`       | `Boolean`| Toggles edit/compare mode. Set by `handleToggleCompareMode()`.          |

*Test helpers: `getState()`, `_setStateForTesting()`, `_resetStateForTesting()` exported from `js/script.js`.*

---

## EXPORTED DOM REFERENCES (`DOM_ELEMENTS` in `js/script.js`)

A cached object of frequently accessed DOM elements from `index.html`, exported from `js/script.js`.

| Key in `DOM_ELEMENTS` | Points To (Selector)                     |
| :---------------------- | :------------------------------------------ |
| `userNameInput`         | `input#userName`                            |
| `userIdInput`           | `input#userId`                              |
| `userListContainer`     | `div#userList`                              |
| `compareButton`         | `button#compare`                            |
| `scheduleTable`         | `table#schedule`                            |
| `slotTooltip`           | `div#slotTooltip`                         |
| `importTextArea`        | `textarea#importText`                     |
| `addUserButton`         | `div.add-user button`                       |
| `exportButton`          | `div.export-import button:nth-of-type(1)`   |
| `importButton`          | `div.export-import button:nth-of-type(2)`   |
| `appModal`              | `div#appModal`                              |
| `modalTitle`            | `h3#modalTitle`                             |
| `modalMessage`          | `p#modalMessage`                            |
| `modalCloseBtn`         | `button#modalCloseBtn`                      |
| `modalActionButtons`    | `div#modalActionButtons`                    |
| `modalConfirmBtn`       | `button#modalConfirmBtn`                    |
| `modalCancelBtn`        | `button#modalCancelBtn`                     |

---

## 🍔 Navigation Menu (Hamburger - All Pages)

Logic in `js/menu.js` (via `initMenu()`), styles in `css/menu.css`.

| UI Element         | Selector (ID/Class)   | Description & Purpose                                   | JS Interactions (from `js/menu.js`) | CSS Classes (from `css/menu.css`)     |
| :----------------- | :-------------------- | :------------------------------------------------------ | :---------------------------------- | :------------------------------------ |
| Hamburger Button   | `button#hamburgerBtn` | Toggles nav panel; animates bars to 'X'.                | Calls internal `toggleMenu()`.      | `.hamburger-button`, `.hamburger-bar` |
| Navigation Panel   | `nav#navPanel`        | Slide-out menu with page links.                         | Visibility via `toggleMenu()`.    | `.nav-panel`                          |
| Navigation Link    | `a.nav-link`          | Links to pages (Schedule, Friends, About).              | Closes menu on click before nav.    | `.nav-link`                           |
| Overlay            | `div#overlay`         | Dims background when menu is open; click closes menu. | Calls internal `toggleMenu()`.      | `.overlay`                            |
| Body (Menu Open) | `body.menu-open`      | Class on `<body>` to trigger menu open state styles.    | Applied/removed by `toggleMenu()`.  | `.menu-open`                          |

---

## 💬 Custom Modal (All Pages)

Reusable modal for notifications and confirmations. Logic in `js/script.js` (`showAppModal`, `hideAppModal`), styles in `css/modal.css`.

| UI Element            | Selector (ID/Class)       | Description & Purpose                                         | JS Interactions (from `js/script.js`)                                  | CSS Classes (from `css/modal.css`)      |
| :-------------------- | :------------------------ | :------------------------------------------------------------ | :--------------------------------------------------------------------- | :------------------------------------ |
| Modal Overlay         | `div#appModal`            | Full-screen overlay; container for modal content.             | Visibility & content set by `showAppModal()`, `hideAppModal()`.          | `.modal-overlay`, `.active`             |
| Modal Content Box     | `.modal-content`          | The main dialog box.                                          | Houses title, message, buttons.                                        | `.modal-content`                      |
| Modal Title           | `h3#modalTitle`           | Title of the modal.                                           | Text set by `showAppModal()`.                                          | `.modal-title`                        |
| Modal Message         | `p#modalMessage`          | Main message/text of the modal.                               | Text set by `showAppModal()`.                                          | `.modal-message`                      |
| OK Button             | `button#modalCloseBtn`    | Default button for simple notifications.                      | Click calls `hideAppModal()`. Visibility managed by `showAppModal()`.    | `.modal-close-btn`, `.modal-button`   |
| Action Buttons Div  | `div#modalActionButtons`  | Container for Yes/No buttons in confirmation modals.          | Visibility managed by `showAppModal()`.                                  | `.modal-action-buttons`               |
| Confirm (Yes) Button  | `button#modalConfirmBtn`  | "Yes" button for confirmations.                               | Click executes `confirmModalCallback`, then `hideAppModal()`.            | `.modal-button`, `.confirm`         |
| Cancel (No) Button    | `button#modalCancelBtn`   | "No" button for confirmations.                                | Click calls `hideAppModal()`.                                          | `.modal-button`, `.cancel`          |

---

## 🗣️ Header Section (All Pages)

| UI Element        | Selector (ID/Class) | Description & Purpose                    | JS Interactions | CSS Classes (from `css/styles.css`) |
| :---------------- | :------------------ | :--------------------------------------- | :-------------- | :---------------------------------- |
| Application Title | `header > h1`       | Main title "MeetchuThere".               | N/A             | `h1` (gradient text)                |

---

## 🧑‍🤝‍🧑 User Management (`<section class="users">` - `index.html`)

User creation, listing, and comparison controls on `index.html`. Logic in `js/script.js`.

| UI Element            | Selector / `DOM_ELEMENTS` Key | Description & Purpose                                        | JS Interactions (from `js/script.js`)                                              | CSS Classes         |
| :-------------------- | :---------------------------- | :----------------------------------------------------------- | :--------------------------------------------------------------------------------- | :------------------ |
| Section Heading       | `section.users > h2`          | "Manage & Compare Schedules" title.                          | N/A                                                                                | `h2` styles         |
| Name Input            | `userNameInput`               | Input for new user's name.                                   | Value read by `handleAddNewUser()`; live validation.                               | `input` styles      |
| User ID Input         | `userIdInput`                 | Input for new user's ID (numeric).                           | Value read by `handleAddNewUser()`; live validation.                               | `input` styles      |
| "Add User" Button     | `addUserButton`               | Submits new user details.                                    | Click calls `handleAddNewUser()`.                                                  | `button` styles     |
| User List Container   | `userListContainer`           | Displays registered users.                                   | Content by `renderUserList()`. Delegated clicks handled by `setupEventListeners()`.  | `.user-list`        |
| User Item (dynamic)   | `div.user-item`               | Represents a user in the list. `data-user-id`.               | Clicks call `handleSetActiveUser()` or `handleToggleUserSelectionForCompare()`.    | `.user-item`, `.active`, `.selected` |
| Delete User Btn (dyn) | `button.delete-btn`           | Deletes user. `data-delete-user-id`.                         | Clicks call `handleDeleteUser()` (shows confirmation modal).                       | `.delete-btn`       |
| "Compare" Button    | `compareButton`               | Toggles comparison mode.                                     | Click calls `handleToggleCompareMode()`.                                           | `#compare`, `.active` |

---

## 🗓️ Schedule Grid (`<section class="schedule">` - `index.html`)

Weekly schedule display on `index.html`. Logic in `js/script.js`.

| UI Element       | Selector / `DOM_ELEMENTS` Key | Description & Purpose                                       | JS Interactions (from `js/script.js`)                                                                    | CSS Classes                                                              |
| :--------------- | :---------------------------- | :---------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| Schedule Table   | `scheduleTable`               | Main table for days/time slots.                             | Delegated `click`, `mouseover`, `mouseout` for `.slot` elements.                                         | `table`, `th`, `td` styles                                               |
| Time Slot (dyn)  | `td.slot`                     | Individual time slot. `data-day`, `data-time`.              | Click calls `handleToggleScheduleSlot()`. Hover for `handleShowSlotTooltip()`. Classes via `renderScheduleGrid()`. | `.slot`, `.slot-selected`, `.slot-free`, `.slot-conflict`, `.slot-partial` |
| Slot Tooltip     | `slotTooltip`                 | Pop-up in compare mode showing availability.                | Managed by `handleShowSlotTooltip()` & `handleHideSlotTooltip()`.                                        | `.slot-tooltip`                                                          |

---

## 📤📥 Export/Import (`<div class="export-import">` - `index.html`)

Data export/import on `index.html`. Logic in `js/script.js`.

| UI Element       | Selector / `DOM_ELEMENTS` Key | Description & Purpose                          | JS Interactions (from `js/script.js`)       | CSS Classes             |
| :--------------- | :---------------------------- | :--------------------------------------------- | :------------------------------------------ | :---------------------- |
| "Export" Button  | `exportButton`                | Exports active user's schedule.                | Click calls `handleExportCurrentUser()`.      | `button` styles         |
| Import Textarea  | `importTextArea`              | Area to paste JSON for import.                 | Value read by `handleImportSchedule()`.       | `textarea` styles       |
| "Import" Button  | `importButton`                | Imports schedule from textarea.                | Click calls `handleImportSchedule()`.       | `button` styles         |

---

## 📄 Content Sections (Other Pages)

Placeholder content on `pages/friends.html`, `pages/about.html`.

| UI Element           | Selector (ID/Class)            | Description & Purpose                          | JS Interactions | CSS Classes (from `css/styles.css`) |
| :------------------- | :----------------------------- | :--------------------------------------------- | :-------------- | :---------------------------------- |
| Friends Page Content | `section.friends-page-content` | Main content area for Friends page.            | Placeholder     | `.page-content`                     |
| About Page Content   | `section.about-page-content`   | Main content area for About page.            | Placeholder     | `.page-content`                     |
| Placeholder Div    | `div.content-placeholder`      | Box for "Content coming soon!" text.           | N/A             | `.content-placeholder`              |

---

## 🎨 Key CSS Utility & State Classes

Dynamically applied or key for styling. Globals in `css/styles.css`, menu in `css/menu.css`, modal in `css/modal.css`.

| Class                  | Applied To                                     | Purpose & Visual Effect                                                  |
| :--------------------- | :--------------------------------------------- | :----------------------------------------------------------------------- |
| `.menu-open`           | `body`                                         | Indicates hamburger menu is open.                                        |
| `.active`              | `.user-item`, `#compare`, `.modal-overlay`     | Highlights active user/state, shows modal.                             |
| `.selected`            | `.user-item`                                   | Highlights user selected for comparison.                                 |
| `.slot-selected` etc.  | `td.slot`                                      | Colors schedule slots based on availability (purple, green, red, orange). |
| `.app`                 | `div.app`                                      | Main app layout container.                                               |
| `.page-content`        | `section` on sub-pages                         | Styles content areas of `friends.html`, `about.html`.                    |
| `.modal-button` etc. | Buttons inside modal                           | Styles for modal buttons (`.confirm`, `.cancel`).                      |

---

## 🔄 Key User Workflows

1.  **Menu Navigation:** User clicks `#hamburgerBtn` -> `js/menu.js` toggles `.menu-open` on `body`, `nav#navPanel` slides in. Clicking `a.nav-link` navigates.
2.  **Add User (`index.html`):** Input to `#userName`, `#userId` -> Click `addUserButton` -> `handleAddNewUser()` updates `state` & UI.
3.  **Edit Schedule (`index.html`):** Click `.user-item` -> `handleSetActiveUser()`. Click `td.slot` -> `handleToggleScheduleSlot()`.
4.  **Compare Schedules (`index.html`):** Click `#compare` -> `handleToggleCompareMode()`. Click `.user-item`s -> `handleToggleUserSelectionForCompare()`. Hover `td.slot` -> `handleShowSlotTooltip()`.
5.  **Delete User (`index.html`):** Click `.delete-btn` in `.user-item` -> `handleDeleteUser()` shows confirmation modal. If "Yes", user is removed from `state` & UI.
6.  **Show Notification/Confirmation Modal:** Functions like `handleAddNewUser` (on error) or `handleDeleteUser` call `showAppModal()` from `js/script.js`.

---

## 📖 How to Use This Document

*   **Find Elements:** Use "Selector / `DOM_ELEMENTS` Key" to locate elements.
*   **Understand Logic:** See "JS Interactions" for related JavaScript functions.
*   **Styling:** Refer to "CSS Classes" for styling hooks.
*   **Debug:** Trace workflows using the "Key User Workflows" section.