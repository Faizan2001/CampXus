// js/script.js

// --- Module Imports ---
import { DEFAULT_TIMESLOTS, LOCAL_STORAGE_KEY } from "./constants.js";
import { DOM_ELEMENTS, initializeDomElements } from "./domElements.js";
import { initModal, showModal } from "./modal.js";
import {
  parseTime,
  isTimeBefore,
  convertToHHMM,
  isValidTimeFormat,
  isValidStrictHHMMTimeFormat,
  createUnifiedSchedule,
} from "./timeUtils.js";
import {
  handleExportCurrentUser,
  handleImportSchedule,
  setupExportImportListeners,
} from "./export-import.js";
import { authManager } from "../firebase/auth/auth-manager.js";
import { dataManager } from "./data-manager.js";

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
   UTILITY FUNCTIONS
================================== */

/**
 * Detects if the user is on a mobile device or tablet.
 * This helps us show appropriate UI elements only when needed.
 * @returns {boolean} True if on mobile/tablet, false if on desktop
 */
function isMobileOrTablet() {
  // Check for common mobile/tablet user agents
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;

  // Check for mobile/tablet patterns in user agent
  const mobileRegex =
    /android|blackberry|iphone|ipad|ipod|opera mini|iemobile|wpdesktop/i;

  // Also check screen width as a fallback (tablets/phones typically under 1024px)
  const isSmallScreen = window.innerWidth <= 1024;

  // Check for touch capability (mobile devices typically have touch)
  const hasTouchScreen =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Return true if any mobile indicators are present
  return mobileRegex.test(userAgent) || (isSmallScreen && hasTouchScreen);
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
    const slotInfo = Array(7)
      .fill(null)
      .map(() =>
        Array(userTimeSlots.length)
          .fill(null)
          .map(() => ({ courseCode: "", classroomNumber: "" }))
      );
    return {
      id: userId,
      name: name,
      timeSlots: userTimeSlots,
      schedule: schedule,
      pinnedSlots: pinnedSlots, // <-- ADD THIS
      slotInfo: slotInfo, // <-- ADD SLOT INFORMATION MATRIX
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

  if (compareMode && selectedUserIds.size > 0) {
    // Create unified schedule for heterogeneous comparison
    const selectedUsers = Array.from(selectedUserIds)
      .map((id) => users[id])
      .filter((user) => user);

    if (selectedUsers.length === 0) {
      return "slot";
    }

    // Check if we need unified schedule (users have different time structures)
    // Only use unified schedule if all users have timeSlots defined
    const allUsersHaveTimeSlots = selectedUsers.every(
      (user) => user.timeSlots && Array.isArray(user.timeSlots)
    );

    const needsUnifiedSchedule =
      allUsersHaveTimeSlots &&
      selectedUsers.some((user) => {
        const firstUserTimeSlots = selectedUsers[0].timeSlots;
        return (
          user.timeSlots.length !== firstUserTimeSlots.length ||
          user.timeSlots.some(
            (slot, idx) =>
              !firstUserTimeSlots[idx] ||
              slot.start !== firstUserTimeSlots[idx].start ||
              slot.end !== firstUserTimeSlots[idx].end
          )
        );
      });

    if (needsUnifiedSchedule) {
      // Use UnifiedSchedule for heterogeneous time structures
      const unifiedSchedule = createUnifiedSchedule(selectedUsers);

      if (timeIndex >= unifiedSchedule.unifiedTimeSlots.length) {
        return "slot-partial"; // Slot doesn't exist in unified schedule
      }

      const status = unifiedSchedule.getSlotStatus(dayIndex, timeIndex);

      if (status.busy.length === 0 && status.unavailable.length === 0) {
        return "slot-free"; // All users are available
      } else if (
        status.busy.length === status.total &&
        status.unavailable.length === 0
      ) {
        return "slot-conflict"; // All users are busy
      } else {
        return "slot-partial"; // Mixed availability or some users don't have this slot
      }
    } else {
      // Fall back to original logic for homogeneous schedules
      let busyCount = 0;
      let allUsersHaveSlot = true;

      selectedUserIds.forEach((id) => {
        const user = users[id];
        if (user && user.schedule && user.schedule[dayIndex]) {
          if (timeIndex < user.schedule[dayIndex].length) {
            if (user.schedule[dayIndex][timeIndex]) {
              busyCount++;
            }
          } else {
            allUsersHaveSlot = false;
          }
        } else {
          allUsersHaveSlot = false;
        }
      });

      if (!allUsersHaveSlot && selectedUserIds.size > 0) {
        return "slot-partial";
      }

      if (busyCount === 0 && selectedUserIds.size > 0) return "slot-free";
      if (busyCount === selectedUserIds.size) return "slot-conflict";
      if (selectedUserIds.size > 0) return "slot-partial";
    }
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
  const { users, selectedUserIds, compareMode } = currentState;
  if (selectedUserIds.size === 0) return "";

  // Check if we need unified schedule approach for heterogeneous comparison
  const selectedUsers = Array.from(selectedUserIds)
    .map((id) => users[id])
    .filter((user) => user);

  if (selectedUsers.length === 0) return "";

  const allUsersHaveTimeSlots = selectedUsers.every(
    (user) => user.timeSlots && Array.isArray(user.timeSlots)
  );

  const needsUnifiedSchedule =
    allUsersHaveTimeSlots &&
    selectedUsers.some((user) => {
      const firstUserTimeSlots = selectedUsers[0].timeSlots;
      return (
        user.timeSlots.length !== firstUserTimeSlots.length ||
        user.timeSlots.some(
          (slot, idx) =>
            !firstUserTimeSlots[idx] ||
            slot.start !== firstUserTimeSlots[idx].start ||
            slot.end !== firstUserTimeSlots[idx].end
        )
      );
    });

  if (needsUnifiedSchedule) {
    // Use UnifiedSchedule for heterogeneous tooltip generation
    const unifiedSchedule = createUnifiedSchedule(selectedUsers);

    if (timeIndex >= unifiedSchedule.unifiedTimeSlots.length) {
      return "Time slot not available in unified schedule";
    }

    const status = unifiedSchedule.getSlotStatus(dayIndex, timeIndex);
    return unifiedSchedule._generateTooltip(status);
  } else {
    // Fall back to original logic for homogeneous schedules
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
}

/**
 * Aggregates pin information for a specific slot across multiple users in compare mode
 * @param {number} dayIndex - Day index (0-6)
 * @param {number} timeIndex - Time slot index
 * @param {Object} currentState - Current application state
 * @returns {Object} Pin aggregation data: { count: number, userNames: string[], userIds: string[] }
 */
export function aggregatePinsForCompareMode(dayIndex, timeIndex, currentState) {
  const { users, selectedUserIds, compareMode } = currentState;

  // Debug logging
  console.log(`Aggregating pins for slot [${dayIndex}, ${timeIndex}]`, {
    compareMode,
    selectedUserIds: Array.from(selectedUserIds),
    usersCount: Object.keys(users).length,
  });

  // Only aggregate pins in compare mode with selected users
  if (!compareMode || selectedUserIds.size === 0) {
    console.log("Early return: not in compare mode or no selected users");
    return { count: 0, userNames: [], userIds: [] };
  }

  const pinnedByUsers = [];
  const pinnedUserNames = [];

  selectedUserIds.forEach((userId) => {
    const user = users[userId];
    console.log(`Checking user ${userId}:`, {
      userExists: !!user,
      hasPinnedSlots: !!(user && user.pinnedSlots),
      hasDayData: !!(user && user.pinnedSlots && user.pinnedSlots[dayIndex]),
      slotValue:
        user &&
        user.pinnedSlots &&
        user.pinnedSlots[dayIndex] &&
        user.pinnedSlots[dayIndex][timeIndex],
    });

    if (
      user &&
      user.pinnedSlots &&
      user.pinnedSlots[dayIndex] &&
      user.pinnedSlots[dayIndex][timeIndex] === true
    ) {
      pinnedByUsers.push(userId);
      pinnedUserNames.push(user.name);
      console.log(`User ${user.name} has pinned this slot`);
    }
  });

  const result = {
    count: pinnedByUsers.length,
    userNames: pinnedUserNames,
    userIds: pinnedByUsers,
  };

  console.log("Aggregation result:", result);
  return result;
}

/* ================================
   TIME-BASED PIN PERSISTENCE SYSTEM
================================== */

/**
 * Converts pin data from slot indices to time-based format for persistence across different schedule structures
 * @param {Object} user - User object with pinnedSlots array
 * @returns {Object} Time-based pins { dayIndex: [{ start: "HH:MM", end: "HH:MM", pinned: true }] }
 */
export function convertPinsToTimeBased(user) {
  if (!user || !user.pinnedSlots || !user.timeSlots) {
    return {};
  }

  const timeBasedPins = {};

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    if (user.pinnedSlots[dayIndex]) {
      timeBasedPins[dayIndex] = [];

      for (
        let slotIndex = 0;
        slotIndex < user.pinnedSlots[dayIndex].length;
        slotIndex++
      ) {
        if (
          user.pinnedSlots[dayIndex][slotIndex] &&
          user.timeSlots[slotIndex]
        ) {
          const timeSlot = user.timeSlots[slotIndex];
          timeBasedPins[dayIndex].push({
            start: timeSlot.start,
            end: timeSlot.end,
            label: timeSlot.label,
            pinned: true,
          });
        }
      }
    }
  }

  return timeBasedPins;
}

/**
 * Converts time-based pins back to slot indices for the user's current schedule structure
 * @param {Object} timeBasedPins - Time-based pin data
 * @param {Object} user - User object with current timeSlots structure
 * @returns {Array} Updated pinnedSlots array
 */
export function convertPinsFromTimeBased(timeBasedPins, user) {
  if (!user || !user.timeSlots || !timeBasedPins) {
    return user.pinnedSlots || [];
  }

  const newPinnedSlots = Array.from({ length: 7 }, () =>
    Array.from({ length: user.timeSlots.length }, () => false)
  );

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    if (timeBasedPins[dayIndex]) {
      for (const pinnedTime of timeBasedPins[dayIndex]) {
        // Find matching time slot in user's current schedule
        const matchingSlotIndex = user.timeSlots.findIndex(
          (slot) =>
            slot.start === pinnedTime.start && slot.end === pinnedTime.end
        );

        if (matchingSlotIndex >= 0 && pinnedTime.pinned) {
          newPinnedSlots[dayIndex][matchingSlotIndex] = true;
        }
      }
    }
  }

  return newPinnedSlots;
}

/**
 * Enhanced aggregation for compare mode that uses time-based pin mapping
 * @param {number} dayIndex - Day index (0-6)
 * @param {number} timeIndex - Time slot index in unified schedule
 * @param {Object} currentState - Current application state
 * @returns {Object} Pin aggregation data with time-aware mapping
 */
export function aggregatePinsForCompareModeTimeBased(
  dayIndex,
  timeIndex,
  currentState
) {
  const { users, selectedUserIds, compareMode } = currentState;

  if (!compareMode || selectedUserIds.size === 0) {
    return { count: 0, userNames: [], userIds: [] };
  }

  // Get the unified schedule to map timeIndex to actual time range
  const selectedUsers = Array.from(selectedUserIds)
    .map((id) => users[id])
    .filter((user) => user);

  if (selectedUsers.length === 0) {
    return { count: 0, userNames: [], userIds: [] };
  }

  // Check if we need unified schedule approach
  const allUsersHaveTimeSlots = selectedUsers.every(
    (user) => user.timeSlots && Array.isArray(user.timeSlots)
  );

  const needsUnifiedSchedule =
    allUsersHaveTimeSlots &&
    selectedUsers.some((user) => {
      const firstUserTimeSlots = selectedUsers[0].timeSlots;
      return (
        user.timeSlots.length !== firstUserTimeSlots.length ||
        user.timeSlots.some(
          (slot, idx) =>
            !firstUserTimeSlots[idx] ||
            slot.start !== firstUserTimeSlots[idx].start ||
            slot.end !== firstUserTimeSlots[idx].end
        )
      );
    });

  const pinnedByUsers = [];
  const pinnedUserNames = [];

  if (needsUnifiedSchedule) {
    // Use time-based mapping for heterogeneous schedules
    const unifiedSchedule = createUnifiedSchedule(selectedUsers);

    if (timeIndex >= unifiedSchedule.unifiedTimeSlots.length) {
      return { count: 0, userNames: [], userIds: [] };
    }

    const targetTimeSlot = unifiedSchedule.unifiedTimeSlots[timeIndex];

    selectedUserIds.forEach((userId) => {
      const user = users[userId];
      if (!user || !user.timeSlots) return;

      // Convert user's pins to time-based format
      const timeBasedPins = convertPinsToTimeBased(user);

      if (timeBasedPins[dayIndex]) {
        // Check if any of user's pinned time slots overlap with target time slot
        const hasMatchingPin = timeBasedPins[dayIndex].some((pinnedTime) => {
          // Check for overlap between pinned time and target time slot
          const pinnedStart = parseTime(pinnedTime.start);
          const pinnedEnd = parseTime(pinnedTime.end);
          const targetStart = parseTime(targetTimeSlot.start);
          const targetEnd = parseTime(targetTimeSlot.end);

          return (
            pinnedStart < targetEnd &&
            pinnedEnd > targetStart &&
            pinnedTime.pinned
          );
        });

        if (hasMatchingPin) {
          pinnedByUsers.push(userId);
          pinnedUserNames.push(user.name);
        }
      }
    });
  } else {
    // Use original array-based approach for homogeneous schedules
    selectedUserIds.forEach((userId) => {
      const user = users[userId];
      if (
        user &&
        user.pinnedSlots &&
        user.pinnedSlots[dayIndex] &&
        user.pinnedSlots[dayIndex][timeIndex] === true
      ) {
        pinnedByUsers.push(userId);
        pinnedUserNames.push(user.name);
      }
    });
  }

  return {
    count: pinnedByUsers.length,
    userNames: pinnedUserNames,
    userIds: pinnedByUsers,
  };
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
        "Invalid time format. Use HH:MM or H:MM AM/PM (e.g., '08:00', '5:30 PM').",
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

  // Check for overlap with existing time slots
  for (let i = 0; i < user.timeSlots.length; i++) {
    const existingSlot = user.timeSlots[i];

    // Check if new slot overlaps with existing slot
    // Overlap occurs if:
    // 1. New start is before existing end AND new end is after existing start
    const newStartMinutes = parseTime(hhmmStartTime);
    const newEndMinutes = parseTime(hhmmEndTime);
    const existingStartMinutes = parseTime(existingSlot.start);
    const existingEndMinutes = parseTime(existingSlot.end);

    if (
      newStartMinutes < existingEndMinutes &&
      newEndMinutes > existingStartMinutes
    ) {
      showModal({
        content: `The time slot ${newSlotLabel} overlaps with existing slot ${existingSlot.label}. New time slots must not overlap with existing ones.`,
        title: "Time Slot Overlap",
      });
      return false;
    }
  }

  // Check that new slot starts after the last existing slot
  if (user.timeSlots.length > 0) {
    // Find the slot with the latest end time
    const latestEndTime = user.timeSlots.reduce((latest, slot) => {
      const latestMinutes = parseTime(latest);
      const slotEndMinutes = parseTime(slot.end);
      return slotEndMinutes > latestMinutes ? slot.end : latest;
    }, "00:00");

    if (!isTimeBefore(latestEndTime, hhmmStartTime)) {
      showModal({
        content: `New time slot must start after the last existing slot ends (${latestEndTime}). Please choose a start time after ${latestEndTime}.`,
        title: "Invalid Time Slot Position",
      });
      return false;
    }
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
  // Expand the slotInfo matrix for the new slot
  if (!user.slotInfo) {
    user.slotInfo = Array(7)
      .fill(null)
      .map(() =>
        Array(user.timeSlots.length - 1)
          .fill(null)
          .map(() => ({ courseCode: "", classroomNumber: "" }))
      );
  }
  user.slotInfo.forEach((daySlotInfo) => {
    daySlotInfo.push({ courseCode: "", classroomNumber: "" });
  });

  // Migrate pins to preserve pin intentions when schedule structure changes
  migratePinsToTimeBased(user);

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
    // Trigger glow effect for visual feedback
    if (!state.activeUserId) {
      // Check if users exist to determine which glow to trigger
      const totalUserCount = Object.keys(state.users).length;

      if (totalUserCount === 0) {
        // No users exist - trigger add user button glow
        triggerAddUserGlow();
      } else {
        // Users exist but no active user - trigger users section glow
        triggerUsersSectionGlow();
      }
    }
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

  const newPinState = !activeUserObject.pinnedSlots[dayIndex][slotIndex];
  activeUserObject.pinnedSlots[dayIndex][slotIndex] = newPinState;

  // Update time-based pins for persistence across schedule changes
  updateTimeBasedPin(activeUserObject, dayIndex, slotIndex, newPinState);

  console.log(
    `Slot (${dayIndex}, ${slotIndex}) for user ${activeUserObject.id} pinned state: ${newPinState}`
  );

  saveStateToStorage();
  updateUI();
}

/**
 * Shows a modal to edit course information for an existing busy slot
 * @param {number} dayIndex - Day index (0-6)
 * @param {number} timeIndex - Time slot index
 * @param {Object} user - User object
 */
function showEditSlotInfoModal(dayIndex, timeIndex, user) {
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayName = daysOfWeek[dayIndex];
  const timeSlot = user.timeSlots[timeIndex];

  // Get existing slot info
  const existingInfo =
    user.slotInfo &&
    user.slotInfo[dayIndex] &&
    user.slotInfo[dayIndex][timeIndex]
      ? user.slotInfo[dayIndex][timeIndex]
      : { courseCode: "", classroomNumber: "" };

  const modalContent = `
    <div class="slot-info-form">
      <p><strong>Day:</strong> ${dayName}</p>
      <p><strong>Time:</strong> ${timeSlot.label}</p>
      <div class="form-group">
        <label for="editCourseCodeInput">Course Code:</label>
        <input type="text" id="editCourseCodeInput" class="modal-input" 
               value="${existingInfo.courseCode}" 
               placeholder="e.g., CS101, MATH202"
               maxlength="20">
      </div>
      <div class="form-group">
        <label for="editClassroomInput">Classroom:</label>
        <input type="text" id="editClassroomInput" class="modal-input" 
               value="${existingInfo.classroomNumber}" 
               placeholder="e.g., Room 101, Lab A"
               maxlength="20">
        <small>Enter classroom/location (optional)</small>
      </div>
      <div id="edit-slot-info-error" class="modal-error-message" style="display: none;"></div>
    </div>
  `;

  showModal({
    title: "Edit Slot Information",
    content: modalContent,
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Save Slot",
    cancelText: "Delete Slot",
    onConfirm: () => {
      const courseCodeInput = document.getElementById("editCourseCodeInput");
      const classroomInput = document.getElementById("editClassroomInput");

      if (courseCodeInput && classroomInput) {
        const courseCode = courseCodeInput.value.trim().toUpperCase();
        const classroomNumber = classroomInput.value.trim();

        // Validate course code format if provided
        if (courseCode && !/^[A-Z0-9\s]{1,20}$/i.test(courseCode)) {
          const errorDiv = document.getElementById("edit-slot-info-error");
          if (errorDiv) {
            errorDiv.textContent =
              "Course code should only contain letters, numbers, and spaces (max 20 characters)";
            errorDiv.style.display = "block";
          }
          return false;
        }

        // Initialize slotInfo structure if needed
        if (!user.slotInfo) {
          user.slotInfo = Array(7)
            .fill(null)
            .map(() =>
              Array(user.timeSlots.length)
                .fill(null)
                .map(() => ({ courseCode: "", classroomNumber: "" }))
            );
        }

        // Store updated slot information
        if (!user.slotInfo[dayIndex]) {
          user.slotInfo[dayIndex] = Array(user.timeSlots.length)
            .fill(null)
            .map(() => ({ courseCode: "", classroomNumber: "" }));
        }
        if (!user.slotInfo[dayIndex][timeIndex]) {
          user.slotInfo[dayIndex][timeIndex] = {
            courseCode: "",
            classroomNumber: "",
          };
        }

        user.slotInfo[dayIndex][timeIndex] = {
          courseCode: courseCode,
          classroomNumber: classroomNumber,
        };

        saveStateToStorage();
        updateUI();
        return true;
      }
      return false;
    },
    onCancel: () => {
      // "Delete Slot" functionality
      showModal({
        title: "Delete Slot",
        content: `Are you sure you want to delete this slot and mark it as free?\n\nDay: ${dayName}\nTime: ${timeSlot.label}`,
        showConfirmationButtons: true,
        confirmText: "Delete",
        cancelText: "Cancel",
        onConfirm: () => {
          // Mark slot as free
          const newSchedule = toggleSlotInSchedule(
            dayIndex,
            timeIndex,
            user.schedule
          );
          user.schedule = newSchedule;

          // Clear slot information
          if (
            user.slotInfo &&
            user.slotInfo[dayIndex] &&
            user.slotInfo[dayIndex][timeIndex]
          ) {
            user.slotInfo[dayIndex][timeIndex] = {
              courseCode: "",
              classroomNumber: "",
            };
          }

          // If the slot was pinned, unpin it
          if (
            user.pinnedSlots &&
            Array.isArray(user.pinnedSlots[dayIndex]) &&
            user.pinnedSlots[dayIndex][timeIndex] === true
          ) {
            user.pinnedSlots[dayIndex][timeIndex] = false;
            console.log(
              `Slot (${dayIndex}, ${timeIndex}) for user ${user.id} automatically unpinned because it was deleted.`
            );
          }

          saveStateToStorage();
          updateUI();
          return true;
        },
      });
      return true; // Close the edit modal
    },
  });
}

/**
 * Shows a modal to input course information when marking a slot as busy
 * @param {number} dayIndex - Day index (0-6)
 * @param {number} timeIndex - Time slot index
 * @param {Object} user - User object
 */
function showSlotInfoModal(dayIndex, timeIndex, user) {
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayName = daysOfWeek[dayIndex];
  const timeSlot = user.timeSlots[timeIndex];

  // Get existing slot info if any
  const existingInfo =
    user.slotInfo &&
    user.slotInfo[dayIndex] &&
    user.slotInfo[dayIndex][timeIndex]
      ? user.slotInfo[dayIndex][timeIndex]
      : { courseCode: "", classroomNumber: "" };

  const modalContent = `
    <div class="slot-info-form">
      <p><strong>Day:</strong> ${dayName}</p>
      <p><strong>Time:</strong> ${timeSlot.label}</p>
      <div class="form-group">
        <label for="courseCodeInput">Course Code:</label>
        <input type="text" id="courseCodeInput" class="modal-input" 
               value="${existingInfo.courseCode}" 
               placeholder="e.g., CS101, MATH202"
               maxlength="20">
      </div>
      <div class="form-group">
        <label for="classroomInput">Classroom:</label>
        <input type="text" id="classroomInput" class="modal-input" 
               value="${existingInfo.classroomNumber}" 
               placeholder="e.g., Room 101, Lab A"
               maxlength="20">
        <small>Enter classroom/location (optional)</small>
      </div>
      <div id="slot-info-error" class="modal-error-message" style="display: none;"></div>
    </div>
  `;

  showModal({
    title: "Mark Slot as Busy",
    content: modalContent,
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Save",
    cancelText: "Cancel",
    onConfirm: () => {
      const courseCodeInput = document.getElementById("courseCodeInput");
      const classroomInput = document.getElementById("classroomInput");

      if (courseCodeInput && classroomInput) {
        const courseCode = courseCodeInput.value.trim().toUpperCase();
        const classroomNumber = classroomInput.value.trim();

        // Validate course code format if provided
        if (courseCode && !/^[A-Z0-9\s]{1,20}$/i.test(courseCode)) {
          const errorDiv = document.getElementById("slot-info-error");
          if (errorDiv) {
            errorDiv.textContent =
              "Course code should only contain letters, numbers, and spaces (max 20 characters)";
            errorDiv.style.display = "block";
          }
          return false; // Prevent modal close
        }

        // Mark slot as busy
        const newSchedule = toggleSlotInSchedule(
          dayIndex,
          timeIndex,
          user.schedule
        );
        user.schedule = newSchedule;

        // Initialize slotInfo structure if needed
        if (!user.slotInfo) {
          user.slotInfo = Array(7)
            .fill(null)
            .map(() =>
              Array(user.timeSlots.length)
                .fill(null)
                .map(() => ({ courseCode: "", classroomNumber: "" }))
            );
        }

        // Store slot information
        if (!user.slotInfo[dayIndex]) {
          user.slotInfo[dayIndex] = Array(user.timeSlots.length)
            .fill(null)
            .map(() => ({ courseCode: "", classroomNumber: "" }));
        }
        if (!user.slotInfo[dayIndex][timeIndex]) {
          user.slotInfo[dayIndex][timeIndex] = {
            courseCode: "",
            classroomNumber: "",
          };
        }

        user.slotInfo[dayIndex][timeIndex] = {
          courseCode: courseCode,
          classroomNumber: classroomNumber,
        };

        // If the slot was pinned, unpin it
        if (
          user.pinnedSlots &&
          Array.isArray(user.pinnedSlots[dayIndex]) &&
          user.pinnedSlots[dayIndex][timeIndex] === true
        ) {
          user.pinnedSlots[dayIndex][timeIndex] = false;
          console.log(
            `Slot (${dayIndex}, ${timeIndex}) for user ${user.id} automatically unpinned because it became busy.`
          );
        }

        saveStateToStorage();
        updateUI();
        return true; // Allow modal to close
      }
      return false;
    },
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

      // Migrate existing pins to time-based format for cross-user compatibility
      migratePinsToTimeBased(user);
    });
    state.users = loadedUsers;
  }
}

function saveStateToStorage() {
  const dataToSave = { users: state.users };
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
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

  // Migrate pins to preserve pin intentions when schedule structure changes
  migratePinsToTimeBased(activeUserObject);

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

  // Apply disabled state when no active user is selected AND not in compare mode
  const scheduleWrapper = DOM_ELEMENTS.scheduleWrapper;
  if (scheduleWrapper) {
    if (!state.activeUserId && !state.compareMode) {
      scheduleWrapper.classList.add("schedule-disabled");
    } else {
      scheduleWrapper.classList.remove("schedule-disabled");
    }
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
    // Compare mode - check if we need unified schedule
    const selectedUsers = Array.from(state.selectedUserIds)
      .map((id) => state.users[id])
      .filter((user) => user);

    if (selectedUsers.length > 0) {
      // Check if users have different time structures
      const needsUnifiedSchedule = selectedUsers.some((user) => {
        const firstUserTimeSlots = selectedUsers[0].timeSlots;
        return (
          !user.timeSlots ||
          user.timeSlots.length !== firstUserTimeSlots.length ||
          user.timeSlots.some(
            (slot, idx) =>
              !firstUserTimeSlots[idx] ||
              slot.start !== firstUserTimeSlots[idx].start ||
              slot.end !== firstUserTimeSlots[idx].end
          )
        );
      });

      if (needsUnifiedSchedule) {
        // Use unified schedule for heterogeneous comparison
        const unifiedSchedule = createUnifiedSchedule(selectedUsers);
        currentTimeSlotsToRender = unifiedSchedule.unifiedTimeSlots;
      } else {
        // Use first user's time slots for homogeneous comparison
        currentTimeSlotsToRender =
          selectedUsers[0].timeSlots || DEFAULT_TIMESLOTS;
      }
    } else {
      currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
    }

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

  // Apply dynamic styling based on number of time slots
  const slotCount = currentTimeSlotsToRender.length;
  const scheduleTable = DOM_ELEMENTS.scheduleTable;

  // Use a more intelligent threshold - consider both slot count and compare mode
  const shouldUseManySlots =
    slotCount > 8 || (state.compareMode && slotCount > 6);

  if (shouldUseManySlots) {
    // Many slots detected - apply flexible width styling
    scheduleTable.classList.add("many-slots");
    console.log(
      `Many slots detected (${slotCount}), applying flexible width styling`
    );

    // Add a helpful message to the schedule header if it exists
    // Only show on mobile devices, not on desktop
    const scheduleHeader = document.querySelector(".schedule-header h3");
    const isMobileDevice = isMobileOrTablet();

    if (scheduleHeader && state.compareMode && isMobileDevice) {
      const existingNote =
        scheduleHeader.parentNode.querySelector(".many-slots-note");
      if (!existingNote) {
        const note = document.createElement("div");
        note.className = "many-slots-note";
        note.style.cssText =
          "font-size: 0.8rem; color: white; margin-top: 0.5rem; font-style: italic; font-weight: bold;";
        note.textContent = `Showing ${slotCount} time slots - scroll horizontally to view all`;
        scheduleHeader.parentNode.appendChild(note);
      } else {
        existingNote.textContent = `Showing ${slotCount} time slots - scroll horizontally to view all`;
      }
    }
  } else {
    // Normal slot count - use default styling
    scheduleTable.classList.remove("many-slots");

    // Remove the note if it exists
    const existingNote = document.querySelector(".many-slots-note");
    if (existingNote) {
      existingNote.remove();
    }
  }

  // Also remove the note if we're not in compare mode or not on mobile device
  // This ensures cleanup when conditions change
  if (!state.compareMode || !isMobileOrTablet()) {
    const existingNote = document.querySelector(".many-slots-note");
    if (existingNote) {
      existingNote.remove();
    }
  }

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
            ".pin-indicator, .can-pin-indicator, .pin-square-container"
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

      // --- START: Pin Rendering Logic for Compare Mode ---

      if (state.compareMode && state.selectedUserIds.size > 0) {
        console.log(
          `Rendering compare mode pins for slot [${dayIndex}, ${timeIndex}]`
        );

        // Clear any existing pin indicators first
        const existingPinIndicators = tdSlot.querySelectorAll(
          ".pin-indicator, .can-pin-indicator, .compare-pin-indicator, .pin-square-container"
        );
        existingPinIndicators.forEach((indicator) => indicator.remove());

        // Get pin aggregation data for this slot using time-based mapping
        const pinData = aggregatePinsForCompareModeTimeBased(
          dayIndex,
          timeIndex,
          state
        );

        console.log(`Pin data for slot [${dayIndex}, ${timeIndex}]:`, pinData);

        if (pinData.count > 0) {
          console.log(`Creating pin indicator for ${pinData.count} users`);

          // Create square background container
          const pinContainer = document.createElement("div");
          pinContainer.classList.add("pin-square-container");
          pinContainer.setAttribute("tabindex", "0");
          pinContainer.setAttribute("role", "button");
          pinContainer.setAttribute(
            "aria-label",
            `Pin indicator: ${pinData.count} user${
              pinData.count > 1 ? "s" : ""
            } pinned this slot`
          );

          // Create pin icon element
          const pinIcon = document.createElement("span");
          pinIcon.classList.add("pin-icon");
          pinIcon.innerHTML = "&#128204;"; // Pin icon

          // Create count element
          const pinCount = document.createElement("span");
          pinCount.classList.add("pin-count-number");
          pinCount.textContent = pinData.count;

          // Assemble the pin container
          pinContainer.appendChild(pinIcon);
          pinContainer.appendChild(pinCount);

          // Store pin data for tooltip handling
          pinContainer.dataset.pinnedByUsers = JSON.stringify(
            pinData.userNames
          );
          pinContainer.dataset.pinnedUserIds = JSON.stringify(pinData.userIds);
          pinContainer.dataset.pinCount = pinData.count;

          // Add click handler for showing pin tooltip
          pinContainer.addEventListener("click", (event) => {
            event.stopPropagation();
            showPinTooltip(event, pinData);
          });

          // Add keyboard support for accessibility
          pinContainer.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              showPinTooltip(event, pinData);
            }
          });

          tdSlot.appendChild(pinContainer);
          console.log(
            `Pin indicator added to slot [${dayIndex}, ${timeIndex}]`
          );
        } else {
          console.log(`No pins found for slot [${dayIndex}, ${timeIndex}]`);
        }
      }

      // --- END: Pin Rendering Logic for Compare Mode ---

      // --- START: Course Information Display ---
      if (
        !state.compareMode &&
        state.activeUserId &&
        state.users[state.activeUserId] &&
        state.users[state.activeUserId].schedule &&
        state.users[state.activeUserId].schedule[dayIndex] &&
        state.users[state.activeUserId].schedule[dayIndex][timeIndex] &&
        state.users[state.activeUserId].slotInfo &&
        state.users[state.activeUserId].slotInfo[dayIndex] &&
        state.users[state.activeUserId].slotInfo[dayIndex][timeIndex]
      ) {
        const slotInfo =
          state.users[state.activeUserId].slotInfo[dayIndex][timeIndex];
        const hasInfo = slotInfo.courseCode || slotInfo.classroomNumber;

        if (hasInfo) {
          const infoContainer = document.createElement("div");
          infoContainer.classList.add("slot-info-display");

          if (slotInfo.courseCode) {
            const courseSpan = document.createElement("span");
            courseSpan.classList.add("course-code");
            courseSpan.textContent = slotInfo.courseCode;
            infoContainer.appendChild(courseSpan);
          }

          if (slotInfo.classroomNumber) {
            const classroomSpan = document.createElement("span");
            classroomSpan.classList.add("classroom-number");
            classroomSpan.textContent = slotInfo.classroomNumber;
            infoContainer.appendChild(classroomSpan);
          }

          tdSlot.appendChild(infoContainer);
        }
      }
      // --- END: Course Information Display ---

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
    text = "Pin";
  } else if (isPinModeCurrentlyActive) {
    text = "ON";
  } else {
    text = "OFF";
  }

  return {
    isDisabled: !canEnablePinMode,
    isActiveClass: canEnablePinMode && isPinModeCurrentlyActive,
    text: text, // Simplified text for icon-based button
  };
}

