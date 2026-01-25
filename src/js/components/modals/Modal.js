// js/modal.js

import { sanitizeHTML } from "../../utils/security/sanitize.js";
import { logManager } from "../../utils/debug/LogManager.js";

let currentOnConfirm = null;
let currentOnCancel = null;
let modalDomElements = null; // To store passed DOM_ELEMENTS
let modalInitialized = false;

function handleCloseClick() {
  if (typeof currentOnCancel === "function") {
    currentOnCancel();
  }
  hideModal();
}

function handleConfirmClick() {
  let shouldClose = true;
  if (typeof currentOnConfirm === "function") {
    const result = currentOnConfirm();
    if (result === false) shouldClose = false;
  }
  if (shouldClose) {
    hideModal();
  }
}

function handleCancelClick() {
  if (typeof currentOnCancel === "function") {
    currentOnCancel();
  }
  hideModal();
}

function handleOverlayClick(event) {
  if (!modalDomElements?.appModal) return;
  if (event.target === modalDomElements.appModal) {
    if (typeof currentOnCancel === "function") {
      currentOnCancel();
    }
    hideModal();
  }
}

function handleKeydown(event) {
  if (
    event.key === "Escape" &&
    modalDomElements?.appModal?.classList?.contains("active")
  ) {
    if (typeof currentOnCancel === "function") {
      currentOnCancel();
    }
    hideModal();
  }
}

function removeModalListeners() {
  if (!modalDomElements) return;
  modalDomElements.modalCloseBtn?.removeEventListener("click", handleCloseClick);
  modalDomElements.modalConfirmBtn?.removeEventListener(
    "click",
    handleConfirmClick
  );
  modalDomElements.modalCancelBtn?.removeEventListener(
    "click",
    handleCancelClick
  );
  modalDomElements.appModal?.removeEventListener("click", handleOverlayClick);
  document.removeEventListener("keydown", handleKeydown);
}

/**
 * Initializes the modal system with necessary DOM elements and event listeners.
 * @param {object} domElements - The main DOM_ELEMENTS object from domElements.js
 */
export function initModal(domElements) {
  if (modalInitialized) {
    // Idempotent: remove prior listeners before reinitializing (prevents accumulation)
    removeModalListeners();
  }

  modalDomElements = domElements; // Store for use in other modal functions

  if (
    !modalDomElements ||
    !modalDomElements.appModal ||
    !modalDomElements.modalCloseBtn ||
    !modalDomElements.modalConfirmBtn ||
    !modalDomElements.modalCancelBtn
  ) {
    logManager.error(
      "Critical modal DOM elements not provided to initModal or not found. Modal will not function correctly."
    );
    return;
  }

  modalDomElements.modalCloseBtn.addEventListener("click", handleCloseClick);
  modalDomElements.modalConfirmBtn.addEventListener("click", handleConfirmClick);
  modalDomElements.modalCancelBtn.addEventListener("click", handleCancelClick);

  // Close modal if overlay (outside modal content) is clicked
  modalDomElements.appModal.addEventListener("click", handleOverlayClick);

  // Close modal with Escape key
  document.addEventListener("keydown", handleKeydown);
  modalInitialized = true;
}

/**
 * Shows the custom modal.
 * @param {object} options - Configuration for the modal.
 * @param {string|HTMLElement} options.content - The main message or HTML content.
 * @param {string} [options.title="Notification"] - Optional title for the modal.
 * @param {boolean} [options.showConfirmationButtons=false] - If true, shows Yes/No (or custom) buttons.
 * @param {function} [options.onConfirm] - Callback for the "Confirm" button. Can return false to prevent close.
 * @param {function} [options.onCancel] - Callback for the "Cancel" or close button.
 * @param {boolean} [options.isHtmlContent=false] - True if content is an HTML string or HTMLElement.
 * @param {string} [options.confirmText="Yes"] - Text for the confirm button.
 * @param {string} [options.cancelText="No"] - Text for the cancel button (if showConfirmationButtons is true).
 */
