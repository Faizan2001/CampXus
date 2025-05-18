// js/script.js

// --- Module Imports ---
import { DEFAULT_TIMESLOTS, LOCAL_STORAGE_KEY } from './constants.js';
import { DOM_ELEMENTS, initializeDomElements } from './domElements.js';
import { initModal, showModal } from './modal.js';
import { parseTime, isTimeBefore, isValidTimeFormat, isValidStrictHHMMTimeFormat } from './timeUtils.js';

/* ================================
   APPLICATION STATE
================================== */
let state = {
  activeUserId: null,
  users: {}, // Changed from object to array: { userId: userObject } -> [userObject, ...]
              // Let's keep it as an object for easier lookup state.users[userId]
  selectedUserIds: new Set(),
  compareMode: false,
};

// --- State Accessors/Mutators (for testing or specific needs) ---
export function getState() { return state; }
export function _setStateForTesting(newState) { state = { ...state, ...newState }; }
export function _resetStateForTesting() {
  state = { activeUserId: null, users: {}, selectedUserIds: new Set(), compareMode: false };
}

/* ================================
   CORE LOGIC FUNCTIONS (Data Manipulation)
================================== */
export function createUserObject(name, userId, currentUsers) {
  if (!currentUsers[userId]) {
    const userTimeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS)); // Deep copy
    const schedule = Array(7).fill(null).map(() => Array(userTimeSlots.length).fill(false));
    return { id: userId, name: name, timeSlots: userTimeSlots, schedule: schedule };
  }
  return null;
}

export function deleteUserFromState(userId, currentState) {
  const newUsers = { ...currentState.users };
  let newActiveUserId = currentState.activeUserId;
  const newSelectedUserIds = new Set(currentState.selectedUserIds);

  if (!newUsers[userId]) return currentState;
  delete newUsers[userId];
  if (newActiveUserId === userId) newActiveUserId = null;
  newSelectedUserIds.delete(userId);

  return { ...currentState, users: newUsers, activeUserId: newActiveUserId, selectedUserIds: newSelectedUserIds };
}

export function toggleSlotInSchedule(dayIndex, timeIndex, userSchedule) {
  return userSchedule.map((daySlots, dIdx) =>
    dIdx === dayIndex
      ? daySlots.map((slotValue, tIdx) => (tIdx === timeIndex ? !slotValue : slotValue))
      : [...daySlots]
  );
}

export function determineSlotStatus(dayIndex, timeIndex, currentState) {
  const { compareMode, selectedUserIds, users, activeUserId } = currentState;
  // Ensure users[id].schedule[dayIndex] exists and is an array before accessing timeIndex
  // And that users[id].timeSlots exist to determine valid timeIndex range

  if (compareMode && selectedUserIds.size > 0) {
    let busyCount = 0;
    let allUsersHaveSlot = true; // Flag to check if all selected users even have this timeIndex

    selectedUserIds.forEach(id => {
        const user = users[id];
        if (user && user.schedule && user.schedule[dayIndex]) {
            if (timeIndex < user.schedule[dayIndex].length) { // Check if slot index is valid for this user
                if (user.schedule[dayIndex][timeIndex]) {
                    busyCount++;
                }
            } else {
                allUsersHaveSlot = false; // This user doesn't have this time slot index
            }
        } else {
            allUsersHaveSlot = false; // User or their schedule/day doesn't exist
        }
    });
    
    if (!allUsersHaveSlot && selectedUserIds.size > 0) { // If any user doesn't have the slot, it might be partial or uncomparable
        // This logic needs refinement for heterogeneous schedules. For now, if not all have it, consider it partial.
        // A better approach would be to map times, not indices, for comparison.
        return "slot-partial"; // Or a new "slot-undefined-for-some"
    }

    if (busyCount === 0 && selectedUserIds.size > 0) return "slot-free";
    if (busyCount === selectedUserIds.size) return "slot-conflict";
    if (selectedUserIds.size > 0) return "slot-partial"; // some busy, some free
    
  } else if (activeUserId && users[activeUserId]) {
      const activeUserObj = users[activeUserId];
      if (activeUserObj.schedule && activeUserObj.schedule[dayIndex] && timeIndex < activeUserObj.schedule[dayIndex].length) {
          if (activeUserObj.schedule[dayIndex][timeIndex]) {
            return "slot-selected";
          }
      }
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
    if (user && user.schedule && user.schedule[dayIndex] && timeIndex < user.schedule[dayIndex].length) {
      (user.schedule[dayIndex][timeIndex] ? busyUsers : freeUsers).push(user.name);
    } else if (user) {
        // If user exists but doesn't have this specific slot defined (e.g. heterogeneous schedules)
        // For now, we don't list them, or could add to a 'N/A' list.
    }
  });

  if (busyUsers.length === selectedUserIds.size && selectedUserIds.size > 0) return "All selected users are unavailable.";
  if (freeUsers.length === selectedUserIds.size && selectedUserIds.size > 0) return "All selected users are free.";
  
  let message = "Availability:\n";
  if (freeUsers.length > 0) message += `Free: ${freeUsers.join(", ")}\n`;
  if (busyUsers.length > 0) message += `Busy: ${busyUsers.join(", ")}`;
  return message.trim();
}

