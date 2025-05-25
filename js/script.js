// js/script.js

// --- Module Imports ---
import { DEFAULT_TIMESLOTS, LOCAL_STORAGE_KEY } from "./constants.js";
import { DOM_ELEMENTS, initializeDomElements } from "./domElements.js";
import { initModal, showModal } from "./modal.js";
import {
  parseTime,
  isTimeBefore,
  isValidTimeFormat,
  isValidStrictHHMMTimeFormat,
  convertToHHMM,
} from "./timeUtils.js";

/* ================================
   APPLICATION STATE
================================== */
let state = {
  activeUserId: null,
  users: {}, // Changed from object to array: { userId: userObject } -> [userObject, ...]
  // Let's keep it as an object for easier lookup state.users[userId]
  selectedUserIds: new Set(),
  compareMode: false,
  pinModeActive: false, // <-- NEW STATE PROPERTY
};

// --- State Accessors/Mutators (for testing or specific needs) ---
export function getState() {
  return state;
}
export function _setStateForTesting(newState) {
  state = { ...state, ...newState };
}
export function _resetStateForTesting() {
  state = {
    activeUserId: null,
    users: {},
    selectedUserIds: new Set(),
    compareMode: false,
    pinModeActive: false, // <-- ADD TO RESET
  };
}

/* ================================
   CORE LOGIC FUNCTIONS (Data Manipulation)
================================== */
export function createUserObject(name, userId, currentUsers) {
  if (!currentUsers[userId]) {
    const userTimeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS)); // Deep copy
    const schedule = Array(7)
      .fill(null)
      .map(() => Array(userTimeSlots.length).fill(false));
    const pinnedSlots = Array(7)
      .fill(null)
      .map(() => Array(userTimeSlots.length).fill(false));
    return {
      id: userId,
      name: name,
      timeSlots: userTimeSlots,
      schedule: schedule,
      pinnedSlots: pinnedSlots, // <-- ADD THIS
    };
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

  return {
    ...currentState,
    users: newUsers,
    activeUserId: newActiveUserId,
    selectedUserIds: newSelectedUserIds,
  };
}

export function toggleSlotInSchedule(dayIndex, timeIndex, userSchedule) {
  return userSchedule.map((daySlots, dIdx) =>
    dIdx === dayIndex
      ? daySlots.map((slotValue, tIdx) =>
          tIdx === timeIndex ? !slotValue : slotValue
        )
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

    selectedUserIds.forEach((id) => {
      const user = users[id];
      if (user && user.schedule && user.schedule[dayIndex]) {
        if (timeIndex < user.schedule[dayIndex].length) {
          // Check if slot index is valid for this user
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

    if (!allUsersHaveSlot && selectedUserIds.size > 0) {
      // If any user doesn't have the slot, it might be partial or uncomparable
      // This logic needs refinement for heterogeneous schedules. For now, if not all have it, consider it partial.
      // A better approach would be to map times, not indices, for comparison.
      return "slot-partial"; // Or a new "slot-undefined-for-some"
    }

    if (busyCount === 0 && selectedUserIds.size > 0) return "slot-free";
    if (busyCount === selectedUserIds.size) return "slot-conflict";
    if (selectedUserIds.size > 0) return "slot-partial"; // some busy, some free
  } else if (activeUserId && users[activeUserId]) {
    const activeUserObj = users[activeUserId];
    if (
      activeUserObj.schedule &&
      activeUserObj.schedule[dayIndex] &&
      timeIndex < activeUserObj.schedule[dayIndex].length
    ) {
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
    if (
      user &&
      user.schedule &&
      user.schedule[dayIndex] &&
      timeIndex < user.schedule[dayIndex].length
    ) {
      (user.schedule[dayIndex][timeIndex] ? busyUsers : freeUsers).push(
        user.name
      );
    } else if (user) {
      // If user exists but doesn't have this specific slot defined (e.g. heterogeneous schedules)
      // For now, we don't list them, or could add to a 'N/A' list.
    }
  });

  if (busyUsers.length === selectedUserIds.size && selectedUserIds.size > 0)
    return "All selected users are unavailable.";
  if (freeUsers.length === selectedUserIds.size && selectedUserIds.size > 0)
    return "All selected users are free.";

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
    showModal({
      content: "Please select an active user to add a custom time slot.",
      title: "No Active User",
    });
    return false; // Indicate failure
  }

  const trimmedStartTime = startTime.trim();
  const trimmedEndTime = endTime.trim();

  if (!trimmedStartTime || !trimmedEndTime) {
    showModal({
      content: "Both Start Time and End Time are required.",
      title: "Input Error",
    });
    return false;
  }

  // Initial validation of user input format (allows AM/PM, HH:MM, H:MM)
  if (
    !isValidTimeFormat(trimmedStartTime) ||
    !isValidTimeFormat(trimmedEndTime)
  ) {
    showModal({
      content:
        "Invalid time format. Please use formats like '8:00 AM', '08:00', '5:30 PM', or '17:30'.",
      title: "Invalid Time Format",
    });
    return false;
  }

  const user = state.users[state.activeUserId];

  if (!user.timeSlots || !Array.isArray(user.timeSlots)) {
    user.timeSlots = []; // Initialize if missing
  }

  // Convert user input to strict "HH:MM" (24-hour) format
  const hhmmStartTime = convertToHHMM(trimmedStartTime);
  const hhmmEndTime = convertToHHMM(trimmedEndTime);

  // After conversion, validate that the results are indeed in strict HH:MM format.
  // This catches cases where convertToHHMM might return the original input if it couldn't parse it
  // and that original input wasn't strictly HH:MM.
  if (
    !isValidStrictHHMMTimeFormat(hhmmStartTime) ||
    !isValidStrictHHMMTimeFormat(hhmmEndTime)
  ) {
    showModal({
      content: `Could not process the entered times into a standard format. Received: "${trimmedStartTime}" and "${trimmedEndTime}". Please use HH:MM or H:MM AM/PM.`,
      title: "Time Processing Error",
    });
    return false;
  }

  // Validate that start time is before end time using the consistent HH:MM format
  if (!isTimeBefore(hhmmStartTime, hhmmEndTime)) {
    showModal({
      content: `Start time (${hhmmStartTime}) must be before end time (${hhmmEndTime}).`,
      title: "Invalid Time Range",
    });
    return false;
  }

  // Create the label using the consistent "HH:MM" format
  const newSlotLabel = `${hhmmStartTime}-${hhmmEndTime}`;

  // Check for duplicate labels (case-insensitive)
  if (
    user.timeSlots.some(
      (slot) => slot.label.toUpperCase() === newSlotLabel.toUpperCase()
    )
  ) {
    showModal({
      content: `A time slot with the label "${newSlotLabel}" already exists for ${user.name}.`,
      title: "Duplicate Time Slot",
    });
    return false;
  }

  // --- Store the CONVERTED "HH:MM" times for consistency ---
  // This makes future comparisons and processing easier.
  user.timeSlots.push({
    start: hhmmStartTime,
    end: hhmmEndTime,
    label: newSlotLabel,
  });

  // Expand the schedule matrix for the new slot
  user.schedule.forEach((daySchedule) => {
    daySchedule.push(false);
  });
  // Expand the pinnedSlots matrix for the new slot
  user.pinnedSlots.forEach((dayPinnedSlots) => {
    dayPinnedSlots.push(false);
  });

  saveStateToStorage();
  updateUI();
  showModal({
    content: `New time slot "${newSlotLabel}" added for ${user.name}.`,
    title: "Time Slot Added",
  });
  return true; // Indicate success
}

// .........................................

export function handleAddNewTimeSlotClick() {
  if (!state.activeUserId) {
    showModal({
      content: "Please select an active user first.",
      title: "User Not Selected",
    });
    return;
  }
  const user = state.users[state.activeUserId];
  if (!user.timeSlots || user.timeSlots.length === 0) {
    // If user has no time slots (e.g. old data before migration fully initialized them or they were all deleted)
    // We should initialize them from DEFAULT_TIMESLOTS before adding a new one.
    // This ensures the schedule matrix is compatible.
    // This scenario should be less common with the migration in loadState.
    user.timeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS));
    user.schedule = Array(7)
      .fill(null)
      .map(() => Array(user.timeSlots.length).fill(false));
    user.pinnedSlots = Array(7)
      .fill(null)
      .map(() => Array(user.timeSlots.length).fill(false)); // <-- ADD/ENSURE THIS

    console.warn(
      `User ${user.id} had no timeSlots. Initialized with defaults before adding new custom slot.`
    );
  }

  const timeInputFormHTML = `
  <div class="add-timeslot-form-content">
    <div> <!-- Wrapper for Start Time label + input -->
      <label for="modalNewSlotStartTime">Start Time:</label>
      <input type="text" id="modalNewSlotStartTime" class="modal-input" ...>
    </div>
    <div> <!-- Wrapper for End Time label + input -->
      <label for="modalNewSlotEndTime">End Time:</label>
      <input type="text" id="modalNewSlotEndTime" class="modal-input" ...>
    </div>
    <p class="time-input-hint">Use HH:MM or H:MM AM/PM.</p>
    <div id="new-slot-error-message" class="modal-error-message" style="display:none;"></div>
  </div>
`;

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
      const errorMessageElement = document.getElementById(
        "new-slot-error-message"
      );

      if (startTimeInputEl && endTimeInputEl && errorMessageElement) {
        const startTime = startTimeInputEl.value.trim();
        const endTime = endTimeInputEl.value.trim();

        // Basic validation within modal before calling addCustomTimeSlotToActiveUser
        errorMessageElement.style.display = "none";
        if (!startTime || !endTime) {
          errorMessageElement.textContent = "Start and End times are required.";
          errorMessageElement.style.display = "block";
          return false; // Prevent modal close
        }
        if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
          errorMessageElement.textContent =
            "Invalid time format. Use HH:MM or H:MM AM/PM (e.g., '08:00', '5:30 PM').";
          errorMessageElement.style.display = "block";
          return false; // Prevent modal close
        }
        // More advanced validation (start < end, no overlap) could go here or in addCustomTimeSlotToActiveUser
        // For now, pass to addCustomTimeSlotToActiveUser which has its own checks.
        return addCustomTimeSlotToActiveUser(startTime, endTime); // This will show its own modals for success/error
      }
      console.error("Modal time input fields not found.");
      return false; // Prevent close if elements are missing
    },
  });
}

