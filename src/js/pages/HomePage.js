// js/script.js

// --- Module Imports ---
import { DEFAULT_TIMESLOTS, LOCAL_STORAGE_KEY } from "../utils/constants.js";
import {
  DOM_ELEMENTS,
  initializeDomElements,
  reinitializeViewModeElements,
} from "../utils/dom/domElements.js";
import viewModeManager from "../services/ui/ViewModeManager.js";
import { showModal } from "../components/modals/Modal.js"; // Only import showModal, initModal is handled in spa-init.js
import {
  parseTime,
  isTimeBefore,
  convertToHHMM,
  isValidTimeFormat,
  isValidStrictHHMMTimeFormat,
  createUnifiedSchedule,
} from "../utils/time/timeUtils.js";
import { authManager } from "../services/auth/AuthService.js";
import { dataManager } from "../services/data/DataService.js";
import { scheduleStorageService } from "../services/schedule/ScheduleStorageService.js";
import { currentUser } from "../store/userStore.js";
import { navigateTo } from "../app.js"; // Import navigateTo for SPA navigation
import { getAvatarUrl } from "../utils/avatar/avatarUtils.js"; // Import avatar utilities
import { initScheduleControlsToggle } from "../components/schedule/ScheduleControlsToggle.js";
import { AnalyticsService } from "../services/analytics/AnalyticsService.js";
// Logging
import { logManager } from "../utils/debug/LogManager.js"; // ✅ Restored import to fix ReferenceError
import { onboardingService } from "../services/onboarding/OnboardingService.js";
import {
  showCoachMark,
  hideAllCoachMarks,
  hasActiveCoachMarks,
} from "../services/onboarding/CoachMarkManager.js";

function devLog(message, detail = {}) {
  if (!import.meta.env || !import.meta.env.DEV) {
    return;
  }

  if (logManager?.dev?.info) {
    logManager.dev.info(message, detail);
    return;
  }

  console.log(message, detail);
}

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
  friendsScheduleCache: new Map(), // Enhanced cache with metadata: {data, timestamp, isStale}
  isFriendsBarInitializing: false, // Prevent duplicate/overlapping init

  // Mobile Schedule Redesign State
  viewMode: "day", // 'day' or 'grid' - default to day view for mobile-first
  selectedDay: new Date().getDay(), // Current day (0 = Sunday, 6 = Saturday)

  // Memory Leak Prevention - Track event listeners for proper cleanup
  scheduleEventListeners: [], // Array to store {element, eventType, handler} objects
  uiControlListeners: [], // Array to store UI control listeners (pin button, day/grid buttons, etc.)
  eventListenersSetup: false, // Prevent duplicate setupEventListeners calls
  mobileScheduleInitialized: false, // Prevent duplicate mobile initialization
  isMobile: false, // Will be set during initialization

  // Real-time update control
  isLocalUpdate: false, // Prevents double UI updates during local changes
  pendingTransactions: new Map(), // Track pending saves to prevent overwrites
  lastScheduleSignature: null, // Prevent unnecessary UI updates when schedule unchanged
  lastAppliedScheduleVersion: null, // Track applied schedule version to avoid stale overwrites
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
    isFriendsBarInitializing: false,
    friendsScheduleData: new Map(),
    friendsScheduleCache: new Map(), // Enhanced cache with metadata: {data, timestamp, isStale}

    // Mobile Schedule Redesign State
    viewMode: "day",
    selectedDay: new Date().getDay(),

    // Memory Leak Prevention - Track event listeners for proper cleanup
    scheduleEventListeners: [], // Array to store {element, eventType, handler} objects
    uiControlListeners: [], // Array to store UI control listeners (pin button, day/grid buttons, etc.)
    eventListenersSetup: false, // Prevent duplicate setupEventListeners calls
    mobileScheduleInitialized: false, // Prevent duplicate mobile initialization
    isMobile: false,

    // Real-time update control
    isLocalUpdate: false, // Prevents double UI updates during local changes
    pendingTransactions: new Map(), // Track pending saves to prevent overwrites
    lastScheduleSignature: null,
    lastAppliedScheduleVersion: null,
  };
}

/* ================================
   UTILITY FUNCTIONS
================================== */

// Debounced save mechanism to prevent excessive database writes
let saveTimeout = null;
let pendingSavePromise = null;
let batchedTransactionIds = new Set(); // Collect transaction IDs during debounce period

function debouncedSaveStateToStorage(immediate = false, transactionId = null) {
  // Add transaction ID to batch if provided
  if (transactionId) {
    batchedTransactionIds.add(transactionId);
  }

  if (immediate) {
    // Clear any pending saves and save immediately with all batched transactions
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    const currentBatch = Array.from(batchedTransactionIds);
    batchedTransactionIds.clear();
    return saveStateToStorage(null, currentBatch);
  }

  // Return existing promise if save is already pending
  if (pendingSavePromise) {
    return pendingSavePromise;
  }

  return new Promise((resolve, reject) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
      try {
        // Pass all batched transaction IDs to save function
        const currentBatch = Array.from(batchedTransactionIds);
        batchedTransactionIds.clear();

        pendingSavePromise = saveStateToStorage(null, currentBatch);
        await pendingSavePromise;
        pendingSavePromise = null;
        saveTimeout = null;
        resolve();
      } catch (error) {
        pendingSavePromise = null;
        saveTimeout = null;
        reject(error);
      }
    }, 300); // 300ms debounce delay
  });
}

// NOTE: Removed smartLog function - now using LogManager for all throttled logging

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

/* ================================
   ONBOARDING HELPERS
================================== */

const onboardingTimeouts = new Set();
const hintSessionState = new Map();
let controlsHintsStarted = false;
let controlsHintsActive = false;
let pendingTapHint = false;

const CONTROL_HINT_KEYS = [
  "viewToggleHintSeen",
  "addSlotHintSeen",
  "pinHintSeen",
];

function didUserAcknowledgeHint(reason) {
  return reason === "primary" || reason === "secondary";
}

function markHintComplete(key) {
  hintSessionState.set(key, "done");
  onboardingService.markSeen(key, { allowPending: true }).catch(() => {});

  devLog("[Onboarding] Hint marked complete", { key });

  if (key === "scheduleControlsHintSeen") {
    scheduleOnboardingTimeout(() => startScheduleControlsHints(), 200);
  }

  if (CONTROL_HINT_KEYS.includes(key)) {
    maybeScheduleTapHint(300);
  }
}

function areControlHintsComplete() {
  let serviceState = null;
  try {
    serviceState = onboardingService?.getState
      ? onboardingService.getState()
      : null;
  } catch (_) {
    serviceState = null;
  }

  return CONTROL_HINT_KEYS.every((key) => {
    if (hintSessionState.get(key) === "done") {
      return true;
    }

    if (serviceState && serviceState[key]) {
      hintSessionState.set(key, "done");
      return true;
    }

    return false;
  });
}

function maybeScheduleTapHint(delay = 600) {
  if (hintSessionState.get("scheduleTapHintSeen") === "done") {
    pendingTapHint = false;
    devLog("[Onboarding] Tap hint already complete");
    return;
  }

  if (!areControlHintsComplete() || controlsHintsActive) {
    pendingTapHint = true;
    devLog("[Onboarding] Tap hint deferred", {
      controlsHintsActive,
      controlsComplete: areControlHintsComplete(),
    });
    return;
  }

  pendingTapHint = false;
  devLog("[Onboarding] Scheduling tap hint", { delay });
  scheduleOnboardingTimeout(showScheduleTapHint, delay);
}

function scheduleOnboardingTimeout(callback, delay = 800) {
  const timeoutId = window.setTimeout(() => {
    onboardingTimeouts.delete(timeoutId);
    callback();
  }, delay);
  onboardingTimeouts.add(timeoutId);
  return timeoutId;
}

// Reset local onboarding hint state when account switches so new users see hints
document.addEventListener("onboarding:user-switched", () => {
  try {
    hideAllCoachMarks();
  } catch (_) {}
  try {
    clearOnboardingTimeouts();
  } catch (_) {}
  hintSessionState.clear();
  controlsHintsStarted = false;
  controlsHintsActive = false;
  pendingTapHint = false;
});

function clearOnboardingTimeouts() {
  onboardingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  onboardingTimeouts.clear();
}

function waitMs(delay) {
  return new Promise((resolve) => {
    scheduleOnboardingTimeout(resolve, delay);
  });
}

function isElementVisibleForHint(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getResponsiveCoachmarkWidth(preferred = 220, minimum = 180) {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : preferred;
  const available = viewportWidth - 48; // keep 24px margin on each side
  const safePreferred = Math.min(preferred, Math.max(minimum, available));
  return Math.max(minimum, safePreferred);
}

async function showHintOnce({ key, targetResolver, buildConfig }) {
  const currentState = hintSessionState.get(key);
  if (currentState === "showing" || currentState === "done") {
    return null;
  }

  await onboardingService.init().catch(() => {});
  if (!onboardingService.shouldShow(key)) {
    hintSessionState.set(key, "done");
    if (CONTROL_HINT_KEYS.includes(key)) {
      maybeScheduleTapHint(300);
    }
    if (key === "scheduleTapHintSeen") {
      pendingTapHint = false;
    }
    devLog("[Onboarding] Hint suppressed by onboardingService", { key });
    return null;
  }

  const target =
    typeof targetResolver === "function"
      ? targetResolver()
      : document.querySelector(targetResolver);
  if (!isElementVisibleForHint(target)) {
    devLog("[Onboarding] Hint target not visible", { key });
    return null;
  }

  try {
    target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  } catch (_) {
    /* ignore scroll failures */
  }
  await waitMs(120);

  if (hasActiveCoachMarks()) {
    return null;
  }

  const config =
    typeof buildConfig === "function" ? buildConfig(target) : buildConfig;
  if (!config) return null;

  const mark = showCoachMark({ ...config, target });
  if (!mark) {
    devLog("[Onboarding] showCoachMark failed", { key });
    return null;
  }

  hintSessionState.set(key, "showing");
  devLog("[Onboarding] Hint rendered", { key });
  if (typeof mark.update === "function") {
    requestAnimationFrame(() => mark.update());
    requestAnimationFrame(() => mark.update());
  }
  return mark;
}

function attemptHintUntilShown({ key, targetResolver, buildConfig, retryDelay = 1600 }) {
  const attempt = async () => {
    devLog("[Onboarding] attemptHintUntilShown", { key, retryDelay });
    const mark = await showHintOnce({ key, targetResolver, buildConfig });
    if (!mark) {
      if (hintSessionState.get(key) !== "done") {
        devLog("[Onboarding] Hint not shown, scheduling retry", { key, retryDelay });
        scheduleOnboardingTimeout(attempt, retryDelay);
      }
      return;
    }

    const result = await mark.waitForClose;
    if (didUserAcknowledgeHint(result?.reason)) {
      markHintComplete(key);
      return;
    }

    hintSessionState.delete(key);
    devLog("[Onboarding] Hint dismissed without acknowledgement", {
      key,
      reason: result?.reason,
    });
    scheduleOnboardingTimeout(attempt, retryDelay);
  };

  attempt();
}

async function showHintWithRetries(hint, options = {}) {
  const { attempts = 6, delay = 600 } = options;
  let tries = 0;

  while (hintSessionState.get(hint.key) !== "done" && tries < attempts) {
    if (hasActiveCoachMarks()) {
      await waitMs(delay);
      continue;
    }

    devLog("[Onboarding] showHintWithRetries attempt", {
      key: hint.key,
      attempt: tries + 1,
      attempts,
    });
    const mark = await showHintOnce(hint);
    if (mark) {
      const result = await mark.waitForClose;
      if (didUserAcknowledgeHint(result?.reason)) {
        markHintComplete(hint.key);
        return true;
      }
      hintSessionState.delete(hint.key);
      devLog("[Onboarding] Hint dismissed during retries", {
        key: hint.key,
        reason: result?.reason,
      });
    }
    tries += 1;
    await waitMs(delay);
  }

  devLog("[Onboarding] showHintWithRetries exhausted", {
    key: hint.key,
    attempts,
  });
  return hintSessionState.get(hint.key) === "done";
}

function isMobileLayout() {
  return state.isMobile || window.innerWidth <= 768;
}

function showScheduleToggleHint() {
  const toggleBtn = document.getElementById("scheduleControlsToggle");

  if (!isElementVisibleForHint(toggleBtn)) {
    devLog("[Onboarding] Toggle hint skipped - button hidden");
    markHintComplete("scheduleControlsHintSeen");
    if (!isMobileLayout()) {
      startScheduleControlsHints();
    }
    return;
  }

  devLog("[Onboarding] Showing schedule toggle hint");
  attemptHintUntilShown({
    key: "scheduleControlsHintSeen",
    targetResolver: () => toggleBtn,
    buildConfig: () => ({
      title: "Schedule options",
      description: "Tap to reveal Add Slot, Pin mode, and the day/grid view buttons.",
      highlightShape: "circle",
      responsivePlacement: { mobile: "bottom", desktop: "left" },
      offset: 12,
      maxWidth: 220,
      primaryButton: { text: "Next" },
    }),
  });

}

let controlsHintQueue = Promise.resolve();
const COMPARE_HINT_RETRY_DELAY = 1400;
const compareHintTargets = {
  roundButton: null,
};

function startScheduleControlsHints() {
  if (controlsHintsStarted) {
    devLog("[Onboarding] Control hints already running");
    return;
  }

  const bar = document.getElementById("scheduleControlsBar");
  if (!bar) {
    devLog("[Onboarding] scheduleControlsBar missing");
    return;
  }

  ensureScheduleControlsOpen();

  const controlsVisible =
    !isMobileLayout() ||
    bar.classList.contains("expanded") ||
    getComputedStyle(bar).display !== "none";

  if (!controlsVisible) {
    devLog("[Onboarding] Control bar hidden, retrying");
    scheduleOnboardingTimeout(startScheduleControlsHints, 240);
    return;
  }

  controlsHintsStarted = true;
  controlsHintsActive = true;
  devLog("[Onboarding] Control hint queue starting");

  controlsHintQueue = controlsHintQueue.then(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    ensureScheduleControlsOpen();

    const hintsInOrder = [
      {
        key: "viewToggleHintSeen",
        targetResolver: () => document.getElementById("dayViewBtn"),
        buildConfig: () => ({
        title: "Day or week view",
        description: "Switch between a focused single-day list and the full weekly grid.",
        responsivePlacement: { mobile: "top", desktop: "bottom" },
        maxWidth: getResponsiveCoachmarkWidth(220, 180),
        offset: 12,
        primaryButton: { text: "Next" },
      }),
      },
      {
        key: "addSlotHintSeen",
        targetResolver: () => document.getElementById("addNewTimeSlotBtn"),
        buildConfig: () => ({
        title: "Add custom slots",
        description: "Tap here and add new rows of time ranges to your schedule.",
        responsivePlacement: { mobile: "top", desktop: "bottom" },
        maxWidth: getResponsiveCoachmarkWidth(220, 180),
        offset: 12,
        primaryButton: { text: "Next" },
      }),
      },
      {
        key: "pinHintSeen",
        targetResolver: () => document.getElementById("togglePinModeBtn"),
        buildConfig: () => ({
          title: "Pin important slots",
          description: "Pinning marks preferred meeting times so friends can spot them instantly.",
          highlightShape: "circle",
          responsivePlacement: { mobile: "top", desktop: "bottom" },
          maxWidth: getResponsiveCoachmarkWidth(204, 176),
          offset: 12,
          primaryButton: { text: "Done" },
        }),
      },
    ];

    for (const hint of hintsInOrder) {
      if (hintSessionState.get(hint.key) === "done") continue;
      ensureScheduleControlsOpen();
      devLog("[Onboarding] Showing control hint", { key: hint.key });
      const shown = await showHintWithRetries(hint, { attempts: 8, delay: 500 });
      if (!shown) {
        devLog("[Onboarding] Control hint aborted", { key: hint.key });
        break;
      }
      devLog("[Onboarding] Control hint acknowledged", { key: hint.key });
    }

    controlsHintsActive = false;
    controlsHintsStarted = false;
    if (pendingTapHint) {
      devLog("[Onboarding] Control hints finished, scheduling tap hint if pending");
      maybeScheduleTapHint(300);
    }
  });
}

function handleScheduleControlsOpened() {
  if (hintSessionState.get("scheduleControlsHintSeen") !== "done") {
    return;
  }
  devLog("[Onboarding] scheduleControls:opened received - starting control hints");
  startScheduleControlsHints();
}

function ensureScheduleControlsOpen() {
  const toggleBtn = document.getElementById("scheduleControlsToggle");
  const bar = document.getElementById("scheduleControlsBar");
  if (!toggleBtn || !bar) return;

  if (toggleBtn.getAttribute("aria-expanded") !== "true") {
    toggleBtn.setAttribute("aria-expanded", "true");
    bar.classList.add("expanded");
    document.dispatchEvent(
      new CustomEvent("scheduleControls:opened", {
        detail: { trigger: "onboarding" },
      })
    );
  }
}

function showScheduleTapHint() {
  if (!areControlHintsComplete()) {
    pendingTapHint = true;
    maybeScheduleTapHint(600);
    devLog("[Onboarding] Tap hint deferred until controls complete");
    return;
  }

  devLog("[Onboarding] Attempting tap hint");
  attemptHintUntilShown({
    key: "scheduleTapHintSeen",
    targetResolver: () => {
      if (state.viewMode === "day") {
        return document.getElementById("scheduleDayView");
      }
      return document.getElementById("scheduleGridView");
    },
    buildConfig: (target) => ({
      title: "Tap slots to edit",
      description: "Tap any time slot to add a new class, or edit an existing slot you have.",
      responsivePlacement: isMobileLayout()
        ? { mobile: "top" }
        : target.id === "scheduleDayView"
        ? { desktop: "right" }
        : { desktop: "top" },
      primaryButton: { text: "OK" },
    }),
  });
}

function handleFriendsBarRendered(event) {
  const count = event?.detail?.count ?? 0;
  if (count > 0) {
    const roundBtn = document.getElementById("roundCompareBtn");
    if (roundBtn) {
      compareHintTargets.roundButton = roundBtn;
    }
  } else {
    compareHintTargets.roundButton = null;
  }
}

function resolveCompareHintTarget(detail = {}) {
  const { buttonElement, buttonId, source } = detail;
  if (buttonElement instanceof Element && document.contains(buttonElement)) {
    return buttonElement;
  }
  if (typeof buttonId === "string") {
    const explicit = document.getElementById(buttonId);
    if (explicit) {
      return explicit;
    }
  }
  if (source === "desktop" || source === "desktop-button") {
    const desktopBtn = document.getElementById("compare");
    if (desktopBtn) {
      return desktopBtn;
    }
  }
  // Prefer a fresh query within the friends bar to avoid stale references on mobile
  const freshMobileBtn = document.querySelector(
    "#horizontal-friends-container .round-compare-btn, #roundCompareBtn"
  );
  if (freshMobileBtn) return freshMobileBtn;

  if (
    compareHintTargets.roundButton &&
    document.contains(compareHintTargets.roundButton)
  ) {
    return compareHintTargets.roundButton;
  }

  return (
    document.getElementById("roundCompareBtn") ||
    document.getElementById("compare")
  );
}