/* ================================
   DYNAMIC TIMESLOT FUNCTIONS
================================== */

// js/script.js

// ... (other imports and code) ...

function addCustomTimeSlotToActiveUser(startTime, endTime) {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    showModal({ content: "Please select an active user to add a custom time slot.", title: "No Active User" });
    return false;
  }

  if (!startTime || !endTime) {
    showModal({ content: "Both Start Time and End Time are required.", title: "Input Error" });
    return false;
  }

  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
    showModal({
      content: "Invalid time format. Use '8:00 AM', '08:00', '17:30'.",
      title: "Invalid Time Format"
    });
    return false;
  }

  const user = state.users[state.activeUserId];

  if (!user.timeSlots || !Array.isArray(user.timeSlots)) {
    user.timeSlots = [];
  }

  // --- START: MODIFIED formatTimeForLabel ---
  const formatTimeForLabel = (timeStr) => {
    let formattedTime = timeStr.toUpperCase().replace(/\s/g, ''); // Remove spaces, toUpperCase
    // Only remove ":00" if AM/PM is present
    if (formattedTime.includes("AM") || formattedTime.includes("PM")) {
      formattedTime = formattedTime.replace(/[:.]00(?=(AM|PM))/, ''); // Remove :00 only if followed by AM/PM
    }
    // If the input was HH:MM (24-hour) and became HHAM/PM due to toUpperCase, we just want the original input.
    // However, your current regex in isValidTimeFormat allows '8:00 AM' as well as '08:00'.
    // The user input (startTime, endTime) is what we should use for the label if it's already HH:MM.
    // The main goal is to make labels like "8AM" from "8:00 AM" but keep "17:00" as "17:00".

    // Let's simplify: If the input contains AM/PM, try to shorten it. Otherwise, use it as is.
    // This assumes startTime and endTime are the user's input.
    const originalTimeStr = timeStr.trim(); // Use the original, trimmed input
    if (originalTimeStr.match(/\s*([AP]M)\s*$/i)) { // Check if AM/PM is part of the input
        // It has AM/PM, so try to shorten like "8:00 AM" -> "8AM"
        return originalTimeStr.replace(/[:.]00(?=\s*([AP]M)\s*$)/i, '').toUpperCase().replace(/\s/g, '');
    } else {
        // No AM/PM, so it's likely HH:MM (e.g., "05:00", "17:30"). Keep it as is.
        return originalTimeStr;
    }
  };
  // --- END: MODIFIED formatTimeForLabel ---

  // The newSlotLabel will now use the raw startTime and endTime if they don't have AM/PM
  // or the shortened version if they do.
  // For "5:00" and "6:00", they will remain "5:00" and "6:00".
  // For "8:00 AM" and "9:00 AM", they will become "8AM" and "9AM".
  // The label now directly uses the (potentially formatted) start and end times.
  const newSlotLabel = `${formatTimeForLabel(startTime)}-${formatTimeForLabel(endTime)}`;


  if (user.timeSlots.some(slot => slot.label.toUpperCase() === newSlotLabel.toUpperCase())) {
    showModal({ content: `A time slot with label "${newSlotLabel}" already exists.`, title: "Duplicate Time Slot" });
    return false;
  }

  // Store the original, user-provided start and end times.
  // The label is for display.
  user.timeSlots.push({ start: startTime.trim(), end: endTime.trim(), label: newSlotLabel });
  user.schedule.forEach(daySchedule => daySchedule.push(false));

  saveStateToStorage();
  updateUI();
  showModal({ content: `New slot "${newSlotLabel}" added for ${user.name}.`, title: "Time Slot Added" });
  return true;
}

