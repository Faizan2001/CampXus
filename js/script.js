/* ================================
   CONSTANTS & DOM REFERENCES
================================== */
const USER_NAME_INPUT_ID = "userName";
const USER_ID_INPUT_ID = "userId";
const USER_LIST_ID = "userList";
const COMPARE_BUTTON_ID = "compare";
const SCHEDULE_TABLE_ID = "schedule";
const SLOT_TOOLTIP_ID = "slotTooltip";
const IMPORT_TEXT_ID = "importText";
const LOCAL_STORAGE_KEY = "scheduleUsers";

// Cache frequently accessed DOM elements
const userNameInput = document.getElementById(USER_NAME_INPUT_ID);
const userIdInput = document.getElementById(USER_ID_INPUT_ID);
const userListContainer = document.getElementById(USER_LIST_ID);
const compareButton = document.getElementById(COMPARE_BUTTON_ID);
const scheduleTable = document.getElementById(SCHEDULE_TABLE_ID);
const slotTooltip = document.getElementById(SLOT_TOOLTIP_ID);
const importTextArea = document.getElementById(IMPORT_TEXT_ID);

/* ================================
   GLOBAL STATE
================================== */
// Represents the core data of the application
let state = {
  activeUserId: null,
  users: {}, // { userId: { id, name, schedule[][] } }
  selectedUserIds: new Set(),
  compareMode: false,
};

/* ================================
   INITIALIZATION
================================== */

/**
 * Loads the application state from localStorage when the script starts.
 */
function loadState() {
  const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (savedState) {
    // Merge saved data with default structure to ensure all keys exist
    const parsed = JSON.parse(savedState);
    state.users = parsed.users || {};
    // Keep other state properties like activeUserId, selectedUserIds, compareMode transient (reset on load)
    // or load them too if persistence is desired for them:
    // state.activeUserId = parsed.activeUserId || null;
    // state.selectedUserIds = new Set(parsed.selectedUserIds || []);
    // state.compareMode = parsed.compareMode || false;
  }
  // Always update UI after loading, even if from empty state
  updateUI();
}

/**
 * Saves the current application state (specifically users) to localStorage.
 */
function saveState() {
  // Only saving users for persistence based on original logic
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ users: state.users }));
  // Note: If other state parts should persist, add them to the object above.
}

// Load initial state when the script runs
loadState();

/* ================================
   USER MANAGEMENT FUNCTIONS
================================== */

/**
 * Creates a new user object if the ID doesn't exist.
 * Does not save state or update UI directly.
 * @param {string} name - The user's display name.
 * @param {string} userId - The user's unique ID.
 * @returns {object | null} The newly created user object or null if user already exists.
 */
function createUserObject(name, userId) {
  if (!state.users[userId]) {
    // Ensure schedule is a proper 2D array initialized to false
    const schedule = Array(7)
      .fill(null)
      .map(() => Array(6).fill(false));

    return {
      id: userId,
      name: name,
      schedule: schedule,
    };
  }
  return null; // User already exists
}

/**
 * Handles the logic for adding a new user from the form inputs.
 */
function handleAddNewUser() {
  const name = userNameInput.value.trim();
  const userId = userIdInput.value.trim();

  if (name && userId) {
    const newUser = createUserObject(name, userId);
    if (newUser) {
      state.users[userId] = newUser;
      setActiveUser(userId); // Make the new user active
      saveState(); // Save changes
      // Don't call updateUI here, setActiveUser already does
    } else {
      alert(`User with ID ${userId} already exists.`);
      // Optionally, set existing user as active: setActiveUser(userId);
    }

    // Clear input fields
    userNameInput.value = "";
    userIdInput.value = "";
  } else {
    alert("Please enter both a name and a unique ID.");
  }
}

/**
 * Removes a user from the state.
 * @param {string} userId - The ID of the user to delete.
 */
function deleteUser(userId) {
  if (!state.users[userId]) return; // User doesn't exist

  // Remove user data
  delete state.users[userId];

  // Clear references if the deleted user was active or selected
  if (state.activeUserId === userId) {
    state.activeUserId = null;
  }
  state.selectedUserIds.delete(userId);

  // Persist changes and refresh the view
  saveState();
  updateUI();
}

/* ================================
   UI MODE & SELECTION FUNCTIONS
================================== */

/**
 * Sets the currently active user for schedule editing.
 * @param {string} userId - The ID of the user to make active.
 */
