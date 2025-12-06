/**
 * SafModeratePage.js - SAF Moderator Dashboard
 *
 * Full-featured dashboard for SAF moderators with:
 *   - Event moderation (approve/reject pending_saf events)
 *   - Club management (create, edit, delete clubs in their university)
 *   - President assignment (assign/change club presidents)
 *
 * Scoped to the moderator's assigned university.
 * Uses same styling as Admin dashboard (admin.css).
 */

import app, { db } from "../lib/firebase/firebase-config.js";
import { currentUser } from "../store/userStore.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import { logManager } from "../utils/debug/LogManager.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { renderUserSearchAssign } from "../components/shared/UserSearchAssign.js";
import {
  uploadClubLogo,
  uploadClubBanner,
} from "../services/clubs/ClubImageService.js";
import { ClubCreatorModal } from "../components/clubs/ClubCreatorModal.js";
import { deleteClub as adminDeleteClub } from "../services/admin/AdminService.js";

export class SafModeratePage {
  constructor() {
    this.rootEl = null;
    this.moderator = null;
    this.university = null;
    this.universityId = null;
    this.pendingEvents = [];
    this.clubs = [];
    this.activeTab = "events";
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

      // Check SAF moderator record
      const modSnap = await getDoc(doc(db, "safModerators", uid));
      if (!modSnap.exists()) {
        this.renderAccessDenied("You are not a SAF moderator.");
        return;
      }

      this.moderator = { id: modSnap.id, ...modSnap.data() };
      this.universityId = this.moderator.universityId || null;

      if (!this.universityId) {
        this.renderAccessDenied("SAF moderator is not scoped to a university.");
        return;
      }

      // Load university metadata
      try {
        const uniSnap = await getDoc(
          doc(db, "universities", this.universityId)
        );
        if (uniSnap.exists()) {
          this.university = { id: uniSnap.id, ...uniSnap.data() };
        }
      } catch (e) {
        logManager.warn("SafModeratePage: Failed to load university", e);
      }

      // Render the dashboard
      this.renderDashboard();

      // Load initial tab content
      await this.loadTabContent(this.activeTab);
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

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Fetch clubs that belong to this moderator's university.
   * Queries by universityId, universityCode, and university fields
   * for backwards compatibility with legacy clubs.
   *
   * Note: Backend Cloud Functions use universityId || universityCode only.
   * This client-side query also checks `university` field to catch any legacy
   * clubs that may have been created before universityId was standardized.
   */
  async fetchClubsForUniversity() {
    const allClubs = [];
    const seenIds = new Set();

    // Query 1: universityId (preferred field)
    try {
      const q1 = query(
        collection(db, "clubs"),
        where("universityId", "==", this.universityId)
      );
      const snap1 = await getDocs(q1);
      snap1.forEach((d) => {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          allClubs.push({ id: d.id, ...d.data() });
        }
      });
    } catch (e) {
      logManager.warn("SafModeratePage: Query by universityId failed", e);
    }

    // Query 2: universityCode (legacy field)
    try {
      const q2 = query(
        collection(db, "clubs"),
        where("universityCode", "==", this.universityId)
      );
      const snap2 = await getDocs(q2);
      snap2.forEach((d) => {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          allClubs.push({ id: d.id, ...d.data() });
        }
      });
    } catch (e) {
      logManager.warn("SafModeratePage: Query by universityCode failed", e);
    }