// .........................................

function handleAddNewTimeSlotClick() {
  if (!state.activeUserId) {
    showModal({ content: "Please select an active user first.", title: "User Not Selected" });
    return;
  }
  const user = state.users[state.activeUserId];
  if (!user.timeSlots || user.timeSlots.length === 0) {
    // If user has no time slots (e.g. old data before migration fully initialized them or they were all deleted)
    // We should initialize them from DEFAULT_TIMESLOTS before adding a new one.
    // This ensures the schedule matrix is compatible.
    // This scenario should be less common with the migration in loadState.
    user.timeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS));
    user.schedule = Array(7).fill(null).map(() => Array(user.timeSlots.length).fill(false));
    console.warn(`User ${user.id} had no timeSlots. Initialized with defaults before adding new custom slot.`);
  }


  const timeInputFormHTML = `
    <div id="newTimeSlotFormInternal" class="time-input-form">
      <div><label for="modalNewSlotStartTime">Start Time:</label><input type="text" id="modalNewSlotStartTime" placeholder="e.g., 08:00 or 8:00 AM" required></div>
      <div><label for="modalNewSlotEndTime">End Time:</label><input type="text" id="modalNewSlotEndTime" placeholder="e.g., 09:30 or 9:30 AM" required></div>
      <p class="time-input-hint">Use HH:MM or H:MM AM/PM.</p>
      <div id="new-slot-error-message" class="modal-error-message" style="display:none;"></div>
    </div>`;

  showModal({
    content: timeInputFormHTML,
    title: "Add New Time Slot",
    showConfirmationButtons: true,
    isHtmlContent: true,
    confirmText: "Add Slot",
    cancelText: "Cancel",
    onConfirm: () => {
      const startTimeInputEl = document.getElementById("modalNewSlotStartTime");
      const endTimeInputEl = document.getElementById("modalNewSlotEndTime");
      const errorMessageElement = document.getElementById('new-slot-error-message');

      if (startTimeInputEl && endTimeInputEl && errorMessageElement) {
        const startTime = startTimeInputEl.value.trim();
        const endTime = endTimeInputEl.value.trim();
        
        // Basic validation within modal before calling addCustomTimeSlotToActiveUser
        errorMessageElement.style.display = 'none';
        if (!startTime || !endTime) {
            errorMessageElement.textContent = 'Start and End times are required.';
            errorMessageElement.style.display = 'block';
            return false; // Prevent modal close
        }
        if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
            errorMessageElement.textContent = "Invalid time format. Use HH:MM or H:MM AM/PM (e.g., '08:00', '5:30 PM').";
            errorMessageElement.style.display = 'block';
            return false; // Prevent modal close
        }
        // More advanced validation (start < end, no overlap) could go here or in addCustomTimeSlotToActiveUser
        // For now, pass to addCustomTimeSlotToActiveUser which has its own checks.
        return addCustomTimeSlotToActiveUser(startTime, endTime); // This will show its own modals for success/error
      }
      console.error("Modal time input fields not found.");
      return false; // Prevent close if elements are missing
    }
  });
}

/* ================================
   STATE PERSISTENCE (LocalStorage)
================================== */
function loadStateFromStorage() {
  const savedStateString = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (savedStateString) {
    const parsedSavedState = JSON.parse(savedStateString);
    const loadedUsers = parsedSavedState.users || {};
    
    Object.values(loadedUsers).forEach(user => {
      if (!user.timeSlots || !Array.isArray(user.timeSlots) || user.timeSlots.length === 0) {
        console.warn(`User ${user.id} missing timeSlots, applying defaults.`);
        user.timeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS));
      }
      if (user.schedule && user.schedule.length === 7 && user.timeSlots) {
        user.schedule = user.schedule.map(daySchedule => {
          const newDayScheduleArray = Array(user.timeSlots.length).fill(false);
          const limit = Math.min(daySchedule.length, newDayScheduleArray.length);
          for (let i = 0; i < limit; i++) newDayScheduleArray[i] = daySchedule[i];
          return newDayScheduleArray;
        });
      } else {
        user.schedule = Array(7).fill(null).map(() => Array(user.timeSlots.length).fill(false));
      }
    });
    state.users = loadedUsers;
  }
}

function saveStateToStorage() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ users: state.users }));
}

