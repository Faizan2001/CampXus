// js/script.js

/* ================================
   DOM REFERENCES (Exported)
   Cached references to frequently used DOM elements.
================================== */
export const DOM_ELEMENTS = {
  userNameInput: document.getElementById("userName"),
  userIdInput: document.getElementById("userId"),
  userListContainer: document.getElementById("userList"),
  compareButton: document.getElementById("compare"),
  scheduleTable: document.getElementById("schedule"),
  slotTooltip: document.getElementById("slotTooltip"),
  addUserButton: document.querySelector(".add-user button"),
  // Import, Export
  importTextArea: document.getElementById("importText"),
  exportButton: document.querySelector(".export-import button:nth-of-type(1)"),
  importButton: document.querySelector(".export-import button:nth-of-type(2)"),
  // Modal DOM Elements
  appModal: document.getElementById("appModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalMessage: document.getElementById("modalMessage"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  modalActionButtons: document.getElementById("modalActionButtons"),
  modalConfirmBtn: document.getElementById("modalConfirmBtn"),
  modalCancelBtn: document.getElementById("modalCancelBtn"),
  // Adittional elements for adding new time slots
  addNewTimeSlotBtn: document.getElementById("addNewTimeSlotBtn"),
  addTimeSlotHeaderCell: document.getElementById("addTimeSlotHeaderCell"),
};

const DEFAULT_TIMESLOTS = [
  { start: "8:00 AM", end: "9:30 AM", label: "8:00-9:30" },
  { start: "9:40 AM", end: "11:10 AM", label: "9:40-11:10" },
  { start: "11:20 AM", end: "12:50 PM", label: "11:20-12:50" },
  { start: "1:00 PM", end: "2:30 PM", label: "1:00-2:30" },
  { start: "2:40 PM", end: "4:10 PM", label: "2:40-4:10" },
  { start: "4:20 PM", end: "5:50 PM", label: "4:20-5:50" },
];

const LOCAL_STORAGE_KEY = "scheduleUsers";

/* ================================
   APPLICATION STATE
   The single source of truth for the application's data.
================================== */
let state = {
  activeUserId: null, // ID of the user whose schedule is being edited
  users: {},          // Stores all user data: { userId: { id, name, schedule[][] } }
  selectedUserIds: new Set(), // Set of user IDs selected for comparison
  compareMode: false, // Boolean flag for compare mode
};

// --- State Accessors/Mutators (primarily for testing) ---
export function getState() {
  return state; // Returns a direct reference; for strict immutability, a deep clone could be returned.
}
export function _setStateForTesting(newState) { // Underscore indicates for testing/internal use
  state = { ...state, ...newState }; // Merges new state properties into the current state
}
export function _resetStateForTesting() { // Resets state to initial values for test isolation
  state = {
    activeUserId: null, users: {}, selectedUserIds: new Set(), compareMode: false,
  };
}

/* ================================
   MODAL UI FUNCTIONS
   Controls the display and behavior of the custom modal.
================================== */
let confirmModalCallback = null; // Stores the function to execute when "Yes" is clicked on a confirmation modal.

/**
 * Shows the custom modal.
 * @param {string} message - The main message to display.
 * @param {string} [title="Notification"] - Optional title for the modal.
 * @param {boolean} [showConfirmationButtons=false] - If true, shows Yes/No buttons; otherwise, shows OK.
 * @param {function} [onConfirm] - Callback for the "Yes" button if showConfirmationButtons is true.
 */
export function showAppModal(message, title = "Notification", showConfirmationButtons = false, onConfirm) {
  // Ensure all necessary modal DOM elements are available
  if (!DOM_ELEMENTS.appModal || !DOM_ELEMENTS.modalTitle || !DOM_ELEMENTS.modalMessage ||
      !DOM_ELEMENTS.modalCloseBtn || !DOM_ELEMENTS.modalActionButtons ||
      !DOM_ELEMENTS.modalConfirmBtn || !DOM_ELEMENTS.modalCancelBtn) {
    console.error("Modal elements not found in DOM. Falling back to native browser dialogs.");
    // Fallback to native dialogs if custom modal isn't properly set up in HTML
    if (showConfirmationButtons) {
        if (confirm(`${title}: ${message}`)) { // Native confirm dialog
            if (onConfirm && typeof onConfirm === 'function') onConfirm();
        }
    } else {
        alert(`${title}: ${message}`); // Native alert dialog
    }
    return;
  }

  DOM_ELEMENTS.modalTitle.textContent = title;
  DOM_ELEMENTS.modalMessage.textContent = message;
  confirmModalCallback = null; // Reset any previous callback

  if (showConfirmationButtons) {
    DOM_ELEMENTS.modalActionButtons.style.display = "flex"; // Show "Yes" / "No" buttons
    DOM_ELEMENTS.modalCloseBtn.style.display = "none";   // Hide the default "OK" button
    if (onConfirm && typeof onConfirm === 'function') {
      confirmModalCallback = onConfirm; // Store the action for the "Yes" button
    }
  } else {
    DOM_ELEMENTS.modalActionButtons.style.display = "none";  // Hide "Yes" / "No" buttons
    DOM_ELEMENTS.modalCloseBtn.style.display = "inline-block"; // Show the default "OK" button
  }

  DOM_ELEMENTS.appModal.style.display = "flex"; // Make the modal overlay visible
  // Short timeout to ensure `display:flex` is applied before adding 'active' class for CSS transition
  setTimeout(() => DOM_ELEMENTS.appModal.classList.add("active"), 10);
}

/**
 * Hides the custom modal.
 */
export function hideAppModal() {
  if (DOM_ELEMENTS.appModal) {
    DOM_ELEMENTS.appModal.classList.remove("active"); // Trigger fade-out CSS transition
    // Wait for transition to finish before setting display to none
    setTimeout(() => {
      DOM_ELEMENTS.appModal.style.display = "none";
      // Reset button visibility to default (OK shown, Yes/No hidden)
      if(DOM_ELEMENTS.modalActionButtons) DOM_ELEMENTS.modalActionButtons.style.display = "none";
      if(DOM_ELEMENTS.modalCloseBtn) DOM_ELEMENTS.modalCloseBtn.style.display = "inline-block";
    }, 300); // This duration should match the transition duration in modal.css
    confirmModalCallback = null; // Clear any stored confirmation callback
  }
}

/* ================================
   CORE LOGIC FUNCTIONS (Data Manipulation - Purer)
   These functions operate on data and return new data/values without direct side effects.
================================== */

/**
 * Creates a new user data object.
 * @param {string} name - The user's name.
 * @param {string} userId - The user's unique ID.
 * @param {object} currentUsers - The current dictionary of users.
 * @returns {object|null} The new user object or null if userId already exists.
 */

export function createUserObject(name, userId, currentUsers) {
  if (!currentUsers[userId]) { // Check for ID uniqueness
    // Initialize with a deep copy of default time slots
    const userTimeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS));
    
    // Schedule matrix: 7 days, columns match the number of time slots
    const schedule = Array(7)
      .fill(null)
      .map(() => Array(userTimeSlots.length).fill(false));

    return {
      id: userId,
      name: name,
      timeSlots: userTimeSlots, // Store the time slot definitions for this user
      schedule: schedule,       // Store their availability for these slots
    };
  }
  return null; // User ID already taken
}

