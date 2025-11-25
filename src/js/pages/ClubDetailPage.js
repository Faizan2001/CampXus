import { logManager } from "../utils/debug/LogManager.js";
import { currentUser } from "../store/userStore.js";
import { notificationManager } from "../services/realtime/NotificationService.js";

export default class ClubDetailPage {
  constructor() {
    this.container = null;
    this.clubId = null;
    this.clubData = null;
    this.isFollowing = false;
  }

  async mount() {
    this.container = document.querySelector("#club-root") || document.querySelector(".main-content");
    
    // Parse club id from location hash: #club?id=XYZ
    const raw = String(window.location.hash || "").replace(/^#/, "");
    const qs = raw.split("?")[1] || "";
    const params = new URLSearchParams(qs);
    this.clubId = params.get("id");

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

    // Check if user follows this club
    this.isFollowing = (currentUser?.followedClubs || []).includes(this.clubId);

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
      this.renderClub();
    } catch (err) {
      logManager.system.error("[ClubDetailPage] load error:", err);
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
    
    this.container.innerHTML = `
      <section class="club-detail" data-accent="${accentColor}">
        <div class="club-detail-header">
          <a href="#clubs" class="back-link"><i class="fas fa-arrow-left"></i> Back</a>
        </div>
        
        <div class="club-hero">
          ${c.bannerUrl ? `<img src="${c.bannerUrl}" alt="Banner" class="club-banner" />` : `<div class="club-banner-placeholder"></div>`}
          <div class="club-hero-content">
            <div class="club-logo-large">
              ${c.logoUrl ? `<img src="${c.logoUrl}" alt="${escapeHtml(c.name)}" />` : `<i class="fas fa-flag"></i>`}
            </div>
            <div class="club-hero-info">
              <h1>${escapeHtml(c.name || "Untitled Club")}</h1>
              <span class="club-university-badge"><i class="fas fa-university"></i> ${escapeHtml(c.university || "")}</span>
            </div>
          </div>
        </div>

        <div class="club-body">
          <div class="club-stats-bar">
            <div class="stat">
              <span class="stat-value" id="followerCount">${c.followerCount || 0}</span>
              <span class="stat-label">Followers</span>
            </div>
            <div class="stat">
              <span class="stat-value">${c.memberCount || 0}</span>
              <span class="stat-label">Members</span>
            </div>
            <div class="stat">
              <span class="stat-value">${c.eventsThisWeek || 0}</span>
              <span class="stat-label">Events</span>
            </div>
          </div>

          <div class="club-actions-bar">
            <button id="followBtn" class="btn ${this.isFollowing ? 'secondary' : 'primary'} large">
              <i class="fas ${this.isFollowing ? 'fa-check' : 'fa-plus'}"></i>
              ${this.isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>

          <div class="club-description-section">
            <h2>About</h2>
            <p>${escapeHtml(c.description || "No description available.")}</p>
          </div>

          <div class="club-tabs">
            <button class="tab-btn active" data-tab="events"><i class="fas fa-calendar"></i> Events</button>
            <button class="tab-btn" data-tab="members"><i class="fas fa-users"></i> Members</button>
          </div>

          <div class="club-tab-content" id="tabContent">
            <div class="events-placeholder">
              <i class="fas fa-calendar-alt"></i>
              <p>No upcoming events yet.</p>
              <p class="hint">Events will appear here when officials create them.</p>
            </div>
          </div>
        </div>
      </section>
    `;

    // Bind follow button
    this.container.querySelector("#followBtn")?.addEventListener("click", () => this.handleFollow());

    // Bind tab buttons
    this.container.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.switchTab(e.currentTarget.dataset.tab));
    });
  }

  switchTab(tab) {
    // Update active tab button
    this.container.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    const content = this.container.querySelector("#tabContent");
    
    if (tab === "events") {
      content.innerHTML = `
        <div class="events-placeholder">
          <i class="fas fa-calendar-alt"></i>
          <p>No upcoming events yet.</p>
          <p class="hint">Events will appear here when officials create them.</p>
        </div>
      `;
    } else if (tab === "members") {
      content.innerHTML = `
        <div class="members-placeholder">
          <i class="fas fa-users"></i>
          <p>No members to display yet.</p>
          <p class="hint">Club officials and president will appear here.</p>
        </div>
      `;
    }
  }

  async handleFollow() {
    if (!currentUser?.uid || !this.clubId) return;

    const btn = this.container.querySelector("#followBtn");
    const wasFollowing = this.isFollowing;

    // Optimistic update
    this.isFollowing = !wasFollowing;
    btn.innerHTML = `<i class="fas ${this.isFollowing ? 'fa-check' : 'fa-plus'}"></i> ${this.isFollowing ? 'Following' : 'Follow'}`;
    btn.classList.toggle("primary", !this.isFollowing);
    btn.classList.toggle("secondary", this.isFollowing);

    try {
      const { db } = await import("../lib/firebase/firebase-config.js");
      const { doc, updateDoc, arrayUnion, arrayRemove, increment } = await import("firebase/firestore");

      // Update user's followedClubs
      await updateDoc(doc(db, "users", currentUser.uid), {
        followedClubs: wasFollowing ? arrayRemove(this.clubId) : arrayUnion(this.clubId),
      });

      // Update club's follower count
      await updateDoc(doc(db, "clubs", this.clubId), {
        followerCount: increment(wasFollowing ? -1 : 1),
      });

      // Update displayed count
      if (this.clubData) {
        this.clubData.followerCount = (this.clubData.followerCount || 0) + (wasFollowing ? -1 : 1);
        const countEl = this.container.querySelector("#followerCount");
        if (countEl) countEl.textContent = this.clubData.followerCount;
      }

      notificationManager.show(
        wasFollowing ? "Unfollowed club" : "Now following this club!",
        wasFollowing ? "info" : "success"
      );
    } catch (err) {
      logManager.system.error("[ClubDetailPage] Follow error:", err);
      // Rollback
      this.isFollowing = wasFollowing;
      btn.innerHTML = `<i class="fas ${this.isFollowing ? 'fa-check' : 'fa-plus'}"></i> ${this.isFollowing ? 'Following' : 'Follow'}`;
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
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