function setActiveUser(userId) {
  if (state.users[userId]) {
    state.activeUserId = userId;
    state.compareMode = false; // Exit compare mode when selecting an active user
    state.selectedUserIds.clear(); // Clear comparison selection
    compareButton.classList.remove("active"); // Ensure compare button visually resets
    updateUI();
  }
}

/**
 * Toggles the schedule comparison mode on or off.
 */
function toggleCompareMode() {
  state.compareMode = !state.compareMode;
  state.activeUserId = null; // No single active user when comparing
  state.selectedUserIds.clear(); // Reset selections when toggling mode
  compareButton.classList.toggle("active", state.compareMode); // Update button visual state
  updateUI();
}

/**
 * Adds or removes a user from the comparison selection set.
 * Only works when compareMode is active.
 * @param {string} userId - The ID of the user to toggle.
 */
function toggleUserSelectionForCompare(userId) {
  if (!state.compareMode || !state.users[userId]) return;

  if (state.selectedUserIds.has(userId)) {
    state.selectedUserIds.delete(userId);
  } else {
    state.selectedUserIds.add(userId);
  }
  updateUI();
}

/* ================================
   SCHEDULE INTERACTION LOGIC
================================== */

/**
 * Toggles the busy/free state of a specific time slot for the active user.
 * Does nothing if not in editing mode (no active user or compareMode is on).
 * @param {number} dayIndex - The index of the day (0-6).
 * @param {number} timeIndex - The index of the time slot (0-5).
 */
function toggleScheduleSlot(dayIndex, timeIndex) {
  if (!state.activeUserId || state.compareMode) return; // Only allow edits when an active user is set and not comparing

  const userSchedule = state.users[state.activeUserId]?.schedule;
  if (userSchedule && userSchedule[dayIndex]?.[timeIndex] !== undefined) {
    // Flip the boolean value
    userSchedule[dayIndex][timeIndex] = !userSchedule[dayIndex][timeIndex];
    saveState();
    updateUI();
  }
}

/**
 * Determines the visual status of a schedule slot based on the current mode.
 * @param {number} dayIndex - The index of the day (0-6).
 * @param {number} timeIndex - The index of the time slot (0-5).
 * @returns {string} CSS class name representing the slot status ('slot-free', 'slot-conflict', 'slot-partial', 'slot-selected', or 'slot').
 */
function getSlotStatusClass(dayIndex, timeIndex) {
  if (state.compareMode && state.selectedUserIds.size > 0) {
    let busyCount = 0;
    state.selectedUserIds.forEach(id => {
      if (state.users[id]?.schedule?.[dayIndex]?.[timeIndex]) {
        busyCount++;
      }
    });

    if (busyCount === 0) return "slot-free";
    if (busyCount === state.selectedUserIds.size) return "slot-conflict";
    return "slot-partial";

  } else if (state.activeUserId && state.users[state.activeUserId]?.schedule?.[dayIndex]?.[timeIndex]) {
    return "slot-selected"; // Active user is busy at this time
  }

  return "slot"; // Default, empty slot appearance
}

/* ================================
   TOOLTIP FUNCTIONS
================================== */

/**
 * Displays the tooltip with availability details for a slot in compare mode.
 * @param {HTMLElement} slotElement - The table cell element being hovered.
 * @param {number} dayIndex - The day index of the slot.
 * @param {number} timeIndex - The time index of the slot.
 */
function showSlotTooltip(slotElement, dayIndex, timeIndex) {
  // Ensure tooltip element exists and we are in compare mode with selections
  if (!slotTooltip || !state.compareMode || state.selectedUserIds.size === 0) {
      hideSlotTooltip(); // Hide if conditions not met
      return;
  }

  const freeUsers = [];
  const busyUsers = [];

  // Collect names based on availability
  state.selectedUserIds.forEach((userId) => {
    const user = state.users[userId];
    if (user) { // Check if user data exists
      if (user.schedule?.[dayIndex]?.[timeIndex]) {
        busyUsers.push(user.name);
      } else {
        freeUsers.push(user.name);
      }
    }
  });

  // Construct the tooltip message
  let message = "";
  if (busyUsers.length === state.selectedUserIds.size) {
    message = "All selected users are unavailable.";
  } else if (freeUsers.length === state.selectedUserIds.size) {
    message = "All selected users are free.";
  } else {
    message = "Availability:\n";
    if (freeUsers.length > 0) message += `Free: ${freeUsers.join(", ")}\n`;
    if (busyUsers.length > 0) message += `Busy: ${busyUsers.join(", ")}`;
  }

  // Position and display the tooltip
  slotTooltip.textContent = message.trim();
  const rect = slotElement.getBoundingClientRect();
  // Position tooltip above the slot, centered horizontally
  slotTooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  slotTooltip.style.top = `${rect.top + window.scrollY - slotTooltip.offsetHeight - 5}px`; // Adjust vertical offset as needed
  slotTooltip.style.display = "block";
  slotTooltip.style.transform = 'translateX(-50%)'; // Center horizontally
}


