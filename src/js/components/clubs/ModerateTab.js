/**
 * ModerateTab.js
 *
 * Event approval/rejection interface for club presidents and SAF moderators.
 * Shows pending events awaiting approval with approve/reject actions.
 *
 * Features:
 * - Lists pending events in easy-to-review cards
 * - Approve with one click
 * - Reject with optional comment
 * - Visual feedback for all actions
 * - Empty state when no pending events
 */

import { logManager } from "../../utils/debug/LogManager.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";
import { currentUser } from "../../store/userStore.js";

/**
 * Render the Moderate Tab content
 * @param {HTMLElement} container - Target container
 * @param {Object} clubData - Club document data
 * @param {Array} events - All events for this club
 * @param {Function} onEventUpdated - Callback when event is approved/rejected
 */
export function renderModerateTab(
  container,
  clubData,
  events,
  onEventUpdated,
  members = []
) {
  // Filter for pending events only (presidents should not see SAF-queued events)
  const pendingEvents = events.filter((e) => e.status === "pending_president");

  // Check if user can view the moderate tab (presidents and officials)
  const canViewModerate = checkCanModerate(clubData, members);
  // Check if user is a president who can approve/reject
  const canApproveReject = checkIsPresident(clubData);

  if (!canViewModerate) {
    container.innerHTML = `
      <div class="moderate-access-denied">
        <div class="access-denied-icon">
          <i class="fas fa-lock"></i>
        </div>
        <h3>Access Restricted</h3>
        <p>Only club presidents and officials can access this tab.</p>
      </div>
    `;
    return;
  }

  if (pendingEvents.length === 0) {
    container.innerHTML = `
      <div class="moderate-empty">
        <div class="empty-icon">
          <i class="fas fa-check-circle"></i>
        </div>
        <h3>All Caught Up!</h3>
        <p>No events are waiting for approval.</p>
        <p class="hint">New events created by officials will appear here.</p>
      </div>
    `;
    return;
  }

  // Show read-only notice for officials
  const readOnlyNotice = !canApproveReject
    ? `
    <div class="moderate-readonly-notice">
      <i class="fas fa-eye"></i>
      <span>View only — Only the president can approve or reject events</span>
    </div>
  `
    : "";

  // Render pending events
  const html = `
    <div class="moderate-section">
      <div class="moderate-header">
        <h3><i class="fas fa-clock"></i> Pending Approval</h3>
        <span class="pending-count">${pendingEvents.length} event${
    pendingEvents.length !== 1 ? "s" : ""
  }</span>
      </div>
      ${readOnlyNotice}
      <div class="moderate-list">
        ${pendingEvents
          .map((event) =>
            renderPendingEventCard(event, clubData, canApproveReject)
          )
          .join("")}
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Bind action buttons (only if user is president)
  if (canApproveReject) {
    bindModerateActions(container, clubData, events, onEventUpdated);
  }
}

/**
 * Check if current user can view the moderate tab
 * Presidents, officials, and dev owners can access the Moderate tab
 */
function checkCanModerate(clubData, members = []) {
  const uid = currentUser?.uid;
  if (!uid) return false;

  // DevTest clubs: devOwnerUid can moderate
  if (clubData.devTest && clubData.devOwnerUid === uid) return true;

  // Production clubs: presidentId or createdBy can moderate
  if (clubData.presidentId === uid) return true;
  if (clubData.createdBy === uid) return true;

  // Officials can also access Moderate tab (view queue, but approval still president-only)
  if (
    Array.isArray(clubData.officialIds) &&
    clubData.officialIds.includes(uid)
  ) {
    return true;
  }

  // Check members array for official role
  if (
    Array.isArray(members) &&
    members.some((m) => m.uid === uid && m.role === "official")
  ) {
    return true;
  }

  return false;
}

/**
 * Check if current user is the president (can approve/reject)
 * Only presidents can take action on events
 */
function checkIsPresident(clubData) {
  const uid = currentUser?.uid;
  if (!uid) return false;

  // DevTest clubs: devOwnerUid can approve/reject
  if (clubData.devTest && clubData.devOwnerUid === uid) return true;

  // Production clubs: only presidentId can approve/reject
  if (clubData.presidentId === uid) return true;

  // createdBy can also approve (for initial setup)
  if (clubData.createdBy === uid) return true;

  return false;
}

/**
 * Render a single pending event card
 * @param {Object} event - Event data
 * @param {Object} clubData - Club data
 * @param {boolean} canApproveReject - Whether user can approve/reject
 */
function renderPendingEventCard(event, clubData, canApproveReject = true) {
  const title = escapeHtml(event.title || "Untitled Event");
  const location = escapeHtml(event.location || "TBA");
  const description = escapeHtml(event.description || "");

  // Format date/time from first time slot
  let dateStr = "Date TBA";
  let timeStr = "";

  if (event.timeSlots && event.timeSlots.length > 0) {
    const slot = event.timeSlots[0];
    const date = new Date(slot.date + "T" + slot.startTime);
    dateStr = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    timeStr = `${slot.startTime} - ${slot.endTime}`;
  }

  // Creator info
  const creatorName = event.createdByInfo?.firstName
    ? `${event.createdByInfo.firstName} ${
        event.createdByInfo.lastName || ""
      }`.trim()
    : event.createdByInfo?.name || "Unknown";
  const createdAt = event.createdAt?.toDate
    ? formatRelativeTime(event.createdAt.toDate())
    : "Unknown";

  // Multi-day badge
  const multiDayCount = event.timeSlots?.length || 1;
  const multiDayBadge =
    multiDayCount > 1
      ? `<span class="multi-day-badge"><i class="fas fa-layer-group"></i> ${multiDayCount} days</span>`
      : "";

  // Only show action buttons if user can approve/reject
  const actionButtons = canApproveReject
    ? `
    <div class="pending-event-actions">
      <button class="action-btn approve-btn" data-action="approve" data-event-id="${event.id}">
        <i class="fas fa-check"></i> Approve
      </button>
      <button class="action-btn reject-btn" data-action="reject" data-event-id="${event.id}">
        <i class="fas fa-times"></i> Reject
      </button>
    </div>
  `
    : "";

  return `
    <div class="pending-event-card" data-event-id="${event.id}">
      ${
        event.imageUrl
          ? `<div class="pending-event-image"><img src="${escapeAttr(event.imageUrl)}" alt="${title}" loading="lazy" /></div>`
          : ""
      }
      <div class="pending-event-content">
        <div class="pending-event-header">
          <h4 class="pending-event-title">${title}</h4>
          ${multiDayBadge}
        </div>
        
        <div class="pending-event-meta">
          <span class="meta-item"><i class="fas fa-calendar"></i> ${dateStr}</span>
          ${
            timeStr
              ? `<span class="meta-item"><i class="fas fa-clock"></i> ${timeStr}</span>`
              : ""
          }
          <span class="meta-item"><i class="fas fa-map-marker-alt"></i> ${location}</span>
        </div>
        
        ${
          description
            ? `<p class="pending-event-description">${truncate(
                description,
                120
              )}</p>`
            : ""
        }
        
        <div class="pending-event-footer">
          <div class="creator-info">
            <i class="fas fa-user-circle"></i>
            <span>Submitted by <strong>${creatorName}</strong> ${createdAt}</span>
          </div>
        </div>
        
        ${actionButtons}
      </div>
    </div>
  `;
}

/**
 * Bind click handlers for approve/reject buttons
 */
function bindModerateActions(container, clubData, events, onEventUpdated) {
  // Approve buttons
  container.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.eventId;
      const event = events.find((ev) => ev.id === eventId);
      if (!event) return;

      await handleApprove(clubData, event, btn, onEventUpdated);
    });
  });

  // Reject buttons
  container.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.eventId;
      const event = events.find((ev) => ev.id === eventId);
      if (!event) return;

      showRejectModal(clubData.id, eventId, event.title, onEventUpdated);
    });
  });
}

/**
 * Handle event approval
 */
async function handleApprove(clubData, event, btn, onEventUpdated) {
  // Disable button and show spinner
  const originalContent = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Approving...`;

  try {
    const { db } = await import("../../lib/firebase/firebase-config.js");
    const { doc, updateDoc, serverTimestamp } = await import(
      "firebase/firestore"
    );

    const profile = currentUser.profile?.profile || {};
    const firstName = profile.firstName || "";
    const lastName = profile.lastName || "";

    const clubId = clubData.id;
    const eventId = event.id;
    // SAF approval is now mandatory for all events
    const requiresSafApproval = true;

    // Presidents must not bypass SAF queue; block if event is already pending_saf
    if (event.status === "pending_saf") {
      notificationManager.show(
        "This event is awaiting SAF review. Presidents cannot approve it.",
        "warning"
      );
      btn.disabled = false;
      btn.innerHTML = originalContent;
      return;
    }

    // Determine next status based on club settings and current event status.
    // - If SAF approval is required and event is pending_president, move to pending_saf.
    // - Otherwise, move directly to approved.
    let nextStatus = "approved";
    if (event.status === "pending_president" && requiresSafApproval) {
      nextStatus = "pending_saf";
    }

    await updateDoc(doc(db, "clubs", clubId, "events", eventId), {
      status: nextStatus,
      approvedAt: serverTimestamp(),
      approvedBy: currentUser.uid,
      approvedByInfo: {
        name: firstName ? `${firstName} ${lastName || ""}`.trim() : "Moderator",
        uid: currentUser.uid,
      },
    });

    const eventTitle = event.title || "Event";
    const message =
      nextStatus === "pending_saf"
        ? `"${eventTitle}" has been approved by the president and is awaiting SAF review.`
        : `"${eventTitle}" has been approved!`;

    notificationManager.show(message, "success");

    if (onEventUpdated) {
      await onEventUpdated();
    }
  } catch (err) {
    logManager.error("[ModerateTab] Approve error:", err);
    notificationManager.show(
      "Failed to approve event. Please try again.",
      "error"
    );
    btn.disabled = false;
    btn.innerHTML = originalContent;
  }
}