/**
 * Triggers a glow effect on the add user button to guide user interaction
 * when they try to interact with the disabled schedule.
 */
function triggerAddUserGlow() {
  if (DOM_ELEMENTS.addUserButton) {
    // Remove any existing glow class
    DOM_ELEMENTS.addUserButton.classList.remove("add-user-glow");

    // Force reflow to ensure the class removal is processed
    DOM_ELEMENTS.addUserButton.offsetHeight;

    // Add the glow class to trigger the animation
    DOM_ELEMENTS.addUserButton.classList.add("add-user-glow");

    // Remove the class after animation completes (0.6s * 3 repetitions = 1.8s)
    setTimeout(() => {
      DOM_ELEMENTS.addUserButton.classList.remove("add-user-glow");
    }, 2000);
  }
}

/**
 * Triggers a glow effect on the users section to guide user interaction
 * when they try to interact with the disabled schedule and users exist.
 */
function triggerUsersSectionGlow() {
  console.log("triggerUsersSectionGlow called");
  console.log("DOM_ELEMENTS.usersSection:", DOM_ELEMENTS.usersSection);

  if (DOM_ELEMENTS.usersSection) {
    console.log("Users section found, applying glow effect");

    // Remove any existing glow class
    DOM_ELEMENTS.usersSection.classList.remove("users-section-glow");

    // Force reflow to ensure the class removal is processed
    DOM_ELEMENTS.usersSection.offsetHeight;

    // Add the glow class to trigger the animation
    DOM_ELEMENTS.usersSection.classList.add("users-section-glow");

    console.log("Glow class added to users section");

    // Remove the class after animation completes (0.6s * 3 repetitions = 1.8s)
    setTimeout(() => {
      DOM_ELEMENTS.usersSection.classList.remove("users-section-glow");
      console.log("Glow class removed from users section");
    }, 2000);
  } else {
    console.error("DOM_ELEMENTS.usersSection is null or undefined");
  }
}

