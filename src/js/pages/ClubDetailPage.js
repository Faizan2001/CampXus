import { logManager } from "../utils/debug/LogManager.js";
import { currentUser } from "../store/userStore.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import {
  showCreateEventModal,
  showEditEventModal,
} from "../components/clubs/CreateEventModal.js";
import { showEventDetailModal } from "../components/clubs/EventDetailModal.js";
import { renderMembersTab } from "../components/clubs/MembersTab.js";
import { renderModerateTab } from "../components/clubs/ModerateTab.js";

export default class ClubDetailPage {
  constructor() {
    this.container = null;
    this.clubId = null;
    this.clubData = null;
    this.isFollowing = false;
    this.events = [];
    this.members = [];
    this.activeTab = "events";
    this.initialEventId = null;
  }

  async mount() {
    this.container =
      document.querySelector("#club-root") ||
      document.querySelector(".main-content");

    // Parse club id (and optional eventId) from location hash: #club?id=XYZ&eventId=ABC
    const raw = String(window.location.hash || "").replace(/^#/, "");
    const qs = raw.split("?")[1] || "";
    const params = new URLSearchParams(qs);
    this.clubId = params.get("id");
    this.initialEventId = params.get("eventId");

    if (!this.clubId) {
      this.container.innerHTML = `
        <section class="club-detail">
          <div class="club-error">
            <i class="fas fa-exclamation-circle"></i>
            <p>No club selected. Use <code>#club?id=&lt;clubId&gt;</code> in the URL.</p>
            <a href="#clubs" class="btn primary"><i class="fas fa-arrow-left"></i> Back to Clubs</a>
          </div>
        </section>
      `;
      return;
    }

    this.container.innerHTML = `
      <section class="club-detail">
        <div class="club-loading">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading club...</p>
        </div>
      </section>
    `;

    try {
      await currentUser.waitForProfile();
    } catch (_) {}

    // Check if user follows this club (from profile.followedClubs)
    const followedFromProfile = currentUser?.profile?.followedClubs || [];
    this.isFollowing = Array.isArray(followedFromProfile)
      ? followedFromProfile.includes(this.clubId)
      : false;

    try {
      const { db } = await import("../lib/firebase/firebase-config.js");
      const { doc, getDoc } = await import("firebase/firestore");
      const docRef = doc(db, "clubs", this.clubId);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        this.container.innerHTML = `
	          <section class="club-detail">
	            <div class="club-error">
	              <i class="fas fa-search"></i>
	              <p>Club not found.</p>
	              <a href="#clubs" class="btn primary"><i class="fas fa-arrow-left"></i> Back to Clubs</a>
	            </div>
	          </section>
	        `;
        return;
      }

      this.clubData = { id: snap.id, ...snap.data() };

      // Fetch events for this club
      await this.loadEvents();

      // Load members
      this.members = this.clubData.members || [];

      this.renderClub();

      // If a specific event was requested via URL (from Mother Card),
      // auto-open its detail modal after events are loaded, but apply
      // the same visibility rules as the Events tab to avoid leaking
      // pending/rejected events to regular users.
      if (this.initialEventId) {
        const isPresident =
          (this.clubData?.devTest &&
            this.clubData?.devOwnerUid === currentUser?.uid) ||
          this.clubData?.presidentId === currentUser?.uid ||
          this.clubData?.createdBy === currentUser?.uid;

        const isOfficial =
          this.clubData?.officialIds?.includes(currentUser?.uid) ||
          (this.members || []).some(
            (m) => m.uid === currentUser?.uid && m.role === "official"
          );

        const isModeratorView = isPresident || isOfficial;

        const targetEvent = this.events.find(
          (e) => e.id === this.initialEventId
        );

        if (targetEvent) {
          if (isModeratorView || targetEvent.status === "approved") {
            this.openEventDetailModal(targetEvent);
          } else {
            notificationManager.show(
              "This event is not available.",
              "warning"
            );
          }
        }
      }
    } catch (err) {
      logManager.error("[ClubDetailPage] load error:", err);
      this.container.innerHTML = `
        <section class="club-detail">
          <div class="club-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Failed to load club. Check your connection.</p>
            <a href="#clubs" class="btn primary"><i class="fas fa-arrow-left"></i> Back to Clubs</a>
          </div>
        </section>
      `;
    }
  }

