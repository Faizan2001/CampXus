// js/domElements.js

export const DOM_ELEMENTS = {
  // User Management
  userNameInput: null,
  userIdInput: null,
  userListContainer: null,
  addUserButton: null,
  
  // Schedule & Comparison
  scheduleTable: null,
  compareButton: null,
  slotTooltip: null,
  
  // Import / Export
  importTextArea: null,
  exportButton: null,
  importButton: null,
  
  // Modal Elements
  appModal: null,
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
  DOM_ELEMENTS.userNameInput = document.getElementById("userName");
  DOM_ELEMENTS.userIdInput = document.getElementById("userId");
  DOM_ELEMENTS.userListContainer = document.getElementById("userList");
  DOM_ELEMENTS.scheduleTable = document.getElementById("schedule"); 
  DOM_ELEMENTS.compareButton = document.getElementById("compare");
  DOM_ELEMENTS.slotTooltip = document.getElementById("slotTooltip");
  
  DOM_ELEMENTS.addUserButton = document.querySelector(".add-user button");
  
  DOM_ELEMENTS.importTextArea = document.getElementById("importText");
  DOM_ELEMENTS.exportButton = document.querySelector(".export-import button:nth-of-type(1)");
  DOM_ELEMENTS.importButton = document.querySelector(".export-import button:nth-of-type(2)");
  
  DOM_ELEMENTS.appModal = document.getElementById("appModal");
  DOM_ELEMENTS.modalTitle = document.getElementById("modalTitle");
  DOM_ELEMENTS.modalMessage = document.getElementById("modalMessage");
  DOM_ELEMENTS.modalCloseBtn = document.getElementById("modalCloseBtn");
  DOM_ELEMENTS.modalActionButtons = document.getElementById("modalActionButtons");
  DOM_ELEMENTS.modalConfirmBtn = document.getElementById("modalConfirmBtn");
  DOM_ELEMENTS.modalCancelBtn = document.getElementById("modalCancelBtn");

  DOM_ELEMENTS.addNewTimeSlotBtn = document.getElementById("addNewTimeSlotBtn");
  DOM_ELEMENTS.addTimeSlotHeaderCell = document.getElementById("addTimeSlotHeaderCell");

  // Log missing critical elements
  for (const key in DOM_ELEMENTS) {
    if (DOM_ELEMENTS[key] === null) {
       console.warn(`DOM_ELEMENTS.${key} was not found during initialization.`);
      // Allow some to be optional or page-specific by not erroring out here.
      // Critical ones for modal: appModal, modalTitle, modalMessage, modalCloseBtn, modalActionButtons, modalConfirmBtn, modalCancelBtn
    }
  }
}