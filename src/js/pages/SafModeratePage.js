/**
 * SafModeratePage.js - SAF Event Moderation Dashboard
 *
 * Minimal UI for SAF moderators to review and approve events with
 * status "pending_saf" across clubs in their assigned university.
 * Styles are aligned with the Admin dashboard (admin.css).
 */

import app, { db } from "../lib/firebase/firebase-config.js";
import { currentUser } from "../store/userStore.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import { logManager } from "../utils/debug/LogManager.js";

export class SafModeratePage {
  constructor() {
    this.rootEl = null;
    this.moderator = null;
    this.university = null;
    this.pendingEvents = [];
    this._isMounted = false;
  }

  async mount(root) {
    this.rootEl = root;
    this._isMounted = true;

    this.renderLoading();

    try {
      await currentUser.waitForProfile();
      const uid = currentUser.uid;
      if (!uid) {
        this.renderAccessDenied("Not signed in.");
        return;
      }

      const { doc, getDoc, collection, getDocs, query, where } = await import(
        "firebase/firestore"
      );

      // Check SAF moderator record
      const modSnap = await getDoc(doc(db, "safModerators", uid));
      if (!modSnap.exists()) {
        this.renderAccessDenied("You are not a SAF moderator.");
        return;
      }

      this.moderator = { id: modSnap.id, ...modSnap.data() };

      const universityId = this.moderator.universityId || null;
      if (!universityId) {
        this.renderAccessDenied(
          "SAF moderator is not scoped to a university."
        );
        return;
      }

      // Load university metadata (for display only)
      try {
        const uniSnap = await getDoc(doc(db, "universities", universityId));
        if (uniSnap.exists()) {
          this.university = { id: uniSnap.id, ...uniSnap.data() };
        }
      } catch (e) {
        logManager.warn("SafModeratePage: Failed to load university", e);
      }

      // Load clubs in moderator's university
      const clubsQuery = query(
        collection(db, "clubs"),
        where("universityId", "==", universityId)
      );
      const clubsSnap = await getDocs(clubsQuery);
      const clubs = clubsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // For each club, load events pending SAF approval
      const events = [];
      for (const club of clubs) {
        const eventsRef = collection(db, "clubs", club.id, "events");
        const eventsQuery = query(
          eventsRef,
          where("status", "==", "pending_saf")
        );
        const eventsSnap = await getDocs(eventsQuery);
        eventsSnap.forEach((evDoc) => {
          events.push({
            clubId: club.id,
            clubName: club.name || "Unnamed Club",
            clubAccentColor: club.accentColor || "blue",
            university: club.university || "",
            id: evDoc.id,
            ...evDoc.data(),
          });
        });
      }

      this.pendingEvents = events;
      this.render();
    } catch (error) {
      logManager.error("SafModeratePage: mount failed", error);
      this.renderError();
    }
  }

  unmount() {
    this._isMounted = false;
    if (this.rootEl) {
      this.rootEl.innerHTML = "";
    }
  }

  renderLoading() {
    if (!this._isMounted || !this.rootEl) return;
    this.rootEl.innerHTML = `
      <div class="admin-loading">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading SAF dashboard...</span>
      </div>
    `;
  }

  renderAccessDenied(reason) {
    if (!this._isMounted || !this.rootEl) return;
    this.rootEl.innerHTML = `
      <div class="admin-access-denied">
        <div class="denied-icon">
          <i class="fas fa-user-shield"></i>
        </div>
        <h2>Access Denied</h2>
        <p>${escapeHtml(reason || "You do not have access to this dashboard.")}</p>
        <a href="#home" class="btn-primary">
          <i class="fas fa-home"></i> Return Home
        </a>
      </div>
    `;
  }

  renderError() {
    if (!this._isMounted || !this.rootEl) return;
    this.rootEl.innerHTML = `
      <div class="admin-access-denied">
        <div class="denied-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h2>Something went wrong</h2>
        <p>Failed to load SAF dashboard. Please try again later.</p>
        <a href="#home" class="btn-primary">
          <i class="fas fa-home"></i> Return Home
        </a>
      </div>
    `;
  }

  renderEmpty() {
    return `
      <div class="admin-loading">
        <i class="fas fa-check-circle"></i>
        <span>All caught up! No events need SAF approval.</span>
      </div>
    `;
  }

  render() {
    if (!this._isMounted || !this.rootEl) return;

    const uniName =
      this.university?.name ||
      this.university?.id ||
      this.moderator?.universityId ||
      "your university";

    const eventsHtml =
      this.pendingEvents.length === 0
        ? this.renderEmpty()
        : `
      <div class="saf-events-list">
        ${this.pendingEvents
          .map((e) => this.renderEventCard(e))
          .join("")}
      </div>
    `;

    this.rootEl.innerHTML = `
      <div class="admin-saf">
        <div class="section-header">
          <h2><i class="fas fa-user-shield"></i> SAF Event Moderation</h2>
          <p class="section-subtitle">
            Review events awaiting SAF approval for <strong>${escapeHtml(
              uniName
            )}</strong>
          </p>
        </div>
        ${eventsHtml}
      </div>
    `;

    this.bindEventHandlers();
  }

