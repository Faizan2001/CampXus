// js/script.js

// --- Module Imports ---
import { DEFAULT_TIMESLOTS, LOCAL_STORAGE_KEY } from "../utils/constants.js";
import {
  DOM_ELEMENTS,
  initializeDomElements,
} from "../utils/dom/domElements.js";
import { showModal } from "../components/modals/Modal.js"; // Only import showModal, initModal is handled in spa-init.js
import {
  parseTime,
  isTimeBefore,
  convertToHHMM,
  isValidTimeFormat,
  isValidStrictHHMMTimeFormat,
  createUnifiedSchedule,
} from "../utils/time/timeUtils.js";
import {
  handleExportCurrentUser,
  handleImportSchedule,
  setupExportImportListeners,
} from "../utils/schedule/exportImport.js";
import { authManager } from "../services/auth/AuthService.js";
import { dataManager } from "../services/data/DataService.js";
import { scheduleStorageService } from "../services/schedule/ScheduleStorageService.js";
import { currentUser } from "../store/userStore.js";
import { navigateTo } from "../app.js"; // Import navigateTo for SPA navigation
import { HorizontalFriendsBar } from "../components/friends/HorizontalFriendsBar.js";

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

  // Phase-3: Horizontal Friends Bar
  horizontalFriendsBar: null, // HorizontalFriendsBar component instance
  currentViewingFriendId: null, // ID of friend whose schedule is currently being viewed
  friendsScheduleData: new Map(), // Cache for friends' schedule data

  // Mobile Schedule Redesign State
  viewMode: "day", // 'day' or 'grid' - default to day view for mobile-first
  selectedDay: new Date().getDay(), // Current day (0 = Sunday, 6 = Saturday)
  isMobile: false, // Will be set during initialization
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

    // Phase-3: Horizontal Friends Bar
    horizontalFriendsBar: null,
    currentViewingFriendId: null,
    friendsScheduleData: new Map(),

    // Mobile Schedule Redesign State
    viewMode: "day",
    selectedDay: new Date().getDay(),
    isMobile: false,
  };
}

/* ================================
   UTILITY FUNCTIONS
================================== */

// Smart logging with frequency control
let lastLogTimes = {};
function smartLog(key, message, data, minInterval = 1000) {
  const now = Date.now();
  if (!lastLogTimes[key] || now - lastLogTimes[key] > minInterval) {
    console.log(message, data);
    lastLogTimes[key] = now;
  }
}

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

/**
 * Creates a weekly matrix (7 days) with specified dimensions and default values
 * Reduces code duplication for schedule/pin matrix initialization
 * @param {number} timeSlots - Number of time slots per day
 * @param {*} defaultValue - Default value for each cell
 * @returns {Array<Array>} 7x timeSlots matrix
 */
// Cache for matrix creation to avoid repeated allocations
const matrixCache = new Map();

function createWeeklyMatrix(timeSlots, defaultValue = false) {
  // Create cache key based on parameters
  const cacheKey = `${timeSlots}-${
    typeof defaultValue === "function" ? "function" : defaultValue
  }`;

  // For function default values, we can't cache since each call should create new objects
  if (typeof defaultValue === "function") {
    return Array.from({ length: 7 }, () =>
      Array.from({ length: timeSlots }, () => defaultValue())
    );
  }

  // For primitive default values, we can cache the structure
  if (!matrixCache.has(cacheKey)) {
    const matrix = Array.from({ length: 7 }, () =>
      Array.from({ length: timeSlots }, () => defaultValue)
    );
    matrixCache.set(cacheKey, matrix);
  }

  // Return deep copy to prevent mutation of cached version
  const cached = matrixCache.get(cacheKey);
  return cached.map((day) => [...day]);
}

/**
 * Creates slot info matrix with course and classroom data structure
 * @param {number} timeSlots - Number of time slots per day
 * @returns {Array<Array<Object>>} 7x timeSlots matrix with slot info objects
 */
function createSlotInfoMatrix(timeSlots) {
  // Can't cache this since each object should be unique
  return Array.from({ length: 7 }, () =>
    Array.from({ length: timeSlots }, () => ({
      courseCode: "",
      classroomNumber: "",
    }))
  );
}

/**
 * Gets slot information safely with fallback defaults
 * @param {Object} user - User object
 * @param {number} dayIndex - Day index (0-6)
 * @param {number} timeIndex - Time slot index
 * @returns {Object} Slot info with courseCode and classroomNumber
 */
function getSlotInfo(user, dayIndex, timeIndex) {
  return (
    user?.slotInfo?.[dayIndex]?.[timeIndex] || {
      courseCode: "",
      classroomNumber: "",
    }
  );
}

/**
 * Determines if unified schedule is needed for heterogeneous time structures
 * Consolidates the repeated logic across multiple functions
 * @param {Array} selectedUsers - Array of selected user objects
 * @returns {boolean} True if unified schedule should be used
 */
function shouldUseUnifiedSchedule(selectedUsers) {
  if (selectedUsers.length === 0) return false;

  const allUsersHaveTimeSlots = selectedUsers.every(
    (user) => user.timeSlots && Array.isArray(user.timeSlots)
  );

  if (!allUsersHaveTimeSlots) return false;

  const firstUserTimeSlots = selectedUsers[0].timeSlots;
  return selectedUsers.some((user) => {
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
}

/* ================================
   CORE LOGIC FUNCTIONS (Data Manipulation)
================================== */
/**
 * Creates a new user object with proper initialization of all matrices
 * @param {string} name - User's display name
 * @param {string} userId - Unique user identifier
 * @param {Object} currentUsers - Existing users object
 * @returns {Object|null} New user object or null if user already exists
 */
export function createUserObject(name, userId, currentUsers) {
  if (currentUsers[userId]) {
    console.warn(
      `[State] Attempted to create duplicate user: ${userId} (${name})`
    );
    return null;
  }

  const userTimeSlots = JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS)); // Deep copy
  const timeSlotCount = userTimeSlots.length;

  console.log(
    `[State] Creating new user: ${name} (${userId}) with ${timeSlotCount} time slots`
  );

  return {
    id: userId,
    name: name,
    timeSlots: userTimeSlots,
    schedule: createWeeklyMatrix(timeSlotCount, false),
    pinnedSlots: createWeeklyMatrix(timeSlotCount, false),
    slotInfo: createSlotInfoMatrix(timeSlotCount),
  };
}

/**
 * Removes a user from the application state and updates related references
 * @param {string} userId - User ID to remove
 * @param {Object} currentState - Current application state
 * @returns {Object} Updated state with user removed
 */
export function deleteUserFromState(userId, currentState) {
  const newUsers = { ...currentState.users };
  let newActiveUserId = currentState.activeUserId;
  const newSelectedUserIds = new Set(currentState.selectedUserIds);

  if (!newUsers[userId]) {
    console.warn(`[State] Attempted to delete non-existent user: ${userId}`);
    return currentState;
  }

  const userName = newUsers[userId]?.name || "Unknown";
  const wasActive = newActiveUserId === userId;
  const wasInCompare = newSelectedUserIds.has(userId);

  delete newUsers[userId];
  if (newActiveUserId === userId) newActiveUserId = null;
  newSelectedUserIds.delete(userId);

  console.log(`[State] Deleted user: ${userName} (${userId})`, {
    wasActive,
    wasInCompare,
    remainingUsers: Object.keys(newUsers).length,
  });

  return {
    ...currentState,
    users: newUsers,
    activeUserId: newActiveUserId,
    selectedUserIds: newSelectedUserIds,
  };
}

/**
 * Toggles a time slot in a user's schedule matrix
 * @param {number} dayIndex - Day index (0-6)
 * @param {number} timeIndex - Time slot index
 * @param {Array<Array<boolean>>} userSchedule - User's schedule matrix
 * @returns {Array<Array<boolean>>} Updated schedule matrix
 */
export function toggleSlotInSchedule(dayIndex, timeIndex, userSchedule) {
  return userSchedule.map((daySlots, dIdx) =>
    dIdx === dayIndex
      ? daySlots.map((slotValue, tIdx) =>
          tIdx === timeIndex ? !slotValue : slotValue
        )
      : [...daySlots]
  );
}

// Add memoization cache for expensive calculations
const memoCache = {
  slotStatus: new Map(),
  tooltipMessages: new Map(),
  comparisonData: new Map(),

  // Clear cache when state changes
  clear() {
    this.slotStatus.clear();
    this.tooltipMessages.clear();
    this.comparisonData.clear();
  },

  // Generate cache key for slot operations
  getSlotKey(dayIndex, timeIndex, selectedUserIds, compareMode, activeUserId) {
    const userIds = Array.from(selectedUserIds).sort().join(",");
    return `${dayIndex}-${timeIndex}-${compareMode}-${activeUserId}-${userIds}`;
  },
};

/**
 * Determines the visual status/CSS class for a time slot based on current state
 * Handles both individual user mode and compare mode with unified schedules
 * @param {number} dayIndex - Day index (0-6)
 * @param {number} timeIndex - Time slot index
 * @param {Object} currentState - Current application state
 * @returns {string} CSS class name for slot status (slot, slot-free, slot-conflict, etc.)
 */