function handleTogglePinMode() {
  if (!state.activeUserId || state.compareMode) {
    // This case means the button was clicked while it should have been disabled,
    // or state changed between render and click. Defensive coding:
    state.pinModeActive = false; // Ensure it's off if conditions aren't met
    console.warn(
      "Pin Mode toggle attempted when conditions not met. Forcing off."
    );
  } else {
    // Toggle the pin mode state
    state.pinModeActive = !state.pinModeActive;
    if (state.pinModeActive && state.compareMode) {
      // Defensive check
      state.compareMode = false;
      // activeUserId should still be set if we entered here
    }
  }
  updateUI(); // This will re-apply the .active class to the button based on the new state.pinModeActive
}

// Pin Slot Click Handler

function handlePinSlotClick(dayIndex, slotIndex, event) {
  if (event) {
    event.stopPropagation();
  }

  if (!state.activeUserId || !state.users[state.activeUserId]) {
    console.warn("handlePinSlotClick called with no active user.");
    return;
  }

  const activeUserObject = state.users[state.activeUserId];

  if (
    !activeUserObject ||
    !activeUserObject.schedule ||
    !activeUserObject.pinnedSlots ||
    activeUserObject.schedule[dayIndex] === undefined ||
    activeUserObject.schedule[dayIndex][slotIndex] === undefined ||
    activeUserObject.pinnedSlots[dayIndex] === undefined ||
    activeUserObject.pinnedSlots[dayIndex][slotIndex] === undefined
  ) {
    console.error(
      "Data integrity issue in handlePinSlotClick for user:",
      activeUserObject.id,
      dayIndex,
      slotIndex
    );
    showModal({
      title: "Error",
      content: "Could not process pin action due to data error.",
    });
    return;
  }

  if (activeUserObject.schedule[dayIndex][slotIndex] === true) {
    // slot is busy
    showModal({
      title: "Pinning Not Allowed",
      content:
        "You can only pin or unpin slots that are marked as free in your schedule.",
    });
    return;
  }

  activeUserObject.pinnedSlots[dayIndex][slotIndex] =
    !activeUserObject.pinnedSlots[dayIndex][slotIndex];
  console.log(
    `Slot (${dayIndex}, ${slotIndex}) for user ${activeUserObject.id} pinned state: ${activeUserObject.pinnedSlots[dayIndex][slotIndex]}`
  );

  saveStateToStorage();
  updateUI();
}

