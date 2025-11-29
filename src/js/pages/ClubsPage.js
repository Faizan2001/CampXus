import { currentUser } from "../store/userStore.js";
import { logManager } from "../utils/debug/LogManager.js";
import { notificationManager } from "../services/realtime/NotificationService.js";

export default class ClubsPage {
  constructor() {
    this.container = null;
    this.isCreating = false;
    this.clubs = [];
    this.followedClubs = new Set(); // Track which clubs the user follows
  }

  async mount(rootEl) {
    this.container = rootEl;

    try {
      await currentUser.waitForProfile();
    } catch (e) {
      console.warn("[ClubsPage] Failed to wait for profile:", e);
    }

    if (!currentUser.isProfileComplete()) {
      this.container.innerHTML = `
        <section class="clubs-page">
          <div class="profile-gate-message">
            <div class="gate-icon"><i class="fas fa-flag"></i></div>
            <h2>Complete Your Profile</h2>
            <p>Complete your profile before browsing clubs.</p>
            <button id="completeProfileBtn" class="btn primary">Complete Profile</button>
          </div>
        </section>
      `;
      this.container.querySelector("#completeProfileBtn")?.addEventListener("click", () => {
        window.location.hash = "#profile";
      });
      return;
    }

    // Load user's followed clubs from their profile
    this.followedClubs = new Set(currentUser?.profile?.followedClubs || []);

    // Check if we're inside the Groups page (tab) or standalone route
    const isInsideGroupsTab = document.querySelector(".groups-content-tabs") !== null;

    this.container.innerHTML = `
      <section class="clubs-page">
        ${!isInsideGroupsTab ? `
        <div class="clubs-header-bar">
          <h1><i class="fas fa-flag"></i> Campus Clubs</h1>
          <p class="clubs-subtitle">Discover student organizations at your university</p>
        </div>
        ` : ''}
        <div class="clubs-controls">
          <button id="createTestClub" class="btn secondary"><i class="fas fa-plus"></i> Create Test Club</button>
        </div>
        <div id="clubs-list" class="clubs-grid">
          <div class="loading-clubs"><i class="fas fa-spinner fa-spin"></i> Loading clubs...</div>
        </div>
      </section>
    `;

    const btn = this.container.querySelector("#createTestClub");
    btn?.addEventListener("click", async () => this.createTestClub());

    await this.loadClubsPreview();
  }