/**
 * Show reject modal with required comment (minimum 15 characters)
 */
function showRejectModal(clubId, eventId, eventTitle, onEventUpdated) {
  // Remove existing modal if any
  document.querySelector(".reject-modal-overlay")?.remove();

  // Get president's name for display
  const profile = currentUser.profile?.profile || {};
  const firstName = profile.firstName || "";
  const lastName = profile.lastName || "";
  const presidentName = firstName
    ? `${firstName} ${lastName || ""}`.trim()
    : "President";

  const MIN_REASON_LENGTH = 15;

  const modal = document.createElement("div");
  modal.className = "reject-modal-overlay";
  modal.innerHTML = `
    <div class="reject-modal">
      <div class="reject-modal-header">
        <h3><i class="fas fa-times-circle"></i> Reject Event</h3>
        <button class="modal-close-btn"><i class="fas fa-times"></i></button>
      </div>
      <div class="reject-modal-body">
        <p class="reject-event-title">Rejecting: <strong>${escapeHtml(
          eventTitle
        )}</strong></p>
        <p class="rejector-info">
          <i class="fas fa-user-tie"></i> Rejected by: <strong>${escapeHtml(
            presidentName
          )}</strong>
        </p>
        <div class="form-group">
          <label for="rejectReason">
            <i class="fas fa-comment-alt"></i> Reason (required, minimum ${MIN_REASON_LENGTH} characters)
          </label>
          <textarea 
            id="rejectReason" 
            placeholder="Please explain why this event was not approved..."
            rows="3"
            maxlength="500"
            required
          ></textarea>
          <div class="char-count-container">
            <span class="char-count ${
              MIN_REASON_LENGTH > 0 ? "char-count-warning" : ""
            }">
              <span id="charCount">0</span>/500 (min ${MIN_REASON_LENGTH})
            </span>
          </div>
        </div>
        <p class="reject-hint">
          <i class="fas fa-info-circle"></i>
          The creator will be notified with your reason and can edit and resubmit the event.
        </p>
      </div>
      <div class="reject-modal-footer">
        <button class="btn secondary cancel-reject-btn">Cancel</button>
        <button class="btn danger confirm-reject-btn" disabled>
          <i class="fas fa-times"></i> Reject Event
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Animate in
  requestAnimationFrame(() => {
    modal.classList.add("active");
  });

  // Character count and validation
  const textarea = modal.querySelector("#rejectReason");
  const charCount = modal.querySelector("#charCount");
  const charCountContainer = modal.querySelector(".char-count");
  const confirmBtn = modal.querySelector(".confirm-reject-btn");

  textarea.addEventListener("input", () => {
    const length = textarea.value.length;
    charCount.textContent = length;

    // Update visual feedback
    if (length >= MIN_REASON_LENGTH) {
      charCountContainer.classList.remove("char-count-warning");
      charCountContainer.classList.add("char-count-valid");
      confirmBtn.disabled = false;
    } else {
      charCountContainer.classList.add("char-count-warning");
      charCountContainer.classList.remove("char-count-valid");
      confirmBtn.disabled = true;
    }
  });

  // Close handlers
  const closeModal = () => {
    // Bug #48: Remove escape handler on any close path
    document.removeEventListener("keydown", escHandler);
    modal.classList.remove("active");
    setTimeout(() => modal.remove(), 250);
  };

  modal.querySelector(".modal-close-btn").addEventListener("click", closeModal);
  modal
    .querySelector(".cancel-reject-btn")
    .addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Escape key
  const escHandler = (e) => {
    if (e.key === "Escape") {
      closeModal(); // closeModal now handles removing the listener
    }
  };
  document.addEventListener("keydown", escHandler);

  // Confirm reject
  confirmBtn.addEventListener("click", async () => {
    const reason = textarea.value.trim();

    // Validate minimum length
    if (reason.length < MIN_REASON_LENGTH) {
      notificationManager.show(
        `Rejection reason must be at least ${MIN_REASON_LENGTH} characters.`,
        "warning"
      );
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Rejecting...`;

    try {
      const { db } = await import("../../lib/firebase/firebase-config.js");
      const { doc, updateDoc, serverTimestamp } = await import(
        "firebase/firestore"
      );

      await updateDoc(doc(db, "clubs", clubId, "events", eventId), {
        status: "rejected",
        rejectedAt: serverTimestamp(),
        rejectedBy: currentUser.uid,
        rejectedByInfo: {
          name: presidentName,
          uid: currentUser.uid,
        },
        rejectionReason: reason,
      });

      notificationManager.show(`"${eventTitle}" has been rejected.`, "info");
      closeModal();

      if (onEventUpdated) {
        await onEventUpdated();
      }
    } catch (err) {
      logManager.error("[ModerateTab] Reject error:", err);
      notificationManager.show(
        "Failed to reject event. Please try again.",
        "error"
      );
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `<i class="fas fa-times"></i> Reject Event`;
    }
  });

  // Focus textarea
  textarea.focus();
}

// Helpers
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Helper to escape values for safe use in HTML attributes (src, href, etc.)
function escapeAttr(value) {
  if (value == null) return "";
  const str = String(value);
  const lower = str.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.startsWith("data:text/html")) {
    return "";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(str, len) {
  if (str.length <= len) return str;
  return str.substring(0, len - 3) + "...";
}

function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default { renderModerateTab };
