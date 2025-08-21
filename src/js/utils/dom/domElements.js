// js/domElements.js

export const DOM_ELEMENTS = {
  // Schedule & Comparison
  scheduleTable: null,
  scheduleWrapper: null,
  compareButton: null,
  togglePinModeBtn: null,
  slotTooltip: null,


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

  // Mobile Schedule Redesign Elements
  dayViewBtn: null,
  gridViewBtn: null,
  daySelectorContainer: null,
  daySelector: null,
  scheduleDayView: null,
  scheduleGridView: null,
  dayViewContainer: null,
  // Day buttons (0-6 for Sunday-Saturday)
  dayBtn0: null,
  dayBtn1: null,
  dayBtn2: null,
  dayBtn3: null,
  dayBtn4: null,
  dayBtn5: null,
  dayBtn6: null,
};

/**
 * Initializes or re-fetches DOM elements.
 * Should be called after DOMContentLoaded.
 */
export function initializeDomElements() {
  // Schedule & Comparison
  DOM_ELEMENTS.scheduleTable = document.getElementById("scheduleTable");
  DOM_ELEMENTS.scheduleWrapper = document.querySelector(".schedule-wrapper");
  DOM_ELEMENTS.compareButton = document.getElementById("compare");
  DOM_ELEMENTS.togglePinModeBtn = document.getElementById("togglePinModeBtn");
  DOM_ELEMENTS.slotTooltip = document.getElementById("slotTooltip") || null; // May not exist


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

  // Mobile Schedule Redesign Elements
  DOM_ELEMENTS.dayViewBtn = document.getElementById("dayViewBtn");
  DOM_ELEMENTS.gridViewBtn = document.getElementById("gridViewBtn");
  DOM_ELEMENTS.daySelectorContainer = document.getElementById(
    "daySelectorContainer"
  );
  DOM_ELEMENTS.daySelector = document.getElementById("daySelector");
  DOM_ELEMENTS.scheduleDayView = document.getElementById("scheduleDayView");
  DOM_ELEMENTS.scheduleGridView = document.getElementById("scheduleGridView");
  DOM_ELEMENTS.dayViewContainer = document.getElementById("dayViewContainer");

  // Day buttons (0-6 for Sunday-Saturday)
  DOM_ELEMENTS.dayBtn0 = document.getElementById("dayBtn0");
  DOM_ELEMENTS.dayBtn1 = document.getElementById("dayBtn1");
  DOM_ELEMENTS.dayBtn2 = document.getElementById("dayBtn2");
  DOM_ELEMENTS.dayBtn3 = document.getElementById("dayBtn3");
  DOM_ELEMENTS.dayBtn4 = document.getElementById("dayBtn4");
  DOM_ELEMENTS.dayBtn5 = document.getElementById("dayBtn5");
  DOM_ELEMENTS.dayBtn6 = document.getElementById("dayBtn6");

  // Debug log for important missing elements - but only after page templates are loaded
  // NOTE: Critical elements like scheduleTable, compareButton
  // are only available after the SPA router loads the home template.
  // This function is called during app initialization before templates are loaded,
  // so we skip the critical check here to avoid phantom errors.

  // Log optional missing elements as warnings
  const optionalElements = [
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

/**
 * Validates critical DOM elements for a specific route after page templates are loaded.
 * Should be called after SPA router loads page templates.
 * @param {string} route - The current route (e.g., 'home', 'friends')
 */
export function validateCriticalElementsForRoute(route) {
  if (route === "home") {
    const criticalElements = [
      "scheduleTable",
      "compareButton",
      "dayViewBtn",
      "gridViewBtn",
      "scheduleDayView",
      "scheduleGridView",
    ];

    const missingCritical = criticalElements.filter(
      (key) => !DOM_ELEMENTS[key]
    );

    if (missingCritical.length > 0) {
      console.error(
        "Critical DOM elements missing for home page:",
        missingCritical
      );
      
      // Try to re-initialize missing view mode elements
      if (missingCritical.some(elem => ["dayViewBtn", "gridViewBtn", "scheduleDayView", "scheduleGridView"].includes(elem))) {
        console.log("🔄 Attempting to re-initialize view mode elements...");
        reinitializeViewModeElements();
        
        // Re-check after re-initialization
        const stillMissing = criticalElements.filter(
          (key) => !DOM_ELEMENTS[key]
        );
        
        if (stillMissing.length > 0) {
          console.error("❌ Still missing critical elements after re-initialization:", stillMissing);
          return false;
        } else {
          console.log("✅ Successfully re-initialized missing view mode elements");
        }
      } else {
        return false;
      }
    }

    console.log("✅ All critical DOM elements found for home page");
    return true;
  }

  return true; // No critical elements to check for other routes
}

/**
 * Re-initialize view mode DOM elements
 * Useful when elements become stale after template reloading
 */
export function reinitializeViewModeElements() {
  console.log("🔄 Re-initializing view mode elements...");
  
  // Re-fetch view mode elements
  DOM_ELEMENTS.dayViewBtn = document.getElementById("dayViewBtn");
  DOM_ELEMENTS.gridViewBtn = document.getElementById("gridViewBtn");
  DOM_ELEMENTS.scheduleDayView = document.getElementById("scheduleDayView");
  DOM_ELEMENTS.scheduleGridView = document.getElementById("scheduleGridView");
  DOM_ELEMENTS.daySelectorContainer = document.getElementById("daySelectorContainer");
  DOM_ELEMENTS.daySelector = document.getElementById("daySelector");
  DOM_ELEMENTS.dayViewContainer = document.getElementById("dayViewContainer");
  
  console.log("📍 View mode elements re-initialized:", {
    dayViewBtn: !!DOM_ELEMENTS.dayViewBtn,
    gridViewBtn: !!DOM_ELEMENTS.gridViewBtn,
    scheduleDayView: !!DOM_ELEMENTS.scheduleDayView,
    scheduleGridView: !!DOM_ELEMENTS.scheduleGridView,
    timestamp: new Date().toISOString()
  });
}
