# 🗺️ MeetchuThere: UI Reference Map & Developer Guide

**Version:** 1.2 (Reflects ES6 Module refactor for `script.js` and event delegation)
**Last Updated:** May 16 2025

This document serves as a comprehensive reference for the Document Object Model (DOM) elements used in the "MeetchuThere" application. It maps HTML elements to their corresponding JavaScript interactions and CSS styling, facilitating easier onboarding for new developers and serving as a quick-glance guide for ongoing development and debugging.

---

## 📌 Table of Contents

1.  [Global Application State (`state` object in `js/script.js`)](#-global-application-state-state-object-in-jsscriptjs)
2.  [Exported DOM References (`DOM_ELEMENTS` from `js/script.js`)](#-exported-dom-references-dom_elements-from-jsscriptjs)
3.  [Navigation Menu (Hamburger - All Pages)](#-navigation-menu-hamburger---all-pages)
4.  [Header Section (All Pages)](#-header-section-all-pages)
5.  [User Management Section (`<section class="users">` - `index.html`)](#-user-management-section-section-classusers---indexhtml)
    - [Add User Form (`<div class="add-user">`)](#-add-user-form-div-classadd-user)
    - [User List Display (`<div id="userList">`)](#-user-list-display-div-iduserlist)
    - [Schedule Comparison Control](#-schedule-comparison-control)
6.  [Schedule Grid Section (`<section class="schedule">` - `index.html`)](#-schedule-grid-section-section-classschedule---indexhtml)
    - [Schedule Table (`<table id="schedule">`)](#-schedule-table-table-idschedule)
    - [Slot Tooltip (`<div id="slotTooltip">`)](#-slot-tooltip-div-idslottooltip)
7.  [Export/Import Section (`<div class="export-import">` - `index.html`)](#-exportimport-section-div-classexport-import---indexhtml)
8.  [Content Sections (Other Pages - `pages/friends.html`, `pages/about.html`)](#-content-sections-other-pages---pagesfriendshtml-pagesabouthtml)
9.  [Key CSS Utility & State Classes](#-key-css-utility--state-classes)
10. [Key User Workflows & Interactions](#-key-user-workflows--interactions)
11. [How to Use This Document](#-how-to-use-this-document)

---

## 🌎 Global Application State (`state` object in `js/script.js`)

This `state` object is central to the application logic on `index.html`. It's defined and managed within `js/script.js`. Core logic functions (now often purer) may receive parts of this state as arguments or the whole state, and event handlers update this global `state`.

| 🔤 Variable within `state` | 🧬 Type   | 🧠 Description & Key Modifying Handlers/Functions                                                                                                                                                                                                                                                                                 |
| :------------------------- | :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeUserId`             | `String`  | Stores the ID of the user whose schedule is currently being edited. `null` if no user is active or in compare mode. Set by `handleSetActiveUser()`. Modified by `handleDeleteUser()`, `handleToggleCompareMode()`.                                                                                                                |
| `users`                    | `Object`  | A dictionary holding all user data, keyed by `userId`. Each user object contains `id`, `name`, and a 2D `schedule` array. Modified by `handleAddNewUser()` (using `createUserObject`), `handleDeleteUser()` (using `deleteUserFromState`), `handleImportSchedule()`, `handleToggleScheduleSlot()` (using `toggleSlotInSchedule`). |
| `selectedUserIds`          | `Set`     | A set of `userId`s for users selected for schedule comparison. Modified by `handleToggleUserSelectionForCompare()`. Cleared by `handleSetActiveUser()`, `handleToggleCompareMode()`, `handleDeleteUser()`.                                                                                                                        |
| `compareMode`              | `Boolean` | Toggles `index.html` between schedule editing mode (`false`) and schedule comparison mode (`true`). Toggled by `handleToggleCompareMode()`. Set to `false` by `handleSetActiveUser()`.                                                                                                                                            |

_Helper functions `getState()`, `_setStateForTesting()`, `_resetStateForTesting()` are exported from `js/script.js` for testing and controlled state access._

---

## EXPORTED DOM REFERENCES (`DOM_ELEMENTS` from `js/script.js`)

`js/script.js` exports a `DOM_ELEMENTS` object containing cached references to frequently accessed DOM elements for the `index.html` page.

| 🔤 Key in `DOM_ELEMENTS` | 🎯 Points To (Selector)                   |
| :----------------------- | :---------------------------------------- |
| `userNameInput`          | `input#userName`                          |
| `userIdInput`            | `input#userId`                            |
| `userListContainer`      | `div#userList`                            |
| `compareButton`          | `button#compare`                          |
| `scheduleTable`          | `table#schedule`                          |
| `slotTooltip`            | `div#slotTooltip`                         |
| `importTextArea`         | `textarea#importText`                     |
| `addUserButton`          | `div.add-user button`                     |
| `exportButton`           | `div.export-import button:nth-of-type(1)` |
| `importButton`           | `div.export-import button:nth-of-type(2)` |

---

## 🍔 Navigation Menu (Hamburger - All Pages)

Present on `index.html`, `pages/friends.html`, `pages/about.html`. Logic in `js/menu.js` (using `initMenu()`), styles in `css/menu.css`.

| 🔧 UI Element            | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                                                  | 🧠 Key JavaScript Interactions (from `js/menu.js`)                         | 🎨 Relevant CSS Classes (from `css/menu.css`) |
| :----------------------- | :------------------------- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- | :-------------------------------------------- |
| Hamburger Button         | `button#hamburgerBtn`      | Toggles the navigation panel. Visually changes from bars to 'X'.                          | Event listener calls internal `toggleMenu()`. Updates `aria-expanded`.     | `.hamburger-button`, `.hamburger-bar`         |
| Navigation Panel         | `nav#navPanel`             | Slides in from the left, contains navigation links.                                       | Internal `toggleMenu()` controls visibility via transform & `aria-hidden`. | `.nav-panel`                                  |
| Navigation Link          | `a.nav-link` (dynamic)     | Links to different pages (`index.html`, `pages/friends.html`, `pages/about.html`).        | Event listener: if menu open, calls internal `toggleMenu()` before nav.    | `.nav-link`                                   |
| Overlay                  | `div#overlay`              | Dims the background when the menu is open. Clicking it closes the menu.                   | Event listener: if menu open, calls internal `toggleMenu()`.               | `.overlay`                                    |
| Body Class for Open Menu | `body.menu-open`           | Class applied to `<body>` when menu is open, used by CSS to show panel/overlay and style. | Applied/removed by internal `toggleMenu()`.                                | `.menu-open`                                  |

---

## 🗣️ Header Section (All Pages)

| 🔧 UI Element     | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                   | 🧠 Key JavaScript Interactions | 🎨 Relevant CSS Classes (from `css/styles.css`) |
| :---------------- | :------------------------- | :--------------------------------------------------------- | :----------------------------- | :---------------------------------------------- |
| Application Title | `header > h1`              | Displays the main title "MeetchuThere" of the application. | N/A (Static content)           | `h1` (for gradient text & underline)            |

---

## 🧑‍🤝‍🧑 User Management Section (`<section class="users">` - `index.html`)

This section handles user creation, listing, and comparison mode toggle on `index.html`. Logic in `js/script.js`. DOM elements often accessed via `DOM_ELEMENTS`.

| 🔧 UI Element              | 🔍 DOM Selector (ID/Class) or Key in `DOM_ELEMENTS`   | 📝 Description & Purpose                                                  | 🧠 Key JavaScript Interactions (from `js/script.js`)                                                                       | 🎨 Relevant CSS Classes              |
| :------------------------- | :---------------------------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| Section Heading            | `section.users > h2`                                  | "Manage & Compare Schedules" title.                                       | N/A (Static content)                                                                                                       | General `h2` styles                  |
| Name Input Field           | `userNameInput`                                       | Text input for the new user's name.                                       | Value read by `handleAddNewUser()`. `input` event listener (from `setupInputValidation()`) for live validation.            | General `input` styles               |
| User ID Input Field        | `userIdInput`                                         | Text input for the new user's unique ID (numeric).                        | Value read by `handleAddNewUser()`. `input` event listener (from `setupInputValidation()`) for live validation.            | General `input` styles               |
| "Add User" Button          | `addUserButton`                                       | Submits the new user's name and ID.                                       | Event listener calls `handleAddNewUser()`.                                                                                 | General `button` styles              |
| User List Container        | `userListContainer`                                   | Dynamically populated container displaying all registered users.          | Content generated by `renderUserList()`. Event delegation listener (from `setupEventListeners()`) handles clicks on items. | `.user-list`                         |
| User Item                  | `div.user-item` (dynamic, inside `userListContainer`) | Container for user name & delete. `data-user-id` attribute holds user ID. | Click handled by delegated listener on `userListContainer`. Classes `.active`/`.selected` applied by `renderUserList()`.   | `.user-item`, `.active`, `.selected` |
| User Name Button           | `button.user-name-btn` (dynamic, inside `.user-item`) | Displays user's name.                                                     | Click handled by delegated listener on `userListContainer` (targets parent `.user-item`).                                  | (Styled within `.user-item`)         |
| Delete User Button         | `button.delete-btn` (dynamic, inside `.user-item`)    | Allows deletion. `data-delete-user-id` attribute holds user ID.           | Click handled by delegated listener on `userListContainer`. Calls `handleDeleteUser()`.                                    | `.delete-btn`                        |
| "Compare Schedules" Button | `compareButton`                                       | Toggles between schedule editing and comparison mode.                     | Event listener calls `handleToggleCompareMode()`.                                                                          | `#compare`, `.active`                |

---

## 🗓️ Schedule Grid Section (`<section class="schedule">` - `index.html`)

Displays the weekly schedule on `index.html`. Logic in `js/script.js`. DOM elements often accessed via `DOM_ELEMENTS`.

| 🔧 UI Element  | 🔍 DOM Selector (ID/Class) or Key in `DOM_ELEMENTS` | 📝 Description & Purpose                                              | 🧠 Key JavaScript Interactions (from `js/script.js`)                                                                                                                                                                          | 🎨 Relevant CSS Classes (from `css/styles.css`)                            |
| :------------- | :-------------------------------------------------- | :-------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| Schedule Table | `scheduleTable`                                     | The main table structure.                                             | Event delegation listeners (from `setupEventListeners()`) for `click`, `mouseover`, `mouseout` on child `.slot` elements.                                                                                                     | General `table`, `th`, `td` styles                                         |
| Time Slot Cell | `td.slot` (dynamic, inside `scheduleTable`)         | Individual time slot. Clickable. `data-day` & `data-time` attributes. | Clicks call `handleToggleScheduleSlot()` (edit mode). Mouseover/mouseout call `handleShowSlotTooltip()`/`handleHideSlotTooltip()` (compare mode). Classes applied by `renderScheduleGrid()` based on `determineSlotStatus()`. | `.slot`, `.slot-selected`, `.slot-free`, `.slot-conflict`, `.slot-partial` |
| Slot Tooltip   | `slotTooltip`                                       | Pop-up in `compareMode` showing who is free/busy.                     | Display, position, `textContent` managed by `handleShowSlotTooltip()` & `handleHideSlotTooltip()`.                                                                                                                            | `.slot-tooltip`                                                            |

---

## 📤📥 Export/Import Section (`<div class="export-import">` - `index.html`)

Allows users to export/import schedule data on `index.html`. Logic in `js/script.js`. DOM elements accessed via `DOM_ELEMENTS`.

| 🔧 UI Element                | 🔍 DOM Selector (ID/Class) or Key in `DOM_ELEMENTS` | 📝 Description & Purpose                                     | 🧠 Key JavaScript Interactions (from `js/script.js`) | 🎨 Relevant CSS Classes   |
| :--------------------------- | :-------------------------------------------------- | :----------------------------------------------------------- | :--------------------------------------------------- | :------------------------ |
| "Export Current User" Button | `exportButton`                                      | Exports the `activeUser`'s schedule data as JSON.            | Event listener calls `handleExportCurrentUser()`.    | General `button` styles   |
| Import Data Textarea         | `importTextArea`                                    | Multi-line input for pasting JSON data of a user's schedule. | Value read by `handleImportSchedule()`.              | General `textarea` styles |
| "Import User" Button         | `importButton`                                      | Imports schedule data from the `importTextArea`.             | Event listener calls `handleImportSchedule()`.       | General `button` styles   |

---

## 📄 Content Sections (Other Pages - `pages/friends.html`, `pages/about.html`)

These pages have their own primary content sections. Styling primarily from `css/styles.css`.

| 🔧 UI Element        | 🔍 DOM Selector (ID/Class)                               | 📝 Description & Purpose                            | 🧠 Key JavaScript Interactions (if any)        | 🎨 Relevant CSS Classes (from `css/styles.css`) |
| :------------------- | :------------------------------------------------------- | :-------------------------------------------------- | :--------------------------------------------- | :---------------------------------------------- |
| Friends Page Content | `section.friends-page-content` (in `pages/friends.html`) | Main content area for the Friends page.             | Currently placeholder; future JS may interact. | `.page-content`, `.friends-page-content`        |
| About Page Content   | `section.about-page-content` (in `pages/about.html`)     | Main content area for the About the Developer page. | Currently placeholder; future JS may interact. | `.page-content`, `.about-page-content`          |
| Content Placeholder  | `div.content-placeholder` (within above)                 | Placeholder text for pages under development.       | N/A                                            | `.content-placeholder`                          |

---

## 🎨 Key CSS Utility & State Classes

These classes are dynamically applied by JavaScript or are key for styling specific states/components. Global styles in `css/styles.css`, menu styles in `css/menu.css`.

| 🎨 Class               | 📍 Applied To                                                         | 🧠 Purpose & Visual Effect                                                                            |
| :--------------------- | :-------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| `.menu-open`           | `body`                                                                | Indicates hamburger menu is open. Shows panel/overlay, affects body scroll (from `styles.css`).       |
| `.active`              | `div.user-item` (on `index.html`), `button#compare` (on `index.html`) | Highlights active user or indicates compare mode is on. Applied by `renderUserList()` & `updateUI()`. |
| `.selected`            | `div.user-item` (on `index.html`)                                     | Highlights users chosen for comparison. Applied by `renderUserList()`.                                |
| `.delete-btn`          | `button.delete-btn` (on `index.html`)                                 | Styles the user deletion button.                                                                      |
| `.slot`                | `td.slot` (on `index.html`)                                           | Base class for interactive schedule time slots.                                                       |
| `.slot-selected`       | `td.slot` (on `index.html`)                                           | Active user is busy (purple). Applied by `renderScheduleGrid()`.                                      |
| `.slot-free`           | `td.slot` (on `index.html`)                                           | Compare mode: all selected users free (green). Applied by `renderScheduleGrid()`.                     |
| `.slot-conflict`       | `td.slot` (on `index.html`)                                           | Compare mode: all selected users busy (red). Applied by `renderScheduleGrid()`.                       |
| `.slot-partial`        | `td.slot` (on `index.html`)                                           | Compare mode: mixed availability (orange). Applied by `renderScheduleGrid()`.                         |
| `.app`                 | `div.app` (all pages)                                                 | Main application container; layout, padding, background.                                              |
| `.page-content`        | `section` elements on `friends.html`, `about.html`                    | Styles main content area of sub-pages.                                                                |
| `.content-placeholder` | `div` inside `.page-content`                                          | Styles placeholder box for undeveloped pages.                                                         |
| `.hamburger-button`    | `button#hamburgerBtn` (all pages)                                     | Styles the hamburger icon.                                                                            |
| `.nav-panel`           | `nav#navPanel` (all pages)                                            | Styles the slide-out navigation menu.                                                                 |
| `.overlay`             | `div#overlay` (all pages)                                             | Styles background dimming overlay for open menu.                                                      |

---

## 🔄 Key User Workflows & Interactions

1.  **Opening/Closing Hamburger Menu (All Pages):**

    1.  User clicks `button#hamburgerBtn`.
    2.  `initMenu()` (from `js/menu.js`) has attached a listener that calls an internal `toggleMenu()`.
    3.  `body` gets/loses `.menu-open` class. Panel/Overlay visibility changes via CSS.
    4.  Button icon changes. Escape key or overlay click also closes.

2.  **Navigating to a Different Page (All Pages):**

    1.  Menu open, user clicks `a.nav-link`.
    2.  Menu closes, browser navigates to the linked HTML page.

3.  **Adding a New User (`index.html`):**

    1.  User types into `DOM_ELEMENTS.userNameInput`, `DOM_ELEMENTS.userIdInput`.
    2.  User clicks `DOM_ELEMENTS.addUserButton`.
    3.  `handleAddNewUser()` in `js/script.js` is called.
    4.  `createUserObject()` is used, `state` is updated, `handleSetActiveUser()` is called (which calls `saveStateToStorage()` and `updateUI()`).

4.  **Editing a User's Schedule (`index.html` - Not in Compare Mode):**

    1.  User clicks a `.user-item` (or `button.user-name-btn` within it) in `DOM_ELEMENTS.userListContainer`. Delegated event listener calls `handleSetActiveUser()`.
    2.  User clicks a `td.slot` in `DOM_ELEMENTS.scheduleTable`. Delegated event listener calls `handleToggleScheduleSlot()`.

5.  **Comparing Schedules (`index.html`):**
    1.  User clicks `DOM_ELEMENTS.compareButton`. `handleToggleCompareMode()` is called.
    2.  User clicks multiple `.user-item` elements. Delegated listener calls `handleToggleUserSelectionForCompare()`.
    3.  `renderScheduleGrid()` updates slot classes based on `determineSlotStatus()`.
    4.  Hover/mouseout on `td.slot` calls `handleShowSlotTooltip()` / `handleHideSlotTooltip()`.

---

## 📖 How to Use This Document

✅ Use this document to:

- Understand Element-Logic Links for specific pages.
- Locate Selectors (IDs, classes, or keys in `DOM_ELEMENTS`).
- Debug Interactions by tracing actions through event handlers and state changes.
- Onboard New Developers to the frontend structure and data flow.
- Reference the global `state` structure (for `index.html`) and menu interaction.
- Identify Styling Hooks and relevant CSS classes.