/* ================================
   STATE PERSISTENCE (LocalStorage)
================================== */
function loadStateFromStorage() {
  const savedStateString = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (savedStateString) {
    const parsedSavedState = JSON.parse(savedStateString);
    const loadedUsers = parsedSavedState.users || {};

    Object.values(loadedUsers).forEach((user) => {
      if (
        !user.timeSlots ||
        !Array.isArray(user.timeSlots) ||
        user.timeSlots.length === 0
      ) {
        console.warn(`User ${user.id} missing timeSlots, applying defaults.`);
        user.timeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS));
      }
      if (user.schedule && user.schedule.length === 7 && user.timeSlots) {
        user.schedule = user.schedule.map((daySchedule) => {
          const newDayScheduleArray = Array(user.timeSlots.length).fill(false);
          const limit = Math.min(
            daySchedule.length,
            newDayScheduleArray.length
          );
          for (let i = 0; i < limit; i++)
            newDayScheduleArray[i] = daySchedule[i];
          return newDayScheduleArray;
        });
      } else {
        user.schedule = Array(7)
          .fill(null)
          .map(() => Array(user.timeSlots.length).fill(false));
      }
      // Check if pinnedSlots is missing or has incorrect structure
      if (
        !user.pinnedSlots ||
        !Array.isArray(user.pinnedSlots) ||
        user.pinnedSlots.length !== 7 ||
        (user.timeSlots.length > 0 &&
          (!user.pinnedSlots[0] ||
            user.pinnedSlots[0].length !== user.timeSlots.length)) ||
        (user.timeSlots.length === 0 &&
          user.pinnedSlots[0] &&
          user.pinnedSlots[0].length !== 0)
      ) {
        console.warn(
          `User ${user.id} (from storage) missing or has invalid pinnedSlots, re-initializing.`
        );
        user.pinnedSlots = Array(7)
          .fill(null)
          .map(() => Array(user.timeSlots.length).fill(false));
      }
    });
    state.users = loadedUsers;
  }
}

function saveStateToStorage() {
  localStorage.setItem(
    LOCAL_STORAGE_KEY,
    JSON.stringify({ users: state.users })
  );
}

/* ================================
   UI RENDERING FUNCTIONS
================================== */
// --- START: Phase 3 - Editable Time Slot Header Functions ---
/**
 * Handles click events on time slot headers for editing.
 * @param {Event} event - The click event.
 */
export function handleTimeSlotHeaderClick(event) {
  const slotIndexString = event.currentTarget.dataset.slotIndex;
  if (slotIndexString === undefined) {
    console.error("Slot index is undefined for clicked header.");
    showModal({
      content:
        "Could not determine which time slot to edit. Slot index missing.",
      title: "Error",
    });
    return;
  }
  const slotIndex = parseInt(slotIndexString, 10);

  if (isNaN(slotIndex)) {
    console.error("Slot index is not a number:", slotIndexString);
    showModal({
      content: "Invalid slot index provided. Must be a number.",
      title: "Error",
    });
    return;
  }

  if (!state.activeUserId || !state.users[state.activeUserId]) {
    // This case should ideally not be reached if headers are only made clickable for active users,
    // but it's a good safeguard.
    console.error("handleTimeSlotHeaderClick called with no active user.");
    showModal({
      content:
        "No active user selected. Please select a user to edit their schedule.",
      title: "Error",
    });
    return;
  }
  const activeUserObject = state.users[state.activeUserId];

  if (
    !activeUserObject.timeSlots ||
    slotIndex < 0 ||
    slotIndex >= activeUserObject.timeSlots.length
  ) {
    console.error(
      `Invalid slot index ${slotIndex} for user ${activeUserObject.id} with ${activeUserObject.timeSlots?.length} slots.`
    );
    showModal({
      content:
        "Error: The selected time slot could not be found or is invalid.",
      title: "Error",
    });
    return;
  }

  // If all checks pass, open the modal for editing
  openEditTimeSlotModal(slotIndex, activeUserObject);
}

/**
 * Opens a modal to edit a specific time slot.
 * @param {number} slotIndex - The index of the time slot to edit.
 * @param {object} activeUserObject - The active user object.
 */