export function determineSlotStatus(dayIndex, timeIndex, currentState) {
  const { compareMode, selectedUserIds, users, activeUserId } = currentState;

  // Check memoization cache first
  const cacheKey = memoCache.getSlotKey(
    dayIndex,
    timeIndex,
    selectedUserIds,
    compareMode,
    activeUserId
  );
  if (memoCache.slotStatus.has(cacheKey)) {
    return memoCache.slotStatus.get(cacheKey);
  }

  let result;

  if (compareMode && selectedUserIds.size > 0) {
    // Create unified schedule for heterogeneous comparison
    const selectedUsers = Array.from(selectedUserIds)
      .map((id) => users[id])
      .filter((user) => user);

    if (selectedUsers.length === 0) {
      result = "slot";
    } else if (shouldUseUnifiedSchedule(selectedUsers)) {
      // Use UnifiedSchedule for heterogeneous time structures
      const unifiedSchedule = createUnifiedSchedule(selectedUsers);

      if (timeIndex >= unifiedSchedule.unifiedTimeSlots.length) {
        result = "slot-partial"; // Slot doesn't exist in unified schedule
      } else {
        const status = unifiedSchedule.getSlotStatus(dayIndex, timeIndex);

        if (status.busy.length === 0 && status.unavailable.length === 0) {
          result = "slot-free"; // All users are available
        } else if (
          status.busy.length === status.total &&
          status.unavailable.length === 0
        ) {
          result = "slot-conflict"; // All users are busy
        } else {
          result = "slot-partial"; // Mixed availability or some users don't have this slot
        }
      }
    } else {
      // Optimized logic for homogeneous schedules
      let busyCount = 0;
      let allUsersHaveSlot = true;

      for (const id of selectedUserIds) {
        const user = users[id];
        if (user?.schedule?.[dayIndex]) {
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
      }

      if (!allUsersHaveSlot && selectedUserIds.size > 0) {
        result = "slot-partial";
      } else if (busyCount === 0 && selectedUserIds.size > 0) {
        result = "slot-free";
      } else if (busyCount === selectedUserIds.size) {
        result = "slot-conflict";
      } else if (selectedUserIds.size > 0) {
        result = "slot-partial";
      } else {
        result = "slot";
      }
    }
  } else if (activeUserId && users[activeUserId]) {
    const activeUserObj = users[activeUserId];
    if (
      activeUserObj.schedule?.[dayIndex] &&
      timeIndex < activeUserObj.schedule[dayIndex].length &&
      activeUserObj.schedule[dayIndex][timeIndex]
    ) {
      result = "slot-selected";
    } else {
      result = "slot";
    }
  } else {
    result = "slot"; // Default
  }

  // Cache the result
  memoCache.slotStatus.set(cacheKey, result);
  return result;
}

/**
 * Generates tooltip message showing user availability for a specific time slot
 * @param {number} dayIndex - Day index (0-6)
 * @param {number} timeIndex - Time slot index
 * @param {Object} currentState - Current application state
 * @returns {string} Formatted tooltip message
 */
export function generateTooltipMessage(dayIndex, timeIndex, currentState) {
  const { users, selectedUserIds, compareMode } = currentState;
  if (selectedUserIds.size === 0) return "";

  // Check memoization cache first
  const cacheKey = memoCache.getSlotKey(
    dayIndex,
    timeIndex,
    selectedUserIds,
    compareMode,
    currentState.activeUserId
  );
  if (memoCache.tooltipMessages.has(cacheKey)) {
    return memoCache.tooltipMessages.get(cacheKey);
  }

  // Check if we need unified schedule approach for heterogeneous comparison
  const selectedUsers = Array.from(selectedUserIds)
    .map((id) => users[id])
    .filter((user) => user);

  if (selectedUsers.length === 0) return "";

  let result;

  if (shouldUseUnifiedSchedule(selectedUsers)) {
    // Use UnifiedSchedule for heterogeneous tooltip generation
    const unifiedSchedule = createUnifiedSchedule(selectedUsers);

    if (timeIndex >= unifiedSchedule.unifiedTimeSlots.length) {
      result = "Time slot not available in unified schedule";
    } else {
      const status = unifiedSchedule.getSlotStatus(dayIndex, timeIndex);
      result = unifiedSchedule._generateTooltip(status);
    }
  } else {
    // Optimized logic for homogeneous schedules
    const available = [];
    const busy = [];

    for (const id of selectedUserIds) {
      const user = users[id];
      if (
        user?.schedule?.[dayIndex] &&
        timeIndex < user.schedule[dayIndex].length
      ) {
        if (user.schedule[dayIndex][timeIndex]) {
          busy.push(user.name || user.id);
        } else {
          available.push(user.name || user.id);
        }
      }
    }

    const parts = [];
    if (available.length > 0) {
      parts.push(`Available: ${available.join(", ")}`);
    }
    if (busy.length > 0) {
      parts.push(`Busy: ${busy.join(", ")}`);
    }

    result = parts.join("\n");
  }

  // Cache the result
  memoCache.tooltipMessages.set(cacheKey, result);
  return result;
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

  // Only aggregate pins in compare mode with selected users
  if (!compareMode || selectedUserIds.size === 0) {
    return { count: 0, userNames: [], userIds: [] };
  }

  const pinnedByUsers = [];
  const pinnedUserNames = [];

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

  const result = {
    count: pinnedByUsers.length,
    userNames: pinnedUserNames,
    userIds: pinnedByUsers,
  };

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
    .map((id) => {
      // First try direct lookup
      if (users[id]) {
        return users[id];
      }
      // If not found, search by any property that might match
      return Object.values(users).find(
        (user) => user.id === id || user.userId === id || user.friendId === id
      );
    })
    .filter((user) => user && user.schedule);

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
      // Try to find user with improved lookup
      let user = users[userId];
      if (!user) {
        user = Object.values(users).find(
          (u) => u.id === userId || u.userId === userId || u.friendId === userId
        );
      }

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
      // Try to find user with improved lookup
      let user = users[userId];
      if (!user) {
        user = Object.values(users).find(
          (u) => u.id === userId || u.userId === userId || u.friendId === userId
        );
      }

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
    user.slotInfo = createSlotInfoMatrix(user.timeSlots.length - 1);
  }
  user.slotInfo.forEach((daySlotInfo) => {
    daySlotInfo.push({ courseCode: "", classroomNumber: "" });
  });

  // Migrate pins to preserve pin intentions when schedule structure changes
  migratePinsToTimeBased(user);

  console.log("[Interaction] Custom time slot added", {
    user: user.name,
    timeSlot: newSlotLabel,
    totalSlots: user.timeSlots.length,
    startTime: hhmmStartTime,
    endTime: hhmmEndTime,
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
    user.schedule = createWeeklyMatrix(user.timeSlots.length, false);
    user.pinnedSlots = createWeeklyMatrix(user.timeSlots.length, false);

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
  const previousState = state.pinModeActive;

  if (!state.activeUserId || state.compareMode) {
    // This case means the button was clicked while it should have been disabled,
    // or state changed between render and click. Defensive coding:
    state.pinModeActive = false; // Ensure it's off if conditions aren't met
    console.warn(
      "[Mode] Pin Mode toggle attempted when conditions not met. Forcing off.",
      {
        hasActiveUser: !!state.activeUserId,
        inCompareMode: state.compareMode,
      }
    );
  } else {
    // Toggle the pin mode state
    state.pinModeActive = !state.pinModeActive;
    if (state.pinModeActive && state.compareMode) {
      // Defensive check
      state.compareMode = false;
      // activeUserId should still be set if we entered here
    }

    console.log(
      `[Mode] Pin Mode ${state.pinModeActive ? "enabled" : "disabled"}`,
      {
        activeUser: state.users[state.activeUserId]?.name,
        previousState,
      }
    );
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

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const timeSlot = activeUserObject.timeSlots[slotIndex];

  console.log(`[Interaction] Pin ${newPinState ? "added" : "removed"}`, {
    user: activeUserObject.name,
    day: dayNames[dayIndex],
    time: timeSlot?.label || `slot-${slotIndex}`,
    coordinates: `[${dayIndex}, ${slotIndex}]`,
  });

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
  const existingInfo = getSlotInfo(user, dayIndex, timeIndex);

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
      <div class="modal-actions-row">
        <button id="delete-slot-btn" class="modal-button delete">
          Delete Slot
        </button>
      </div>
    </div>
  `;

  showModal({
    title: "Edit Slot Information",
    content: modalContent,
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Save",
    cancelText: "Cancel",
    onConfirm: () => {
      const courseCodeInput = document.getElementById("editCourseCodeInput");
      const classroomInput = document.getElementById("editClassroomInput");

      if (courseCodeInput && classroomInput) {
        const courseCode = courseCodeInput.value.trim().toUpperCase();
        const classroomNumber = classroomInput.value.trim();

        if (courseCode && !/^[A-Z0-9\s]{1,20}$/i.test(courseCode)) {
          const errorDiv = document.getElementById("edit-slot-info-error");
          if (errorDiv) {
            errorDiv.textContent =
              "Course code should only contain letters, numbers, and spaces (max 20 characters)";
            errorDiv.style.display = "block";
          }
          return false;
        }

        if (!user.slotInfo)
          user.slotInfo = createSlotInfoMatrix(user.timeSlots.length);
        if (!user.slotInfo[dayIndex])
          user.slotInfo[dayIndex] = Array(user.timeSlots.length)
            .fill(null)
            .map(() => ({ courseCode: "", classroomNumber: "" }));
        if (!user.slotInfo[dayIndex][timeIndex])
          user.slotInfo[dayIndex][timeIndex] = {
            courseCode: "",
            classroomNumber: "",
          };

        user.slotInfo[dayIndex][timeIndex] = { courseCode, classroomNumber };

        saveStateToStorage();
        updateUI();
        return true;
      }
      return false;
    },
  });

  // Add event listener for the new delete button
  const deleteBtn = document.getElementById("delete-slot-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      showModal({
        title: "Delete Slot",
        content: `Are you sure you want to delete this slot and mark it as free?\n\nDay: ${dayName}\nTime: ${timeSlot.label}`,
        showConfirmationButtons: true,
        confirmText: "Delete",
        cancelText: "Cancel",
        onConfirm: () => {
          const activeUser = state.users[state.activeUserId];
          if (!activeUser) {
            showModal({ title: "Error", content: "No active user found." });
            return true;
          }

          if (activeUser.schedule && activeUser.schedule[dayIndex]) {
            activeUser.schedule[dayIndex][timeIndex] = false;
          }

          if (
            activeUser.slotInfo &&
            activeUser.slotInfo[dayIndex] &&
            activeUser.slotInfo[dayIndex][timeIndex]
          ) {
            activeUser.slotInfo[dayIndex][timeIndex] = {
              courseCode: "",
              classroomNumber: "",
            };
          }

          if (
            activeUser.pinnedSlots &&
            Array.isArray(activeUser.pinnedSlots[dayIndex]) &&
            activeUser.pinnedSlots[dayIndex][timeIndex] === true
          ) {
            activeUser.pinnedSlots[dayIndex][timeIndex] = false;
          }

          saveStateToStorage();
          updateUI();
          return true; // Close the confirmation modal
        },
      });
    });
  }
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

  // Add a safeguard against undefined timeSlot, which causes crashes.
  if (!timeSlot) {
    console.error(
      `[Error] Could not find timeSlot at index ${timeIndex} for user ${user.id}.`,
      {
        timeSlots: user.timeSlots,
      }
    );
    showModal({
      title: "Data Error",
      content:
        "An error occurred while loading slot details. The schedule's time structure might be inconsistent. Please try refreshing the page.",
    });
    return;
  }

  // Get existing slot info if any
  const existingInfo = getSlotInfo(user, dayIndex, timeIndex);

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
          user.slotInfo = createSlotInfoMatrix(user.timeSlots.length);
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
   STATE PERSISTENCE (Phase-1: Firestore + localStorage Cache)
================================== */
async function loadState() {
  try {
    console.log("📡 [Phase-1] Loading user schedule...");

    // Check if user is authenticated
    const user = authManager.getCurrentUser();
    if (!user) {
      console.log("⚠️ [Phase-1] No authenticated user, skipping schedule load");
      return;
    }

    console.log(`👤 [Phase-1] Loading schedule for user: ${user.uid}`);

    // Set loading state in userStore
    currentUser.setScheduleLoading(true);
    currentUser.clearScheduleError();

    // Use ScheduleStorageService to handle dual storage strategy
    const scheduleData = await scheduleStorageService.loadUserSchedule(
      user.uid
    );

    if (scheduleData) {
      // Convert to HomePage format using ScheduleStorageService
      const homePageFormat = scheduleStorageService.convertToHomePageFormat(
        scheduleData,
        user.uid
      );

      // Update local state for UI rendering
      state.users[user.uid] = homePageFormat.users[user.uid];
      state.activeUserId = user.uid;

      // Clean up any legacy "user" key duplicates that might exist from previous versions
      if (state.users["user"]) {
        console.log("🧹 Removing legacy 'user' key duplicate");
        delete state.users["user"];
      }

      // Clear memoization and matrix caches since we have new user schedule data
      memoCache.clear();
      matrixCache.clear();
      console.log(
        "🧹 Cleared memoization and matrix caches after loading user schedule"
      );

      // Update userStore with schedule data
      currentUser.setScheduleData(scheduleData);

      // Set up real-time sync through ScheduleStorageService
      setupScheduleRealTimeSync(user.uid);

      console.log("✅ [Phase-1] User schedule loaded with real-time sync");
    } else {
      console.log(
        "📭 [Phase-1] No schedule data found, initializing empty state"
      );

      // Initialize empty user for UI
      state.users[user.uid] = createEmptyUser(user.uid);
      state.activeUserId = user.uid;

      // Clean up any legacy "user" key duplicates
      if (state.users["user"]) {
        console.log("🧹 Removing legacy 'user' key duplicate");
        delete state.users["user"];
      }
    }
  } catch (error) {
    console.error("❌ [Phase-1] Failed to load user schedule:", error);
    currentUser.setScheduleError(error.message);

    // Initialize empty user for UI even on error
    const user = authManager.getCurrentUser();
    if (user) {
      state.users[user.uid] = createEmptyUser(user.uid);
      state.activeUserId = user.uid;

      // Clean up any legacy "user" key duplicates
      if (state.users["user"]) {
        console.log("🧹 Removing legacy 'user' key duplicate");
        delete state.users["user"];
      }
    }
  } finally {
    currentUser.setScheduleLoading(false);
  }
}

/**
 * Create empty user object for UI initialization
 * @param {string} userId - User ID
 * @returns {Object} Empty HomePage user object
 */
function createEmptyUser(userId) {
  return {
    id: userId === currentUser.uid ? currentUser.getStudentId() : userId,
    name: currentUser.getScheduleDisplayName(), // "ME"
    timeSlots: DEFAULT_TIMESLOTS,
    schedule: createWeeklyMatrix(7, false),
    slotInfo: createSlotInfoMatrix(7),
    pinnedSlots: createWeeklyMatrix(7, false),
    timeBasedPins: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
  };
}

/**
 * Set up real-time sync using ScheduleStorageService
 * @param {string} userId - User ID to sync
 */
function setupScheduleRealTimeSync(userId) {
  // Clean up existing listener if any
  if (window.scheduleRealtimeUnsubscribe) {
    window.scheduleRealtimeUnsubscribe();
    window.scheduleRealtimeUnsubscribe = null;
  }

  // Set up new real-time sync through ScheduleStorageService
  window.scheduleRealtimeUnsubscribe = scheduleStorageService.setupRealtimeSync(
    userId,
    (updatedScheduleData) => {
      if (updatedScheduleData && state.users[userId]) {
        console.log(
          "📡 [Phase-1] Real-time schedule update received via ScheduleStorageService"
        );

        // Convert updated data to HomePage format
        const homePageFormat = scheduleStorageService.convertToHomePageFormat(
          updatedScheduleData,
          userId
        );

        // Update local state for UI
        state.users[userId] = homePageFormat.users[userId];

        // Update userStore
        currentUser.setScheduleData(updatedScheduleData);
        currentUser.setScheduleLastSynced(new Date());

        // Re-render UI
        updateUI();

        console.log("✅ [Phase-1] UI updated with real-time changes");
      }
    }
  );

  // Mark real-time as active in userStore
  currentUser.setScheduleRealTimeActive(true);
}

async function saveStateToStorage() {
  try {
    const user = authManager.getCurrentUser();
    if (!user || !state.users[user.uid]) {
      console.log("⚠️ [Phase-1] No user data to save");
      return;
    }

    console.log("💾 [Phase-1] Saving user schedule...");

    // Convert HomePage format to scheduleData format using ScheduleStorageService
    const homePageData = {
      users: state.users,
      savedAt: new Date().toISOString(),
    };
    const scheduleData =
      scheduleStorageService.convertToFirestoreFormat(homePageData);

    if (scheduleData) {
      // Use ScheduleStorageService for dual storage strategy
      const success = await scheduleStorageService.saveUserSchedule(
        user.uid,
        scheduleData
      );

      if (success) {
        // Update userStore with successful save
        currentUser.setScheduleData(scheduleData);
        currentUser.setScheduleLastSynced(new Date());
        currentUser.clearScheduleError();

        console.log("✅ [Phase-1] Schedule saved successfully");
      } else {
        console.warn("⚠️ [Phase-1] Schedule save failed");
        currentUser.setScheduleError("Failed to save schedule");
      }
    } else {
      console.warn("⚠️ [Phase-1] No schedule data to convert");
    }
  } catch (error) {
    console.error("❌ [Phase-1] Failed to save state:", error);
    currentUser.setScheduleError(error.message);

    if (error.name === "QuotaExceededError") {
      console.warn(
        "[Storage] localStorage quota exceeded - consider clearing old data"
      );
    }
  }
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
    cancelText: "Delete",
    onConfirm: () => {
      return processTimeSlotEdit(slotIndex, activeUserObject);
    },
    onCancel: () => {
      // This will now be the "Delete" action
      showModal({
        title: "Delete Time Slot",
        content: `Are you sure you want to delete the time slot: <strong>${currentTimeSlot.label}</strong>? This will remove it for this user and shift remaining slots. This action cannot be undone.`,
        isHtmlContent: true,
        showConfirmationButtons: true,
        confirmText: "Confirm Delete",
        cancelText: "Cancel",
        onConfirm: () => {
          processTimeSlotDelete(slotIndex, activeUserObject);
          return true; // Close the confirmation modal
        },
      });
      return true; // Close the edit modal
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

/**
 * Processes the deletion of a time slot.
 * @param {number} slotIndex - The index of the time slot to delete.
 * @param {object} activeUserObject - The active user object.
 */
export function processTimeSlotDelete(slotIndex, activeUserObject) {
  if (
    !activeUserObject ||
    !activeUserObject.timeSlots ||
    slotIndex < 0 ||
    slotIndex >= activeUserObject.timeSlots.length
  ) {
    console.error("Invalid data for time slot deletion.");
    showModal({
      title: "Error",
      content: "Could not delete time slot due to an error.",
    });
    return;
  }

  const deletedSlotLabel = activeUserObject.timeSlots[slotIndex].label;

  // Remove the time slot
  activeUserObject.timeSlots.splice(slotIndex, 1);

  // Remove the corresponding column from schedule, pinnedSlots, and slotInfo
  activeUserObject.schedule.forEach((day) => day.splice(slotIndex, 1));
  activeUserObject.pinnedSlots.forEach((day) => day.splice(slotIndex, 1));
  if (activeUserObject.slotInfo) {
    activeUserObject.slotInfo.forEach((day) => day.splice(slotIndex, 1));
  }

  // Persist changes and update UI
  saveStateToStorage();
  updateUI();

  showModal({
    title: "Time Slot Deleted",
    content: `The time slot "${deletedSlotLabel}" has been successfully deleted.`,
  });
}

// --- END: Phase 3 - Editable Time Slot Header Functions ---

function renderScheduleGrid() {
  // Temporarily disable smart logging for debugging - log every call
  console.log("🏗️ renderScheduleGrid called:", {
    compareMode: state.compareMode,
    selectedUserIds: Array.from(state.selectedUserIds),
    activeUserId: state.activeUserId,
    totalLoadedUsers: Object.keys(state.users).length, // Only loaded users
    loadedUserIds: Object.keys(state.users),
    note: "In compare mode, only selected users' data is loaded on-demand"
  });

  if (!DOM_ELEMENTS.scheduleTable) {
    console.error("❌ Schedule table element not found.");
    return;
  }

  // Apply disabled state when no active user is selected AND not in compare mode
  const scheduleWrapper = DOM_ELEMENTS.scheduleWrapper;
  if (scheduleWrapper) {
    const shouldDisable = !state.activeUserId && !state.compareMode;

    if (shouldDisable) {
      scheduleWrapper.classList.add("schedule-disabled");
    } else {
      scheduleWrapper.classList.remove("schedule-disabled");
    }
  }

  const tableBody = DOM_ELEMENTS.scheduleTable.querySelector("tbody");
  if (!tableBody) {
    console.error("Schedule table tbody not found.");
    return;
  }

  let currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
  let allowEditingHeaders = false;
  let usedUnifiedSchedule = false; // Track if unified schedule was used
  let unifiedScheduleInstance = null; // Store the unified schedule instance

  if (state.activeUserId && state.users[state.activeUserId]) {
    const user = state.users[state.activeUserId];
    if (user && user.timeSlots && user.timeSlots.length > 0) {
      currentTimeSlotsToRender = user.timeSlots;
      allowEditingHeaders = true;
    }
  } else if (state.compareMode && state.selectedUserIds.size > 0) {
    // ✅ COMPARE MODE: Only use selectedUserIds, ignore activeUserId completely
    const selectedUsers = Array.from(state.selectedUserIds)
      .map((id) => state.users[id])
      .filter((user) => user);

    if (selectedUsers.length > 0) {
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
        console.log(
          "🔄 Creating unified schedule for heterogeneous time slots"
        );
        unifiedScheduleInstance = createUnifiedSchedule(selectedUsers);
        currentTimeSlotsToRender = unifiedScheduleInstance.unifiedTimeSlots;
        usedUnifiedSchedule = true;
        
        // ✅ FIXED: Add constraint to prevent overflow - limit excessive granular slots
        const MAX_COMPARE_SLOTS = 20; // Reasonable limit for comparison
        if (currentTimeSlotsToRender.length > MAX_COMPARE_SLOTS) {
          console.warn(`⚠️ UnifiedSchedule created ${currentTimeSlotsToRender.length} slots, using fallback`);
          // Fallback to largest user's schedule to prevent UI overflow
          const largestSchedule = selectedUsers.reduce((largest, user) => 
            (user.timeSlots?.length || 0) > (largest.timeSlots?.length || 0) ? user : largest
          );
          currentTimeSlotsToRender = largestSchedule.timeSlots || DEFAULT_TIMESLOTS;
          usedUnifiedSchedule = false; // Don't use unified logic for comparison
          unifiedScheduleInstance = null;
        }
        
        console.log(
          `📊 Unified schedule created with ${currentTimeSlotsToRender.length} granular time slots`
        );
        console.log(
          "🔍 Original user time slot counts:",
          selectedUsers.map((u) => ({
            name: u.name || u.id,
            slots: u.timeSlots?.length || 0,
          }))
        );
      } else {
        console.log("📊 Using homogeneous schedule comparison");
        currentTimeSlotsToRender =
          selectedUsers[0].timeSlots || DEFAULT_TIMESLOTS;
      }
    } else {
      currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
    }
    allowEditingHeaders = false;
  } else if (state.compareMode && state.selectedUserIds.size === 0) {
    // ✅ COMPARE MODE: No users selected - show clean empty grid
    currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
    allowEditingHeaders = false;
  } else {
    currentTimeSlotsToRender = DEFAULT_TIMESLOTS;
    allowEditingHeaders = false;
  }

  // Clear existing table body
  tableBody.innerHTML = "";

  const scheduleMatrixToRender =
    state.activeUserId && state.users[state.activeUserId]
      ? state.users[state.activeUserId].schedule
      : null;

  // Create color assignment for courses (consistent colors)
  const courseColors = {};
  let colorIndex = 1;

  // ✅ FIXED: Cache frequently accessed data for compare mode optimization
  // Only get selected users when in compare mode - no activeUserId mixing
  const selectedUsers =
    state.compareMode && state.selectedUserIds.size > 0
      ? Array.from(state.selectedUserIds)
          .map((id) => state.users[id])
          .filter((user) => user && user.schedule)
      : [];

  // NEW LAYOUT: Each row is a time slot, columns are days
  const fragment = document.createDocumentFragment(); // Use document fragment for better performance

  currentTimeSlotsToRender.forEach((timeSlot, timeIndex) => {
    const row = document.createElement("tr");

    // First cell: Time slot label
    const timeCell = document.createElement("td");
    timeCell.classList.add("time-slot-label");
    timeCell.textContent = timeSlot.label;

    if (allowEditingHeaders) {
      timeCell.classList.add("editable-timeslot-header");
      timeCell.dataset.slotIndex = timeIndex;
      timeCell.title = "Click to edit this time slot";
      timeCell.addEventListener("click", handleTimeSlotHeaderClick);
    }

    row.appendChild(timeCell);

    // Create cells for each day (7 days: Sunday to Saturday) - optimized loop
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dayCell = document.createElement("td");
      dayCell.classList.add("slot");
      dayCell.dataset.day = dayIndex;
      dayCell.dataset.time = timeIndex;

      // Handle compare mode vs normal mode logic
      if (state.compareMode && state.selectedUserIds.size > 0) {
        // COMPARE MODE: Use unified schedule logic for accurate comparison

        // Get selected users for this render cycle - ensure they exist
        const currentSelectedUsers = Array.from(state.selectedUserIds)
          .map((id) => state.users[id])
          .filter((user) => user && user.timeSlots);

        let busyUsers = [],
          freeUsers = [];

        // Only proceed if we have valid selected users
        if (currentSelectedUsers.length > 0) {
          if (usedUnifiedSchedule && unifiedScheduleInstance) {
            // Use UnifiedSchedule class for granular comparison
            const slotStatus = unifiedScheduleInstance.getSlotStatus(
              dayIndex,
              timeIndex
            );
            // ✅ FIXED: Map UnifiedSchedule status to expected format
            busyUsers = slotStatus.busy || [];
            freeUsers = slotStatus.available || [];

            console.log(
              `📊 Unified Grid - slot [${dayIndex}][${timeIndex}] (${timeSlot.label}): ` +
                `${busyUsers.length} busy, ${freeUsers.length} free out of ${currentSelectedUsers.length} total`
            );

            // Add granular time information to the cell for enhanced debugging
            dayCell.dataset.unifiedSlot = "true";
            dayCell.dataset.originalTimeSlot = JSON.stringify({
              start: timeSlot.start,
              end: timeSlot.end,
              label: timeSlot.label,
            });
          } else {
            // Fallback to direct comparison for homogeneous schedules
            busyUsers = currentSelectedUsers.filter((user) => {
              // Ensure schedule data exists for this specific time slot
              if (
                user.schedule &&
                user.schedule[dayIndex] &&
                timeIndex < user.schedule[dayIndex].length &&
                user.schedule[dayIndex][timeIndex] !== undefined
              ) {
                const isBusy = user.schedule[dayIndex][timeIndex];
                console.log(
                  `📊 Direct compare - user ${
                    user.name || user.id
                  } at [${dayIndex}][${timeIndex}]: ${isBusy ? "BUSY" : "FREE"}`
                );
                return isBusy;
              }
              // Only log warning if timeIndex is within expected range
              if (timeIndex < (user.timeSlots?.length || 7)) {
                console.log(
                  `⚠️ Direct compare - user ${
                    user.name || user.id
                  } missing schedule data at [${dayIndex}][${timeIndex}]`
                );
              }
              return false;
            });

            freeUsers = currentSelectedUsers.filter(
              (user) => !busyUsers.includes(user)
            );
          }
        } else {
          // No valid selected users - show empty comparison state
          busyUsers = [];
          freeUsers = [];
        }

        // ✅ FIXED: Apply comparison styling with proper logic and cleanup
        // Clear any previous styling first to prevent conflicts
        dayCell.classList.remove("slot-selected", "slot-free", "slot-conflict", "slot-partial");
        for (let i = 1; i <= 10; i++) {
          dayCell.classList.remove(`color-${i}`);
        }

        if (currentSelectedUsers.length > 0) {
          if (busyUsers.length === 0) {
            // All users free - use green free style
            dayCell.classList.add("slot-free");
            dayCell.title = `All available: ${currentSelectedUsers
              .map((u) => u.name || u.id)
              .join(", ")}`;
          } else if (busyUsers.length === currentSelectedUsers.length) {
            // All users busy - use red busy style
            dayCell.classList.add("slot-conflict");
            dayCell.title = `All busy: ${busyUsers
              .map((u) => u.name || u.id)
              .join(", ")}`;
          } else {
            // Some users busy - use orange partial style
            dayCell.classList.add("slot-partial");
            const busyNames = busyUsers.map((u) => u.name || u.id).join(", ");
            const freeNames = freeUsers.map((u) => u.name || u.id).join(", ");
            dayCell.title = `Mixed: Free (${freeNames}) | Busy (${busyNames})`;
          }
        } else {
          // No users - clean empty state
          dayCell.title = "No users selected for comparison";
        }

        dayCell.dataset.busyUsers = busyUsers.map((u) => u.id).join(",");
        dayCell.dataset.freeUsers = freeUsers.map((u) => u.id).join(",");
      } else if (state.compareMode && state.selectedUserIds.size === 0) {
        // COMPARE MODE: No users selected - show clean empty grid
        dayCell.classList.remove("slot-selected", "slot-free", "slot-conflict", "slot-partial");
        
        // Remove any color classes from previous renders
        for (let i = 1; i <= 10; i++) {
          dayCell.classList.remove(`color-${i}`);
        }
        
        dayCell.title = "Compare mode active - Select friends to compare schedules";
        
        // Clear any previous data attributes
        dayCell.dataset.busyUsers = "";
        dayCell.dataset.freeUsers = "";
        dayCell.dataset.unifiedSlot = "";
        dayCell.dataset.originalTimeSlot = "";
        
        console.log(`🧹 Clean grid slot [${dayIndex}][${timeIndex}] - compare mode with no users selected`);
      } else if (
        !state.compareMode &&
        scheduleMatrixToRender &&
        scheduleMatrixToRender[dayIndex] &&
        scheduleMatrixToRender[dayIndex][timeIndex] !== undefined
      ) {
        // NORMAL MODE: Show individual user's schedule with colors
        const isBusy = scheduleMatrixToRender[dayIndex][timeIndex];

        if (isBusy) {
          dayCell.classList.add("slot-selected");

          // Assign course-based colors for busy slots
          if (
            state.users[state.activeUserId]?.slotInfo?.[dayIndex]?.[timeIndex]
              ?.courseCode
          ) {
            const courseCode =
              state.users[state.activeUserId].slotInfo[dayIndex][timeIndex]
                .courseCode;
            if (!courseColors[courseCode]) {
              courseColors[courseCode] = `color-${colorIndex}`;
              colorIndex = (colorIndex % 10) + 1; // Cycle through 10 colors
            }
            dayCell.classList.add(courseColors[courseCode]);
          } else {
            // Fallback random color
            const fallbackColor = `color-${((dayIndex + timeIndex) % 10) + 1}`;
            dayCell.classList.add(fallbackColor);
          }
        }
      }

      // Pin Rendering Logic for Active User
      if (
        state.activeUserId &&
        !state.compareMode &&
        state.users[state.activeUserId]
      ) {
        const activeUserObject = state.users[state.activeUserId];

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

          const existingPinIndicators = dayCell.querySelectorAll(
            ".pin-indicator, .can-pin-indicator, .pin-square-container"
          );
          existingPinIndicators.forEach((indicator) => indicator.remove());

          if (isSlotPinnedByActiveUser) {
            const pinElement = document.createElement("span");
            pinElement.classList.add("pin-indicator");
            pinElement.innerHTML = "&#128204;";
            pinElement.title = "Pinned by you, Click to unpin";
            pinElement.addEventListener("click", (event) =>
              handlePinSlotClick(dayIndex, timeIndex, event)
            );
            dayCell.appendChild(pinElement);
          } else if (state.pinModeActive && isSlotActuallyFree) {
            const canPinElement = document.createElement("span");
            canPinElement.classList.add("can-pin-indicator");
            canPinElement.innerHTML = "&#43;";
            canPinElement.title = "Click to pin this slot";
            canPinElement.addEventListener("click", (event) =>
              handlePinSlotClick(dayIndex, timeIndex, event)
            );
            dayCell.appendChild(canPinElement);
          }
        }
      }

      // Pin Rendering Logic for Compare Mode
      if (state.compareMode && state.selectedUserIds.size > 0) {
        console.log(
          `📌 Grid pin rendering for compare mode at [${dayIndex}][${timeIndex}]`
        );

        const existingPinIndicators = dayCell.querySelectorAll(
          ".pin-indicator, .can-pin-indicator, .compare-pin-indicator, .pin-square-container"
        );
        existingPinIndicators.forEach((indicator) => indicator.remove());

        const pinData = aggregatePinsForCompareModeTimeBased(
          dayIndex,
          timeIndex,
          state
        );

        console.log(`📌 Grid pin data at [${dayIndex}][${timeIndex}]:`, {
          count: pinData.count,
          userNames: pinData.userNames,
          userIds: pinData.userIds,
        });

        if (pinData.count > 0) {
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

          const pinIcon = document.createElement("span");
          pinIcon.classList.add("pin-icon");
          pinIcon.innerHTML = "&#128204;";

          const pinCount = document.createElement("span");
          pinCount.classList.add("pin-count-number");
          pinCount.textContent = pinData.count;

          pinContainer.appendChild(pinIcon);
          pinContainer.appendChild(pinCount);

          pinContainer.dataset.pinnedByUsers = JSON.stringify(
            pinData.userNames
          );
          pinContainer.dataset.pinnedUserIds = JSON.stringify(pinData.userIds);
          pinContainer.dataset.pinCount = pinData.count;

          pinContainer.addEventListener("click", (event) => {
            event.stopPropagation();
            showPinTooltip(event, pinData);
          });

          pinContainer.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              showPinTooltip(event, pinData);
            }
          });

          dayCell.appendChild(pinContainer);
          console.log(
            `📌 Grid pin container added at [${dayIndex}][${timeIndex}] with ${pinData.count} pins`
          );
        }
      }

      // Course Information Display
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

          dayCell.appendChild(infoContainer);
        }
      }

      row.appendChild(dayCell);
    }

    tableBody.appendChild(row); // Back to direct DOM append to preserve event listeners
  });

  // Apply dynamic styling based on number of time slots
  const slotCount = currentTimeSlotsToRender.length;
  const scheduleTable = DOM_ELEMENTS.scheduleTable;

  // Smart logging for grid completion - only every 5 seconds
  smartLog(
    "gridComplete",
    "🎨 Grid rendering complete:",
    {
      timeSlots: slotCount,
      usedUnifiedSchedule,
      allowEditingHeaders,
      totalCells: slotCount * 7,
      compareMode: state.compareMode,
      selectedUsers: state.selectedUserIds.size,
    },
    5000
  );

  if (slotCount > 8 || (state.compareMode && slotCount > 6)) {
    scheduleTable.classList.add("many-slots");
  } else {
    scheduleTable.classList.remove("many-slots");
  }
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

// Helpers for Pin Mode Button

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
  if (DOM_ELEMENTS.usersSection) {
    // Remove any existing glow class
    DOM_ELEMENTS.usersSection.classList.remove("users-section-glow");

    // Force reflow to ensure the class removal is processed
    DOM_ELEMENTS.usersSection.offsetHeight;

    // Add the glow class to trigger the animation
    DOM_ELEMENTS.usersSection.classList.add("users-section-glow");

    // Remove the class after animation completes (0.6s * 3 repetitions = 1.8s)
    setTimeout(() => {
      DOM_ELEMENTS.usersSection.classList.remove("users-section-glow");
    }, 2000);
  } else {
    console.error("DOM_ELEMENTS.usersSection is null or undefined");
  }
}

function updateUI() {
  // Clear memoization cache when UI updates (state changes)
  memoCache.clear();

  // Smart logging - only log state changes every 2 seconds
  smartLog(
    "updateUI",
    "🔄 updateUI called:",
    {
      viewMode: state.viewMode,
      compareMode: state.compareMode,
      pinModeActive: state.pinModeActive,
      activeUserId: state.activeUserId,
      selectedUserIds: Array.from(state.selectedUserIds),
      totalUsers: Object.keys(state.users).length,
      isMobile: state.isMobile,
    },
    2000
  );

  // Update mobile view controls
  updateViewModeButtons();
  updateViewContainers();

  // Render appropriate view based on current mode
  renderScheduleForCurrentView();
  renderUserList();

  // Toggle pin-mode-active class on body for CSS styling
  document.body.classList.toggle("pin-mode-active", state.pinModeActive);

  // Update day selector if in day view
  if (state.viewMode === "day") {
    updateDaySelector();
  }

  const totalUserCount = Object.keys(state.users).length; // Get total number of users

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

  // Note: Mobile compare mode sync is handled directly in event handlers to prevent circular calls
  console.log(`✅ updateUI completed successfully`);
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
            showConfirmationButtons: true,
            confirmText: "Ok",
            cancelText: "", // Hide cancel button
            onConfirm: () => true, // Just close the modal
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
  const previousActiveUser = state.users[state.activeUserId]?.name;
  const targetUser = state.users[userId]?.name;

  // Deselect Logic
  if (state.activeUserId === userId) {
    state.activeUserId = null;
    state.pinModeActive = false; // Reset pin mode if active user is cleared
    state.selectedUserIds.clear(); // Clear selected user IDs

    console.log("[State] Active user deselected", {
      user: previousActiveUser || userId,
      wasInPinMode: state.pinModeActive,
    });

    saveStateToStorage();
    updateUI();
    return;
  }

  // Select Logic
  if (state.users[userId]) {
    const wasInCompareMode = state.compareMode;
    const selectedCount = state.selectedUserIds.size;

    state.activeUserId = userId;
    state.compareMode = false;
    state.pinModeActive = false;
    state.selectedUserIds.clear();

    console.log("[State] Active user changed", {
      from: previousActiveUser || "none",
      to: targetUser,
      exitedCompareMode: wasInCompareMode,
      clearedSelections: selectedCount,
    });

    saveStateToStorage(); // Save state if active user change implies persistent view change
    updateUI();
  } else if (userId === null && state.activeUserId !== null) {
    // If userId is null, but we have an active user, clear the active user
    state.activeUserId = null;
    state.pinModeActive = false; // Reset pin mode if active user is cleared
    state.selectedUserIds.clear(); // Clear selected user IDs

    console.log("[State] Active user cleared", {
      previousUser: previousActiveUser,
    });

    saveStateToStorage();
    updateUI();
  }
}

function handleToggleCompareMode() {
  const previousActiveUser = state.users[state.activeUserId]?.name;
  const selectedCount = state.selectedUserIds.size;
  const previousCompareMode = state.compareMode;

  state.compareMode = !state.compareMode;

  // Smart logging - only log compare mode changes every 1 second
  smartLog(
    "compareMode",
    "🔄 Toggle compare mode:",
    {
      from: previousCompareMode,
      to: state.compareMode,
      previousActiveUser,
      selectedUserIds: Array.from(state.selectedUserIds),
      selectedCount,
    },
    1000
  );

  // Sync with horizontal friends bar if it exists (without emitting events to prevent loop)
  if (state.horizontalFriendsBar) {
    state.horizontalFriendsBar.syncCompareMode(state.compareMode);
  }

  if (state.compareMode) {
    // ✅ FIXED: Complete separation - activeUserId should be null in compare mode
    state.activeUserId = null; // Clear active user when entering compare mode
    state.pinModeActive = false; // Disable pin mode in compare mode
    state.selectedUserIds.clear(); // Clear selected users when entering compare mode

    console.log("[Mode] Compare Mode ENABLED", {
      previousActiveUser,
      totalUsers: Object.keys(state.users).length,
      clearedSelectedUsers: true,
      clearedActiveUser: true,
      disabledPinMode: true,
    });
  } else {
    // ✅ FIXED: When exiting compare mode, don't auto-select user
    state.selectedUserIds.clear(); // Clear selected user IDs when exiting compare mode
    // activeUserId remains null - user must explicitly select someone after compare mode

    console.log("[Mode] Compare Mode DISABLED", {
      previouslySelected: selectedCount,
      totalUsers: Object.keys(state.users).length,
      clearedSelections: true,
      activeUserRemains: state.activeUserId,
    });
  }

  // Update mobile compare mode for day view
  updateMobileCompareMode();

  updateUI();

  // Smart logging for mode completion - only every 2 seconds
  smartLog(
    "compareModeComplete",
    "✅ Compare mode toggle completed:",
    { newState: state.compareMode },
    2000
  );
}

function handleToggleUserSelectionForCompare(userId) {
  if (!state.compareMode) {
    console.log(
      `⚠️ Attempted to toggle user selection but compare mode is disabled:`,
      {
        userId,
        compareMode: state.compareMode,
      }
    );
    return;
  }

  if (!state.users[userId]) {
    console.log(`❌ Attempted to toggle selection for non-existent user:`, {
      userId,
      availableUsers: Object.keys(state.users),
    });
    return;
  }

  const wasSelected = state.selectedUserIds.has(userId);

  if (wasSelected) {
    state.selectedUserIds.delete(userId);
    console.log(`➖ User deselected for comparison:`, {
      userId,
      userName: state.users[userId]?.name || "unknown",
      remainingSelected: Array.from(state.selectedUserIds),
      totalSelected: state.selectedUserIds.size,
    });
  } else {
    state.selectedUserIds.add(userId);
    console.log(`➕ User selected for comparison:`, {
      userId,
      userName: state.users[userId]?.name || "unknown",
      allSelected: Array.from(state.selectedUserIds),
      totalSelected: state.selectedUserIds.size,
    });
  }

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
   MOBILE SCHEDULE REDESIGN
================================== */

/**
 * Initialize mobile-specific functionality and detect device type
 */
function initializeMobileSchedule() {
  // Detect if user is on mobile device
  state.isMobile = isMobileOrTablet();

  // Set initial view mode based on device and screen size
  if (state.isMobile || window.innerWidth < 768) {
    state.viewMode = "day"; // Default to day view on mobile
  } else {
    state.viewMode = "grid"; // Default to grid view on desktop
  }

  // Set selected day to current day
  state.selectedDay = new Date().getDay();

  // Initialize day selector with current dates
  updateDaySelector();

  // Set up responsive view switching
  setupViewModeToggle();

  // Set up day navigation
  setupDayNavigation();

  // Set up swipe gestures for mobile day navigation
  if (state.isMobile) {
    setupSwipeGestures();
  }

  console.log(
    `📱 Mobile schedule initialized - Device: ${
      state.isMobile ? "Mobile" : "Desktop"
    }, View: ${state.viewMode}, Selected Day: ${getDayName(state.selectedDay)}`
  );
}

/**
 * Update day selector buttons with current week dates and scroll to current day
 */
function updateDaySelector() {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday, 6 = Saturday

  // Calculate the start of current week (Sunday)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - currentDay);

  // Update each day button
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayBtn = DOM_ELEMENTS[`dayBtn${dayIndex}`];
    if (dayBtn) {
      const currentDate = new Date(startOfWeek);
      currentDate.setDate(startOfWeek.getDate() + dayIndex);

      // Update date display
      const dateSpan = dayBtn.querySelector(".day-date");
      if (dateSpan) {
        dateSpan.textContent = currentDate.getDate();
      }

      // Mark today's button
      if (dayIndex === currentDay) {
        dayBtn.classList.add("today");
      } else {
        dayBtn.classList.remove("today");
      }

      // Mark active day
      if (dayIndex === state.selectedDay) {
        dayBtn.classList.add("active");
      } else {
        dayBtn.classList.remove("active");
      }
    }
  }

  // Scroll to current day if in day view mode
  if (state.viewMode === "day") {
    scrollToCurrentDay();
  }
}

/**
 * Scroll the day selector to show the current/selected day
 */
function scrollToCurrentDay() {
  const daySelector = DOM_ELEMENTS.daySelector;
  const currentDayBtn = DOM_ELEMENTS[`dayBtn${state.selectedDay}`];

  if (daySelector && currentDayBtn) {
    // Calculate scroll position to center the current day
    const selectorRect = daySelector.getBoundingClientRect();
    const btnRect = currentDayBtn.getBoundingClientRect();
    const scrollLeft =
      currentDayBtn.offsetLeft - selectorRect.width / 2 + btnRect.width / 2;

    daySelector.scrollTo({
      left: Math.max(0, scrollLeft),
      behavior: "smooth",
    });
  }
}

/**
 * Set up view mode toggle functionality
 */
function setupViewModeToggle() {
  const dayViewBtn = DOM_ELEMENTS.dayViewBtn;
  const gridViewBtn = DOM_ELEMENTS.gridViewBtn;

  if (dayViewBtn) {
    dayViewBtn.addEventListener("click", () => handleViewModeChange("day"));
  }

  if (gridViewBtn) {
    gridViewBtn.addEventListener("click", () => handleViewModeChange("grid"));
  }

  // Set initial state
  updateViewModeButtons();
}

/**
 * Set up day navigation functionality
 */
function setupDayNavigation() {
  // Add click listeners to all day buttons
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayBtn = DOM_ELEMENTS[`dayBtn${dayIndex}`];
    if (dayBtn) {
      dayBtn.addEventListener("click", () => handleDayChange(dayIndex));
    }
  }

  // Add keyboard navigation
  if (DOM_ELEMENTS.daySelector) {
    DOM_ELEMENTS.daySelector.addEventListener(
      "keydown",
      handleDayKeyNavigation
    );
  }
}

/**
 * Set up swipe gestures for mobile day navigation
 */
function setupSwipeGestures() {
  if (!DOM_ELEMENTS.scheduleDayView) return;

  let touchStartX = 0;
  let touchEndX = 0;

  DOM_ELEMENTS.scheduleDayView.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  });

  DOM_ELEMENTS.scheduleDayView.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture();
  });

  function handleSwipeGesture() {
    const swipeDistance = touchEndX - touchStartX;
    const minSwipeDistance = 50; // Minimum distance for a valid swipe

    if (Math.abs(swipeDistance) > minSwipeDistance) {
      if (swipeDistance > 0) {
        // Swipe right - go to previous day
        navigateDay(-1);
      } else {
        // Swipe left - go to next day
        navigateDay(1);
      }
    }
  }
}

/**
 * Handle view mode changes (day/grid)
 */
function handleViewModeChange(newViewMode) {
  if (state.viewMode === newViewMode) return;

  state.viewMode = newViewMode;

  // Update UI elements
  updateViewModeButtons();
  updateViewContainers();

  // Update schedule rendering
  renderScheduleForCurrentView();

  // Add body class for CSS targeting
  document.body.classList.toggle("day-view-active", newViewMode === "day");
  document.body.classList.toggle("grid-view-active", newViewMode === "grid");

  console.log(`📱 View mode changed to: ${newViewMode}`);
}

/**
 * Handle day navigation
 */
function handleDayChange(dayIndex) {
  if (state.selectedDay === dayIndex) return;

  state.selectedDay = dayIndex;

  // Update day selector UI
  updateDaySelector();

  // Re-render day view if in day mode
  if (state.viewMode === "day") {
    renderDayView();
  }

  console.log(`📅 Day changed to: ${getDayName(dayIndex)}`);
}

/**
 * Navigate to relative day (previous/next)
 */
function navigateDay(direction) {
  const newDay = (state.selectedDay + direction + 7) % 7; // Wrap around week
  handleDayChange(newDay);
}

/**
 * Handle keyboard navigation for days
 */
function handleDayKeyNavigation(e) {
  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      navigateDay(-1);
      break;
    case "ArrowRight":
      e.preventDefault();
      navigateDay(1);
      break;
    case "Home":
      e.preventDefault();
      handleDayChange(0); // Sunday
      break;
    case "End":
      e.preventDefault();
      handleDayChange(6); // Saturday
      break;
  }
}

/**
 * Update view mode button states
 */
function updateViewModeButtons() {
  const dayViewBtn = DOM_ELEMENTS.dayViewBtn;
  const gridViewBtn = DOM_ELEMENTS.gridViewBtn;

  if (dayViewBtn) {
    dayViewBtn.classList.toggle("active", state.viewMode === "day");
  }

  if (gridViewBtn) {
    gridViewBtn.classList.toggle("active", state.viewMode === "grid");
  }
}

/**
 * Update view container visibility
 */
function updateViewContainers() {
  const dayView = DOM_ELEMENTS.scheduleDayView;
  const gridView = DOM_ELEMENTS.scheduleGridView;
  const daySelector = DOM_ELEMENTS.daySelectorContainer;

  if (dayView) {
    dayView.classList.toggle("active", state.viewMode === "day");
  }

  if (gridView) {
    gridView.classList.toggle("active", state.viewMode === "grid");
  }

  if (daySelector) {
    daySelector.classList.toggle("show", state.viewMode === "day");
  }
}

/**
 * Render schedule for current view mode
 */
function renderScheduleForCurrentView() {
  if (state.viewMode === "day") {
    renderDayView();
  } else {
    renderScheduleGrid(); // Use existing grid rendering
  }
}

/**
 * Render the day view for the selected day
 */
function renderDayView() {
  console.log(`📅 renderDayView called:`, {
    selectedDay: state.selectedDay,
    dayName: getDayName(state.selectedDay),
    compareMode: state.compareMode,
    selectedUserIds: Array.from(state.selectedUserIds),
    activeUserId: state.activeUserId,
    totalUsers: Object.keys(state.users).length,
  });

  const container = DOM_ELEMENTS.dayViewContainer;
  if (!container) {
    console.error("❌ Day view container not found");
    return;
  }

  // Clear existing content
  container.innerHTML = "";

  // Get current active user or show empty state
  const activeUser = state.activeUserId
    ? state.users[state.activeUserId]
    : null;
  const timeSlots = activeUser?.timeSlots || DEFAULT_TIMESLOTS;
  console.log(`📊 Day view data source:`, {
    activeUser: activeUser
      ? { id: activeUser.id, name: activeUser.name }
      : null,
    timeSlotCount: timeSlots.length,
    usingDefaultSlots: !activeUser?.timeSlots,
  });

  // Generate time slots for the selected day
  timeSlots.forEach((timeSlot, timeIndex) => {
    const slotElement = createDayViewTimeSlot(timeSlot, timeIndex, activeUser);
    container.appendChild(slotElement);
  });

  console.log(
    `✅ Day view rendered for ${getDayName(state.selectedDay)} with ${
      timeSlots.length
    } time slots`
  );
}

/**
 * Create a time slot element for day view
 */
function createDayViewTimeSlot(timeSlot, timeIndex, user) {
  const slotDiv = document.createElement("div");
  slotDiv.className = "day-time-slot";
  slotDiv.dataset.timeIndex = timeIndex;
  slotDiv.dataset.day = state.selectedDay;

  // Handle compare mode vs normal mode
  if (state.compareMode && state.selectedUserIds.size > 0) {
    slotDiv.classList.add("compare-mode");

    console.log(
      `🎭 Day view compare mode - slot ${timeIndex} on ${getDayName(
        state.selectedDay
      )}:`,
      {
        selectedUserIds: Array.from(state.selectedUserIds),
        selectedUsersCount: state.selectedUserIds.size,
      }
    );

    // Get comparison status and apply appropriate class
    const comparisonStatus = getSlotComparisonStatus(
      state.selectedDay,
      timeIndex
    );
    slotDiv.classList.add(comparisonStatus.cssClass);

    console.log(`🎨 Day view comparison status for slot ${timeIndex}:`, {
      cssClass: comparisonStatus.cssClass,
      text: comparisonStatus.text,
      tooltip: comparisonStatus.tooltip,
    });

    // Apply glass-orange for mixed availability
    if (comparisonStatus.cssClass === "mixed-availability") {
      slotDiv.classList.add("mixed-availability");
      console.log(
        `🟡 Day view applying mixed-availability glass-orange styling to slot ${timeIndex}`
      );
    }

    slotDiv.innerHTML = createCompareSlotContent(timeSlot, timeIndex);
  } else if (state.compareMode && state.selectedUserIds.size === 0) {
    slotDiv.classList.add("compare-mode");
    slotDiv.innerHTML = createCompareSlotContent(timeSlot, timeIndex);
  } else {
    // Normal mode - individual user schedule
    const isBusy = user?.schedule?.[state.selectedDay]?.[timeIndex] || false;
    const isPinned =
      user?.pinnedSlots?.[state.selectedDay]?.[timeIndex] || false;
    const slotInfo = user?.slotInfo?.[state.selectedDay]?.[timeIndex];

    slotDiv.classList.toggle("busy", isBusy);
    slotDiv.classList.toggle("free", !isBusy);
    slotDiv.classList.toggle("pinned", isPinned);

    slotDiv.innerHTML = createNormalSlotContent(timeSlot, isBusy, slotInfo);
  }

  // Add click handler
  slotDiv.addEventListener("click", () => {
    if (state.pinModeActive && !state.compareMode) {
      handlePinSlotClick(state.selectedDay, timeIndex, event);
    } else if (!state.compareMode) {
      handleToggleScheduleSlot(state.selectedDay, timeIndex);
    }
  });

  return slotDiv;
}

/**
 * Create normal slot content (non-compare mode)
 */
function createNormalSlotContent(timeSlot, isBusy, slotInfo) {
  return `
    <div class="slot-time">${timeSlot.label}</div>
    <div class="slot-content">
      ${
        isBusy && slotInfo
          ? `
        <div class="slot-course-code">${slotInfo.courseCode || "Busy"}</div>
        <div class="slot-classroom">${slotInfo.classroomNumber || ""}</div>
      `
          : `
        <div class="slot-free-text">Free</div>
      `
      }
    </div>
  `;
}

/**
 * Create compare mode slot content with avatars
 */
function createCompareSlotContent(timeSlot, timeIndex) {
  const comparisonStatus = getSlotComparisonStatus(
    state.selectedDay,
    timeIndex
  );
  const avatarContent = generateAvatarsForCompareSlot(
    state.selectedDay,
    timeIndex
  );

  return `
    <div class="slot-time">${timeSlot.label}</div>
    <div class="slot-content">
      <div class="slot-comparison-status ${comparisonStatus.cssClass}" title="${comparisonStatus.tooltip}">
        <div class="comparison-indicator">
          <i class="${comparisonStatus.icon}"></i>
          <span class="comparison-text">${comparisonStatus.text}</span>
        </div>
      </div>
      <div class="slot-avatar-container">
        ${avatarContent}
      </div>
    </div>
  `;
}

/**
 * Determines the comparison status for a time slot across all selected users
 * @param {number} dayIndex - Day of the week (0-6)
 * @param {number} timeIndex - Time slot index
 * @returns {Object} Status object with cssClass, icon, text, tooltip, and details
 */
function getSlotComparisonStatus(dayIndex, timeIndex) {
  if (!state.compareMode || state.selectedUserIds.size === 0) {
    return {
      cssClass: "no-comparison",
      icon: "fas fa-question",
      text: "No comparison",
      tooltip: "Select friends to compare schedules",
      details: "No users selected for comparison",
    };
  }

  // Get all selected users
  const selectedUsers = Array.from(state.selectedUserIds)
    .map((id) => state.users[id])
    .filter((user) => user);

  if (selectedUsers.length === 0) {
    return {
      cssClass: "no-users",
      icon: "fas fa-user-slash",
      text: "No users",
      tooltip: "No valid users found for comparison",
      details: "Unable to load user data",
    };
  }

  // Count busy vs free users
  const busyUsers = selectedUsers.filter((user) => {
    if (
      user.schedule &&
      user.schedule[dayIndex] &&
      user.schedule[dayIndex][timeIndex] !== undefined
    ) {
      return user.schedule[dayIndex][timeIndex];
    }
    return false;
  });
  const freeUsers = selectedUsers.filter((user) => !busyUsers.includes(user));

  // Determine status based on availability
  if (busyUsers.length === 0) {
    // Everyone is free - GREEN
    return {
      cssClass: "all-free",
      icon: "fas fa-check-circle",
      text: "All Available",
      tooltip: `All ${selectedUsers.length} users are available`,
      details: freeUsers.map((u) => u.name).join(", "),
    };
  } else if (freeUsers.length === 0) {
    // Everyone is busy - RED
    return {
      cssClass: "all-busy",
      icon: "fas fa-times-circle",
      text: "All Busy",
      tooltip: `All ${selectedUsers.length} users are busy`,
      details: busyUsers
        .map(
          (u) =>
            `${u.name}${
              u.slotInfo?.[dayIndex]?.[timeIndex]?.courseCode
                ? ` (${u.slotInfo[dayIndex][timeIndex].courseCode})`
                : ""
            }`
        )
        .join(", "),
    };
  } else {
    // Mixed availability - ORANGE
    return {
      cssClass: "mixed-availability",
      icon: "fas fa-exclamation-triangle",
      text: "Partial",
      tooltip: `${freeUsers.length} available, ${busyUsers.length} busy`,
      details: `Free: ${freeUsers
        .map((u) => u.name)
        .join(", ")} | Busy: ${busyUsers.map((u) => u.name).join(", ")}`,
    };
  }
}

/**
 * Generate avatars for compare mode slot - only show users who are free
 */
function generateAvatarsForCompareSlot(dayIndex, timeIndex) {
  if (!state.compareMode || state.selectedUserIds.size === 0) {
    console.log(
      `⚠️ Avatar generation called but compare mode disabled or no users selected:`,
      {
        compareMode: state.compareMode,
        selectedCount: state.selectedUserIds.size,
      }
    );
    return '<span class="empty-slot-message">Select friends to compare</span>';
  }

  console.log(`🎭 Generating avatars for day ${dayIndex}, time ${timeIndex}:`, {
    selectedUserIds: Array.from(state.selectedUserIds),
    compareMode: state.compareMode,
  });

  const selectedUsers = Array.from(state.selectedUserIds)
    .map((id) => state.users[id])
    .filter((user) => user);

  console.log(`👥 Selected users found:`, {
    requestedIds: Array.from(state.selectedUserIds),
    foundUsers: selectedUsers.map((u) => ({ id: u.id, name: u.name || u.id })),
    missingCount: state.selectedUserIds.size - selectedUsers.length,
  });

  if (selectedUsers.length === 0) {
    console.log(`❌ No valid users found for avatar generation`);
    return '<span class="empty-slot-message">No users selected</span>';
  }

  // Filter to only free users
  const freeUsers = selectedUsers.filter((user) => {
    const isBusy = user.schedule?.[dayIndex]?.[timeIndex] || false;
    console.log(
      `📊 User ${user.name || user.id} at [${dayIndex}][${timeIndex}]: ${
        isBusy ? "BUSY" : "FREE"
      }`,
      {
        hasSchedule: !!user.schedule,
        hasDaySchedule: !!user.schedule?.[dayIndex],
        hasTimeSlot: user.schedule?.[dayIndex]?.[timeIndex] !== undefined,
        slotValue: user.schedule?.[dayIndex]?.[timeIndex],
      }
    );
    return !isBusy;
  });

  console.log(`✅ Free users for avatars at [${dayIndex}][${timeIndex}]:`, {
    freeUsers: freeUsers.map((u) => u.name || u.id),
    freeCount: freeUsers.length,
    totalCount: selectedUsers.length,
  });

  if (freeUsers.length === 0) {
    console.log(
      `❌ No free users available for avatars at [${dayIndex}][${timeIndex}]`
    );
    return '<span class="empty-slot-message">No one available</span>';
  }

  let avatarsHTML = "";
  const maxVisible = 5; // Maximum avatars to show before overflow

  freeUsers.slice(0, maxVisible).forEach((user, index) => {
    const avatarUrl = generateAvatar(user.name || user.id);
    console.log(
      `🎨 Creating avatar ${index + 1}/${Math.min(
        freeUsers.length,
        maxVisible
      )} for ${user.name || user.id}:`,
      avatarUrl
    );

    avatarsHTML += `
      <div class="friend-avatar" data-friend-id="${user.id}">
        <img src="${avatarUrl}" alt="${user.name || user.id}" />
        <div class="avatar-label">${user.name || user.id}</div>
      </div>
    `;
  });

  // Add overflow indicator if needed
  if (freeUsers.length > maxVisible) {
    const remainingCount = freeUsers.length - maxVisible;
    console.log(
      `➕ Adding overflow indicator for ${remainingCount} additional users`
    );
    avatarsHTML += `
      <div class="avatar-overflow">+${remainingCount}</div>
    `;
  }

  console.log(
    `✅ Avatar HTML generated for ${freeUsers.length} free users (${Math.min(
      freeUsers.length,
      maxVisible
    )} visible)`
  );
  return avatarsHTML;
}

/**
 * Generate avatar URL for a given name
 */
function generateAvatar(name) {
  // Use dicebear API for consistent avatars
  const encodedName = encodeURIComponent(name);
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodedName}&backgroundColor=7c4dff`;
}

/**
 * Get day name from index
 */
function getDayName(dayIndex) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[dayIndex] || "Unknown";
}

/**
 * Update mobile schedule when compare mode changes
 */
function updateMobileCompareMode() {
  console.log(`📱 Updating mobile compare mode:`, {
    viewMode: state.viewMode,
    compareMode: state.compareMode,
    selectedUserIds: Array.from(state.selectedUserIds),
    selectedCount: state.selectedUserIds.size,
  });

  if (state.viewMode === "day") {
    console.log(`📅 Re-rendering day view for compare mode change`);
    renderDayView(); // Re-render day view with compare mode changes
  } else {
    console.log(
      `📊 View mode is ${state.viewMode}, grid view will be updated by updateUI()`
    );
  }

  // Sync with horizontal friends bar compare mode (without emitting events to prevent infinite loop)
  if (state.horizontalFriendsBar) {
    console.log(
      `🔗 Syncing horizontal friends bar with compare mode: ${state.compareMode}`
    );
    state.horizontalFriendsBar.syncCompareMode(state.compareMode);
  } else {
    console.log(`⚠️ No horizontal friends bar available for sync`);
  }
}

/* ================================
   AUTHENTICATION UI MANAGEMENT
================================== */

/**
 * Initialize HomePage when loaded by the SPA router
 */
document.addEventListener("spa:page:load", (event) => {
  const { route } = event.detail;

  if (route === "home") {
    console.log("🏠 HomePage loaded - initializing mobile schedule");

    // Initialize mobile schedule functionality
    setTimeout(() => {
      initializeMobileSchedule();

      // Load existing state and setup UI
      loadState();
      setupEventListeners();
      setupInputValidation();
      updateUI();

      // Initialize friends bar if user is authenticated
      if (currentUser?.profile) {
        initializeHorizontalFriendsBar();
      }

      // Setup authentication callbacks
      setupAuthenticationCallbacks();

      console.log("✅ HomePage initialization complete");
    }, 100); // Small delay to ensure DOM elements are ready
  }
});

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
        navigateTo("profile");
      } else {
        // Profile is complete, navigate to main schedule screen
        console.log(
          "✅ Profile complete, navigating to home/schedule screen..."
        );
        navigateTo("home");
      }
    } catch (error) {
      console.error("Error checking profile completion after sign-in:", error);
      // On error, navigate to home to avoid getting stuck in profile setup
      // Users can manually navigate to profile setup if needed
      console.log("⚠️ Error occurred, navigating to home for safety...");
      navigateTo("home");
    }
  });

  // Set up sign-in error callback for better error handling
  authManager.setSigninErrorCallback((data) => {
    console.error("❌ Sign-in failed:", data.error.message);
    // The auth modal will handle showing the error to the user
  });
}

