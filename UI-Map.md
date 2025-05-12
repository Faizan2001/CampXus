# 🗺️ UI Reference Map – DOM Elements & Their Roles

A **quick-glance guide** to how the HTML structure connects with the JavaScript logic and CSS styling in the project.

---

## 🧍 Add User Section

| 🔧 Element             | 🔍 ID / Class      | 🧠 Purpose & JS Link                                                                 |
|------------------------|--------------------|---------------------------------------------------------------------------------------|
| 👤 Name input field     | `id="userName"`     | Accepts user’s display name. Validated via JS to allow only letters/spaces. Used in `addNewUser()` |
| 🆔 ID input field       | `id="userId"`       | Accepts numeric ID (positive integers only). Used in `addNewUser()`                  |
| ➕ Add Button (implicit)| *N/A* (inside JS)   | Triggered when both fields are valid. Logic handled in `addNewUser()`                |
| 🟦 Container            | `class="add-user"`  | CSS-styled wrapper for the input form                                                |

---

## 🧑‍🤝‍🧑 User List Section

| 🔧 Element             | 🔍 ID / Class        | 🧠 Purpose & JS Link                                                                 |
|------------------------|----------------------|---------------------------------------------------------------------------------------|
| 📋 User list container  | `id="userList"`       | Dynamically populated via `renderUserList()`. Shows all added users                  |
| 🔘 User button item     | `.user-item > button` | Click to activate user or select in compare mode. Calls `setActiveUser()` or `toggleUserSelection()` |
| 🗑️ Delete button        | `.delete-btn`         | Red button next to each user. Triggers `deleteUser(userId)`                          |
| 🧪 Compare button       | `id="compare"`        | Toggles `compareMode`. Triggers `compareSchedules()` when active                     |

---

## 🕓 Schedule Grid

| 🔧 Element                  | 🔍 ID / Class       | 🧠 Purpose & JS Link                                                                 |
|-----------------------------|---------------------|---------------------------------------------------------------------------------------|
| 📅 Grid container            | `class="schedule"`   | Outer wrapper for the schedule table                                                 |
| 📊 Table element             | `id="scheduleTable"` | Table showing time slots. Populated with `<td class="slot">`                         |
| 📆 Table cells (slots)      | `class="slot"`       | Each slot clickable; linked to `handleSlotClick()`                                   |
| 🟣 Selected slot            | `class="slot-selected"` | Added when a slot is toggled on for current user                                    |
| 🟩 Free (all free) slot     | `class="slot-free"`  | Used in compare mode — all selected users free here                                  |
| 🟥 Conflict slot            | `class="slot-conflict"`| Used in compare mode — all selected users are busy                                   |
| 🟧 Partial slot             | `class="slot-partial"` | Used in compare mode — some are free, others not                                    |

---

## 💬 Tooltip (Compare Mode)

| 🔧 Element             | 🔍 ID              | 🧠 Purpose & JS Link                                                         |
|------------------------|--------------------|------------------------------------------------------------------------------|
| 💬 Hover Tooltip       | `id="slotTooltip"` | Displays dynamic content when hovering over slot in compare mode. Controlled by `showSlotTooltip()` and hidden via `hideSlotTooltip()` |

---

## 📤 Export / 📥 Import

| 🔧 Element             | 🔍 ID            | 🧠 Purpose & JS Link                                                         |
|------------------------|------------------|------------------------------------------------------------------------------|
| 📤 Export Textarea      | `id="exportText"` | Shows JSON of selected user’s schedule. Controlled via `exportCurrentUser()` |
| 📥 Import Textarea      | `id="importText"` | Accepts a valid JSON input to load a schedule. Handled via `importUserData()` |
| 📋 Clipboard Export     | *via JS only*    | Uses `navigator.clipboard.writeText()` to copy export text to clipboard     |

---

## 💄 Style Mapping (CSS Utility Classes)

| 🎨 Class                | 🧠 Purpose                                                                 |
|-------------------------|---------------------------------------------------------------------------|
| `.delete-btn`           | Red-colored delete buttons. Custom styled to override button base styles |
| `.user-item.active`     | Visually highlights the current active user                              |
| `.user-item.selected`   | Used in compare mode — shows which users are selected                    |
| `.slot`                 | Base class for all schedule cells                                        |
| `.slot-selected`        | Indicates a cell is selected by active user                              |
| `.slot-free`            | All compared users are free in this slot                                 |
| `.slot-conflict`        | All compared users are busy in this slot                                 |
| `.slot-partial`         | Mixed availability among selected users                                  |
| `.app`                  | Main white container with margin, shadow, and padding                    |
| `.add-user`             | Flex/grid container for the add-user input section                       |

---

## 🧪 JavaScript Variables & Data Structure

| 🔤 Variable         | 🧠 Description                                                                 |
|---------------------|--------------------------------------------------------------------------------|
| `users`             | Main object of all users and their schedules. Stored in localStorage           |
| `activeUser`        | Holds ID of the currently active user                                          |
| `selectedUsers`     | `Set` of user IDs used in compare mode                                         |
| `compareMode`       | Boolean toggle to show/hide compare mode visualization                         |

---

## 🧠 Suggested Use

✅ Use this document to:
- Understand which JS function controls which DOM elements  
- Quickly find the right `id` or `class` when styling or debugging  
- Onboard collaborators or future-you with zero confusion  

---

