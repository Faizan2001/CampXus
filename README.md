# 📅 CampXus - University Schedule Sync ✨

A sleek, web-based scheduling assistant designed to help university students effortlessly coordinate their academic lives. Add your class schedule, compare availability with friends in real-time, and find those perfect meet-up slots.

---

## 🚀 Core Features

- **📅 Personal Schedules:** Easily input and manage your weekly class blocks with custom time slots
- **⏰ Dynamic Time Management:** Add, edit, and customize time periods with validation (e.g., "10:00-11:30")
- **📌 Advanced Pin Mode:** Focus on editing a single user's schedule with visual lock and pin indicators
- **🔄 Real-Time Comparison:** Select multiple users and instantly see overlaps with intelligent conflict detection
  - 🟢 **Green:** Everyone's available (perfect meeting time)
  - 🔴 **Red:** Full conflict zone (everyone's busy)
  - 🟠 **Orange:** Partial overlap (some available, some busy)
  - 🟣 **Purple:** Active user's selected time slots
- **🎛️ Smart UI Controls:** Three-state buttons with clear Disabled/Off/On visual feedback
- **🎨 Modern Design System:** Glassmorphism effects with smooth dark/light theme transitions
- **📤📥 Data Portability:** Complete import/export functionality via JSON with data validation
- **📱 Responsive Excellence:** Optimized for desktop, tablet, and mobile with modern CSS features
- **💾 Persistent Storage:** LocalStorage with automatic data migration and backup recovery
- **🧪 Comprehensive Testing:** Jest-powered unit tests ensuring reliability and code quality
- **♿ Accessibility Ready:** Keyboard navigation, focus management, and reduced motion support

---

## 🛠️ Tech Stack

**Multi-Page Application (MPA)** built with modern web standards:

- 🍦 **Vanilla HTML, CSS, and JavaScript (ES6 Modules)**
- 🎨 **Advanced Modular CSS Architecture (9 specialized modules)**
  - `variables.css` - Design system, themes & CSS custom properties
  - `layout.css` - App structure, navigation & responsive grid systems
  - `components.css` - UI components, glassmorphism cards & forms
  - `schedule.css` - Schedule grid, time slots & interactive features
  - `menu.css` - Navigation system & theme toggle functionality
  - `modal.css` - Modal dialogs with backdrop blur effects
  - `animations.css` - Transitions, hover effects & motion design
  - `responsive-enhancements.css` - Modern 2025 responsive features
  - `styles.css` - Main orchestrator importing all modules
- 📦 **Comprehensive JavaScript Architecture (8 specialized modules)**
  - `script.js` - Core application logic & state management
  - `domElements.js` - DOM element caching for performance optimization
  - `modal.js` - Modal system & user interaction handling
  - `timeUtils.js` - Time parsing, validation & schedule utilities
  - `export-import.js` - Data import/export functionality
  - `menu.js` - Navigation & theme system management
  - `constants.js` - App configuration & default values
- 🗄️ **LocalStorage** - Client-side data persistence with migration support
- 🧪 **Jest Testing Framework** - Comprehensive unit testing with 3 test suites
- 🎯 **Modern Web Features** - Container queries, fluid typography, dynamic viewport units

## 📁 Project Structure

```
CampXus/
├── .md files/                          # 📚 Documentation Hub
│   ├── Contributing-Guide.md            # Development guidelines & conventions
│   ├── tests-roadmap.md                 # Testing strategy & progress tracker
│   ├── UI-Map.md                        # Complete DOM & interaction reference
│   └── RESPONSIVE_ENHANCEMENT_REPORT.md # Modern CSS features report
├── css/                                 # 🎨 Modular Stylesheet Architecture
│   ├── variables.css                    # Design system & CSS custom properties
│   ├── layout.css                       # App structure & navigation system
│   ├── components.css                   # UI components, cards & forms
│   ├── schedule.css                     # Schedule grid & time slot interactions
│   ├── menu.css                         # Navigation & theme toggle system
│   ├── modal.css                        # Modal dialogs & glassmorphism effects
│   ├── animations.css                   # Transitions, hover effects & motion
│   ├── responsive-enhancements.css      # Modern responsive features (2025)
│   └── styles.css                       # Main import file (orchestrates all modules)
├── js/                                  # ⚙️ Modular JavaScript Architecture
│   ├── constants.js                     # App configuration & default values
│   ├── domElements.js                   # DOM element caching for performance
│   ├── script.js                        # Core application logic & state management
│   ├── modal.js                         # Modal system & user interactions
│   ├── menu.js                          # Navigation & theme system
│   ├── timeUtils.js                     # Time parsing & schedule utilities
│   ├── export-import.js                 # Data import/export functionality
│   ├── script.test.js                   # Core logic unit tests (Jest)
│   ├── scheduleEditor.test.js           # Schedule editing tests
│   └── timeUtils.test.js                # Time utilities tests
├── pages/                               # 📄 Multi-page Application Structure
│   ├── about.html                       # About page with app information
│   └── friends.html                     # Friends management page
├── index.html                           # 🏠 Main schedule interface
├── package.json                         # Node.js dependencies & Jest configuration
├── jest.setup.js                        # Jest testing environment setup
└── README.md                            # Project overview & setup guide
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