/**
 * Removes a user from a given state object and returns the new state.
 * @param {string} userId - The ID of the user to delete.
 * @param {object} currentState - The current application state.
 * @returns {object} The new state object after deletion.
 */
export function deleteUserFromState(userId, currentState) {
  // Create copies to avoid mutating the original state directly (good for predictability)
  const newUsers = { ...currentState.users };
  let newActiveUserId = currentState.activeUserId;
  const newSelectedUserIds = new Set(currentState.selectedUserIds);

  if (!newUsers[userId]) return currentState; // User not found, return state unchanged

  delete newUsers[userId]; // Remove user

  // If the deleted user was active, reset activeUserId
  if (newActiveUserId === userId) {
    newActiveUserId = null;
  }
  // Remove from selected users if present
  newSelectedUserIds.delete(userId);

  // Return the updated state components
  return {
    ...currentState, // Spread existing state
    users: newUsers,
    activeUserId: newActiveUserId,
    selectedUserIds: newSelectedUserIds,
  };
}

/**
 * Toggles a boolean value in a 2D schedule array for a given day and time.
 * Returns a new schedule array (immutable operation).
 * @param {number} dayIndex - The index of the day (0-6).
 * @param {number} timeIndex - The index of the time slot (0-5).
 * @param {boolean[][]} userSchedule - The user's current schedule matrix.
 * @returns {boolean[][]} A new schedule matrix with the slot toggled.
 */
export function toggleSlotInSchedule(dayIndex, timeIndex, userSchedule) {
  // Map over the schedule to create a new one, ensuring immutability
  return userSchedule.map((daySlots, dIdx) =>
    dIdx === dayIndex // If it's the target day
      ? daySlots.map((slotValue, tIdx) => // Map over its time slots
          tIdx === timeIndex ? !slotValue : slotValue // Toggle the target slot
        )
      : [...daySlots] // Otherwise, return a copy of the original day's slots
  );
}

