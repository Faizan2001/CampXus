// js/script.js

/* ================================
   DOM REFERENCES (Exported for potential use in tests or other modules)
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

// --- State Accessors/Mutators ---
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
  };
}

/* ================================
   MODAL UI FUNCTIONS (NEW)
================================== */

/**
 * Shows the custom modal with a specific title and message.
 * @param {string} message - The main message to display.
 * @param {string} [title="Notification"] - Optional title for the modal.
 */
export function showAppModal(message, title = "Notification") {
  if (
    DOM_ELEMENTS.appModal &&
    DOM_ELEMENTS.modalTitle &&
    DOM_ELEMENTS.modalMessage
  ) {
    DOM_ELEMENTS.modalTitle.textContent = title;
    DOM_ELEMENTS.modalMessage.textContent = message;
    DOM_ELEMENTS.appModal.style.display = "flex";
    setTimeout(() => {
      DOM_ELEMENTS.appModal.classList.add("active");
    }, 10);
  } else {
    console.error("Modal elements not found. Falling back to alert.");
    alert(`${title}: ${message}`); // Fallback, should not happen if HTML is correct
  }
}

/**
 * Hides the custom modal.
 */
export function hideAppModal() {
  if (DOM_ELEMENTS.appModal) {
    DOM_ELEMENTS.appModal.classList.remove("active");
    setTimeout(() => {
      DOM_ELEMENTS.appModal.style.display = "none";
    }, 300); // Should match CSS transition duration
  }
}

/* ================================
   CORE LOGIC FUNCTIONS (Pure or Purer)
================================== */

export function createUserObject(name, userId, currentUsers) {
  if (!currentUsers[userId]) {
    const schedule = Array(7)
      .fill(null)
      .map(() => Array(6).fill(false));
    return { id: userId, name: name, schedule: schedule };
  }
  return null;
}

export function deleteUserFromState(userId, currentState) {
  const newUsers = { ...currentState.users };
  let newActiveUserId = currentState.activeUserId;
  const newSelectedUserIds = new Set(currentState.selectedUserIds);

  if (!newUsers[userId]) return currentState;

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
  const newSchedule = userSchedule.map((day, dIndex) =>
    dIndex === dayIndex
      ? day.map((slot, tIndex) => (tIndex === timeIndex ? !slot : slot))
      : [...day]
  );
  return newSchedule;
}

