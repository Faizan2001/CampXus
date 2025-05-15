// js/script.js

/* ================================
   DOM REFERENCES (Exported for potential use in tests or other modules)
================================== */
// These can be fetched once and then used.
// If a function needs one, it can import it or be passed it.
export const DOM_ELEMENTS = {
  userNameInput: document.getElementById("userName"),
  userIdInput: document.getElementById("userId"),
  userListContainer: document.getElementById("userList"),
  compareButton: document.getElementById("compare"),
  scheduleTable: document.getElementById("schedule"),
  slotTooltip: document.getElementById("slotTooltip"),
  importTextArea: document.getElementById("importText"),
  // Add button selectors here as well
  addUserButton: document.querySelector(".add-user button"),
  exportButton: document.querySelector(".export-import button:nth-of-type(1)"),
  importButton: document.querySelector(".export-import button:nth-of-type(2)"),
};

const LOCAL_STORAGE_KEY = "scheduleUsers";

/* ================================
   APPLICATION STATE (Not directly exported, managed via functions)
================================== */
let state = {
  activeUserId: null,
  users: {}, // { userId: { id, name, schedule[][] } }
  selectedUserIds: new Set(),
  compareMode: false,
};

// --- State Accessors/Mutators (Optional but good for encapsulation) ---
// These allow controlled access/modification of state, useful for testing & clarity
export function getState() {
  // Return a copy to prevent direct external modification if strictness is desired
  // For simplicity now, we can return direct state, but be mindful.
  return state;
}

export function _setStateForTesting(newState) { // Underscore indicates for testing/internal use
  state = { ...state, ...newState }; // Simple merge, can be more sophisticated
}

export function _resetStateForTesting() {
  state = {
    activeUserId: null,
    users: {},
    selectedUserIds: new Set(),
    compareMode: false,
  };
}

/* ================================
   CORE LOGIC FUNCTIONS (Pure or Purer)
   These will be EXPORTED for testing
================================== */

export function createUserObject(name, userId, currentUsers) {
  if (!currentUsers[userId]) {
    const schedule = Array(7).fill(null).map(() => Array(6).fill(false));
    return { id: userId, name: name, schedule: schedule };
  }
  return null;
}

export function deleteUserFromState(userId, currentState) {
  const newUsers = { ...currentState.users };
  let newActiveUserId = currentState.activeUserId;
  const newSelectedUserIds = new Set(currentState.selectedUserIds);

  if (!newUsers[userId]) return currentState; // No change if user doesn't exist

  delete newUsers[userId];

  if (newActiveUserId === userId) {
    newActiveUserId = null;
  }
  newSelectedUserIds.delete(userId);

  return {
    ...currentState,
    users: newUsers,
    activeUserId: newActiveUserId,
    selectedUserIds: newSelectedUserIds,
  };
}

export function toggleSlotInSchedule(dayIndex, timeIndex, userSchedule) {
  // Creates a new schedule to maintain immutability, beneficial for some patterns/frameworks
  // and makes testing easier as the input is not modified.
  const newSchedule = userSchedule.map((day, dIndex) =>
    dIndex === dayIndex
      ? day.map((slot, tIndex) => (tIndex === timeIndex ? !slot : slot))
      : [...day] // Copy other days
  );
  return newSchedule;
}

export function determineSlotStatus(dayIndex, timeIndex, currentState) {
  const { compareMode, selectedUserIds, users, activeUserId } = currentState;

  if (compareMode && selectedUserIds.size > 0) {
    let busyCount = 0;
    selectedUserIds.forEach(id => {
      if (users[id]?.schedule?.[dayIndex]?.[timeIndex]) {
        busyCount++;
      }
    });

    if (busyCount === 0) return "slot-free";
    if (busyCount === selectedUserIds.size) return "slot-conflict";
    return "slot-partial";
  } else if (activeUserId && users[activeUserId]?.schedule?.[dayIndex]?.[timeIndex]) {
    return "slot-selected";
  }
  return "slot"; // Default
}