export function openEditTimeSlotModal(slotIndex, activeUserObject) {
  const currentTimeSlot = activeUserObject.timeSlots[slotIndex];

  // Since we store times in "HH:MM" format, pre-filling is direct.

  const modalContentHTML = `
        <div class="modal-form-container"> <!-- Outer container for all form content -->
            <p>Current: <strong>${currentTimeSlot.label}</strong></p>
            <p class="time-input-hint">Enter new times in HH:MM format (e.g., 09:00, 14:30).</p>
            
            <div class="form-group" id="edit-slot-start-time-wrapper">
                <label for="edit-slot-start-time">New Start Time (HH:MM):</label>
                <input type="text" id="edit-slot-start-time" class="modal-input" 
                       value="${currentTimeSlot.start}" 
                       required placeholder="e.g., 09:00">
            </div>
            
            <div class="form-group" id="edit-slot-end-time-wrapper">
                <label for="edit-slot-end-time">New End Time (HH:MM):</label>
                <input type="text" id="edit-slot-end-time" class="modal-input" 
                       value="${currentTimeSlot.end}" 
                       required placeholder="e.g., 10:30">
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
    onConfirm: () => {
      return processTimeSlotEdit(slotIndex, activeUserObject);
    },
    onCancel: () => {
      console.log("Edit time slot cancelled.");
    },
  });
}

/**
 * Processes the editing of a time slot after modal submission.
 * @param {number} slotIndex - The index of the time slot being edited.
 * @param {object} activeUserObject - The active user object.
 * @returns {boolean} True if successful (modal should close), false if validation fails.
 */
export function processTimeSlotEdit(slotIndex, activeUserObject) {
  const newStartTimeInput = document.getElementById("edit-slot-start-time");
  const newEndTimeInput = document.getElementById("edit-slot-end-time");
  const errorMessageElement = document.getElementById(
    "edit-slot-error-message"
  );

  if (!newStartTimeInput || !newEndTimeInput || !errorMessageElement) {
    console.error("Modal elements for editing time slot not found.");

    return true; // Allow modal to close, but log the error
  }

  const rawStartTime = newStartTimeInput.value.trim(); // Get raw input
  const rawEndTime = newEndTimeInput.value.trim(); // Get raw input

  errorMessageElement.textContent = "";
  errorMessageElement.style.display = "none";
  newStartTimeInput.classList.remove("input-error");
  newEndTimeInput.classList.remove("input-error");

  if (!activeUserObject || !Array.isArray(activeUserObject.timeSlots)) {
    console.error(
      "Invalid activeUserObject or missing timeSlots in processTimeSlotEdit."
    );
    errorMessageElement.textContent =
      "An error occurred. User data might be corrupted.";
    errorMessageElement.style.display = "block";
    return false; // Critical error, prevent modal close
  }

  if (!rawStartTime || !rawEndTime) {
    errorMessageElement.textContent = "Both Start and End times are required.";
    if (!rawStartTime) {
      newStartTimeInput.classList.add("input-error");
    }
    if (!rawEndTime) {
      newEndTimeInput.classList.add("input-error");
    }
    errorMessageElement.style.display = "block";
    return false;
  }

  // --- START: Convert raw input from edit modal to HH:MM ---
  const newStartTime = convertToHHMM(rawStartTime);
  const newEndTime = convertToHHMM(rawEndTime);
  // --- END: Conversion ---

  // --- Validation ---

  // Now validate the converted HH:MM format
  if (!isValidStrictHHMMTimeFormat(newStartTime)) {
    errorMessageElement.textContent = `Invalid Start Time: "${rawStartTime}". Please use H:MM or HH:MM (e.g., 8:00, 09:00, 14:30).`;
    newStartTimeInput.classList.add("input-error");
    errorMessageElement.style.display = "block";
    return false;
  }

  if (!isValidStrictHHMMTimeFormat(newEndTime)) {
    errorMessageElement.textContent = `Invalid End Time: "${rawEndTime}". Please use H:MM or HH:MM (e.g., 8:00, 09:00, 14:30).`;
    newEndTimeInput.classList.add("input-error");
    errorMessageElement.style.display = "block";
    return false;
  }

  if (!isTimeBefore(newStartTime, newEndTime)) {
    errorMessageElement.textContent = `Start Time (${newStartTime}) must be strictly before End Time (${newEndTime}).`;
    newStartTimeInput.classList.add("input-error");
    newEndTimeInput.classList.add("input-error");
    errorMessageElement.style.display = "block";
    return false;
  }

  const userTimeSlots = activeUserObject.timeSlots;

  // --- Adjacent Slot Conflict Validation ---
  if (slotIndex > 0) {
    const prevSlot = userTimeSlots[slotIndex - 1];
    // Ensure prevSlot and its 'end' property are valid before comparison
    if (prevSlot && prevSlot.end && !isTimeBefore(prevSlot.end, newStartTime)) {
      errorMessageElement.textContent = `Conflict: New start (${newStartTime}) must be after previous slot's end (${prevSlot.end}).`;
      newStartTimeInput.classList.add("input-error");
      errorMessageElement.style.display = "block";
      return false;
    }
  }

  if (slotIndex < userTimeSlots.length - 1) {
    const nextSlot = userTimeSlots[slotIndex + 1];
    // Ensure nextSlot and its 'start' property are valid before comparison
    if (
      nextSlot &&
      nextSlot.start &&
      !isTimeBefore(newEndTime, nextSlot.start)
    ) {
      errorMessageElement.textContent = `Conflict: New end (${newEndTime}) must be before next slot's start (${nextSlot.start}).`;
      newEndTimeInput.classList.add("input-error");
      errorMessageElement.style.display = "block";
      return false;
    }
  }

  // --- All Validations Passed ---
  userTimeSlots[slotIndex].start = newStartTime; // Store HH:MM
  userTimeSlots[slotIndex].end = newEndTime; // Store HH:MM
  userTimeSlots[slotIndex].label = `${newStartTime}-${newEndTime}`;

  saveStateToStorage();
  renderScheduleGrid();
  return true;
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

  let allowEditingHeaders = false; // Renamed for clarity

  if (state.activeUserId && state.users[state.activeUserId]) {
    const user = state.users[state.activeUserId];

    // Critical: Check if the user object and its timeSlots array exist and are not empty
    if (user && user.timeSlots && user.timeSlots.length > 0) {
      currentTimeSlotsToRender = user.timeSlots;
      allowEditingHeaders = true; // User has their own slots defined
    }
  } else if (state.compareMode && state.selectedUserIds.size > 0) {
    // Compare mode

    currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
    allowEditingHeaders = false; // Not editable in compare mode
  } else {
    // No active user, show defaults, not editable
    currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
    allowEditingHeaders = false;
  }

  // Clear existing time headers, except "Day/Time" and "Add Slot" cell
  const thCells = Array.from(tableHeadRow.children);
  for (let i = thCells.length - 2; i >= 1; i--) {
    // Assumes Day/Time is child 0, AddSlot is last child
    tableHeadRow.removeChild(thCells[i]);
  }

  const addSlotCellRef = DOM_ELEMENTS.addTimeSlotHeaderCell;

  currentTimeSlotsToRender.forEach((slotData, index) => {
    const th = document.createElement("th");
    th.textContent = slotData.label;

    if (allowEditingHeaders) {
      // Use the simplified flag
      th.classList.add("editable-timeslot-header");
      th.dataset.slotIndex = index;
      th.title = "Click to edit this time slot";
      th.addEventListener("click", handleTimeSlotHeaderClick);
    } else {
      th.classList.add("time-slot-header");
    }

    if (addSlotCellRef) tableHeadRow.insertBefore(th, addSlotCellRef);
    else tableHeadRow.appendChild(th);
  });

  tableBody.innerHTML = ""; // Clear existing body
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const scheduleMatrixToRender =
    state.activeUserId && state.users[state.activeUserId]
      ? state.users[state.activeUserId].schedule
      : null;

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

      // Determine status using the main state for compare mode, or active user's schedule
      let isBusy = false;
      if (state.compareMode && state.selectedUserIds.size > 0) {
        // determineSlotStatus will handle this
      } else if (
        scheduleMatrixToRender &&
        scheduleMatrixToRender[dayIndex] &&
        scheduleMatrixToRender[dayIndex][timeIndex] !== undefined
      ) {
        isBusy = scheduleMatrixToRender[dayIndex][timeIndex];
      }

      const statusClass = determineSlotStatus(dayIndex, timeIndex, state);
      if (statusClass !== "slot") {
        // determineSlotStatus returns more specific classes
        tdSlot.classList.add(statusClass);
      } else if (isBusy && !state.compareMode) {
        // Fallback for active user if determineSlotStatus only returns 'slot'
        tdSlot.classList.add("slot-selected"); // Or your 'busy' class for active user
      }

      // --- START: Pin Rendering Logic for Active User ---

      if (
        state.activeUserId &&
        !state.compareMode &&
        state.users[state.activeUserId]
      ) {
        const activeUserObject = state.users[state.activeUserId];

        // Ensure user object and relevant arrays exist and are valid for the current slot

        if (
          activeUserObject.schedule &&
          activeUserObject.schedule[dayIndex] &&
          activeUserObject.pinnedSlots &&
          activeUserObject.pinnedSlots[dayIndex] &&
          activeUserObject.schedule[dayIndex][timeIndex] !== undefined &&
          activeUserObject.pinnedSlots[dayIndex][timeIndex] !== undefined
        ) {
          const isSlotActuallyFree =
            !activeUserObject.schedule[dayIndex][timeIndex];
          const isSlotPinnedByActiveUser =
            activeUserObject.pinnedSlots[dayIndex][timeIndex];

          // Clear any previous pins/indicatiors from this cell to prevent duplication on re-renders

          const existingPinIndicators = tdSlot.querySelectorAll(
            ".pin-indicator, can-pin-indicator"
          );

          existingPinIndicators.forEach((indicator) => indicator.remove());

          if (isSlotPinnedByActiveUser) {
            // Slot is pinned by the active user - display the pin icon
            // This pin should be visible even if Pin Mode is OFF, as long as it's their schedule

            const pinElement = document.createElement("span");
            pinElement.classList.add("pin-indicator");
            pinElement.innerHTML = "&#128204;"; // Pin icon
            pinElement.title = "Pinned by you, Click to unpin";

            pinElement.addEventListener("click", (event) =>
              handlePinSlotClick(dayIndex, timeIndex, event)
            );

            tdSlot.appendChild(pinElement);
          } else if (state.pinModeActive && isSlotActuallyFree) {
            // Pin mode is ON, slot is FREE and NOT YET PINNED - show "+" affordance
            const canPinElement = document.createElement("span");
            canPinElement.classList.add("can-pin-indicator");
            canPinElement.innerHTML = "&#43;"; // Plus icon
            canPinElement.title = "Click to pin this slot";

            canPinElement.addEventListener("click", (event) =>
              handlePinSlotClick(dayIndex, timeIndex, event)
            );
            tdSlot.appendChild(canPinElement);
          }
        }
      }
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
  DOM_ELEMENTS.userListContainer.innerHTML = userEntries
    .map(
      ([userId, user]) => `
    <div data-user-id="${userId}" class="user-item ${
        state.activeUserId === userId ? "active" : ""
      } ${state.selectedUserIds.has(userId) ? "selected" : ""}">
      <div class="user-info">
        <span class="user-name">${user.name}</span>
        <span class="user-id">ID: ${user.id}</span>
      </div>
      <div class="user-actions">
        <button data-delete-user-id="${userId}" class="delete-btn">
          <i class="fas fa-trash"></i>
          Delete
        </button>
      </div>
    </div>`
    )
    .join("");
}