function handleCompareOnboardingRequest(event) {
  if (hintSessionState.get("compareHintSeen") === "done") {
    devLog("[Onboarding] Compare hint already completed");
    return;
  }

  const detail = event?.detail ? { ...event.detail } : {};
  const retryCount = detail.__retryCount || 0;
  devLog("[Onboarding] Compare hint request received", {
    retryCount,
    source: detail.source,
  });

  const initialTarget = resolveCompareHintTarget(detail);
  if (!initialTarget) {
    if (retryCount >= 4) {
      devLog("[Onboarding] Compare hint target not found after retries", {
        retryCount,
      });
      return;
    }
    const nextDetail = { ...detail, __retryCount: retryCount + 1 };
    setTimeout(
      () => handleCompareOnboardingRequest({ detail: nextDetail }),
      COMPARE_HINT_RETRY_DELAY
    );
    devLog("[Onboarding] Compare hint target missing, scheduling retry", {
      retryCount: retryCount + 1,
    });
    return;
  }

  devLog("[Onboarding] Showing compare hint", {
    source: detail.source,
  });
  attemptHintUntilShown({
    key: "compareHintSeen",
    targetResolver: () => resolveCompareHintTarget(detail),
    buildConfig: () => ({
      title: "Compare schedules",
      description: "Select yourself and friends to instantly find overlapping free time.",
      highlightShape: "circle",
      // On mobile, place the card above the round button for a clear anchor
      responsivePlacement: { mobile: "top", desktop: "top" },
      offset: 12,
      maxWidth: getResponsiveCoachmarkWidth(216, 176),
      primaryButton: { text: "OK" },
    }),
    retryDelay: COMPARE_HINT_RETRY_DELAY,
  });
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

/**
 * Removes a user from the application state and updates related references
 * @param {string} userId - User ID to remove
 * @param {Object} currentState - Current application state
 * @returns {Object} Updated state with user removed
 */

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
 * Normalize a user's schedule-related matrices so each has 7 day arrays and each
 * day array length matches timeSlots length. Fills gaps with defaults.
 */
function normalizeUserScheduleMatrices(user) {
  if (!user || !Array.isArray(user.timeSlots)) return;
  const expectedSlots = user.timeSlots.length;
  const normalizeMatrix = (matrix, fillerValue) => {
    if (!Array.isArray(matrix)) {
      matrix = Array.from({ length: 7 }, () =>
        Array.from({ length: expectedSlots }, () => fillerValue)
      );
      return matrix;
    }
    for (let d = 0; d < 7; d++) {
      if (!Array.isArray(matrix[d])) {
        matrix[d] = Array.from({ length: expectedSlots }, () => fillerValue);
      } else if (matrix[d].length !== expectedSlots) {
        const resized = Array.from(
          { length: expectedSlots },
          () => fillerValue
        );
        for (let i = 0; i < Math.min(matrix[d].length, expectedSlots); i++) {
          if (matrix[d][i] !== undefined) resized[i] = matrix[d][i];
        }
        matrix[d] = resized;
      }
    }
    return matrix;
  };
  user.schedule = normalizeMatrix(user.schedule, false);
  user.pinnedSlots = normalizeMatrix(user.pinnedSlots, false);
  if (user.slotInfo) {
    user.slotInfo = normalizeMatrix(user.slotInfo, null);
  }
}

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
export function generateTooltipMessage(
  dayIndex,
  timeIndex,
  currentState,
  options = {}
) {
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

  // Decide whether to use unified schedule based on options or structure
  const useUnified =
    options.forceUnified === true
      ? true
      : options.forceHomogeneous === true
      ? false
      : shouldUseUnifiedSchedule(selectedUsers);

  if (useUnified) {
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

  logManager.ui.init(`Time slot "${newSlotLabel}" added for ${user.name}`);

  // 📊 Analytics: schedule slot added
  try {
    AnalyticsService.trackScheduleEdit("add_slot", {
      slot_label: newSlotLabel,
      total_slots: user.timeSlots.length,
    });
  } catch {}

  // Transactional debounced save for structural change
  const txId = `timeslot_add_${state.activeUserId}_${Date.now()}`;
  state.pendingTransactions.set(txId, {
    type: "timeslot_add",
    userId: state.activeUserId,
    label: newSlotLabel,
    timestamp: Date.now(),
  });
  state.isLocalUpdate = true;
  updateUI();
  debouncedSaveStateToStorage(false, txId)
    .then(() => {
      state.isLocalUpdate = false;
    })
    .catch(() => {
      state.isLocalUpdate = false;
    });
  showModal({
    content: `New time slot "${newSlotLabel}" added for ${user.name}.`,
    title: "Time Slot Added",
  });
  return true; // Indicate success
}

// .........................................

export function handleAddNewTimeSlotClick() {
  if (!state.activeUserId || state.currentViewingFriendId) {
    if (state.currentViewingFriendId) {
      console.log(
        "🔒 Cannot add time slots to friend's schedule - read-only mode"
      );
      return;
    }
    showModal({
      content: "Please select an active user first.",
      title: "User Not Selected",
    });
    return;
  }
  const user = state.users[state.activeUserId];
  if (!user.timeSlots || user.timeSlots.length === 0) {
    // If a user somehow has no time slots:
    // - IUB: initialize with defaults
    // - Others: keep empty and build matrices of length 0
    const authUser = authManager.getCurrentUser();
    const email = (authUser?.email || "").toLowerCase();
    const uni = (
      currentUser?.profile?.universityInfo?.university || ""
    ).toLowerCase();
    const isIub = email.endsWith("@iub.edu.bd") || uni === "iub";

    user.timeSlots = isIub ? JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS)) : [];
    user.schedule = createWeeklyMatrix(user.timeSlots.length, false);
    user.pinnedSlots = createWeeklyMatrix(user.timeSlots.length, false);

    console.warn(
      `User ${user.id} had no timeSlots. Initialized with ${
        isIub ? "IUB defaults" : "empty"
      } before adding new custom slot.`
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

  if (
    !state.activeUserId ||
    state.compareMode ||
    state.currentViewingFriendId
  ) {
    // This case means the button was clicked while it should have been disabled,
    // or state changed between render and click. Defensive coding:
    state.pinModeActive = false; // Ensure it's off if conditions aren't met
    console.warn(
      "[Mode] Pin Mode toggle attempted when conditions not met. Forcing off.",
      {
        hasActiveUser: !!state.activeUserId,
        inCompareMode: state.compareMode,
        viewingFriend: !!state.currentViewingFriendId,
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

    // Pin mode toggled; UI reflects state without verbose logging
  }
  updateUI(); // This will re-apply the .active class to the button based on the new state.pinModeActive
}

// Pin Slot Click Handler

// Add light debouncing for safety (reduced since we fixed duplicate handlers)
let lastPinClickTime = 0;
const PIN_CLICK_DEBOUNCE = 50; // 50ms debounce (reduced from 200ms)

function handlePinSlotClick(dayIndex, slotIndex, event) {
  // Pre-normalize active user's schedule & pinned structure to expected lengths
  if (state.activeUserId && state.users[state.activeUserId]) {
    try {
      normalizeUserScheduleMatrices(state.users[state.activeUserId]);
    } catch (_) {}
  }
  if (event) {
    event.stopPropagation();
  }

  // Debounce rapid clicks
  const now = Date.now();
  if (now - lastPinClickTime < PIN_CLICK_DEBOUNCE) {
    return;
  }
  lastPinClickTime = now;

  if (
    !state.activeUserId ||
    !state.users[state.activeUserId] ||
    state.currentViewingFriendId
  ) {
    if (state.currentViewingFriendId) {
      return;
    }

    console.warn("handlePinSlotClick called with no active user.");
    // Trigger glow effect for visual feedback
    if (!state.activeUserId) {
      // Check if users exist to determine which glow to trigger
      const totalUserCount = Object.keys(state.users).length;

      if (totalUserCount === 0) {
        // No users exist - trigger add user button glow
      } else {
        // Users exist but no active user - trigger users section glow
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
    try {
      console.error(
        "Data integrity issue in handlePinSlotClick for user:",
        activeUserObject && activeUserObject.id,
        { dayIndex, slotIndex },
        {
          scheduleDay:
            activeUserObject &&
            activeUserObject.schedule &&
            activeUserObject.schedule[dayIndex],
          pinnedDay:
            activeUserObject &&
            activeUserObject.pinnedSlots &&
            activeUserObject.pinnedSlots[dayIndex],
          scheduleLengths:
            activeUserObject &&
            activeUserObject.schedule &&
            activeUserObject.schedule.map((d) => d && d.length),
          pinnedLengths:
            activeUserObject &&
            activeUserObject.pinnedSlots &&
            activeUserObject.pinnedSlots.map((d) => d && d.length),
          timeSlotsLength:
            activeUserObject &&
            activeUserObject.timeSlots &&
            activeUserObject.timeSlots.length,
        }
      );
      // Lightweight normalization attempt: ensure day arrays exist and lengths align with timeSlots length
      if (
        activeUserObject &&
        activeUserObject.timeSlots &&
        Array.isArray(activeUserObject.timeSlots)
      ) {
        const expectedLen = activeUserObject.timeSlots.length;
        const ensureDay = (arrRef, label) => {
          if (!Array.isArray(arrRef[dayIndex])) {
            arrRef[dayIndex] = new Array(expectedLen).fill(false);
          } else if (arrRef[dayIndex].length !== expectedLen) {
            const resized = new Array(expectedLen).fill(false);
            for (
              let i = 0;
              i < Math.min(expectedLen, arrRef[dayIndex].length);
              i++
            ) {
              resized[i] = arrRef[dayIndex][i];
            }
            arrRef[dayIndex] = resized;
          }
        };
        if (activeUserObject.schedule && activeUserObject.pinnedSlots) {
          ensureDay(activeUserObject.schedule, "schedule");
          ensureDay(activeUserObject.pinnedSlots, "pinned");
          // Retry guard once after normalization
          if (
            activeUserObject.schedule[dayIndex] !== undefined &&
            activeUserObject.schedule[dayIndex][slotIndex] !== undefined &&
            activeUserObject.pinnedSlots[dayIndex] !== undefined &&
            activeUserObject.pinnedSlots[dayIndex][slotIndex] !== undefined
          ) {
            console.info(
              "Pin slot normalization repaired structures, retrying."
            );
          } else {
            console.warn(
              "Normalization could not repair pin structures at indices."
            );
          }
        }
      }
    } catch (e) {
      console.warn("Pin integrity diagnostic failed", e);
    }
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

  // Create transaction ID for this pin operation
  const transactionId = `pin_${
    state.activeUserId
  }_${dayIndex}_${slotIndex}_${Date.now()}`;
  const transactionData = {
    userId: state.activeUserId,
    dayIndex,
    slotIndex,
    newPinState,
    timestamp: Date.now(),
  };

  // Add to pending transactions to prevent real-time overwrites
  state.pendingTransactions.set(transactionId, transactionData);

  // Prevent double UI update by temporarily ignoring real-time updates
  state.isLocalUpdate = true;
  updateUI();

  // Use debounced save to prevent excessive database writes (pass transactionId correctly)
  debouncedSaveStateToStorage(false, transactionId)
    .then(() => {
      state.isLocalUpdate = false;
    })
    .catch(() => {
      // Even if save fails, release the guard to avoid UI lock
      state.isLocalUpdate = false;
    });
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
               placeholder="Up to 8 chars (A-Z, 0-9, space, -, _, /)"
               maxlength="8">
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
        <button class="modal-button delete" data-role="delete-slot">Delete Slot</button>
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

        if (courseCode && !/^[A-Z0-9\s\-_\/]{1,8}$/i.test(courseCode)) {
          const errorDiv = document.getElementById("edit-slot-info-error");
          if (errorDiv) {
            errorDiv.textContent =
              "Allowed: letters, numbers, spaces, -, _, / (max 8)";
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

        // 📊 Analytics: schedule slot edited (info updated)
        try {
          AnalyticsService.trackScheduleEdit("edit_slot", {
            day_index: dayIndex,
            time_index: timeIndex,
            course_code: courseCode || "none",
          });
        } catch {}

        // Transactional debounced save to avoid realtime overwrite
        const txId = `slot_edit_${
          state.activeUserId
        }_${dayIndex}_${timeIndex}_${Date.now()}`;
        state.pendingTransactions.set(txId, {
          type: "slot_info_edit",
          userId: state.activeUserId,
          dayIndex,
          timeIndex,
          timestamp: Date.now(),
        });

        state.isLocalUpdate = true;
        updateUI();
        debouncedSaveStateToStorage(false, txId)
          .then(() => {
            state.isLocalUpdate = false;
          })
          .catch(() => {
            state.isLocalUpdate = false;
          });
        return true;
      }
      return false;
    },
  });

  // Delegate delete click to the modal content area using a stable listener
  try {
    const onContentClick = (ev) => {
      const btn = ev.target.closest('[data-role="delete-slot"]');
      if (!btn) return;

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

          const txId = `slot_delete_${
            state.activeUserId
          }_${dayIndex}_${timeIndex}_${Date.now()}`;
          state.pendingTransactions.set(txId, {
            type: "slot_delete",
            userId: state.activeUserId,
            dayIndex,
            timeIndex,
            timestamp: Date.now(),
          });

          state.isLocalUpdate = true;
          updateUI();
          debouncedSaveStateToStorage(false, txId)
            .then(() => {
              state.isLocalUpdate = false;
            })
            .catch(() => {
              state.isLocalUpdate = false;
            });
          // 📊 Analytics: schedule slot deleted
          try {
            AnalyticsService.trackScheduleEdit("delete_slot", {
              day_index: dayIndex,
              time_index: timeIndex,
            });
          } catch {}
          return true;
        },
      });
    };

    // Ensure only one handler is attached at a time
    const contentEl = DOM_ELEMENTS.modalMessage;
    if (contentEl) {
      if (contentEl.__deleteSlotHandler) {
        try {
          contentEl.removeEventListener("click", contentEl.__deleteSlotHandler);
        } catch (_) {}
      }
      contentEl.__deleteSlotHandler = onContentClick;
      contentEl.addEventListener("click", onContentClick);
    }
  } catch (e) {
    console.warn("Failed to attach modal delete handler", e);
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
               placeholder="Up to 8 chars (A-Z, 0-9, space, -, _, /)"
               maxlength="8">
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
        if (courseCode && !/^[A-Z0-9\s\-_\/]{1,8}$/i.test(courseCode)) {
          const errorDiv = document.getElementById("slot-info-error");
          if (errorDiv) {
            errorDiv.textContent =
              "Allowed: letters, numbers, spaces, -, _, / (max 8)";
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

        // Transactional debounced save to avoid realtime overwrite
        const txId = `slot_busy_${
          state.activeUserId
        }_${dayIndex}_${timeIndex}_${Date.now()}`;
        state.pendingTransactions.set(txId, {
          type: "slot_mark_busy",
          userId: state.activeUserId,
          dayIndex,
          timeIndex,
          timestamp: Date.now(),
        });

        state.isLocalUpdate = true;
        updateUI();
        debouncedSaveStateToStorage(false, txId)
          .then(() => {
            state.isLocalUpdate = false;
          })
          .catch(() => {
            state.isLocalUpdate = false;
          });
        return true; // Allow modal to close
      }
      return false;
    },
  });
}

/* ================================
   STATE PERSISTENCE (Phase-1: Firestore + localStorage Cache)
================================== */
async function loadState(retryAttempt = 0) {
  try {
    console.log("📡 [Phase-1] Loading user schedule...");

    // Prevent infinite recursion
    if (retryAttempt > 2) {
      console.log("⚠️ [Phase-1] Maximum retry attempts reached, stopping");
      return;
    }

    // Check if user is authenticated with retry mechanism for race condition fix
    let user = authManager.getCurrentUser();
    if (!user) {
      logManager.auth.user(
        "No authenticated user found, waiting for auth state to settle"
      );

      // Wait a brief moment for auth state listener to fire after login
      await new Promise((resolve) => setTimeout(resolve, 500));
      user = authManager.getCurrentUser();

      if (!user) {
        console.log(
          "⚠️ [Phase-1] Still no authenticated user after delay, will retry when auth state becomes available"
        );

        // Set up a one-time listener for when auth state becomes available
        const unsubscribe = currentUser.subscribe((userState) => {
          if (userState.isLoggedIn && userState.user) {
            console.log(
              "🔄 [Phase-1] Auth state became available, retrying schedule load"
            );
            unsubscribe(); // Clean up listener
            loadState(retryAttempt + 1); // Retry loading with incremented attempt count
          }
        });

        return;
      }

      console.log(
        "✅ [Phase-1] Found authenticated user after delay, proceeding with schedule load"
      );
    }

    console.log(`👤 [Phase-1] Loading schedule for user: ${user.uid}`);

    // 🚀 RACE CONDITION FIX: Set activeUserId immediately to enable UI
    // This prevents the schedule from being disabled while loading
    if (!state.activeUserId) {
      state.activeUserId = user.uid;

      // Create a minimal user object to enable UI immediately
      if (!state.users[user.uid]) {
        state.users[user.uid] = createEmptyUser(user.uid);
      }

      console.log(
        "🎯 [Phase-1] Set activeUserId immediately to enable UI during loading"
      );

      // Update UI immediately to enable schedule controls
      updateUI();
    }

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

      // Initialize schedule signature to avoid first no-op realtime re-render
      try {
        state.lastScheduleSignature = JSON.stringify({
          schedule: scheduleData?.schedule || null,
          pinnedSlots: scheduleData?.pinnedSlots || null,
          timeBasedPins: scheduleData?.timeBasedPins || null,
          slotInfo: scheduleData?.slotInfo || null,
        });
        // Track last applied version for robust realtime gating
        state.lastAppliedScheduleVersion =
          typeof scheduleData?.metadata?.version === "number"
            ? scheduleData.metadata.version
            : null;
      } catch (_) {
        // Non-fatal; signature remains null
      }

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
  const authUser = authManager.getCurrentUser();
  const email = (authUser?.email || "").toLowerCase();
  const profileUni = (
    currentUser?.profile?.universityInfo?.university || ""
  ).toLowerCase();
  const isCurrent = authUser && userId === authUser.uid;
  const isIub =
    isCurrent && (email.endsWith("@iub.edu.bd") || profileUni === "iub");

  const baseTimeSlots = isIub ? DEFAULT_TIMESLOTS : [];
  const slotsLen = baseTimeSlots.length;

  return {
    id: userId === currentUser.uid ? currentUser.getStudentId() : userId,
    name: currentUser.getScheduleDisplayName(), // "ME"
    timeSlots: baseTimeSlots,
    schedule: createWeeklyMatrix(slotsLen, false),
    slotInfo: createSlotInfoMatrix(slotsLen),
    pinnedSlots: createWeeklyMatrix(slotsLen, false),
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
    // Removed global scheduleRealtimeUnsubscribe exposure
  }

  // Set up new real-time sync through ScheduleStorageService
  const realtimeUnsubscribe = scheduleStorageService.setupRealtimeSync(
    userId,
    (updatedScheduleData) => {
      if (updatedScheduleData && state.users[userId]) {
        console.log(
          "📡 [Phase-1] Real-time schedule update received via ScheduleStorageService"
        );

        // Prepare signature and version for smart gating
        const incomingVersion =
          typeof updatedScheduleData?.metadata?.version === "number"
            ? updatedScheduleData.metadata.version
            : null;
        let incomingSignature = null;
        try {
          incomingSignature = JSON.stringify({
            schedule: updatedScheduleData?.schedule || null,
            pinnedSlots: updatedScheduleData?.pinnedSlots || null,
            timeBasedPins: updatedScheduleData?.timeBasedPins || null,
            slotInfo: updatedScheduleData?.slotInfo || null,
          });
        } catch (_) {}

        // Ignore clearly stale versions ONLY if content is unchanged
        if (
          incomingVersion !== null &&
          typeof state.lastAppliedScheduleVersion === "number" &&
          incomingVersion < state.lastAppliedScheduleVersion &&
          incomingSignature &&
          state.lastScheduleSignature &&
          incomingSignature === state.lastScheduleSignature
        ) {
          console.log(
            `⏭️ [Phase-1] Skipping outdated realtime schedule (v${incomingVersion} < v${state.lastAppliedScheduleVersion}) with identical content`
          );
          // Still refresh store timestamps for consistency
          currentUser.setScheduleData(updatedScheduleData);
          currentUser.setScheduleLastSynced(new Date());
          return;
        }

        // Skip UI update if this is a local change to prevent double rendering
        if (state.isLocalUpdate) {
          console.log(
            "⏭️ [Phase-1] Skipping real-time UI update - local change in progress"
          );

          // Still update userStore for consistency but DON'T update local state
          currentUser.setScheduleData(updatedScheduleData);
          currentUser.setScheduleLastSynced(new Date());
          return;
        }

        // Check if we have any pending transactions that would conflict
        const hasPendingTransactions = state.pendingTransactions.size > 0;
        if (hasPendingTransactions) {
          console.log(
            `🔄 [TRANSACTION GUARD] Skipping real-time update - ${state.pendingTransactions.size} pending transactions`
          );

          // Still update userStore but don't override local state during transactions
          currentUser.setScheduleData(updatedScheduleData);
          currentUser.setScheduleLastSynced(new Date());
          return;
        }

        // If the data hasn't changed, skip re-render to prevent flicker
        try {
          const newSignature =
            incomingSignature ||
            JSON.stringify({
              schedule: updatedScheduleData?.schedule || null,
              pinnedSlots: updatedScheduleData?.pinnedSlots || null,
              timeBasedPins: updatedScheduleData?.timeBasedPins || null,
              slotInfo: updatedScheduleData?.slotInfo || null,
            });
          if (state.lastScheduleSignature === newSignature) {
            // Still update userStore timestamps for consistency, but avoid UI work
            currentUser.setScheduleData(updatedScheduleData);
            currentUser.setScheduleLastSynced(new Date());
            console.log("⏭️ [Phase-1] Skipping UI update - schedule unchanged");
            return;
          }
          state.lastScheduleSignature = newSignature;
        } catch (e) {
          // Non-fatal; proceed with update
        }

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

        // Record applied version to gate future stale payloads
        if (incomingVersion !== null) {
          state.lastAppliedScheduleVersion = incomingVersion;
        }

        // 🛡️ SAFETY CHECK: Only update UI if we're still on the home page
        const currentRoute = window.location.hash.replace("#", "") || "home";
        if (currentRoute === "home") {
          // Re-render UI with a light throttle to reduce churn
          if (!setupScheduleRealTimeSync._lastUiUpdateAt) {
            setupScheduleRealTimeSync._lastUiUpdateAt = 0;
          }
          const now = Date.now();
          if (now - setupScheduleRealTimeSync._lastUiUpdateAt >= 100) {
            setupScheduleRealTimeSync._lastUiUpdateAt = now;
            updateUI();
          } else {
            // Schedule a trailing update
            clearTimeout(setupScheduleRealTimeSync._pendingUiTimer);
            setupScheduleRealTimeSync._pendingUiTimer = setTimeout(() => {
              setupScheduleRealTimeSync._lastUiUpdateAt = Date.now();
              updateUI();
            }, 100);
          }
          console.log("✅ [Phase-1] UI updated with real-time changes");
        } else {
          console.log("⏭️ [Phase-1] Skipping UI update - not on home page");
        }
      }
    }
  );

  // Mark real-time as active in userStore
  currentUser.setScheduleRealTimeActive(true);
}

async function saveStateToStorage(transactionId = null, transactionIds = []) {
  try {
    const user = authManager.getCurrentUser();
    if (!user || !state.users[user.uid]) {
      console.log("⚠️ [Phase-1] No user data to save");
      return;
    }

    // Debug transaction processing
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
        // Complete transactions if provided (supports both single and batch)
        if (transactionId && state.pendingTransactions.has(transactionId)) {
          state.pendingTransactions.delete(transactionId);
          console.log(`✅ Completed transaction: ${transactionId}`);
        }

        // Complete batched transactions
        if (transactionIds && transactionIds.length > 0) {
          const completedCount = transactionIds.filter((id) => {
            if (state.pendingTransactions.has(id)) {
              state.pendingTransactions.delete(id);
              return true;
            }
            return false;
          }).length;

          if (completedCount > 0) {
            console.log(
              `✅ Completed ${completedCount} batched transactions, ${state.pendingTransactions.size} remaining`
            );
          }
        }

        // 🛡️ SAFETY NET: Clear ALL remaining pending transactions on successful save
        // This prevents race conditions from parallel save operations
        if (state.pendingTransactions.size > 0) {
          const remainingCount = state.pendingTransactions.size;
          state.pendingTransactions.clear();
          console.log(
            `✅ Safety clear: Completed ${remainingCount} remaining transactions`
          );
        }

        // Update only last synced timestamp; let realtime update refresh scheduleData
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
// --- START: Phase 3 - Editable Time Range Header Functions ---
/**
 * Handles click events on time range headers for editing.
 * @param {Event} event - The click event.
 */
export function handleTimeRangeHeaderClick(event) {
  // Use event.target since this is called from event delegation
  const slotIndexString = event.target.dataset.slotIndex;
  if (slotIndexString === undefined) {
    console.error("Slot index is undefined for clicked header.", {
      target: event.target,
      currentTarget: event.currentTarget,
      dataset: event.target.dataset,
    });
    showModal({
      content:
        "Could not determine which time range to edit. Range index missing.",
      title: "Error",
    });
    return;
  }
  const slotIndex = parseInt(slotIndexString, 10);

  if (isNaN(slotIndex)) {
    console.error("Slot index is not a number:", slotIndexString);
    showModal({
      content: "Invalid time range index provided. Must be a number.",
      title: "Error",
    });
    return;
  }

  if (
    !state.activeUserId ||
    !state.users[state.activeUserId] ||
    state.currentViewingFriendId
  ) {
    if (state.currentViewingFriendId) {
      console.log(
        "🔒 Cannot edit time range headers in friend's schedule - read-only mode"
      );
      return;
    }
    // This case should ideally not be reached if headers are only made clickable for active users,
    // but it's a good safeguard.
    console.error("handleTimeRangeHeaderClick called with no active user.");
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
        "Error: The selected time range could not be found or is invalid.",
      title: "Error",
    });
    return;
  }

  // If all checks pass, open the modal for editing
  openEditTimeRangeModal(slotIndex, activeUserObject);
}

/**
 * Opens a modal to edit a specific time range (structural schedule row).
 * @param {number} slotIndex - The index of the time range to edit.
 * @param {object} activeUserObject - The active user object.
 */
export function openEditTimeRangeModal(slotIndex, activeUserObject) {
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
    title: "Edit Time Range",
    isHtmlContent: true,
    showConfirmationButtons: true,
    confirmText: "Save Changes",
    cancelText: "Delete",
    onConfirm: () => {
      return processTimeRangeEdit(slotIndex, activeUserObject);
    },
    onCancel: () => {
      // Treat cancel button as Delete trigger. We must wait for the original modal's hide animation
      // to finish (hideModal clears callbacks after ~300ms) BEFORE showing the confirmation modal.
      console.log(
        "[TimeRange] Delete (cancel) clicked - scheduling confirmation modal",
        {
          slotIndex,
          label: currentTimeSlot.label,
        }
      );
      setTimeout(() => {
        showModal({
          title: "Delete Time Range",
          content: `Are you sure you want to delete the time range: <strong>${currentTimeSlot.label}</strong>? This will remove it for this user and shift remaining ranges. This action cannot be undone.`,
          isHtmlContent: true,
          showConfirmationButtons: true,
          confirmText: "Confirm Delete",
          cancelText: "Cancel",
          onConfirm: () => {
            console.log("[TimeRange] Confirm delete clicked", {
              slotIndex,
              label: currentTimeSlot.label,
            });
            processTimeRangeDelete(slotIndex, activeUserObject);
            return true; // Close confirmation modal
          },
        });
      }, 310); // Slightly > hideModal 300ms timeout to avoid callback wipe
      return true; // Close the edit modal immediately
    },
  });
}