export function generateTooltipMessage(dayIndex, timeIndex, currentState) {
  const { users, selectedUserIds } = currentState;
  if (selectedUserIds.size === 0) return "";

  const freeUsers = [];
  const busyUsers = [];

  selectedUserIds.forEach((userId) => {
    const user = users[userId];
    if (user) {
      if (user.schedule?.[dayIndex]?.[timeIndex]) {
        busyUsers.push(user.name);
      } else {
        freeUsers.push(user.name);
      }
    }
  });

  if (busyUsers.length === selectedUserIds.size) return "All selected users are unavailable.";
  if (freeUsers.length === selectedUserIds.size) return "All selected users are free.";
  
  let message = "Availability:\n";
  if (freeUsers.length > 0) message += `Free: ${freeUsers.join(", ")}\n`;
  if (busyUsers.length > 0) message += `Busy: ${busyUsers.join(", ")}`;
  return message.trim();
}


/* ================================
   STATE PERSISTENCE (LocalStorage)
================================== */

function loadStateFromStorage() {
  const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (savedState) {
    const parsed = JSON.parse(savedState);
    // Only update the users part of the state from storage
    // Other parts of state (activeUserId, compareMode, etc.) are transient
    state.users = parsed.users || {};
  }
}

function saveStateToStorage() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ users: state.users }));
}

/* ================================
   UI RENDERING FUNCTIONS
   (These will still interact with DOM_ELEMENTS but get data from state or params)
================================== */

function renderScheduleGrid() {
  if (!DOM_ELEMENTS.scheduleTable) return;
  DOM_ELEMENTS.scheduleTable.querySelectorAll(".slot").forEach((slotElement) => {
    const day = parseInt(slotElement.dataset.day, 10);
    const time = parseInt(slotElement.dataset.time, 10);

    if (!isNaN(day) && !isNaN(time)) {
      slotElement.className = 'slot'; // Reset
      const statusClass = determineSlotStatus(day, time, state); // Use the pure logic function
      if (statusClass !== 'slot') {
        slotElement.classList.add(statusClass);
      }
    }
  });
}

function renderUserList() {
  if (!DOM_ELEMENTS.userListContainer) return;

  const userEntries = Object.entries(state.users);
  if (userEntries.length === 0) {
    DOM_ELEMENTS.userListContainer.innerHTML = "<p>No users added yet.</p>";
    return;
  }

  DOM_ELEMENTS.userListContainer.innerHTML = userEntries
    .map(([userId, user]) => {
      const isActive = state.activeUserId === userId ? "active" : "";
      const isSelected = state.selectedUserIds.has(userId) ? "selected" : "";
      // Inline onclick is harder to test. We'll move to delegated listeners.
      return `
        <div data-user-id="${userId}" class="user-item ${isActive} ${isSelected}">
          <button class="user-name-btn">${user.name}</button>
          <button data-delete-user-id="${userId}" class="delete-btn">Delete</button>
        </div>
      `;
    })
    .join("");
}

function updateUI() {
  renderScheduleGrid();
  renderUserList();
  // Update compare button visual state
  if (DOM_ELEMENTS.compareButton) {
    DOM_ELEMENTS.compareButton.classList.toggle("active", state.compareMode);
  }
}

/* ================================
   EVENT HANDLERS & APP LOGIC
   (These functions orchestrate calls to pure functions and update state)
================================== */

function handleAddNewUser() {
  if (!DOM_ELEMENTS.userNameInput || !DOM_ELEMENTS.userIdInput) return;
  const name = DOM_ELEMENTS.userNameInput.value.trim();
  const userId = DOM_ELEMENTS.userIdInput.value.trim();

  if (name && userId) {
    const newUserObject = createUserObject(name, userId, state.users);
    if (newUserObject) {
      state.users[userId] = newUserObject; // Modify state here
      handleSetActiveUser(userId); // Call the handler
      // saveStateToStorage(); // handleSetActiveUser calls updateUI which will save
    } else {
      alert(`User with ID ${userId} already exists.`);
    }
    DOM_ELEMENTS.userNameInput.value = "";
    DOM_ELEMENTS.userIdInput.value = "";
  } else {
    alert("Please enter both a name and a unique ID.");
  }
}