/* ================================
   UI RENDERING FUNCTIONS
================================== */
// --- START: Phase 3 - Editable Time Slot Header Functions ---
/**
 * Handles click events on time slot headers for editing.
 * @param {Event} event - The click event.
 */
function handleTimeSlotHeaderClick(event) {
    const slotIndex = parseInt(event.currentTarget.dataset.slotIndex, 10);
    const activeUserObject = state.users[state.activeUserId];

    if (!activeUserObject) {
        showModal({ content: "No active user selected.", title: "Error" });
        return;
    }
    // Ensure we are editing user's own timeSlots, not defaults if they have none.
    if (!activeUserObject.timeSlots || activeUserObject.timeSlots.length === 0) {
        showModal({
            content: "This user is currently using default time slots. Add a custom time slot first to enable editing.",
            title: "Cannot Edit Defaults"
        });
        return;
    }
    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= activeUserObject.timeSlots.length) {
        console.error("Invalid slot index for editing:", slotIndex);
        showModal({ content: "Error: Could not determine which time slot to edit.", title: "Error" });
        return;
    }
    openEditTimeSlotModal(slotIndex, activeUserObject);
}

/**
 * Opens a modal to edit a specific time slot.
 * @param {number} slotIndex - The index of the time slot to edit.
 * @param {object} activeUserObject - The active user object.
 */
function openEditTimeSlotModal(slotIndex, activeUserObject) {
    const currentTimeSlot = activeUserObject.timeSlots[slotIndex];

    // For editing, we expect HH:MM format. If stored format is AM/PM, convert or ask user.
    // For simplicity, let's assume stored start/end might be AM/PM, but input for edit is HH:MM.
    // The initial values in the modal should be what the user can readily edit.
    // We'll provide current values as placeholders. Users should input strict HH:MM.
    const modalContentHTML = `
        <div>
            <h3>Edit Time Slot</h3>
            <p>Current Label: <strong>${currentTimeSlot.label}</strong></p>
            <p class="time-input-hint">Enter new times in HH:MM format (e.g., 09:00, 14:30).</p>
            <div class="form-group">
                <label for="edit-slot-start-time">New Start Time (HH:MM):</label>
                <input type="text" id="edit-slot-start-time" class="modal-input" value="${currentTimeSlot.start.match(/\d{1,2}:\d{2}/) ? currentTimeSlot.start.match(/\d{1,2}:\d{2}/)[0] : currentTimeSlot.start}" required placeholder="e.g., 09:00">
            </div>
            <div class="form-group">
                <label for="edit-slot-end-time">New End Time (HH:MM):</label>
                <input type="text" id="edit-slot-end-time" class="modal-input" value="${currentTimeSlot.end.match(/\d{1,2}:\d{2}/) ? currentTimeSlot.end.match(/\d{1,2}:\d{2}/)[0] : currentTimeSlot.end}" required placeholder="e.g., 10:30">
            </div>
            <div id="edit-slot-error-message" class="modal-error-message" style="display:none;"></div>
        </div>
    `;

    showModal({
        content: modalContentHTML,
        title: "Edit Time Slot",
        isHtmlContent: true,
        showConfirmationButtons: true,
        confirmText: "Save Changes",
        cancelText: "Cancel",
        onConfirm: () => processTimeSlotEdit(slotIndex, activeUserObject)
    });
}

/**
 * Processes the editing of a time slot after modal submission.
 * @param {number} slotIndex - The index of the time slot being edited.
 * @param {object} activeUserObject - The active user object.
 * @returns {boolean} True if successful (modal should close), false if validation fails.
 */