// Helpers for Compare and Pin Mode Button

/**
 * Determines the properties for the Compare Schedules button based on current app state.
 * @param {boolean} isPinModeCurrentlyActive - Whether pin mode is active.
 * @param {boolean} isCompareModeCurrentlyActive - Whether compare mode is active.
 * @param {number} userCount - Total number of users (or selected users for more complex logic).
 * @returns {object} An object with { isDisabled: boolean, isActiveClass: boolean }
 */
function getCompareButtonDynamicState(
  isPinModeCurrentlyActive,
  isCompareModeCurrentlyActive,
  totalUserCount
) {
  // Compare button should be disabled if:
  // 1. Pin mode is active.
  // 2. There are fewer than 2 users to compare (common requirement, adjust if needed).
  const canActuallyCompare = !isPinModeCurrentlyActive && totalUserCount >= 2;
  const conditionsToEnableButton =
    !isPinModeCurrentlyActive && canActuallyCompare;

  let text;
  if (!canActuallyCompare || isPinModeCurrentlyActive) {
    text = "Compare Schedules: DISABLED";
  } else if (isCompareModeCurrentlyActive) {
    text = "Compare Schedules: ON";
  } else {
    text = "Compare Schedules: OFF";
  }

  return {
    isDisabled: !conditionsToEnableButton, // Compare button is disabled if pin mode is active or not enough users
    isActiveClass: conditionsToEnableButton && isCompareModeCurrentlyActive, // Compare button's active class is for when compare mode IS ON
    text: text, // Dynamic text (ON/OFF/DISABLED)
  };
}

/**
 * Determines the properties for the Pin Mode button based on current application state.
 * @param {string|null} currentActiveUserId - The ID of the currently active user.
 * @param {boolean} isCompareModeActive - Whether compare mode is active.
 * @param {boolean} isPinModeCurrentlyActive - Whether pin mode is currently active in the state.
 * @returns {object} An object with { isDisabled: boolean, shouldHaveActiveClass: boolean }
 **/

function getPinModeButtonDynamicState(
  currentActiveUserId,
  isCompareModeActive,
  isPinModeCurrentlyActive
) {
  const canEnablePinMode = currentActiveUserId && !isCompareModeActive;
  let text;

  // Pin mode button should be disabled if:
  // 1. No active user is selected.
  // 2. Compare mode is active.
  if (!canEnablePinMode) {
    text = "Pin Mode: DISABLED";
  } else if (isPinModeCurrentlyActive) {
    text = "Pin Mode: ON";
  } else {
    text = "Pin Mode: OFF";
  }

  return {
    isDisabled: !canEnablePinMode,
    isActiveClass: canEnablePinMode && isPinModeCurrentlyActive,
    text: text, // Dynamic text (ON/OFF/DISABLED)
  };
}

