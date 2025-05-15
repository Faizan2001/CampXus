# 📅 MeetchuThere - University Schedule Sync ✨

Never miss a study session or a coffee break again! MeetchuThere is a sleek, web-based scheduling assistant designed to help university students effortlessly coordinate their academic lives. Add your class schedule, compare availability with friends in real-time, and find those perfect meet-up slots.

---

## 🚀 Core Features

*   **Personal Schedules:** Easily input and manage your weekly class blocks.
*   **Real-Time Comparison:** Select multiple users and instantly see who's free, busy, or partially clashing.
    *   🟢 **Green:** Everyone's available!
    *   🔴 **Red:** Full conflict zone!
    *   🟠 **Orange:** Some overlap, some free.
*   **Insightful Tooltips:** Hover or tap on slots in compare mode to see exactly who's available.
*   **Data Portability:** Import/Export individual user schedules via JSON.
*   **Seamless Navigation:** A smooth hamburger menu guides you between the main Schedule, Friends, and About pages.
*   **Modern & Responsive:** Enjoy an animated gradient UI that looks great on any device.
*   **Browser-Friendly:** Uses LocalStorage for persisting schedule data right in your browser.

---

## 🛠️ Tech Stack & Structure

This project is a **Multi-Page Application (MPA)** built with the essentials:

*   🍦 **Vanilla HTML, CSS, and JavaScript (ES6 Modules)**
*   🗄️ **LocalStorage** for client-side data persistence (on the Schedule page).
*   🧪 **Jest** for unit testing core logic.
*   🎨 **Modular CSS** (`styles.css` for global, `menu.css` for navigation).

**Project Layout:**
```
CLASSCLASHES/
│
├── .md Files/
│   ├── Contributing-Guide.md
│   ├── tests-roadmap.md
│   └── UI-Map.md
│
├── css/
│   ├── menu.css
│   └── styles.css
│
├── js/
│   ├── menu.js
│   ├── script.js
│   └── script.test.js
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

*   **Schedule Page (`index.html` & `js/script.js`):** This is the heart of the app.
    *   **State Management:** User data and UI state (active user, compare mode) are managed in `js/script.js`. Schedules are 7x6 boolean matrices.
    *   **DOM Updates:** JavaScript dynamically renders the user list and schedule grid based on the current state.
*   **Navigation (`js/menu.js` & `css/menu.css`):** A consistent hamburger menu provides access to all application pages.
*   **Styling:** Global aesthetics and specific component styles are separated for clarity.

---

## 🧠 Developer Quick Guide

*   **Main Logic (Schedule):** `js/script.js` (now using ES6 modules for better structure and testability!)
*   **Menu Logic:** `js/menu.js`
*   **Documentation:** Found in the `.md Files/` directory and this `README.md`.
*   **Adding Features:**
    *   For the Schedule page, dive into `index.html` and `js/script.js`.
    *   For Friends/About pages, head to the `pages/` directory. Consider new JS files for their specific logic if needed.
*   **Testing:** We use Jest! Check out `js/script.test.js` for examples and `tests-roadmap.md` for what to test. New logic should ideally come with new tests.

---

## ✅ Next Adventures (TODOs / Future)

*   Bring the "Friends" and "About" pages to life with content!
*   University email authentication.
*   Real-time backend sync (e.g., Firebase, Supabase).
*   More export options (PDF, ICS).

---

## 🙋‍♂️ Want to Contribute?

Awesome! Check out the `Contributing-Guide.md` in the `.md Files/` directory. Key principles:

*   Keep UI responsive and clean.
*   Write modular, testable JavaScript.
*   Ensure new pages fit seamlessly with existing navigation and style.

Let's make scheduling painless!