/* ================================
   PHASE-3: HORIZONTAL FRIENDS BAR
================================== */

/**
 * Initialize the Horizontal Friends Bar component
 */
async function initializeHorizontalFriendsBar() {
  try {
    console.log("🔍 DEBUG INIT: initializeHorizontalFriendsBar called");
    console.log(
      "🔍 DEBUG INIT: Current user authenticated:",
      !!currentUser?.profile
    );
    console.log(
      "🔍 DEBUG INIT: Current horizontalFriendsBar exists:",
      !!state.horizontalFriendsBar
    );

    // Check if user is authenticated
    if (!currentUser?.profile) {
      console.log(
        "⚠️ User not authenticated, skipping friends bar initialization"
      );
      return;
    }

    // Prevent double initialization
    if (state.horizontalFriendsBar) {
      console.log(
        "⚠️ DOUBLE INIT PREVENTED: Horizontal Friends Bar already initialized, skipping"
      );
      return;
    }

    console.log("🚀 Creating new HorizontalFriendsBar instance...");
    // Create and initialize the HorizontalFriendsBar component
    state.horizontalFriendsBar = new HorizontalFriendsBar(
      "horizontal-friends-container"
    );
    await state.horizontalFriendsBar.init();

    // Set up event listeners for friends bar events
    setupFriendsBarEventListeners();

    console.log("✅ Horizontal Friends Bar initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Horizontal Friends Bar:", error);
  }
}