/**
 * Determines the CSS class for a schedule slot based on current mode and selections.
 * @param {number} dayIndex - The index of the day.
 * @param {number} timeIndex - The index of the time slot.
 * @param {object} currentState - The current application state.
 * @returns {string} The CSS class name for the slot.
 */
export function determineSlotStatus(dayIndex, timeIndex, currentState) {
  const { compareMode, selectedUserIds, users, activeUserId } = currentState;

  if (compareMode && selectedUserIds.size > 0) {
    let busyCount = 0;
    selectedUserIds.forEach(id => {
      if (users[id]?.schedule?.[dayIndex]?.[timeIndex]) {
        busyCount++;
      }
    });

    if (busyCount === 0) return "slot-free"; // All selected are free
    if (busyCount === selectedUserIds.size) return "slot-conflict"; // All selected are busy
    return "slot-partial"; // Mixed availability
  } else if (activeUserId && users[activeUserId]?.schedule?.[dayIndex]?.[timeIndex]) {
    return "slot-selected"; // Current active user is busy
  }
  return "slot"; // Default, unstyled slot
}

/**
 * Generates the message for the slot tooltip in compare mode.
 * @param {number} dayIndex - The index of the day.
 * @param {number} timeIndex - The index of the time slot.
 * @param {object} currentState - The current application state.
 * @returns {string} The formatted tooltip message.
 */
export function generateTooltipMessage(dayIndex, timeIndex, currentState) {
  const { users, selectedUserIds } = currentState;
  if (selectedUserIds.size === 0) return ""; // No users selected for comparison

  const freeUsers = [];
  const busyUsers = [];

  selectedUserIds.forEach((userId) => {
    const user = users[userId];
    if (user) { // Check if user object exists
      (user.schedule?.[dayIndex]?.[timeIndex] ? busyUsers : freeUsers).push(user.name);
    }
  });

  if (busyUsers.length === selectedUserIds.size) return "All selected users are unavailable.";
  if (freeUsers.length === selectedUserIds.size) return "All selected users are free.";
  
  let message = "Availability:\n"; // Use \n for line breaks (CSS white-space: pre-wrap needed on tooltip)
  if (freeUsers.length > 0) message += `Free: ${freeUsers.join(", ")}\n`;
  if (busyUsers.length > 0) message += `Busy: ${busyUsers.join(", ")}`;
  return message.trim(); // Remove trailing newline if any
}

/* ================================
   DYNAMIC TIMESLOT FUNCTIONS (NEW SECTION or within Event Handlers)
================================== */

/**
 * Adds a new custom time slot definition and extends the schedule matrix
 * for the currently active user.
 * @param {string} startTime - The start time for the new slot (e.g., "6:00 PM").
 * @param {string} endTime - The end time for the new slot (e.g., "7:00 PM").
 */
function addCustomTimeSlotToActiveUser(startTime, endTime) {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    showAppModal("Please select an active user to add a custom time slot.", "No Active User");
    return;
  }

  // Basic validation for time format (can be made more robust later)
  if (!startTime || !endTime || !startTime.includes(':') || !endTime.includes(':')) {
    showAppModal("Invalid time format. Please use a format like HH:MM or HH:MM AM/PM.", "Invalid Time Input");
    return;
  }
  // More validation: check if end time is after start time, check for overlapping slots (these are advanced)

  const user = state.users[state.activeUserId];
  
  // Create a simple label from start and end times (e.g., "6:00-7:00")
  // This removes AM/PM for brevity in the header; adjust as needed.
  const newSlotLabel = `${startTime.replace(/ (AM|PM)/ig, '')}-${endTime.replace(/ (AM|PM)/ig, '')}`;

  // Add the new time slot definition to the user's timeSlots array
  user.timeSlots.push({ 
    start: startTime, 
    end: endTime, 
    label: newSlotLabel 
  });

  // Expand each day in their schedule matrix to include a new column, initialized to false (free)
  user.schedule.forEach(daySchedule => {
    daySchedule.push(false); 
  });

  saveStateToStorage(); // Persist the updated user data
  updateUI();           // Re-render the UI to show the new column
  showAppModal(`New time slot "${newSlotLabel}" added for ${user.name}.`, "Time Slot Added");
}

/**
 * Handles the click event for the "Add New Time Slot" button.
 * Prompts the user for start and end times.
 */
function handleAddNewTimeSlotClick() {
  if (!state.activeUserId) {
    showAppModal("Please select an active user first to customize their time slots.", "User Not Selected");
    return;
  }

  // Using prompt for now. This will be replaced by a custom modal input in Phase 2.
  const startTimeInput = prompt("Enter start time for the new slot (e.g., 6:00 PM or 18:00):");
  if (startTimeInput === null) return; // User pressed Cancel

  const endTimeInput = prompt(`Enter end time for the new slot (starts at ${startTimeInput}):`);
  if (endTimeInput === null) return; // User pressed Cancel

  addCustomTimeSlotToActiveUser(startTimeInput.trim(), endTimeInput.trim());
}