function updateUI() {
  renderScheduleGrid();
  renderUserList();

  // Toggle pin-mode-active class on body for CSS styling
  document.body.classList.toggle("pin-mode-active", state.pinModeActive);

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

    // Update text while preserving the icon
    const icon = DOM_ELEMENTS.compareButton.querySelector("i");
    DOM_ELEMENTS.compareButton.innerHTML = "";
    if (icon) {
      DOM_ELEMENTS.compareButton.appendChild(icon);
    }
    DOM_ELEMENTS.compareButton.appendChild(
      document.createTextNode(compareButtonState.text)
    );
  }

  // --- START: Logic for Pin Mode Button ---
  if (DOM_ELEMENTS.togglePinModeBtn) {
    const pinModeBtnState = getPinModeButtonDynamicState(
      state.activeUserId,
      state.compareMode,
      state.pinModeActive
    );

    DOM_ELEMENTS.togglePinModeBtn.disabled = pinModeBtnState.isDisabled;

    // Handle the active class based on pin mode state
    if (pinModeBtnState.isActiveClass) {
      DOM_ELEMENTS.togglePinModeBtn.classList.add("pin-mode-active");
    } else {
      DOM_ELEMENTS.togglePinModeBtn.classList.remove("pin-mode-active");
    }

    // Update text content in the span element
    const textSpan =
      DOM_ELEMENTS.togglePinModeBtn.querySelector(".pin-btn-text");
    if (textSpan) {
      textSpan.textContent = pinModeBtnState.text;
    }
  }
  // --- END: Logic for Pin Mode Button ---
}

