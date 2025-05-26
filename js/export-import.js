// js/export-import.js
// Import/Export functionality with cross-browser compatibility

import { DOM_ELEMENTS } from "./domElements.js";
import { showModal } from "./modal.js";

/**
 * Multi-method export system with fallbacks for cross-browser compatibility
 * Method 1: Modern Clipboard API (HTTPS/newer browsers)
 * Method 2: Legacy execCommand (HTTP/older browsers)
 * Method 3: Manual textarea fallback (universal compatibility)
 */

/**
 * Primary export function with modern clipboard API
 * @param {string} jsonData - The JSON string to export
 * @param {string} userName - Name of the user being exported
 * @returns {Promise<boolean>} - Success status
 */
async function exportWithClipboard(jsonData, userName) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error("Clipboard API not available");
    }

    await navigator.clipboard.writeText(jsonData);
    showModal({
      content: `${userName}'s schedule copied to clipboard!`,
      title: "Export Successful",
    });
    return true;
  } catch (err) {
    console.warn("Modern clipboard export failed:", err);
    return false;
  }
}

/**
 * Fallback export using legacy execCommand
 * @param {string} jsonData - The JSON string to export
 * @param {string} userName - Name of the user being exported
 * @returns {boolean} - Success status
 */
function fallbackToLegacyClipboard(jsonData, userName) {
  try {
    // Create a temporary textarea element
    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = jsonData;
    tempTextArea.style.position = "fixed";
    tempTextArea.style.left = "-9999px";
    tempTextArea.style.top = "-9999px";
    tempTextArea.style.opacity = "0";

    document.body.appendChild(tempTextArea);
    tempTextArea.focus();
    tempTextArea.select();

    // Try to copy using the legacy execCommand
    const successful = document.execCommand("copy");
    document.body.removeChild(tempTextArea);

    if (successful) {
      showModal({
        content: `${userName}'s schedule copied to clipboard!`,
        title: "Export Successful",
      });
      return true;
    } else {
      throw new Error("execCommand copy failed");
    }
  } catch (err) {
    console.warn("Legacy clipboard export failed:", err);
    return false;
  }
}

/**
 * Final fallback - display in textarea for manual copy
 * @param {string} jsonData - The JSON string to export
 * @param {string} userName - Name of the user being exported
 */
function fallbackToTextAreaDisplay(jsonData, userName) {
  if (DOM_ELEMENTS.importTextArea) {
    DOM_ELEMENTS.importTextArea.value = jsonData;
    DOM_ELEMENTS.importTextArea.select();
    DOM_ELEMENTS.importTextArea.focus();
  }

  showModal({
    content: `Clipboard not available. ${userName}'s schedule has been placed in the text area below. Please manually copy it (Ctrl+C or Cmd+C).`,
    title: "Manual Copy Required",
  });
}

/**
 * Cross-browser export with multiple fallback methods
 * @param {Object} state - Application state
 * @returns {Promise<void>}
 */
export async function handleExportCurrentUser(state) {
  if (!state.activeUserId || !state.users[state.activeUserId]) {
    return showModal({
      content: "Select an active user to export.",
      title: "Export Error",
    });
  }

  const currentUser = state.users[state.activeUserId];
  const exportData = {
    id: currentUser.id,
    name: currentUser.name,
    timeSlots: currentUser.timeSlots,
    schedule: currentUser.schedule,
    pinnedSlots: currentUser.pinnedSlots || [],
  };

  const jsonToExport = JSON.stringify(exportData, null, 2);

  // Try Method 1: Modern Clipboard API
  const clipboardSuccess = await exportWithClipboard(
    jsonToExport,
    currentUser.name
  );
  if (clipboardSuccess) return;

  // Try Method 2: Legacy execCommand
  const legacySuccess = fallbackToLegacyClipboard(
    jsonToExport,
    currentUser.name
  );
  if (legacySuccess) return;

  // Method 3: Manual textarea fallback
  fallbackToTextAreaDisplay(jsonToExport, currentUser.name);
}

/**
 * Import schedule from JSON with validation
 * @param {Object} state - Application state
 * @param {Function} saveStateToStorage - Function to save state
 * @param {Function} updateUI - Function to update UI
 * @returns {void}
 */
export function handleImportSchedule(state, saveStateToStorage, updateUI) {
  if (!DOM_ELEMENTS.importTextArea) return;

  const jsonInput = DOM_ELEMENTS.importTextArea.value.trim();
  if (!jsonInput) {
    return showModal({
      content: "Paste JSON to import.",
      title: "Import Error",
    });
  }

  try {
    const importedData = JSON.parse(jsonInput);

    // Validate imported structure
    if (
      !importedData.id ||
      !importedData.name ||
      !Array.isArray(importedData.schedule) ||
      !Array.isArray(importedData.timeSlots)
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

    // Ensure pinnedSlots has the correct 2D structure
    let pinnedSlots = importedData.pinnedSlots;
    if (
      !pinnedSlots ||
      !Array.isArray(pinnedSlots) ||
      pinnedSlots.length !== 7
    ) {
      // Initialize proper 2D pinnedSlots structure if missing or invalid
      pinnedSlots = Array(7)
        .fill(null)
        .map(() => Array(importedData.timeSlots.length).fill(false));
    } else {
      // Validate and fix each day's pinnedSlots array
      pinnedSlots = pinnedSlots.map((dayPinnedSlots, dayIndex) => {
        if (
          !Array.isArray(dayPinnedSlots) ||
          dayPinnedSlots.length !== importedData.timeSlots.length
        ) {
          return Array(importedData.timeSlots.length).fill(false);
        }
        return dayPinnedSlots;
      });
    }

    // Add user to state
    state.users[importedData.id] = {
      id: importedData.id,
      name: importedData.name,
      timeSlots: importedData.timeSlots,
      schedule: importedData.schedule,
      pinnedSlots: pinnedSlots,
    };

    // Save and update
    saveStateToStorage();
    updateUI();
    DOM_ELEMENTS.importTextArea.value = "";

    showModal({
      content: `User "${importedData.name}" imported successfully!`,
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

/**
 * Setup event listeners for export/import functionality
 * @param {Object} state - Application state
 * @param {Function} saveStateToStorage - Function to save state
 * @param {Function} updateUI - Function to update UI
 */
export function setupExportImportListeners(
  state,
  saveStateToStorage,
  updateUI
) {
  console.log("Setting up export/import listeners:", {
    exportButton: !!DOM_ELEMENTS.exportButton,
    importButton: !!DOM_ELEMENTS.importButton,
    importTextArea: !!DOM_ELEMENTS.importTextArea,
  });

  if (DOM_ELEMENTS.exportButton) {
    DOM_ELEMENTS.exportButton.addEventListener("click", () =>
      handleExportCurrentUser(state)
    );
  }

  if (DOM_ELEMENTS.importButton) {
    DOM_ELEMENTS.importButton.addEventListener("click", () => {
      handleImportSchedule(state, saveStateToStorage, updateUI);
    });
  }
}
