/**
 * EventDetailModal - Modal for viewing event details
 * Shows full event info with edit/delete options for authorized users
 * Phase 4: Added Go Live / End Event functionality
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
    this.onLiveStatusChange = options.onLiveStatusChange || (() => {});

    this.overlay = null;
    this.countdownInterval = null;
  }

  /**
   * Check if current user can manage this event in any way
   * (used for live controls). Presidents/dev owners/club creators can
   * manage all events; officials can manage events they created.
   */
  get canManage() {
    const uid = currentUser?.uid;
    if (!uid) return false;

    // Club owner (devTest), president, or club creator can manage all events
    const isPresidentLike =
      this.clubData?.devOwnerUid === uid ||
      this.clubData?.presidentId === uid ||
      this.clubData?.createdBy === uid;

    // Officials can manage events they created
    const isOfficial =
      Array.isArray(this.clubData?.officialIds) &&
      this.clubData.officialIds.includes(uid);
    const isEventCreator = this.event?.createdBy === uid;

    return isPresidentLike || (isOfficial && isEventCreator);
  }

  /**
   * Check if current user can edit this event (via Edit button)
   * - Presidents/dev owners/club creators can edit any event
   * - Officials can edit events they created that are pending or rejected
   */
  get canEdit() {
    const uid = currentUser?.uid;
    if (!uid) return false;

    const isPresidentLike =
      this.clubData?.devOwnerUid === uid ||
      this.clubData?.presidentId === uid ||
      this.clubData?.createdBy === uid;
    if (isPresidentLike) return true;

    const isOfficial =
      Array.isArray(this.clubData?.officialIds) &&
      this.clubData.officialIds.includes(uid);
    const isEventCreator = this.event?.createdBy === uid;
    const isPendingOrRejected =
      this.event?.status === "pending_president" ||
      this.event?.status === "rejected";

    return isOfficial && isEventCreator && isPendingOrRejected;
  }

  /**
   * Check if current user can delete this event
   * - Only presidents/dev owners/club creators may delete (matches firestore.rules)
   */
  get canDelete() {
    const uid = currentUser?.uid;
    if (!uid) return false;

    return (
      this.clubData?.devOwnerUid === uid ||
      this.clubData?.presidentId === uid ||
      this.clubData?.createdBy === uid
    );
  }

  /**
   * Compute firstStart / lastEnd for this event, handling overnight slots
   * (where endTime < startTime means the event ends the next day).
   */
  getEventTimeInfo() {
    if (!this.event.timeSlots || this.event.timeSlots.length === 0) {
      return { firstStart: null, lastEnd: null };
    }

    const firstSlot = this.event.timeSlots[0];
    const lastSlot = this.event.timeSlots[this.event.timeSlots.length - 1];

    const firstStart = new Date(`${firstSlot.date}T${firstSlot.startTime}`);
    let lastEnd = new Date(`${lastSlot.date}T${lastSlot.endTime}`);

    // Handle overnight events: if end time is before start time,
    // it means the event ends the next day (e.g., 10PM to 1AM).
    if (lastSlot.endTime < lastSlot.startTime) {
      lastEnd.setDate(lastEnd.getDate() + 1);
    }

    return { firstStart, lastEnd };
  }

  /**
   * Check if the event is within its active time window
   * An event can go live if current time is between:
   * - 30 minutes before the first slot start time
   * - AND the last slot end time (with overnight handling)
   */
  get isWithinTimeWindow() {
    if (!this.event.timeSlots || this.event.timeSlots.length === 0)
      return false;

    const now = new Date();
    const { firstStart, lastEnd } = this.getEventTimeInfo();
    if (!firstStart || !lastEnd) return false;

    // Can go live 30 minutes before start
    const windowStart = new Date(firstStart.getTime() - 30 * 60 * 1000);

    return now >= windowStart && now <= lastEnd;
  }

  /**
   * Check if the event has ended (past all time slots)
   */
  get hasEnded() {
    if (!this.event.timeSlots || this.event.timeSlots.length === 0)
      return false;

    const now = new Date();
    const { lastEnd } = this.getEventTimeInfo();
    if (!lastEnd) return false;

    return now > lastEnd;
  }

  /**
   * Get time remaining until event ends (for live events)
   */
  getTimeRemaining() {
    if (!this.event.timeSlots || this.event.timeSlots.length === 0) return null;

    const now = new Date();
    const { lastEnd } = this.getEventTimeInfo();
    if (!lastEnd) return null;

    const diffMs = lastEnd - now;
    if (diffMs <= 0) return null;

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  }

  /**
   * Show the modal
   */
  show() {
    this.render();
    this.bindEvents();
    this.startCountdown();

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
    // Clear countdown interval
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
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
   * Start countdown timer for live events
   */
  startCountdown() {
    if (!this.event.isLive) return;

    const updateCountdown = () => {
      const countdownEl = this.overlay?.querySelector(".live-countdown");
      if (countdownEl) {
        const remaining = this.getTimeRemaining();
        if (remaining) {
          countdownEl.textContent = remaining;
        } else {
          countdownEl.textContent = "Event ended";
          clearInterval(this.countdownInterval);
        }
      }
    };

    // Update every minute
    this.countdownInterval = setInterval(updateCountdown, 60000);
  }

  /**
   * Format time slots for display
   */
  formatTimeSlots() {
    if (!this.event.timeSlots || this.event.timeSlots.length === 0) {
      return [];
    }

    return this.event.timeSlots.map((slot) => {
      const date = new Date(slot.date + "T00:00:00");
      return {
        dateStr: date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        timeStr: `${this.formatTime(slot.startTime)} - ${this.formatTime(
          slot.endTime
        )}`,
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
      const timeRemaining = this.getTimeRemaining();
      return `
        <div class="live-status-container">
          <span class="event-detail-status live"><i class="fas fa-circle"></i> LIVE NOW</span>
          ${
            timeRemaining
              ? `<span class="live-countdown">${timeRemaining}</span>`
              : ""
          }
        </div>
      `;
    }
    if (
      this.event.status === "pending_president" ||
      this.event.status === "pending_saf"
    ) {
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
   * Get the Go Live / End Event action button HTML
   * Only shown to officials when conditions are met
   */
  getLiveActionButton() {
    if (!this.canManage) return "";
    if (this.event.status !== "approved" && !this.event.isLive) return "";

    if (this.event.isLive) {
      // Show "End Event" button if event is live
      return `
        <button class="btn live-action-btn end-live" id="endEventBtn">
          <i class="fas fa-stop-circle"></i> End Event
        </button>
      `;
    } else if (this.isWithinTimeWindow && !this.hasEnded) {
      // Show "Go Live" button if within time window
      return `
        <button class="btn live-action-btn go-live" id="goLiveBtn">
          <i class="fas fa-broadcast-tower"></i> Go Live
        </button>
      `;
    } else if (!this.hasEnded) {
      // Event hasn't started yet - show disabled button with hint
      const firstSlot = this.event.timeSlots?.[0];
      if (firstSlot) {
        const startDate = new Date(`${firstSlot.date}T${firstSlot.startTime}`);
        const now = new Date();
        const diffMs = startDate - now;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        let timeUntil = "";
        if (diffDays > 0) {
          timeUntil = `in ${diffDays} day${diffDays > 1 ? "s" : ""}`;
        } else if (diffHours > 0) {
          timeUntil = `in ${diffHours}h ${diffMins % 60}m`;
        } else if (diffMins > 30) {
          timeUntil = `in ${diffMins}m`;
        }

        if (timeUntil) {
          return `
            <div class="go-live-hint">
              <i class="fas fa-info-circle"></i>
              <span>Go Live available ${timeUntil}</span>
            </div>
          `;
        }
      }
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
    const liveActionBtn = this.getLiveActionButton();
    const hasImage = !!e.imageUrl;

    // Get first time slot for compact display
    const firstSlot = timeSlots[0];
    const additionalSlots = timeSlots.length > 1 ? timeSlots.length - 1 : 0;

    this.overlay = document.createElement("div");
    this.overlay.className = "event-detail-modal-overlay";

    // Different layout for events with images vs without
    if (hasImage) {
      // Hero image layout - image is the focus
      this.overlay.innerHTML = `
        <div class="event-detail-modal has-hero-image ${
          e.isLive ? "is-live" : ""
        }">
          <button class="modal-close-btn" type="button" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>

          <div class="event-hero-container">
            <img src="${e.imageUrl}" alt="${escapeHtml(
        e.title
      )}" class="event-hero-image" />
            
            <div class="event-hero-overlay">
              <div class="event-hero-content">
                ${statusBadge}
                <h2 class="event-hero-title">${escapeHtml(
                  e.title || "Untitled Event"
                )}</h2>
                
                <div class="event-hero-meta">
                  ${
                    firstSlot
                      ? `
                    <div class="hero-meta-item">
                      <i class="fas fa-calendar"></i>
                      <span>${firstSlot.dateStr}${
                          additionalSlots > 0
                            ? ` (+${additionalSlots} more)`
                            : ""
                        }</span>
                    </div>
                    <div class="hero-meta-item">
                      <i class="fas fa-clock"></i>
                      <span>${firstSlot.timeStr}</span>
                    </div>
                  `
                      : ""
                  }
                  <div class="hero-meta-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${escapeHtml(e.location || "Location TBA")}</span>
                  </div>
                </div>
                
                ${liveActionBtn}
              </div>
            </div>
          </div>

          ${
            additionalSlots > 0 || e.description || this.canManage
              ? `
            <div class="event-detail-footer">
              ${
                additionalSlots > 0
                  ? `
                <div class="event-all-dates">
                  <button class="view-all-dates-btn" type="button">
                    <i class="fas fa-calendar-alt"></i>
                    <span>View all ${timeSlots.length} dates</span>
                    <i class="fas fa-chevron-down expand-icon"></i>
                  </button>
                  <div class="all-dates-list" hidden>
                    ${timeSlots
                      .map(
                        (slot, index) => `
                      <div class="event-detail-slot compact">
                        <span class="slot-number">${index + 1}</span>
                        <div class="slot-date">
                          <i class="fas fa-calendar"></i>
                          ${slot.dateStr}
                        </div>
                        <div class="slot-time">
                          <i class="fas fa-clock"></i>
                          ${slot.timeStr}
                        </div>
                      </div>
                    `
                      )
                      .join("")}
                  </div>
                </div>
              `
                  : ""
              }
              
              ${
                e.description
                  ? `
                <p class="event-footer-description">${escapeHtml(
                  e.description
                )}</p>
              `
                  : ""
              }
              
              <div class="event-footer-info">
                <span><i class="fas fa-user"></i> ${escapeHtml(
                  e.createdByInfo?.firstName || "Unknown"
                )}</span>
                ${
                  e.createdAt
                    ? `<span><i class="fas fa-calendar-plus"></i> ${this.formatDate(
                        e.createdAt
                      )}</span>`
                    : ""
                }
              </div>

              ${
                this.canEdit || this.canDelete
                  ? `
                <div class="event-detail-actions">
                  ${
                    this.canEdit
                      ? `<button class="btn secondary" id="editEventBtn">
                    <i class="fas fa-edit"></i> Edit
                  </button>`
                      : ""
                  }
                  ${
                    this.canDelete
                      ? `<button class="btn danger" id="deleteEventBtn">
                    <i class="fas fa-trash"></i> Delete
                  </button>`
                      : ""
                  }
                </div>
              `
                  : ""
              }
            </div>
          `
              : ""
          }
        </div>
      `;
    } else {
      // Standard layout for events without images
      this.overlay.innerHTML = `
        <div class="event-detail-modal ${e.isLive ? "is-live" : ""}">
          <button class="modal-close-btn" type="button" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>

          <div class="event-detail-content">
            <div class="event-detail-header">
              <h2>${escapeHtml(e.title || "Untitled Event")}</h2>
              ${statusBadge}
            </div>
            
            ${liveActionBtn}

            <div class="event-detail-meta">
              ${timeSlots
                .map(
                  (slot) => `
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
              `
                )
                .join("")}

              <div class="event-detail-location">
                <i class="fas fa-map-marker-alt"></i>
                ${escapeHtml(e.location || "Location TBA")}
              </div>
            </div>

            ${
              e.description
                ? `
              <div class="event-detail-description">
                <h3>About this event</h3>
                <p>${escapeHtml(e.description)}</p>
              </div>
            `
                : ""
            }

            <div class="event-detail-info">
              <div class="info-item">
                <i class="fas fa-user"></i>
                <span>Created by ${escapeHtml(
                  e.createdByInfo?.firstName || "Unknown"
                )} ${escapeHtml(e.createdByInfo?.lastName || "")}</span>
              </div>
              ${
                e.createdAt
                  ? `
                <div class="info-item">
                  <i class="fas fa-calendar-plus"></i>
                  <span>Posted ${this.formatDate(e.createdAt)}</span>
                </div>
              `
                  : ""
              }
            </div>

            ${
              this.canEdit || this.canDelete
                ? `
              <div class="event-detail-actions">
                ${
                  this.canEdit
                    ? `<button class="btn secondary" id="editEventBtn">
                  <i class="fas fa-edit"></i> Edit
                </button>`
                    : ""
                }
                ${
                  this.canDelete
                    ? `<button class="btn danger" id="deleteEventBtn">
                  <i class="fas fa-trash"></i> Delete
                </button>`
                    : ""
                }
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
    }

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
    const viewAllDatesBtn = this.overlay.querySelector(".view-all-dates-btn");
    const goLiveBtn = this.overlay.querySelector("#goLiveBtn");
    const endEventBtn = this.overlay.querySelector("#endEventBtn");

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

    // Go Live button handler
    goLiveBtn?.addEventListener("click", () => this.handleGoLive());

    // End Event button handler
    endEventBtn?.addEventListener("click", () => this.handleEndEvent());

    // Toggle view all dates list
    viewAllDatesBtn?.addEventListener("click", () => {
      const datesList = this.overlay.querySelector(".all-dates-list");
      const expandIcon = viewAllDatesBtn.querySelector(".expand-icon");
      if (datesList) {
        const isHidden = datesList.hasAttribute("hidden");
        if (isHidden) {
          datesList.removeAttribute("hidden");
          expandIcon?.classList.add("rotated");
        } else {
          datesList.setAttribute("hidden", "");
          expandIcon?.classList.remove("rotated");
        }
      }
    });
  }

  /**
   * Handle Go Live button click - Mark event as live
   */
  async handleGoLive() {
    const btn = this.overlay.querySelector("#goLiveBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Going Live...`;
    }

    try {
      const { db } = await import("../../lib/firebase/firebase-config.js");
      const { doc, updateDoc, serverTimestamp } = await import(
        "firebase/firestore"
      );

      // Get current user info for the startedByInfo field
      const startedByInfo = {
        firstName: currentUser?.profile?.profile?.firstName || "Unknown",
        lastName: currentUser?.profile?.profile?.lastName || "",
        role: "Official", // TODO: Get actual role from club membership
      };

      await updateDoc(
        doc(db, "clubs", this.clubData.id, "events", this.event.id),
        {
          isLive: true,
          startedAt: serverTimestamp(),
          startedBy: currentUser?.uid,
          startedByInfo,
        }
      );

      logManager.info("[EventDetailModal] Event went live:", this.event.id);
      notificationManager.show("🔴 Event is now LIVE!", "success");

      // Update local event state
      this.event.isLive = true;
      this.event.startedBy = currentUser?.uid;
      this.event.startedByInfo = startedByInfo;

      // Notify parent to refresh
      this.onLiveStatusChange(this.event);

      // Re-render modal to show updated state
      this.hide();
    } catch (err) {
      logManager.error("[EventDetailModal] Failed to go live:", err);
      notificationManager.show("Failed to start event", "error");

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-broadcast-tower"></i> Go Live`;
      }
    }
  }

  /**
   * Handle End Event button click - Mark event as no longer live
   */
  async handleEndEvent() {
    const confirmed = confirm(
      `End "${this.event.title}"?\n\nThe event will no longer appear as live.`
    );
    if (!confirmed) return;

    const btn = this.overlay.querySelector("#endEventBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Ending...`;
    }

    try {
      const { db } = await import("../../lib/firebase/firebase-config.js");
      const { doc, updateDoc, serverTimestamp } = await import(
        "firebase/firestore"
      );

      await updateDoc(
        doc(db, "clubs", this.clubData.id, "events", this.event.id),
        {
          isLive: false,
          endedAt: serverTimestamp(),
          endedBy: currentUser?.uid,
        }
      );

      logManager.info("[EventDetailModal] Event ended:", this.event.id);
      notificationManager.show("Event ended", "info");

      // Update local event state
      this.event.isLive = false;

      // Notify parent to refresh
      this.onLiveStatusChange(this.event);

      // Re-render modal to show updated state
      this.hide();
    } catch (err) {
      logManager.error("[EventDetailModal] Failed to end event:", err);
      notificationManager.show("Failed to end event", "error");

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-stop-circle"></i> End Event`;
      }
    }
  }

  /**
   * Confirm and delete the event
   */
  async confirmDelete() {
    const confirmed = confirm(
      `Delete "${this.event.title}"?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    const deleteBtn = this.overlay.querySelector("#deleteEventBtn");
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Deleting...`;
    }

    try {
      const { db } = await import("../../lib/firebase/firebase-config.js");
      const { doc, deleteDoc } = await import("firebase/firestore");

      await deleteDoc(
        doc(db, "clubs", this.clubData.id, "events", this.event.id)
      );

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
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    this.overlay?.remove();
    this.overlay = null;
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Helper function to show the modal
 */
export function showEventDetailModal(options) {
  const modal = new EventDetailModal(options);
  modal.show();
  return modal;
}