/* ================================
   EVENT HANDLERS & APP LOGIC
================================== */
function handleAddNewUser() {
  const addUserModalHTML = `
    <div class="add-user-form-content">
      <div class="input-group">
        <div class="input-wrapper">
          <i class="fas fa-user"></i>
          <input
            type="text"
            id="modalUserName"
            class="modal-input"
            placeholder="Enter your name"
            required
          />
        </div>
        <div class="input-wrapper">
          <i class="fas fa-id-card"></i>
          <input
            type="text"
            inputmode="numeric"
            id="modalUserId"
            class="modal-input"
            placeholder="Create a unique ID"
            required
          />
        </div>
      </div>
      <div id="add-user-error-message" class="modal-error-message" style="display:none;"></div>
    </div>
  `;

  showModal({
    content: addUserModalHTML,
    title: "Add New User",
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Add User",
    cancelText: "Cancel",
    onConfirm: () => {
      const nameInput = document.getElementById("modalUserName");
      const userIdInput = document.getElementById("modalUserId");
      const errorMessageElement = document.getElementById(
        "add-user-error-message"
      );

      if (nameInput && userIdInput && errorMessageElement) {
        const name = nameInput.value.trim();
        const userId = userIdInput.value.trim();

        // Reset error display
        errorMessageElement.style.display = "none";

        if (!name || !userId) {
          errorMessageElement.textContent = "Name and ID are required.";
          errorMessageElement.style.display = "block";
          return false; // Prevent modal close
        }

        // Validate user ID format (numbers only)
        if (!/^\d+$/.test(userId) || userId === "0" || userId.startsWith("0")) {
          errorMessageElement.textContent =
            "User ID must be a positive number without leading zeros.";
          errorMessageElement.style.display = "block";
          return false; // Prevent modal close
        }

        // Validate name format (letters, spaces, hyphens, apostrophes only)
        if (!/^[a-zA-Z\s'-]+$/.test(name)) {
          errorMessageElement.textContent =
            "Name can only contain letters, spaces, hyphens, and apostrophes.";
          errorMessageElement.style.display = "block";
          return false; // Prevent modal close
        }

        const newUserObject = createUserObject(name, userId, state.users);
        if (newUserObject) {
          state.users[userId] = newUserObject;
          handleSetActiveUser(userId);
          showModal({
            content: `User "${name}" (ID: ${userId}) has been added successfully!`,
            title: "User Added",
          });
          return true; // Allow modal to close
        } else {
          errorMessageElement.textContent = `User ID "${userId}" already exists. Please choose a different ID.`;
          errorMessageElement.style.display = "block";
          return false; // Prevent modal close
        }
      }
      console.error("Modal input fields not found.");
      return false; // Prevent close if elements are missing
    },
    onCancel: () => {
      console.log("Add user cancelled.");
    },
  });

  // Set up input validation for the modal inputs after a brief delay to ensure they're in DOM
  setTimeout(() => {
    const modalNameInput = document.getElementById("modalUserName");
    const modalUserIdInput = document.getElementById("modalUserId");

    if (modalNameInput) {
      modalNameInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z\s'-]/g, "");
      });
    }

    if (modalUserIdInput) {
      modalUserIdInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, "");
        if (e.target.value.length > 1) {
          e.target.value = e.target.value.replace(/^0+/, "");
        }
      });
    }
  }, 100);
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

      // Instead of replacing the entire state object, just mutate the existing properties
      // This preserves the reference that export-import.js is using
      delete state.users[userIdToDelete];

      if (oldActiveUserId === userIdToDelete) {
        state.activeUserId = null;
        state.pinModeActive = false; // Reset pin mode if the active user is deleted
      }

      state.selectedUserIds.delete(userIdToDelete);

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
  if (
    !state.activeUserId ||
    state.compareMode ||
    !state.users[state.activeUserId]
  ) {
    // No active user, in compare mode, or user doesn't exist: show visual feedback
    if (!state.activeUserId && !state.compareMode) {
      // Schedule is disabled - check if users exist to determine which glow to trigger
      const totalUserCount = Object.keys(state.users).length;

      if (totalUserCount === 0) {
        // No users exist - trigger add user button glow
        triggerAddUserGlow();
      } else {
        // Users exist but no active user - trigger users section glow
        triggerUsersSectionGlow();
      }
    }
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
    const isCurrentlyBusy = currentUser.schedule[dayIndex][timeIndex];

    if (!isCurrentlyBusy) {
      // Slot is currently free, show modal to mark as busy with course info
      showSlotInfoModal(dayIndex, timeIndex, currentUser);
    } else {
      // Slot is currently busy, show edit modal
      showEditSlotInfoModal(dayIndex, timeIndex, currentUser);
    }
  } else {
    // Log a warning if the slot path is invalid, helping with debugging.
    console.warn(
      `Attempted to toggle invalid slot or access invalid schedule structure: Day ${dayIndex}, Time ${timeIndex} for user ${state.activeUserId}. Schedule or slot may not exist.`
    );
  }
}

