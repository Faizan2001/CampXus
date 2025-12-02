/**
 * AdminPage.js - Super Admin Dashboard
 *
 * 🔐 Hidden dashboard for super admins only!
 * Features:
 *   - PIN verification (extra security layer)
 *   - University & SAF management
 *   - Club creation & management
 *   - System maintenance tools
 */

import { currentUser } from "../store/userStore.js";
import { db } from "../lib/firebase/firebase-config.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  collectionGroup,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  orderBy,
  limit,
} from "firebase/firestore";
import { logManager } from "../utils/debug/LogManager.js";
import {
  createClub,
  updateClub as adminUpdateClub,
  assignPresident as adminAssignPresident,
  deleteClub as adminDeleteClub,
  createUniversity as adminCreateUniversity,
  updateUniversity as adminUpdateUniversity,
  deleteUniversity as adminDeleteUniversity,
  addSafModerator as adminAddSafModerator,
  removeSafModerator as adminRemoveSafModerator,
  rebuildClubStats as adminRebuildClubStats,
  cleanupOldEvents as adminCleanupOldEvents,
  verifyDataIntegrity as adminVerifyDataIntegrityService,
  cleanupOldNotifications as adminCleanupOldNotifications,
} from "../services/admin/AdminService.js";
import {
  processClubLogo,
  processClubBanner,
  uploadClubLogo,
  uploadClubBanner,
} from "../services/clubs/ClubImageService.js";

export class AdminPage {
  constructor() {
    this.rootEl = null;
    this.isVerified = false; // PIN verified this session
    this.activeTab = "overview";
    this.pinAttempts = 0;
    this.pinLockUntil = 0;
    this.cachedData = {
      universities: null,
      clubs: null,
      stats: null,
    };

    // Restore PIN lock state from this session if available
    if (typeof window !== "undefined") {
      const attemptsRaw = window.sessionStorage.getItem("adminPinAttempts");
      const lockRaw = window.sessionStorage.getItem("adminPinLockUntil");
      if (attemptsRaw) {
        const parsed = parseInt(attemptsRaw, 10);
        if (!Number.isNaN(parsed)) {
          this.pinAttempts = parsed;
        }
      }
      if (lockRaw) {
        const parsed = parseInt(lockRaw, 10);
        if (!Number.isNaN(parsed)) {
          this.pinLockUntil = parsed;
        }
      }
    }
  }

  /**
   * Mount the admin page
   */
  async mount(rootEl) {
    this.rootEl = rootEl;

    logManager.info("AdminPage: mount called");

    // Wait for user profile
    const user = await currentUser.waitForProfile();
    if (!user) {
      logManager.warn("AdminPage: No user profile found during mount");
      this.renderAccessDenied("Not authenticated");
      return;
    }

    // Check if user is super admin
    const isSuperAdmin = await this.checkSuperAdmin(user.uid);
    if (!isSuperAdmin) {
      this.renderAccessDenied("Not authorized");
      logManager.warn("Non-super-admin attempted to access admin dashboard", {
        uid: user.uid,
      });
      return;
    }

    // Show PIN verification
    this.renderPinVerification();
  }

  /**
   * Check if UID is in superAdmins list
   */
  async checkSuperAdmin(uid) {
    try {
      logManager.info("AdminPage: Checking super admin status", { uid });
      const adminDoc = await getDoc(doc(db, "admin", "superAdmins"));
      if (!adminDoc.exists()) {
        logManager.warn("superAdmins document does not exist");
        return false;
      }

      const data = adminDoc.data();
      const superAdmins = data.uids || [];
      const isSuper = superAdmins.includes(uid);
      logManager.info("AdminPage: Super admin check result", {
        uid,
        isSuperAdmin: isSuper,
      });
      return isSuper;
    } catch (error) {
      logManager.error("Error checking super admin status", error);
      return false;
    }
  }

  /**
   * Render access denied screen
   */
  renderAccessDenied(reason) {
    const container = this.rootEl;
    container.innerHTML = `
      <div class="admin-access-denied">
        <div class="denied-icon">
          <i class="fas fa-shield-alt"></i>
        </div>
        <h2>Access Denied</h2>
        <p>${reason}</p>
        <a href="/" class="btn-primary">
          <i class="fas fa-home"></i> Return Home
        </a>
      </div>
    `;
  }

  /**
   * Render PIN verification screen
   */
  renderPinVerification() {
    const container = this.rootEl;
    container.innerHTML = `
      <div class="admin-pin-screen">
        <div class="pin-container glass-card">
          <div class="pin-header">
            <i class="fas fa-lock"></i>
            <h2>Admin Verification</h2>
            <p>Enter your 6-digit PIN to continue</p>
          </div>
          
          <div class="pin-input-group">
            <input type="password" 
                   class="pin-input" 
                   maxlength="6" 
                   inputmode="numeric" 
                   pattern="[0-9]*"
                   placeholder="••••••"
                   autocomplete="off">
            <div class="pin-dots">
              ${Array(6).fill('<span class="pin-dot"></span>').join("")}
            </div>
          </div>
          
          <div class="pin-error" style="display: none;">
            <i class="fas fa-exclamation-circle"></i>
            <span>Invalid PIN. Please try again.</span>
          </div>
          
          <button class="btn-verify-pin" disabled>
            <i class="fas fa-unlock"></i> Verify PIN
          </button>
        </div>
      </div>
    `;

    this.setupPinVerification(container);

    // Apply lock state if too many attempts
    this.updatePinLockUI(container);
  }

  /**
   * Setup PIN verification handlers
   */
  setupPinVerification(container) {
    const input = container.querySelector(".pin-input");
    const dots = container.querySelectorAll(".pin-dot");
    const verifyBtn = container.querySelector(".btn-verify-pin");
    const errorEl = container.querySelector(".pin-error");

    // Update dots as user types
    input.addEventListener("input", (e) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      e.target.value = value;

      // Update dot visuals
      dots.forEach((dot, i) => {
        dot.classList.toggle("filled", i < value.length);
      });

      // Enable/disable verify button
      verifyBtn.disabled = value.length !== 6;

      // Hide error on new input
      errorEl.style.display = "none";
    });