/* ================================
   STATE PERSISTENCE (LocalStorage)
   Handles saving and loading the user data.
================================== */

/** Loads user data from localStorage into the global `state`. */
// In js/script.js (modify existing loadStateFromStorage)

function loadStateFromStorage() {
  const savedStateString = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (savedStateString) {
    const parsedSavedState = JSON.parse(savedStateString);
    const loadedUsers = parsedSavedState.users || {};
    
    // --- START: Migration/Defaulting Logic for timeSlots ---
    Object.values(loadedUsers).forEach(user => {
      // If a user from an old version doesn't have timeSlots, add defaults
      if (!user.timeSlots || !Array.isArray(user.timeSlots) || user.timeSlots.length === 0) {
        console.warn(`User ${user.id} missing timeSlots, applying defaults.`);
        user.timeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS));
      }

      // Ensure the schedule matrix dimensions match the number of timeSlots
      // This is a simple way to handle potential inconsistencies.
      // A more robust migration might try to preserve existing schedule data if columns were just added/removed.
      if (user.schedule && user.schedule.length === 7 && user.timeSlots) {
        user.schedule = user.schedule.map(daySchedule => {
          // Create a new day schedule with the correct number of columns, initialized to false
          const newDayScheduleArray = Array(user.timeSlots.length).fill(false);
          // Copy over existing slot data up to the shorter of the two lengths
          const limit = Math.min(daySchedule.length, newDayScheduleArray.length);
          for (let i = 0; i < limit; i++) {
            newDayScheduleArray[i] = daySchedule[i];
          }
          return newDayScheduleArray;
        });
      } else {
        // If schedule is missing or not 7 days, re-initialize it
        console.warn(`User ${user.id} schedule malformed or missing, re-initializing.`);
        user.schedule = Array(7).fill(null).map(() => Array(user.timeSlots.length).fill(false));
      }
    });
    // --- END: Migration/Defaulting Logic ---
    state.users = loadedUsers;
  }
}

/** Saves the current `state.users` to localStorage. */
function saveStateToStorage() {
  // Only persist the users object
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ users: state.users }));
}

/* ================================
   UI RENDERING FUNCTIONS
   Responsible for updating the HTML based on the current state.
================================== */

/** Renders the entire schedule grid, applying appropriate classes to slots. */