function handleShowSlotTooltip(slotElement, dayIndex, timeIndex) {
  if (!DOM_ELEMENTS.slotTooltip) {
    return;
  }

  if (!state.compareMode) {
    handleHideSlotTooltip();
    return;
  }

  if (state.selectedUserIds.size === 0) {
    handleHideSlotTooltip();
    return;
  }

  const message = generateTooltipMessage(dayIndex, timeIndex, state);

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
}

function handleHideSlotTooltip() {
  if (DOM_ELEMENTS.slotTooltip) {
    DOM_ELEMENTS.slotTooltip.style.display = "none";
    DOM_ELEMENTS.slotTooltip.classList.remove("visible");
  }
}

function setupInputValidation() {
  // Input validation is now handled within modal forms
  // when they are created, so this function can remain minimal
  // for any future fixed input fields that might be added
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

  // Export/Import event listeners are handled by setupExportImportListeners() from export-import.js
  if (DOM_ELEMENTS.addNewTimeSlotBtn)
    DOM_ELEMENTS.addNewTimeSlotBtn.addEventListener(
      "click",
      handleAddNewTimeSlotClick
    );

  // Schedule wrapper click handler for disabled state feedback
  if (DOM_ELEMENTS.scheduleWrapper) {
    DOM_ELEMENTS.scheduleWrapper.addEventListener("click", (e) => {
      // Only trigger glow if schedule is disabled and click wasn't on a control element
      if (
        DOM_ELEMENTS.scheduleWrapper.classList.contains("schedule-disabled") &&
        !e.target.closest("button") &&
        !e.target.closest(".add-timeslot-btn")
      ) {
        // Check if there are any users in the user list
        const totalUserCount = Object.keys(state.users).length;

        console.log("Schedule disabled clicked - Total users:", totalUserCount);

        if (totalUserCount === 0) {
          // No users exist - trigger add user button glow
          console.log("No users exist, triggering add user glow");
          triggerAddUserGlow();
        } else {
          // Users exist but no active user - trigger users section glow
          console.log(
            "Users exist but no active user, triggering users section glow"
          );
          triggerUsersSectionGlow();
        }
      }
    });
  }

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

        if (!isNaN(day) && !isNaN(time)) {
          if (state.pinModeActive && !state.compareMode) {
            // In pin mode: handle pinning/unpinning
            handlePinSlotClick(day, time, e);
          } else if (!state.compareMode) {
            // Normal mode: handle busy/free toggle
            handleToggleScheduleSlot(day, time);
          }
          // In compare mode: do nothing (tooltips are handled by mouseover)
        }
      }
    });
    DOM_ELEMENTS.scheduleTable.addEventListener("mouseover", (e) => {
      if (state.compareMode && e.target.classList.contains("slot")) {
        const day = parseInt(e.target.dataset.day, 10),
          time = parseInt(e.target.dataset.time, 10);
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

    // Touch event support for mobile devices with scroll detection
    let touchStartData = null;
    let isScrolling = false;
    let scrollTimeout = null;

    DOM_ELEMENTS.scheduleTable.addEventListener(
      "touchstart",
      (e) => {
        if (state.compareMode && e.target.classList.contains("slot")) {
          // Store initial touch data
          touchStartData = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            time: Date.now(),
            target: e.target,
            day: parseInt(e.target.dataset.day, 10),
            timeIndex: parseInt(e.target.dataset.time, 10),
          };
          isScrolling = false;

          // Clear any existing scroll timeout
          if (scrollTimeout) {
            clearTimeout(scrollTimeout);
            scrollTimeout = null;
          }
        }
      },
      { passive: true }
    );

    DOM_ELEMENTS.scheduleTable.addEventListener(
      "touchmove",
      (e) => {
        if (touchStartData && state.compareMode) {
          const deltaX = Math.abs(e.touches[0].clientX - touchStartData.x);
          const deltaY = Math.abs(e.touches[0].clientY - touchStartData.y);

          // If user has moved more than 10px in any direction, consider it scrolling
          if (deltaX > 10 || deltaY > 10) {
            isScrolling = true;
            // Hide tooltip immediately if user starts scrolling
            handleHideSlotTooltip();
          }
        }
      },
      { passive: true }
    );

    DOM_ELEMENTS.scheduleTable.addEventListener("touchend", (e) => {
      if (touchStartData && state.compareMode && !isScrolling) {
        const touchDuration = Date.now() - touchStartData.time;

        // Only show tooltip if:
        // 1. Touch was brief (less than 300ms, indicating a tap not a long press)
        // 2. User didn't scroll
        // 3. Touch ended on the same element it started on
        if (touchDuration < 300 && e.target === touchStartData.target) {
          const { day, timeIndex } = touchStartData;
          if (!isNaN(day) && !isNaN(timeIndex)) {
            handleShowSlotTooltip(touchStartData.target, day, timeIndex);

            // Auto-hide tooltip after 3 seconds on mobile
            scrollTimeout = setTimeout(() => {
              handleHideSlotTooltip();
            }, 3000);
          }
        }
      }

      // Reset touch data
      touchStartData = null;
      isScrolling = false;
    });

    // Hide tooltip when touching elsewhere on the document
    document.addEventListener("touchstart", (e) => {
      if (
        state.compareMode &&
        !e.target.closest("#scheduleTable") &&
        !e.target.closest("#slotTooltip")
      ) {
        handleHideSlotTooltip();

        // Clear any pending timeout
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
          scrollTimeout = null;
        }
      }
    });
  }
}

