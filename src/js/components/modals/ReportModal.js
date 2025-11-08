/**
 * ReportModal Component
 * Handles user/message reporting with reason selection and description validation
 */

import { db } from "../../lib/firebase/firebase-config.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { currentUser } from "../../store/userStore.js";
import { logManager } from "../../utils/debug/LogManager.js";

export class ReportModal {
  constructor() {
    this.modal = null;
    this.onClose = null;
    this.reportType = null; // 'user' or 'message'
    this.reportedId = null;
    this.additionalData = {};
  }

  /**
   * Show the report modal
   * @param {Object} options - Report options
   * @param {string} options.type - 'user' or 'message'
   * @param {string} options.reportedId - ID of user or message being reported
   * @param {Object} options.additionalData - Additional context (e.g., spaceId for messages)
   * @param {Function} options.onClose - Callback when modal closes
   */
  show({ type, reportedId, additionalData = {}, onClose = null }) {
    this.reportType = type;
    this.reportedId = reportedId;
    this.additionalData = additionalData;
    this.onClose = onClose;

    // Create modal HTML
    this.modal = document.createElement("div");
    this.modal.className = "report-modal-overlay";
    this.modal.innerHTML = `
      <div class="report-modal">
        <div class="report-modal-header">
          <h2>Report ${type === "user" ? "User" : "Message"}</h2>
          <button class="report-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="report-modal-body">
          <div class="form-group">
            <label for="reportReason">Reason *</label>
            <select id="reportReason" required>
              <option value="">Select a reason...</option>
              <option value="harassment">Harassment</option>
              <option value="spam">Spam</option>
              <option value="impersonation">Impersonation</option>
              <option value="inappropriate_profile">Inappropriate Profile</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="reportDescription">
              Description * 
              <span class="char-count" id="descCharCount">0 / 50 minimum</span>
            </label>
            <textarea 
              id="reportDescription" 
              rows="4" 
              maxlength="500"
              placeholder="Please provide details about why you're reporting this ${type}..."
              required
            ></textarea>
            <div class="form-help">Minimum 50 characters required</div>
          </div>
          <div id="reportError" class="report-error hidden"></div>
        </div>
        <div class="report-modal-footer">
          <button class="btn secondary" id="reportCancelBtn">Cancel</button>
          <button class="btn danger" id="reportSubmitBtn" disabled>Submit Report</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);
    this.bindEvents();

    // Focus on reason dropdown
    setTimeout(() => {
      const reasonSelect = this.modal.querySelector("#reportReason");
      if (reasonSelect) reasonSelect.focus();
    }, 100);
  }

  bindEvents() {
    const closeBtn = this.modal.querySelector(".report-modal-close");
    const cancelBtn = this.modal.querySelector("#reportCancelBtn");
    const submitBtn = this.modal.querySelector("#reportSubmitBtn");
    const reasonSelect = this.modal.querySelector("#reportReason");
    const descriptionTextarea = this.modal.querySelector("#reportDescription");
    const charCount = this.modal.querySelector("#descCharCount");
    const errorDiv = this.modal.querySelector("#reportError");

    // Close handlers
    closeBtn?.addEventListener("click", () => this.close());
    cancelBtn?.addEventListener("click", () => this.close());
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });

    // Validation handlers
    const validate = () => {
      const reason = reasonSelect?.value || "";
      const description = descriptionTextarea?.value?.trim() || "";
      const isValid = reason && description.length >= 50;

      if (submitBtn) {
        submitBtn.disabled = !isValid;
      }

      return isValid;
    };

    // Character counter
    descriptionTextarea?.addEventListener("input", (e) => {
      const length = e.target.value.length;
      const isValid = length >= 50;

      if (charCount) {
        charCount.textContent = isValid
          ? `${length} / 500`
          : `${length} / 50 minimum`;
        charCount.style.color = isValid ? "#4ade80" : "";
      }

      validate();
    });

    reasonSelect?.addEventListener("change", () => validate());

    // Submit handler
    submitBtn?.addEventListener("click", async () => {
      if (!validate()) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      errorDiv?.classList.add("hidden");

      try {
        await this.submitReport({
          reason: reasonSelect.value,
          description: descriptionTextarea.value.trim(),
        });

        // Show success and close
        this.showSuccess();
        setTimeout(() => this.close(), 1500);
      } catch (error) {
        logManager?.system?.error?.("Report submission failed", error);

        if (errorDiv) {
          errorDiv.textContent = "Failed to submit report. Please try again.";
          errorDiv.classList.remove("hidden");
        }

        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Report";
      }
    });
  }

  async submitReport({ reason, description }) {
    const reporterId = currentUser.uid;
    if (!reporterId) {
      throw new Error("Must be signed in to report");
    }

    const reportData = {
      reporterId,
      reason,
      description,
      createdAt: serverTimestamp(),
      status: "pending", // For future admin review
    };

    // Add type-specific fields
    if (this.reportType === "user") {
      reportData.reportedUserId = this.reportedId;
    } else if (this.reportType === "message") {
      reportData.reportedMessageId = this.reportedId;
      reportData.spaceId = this.additionalData.spaceId || null;
    }

    // Write to moderationReports collection
    const reportsRef = collection(db, "moderationReports");
    await addDoc(reportsRef, reportData);

    logManager?.system?.info?.("Report submitted", {
      type: this.reportType,
      id: this.reportedId,
    });
  }

  showSuccess() {
    const body = this.modal?.querySelector(".report-modal-body");
    if (!body) return;

    body.innerHTML = `
      <div class="report-success">
        <i class="fas fa-check-circle"></i>
        <h3>Report Submitted</h3>
        <p>Thank you for helping keep our community safe.</p>
      </div>
    `;
  }

  close() {
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
    this.modal = null;

    if (this.onClose) {
      this.onClose();
    }
  }
}

export default ReportModal;