function renderScheduleGrid() {
  console.log("renderScheduleGrid called at:", new Date().toLocaleTimeString());

  if (!DOM_ELEMENTS.scheduleTable) {
    console.error("Schedule table element not found for rendering.");
    return;
  }

  const tableHeadRow = DOM_ELEMENTS.scheduleTable.querySelector("thead tr");
  const tableBody = DOM_ELEMENTS.scheduleTable.querySelector("tbody");

  if (!tableHeadRow || !tableBody) {
    console.error("Schedule table thead>tr or tbody not found.");
    return;
  }

  // Determine which time slots to use for rendering
  let currentTimeSlotsToRender = DEFAULT_TIMESLOTS; // Default
  let scheduleMatrixToRender = null; // Will hold the 7xN boolean matrix

  if (state.activeUserId && state.users[state.activeUserId]) {
    const activeUser = state.users[state.activeUserId];
    // Use the active user's timeSlots if they exist and are valid
    if (activeUser.timeSlots && activeUser.timeSlots.length > 0) {
      currentTimeSlotsToRender = activeUser.timeSlots;
    }
    scheduleMatrixToRender = activeUser.schedule;
  } else if (state.compareMode && state.selectedUserIds.size > 0) {
    // In compare mode, for now, we'll render based on the DEFAULT_TIMESLOTS
    // The actual clash detection in determineSlotStatus will need to be much smarter later.
    // This means the VISUAL grid is based on defaults, but coloring might reflect actual overlaps.
    // OR, pick the time slots of the first selected user as the base for the grid display.
    // For simplicity in Phase 1, let's stick to DEFAULT_TIMESLOTS as the visual grid basis in compare mode.
    // This part will need significant rework for true heterogeneous comparison display.
    currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
    // `determineSlotStatus` will handle the logic for coloring these default slots based on actual user times
    console.warn("Compare mode: Grid rendered with default time slots. Advanced heterogeneous comparison display pending.");
  } else {
    // No active user, not in compare mode with selections: show default grid structure
    currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
  }
  
  // --- Render Table Headers (Time Slots) ---
  // Clear existing time headers, keeping "Day/Time" and the add button cell
  const thCells = Array.from(tableHeadRow.children);
  // Start from 1 to keep "Day/Time", end before the last cell (add button cell)
  for (let i = thCells.length - 2; i >= 1; i--) { 
    tableHeadRow.removeChild(thCells[i]);
  }

  const addSlotCellRef = DOM_ELEMENTS.addTimeSlotHeaderCell; // Reference to the "+" button's cell

  currentTimeSlotsToRender.forEach((slotData, index) => {
    const th = document.createElement("th");
    th.textContent = slotData.label; // Use the label from timeSlots
    th.dataset.timeIndex = index;     // For identifying the column, useful for editing later
    th.classList.add("time-slot-header"); // For potential styling or click handling for editing
    
    // Insert the new header cell before the "add new slot" button's cell
    if (addSlotCellRef) {
      tableHeadRow.insertBefore(th, addSlotCellRef);
    } else {
      tableHeadRow.appendChild(th); // Fallback if the addSlotCellRef isn't found
    }
  });

  // --- Render Table Body (Schedule Slots for each day) ---
  tableBody.innerHTML = ""; // Clear existing body rows to rebuild

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  daysOfWeek.forEach((dayName, dayIndex) => {
    const tr = document.createElement("tr");
    const tdDayName = document.createElement("td");
    tdDayName.textContent = dayName;
    tr.appendChild(tdDayName);

    currentTimeSlotsToRender.forEach((slotData, timeIndex) => {
      const tdSlot = document.createElement("td");
      tdSlot.classList.add("slot");
      tdSlot.dataset.day = dayIndex;
      tdSlot.dataset.time = timeIndex; // CRITICAL: This now refers to the *index* of the time slot

      // Get status class using the master state object for comparison logic
      // or the active user's schedule for direct display.
      // determineSlotStatus already handles checking state.activeUserId for 'slot-selected'
      const statusClass = determineSlotStatus(dayIndex, timeIndex, state); 
      if (statusClass !== 'slot') {
        tdSlot.classList.add(statusClass);
      }
      tr.appendChild(tdSlot);
    });
    tableBody.appendChild(tr);
  });
}

/** Renders the list of users in the UI. */
function renderUserList() {
  if (!DOM_ELEMENTS.userListContainer) {
    console.error("User list container element not found for rendering.");
    return;
  }

  const userEntries = Object.entries(state.users);
  if (userEntries.length === 0) {
    DOM_ELEMENTS.userListContainer.innerHTML = "<p>No users added yet. Try adding one!</p>";
    return;
  }

  // Generate HTML for each user item and join them
  DOM_ELEMENTS.userListContainer.innerHTML = userEntries.map(([userId, user]) => {
      const isActive = state.activeUserId === userId ? "active" : "";
      const isSelected = state.selectedUserIds.has(userId) ? "selected" : "";
      // Uses data attributes for event delegation targets
      return `
        <div data-user-id="${userId}" class="user-item ${isActive} ${isSelected}">
          <button class="user-name-btn">${user.name}</button>
          <button data-delete-user-id="${userId}" class="delete-btn">Delete</button>
        </div>
      `;
    }).join("");
}

/** Central function to update all relevant parts of the UI. */
function updateUI() {

  console.log("updateUI called at:", new Date().toLocaleTimeString()); // Add this

  renderScheduleGrid();
  renderUserList();
  // Visually update the compare button based on compareMode state
  if (DOM_ELEMENTS.compareButton) {
    DOM_ELEMENTS.compareButton.classList.toggle("active", state.compareMode);
  }
}

/* ================================
   EVENT HANDLERS & APP LOGIC ORCHESTRATION
   These functions respond to user interactions, call core logic, update state, and trigger UI refresh.
================================== */

/** Handles the "Add User" button click. */
function handleAddNewUser() {
  if (!DOM_ELEMENTS.userNameInput || !DOM_ELEMENTS.userIdInput) return;
  const name = DOM_ELEMENTS.userNameInput.value.trim();
  const userId = DOM_ELEMENTS.userIdInput.value.trim();

  if (name && userId) {
    const newUserObject = createUserObject(name, userId, state.users);
    if (newUserObject) {
      state.users[userId] = newUserObject; // Update state
      handleSetActiveUser(userId);       // Set as active (also saves and updates UI)
    } else {
      showAppModal(`User with ID "${userId}" already exists. Please choose a different ID.`, "Duplicate User ID");
    }
    // Clear input fields after attempt
    DOM_ELEMENTS.userNameInput.value = "";
    DOM_ELEMENTS.userIdInput.value = "";
  } else {
    showAppModal("Please enter both a name and a unique ID for the new user.", "Input Required");
  }
}