/* ================================
   AUTHENTICATION UI MANAGEMENT
================================== */

/**
 * Show UI for unauthenticated users
 */
function showUnauthenticatedUI() {
  console.log("🔓 Showing unauthenticated UI");

  // Show login button
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    console.log("👁️ Showing login button");
    loginBtn.style.display = "block";
  } else {
    console.warn("Login button not found when trying to show it");
  }

  // Hide user info
  hideUserInfo();

  // Disable advanced features
  disableScheduleFeatures();
}

/**
 * Display user information in header
 */
function showUserInfo(user) {
  console.log("👤 Showing user info for:", user.email);

  // Add to navigation (instead of header)
  const navRight = document.querySelector(".nav-right");
  if (navRight) {
    console.log("✅ Adding user info to navigation");
    navRight.appendChild(userInfo);

    // Add logout functionality
    document.getElementById("logout-btn").addEventListener("click", () => {
      console.log("🚪 Logout button clicked");
      authManager.signOut();
    });
  } else {
    console.error(
      "❌ Navigation right section not found, cannot add user info"
    );
  }
}

/**
 * Hide user information
 */
function hideUserInfo() {
  const userInfo = document.getElementById("user-info");
  if (userInfo) userInfo.remove();
}

/**
 * Enable features that require authentication
 */