/**
 * Hides the availability tooltip.
 */
function hideSlotTooltip() {
  if (slotTooltip) {
    slotTooltip.style.display = "none";
  }
}

/* ================================
   UI RENDERING FUNCTIONS
================================== */

/**
 * Updates the visual state of all schedule slots based on current application state.
 */
function renderScheduleGrid() {
  // Delegate event handling to the table if preferred, but for directness:
  document.querySelectorAll("#" + SCHEDULE_TABLE_ID + " .slot").forEach((slot) => {
    const day = parseInt(slot.dataset.day, 10);
    const time = parseInt(slot.dataset.time, 10);

    if (!isNaN(day) && !isNaN(time)) {
      // Reset classes carefully, keeping 'slot' and data attributes
      slot.className = 'slot';
      // Get the status class ('slot-free', 'slot-selected', etc.)
      const statusClass = getSlotStatusClass(day, time);
      // Add the status class if it's not the default 'slot'
      if (statusClass !== 'slot') {
          slot.classList.add(statusClass);
      }
    }
  });
}

/**
 * Generates the HTML string for a single user item in the list.
 * @param {string} userId - The user's ID.
 * @param {object} user - The user's data object.
 * @returns {string} HTML string for the user list item.
 */
function createUserListItemHTML(userId, user) {
  const isActive = state.activeUserId === userId ? "active" : "";
  const isSelected = state.selectedUserIds.has(userId) ? "selected" : "";
  // Determine the correct function call for the name button based on mode
  const userItemButtonClickAction = state.compareMode
    ? `toggleUserSelectionForCompare('${userId}')`
    : `setActiveUser('${userId}')`;

  return `
    <div onclick="${userItemButtonClickAction}" class="user-item ${isActive} ${isSelected}">
      <button>${user.name}</button>
      <button onclick="deleteUser('${userId}')" class="delete-btn">Delete</button>
    </div>
  `;
}

/**
 * Updates the list of users displayed on the page.
 */
function renderUserList() {
  if (!userListContainer) return; // Guard against missing element

  const userEntries = Object.entries(state.users);
  if (userEntries.length === 0) {
    userListContainer.innerHTML = "<p>No users added yet.</p>"; // Provide feedback
    return;
  }

  // Generate HTML for each user and join them
  userListContainer.innerHTML = userEntries
    .map(([userId, user]) => createUserListItemHTML(userId, user))
    .join("");
}

/**
 * Updates the entire UI by calling specific rendering functions.
 * This is the main function to call after state changes that affect the view.
 */
function updateUI() {
  renderScheduleGrid();
  renderUserList();
  // Add calls to render other UI parts if they depend on state
}

/* ================================
   EXPORT / IMPORT FUNCTIONS
================================== */

/**
 * Exports the active user's data to the clipboard as JSON.
 */
function exportCurrentUser() {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    return alert("Please select a user to export.");
  }

  const currentUser = state.users[state.activeUserId];
  // Create a clean object for export (optional, but good practice)
  const exportData = {
    id: currentUser.id,
    name: currentUser.name,
    schedule: currentUser.schedule,
  };
  const json = JSON.stringify(exportData, null, 2); // Pretty print JSON

  navigator.clipboard
    .writeText(json)
    .then(() => alert(`${currentUser.name}'s schedule exported to clipboard!`))
    .catch((err) => {
      console.error("Clipboard export error:", err);
      alert("Could not copy to clipboard. Check browser permissions.");
      // Optional: Display JSON in a modal or the import textarea as fallback
      // importTextArea.value = json;
    });
}

/**
 * Imports user data from the import textarea (expects JSON format).
 */