/** Handles a click on a user's delete button, showing a confirmation modal. */
function handleDeleteUser(userIdToDelete) {
  if (!state.users[userIdToDelete]) {
    console.warn(`Attempted to delete non-existent user: ${userIdToDelete}`);
    return;
  }
  const user = state.users[userIdToDelete];
  showAppModal(
    `Are you sure you want to delete ${user.name} (ID: ${userIdToDelete})? This action cannot be undone.`,
    "Confirm Deletion",
    true, // Show Yes/No confirmation buttons
    () => { // This is the onConfirm callback, executed if "Yes" is clicked
      state = deleteUserFromState(userIdToDelete, state); // Update state using pure function
      saveStateToStorage();
      updateUI();
      showAppModal(`${user.name} has been successfully deleted.`, "User Deleted"); // Success feedback
    }
  );
}

/** Sets a user as active for editing their schedule. */
function handleSetActiveUser(userId) {
  if (state.users[userId]) {
    state.activeUserId = userId;
    state.compareMode = false; // Exit compare mode
    state.selectedUserIds.clear(); // Clear any comparison selections
    saveStateToStorage(); // Persist changes (e.g. if active user implies a default view)
    updateUI();
  }
}

/** Toggles the schedule comparison mode. */
function handleToggleCompareMode() {
  state.compareMode = !state.compareMode;
  state.activeUserId = null; // No single active user in compare mode
  state.selectedUserIds.clear(); // Reset selections when toggling mode
  // Note: compareMode itself is not saved to localStorage, it's a session state.
  updateUI();
}

/** Toggles a user's inclusion in the comparison set when in compare mode. */
function handleToggleUserSelectionForCompare(userId) {
  if (!state.compareMode || !state.users[userId]) return;

  if (state.selectedUserIds.has(userId)) {
    state.selectedUserIds.delete(userId);
  } else {
    state.selectedUserIds.add(userId);
  }
  // Note: selectedUserIds is not saved to localStorage, it's a session state.
  updateUI();
}

/** Handles a click on a schedule slot to toggle its busy/free state for the active user. */
function handleToggleScheduleSlot(dayIndex, timeIndex) {
  if (!state.activeUserId || state.compareMode) return; // Only in edit mode for an active user
  const currentUser = state.users[state.activeUserId];

  if (currentUser?.schedule?.[dayIndex]?.[timeIndex] !== undefined) {
    const newSchedule = toggleSlotInSchedule(dayIndex, timeIndex, currentUser.schedule);
    currentUser.schedule = newSchedule; // Update the user's schedule directly in the state object
    saveStateToStorage();
    updateUI();
  }
}

/** Shows the tooltip with availability details for a slot (in compare mode). */
function handleShowSlotTooltip(slotElement, dayIndex, timeIndex) {
  if (!DOM_ELEMENTS.slotTooltip || !state.compareMode || state.selectedUserIds.size === 0) {
    handleHideSlotTooltip(); // Ensure tooltip is hidden if conditions aren't met
    return;
  }
  const message = generateTooltipMessage(dayIndex, timeIndex, state);
  DOM_ELEMENTS.slotTooltip.textContent = message;

  const rect = slotElement.getBoundingClientRect();
  // Position tooltip above the slot, centered horizontally
  DOM_ELEMENTS.slotTooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  DOM_ELEMENTS.slotTooltip.style.top = `${rect.top + window.scrollY - DOM_ELEMENTS.slotTooltip.offsetHeight - 5}px`; // 5px offset from slot
  DOM_ELEMENTS.slotTooltip.style.display = "block";
  DOM_ELEMENTS.slotTooltip.style.transform = 'translateX(-50%)'; // Horizontal centering trick
}

/** Hides the slot tooltip. */
function handleHideSlotTooltip() {
  if (DOM_ELEMENTS.slotTooltip) {
    DOM_ELEMENTS.slotTooltip.style.display = "none";
  }
}

/** Handles exporting the current active user's schedule. */
function handleExportCurrentUser() {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    return showAppModal("Please select an active user to export their schedule.", "Export Error");
  }
  const currentUser = state.users[state.activeUserId];
  const exportData = { // Create a clean object for export
    id: currentUser.id,
    name: currentUser.name,
    schedule: currentUser.schedule,
  };
  const jsonToExport = JSON.stringify(exportData, null, 2); // Pretty print with 2-space indent

  navigator.clipboard.writeText(jsonToExport)
    .then(() =>
      showAppModal(
        `${currentUser.name}'s schedule has been successfully copied to your clipboard!`,
        "Export Successful"
      )
    )
    .catch(error => {
      console.error("Clipboard export error:", error);
      showAppModal(
        "Could not copy schedule to clipboard. Please check browser permissions or try again. The schedule JSON is available in the import/export text area as a fallback.",
        "Clipboard Error"
      );
      // Fallback: display JSON in the importTextArea if clipboard fails
      if (DOM_ELEMENTS.importTextArea) DOM_ELEMENTS.importTextArea.value = jsonToExport;
    });
}