function enableScheduleFeatures() {
  console.log("🎉 Enabling cloud sync, sharing, and advanced features!");

  // Enable cloud save/load buttons
  const cloudButtons = document.querySelectorAll(".cloud-feature");
  cloudButtons.forEach((btn) => {
    btn.disabled = false;
    btn.title = "Cloud features enabled!";
  });
}

/**
 * Disable features that require authentication
 */
function disableScheduleFeatures() {
  console.log("📱 Running in local mode - advanced features disabled");

  // Disable cloud features but keep basic scheduling
  const cloudButtons = document.querySelectorAll(".cloud-feature");
  cloudButtons.forEach((btn) => {
    btn.disabled = true;
    btn.title = "Sign in to use cloud features";
  });
}

/* ================================
   PROFILE COMPLETION CHECK (Legacy)
================================== */

/**
 * Legacy profile completion check - now handled by authentication callbacks
 * This function remains for backwards compatibility but is no longer the primary method
 */
function checkProfileCompletion() {
  console.log(
    "💡 Note: Profile completion is now handled by authentication callbacks"
  );
  // The actual profile check is now done in setupAuthenticationCallbacks()
}

/* ================================
   AUTHENTICATION CALLBACK SETUP
================================== */

/**
 * Sets up authentication callbacks for profile completion checks
 * This ensures new users are directed to profile setup after sign-in
 */
function setupAuthenticationCallbacks() {
  // Set up sign-in success callback to check profile completion
  authManager.setSigninSuccessCallback(async (data) => {
    console.log("🎉 User signed in successfully:", data.user.email);

    try {
      // Use dataManager to check if user has completed profile setup
      const userProfile = await dataManager.getUserProfile(data.user.uid);
      if (!userProfile || !userProfile.systemInfo?.profileSetupComplete) {
        // Navigate to profile setup for new or incomplete profiles using SPA router
        console.log("📝 Navigating to profile setup...");
        if (window.spaRouter) {
          window.spaRouter.navigateTo("profile");
        } else {
          // Fallback for non-SPA environments
          window.location.href = "pages/profile-setup.html";
        }
      } else {
        // Profile is complete, navigate to main schedule screen
        console.log(
          "✅ Profile complete, navigating to home/schedule screen..."
        );
        if (window.spaRouter) {
          window.spaRouter.navigateTo("home");
        } else {
          // Fallback for non-SPA environments
          window.location.href = "index.html";
        }
      }
    } catch (error) {
      console.error("Error checking profile completion after sign-in:", error);
      // On error, navigate to home to avoid getting stuck in profile setup
      // Users can manually navigate to profile setup if needed
      console.log("⚠️ Error occurred, navigating to home for safety...");
      if (window.spaRouter) {
        window.spaRouter.navigateTo("home");
      } else {
        window.location.href = "index.html";
      }
    }
  });

  // Set up sign-in error callback for better error handling
  authManager.setSigninErrorCallback((data) => {
    console.error("❌ Sign-in failed:", data.error.message);
    // The auth modal will handle showing the error to the user
  });
}