function updateUI() {
  renderScheduleGrid();
  renderUserList();

  const totalUserCount = Object.keys(state.users).length; // Get total number of users

  // --- Logic for Compare Button ---
  if (DOM_ELEMENTS.compareButton) {
    const compareButtonState = getCompareButtonDynamicState(
      state.pinModeActive,
      state.compareMode,
      totalUserCount // Pass the user count
    );
    DOM_ELEMENTS.compareButton.disabled = compareButtonState.isDisabled;
    DOM_ELEMENTS.compareButton.classList.toggle(
      "active",
      compareButtonState.isActiveClass
    );
    DOM_ELEMENTS.compareButton.textContent = compareButtonState.text; // Set Dynamic text (ON/OFF)
  }

  // --- START: Logic for Pin Mode Button ---
  if (DOM_ELEMENTS.togglePinModeBtn) {
    const pinModeBtnState = getPinModeButtonDynamicState(
      state.activeUserId,
      state.compareMode,
      state.pinModeActive
    );

    DOM_ELEMENTS.togglePinModeBtn.disabled = pinModeBtnState.isDisabled;
    DOM_ELEMENTS.togglePinModeBtn.classList.toggle(
      "active",
      pinModeBtnState.isActiveClass
    );
    DOM_ELEMENTS.togglePinModeBtn.textContent = pinModeBtnState.text; // Set Dynamic text (ON/OFF)
  }
  // --- END: Logic for Pin Mode Button ---
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
      showModal({
        content: `User ID "${userId}" already exists.`,
        title: "Duplicate User ID",
      });
    }
    DOM_ELEMENTS.userNameInput.value = "";
    DOM_ELEMENTS.userIdInput.value = "";
  } else {
    showModal({
      content: "Name and ID are required.",
      title: "Input Required",
    });
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
      const oldActiveUserId = state.activeUserId; // Store old active user ID
      state = deleteUserFromState(userIdToDelete, state);

      // If the deleted user was the active user, set active user to null
      if (oldActiveUserId === userIdToDelete && state.activeUserId === null) {
        state.pinModeActive = false; // Reset pin mode if the active user is deleted
      }

      saveStateToStorage();
      updateUI();
      showModal({ content: `${user.name} deleted.`, title: "User Deleted" });
      return true; // Allow modal to close
    },
  });
}

function handleSetActiveUser(userId) {
  // Deselect Logic
  if (state.activeUserId === userId) {
    state.activeUserId = null;
    state.pinModeActive = false; // Reset pin mode if active user is cleared
    state.selectedUserIds.clear(); // Clear selected user IDs

    saveStateToStorage();
    updateUI();
    return;
  }

  // Select Logic
  if (state.users[userId]) {
    state.activeUserId = userId;
    state.compareMode = false;
    state.pinModeActive = false;
    state.selectedUserIds.clear();
    saveStateToStorage(); // Save state if active user change implies persistent view change
    updateUI();
  } else if (userId === null && state.activeUserId !== null) {
    // If userId is null, but we have an active user, clear the active user
    state.activeUserId = null;
    state.pinModeActive = false; // Reset pin mode if active user is cleared
    state.selectedUserIds.clear(); // Clear selected user IDs
    saveStateToStorage();
    updateUI();
  }
}

function handleToggleCompareMode() {
  state.compareMode = !state.compareMode;
  if (state.compareMode) {
    state.activeUserId = null; // Clear active user when entering compare mode
    state.pinModeActive = false; // Disable pin mode in compare mode
    state.selectedUserIds.clear(); // Clear selected user IDs
  } else if (!state.compareMode) {
    state.selectedUserIds.clear(); // Clear selected user IDs when exiting compare mode
  }

  updateUI();
}

function handleToggleUserSelectionForCompare(userId) {
  if (!state.compareMode || !state.users[userId]) return;
  if (state.selectedUserIds.has(userId)) state.selectedUserIds.delete(userId);
  else state.selectedUserIds.add(userId);
  updateUI();
}

function handleToggleScheduleSlot(dayIndex, timeIndex) {
  // --- START: Check for Pin Mode Active ---
  if (state.pinModeActive) {
    // If pin mode is active, clicks on the slot body should NOT toggle busy/free.
    // Pinning/unpinning is handled by handlePinSlotClick via the indicators.
    console.log("Pin mode is active. Slot click ignored for busy/free toggle.");
    return;
  }
  // --- END: Check for Pin Mode Active ---

  if (
    !state.activeUserId ||
    state.compareMode ||
    !state.users[state.activeUserId]
  ) {
    // No active user, in compare mode, or user doesn't exist: do nothing.
    return;
  }

  const currentUser = state.users[state.activeUserId];

  // Validate that the schedule and the specific slot exist before trying to toggle
  if (
    currentUser && // Ensure currentUser object exists
    currentUser.schedule &&
    Array.isArray(currentUser.schedule[dayIndex]) && // Ensure the day's schedule is an array
    timeIndex >= 0 && // Ensure timeIndex is not negative
    timeIndex < currentUser.schedule[dayIndex].length // Ensure timeIndex is within bounds
  ) {
    // 1. Toggle the busy/free state
    // Assuming toggleSlotInSchedule is a pure function that returns the new schedule
    const newSchedule = toggleSlotInSchedule(
      dayIndex,
      timeIndex,
      currentUser.schedule
    );
    currentUser.schedule = newSchedule; // Update the user's schedule in the state

    // 2. Get the new busy status of the slot *after* toggling
    const isNowBusy = currentUser.schedule[dayIndex][timeIndex];

    // 3. If the slot just became busy AND it was pinned, unpin it.
    //    Also ensure pinnedSlots structure is valid before accessing.
    if (
      isNowBusy && // Check if the slot is now marked as busy
      currentUser.pinnedSlots && // Check if pinnedSlots array exists for the user
      Array.isArray(currentUser.pinnedSlots[dayIndex]) && // Check if the specific day's pinnedSlots is an array
      currentUser.pinnedSlots[dayIndex][timeIndex] === true // Check if the slot was indeed pinned
    ) {
      currentUser.pinnedSlots[dayIndex][timeIndex] = false; // Unpin the slot
      console.log(
        `Slot (${dayIndex}, ${timeIndex}) for user ${currentUser.id} automatically unpinned because it became busy.`
      );
    }

    // 4. Persist all changes and update the UI
    saveStateToStorage();
    updateUI();
  } else {
    // Log a warning if the slot path is invalid, helping with debugging.
    console.warn(
      `Attempted to toggle invalid slot or access invalid schedule structure: Day ${dayIndex}, Time ${timeIndex} for user ${state.activeUserId}. Schedule or slot may not exist.`
    );
  }
}