function processTimeSlotEdit(slotIndex, activeUserObject) {
    const newStartTimeInput = document.getElementById('edit-slot-start-time');
    const newEndTimeInput = document.getElementById('edit-slot-end-time');
    const errorMessageElement = document.getElementById('edit-slot-error-message');

    if (!newStartTimeInput || !newEndTimeInput || !errorMessageElement) {
        console.error("Modal elements for editing time slot not found.");
        if(errorMessageElement) {
             errorMessageElement.textContent = 'Error: Modal form is broken.';
             errorMessageElement.style.display = 'block';
        }
        return false; 
    }

    const newStartTime = newStartTimeInput.value.trim();
    const newEndTime = newEndTimeInput.value.trim();

    errorMessageElement.textContent = '';
    errorMessageElement.style.display = 'none';
    newStartTimeInput.classList.remove('input-error'); // Assuming you have .input-error CSS
    newEndTimeInput.classList.remove('input-error');

    if (!newStartTime || !newEndTime) {
        errorMessageElement.textContent = 'Start and End times cannot be empty.';
        if (!newStartTime) newStartTimeInput.classList.add('input-error');
        if (!newEndTime) newEndTimeInput.classList.add('input-error');
        errorMessageElement.style.display = 'block';
        return false;
    }
    // Use stricter HH:MM validation for editing
    if (!isValidStrictHHMMTimeFormat(newStartTime)) {
        errorMessageElement.textContent = 'Invalid Start Time. Use HH:MM format (e.g., 09:00).';
        newStartTimeInput.classList.add('input-error');
        errorMessageElement.style.display = 'block';
        return false;
    }
    if (!isValidStrictHHMMTimeFormat(newEndTime)) {
        errorMessageElement.textContent = 'Invalid End Time. Use HH:MM format (e.g., 14:30).';
        newEndTimeInput.classList.add('input-error');
        errorMessageElement.style.display = 'block';
        return false;
    }
    if (!isTimeBefore(newStartTime, newEndTime)) {
        errorMessageElement.textContent = 'Start Time must be before End Time.';
        newStartTimeInput.classList.add('input-error');
        newEndTimeInput.classList.add('input-error');
        errorMessageElement.style.display = 'block';
        return false;
    }

    // Adjacent Slot Conflict Validation
    const userTimeSlots = activeUserObject.timeSlots;
    if (slotIndex > 0) {
        const prevSlot = userTimeSlots[slotIndex - 1];
        // prevSlot.end might be "HH:MM AM/PM", newStartTime is "HH:MM"
        // Need a robust way to compare. For now, assume prevSlot.end can be parsed by isTimeBefore if it were HH:MM
        // This highlights the need for consistent time representation or more robust parsing.
        // Let's assume for this validation, we need to parse prevSlot.end to HH:MM or handle AM/PM in parseTime
        // For now, if prevSlot.end is in AM/PM, this comparison might be tricky.
        // A temporary fix: if isTimeBefore expects HH:MM, and prevSlot.end contains AM/PM, it will fail parseTime.
        // This needs a more robust time parsing utility that handles AM/PM and converts to minutes or 24h format.
        // For now, this check might be unreliable if times are stored with AM/PM.
        // We'll proceed assuming isTimeBefore can handle the format or that times are already HH:MM.
        if (!isTimeBefore(prevSlot.end, newStartTime)) { // This will fail if prevSlot.end has AM/PM and parseTime doesn't handle it
             // A better comparison logic is needed here if formats differ.
             // Simplification: assume parseTime in timeUtils.js is robust enough or formats are consistent.
            errorMessageElement.textContent = `Conflict: New start (${newStartTime}) must be after previous slot's end (${prevSlot.end}).`;
            newStartTimeInput.classList.add('input-error');
            errorMessageElement.style.display = 'block';
            return false;
        }
    }
    if (slotIndex < userTimeSlots.length - 1) {
        const nextSlot = userTimeSlots[slotIndex + 1];
        if (!isTimeBefore(newEndTime, nextSlot.start)) { // Similar issue with nextSlot.start format
            errorMessageElement.textContent = `Conflict: New end (${newEndTime}) must be before next slot's start (${nextSlot.start}).`;
            newEndTimeInput.classList.add('input-error');
            errorMessageElement.style.display = 'block';
            return false;
        }
    }

    // Update user's timeSlot object
    userTimeSlots[slotIndex].start = newStartTime; // Store as HH:MM
    userTimeSlots[slotIndex].end = newEndTime;   // Store as HH:MM
    userTimeSlots[slotIndex].label = `${newStartTime}-${newEndTime}`; // Update label

    saveStateToStorage();
    renderScheduleGrid(); // Re-render to reflect changes
    // No success modal here, as the main modal closing is success.
    return true; // Success
}
// --- END: Phase 3 - Editable Time Slot Header Functions ---