/**
 * Set up event listeners for Horizontal Friends Bar events
 */
function setupFriendsBarEventListeners() {
  // Remove any existing listeners first to prevent duplicates
  document.removeEventListener("schedule:change", handleFriendScheduleChange);
  document.removeEventListener("compare:mode", handleCompareModeChange);
  document.removeEventListener(
    "compare:selection",
    handleCompareSelectionChange
  );

  // Listen for schedule change events (when user clicks friend avatar)
  document.addEventListener("schedule:change", handleFriendScheduleChange);

  // Listen for compare mode events
  document.addEventListener("compare:mode", handleCompareModeChange);
  document.addEventListener("compare:selection", handleCompareSelectionChange);

  console.log("✅ Friends bar event listeners set up (duplicates prevented)");
}

/**
 * Handle friend schedule change events from horizontal bar
 */
async function handleFriendScheduleChange(event) {
  const { friendId, friendName, isUserSchedule, isEmptySchedule } =
    event.detail;

  console.log(`📅 Schedule change requested:`, {
    friendId,
    friendName,
    isUserSchedule,
    isEmptySchedule,
  });

  // Store previous state for cleanup
  const previousFriendId = state.currentViewingFriendId;

  if (isEmptySchedule) {
    // Show empty schedule (no avatars selected)
    console.log("🔄 DEBUG: Showing empty schedule (no selection)");

    state.currentViewingFriendId = null;
    state.activeUserId = null;

    // Clean up any temporary friend user objects
    if (previousFriendId && state.users[previousFriendId]) {
      delete state.users[previousFriendId];
      console.log(
        `🧹 DEBUG: Cleaned up temporary friend user object for ${previousFriendId}`
      );
    }

    // Hide schedule owner indicator
    updateScheduleOwnerIndicator(null, false);

    console.log("📋 Showing empty schedule state");
  } else if (isUserSchedule) {
    // Switch back to user's own schedule
    console.log("🔄 DEBUG: Switching to user's own schedule");

    state.currentViewingFriendId = null;
    state.activeUserId = currentUser?.user?.uid || null;

    // Clean up any temporary friend user objects
    if (previousFriendId && state.users[previousFriendId]) {
      delete state.users[previousFriendId];
      console.log(
        `🧹 DEBUG: Cleaned up temporary friend user object for ${previousFriendId}`
      );
    }

    // Hide schedule owner indicator
    updateScheduleOwnerIndicator(null, false);

    console.log("👤 Switched to user's own schedule");
  } else {
    // Load friend's schedule
    console.log(`🔄 DEBUG: Switching to ${friendName}'s schedule`);

    // Clean up previous friend if different
    if (
      previousFriendId &&
      previousFriendId !== friendId &&
      state.users[previousFriendId]
    ) {
      delete state.users[previousFriendId];
      console.log(
        `🧹 DEBUG: Cleaned up previous friend user object for ${previousFriendId}`
      );
    }

    await loadFriendSchedule(friendId, friendName);
  }

  // Update UI to reflect the change
  updateUI();

  console.log(
    `✅ Schedule change completed - now viewing: ${
      isEmptySchedule ? "Empty Schedule" : isUserSchedule ? "User" : friendName
    }`
  );
}

