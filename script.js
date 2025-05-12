/* ================================
   GLOBAL STATE
================================== */
let activeUser = null;
let users = loadUsersFromStorage() || {};
let selectedUsers = new Set();
let compareMode = false;

/* ================================
   INITIALIZATION
================================== */

// Load users from localStorage initially and sync every 2 seconds
function loadLatestUsers() {
  const saved = localStorage.getItem("scheduleUsers");
  if (saved) {
    users = JSON.parse(saved);
    updateUI();
  }
}

// Initialize users by loading data from storage
loadLatestUsers();

/* ================================
   LOCAL STORAGE HELPERS
================================== */

// Load users object from localStorage
function loadUsersFromStorage() {
  const saved = localStorage.getItem("scheduleUsers");
  return saved ? JSON.parse(saved) : null;
}

// Save users object to localStorage and set interval to sync
function saveUsersToStorage() {
  localStorage.setItem("scheduleUsers", JSON.stringify(users));
  if (window.updateInterval) clearInterval(window.updateInterval);
  window.updateInterval = setInterval(loadLatestUsers, 2000);
}

/* ================================
   USER MANAGEMENT
================================== */

// Create a new user with a blank schedule
function createUser(name, userId) {
  if (!users[userId]) {
    users[userId] = {
      id: userId,
      name: name,
      schedule: Array(7).fill(null).map(() => Array(6).fill(false)),
    };
    saveUsersToStorage();
  }
  return users[userId];
}

// Delete user and clear associated UI state
function deleteUser(userId) {
  delete users[userId];
  if (activeUser === userId) activeUser = null;
  selectedUsers.delete(userId);
  saveUsersToStorage();
  updateUI();
}

/* ================================
   USER SELECTION & MODE TOGGLE
================================== */

// Set a user as the active editor
function setActiveUser(userId) {
  activeUser = userId;
  updateUI();
}

// Toggle compare mode on/off and reset selections
function compareSchedules() {
  compareMode = !compareMode;
  selectedUsers.clear();
  activeUser = null;
  document.getElementById("compare").classList.toggle("active");
  updateUI();
}

// Add/remove user from selection list for comparison
function toggleUserSelection(userId) {
  selectedUsers.has(userId)
    ? selectedUsers.delete(userId)
    : selectedUsers.add(userId);
  updateUI();
}

/* ================================
   SCHEDULE INTERACTION
================================== */

// Toggle a schedule slot for the active user
function toggleSlot(day, time) {
  if (!activeUser || compareMode) return;
  const schedule = users[activeUser].schedule;
  schedule[day][time] = !schedule[day][time];
  saveUsersToStorage();
  updateUI();
}

// Add proper class to slot based on comparison context (free, conflict, partial)
function updateSlotDisplay(slot, day, time) {
  slot.className = "slot"; // Reset classes

  if (compareMode && selectedUsers.size > 0) {
    const selectedCount = Array.from(selectedUsers).filter(
      (id) => users[id]?.schedule[day][time]
    ).length;

    if (selectedCount === 0) {
      slot.classList.add("slot-free");
    } else if (selectedCount === selectedUsers.size) {
      slot.classList.add("slot-conflict");
    } else {
      slot.classList.add("slot-partial");
    }
  } else if (activeUser && users[activeUser].schedule[day][time]) {
    slot.classList.add("slot-selected");
  }
}

// Show tooltip with availability info when comparing schedules
function showSlotTooltip(slot, day, time) {
  if (!compareMode || selectedUsers.size === 0) return;

  const tooltip = document.getElementById("slotTooltip");
  const freeUsers = [];
  const busyUsers = [];

  selectedUsers.forEach((userId) => {
    const user = users[userId];
    if (user.schedule[day][time]) {
      busyUsers.push(user.name);
    } else {
      freeUsers.push(user.name);
    }
  });

  let message = "";

  if (busyUsers.length === selectedUsers.size) {
    message = "All selected users are unavailable at this time.";
  } else if (freeUsers.length === selectedUsers.size) {
    message = "All selected users are free at this time.";
  } else {
    message = "Some users are available.\n";
    if (freeUsers.length) message += `Free: ${freeUsers.join(", ")}\n`;
    if (busyUsers.length) message += `Busy: ${busyUsers.join(", ")}`;
  }

  tooltip.textContent = message.trim();
  const rect = slot.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  tooltip.style.top = `${rect.top + window.scrollY - 10}px`;
  tooltip.style.display = "block";
}