function renderScheduleGrid() {
  if (!DOM_ELEMENTS.scheduleTable) {
    console.error("Schedule table element not found.");
    return;
  }
  const tableHeadRow = DOM_ELEMENTS.scheduleTable.querySelector("thead tr");
  const tableBody = DOM_ELEMENTS.scheduleTable.querySelector("tbody");

  if (!tableHeadRow || !tableBody) {
    console.error("Schedule table thead>tr or tbody not found.");
    return;
  }

  let currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
  let scheduleMatrixToRender = null;
  let activeUserHasCustomSlots = false;

  if (state.activeUserId && state.users[state.activeUserId]) {
    const user = state.users[state.activeUserId];
    if (user.timeSlots && user.timeSlots.length > 0) {
      currentTimeSlotsToRender = user.timeSlots;
      activeUserHasCustomSlots = true; // User has their own slots
    }
    scheduleMatrixToRender = user.schedule;
  } else if (state.compareMode && state.selectedUserIds.size > 0) {
    // For compare mode, use default time slots for the grid structure for now.
    // Actual coloring will be handled by determineSlotStatus which needs to be robust for heterogeneous schedules.
    currentTimeSlotsToRender = DEFAULT_TIMESLOTS; 
    // `determineSlotStatus` will attempt to map indices, which is a simplification.
  }
  
  // Clear existing time headers, except "Day/Time" and "Add Slot" cell
  const thCells = Array.from(tableHeadRow.children);
  for (let i = thCells.length - 2; i >= 1; i--) { // Assumes Day/Time is child 0, AddSlot is last child
    tableHeadRow.removeChild(thCells[i]);
  }
  
  const addSlotCellRef = DOM_ELEMENTS.addTimeSlotHeaderCell;

  currentTimeSlotsToRender.forEach((slotData, index) => {
    const th = document.createElement("th");
    th.textContent = slotData.label;
    th.dataset.timeIndex = index; // Kept for compatibility with other logic
    
    // --- START: Phase 3 - Make headers clickable for editing ---
    if (state.activeUserId && activeUserHasCustomSlots) { // Only if an active user has their own slots
        th.classList.add('editable-timeslot-header');
        th.dataset.slotIndex = index; // Specific for editing this indexed slot
        th.title = "Click to edit this time slot";
        th.addEventListener('click', handleTimeSlotHeaderClick);
    } else {
        th.classList.add("time-slot-header"); // Default class if not editable
    }
    // --- END: Phase 3 ---

    if (addSlotCellRef) tableHeadRow.insertBefore(th, addSlotCellRef);
    else tableHeadRow.appendChild(th);
  });

  tableBody.innerHTML = ""; // Clear existing body
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  daysOfWeek.forEach((dayName, dayIndex) => {
    const tr = document.createElement("tr");
    const tdDayName = document.createElement("td");
    tdDayName.textContent = dayName;
    tr.appendChild(tdDayName);

    currentTimeSlotsToRender.forEach((_, timeIndex) => {
      const tdSlot = document.createElement("td");
      tdSlot.classList.add("slot"); // Base class
      tdSlot.dataset.day = dayIndex;
      tdSlot.dataset.time = timeIndex; // This index matches currentTimeSlotsToRender

      const statusClass = determineSlotStatus(dayIndex, timeIndex, state);
      if (statusClass !== 'slot') tdSlot.classList.add(statusClass);
      tr.appendChild(tdSlot);
    });
    tableBody.appendChild(tr);
  });
}


function renderUserList() {
  if (!DOM_ELEMENTS.userListContainer) return;
  const userEntries = Object.entries(state.users);
  if (userEntries.length === 0) {
    DOM_ELEMENTS.userListContainer.innerHTML = "<p>No users. Add one!</p>";
    return;
  }
  DOM_ELEMENTS.userListContainer.innerHTML = userEntries.map(([userId, user]) => `
    <div data-user-id="${userId}" class="user-item ${state.activeUserId === userId ? "active" : ""} ${state.selectedUserIds.has(userId) ? "selected" : ""}">
      <button class="user-name-btn">${user.name}</button>
      <button data-delete-user-id="${userId}" class="delete-btn">Delete</button>
    </div>`).join("");
}

function updateUI() {
  renderScheduleGrid();
  renderUserList();
  if (DOM_ELEMENTS.compareButton) DOM_ELEMENTS.compareButton.classList.toggle("active", state.compareMode);
}

