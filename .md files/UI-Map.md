# 🗺️ MeetchuThere: UI Reference Map & Developer Guide

**Version:** 1.1 (Updated for multi-page structure and menu)
**Last Updated:** [Date of last update]

This document serves as a comprehensive reference for the Document Object Model (DOM) elements used in the "MeetchuThere" application. It maps HTML elements to their corresponding JavaScript interactions and CSS styling, facilitating easier onboarding for new developers and serving as a quick-glance guide for ongoing development and debugging.

---

## 📌 Table of Contents

1.  [Global JavaScript State & Key Variables (Mainly `index.html` / `script.js`)](#-global-javascript-state--key-variables-mainly-indexhtml--scriptjs)
2.  [Navigation Menu (Hamburger - All Pages)](#-navigation-menu-hamburger---all-pages)
3.  [Header Section (All Pages)](#-header-section-all-pages)
4.  [User Management Section (`<section class="users">` - `index.html`)](#-user-management-section-section-classusers---indexhtml)
    *   [Add User Form (`<div class="add-user">`)](#-add-user-form-div-classadd-user)
    *   [User List Display (`<div id="userList">`)](#-user-list-display-div-iduserlist)
    *   [Schedule Comparison Control](#-schedule-comparison-control)
5.  [Schedule Grid Section (`<section class="schedule">` - `index.html`)](#-schedule-grid-section-section-classschedule---indexhtml)
    *   [Schedule Table (`<table id="schedule">`)](#-schedule-table-table-idschedule)
    *   [Slot Tooltip (`<div id="slotTooltip">`)](#-slot-tooltip-div-idslottooltip)
6.  [Export/Import Section (`<div class="export-import">` - `index.html`)](#-exportimport-section-div-classexport-import---indexhtml)
7.  [Content Sections (Other Pages - `pages/friends.html`, `pages/about.html`)](#-content-sections-other-pages---pagesfriendshtml-pagesabouthtml)
8.  [Key CSS Utility & State Classes](#-key-css-utility--state-classes)
9.  [Key User Workflows & Interactions](#-key-user-workflows--interactions)
10. [How to Use This Document](#-how-to-use-this-document)

---

## 🌎 Global JavaScript State & Key Variables (Mainly `index.html` / `script.js`)

These variables are central to the schedule comparison logic on `index.html` and are defined in `js/script.js`.

| 🔤 Variable        | 🧬 Type    | 🧠 Description & Key Functions                                                                                                |
| :------------------ | :--------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `activeUser`      | `String`   | Stores the ID of the user whose schedule is currently being edited. `null` if no user is active or in compare mode. Set by `setActiveUser()`. |
| `users`           | `Object`   | A dictionary holding all user data, keyed by `userId`. Each user object contains `id`, `name`, and a 2D `schedule` array. Managed by `createUser()`, `deleteUser()`, `saveUsersToStorage()`, `loadUsersFromStorage()`, `importSchedule()`. |
| `selectedUsers`   | `Set`      | A set of `userId`s for users selected for schedule comparison. Managed by `toggleUserSelection()`. Cleared when `compareMode` changes. |
| `compareMode`     | `Boolean`  | Toggles `index.html` between schedule editing mode (`false`) and schedule comparison mode (`true`). Toggled by `compareSchedules()`. |

---

## 🍔 Navigation Menu (Hamburger - All Pages)

Present on `index.html`, `pages/friends.html`, `pages/about.html`. Logic in `js/menu.js`, styles in `css/menu.css`.

| 🔧 UI Element          | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                                                  | 🧠 Key JavaScript Interactions (from `js/menu.js`)                     | 🎨 Relevant CSS Classes (from `css/menu.css`) |
| :--------------------- | :------------------------- | :---------------------------------------------------------------------------------------- | :--------------------------------------------------------------------- | :------------------------------------------- |
| Hamburger Button       | `button#hamburgerBtn`      | Toggles the navigation panel. Visually changes from bars to 'X'.                          | `onclick`: calls `toggleMenu()`. Updates `aria-expanded`.              | `.hamburger-button`, `.hamburger-bar`        |
| Navigation Panel       | `nav#navPanel`             | Slides in from the left, contains navigation links.                                       | `toggleMenu()` controls its visibility via transform and `aria-hidden`. | `.nav-panel`                                 |
| Navigation Link        | `a.nav-link` (dynamic)     | Links to different pages (`index.html`, `pages/friends.html`, `pages/about.html`).        | `onclick`: if menu open, calls `toggleMenu()` before navigation.       | `.nav-link`                                  |
| Overlay                | `div#overlay`              | Dims the background when the menu is open. Clicking it closes the menu.                   | `onclick`: if menu open, calls `toggleMenu()`.                         | `.overlay`                                   |
| Body Class for Open Menu | `body.menu-open`           | Class applied to `<body>` when menu is open, used by CSS to show panel/overlay and style. | Applied/removed by `toggleMenu()`.                                     | `.menu-open` (used by selectors in `menu.css` and `styles.css`) |

---

## 🗣️ Header Section (All Pages)

| 🔧 UI Element      | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                  | 🧠 Key JavaScript Interactions | 🎨 Relevant CSS Classes (from `css/styles.css`) |
| :--------------- | :------------------------- | :-------------------------------------------------------- | :----------------------------- | :--------------------------------------------- |
| Application Title| `header > h1`              | Displays the main title "MeetchuThere" of the application. | N/A (Static content)           | `h1` (for gradient text & underline)           |

---

## 🧑‍🤝‍🧑 User Management Section (`<section class="users">` - `index.html`)

This section handles user creation, listing, and comparison mode toggle on the Schedule page (`index.html`). Logic in `js/script.js`.

| 🔧 UI Element       | 🔍 DOM Selector (ID/Class) | 📝 Description & Purpose                                                                    | 🧠 Key JavaScript Interactions (from `js/script.js`)                                                     | 🎨 Relevant CSS Classes |
| :------------------ | :------------------------- | :------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------ | :---------------------- |
| Section Heading     | `section.users > h2`       | "Manage & Compare Schedules" title.                                                         | N/A (Static content)                                                                                    | General `h2` styles     |
| Name Input Field    | `input#userName`           | Text input for the new user's name.                                                         | Value read by `addNewUser()`. Input event listener for `/[^a-zA-Z\s]/g` validation.                     | General `input` styles  |
| User ID Input Field | `input#userId`             | Text input for the new user's unique ID (numeric).                                          | Value read by `addNewUser()`. Input event listener for `/[^0-9]/g` and `/^0+/` validation.             | General `input` styles  |
| "Add User" Button | `div.add-user > button`    | Submits the new user's name and ID.                                                         | Event listener calls `addNewUser()` which calls `createUser()` and `setActiveUser()`. Resets input fields. | General `button` styles |
| User List Container | `div#userList`             | Dynamically populated container displaying all registered users.                            | Content generated by `renderUserList()`.                                                                | `.user-list`            |
| User Item           | `div.user-item` (dynamic)  | Container for an individual user's display name button and delete button.                   | Class `active` added if `activeUser === userId`. Class `selected` added if `selectedUsers.has(userId)`. | `.user-item`, `.active`, `.selected` |
| User Name Button    | `div.user-item > button:first-child` (dynamic) | Displays user's name. Click behavior depends on `compareMode`.            | If `compareMode` is `false`: event listener calls `setActiveUser(userId)`. <br> If `compareMode` is `true`: event listener calls `toggleUserSelection(userId)`. | N/A (styled within `.user-item`) |
| Delete User Button  | `button.delete-btn` (dynamic) | Allows deletion of the associated user.                                                   | Event listener calls `deleteUser(userId)`.                                                              | `.delete-btn`           |
| "Compare Schedules" Button | `button#compare`     | Toggles the application between schedule editing mode and schedule comparison mode.       | Event listener calls `compareSchedules()`. Toggles `compareMode`. Adds/removes `active` class.           | `#compare`, `.active`   |


---

## 🗓️ Schedule Grid Section (`<section class="schedule">` - `index.html`)

Displays the weekly schedule on `index.html`. Logic in `js/script.js`.

| 🔧 UI Element           | 🔍 DOM Selector (ID/Class)           | 📝 Description & Purpose                                                                                                                   | 🧠 Key JavaScript Interactions (from `js/script.js`)                                                                                                                                             | 🎨 Relevant CSS Classes                      |
| :---------------------- | :----------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------- |
| Schedule Table          | `table#schedule`                     | The main table structure displaying days of the week (rows) and time slots (columns).                                                      | N/A (Structure)                                                                                                                                                                                   | General `table`, `th`, `td` styles           |
| Time Slot Cell          | `td.slot`                            | Represents an individual time slot. Clickable to toggle availability (edit mode) or show tooltip (compare mode). Has `data-day` and `data-time` attributes. | Click listener: If not `compareMode`, calls `toggleSlot(day, time)`. If `compareMode`, calls `showSlotTooltip(slot, day, time)`. <br> Mouseenter listener: If `compareMode`, calls `showSlotTooltip(slot, day, time)`. <br> Mouseleave listener: Calls `hideSlotTooltip()`. | `.slot`                                      |
| Selected Time Slot    | `td.slot.slot-selected`              | A time slot marked as busy/unavailable by the `activeUser`.                                                                                | Class added/removed by `updateSlotDisplay()` based on `users[activeUser].schedule[day][time]`.                                                                                                 | `.slot-selected`                             |
| Free Time Slot (Compare)| `td.slot.slot-free`                  | In compare mode, indicates all `selectedUsers` are free during this time slot.                                                             | Class added by `updateSlotDisplay()` if all selected users are free.                                                                                                                              | `.slot-free`                                 |
| Conflict Time Slot (Compare)| `td.slot.slot-conflict`            | In compare mode, indicates all `selectedUsers` are busy/unavailable during this time slot.                                                 | Class added by `updateSlotDisplay()` if all selected users are busy.                                                                                                                              | `.slot-conflict`                             |
| Partial Conflict Slot (Compare)| `td.slot.slot-partial`             | In compare mode, indicates some `selectedUsers` are free and some are busy during this time slot.                                          | Class added by `updateSlotDisplay()` if there's a mix of availability.                                                                                                                            | `.slot-partial`                              |
| Slot Tooltip            | `div#slotTooltip`                    | A small pop-up that appears when hovering/clicking a time slot in `compareMode`, showing who is free/busy.                                   | Display, position, and `textContent` managed by `showSlotTooltip()` and `hideSlotTooltip()`.                                                                                                   | `.slot-tooltip`                              |

---

## 📤📥 Export/Import Section (`<div class="export-import">` - `index.html`)

Allows users to export/import schedule data on `index.html`. Logic in `js/script.js`.

| 🔧 UI Element               | 🔍 DOM Selector (ID/Class)   | 📝 Description & Purpose                                                                                                   | 🧠 Key JavaScript Interactions (from `js/script.js`)                                                                                                                                             | 🎨 Relevant CSS Classes |
| :-------------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------- |
| "Export Current User" Button| `div.export-import > button` (first one) | Exports the `activeUser`'s schedule data as a JSON string.                                                                 | Event listener calls `exportCurrentUser()`.                                                                                                                                                 | General `button` styles |
| Import Data Textarea        | `textarea#importText`        | A multi-line input field where users can paste JSON data representing a user's schedule to be imported.                      | Value read by `importSchedule()`.                                                                                                                                                           | General `textarea` styles |
| "Import User" Button        | `div.export-import > button` (second one) | Imports the schedule data from the `textarea#importText`.                                                                  | Event listener calls `importSchedule()`. Parses JSON, updates `users` object, calls `saveUsersToStorage()` and `updateUI()`.                                                              | General `button` styles |

---

## 📄 Content Sections (Other Pages - `pages/friends.html`, `pages/about.html`)

These pages have their own primary content sections.

| 🔧 UI Element         | 🔍 DOM Selector (ID/Class)                 | 📝 Description & Purpose                                     | 🧠 Key JavaScript Interactions (if any)       | 🎨 Relevant CSS Classes (from `css/styles.css`) |
| :-------------------- | :----------------------------------------- | :----------------------------------------------------------- | :------------------------------------------- | :--------------------------------------------- |
| Friends Page Content  | `section.friends-page-content` (in `pages/friends.html`) | Main content area for the Friends page.            | Currently placeholder; future JS may interact. | `.page-content`, `.friends-page-content`     |
| About Page Content    | `section.about-page-content` (in `pages/about.html`)   | Main content area for the About the Developer page. | Currently placeholder; future JS may interact. | `.page-content`, `.about-page-content`       |
| Content Placeholder   | `div.content-placeholder` (within above)   | Placeholder text for pages under development.                | N/A                                          | `.content-placeholder`                         |

---

## 🎨 Key CSS Utility & State Classes

These classes are dynamically applied by JavaScript or are key for styling specific states/components. Global styles in `css/styles.css`, menu styles in `css/menu.css`.

| 🎨 Class                | 📍 Applied To                                                | 🧠 Purpose & Visual Effect                                                              |
| :---------------------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `.menu-open`            | `body`                                                       | Indicates the hamburger menu is open. Used to show panel/overlay, hide body scroll.     |
| `.active`               | `div.user-item` (on `index.html`), `button#compare` (on `index.html`) | Highlights the currently active user or indicates compare mode is on.       |
| `.selected`             | `div.user-item` (on `index.html`)                            | Highlights users chosen for comparison in `compareMode`.                                |
| `.delete-btn`           | `div.user-item > button.delete-btn` (on `index.html`)        | Styles the user deletion button (e.g., red background).                                 |
| `.slot`                 | `td.slot` (on `index.html`)                                  | Base class for all interactive schedule time slots.                                     |
| `.slot-selected`        | `td.slot` (on `index.html`)                                  | Indicates a time slot is marked as busy/unavailable by the `activeUser` (e.g., purple). |
| `.slot-free`            | `td.slot` (on `index.html`)                                  | In compare mode: all selected users are free (e.g., green).                             |
| `.slot-conflict`        | `td.slot` (on `index.html`)                                  | In compare mode: all selected users are busy (e.g., red).                               |
| `.slot-partial`         | `td.slot` (on `index.html`)                                  | In compare mode: mixed availability among selected users (e.g., orange).                |
| `.app`                  | `div.app` (all pages)                                        | Main application container; provides overall layout, padding, background.               |
| `.page-content`         | `section` elements on `friends.html`, `about.html`           | Styles the main content area of sub-pages.                                              |
| `.content-placeholder`  | `div` inside `.page-content`                                 | Styles the placeholder box for undeveloped pages.                                       |
| `.hamburger-button`     | `button#hamburgerBtn` (all pages)                            | Styles the hamburger icon itself.                                                       |
| `.nav-panel`            | `nav#navPanel` (all pages)                                   | Styles the slide-out navigation menu.                                                   |
| `.overlay`              | `div#overlay` (all pages)                                    | Styles the background dimming overlay when menu is open.                                |

---

## 🔄 Key User Workflows & Interactions

1.  **Opening/Closing Hamburger Menu (All Pages):**
    1.  User clicks `button#hamburgerBtn`.
    2.  `toggleMenu()` in `js/menu.js` is called.
    3.  `body` gets/loses `.menu-open` class.
    4.  `nav#navPanel` slides in/out. `div#overlay` appears/disappears.
    5.  Button icon changes between bars and 'X'.
    6.  Clicking `div#overlay` or Escape key also calls `toggleMenu()` to close.

2.  **Navigating to a Different Page (All Pages):**
    1.  Menu is open. User clicks an `a.nav-link` in `nav#navPanel`.
    2.  If menu was open, `toggleMenu()` is called to visually close it.
    3.  Browser navigates to the linked HTML page (e.g., `pages/friends.html`).

3.  **Adding a New User (`index.html`):**
    1.  User types name into `input#userName`, ID into `input#userId`.
    2.  User clicks "Add User" button.
    3.  `addNewUser()` in `js/script.js` is called.
    4.  User is added to state, UI updates.

4.  **Editing a User's Schedule (`index.html` - Not in Compare Mode):**
    1.  User clicks a user name button in `div#userList`. `setActiveUser()` is called.
    2.  User clicks a `td.slot` in `table#schedule`. `toggleSlot()` is called.

5.  **Comparing Schedules (`index.html`):**
    1.  User clicks `button#compare`. `compareSchedules()` is called.
    2.  User clicks multiple user name buttons. `toggleUserSelection()` is called for each.
    3.  Schedule grid updates with `.slot-free`, `.slot-conflict`, `.slot-partial`.
    4.  Hover/click on `td.slot` calls `showSlotTooltip()`.

---

## 📖 How to Use This Document

✅ Use this document to:
*   Understand Element-Logic Links for specific pages.
*   Locate Selectors for CSS or JavaScript.
*   Debug Interactions by tracing actions.
*   Onboard New Developers to the frontend structure.
*   Reference Global State (for `index.html`) and menu interaction.
*   Identify Styling Hooks and CSS classes.