  renderEventCard(event) {
    const title = escapeHtml(event.title || "Untitled Event");
    const clubName = escapeHtml(event.clubName || "Club");
    const location = escapeHtml(event.location || "TBA");
    const description = escapeHtml(event.description || "");

    const firstSlot = Array.isArray(event.timeSlots)
      ? event.timeSlots[0]
      : null;
    let when = "Date TBA";
    let timeRange = "";
    if (firstSlot?.date && firstSlot?.startTime) {
      const date = new Date(`${firstSlot.date}T${firstSlot.startTime}`);
      when = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      if (firstSlot.endTime) {
        timeRange = `${firstSlot.startTime} - ${firstSlot.endTime}`;
      } else {
        timeRange = firstSlot.startTime;
      }
    }

    const createdBy =
      event.createdByInfo?.name || event.createdBy || "Unknown";

    return `
      <div class="glass-card saf-event-card" data-club-id="${
        event.clubId
      }" data-event-id="${event.id}">
        <div class="saf-event-header">
          <div class="saf-event-club">
            <span class="saf-club-name">${clubName}</span>
            <span class="saf-event-university">${escapeHtml(
              event.university || ""
            )}</span>
          </div>
          <span class="saf-badge">
            <i class="fas fa-clipboard-check"></i> Pending SAF
          </span>
        </div>
        <h3 class="saf-event-title">${title}</h3>
        <div class="saf-event-meta">
          <span><i class="fas fa-calendar"></i> ${when}</span>
          ${
            timeRange
              ? `<span><i class="fas fa-clock"></i> ${timeRange}</span>`
              : ""
          }
          <span><i class="fas fa-map-marker-alt"></i> ${location}</span>
        </div>
        ${
          description
            ? `<p class="saf-event-description">${description}</p>`
            : ""
        }
        <div class="saf-event-footer">
          <span class="saf-event-creator">
            <i class="fas fa-user"></i> ${escapeHtml(createdBy)}
          </span>
          <div class="saf-event-actions">
            <button class="btn primary saf-approve-btn">
              <i class="fas fa-check"></i> Approve
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindEventHandlers() {
    if (!this._isMounted || !this.rootEl) return;

    this.rootEl.querySelectorAll(".saf-approve-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.currentTarget.closest(".saf-event-card");
        if (!card) return;
        const clubId = card.getAttribute("data-club-id");
        const eventId = card.getAttribute("data-event-id");
        if (clubId && eventId) {
          this.handleApprove(card, clubId, eventId);
        }
      });
    });
  }

  async handleApprove(cardEl, clubId, eventId) {
    const btn = cardEl.querySelector(".saf-approve-btn");
    if (!btn) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Approving...`;

    try {
      const { getFunctions, httpsCallable, connectFunctionsEmulator } =
        await import("firebase/functions");

      const functions = getFunctions(app, "us-central1");
      const isLocal =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");
      if (isLocal) {
        try {
          connectFunctionsEmulator(functions, "localhost", 5001);
        } catch (_) {
          // Already connected / emulator not running – non-fatal
        }
      }

      const callable = httpsCallable(functions, "approveClubEventSaf");
      await callable({ clubId, eventId });

      // Remove from local list and re-render
      this.pendingEvents = this.pendingEvents.filter(
        (e) => !(e.clubId === clubId && e.id === eventId)
      );
      this.render();

      notificationManager.show("Event approved successfully.", "success");
    } catch (error) {
      logManager.error("SafModeratePage: approve failed", error);
      notificationManager.show(
        "Failed to approve event. Please try again.",
        "error"
      );
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// Helper to escape HTML entities
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default SafModeratePage;

// Wire SafModeratePage to SPA router lifecycle
let _safPageInstance = null;

document.addEventListener("spa:page:unload", (event) => {
  const route = event?.detail?.route;
  if (route === "saf" && _safPageInstance) {
    _safPageInstance.unmount();
    _safPageInstance = null;
  }
});

document.addEventListener("spa:page:load", async (event) => {
  const route = event?.detail?.route;
  if (route !== "saf") return;

  const root =
    document.querySelector("#saf-root") ||
    document.querySelector(".main-content");
  if (!root) {
    logManager.error("SafModeratePage: root element not found");
    return;
  }

  _safPageInstance = new SafModeratePage();
  await _safPageInstance.mount(root);
});