export function determineSlotStatus(dayIndex, timeIndex, currentState) {
  const { compareMode, selectedUserIds, users, activeUserId } = currentState;

  if (compareMode && selectedUserIds.size > 0) {
    let busyCount = 0;
    selectedUserIds.forEach((id) => {
      if (users[id]?.schedule?.[dayIndex]?.[timeIndex]) {
        busyCount++;
      }
    });

    if (busyCount === 0) return "slot-free";
    if (busyCount === selectedUserIds.size) return "slot-conflict";
    return "slot-partial";
  } else if (
    activeUserId &&
    users[activeUserId]?.schedule?.[dayIndex]?.[timeIndex]
  ) {
    return "slot-selected";
  }
  return "slot";
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

  if (busyUsers.length === selectedUserIds.size)
    return "All selected users are unavailable.";
  if (freeUsers.length === selectedUserIds.size)
    return "All selected users are free.";

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
    state.users = parsed.users || {};
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

function renderScheduleGrid() {
  if (!DOM_ELEMENTS.scheduleTable) return;
  DOM_ELEMENTS.scheduleTable
    .querySelectorAll(".slot")
    .forEach((slotElement) => {
      const day = parseInt(slotElement.dataset.day, 10);
      const time = parseInt(slotElement.dataset.time, 10);

      if (!isNaN(day) && !isNaN(time)) {
        slotElement.className = "slot";
        const statusClass = determineSlotStatus(day, time, state);
        if (statusClass !== "slot") {
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
  if (DOM_ELEMENTS.compareButton) {
    DOM_ELEMENTS.compareButton.classList.toggle("active", state.compareMode);
  }
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
      showAppModal(`User with ID ${userId} already exists.`, "Duplicate User"); // MODIFIED
    }
    DOM_ELEMENTS.userNameInput.value = "";
    DOM_ELEMENTS.userIdInput.value = "";
  } else {
    showAppModal("Please enter both a name and a unique ID.", "Input Required"); // MODIFIED
  }
}

function handleDeleteUser(userId) {
  const newState = deleteUserFromState(userId, state);
  state = newState;
  saveStateToStorage();
  updateUI();
}

function handleSetActiveUser(userId) {
  if (state.users[userId]) {
    state.activeUserId = userId;
    state.compareMode = false;
    state.selectedUserIds.clear();
    saveStateToStorage();
    updateUI();
  }
}

function handleToggleCompareMode() {
  state.compareMode = !state.compareMode;
  state.activeUserId = null;
  state.selectedUserIds.clear();
  updateUI();
}

function handleToggleUserSelectionForCompare(userId) {
  if (!state.compareMode || !state.users[userId]) return;

  if (state.selectedUserIds.has(userId)) {
    state.selectedUserIds.delete(userId);
  } else {
    state.selectedUserIds.add(userId);
  }
  updateUI();
}

function handleToggleScheduleSlot(dayIndex, timeIndex) {
  if (!state.activeUserId || state.compareMode) return;
  const currentUser = state.users[state.activeUserId];

  if (currentUser?.schedule?.[dayIndex]?.[timeIndex] !== undefined) {
    const newSchedule = toggleSlotInSchedule(
      dayIndex,
      timeIndex,
      currentUser.schedule
    );
    currentUser.schedule = newSchedule;
    saveStateToStorage();
    updateUI();
  }
}

function handleShowSlotTooltip(slotElement, dayIndex, timeIndex) {
  if (
    !DOM_ELEMENTS.slotTooltip ||
    !state.compareMode ||
    state.selectedUserIds.size === 0
  ) {
    handleHideSlotTooltip();
    return;
  }
  const message = generateTooltipMessage(dayIndex, timeIndex, state);
  DOM_ELEMENTS.slotTooltip.textContent = message;

  const rect = slotElement.getBoundingClientRect();
  DOM_ELEMENTS.slotTooltip.style.left = `${
    rect.left + window.scrollX + rect.width / 2
  }px`;
  DOM_ELEMENTS.slotTooltip.style.top = `${
    rect.top + window.scrollY - DOM_ELEMENTS.slotTooltip.offsetHeight - 5
  }px`;
  DOM_ELEMENTS.slotTooltip.style.display = "block";
  DOM_ELEMENTS.slotTooltip.style.transform = "translateX(-50%)";
}

function handleHideSlotTooltip() {
  if (DOM_ELEMENTS.slotTooltip) {
    DOM_ELEMENTS.slotTooltip.style.display = "none";
  }
}

function handleExportCurrentUser() {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    return showAppModal("Please select a user to export.", "Export Error"); // MODIFIED
  }
  const currentUser = state.users[state.activeUserId];
  const exportData = {
    id: currentUser.id,
    name: currentUser.name,
    schedule: currentUser.schedule,
  };
  const json = JSON.stringify(exportData, null, 2);

  navigator.clipboard
    .writeText(json)
    .then(() =>
      showAppModal(
        `${currentUser.name}'s schedule has been copied to your clipboard!`,
        "Export Successful"
      )
    ) // MODIFIED
    .catch((err) => {
      console.error("Clipboard export error:", err);
      showAppModal(
        "Could not copy to clipboard. Please check browser permissions or try again.",
        "Clipboard Error"
      ); // MODIFIED
      if (DOM_ELEMENTS.importTextArea) DOM_ELEMENTS.importTextArea.value = json;
    });
}

function handleImportSchedule() {
  if (!DOM_ELEMENTS.importTextArea) return;
  const jsonInput = DOM_ELEMENTS.importTextArea.value.trim();
  if (!jsonInput) {
    return showAppModal(
      "Please paste the exported schedule JSON into the text area first.",
      "Import Error"
    ); // MODIFIED
  }

  try {
    const importedUser = JSON.parse(jsonInput);
    if (
      !importedUser.id ||
      !importedUser.name ||
      !Array.isArray(importedUser.schedule)
    ) {
      throw new Error(
        "Invalid user data format. Ensure ID, name, and schedule array are present."
      );
    }
    state.users[importedUser.id] = importedUser;
    saveStateToStorage();
    updateUI();
    DOM_ELEMENTS.importTextArea.value = "";
    showAppModal(
      `User ${importedUser.name} imported successfully!`,
      "Import Complete"
    ); // MODIFIED
  } catch (e) {
    console.error("Import error:", e);
    showAppModal(
      `Import failed: ${e.message}\nPlease ensure valid JSON is pasted.`,
      "Import Failed"
    ); // MODIFIED
  }
}

/* ================================
   INPUT VALIDATION
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
  if (DOM_ELEMENTS.addUserButton)
    DOM_ELEMENTS.addUserButton.addEventListener("click", handleAddNewUser);
  if (DOM_ELEMENTS.compareButton)
    DOM_ELEMENTS.compareButton.addEventListener(
      "click",
      handleToggleCompareMode
    );
  if (DOM_ELEMENTS.exportButton)
    DOM_ELEMENTS.exportButton.addEventListener(
      "click",
      handleExportCurrentUser
    );
  if (DOM_ELEMENTS.importButton)
    DOM_ELEMENTS.importButton.addEventListener("click", handleImportSchedule);

  if (DOM_ELEMENTS.userListContainer) {
    DOM_ELEMENTS.userListContainer.addEventListener("click", (event) => {
      const target = event.target;
      const userItemDiv = target.closest(".user-item");

      if (userItemDiv) {
        const userId = userItemDiv.dataset.userId;
        if (target.classList.contains("delete-btn")) {
          event.stopPropagation();
          handleDeleteUser(userId);
        } else if (userId) {
          if (state.compareMode) {
            handleToggleUserSelectionForCompare(userId);
          } else {
            handleSetActiveUser(userId);
          }
        }
      }
    });
  }

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
      if (
        event.target.classList.contains("slot") ||
        event.target === DOM_ELEMENTS.scheduleTable
      ) {
        handleHideSlotTooltip();
      }
    });
  }
}

/* ================================
   INITIALIZATION FUNCTION (Called by DOMContentLoaded)
================================== */
function initializeApp() {
  // Re-fetch DOM elements that might not have been ready if script was in <head>
  // or if DOM_ELEMENTS were not initialized correctly at the top.
  // This is somewhat redundant if script is at end of body but acts as a safeguard.
  DOM_ELEMENTS.userNameInput =
    DOM_ELEMENTS.userNameInput || document.getElementById("userName");
  DOM_ELEMENTS.userIdInput =
    DOM_ELEMENTS.userIdInput || document.getElementById("userId");
  DOM_ELEMENTS.userListContainer =
    DOM_ELEMENTS.userListContainer || document.getElementById("userList");
  DOM_ELEMENTS.compareButton =
    DOM_ELEMENTS.compareButton || document.getElementById("compare");
  DOM_ELEMENTS.scheduleTable =
    DOM_ELEMENTS.scheduleTable || document.getElementById("schedule");
  DOM_ELEMENTS.slotTooltip =
    DOM_ELEMENTS.slotTooltip || document.getElementById("slotTooltip");
  DOM_ELEMENTS.importTextArea =
    DOM_ELEMENTS.importTextArea || document.getElementById("importText");
  DOM_ELEMENTS.addUserButton =
    DOM_ELEMENTS.addUserButton || document.querySelector(".add-user button");
  DOM_ELEMENTS.exportButton =
    DOM_ELEMENTS.exportButton ||
    document.querySelector(".export-import button:nth-of-type(1)");
  DOM_ELEMENTS.importButton =
    DOM_ELEMENTS.importButton ||
    document.querySelector(".export-import button:nth-of-type(2)");
  DOM_ELEMENTS.appModal =
    DOM_ELEMENTS.appModal || document.getElementById("appModal");
  DOM_ELEMENTS.modalTitle =
    DOM_ELEMENTS.modalTitle || document.getElementById("modalTitle");
  DOM_ELEMENTS.modalMessage =
    DOM_ELEMENTS.modalMessage || document.getElementById("modalMessage");
  DOM_ELEMENTS.modalCloseBtn =
    DOM_ELEMENTS.modalCloseBtn || document.getElementById("modalCloseBtn");

  loadStateFromStorage();
  setupInputValidation();
  setupEventListeners();

  // Add event listener for the modal close button
  if (DOM_ELEMENTS.modalCloseBtn) {
    DOM_ELEMENTS.modalCloseBtn.addEventListener("click", hideAppModal);
  }
  // Optional: Close modal if overlay is clicked
  if (DOM_ELEMENTS.appModal) {
    DOM_ELEMENTS.appModal.addEventListener("click", (event) => {
      if (event.target === DOM_ELEMENTS.appModal) {
        hideAppModal();
      }
    });
  }
  // Optional: Close modal with Escape key
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      DOM_ELEMENTS.appModal &&
      DOM_ELEMENTS.appModal.classList.contains("active")
    ) {
      hideAppModal();
    }
  });

  updateUI();
}

// Initialize the application once the DOM is fully loaded
document.addEventListener("DOMContentLoaded", initializeApp);