// Hide the tooltip when not hovering or tapping
function hideSlotTooltip() {
  document.getElementById("slotTooltip").style.display = "none";
}

/* ================================
   UI RENDERING FUNCTIONS
================================== */

// Update the grid schedule display based on users' data
function renderScheduleGrid() {
  document.querySelectorAll(".slot").forEach((slot) => {
    const day = parseInt(slot.dataset.day);
    const time = parseInt(slot.dataset.time);
    updateSlotDisplay(slot, day, time);
  });
}

// Update the user list display with user info and actions
function renderUserList() {
  const userList = document.getElementById("userList");
  userList.innerHTML = Object.entries(users)
    .map(([userId, user]) => {
      const isActive = activeUser === userId ? "active" : "";
      const isSelected = selectedUsers.has(userId) ? "selected" : "";
      const onClick = compareMode
        ? `toggleUserSelection('${userId}')`
        : `setActiveUser('${userId}')`;
      return `
      <div class="user-item ${isActive} ${isSelected}">
        <button onclick="${onClick}">${user.name}</button>
        <button onclick="deleteUser('${userId}')" class="delete-btn">Delete</button>
      </div>
    `;
    })
    .join("");
}

// Update the entire UI by rendering schedule grid and user list
function updateUI() {
  renderScheduleGrid();
  renderUserList();
}

/* ================================
   ADD USER FORM HANDLER
================================== */

// Handle form input to add new user
function addNewUser() {
  const name = document.getElementById("userName").value.trim();
  const userId = document.getElementById("userId").value.trim();
  if (name && userId) {
    createUser(name, userId);
    setActiveUser(userId);
    document.getElementById("userName").value = "";
    document.getElementById("userId").value = "";
  }
}

/* ================================
   EXPORT / IMPORT FUNCTIONS
================================== */

// Export current active user's schedule as JSON to clipboard and textarea
function exportCurrentUser() {
  if (!activeUser) return alert("No active user selected.");

  const currentUser = users[activeUser];
  const json = JSON.stringify({
    id: currentUser.id,
    name: currentUser.name,
    schedule: currentUser.schedule,
  });

  navigator.clipboard
    .writeText(json)
    .then(() => alert("Schedule exported to clipboard!"))
    .catch((err) => console.error("Clipboard error:", err));

  document.getElementById("exportText").value = json;
}

// Import schedule data from pasted JSON into user list
function importSchedule() {
  const input = document.getElementById("importText").value;
  try {
    const user = JSON.parse(input);
    if (!user.name || !user.id || !Array.isArray(user.schedule)) {
      throw new Error("Invalid format");
    }
    users[user.id] = user;
    saveUsersToStorage();
    updateUI();
    alert("Schedule imported successfully!");
  } catch (e) {
    console.error("Import error:", e);
    alert("Invalid JSON format.");
  }
}

/* ================================
   INPUT VALIDATION
================================== */

// Allow only letters/spaces in user name input
document.getElementById("userName").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^a-zA-Z\s]/g, "");
});

// Allow only positive integers in user ID input
document.getElementById("userId").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, "");
});

/* ================================
   BIND CLICK EVENTS
================================== */

// Bind click and hover events to each slot for interaction
document.querySelectorAll(".slot").forEach((slot) => {
  const day = parseInt(slot.dataset.day);
  const time = parseInt(slot.dataset.time);

  slot.addEventListener("click", () => {
    if (!compareMode) toggleSlot(day, time);
    else showSlotTooltip(slot, day, time);
  });

  slot.addEventListener("mouseenter", () => {
    if (compareMode) showSlotTooltip(slot, day, time);
  });

  slot.addEventListener("mouseleave", hideSlotTooltip);
});