/**
 * Load and display a friend's schedule
 */
async function loadFriendSchedule(friendId, friendName) {
  try {
    console.log(`📊 Loading schedule for friend: ${friendName} (${friendId})`);

    // Validate input parameters
    if (!friendId || !friendName) {
      console.error(
        `❌ DEBUG: Invalid parameters - friendId: ${friendId}, friendName: ${friendName}`
      );
      showScheduleLoadError(friendName || "Unknown Friend");
      return;
    }

    // Check cache first
    if (state.friendsScheduleData.has(friendId)) {
      console.log("📋 Using cached schedule data");
      const cachedData = state.friendsScheduleData.get(friendId);

      // Validate cached data
      if (cachedData && typeof cachedData === "object") {
        displayFriendSchedule(cachedData, friendName, friendId);
        return;
      } else {
        console.warn("⚠️ DEBUG: Cached data is invalid, removing from cache");
        state.friendsScheduleData.delete(friendId);
      }
    }

    // Load schedule from Firestore
    const friendScheduleData = await dataManager.getUserSchedule(friendId);

    console.log(
      `🔍 DEBUG: Friend schedule data structure:`,
      friendScheduleData
    );

    // Validate the returned data
    if (!friendScheduleData || typeof friendScheduleData !== "object") {
      console.log(`⚠️ ${friendName} has no schedule data`);
      showNoScheduleMessage(friendName);
      return;
    }

    // Check if schedule exists and has valid structure
    if (
      !friendScheduleData.schedule ||
      typeof friendScheduleData.schedule !== "object"
    ) {
      console.log(`⚠️ ${friendName} has no schedule matrix data`);
      showNoScheduleMessage(friendName);
      return;
    }

    console.log(
      `📅 DEBUG: Friend schedule matrix:`,
      friendScheduleData.schedule
    );
    console.log(`📝 DEBUG: Friend slot info:`, friendScheduleData.slotInfo);
    console.log(`⏰ DEBUG: Friend time slots:`, friendScheduleData.timeSlots);

    // Validate schedule matrix structure
    let hasScheduleData = false;
    if (typeof friendScheduleData.schedule === "object") {
      for (let day = 0; day < 7; day++) {
        const dayData = friendScheduleData.schedule[day.toString()];
        if (dayData && typeof dayData === "object") {
          for (const slot in dayData) {
            if (dayData[slot] === true || dayData[slot] === "true") {
              hasScheduleData = true;
              break;
            }
          }
          if (hasScheduleData) break;
        }
      }
    }

    if (!hasScheduleData) {
      console.log(`⚠️ ${friendName} has empty schedule (no scheduled classes)`);
      showNoScheduleMessage(friendName);
      return;
    }

    // Cache the valid schedule data
    state.friendsScheduleData.set(friendId, friendScheduleData);

    // Clear memoization and matrix caches since we have new friend schedule data
    memoCache.clear();
    matrixCache.clear();
    console.log(
      "🧹 Cleared memoization and matrix caches after caching new friend schedule data"
    );

    // Display the friend's schedule
    displayFriendSchedule(friendScheduleData, friendName, friendId);

    console.log(`✅ Successfully loaded ${friendName}'s schedule`);
  } catch (error) {
    console.error(`❌ Failed to load ${friendName}'s schedule:`, error);

    // Provide specific error messages based on error type
    if (error.message && error.message.includes("permission")) {
      console.error(`❌ Permission denied accessing ${friendName}'s schedule`);
      showScheduleLoadError(friendName, "Permission denied");
    } else if (error.message && error.message.includes("network")) {
      console.error(`❌ Network error loading ${friendName}'s schedule`);
      showScheduleLoadError(friendName, "Network error");
    } else {
      showScheduleLoadError(friendName);
    }
  }
}