/* ================================
   EVENT HANDLERS & APP LOGIC
================================== */
function handleAddNewUser() {
  if (!DOM_ELEMENTS.userNameInput || !DOM_ELEMENTS.userIdInput) return;
  const name = DOM_ELEMENTS.userNameInput.value.trim();
  const userId = DOM_ELEMENTS.userIdInput.value.trim();

  if (name && userId) {
    const newUserObject = createUserObject(name, userId, state.users);
    if (newUserObject) {
      state.users[userId] = newUserObject;
      handleSetActiveUser(userId);
    } else {
      showModal({ content: `User ID "${userId}" already exists.`, title: "Duplicate User ID" });
    }
    DOM_ELEMENTS.userNameInput.value = "";
    DOM_ELEMENTS.userIdInput.value = "";
  } else {
    showModal({ content: "Name and ID are required.", title: "Input Required" });
  }
}

function handleDeleteUser(userIdToDelete) {
  if (!state.users[userIdToDelete]) return;
  const user = state.users[userIdToDelete];
  showModal({
    content: `Delete ${user.name} (ID: ${userIdToDelete})? This is permanent.`,
    title: "Confirm Deletion",
    showConfirmationButtons: true,
    confirmText: "Delete",
    cancelText: "Cancel",
    onConfirm: () => {
      state = deleteUserFromState(userIdToDelete, state);
      saveStateToStorage();
      updateUI();
      showModal({ content: `${user.name} deleted.`, title: "User Deleted" });
      return true; // Allow modal to close
    }
  });
}

function handleSetActiveUser(userId) {
  if (state.users[userId]) {
    state.activeUserId = userId;
    state.compareMode = false;
    state.selectedUserIds.clear();
    saveStateToStorage(); // Save state if active user change implies persistent view change
    updateUI();
  }
}

function handleToggleCompareMode() {
  state.compareMode = !state.compareMode;
  state.activeUserId = null;
  // state.selectedUserIds.clear(); // Keep selections or clear? User preference. Let's keep.
  updateUI();
}

function handleToggleUserSelectionForCompare(userId) {
  if (!state.compareMode || !state.users[userId]) return;
  if (state.selectedUserIds.has(userId)) state.selectedUserIds.delete(userId);
  else state.selectedUserIds.add(userId);
  updateUI();
}

function handleToggleScheduleSlot(dayIndex, timeIndex) {
  if (!state.activeUserId || state.compareMode || !state.users[state.activeUserId]) return;
  const currentUser = state.users[state.activeUserId];
  
  // Ensure the slot index is valid for the current user's schedule
  if (currentUser.schedule && currentUser.schedule[dayIndex] && timeIndex < currentUser.schedule[dayIndex].length) {
      currentUser.schedule = toggleSlotInSchedule(dayIndex, timeIndex, currentUser.schedule);
      saveStateToStorage();
      updateUI();
  } else {
      console.warn(`Attempted to toggle invalid slot: Day ${dayIndex}, Time ${timeIndex} for user ${state.activeUserId}`);
  }
}

function handleShowSlotTooltip(slotElement, dayIndex, timeIndex) {
  if (!DOM_ELEMENTS.slotTooltip || !state.compareMode || state.selectedUserIds.size === 0) {
    handleHideSlotTooltip(); return;
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
  if (DOM_ELEMENTS.slotTooltip) DOM_ELEMENTS.slotTooltip.style.display = "none";
}

function handleExportCurrentUser() {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    return showModal({ content: "Select an active user to export.", title: "Export Error" });
  }
  const currentUser = state.users[state.activeUserId];
  // Exporting user's own timeSlots if they exist
  const exportData = {
    id: currentUser.id,
    name: currentUser.name,
    timeSlots: currentUser.timeSlots, // Export user's specific time slots
    schedule: currentUser.schedule,
  };
  const jsonToExport = JSON.stringify(exportData, null, 2);
  navigator.clipboard.writeText(jsonToExport)
    .then(() => showModal({ content: `${currentUser.name}'s schedule copied!`, title: "Export Successful" }))
    .catch(err => {
      console.error("Clipboard export error:", err);
      showModal({ content: "Could not copy. See text area.", title: "Clipboard Error" });
      if (DOM_ELEMENTS.importTextArea) DOM_ELEMENTS.importTextArea.value = jsonToExport;
    });
}

