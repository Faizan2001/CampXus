# 📅 MeetchuThere - University Schedule Sync ✨

Never miss a study session or a coffee break again! MeetchuThere is a sleek, web-based scheduling assistant designed to help university students effortlessly coordinate their academic lives. Add your class schedule, compare availability with friends in real-time, and find those perfect meet-up slots.

---

## 🚀 Core Features

- **Personal Schedules:** Easily input and manage your weekly class blocks.
- **Dynamic & Editable Time Slots:** Add new custom time slots (e.g., "10:00-11:30") to any user's schedule. Existing time slots can be edited (start/end times).
- **Pin Mode:** Focus on editing a single user's schedule without accidental deselection. The UI clearly indicates when Pin Mode is active.
- **Real-Time Comparison:** Select multiple users and instantly see who's free, busy, or partially clashing.
  - 🟢 **Green:** Everyone's available!
  - 🔴 **Red:** Full conflict zone!
  - 🟠 **Orange:** Some overlap, some free.
- **Three-State Control Buttons:** "Compare Schedules" and "Pin Mode" buttons clearly show their state (Disabled, Enabled-Off, Enabled-On) with distinct styling and text.
- **Insightful Tooltips:** Hover or tap on slots in compare mode to see exactly who's available.
- **Custom Modals:** User-friendly modals for time input and editing with validation.
- **Data Portability:** Import/Export individual user schedules via JSON.
- **Seamless Navigation:** A smooth hamburger menu guides you between the main Schedule, Friends, and About pages.
- **Modern & Responsive:** Enjoy an animated gradient UI that looks great on any device.
- **Browser-Friendly:** Uses LocalStorage for persisting schedule data right in your browser.

---

## 🛠️ Tech Stack & Structure

This project is a **Multi-Page Application (MPA)** built with the essentials:

- 🍦 **Vanilla HTML, CSS, and JavaScript (ES6 Modules)**
- 🗄️ **LocalStorage** for client-side data persistence (on the Schedule page).
- 🧪 **Jest** for unit testing core logic.
- 🎨 **Modular CSS** (`styles.css` for global, `menu.css` for navigation, `modal.css` for modals).
- 📦 **Modular JavaScript** in the `js/` directory for better organization and testability (e.g., `script.js`, `timeUtils.js`, `modal.js`, `domElements.js`, `constants.js`).

**Project Layout:**

```
CampXus/ (Project Root)
│
├── .md Files/
│   ├── Contributing-Guide.md
│   ├── tests-roadmap.md
│   └── UI-Map.md
│
├── css/
│   ├── menu.css
│   ├── modal.css
│   └── styles.css
│
├── js/
│   ├── constants.js         # Global constants
│   ├── domElements.js       # DOM element references
│   ├── menu.js              # Hamburger menu logic
│   ├── modal.js             # Modal creation and handling
│   ├── scheduleEditor.test.js # Jest tests for schedule editing logic
│   ├── script.js            # Main application logic for index.html
│   ├── script.test.js       # Jest tests for general script logic
│   └── timeUtils.js         # Utility functions for time manipulation
│
├── node_modules/   # (Typically in .gitignore)
│
├── pages/
│   ├── about.html
│   └── friends.html
│
├── .gitignore
├── index.html         # Main Schedule Page
├── jest.setup.js      # Jest global setup (mocks etc.)
├── package-lock.json
├── package.json
└── README.md
```

---

## ⚙️ How It Works (The Gist)

- **Schedule Page (`index.html`, `js/script.js` & helper modules in `js/`):** This is the heart of the app.
  - **State Management:** User data (including custom `timeSlots` and `pinnedSlots`) and UI state (active user, compare mode, pin mode) are managed primarily in `js/script.js`. Schedules are represented by user objects containing their availability and `timeSlots`.
  - **DOM Updates:** JavaScript dynamically renders the user list and schedule grid (including dynamic time slot headers) based on the current state, utilizing helper functions for DOM manipulation and modal interactions.
  - **Time Logic:** `js/timeUtils.js` provides functions for parsing, validating, and comparing times, crucial for dynamic slot management.
  - **Control Button Logic:** Helper functions (`getCompareButtonDynamicState`, `getPinModeButtonDynamicState`) determine the appearance and behavior of the Compare and Pin Mode buttons.
- **Navigation (`js/menu.js` & `css/menu.css`):** A consistent hamburger menu provides access to all application pages.
- **Styling:** Global aesthetics and specific component styles (like modals and menus) are separated for clarity.

---

## 🧠 Developer Quick Guide

- **Main Logic (Schedule):** `js/script.js` orchestrates the schedule page, working with:
  - `js/domElements.js` for UI element references.
  - `js/modal.js` for displaying input/edit modals.
  - `js/timeUtils.js` for time-related operations.
  - `js/constants.js` for shared constant values.
- **Menu Logic:** `js/menu.js`
- **Documentation:** Found in the `.md Files/` directory and this `README.md`.
- **Adding Features:**
  - For the Schedule page, start in `index.html` and `js/script.js`, and consider if new helper functions belong in existing or new modules within `js/`. (e.g., Pin Mode logic, dynamic time slot management).
  - For Friends/About pages, head to the `pages/` directory.
- **Testing:** We use Jest!
  - Core schedule editing and dynamic time slot logic tests are in `js/scheduleEditor.test.js`.
  - Other general tests (including state management for compare/pin modes) can be found in `js/script.test.js`.
  - Refer to `tests-roadmap.md` for testing strategy. New logic should ideally come with new tests.

---

## ✅ Next Adventures (TODOs / Future)

Reflecting the [Phase Plan for Dynamic Time Slots & Advanced Comparison](https://chat.openai.com/share/c3a0a81a-5299-45f5-8581-a70a1a980f8e):

- **Phase 5: Advanced Clash Detection - Integration:** Modify `determineSlotStatus` to use the new time parsing and interval overlap logic for accurate comparison of heterogeneous schedules.
- **Phase 6: UI Enhancements for Heterogeneous Schedule Display (Advanced/Optional):** Explore intuitive visual representations for comparing schedules with different time slot structures.
- **Phase 7: Firebase Integration:**
  - Store user profiles (custom `timeSlots`, schedule data) in Firebase (Firestore).
  - Implement Firebase Authentication.
  - Update `friends.html` search to query Firebase.
- **Content & Other Features:**
  - Bring the "Friends" and "About" pages to life with content!
  - More export options (PDF, ICS).

---

## 🙋‍♂️ Want to Contribute?

Awesome! Check out the `Contributing-Guide.md` in the `.md Files/` directory. Key principles:

- Keep UI responsive and clean.
- Write modular, testable JavaScript.
- Ensure new pages fit seamlessly with existing navigation and style.

Let's make scheduling painless!