    // Handle enter key
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && input.value.length === 6) {
        this.verifyPin(input.value, errorEl);
      }
    });

    // Handle verify button click
    verifyBtn.addEventListener("click", () => {
      if (input.value.length === 6) {
        this.verifyPin(input.value, errorEl);
      }
    });

    // Focus input on load
    setTimeout(() => input.focus(), 100);
  }

  /**
   * Check whether PIN entry is currently locked due to too many attempts.
   */
  isPinLocked() {
    if (!this.pinLockUntil) return false;
    const now = Date.now();
    if (now >= this.pinLockUntil) {
      // Lock window has expired; reset state
      this.pinLockUntil = 0;
      this.pinAttempts = 0;
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("adminPinLockUntil");
        window.sessionStorage.removeItem("adminPinAttempts");
      }
      return false;
    }
    return true;
  }

  /**
   * Get remaining lock time in milliseconds.
   */
  getPinLockRemainingMs() {
    if (!this.pinLockUntil) return 0;
    const remaining = this.pinLockUntil - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Update PIN UI based on lock state (disable input/button & show message).
   */
  updatePinLockUI(container) {
    const input = container.querySelector(".pin-input");
    const verifyBtn = container.querySelector(".btn-verify-pin");
    const errorEl = container.querySelector(".pin-error");

    if (!this.isPinLocked()) {
      if (input) input.disabled = false;
      if (verifyBtn) verifyBtn.disabled = input?.value.length !== 6;
      return;
    }

    const remainingMs = this.getPinLockRemainingMs();
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    const message = `Too many incorrect attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}.`;

    if (input) input.disabled = true;
    if (verifyBtn) verifyBtn.disabled = true;
    if (errorEl) {
      const span = errorEl.querySelector("span");
      if (span) {
        span.textContent = message;
      }
      errorEl.style.display = "flex";
    }
  }

  /**
   * Verify PIN against stored hash
   */
  async verifyPin(pin, errorEl) {
    // Enforce simple lockout after too many attempts
    const pinScreen =
      this.rootEl && this.rootEl.querySelector(".admin-pin-screen");
    if (this.isPinLocked()) {
      if (pinScreen) {
        this.updatePinLockUI(pinScreen);
      }
      return;
    }

    try {
      // Hash the PIN using SHA-256
      const encoder = new TextEncoder();
      const data = encoder.encode(pin);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const pinHash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Get stored hash
      const adminDoc = await getDoc(doc(db, "admin", "superAdmins"));
      if (!adminDoc.exists()) {
        throw new Error("Admin config not found");
      }

      const storedHash = adminDoc.data().pinHash;

      if (pinHash === storedHash) {
        this.isVerified = true;
        this.pinAttempts = 0;
        this.pinLockUntil = 0;
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("adminPinAttempts");
          window.sessionStorage.removeItem("adminPinLockUntil");
        }
        logManager.info("Admin PIN verified successfully");
        this.renderDashboard();
      } else {
        this.pinAttempts += 1;
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "adminPinAttempts",
            String(this.pinAttempts)
          );
        }

        const maxAttempts = 5;
        if (this.pinAttempts >= maxAttempts) {
          const lockDurationMs = 5 * 60 * 1000; // 5 minutes
          this.pinLockUntil = Date.now() + lockDurationMs;
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              "adminPinLockUntil",
              String(this.pinLockUntil)
            );
          }
          logManager.warn("Admin PIN locked after too many attempts");
          if (pinScreen) {
            this.updatePinLockUI(pinScreen);
          }
        } else {
          errorEl.style.display = "flex";
          logManager.warn("Invalid admin PIN attempt");
        }
      }
    } catch (error) {
      logManager.error("PIN verification error", error);
      errorEl.querySelector("span").textContent =
        "Verification failed. Please try again.";
      errorEl.style.display = "flex";
    }
  }

  /**
   * Render the main dashboard
   */
  async renderDashboard() {
    const container = this.rootEl;
    container.innerHTML = `
      <div class="admin-dashboard">
        <header class="admin-header">
          <div class="admin-title">
            <i class="fas fa-crown"></i>
            <h1>Super Admin Dashboard</h1>
          </div>
          <div class="admin-user">
            <span>${currentUser.profile?.displayName || "Admin"}</span>
            <div class="admin-badge">
              <i class="fas fa-shield-alt"></i> Super Admin
            </div>
          </div>
        </header>

        <nav class="admin-tabs">
          <button class="admin-tab active" data-tab="overview">
            <i class="fas fa-chart-pie"></i>
            <span>Overview</span>
          </button>
          <button class="admin-tab" data-tab="universities">
            <i class="fas fa-university"></i>
            <span>Universities</span>
          </button>
          <button class="admin-tab" data-tab="saf">
            <i class="fas fa-user-shield"></i>
            <span>SAF Mods</span>
          </button>
          <button class="admin-tab" data-tab="clubs">
            <i class="fas fa-users"></i>
            <span>Clubs</span>
          </button>
          <button class="admin-tab" data-tab="maintenance">
            <i class="fas fa-tools"></i>
            <span>Maintenance</span>
          </button>
        </nav>

        <div class="admin-content">
          <!-- Tab content loaded here -->
        </div>
      </div>
    `;

    this.setupTabNavigation(container);
    await this.loadTabContent("overview");
  }

  /**
   * Setup tab navigation
   */
  setupTabNavigation(container) {
    const tabs = container.querySelectorAll(".admin-tab");

    tabs.forEach((tab) => {
      tab.addEventListener("click", async () => {
        // Update active state
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        // Load tab content
        const tabName = tab.dataset.tab;
        await this.loadTabContent(tabName);
      });
    });
  }

  /**
   * Load content for a specific tab
   */
  async loadTabContent(tabName) {
    this.activeTab = tabName;
    const contentEl = this.rootEl.querySelector(".admin-content");

    // Show loading
    contentEl.innerHTML = `
      <div class="admin-loading">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading...</span>
      </div>
    `;

    try {
      switch (tabName) {
        case "overview":
          await this.renderOverviewTab(contentEl);
          break;
        case "universities":
          await this.renderUniversitiesTab(contentEl);
          break;
        case "saf":
          await this.renderSafTab(contentEl);
          break;
        case "clubs":
          await this.renderClubsTab(contentEl);
          break;
        case "maintenance":
          await this.renderMaintenanceTab(contentEl);
          break;
      }
    } catch (error) {
      logManager.error(`Error loading ${tabName} tab`, error);
      contentEl.innerHTML = `
        <div class="admin-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load ${tabName}. Please try again.</p>
          <button class="btn-retry" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }

  // ==========================================
  // OVERVIEW TAB
  // ==========================================

  async renderOverviewTab(contentEl) {
    const stats = await this.fetchDashboardStats();

    contentEl.innerHTML = `
      <div class="admin-overview">
        <div class="stats-grid">
          <div class="stat-card glass-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #667eea, #764ba2)">
              <i class="fas fa-university"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value">${stats.universities}</span>
              <span class="stat-label">Universities</span>
            </div>
          </div>
          
          <div class="stat-card glass-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb, #f5576c)">
              <i class="fas fa-users"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value">${stats.totalClubs}</span>
              <span class="stat-label">Total Clubs</span>
            </div>
          </div>
          
          <div class="stat-card glass-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe, #00f2fe)">
              <i class="fas fa-calendar-check"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value">${stats.activeEvents}</span>
              <span class="stat-label">Active Events</span>
            </div>
          </div>
          
          <div class="stat-card glass-card">
            <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b, #38f9d7)">
              <i class="fas fa-user-shield"></i>
            </div>
            <div class="stat-info">
              <span class="stat-value">${stats.safModerators}</span>
              <span class="stat-label">SAF Mods</span>
            </div>
          </div>
        </div>

        <div class="overview-sections">
          <div class="overview-section glass-card">
            <h3><i class="fas fa-bolt"></i> Quick Actions</h3>
            <div class="quick-actions">
              <button class="quick-action-btn" data-action="create-club">
                <i class="fas fa-plus-circle"></i>
                Create Club
              </button>
              <button class="quick-action-btn" data-action="add-saf">
                <i class="fas fa-user-plus"></i>
                Add SAF Mod
              </button>
              <button class="quick-action-btn" data-action="rebuild-stats">
                <i class="fas fa-sync-alt"></i>
                Rebuild Stats
              </button>
            </div>
          </div>

          <div class="overview-section glass-card">
            <h3><i class="fas fa-history"></i> Recent Activity</h3>
            <div class="recent-activity">
              ${
                stats.recentActivity.length > 0
                  ? stats.recentActivity
                      .map(
                        (a) => `
                    <div class="activity-item">
                      <i class="fas fa-${this.getActivityIcon(a.type)}"></i>
                      <span>${a.message}</span>
                      <time>${this.formatTimeAgo(a.timestamp)}</time>
                    </div>
                  `
                      )
                      .join("")
                  : '<p class="no-activity">No recent activity</p>'
              }
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup quick action handlers
    contentEl.querySelectorAll(".quick-action-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.handleQuickAction(btn.dataset.action)
      );
    });
  }

  async fetchDashboardStats() {
    try {
      // Get universities count
      const uniSnap = await getDocs(collection(db, "universities"));

      // Get clubs count
      const clubsSnap = await getDocs(collection(db, "clubs"));

      // Get active events (within next 7 days)
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      // Note: Simplified query - in production would filter by date
      const eventsSnap = await getDocs(collection(db, "clubEvents"));
      const activeEvents = eventsSnap.docs.filter((d) => {
        const eventDate = d.data().startTime?.toDate?.();
        return eventDate && eventDate >= now && eventDate <= weekFromNow;
      });

      // Get SAF moderators count
      const safSnap = await getDocs(collection(db, "safModerators"));
      // Recent admin activity (latest 10 actions)
      let recentActivity = [];
      try {
        const activityQuery = query(
          collection(db, "adminActivity"),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        const activitySnap = await getDocs(activityQuery);
        recentActivity = activitySnap.docs.map((d) => {
          const data = d.data() || {};
          return {
            type: data.type || "default",
            message: this.buildActivityMessage(data),
            timestamp: data.createdAt || null,
          };
        });
      } catch (activityError) {
        logManager.warn("AdminPage: Failed to fetch recent admin activity", {
          message: activityError?.message,
        });
      }

      return {
        universities: uniSnap.size,
        totalClubs: clubsSnap.size,
        activeEvents: activeEvents.length,
        safModerators: safSnap.size,
        recentActivity,
      };
    } catch (error) {
      logManager.error("Error fetching dashboard stats", error);
      return {
        universities: 0,
        totalClubs: 0,
        activeEvents: 0,
        safModerators: 0,
        recentActivity: [],
      };
    }
  }

  getActivityIcon(type) {
    const icons = {
      club_created: "plus-circle",
      saf_added: "user-plus",
      event_approved: "check-circle",
      maintenance_rebuild_stats: "tools",
      maintenance_cleanup_events: "trash",
      maintenance_verify_data: "search",
      maintenance_cleanup_notifications: "bell-slash",
      club_deleted: "trash",
      default: "info-circle",
    };
    return icons[type] || icons.default;
  }

  buildActivityMessage(activity) {
    const { type } = activity;
    switch (type) {
      case "club_created":
        return `New club "${activity.name || activity.clubId}" created`;
      case "club_deleted":
        return `Club "${activity.name || activity.clubId}" deleted`;
      case "club_updated":
        return `Club "${activity.name || activity.clubId}" updated`;
      case "club_president_assigned":
        return `President assigned for club ${activity.clubId}`;
      case "saf_added":
        return `SAF moderator added (${activity.moderatorUid})`;
      case "saf_removed":
        return `SAF moderator removed (${activity.moderatorUid})`;
      case "maintenance_rebuild_stats":
        return `Rebuilt club statistics for ${activity.clubsUpdated || 0} clubs`;
      case "maintenance_cleanup_events":
        return `Cleaned up ${activity.deleted || 0} old events`;
      case "maintenance_verify_data":
        return `Data integrity check found ${activity.issues || 0} issues`;
      case "maintenance_cleanup_notifications":
        return `Deleted ${activity.deleted || 0} old notifications`;
      default:
        return activity.message || "Admin action";
    }
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  handleQuickAction(action) {
    switch (action) {
      case "create-club":
        // Switch to clubs tab and open create modal
        this.rootEl.querySelector('[data-tab="clubs"]').click();
        setTimeout(() => this.openCreateClubModal(), 300);
        break;
      case "add-saf":
        this.rootEl.querySelector('[data-tab="saf"]').click();
        setTimeout(() => this.openAddSafModal(), 300);
        break;
      case "rebuild-stats":
        this.rebuildStats();
        break;
    }
  }

  // ==========================================
  // UNIVERSITIES TAB
  // ==========================================

  async renderUniversitiesTab(contentEl) {
    const universities = await this.fetchUniversities();
    logManager.info("AdminPage: Rendering universities tab", {
      count: universities.length,
    });

    contentEl.innerHTML = `
      <div class="admin-universities">
        <div class="section-header">
          <h2><i class="fas fa-university"></i> Universities</h2>
          <button class="btn-add-university">
            <i class="fas fa-plus"></i> Add University
          </button>
        </div>

        <div class="universities-list">
          ${
            universities.length > 0
              ? universities
                  .map(
                    (uni) => `
                <div class="university-card glass-card" data-id="${uni.id}">
                  <div class="uni-info">
                    <h3>${uni.name}</h3>
                    <p>${uni.domain || "No domain set"}</p>
                    <div class="uni-stats">
                      <span><i class="fas fa-users"></i> ${
                        uni.clubCount || 0
                      } clubs</span>
                      <span><i class="fas fa-user-shield"></i> ${
                        uni.safCount || 0
                      } SAF mods</span>
                    </div>
                  </div>
                  <div class="uni-actions">
                    <button class="btn-edit" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete" title="Delete"><i class="fas fa-trash"></i></button>
                  </div>
                </div>
              `
                  )
                  .join("")
              : '<div class="empty-state"><i class="fas fa-university"></i><p>No universities configured</p></div>'
          }
        </div>
      </div>
    `;

    // Setup handlers
    contentEl
      .querySelector(".btn-add-university")
      ?.addEventListener("click", () => {
        this.openAddUniversityModal();
      });

    contentEl.querySelectorAll(".university-card").forEach((card) => {
      card.querySelector(".btn-edit")?.addEventListener("click", () => {
        this.openEditUniversityModal(card.dataset.id);
      });
      card.querySelector(".btn-delete")?.addEventListener("click", () => {
        this.confirmDeleteUniversity(card.dataset.id);
      });
    });
  }

  async fetchUniversities() {
    try {
      const snap = await getDocs(collection(db, "universities"));
      const universities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      logManager.info("AdminPage: Fetched universities", {
        count: universities.length,
        ids: universities.map((u) => u.id),
      });
      return universities;
    } catch (error) {
      logManager.error("Error fetching universities", error);
      return [];
    }
  }

  openAddUniversityModal() {
    this.showModal({
      title: "Add University",
      content: `
        <form class="admin-form" id="add-university-form">
          <div class="form-group">
            <label>University Name</label>
            <input type="text" name="name" required placeholder="e.g., Stanford University">
          </div>
          <div class="form-group">
            <label>Email Domain</label>
            <input type="text" name="domain" required placeholder="e.g., stanford.edu">
          </div>
          <div class="form-group">
            <label>Short Code</label>
            <input type="text" name="code" required placeholder="e.g., STANFORD" maxlength="20">
          </div>
        </form>
      `,
      confirmText: "Add University",
      onConfirm: async () => {
        const form = document.getElementById("add-university-form");
        const formData = new FormData(form);

        const code = formData.get("code");
        const name = formData.get("name");
        const domain = formData.get("domain");
        logManager.info("AdminPage: Creating university via dashboard", {
          code,
          name,
          domain,
        });

        await adminCreateUniversity({ code, name, domain });

        logManager.info("AdminPage: University created", { code });
        await this.loadTabContent("universities");
      },
    });
  }

  openEditUniversityModal(id) {
    this.showModal({
      title: "Edit University",
      content: `
        <form class="admin-form" id="edit-university-form">
          <div class="form-group">
            <label>University Name</label>
            <input type="text" name="name" required placeholder="University name">
          </div>
          <div class="form-group">
            <label>Email Domain</label>
            <input type="text" name="domain" required placeholder="e.g., iub.edu.bd">
          </div>
          <div class="form-group">
            <label>Short Code</label>
            <input type="text" name="code" value="${id}" disabled>
          </div>
        </form>
      `,
      confirmText: "Save Changes",
      onConfirm: async () => {
        const form = document.getElementById("edit-university-form");
        const formData = new FormData(form);
        const name = formData.get("name");
        const domain = formData.get("domain");

        logManager.info("AdminPage: Updating university via dashboard", {
          id,
          name,
          domain,
        });

        await adminUpdateUniversity(id, { name, domain });
        await this.loadTabContent("universities");
      },
    });

    // Populate current values asynchronously
    (async () => {
      try {
        const uniSnap = await getDoc(doc(db, "universities", id));
        const data = uniSnap.data() || {};
        const form = document.getElementById("edit-university-form");
        if (!form) return;
        form.elements.name.value = data.name || id;
        form.elements.domain.value = data.domain || "";
      } catch (error) {
        logManager.error("AdminPage: Failed to load university for edit", {
          id,
          error,
        });
      }
    })();
  }

  async confirmDeleteUniversity(id) {
    if (confirm(`Delete university "${id}"? This cannot be undone.`)) {
      logManager.warn("AdminPage: Deleting university via dashboard", { id });
      await adminDeleteUniversity(id);
      await this.loadTabContent("universities");
    }
  }

  // ==========================================
  // SAF MODERATORS TAB
  // ==========================================

  async renderSafTab(contentEl) {
    const universities = await this.fetchUniversities();
    const safMods = await this.fetchSafModerators();
    logManager.info("AdminPage: Rendering SAF tab", {
      universities: universities.length,
      moderators: safMods.length,
    });

    contentEl.innerHTML = `
      <div class="admin-saf">
        <div class="section-header">
          <h2><i class="fas fa-user-shield"></i> SAF Moderators</h2>
          <button class="btn-add-saf">
            <i class="fas fa-user-plus"></i> Add SAF Mod
          </button>
        </div>

        <div class="saf-filter">
          <select id="saf-university-filter">
            <option value="">All Universities</option>
            ${universities
              .map((u) => `<option value="${u.id}">${u.name}</option>`)
              .join("")}
          </select>
        </div>

        <div class="saf-list">
          ${
            safMods.length > 0
              ? safMods
                  .map(
                    (mod) => `
                <div class="saf-card glass-card" data-id="${mod.id}">
                  <div class="saf-avatar">
                    ${
                      mod.photoURL
                        ? `<img src="${mod.photoURL}" alt="${mod.displayName}">`
                        : `<i class="fas fa-user-shield"></i>`
                    }
                  </div>
                  <div class="saf-info">
                    <h3>${mod.displayName || "Unknown"}</h3>
                    <p>${mod.email || mod.uid}</p>
                    <span class="saf-university">${
                      mod.universityName || "All"
                    }</span>
                    ${
                      mod.activityStats
                        ? `<div class="saf-stats">
                             <span>Clubs created: ${
                               mod.activityStats.clubsCreated
                             }</span>
                             <span>Events approved: ${
                               mod.activityStats.eventsApproved
                             }</span>
                           </div>`
                        : ""
                    }
                  </div>
                  <div class="saf-actions">
                    <button class="btn-remove" title="Remove SAF">
                      <i class="fas fa-user-minus"></i>
                    </button>
                  </div>
                </div>
              `
                  )
                  .join("")
              : '<div class="empty-state"><i class="fas fa-user-shield"></i><p>No SAF moderators assigned</p></div>'
          }
        </div>
      </div>
    `;

    // Setup handlers
    contentEl.querySelector(".btn-add-saf")?.addEventListener("click", () => {
      this.openAddSafModal();
    });

    contentEl.querySelectorAll(".saf-card .btn-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest(".saf-card");
        this.confirmRemoveSaf(card.dataset.id);
      });
    });

    // Filter handler
    contentEl
      .querySelector("#saf-university-filter")
      ?.addEventListener("change", (e) => {
        this.filterSafByUniversity(e.target.value);
      });
  }

  async fetchSafModerators() {
    try {
      const snap = await getDocs(collection(db, "safModerators"));
      const moderators = [];

      for (const docSnap of snap.docs) {
        const base = { id: docSnap.id, ...docSnap.data() };
        const uid = base.id;

        // Compute simple activity stats for SAF moderators:
        // - Number of events they SAF-approved
        // - Number of clubs they created
        try {
          const eventsQuery = query(
            collectionGroup(db, "events"),
            where("safApprovedBy", "==", uid)
          );
          const eventsSnap = await getDocs(eventsQuery);

          const clubsQuery = query(
            collection(db, "clubs"),
            where("createdBy", "==", uid)
          );
          const clubsSnap = await getDocs(clubsQuery);

          base.activityStats = {
            eventsApproved: eventsSnap.size,
            clubsCreated: clubsSnap.size,
          };
        } catch (statsError) {
          // If stats fail (e.g., missing index), log but do not block SAF list.
          logManager.warn("AdminPage: Failed to compute SAF activity stats", {
            uid,
            message: statsError?.message,
          });
        }

        moderators.push(base);
      }

      logManager.info("AdminPage: Fetched SAF moderators", {
        count: moderators.length,
      });
      return moderators;
    } catch (error) {
      logManager.error("Error fetching SAF moderators", error);
      return [];
    }
  }

  openAddSafModal() {
    this.showModal({
      title: "Add SAF Moderator",
      content: `
        <form class="admin-form" id="add-saf-form">
          <div class="form-group">
            <label>User UID</label>
            <input type="text" name="uid" required placeholder="Firebase User UID">
          </div>
          <div class="form-group">
            <label>Display Name</label>
            <input type="text" name="displayName" placeholder="Optional display name">
          </div>
          <div class="form-group">
            <label>University (optional)</label>
            <select name="university">
              <option value="">All Universities</option>
              <!-- Would be populated with universities -->
            </select>
          </div>
        </form>
      `,
      confirmText: "Add SAF Mod",
      onConfirm: async () => {
        const form = document.getElementById("add-saf-form");
        const formData = new FormData(form);
        const uid = formData.get("uid");
        const universityId = formData.get("university") || null;
        const displayName = formData.get("displayName") || null;

        logManager.info("AdminPage: Adding SAF moderator", {
          uid,
          universityId,
        });

        await adminAddSafModerator({
          uid,
          displayName,
          universityId,
          addedBy: currentUser.profile?.uid,
        });

        await this.loadTabContent("saf");
      },
    });
  }

  async confirmRemoveSaf(id) {
    if (confirm("Remove this SAF moderator?")) {
      logManager.warn("AdminPage: Removing SAF moderator", { id });
      await adminRemoveSafModerator(id);
      await this.loadTabContent("saf");
    }
  }

  filterSafByUniversity(universityId) {
    const cards = this.rootEl.querySelectorAll(".saf-card");
    cards.forEach((card) => {
      const uni = card.querySelector(".saf-university").textContent;
      if (!universityId || uni === universityId || uni === "All") {
        card.style.display = "";
      } else {
        card.style.display = "none";
      }
    });
  }

  // ==========================================
  // CLUBS TAB
  // ==========================================

  async renderClubsTab(contentEl) {
    const clubs = await this.fetchClubs();
    const universities = await this.fetchUniversities();
    logManager.info("AdminPage: Rendering clubs tab", {
      clubs: clubs.length,
      universities: universities.length,
    });

    contentEl.innerHTML = `
      <div class="admin-clubs">
        <div class="section-header">
          <h2><i class="fas fa-users"></i> Club Management</h2>
          <button class="btn-create-club">
            <i class="fas fa-plus"></i> Create Club
          </button>
        </div>

        <div class="clubs-filters">
          <input type="text" id="club-search" placeholder="Search clubs...">
          <select id="club-university-filter">
            <option value="">All Universities</option>
            ${universities
              .map((u) => `<option value="${u.id}">${u.name}</option>`)
              .join("")}
          </select>
        </div>

        <div class="clubs-table-container">
          <table class="clubs-table">
            <thead>
              <tr>
                <th>Club Name</th>
                <th>University</th>
                <th>President</th>
                <th>Members</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${clubs
                .map(
                  (club) => `
                <tr data-id="${club.id}">
                  <td>
                    <div class="club-name-cell">
                      ${
                        club.logoUrl
                          ? `<img src="${club.logoUrl}" alt="" class="club-logo-small">`
                          : `<div class="club-logo-placeholder"><i class="fas fa-users"></i></div>`
                      }
                      <span>${club.name}</span>
                    </div>
                  </td>
                  <td>${club.universityId || "N/A"}</td>
                  <td>${club.presidentName || "None"}</td>
                  <td>${club.memberCount || 0}</td>
                  <td>
                    <span class="status-badge ${
                      club.isActive !== false ? "active" : "inactive"
                    }">
                      ${club.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td class="actions-cell">
                    <button class="btn-icon btn-edit" title="Edit">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-president" title="Assign President">
                      <i class="fas fa-crown"></i>
                    </button>
                    <button class="btn-icon btn-delete" title="Delete">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
          ${
            clubs.length === 0
              ? '<div class="empty-state"><i class="fas fa-users"></i><p>No clubs found</p></div>'
              : ""
          }
        </div>
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
        this.openAssignPresidentModal(row.dataset.id);
      });
      row.querySelector(".btn-delete")?.addEventListener("click", () => {
        this.confirmDeleteClub(row.dataset.id);
      });
    });
  }

  async fetchClubs() {
    try {
      const snap = await getDocs(collection(db, "clubs"));
      const clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      logManager.info("AdminPage: Fetched clubs", {
        count: clubs.length,
      });
      return clubs;
    } catch (error) {
      logManager.error("Error fetching clubs", error);
      return [];
    }
  }

  async openCreateClubModal() {
    let universities = [];
    try {
      universities = await this.fetchUniversities();
      logManager.info("AdminPage: Opening create club modal", {
        universities: universities.length,
      });
    } catch (error) {
      logManager.error(
        "AdminPage: Failed to fetch universities for create club modal",
        error
      );
    }

    const optionsHtml =
      universities.length > 0
        ? universities
            .map(
              (u) =>
                `<option value="${u.id}">${u.name || u.id}</option>`
            )
            .join("")
        : "";

    this.showModal({
      title: "Create New Club",
      content: `
        <form class="admin-form" id="create-club-form">
          <div class="form-group">
            <label>Club Name *</label>
            <input type="text" name="name" required placeholder="Enter club name">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" rows="3" placeholder="Brief description"></textarea>
          </div>
          <div class="form-group">
            <label>University *</label>
            <select name="universityId" required>
              <option value="">Select university</option>
              ${optionsHtml}
            </select>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select name="category">
              <option value="academic">Academic</option>
              <option value="social">Social</option>
              <option value="sports">Sports</option>
              <option value="arts">Arts & Culture</option>
              <option value="tech">Technology</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Accent Color</label>
            <div class="accent-color-options">
              <button type="button" class="color-option" data-color="blue">Blue</button>
              <button type="button" class="color-option" data-color="purple">Purple</button>
              <button type="button" class="color-option" data-color="green">Green</button>
              <button type="button" class="color-option" data-color="orange">Orange</button>
              <button type="button" class="color-option" data-color="pink">Pink</button>
            </div>
            <input type="hidden" name="accentColor" value="blue" />
          </div>
          <div class="form-group">
            <label>Logo (optional)</label>
            <input type="file" name="logo" accept="image/*" />
          </div>
          <div class="form-group">
            <label>Banner (optional)</label>
            <input type="file" name="banner" accept="image/*" />
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="requireSafApproval" />
              Require SAF approval for events
            </label>
          </div>
        </form>
      `,
      confirmText: "Create Club",
      onConfirm: async () => {
        const form = document.getElementById("create-club-form");
        const formData = new FormData(form);

        const name = formData.get("name");
        const description = formData.get("description") || "";
        const universityId = formData.get("universityId");
        const category = formData.get("category");
        const accentColor = formData.get("accentColor") || "blue";
        const requireSafApproval =
          formData.get("requireSafApproval") === "on";

        const logoInput = form.querySelector('input[name="logo"]');
        const bannerInput = form.querySelector('input[name="banner"]');
        const logoFile = logoInput?.files?.[0] || null;
        const bannerFile = bannerInput?.files?.[0] || null;

        const selectedUniversity =
          universities.find((u) => u.id === universityId) || null;
        const universityName =
          selectedUniversity?.name || selectedUniversity?.id || universityId;

        // Generate a stable clubId so we can upload assets before creating the document
        const clubId = this.generateClubId(name);

        let logoUrl = null;
        let bannerUrl = null;

        try {
          if (logoFile) {
            const logoBlob = await processClubLogo(logoFile);
            logoUrl = await uploadClubLogo(clubId, logoBlob);
          }
          if (bannerFile) {
            const bannerBlob = await processClubBanner(bannerFile);
            bannerUrl = await uploadClubBanner(clubId, bannerBlob);
          }
        } catch (imageError) {
          logManager.warn(
            "AdminPage: Failed to upload one or more club images",
            imageError
          );
        }

        logManager.info("AdminPage: Creating club via dashboard", {
          name,
          universityId,
        });

        await createClub({
          clubId,
          name,
          description,
          universityId,
          universityName,
          category,
          createdBy: currentUser.profile?.uid,
          accentColor,
          requireSafApproval,
          logoUrl,
          bannerUrl,
        });

        logManager.info("AdminPage: Club created via dashboard", {
          name,
          universityId,
        });

        await this.loadTabContent("clubs");
      },
    });

    // Wire up accent color picker buttons inside the modal
    const formEl = document.getElementById("create-club-form");
    if (formEl) {
      const colorButtons = formEl.querySelectorAll(".color-option");
      const hiddenInput = formEl.querySelector(
        'input[name="accentColor"]'
      );
      colorButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const color = btn.dataset.color;
          if (hiddenInput) hiddenInput.value = color;
          colorButtons.forEach((b) =>
            b.classList.toggle("selected", b === btn)
          );
        });
      });
    }
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

  openEditClubModal(clubId) {
    this.showModal({
      title: "Edit Club",
      content: `
        <form class="admin-form" id="edit-club-form">
          <div class="form-group">
            <label>Club Name *</label>
            <input type="text" name="name" required placeholder="Club name">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea name="description" rows="3" placeholder="Brief description"></textarea>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select name="category">
              <option value="academic">Academic</option>
              <option value="social">Social</option>
              <option value="sports">Sports</option>
              <option value="arts">Arts & Culture</option>
              <option value="tech">Technology</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <label class="inline-checkbox">
              <input type="checkbox" name="isActive" checked />
              Active (visible in Clubs UI)
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="requireSafApproval" />
              Require SAF approval for events
            </label>
          </div>
        </form>
      `,
      confirmText: "Save Changes",
      onConfirm: async () => {
        const form = document.getElementById("edit-club-form");
        const formData = new FormData(form);
        const name = formData.get("name");
        const description = formData.get("description") || "";
        const category = formData.get("category");
        const isActive = formData.get("isActive") === "on";
        const requireSafApproval =
          formData.get("requireSafApproval") === "on";

        logManager.info("AdminPage: Updating club from dashboard", {
          clubId,
          name,
          isActive,
          requireSafApproval,
        });

        await adminUpdateClub(clubId, {
          name,
          description,
          category,
          isActive,
          requireSafApproval,
        });

        await this.loadTabContent("clubs");
      },
    });

    // Populate current values asynchronously
    (async () => {
      try {
        const clubSnap = await getDoc(doc(db, "clubs", clubId));
        const data = clubSnap.data() || {};
        const form = document.getElementById("edit-club-form");
        if (!form) return;

        form.elements.name.value = data.name || "";
        form.elements.description.value = data.description || "";
        if (form.elements.category) {
          form.elements.category.value = data.category || "other";
        }
        if (form.elements.isActive) {
          form.elements.isActive.checked = data.isActive !== false;
        }
        if (form.elements.requireSafApproval) {
          form.elements.requireSafApproval.checked =
            data.requireSafApproval === true;
        }
      } catch (error) {
        logManager.error("AdminPage: Failed to load club for edit", {
          clubId,
          error,
        });
      }
    })();
  }

  openAssignPresidentModal(clubId) {
    this.showModal({
      title: "Assign President",
      content: `
        <form class="admin-form" id="assign-president-form">
          <div class="form-group">
            <label>President UID</label>
            <input type="text" name="uid" required placeholder="Firebase User UID">
          </div>
          <p class="form-hint">
            <i class="fas fa-info-circle"></i>
            The user must be an existing member of the club or will be added as president.
          </p>
        </form>
      `,
      confirmText: "Assign",
      onConfirm: async () => {
        const form = document.getElementById("assign-president-form");
        const uid = new FormData(form).get("uid");
        logManager.info("AdminPage: Assigning president from dashboard", {
          clubId,
          uid,
        });
        await adminAssignPresident(clubId, uid);
        logManager.info("AdminPage: President assigned from dashboard", {
          clubId,
          uid,
        });
        await this.loadTabContent("clubs");
      },
    });
  }

  async confirmDeleteClub(clubId) {
    if (
      confirm(
        `Delete club "${clubId}"? This will remove all club data including events and memberships.`
      )
    ) {
      logManager.warn("AdminPage: Deleting club from dashboard", { clubId });
      await adminDeleteClub(clubId);
      logManager.info("AdminPage: Club deleted from dashboard", { clubId });
      await this.loadTabContent("clubs");
    }
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
  // MAINTENANCE TAB
  // ==========================================

  async renderMaintenanceTab(contentEl) {
    contentEl.innerHTML = `
      <div class="admin-maintenance">
        <div class="section-header">
          <h2><i class="fas fa-tools"></i> Maintenance Tools</h2>
        </div>

        <div class="maintenance-grid">
          <div class="maintenance-card glass-card">
            <div class="maintenance-icon">
              <i class="fas fa-sync-alt"></i>
            </div>
            <h3>Rebuild Stats</h3>
            <p>Recalculate all club member counts, event counts, and other statistics.</p>
            <button class="btn-maintenance" data-action="rebuild-stats">
              Run Rebuild
            </button>
          </div>

          <div class="maintenance-card glass-card">
            <div class="maintenance-icon">
              <i class="fas fa-broom"></i>
            </div>
            <h3>Cleanup Old Events</h3>
            <p>Remove events older than 30 days that are no longer relevant.</p>
            <button class="btn-maintenance" data-action="cleanup-events">
              Run Cleanup
            </button>
          </div>

          <div class="maintenance-card glass-card">
            <div class="maintenance-icon">
              <i class="fas fa-comments"></i>
            </div>
            <h3>Clear Expired Live Chat</h3>
            <p>Delete all live chat messages that are past their expiry time.</p>
            <button class="btn-maintenance" data-action="cleanup-livechat">
              Run Cleanup
            </button>
          </div>

          <div class="maintenance-card glass-card">
            <div class="maintenance-icon">
              <i class="fas fa-database"></i>
            </div>
            <h3>Verify Data Integrity</h3>
            <p>Check for orphaned records, missing references, and data inconsistencies.</p>
            <button class="btn-maintenance" data-action="verify-data">
              Run Verification
            </button>
          </div>

          <div class="maintenance-card glass-card">
            <div class="maintenance-icon">
              <i class="fas fa-bell-slash"></i>
            </div>
            <h3>Clear Old Notifications</h3>
            <p>Remove read notifications older than 7 days.</p>
            <button class="btn-maintenance" data-action="cleanup-notifications">
              Run Cleanup
            </button>
          </div>

          <div class="maintenance-card glass-card">
            <div class="maintenance-icon">
              <i class="fas fa-calendar-times"></i>
            </div>
            <h3>Clear University Schedules</h3>
            <p>Clear all student schedules for a specific university (semester reset).</p>
            <div class="maintenance-field">
              <select id="maintenance-university-select">
                <option value="">Select university</option>
              </select>
            </div>
            <button class="btn-maintenance" data-action="clear-schedules">
              Clear Schedules
            </button>
          </div>

          <div class="maintenance-card glass-card">
            <div class="maintenance-icon">
              <i class="fas fa-sync"></i>
            </div>
            <h3>Sync Denormalized Data</h3>
            <p>Re-sync cached user info in clubs, events, and memberships.</p>
            <button class="btn-maintenance" data-action="sync-denormalized">
              Run Sync
            </button>
          </div>
        </div>

        <div class="maintenance-log glass-card">
          <h3><i class="fas fa-terminal"></i> Maintenance Log</h3>
          <div class="log-output" id="maintenance-log">
            <p class="log-placeholder">Run a maintenance task to see output here...</p>
          </div>
        </div>
      </div>
    `;

    // Populate university dropdown for semester reset
    try {
      const universities = await this.fetchUniversities();
      const selectEl = contentEl.querySelector(
        "#maintenance-university-select"
      );
      if (selectEl && universities.length > 0) {
        universities.forEach((u) => {
          const opt = document.createElement("option");
          opt.value = u.id;
          opt.textContent = u.name || u.id;
          selectEl.appendChild(opt);
        });
      }
    } catch (error) {
      logManager.warn(
        "AdminPage: Failed to load universities for maintenance tools",
        error
      );
    }

    // Setup maintenance action handlers
    contentEl.querySelectorAll(".btn-maintenance").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.runMaintenanceTask(btn.dataset.action);
      });
    });
  }

  async runMaintenanceTask(action) {
    const logEl = this.rootEl.querySelector("#maintenance-log");
    const log = (message, type = "info") => {
      const timestamp = new Date().toLocaleTimeString();
      const className =
        type === "error"
          ? "log-error"
          : type === "success"
          ? "log-success"
          : "log-info";
      logEl.innerHTML += `<div class="log-entry ${className}">[${timestamp}] ${message}</div>`;
      logEl.scrollTop = logEl.scrollHeight;
    };

    logEl.innerHTML = ""; // Clear previous logs
    log(`Starting ${action}...`);

    try {
      switch (action) {
        case "rebuild-stats":
          await this.rebuildStats(log);
          break;
        case "cleanup-events":
          await this.cleanupOldEvents(log);
          break;
        case "verify-data":
          await this.verifyDataIntegrity(log);
          break;
        case "cleanup-notifications":
          await this.cleanupNotifications(log);
          break;
        case "clear-schedules":
          await this.clearUniversitySchedules(log);
          break;
        case "cleanup-livechat":
          await this.cleanupLiveChat(log);
          break;
        case "sync-denormalized":
          await this.syncDenormalizedData(log);
          break;
      }
      log("✓ Task completed successfully!", "success");
    } catch (error) {
      log(`✗ Error: ${error.message}`, "error");
      logManager.error("Maintenance task error", error);
    }
  }

  async rebuildStats(log = console.log) {
    await adminRebuildClubStats(log);
  }

  async cleanupOldEvents(log) {
    log("Cleaning up old events via Cloud Function...");
    try {
      const { getFunctions, httpsCallable, connectFunctionsEmulator } =
        await import("firebase/functions");
      const { default: app } = await import(
        "../lib/firebase/firebase-config.js"
      );
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

      const callable = httpsCallable(functions, "runAdminCleanup");
      const res = await callable({ type: "events" });
      log(`Deleted ${res?.data?.deleted ?? "N/A"} old events.`);
    } catch (error) {
      log("Failed to clean up events via Cloud Function", "error");
      // Fallback to client-side cleanup if Cloud Function fails
      try {
        const deleted = await adminCleanupOldEvents(30, log);
        log(`Fallback: deleted ${deleted} events via client-side cleanup.`);
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  async verifyDataIntegrity(log) {
    await adminVerifyDataIntegrityService(log);
  }

  async cleanupNotifications(log) {
    await adminCleanupOldNotifications(7, log);
  }

  async clearUniversitySchedules(log) {
    const selectEl = this.rootEl.querySelector(
      "#maintenance-university-select"
    );
    const universityId = selectEl?.value;
    if (!universityId) {
      log("Please select a university before clearing schedules.", "error");
      throw new Error("No university selected");
    }

    log(`Clearing schedules for university: ${universityId}...`);

    try {
      const { getFunctions, httpsCallable, connectFunctionsEmulator } =
        await import("firebase/functions");
      const { default: app } = await import(
        "../lib/firebase/firebase-config.js"
      );
      const functions = getFunctions(app, "us-central1");

      const isLocal =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");
      if (isLocal) {
        try {
          connectFunctionsEmulator(functions, "localhost", 5001);
        } catch (_) {
          // ignore if already connected
        }
      }

      const callable = httpsCallable(functions, "clearUniversitySchedules");
      const res = await callable({ university: universityId });
      log(
        `Cleared schedules for ${
          res?.data?.cleared ?? "N/A"
        } users in ${universityId}.`
      );
    } catch (error) {
      log("Failed to clear university schedules via Cloud Function", "error");
      throw error;
    }
  }

  async cleanupLiveChat(log) {
    log("Cleaning up expired live chat messages via Cloud Function...");
    try {
      const { getFunctions, httpsCallable, connectFunctionsEmulator } =
        await import("firebase/functions");
      const { default: app } = await import(
        "../lib/firebase/firebase-config.js"
      );
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

      const callable = httpsCallable(functions, "runAdminCleanup");
      const res = await callable({ type: "liveChat" });
      log(
        `Deleted ${res?.data?.deleted ?? "N/A"} expired live chat messages.`
      );
    } catch (error) {
      log("Failed to clean up live chat via Cloud Function", "error");
      throw error;
    }
  }

  async syncDenormalizedData(log) {
    log("Running full denormalized data sync via Cloud Function...");
    try {
      const { getFunctions, httpsCallable, connectFunctionsEmulator } =
        await import("firebase/functions");
      const { default: app } = await import(
        "../lib/firebase/firebase-config.js"
      );
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

      const callable = httpsCallable(functions, "syncDenormalizedData");
      const res = await callable({});
      log(
        `Synced denormalized data for ${
          res?.data?.processed ?? "N/A"
        } user profiles.`
      );
    } catch (error) {
      log("Failed to run denormalized data sync via Cloud Function", "error");
      throw error;
    }
  }

  // ==========================================
  // MODAL HELPER
  // ==========================================

  showModal({ title, content, confirmText = "Confirm", onConfirm }) {
    // Remove existing modal if any
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
          <button class="btn-confirm">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    const close = () => modal.remove();
    modal.querySelector(".modal-close").addEventListener("click", close);
    modal.querySelector(".btn-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    // Confirm handler
    modal.querySelector(".btn-confirm").addEventListener("click", async () => {
      try {
        modal.querySelector(".btn-confirm").disabled = true;
        modal.querySelector(".btn-confirm").innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Processing...';
        await onConfirm();
        close();
      } catch (error) {
        logManager.error("Modal action error", error);
        alert("An error occurred. Please try again.");
        modal.querySelector(".btn-confirm").disabled = false;
        modal.querySelector(".btn-confirm").innerHTML = confirmText;
      }
    });
  }

  /**
   * Cleanup on unmount
   */
  unmount() {
    this.isVerified = false;
    this.cachedData = {};
    logManager.debug("AdminPage unmounted");
  }
}

export default AdminPage;

// Wire AdminPage to SPA router lifecycle
let _adminPageInstance = null;

document.addEventListener("spa:page:unload", (event) => {
  const route = event?.detail?.route;
  if (route === "admin" && _adminPageInstance) {
    _adminPageInstance.unmount();
    _adminPageInstance = null;
  }
});

document.addEventListener("spa:page:load", async (event) => {
  const route = event?.detail?.route;
  if (route !== "admin") return;

  const root =
    document.querySelector("#admin-root") ||
    document.querySelector(".main-content");
  if (!root) {
    logManager.error("AdminPage: root element not found");
    return;
  }

  _adminPageInstance = new AdminPage();
  await _adminPageInstance.mount(root);
});
