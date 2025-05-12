# University Schedule Sync App

A web-based scheduling and availability tracker for university students to:
- Add their own class schedule
- See overlaps with other students
- Compare availability in real-time

---

## 🚀 Features

- Add students with custom schedule blocks
- Live comparison mode to see who is available or busy
- Partial clashes shown in orange, full clashes in red, free slots in green
- Hover/tap on time slots to view who's free or busy
- LocalStorage-based sync across tabs
- Import/export schedules via JSON
- Tooltip-based slot explanations

---

## 📁 Project Structure

project-root/
│
├── index.html # Main HTML structure
├── style.css # UI styling, slot colors, layout
├── script.js # Core logic (state mgmt, rendering, storage, UI)
├── README.md # Project documentation 


## ⚙️ How It Works

### State Management
- Users are stored in localStorage.
- Each user has a `name`, `id`, and a `schedule` (7x6 boolean matrix).
- `activeUser` is the one editing their schedule.
- `selectedUsers` is a set used in compare mode.

### Slot Coloring Logic
- **Green**: Everyone selected is free.
- **Red**: Everyone selected is busy (conflict).
- **Orange**: Partial overlap among selected users.

### Compare Mode
- Toggled by the "Compare Schedules" button.
- Enables multi-user schedule comparison.
- Clicking or hovering over a slot shows who’s free/busy.

---

## 🧠 Developer Guide

### Adding New Features
- Each function in `script.js` follows Single Responsibility Principle.
- UI rendering is decoupled from logic (see `renderScheduleGrid`, `renderUserList`).
- Tooltips are handled in `showSlotTooltip()`.

### Styling
- All buttons share gradient by default, but `.delete-btn` overrides it with red.
- Responsive grid layout.
- Gradients and animations in background.

---

## ✅ TODOs / Future Improvements

- Add authentication via university email
- Sync schedules in real-time via backend (Firebase or Supabase)
- User status (Available/In Class/Off Campus) toggle
- Export to PDF/ICS calendar formats

---

## 🛠️ Tech Stack

- HTML, CSS, JavaScript (Vanilla)
- LocalStorage for persistence
- Fully front-end, no backend yet

---

## 🙋‍♂️ Contributing

Feel free to open issues or suggest improvements. Try to keep UI responsive and logic modular.