  renderClub() {
    const c = this.clubData;
    const accentColor = c.accentColor || "blue";

    // Check if user can moderate (president or creator).
    // For devTest clubs only, devOwnerUid is treated as president (must match firestore.rules).
    const canModerate =
      (c.devTest && c.devOwnerUid === currentUser?.uid) ||
      c.presidentId === currentUser?.uid ||
      c.createdBy === currentUser?.uid;

    // Count pending events for badge
    const pendingCount = this.events.filter(
      (e) => e.status === "pending_president" || e.status === "pending_saf"
    ).length;

    this.container.innerHTML = `
      <section class="club-detail" data-accent="${accentColor}">
        <div class="club-detail-header">
          <a href="#clubs" class="back-link"><i class="fas fa-arrow-left"></i> Back</a>
        </div>
        
        <div class="club-hero">
          ${
            c.bannerUrl
              ? `<img src="${c.bannerUrl}" alt="Banner" class="club-banner" />`
              : `<div class="club-banner-placeholder"></div>`
          }
          <div class="club-hero-content">
            <div class="club-logo-large">
              ${
                c.logoUrl
                  ? `<img src="${c.logoUrl}" alt="${escapeHtml(c.name)}" />`
                  : `<i class="fas fa-flag"></i>`
              }
            </div>
            <div class="club-hero-info">
              <h1>${escapeHtml(c.name || "Untitled Club")}</h1>
              <span class="club-university-badge"><i class="fas fa-university"></i> ${escapeHtml(
                c.university || ""
              )}</span>
            </div>
            <div class="club-hero-stats">
              <div class="hero-stat">
                <span class="hero-stat-value" id="followerCount">${
                  c.followerCount || 0
                }</span>
                <span class="hero-stat-label">Followers</span>
              </div>
              <div class="hero-stat">
                <span class="hero-stat-value">${c.memberCount || 0}</span>
                <span class="hero-stat-label">Members</span>
              </div>
              <div class="hero-stat">
                <span class="hero-stat-value">${c.eventsThisWeek || 0}</span>
                <span class="hero-stat-label">Events</span>
              </div>
            </div>
          </div>
        </div>

        <div class="club-body">
          <div class="club-actions-bar">
            <button id="followBtn" class="btn ${
              this.isFollowing ? "secondary" : "primary"
            } large">
              <i class="fas ${this.isFollowing ? "fa-check" : "fa-plus"}"></i>
              ${this.isFollowing ? "Following" : "Follow"}
            </button>
          </div>

          <div class="club-description-section">
            <h2>About</h2>
            <p>${escapeHtml(c.description || "No description available.")}</p>
          </div>

          <div class="club-tabs">
            <button class="tab-btn active" data-tab="events"><i class="fas fa-calendar"></i> Events</button>
            <button class="tab-btn" data-tab="members"><i class="fas fa-users"></i> Members</button>
            ${
              canModerate
                ? `
              <button class="tab-btn moderate-tab-btn" data-tab="moderate">
                <i class="fas fa-shield-alt"></i> Moderate
                ${
                  pendingCount > 0
                    ? `<span class="tab-badge">${pendingCount}</span>`
                    : ""
                }
              </button>
            `
                : ""
            }
          </div>

          <div class="club-tab-content" id="tabContent">
            <!-- Events will be rendered here -->
          </div>
        </div>
      </section>
    `;

    // Bind follow button
    this.container
      .querySelector("#followBtn")
      ?.addEventListener("click", () => this.handleFollow());

    // Bind tab buttons
    this.container.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) =>
        this.switchTab(e.currentTarget.dataset.tab)
      );
    });

    // Render the active tab content
    this.renderEventsTab(this.container.querySelector("#tabContent"));
  }

  switchTab(tab) {
    this.activeTab = tab;

    // Update active tab button
    this.container.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    const content = this.container.querySelector("#tabContent");

    if (tab === "events") {
      this.renderEventsTab(content);
    } else if (tab === "members") {
      this.renderMembersTabContent(content);
    } else if (tab === "moderate") {
      this.renderModerateTabContent(content);
    }
  }

  /**
   * Render the Members tab using the MembersTab component
   */
  renderMembersTabContent(container) {
    renderMembersTab(container, this.clubData, this.members, async () => {
      // Callback when member role changes - reload club data
      await this.reloadClubData();
      this.members = this.clubData.members || [];
      this.renderMembersTabContent(container);
    });
  }

  /**
   * Render the Moderate tab using the ModerateTab component
   */
  renderModerateTabContent(container) {
    renderModerateTab(container, this.clubData, this.events, async () => {
      // Callback when event is approved/rejected - reload events
      await this.loadEvents();
      this.renderModerateTabContent(container);
      // Also update pending count badge
      this.updatePendingBadge();
    });
  }

  /**
   * Update the pending count badge on the Moderate tab
   */
  updatePendingBadge() {
    const pendingCount = this.events.filter(
      (e) => e.status === "pending_president" || e.status === "pending_saf"
    ).length;

    const badge = this.container.querySelector(".moderate-tab-btn .tab-badge");
    if (badge) {
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    } else if (pendingCount > 0) {
      // Add badge if it doesn't exist
      const moderateBtn = this.container.querySelector(".moderate-tab-btn");
      if (moderateBtn) {
        const newBadge = document.createElement("span");
        newBadge.className = "tab-badge";
        newBadge.textContent = pendingCount;
        moderateBtn.appendChild(newBadge);
      }
    }
  }

  /**
   * Reload club data from Firestore
   */
  async reloadClubData() {
    try {
      const { db } = await import("../lib/firebase/firebase-config.js");
      const { doc, getDoc } = await import("firebase/firestore");
      const docRef = doc(db, "clubs", this.clubId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        this.clubData = { id: snap.id, ...snap.data() };
      }
    } catch (err) {
      logManager.error("[ClubDetailPage] Failed to reload club data:", err);
    }
  }

  async loadEvents() {
    try {
      const { db } = await import("../lib/firebase/firebase-config.js");
      const { collection, query, orderBy, where, getDocs } = await import(
        "firebase/firestore"
      );

      // Determine viewer role for query scoping:
      // - Presidents/dev owners can see all events
      // - Officials (in officialIds) can see all events
      // - Regular users should only ever query approved events
      const isPresident =
        (this.clubData?.devTest &&
          this.clubData?.devOwnerUid === currentUser?.uid) ||
        this.clubData?.presidentId === currentUser?.uid ||
        this.clubData?.createdBy === currentUser?.uid;

      const isOfficial = Array.isArray(this.clubData?.officialIds)
        ? this.clubData.officialIds.includes(currentUser?.uid)
        : false;

      const eventsRef = collection(db, "clubs", this.clubId, "events");
      const q =
        isPresident || isOfficial
          ? query(eventsRef, orderBy("firstSlotStart", "asc"))
          : query(
              eventsRef,
              where("status", "==", "approved"),
              orderBy("firstSlotStart", "asc")
            );
      const snapshot = await getDocs(q);

      this.events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      logManager.debug(`[ClubDetailPage] Loaded ${this.events.length} events`);
    } catch (err) {
      logManager.error("[ClubDetailPage] Failed to load events:", err);
      this.events = [];
    }
  }

  renderEventsTab(container) {
    const now = new Date();

    // Determine viewer role
    const isPresident =
      (this.clubData?.devTest &&
        this.clubData?.devOwnerUid === currentUser?.uid) ||
      this.clubData?.presidentId === currentUser?.uid ||
      this.clubData?.createdBy === currentUser?.uid;

    const isOfficial =
      this.clubData?.officialIds?.includes(currentUser?.uid) ||
      (this.members || []).some(
        (m) => m.uid === currentUser?.uid && m.role === "official"
      );

    // For regular visitors, only show approved events.
    // Presidents/officials can see all events (including pending/rejected).
    const isModeratorView = isPresident || isOfficial;
    const visibleEvents = isModeratorView
      ? this.events
      : this.events.filter((e) => e.status === "approved");

    // Separate into upcoming/live and past events (based on visibleEvents)
    // An event is "upcoming" if:
    // 1. It hasn't started yet (firstSlotStart >= now), OR
    // 2. It's currently live (isLive flag), OR
    // 3. It's still ongoing (lastSlotEnd >= now)
    const upcoming = [];
    const past = [];

    for (const event of visibleEvents) {
      const startDate =
        event.firstSlotStart?.toDate?.() || new Date(event.firstSlotStart);
      const endDate =
        event.lastSlotEnd?.toDate?.() ||
        (event.lastSlotEnd ? new Date(event.lastSlotEnd) : startDate);

      // Keep in upcoming if: not started yet, OR still ongoing, OR marked live
      const isUpcoming =
        startDate >= now || endDate >= now || event.isLive === true;

      if (isUpcoming) {
        upcoming.push(event);
      } else {
        past.push(event);
      }
    }

    // Check if user can create events
    // - President, devOwner, or creator can create (and auto-approve)
    // - Officials can create but their events need approval
    const canCreate = isModeratorView;

    if (visibleEvents.length === 0) {
      container.innerHTML = `
        <div class="events-placeholder">
          <i class="fas fa-calendar-alt"></i>
          <p>No events yet.</p>
          <p class="hint">Events will appear here when officials create them.</p>
          ${
            canCreate
              ? `<button class="btn primary" id="createEventBtn"><i class="fas fa-plus"></i> Create Event</button>`
              : ""
          }
        </div>
      `;

      if (canCreate) {
        container
          .querySelector("#createEventBtn")
          ?.addEventListener("click", () => this.openCreateEventModal());
      }
      return;
    }

    let html = "";

    // Create event button for authorized users
    if (canCreate) {
      html += `
        <div class="events-controls">
          <button class="btn primary" id="createEventBtn"><i class="fas fa-plus"></i> Create Event</button>
        </div>
      `;
    }

    // Upcoming events section
    if (upcoming.length > 0) {
      html += `<div class="events-section">
        <h3 class="events-section-title"><i class="fas fa-clock"></i> Upcoming</h3>
        <div class="events-list">
          ${upcoming.map((e) => this.renderEventCard(e)).join("")}
        </div>
      </div>`;
    }

    // Past events section (collapsed by default)
    if (past.length > 0) {
      html += `<div class="events-section past-events">
        <button class="events-section-toggle" id="togglePast">
          <i class="fas fa-history"></i> Past Events (${past.length})
          <i class="fas fa-chevron-down toggle-icon"></i>
        </button>
        <div class="events-list past-events-list" style="display: none;">
          ${past.map((e) => this.renderEventCard(e, true)).join("")}
        </div>
      </div>`;
    }

    // Show message if no upcoming events
    if (upcoming.length === 0 && past.length > 0) {
      html =
        `
        <div class="events-placeholder" style="padding: 1.5rem;">
          <p>No upcoming events. Check back soon!</p>
        </div>
      ` + html;
    }

    container.innerHTML = html;

    // Bind toggle for past events
    container.querySelector("#togglePast")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const list = container.querySelector(".past-events-list");
      const icon = btn.querySelector(".toggle-icon");

      if (list.style.display === "none") {
        list.style.display = "block";
        icon.classList.replace("fa-chevron-down", "fa-chevron-up");
      } else {
        list.style.display = "none";
        icon.classList.replace("fa-chevron-up", "fa-chevron-down");
      }
    });

    // Bind create event button
    if (canCreate) {
      container
        .querySelector("#createEventBtn")
        ?.addEventListener("click", () => this.openCreateEventModal());
    }

    // Bind click on event cards to show detail modal
    container.querySelectorAll(".event-card").forEach((card) => {
      card.addEventListener("click", () => {
        const eventId = card.dataset.eventId;
        const event = visibleEvents.find((e) => e.id === eventId);
        if (event) {
          this.openEventDetailModal(event);
        }
      });
    });
  }

  /**
   * Open the Create Event modal
   */
  openCreateEventModal() {
    showCreateEventModal({
      clubId: this.clubId,
      clubName: this.clubData?.name,
      clubData: this.clubData, // Pass club data for role checking
      onSuccess: async () => {
        // Reload events and re-render
        await this.loadEvents();
        this.renderEventsTab(this.container.querySelector("#tabContent"));
        // Update pending badge in case it changed
        this.updatePendingBadge();
      },
    });
  }

  /**
   * Open the Event Detail modal
   */
  openEventDetailModal(event) {
    showEventDetailModal({
      event,
      clubData: this.clubData,
      onEdit: (evt) => {
        // Open the edit modal with pre-filled data
        this.openEditEventModal(evt);
      },
      onDelete: async (eventId) => {
        // Reload events after deletion
        await this.loadEvents();
        this.renderEventsTab(this.container.querySelector("#tabContent"));
        // Pending count may have changed
        this.updatePendingBadge();
      },
      onLiveStatusChange: async (updatedEvent) => {
        // Reload events after live status change
        await this.loadEvents();
        this.renderEventsTab(this.container.querySelector("#tabContent"));
        // Pending count may have changed due to status transition
        this.updatePendingBadge();
      },
    });
  }

  /**
   * Open the Edit Event modal
   */
  openEditEventModal(event) {
    showEditEventModal({
      clubId: this.clubId,
      clubName: this.clubData?.name,
      clubData: this.clubData, // Pass club data for role checking
      event: event, // Pass the event data to pre-fill the form
      onSuccess: async () => {
        // Reload events and re-render
        await this.loadEvents();
        this.renderEventsTab(this.container.querySelector("#tabContent"));
        // Editing can change pending/rejected → pending_president, so refresh badge
        this.updatePendingBadge();
      },
    });
  }

  renderEventCard(event, isPast = false) {
    const title = escapeHtml(event.title || "Untitled Event");
    const location = escapeHtml(event.location || "TBA");
    const description = escapeHtml(event.description || "");

    // Format date/time from first time slot
    let dateStr = "Date TBA";
    let timeStr = "";
    let multiDayBadge = "";

    if (event.timeSlots && event.timeSlots.length > 0) {
      const slot = event.timeSlots[0];
      const date = new Date(slot.date + "T" + slot.startTime);
      dateStr = date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      timeStr = `${slot.startTime} - ${slot.endTime}`;

      // Multi-day badge
      if (event.timeSlots.length > 1) {
        multiDayBadge = `<span class="event-multi-day-badge"><i class="fas fa-layer-group"></i> ${event.timeSlots.length}-day event</span>`;
      }
    }

    // Status badge
    let statusBadge = "";
    if (
      event.status === "pending_president" ||
      event.status === "pending_saf"
    ) {
      statusBadge = `<span class="event-status pending"><i class="fas fa-clock"></i> Pending</span>`;
    } else if (event.isLive) {
      statusBadge = `<span class="event-status live"><i class="fas fa-circle"></i> LIVE</span>`;
    }

    const hasImage = !!event.imageUrl;
    const isLive = event.isLive === true;

    return `
      <div class="event-card ${isPast ? "past" : ""} ${
      hasImage ? "has-image" : ""
    } ${isLive ? "live-event" : ""}" data-event-id="${event.id}">
        ${
          isLive
            ? `<div class="event-live-badge"><i class="fas fa-broadcast-tower"></i> LIVE NOW</div>`
            : ""
        }
        ${
          hasImage
            ? `<div class="event-image-container"><img src="${event.imageUrl}" alt="${title}" class="event-image" loading="lazy" /></div>`
            : ""
        }
        <div class="event-card-content">
          <div class="event-header">
            <h4 class="event-title">${title}</h4>
            <div class="event-badges">
              ${multiDayBadge}
              ${statusBadge}
            </div>
          </div>
          <div class="event-meta">
            <span class="event-date"><i class="fas fa-calendar"></i> ${dateStr}</span>
            ${
              timeStr
                ? `<span class="event-time"><i class="fas fa-clock"></i> ${timeStr}</span>`
                : ""
            }
          </div>
          <div class="event-location"><i class="fas fa-map-marker-alt"></i> ${location}</div>
          ${
            description ? `<p class="event-description">${description}</p>` : ""
          }
        </div>
      </div>
    `;
  }

  async handleFollow() {
    if (!currentUser?.uid || !this.clubId) return;

    const btn = this.container.querySelector("#followBtn");
    const wasFollowing = this.isFollowing;

    // Optimistic update
    this.isFollowing = !wasFollowing;
    btn.innerHTML = `<i class="fas ${
      this.isFollowing ? "fa-check" : "fa-plus"
    }"></i> ${this.isFollowing ? "Following" : "Follow"}`;
    btn.classList.toggle("primary", !this.isFollowing);
    btn.classList.toggle("secondary", this.isFollowing);

    try {
      const { db } = await import("../lib/firebase/firebase-config.js");
      const { doc, updateDoc, arrayUnion, arrayRemove } = await import(
        "firebase/firestore"
      );

      // Update user's followedClubs in Firestore
      await updateDoc(doc(db, "users", currentUser.uid), {
        followedClubs: wasFollowing
          ? arrayRemove(this.clubId)
          : arrayUnion(this.clubId),
      });

      // Keep currentUser.profile.followedClubs in sync for this session
      const existingProfile = currentUser.profile || {};
      const existingFollowed = Array.isArray(existingProfile.followedClubs)
        ? existingProfile.followedClubs
        : [];
      const updatedFollowed = wasFollowing
        ? existingFollowed.filter((id) => id !== this.clubId)
        : Array.from(new Set([...existingFollowed, this.clubId]));

      if (typeof currentUser.setProfile === "function") {
        currentUser.setProfile({
          ...existingProfile,
          followedClubs: updatedFollowed,
        });
      }

      // Update displayed count
      if (this.clubData) {
        // Optimistically adjust follower count locally;
        // actual persistent value is managed by Cloud Functions.
        this.clubData.followerCount =
          (this.clubData.followerCount || 0) + (wasFollowing ? -1 : 1);
        const countEl = this.container.querySelector("#followerCount");
        if (countEl) countEl.textContent = this.clubData.followerCount;
      }

      notificationManager.show(
        wasFollowing ? "Unfollowed club" : "Now following this club!",
        wasFollowing ? "info" : "success"
      );
    } catch (err) {
      logManager.error("[ClubDetailPage] Follow error:", err);
      // Rollback
      this.isFollowing = wasFollowing;
      btn.innerHTML = `<i class="fas ${
        this.isFollowing ? "fa-check" : "fa-plus"
      }"></i> ${this.isFollowing ? "Following" : "Follow"}`;
      btn.classList.toggle("primary", !this.isFollowing);
      btn.classList.toggle("secondary", this.isFollowing);
      notificationManager.show("Failed to update follow status", "error");
    }
  }

  destroy() {
    // cleanup if needed
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Wire to SPA lifecycle
let currentClubInstance = null;
document.addEventListener("spa:page:unload", () => {
  if (currentClubInstance) {
    currentClubInstance.destroy();
    currentClubInstance = null;
  }
});

document.addEventListener("spa:page:load", async (event) => {
  const route = event?.detail?.route;
  if (route !== "club") return;
  currentClubInstance = new ClubDetailPage();
  await currentClubInstance.mount();
});