/**
 * Display a friend's schedule in the schedule grid
 */
function displayFriendSchedule(scheduleData, friendName, friendId) {
  console.log(`🔧 DEBUG: displayFriendSchedule called with:`, {
    friendName,
    friendId,
    hasSchedule: !!scheduleData?.schedule,
    hasSlotInfo: !!scheduleData?.slotInfo,
    hasTimeSlots: !!scheduleData?.timeSlots,
  });

  try {
    // Convert Firestore format to HomePage format
    const convertedScheduleData =
      convertFirestoreToHomePageFormat(scheduleData);

    if (!convertedScheduleData) {
      console.warn(
        `⚠️ DEBUG: Failed to convert schedule data for ${friendName}`
      );
      showNoScheduleMessage(friendName);
      return;
    }

    console.log(`🔄 DEBUG: Converted schedule data:`, convertedScheduleData);

    // Validate converted data structure
    if (
      !Array.isArray(convertedScheduleData.schedule) ||
      !Array.isArray(convertedScheduleData.slotInfo) ||
      !Array.isArray(convertedScheduleData.timeSlots)
    ) {
      console.error(
        `❌ DEBUG: Invalid converted data structure for ${friendName}`
      );
      showScheduleLoadError(friendName);
      return;
    }

    // Update state to reflect viewing friend's schedule
    state.currentViewingFriendId = friendId;
    state.activeUserId = null; // Clear active user since we're viewing friend

    // Create friend user object with converted data
    const friendUser = {
      id: friendId,
      name: friendName,
      timeSlots: convertedScheduleData.timeSlots,
      schedule: convertedScheduleData.schedule,
      slotInfo: convertedScheduleData.slotInfo,
      pinnedSlots:
        convertedScheduleData.pinnedSlots ||
        createWeeklyMatrix(convertedScheduleData.timeSlots.length, false),
    };

    console.log(`🔧 DEBUG: Created friend user object:`, friendUser);

    // Validate friend user object
    if (
      !friendUser.schedule.length ||
      !friendUser.slotInfo.length ||
      !friendUser.timeSlots.length
    ) {
      console.error(`❌ DEBUG: Invalid friend user object for ${friendName}`);
      showNoScheduleMessage(friendName);
      return;
    }

    // Add friend to users state temporarily for rendering
    state.users[friendId] = friendUser;
    state.activeUserId = friendId;

    // Clear memoization and matrix caches since we're switching to view friend's schedule
    memoCache.clear();
    matrixCache.clear();
    console.log(
      "🧹 Cleared memoization and matrix caches when switching to friend view"
    );

    console.log(`🔧 DEBUG: Updated state:`, {
      currentViewingFriendId: state.currentViewingFriendId,
      activeUserId: state.activeUserId,
      usersCount: Object.keys(state.users).length,
    });

    // Show schedule owner indicator
    updateScheduleOwnerIndicator(friendName, true);

    console.log(`🎨 Displaying ${friendName}'s schedule in UI`);

    // Force UI update to render the friend's schedule
    updateUI();
  } catch (error) {
    console.error(
      `❌ DEBUG: Error displaying friend schedule for ${friendName}:`,
      error
    );
    showScheduleLoadError(friendName);
  }
}