function handleShowSlotTooltip(slotElement, dayIndex, timeIndex) {
  console.log("=== TOOLTIP DEBUG START ===");
  console.log("Tooltip Debug:", {
    hasTooltipElement: !!DOM_ELEMENTS.slotTooltip,
    compareMode: state.compareMode,
    selectedCount: state.selectedUserIds.size,
    selectedUserIds: Array.from(state.selectedUserIds),
    dayIndex,
    timeIndex,
  });

  if (!DOM_ELEMENTS.slotTooltip) {
    console.log("❌ No tooltip element found");
    return;
  }

  if (!state.compareMode) {
    console.log("❌ Not in compare mode");
    handleHideSlotTooltip();
    return;
  }

  if (state.selectedUserIds.size === 0) {
    console.log("❌ No users selected for comparison");
    handleHideSlotTooltip();
    return;
  }

  const message = generateTooltipMessage(dayIndex, timeIndex, state);
  console.log("✅ Generated tooltip message:", message);

  if (!message) {
    handleHideSlotTooltip();
    return;
  }

  // Set content first
  DOM_ELEMENTS.slotTooltip.textContent = message;

  // Remove any existing classes and reset styles for measurement
  DOM_ELEMENTS.slotTooltip.classList.remove("visible");

  // Force the tooltip to be measurable by temporarily overriding all CSS
  const originalStyles = {
    display: DOM_ELEMENTS.slotTooltip.style.display,
    visibility: DOM_ELEMENTS.slotTooltip.style.visibility,
    position: DOM_ELEMENTS.slotTooltip.style.position,
    left: DOM_ELEMENTS.slotTooltip.style.left,
    top: DOM_ELEMENTS.slotTooltip.style.top,
    opacity: DOM_ELEMENTS.slotTooltip.style.opacity,
    transform: DOM_ELEMENTS.slotTooltip.style.transform,
  };

  // Override all styles for measurement
  Object.assign(DOM_ELEMENTS.slotTooltip.style, {
    display: "block",
    visibility: "hidden",
    position: "absolute",
    left: "-9999px",
    top: "-9999px",
    opacity: "0",
    transform: "none",
    maxWidth: "250px",
    whiteSpace: "pre-line",
    wordWrap: "break-word",
    padding: "8px 12px",
    fontSize: "0.875rem",
    lineHeight: "1.4",
  });

  // Force a reflow and get measurements
  DOM_ELEMENTS.slotTooltip.offsetHeight; // Force reflow
  const tooltipHeight = DOM_ELEMENTS.slotTooltip.offsetHeight;
  const tooltipWidth = DOM_ELEMENTS.slotTooltip.offsetWidth;

  console.log("🔍 Measurement debug:", {
    offsetHeight: tooltipHeight,
    offsetWidth: tooltipWidth,
    textContent: DOM_ELEMENTS.slotTooltip.textContent.substring(0, 50),
    hasContent: !!DOM_ELEMENTS.slotTooltip.textContent,
  });

  // Get slot position
  const rect = slotElement.getBoundingClientRect();
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;

  // Use fallback dimensions if measurement failed
  const finalWidth = tooltipWidth > 0 ? tooltipWidth : 200;
  const finalHeight = tooltipHeight > 0 ? tooltipHeight : 50;

  // Calculate position (centered horizontally, above the slot)
  let left = rect.left + scrollX + rect.width / 2 - finalWidth / 2;
  let top = rect.top + scrollY - finalHeight - 10;

  // Keep tooltip within viewport bounds
  const viewportWidth = window.innerWidth;
  if (left < 5) left = 5;
  if (left + finalWidth > viewportWidth - 5) {
    left = viewportWidth - finalWidth - 5;
  }

  // If tooltip would go above viewport, show it below the slot instead
  if (top < 5) {
    top = rect.bottom + scrollY + 10;
  }

  // Position the tooltip and make it visible - override all CSS
  Object.assign(DOM_ELEMENTS.slotTooltip.style, {
    left: `${left}px`,
    top: `${top}px`,
    position: "absolute",
    display: "block",
    visibility: "visible",
    opacity: "1",
    zIndex: "9999",
    transform: "none",
    // Apply all the styling directly to override CSS conflicts
    background: "rgba(0, 0, 0, 0.9)",
    color: "white",
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "0.875rem",
    lineHeight: "1.4",
    whiteSpace: "pre-line",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    maxWidth: "250px",
    wordWrap: "break-word",
    pointerEvents: "none",
  });

  DOM_ELEMENTS.slotTooltip.classList.add("visible");

  console.log("✅ Tooltip positioned:", {
    left: DOM_ELEMENTS.slotTooltip.style.left,
    top: DOM_ELEMENTS.slotTooltip.style.top,
    finalWidth,
    finalHeight,
    originalHeight: tooltipHeight,
    originalWidth: tooltipWidth,
    display: DOM_ELEMENTS.slotTooltip.style.display,
    visibility: DOM_ELEMENTS.slotTooltip.style.visibility,
    opacity: DOM_ELEMENTS.slotTooltip.style.opacity,
    isVisible: DOM_ELEMENTS.slotTooltip.classList.contains("visible"),
    element: DOM_ELEMENTS.slotTooltip,
  });
}

function handleHideSlotTooltip() {
  if (DOM_ELEMENTS.slotTooltip) {
    DOM_ELEMENTS.slotTooltip.style.display = "none";
    DOM_ELEMENTS.slotTooltip.classList.remove("visible");
  }
}

function handleExportCurrentUser() {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    return showModal({
      content: "Select an active user to export.",
      title: "Export Error",
    });
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
  navigator.clipboard
    .writeText(jsonToExport)
    .then(() =>
      showModal({
        content: `${currentUser.name}'s schedule copied!`,
        title: "Export Successful",
      })
    )
    .catch((err) => {
      console.error("Clipboard export error:", err);
      showModal({
        content: "Could not copy. See text area.",
        title: "Clipboard Error",
      });
      if (DOM_ELEMENTS.importTextArea)
        DOM_ELEMENTS.importTextArea.value = jsonToExport;
    });
}