/* ================================
   INITIALIZATION
================================== */
// 🗑️ LEGACY CODE REMOVED: The initializeApp function and its related listeners
// have been removed. The `spa:page:load` event listener below is now the
// single source of truth for initializing the schedule page logic. This
// prevents race conditions and ensures code runs only when the 'home'
// page is loaded by the SPA router.

/**
 * 🎯 NEW: Event listener to initialize the app when the SPA router signals
 * that the home page's content has been loaded into the DOM.
 * This replaces the old, less reliable `DOMContentLoaded` and custom event listeners.
 */
document.addEventListener("spa:page:load", (event) => {
  const { route } = event.detail;
  console.log(`[script.js] Received spa:page:load event for route: ${route}`);

  if (route === "home") {
    // Only initialize the schedule app when the home page is loaded.
    console.log("🚀 Starting CampXus Schedule App (via SPA event)...");

    // Essential: Always load state first so user data is available
    console.log("💾 Loading state from storage...");
    loadStateFromStorage();
    
    console.log("� Current state after loading:", {
      activeUserId: state.activeUserId,
      userCount: Object.keys(state.users).length,
      users: Object.keys(state.users)
    });

    // Initialize DOM elements for the home page
    console.log("📋 Checking DOM elements...");
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

    // Initialize modal system
    console.log("🎛️ Initializing modal...");
    initModal(DOM_ELEMENTS);
    
    // Set up UI interactions
    console.log("🔧 Setting up validation and listeners...");
    setupInputValidation();
    setupEventListeners();
    setupExportImportListeners(state, saveStateToStorage, updateUI);

    // Render UI with loaded data (this includes renderUserList())
    console.log("🎨 Updating UI with loaded data...");
    updateUI();

    // Set up authentication callbacks (only once)
    setupAuthenticationCallbacks();

    console.log("✅ CampXus Schedule App loaded successfully!");
  }
});

/**
 * Shows a detailed tooltip for pin indicators in compare mode
 * @param {Event} event - The click event
 * @param {Object} pinData - Pin aggregation data containing count, userNames, and userIds
 */
function showPinTooltip(event, pinData) {
  // Remove any existing pin tooltips
  const existingTooltip = document.querySelector(".pin-tooltip");
  if (existingTooltip) {
    existingTooltip.remove();
  }

  // Create tooltip element
  const tooltip = document.createElement("div");
  tooltip.className = "pin-tooltip";

  // Create tooltip content
  const content = document.createElement("div");
  content.className = "pin-tooltip-content";

  // Add header
  const header = document.createElement("div");
  header.className = "pin-tooltip-header";
  header.textContent = `Users who prefer this slot:`;
  content.appendChild(header);

  // Add user list
  const userList = document.createElement("div");
  userList.className = "pin-tooltip-users";

  pinData.userNames.forEach((userName, index) => {
    const userItem = document.createElement("div");
    userItem.className = "pin-tooltip-user";

    // Add user color indicator if available
    const userId = pinData.userIds[index];
    if (state.users[userId] && state.users[userId].color) {
      const colorIndicator = document.createElement("span");
      colorIndicator.className = "pin-tooltip-user-color";
      colorIndicator.style.backgroundColor = state.users[userId].color;
      userItem.appendChild(colorIndicator);
    }

    const userNameSpan = document.createElement("span");
    userNameSpan.textContent = userName;
    userItem.appendChild(userNameSpan);

    userList.appendChild(userItem);
  });

  content.appendChild(userList);
  tooltip.appendChild(content);

  // Position tooltip near the clicked element with smart positioning
  const rect = event.target.getBoundingClientRect();
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // Add tooltip to document first to measure its dimensions
  document.body.appendChild(tooltip);
  const tooltipRect = tooltip.getBoundingClientRect();

  // Smart positioning logic
  let left = rect.left;
  let top = rect.bottom + 8;

  // Check if tooltip goes beyond right edge
  if (left + tooltipRect.width > viewport.width - 10) {
    left = viewport.width - tooltipRect.width - 10;
    tooltip.classList.add("tooltip-left");
  }

  // Check if tooltip goes beyond left edge
  if (left < 10) {
    left = 10;
  }

  // Check if tooltip goes beyond bottom edge
  if (top + tooltipRect.height > viewport.height - 10) {
    top = rect.top - tooltipRect.height - 8;
    tooltip.classList.add("tooltip-top");
  }

  // Check if tooltip goes beyond top edge (rare case)
  if (top < 10) {
    top = rect.bottom + 8; // Fallback to bottom positioning
    tooltip.classList.remove("tooltip-top");
  }

  // Apply final positioning
  tooltip.style.position = "fixed";
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.zIndex = "1001";

  // Add click-outside handler to close tooltip
  const closeTooltip = (e) => {
    if (!tooltip.contains(e.target)) {
      tooltip.remove();
      document.removeEventListener("click", closeTooltip);
    }
  };

  // Delay adding the click handler to prevent immediate closure
  setTimeout(() => {
    document.addEventListener("click", closeTooltip);
  }, 100);

  // Auto-close tooltip after 5 seconds
  setTimeout(() => {
    if (tooltip.parentNode) {
      tooltip.remove();
      document.removeEventListener("click", closeTooltip);
    }
  }, 5000);
}

/**
 * Migrates a user's pin data to time-based format when their schedule structure changes
 * This preserves pin intentions when users modify their time slots
 * @param {Object} user - User object to migrate
 */
export function migratePinsToTimeBased(user) {
  if (!user || !user.pinnedSlots || !user.timeSlots) {
    return;
  }

  // Store time-based pins in user object for persistence
  if (!user.timeBasedPins) {
    user.timeBasedPins = convertPinsToTimeBased(user);
  }

  // Update array-based pins to match current schedule structure
  user.pinnedSlots = convertPinsFromTimeBased(user.timeBasedPins, user);
}

/**
 * Updates time-based pins when user manually pins/unpins a slot
 * @param {Object} user - User object
 * @param {number} dayIndex - Day index
 * @param {number} slotIndex - Slot index
 * @param {boolean} isPinned - Whether the slot is now pinned
 */
export function updateTimeBasedPin(user, dayIndex, slotIndex, isPinned) {
  if (!user || !user.timeSlots || !user.timeSlots[slotIndex]) {
    return;
  }

  if (!user.timeBasedPins) {
    user.timeBasedPins = {};
  }

  if (!user.timeBasedPins[dayIndex]) {
    user.timeBasedPins[dayIndex] = [];
  }

  const timeSlot = user.timeSlots[slotIndex];
  const existingPinIndex = user.timeBasedPins[dayIndex].findIndex(
    (pin) => pin.start === timeSlot.start && pin.end === timeSlot.end
  );

  if (isPinned) {
    if (existingPinIndex >= 0) {
      user.timeBasedPins[dayIndex][existingPinIndex].pinned = true;
    } else {
      user.timeBasedPins[dayIndex].push({
        start: timeSlot.start,
        end: timeSlot.end,
        label: timeSlot.label,
        pinned: true,
      });
    }
  } else {
    if (existingPinIndex >= 0) {
      user.timeBasedPins[dayIndex][existingPinIndex].pinned = false;
    }
  }
}
