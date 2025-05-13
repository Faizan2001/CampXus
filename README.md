# University Schedule Sync App (MeetchuThere)

A web-based scheduling and availability tracker for university students to:
- Add their own class schedule
- See overlaps with other students
- Compare availability in real-time
- Navigate easily between Schedule, Friends, and About sections.

---

## 🚀 Features

- Add students with custom schedule blocks
- Live comparison mode to see who is available or busy
- Partial clashes shown in orange, full clashes in red, free slots in green
- Hover/tap on time slots to view who's free or busy
- LocalStorage-based sync across tabs for schedule data
- Import/export schedules via JSON
- Tooltip-based slot explanations
- Responsive design with a hamburger menu for navigation across different pages (Schedule, Friends, About).
- Animated gradient styling for a modern look and feel.

---

## 📁 Project Structure

project-root/
│
├── index.html              # Main HTML (Schedule page)
├── pages/                  # Folder for other distinct pages
│   ├── friends.html        # Friends page
│   └── about.html          # About the Developer page
│
├── css/                    # Stylesheets
│   ├── styles.css          # Main UI styling, layout, global styles
│   └── menu.css            # Styles specific to the hamburger menu
│
├── js/                     # JavaScript files
│   ├── script.js           # Core logic for schedule page (state mgmt, rendering, storage)
│   └── menu.js             # JavaScript logic for the hamburger menu functionality
│
├── README.md               # Project documentation
└── UI-Map.md               # UI Reference Map (Details DOM elements and interactions)

## ⚙️ How It Works

The application follows a multi-page architecture (MPA). Each main section (Schedule, Friends, About) is a separate HTML page.

### State Management (Schedule Page - `script.js`)
- User schedule data is stored in localStorage.
- Each user has a `name`, `id`, and a `schedule` (7x6 boolean matrix).
- `activeUser` is the one editing their schedule on the Schedule page.
- `selectedUsers` is a set used in compare mode on the Schedule page.

### Slot Coloring Logic (Schedule Page)
- **Green**: Everyone selected is free.
- **Red**: Everyone selected is busy (conflict).
- **Orange**: Partial overlap among selected users.

### Compare Mode (Schedule Page)
- Toggled by the "Compare Schedules" button.
- Enables multi-user schedule comparison.
- Clicking or hovering over a slot shows who’s free/busy.

### Navigation
- A hamburger menu provides consistent navigation across all pages.
- Menu state (open/closed) is managed by `js/menu.js`.
- Styling for the menu is handled by `css/menu.css`.

---

## 🧠 Developer Guide

### Adding New Features
- For features on the Schedule page, modify `index.html` and `js/script.js`.
- For features on other pages (Friends, About), modify their respective HTML files in the `pages/` directory and consider creating new dedicated JS files in `js/` if client-side logic is needed for those pages.
- Functions in `js/script.js` and `js/menu.js` aim for Single Responsibility Principle.
- UI rendering on the Schedule page is decoupled from logic (see `renderScheduleGrid`, `renderUserList` in `js/script.js`).
- Tooltips on the Schedule page are handled in `showSlotTooltip()`.

### Styling
- Global styles, including the animated background and `.app` container, are in `css/styles.css`.
- Menu-specific styles are in `css/menu.css`.
- All buttons (except user item buttons and hamburger) share a gradient by default; `.delete-btn` overrides it with red.
- Responsive grid layout is used for main content areas.

---

## ✅ TODOs / Future Improvements

- Populate Friends and About pages with actual content and features.
- Add authentication via university email.
- Sync schedules in real-time via backend (Firebase or Supabase).
- User status (Available/In Class/Off Campus) toggle on Schedule page.
- Export to PDF/ICS calendar formats from Schedule page.
- Consider a shared header/footer component if using a build system or templating in the future to reduce HTML duplication.

---

## 🛠️ Tech Stack

- HTML, CSS, JavaScript (Vanilla)
- Multi-Page Architecture (MPA)
- LocalStorage for persistence on the Schedule page
- Fully front-end, no backend yet

---

## 🙋‍♂️ Contributing

Feel free to open issues or suggest improvements. Try to keep UI responsive and logic modular.
Ensure new pages maintain consistent navigation and styling.