function handleDeleteUser(userId) {
  const newState = deleteUserFromState(userId, state);
  state = newState; // Update global state
  saveStateToStorage();
  updateUI();
}

function handleSetActiveUser(userId) {
  if (state.users[userId]) {
    state.activeUserId = userId;
    state.compareMode = false;
    state.selectedUserIds.clear();
    saveStateToStorage(); // Save state when active user changes or mode exits
    updateUI();
  }
}

function handleToggleCompareMode() {
  state.compareMode = !state.compareMode;
  state.activeUserId = null;
  state.selectedUserIds.clear();
  // saveStateToStorage(); // Optional: save compareMode if it should persist (currently not)
  updateUI();
}

function handleToggleUserSelectionForCompare(userId) {
  if (!state.compareMode || !state.users[userId]) return;

  if (state.selectedUserIds.has(userId)) {
    state.selectedUserIds.delete(userId);
  } else {
    state.selectedUserIds.add(userId);
  }
  // saveStateToStorage(); // Optional: save selectedUserIds if it should persist
  updateUI();
}

function handleToggleScheduleSlot(dayIndex, timeIndex) {
  if (!state.activeUserId || state.compareMode) return;
  const currentUser = state.users[state.activeUserId];

  if (currentUser?.schedule?.[dayIndex]?.[timeIndex] !== undefined) {
    const newSchedule = toggleSlotInSchedule(dayIndex, timeIndex, currentUser.schedule);
    currentUser.schedule = newSchedule; // Update the user's schedule in the state
    saveStateToStorage();
    updateUI();
  }
}

function handleShowSlotTooltip(slotElement, dayIndex, timeIndex) {
  if (!DOM_ELEMENTS.slotTooltip || !state.compareMode || state.selectedUserIds.size === 0) {
    handleHideSlotTooltip();
    return;
  }
  const message = generateTooltipMessage(dayIndex, timeIndex, state);
  DOM_ELEMENTS.slotTooltip.textContent = message;

  const rect = slotElement.getBoundingClientRect();
  DOM_ELEMENTS.slotTooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  DOM_ELEMENTS.slotTooltip.style.top = `${rect.top + window.scrollY - DOM_ELEMENTS.slotTooltip.offsetHeight - 5}px`;
  DOM_ELEMENTS.slotTooltip.style.display = "block";
  DOM_ELEMENTS.slotTooltip.style.transform = 'translateX(-50%)';
}

function handleHideSlotTooltip() {
  if (DOM_ELEMENTS.slotTooltip) {
    DOM_ELEMENTS.slotTooltip.style.display = "none";
  }
}

function handleExportCurrentUser() {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    return alert("Please select a user to export.");
  }
  const currentUser = state.users[state.activeUserId];
  const exportData = { id: currentUser.id, name: currentUser.name, schedule: currentUser.schedule };
  const json = JSON.stringify(exportData, null, 2);

  navigator.clipboard
    .writeText(json)
    .then(() => alert(`${currentUser.name}'s schedule exported to clipboard!`))
    .catch((err) => {
      console.error("Clipboard export error:", err);
      alert("Could not copy to clipboard. Check browser permissions.");
      if (DOM_ELEMENTS.importTextArea) DOM_ELEMENTS.importTextArea.value = json; // Fallback
    });
}

function handleImportSchedule() {
  if (!DOM_ELEMENTS.importTextArea) return;
  const jsonInput = DOM_ELEMENTS.importTextArea.value.trim();
  if (!jsonInput) return alert("Paste exported schedule JSON into the text area first.");

  try {
    const importedUser = JSON.parse(jsonInput);
    if (!importedUser.id || !importedUser.name || !Array.isArray(importedUser.schedule)) {
      throw new Error("Invalid user data format.");
    }
    state.users[importedUser.id] = importedUser; // Modify state
    saveStateToStorage();
    updateUI();
    DOM_ELEMENTS.importTextArea.value = "";
    alert(`User ${importedUser.name} imported successfully!`);
  } catch (e) {
    console.error("Import error:", e);
    alert(`Import failed: ${e.message}. Please ensure valid JSON is pasted.`);
  }
}