function importSchedule() {
  if (!importTextArea) return;
  const jsonInput = importTextArea.value.trim();

  if (!jsonInput) {
    return alert("Paste exported schedule JSON into the text area first.");
  }

  try {
    const importedUser = JSON.parse(jsonInput);

    // Basic validation of the imported structure
    if (
      !importedUser.id ||
      !importedUser.name ||
      !Array.isArray(importedUser.schedule)
    ) {
      throw new Error("Invalid user data format.");
    }
    // Deeper validation could check schedule dimensions/content if needed

    // Add or overwrite the user in the state
    state.users[importedUser.id] = importedUser;
    saveState();
    updateUI();
    importTextArea.value = ""; // Clear textarea on success
    alert(`User ${importedUser.name} imported successfully!`);

  } catch (e) {
    console.error("Import error:", e);
    alert(`Import failed: ${e.message}. Please ensure valid JSON is pasted.`);
  }
}

/* ================================
   INPUT VALIDATION
================================== */

// Attach input event listeners for live validation
if (userNameInput) {
  userNameInput.addEventListener("input", (e) => {
    // Allow letters, spaces, hyphens, apostrophes (adjust regex as needed)
    e.target.value = e.target.value.replace(/[^a-zA-Z\s'-]/g, "");
  });
}

if (userIdInput) {
  userIdInput.addEventListener("input", (e) => {
    // Allow only digits (positive integers)
    e.target.value = e.target.value.replace(/[^0-9]/g, "");
    // Prevent leading zeros unless it's just "0" (though usually IDs shouldn't be 0)
    if (e.target.value.length > 1) {
        e.target.value = e.target.value.replace(/^0+/, "");
    }
  });
}


/* ================================
   EVENT LISTENERS SETUP
================================== */

/**
 * Adds necessary event listeners to the static elements on the page.
 */
function setupEventListeners() {
  // Add User Button Listener (assuming the button is static)
  // Find the button first, e.g., if it's the first button after the inputs:
  const addUserButton = document.querySelector(".add-user button");
  if (addUserButton) {
    addUserButton.addEventListener("click", handleAddNewUser);
  }

  // Compare Schedules Button Listener
  if (compareButton) {
    compareButton.addEventListener("click", toggleCompareMode);
  }

  // Export/Import Button Listeners (assuming static buttons)
  const exportButton = document.querySelector(".export-import button:nth-of-type(1)");
  const importButton = document.querySelector(".export-import button:nth-of-type(2)");
  if (exportButton) {
      exportButton.addEventListener("click", exportCurrentUser);
  }
  if (importButton) {
      importButton.addEventListener("click", importSchedule);
  }


  // Schedule Table Event Listener (using Delegation)
  if (scheduleTable) {
    scheduleTable.addEventListener("click", (event) => {
      // Check if the clicked element is a slot
      if (event.target.classList.contains("slot")) {
        const slot = event.target;
        const day = parseInt(slot.dataset.day, 10);
        const time = parseInt(slot.dataset.time, 10);
        if (!isNaN(day) && !isNaN(time)) {
            if (!state.compareMode) {
                toggleScheduleSlot(day, time);
            } else {
                 // In compare mode, click could also show tooltip persistently if needed,
                 // but default hover behavior might be sufficient.
                 // showSlotTooltip(slot, day, time); // Or handle click differently
            }
        }
      }
    });

    scheduleTable.addEventListener("mouseover", (event) => {
      if (state.compareMode && event.target.classList.contains("slot")) {
        const slot = event.target;
        const day = parseInt(slot.dataset.day, 10);
        const time = parseInt(slot.dataset.time, 10);
        if (!isNaN(day) && !isNaN(time)) {
            showSlotTooltip(slot, day, time);
        }
      }
    });

    scheduleTable.addEventListener("mouseout", (event) => {
      // Hide tooltip when mouse leaves a slot or the table itself
      if (event.target.classList.contains("slot") || event.target === scheduleTable) {
          hideSlotTooltip();
      }
    });
  }

  // Note: User list clicks are handled via `onclick` attributes generated
  // in `createUserListItemHTML`. For better practice/performance with many users,
  // event delegation on `userListContainer` could be used instead.
}

// Setup listeners once the DOM is ready
// Using DOMContentLoaded is safer than running immediately
document.addEventListener('DOMContentLoaded', () => {
    // Re-cache elements just in case they weren't ready when script first ran
    // (this is slightly redundant if script is at end of body, but safe)
    // userNameInput = document.getElementById(USER_NAME_INPUT_ID);
    // ... re-cache others if needed ...

    loadState(); // Load state *after* DOM is ready
    setupEventListeners(); // Attach listeners *after* DOM is ready
});