  async loadClubsPreview() {
    const listEl = this.container.querySelector("#clubs-list");

    try {
      const [{ db }, firestore] = await Promise.all([
        import("../lib/firebase/firebase-config.js"),
        import("firebase/firestore"),
      ]);

      const { collection, query, getDocs, orderBy, limit } = firestore;
      const q = query(collection(db, "clubs"), orderBy("createdAt", "desc"), limit(20));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        listEl.innerHTML = `
          <div class="clubs-empty">
            <i class="fas fa-flag"></i>
            <p>No clubs yet. Create a test club to get started!</p>
          </div>
        `;
        return;
      }

      this.clubs = [];
      snap.forEach((d) => this.clubs.push({ id: d.id, ...d.data() }));

      this.renderClubs(listEl);
    } catch (err) {
      logManager.system.error("[ClubsPage] Failed to load clubs preview:", err);
      listEl.innerHTML = `
        <div class="clubs-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load clubs. Check your connection.</p>
          <button class="btn secondary" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }

  renderClubs(listEl) {
    listEl.innerHTML = this.clubs.map((c) => {
      const isFollowing = this.followedClubs.has(c.id);
      const accentColor = c.accentColor || "blue";
      return `
        <div class="club-card" data-club-id="${c.id}" data-accent="${accentColor}">
          <div class="club-card-header">
            <div class="club-logo">
              ${c.logoUrl ? `<img src="${c.logoUrl}" alt="${escapeHtml(c.name)}" />` : `<i class="fas fa-flag"></i>`}
            </div>
            <div class="club-info">
              <h3>${escapeHtml(c.name || "Untitled Club")}</h3>
              <span class="club-university">${escapeHtml(c.university || "")}</span>
            </div>
          </div>
          <p class="club-description">${escapeHtml(c.description || "No description")}</p>
          <div class="club-stats">
            <span><i class="fas fa-users"></i> ${c.followerCount || 0} followers</span>
          </div>
          <div class="club-actions">
            <button class="btn ${isFollowing ? 'secondary' : 'primary'} follow-btn" data-club-id="${c.id}">
              <i class="fas ${isFollowing ? 'fa-check' : 'fa-plus'}"></i>
              ${isFollowing ? 'Following' : 'Follow'}
            </button>
            <a href="#club?id=${c.id}" class="btn secondary">View <i class="fas fa-arrow-right"></i></a>
          </div>
        </div>
      `;
    }).join("");

    // Bind follow button clicks
    listEl.querySelectorAll(".follow-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.handleFollowClick(e));
    });
  }

  async handleFollowClick(e) {
    const btn = e.currentTarget;
    const clubId = btn.dataset.clubId;
    if (!clubId || !currentUser?.uid) return;

    const isCurrentlyFollowing = this.followedClubs.has(clubId);

    // Optimistic UI update
    if (isCurrentlyFollowing) {
      this.followedClubs.delete(clubId);
      btn.innerHTML = `<i class="fas fa-plus"></i> Follow`;
      btn.classList.remove("secondary");
      btn.classList.add("primary");
    } else {
      this.followedClubs.add(clubId);
      btn.innerHTML = `<i class="fas fa-check"></i> Following`;
      btn.classList.remove("primary");
      btn.classList.add("secondary");
    }

    try {
      const { db } = await import("../lib/firebase/firebase-config.js");
      const { doc, updateDoc, arrayUnion, arrayRemove } = await import("firebase/firestore");

      // Update user's followedClubs array
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        followedClubs: isCurrentlyFollowing ? arrayRemove(clubId) : arrayUnion(clubId),
      });

      // Keep currentUser.profile.followedClubs in sync for this session
      const existingProfile = currentUser.profile || {};
      const existingFollowed = Array.isArray(existingProfile.followedClubs)
        ? existingProfile.followedClubs
        : [];
      const updatedFollowed = isCurrentlyFollowing
        ? existingFollowed.filter((id) => id !== clubId)
        : Array.from(new Set([...existingFollowed, clubId]));

      if (typeof currentUser.setProfile === "function") {
        currentUser.setProfile({
          ...existingProfile,
          followedClubs: updatedFollowed,
        });
      }

      // Update local club data
      const club = this.clubs.find((c) => c.id === clubId);
      if (club) {
        club.followerCount = (club.followerCount || 0) + (isCurrentlyFollowing ? -1 : 1);
        // Update the stats display
        const card = this.container.querySelector(`.club-card[data-club-id="${clubId}"]`);
        const statsEl = card?.querySelector(".club-stats span");
        if (statsEl) {
          statsEl.innerHTML = `<i class="fas fa-users"></i> ${club.followerCount} followers`;
        }
      }

      notificationManager.show(
        isCurrentlyFollowing ? "Unfollowed club" : "Now following club!",
        isCurrentlyFollowing ? "info" : "success"
      );
    } catch (err) {
      logManager.system.error("[ClubsPage] Follow/unfollow error:", err);
      // Rollback optimistic update
      if (isCurrentlyFollowing) {
        this.followedClubs.add(clubId);
        btn.innerHTML = `<i class="fas fa-check"></i> Following`;
        btn.classList.add("secondary");
        btn.classList.remove("primary");
      } else {
        this.followedClubs.delete(clubId);
        btn.innerHTML = `<i class="fas fa-plus"></i> Follow`;
        btn.classList.add("primary");
        btn.classList.remove("secondary");
      }
      notificationManager.show("Failed to update follow status", "error");
    }
  }

  async createTestClub() {
    if (this.isCreating) return;
    this.isCreating = true;
    
    const btn = this.container.querySelector("#createTestClub");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Creating...`;
    btn.disabled = true;

    try {
      const { db } = await import("../lib/firebase/firebase-config.js");
      const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");

      const clubName = `Test Club ${Math.floor(Math.random() * 1000)}`;
      const accentColorOptions = ["blue", "purple", "green", "orange", "pink"];
      const accentColor = accentColorOptions[Math.floor(Math.random() * accentColorOptions.length)];
      const universityName =
        currentUser?.profile?.universityInfo?.university || "Test University";
      const docRef = await addDoc(collection(db, "clubs"), {
        name: clubName,
        description: "A test club created from the emulator for development",
        university: universityName,
        createdBy: currentUser?.uid || null,
        devOwnerUid: currentUser?.uid || null,
        devTest: true,
        followerCount: 0,
        accentColor,
        createdAt: serverTimestamp(),
      });

      // Add to local list and re-render
      const newClub = {
        id: docRef.id,
        name: clubName,
        description: "A test club created from the emulator for development",
        university: universityName,
        followerCount: 0,
        accentColor,
      };
      this.clubs.unshift(newClub);
      this.renderClubs(this.container.querySelector("#clubs-list"));

      notificationManager.show(`Created "${clubName}"!`, "success");
    } catch (err) {
      logManager.system.error("[ClubsPage] createTestClub error:", err);
      notificationManager.show("Failed to create test club", "error");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
      this.isCreating = false;
    }
  }

  unmount() {
    // Cleanup if we had listeners (none for now)
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Wire to SPA router lifecycle
let _clubsPageInstance = null;
document.addEventListener("spa:page:unload", () => {
  if (_clubsPageInstance) {
    _clubsPageInstance.unmount();
    _clubsPageInstance = null;
  }
});

document.addEventListener("spa:page:load", async (event) => {
  const route = event?.detail?.route;
  if (route !== "clubs") return;
  const root = document.querySelector("#clubs-root") || document.querySelector(".main-content");
  _clubsPageInstance = new ClubsPage();
  await _clubsPageInstance.mount(root);
});