/** Handles importing a user's schedule from JSON. */
function handleImportSchedule() {
  if (!DOM_ELEMENTS.importTextArea) return;
  const jsonInput = DOM_ELEMENTS.importTextArea.value.trim();
  if (!jsonInput) {
    return showAppModal(
      "Please paste the exported schedule JSON into the text area before importing.",
      "Import Error: No Data"
    );
  }

  try {
    const importedUser = JSON.parse(jsonInput);
    // Basic validation of the imported structure
    if (!importedUser.id || typeof importedUser.id !== 'string' ||
        !importedUser.name || typeof importedUser.name !== 'string' ||
        !Array.isArray(importedUser.schedule) || importedUser.schedule.length !== 7 ||
        !importedUser.schedule.every(day => Array.isArray(day) && day.length === 6 && day.every(slot => typeof slot === 'boolean'))
       ) {
      throw new Error("Invalid user data format. Ensure ID (string), name (string), and a valid 7x6 boolean schedule array are present.");
    }
    state.users[importedUser.id] = importedUser; // Add or overwrite user in state
    saveStateToStorage();
    updateUI();
    DOM_ELEMENTS.importTextArea.value = ""; // Clear textarea on success
    showAppModal(
      `User "${importedUser.name}" (ID: ${importedUser.id}) imported successfully!`,
      "Import Complete"
    );
  } catch (e) {
    console.error("Import error:", e);
    showAppModal(
      `Import failed: ${e.message}\nPlease ensure valid JSON is pasted.`,
      "Import Failed"
    );
  }
}

/* ================================
   INPUT VALIDATION
   Sets up live validation for user name and ID input fields.
================================== */
function setupInputValidation() {
  if(DOM_ELEMENTS.userNameInput) {
    DOM_ELEMENTS.userNameInput.addEventListener("input", (event) => {
      // Allow letters, spaces, hyphens, apostrophes
      event.target.value = event.target.value.replace(/[^a-zA-Z\s'-]/g,"");
    });
  }
  if(DOM_ELEMENTS.userIdInput) {
    DOM_ELEMENTS.userIdInput.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/[^0-9]/g,""); // Allow only digits
      // Prevent leading zeros if number is longer than 1 digit (e.g., "01" becomes "1")
      if(event.target.value.length > 1) {
        event.target.value = event.target.value.replace(/^0+/,"");
      }
    });
  }
}