/**
 * Updates the schedule owner indicator to show whose schedule is currently displayed
 * @param {string} friendName - Name of the friend whose schedule is being viewed
 * @param {boolean} isFriendSchedule - Whether viewing a friend's schedule (true) or user's own (false)
 */
function updateScheduleOwnerIndicator(friendName, isFriendSchedule) {
  const indicator = document.getElementById("schedule-owner-indicator");
  if (!indicator) return;

  if (isFriendSchedule) {
    // Show friend's name in indicator
    const nameSpan = indicator.querySelector(".owner-name");
    if (nameSpan) {
      nameSpan.textContent = `${friendName}'s Schedule`;
    }
    indicator.style.display = "flex";
    console.log(
      `📋 Schedule owner indicator showing: ${friendName}'s Schedule`
    );
  } else {
    // Hide indicator when viewing own schedule
    indicator.style.display = "none";
    console.log(`📋 Schedule owner indicator hidden (viewing own schedule)`);
  }
}

/**
 * Converts Firestore schedule data format (maps) to HomePage format (arrays)
 * @param {Object} firestoreScheduleData - Schedule data from Firestore with map format
 * @returns {Object} - Schedule data in HomePage array format
 */
function convertFirestoreToHomePageFormat(firestoreScheduleData) {
  if (!firestoreScheduleData) {
    console.warn("⚠️ DEBUG: No schedule data provided to convert");
    return null;
  }

  try {
    // Validate and set timeSlots once
    const timeSlots =
      Array.isArray(firestoreScheduleData.timeSlots) &&
      firestoreScheduleData.timeSlots.length > 0
        ? firestoreScheduleData.timeSlots
        : DEFAULT_TIMESLOTS;

    const numSlots = timeSlots.length;

    // Pre-initialize arrays for better performance
    const schedule = new Array(7);
    const slotInfo = new Array(7);
    const pinnedSlots = new Array(7);

    // Single loop to process all three data structures
    for (let day = 0; day < 7; day++) {
      const dayStr = day.toString();

      // Process schedule data
      const daySchedule = firestoreScheduleData.schedule?.[dayStr];
      schedule[day] = new Array(numSlots);
      if (daySchedule && typeof daySchedule === "object") {
        for (let slot = 0; slot < numSlots; slot++) {
          schedule[day][slot] = Boolean(daySchedule[slot.toString()]);
        }
      } else {
        schedule[day].fill(false);
      }

      // Process slotInfo data
      const daySlotInfo = firestoreScheduleData.slotInfo?.[dayStr];
      slotInfo[day] = new Array(numSlots);
      if (daySlotInfo && typeof daySlotInfo === "object") {
        for (let slot = 0; slot < numSlots; slot++) {
          const slotData = daySlotInfo[slot.toString()];
          slotInfo[day][slot] =
            slotData && typeof slotData === "object"
              ? {
                  courseCode: slotData.courseCode || "",
                  classroomNumber: slotData.classroomNumber || "",
                }
              : { courseCode: "", classroomNumber: "" };
        }
      } else {
        // Fix: Properly fill array with default objects
        for (let slot = 0; slot < numSlots; slot++) {
          slotInfo[day][slot] = { courseCode: "", classroomNumber: "" };
        }
      }

      // Process pinnedSlots data
      const dayPins = firestoreScheduleData.pinnedSlots?.[dayStr];
      pinnedSlots[day] = new Array(numSlots);
      if (dayPins && typeof dayPins === "object") {
        for (let slot = 0; slot < numSlots; slot++) {
          pinnedSlots[day][slot] = Boolean(dayPins[slot.toString()]);
        }
      } else {
        pinnedSlots[day].fill(false);
      }
    }

    return { timeSlots, schedule, slotInfo, pinnedSlots };
  } catch (error) {
    console.error("❌ DEBUG: Error converting Firestore data:", error);

    // Return optimized fallback structure
    const fallbackTimeSlots = DEFAULT_TIMESLOTS;
    const numSlots = fallbackTimeSlots.length;
    return {
      timeSlots: fallbackTimeSlots,
      schedule: createWeeklyMatrix(numSlots, false),
      slotInfo: createWeeklyMatrix(numSlots, () => ({
        courseCode: "",
        classroomNumber: "",
      })),
      pinnedSlots: createWeeklyMatrix(numSlots, false),
    };
  }
}

/**
 * Show message when friend has no schedule
 */
function showNoScheduleMessage(friendName) {
  // Clear the schedule grid and show message
  state.activeUserId = null;
  state.currentViewingFriendId = null;

  // Hide schedule owner indicator
  updateScheduleOwnerIndicator(null, false);

  // Show notification
  const notificationManager = window.notificationManager || {
    showSystemNotification: (msg) => console.log(msg),
  };

  notificationManager.showSystemNotification(
    `No schedule was set by ${friendName}`,
    "info",
    4000
  );
}

/**
 * Show error message when schedule loading fails
 */
function showScheduleLoadError(friendName, errorType = null) {
  // Hide schedule owner indicator on error
  updateScheduleOwnerIndicator(null, false);

  const notificationManager = window.notificationManager || {
    showSystemNotification: (msg) => console.log(msg),
  };

  let errorMessage;
  switch (errorType) {
    case "Permission denied":
      errorMessage = `Permission denied: Cannot access ${friendName}'s schedule`;
      break;
    case "Network error":
      errorMessage = `Network error: Could not load ${friendName}'s schedule`;
      break;
    case "Invalid data":
      errorMessage = `Data error: ${friendName}'s schedule data is corrupted`;
      break;
    default:
      errorMessage = `Failed to load ${friendName}'s schedule`;
  }

  notificationManager.showSystemNotification(errorMessage, "error", 4000);
}

/**
 * Handle compare mode change events
 */
function handleCompareModeChange(event) {
  const { compareMode: isCompareMode } = event.detail;

  console.log(`🔄 Compare mode ${isCompareMode ? "activated" : "deactivated"}`);

  // Clear all caches when compare mode changes to prevent stale data
  memoCache.clear();
  matrixCache.clear();
  console.log(
    "🧹 Cleared memoization and matrix caches due to compare mode change"
  );

  // Update local compare mode state
  state.compareMode = isCompareMode;

  // Clear state when entering or exiting compare mode (consistent with handleToggleCompareMode)
  if (isCompareMode) {
    // Entering compare mode: clear all selections and active user
    state.activeUserId = null;
    state.pinModeActive = false;
    state.selectedUserIds.clear();
    
    console.log("[Mode] Compare Mode ENABLED via HorizontalFriendsBar - Starting with CLEAN STATE", {
      selectedUserIds: Array.from(state.selectedUserIds),
      selectedCount: state.selectedUserIds.size,
      activeUserId: state.activeUserId,
      clearedSelectedUsers: true,
      clearedActiveUser: true,
      disabledPinMode: true,
    });
  } else {
    // Exiting compare mode: clear selections
    state.selectedUserIds.clear();
    
    console.log("[Mode] Compare Mode DISABLED via HorizontalFriendsBar", {
      clearedSelections: true,
    });
  }

  // Update body class for global styling
  document.body.classList.toggle("compare-mode-active", isCompareMode);

  // Sync with desktop compare button if it exists
  const desktopCompareButton = document.getElementById("compare");
  if (desktopCompareButton) {
    desktopCompareButton.classList.toggle("active", isCompareMode);
  }

  // Update UI but skip mobile compare mode sync to prevent circular calls
  if (state.viewMode === "day") {
    renderDayView(); // Re-render day view with compare mode changes
  } else {
    renderScheduleGrid(); // Re-render grid view
  }

  // DO NOT call updateUI() or updateMobileCompareMode() here to prevent circular sync
}