    // Query 3: university (legacy field)
    try {
      const q3 = query(
        collection(db, "clubs"),
        where("university", "==", this.universityId)
      );
      const snap3 = await getDocs(q3);
      snap3.forEach((d) => {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          allClubs.push({ id: d.id, ...d.data() });
        }
      });
    } catch (e) {
      logManager.warn("SafModeratePage: Query by university failed", e);
    }

    return allClubs;
  }

  // ==========================================
  // RENDER METHODS
  // ==========================================

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
        <p>${escapeHtml(
          reason || "You do not have access to this dashboard."
        )}</p>
        <a href="#clubs" class="btn-primary">
          <i class="fas fa-flag"></i> Back to Clubs
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
        <a href="#clubs" class="btn-primary">
          <i class="fas fa-flag"></i> Back to Clubs
        </a>
      </div>
    `;
  }

  renderDashboard() {
    if (!this._isMounted || !this.rootEl) return;

    const uniName =
      this.university?.name ||
      this.university?.id ||
      this.universityId ||
      "Your University";

    this.rootEl.innerHTML = `
      <div class="admin-page admin-saf">
        <div class="admin-dashboard">
          <!-- Header -->
          <div class="admin-header">
            <!-- Back button for mobile (visible when top-nav is hidden) -->
            <a href="#clubs" class="admin-back-btn" aria-label="Back to Clubs">
              <i class="fas fa-arrow-left"></i>
            </a>
            <div class="admin-title">
              <i class="fas fa-user-shield"></i>
              <div>
                <h1>SAF Dashboard</h1>
                <p class="saf-university-label">${escapeHtml(uniName)}</p>
              </div>
            </div>
            <div class="admin-user">
              <span class="admin-badge saf-badge">
                <i class="fas fa-shield-alt"></i> SAF Moderator
              </span>
            </div>
          </div>

          <!-- Connected Tabs + Content Container -->
          <div class="admin-tabs-container">
            <!-- Tab Navigation - Pill Style -->
            <div class="admin-tabs" data-active-tab="${this.activeTab}">
              <button class="admin-tab ${
                this.activeTab === "events" ? "active" : ""
              }" data-tab="events">
                <i class="fas fa-clipboard-check"></i>
                <span>Pending Events</span>
              </button>
              <button class="admin-tab ${
                this.activeTab === "clubs" ? "active" : ""
              }" data-tab="clubs">
                <i class="fas fa-users"></i>
                <span>Manage Clubs</span>
              </button>
            </div>

            <!-- Content Area -->
            <div class="admin-content" id="saf-tab-content">
              <div class="admin-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Loading...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup tab handlers
    this.rootEl.querySelectorAll(".admin-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.dataset.tab;
        if (tabName && tabName !== this.activeTab) {
          this.activeTab = tabName;
          // Update data attribute for CSS sliding pill
          const tabsContainer = this.rootEl.querySelector(".admin-tabs");
          if (tabsContainer) {
            tabsContainer.dataset.activeTab = tabName;
          }
          this.rootEl.querySelectorAll(".admin-tab").forEach((t) => {
            t.classList.toggle("active", t.dataset.tab === tabName);
          });
          this.loadTabContent(tabName);
        }
      });
    });
  }

  async loadTabContent(tabName) {
    const contentEl = this.rootEl?.querySelector("#saf-tab-content");
    if (!contentEl) return;

    contentEl.innerHTML = `
      <div class="admin-loading">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading...</span>
      </div>
    `;

    try {
      switch (tabName) {
        case "events":
          await this.loadEventsTab(contentEl);
          break;
        case "clubs":
          await this.loadClubsTab(contentEl);
          break;
        default:
          contentEl.innerHTML = `<p>Unknown tab</p>`;
      }
    } catch (error) {
      logManager.error(`SafModeratePage: Failed to load ${tabName} tab`, error);
      contentEl.innerHTML = `
        <div class="admin-error">
          <i class="fas fa-exclamation-circle"></i>
          <p>Failed to load content. Please try again.</p>
          <button class="btn-retry" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }

  // ==========================================
  // EVENTS TAB
  // ==========================================

  async loadEventsTab(contentEl) {
    // Fetch clubs in this university
    // Query by multiple fields for backwards compatibility with legacy clubs
    // that may have universityCode or university instead of universityId
    const clubs = await this.fetchClubsForUniversity();

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

    if (events.length === 0) {
      contentEl.innerHTML = `
        <div class="section-header">
          <h2><i class="fas fa-clipboard-check"></i> Pending SAF Approval</h2>
        </div>
        <div class="admin-loading">
          <i class="fas fa-check-circle" style="color: var(--success);"></i>
          <span>All caught up! No events need SAF approval.</span>
        </div>
      `;
      return;
    }

    contentEl.innerHTML = `
      <div class="section-header">
        <h2><i class="fas fa-clipboard-check"></i> Pending SAF Approval</h2>
        <span class="pending-count">${events.length} event${
      events.length !== 1 ? "s" : ""
    }</span>
      </div>
      <div class="saf-events-list">
        ${events.map((e) => this.renderEventCard(e)).join("")}
      </div>
    `;

    this.bindEventHandlers(contentEl);
  }

  renderEventCard(event) {
    const title = escapeHtml(event.title || "Untitled Event");
    const clubName = escapeHtml(event.clubName || "Club");
    const location = escapeHtml(event.location || "TBA");
    const description = escapeHtml(event.description || "").substring(0, 150);

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

    // Handle createdByInfo with firstName/lastName or name
    const creatorInfo = event.createdByInfo || {};
    const createdBy =
      creatorInfo.firstName && creatorInfo.lastName
        ? `${creatorInfo.firstName} ${creatorInfo.lastName}`
        : creatorInfo.name ||
          creatorInfo.displayName ||
          event.createdBy ||
          "Unknown";

    return `
      <div class="glass-card saf-event-card" data-club-id="${
        event.clubId
      }" data-event-id="${event.id}">
        <div class="saf-event-header">
          <div class="saf-event-club">
            <span class="saf-club-name">${clubName}</span>
          </div>
          <span class="saf-badge">
            <i class="fas fa-clock"></i> Pending SAF
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
            ? `<p class="saf-event-description">${description}${
                event.description?.length > 150 ? "..." : ""
              }</p>`
            : ""
        }
        <div class="saf-event-footer">
          <span class="saf-event-creator">
            <i class="fas fa-user"></i> ${escapeHtml(createdBy)}
          </span>
          <div class="saf-event-actions">
            <button class="btn secondary saf-reject-btn" title="Reject Event">
              <i class="fas fa-times"></i> Reject
            </button>
            <button class="btn primary saf-approve-btn" title="Approve Event">
              <i class="fas fa-check"></i> Approve
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindEventHandlers(contentEl) {
    // Approve buttons
    contentEl.querySelectorAll(".saf-approve-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.currentTarget.closest(".saf-event-card");
        if (!card) return;
        const clubId = card.getAttribute("data-club-id");
        const eventId = card.getAttribute("data-event-id");
        if (clubId && eventId) {
          this.handleApproveEvent(card, clubId, eventId);
        }
      });
    });

    // Reject buttons
    contentEl.querySelectorAll(".saf-reject-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.currentTarget.closest(".saf-event-card");
        if (!card) return;
        const clubId = card.getAttribute("data-club-id");
        const eventId = card.getAttribute("data-event-id");
        if (clubId && eventId) {
          this.handleRejectEvent(card, clubId, eventId);
        }
      });
    });
  }

  async handleApproveEvent(cardEl, clubId, eventId) {
    const btn = cardEl.querySelector(".saf-approve-btn");
    if (!btn) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

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
        } catch (_) {}
      }

      const callable = httpsCallable(functions, "approveClubEventSaf");
      await callable({ clubId, eventId });

      // Remove from local list and re-render
      this.pendingEvents = this.pendingEvents.filter(
        (e) => !(e.clubId === clubId && e.id === eventId)
      );

      notificationManager.show("Event approved successfully!", "success");
      await this.loadTabContent("events");
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

  async handleRejectEvent(cardEl, clubId, eventId) {
    // Show rejection reason modal
    this.showModal({
      title: "Reject Event",
      content: `
        <form class="admin-form" id="reject-event-form">
          <p>Please provide a reason for rejecting this event:</p>
          <div class="form-group">
            <label>Rejection Reason *</label>
            <textarea name="reason" rows="3" required placeholder="Enter reason for rejection..."></textarea>
          </div>
        </form>
      `,
      confirmText: "Reject Event",
      confirmClass: "btn-danger",
      onConfirm: async () => {
        const form = document.getElementById("reject-event-form");
        const reason = form?.elements?.reason?.value?.trim();

        if (!reason) {
          throw new Error("Please provide a rejection reason.");
        }

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
          } catch (_) {}
        }

        const callable = httpsCallable(functions, "rejectClubEventSaf");
        await callable({ clubId, eventId, reason });

        this.pendingEvents = this.pendingEvents.filter(
          (e) => !(e.clubId === clubId && e.id === eventId)
        );

        notificationManager.show("Event rejected.", "info");
        await this.loadTabContent("events");
      },
    });
  }

  // ==========================================
  // CLUBS TAB
  // ==========================================

  async loadClubsTab(contentEl) {
    // Fetch clubs in this university (uses shared method for consistency)
    this.clubs = await this.fetchClubsForUniversity();

    // Sort by name
    this.clubs.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    contentEl.innerHTML = `
      <div class="section-header">
        <h2><i class="fas fa-users"></i> Club Management</h2>
        <button class="btn-create-club">
          <i class="fas fa-plus"></i> Create Club
        </button>
      </div>

      <div class="clubs-filters">
        <input type="text" id="club-search" placeholder="Search clubs...">
      </div>

      <div class="clubs-table-container">
        <table class="clubs-table">
          <thead>
            <tr>
              <th>Club Name</th>
              <th>President</th>
              <th>Followers</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.clubs
              .map((club) => {
                const presidentName = this.getPresidentName(club);
                // Store raw name in data attribute (not escaped) - escaping is for HTML content only
                // The data attribute value will be properly escaped by the browser when setting innerHTML
                const rawName = club.name || "";
                return `
                <tr data-id="${club.id}" data-club-name="${rawName.replace(
                  /"/g,
                  "&quot;"
                )}">
                  <td>
                    <div class="club-name-cell">
                      ${
                        club.logoUrl
                          ? `<img src="${escapeAttr(
                              club.logoUrl
                            )}" alt="" class="club-logo-small">`
                          : `<div class="club-logo-placeholder"><i class="fas fa-users"></i></div>`
                      }
                      <span>${escapeHtml(club.name || "Unnamed")}</span>
                    </div>
                  </td>
                  <td>${escapeHtml(presidentName)}</td>
                  <td>${club.followerCount || 0}</td>
                  <td>
                    <span class="status-badge ${
                      club.isActive !== false ? "active" : "inactive"
                    }">
                      ${club.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td class="actions-cell">
                    <button class="btn-icon btn-edit" title="Edit Club">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-president" title="Assign President">
                      <i class="fas fa-crown"></i>
                    </button>
                    <button class="btn-icon btn-delete" title="Delete Club">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
        ${
          this.clubs.length === 0
            ? '<div class="empty-state"><i class="fas fa-users"></i><p>No clubs found in your university</p></div>'
            : ""
        }
      </div>
    `;

    // Setup handlers
    contentEl
      .querySelector(".btn-create-club")
      ?.addEventListener("click", () => {
        this.openCreateClubModal();
      });

    contentEl.querySelector("#club-search")?.addEventListener("input", (e) => {
      this.filterClubs(e.target.value);
    });

    contentEl.querySelectorAll(".clubs-table tbody tr").forEach((row) => {
      row.querySelector(".btn-edit")?.addEventListener("click", () => {
        this.openEditClubModal(row.dataset.id);
      });
      row.querySelector(".btn-president")?.addEventListener("click", () => {
        this.openAssignPresidentModal(row.dataset.id, row.dataset.clubName);
      });
      row.querySelector(".btn-delete")?.addEventListener("click", () => {
        this.confirmDeleteClub(row.dataset.id, row.dataset.clubName);
      });
    });
  }

  getPresidentName(club) {
    if (!club.presidentId) return "None assigned";
    const info = club.presidentInfo || {};
    if (info.firstName && info.lastName) {
      return `${info.firstName} ${info.lastName}`;
    }
    return info.displayName || info.name || "Assigned";
  }

  filterClubs(searchTerm) {
    const rows = this.rootEl.querySelectorAll(".clubs-table tbody tr");
    const term = searchTerm.toLowerCase();

    rows.forEach((row) => {
      const name =
        row.querySelector(".club-name-cell span")?.textContent.toLowerCase() ||
        "";
      row.style.display = name.includes(term) ? "" : "none";
    });
  }

  // ==========================================
  // CREATE CLUB MODAL
  // ==========================================

  openCreateClubModal() {
    const modal = new ClubCreatorModal({
      universityId: this.universityId,
      universityName: this.university?.name || this.universityId,
      onConfirm: async (clubData) => {
        const {
          name,
          description,
          category,
          accentColor,
          logoBlob,
          bannerBlob,
        } = clubData;

        // Generate club ID
        const clubId = this.generateClubId(name);

        // Create the club document FIRST with canonical schema
        // (Storage rules require club doc to exist for image uploads)
        const clubDoc = {
          clubId, // Include clubId field for consistency with AdminService.createClub
          name,
          description,
          category,
          accentColor,
          universityId: this.universityId,
          universityCode: this.university?.code || this.universityId,
          university: this.university?.name || this.universityId, // Required by ClubDetailPage
          universityName: this.university?.name || this.universityId,
          createdAt: serverTimestamp(),
          createdBy: currentUser.uid,
          presidentId: null,
          presidentUid: null, // Match AdminService schema
          presidentInfo: null,
          memberCount: 0,
          followerCount: 0,
          isActive: true,
          // DEPRECATED: requireSafApproval is always true now (SAF approval is mandatory for ALL events)
          requireSafApproval: true,
          logoUrl: null,
          bannerUrl: null,
        };

        // Use setDoc with explicit clubId for consistency with AdminService
        await setDoc(doc(db, "clubs", clubId), clubDoc);

        // Small delay to ensure Firestore document is available for Storage rules check
        // (Emulator cross-service consistency can have slight delays)
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Now upload images AFTER club exists (storage rules require club doc)
        let logoUrl = null;
        let bannerUrl = null;

        try {
          if (logoBlob) {
            logoUrl = await uploadClubLogo(clubId, logoBlob);
          }
          if (bannerBlob) {
            bannerUrl = await uploadClubBanner(clubId, bannerBlob);
          }
          // Update the club with image URLs if any were uploaded
          if (logoUrl || bannerUrl) {
            await updateDoc(doc(db, "clubs", clubId), {
              ...(logoUrl && { logoUrl }),
              ...(bannerUrl && { bannerUrl }),
            });
          }
        } catch (imageError) {
          logManager.warn(
            "SafModeratePage: Failed to upload images",
            imageError
          );
        }

        logManager.info("SafModeratePage: Club created", { name, clubId });
        notificationManager.show(
          `Club "${name}" created successfully!`,
          "success"
        );

        await this.loadTabContent("clubs");
      },
    });

    modal.show();
  }

  generateClubId(name) {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 30) +
      "-" +
      Date.now().toString(36)
    );
  }

  // ==========================================
  // EDIT CLUB MODAL
  // ==========================================

  async openEditClubModal(clubId) {
    const club = this.clubs.find((c) => c.id === clubId);
    if (!club) {
      notificationManager.show("Club not found", "error");
      return;
    }

    // Use ClubCreatorModal in edit mode
    const modal = new ClubCreatorModal({
      universities: [], // Not needed since we preset the university
      presetUniversityId: this.universityId,
      presetUniversityName: this.university?.name || this.university?.fullName,
      editMode: true,
      existingClub: club,
      existingLogoUrl: club.logoUrl || null,
      existingBannerUrl: club.bannerUrl || null,
      onConfirm: async (formData) => {
        const {
          name,
          description,
          category,
          accentColor,
          requireSafApproval,
          logoBlob,
          bannerBlob,
        } = formData;

        try {
          // Upload new images if provided
          let logoUrl = club.logoUrl; // Keep existing if no new upload
          let bannerUrl = club.bannerUrl;

          if (logoBlob) {
            logoUrl = await uploadClubLogo(clubId, logoBlob);
          }
          if (bannerBlob) {
            bannerUrl = await uploadClubBanner(clubId, bannerBlob);
          }

          // Update the club
          // DEPRECATED: requireSafApproval is always true now (SAF approval is mandatory for ALL events)
          await updateDoc(doc(db, "clubs", clubId), {
            name,
            description,
            category,
            accentColor,
            requireSafApproval: true, // Always true - SAF approval is mandatory
            ...(logoUrl && { logoUrl }),
            ...(bannerUrl && { bannerUrl }),
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid,
          });

          logManager.info("SafModeratePage: Club updated", { clubId, name });
          notificationManager.show("Club updated successfully!", "success");

          await this.loadTabContent("clubs");
        } catch (error) {
          logManager.error("SafModeratePage: Failed to update club", {
            clubId,
            error,
          });
          notificationManager.show(
            "Failed to update club. Please try again.",
            "error"
          );
        }
      },
    });

    await modal.show();
  }

  // ==========================================
  // ASSIGN PRESIDENT MODAL
  // ==========================================

  async openAssignPresidentModal(clubId, clubName) {
    const club = this.clubs.find((c) => c.id === clubId) || {
      id: clubId,
      name: clubName,
    };

    this.showModal({
      title: "Assign President",
      content: `
        <div class="assign-modal">
          <p>Search for a student to make president of <strong>${escapeHtml(
            club.name || clubId
          )}</strong>.</p>
          <div id="assign-president-search"></div>
        </div>
      `,
      confirmText: "Close",
      onConfirm: async () => {},
    });

    // Render user search
    setTimeout(() => {
      const searchContainer = document.getElementById(
        "assign-president-search"
      );
      if (searchContainer) {
        renderUserSearchAssign(searchContainer, {
          scopeUniversityId: this.universityId,
          allowAllUniversities: false,
          bypassSearchable: true,
          onSelect: (user) => {
            const profile = user.profile || {};
            const displayName =
              profile.firstName && profile.lastName
                ? `${profile.firstName} ${profile.lastName}`
                : profile.displayName || profile.handle || user.id;

            this.showModal({
              title: "Confirm President",
              content: `
                <p>Make <strong>${escapeHtml(
                  displayName
                )}</strong> the president of <strong>${escapeHtml(
                club.name || clubId
              )}</strong>?</p>
                <p class="warning-text" style="margin-top: 1rem; color: var(--warning-gold);">
                  <i class="fas fa-info-circle"></i> The current president (if any) will be removed from the club.
                </p>
              `,
              confirmText: "Assign President",
              onConfirm: async () => {
                // Call Cloud Function to assign president
                const {
                  getFunctions,
                  httpsCallable,
                  connectFunctionsEmulator,
                } = await import("firebase/functions");

                const functions = getFunctions(app, "us-central1");
                const isLocal =
                  typeof window !== "undefined" &&
                  (window.location.hostname === "localhost" ||
                    window.location.hostname === "127.0.0.1");
                if (isLocal) {
                  try {
                    connectFunctionsEmulator(functions, "localhost", 5001);
                  } catch (_) {}
                }

                const callable = httpsCallable(
                  functions,
                  "assignClubPresident"
                );
                await callable({ clubId, userId: user.id });

                notificationManager.show(
                  `${displayName} is now president of ${club.name}!`,
                  "success"
                );

                await this.loadTabContent("clubs");
              },
            });
          },
        });
      }
    }, 100);
  }

  // ==========================================
  // DELETE CLUB MODAL
  // ==========================================

  confirmDeleteClub(clubId, clubName) {
    this.showModal({
      title: "Delete Club",
      content: `
        <div class="delete-club-confirm">
          <div class="warning-icon">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <p class="warning-text">
            <strong>This action cannot be undone.</strong> This will permanently delete 
            the club "<strong>${escapeHtml(
              clubName
            )}</strong>" and all its associated data, 
            including events and memberships.
          </p>
          <div class="form-group">
            <label>To confirm, type the club name exactly:</label>
            <input 
              type="text" 
              id="confirmClubName" 
              placeholder="${escapeHtml(clubName)}"
              autocomplete="off"
            />
          </div>
          <p class="type-hint" id="typeHint" style="display: none;">
            <i class="fas fa-check-circle"></i> Club name matches
          </p>
        </div>
      `,
      confirmText: "Delete Club",
      confirmClass: "btn-danger",
      onConfirm: async () => {
        const input = document.getElementById("confirmClubName");
        const typedName = input?.value?.trim();

        if (typedName !== clubName) {
          throw new Error("Club name does not match. Deletion cancelled.");
        }

        await adminDeleteClub(clubId);

        logManager.info("SafModeratePage: Club deleted", { clubId, clubName });
        notificationManager.show(
          `Club "${clubName}" has been deleted.`,
          "info"
        );

        await this.loadTabContent("clubs");
      },
    });

    // Add validation listener
    setTimeout(() => {
      const input = document.getElementById("confirmClubName");
      const hint = document.getElementById("typeHint");
      const confirmBtn = document.querySelector(".admin-modal .btn-confirm");

      if (input && confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.add("btn-disabled");

        input.addEventListener("input", () => {
          const typedName = input.value.trim();
          const matches = typedName === clubName;

          if (hint) {
            hint.style.display = matches ? "block" : "none";
          }

          confirmBtn.disabled = !matches;
          confirmBtn.classList.toggle("btn-disabled", !matches);
        });
      }
    }, 100);
  }

  // ==========================================
  // MODAL HELPER
  // ==========================================

  showModal({
    title,
    content,
    confirmText = "Confirm",
    confirmClass = "",
    onConfirm,
  }) {
    // Remove existing modal
    document.querySelector(".admin-modal-overlay")?.remove();

    const modal = document.createElement("div");
    modal.className = "admin-modal-overlay";
    modal.innerHTML = `
      <div class="admin-modal glass-card">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-footer">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-confirm ${confirmClass}">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector(".modal-close").addEventListener("click", close);
    modal.querySelector(".btn-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    modal.querySelector(".btn-confirm").addEventListener("click", async () => {
      try {
        const btn = modal.querySelector(".btn-confirm");
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        await onConfirm();
        close();
      } catch (error) {
        logManager.error("Modal action error", error);
        notificationManager.show(error.message || "An error occurred", "error");
        const btn = modal.querySelector(".btn-confirm");
        btn.disabled = false;
        btn.innerHTML = confirmText;
      }
    });
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

// Helper to escape values for safe use in HTML attributes (src, href, etc.)
function escapeAttr(value) {
  if (value == null) return "";
  const str = String(value);
  // Block javascript: and data: URIs that could execute code
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
