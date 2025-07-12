// js/domElements.js

export const DOM_ELEMENTS = {
  // User Management
  userNameInput: null,
  userIdInput: null,
  userListContainer: null,
  usersSection: null,
  addUserButton: null,
  loginButton: null,

  // Schedule & Comparison
  scheduleTable: null,
  scheduleWrapper: null,
  compareButton: null,
  togglePinModeBtn: null,
  slotTooltip: null,

  // Import / Export
  importTextArea: null,
  exportButton: null,
  importButton: null,

  // Modal Elements
  appModal: null,
  modalContent: null, // Reference to the modal content div
  // Modal content elements
  modalTitle: null,
  modalMessage: null,
  modalCloseBtn: null,
  modalActionButtons: null,
  modalConfirmBtn: null,
  modalCancelBtn: null,

  // Dynamic Time Slots
  addNewTimeSlotBtn: null,
  addTimeSlotHeaderCell: null, // Reference to the th cell containing the "+" button
};

/**
 * Initializes or re-fetches DOM elements.
 * Should be called after DOMContentLoaded.
 */
export function initializeDomElements() {
  // User Management - Now these exist in the modal
  DOM_ELEMENTS.userNameInput = document.getElementById("userName");
  DOM_ELEMENTS.userIdInput = document.getElementById("userId");
  DOM_ELEMENTS.userListContainer = document.getElementById("userList");
  DOM_ELEMENTS.usersSection = document.querySelector(".users-section");
  DOM_ELEMENTS.addUserButton = document.getElementById("addUserHeaderBtn");
  DOM_ELEMENTS.loginButton = document.getElementById("login-btn");

  // Schedule & Comparison
  DOM_ELEMENTS.scheduleTable = document.getElementById("scheduleTable");
  DOM_ELEMENTS.scheduleWrapper = document.querySelector(".schedule-wrapper");
  DOM_ELEMENTS.compareButton = document.getElementById("compare");
  DOM_ELEMENTS.togglePinModeBtn = document.getElementById("togglePinModeBtn");
  DOM_ELEMENTS.slotTooltip = document.getElementById("slotTooltip") || null; // May not exist

  // Import / Export
  DOM_ELEMENTS.importTextArea = document.getElementById("importText");
  DOM_ELEMENTS.exportButton = document.querySelector(".export-section button");
  DOM_ELEMENTS.importButton = document.querySelector(".import-section button");

  // Modal Elements - These may not exist if modal not implemented yet
  DOM_ELEMENTS.appModal = document.getElementById("appModal") || null;
  DOM_ELEMENTS.modalContent = DOM_ELEMENTS.appModal
    ? DOM_ELEMENTS.appModal.querySelector(".modal-content")
    : null;
  DOM_ELEMENTS.modalTitle = document.getElementById("modalTitle") || null;
  DOM_ELEMENTS.modalMessage = document.getElementById("modalMessage") || null;
  DOM_ELEMENTS.modalCloseBtn = document.getElementById("modalCloseBtn") || null;
  // Fix: The modal buttons are wrapped in a div with class "modal-action-buttons"
  DOM_ELEMENTS.modalActionButtons =
    document.querySelector(".modal-action-buttons") || null;
  DOM_ELEMENTS.modalConfirmBtn =
    document.getElementById("modalConfirmBtn") || null;
  DOM_ELEMENTS.modalCancelBtn =
    document.getElementById("modalCancelBtn") || null;

  // Dynamic Time Slots
  DOM_ELEMENTS.addNewTimeSlotBtn = document.getElementById("addNewTimeSlotBtn");
  DOM_ELEMENTS.addTimeSlotHeaderCell = document.getElementById(
    "addTimeSlotHeaderCell"
  );

  // Debug log for important missing elements
  const criticalElements = [
    "scheduleTable",
    "userListContainer",
    "compareButton",
  ];
  const missingCritical = criticalElements.filter((key) => !DOM_ELEMENTS[key]);

  if (missingCritical.length > 0) {
    console.error("Critical DOM elements missing:", missingCritical);
  }

  // Log optional missing elements as warnings
  const optionalElements = [
    "userNameInput",
    "userIdInput",
    "slotTooltip",
    "appModal",
  ];
  const missingOptional = optionalElements.filter((key) => !DOM_ELEMENTS[key]);

  if (missingOptional.length > 0) {
    console.warn(
      "Optional DOM elements missing (this may be normal):",
      missingOptional
    );
  }
}