function handleImportSchedule() {
  if (!DOM_ELEMENTS.importTextArea) return;
  const jsonInput = DOM_ELEMENTS.importTextArea.value.trim();
  if (!jsonInput)
    return showModal({
      content: "Paste JSON to import.",
      title: "Import Error",
    });

  try {
    const importedData = JSON.parse(jsonInput);
    // Validate imported structure
    if (
      !importedData.id ||
      !importedData.name ||
      !Array.isArray(importedData.schedule) ||
      !Array.isArray(importedData.timeSlots) // Expecting timeSlots now
    ) {
      throw new Error(
        "Invalid data format. Must include id, name, schedule array, and timeSlots array."
      );
    }
    // Further validation for schedule and timeSlots structure
    if (
      importedData.schedule.length !== 7 ||
      !importedData.schedule.every(
        (day) =>
          Array.isArray(day) && day.length === importedData.timeSlots.length
      )
    ) {
      throw new Error(
        "Schedule dimensions must be 7 days by number of timeSlots."
      );
    }
    if (
      !importedData.timeSlots.every(
        (slot) => slot.label && slot.start && slot.end
      )
    ) {
      throw new Error("Each timeSlot must have a label, start, and end time.");
    }

    state.users[importedData.id] = {
      // Directly assign/overwrite
      id: importedData.id,
      name: importedData.name,
      timeSlots: importedData.timeSlots,
      schedule: importedData.schedule,
    };
    saveStateToStorage();
    updateUI();
    DOM_ELEMENTS.importTextArea.value = "";
    showModal({
      content: `User "${importedData.name}" imported!`,
      title: "Import Complete",
    });
  } catch (e) {
    console.error("Import error:", e);
    showModal({
      content: `Import failed: ${e.message}`,
      title: "Import Failed",
    });
  }
}

function setupInputValidation() {
  if (DOM_ELEMENTS.userNameInput)
    DOM_ELEMENTS.userNameInput.addEventListener(
      "input",
      (e) => (e.target.value = e.target.value.replace(/[^a-zA-Z\s'-]/g, ""))
    );
  if (DOM_ELEMENTS.userIdInput)
    DOM_ELEMENTS.userIdInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
      if (e.target.value.length > 1)
        e.target.value = e.target.value.replace(/^0+/, "");
    });
}

function setupEventListeners() {
  if (DOM_ELEMENTS.addUserButton)
    DOM_ELEMENTS.addUserButton.addEventListener("click", handleAddNewUser);
  if (DOM_ELEMENTS.compareButton)
    DOM_ELEMENTS.compareButton.addEventListener(
      "click",
      handleToggleCompareMode
    );

  if (DOM_ELEMENTS.togglePinModeBtn)
    DOM_ELEMENTS.togglePinModeBtn.addEventListener(
      "click",
      handleTogglePinMode
    );

  if (DOM_ELEMENTS.exportButton)
    DOM_ELEMENTS.exportButton.addEventListener(
      "click",
      handleExportCurrentUser
    );
  if (DOM_ELEMENTS.importButton)
    DOM_ELEMENTS.importButton.addEventListener("click", handleImportSchedule);
  if (DOM_ELEMENTS.addNewTimeSlotBtn)
    DOM_ELEMENTS.addNewTimeSlotBtn.addEventListener(
      "click",
      handleAddNewTimeSlotClick
    );

  if (DOM_ELEMENTS.userListContainer) {
    DOM_ELEMENTS.userListContainer.addEventListener("click", (e) => {
      const userItemDiv = e.target.closest(".user-item");
      if (userItemDiv) {
        const userId = userItemDiv.dataset.userId;
        if (e.target.classList.contains("delete-btn")) {
          e.stopPropagation();
          handleDeleteUser(userId);
        } else if (userId) {
          state.compareMode
            ? handleToggleUserSelectionForCompare(userId)
            : handleSetActiveUser(userId);
        }
      }
    });
  }

  if (DOM_ELEMENTS.scheduleTable) {
    DOM_ELEMENTS.scheduleTable.addEventListener("click", (e) => {
      if (e.target.classList.contains("slot")) {
        const day = parseInt(e.target.dataset.day, 10),
          time = parseInt(e.target.dataset.time, 10);
        if (!isNaN(day) && !isNaN(time) && !state.compareMode)
          handleToggleScheduleSlot(day, time);
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseover", (e) => {
      console.log(
        "Mouseover event:",
        e.target,
        "Compare mode:",
        state.compareMode,
        "Has slot class:",
        e.target.classList.contains("slot")
      );
      if (state.compareMode && e.target.classList.contains("slot")) {
        const day = parseInt(e.target.dataset.day, 10),
          time = parseInt(e.target.dataset.time, 10);
        console.log("Showing tooltip for day:", day, "time:", time);
        if (!isNaN(day) && !isNaN(time))
          handleShowSlotTooltip(e.target, day, time);
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseout", (e) => {
      if (
        e.target.classList.contains("slot") ||
        e.target === DOM_ELEMENTS.scheduleTable
      )
        handleHideSlotTooltip();
    });

    // Touch event support for mobile devices
    DOM_ELEMENTS.scheduleTable.addEventListener("touchstart", (e) => {
      if (state.compareMode && e.target.classList.contains("slot")) {
        e.preventDefault(); // Prevent default touch behavior
        const day = parseInt(e.target.dataset.day, 10),
          time = parseInt(e.target.dataset.time, 10);
        if (!isNaN(day) && !isNaN(time))
          handleShowSlotTooltip(e.target, day, time);
      }
    });

    DOM_ELEMENTS.scheduleTable.addEventListener("touchend", (e) => {
      if (
        e.target.classList.contains("slot") ||
        e.target === DOM_ELEMENTS.scheduleTable
      ) {
        // Hide tooltip after a delay to allow reading
        setTimeout(() => {
          handleHideSlotTooltip();
        }, 4000);
      }
    });

    // Hide tooltip when touching elsewhere on the document
    document.addEventListener("touchstart", (e) => {
      if (
        state.compareMode &&
        !e.target.closest("#scheduleTable") &&
        !e.target.closest("#slotTooltip")
      ) {
        handleHideSlotTooltip();
      }
    });
  }
}

/* ================================
   INITIALIZATION
================================== */
function initializeApp() {
  initializeDomElements();

  // Create tooltip if it doesn't exist
  if (!DOM_ELEMENTS.slotTooltip) {
    const tooltip = document.createElement("div");
    tooltip.id = "slotTooltip";
    tooltip.className = "slot-tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
    DOM_ELEMENTS.slotTooltip = tooltip;
    console.log("Tooltip element created dynamically");
  }

  initModal(DOM_ELEMENTS);
  loadStateFromStorage();
  setupInputValidation();
  setupEventListeners();
  updateUI();
}

document.addEventListener("DOMContentLoaded", initializeApp);
