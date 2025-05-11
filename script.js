let activeUser = null;
let users = loadUsers() || {};
let selectedUsers = new Set();
let compareMode = false;

loadLatestUsers();

function loadUsers() {
  const saved = localStorage.getItem("scheduleUsers");
  return saved ? JSON.parse(saved) : null;
}

function deleteUser(userId) {
  delete users[userId];
  if (activeUser === userId) {
    activeUser = null;
  }
  selectedUsers.delete(userId);
  saveUsers();
  updateUI();
}

function saveUsers() {
  localStorage.setItem("scheduleUsers", JSON.stringify(users));
  // Send updates to all connected users
  if (window.updateInterval) clearInterval(window.updateInterval);
  window.updateInterval = setInterval(loadLatestUsers, 2000);
}

function loadLatestUsers() {
  const savedUsers = localStorage.getItem("scheduleUsers");
  if (savedUsers) {
    users = JSON.parse(savedUsers);
    updateUI();
  }
}

function createUser(name, userId) {
  if (!users[userId]) {
    users[userId] = {
      id: userId, // Add the userId to the object
      name: name,
      schedule: Array(7).fill().map(() => Array(6).fill(false)),
    };
    saveUsers();
  }
  return users[userId];
}

function setActiveUser(userId) {
  activeUser = userId;
  updateUI();
}

function toggleSlot(day, time) {
  if (!activeUser || compareMode) return;
  users[activeUser].schedule[day][time] =
    !users[activeUser].schedule[day][time];
  saveUsers();
  updateUI();
}

function updateUI() {
  const slots = document.querySelectorAll(".slot");
  slots.forEach((slot) => {
    const day = parseInt(slot.dataset.day);
    const time = parseInt(slot.dataset.time);
    slot.className = "slot";
    updateSlotDisplay(slot, day, time);
  });

  // Update user list
  const userList = document.getElementById("userList");
  userList.innerHTML = Object.entries(users)
    .map(
      ([userId, user]) => `
      <div class="user-item ${activeUser === userId ? "active" : ""} ${
        selectedUsers.has(userId) ? "selected" : ""
      }">
        <button onclick="${
          compareMode
            ? `toggleUserSelection('${userId}')`
            : `setActiveUser('${userId}')`
        }">${user.name}</button>
        <button onclick="deleteUser('${userId}')" class="delete-btn">Delete</button>
      </div>
    `
    )
    .join("");
}

function compareSchedules() {
  compareMode = !compareMode;
  selectedUsers.clear();
  document.getElementById("compare").classList.toggle("active");
  updateUI();
}

function toggleUserSelection(userId) {
  if (selectedUsers.has(userId)) {
    selectedUsers.delete(userId);
  } else {
    selectedUsers.add(userId);
  }
  updateUI();
}

function updateSlotDisplay(slot, day, time) {
  slot.classList.remove(
    "slot-selected",
    "slot-conflict",
    "slot-free",
    "slot-partial"
  );

  if (compareMode) {
    if (selectedUsers.size === 0) return;

    const selectedUsersWithSlot = Object.entries(users)
      .filter(([userId]) => selectedUsers.has(userId))
      .filter(([, user]) => user.schedule[day][time]).length;

    if (selectedUsers.size === 2 && selectedUsersWithSlot === 2) {
      slot.classList.add("slot-conflict");
    } else if (selectedUsers.size > 2 && selectedUsersWithSlot > 0) {
      slot.classList.add(
        selectedUsersWithSlot === selectedUsers.size
          ? "slot-conflict"
          : "slot-partial"
      );
    } else if (selectedUsersWithSlot === 0) {
      slot.classList.add("slot-free");
    }
  } else if (activeUser && users[activeUser].schedule[day][time]) {
    slot.classList.add("slot-selected");
  }
}

function compareSchedules() {
  compareMode = !compareMode;
  selectedUsers.clear();
  activeUser = null;
  document.getElementById("compare").classList.toggle("active");
  updateUI();
}

function addNewUser() {
  const name = document.getElementById("userName").value;
  const userId = document.getElementById("userId").value;
  if (name && userId) {
    createUser(name, userId);
    setActiveUser(userId);
    document.getElementById("userName").value = "";
    document.getElementById("userId").value = "";
  }
}

// Import and Export users

function exportCurrentUser() {
  if (!activeUser) {
    alert("No active user selected.");
    return;
  }

  const currentUser = users[activeUser];
  const userToExport = {
    id: activeUser,
    name: currentUser.name,
    schedule: currentUser.schedule,
  };

  const jsonString = JSON.stringify(userToExport);
  navigator.clipboard.writeText(jsonString)
    .then(() => {
      alert("Schedule exported to clipboard!");
    })
    .catch((err) => {
      console.error("Error copying to clipboard:", err);
    });

  document.getElementById("exportText").value = jsonString;
}



function importSchedule() {
  const importText = document.getElementById("importText").value;
  try {
    const importedUser = JSON.parse(importText);

    if (
      !importedUser.name ||
      !importedUser.id ||
      !Array.isArray(importedUser.schedule)
    ) {
      alert("Invalid user format.");
      return;
    }

    users[importedUser.id] = {
      id: importedUser.id,
      name: importedUser.name,
      schedule: importedUser.schedule,
    };
    saveUsers();
    updateUI();
    alert("Schedule imported successfully!");
  } catch (e) {
    console.error("Error during import:", e);
    alert("Invalid JSON format.");
  }
}




// Initialize click handlers
document.querySelectorAll(".slot").forEach((slot) => {
  slot.addEventListener("click", () => {
    const day = parseInt(slot.dataset.day);
    const time = parseInt(slot.dataset.time);
    toggleSlot(day, time);
  });
});
