/**
 * EventDetailModal - Modal for viewing event details
 * Shows full event info with edit/delete options for authorized users
 */

import { currentUser } from "../../store/userStore.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";
import { logManager } from "../../utils/debug/LogManager.js";

export class EventDetailModal {
  constructor(options = {}) {
    this.event = options.event;
    this.clubData = options.clubData;
    this.onEdit = options.onEdit || (() => {});
    this.onDelete = options.onDelete || (() => {});
    this.onClose = options.onClose || (() => {});
    
    this.overlay = null;
  }

  /**
   * Check if current user can edit/delete this event
   * Must match Firestore rules: only devOwnerUid or presidentId can manage
   */
  get canManage() {
    if (!currentUser?.uid) return false;
    // Club owner (devTest) or president can manage - matches firestore.rules
    return this.clubData?.devOwnerUid === currentUser.uid || 
           this.clubData?.presidentId === currentUser.uid;
  }

  /**
   * Show the modal
   */
  show() {
    this.render();
    this.bindEvents();
    
    requestAnimationFrame(() => {
      this.overlay?.classList.add("active");
    });
  }

  /**
   * Hide and destroy the modal
   */
  hide() {
    // Remove escape handler to prevent leaks
    if (this.escHandler) {
      document.removeEventListener("keydown", this.escHandler);
      this.escHandler = null;
    }
    if (this.overlay) {
      this.overlay.classList.remove("active");
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 300);
    }
    this.onClose();
  }

  /**
   * Format time slots for display
   */
  formatTimeSlots() {
    if (!this.event.timeSlots || this.event.timeSlots.length === 0) {
      // Fallback to firstSlotStart
      if (this.event.firstSlotStart) {
        const date = this.event.firstSlotStart?.toDate?.() || new Date(this.event.firstSlotStart);
        return [{
          dateStr: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
          timeStr: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        }];
      }
      return [];
    }

    return this.event.timeSlots.map(slot => {
      const date = new Date(slot.date + "T00:00:00");
      return {
        dateStr: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
        timeStr: `${this.formatTime(slot.startTime)} - ${this.formatTime(slot.endTime)}`
      };
    });
  }

  /**
   * Format 24h time to 12h
   */
  formatTime(time24) {
    const [hours, minutes] = time24.split(":");
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  }

  /**
   * Get status badge HTML
   */
  getStatusBadge() {
    if (this.event.isLive) {
      return `<span class="event-detail-status live"><i class="fas fa-circle"></i> LIVE NOW</span>`;
    }
    if (this.event.status === "pending_president" || this.event.status === "pending_saf") {
      return `<span class="event-detail-status pending"><i class="fas fa-clock"></i> Pending Approval</span>`;
    }
    if (this.event.status === "rejected") {
      return `<span class="event-detail-status rejected"><i class="fas fa-times-circle"></i> Rejected</span>`;
    }
    if (this.event.status === "cancelled") {
      return `<span class="event-detail-status cancelled"><i class="fas fa-ban"></i> Cancelled</span>`;
    }
    return "";
  }

  /**
   * Render the modal DOM
   */
  render() {
    document.querySelector(".event-detail-modal-overlay")?.remove();

    const e = this.event;
    const timeSlots = this.formatTimeSlots();
    const statusBadge = this.getStatusBadge();

    this.overlay = document.createElement("div");
    this.overlay.className = "event-detail-modal-overlay";
    this.overlay.innerHTML = `
      <div class="event-detail-modal">
        <button class="modal-close-btn" type="button" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>

        ${e.imageUrl ? `
          <div class="event-detail-image">
            <img src="${e.imageUrl}" alt="${escapeHtml(e.title)}" />
          </div>
        ` : ""}

        <div class="event-detail-content">
          <div class="event-detail-header">
            <h2>${escapeHtml(e.title || "Untitled Event")}</h2>
            ${statusBadge}
          </div>

          <div class="event-detail-meta">
            ${timeSlots.map(slot => `
              <div class="event-detail-slot">
                <div class="slot-date">
                  <i class="fas fa-calendar"></i>
                  ${slot.dateStr}
                </div>
                <div class="slot-time">
                  <i class="fas fa-clock"></i>
                  ${slot.timeStr}
                </div>
              </div>
            `).join("")}

            <div class="event-detail-location">
              <i class="fas fa-map-marker-alt"></i>
              ${escapeHtml(e.location || "Location TBA")}
            </div>
          </div>

          ${e.description ? `
            <div class="event-detail-description">
              <h3>About this event</h3>
              <p>${escapeHtml(e.description)}</p>
            </div>
          ` : ""}

          <div class="event-detail-info">
            <div class="info-item">
              <i class="fas fa-user"></i>
              <span>Created by ${escapeHtml(e.createdByInfo?.firstName || "Unknown")} ${escapeHtml(e.createdByInfo?.lastName || "")}</span>
            </div>
            ${e.createdAt ? `
              <div class="info-item">
                <i class="fas fa-calendar-plus"></i>
                <span>Posted ${this.formatDate(e.createdAt)}</span>
              </div>
            ` : ""}
          </div>

          ${this.canManage ? `
            <div class="event-detail-actions">
              <button class="btn secondary" id="editEventBtn">
                <i class="fas fa-edit"></i> Edit
              </button>
              <button class="btn danger" id="deleteEventBtn">
                <i class="fas fa-trash"></i> Delete
              </button>
            </div>
          ` : ""}
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
  }

  /**
   * Format Firestore timestamp or Date
   */
  formatDate(timestamp) {
    const date = timestamp?.toDate?.() || new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const closeBtn = this.overlay.querySelector(".modal-close-btn");
    const editBtn = this.overlay.querySelector("#editEventBtn");
    const deleteBtn = this.overlay.querySelector("#deleteEventBtn");

    closeBtn?.addEventListener("click", () => this.hide());
    
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.escHandler = (e) => {
      if (e.key === "Escape") this.hide();
    };
    document.addEventListener("keydown", this.escHandler);

    editBtn?.addEventListener("click", () => {
      this.hide();
      this.onEdit(this.event);
    });

    deleteBtn?.addEventListener("click", () => this.confirmDelete());
  }

  /**
   * Confirm and delete the event
   */
  async confirmDelete() {
    const confirmed = confirm(`Delete "${this.event.title}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;

    const deleteBtn = this.overlay.querySelector("#deleteEventBtn");
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Deleting...`;
    }

    try {
      const { db } = await import("../../lib/firebase/firebase-config.js");
      const { doc, deleteDoc } = await import("firebase/firestore");

      await deleteDoc(doc(db, "clubs", this.clubData.id, "events", this.event.id));

      logManager.info("[EventDetailModal] Deleted event:", this.event.id);
      notificationManager.show("Event deleted", "success");

      this.hide();
      this.onDelete(this.event.id);

    } catch (err) {
      logManager.error("[EventDetailModal] Failed to delete event:", err);
      notificationManager.show("Failed to delete event", "error");
      
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = `<i class="fas fa-trash"></i> Delete`;
      }
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.escHandler) {
      document.removeEventListener("keydown", this.escHandler);
    }
    this.overlay?.remove();
    this.overlay = null;
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Helper function to show the modal
 */
export function showEventDetailModal(options) {
  const modal = new EventDetailModal(options);
  modal.show();
  return modal;
}