/**
 * Handle compare selection change events
 */
function handleCompareSelectionChange(event) {
  const {
    selectedFriends,
    selectedUsersData,
    compareMode,
    userCount,
    hasUser,
  } = event.detail;

  console.log(`📊 Compare selection changed:`, {
    selectedFriends,
    userCount,
    hasUser,
    compareMode,
    users: selectedUsersData?.map((u) => u.displayName) || [],
    currentSelectedUserIds: Array.from(state.selectedUserIds),
    currentStateCompareMode: state.compareMode,
  });

  // Only process selection changes if compare mode is active
  if (!state.compareMode) {
    console.log("⚠️ Ignoring selection change - compare mode not active");
    return;
  }

  // Clear all caches when selection changes to prevent stale data
  memoCache.clear();
  matrixCache.clear();
  console.log(
    "🧹 Cleared memoization and matrix caches due to selection change"
  );

  // ✅ FIXED: Update selected user IDs for comparison including current user
  const previousSelectedCount = state.selectedUserIds.size;
  state.selectedUserIds.clear();
  
  // Handle current user inclusion properly
  const currentUserId = authManager.getCurrentUser()?.uid;
  
  selectedFriends.forEach((friendId) => {
    if (friendId === "user" && currentUserId) {
      // Convert "user" placeholder to actual current user ID
      state.selectedUserIds.add(currentUserId);
      console.log(`➕ Added current user (${currentUserId}) to selectedUserIds`);
    } else if (friendId !== "user") {
      // Add friend IDs normally
      state.selectedUserIds.add(friendId);
      console.log(`➕ Added ${friendId} to selectedUserIds`);
    }
  });

  console.log(`🔄 selectedUserIds updated:`, {
    previous: previousSelectedCount,
    current: state.selectedUserIds.size,
    ids: Array.from(state.selectedUserIds),
  });

  // Load schedules for comparison if needed
  console.log(
    `📚 Loading schedules for ${selectedUsersData?.length || 0} users`
  );
  loadSelectedFriendsForComparison(selectedUsersData || []);

  // Update UI to show comparison grid
  console.log(`🎨 Triggering UI update for comparison mode`);
  updateUI();

  // Force specific rendering based on current view mode
  if (compareMode && userCount >= 2) {
    console.log(
      `🔄 Forcing comparison re-render for ${userCount} users in ${state.viewMode} view`
    );
    setTimeout(() => {
      if (state.viewMode === "grid") {
        console.log(`📊 Force rendering grid view for comparison`);
        renderScheduleGrid();
      } else {
        console.log(`📅 Force rendering day view for comparison`);
        renderDayView();
      }
    }, 100);
  } else {
    console.log(
      `⚠️ Not forcing re-render - compareMode: ${compareMode}, userCount: ${userCount}`
    );
  }
}

/**
 * Load schedules for selected friends in comparison mode
 */
async function loadSelectedFriendsForComparison(selectedUsersData) {
  try {
    console.log(
      "🔄 Loading schedules for comparison:",
      selectedUsersData.map((u) => u.displayName)
    );

    // Clear memoization and matrix caches when loading friends for comparison
    memoCache.clear();
    matrixCache.clear();
    console.log(
      "🧹 Cleared memoization and matrix caches before loading friends for comparison"
    );

    const loadPromises = selectedUsersData.map(async (userData) => {
      const friendId = userData.friendId || userData.userId;

      // Handle current user's data
      if (userData.isCurrentUser) {
        console.log("👤 Adding current user to comparison state");

        // Try to get current user data from multiple sources
        let currentUserData = null;

        // First, try from state.users with activeUserId
        if (state.activeUserId && state.users[state.activeUserId]) {
          currentUserData = state.users[state.activeUserId];
          console.log("✅ Found current user data in state.users");
        }
        // Second, try to get from currentUser store if available
        else if (currentUser?.scheduleData) {
          console.log("🔄 Getting current user data from userStore");
          const user = authManager.getCurrentUser();
          if (user) {
            // Convert currentUser.scheduleData to HomePage format
            const scheduleData = currentUser.scheduleData;

            // Convert Firestore format to HomePage format if needed
            let convertedData = scheduleData;
            if (
              scheduleData &&
              typeof scheduleData.schedule === "object" &&
              !Array.isArray(scheduleData.schedule)
            ) {
              console.log(
                "🔄 Converting current user Firestore data to HomePage format"
              );
              convertedData = convertFirestoreToHomePageFormat(scheduleData);
            }

            // Create user data structure from converted data
            currentUserData = {
              id: user.uid,
              name: currentUser.profile?.displayName || "You",
              timeSlots: convertedData?.timeSlots || DEFAULT_TIMESLOTS,
              schedule:
                convertedData?.schedule ||
                createWeeklyMatrix(
                  convertedData?.timeSlots?.length || 7,
                  false
                ),
              slotInfo:
                convertedData?.slotInfo ||
                createSlotInfoMatrix(convertedData?.timeSlots?.length || 7),
              pinnedSlots:
                convertedData?.pinnedSlots ||
                createWeeklyMatrix(
                  convertedData?.timeSlots?.length || 7,
                  false
                ),
              timeBasedPins: convertedData?.timeBasedPins || {
                0: [],
                1: [],
                2: [],
                3: [],
                4: [],
                5: [],
                6: [],
              },
            };

            // Also update state.users with this data for consistency
            state.users[user.uid] = currentUserData;
            // ✅ FIXED: Don't set activeUserId in compare mode

            console.log("✅ Current user data converted and added", {
              hasSchedule: !!currentUserData.schedule,
              scheduleType: Array.isArray(currentUserData.schedule)
                ? "array"
                : "object",
              timeSlots: currentUserData.timeSlots?.length || 0,
              sampleScheduleData:
                currentUserData.schedule?.[0]?.[0] !== undefined
                  ? "has data"
                  : "empty",
            });
          }
        }
        // Third, create empty user as fallback
        else {
          console.log(
            "⚠️ Current user data not found, creating empty user for comparison"
          );
          const user = authManager.getCurrentUser();
          if (user) {
            currentUserData = createEmptyUser(user.uid);
            state.users[user.uid] = currentUserData;
            // ✅ FIXED: Don't set activeUserId in compare mode
          }
        }

        // Current user is now properly stored under their actual UID only
        if (currentUserData) {
          console.log("✅ Current user data available for comparison under UID:", currentUserData.id);
        } else {
          console.error("❌ Could not create current user data for comparison");
        }
        return;
      }

      // Skip if already cached for friends
      if (state.friendsScheduleData.has(friendId)) {
        console.log(`✅ Schedule already cached for ${userData.displayName}`);

        // Even if cached, ensure the friend is in state.users for comparison rendering
        if (!state.users[friendId]) {
          const cachedScheduleData = state.friendsScheduleData.get(friendId);
          if (cachedScheduleData) {
            console.log(
              `🔄 Adding cached friend ${userData.displayName} to state.users for comparison`
            );

            // Convert cached Firestore data to HomePage format if needed
            let convertedData = cachedScheduleData;
            if (
              cachedScheduleData &&
              typeof cachedScheduleData.schedule === "object" &&
              !Array.isArray(cachedScheduleData.schedule)
            ) {
              console.log(
                `🔄 Converting cached Firestore data for ${userData.displayName}`
              );
              convertedData =
                convertFirestoreToHomePageFormat(cachedScheduleData);
            }

            const friendUser = {
              id: friendId,
              name: userData.displayName,
              timeSlots: convertedData.timeSlots || DEFAULT_TIMESLOTS,
              schedule:
                convertedData.schedule ||
                createWeeklyMatrix(DEFAULT_TIMESLOTS.length, false),
              slotInfo:
                convertedData.slotInfo ||
                createWeeklyMatrix(DEFAULT_TIMESLOTS.length, () => ({
                  courseCode: "",
                  classroomNumber: "",
                })),
              pinnedSlots:
                convertedData.pinnedSlots ||
                createWeeklyMatrix(DEFAULT_TIMESLOTS.length, false),
            };

            state.users[friendId] = friendUser;
            console.log(
              `✅ Cached friend ${userData.displayName} added to state.users`,
              {
                storedUnderKey: friendId,
                hasSchedule: !!friendUser.schedule,
                scheduleType: Array.isArray(friendUser.schedule)
                  ? "array"
                  : "object",
                timeSlots: friendUser.timeSlots?.length || 0,
              }
            );
          }
        }
        return;
      }

      console.log(`📥 Loading schedule for ${userData.displayName}...`);
      // Load schedule data for friends
      const scheduleData = await dataManager.getUserSchedule(friendId);
      if (scheduleData) {
        state.friendsScheduleData.set(friendId, scheduleData);

        // Clear memoization and matrix caches since we have new friend schedule data
        memoCache.clear();
        matrixCache.clear();
        console.log(
          "🧹 Cleared memoization and matrix caches after loading friend schedule for comparison"
        );

        // Convert Firestore format to HomePage format for comparison
        const convertedScheduleData =
          convertFirestoreToHomePageFormat(scheduleData);

        if (!convertedScheduleData) {
          console.warn(
            `⚠️ Failed to convert schedule data for ${userData.displayName} in comparison`
          );
          return;
        }

        // Add to users state for rendering with converted data
        const friendUser = {
          id: friendId,
          name: userData.displayName,
          timeSlots: convertedScheduleData.timeSlots,
          schedule: convertedScheduleData.schedule,
          slotInfo: convertedScheduleData.slotInfo,
          pinnedSlots:
            convertedScheduleData.pinnedSlots ||
            createWeeklyMatrix(convertedScheduleData.timeSlots.length, false),
        };

        state.users[friendId] = friendUser;
        console.log(`✅ Schedule loaded for ${userData.displayName}`, {
          storedUnderKey: friendId,
          friendUserData: {
            id: friendUser.id,
            name: friendUser.name,
            hasSchedule: !!friendUser.schedule,
            timeSlots: friendUser.timeSlots?.length || 0,
            scheduleType: Array.isArray(friendUser.schedule)
              ? "array"
              : "object",
          },
          currentStateUsersKeys: Object.keys(state.users),
        });
      } else {
        console.warn(`⚠️ No schedule data found for ${userData.displayName}`);
      }
    });

    await Promise.all(loadPromises);
    console.log(
      "✅ All schedules loaded for comparison, selectedUserIds:",
      Array.from(state.selectedUserIds)
    );
  } catch (error) {
    console.error("❌ Failed to load schedules for comparison:", error);
  }
}

/**
 * Cleanup friends bar when leaving the page
 */
function cleanupHorizontalFriendsBar() {
  if (state.horizontalFriendsBar) {
    state.horizontalFriendsBar.destroy();
    state.horizontalFriendsBar = null;
  }

  // Remove event listeners
  document.removeEventListener("schedule:change", handleFriendScheduleChange);
  document.removeEventListener("compare:mode", handleCompareModeChange);
  document.removeEventListener(
    "compare:selection",
    handleCompareSelectionChange
  );

  // Clear state
  state.currentViewingFriendId = null;
  state.friendsScheduleData.clear();

  console.log("🧹 Horizontal Friends Bar cleaned up");
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
    loadState();

    console.log("� Current state after loading:", {
      activeUserId: state.activeUserId,
      userCount: Object.keys(state.users).length,
      users: Object.keys(state.users),
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

    // Initialize modal system - This is now handled in spa-init.js
    // console.log("🎛️ Initializing modal...");
    // initModal(DOM_ELEMENTS);

    // Set up UI interactions
    console.log("🔧 Setting up validation and listeners...");
    setupInputValidation();
    setupEventListeners();
    setupExportImportListeners(state, saveStateToStorage, updateUI);

    // Initialize Phase-3: Horizontal Friends Bar
    console.log("⭐ Initializing Horizontal Friends Bar...");
    initializeHorizontalFriendsBar();

    // Render UI with loaded data (this includes renderUserList())
    console.log("🎨 Updating UI with loaded data...");
    updateUI();

    // Set up authentication callbacks (only once)
    setupAuthenticationCallbacks();

    console.log("✅ CampXus Schedule App loaded successfully!");
  }
});

// Add cleanup when leaving the home page
document.addEventListener("spa:page:unload", (event) => {
  const { route } = event.detail;
  if (route === "home") {
    console.log("🧹 Cleaning up home page...");

    // Clear all caches to prevent memory leaks
    memoCache.clear();
    matrixCache.clear();

    // Cleanup friends bar and its event listeners
    cleanupHorizontalFriendsBar();

    // Clear any remaining timeouts/intervals that might be running
    clearInterval(); // Clear all intervals (if any)

    console.log("✅ HomePage cleanup completed");
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