export function showModal({
  content,
  title = "Notification",
  showConfirmationButtons = false,
  onConfirm,
  onCancel,
  isHtmlContent = false,
  confirmText = "Yes", // Default to "Yes"
  cancelText = "No", // Default to "No"
}) {
  if (
    !modalDomElements ||
    !modalDomElements.appModal ||
    !modalDomElements.modalTitle ||
    !modalDomElements.modalMessage ||
    !modalDomElements.modalCloseBtn ||
    !modalDomElements.modalActionButtons ||
    !modalDomElements.modalConfirmBtn ||
    !modalDomElements.modalCancelBtn
  ) {
    logManager.error(
      "Modal elements not found in DOM. Falling back to native browser dialogs."
    );
    // Fallback logic (simplified from your original)
    const messageString =
      typeof content === "string" || content instanceof String
        ? content
        : "Custom content interaction required.";
    if (showConfirmationButtons) {
      if (confirm(`${title}: ${messageString}`)) {
        if (onConfirm && typeof onConfirm === "function") onConfirm();
      } else {
        if (onCancel && typeof onCancel === "function") onCancel();
      }
    } else {
      alert(`${title}: ${messageString}`);
    }
    return;
  }

  modalDomElements.modalTitle.textContent = title;
  currentOnConfirm = onConfirm;
  currentOnCancel = onCancel;

  if (isHtmlContent) {
    modalDomElements.modalMessage.innerHTML = ""; // Clear previous
    if (typeof content === "string") {
      modalDomElements.modalMessage.innerHTML = sanitizeHTML(content);
    } else if (content instanceof HTMLElement) {
      modalDomElements.modalMessage.appendChild(content);
    } else {
      modalDomElements.modalMessage.textContent =
        "Invalid content for HTML modal.";
    }
  } else {
    modalDomElements.modalMessage.innerHTML = ""; // Clear previous HTML if any
    modalDomElements.modalMessage.textContent = content;
  }

  if (showConfirmationButtons) {
    // Standard confirm/cancel layout
    modalDomElements.modalActionButtons.style.display = "flex";
    modalDomElements.modalConfirmBtn.textContent = confirmText;
    modalDomElements.modalCancelBtn.textContent = cancelText;
    modalDomElements.modalConfirmBtn.classList.remove("single-ok");
    if (cancelText === "" || cancelText == null) {
      modalDomElements.modalCancelBtn.style.display = "none";
      modalDomElements.modalConfirmBtn.classList.add("success-btn");
    } else {
      modalDomElements.modalCancelBtn.style.display = "inline-block";
      modalDomElements.modalConfirmBtn.classList.remove("success-btn");
    }
    modalDomElements.modalCloseBtn.style.display = "none"; // hide top X entirely in this design
  } else {
    // Single OK pattern: reuse confirm button at bottom, hide cancel & top X
    modalDomElements.modalActionButtons.style.display = "flex";
    modalDomElements.modalConfirmBtn.textContent = "Ok";
    modalDomElements.modalConfirmBtn.classList.add("single-ok", "success-btn");
    modalDomElements.modalCancelBtn.style.display = "none";
    modalDomElements.modalCloseBtn.style.display = "none";
  }

  // Ensure the modal is displayed and active, even if a previous modal was still hiding
  modalDomElements.appModal.style.display = "flex";

  // Add compact class for mobile friendly width if only single ok button and short text
  try {
    if (!showConfirmationButtons) {
      const msgLen = (modalDomElements.modalMessage.textContent || "").length;
      if (msgLen < 140) {
        modalDomElements.modalTitle.parentElement?.classList?.add(
          "modal-compact"
        );
      }
    } else {
      modalDomElements.modalTitle.parentElement?.classList?.remove(
        "modal-compact"
      );
    }
  } catch (error) { console.debug("Suppressed error", error); }

  // If the modal already has the active class, remove it first to trigger a fresh transition
  if (modalDomElements.appModal.classList.contains("active")) {
    modalDomElements.appModal.classList.remove("active");
    // Use a small delay to ensure the class removal takes effect
    setTimeout(() => {
      if (modalDomElements.appModal) {
        modalDomElements.appModal.classList.add("active");
      }
    }, 10);
  } else {
    setTimeout(() => {
      if (modalDomElements.appModal) {
        modalDomElements.appModal.classList.add("active");
      }
    }, 10); // For transition
  }
}

/**
 * Hides the custom modal.
 */
function hideModal() {
  // Internal function
  if (!modalDomElements || !modalDomElements.appModal) return;

  // Hide action buttons immediately to prevent flicker during fade-out
  try {
    if (modalDomElements.modalActionButtons) {
      modalDomElements.modalActionButtons.style.display = "none";
    }
    if (modalDomElements.modalConfirmBtn) {
      modalDomElements.modalConfirmBtn.classList.remove("single-ok", "success-btn");
    }
  } catch (error) { console.debug("Suppressed error", error); }

  modalDomElements.appModal.classList.remove("active");

  // Store the current callbacks before they might be overwritten by a new modal
  const callbacksToPreserve = {
    onConfirm: currentOnConfirm,
    onCancel: currentOnCancel,
  };

  setTimeout(() => {
    // Only clear the callbacks if they haven't been overwritten by a new modal
    // This prevents interference when a new modal is shown while the previous one is still hiding
    if (
      currentOnConfirm === callbacksToPreserve.onConfirm &&
      currentOnCancel === callbacksToPreserve.onCancel
    ) {
      currentOnConfirm = null;
      currentOnCancel = null;
    }

    // Only reset the display if no new modal has taken over
    if (!modalDomElements.appModal.classList.contains("active")) {
      modalDomElements.appModal.style.display = "none";
      // Reset button visibility to default (OK shown, Yes/No hidden)
      if (modalDomElements.modalActionButtons)
        modalDomElements.modalActionButtons.style.display = "none";
      if (modalDomElements.modalCloseBtn)
        modalDomElements.modalCloseBtn.style.display = "inline-block";
    }
  }, 300); // Match CSS transition duration
}

// =============================================================================
//                           GLOBAL EXPORTS
// =============================================================================