/**
 * Processes the editing of a time range after modal submission.
 * @param {number} slotIndex - The index of the time range being edited.
 * @param {object} activeUserObject - The active user object.
 * @returns {boolean} True if successful (modal should close), false if validation fails.
 */
export function processTimeRangeEdit(slotIndex, activeUserObject) {
  const newStartTimeInput = document.getElementById("edit-slot-start-time");
  const newEndTimeInput = document.getElementById("edit-slot-end-time");
  const errorMessageElement = document.getElementById(
    "edit-slot-error-message"
  );

  if (!newStartTimeInput || !newEndTimeInput || !errorMessageElement) {
    console.error("Modal elements for editing time range not found.");

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
      "Invalid activeUserObject or missing timeSlots in processTimeRangeEdit."
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
      errorMessageElement.textContent = `Conflict: New start (${newStartTime}) must be after previous range's end (${prevSlot.end}).`;
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
      errorMessageElement.textContent = `Conflict: New end (${newEndTime}) must be before next range's start (${nextSlot.start}).`;
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

  // Transactional debounced save for structural time range edit
  const txId = `timeslot_edit_${state.activeUserId}_${slotIndex}_${Date.now()}`;
  state.pendingTransactions.set(txId, {
    type: "timeslot_edit_structure",
    userId: state.activeUserId,
    slotIndex,
    timestamp: Date.now(),
  });
  state.isLocalUpdate = true;
  updateUI();
  debouncedSaveStateToStorage(false, txId)
    .then(() => {
      state.isLocalUpdate = false;
    })
    .catch(() => {
      state.isLocalUpdate = false;
    });
  return true;
}

/**
 * Processes the deletion of a time range.
 * @param {number} slotIndex - The index of the time range to delete.
 * @param {object} activeUserObject - The active user object.
 */
export function processTimeRangeDelete(slotIndex, activeUserObject) {
  console.log("[TimeRange] processTimeRangeDelete invoked", {
    slotIndex,
    hasUser: !!activeUserObject,
    timeSlotCount: activeUserObject?.timeSlots?.length,
  });
  try {
    // --- Basic validation ---
    if (
      !activeUserObject ||
      !Array.isArray(activeUserObject.timeSlots) ||
      slotIndex < 0 ||
      slotIndex >= activeUserObject.timeSlots.length
    ) {
      console.error("Invalid data for time range deletion.", {
        slotIndex,
        hasUser: !!activeUserObject,
        timeSlots: activeUserObject?.timeSlots?.length,
      });
      showModal({
        title: "Error",
        content: "Could not delete time range due to an error.",
      });
      return;
    }

    const deletedSlotLabel = activeUserObject.timeSlots[slotIndex].label;

    // --- Structural delete (single source of truth) ---
    activeUserObject.timeSlots.splice(slotIndex, 1);

    // --- Defensive removal across parallel matrices ---
    if (Array.isArray(activeUserObject.schedule)) {
      activeUserObject.schedule.forEach((day, dayIdx) => {
        if (Array.isArray(day) && slotIndex < day.length) {
          day.splice(slotIndex, 1);
        } else if (!Array.isArray(day)) {
          console.warn("Skipping schedule day splice – not an array", {
            dayIdx,
            value: day,
          });
        }
      });
    }

    if (Array.isArray(activeUserObject.pinnedSlots)) {
      activeUserObject.pinnedSlots.forEach((day, dayIdx) => {
        if (Array.isArray(day) && slotIndex < day.length) {
          day.splice(slotIndex, 1);
        } else if (!Array.isArray(day)) {
          console.warn("Skipping pinnedSlots day splice – not an array", {
            dayIdx,
            value: day,
          });
        }
      });
    }

    if (Array.isArray(activeUserObject.slotInfo)) {
      activeUserObject.slotInfo.forEach((day, dayIdx) => {
        if (Array.isArray(day) && slotIndex < day.length) {
          day.splice(slotIndex, 1);
        } else if (!Array.isArray(day)) {
          console.warn("Skipping slotInfo day splice – not an array", {
            dayIdx,
            value: day,
          });
        }
      });
    }

    // --- Normalization: ensure all parallel arrays now have the same column count ---
    const expectedCols = activeUserObject.timeSlots.length;
    const normalizeMatrix = (matrixName) => {
      const matrix = activeUserObject[matrixName];
      if (!Array.isArray(matrix)) return;
      matrix.forEach((day, i) => {
        if (Array.isArray(day) && day.length !== expectedCols) {
          // Trim or pad with sensible defaults (false / null)
          if (day.length > expectedCols) {
            day.length = expectedCols; // truncate extra
          } else {
            while (day.length < expectedCols) {
              // Choose appropriate filler based on matrix
              if (matrixName === "schedule") day.push(false);
              else if (matrixName === "pinnedSlots") day.push(false);
              else if (matrixName === "slotInfo")
                day.push({ courseCode: null, classroom: null });
            }
          }
        }
      });
    };
    normalizeMatrix("schedule");
    normalizeMatrix("pinnedSlots");
    normalizeMatrix("slotInfo");

    // --- Pin Migration (preserve intent after structural change) ---
    try {
      migratePinsToTimeBased(activeUserObject);
    } catch (e) {
      console.warn("Pin migration failed after time range deletion", e);
    }

    // --- Analytics Tracking ---
    try {
      AnalyticsService.trackScheduleEdit("delete_timeslot", {
        slot_label: deletedSlotLabel,
        slot_index: slotIndex,
        remaining_slots: activeUserObject.timeSlots.length,
      });
    } catch (e) {
      // Fail silently to avoid blocking user flow
    }

    // --- Transactional persistence ---
    const txId = `timeslot_delete_${
      state.activeUserId
    }_${slotIndex}_${Date.now()}`;
    state.pendingTransactions.set(txId, {
      type: "timeslot_delete",
      userId: state.activeUserId,
      slotIndex,
      timestamp: Date.now(),
    });
    state.isLocalUpdate = true;
    updateUI();
    debouncedSaveStateToStorage(false, txId)
      .then(() => {
        state.isLocalUpdate = false;
      })
      .catch(() => {
        state.isLocalUpdate = false;
      });

    showModal({
      title: "Time Range Deleted",
      content: `The time range "${deletedSlotLabel}" has been deleted.`,
    });
  } catch (err) {
    console.error("Failed to delete time range", err);
    showModal({
      title: "Error",
      content: "An unexpected error occurred while deleting the time range.",
    });
  }
}

// Backward compatibility alias (old name). TODO: update tests/imports then remove.

// --- END: Phase 3 - Editable Time Range Header Functions ---

/* ================================
   MEMORY LEAK PREVENTION FUNCTIONS
================================== */

/**
 * Clean up only schedule content event listeners (slots, time headers, etc.)
 * Call this before re-rendering the schedule grid content
 * @returns {Promise<void>} Promise that resolves when cleanup is complete
 */
async function cleanupScheduleEventListeners() {
  // Clean up tracked schedule content event listeners

  // Process cleanup in batches to prevent blocking and race conditions
  const batchSize = 10;
  const listeners = [...state.scheduleEventListeners]; // Create copy for safety

  for (let i = 0; i < listeners.length; i += batchSize) {
    const batch = listeners.slice(i, i + batchSize);

    batch.forEach(({ element, eventType, handler, options }) => {
      try {
        if (element && typeof element.removeEventListener === "function") {
          element.removeEventListener(eventType, handler, options);
        }
      } catch (error) {
        console.warn(
          "🧹 Error removing schedule content event listener:",
          error
        );
      }
    });

    // Yield control to event loop between batches to prevent race conditions
    if (i + batchSize < listeners.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Clear the tracking array
  state.scheduleEventListeners = [];
}

/**
 * Clean up UI control event listeners (pin button, day/grid buttons, etc.)
 * Call this when the page/component is being destroyed
 * @returns {Promise<void>} Promise that resolves when cleanup is complete
 */
async function cleanupUIControlListeners() {
  // Clean up tracked UI control event listeners

  const batchSize = 10;
  const listeners = [...state.uiControlListeners]; // Create copy for safety

  for (let i = 0; i < listeners.length; i += batchSize) {
    const batch = listeners.slice(i, i + batchSize);

    batch.forEach(({ element, eventType, handler, options }) => {
      try {
        if (element && typeof element.removeEventListener === "function") {
          element.removeEventListener(eventType, handler, options);
        }
      } catch (error) {
        console.warn("🧹 Error removing UI control event listener:", error);
      }
    });

    // Yield control to event loop between batches to prevent race conditions
    if (i + batchSize < listeners.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Clear the tracking array
  state.uiControlListeners = [];
}

/**
 * Add a schedule content event listener and track it for cleanup
 * Used for slots, time headers, and other schedule grid content
 * @param {HTMLElement} element - The DOM element
 * @param {string} eventType - The event type (e.g., 'click')
 * @param {Function} handler - The event handler function
 * @param {Object|boolean} options - Optional event listener options (e.g., { passive: true })
 */
function addTrackedEventListener(element, eventType, handler, options = null) {
  element.addEventListener(eventType, handler, options);
  state.scheduleEventListeners.push({ element, eventType, handler, options });
}

/**
 * Add a UI control event listener and track it for cleanup
 * Used for buttons and controls that persist across schedule re-renders
 * @param {HTMLElement} element - The DOM element
 * @param {string} eventType - The event type (e.g., 'click')
 * @param {Function} handler - The event handler function
 * @param {Object|boolean} options - Optional event listener options (e.g., { passive: true })
 */
function addUIControlListener(element, eventType, handler, options = null) {
  if (!element) {
    console.warn(
      `⚠️  addUIControlListener: Element not found for ${eventType}`
    );
    return;
  }

  // 🛡️ ENHANCED LEAK PREVENTION: Create unique element identifier
  const elementKey =
    element.id ||
    element.tagName + "_" + (element.className || "").replace(/\s+/g, "_");
  const elementIdentifier = element.id || element.className || element.tagName;

  // 🚨 GLOBAL GUARD: Check by element identifier instead of reference (DOM elements get recreated)
  const existingListeners = state.uiControlListeners.filter((listener) => {
    const listenerKey =
      listener.element.id ||
      listener.element.tagName +
        "_" +
        (listener.element.className || "").replace(/\s+/g, "_");
    return listenerKey === elementKey && listener.eventType === eventType;
  });

  if (existingListeners.length > 0) {
    if (existingListeners.length > 2) {
      console.warn(
        `🚨 DUPLICATE PREVENTION: Found ${existingListeners.length} existing ${eventType} listeners for ${elementKey} (escalated)`
      );
    } else if (logManager?.dev) {
      logManager.dev.debug(
        `Duplicate listener cleanup: ${existingListeners.length} ${eventType} for ${elementKey}`
      );
    }

    // Remove ALL existing listeners matching this identifier + eventType
    existingListeners.forEach((existing) => {
      try {
        existing.element.removeEventListener(
          eventType,
          existing.handler,
          existing.options
        );
      } catch (e) {
        console.warn(`⚠️ Failed to remove listener (element may be stale):`, e);
      }
      const index = state.uiControlListeners.indexOf(existing);
      if (index > -1) {
        state.uiControlListeners.splice(index, 1);
      }
    });
  }

  element.addEventListener(eventType, handler, options);
  state.uiControlListeners.push({
    element,
    eventType,
    handler,
    options,
    elementKey,
  });
}

/* ================================
   END MEMORY LEAK PREVENTION
================================== */

// Add debouncing to prevent rapid re-renders that cause race conditions
let renderScheduleGridTimeout = null;

async function renderScheduleGrid() {
  // Debounce rapid calls to prevent race conditions
  if (renderScheduleGridTimeout) {
    clearTimeout(renderScheduleGridTimeout);
  }

  return new Promise((resolve) => {
    renderScheduleGridTimeout = setTimeout(async () => {
      await _renderScheduleGridInternal();
      resolve();
    }, 10); // Small delay to batch rapid calls
  });
}

async function _renderScheduleGridInternal() {
  // Render the schedule grid

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

  let currentTimeSlotsToRender = [];
  let allowEditingHeaders = false;
  let usedUnifiedSchedule = false; // Track if unified schedule was used
  let unifiedScheduleInstance = null; // Store the unified schedule instance
  let unifiedDisplayedIndices = null; // Optional mapping from visible row index -> unified slot index

  if (state.activeUserId && state.users[state.activeUserId]) {
    const user = state.users[state.activeUserId];
    if (user && Array.isArray(user.timeSlots)) {
      currentTimeSlotsToRender = user.timeSlots; // even if empty => render no columns
      // 🔒 Disable header editing when viewing friend's schedule
      allowEditingHeaders = !state.currentViewingFriendId;
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
        // Compute minimal displayed indices across the whole week: drop rows where all users are unavailable for all days
        unifiedDisplayedIndices = computeDisplayedUnifiedIndices(
          unifiedScheduleInstance,
          null // across week
        );
        currentTimeSlotsToRender = unifiedDisplayedIndices.map(
          (idx) => unifiedScheduleInstance.unifiedTimeSlots[idx]
        );
        usedUnifiedSchedule = true;

        // ✅ FIXED: Add constraint to prevent overflow - limit excessive granular slots
        const MAX_COMPARE_SLOTS = 20; // Reasonable limit for comparison
        if (currentTimeSlotsToRender.length > MAX_COMPARE_SLOTS) {
          console.warn(
            `⚠️ UnifiedSchedule created ${currentTimeSlotsToRender.length} slots, using fallback`
          );
          // Fallback to largest user's schedule to prevent UI overflow
          const largestSchedule = selectedUsers.reduce((largest, user) =>
            (user.timeSlots?.length || 0) > (largest.timeSlots?.length || 0)
              ? user
              : largest
          );
          currentTimeSlotsToRender = largestSchedule.timeSlots || [];
          usedUnifiedSchedule = false; // Don't use unified logic for comparison
          unifiedScheduleInstance = null;
          unifiedDisplayedIndices = null;
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
        currentTimeSlotsToRender = selectedUsers[0].timeSlots || [];
      }
    } else {
      currentTimeSlotsToRender = [];
    }
    allowEditingHeaders = false;
  } else if (state.compareMode && state.selectedUserIds.size === 0) {
    // ✅ COMPARE MODE: No users selected - show clean empty grid
    currentTimeSlotsToRender = [];
    allowEditingHeaders = false;
  } else {
    currentTimeSlotsToRender = [];
    allowEditingHeaders = false;
  }

  // 🧹 MEMORY LEAK FIX: Clean up event listeners before clearing DOM
  await cleanupScheduleEventListeners();

  // Brief pause to ensure cleanup is complete before DOM manipulation
  await new Promise((resolve) => setTimeout(resolve, 5));

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
      // 🔧 MEMORY LEAK FIX: Remove individual listeners - rely on event delegation
      // The scheduleTable click listener will handle these via event delegation
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
            const unifiedIndex = unifiedDisplayedIndices
              ? unifiedDisplayedIndices[timeIndex]
              : timeIndex;
            const slotStatus = unifiedScheduleInstance.getSlotStatus(
              dayIndex,
              unifiedIndex
            );
            // ✅ FIXED: Map UnifiedSchedule status to expected format
            busyUsers = slotStatus.busy || [];
            freeUsers = slotStatus.available || [];

            // Omit verbose per-slot comparison logging

            // Add granular time information to the cell for enhanced debugging
            dayCell.dataset.unifiedSlot = "true";
            dayCell.dataset.unifiedIndex = String(unifiedIndex);
            dayCell.dataset.originalTimeSlot = JSON.stringify({
              start: timeSlot.start,
              end: timeSlot.end,
              label: timeSlot.label,
              unifiedIndex,
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
                return isBusy;
              }
              // Only log warning if timeIndex is within expected range
              // Avoid verbose info logs for missing data in compare calculations
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
        dayCell.classList.remove(
          "slot-selected",
          "slot-free",
          "slot-conflict",
          "slot-partial"
        );
        for (let i = 1; i <= 10; i++) {
          dayCell.classList.remove(`color-${i}`);
        }

        if (currentSelectedUsers.length > 0) {
          if (busyUsers.length === 0) {
            // All users free - use beautiful glass green style
            dayCell.classList.add("slot-free");
            // Remove native title to avoid duplicate tooltip; custom tooltip handles messaging
            dayCell.removeAttribute("title");
          } else if (busyUsers.length === currentSelectedUsers.length) {
            // All users busy - use beautiful glass red style
            dayCell.classList.add("slot-conflict");
            dayCell.removeAttribute("title");
          } else {
            // Some users busy - use beautiful glass orange style
            dayCell.classList.add("slot-partial");
            // Avoid setting browser title; rely on unified custom tooltip
            dayCell.removeAttribute("title");
          }
        } else {
          // No users - clean empty state
          dayCell.removeAttribute("title");
        }

        dayCell.dataset.busyUsers = busyUsers.map((u) => u.id).join(",");
        dayCell.dataset.freeUsers = freeUsers.map((u) => u.id).join(",");
      } else if (state.compareMode && state.selectedUserIds.size === 0) {
        // COMPARE MODE: No users selected - show clean empty grid
        dayCell.classList.remove(
          "slot-selected",
          "slot-free",
          "slot-conflict",
          "slot-partial"
        );

        // Remove any color classes from previous renders
        for (let i = 1; i <= 10; i++) {
          dayCell.classList.remove(`color-${i}`);
        }

        // Avoid browser-native title; custom tooltip and inline messaging handle this
        dayCell.removeAttribute("title");

        // Clear any previous data attributes
        dayCell.dataset.busyUsers = "";
        dayCell.dataset.freeUsers = "";
        dayCell.dataset.unifiedSlot = "";
        dayCell.dataset.originalTimeSlot = "";

        // Smart logging: Only log clean state once per render
        if (dayIndex === 0 && timeIndex === 0) {
          console.log(
            `🧹 Clean grid state - compare mode with no users selected`
          );
        }
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

        // Grid retains visual color state; textual content handled elsewhere
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
            // Use data attributes for event delegation instead of direct listeners
            pinElement.dataset.action = "pin-toggle";
            pinElement.dataset.day = dayIndex;
            pinElement.dataset.time = timeIndex;
            dayCell.appendChild(pinElement);
          } else if (state.pinModeActive && isSlotActuallyFree) {
            const canPinElement = document.createElement("span");
            canPinElement.classList.add("can-pin-indicator");
            canPinElement.innerHTML = "&#43;";
            canPinElement.title = "Click to pin this slot";
            // Use data attributes for event delegation instead of direct listeners
            canPinElement.dataset.action = "pin-toggle";
            canPinElement.dataset.day = dayIndex;
            canPinElement.dataset.time = timeIndex;
            dayCell.appendChild(canPinElement);
          }
        }
      }

      // Pin Rendering Logic for Compare Mode (grid view only)
      if (
        state.viewMode === "grid" &&
        state.compareMode &&
        state.selectedUserIds.size > 0
      ) {
        // Smart logging: Only log pin rendering for first few slots
        if (dayIndex === 0 && timeIndex === 0) {
          console.log(`📌 Grid pin rendering for compare mode started`);
        }

        const existingPinIndicators = dayCell.querySelectorAll(
          ".pin-indicator, .can-pin-indicator, .compare-pin-indicator, .pin-square-container"
        );
        existingPinIndicators.forEach((indicator) => indicator.remove());

        const pinData = aggregatePinsForCompareModeTimeBased(
          dayIndex,
          timeIndex,
          state
        );

        const hasPinData = pinData.count > 0;

        // Smart logging: Only log pin data for first occurrence to prevent flooding
        if (hasPinData && dayIndex === 0) {
          console.log(`📌 Grid pin data found for day ${dayIndex}:`, {
            count: pinData.count,
            userNames: pinData.userNames,
            userIds: pinData.userIds,
          });
        }

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

          // 🔧 MEMORY LEAK FIX: Remove individual listeners - rely on event delegation
          // The scheduleTable click listener will handle these via event delegation

          dayCell.appendChild(pinContainer);
          // Smart logging: Only log pin container additions occasionally
          if (dayIndex === 0) {
            console.log(
              `📌 Grid pin container added at [${dayIndex}][${timeIndex}] with ${pinData.count} pins`
            );
          }
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
  logManager.uiRender("🎨 Grid rendering complete:", {
    timeSlots: slotCount,
    usedUnifiedSchedule,
    allowEditingHeaders,
    totalCells: slotCount * 7,
    compareMode: state.compareMode,
    selectedUsers: state.selectedUserIds.size,
  });

  if (slotCount > 8 || (state.compareMode && slotCount > 6)) {
    scheduleTable.classList.add("many-slots");
  } else {
    scheduleTable.classList.remove("many-slots");
  }
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

async function updateUI() {
  // 🛡️ SAFETY CHECK: Don't attempt UI updates if not on home page
  const currentRoute = window.location.hash.replace("#", "") || "home";
  if (currentRoute !== "home") {
    console.log("⏭️ [updateUI] Skipping UI update - not on home page");
    return;
  }

  // Clear memoization cache when UI updates (state changes)
  memoCache.clear();

  // Throttled logging for UI updates
  logManager.uiRender("UpdateUI", {
    viewMode: state.viewMode,
    compareMode: state.compareMode,
    activeUserId: state.activeUserId,
    totalUsers: Object.keys(state.users).length,
  });

  // Safely update mobile view controls with DOM readiness checks
  await safeUIUpdate(async () => {
    updateViewModeButtons();
    updateViewContainers();
  }, "View Mode Controls Update");

  // Render appropriate view based on current mode
  await renderScheduleForCurrentView();

  // Toggle pin-mode-active class on body for CSS styling
  document.body.classList.toggle("pin-mode-active", state.pinModeActive);

  // Update day selector if in day view
  if (state.viewMode === "day") {
    updateDaySelector();
  }

  const totalUserCount = Object.keys(state.users).length; // Get total number of users

  // --- START: Logic for Pin Mode Button ---
  if (DOM_ELEMENTS.togglePinModeBtn) {
    // 🔒 Hide pin button when viewing friend's schedule
    if (state.currentViewingFriendId) {
      DOM_ELEMENTS.togglePinModeBtn.style.display = "none";
      console.log("🔒 Pin button hidden - viewing friend's schedule");
    } else {
      DOM_ELEMENTS.togglePinModeBtn.style.display = "";

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
  }
  // --- END: Logic for Pin Mode Button ---

  // --- START: Logic for Add Time Slot Button ---
  if (DOM_ELEMENTS.addNewTimeSlotBtn) {
    // 🔒 Hide add time slot button when viewing friend's schedule
    if (state.currentViewingFriendId) {
      DOM_ELEMENTS.addNewTimeSlotBtn.style.display = "none";
      console.log("🔒 Add time slot button hidden - viewing friend's schedule");
    } else {
      DOM_ELEMENTS.addNewTimeSlotBtn.style.display = "";
    }
  }
  // --- END: Logic for Add Time Slot Button ---

  // Note: Mobile compare mode sync is handled directly in event handlers to prevent circular calls
  // Success logged via throttled uiRender above
}

/* ================================
   EVENT HANDLERS & APP LOGIC
================================== */

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
  logManager.uiRender(
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

    const desktopCompareButton = document.getElementById("compare");
    if (desktopCompareButton) {
      document.dispatchEvent(
        new CustomEvent("compare:onboarding", {
          detail: {
            source: "desktop-button",
            buttonElement: desktopCompareButton,
          },
        })
      );
    } else {
      document.dispatchEvent(
        new CustomEvent("compare:onboarding", {
          detail: { source: "desktop-button" },
        })
      );
    }

    // Compare Mode enabled
  } else {
    // ✅ FIXED: When exiting compare mode, don't auto-select user
    state.selectedUserIds.clear(); // Clear selected user IDs when exiting compare mode
    // activeUserId remains null - user must explicitly select someone after compare mode

    // Compare Mode disabled
  }

  // Update mobile compare mode for day view
  updateMobileCompareMode();

  updateUI();

  // Smart logging for mode completion - only every 2 seconds
  logManager.uiRender("✅ Compare mode toggle completed:", {
    newState: state.compareMode,
  });
}

function handleToggleUserSelectionForCompare(userId) {
  if (!state.compareMode) {
    // Attempted to toggle selection while compare mode is disabled
    return;
  }

  if (!state.users[userId]) {
    // Attempted to toggle selection for non-existent user
    return;
  }

  const wasSelected = state.selectedUserIds.has(userId);

  if (wasSelected) {
    state.selectedUserIds.delete(userId);
    // User deselected for comparison
  } else {
    state.selectedUserIds.add(userId);
    // User selected for comparison
  }

  updateUI();
}

function handleToggleScheduleSlot(dayIndex, timeIndex) {
  if (
    !state.activeUserId ||
    state.compareMode ||
    !state.users[state.activeUserId] ||
    state.currentViewingFriendId // 🔒 Prevent editing when viewing friend's schedule
  ) {
    // No active user, in compare mode, viewing friend's schedule, or user doesn't exist: show visual feedback
    if (state.currentViewingFriendId) {
      // Viewing friend's schedule - read-only
      return;
    }

    if (!state.activeUserId && !state.compareMode) {
      // Schedule is disabled - check if users exist to determine which glow to trigger
      const totalUserCount = Object.keys(state.users).length;

      if (totalUserCount === 0) {
        // No users exist - trigger add user button glow
      } else {
        // Users exist but no active user - trigger users section glow
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

  // If the slot carries a unifiedIndex mapping (from unifiedDisplayedIndices), use it for tooltip status
  const unifiedIndexAttr = slotElement.dataset.unifiedIndex;
  const effectiveTimeIndex = unifiedIndexAttr
    ? parseInt(unifiedIndexAttr, 10)
    : timeIndex;

  const message = generateTooltipMessage(dayIndex, effectiveTimeIndex, state, {
    forceUnified: !!unifiedIndexAttr,
  });

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
  // 🛡️ ENHANCED GUARD: Prevent multiple calls during same page load
  // But also verify DOM elements exist AND have active event listeners
  if (state.eventListenersSetup) {
    // Double-check: verify critical DOM elements still exist
    const criticalElements = [
      DOM_ELEMENTS.togglePinModeBtn,
      DOM_ELEMENTS.addNewTimeSlotBtn,
      DOM_ELEMENTS.dayViewBtn,
      DOM_ELEMENTS.gridViewBtn,
    ];

    const elementsExist = criticalElements.every(
      (el) => el && document.contains(el)
    );

    if (elementsExist) {
      // 🔍 ENHANCED CHECK: Verify listeners are actually attached
      // Check if any critical elements have active listeners in our tracking array
      const hasActiveListeners = criticalElements.some((element) => {
        if (!element) return false;

        const elementKey =
          element.id ||
          element.tagName +
            "_" +
            (element.className || "").replace(/\s+/g, "_");

        return state.uiControlListeners.some((listener) => {
          const listenerKey =
            listener.element.id ||
            listener.element.tagName +
              "_" +
              (listener.element.className || "").replace(/\s+/g, "_");
          return (
            listenerKey === elementKey &&
            listener.element === element &&
            document.contains(listener.element)
          );
        });
      });

      if (hasActiveListeners) {
        console.log(
          "🔒 Event listeners already set up and active - skipping duplicate setup"
        );
        return;
      } else {
        console.log(
          "🔄 DOM elements exist but no active listeners found - resetting for signin flow"
        );
        state.eventListenersSetup = false;
        // Continue with setup...
      }
    } else {
      console.log(
        "🔄 Event listeners flag was set but DOM elements missing - resetting for signin flow"
      );
      state.eventListenersSetup = false;
      // Continue with setup...
    }
  }

  console.log("🎯 Setting up HomePage event listeners (hybrid approach)...");
  console.log(
    "📊 Current UI control listeners before setup:",
    state.uiControlListeners.length
  );
  console.log("🔧 Event listeners setup triggered by signin flow or page load");

  // ===== CRITICAL: Document-level listeners will be set up by setupFriendsBarEventListeners() =====
  // Note: schedule:change, compare:mode, compare:selection listeners are handled separately

  // ===== UI CONTROL BUTTONS (specific listeners) =====
  console.log("🔧 Setting up UI control buttons...");
  console.log(
    "📍 DOM_ELEMENTS.togglePinModeBtn:",
    DOM_ELEMENTS.togglePinModeBtn
  );
  console.log(
    "📍 DOM_ELEMENTS.addNewTimeSlotBtn:",
    DOM_ELEMENTS.addNewTimeSlotBtn
  );
  console.log("📍 DOM_ELEMENTS.dayViewBtn:", DOM_ELEMENTS.dayViewBtn);
  console.log("📍 DOM_ELEMENTS.gridViewBtn:", DOM_ELEMENTS.gridViewBtn);

  if (DOM_ELEMENTS.togglePinModeBtn) {
    console.log("✅ Adding listener to pin button...");
    addUIControlListener(
      DOM_ELEMENTS.togglePinModeBtn,
      "click",
      handleTogglePinMode
    );
  } else {
    console.error("❌ togglePinModeBtn element not found!");
  }

  if (DOM_ELEMENTS.addNewTimeSlotBtn) {
    console.log("✅ Adding listener to add time slot button...");
    addUIControlListener(
      DOM_ELEMENTS.addNewTimeSlotBtn,
      "click",
      handleAddNewTimeSlotClick
    );
  } else {
    console.error("❌ addNewTimeSlotBtn element not found!");
  }

  // ===== SCHEDULE TABLE (event delegation) =====
  try {
    logManager?.dev?.debug?.("Setting up schedule table listeners");
  } catch (_) {}

  if (DOM_ELEMENTS.scheduleTable) {
    try {
      logManager?.dev?.debug?.(
        "Adding listeners to schedule table; handler=",
        typeof handleScheduleTableClick
      );
    } catch (_) {}

    addUIControlListener(
      DOM_ELEMENTS.scheduleTable,
      "click",
      handleScheduleTableClick
    );
    addUIControlListener(
      DOM_ELEMENTS.scheduleTable,
      "mouseover",
      handleScheduleTableMouseOver
    );
    addUIControlListener(
      DOM_ELEMENTS.scheduleTable,
      "mouseout",
      handleScheduleTableMouseOut
    );
  } else {
    console.error("❌ scheduleTable element not found!");
  }

  // ===== DAY VIEW CONTAINER (event delegation) =====
  if (DOM_ELEMENTS.dayViewContainer) {
    addUIControlListener(
      DOM_ELEMENTS.dayViewContainer,
      "click",
      handleDayViewClick
    );
  } else {
    console.error("❌ dayViewContainer element not found!");
  }

  // ===== SCHEDULE WRAPPER FEEDBACK =====
  if (DOM_ELEMENTS.scheduleWrapper) {
    addUIControlListener(
      DOM_ELEMENTS.scheduleWrapper,
      "click",
      handleScheduleWrapperFeedback
    );
  } else {
    console.error("❌ scheduleWrapper element not found!");
  }

  // ===== TOUCH EVENT PLACEHOLDERS =====
  // Minimal touch functions to prevent errors (functionality will be added later)
  function handleScheduleTouchStart(e) {
    /* Placeholder */
  }
  function handleScheduleTouchMove(e) {
    /* Placeholder */
  }
  function handleScheduleTouchEnd(e) {
    /* Placeholder */
  }
  function handleDocumentTouchStart(e) {
    /* Placeholder */
  }

  // Test listeners removed for production cleanliness

  // 🛡️ Mark event listeners as set up to prevent duplicates
  state.eventListenersSetup = true;
}

// ===== SCHEDULE TABLE EVENT HANDLER =====
function handleScheduleTableClick(e) {
  // Compact handler without verbose debug logs

  if (e.target) {
    console.log("[ScheduleTable] Click detected", {
      targetTag: e.target.tagName,
      classes: e.target.className,
    });
  }

  // Time slot header clicks (for editing time slots)
  const headerEl = e.target.closest(".editable-timeslot-header");
  if (headerEl) {
    console.log("[ScheduleTable] Time slot header click", {
      dataset: headerEl.dataset,
    });
    const slotIndex = parseInt(headerEl.dataset.slotIndex, 10);
    if (!isNaN(slotIndex)) {
      handleTimeRangeHeaderClick(e);
    }
    return;
  }

  // Pin container clicks (for pin tooltips) - supports legacy .pin-container and new .pin-square-container
  const pinContainer = e.target.closest(
    ".pin-container, .pin-square-container"
  );
  if (pinContainer) {
    const pinData = {
      userNames: JSON.parse(pinContainer.dataset.pinnedByUsers || "[]"),
      userIds: JSON.parse(pinContainer.dataset.pinnedUserIds || "[]"),
      count: parseInt(pinContainer.dataset.pinCount || "0", 10),
    };
    e.stopPropagation();
    showPinTooltip(e, pinData);
    return;
  }

  // Pin toggle actions
  if (e.target.dataset.action === "pin-toggle") {
    if (!state.pinModeActive) return;

    const day = parseInt(e.target.dataset.day, 10);
    const time = parseInt(e.target.dataset.time, 10);
    if (!isNaN(day) && !isNaN(time)) {
      handlePinSlotClick(day, time, e);
    }
    return;
  }

  // Schedule slot clicks (use closest to support clicks on children)
  const slotEl = e.target.closest(".slot");
  if (slotEl) {
    const day = parseInt(slotEl.dataset.day, 10);
    const time = parseInt(slotEl.dataset.time, 10);

    if (!isNaN(day) && !isNaN(time)) {
      if (state.pinModeActive && !state.compareMode) {
        // Pin mode: handle pinning for empty slots only
        const activeUser = state.users[state.activeUserId];
        const isSlotFree = activeUser && !activeUser.schedule[day][time];
        if (isSlotFree) {
          handlePinSlotClick(day, time, e);
        }
      } else if (!state.compareMode) {
        // Normal mode: toggle busy/free
        handleToggleScheduleSlot(day, time);
      }
    }
    return;
  }
}

function handleScheduleTableMouseOver(e) {
  if (!state.compareMode) return;
  const slotEl = e.target.closest && e.target.closest(".slot");
  if (slotEl) {
    const day = parseInt(slotEl.dataset.day, 10);
    const time = parseInt(slotEl.dataset.time, 10);
    if (!isNaN(day) && !isNaN(time)) {
      handleShowSlotTooltip(slotEl, day, time);
    }
  }
}

function handleScheduleTableMouseOut(e) {
  if (
    e.target.classList.contains("slot") ||
    e.target === DOM_ELEMENTS.scheduleTable
  ) {
    handleHideSlotTooltip();
  }
}

// ===== DAY VIEW EVENT HANDLER =====
function handleDayViewClick(e) {
  console.log("🔥 DAY VIEW CLICKED", {
    target: e.target,
    classList: Array.from(e.target.classList),
    dataset: e.target.dataset,
    nodeName: e.target.nodeName,
  });

  // Pin toggle actions
  if (e.target.dataset.action === "pin-toggle") {
    console.log("📌 Pin toggle action detected in day view");
    if (!state.pinModeActive) return;

    const day = parseInt(e.target.dataset.day, 10);
    const time = parseInt(
      e.target.dataset.time || e.target.dataset.timeIndex,
      10
    );
    if (!isNaN(day) && !isNaN(time)) {
      handlePinSlotClick(day, time, e);
    }
    return;
  }

  // 🎯 CORE FIX: Use closest to capture clicks on child elements within a slot
  const clickedSlotEl = e.target.closest(".day-time-slot, .slot");
  if (clickedSlotEl) {
    console.log("🎯 Day view schedule slot clicked!", {
      isDayTimeSlot: clickedSlotEl.classList.contains("day-time-slot"),
      isSlot: clickedSlotEl.classList.contains("slot"),
      hasDataTime: !!clickedSlotEl.dataset.time,
      hasDataTimeIndex: !!clickedSlotEl.dataset.timeIndex,
    });

    const day = parseInt(clickedSlotEl.dataset.day, 10);
    // 🔧 Handle both data-time (grid view) and data-time-index (day view)
    const time = parseInt(
      clickedSlotEl.dataset.time || clickedSlotEl.dataset.timeIndex,
      10
    );

    // Coordinates extracted

    if (!isNaN(day) && !isNaN(time)) {
      if (state.pinModeActive && !state.compareMode) {
        // Pin mode active - check if slot is free
        const activeUser = state.users[state.activeUserId];
        const isSlotFree = activeUser && !activeUser.schedule[day][time];
        if (isSlotFree) {
          handlePinSlotClick(day, time, e);
        } else {
          // Slot not free - cannot pin
        }
      } else if (!state.compareMode) {
        handleToggleScheduleSlot(day, time);
      } else {
        // Compare mode active - slot interaction disabled
      }
    } else {
      console.error("❌ Invalid day/time coordinates:", { day, time });
    }
  } else {
    // Click on non-slot element ignored
  }
}

// ===== SCHEDULE WRAPPER FEEDBACK =====
function handleScheduleWrapperFeedback(e) {
  if (
    DOM_ELEMENTS.scheduleWrapper.classList.contains("schedule-disabled") &&
    !e.target.closest("button") &&
    !e.target.closest(".add-row-btn") &&
    !e.target.closest(".slot")
  ) {
    const totalUserCount = Object.keys(state.users).length;

    if (totalUserCount === 0) {
      // No users exist, trigger add user glow
    } else {
      // Users exist but no active user, trigger users section glow
    }
  }
}

// ===== TOUCH EVENT MANAGEMENT =====
// Touch event functions are now defined within setupEventListeners()

// ===== DELEGATED EVENT HANDLERS =====
// Event handler functions are now defined within setupEventListeners()

// ===== CLEANED UP =====
// All touch event functions moved to setupEventListeners() scope

/* ================================
   MOBILE SCHEDULE REDESIGN
================================== */

/**
 * Initialize mobile-specific functionality and detect device type
 */
function initializeMobileSchedule() {
  // 🛡️ GUARD: Prevent multiple mobile initialization calls
  // But also verify DOM elements exist (fix for signin flow issue)
  if (state.mobileScheduleInitialized) {
    // Double-check: verify critical mobile DOM elements still exist
    const criticalMobileElements = [
      DOM_ELEMENTS.dayBtn0,
      DOM_ELEMENTS.dayBtn1,
      DOM_ELEMENTS.dayViewBtn,
      DOM_ELEMENTS.gridViewBtn,
    ];

    const elementsExist = criticalMobileElements.every(
      (el) => el && document.contains(el)
    );

    if (elementsExist) {
      console.log(
        "🔒 Mobile schedule already initialized - skipping duplicate initialization"
      );
      return;
    } else {
      console.log(
        "🔄 Mobile schedule flag was set but DOM elements missing - resetting for signin flow"
      );
      state.mobileScheduleInitialized = false;
      // Continue with setup...
    }
  }

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

  // Mobile schedule initialized

  // 🛡️ Mark mobile schedule as initialized
  state.mobileScheduleInitialized = true;
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

// Track if listeners have been set up to prevent duplicates
// ===== CLEAN LIFECYCLE MANAGEMENT =====
// Using event delegation - no initialization flags needed

/**
 * Set up view mode toggle functionality
 */
async function setupViewModeToggle() {
  console.log("📱 Setting up view mode toggle listeners...");

  try {
    // Make ViewModeManager globally available for debugging
    window.viewModeManager = viewModeManager;

    // Use ViewModeManager for robust setup
    await viewModeManager.initialize(state.viewMode, true); // Enable debug mode
    console.log("✅ ViewModeManager initialized successfully");

    // Listen for view mode changes
    document.addEventListener("viewModeChanged", (event) => {
      const { previousMode, newMode } = event.detail;
      console.log(`🔄 ViewMode changed: ${previousMode} → ${newMode}`);

      // Update internal state
      state.viewMode = newMode;

      // Re-render for new view mode
      renderScheduleForCurrentView();
    });
  } catch (error) {
    console.error(
      "❌ Failed to initialize ViewModeManager (no legacy fallback):",
      error
    );
  }
}

/**
 * Set up day navigation functionality
 */
function setupDayNavigation() {
  // Set up day navigation listeners

  // Add click listeners to all day buttons
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayBtn = DOM_ELEMENTS[`dayBtn${dayIndex}`];
    if (dayBtn) {
      addUIControlListener(dayBtn, "click", () => handleDayChange(dayIndex));
    }
  }

  // Day navigation listeners set up

  // Add keyboard navigation
  if (DOM_ELEMENTS.daySelector) {
    addUIControlListener(
      DOM_ELEMENTS.daySelector,
      "keydown",
      handleDayKeyNavigation
    );
  }

  // Mobile listeners initialization complete
}

/**
 * Set up swipe gestures for mobile day navigation
 */
function setupSwipeGestures() {
  if (!DOM_ELEMENTS.scheduleDayView) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let touchStartTime = 0;
  let isScrolling = false;
  let scrollContainer = null;

  // Find the scrollable container within day view
  const findScrollContainer = () => {
    return (
      DOM_ELEMENTS.scheduleDayView.querySelector(".day-view-container") ||
      DOM_ELEMENTS.scheduleDayView
    );
  };

  addUIControlListener(
    DOM_ELEMENTS.scheduleDayView,
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      touchStartTime = Date.now();
      isScrolling = false;
      scrollContainer = findScrollContainer();
    },
    { passive: true }
  );

  addUIControlListener(
    DOM_ELEMENTS.scheduleDayView,
    "touchmove",
    (e) => {
      if (isScrolling) return;

      const currentX = e.changedTouches[0].clientX;
      const currentY = e.changedTouches[0].clientY;
      const deltaX = Math.abs(currentX - touchStartX);
      const deltaY = Math.abs(currentY - touchStartY);

      // Determine scroll direction with improved thresholds
      if (deltaY > deltaX && deltaY > 15) {
        // Vertical scrolling detected
        isScrolling = true;
        return;
      }

      // If horizontal movement is dominant and significant, prepare for swipe
      if (deltaX > deltaY && deltaX > 25) {
        // Only prevent default if we're clearly swiping horizontally
        // This allows vertical scrolling to work normally
        const isAtTop = scrollContainer && scrollContainer.scrollTop <= 0;
        const isAtBottom =
          scrollContainer &&
          scrollContainer.scrollTop >=
            scrollContainer.scrollHeight - scrollContainer.clientHeight;

        // Allow swipe if we're at the edges or moving horizontally
        if (isAtTop || isAtBottom || deltaX > 50) {
          e.preventDefault();
        }
      }
    },
    { passive: false }
  ); // Not passive so we can preventDefault

  addUIControlListener(
    DOM_ELEMENTS.scheduleDayView,
    "touchend",
    (e) => {
      // Don't process swipe if user was scrolling
      if (isScrolling) return;

      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;
      handleSwipeGesture();
    },
    { passive: true }
  );

  function handleSwipeGesture() {
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = Math.abs(touchEndY - touchStartY);
    const swipeTime = Date.now() - touchStartTime;

    // Enhanced swipe detection parameters
    const minSwipeDistance = 60; // Minimum horizontal distance
    const maxVerticalDeviation = 100; // Maximum Y-axis movement allowed
    const maxSwipeTime = 400; // Maximum time for a valid swipe
    const minVelocity = 0.2; // Minimum swipe velocity (px/ms)

    // Calculate swipe velocity
    const velocity = Math.abs(swipeDistanceX) / swipeTime;

    // Check if this is a valid horizontal swipe
    const isValidSwipe =
      Math.abs(swipeDistanceX) > minSwipeDistance && // Sufficient horizontal distance
      swipeDistanceY < maxVerticalDeviation && // Not too much vertical movement
      swipeTime < maxSwipeTime && // Quick enough gesture
      velocity > minVelocity; // Fast enough swipe

    if (isValidSwipe) {
      if (swipeDistanceX > 0) {
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
async function handleViewModeChange(newViewMode) {
  console.log(`🔄 View mode change requested:`, {
    from: state.viewMode,
    to: newViewMode,
    timestamp: new Date().toISOString(),
    dayViewBtn: !!DOM_ELEMENTS.dayViewBtn,
    gridViewBtn: !!DOM_ELEMENTS.gridViewBtn,
    scheduleDayView: !!DOM_ELEMENTS.scheduleDayView,
    scheduleGridView: !!DOM_ELEMENTS.scheduleGridView,
  });

  if (state.viewMode === newViewMode) {
    console.log(`⚠️ View mode change ignored - already in ${newViewMode} mode`);
    return;
  }

  const previousViewMode = state.viewMode;
  state.viewMode = newViewMode;

  console.log(
    `✅ View mode changed from ${previousViewMode} to ${newViewMode}`
  );

  // Update UI elements
  updateViewModeButtons();
  updateViewContainers();

  // Update schedule rendering
  await renderScheduleForCurrentView();

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
    // Use setTimeout to make this async and prevent race conditions
    setTimeout(() => renderDayView(), 0);
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
/**
 * DOM Readiness System - Ensures critical DOM elements are available before UI updates
 * Addresses timing issue where spa:page:load fires before template elements are accessible
 */

/**
 * Checks if critical DOM elements for HomePage are available
 * @returns {boolean} True if all critical elements exist
 */
function checkDOMElementsReady() {
  const criticalElements = [
    "dayViewBtn",
    "gridViewBtn",
    "scheduleDayView",
    "scheduleGridView",
    "daySelectorContainer",
  ];

  const missingElements = criticalElements.filter((elementKey) => {
    const element = DOM_ELEMENTS[elementKey];
    const exists = element && element.nodeType === Node.ELEMENT_NODE;

    // Skip verbose logging for missing elements here

    return !exists;
  });

  const isReady = missingElements.length === 0;

  // Avoid verbose DOM readiness logs in production

  return isReady;
}

/**
 * Waits for critical DOM elements to become available with exponential backoff
 * @param {number} maxRetries - Maximum number of retry attempts (default: 10)
 * @param {number} initialDelay - Initial delay in ms (default: 50)
 * @returns {Promise<boolean>} Resolves to true when DOM is ready, false on timeout
 */
function waitForDOMReady(maxRetries = 10, initialDelay = 50) {
  return new Promise((resolve) => {
    let attempts = 0;

    function checkAndRetry() {
      attempts++;

      // Re-initialize DOM elements on each attempt to catch newly loaded elements
      initializeDomElements();

      if (checkDOMElementsReady()) {
        // DOM ready after attempts
        resolve(true);
        return;
      }

      if (attempts >= maxRetries) {
        console.warn(
          `⚠️ DOM readiness timeout after ${attempts} attempts - proceeding anyway`
        );
        resolve(false);
        return;
      }

      // Exponential backoff with jitter
      const delay =
        initialDelay * Math.pow(1.5, attempts - 1) + Math.random() * 10;
      console.log(
        `⏱️ Retrying DOM check in ${Math.round(
          delay
        )}ms (attempt ${attempts}/${maxRetries})`
      );

      setTimeout(checkAndRetry, delay);
    }

    checkAndRetry();
  });
}

/**
 * Safe wrapper for UI update functions that require DOM elements
 * @param {Function} updateFunction - Function to execute when DOM is ready
 * @param {string} functionName - Name of the function for logging
 * @returns {Promise<void>}
 */
async function safeUIUpdate(updateFunction, functionName = "UI update") {
  // 🛡️ SAFETY CHECK: Don't attempt UI updates if not on home page
  const currentRoute = window.location.hash.replace("#", "") || "home";
  if (currentRoute !== "home") {
    console.log(`⏭️ [${functionName}] Skipping - not on home page`);
    return;
  }

  const isReady = await waitForDOMReady();

  if (!isReady) {
    console.warn(
      `⚠️ ${functionName} called but DOM elements not fully ready - may have limited functionality`
    );
  }

  try {
    await updateFunction();
  } catch (error) {
    console.error(`❌ Error in ${functionName}:`, error);
  }
}

function updateViewModeButtons() {
  const dayViewBtn = DOM_ELEMENTS.dayViewBtn;
  const gridViewBtn = DOM_ELEMENTS.gridViewBtn;

  logManager.uiRender("ViewModeButtons", {
    mode: state.viewMode,
    buttons: { day: !!dayViewBtn, grid: !!gridViewBtn },
  });

  if (dayViewBtn) {
    const shouldBeActive = state.viewMode === "day";
    dayViewBtn.classList.toggle("active", shouldBeActive);
    logManager.ui.render(`Day button - active: ${shouldBeActive}`);
  } else {
    logManager.ui.warn(
      "Day view button not found - skipping update (normal when not on home page)"
    );
  }

  if (gridViewBtn) {
    const shouldBeActive = state.viewMode === "grid";
    gridViewBtn.classList.toggle("active", shouldBeActive);
    logManager.ui.render(`Grid button - active: ${shouldBeActive}`);
  } else {
    logManager.ui.warn(
      "Grid view button not found - skipping update (normal when not on home page)"
    );
  }
}

/**
 * Update view container visibility
 */
function updateViewContainers() {
  const dayView = DOM_ELEMENTS.scheduleDayView;
  const gridView = DOM_ELEMENTS.scheduleGridView;
  const daySelector = DOM_ELEMENTS.daySelectorContainer;

  logManager.ui.render("UpdateViewContainers", {
    dayView: !!dayView,
    gridView: !!gridView,
    daySelector: !!daySelector,
    viewMode: state.viewMode,
  });

  if (dayView) {
    dayView.classList.toggle("active", state.viewMode === "day");
  } else {
    console.log(
      `ℹ️ Day view container not found - skipping update (normal when not on home page)`
    );
  }

  if (gridView) {
    gridView.classList.toggle("active", state.viewMode === "grid");
  } else {
    console.log(
      `ℹ️ Grid view container not found - skipping update (normal when not on home page)`
    );
  }

  if (daySelector) {
    daySelector.classList.toggle("show", state.viewMode === "day");
  } else {
    console.log(
      `ℹ️ Day selector container not found - skipping update (normal when not on home page)`
    );
  }
}

/**
 * Setup mobile dropdown controls for schedule controls bar
 */
// Simplified mobile controls toggle (replaces previous over-engineered version)
// (initScheduleControlsToggle removed - delegated version lives in app.js)

/**
 * Render schedule for current view mode
 */
async function renderScheduleForCurrentView() {
  if (state.viewMode === "day") {
    await renderDayView();
  } else {
    await renderScheduleGrid(); // Use existing grid rendering
  }
}

/**
 * Render the day view for the selected day
 */
async function renderDayView() {
  logManager.uiRender("DayView", {
    selectedDay: state.selectedDay,
    dayName: getDayName(state.selectedDay),
    compareMode: state.compareMode,
    activeUserId: state.activeUserId,
  });

  const container = DOM_ELEMENTS.dayViewContainer;
  if (!container) {
    console.log(
      "ℹ️ Day view container not found - skipping render (normal when not on home page)"
    );
    return;
  }

  // 🧹 MEMORY LEAK FIX: Clean up event listeners before clearing DOM
  await cleanupScheduleEventListeners();

  // Brief pause to ensure cleanup is complete
  await new Promise((resolve) => setTimeout(resolve, 5));

  // Clear existing content
  container.innerHTML = "";

  // ✅ UNIFIED SCHEDULE LOGIC: Use same calculation as grid view
  let currentTimeSlotsToRender = [];
  let usedUnifiedSchedule = false;
  let unifiedScheduleInstance = null;
  let unifiedDisplayedIndices = null;

  if (state.activeUserId && state.users[state.activeUserId]) {
    // Normal mode: use active user's time slots
    const user = state.users[state.activeUserId];
    if (user && Array.isArray(user.timeSlots)) {
      currentTimeSlotsToRender = user.timeSlots; // allow empty to render no columns
    }
  } else if (state.compareMode && state.selectedUserIds.size > 0) {
    // ✅ COMPARE MODE: Use unified schedule calculation (same as grid view)
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
          "🔄 Day view: Creating unified schedule for heterogeneous time slots"
        );
        unifiedScheduleInstance = createUnifiedSchedule(selectedUsers);
        // Filter to minimal indices for the specific day to avoid empty rows
        unifiedDisplayedIndices = computeDisplayedUnifiedIndices(
          unifiedScheduleInstance,
          state.selectedDay // per-day filtering for day view
        );
        currentTimeSlotsToRender = unifiedDisplayedIndices.map(
          (idx) => unifiedScheduleInstance.unifiedTimeSlots[idx]
        );
        usedUnifiedSchedule = true;

        // ✅ Apply same constraint as grid view to prevent overflow
        const MAX_COMPARE_SLOTS = 20; // Same limit as grid view
        if (currentTimeSlotsToRender.length > MAX_COMPARE_SLOTS) {
          console.warn(
            `⚠️ Day view UnifiedSchedule created ${currentTimeSlotsToRender.length} slots, using fallback`
          );
          // Fallback to largest user's schedule to prevent UI overflow
          const largestSchedule = selectedUsers.reduce((largest, user) =>
            (user.timeSlots?.length || 0) > (largest.timeSlots?.length || 0)
              ? user
              : largest
          );
          currentTimeSlotsToRender = largestSchedule.timeSlots || [];
          usedUnifiedSchedule = false;
          unifiedScheduleInstance = null;
          unifiedDisplayedIndices = null;
        }

        console.log(
          `📊 Day view unified schedule created with ${currentTimeSlotsToRender.length} granular time slots`
        );
        console.log(
          "🔍 Day view original user time slot counts:",
          selectedUsers.map((u) => ({
            name: u.name || u.id,
            slots: u.timeSlots?.length || 0,
          }))
        );
      } else {
        console.log("📊 Day view: Using homogeneous schedule comparison");
        currentTimeSlotsToRender = selectedUsers[0].timeSlots || [];
      }
    } else {
      currentTimeSlotsToRender = [];
    }
  }

  console.log(`📊 Day view data source:`, {
    compareMode: state.compareMode,
    selectedUsersCount: state.selectedUserIds.size,
    timeSlotCount: currentTimeSlotsToRender.length,
    usedUnifiedSchedule: usedUnifiedSchedule,
  });

  // Generate time slots for the selected day
  const activeUser = state.activeUserId
    ? state.users[state.activeUserId]
    : null;
  currentTimeSlotsToRender.forEach((timeSlot, timeIndex) => {
    const slotElement = createDayViewTimeSlot(timeSlot, timeIndex, activeUser, {
      usedUnifiedSchedule,
      unifiedScheduleInstance,
      unifiedDisplayedIndices,
    });
    container.appendChild(slotElement);
  });

  logManager.uiRender("DayViewRender", {
    day: getDayName(state.selectedDay),
    slotCount: currentTimeSlotsToRender.length,
    usedUnifiedSchedule,
  });
}

/**
 * Create a time slot element for day view
 */
function createDayViewTimeSlot(timeSlot, timeIndex, user, unifiedOptions = {}) {
  const slotDiv = document.createElement("div");
  slotDiv.className = "day-time-slot";
  slotDiv.dataset.timeIndex = timeIndex;
  slotDiv.dataset.day = state.selectedDay;
  // If using unified schedule, store the effective unified index for tooltip mapping
  if (unifiedOptions?.usedUnifiedSchedule) {
    const effectiveIndex = unifiedOptions.unifiedDisplayedIndices
      ? unifiedOptions.unifiedDisplayedIndices[timeIndex]
      : timeIndex;
    slotDiv.dataset.unifiedIndex = String(effectiveIndex);
  }

  // Handle compare mode vs normal mode
  if (state.compareMode && state.selectedUserIds.size > 0) {
    slotDiv.classList.add("compare-mode");

    // ✅ UNIFIED SCHEDULE LOGIC: Use same logic as grid view
    const currentSelectedUsers = Array.from(state.selectedUserIds)
      .map((id) => state.users[id])
      .filter((user) => user && user.timeSlots);

    let busyUsers = [],
      freeUsers = [],
      unavailableUsers = [];
    let comparisonStatus = {};

    if (currentSelectedUsers.length > 0) {
      if (
        unifiedOptions.usedUnifiedSchedule &&
        unifiedOptions.unifiedScheduleInstance
      ) {
        // ✅ FIXED: Use UnifiedSchedule class for accurate comparison
        const effectiveIndex = unifiedOptions.unifiedDisplayedIndices
          ? unifiedOptions.unifiedDisplayedIndices[timeIndex]
          : timeIndex;
        const slotStatus = unifiedOptions.unifiedScheduleInstance.getSlotStatus(
          state.selectedDay,
          effectiveIndex
        );
        busyUsers = slotStatus.busy || [];
        freeUsers = slotStatus.available || [];
        unavailableUsers = slotStatus.unavailable || [];
      } else {
        // Fallback to direct comparison for homogeneous schedules
        busyUsers = currentSelectedUsers.filter((user) => {
          return user.schedule?.[state.selectedDay]?.[timeIndex] || false;
        });
        freeUsers = currentSelectedUsers.filter(
          (user) => !busyUsers.includes(user)
        );
      }

      // Apply day view specific class names for glass styling (3-state)
      // Treat unavailable as free for state determination (simpler UX)
      if (busyUsers.length === 0) {
        // All users free - use day view glass styling
        comparisonStatus = {
          cssClass: "all-free",
          text: "All Available",
          tooltip: `All ${currentSelectedUsers.length} users are available`,
        };
      } else if (busyUsers.length === currentSelectedUsers.length) {
        // All users busy - use day view glass styling
        comparisonStatus = {
          cssClass: "all-busy",
          text: "All Busy",
          tooltip: `All ${currentSelectedUsers.length} users are busy`,
        };
      } else {
        // Partial: at least one busy, not all busy
        const availableCount =
          freeUsers.length + (unavailableUsers.length || 0);
        comparisonStatus = {
          cssClass: "mixed-availability",
          text: "Partial",
          tooltip: `${availableCount} available, ${busyUsers.length} busy`,
        };
      }
    } else {
      comparisonStatus = {
        cssClass: "no-users",
        text: "No users",
        tooltip: "No valid users found for comparison",
      };
    }

    // Apply day view glass styling classes (only once)
    slotDiv.classList.add(comparisonStatus.cssClass);

    slotDiv.innerHTML = createDayViewCompareSlotContent(
      timeSlot,
      timeIndex,
      comparisonStatus,
      unifiedOptions
    );
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

    slotDiv.innerHTML = createNormalSlotContent(
      timeSlot,
      isBusy,
      slotInfo,
      isPinned,
      timeIndex
    );
  }

  // Add data attributes for event delegation instead of direct listeners
  slotDiv.dataset.day = state.selectedDay;
  slotDiv.dataset.time = timeIndex;

  return slotDiv;
}

/**
 * Compute a minimal list of unified slot indices to display.
 * - If dayIndex is null: keep slots where at least one day has any available or busy user.
 * - If dayIndex is number: keep slots where on that day at least one user is available or busy.
 */
function computeDisplayedUnifiedIndices(
  unifiedScheduleInstance,
  dayIndex = null
) {
  const indices = [];
  const total = unifiedScheduleInstance.unifiedTimeSlots.length;
  for (let i = 0; i < total; i++) {
    if (dayIndex == null) {
      // Check across the week
      let keep = false;
      for (let d = 0; d < 7; d++) {
        const st = unifiedScheduleInstance.getSlotStatus(d, i);
        if (
          (st.available && st.available.length) ||
          (st.busy && st.busy.length)
        ) {
          keep = true;
          break;
        }
      }
      if (keep) indices.push(i);
    } else {
      const st = unifiedScheduleInstance.getSlotStatus(dayIndex, i);
      if (
        (st.available && st.available.length) ||
        (st.busy && st.busy.length)
      ) {
        indices.push(i);
      }
    }
  }
  return indices;
}

/**
 * Create normal slot content (non-compare mode)
 */
function createNormalSlotContent(
  timeSlot,
  isBusy,
  slotInfo,
  isPinned = false,
  timeIndex = 0
) {
  const pinIndicator = isPinned
    ? `<span class="pin-indicator" data-action="pin-toggle" data-day="${state.selectedDay}" data-time="${timeIndex}" title="Pinned by you, Click to unpin">&#128204;</span>`
    : state.pinModeActive && !isBusy
    ? `<span class="can-pin-indicator" data-action="pin-toggle" data-day="${state.selectedDay}" data-time="${timeIndex}" title="Click to pin this slot">&#43;</span>`
    : "";

  return `
    <div class="slot-time">${timeSlot.label}</div>
    <div class="slot-content">
      ${(() => {
        if (!isBusy) return '<div class="slot-free-text">Free</div>';
        const code = (slotInfo?.courseCode || "").trim();
        const room = (slotInfo?.classroomNumber || "").trim();
        const primary = code || room || "Busy";
        const secondary = code && room ? room : "";
        return `
          <div class="slot-course-code">${primary}</div>
          <div class="slot-classroom">${secondary}</div>
        `;
      })()}
      ${pinIndicator}
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
  <div class="slot-comparison-status ${comparisonStatus.cssClass}">
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
 * Create compare mode slot content for day view with accurate unified schedule status
 */
function createDayViewCompareSlotContent(
  timeSlot,
  timeIndex,
  comparisonStatus,
  unifiedOptions = {}
) {
  // Generate avatars using the same logic but for day view
  const avatarContent = generateAvatarsForCompareSlot(
    state.selectedDay,
    timeIndex,
    {
      usedUnifiedSchedule: !!unifiedOptions.usedUnifiedSchedule,
      unifiedScheduleInstance: unifiedOptions.unifiedScheduleInstance || null,
      unifiedDisplayedIndices: unifiedOptions.unifiedDisplayedIndices || null,
      comparisonStatus,
    }
  );

  // Map comparison status to appropriate icon for day view
  let icon = "fas fa-question";
  if (comparisonStatus.cssClass === "all-free") {
    icon = "fas fa-check-circle";
  } else if (comparisonStatus.cssClass === "all-busy") {
    icon = "fas fa-times-circle";
  } else if (comparisonStatus.cssClass === "mixed-availability") {
    icon = "fas fa-exclamation-triangle";
  } else if (comparisonStatus.cssClass === "no-users") {
    icon = "fas fa-user-slash";
  }

  return `
    <div class="slot-time">${timeSlot.label}</div>
    <div class="slot-content">
  <div class="slot-comparison-status ${comparisonStatus.cssClass}">
        <div class="comparison-indicator">
          <i class="${icon}"></i>
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

  // Count busy vs free users (3-state model; unavailable treated as free)
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
function generateAvatarsForCompareSlot(dayIndex, timeIndex, options = {}) {
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

  // Reduce noisy logs in frequent avatar renders

  const selectedUsers = Array.from(state.selectedUserIds)
    .map((id) => state.users[id])
    .filter((user) => user);

  // Light summary for debugging could be re-enabled via logManager if needed

  if (selectedUsers.length === 0) {
    return '<span class="empty-slot-message">No users selected</span>';
  }

  // Determine busy/free using unified logic when available for consistency with status/tooltip
  let usersWithStatus = [];
  try {
    // If status says all free, force all avatars to green regardless of per-user data
    if (options?.comparisonStatus?.cssClass === "all-free") {
      usersWithStatus = selectedUsers.map((user) => ({
        ...user,
        isBusy: false,
      }));
    } else if (
      options?.usedUnifiedSchedule &&
      options?.unifiedScheduleInstance
    ) {
      const effectiveIndex = options.unifiedDisplayedIndices
        ? options.unifiedDisplayedIndices[timeIndex]
        : timeIndex;
      const slotStatus = options.unifiedScheduleInstance.getSlotStatus(
        dayIndex,
        effectiveIndex
      );
      const busyIds = new Set((slotStatus.busy || []).map((u) => u.userId));
      const unavailableIds = new Set(
        (slotStatus.unavailable || []).map((u) => u.userId)
      );
      usersWithStatus = selectedUsers.map((user) => ({
        ...user,
        // Busy only if explicitly in busy list. Users marked unavailable get a distinct state.
        isBusy: busyIds.has(user.id),
        isUnavailable: unavailableIds.has(user.id),
      }));
    } else {
      // Homogeneous schedules fallback
      usersWithStatus = selectedUsers.map((user) => {
        const isBusy = user.schedule?.[dayIndex]?.[timeIndex] || false;
        return { ...user, isBusy, isUnavailable: false };
      });
    }
  } catch (e) {
    console.warn(
      "⚠️ Error computing avatar statuses with unified options, falling back:",
      e
    );
    usersWithStatus = selectedUsers.map((user) => {
      const isBusy = user.schedule?.[dayIndex]?.[timeIndex] || false;
      return { ...user, isBusy, isUnavailable: false };
    });
  }

  console.log(
    `📋 All selected users with status at [${dayIndex}][${timeIndex}]:`,
    {
      users: usersWithStatus.map((u) => ({
        name: u.name || u.id,
        status: u.isBusy ? "BUSY" : "FREE",
      })),
      totalCount: usersWithStatus.length,
      freeCount: usersWithStatus.filter((u) => !u.isBusy).length,
      busyCount: usersWithStatus.filter((u) => u.isBusy).length,
    }
  );

  let avatarsHTML = "";
  const maxVisible = 5; // Maximum avatars to show before overflow

  usersWithStatus.slice(0, maxVisible).forEach((user, index) => {
    const avatarUrl = generateAvatar(user.name || user.id);
    // Treat unavailable as free for ring purposes to avoid dimmed avatars in partial states
    const statusClass = user.isBusy ? "busy" : "free";
    const statusTitle = user.isBusy ? "Busy" : "Available";

    // Avoid verbose per-avatar logs to reduce console noise

    avatarsHTML += `
      <div class="friend-avatar ${statusClass}" data-friend-id="${
      user.id
    }" aria-label="${user.name || user.id} - ${statusTitle}">
  <img src="${avatarUrl}" alt="${
      user.name || user.id
    }" loading="lazy" decoding="async" />
        <div class="avatar-label">${user.name || user.id}</div>
      </div>
    `;
  });

  // Add overflow indicator if needed
  if (usersWithStatus.length > maxVisible) {
    const remainingCount = usersWithStatus.length - maxVisible;
    console.log(
      `➕ Adding overflow indicator for ${remainingCount} additional users`
    );
    avatarsHTML += `
      <div class="avatar-overflow">+${remainingCount}</div>
    `;
  }

  console.log(
    `✅ Avatar HTML generated for ${
      usersWithStatus.length
    } selected users (${Math.min(usersWithStatus.length, maxVisible)} visible)`
  );
  return avatarsHTML;
}

/**
 * Generate avatar URL for a given name
 */
function generateAvatar(nameOrUserId) {
  console.log(`🔍 [DEBUG] generateAvatar called with: "${nameOrUserId}"`);

  // Strategy 1: Get fresh data directly from HorizontalFriendsBar instance (not cached state!)
  // This ensures we get the most up-to-date data that includes real-time updates
  if (
    state.horizontalFriendsBar &&
    typeof state.horizontalFriendsBar.getFreshQuickAccessFriends === "function"
  ) {
    try {
      const freshQuickAccessFriends =
        state.horizontalFriendsBar.getFreshQuickAccessFriends();
      if (freshQuickAccessFriends) {
        const friend = freshQuickAccessFriends.find(
          (f) =>
            f.userId === nameOrUserId ||
            f.friendId === nameOrUserId ||
            f.handle === nameOrUserId ||
            f.id === nameOrUserId
        );

        if (friend && friend.avatarConfig) {
          const avatarUrl = getAvatarUrl(friend);
          if (avatarUrl) {
            console.log(
              `🎨 [FRESH QUICK ACCESS HIT] Using fresh QuickAccess avatar for ${nameOrUserId}`
            );
            return avatarUrl;
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error getting fresh QuickAccess data:`, error);
    }
  }

  // Fallback: Use cached data only if fresh data is unavailable
  if (
    state.horizontalFriendsBar &&
    state.horizontalFriendsBar.quickAccessFriends
  ) {
    try {
      const friend = state.horizontalFriendsBar.quickAccessFriends.find(
        (f) =>
          f.userId === nameOrUserId ||
          f.friendId === nameOrUserId ||
          f.handle === nameOrUserId ||
          f.id === nameOrUserId
      );

      if (friend && friend.avatarConfig) {
        const avatarUrl = getAvatarUrl(friend);
        if (avatarUrl) {
          console.log(
            `🎨 [CACHED QUICK ACCESS HIT] Using cached QuickAccess avatar for ${nameOrUserId}`
          );
          return avatarUrl;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error accessing cached QuickAccess friends:`, error);
    }
  }

  // Strategy 2: Check HorizontalFriendsBar friends array (fallback)
  if (state.horizontalFriendsBar && state.horizontalFriendsBar.friends) {
    try {
      const friend = state.horizontalFriendsBar.friends.find(
        (f) =>
          f.friendId === nameOrUserId ||
          f.handle === nameOrUserId ||
          f.userId === nameOrUserId ||
          f.id === nameOrUserId
      );

      if (friend && friend.avatarConfig) {
        const avatarUrl = getAvatarUrl(friend);
        if (avatarUrl) {
          console.log(
            `🎨 [FRIENDS BAR HIT] Using HorizontalFriendsBar avatar for ${nameOrUserId}`
          );
          return avatarUrl;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error accessing HorizontalFriendsBar friends:`, error);
    }
  }

  // Strategy 3: Check state.users cache with better matching
  console.log(`🔍 [DEBUG] state.users:`, {
    userCount: Object.keys(state.users).length,
    userIds: Object.keys(state.users),
    users: Object.values(state.users).map((u) => ({
      id: u.id,
      name: u.name,
      hasAvatarConfig: !!u.avatarConfig,
      avatarConfigKeys: u.avatarConfig ? Object.keys(u.avatarConfig) : [],
    })),
    currentUserUid: authManager.getCurrentUser()?.uid,
  });

  let user = Object.values(state.users).find(
    (u) =>
      u.name === nameOrUserId ||
      u.id === nameOrUserId ||
      (nameOrUserId === "You" && u.id === authManager.getCurrentUser()?.uid)
  );

  if (user && user.avatarConfig) {
    const avatarUrl = getAvatarUrl(user);
    if (avatarUrl) {
      console.log(
        `🎨 [STATE CACHE HIT] Using state.users avatar for ${nameOrUserId}`
      );
      return avatarUrl;
    }
  }

  // Strategy 4: For current user, check currentUser store directly
  if (
    nameOrUserId === "You" ||
    nameOrUserId === "Me" ||
    nameOrUserId === authManager.getCurrentUser()?.uid
  ) {
    console.log(`🔍 [DEBUG] Current user check:`, {
      currentUserProfile: currentUser.profile,
      hasAvatarConfig: !!currentUser.profile?.avatarConfig,
      avatarConfig: currentUser.profile?.avatarConfig,
      currentUserUid: authManager.getCurrentUser()?.uid,
    });

    const currentUserProfile = currentUser.profile;
    if (currentUserProfile?.avatarConfig) {
      const avatarUrl = getAvatarUrl(currentUserProfile);
      if (avatarUrl) {
        console.log(
          `🎨 [CURRENT USER HIT] Using currentUser avatar for ${nameOrUserId}`
        );
        return avatarUrl;
      }
    }
  }

  // Strategy 5: Fallback to DiceBear (consistent avatars)
  console.log(
    `🎨 [FALLBACK] Using DiceBear avatar for ${nameOrUserId} - no avatarConfig found`
  );
  const encodedName = encodeURIComponent(nameOrUserId);
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodedName}&backgroundColor=7c4dff`;
}

/**
 * Enhanced friends' schedule cache management with expiration and real-time sync
 */
const FRIENDS_SCHEDULE_CACHE = {
  // Cache expiration time: 5 minutes for frequent updates, 15 minutes for background
  CACHE_TTL_ACTIVE: 5 * 60 * 1000, // 5 minutes for actively used data
  CACHE_TTL_BACKGROUND: 15 * 60 * 1000, // 15 minutes for background data

  /**
   * Check if cached data is still valid
   * @param {string} friendId - Friend's user ID
   * @param {boolean} isActivelyUsed - Whether this data is actively being viewed
   * @returns {boolean} - Whether cache is valid
   */
  isCacheValid(friendId, isActivelyUsed = false) {
    const cached = state.friendsScheduleCache.get(friendId);
    if (!cached) return false;

    const now = Date.now();
    const ttl = isActivelyUsed
      ? this.CACHE_TTL_ACTIVE
      : this.CACHE_TTL_BACKGROUND;
    const isValid = now - cached.timestamp < ttl;

    if (!isValid) {
      console.log(
        `🕐 [CACHE EXPIRED] ${friendId} cache expired (${Math.round(
          (now - cached.timestamp) / 1000
        )}s old)`
      );
    }

    return isValid;
  },

  /**
   * Get cached schedule data if valid
   * @param {string} friendId - Friend's user ID
   * @param {boolean} isActivelyUsed - Whether this data is actively being viewed
   * @returns {Object|null} - Cached data or null
   */
  getCachedSchedule(friendId, isActivelyUsed = false) {
    if (!this.isCacheValid(friendId, isActivelyUsed)) {
      return null;
    }

    const cached = state.friendsScheduleCache.get(friendId);
    console.log(`✅ [CACHE HIT] Using cached schedule for ${friendId}`);
    return cached.data;
  },

  /**
   * Cache schedule data with metadata
   * @param {string} friendId - Friend's user ID
   * @param {Object} scheduleData - Schedule data to cache
   */
  setCachedSchedule(friendId, scheduleData) {
    state.friendsScheduleCache.set(friendId, {
      data: scheduleData,
      timestamp: Date.now(),
      isStale: false,
    });

    // Also maintain backward compatibility with existing cache
    state.friendsScheduleData.set(friendId, scheduleData);

    console.log(`💾 [CACHE SET] Cached schedule for ${friendId}`);
  },

  /**
   * Mark cache as stale (friend updated their schedule)
   * @param {string} friendId - Friend's user ID
   */
  markStale(friendId) {
    const cached = state.friendsScheduleCache.get(friendId);
    if (cached) {
      cached.isStale = true;
      console.log(`⚠️ [CACHE STALE] Marked ${friendId} schedule as stale`);
    }
  },

  /**
   * Clear expired cache entries
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [friendId, cached] of state.friendsScheduleCache.entries()) {
      if (now - cached.timestamp > this.CACHE_TTL_BACKGROUND) {
        state.friendsScheduleCache.delete(friendId);
        state.friendsScheduleData.delete(friendId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 [CACHE CLEANUP] Removed ${cleanedCount} expired entries`);
    }
  },
};

/**
 * Real-time sync system for friends' schedule updates
 */
const FRIENDS_REALTIME_SYNC = {
  listeners: new Map(), // friendId -> unsubscribe function

  /**
   * Set up real-time listener for a friend's schedule updates
   * @param {string} friendId - Friend's user ID
   * @param {string} friendName - Friend's display name
   */
  setupRealtimeListener(friendId, friendName) {
    // Skip if already listening
    if (this.listeners.has(friendId)) {
      console.log(`🔄 Already listening to ${friendName}'s schedule updates`);
      return;
    }

    try {
      // Set up real-time listener using dataManager (similar to current user's sync)
      const unsubscribe = dataManager.setupUserScheduleListener?.(
        friendId,
        (updatedScheduleData) => {
          if (updatedScheduleData) {
            console.log(
              `🔔 [REALTIME UPDATE] ${friendName}'s schedule updated!`
            );

            // Update enhanced cache with fresh data
            FRIENDS_SCHEDULE_CACHE.setCachedSchedule(
              friendId,
              updatedScheduleData
            );

            // Update state.users if friend is currently in comparison
            if (state.users[friendId]) {
              console.log(
                `🔄 [REALTIME SYNC] Updating ${friendName} in state.users`
              );

              const convertedScheduleData =
                convertFirestoreToHomePageFormat(updatedScheduleData);
              if (convertedScheduleData) {
                state.users[friendId] = {
                  id: friendId,
                  name: friendName,
                  timeSlots: convertedScheduleData.timeSlots,
                  schedule: convertedScheduleData.schedule,
                  slotInfo: convertedScheduleData.slotInfo,
                  pinnedSlots:
                    convertedScheduleData.pinnedSlots ||
                    createWeeklyMatrix(
                      convertedScheduleData.timeSlots.length,
                      false
                    ),
                };

                // Clear caches to force re-render with fresh data
                memoCache.clear();
                matrixCache.clear();

                // Re-render UI if in comparison mode
                if (state.compareMode && state.selectedUserIds.has(friendId)) {
                  console.log(
                    `🎨 [REALTIME RENDER] Re-rendering comparison with updated ${friendName} data`
                  );
                  if (state.viewMode === "day") {
                    renderDayView();
                  } else {
                    renderScheduleGrid();
                  }
                }
              }
            }
          }
        }
      );

      if (unsubscribe) {
        this.listeners.set(friendId, unsubscribe);
        console.log(
          `🔔 [REALTIME SETUP] Listening to ${friendName}'s schedule updates`
        );
      }
    } catch (error) {
      console.warn(
        `⚠️ [REALTIME ERROR] Failed to setup listener for ${friendName}:`,
        error
      );
    }
  },

  /**
   * Remove real-time listener for a friend
   * @param {string} friendId - Friend's user ID
   */
  removeRealtimeListener(friendId) {
    const unsubscribe = this.listeners.get(friendId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(friendId);
      console.log(
        `🔕 [REALTIME CLEANUP] Stopped listening to ${friendId}'s updates`
      );
    }
  },

  /**
   * Clean up all real-time listeners
   */
  cleanup() {
    let cleanedCount = 0;
    for (const [friendId, unsubscribe] of this.listeners.entries()) {
      unsubscribe();
      cleanedCount++;
    }
    this.listeners.clear();

    if (cleanedCount > 0) {
      console.log(
        `🔕 [REALTIME CLEANUP] Removed ${cleanedCount} real-time listeners`
      );
    }
  },
};
/**
 * Periodic cache maintenance system
 */
const CACHE_MAINTENANCE = {
  intervalId: null,
  CLEANUP_INTERVAL: 10 * 60 * 1000, // 10 minutes

  /**
   * Start periodic cache cleanup
   */
  start() {
    if (this.intervalId) return; // Already running

    this.intervalId = setInterval(() => {
      console.log("🧹 [PERIODIC CLEANUP] Running cache maintenance...");
      FRIENDS_SCHEDULE_CACHE.cleanup();

      // Also clean up unused real-time listeners
      const activeUserIds = new Set(
        [
          ...state.selectedUserIds,
          state.currentViewingFriendId,
          state.activeUserId,
        ].filter((id) => id)
      );

      for (const friendId of FRIENDS_REALTIME_SYNC.listeners.keys()) {
        if (!activeUserIds.has(friendId) && !state.users[friendId]) {
          console.log(`🔕 [CLEANUP] Removing unused listener for ${friendId}`);
          FRIENDS_REALTIME_SYNC.removeRealtimeListener(friendId);
        }
      }
    }, this.CLEANUP_INTERVAL);

    console.log("⏰ [MAINTENANCE] Started periodic cache cleanup");
  },

  /**
   * Stop periodic cache cleanup
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("⏹️ [MAINTENANCE] Stopped periodic cache cleanup");
    }
  },
};

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

// ✅ REMOVED: Duplicate spa:page:load listener that was causing double event handlers
// This was the root cause of pin flickering and rapid click issues
// The main initialization happens in the event listener at line ~5825

// (Removed legacy unused authentication UI helpers: showUnauthenticatedUI, showUserInfo, hideUserInfo,
// enableScheduleFeatures, disableScheduleFeatures, checkProfileCompletion, preselectUserAvatar)
// All authentication state handling now occurs within setupAuthenticationCallbacks() and the
// HorizontalFriendsBar component.

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

        // 🔧 SIGNIN FIX: Reset event listeners setup to ensure fresh setup after signin
        console.log(
          "🔧 Resetting event listeners for fresh setup after signin"
        );
        state.eventListenersSetup = false;

        navigateTo("home");
      }
    } catch (error) {
      console.error("Error checking profile completion after sign-in:", error);
      // On error, navigate to home to avoid getting stuck in profile setup
      // Users can manually navigate to profile setup if needed
      console.log("⚠️ Error occurred, navigating to home for safety...");

      // 🔧 SIGNIN FIX: Reset event listeners setup to ensure fresh setup after signin error
      console.log(
        "🔧 Resetting event listeners for fresh setup after signin error"
      );
      state.eventListenersSetup = false;

      navigateTo("home");
    }
  });

  // Set up sign-in error callback for better error handling
  authManager.setSigninErrorCallback((data) => {
    console.error("❌ Sign-in failed:", data.error.message);
    // The auth modal will handle showing the error to the user
  });

  // Also react to auth state changes to handle logout UI reset
  try {
    authManager.onAuthStateChanged(async (user) => {
      if (!user) {
        // User logged out while on home page: clear in-memory schedule and UI
        console.log(
          "🧼 [HomePage] Auth logout detected – clearing schedule state/UI"
        );

        // Stop realtime schedule listener if active
        if (window.scheduleRealtimeUnsubscribe) {
          try {
            window.scheduleRealtimeUnsubscribe();
          } catch (_) {}
          // realtimeUnsubscribe cleared
        }

        // Cleanup UI listeners and friends bar
        try {
          await cleanupScheduleEventListeners();
        } catch (_) {}
        try {
          await cleanupUIControlListeners();
        } catch (_) {}
        try {
          cleanupHorizontalFriendsBar();
        } catch (_) {}

        // Clear state
        state.activeUserId = null;
        state.users = {};
        state.selectedUserIds.clear();
        state.compareMode = false;
        state.pinModeActive = false;
        state.currentViewingFriendId = null;
        state.friendsScheduleData.clear();
        state.friendsScheduleCache.clear();
        memoCache.clear();
        matrixCache.clear();

        // Re-render to blank/disabled state if we're on home
        updateUI();
      } else {
        // User logged in (or auth restored on refresh): ensure friends bar exists on Home
        try {
          const currentRoute = window.location.hash.replace("#", "") || "home";
          const needsInit = !state.horizontalFriendsBar;
          if (currentRoute === "home" && needsInit) {
            const containerEl = document.getElementById(
              "horizontal-friends-container"
            );
            if (containerEl) {
              console.log(
                "⭐ Auth ready on Home – initializing Horizontal Friends Bar (auth state)"
              );
              initializeHorizontalFriendsBar();
            } else {
              // If DOM not ready yet, initialize when SPA loads home template
              const onSpaLoad = (evt) => {
                if (evt.detail?.route === "home") {
                  document.removeEventListener("spa:page:load", onSpaLoad);
                  initializeHorizontalFriendsBar();
                }
              };
              document.addEventListener("spa:page:load", onSpaLoad);
            }
          }
        } catch (e) {
          console.warn(
            "⚠️ Failed to initialize friends bar on auth state change:",
            e
          );
        }
      }
    });
  } catch (_) {
    // non-fatal
  }
}

/* ================================
   PHASE-3: HORIZONTAL FRIENDS BAR
================================== */

/**
 * Initialize the Horizontal Friends Bar component
 */
async function initializeHorizontalFriendsBar() {
  try {
    if (state.isFriendsBarInitializing) {
      console.log(
        "⏳ Friends bar init already in progress; skipping duplicate call"
      );
      return;
    }
    state.isFriendsBarInitializing = true;
    console.log("🔍 DEBUG INIT: initializeHorizontalFriendsBar called");
    const containerEl = document.getElementById("horizontal-friends-container");
    if (!containerEl) {
      console.warn("⚠️ Friends bar container not found in DOM; skipping init");
      return;
    }

    // If an instance exists, verify it's still bound to the current container and DOM
    if (state.horizontalFriendsBar) {
      const bar = state.horizontalFriendsBar;
      const isSameNode = bar.container === containerEl;
      const isConnected = !!bar.container && bar.container.isConnected;

      if (!isSameNode || !isConnected) {
        console.log(
          "🧹 Detected stale HorizontalFriendsBar instance. Destroying before re-init..."
        );
        try {
          bar.destroy && bar.destroy();
        } catch (e) {
          console.warn("⚠️ Error during stale bar destroy:", e);
        }
        state.horizontalFriendsBar = null;
      } else {
        // Instance is valid and attached to current DOM; ensure listeners are in a good state and exit.
        console.log(
          "✅ Existing HorizontalFriendsBar is attached; ensuring listeners and skipping re-init"
        );
        setupFriendsBarEventListeners();
        return;
      }
    }

    // Ensure user profile is available (avoid race on first load)
    if (!currentUser?.profile) {
      try {
        await currentUser.waitForProfileWithTimeout(2000);
      } catch (e) {
        console.warn(
          "⏱️ Profile not ready in 2s; will initialize friends bar when profile arrives"
        );
      }
      if (!currentUser?.profile) {
        // Defer initialization until profile becomes available (non-blocking)
        const unsubscribe = currentUser.subscribe((snapshot) => {
          if (snapshot.profile && !state.horizontalFriendsBar) {
            try {
              unsubscribe && unsubscribe();
            } catch {}
            // Retry initialization now that profile exists
            initializeHorizontalFriendsBar();
          }
        });
        return;
      }
    }

    console.log("🚀 Creating new HorizontalFriendsBar instance...");
    // Dynamically import and initialize the HorizontalFriendsBar component (avoids loading on logged-out)
    const { HorizontalFriendsBar } = await import(
      "../components/friends/HorizontalFriendsBar.js"
    );
    state.horizontalFriendsBar = new HorizontalFriendsBar(
      "horizontal-friends-container"
    );

    await state.horizontalFriendsBar.init();

    // Set up event listeners for friends bar events
    setupFriendsBarEventListeners();

    console.log("✅ Horizontal Friends Bar initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Horizontal Friends Bar:", error);
  } finally {
    state.isFriendsBarInitializing = false;
  }
}

/**
 * Set up event listeners for Horizontal Friends Bar events
 */
function setupFriendsBarEventListeners() {
  console.log("🎯 Setting up friends bar event listeners...");

  // Remove any existing listeners first to prevent duplicates
  document.removeEventListener("schedule:change", handleFriendScheduleChange);
  document.removeEventListener("compare:mode", handleCompareModeChange);
  document.removeEventListener(
    "compare:selection",
    handleCompareSelectionChange
  );
  document.removeEventListener(
    "friendsbar:avatarsRendered",
    handleFriendsBarRendered
  );
  document.removeEventListener(
    "compare:onboarding",
    handleCompareOnboardingRequest
  );

  // Listen for schedule change events (when user clicks friend avatar) - MUST PERSIST!
  addUIControlListener(document, "schedule:change", (event) => {
    console.log("🔥 SCHEDULE CHANGE EVENT RECEIVED:", event.detail);
    handleFriendScheduleChange(event);
  });

  // Listen for compare mode events - MUST PERSIST!
  addUIControlListener(document, "compare:mode", handleCompareModeChange);
  addUIControlListener(
    document,
    "compare:selection",
    handleCompareSelectionChange
  );
  addUIControlListener(
    document,
    "friendsbar:avatarsRendered",
    handleFriendsBarRendered
  );
  addUIControlListener(
    document,
    "compare:onboarding",
    handleCompareOnboardingRequest
  );

  console.log("✅ Friends bar event listeners set up successfully");
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

  // Update schedule heading for empty state
  updateScheduleHeadingText(null, false);

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

  // Update schedule heading back to default (user schedule)
  updateScheduleHeadingText(null, false);

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

    // Directly use new cached loader then display
    const friendScheduleData = await loadFriendScheduleWithCache(
      friendId,
      friendName
    );
    await displayFriendSchedule(friendScheduleData, friendName, friendId);
  }

  // Update UI to reflect the change
  updateUI();

  console.log(
    `✅ Schedule change completed - now viewing: ${
      isEmptySchedule ? "Empty Schedule" : isUserSchedule ? "User" : friendName
    }`
  );
}

// Legacy loadFriendSchedule removed; callers updated to use loadFriendScheduleWithCache + displayFriendSchedule

/**
 * Display a friend's schedule in the schedule grid
 */
/**
 * Load friend's schedule with enhanced caching and real-time sync
 * @param {string} friendId - Friend's user ID
 * @param {string} friendName - Friend's display name
 * @returns {Object|null} - Schedule data or null
 */
async function loadFriendScheduleWithCache(friendId, friendName) {
  // Try enhanced cache first
  const cachedData = FRIENDS_SCHEDULE_CACHE.getCachedSchedule(friendId, true);
  if (cachedData) {
    console.log(`🚀 [CACHE HIT] Using cached schedule for ${friendName}`);
    return cachedData;
  }

  // Load fresh data
  console.log(`📥 [FRESH LOAD] Loading schedule for ${friendName}...`);
  try {
    const scheduleData = await dataManager.getUserSchedule(friendId);
    if (scheduleData) {
      // Cache the fresh data
      FRIENDS_SCHEDULE_CACHE.setCachedSchedule(friendId, scheduleData);

      // Set up real-time sync
      FRIENDS_REALTIME_SYNC.setupRealtimeListener(friendId, friendName);

      return scheduleData;
    }
  } catch (error) {
    console.error(
      `❌ [LOAD ERROR] Failed to load ${friendName}'s schedule:`,
      error
    );
  }

  return null;
}

async function displayFriendSchedule(scheduleData, friendName, friendId) {
  console.log(`🔧 DEBUG: displayFriendSchedule called with:`, {
    friendName,
    friendId,
    hasSchedule: !!scheduleData?.schedule,
    hasSlotInfo: !!scheduleData?.slotInfo,
    hasTimeSlots: !!scheduleData?.timeSlots,
  });

  // If no scheduleData provided, try to load with enhanced caching
  if (!scheduleData) {
    console.log(
      `📥 No schedule data provided, loading with cache for ${friendName}`
    );
    scheduleData = await loadFriendScheduleWithCache(friendId, friendName);
    if (!scheduleData) {
      showFriendScheduleNotice(friendName, "no-schedule");
      return;
    }
  }

  try {
    // Convert Firestore format to HomePage format
    const convertedScheduleData =
      convertFirestoreToHomePageFormat(scheduleData);

    if (!convertedScheduleData) {
      console.warn(
        `⚠️ DEBUG: Failed to convert schedule data for ${friendName}`
      );
      showFriendScheduleNotice(friendName, "no-schedule");
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
      showFriendScheduleNotice(friendName, "error");
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

    // Normalize friend matrices to ensure integrity
    normalizeUserScheduleMatrices(friendUser);

    console.log(`🔧 DEBUG: Created friend user object:`, friendUser);

    // Validate friend user object
    if (
      !friendUser.schedule.length ||
      !friendUser.slotInfo.length ||
      !friendUser.timeSlots.length
    ) {
      console.error(`❌ DEBUG: Invalid friend user object for ${friendName}`);
      showFriendScheduleNotice(friendName, "no-schedule");
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

  // Update schedule heading to show friend's handle
  updateScheduleHeadingText(friendName, true);

    console.log(`🎨 Displaying ${friendName}'s schedule in UI`);

    // Force UI update to render the friend's schedule
    updateUI();
  } catch (error) {
    console.error(
      `❌ DEBUG: Error displaying friend schedule for ${friendName}:`,
      error
    );
    showFriendScheduleNotice(friendName, "error");
  }
}

/**
 * Updates the schedule owner indicator to show whose schedule is currently displayed
 * @param {string} friendName - Name of the friend whose schedule is being viewed
 * @param {boolean} isFriendSchedule - Whether viewing a friend's schedule (true) or user's own (false)
 */
function formatHandleForDisplay(name) {
  if (!name || typeof name !== "string") return "";
  const trimmed = name.trim();
  if (trimmed.startsWith("@") && trimmed.length > 1) {
    return "@" + trimmed.charAt(1).toUpperCase() + trimmed.slice(2);
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function updateScheduleHeadingText(friendName, isFriendSchedule) {
  const headingSpan = document.getElementById("schedule-heading-text");
  if (!headingSpan) return;

  if (isFriendSchedule && friendName) {
  // Build: <owner>'s <tail>Schedule</tail>
  headingSpan.innerHTML = "";
  const owner = document.createElement("span");
  owner.className = "schedule-title-owner";
  const displayName = formatHandleForDisplay(friendName);
  owner.textContent = `${displayName}'s`;
  const space = document.createTextNode(" ");
  const tail = document.createElement("span");
  tail.className = "schedule-title-tail"; // this part should ellipsize
  tail.textContent = "schedule";
  owner.title = `${displayName}'s schedule`;
  headingSpan.appendChild(owner);
  headingSpan.appendChild(space);
  headingSpan.appendChild(tail);
  // Set accessible label so SRs read full phrase regardless of truncation
  try {
    headingSpan.setAttribute("aria-label", `${displayName}'s schedule`);
  } catch (_) {}
  } else {
    headingSpan.textContent = "Schedule";
    try {
      headingSpan.setAttribute("aria-label", "Schedule");
    } catch (_) {}
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
        : [];

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
    const fallbackTimeSlots = [];
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
function showFriendScheduleNotice(friendName, type, detail) {
  updateScheduleHeadingText(null, false);
  state.activeUserId = null;
  state.currentViewingFriendId = null;
  const base = friendName || "Friend";
  let msg;
  switch (type) {
    case "permission":
      msg = `Permission denied for ${base}`;
      break;
    case "network":
      msg = `Network error loading ${base}`;
      break;
    case "invalid":
      msg = `Invalid schedule data for ${base}`;
      break;
    case "error":
      msg = `Failed to load ${base}'s schedule`;
      break;
    case "no-schedule":
    default:
      msg = `${base} has no schedule set`;
  }
  if (detail) msg += ` (${detail})`;
  console.log(msg);
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

    console.log(
      "[Mode] Compare Mode ENABLED via HorizontalFriendsBar - Starting with CLEAN STATE",
      {
        selectedUserIds: Array.from(state.selectedUserIds),
        selectedCount: state.selectedUserIds.size,
        activeUserId: state.activeUserId,
        clearedSelectedUsers: true,
        clearedActiveUser: true,
        disabledPinMode: true,
      }
    );
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
    // Use setTimeout to make this async and prevent race conditions
    setTimeout(() => renderDayView(), 0); // Re-render day view with compare mode changes
  } else {
    // Use setTimeout to make this async and prevent race conditions
    setTimeout(() => renderScheduleGrid(), 0); // Re-render grid view
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
    users: selectedUsersData?.map((u) => u.handle || "unknown") || [],
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
  const previousSelectedIds = Array.from(state.selectedUserIds);
  state.selectedUserIds.clear();

  // Handle current user inclusion properly
  const currentUserId = authManager.getCurrentUser()?.uid;

  selectedFriends.forEach((friendId) => {
    if (friendId === "user" && currentUserId) {
      // Convert "user" placeholder to actual current user ID
      state.selectedUserIds.add(currentUserId);
      console.log(
        `➕ Added current user (${currentUserId}) to selectedUserIds`
      );
    } else if (friendId !== "user") {
      // Add friend IDs normally
      state.selectedUserIds.add(friendId);
      console.log(`➕ Added ${friendId} to selectedUserIds`);
    }
  });

  // 🎯 FIXED: Remove automatic user selection when all friends are deselected
  // Let compare mode show empty state instead of auto-selecting user
  console.log(
    `🔍 Final selection: ${Array.from(state.selectedUserIds)} (count: ${
      state.selectedUserIds.size
    })`
  );
  if (state.selectedUserIds.size === 0) {
    console.log(
      "📋 All users deselected - showing empty compare state (no auto-selection)"
    );
  }

  console.log(`🔄 selectedUserIds updated:`, {
    previous: previousSelectedCount,
    current: state.selectedUserIds.size,
    ids: Array.from(state.selectedUserIds),
  });

  // Clean up resources for deselected friends
  const currentSelectedIds = Array.from(state.selectedUserIds);
  cleanupDeselectedFriends(previousSelectedIds, currentSelectedIds);

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
 * Clean up unused friend resources when they're deselected
 * @param {Array} previousSelectedIds - Previously selected friend IDs
 * @param {Array} currentSelectedIds - Currently selected friend IDs
 */
function cleanupDeselectedFriends(previousSelectedIds, currentSelectedIds) {
  const deselected = previousSelectedIds.filter(
    (id) => !currentSelectedIds.includes(id)
  );

  deselected.forEach((friendId) => {
    // 🚫 Never remove the current user's data from state.users during compare cleanup
    const currentUid = authManager.getCurrentUser()?.uid;
    if (friendId && currentUid && friendId === currentUid) {
      console.log(
        "🛡️ [CLEANUP] Skipping removal of current user's state entry during compare deselection"
      );
      return;
    }

    // Remove from state.users if not actively viewing
    if (state.users[friendId] && state.currentViewingFriendId !== friendId) {
      delete state.users[friendId];
      console.log(`🧹 [CLEANUP] Removed ${friendId} from state.users`);
    }

    // Keep real-time listener active for a bit (cache might still be useful)
    // FRIENDS_REALTIME_SYNC.removeRealtimeListener will be handled by periodic cleanup
  });
}

/**
 * Load schedules for selected friends in comparison mode
 */
async function loadSelectedFriendsForComparison(selectedUsersData) {
  try {
    console.log(
      "🔄 Loading schedules for comparison:",
      selectedUsersData.map((u) => u.handle || "unknown")
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
              name: currentUser.profile?.handle || "You",
              timeSlots: convertedData?.timeSlots || [],
              schedule:
                convertedData?.schedule ||
                createWeeklyMatrix(
                  convertedData?.timeSlots?.length || 0,
                  false
                ),
              slotInfo:
                convertedData?.slotInfo ||
                createSlotInfoMatrix(convertedData?.timeSlots?.length || 0),
              pinnedSlots:
                convertedData?.pinnedSlots ||
                createWeeklyMatrix(
                  convertedData?.timeSlots?.length || 0,
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
          console.log(
            "✅ Current user data available for comparison under UID:",
            currentUserData.id
          );
        } else {
          console.error("❌ Could not create current user data for comparison");
        }
        return;
      }

      // Check enhanced cache first (with expiration)
      const cachedScheduleData = FRIENDS_SCHEDULE_CACHE.getCachedSchedule(
        friendId,
        true
      );
      if (cachedScheduleData) {
        console.log(
          `✅ [ENHANCED CACHE] Schedule already cached for @${userData.handle}`
        );

        // Even if cached, ensure the friend is in state.users for comparison rendering
        if (!state.users[friendId]) {
          console.log(
            `🔄 Adding cached friend @${userData.handle} to state.users for comparison`
          );

          // Convert cached Firestore data to HomePage format if needed
          let convertedData = cachedScheduleData;
          if (
            cachedScheduleData &&
            typeof cachedScheduleData.schedule === "object" &&
            !Array.isArray(cachedScheduleData.schedule)
          ) {
            console.log(
              `🔄 Converting cached Firestore data for @${userData.handle}`
            );
            convertedData =
              convertFirestoreToHomePageFormat(cachedScheduleData);
          }

          const friendSlots = Array.isArray(convertedData.timeSlots)
            ? convertedData.timeSlots
            : [];
          const friendLen = friendSlots.length;
          const friendUser = {
            id: friendId,
            name: userData.handle,
            timeSlots: friendSlots,
            schedule:
              convertedData.schedule || createWeeklyMatrix(friendLen, false),
            slotInfo:
              convertedData.slotInfo ||
              createWeeklyMatrix(friendLen, () => ({
                courseCode: "",
                classroomNumber: "",
              })),
            pinnedSlots:
              convertedData.pinnedSlots || createWeeklyMatrix(friendLen, false),
          };

          state.users[friendId] = friendUser;
          console.log(
            `✅ [ENHANCED CACHE] Cached friend @${userData.handle} added to state.users`,
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
        return;
      }

      // No cached data found, load fresh schedule
      console.log(
        `📥 [FRESH LOAD] Loading schedule for @${userData.handle}...`
      );
      // Load schedule data for friends
      const scheduleData = await dataManager.getUserSchedule(friendId);
      if (scheduleData) {
        // Use enhanced caching system
        FRIENDS_SCHEDULE_CACHE.setCachedSchedule(friendId, scheduleData);

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
            `⚠️ Failed to convert schedule data for @${userData.handle} in comparison`
          );
          return;
        }

        // Add to users state for rendering with converted data
        const friendUser = {
          id: friendId,
          name: userData.handle,
          timeSlots: convertedScheduleData.timeSlots,
          schedule: convertedScheduleData.schedule,
          slotInfo: convertedScheduleData.slotInfo,
          pinnedSlots:
            convertedScheduleData.pinnedSlots ||
            createWeeklyMatrix(convertedScheduleData.timeSlots.length, false),
        };

        state.users[friendId] = friendUser;
        console.log(`✅ [FRESH DATA] Schedule loaded for @${userData.handle}`, {
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

        // Set up real-time sync for this friend's schedule updates
        FRIENDS_REALTIME_SYNC.setupRealtimeListener(friendId, userData.handle);
      } else {
        console.warn(`⚠️ No schedule data found for @${userData.handle}`);
      }
    }); // End of map callback function

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
document.addEventListener("spa:page:load", async (event) => {
  const { route } = event.detail;
  console.log(`[script.js] Received spa:page:load event for route: ${route}`);

  if (route === "home") {
    // Only initialize the schedule app when the home page is loaded.
    console.log("🚀 Starting MeetchuThere Schedule App (via SPA event)...");

    // 🔄 CRITICAL FIX: Reset initialization flags when DOM gets replaced
    // This fixes the issue where event listeners stop working after signin
    console.log(
      "🔄 Resetting initialization flags for DOM replacement handling..."
    );
    state.eventListenersSetup = false;
    state.mobileScheduleInitialized = false;
    console.log(
      "✅ Initialization flags reset - allowing fresh setup after template reload"
    );

    // Essential: Always load state first so user data is available
    console.log("💾 Loading state from storage...");
    loadState();

    console.log("🔍 Current state after loading:", {
      activeUserId: state.activeUserId,
      userCount: Object.keys(state.users).length,
      users: Object.keys(state.users),
    });

    // Enforce UX rule: compare mode must be OFF on fresh home load
    // Clear any lingering selections from a previous visit
    if (state.compareMode || state.selectedUserIds.size > 0) {
      console.log(
        "🧼 Resetting compare state on home load (compareMode OFF, selections cleared)"
      );
      state.compareMode = false;
      state.selectedUserIds.clear();
      // Clear caches tied to compare state to avoid stale overlays
      try {
        memoCache.clear();
        matrixCache.clear();
        console.log(
          "🧹 Cleared memoization and matrix caches due to compare state reset"
        );
      } catch (_) {}
    }

    // Initialize DOM elements for the home page (first pass)
    console.log("📋 Initializing DOM elements...");
    initializeDomElements();

    // Initialize schedule controls mobile toggle (idempotent)
    try {
      initScheduleControlsToggle();
      console.log("✅ Schedule controls toggle initialized");
    } catch (e) {
      console.warn("⚠️ Failed to init schedule controls toggle (non-fatal)", e);
    }

    document.addEventListener(
      "scheduleControls:opened",
      handleScheduleControlsOpened
    );

    // Auto-disable pin mode when dropdown closes
    document.addEventListener(
      "scheduleControls:closed",
      () => {
        if (controlsHintsActive) {
          devLog("[Onboarding] scheduleControls:closed while hints active, re-opening");
          scheduleOnboardingTimeout(() => ensureScheduleControlsOpen(), 120);
        }
        if (state.pinModeActive) {
          state.pinModeActive = false;
          updateUI();
          console.log("📌 Pin mode auto-disabled on dropdown close");
        }
      },
      { once: false }
    );

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

    // Initialize mobile schedule functionality
    console.log("📱 Initializing mobile schedule...");
    initializeMobileSchedule();

    // Set up UI interactions
    console.log("🔧 Setting up validation and listeners...");
    setupInputValidation();
    setupEventListeners();

    // 🔧 CRITICAL FIX: Initialize ViewModeManager after template reload
    // This ensures view mode buttons work after signin
    console.log("🎛️ Initializing ViewModeManager after template reload...");
    try {
      if (
        window.viewModeManager &&
        typeof window.viewModeManager.reinitializeAfterPageLoad === "function"
      ) {
        await window.viewModeManager.reinitializeAfterPageLoad();
        console.log("✅ ViewModeManager reinitialized successfully");
      } else {
        console.warn("⚠️ ViewModeManager not available for reinitialization");
      }
    } catch (error) {
      console.error("❌ Error reinitializing ViewModeManager:", error);
    }

    // Initialize Phase-3: Horizontal Friends Bar (only when logged in)
    if (currentUser?.uid) {
      console.log("⭐ Initializing Horizontal Friends Bar...");
      initializeHorizontalFriendsBar();
    } else {
      console.log("⭐ Skipping Horizontal Friends Bar (user not logged in)");
    }

    // Initialize schedule scroll indicator
    console.log("📍 Initializing schedule scroll indicator...");
    initializeScheduleScrollIndicator();

    // Clean up old cache entries and start maintenance
    console.log("🧹 Cleaning up expired friend schedule cache...");
    FRIENDS_SCHEDULE_CACHE.cleanup();
    CACHE_MAINTENANCE.start();

    // Wait for critical DOM elements to be available before updating UI
    console.log("⏳ Waiting for critical DOM elements to be ready...");
    const isDOMReady = await waitForDOMReady(10, 50);

    if (!isDOMReady) {
      console.warn(
        "⚠️ DOM elements may not be fully ready, but proceeding with initialization"
      );
    }

    // Render UI with loaded data - now safely with DOM readiness checks
    console.log("🎨 Updating UI with loaded data...");
    await updateUI();

    devLog("[Onboarding] Scheduling initial toggle hint");
    scheduleOnboardingTimeout(showScheduleToggleHint, 450);
    devLog("[Onboarding] Scheduling initial tap hint placeholder");
    maybeScheduleTapHint(1400);

    // 🎯 REMOVED: Preselection now handled by HorizontalFriendsBar.forceUserSelection()
    // The HorizontalFriendsBar will auto-select user after it's fully rendered

    // Set up authentication callbacks (only once)
    setupAuthenticationCallbacks();

    console.log("✅ MeetchuThere Schedule App loaded successfully!");

    // Removed global testDayNavigation helper (was debug only)
  }
});

/**
 * 🧹 Clean up resources when leaving the home page
 */
document.addEventListener("spa:page:unload", (event) => {
  const { route } = event.detail;
  console.log(`[HomePage] Received spa:page:unload for route: ${route}`);

  // Only clean up if we're leaving the home page
  if (route === "home") {
    console.log("🧹 Cleaning up home page resources...");

    // 🧹 CRITICAL FIX: Clean up Firestore real-time listeners first
    if (window.scheduleRealtimeUnsubscribe) {
      console.log("🧹 Cleaning up schedule real-time listener...");
      window.scheduleRealtimeUnsubscribe();
      // realtimeUnsubscribe cleared
    }

    // 🧹 MEMORY LEAK FIX: Clean up all tracked event listeners
    cleanupScheduleEventListeners(); // Clean up schedule content listeners
    cleanupUIControlListeners(); // Clean up UI control listeners

    // 🧹 Reset event listeners setup flag for fresh setup on next load
    state.eventListenersSetup = false;
    state.mobileScheduleInitialized = false;

    // ✅ Event delegation system - no flags to reset
    console.log("🧹 All event listeners cleaned up via tracked system");

    // Clean up HorizontalFriendsBar properly
    if (state.horizontalFriendsBar) {
      console.log("🧹 Destroying HorizontalFriendsBar component...");
      state.horizontalFriendsBar.destroy();
      state.horizontalFriendsBar = null;
    }

    hideAllCoachMarks();
    clearOnboardingTimeouts();
    controlsHintQueue = Promise.resolve();
    controlsHintsStarted = false;
    controlsHintsActive = false;
    document.removeEventListener(
      "scheduleControls:opened",
      handleScheduleControlsOpened
    );

    // UX requirement: when leaving Home, exit compare mode and clear selections
    if (state.compareMode || state.selectedUserIds.size > 0) {
      console.log(
        "🧼 Resetting compare state on home unload (compareMode OFF, selections cleared)"
      );
      state.compareMode = false;
      state.selectedUserIds.clear();
      state.currentViewingFriendId = null;
      try {
        memoCache.clear();
        matrixCache.clear();
      } catch (_) {}
    }

    console.log("🧹 Home page cleanup completed - resources freed");
  }
});

/**
 * 🎯 SIMPLIFIED: Removed navigation listener to eliminate timing race condition
 *
 * User preselection is handled entirely by HorizontalFriendsBar.forceUserSelection():
 * - Initial website load: ✅ forceUserSelection() runs after render
 * - Navigation to home page: ✅ HorizontalFriendsBar re-initializes and runs forceUserSelection()
 *
 * This eliminates the timing errors while maintaining all functionality.
 */

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
    addTrackedEventListener(document, "click", closeTooltip);
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

/* ================================
   SCHEDULE SCROLL INDICATOR
================================== */

/**
 * Initialize the schedule scroll indicator
 */
function initializeScheduleScrollIndicator() {
  try {
    // Create scroll indicator element
    const scheduleSection = document.querySelector(".schedule-section");
    if (!scheduleSection) {
      console.warn("Schedule section not found, skipping scroll indicator");
      return;
    }

    // Remove existing indicator if present
    const existingIndicator = scheduleSection.querySelector(
      ".schedule-scroll-indicator"
    );
    if (existingIndicator) {
      existingIndicator.remove();
    }

    // Create new indicator
    const indicator = document.createElement("div");
    indicator.className = "schedule-scroll-indicator";
    indicator.setAttribute("aria-hidden", "true");
    scheduleSection.appendChild(indicator);

    // Only Day View container
    const dayViewContainer = document.querySelector(
      ".schedule-day-view #dayViewContainer"
    );
    if (!dayViewContainer) {
      console.warn("Day view container not found, indicator disabled");
      return;
    }

    let scrollTimeout;
    const fastHideOnScroll = () => {
      // Hide immediately on scroll start
      indicator.classList.add("hidden");
      clearTimeout(scrollTimeout);
      // After scrolling settles, re-evaluate visibility
      scrollTimeout = setTimeout(() => {
        updateScrollIndicatorVisibility(dayViewContainer, indicator);
      }, 120);
    };

    // Attach listener
    dayViewContainer.addEventListener("scroll", fastHideOnScroll, {
      passive: true,
    });

    // Hook into view mode buttons to refresh indicator only for Day View
    const dayBtn = document.getElementById("dayViewBtn");
    const gridBtn = document.getElementById("gridViewBtn");
    const recheckAfterToggle = () =>
      setTimeout(
        () => updateScrollIndicatorVisibility(dayViewContainer, indicator),
        30
      );
    if (dayBtn) dayBtn.addEventListener("click", recheckAfterToggle);
    if (gridBtn)
      gridBtn.addEventListener("click", () =>
        indicator.classList.add("hidden")
      );

    // Initial visibility check
    updateScrollIndicatorVisibility(dayViewContainer, indicator);

    // Respond to resize
    window.addEventListener("resize", () =>
      updateScrollIndicatorVisibility(dayViewContainer, indicator)
    );

    console.log("✅ Schedule scroll indicator initialized (day view only)");
  } catch (error) {
    console.error("❌ Error initializing schedule scroll indicator:", error);
  }
}

/**
 * Update scroll indicator visibility based on scroll position
 */
function updateScrollIndicatorVisibility(wrapper, indicator) {
  if (!wrapper || !indicator) return;
  // If container not visible (display:none), hide indicator
  if (wrapper.offsetParent === null || wrapper.clientHeight === 0) {
    indicator.classList.add("hidden");
    return;
  }

  const { scrollTop, scrollHeight, clientHeight } = wrapper;
  const maxScrollable = Math.max(1, scrollHeight - clientHeight); // avoid divide-by-zero
  const scrollPercentage = scrollTop / maxScrollable;

  const hasOverflow = scrollHeight > clientHeight + 4; // small threshold
  const isAtBottom =
    scrollTop + clientHeight >= scrollHeight - 2 || scrollPercentage > 0.97;

  if (!hasOverflow || isAtBottom) {
    indicator.classList.add("hidden");
  } else {
    indicator.classList.remove("hidden");
  }
}