function handleImportSchedule() {
  if (!DOM_ELEMENTS.importTextArea) return;
  const jsonInput = DOM_ELEMENTS.importTextArea.value.trim();
  if (!jsonInput) return showModal({ content: "Paste JSON to import.", title: "Import Error" });

  try {
    const importedData = JSON.parse(jsonInput);
    // Validate imported structure
    if (!importedData.id || !importedData.name || !Array.isArray(importedData.schedule) ||
        !Array.isArray(importedData.timeSlots) // Expecting timeSlots now
    ) {
      throw new Error("Invalid data format. Must include id, name, schedule array, and timeSlots array.");
    }
    // Further validation for schedule and timeSlots structure
    if (importedData.schedule.length !== 7 || 
        !importedData.schedule.every(day => Array.isArray(day) && day.length === importedData.timeSlots.length)) {
        throw new Error("Schedule dimensions must be 7 days by number of timeSlots.");
    }
    if (!importedData.timeSlots.every(slot => slot.label && slot.start && slot.end)) {
        throw new Error("Each timeSlot must have a label, start, and end time.");
    }

    state.users[importedData.id] = { // Directly assign/overwrite
        id: importedData.id,
        name: importedData.name,
        timeSlots: importedData.timeSlots,
        schedule: importedData.schedule,
    };
    saveStateToStorage();
    updateUI();
    DOM_ELEMENTS.importTextArea.value = "";
    showModal({ content: `User "${importedData.name}" imported!`, title: "Import Complete" });
  } catch (e) {
    console.error("Import error:", e);
    showModal({ content: `Import failed: ${e.message}`, title: "Import Failed" });
  }
}


function setupInputValidation() {
  if(DOM_ELEMENTS.userNameInput) DOM_ELEMENTS.userNameInput.addEventListener("input", (e) => e.target.value = e.target.value.replace(/[^a-zA-Z\s'-]/g,""));
  if(DOM_ELEMENTS.userIdInput) DOM_ELEMENTS.userIdInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g,"");
    if(e.target.value.length > 1) e.target.value = e.target.value.replace(/^0+/,"");
  });
}

function setupEventListeners() {
  if(DOM_ELEMENTS.addUserButton) DOM_ELEMENTS.addUserButton.addEventListener("click", handleAddNewUser);
  if(DOM_ELEMENTS.compareButton) DOM_ELEMENTS.compareButton.addEventListener("click", handleToggleCompareMode);
  if(DOM_ELEMENTS.exportButton) DOM_ELEMENTS.exportButton.addEventListener("click", handleExportCurrentUser);
  if(DOM_ELEMENTS.importButton) DOM_ELEMENTS.importButton.addEventListener("click", handleImportSchedule);
  if(DOM_ELEMENTS.addNewTimeSlotBtn) DOM_ELEMENTS.addNewTimeSlotBtn.addEventListener("click", handleAddNewTimeSlotClick);

  if(DOM_ELEMENTS.userListContainer) {
    DOM_ELEMENTS.userListContainer.addEventListener("click", (e) => {
      const userItemDiv = e.target.closest(".user-item");
      if(userItemDiv) {
        const userId = userItemDiv.dataset.userId;
        if(e.target.classList.contains("delete-btn")) {
          e.stopPropagation(); handleDeleteUser(userId);
        } else if (userId) {
          state.compareMode ? handleToggleUserSelectionForCompare(userId) : handleSetActiveUser(userId);
        }
      }
    });
  }
  
  if(DOM_ELEMENTS.scheduleTable) {
    DOM_ELEMENTS.scheduleTable.addEventListener("click", (e) => {
      if(e.target.classList.contains("slot")) {
        const day = parseInt(e.target.dataset.day, 10), time = parseInt(e.target.dataset.time, 10);
        if(!isNaN(day) && !isNaN(time) && !state.compareMode) handleToggleScheduleSlot(day,time);
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseover", (e) => {
      if(state.compareMode && e.target.classList.contains("slot")) {
        const day = parseInt(e.target.dataset.day, 10), time = parseInt(e.target.dataset.time, 10);
        if(!isNaN(day) && !isNaN(time)) handleShowSlotTooltip(e.target, day, time);
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseout", (e) => {
      if(e.target.classList.contains("slot") || e.target === DOM_ELEMENTS.scheduleTable) handleHideSlotTooltip();
    });
  }
}

/* ================================
   INITIALIZATION
================================== */
function initializeApp() {
  initializeDomElements(); // Initialize DOM_ELEMENTS from domElements.js
  initModal(DOM_ELEMENTS); // Initialize Modal system from modal.js
  
  loadStateFromStorage();
  setupInputValidation();
  setupEventListeners();
  updateUI();
}

document.addEventListener("DOMContentLoaded", initializeApp);