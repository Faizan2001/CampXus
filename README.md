# 📅 CampXus - University Schedule Sync ✨

A sleek, web-based scheduling assistant designed to help university students effortlessly coordinate their academic lives. Add your class schedule, compare availability with friends in real-time, and find those perfect meet-up slots.

---

## 🚀 Core Features

- **Personal Schedules:** Easily input and manage your weekly class blocks
- **Dynamic Time Slots:** Add and edit custom time periods (e.g., "10:00-11:30")
- **Pin Mode:** Focus on editing a single user's schedule with visual lock
- **Real-Time Comparison:** Select multiple users and instantly see overlaps
  - 🟢 **Green:** Everyone's available
  - 🔴 **Red:** Full conflict zone
  - 🟠 **Orange:** Some overlap, some free
- **Smart UI:** Three-state buttons clearly show Disabled/Off/On states
- **Modern Design:** Glassmorphism effects with dark/light theme toggle
- **Data Portability:** Import/Export schedules via JSON
- **Responsive:** Optimized for desktop, tablet, and mobile devices
- **Browser Storage:** LocalStorage persistence for your data

---

## 🛠️ Tech Stack

**Multi-Page Application (MPA)** built with modern web standards:

- 🍦 **Vanilla HTML, CSS, and JavaScript (ES6 Modules)**
- 🎨 **Modular CSS Architecture**
  - `styles.css` - Core design system and components
  - 🎨 **Modular CSS** - `styles.css` for global styles, `menu.css` for navigation, `modal.css` for modals
- 📦 **Modular JavaScript** - Organized in `js/` directory for better maintainability
- 🗄️ **LocalStorage** - Client-side data persistence
- 🧪 **Jest** - Unit testing framework

## 📁 Project Structure

```
CampXus/
├── .md Files/
│   ├── Contributing-Guide.md
│   ├── tests-roadmap.md
│   └── UI-Map.md
├── css/
│   ├── menu.css
│   ├── modal.css
│   └── styles.css
├── js/
│   ├── constants.js
│   ├── domElements.js
│   ├── menu.js
│   ├── modal.js
│   ├── script.js
│   ├── timeUtils.js
│   └── *.test.js (Jest tests)
├── pages/
│   ├── about.html
│   └── friends.html
├── index.html
├── package.json
└── README.md
```

---

## ⚙️ How It Works

**State Management:** User data and UI state are managed in `js/script.js` with modular helpers for DOM manipulation, modals, and time utilities.

**Key Features:**

- Dynamic time slot management with custom user schedules
- Real-time schedule comparison across multiple users
- Pin mode for focused editing
- Responsive design with consistent navigation

---

## 🚀 Getting Started

1. **Clone/Download** the project
2. **Install dependencies:** `npm install`
3. **Run tests:** `npm test`
4. **Open in browser:** Launch `index.html` or use a local server

## 🧠 Developer Guide

**Main Components:**

- `js/script.js` - Core application logic and state management
- `js/domElements.js` - DOM element caching for performance
- `js/modal.js` - Modal creation and user interaction
- `js/timeUtils.js` - Time parsing and validation utilities
- `js/menu.js` - Navigation and theme system

**Adding Features:**

- Schedule features: Start in `index.html` and `js/script.js`
- New pages: Add to `pages/` directory
- New tests: Follow patterns in existing `*.test.js` files

**Documentation:** Check `.md Files/` directory for detailed guides

---

## 🎯 Roadmap

**Current Focus:**

- Enhanced schedule comparison features
- Advanced clash detection across different time formats
- UI improvements for better user experience

**Future Plans:**

- Firebase integration for cloud storage and real-time collaboration
- Export options (PDF, ICS calendar files)
- Enhanced friend management system

---

## 🤝 Contributing

Check out `Contributing-Guide.md` in the `.md Files/` directory for detailed guidelines.

**Key Principles:**

- Keep UI responsive and accessible
- Write modular, testable code
- Ensure new features integrate seamlessly with existing navigation

Let's make scheduling effortless! 🎉