/* ================================
   EVENT LISTENERS SETUP
   Attaches event listeners to DOM elements.
================================== */
function setupEventListeners() {
  // Static button listeners
  if(DOM_ELEMENTS.addUserButton) DOM_ELEMENTS.addUserButton.addEventListener("click", handleAddNewUser);
  if(DOM_ELEMENTS.compareButton) DOM_ELEMENTS.compareButton.addEventListener("click", handleToggleCompareMode);
  if(DOM_ELEMENTS.exportButton) DOM_ELEMENTS.exportButton.addEventListener("click", handleExportCurrentUser);
  if(DOM_ELEMENTS.importButton) DOM_ELEMENTS.importButton.addEventListener("click", handleImportSchedule);

  // Add listener for the "Add New Time Slot" button
  if(DOM_ELEMENTS.addNewTimeSlotBtn) DOM_ELEMENTS.addNewTimeSlotBtn.addEventListener("click", handleAddNewTimeSlotClick);

  // Event Delegation for dynamically created user list items
  if(DOM_ELEMENTS.userListContainer) {
    DOM_ELEMENTS.userListContainer.addEventListener("click", (event) => {
      const targetElement = event.target;
      const userItemDiv = targetElement.closest(".user-item"); // Find the parent .user-item div

      if(userItemDiv) { // Check if the click originated within a user-item
        const userId = userItemDiv.dataset.userId;
        if(targetElement.classList.contains("delete-btn")) { // Click was on the delete button
          event.stopPropagation(); // Prevent the click from also triggering user selection/activation
          handleDeleteUser(userId);
        } else if (userId) { // Click was on the user name button or the user item div itself
          if(state.compareMode) {
            handleToggleUserSelectionForCompare(userId);
          } else {
            handleSetActiveUser(userId);
          }
        }
      }
    });
  }
  
  // Event Delegation/Listeners for schedule table slots
  if(DOM_ELEMENTS.scheduleTable) {
    DOM_ELEMENTS.scheduleTable.addEventListener("click", (event) => {
      if(event.target.classList.contains("slot")) {
        const slotElement = event.target;
        const day = parseInt(slotElement.dataset.day, 10);
        const time = parseInt(slotElement.dataset.time, 10);
        // Only toggle if valid slot and not in compare mode
        if(!isNaN(day) && !isNaN(time) && !state.compareMode) {
          handleToggleScheduleSlot(day,time);
        }
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseover", (event) => {
      if(state.compareMode && event.target.classList.contains("slot")) {
        const slotElement = event.target;
        const day = parseInt(slotElement.dataset.day, 10);
        const time = parseInt(slotElement.dataset.time, 10);
        if(!isNaN(day) && !isNaN(time)) {
          handleShowSlotTooltip(slotElement, day, time);
        }
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseout", (event) => {
      // Hide tooltip if mouse leaves a slot or the table itself
      if(event.target.classList.contains("slot") || event.target === DOM_ELEMENTS.scheduleTable) {
        handleHideSlotTooltip();
      }
    });
  }
}

/* ================================
   INITIALIZATION FUNCTION
   Called once the DOM is fully loaded.
================================== */

function initializeApp() {
  // **Consolidated DOM Element Ensuring/Re-fetching**
  // The DOM_ELEMENTS object at the top of the file attempts to fetch these.
  // This section in initializeApp acts as a final check or re-fetch if any were null,
  // which might happen if the script was in <head> without defer or if there are race conditions.
  // With DOMContentLoaded, initial fetches should mostly be successful.

  // Define an array of element keys that are fetched by ID
  const elementsById = [
    "userNameInput", "userIdInput", "userListContainer", "compareButton",
    "scheduleTable", "slotTooltip", "importTextArea", "appModal", "modalTitle",
    "modalMessage", "modalCloseBtn", "modalActionButtons", "modalConfirmBtn",
    "modalCancelBtn", "addNewTimeSlotBtn", "addTimeSlotHeaderCell"
  ];

  elementsById.forEach(key => {
    // If the key exists in DOM_ELEMENTS but its value is null, try to get it again.
    // (This assumes keys in DOM_ELEMENTS match the element IDs, which is mostly true for these)
    if (DOM_ELEMENTS.hasOwnProperty(key) && !DOM_ELEMENTS[key]) {
      DOM_ELEMENTS[key] = document.getElementById(key); // Assuming key is the ID
      // if (!DOM_ELEMENTS[key]) console.error(`Critical DOM Element not found: #${key}`);
    }
  });

  // For elements fetched by querySelector, ensure they are also checked/re-fetched if null
  if (!DOM_ELEMENTS.addUserButton) {
    DOM_ELEMENTS.addUserButton = document.querySelector(".add-user button");
  }
  if (!DOM_ELEMENTS.exportButton) {
    DOM_ELEMENTS.exportButton = document.querySelector(".export-import button:nth-of-type(1)");
  }
  if (!DOM_ELEMENTS.importButton) {
    DOM_ELEMENTS.importButton = document.querySelector(".export-import button:nth-of-type(2)");
  }

  // --- End of DOM Element Ensuring ---

  loadStateFromStorage();   // Load any saved user data
  setupInputValidation();   // Set up live input validation
  setupEventListeners();    // Attach event listeners to page elements (including addNewTimeSlotBtn)

  // Setup Modal Button Event Listeners
  if (DOM_ELEMENTS.modalCloseBtn) {
    DOM_ELEMENTS.modalCloseBtn.addEventListener("click", hideAppModal);
  }
  if (DOM_ELEMENTS.modalConfirmBtn) {
    DOM_ELEMENTS.modalConfirmBtn.addEventListener("click", () => {
      if (typeof confirmModalCallback === 'function') {
        confirmModalCallback(); // Execute the stored callback for "Yes"
      }
      hideAppModal(); // Always close modal after action
    });
  }
  if (DOM_ELEMENTS.modalCancelBtn) {
    DOM_ELEMENTS.modalCancelBtn.addEventListener("click", hideAppModal); // "No" just closes
  }
  
  // Close modal if overlay (outside modal content) is clicked
  if (DOM_ELEMENTS.appModal) {
    DOM_ELEMENTS.appModal.addEventListener("click", (event) => {
      if (event.target === DOM_ELEMENTS.appModal) { // Check if click was directly on overlay
        hideAppModal();
      }
    });
  }
  // Close modal with Escape key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && DOM_ELEMENTS.appModal?.classList.contains("active")) {
      hideAppModal();
    }
  });

  updateUI(); // Perform initial render based on loaded state
}

// Initialize the application once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", initializeApp);