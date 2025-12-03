import { currentUser } from "../store/userStore.js";
import { logManager } from "../utils/debug/LogManager.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import { LiveEventsSection } from "../components/clubs/LiveEventsSection.js";

export default class ClubsPage {
  constructor() {
    this.container = null;
    this.isCreating = false;
    this.clubs = [];
    this.followedClubs = new Set(); // Track which clubs the user follows
    this.liveEventsSection = null; // Live events section instance
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
      this.container
        .querySelector("#completeProfileBtn")
        ?.addEventListener("click", () => {
          window.location.hash = "#profile";
        });
      return;
    }

    // Load user's followed clubs from their profile
    this.followedClubs = new Set(currentUser?.profile?.followedClubs || []);

    // Check if we're inside the Groups page (tab) or standalone route
    const isInsideGroupsTab =
      document.querySelector(".groups-content-tabs") !== null;

    this.container.innerHTML = `
      <section class="clubs-page">
        ${
          !isInsideGroupsTab
            ? `
        <div class="clubs-header-bar">
          <h1><i class="fas fa-flag"></i> Campus Clubs</h1>
          <p class="clubs-subtitle">Discover student organizations at your university</p>
        </div>
        `
            : ""
        }
        
        <!-- Live Events Section -->
        <div id="live-events-container"></div>
        
        <div class="clubs-section-header">
          <h2 class="clubs-section-title"><i class="fas fa-flag"></i> All Clubs</h2>
        </div>
        
        <!-- Search Bar -->
        <div class="clubs-search-bar">
          <div class="search-input-wrapper">
            <i class="fas fa-search"></i>
            <input 
              type="text" 
              id="clubs-search-input" 
              placeholder="Search clubs by name..."
              autocomplete="off"
            />
            <button class="search-clear-btn" id="search-clear-btn" style="display: none;">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        
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

    // Setup search functionality
    this.setupSearch();

    // Initialize Live Events Section
    await this.initLiveEventsSection();

    await this.loadClubsPreview();
  }

  /**
   * Setup search functionality for filtering clubs
   */
  setupSearch() {
    const searchInput = this.container.querySelector("#clubs-search-input");
    const clearBtn = this.container.querySelector("#search-clear-btn");

    if (!searchInput) return;

    // Debounce search input
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.trim();
      
      // Show/hide clear button
      if (clearBtn) {
        clearBtn.style.display = query ? "flex" : "none";
      }

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.filterAndRenderClubs(query);
      }, 200);
    });

    // Clear button handler
    clearBtn?.addEventListener("click", () => {
      searchInput.value = "";
      clearBtn.style.display = "none";
      this.filterAndRenderClubs("");
      searchInput.focus();
    });
  }

  /**
   * Filter clubs by search query and render
   * Shows followed clubs first, then others
   */
  filterAndRenderClubs(query = "") {
    const listEl = this.container.querySelector("#clubs-list");
    if (!listEl) return;

    const normalizedQuery = query.toLowerCase().trim();
    
    // Filter clubs by name
    let filteredClubs = this.clubs;
    if (normalizedQuery) {
      filteredClubs = this.clubs.filter(club => 
        (club.name || "").toLowerCase().includes(normalizedQuery)
      );
    }

    // Sort: followed clubs first, then by follower count
    const sortedClubs = [...filteredClubs].sort((a, b) => {
      const aFollowed = this.followedClubs.has(a.id) ? 1 : 0;
      const bFollowed = this.followedClubs.has(b.id) ? 1 : 0;
      
      // Followed clubs first
      if (bFollowed !== aFollowed) {
        return bFollowed - aFollowed;
      }
      
      // Then by follower count (descending)
      return (b.followerCount || 0) - (a.followerCount || 0);
    });

    if (sortedClubs.length === 0) {
      listEl.innerHTML = `
        <div class="clubs-empty">
          <i class="fas fa-search"></i>
          <p>${normalizedQuery ? `No clubs found matching "${escapeHtml(query)}"` : "No clubs yet. Create a test club to get started!"}</p>
        </div>
      `;
      return;
    }

    // Store original clubs for later rendering
    const originalClubs = this.clubs;
    this.clubs = sortedClubs;
    this.renderClubs(listEl);
    this.clubs = originalClubs;
  }

    // Initialize Live Events Section
    await this.initLiveEventsSection();

    await this.loadClubsPreview();
  }

  /**
   * Initialize the Live Events section
   */
  async initLiveEventsSection() {
    const container = this.container.querySelector("#live-events-container");
    if (!container) return;

    // Cleanup previous instance
    if (this.liveEventsSection) {
      this.liveEventsSection.destroy();
    }

    this.liveEventsSection = new LiveEventsSection({
      container,
      universityCode: currentUser?.profile?.universityInfo?.university || "iub",
      onEventClick: (event, clubId) => {
        // Navigate to club page with event
        window.location.hash = `#club?id=${clubId}&eventId=${event.id}`;
      },
      onClubClick: (clubId) => {
        window.location.hash = `#club?id=${clubId}`;
      },
    });

    await this.liveEventsSection.init();
  }

  async loadClubsPreview() {
    const listEl = this.container.querySelector("#clubs-list");

    try {
      const [{ db }, firestore] = await Promise.all([
        import("../lib/firebase/firebase-config.js"),
        import("firebase/firestore"),
      ]);

      const { collection, query, getDocs, orderBy, limit } = firestore;
      const q = query(
        collection(db, "clubs"),
        orderBy("createdAt", "desc"),
        limit(50) // Increased limit to have more clubs to sort
      );
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

      // Sort: followed clubs first, then by follower count
      this.clubs.sort((a, b) => {
        const aFollowed = this.followedClubs.has(a.id) ? 1 : 0;
        const bFollowed = this.followedClubs.has(b.id) ? 1 : 0;
        
        // Followed clubs first
        if (bFollowed !== aFollowed) {
          return bFollowed - aFollowed;
        }
        
        // Then by follower count (descending)
        return (b.followerCount || 0) - (a.followerCount || 0);
      });

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
    listEl.innerHTML = this.clubs
      .map((c) => {
        const isFollowing = this.followedClubs.has(c.id);
        const accentColor = c.accentColor || "blue";
        return `
        <div class="club-card" data-club-id="${
          c.id
        }" data-accent="${accentColor}">
          <div class="club-card-header">
            <div class="club-logo">
              ${
                c.logoUrl
                  ? `<img src="${c.logoUrl}" alt="${escapeHtml(c.name)}" loading="lazy" />`
                  : `<i class="fas fa-flag"></i>`
              }
            </div>
            <div class="club-info">
              <h3>${escapeHtml(c.name || "Untitled Club")}</h3>
              <span class="club-university">${escapeHtml(
                c.university || ""
              )}</span>
            </div>
          </div>
          <p class="club-description">${escapeHtml(
            c.description || "No description"
          )}</p>
          <div class="club-stats">
            <span><i class="fas fa-users"></i> ${
              c.followerCount || 0
            } followers</span>
          </div>
          <div class="club-actions">
            <button class="btn ${
              isFollowing ? "secondary" : "primary"
            } follow-btn" data-club-id="${c.id}">
              <i class="fas ${isFollowing ? "fa-check" : "fa-plus"}"></i>
              ${isFollowing ? "Following" : "Follow"}
            </button>
            <a href="#club?id=${
              c.id
            }" class="btn secondary">View <i class="fas fa-arrow-right"></i></a>
          </div>
        </div>
      `;
      })
      .join("");

    // Bind follow button clicks
    listEl.querySelectorAll(".follow-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.handleFollowClick(e));
    });
  }

  async handleFollowClick(e) {
    const btn = e.currentTarget;
    const clubId = btn.dataset.clubId;
    if (!clubId || !currentUser?.uid) return;

    // Bug #23: Prevent multiple clicks during async operation
    if (btn.disabled) return;
    btn.disabled = true;

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
      const { doc, updateDoc, arrayUnion, arrayRemove } = await import(
        "firebase/firestore"
      );

      // Update user's followedClubs array
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        followedClubs: isCurrentlyFollowing
          ? arrayRemove(clubId)
          : arrayUnion(clubId),
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
        // R24: Ensure follower count never goes below 0
        const currentCount = club.followerCount || 0;
        const newCount = currentCount + (isCurrentlyFollowing ? -1 : 1);
        club.followerCount = Math.max(0, newCount);
        // Update the stats display
        const card = this.container.querySelector(
          `.club-card[data-club-id="${clubId}"]`
        );
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
    } finally {
      // Bug #23: Re-enable button after operation
      btn.disabled = false;
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
      const { collection, addDoc, serverTimestamp } = await import(
        "firebase/firestore"
      );

      const clubName = `Test Club ${Math.floor(Math.random() * 1000)}`;
      const accentColorOptions = ["blue", "purple", "green", "orange", "pink"];
      const accentColor =
        accentColorOptions[
          Math.floor(Math.random() * accentColorOptions.length)
        ];
      const universityName =
        currentUser?.profile?.universityInfo?.university || "Test University";
      const universityCode =
        currentUser?.profile?.universityInfo?.university || "iub";
      const creatorUid = currentUser?.uid || null;
      const docRef = await addDoc(collection(db, "clubs"), {
        name: clubName,
        description: "A test club created from the emulator for development",
        university: universityName,
        universityCode: universityCode,
        createdBy: creatorUid,
        devOwnerUid: creatorUid,
        devTest: true,
        presidentId: creatorUid, // Bug #12: Initialize presidentId for role checks
        followerCount: 0,
        officialIds: [],
        members: [], // Bug #15: Initialize empty members array
        accentColor,
        createdAt: serverTimestamp(),
      });

      // Add to local list and re-render
      const newClub = {
        id: docRef.id,
        name: clubName,
        description: "A test club created from the emulator for development",
        university: universityName,
        officialIds: [],
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
    // Cleanup live events section
    if (this.liveEventsSection) {
      this.liveEventsSection.destroy();
      this.liveEventsSection = null;
    }
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  if (route !== "clubs" && route !== "groups") return;
  const root =
    document.querySelector("#clubs-root") ||
    document.querySelector(".main-content");
  _clubsPageInstance = new ClubsPage();
  await _clubsPageInstance.mount(root);
});