/* ================================
   INPUT VALIDATION (Keep as is, or move regex to constants)
================================== */
function setupInputValidation() {
    if (DOM_ELEMENTS.userNameInput) {
        DOM_ELEMENTS.userNameInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.replace(/[^a-zA-Z\s'-]/g, "");
        });
    }
    if (DOM_ELEMENTS.userIdInput) {
        DOM_ELEMENTS.userIdInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, "");
            if (e.target.value.length > 1) {
                e.target.value = e.target.value.replace(/^0+/, "");
            }
        });
    }
}

/* ================================
   EVENT LISTENERS SETUP
================================== */
function setupEventListeners() {
  if (DOM_ELEMENTS.addUserButton) DOM_ELEMENTS.addUserButton.addEventListener("click", handleAddNewUser);
  if (DOM_ELEMENTS.compareButton) DOM_ELEMENTS.compareButton.addEventListener("click", handleToggleCompareMode);
  if (DOM_ELEMENTS.exportButton) DOM_ELEMENTS.exportButton.addEventListener("click", handleExportCurrentUser);
  if (DOM_ELEMENTS.importButton) DOM_ELEMENTS.importButton.addEventListener("click", handleImportSchedule);

  // Event Delegation for user list
  if (DOM_ELEMENTS.userListContainer) {
    DOM_ELEMENTS.userListContainer.addEventListener("click", (event) => {
      const target = event.target;
      const userItemDiv = target.closest('.user-item'); // Find the parent user-item div

      if (userItemDiv) { // Click was on or inside a user-item div
          const userId = userItemDiv.dataset.userId;
          if (target.classList.contains("delete-btn")) {
              event.stopPropagation(); // Prevent user-item click if delete is clicked
              handleDeleteUser(userId);
          } else if (userId) { // Click on user name or user item div itself
              if (state.compareMode) {
                  handleToggleUserSelectionForCompare(userId);
              } else {
                  handleSetActiveUser(userId);
              }
          }
      }
    });
  }

  // Schedule Table Event Listeners
  if (DOM_ELEMENTS.scheduleTable) {
    DOM_ELEMENTS.scheduleTable.addEventListener("click", (event) => {
      if (event.target.classList.contains("slot")) {
        const slot = event.target;
        const day = parseInt(slot.dataset.day, 10);
        const time = parseInt(slot.dataset.time, 10);
        if (!isNaN(day) && !isNaN(time) && !state.compareMode) {
          handleToggleScheduleSlot(day, time);
        }
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseover", (event) => {
      if (state.compareMode && event.target.classList.contains("slot")) {
        const slot = event.target;
        const day = parseInt(slot.dataset.day, 10);
        const time = parseInt(slot.dataset.time, 10);
        if (!isNaN(day) && !isNaN(time)) handleShowSlotTooltip(slot, day, time);
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseout", (event) => {
      if (event.target.classList.contains("slot") || event.target === DOM_ELEMENTS.scheduleTable) {
        handleHideSlotTooltip();
      }
    });
  }
}

/* ================================
   INITIALIZATION FUNCTION (Called by DOMContentLoaded)
================================== */
function initializeApp() {
  // Ensure DOM_ELEMENTS are all fetched if any were null initially
  for (const key in DOM_ELEMENTS) {
    if (DOM_ELEMENTS[key] === null) {
        // This re-fetch logic might be overly cautious if script is at end of body.
        // Consider if all elements are guaranteed to be present when this module runs.
        if (key === "addUserButton") DOM_ELEMENTS[key] = document.querySelector(".add-user button");
        else if (key === "exportButton") DOM_ELEMENTS[key] = document.querySelector(".export-import button:nth-of-type(1)");
        else if (key === "importButton") DOM_ELEMENTS[key] = document.querySelector(".export-import button:nth-of-type(2)");
        else DOM_ELEMENTS[key] = document.getElementById(key); // Assuming key matches ID for others
    }
  }

  loadStateFromStorage(); // Load data
  setupInputValidation(); // Setup input masking
  setupEventListeners();  // Setup interactions
  updateUI();             // Initial render based on loaded state
}

// Initialize the application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// --- Potentially export other functions if they are needed by other modules (unlikely for this app structure)
// export { someOtherUtilityFunction };