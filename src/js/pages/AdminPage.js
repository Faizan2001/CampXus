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
  runAutomationJob as adminRunAutomationJob,
} from "../services/admin/AdminService.js";
import { renderUserSearchAssign } from "../components/shared/UserSearchAssign.js";
import {
  uploadClubLogo,
  uploadClubBanner,
} from "../services/clubs/ClubImageService.js";
import { ClubCreatorModal } from "../components/clubs/ClubCreatorModal.js";

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
      <div class="admin-page admin-super">
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
      </div>
    `;
  }

  /**
   * Render PIN verification screen
   */
  renderPinVerification() {
    const container = this.rootEl;
    container.innerHTML = `
      <div class="admin-page admin-super">
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
    const message = `Too many incorrect attempts. Please try again in ${remainingMinutes} minute${
      remainingMinutes > 1 ? "s" : ""
    }.`;

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
      <div class="admin-page admin-super">
        <div class="admin-dashboard">
          <header class="admin-header">
            <!-- Back button for mobile (visible when top-nav is hidden) -->
            <a href="#clubs" class="admin-back-btn" aria-label="Back to Clubs">
              <i class="fas fa-arrow-left"></i>
            </a>
            <div class="admin-title">
              <i class="fas fa-crown"></i>
              <h1>Super Admin Dashboard</h1>
            </div>
            <div class="admin-user">
              <span>${currentUser.profile?.displayName || "Admin"}</span>
              <div class="admin-badge">
                <i class="fas fa-shield-alt"></i> <span>Super Admin</span>
              </div>
            </div>
          </header>

          <nav class="admin-tabs" data-active-tab="overview">
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
            <button class="admin-tab" data-tab="automation">
              <i class="fas fa-robot"></i>
              <span>Automation</span>
            </button>
          </nav>

          <div class="admin-content">
            <!-- Tab content loaded here -->
          </div>
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

        // Update data-active-tab for pill animation
        const tabsNav = container.querySelector(".admin-tabs");
        if (tabsNav) {
          tabsNav.dataset.activeTab = tab.dataset.tab;
        }

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
        case "automation":
          await this.renderAutomationTab(contentEl);
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
                    <div class="activity-item" style="border-left: 4px solid ${this.getActivityColor(
                      a.type
                    )};">
                      <i class="fas fa-${this.getActivityIcon(
                        a.type
                      )}" style="color:${this.getActivityColor(a.type)};"></i>
                      <span class="activity-text">${a.message}</span>
                      <span class="activity-tag" style="background:${this.getActivityColor(
                        a.type
                      )}1A; color:${this.getActivityColor(a.type)};">
                        ${a.type}
                      </span>
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
      club_president_assigned: "crown",
      club_official_assigned: "star",
      saf_added: "user-plus",
      event_approved: "check-circle",
      automation_job_run: "robot",
      maintenance_rebuild_stats: "tools",
      maintenance_cleanup_events: "trash",
      maintenance_verify_data: "search",
      maintenance_cleanup_notifications: "bell-slash",
      club_deleted: "trash",
      default: "info-circle",
    };
    return icons[type] || icons.default;
  }

  getActivityColor(type) {
    const colors = {
      club_created: "#34d399",
      club_president_assigned: "#8b5cf6",
      club_official_assigned: "#22c55e",
      saf_added: "#3b82f6",
      saf_removed: "#ef4444",
      event_approved: "#10b981",
      automation_job_run: "#06b6d4",
      maintenance_rebuild_stats: "#f59e0b",
      maintenance_cleanup_events: "#f97316",
      maintenance_verify_data: "#0ea5e9",
      maintenance_cleanup_notifications: "#6366f1",
      club_deleted: "#ef4444",
      default: "#6b7280",
    };
    return colors[type] || colors.default;
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
        return `Rebuilt club statistics for ${
          activity.clubsUpdated || 0
        } clubs`;
      case "maintenance_cleanup_events":
        return `Cleaned up ${activity.deleted || 0} old events`;
      case "maintenance_verify_data":
        return `Data integrity check found ${activity.issues || 0} issues`;
      case "maintenance_cleanup_notifications":
        return `Deleted ${activity.deleted || 0} old notifications`;
      case "automation_job_run": {
        const job = activity.job || "job";
        const status = activity.status || "success";
        return `Automation: ${job} (${status})`;
      }
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
                             <span>Clubs created: ${mod.activityStats.clubsCreated}</span>
                             <span>Events approved: ${mod.activityStats.eventsApproved}</span>
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
        <div class="assign-modal">
          <div class="form-group">
            <label>University scope</label>
            <select id="saf-assign-university">
              <option value="">All Universities</option>
            </select>
          </div>
          <div id="saf-assign-search"></div>
          <p class="form-hint"><i class="fas fa-info-circle"></i> Search for a user and click Assign. Results are limited to the selected university unless "All" is chosen.</p>
        </div>
      `,
      confirmText: "Close",
      onConfirm: async () => {},
    });

    // Populate universities then wire search component
    (async () => {
      const select = document.getElementById("saf-assign-university");
      const searchContainer = document.getElementById("saf-assign-search");
      const universities = await this.fetchUniversities();
      if (select) {
        select.innerHTML = `
          <option value="">All Universities</option>
          ${universities
            .map((u) => `<option value="${u.id}">${u.name}</option>`)
            .join("")}
        `;
      }

      const mountSearch = () => {
        if (!searchContainer) return;
        renderUserSearchAssign(searchContainer, {
          scopeUniversityId: select?.value || null,
          allowAllUniversities: !select?.value,
          allowMissingProfile: true,
          bypassSearchable: true, // Admin can find users even if they have search disabled
          onSelect: (user) => {
            const uniId = select?.value || null;
            const profile = user.profile || {};
            const handle = profile.handle || profile.handle_lower || user.id;
            this.showModal({
              title: "Confirm SAF Moderator",
              content: `<p>Assign <strong>@${handle}</strong> as SAF moderator${
                uniId ? ` for <strong>${uniId}</strong>` : " (all universities)"
              }?</p>`,
              confirmText: "Assign",
              onConfirm: async () => {
                logManager.info("AdminPage: Adding SAF moderator", {
                  uid: user.id,
                  universityId: uniId,
                });
                await adminAddSafModerator({
                  uid: user.id,
                  displayName:
                    `${profile.firstName || ""} ${
                      profile.lastName || ""
                    }`.trim() || null,
                  universityId: uniId,
                  addedBy: currentUser.uid,
                });
                await this.loadTabContent("saf");
              },
            });
          },
        });
      };

      mountSearch();
      select?.addEventListener("change", mountSearch);
    })();
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
                .map((club) => {
                  // Escape quotes in data attributes to prevent XSS, but keep raw value for comparisons
                  const safeAttr = (val) => (val || "").replace(/"/g, "&quot;");
                  return `
                <tr data-id="${club.id}" data-club-name="${safeAttr(
                    club.name
                  )}" data-university-id="${safeAttr(
                    club.universityId ||
                      club.universityCode ||
                      club.university ||
                      ""
                  )}" data-president-id="${club.presidentId || ""}">
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
              `;
                })
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
        this.openAssignPresidentModal(row.dataset.id, {
          clubName: row.dataset.clubName,
          universityId: row.dataset.universityId,
        });
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

    const modal = new ClubCreatorModal({
      universities,
      onConfirm: async (clubData) => {
        const {
          name,
          description,
          universityId,
          universityName,
          category,
          accentColor,
          // requireSafApproval is deprecated - SAF approval is now mandatory for all events
          logoBlob,
          bannerBlob,
        } = clubData;

        // Generate a stable clubId
        const clubId = this.generateClubId(name);

        logManager.info("AdminPage: Creating club via dashboard", {
          name,
          universityId,
        });

        // Create the club FIRST so storage rules can verify club exists
        // Note: requireSafApproval is always true now (mandatory SAF approval)
        await createClub({
          clubId,
          name,
          description,
          universityId,
          universityName,
          category,
          createdBy: currentUser.uid,
          accentColor,
          // requireSafApproval is always true - handled by createClub
          logoUrl: null,
          bannerUrl: null,
        });

        // Small delay to ensure Firestore document is available for Storage rules check
        // (Emulator cross-service consistency can have slight delays)
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Now upload images AFTER club exists (storage rules require club doc to exist)
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
            const { updateClub } = await import(
              "../services/admin/AdminService.js"
            );
            await updateClub(clubId, {
              ...(logoUrl && { logoUrl }),
              ...(bannerUrl && { bannerUrl }),
            });
          }
        } catch (imageError) {
          logManager.warn(
            "AdminPage: Failed to upload one or more club images",
            imageError
          );
        }

        logManager.info("AdminPage: Club created via dashboard", {
          name,
          universityId,
        });

        await this.loadTabContent("clubs");
      },
    });

    await modal.show();
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

  async openEditClubModal(clubId) {
    // Fetch current club data
    let clubData;
    try {
      const clubSnap = await getDoc(doc(db, "clubs", clubId));
      if (!clubSnap.exists()) {
        logManager.error("AdminPage: Club not found for edit", { clubId });
        alert("Club not found.");
        return;
      }
      clubData = { id: clubSnap.id, ...clubSnap.data() };
    } catch (error) {
      logManager.error("AdminPage: Failed to load club for edit", {
        clubId,
        error,
      });
      alert("Failed to load club data.");
      return;
    }

    // Fetch universities for the dropdown
    let universities = [];
    try {
      universities = await this.fetchUniversities();
    } catch (error) {
      logManager.error(
        "AdminPage: Failed to fetch universities for edit club modal",
        error
      );
    }

    const modal = new ClubCreatorModal({
      universities,
      presetUniversityId: clubData.universityId || clubData.universityCode,
      presetUniversityName: clubData.universityName,
      editMode: true,
      existingClub: clubData,
      existingLogoUrl: clubData.logoUrl || null,
      existingBannerUrl: clubData.bannerUrl || null,
      onConfirm: async (formData) => {
        const {
          name,
          description,
          category,
          accentColor,
          // requireSafApproval is deprecated - SAF approval is now mandatory for all events
          logoBlob,
          bannerBlob,
        } = formData;

        logManager.info("AdminPage: Updating club via dashboard", {
          clubId,
          name,
        });

        try {
          // Upload new images if provided
          let logoUrl = clubData.logoUrl; // Keep existing if no new upload
          let bannerUrl = clubData.bannerUrl;

          if (logoBlob) {
            logoUrl = await uploadClubLogo(clubId, logoBlob);
          }
          if (bannerBlob) {
            bannerUrl = await uploadClubBanner(clubId, bannerBlob);
          }

          // Update the club
          // Note: requireSafApproval is always true now (mandatory SAF approval)
          const { updateClub } = await import(
            "../services/admin/AdminService.js"
          );
          await updateClub(clubId, {
            name,
            description,
            category,
            accentColor,
            requireSafApproval: true, // Always true - SAF approval is mandatory
            ...(logoUrl && { logoUrl }),
            ...(bannerUrl && { bannerUrl }),
          });

          logManager.info("AdminPage: Club updated via dashboard", {
            clubId,
            name,
          });

          await this.loadTabContent("clubs");
        } catch (error) {
          logManager.error("AdminPage: Failed to update club", {
            clubId,
            error,
          });
          alert("Failed to update club. Please try again.");
        }
      },
    });

    await modal.show();
  }

  async openAssignPresidentModal(clubId, opts = {}) {
    // Fetch club for scope
    const clubSnap = await getDoc(doc(db, "clubs", clubId));
    const club = clubSnap.exists()
      ? { id: clubSnap.id, ...clubSnap.data() }
      : { id: clubId, name: opts.clubName || "Club" };

    this.showModal({
      title: "Assign President",
      content: `
        <div class="assign-modal">
          <p>Search for a student to make president of <strong>${
            club.name || clubId
          }</strong>.</p>
          <div id="assign-president-search"></div>
        </div>
      `,
      confirmText: "Close",
      onConfirm: async () => {},
    });

    const searchContainer = document.getElementById("assign-president-search");
    if (searchContainer) {
      renderUserSearchAssign(searchContainer, {
        scopeUniversityId:
          club.universityId ||
          club.universityCode ||
          club.university ||
          opts.universityId ||
          null,
        allowAllUniversities: false,
        bypassSearchable: true, // Admin can find users even if they have search disabled
        onSelect: (user) => {
          const profile = user.profile || {};
          const handle = profile.handle || profile.handle_lower || user.id;
          this.showModal({
            title: "Confirm President",
            content: `
              <p>Make <strong>@${handle}</strong> the president of <strong>${
              club.name || clubId
            }</strong>?</p>
            `,
            confirmText: "Assign President",
            onConfirm: async () => {
              await adminAssignPresident(clubId, user.id);
              await this.loadTabContent("clubs");
            },
          });
        },
      });
    }
  }

  async confirmDeleteClub(clubId) {
    // Fetch the club to get its name
    let clubName = clubId;
    try {
      const clubSnap = await getDoc(doc(db, "clubs", clubId));
      if (clubSnap.exists()) {
        clubName = clubSnap.data().name || clubId;
      }
    } catch (err) {
      logManager.warn("AdminPage: Failed to fetch club name for deletion", {
        clubId,
        err,
      });
    }

    // Show modal requiring user to type the club name
    this.showModal({
      title: "Delete Club",
      content: `
        <div class="delete-club-confirm">
          <div class="warning-icon">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <p class="warning-text">
            <strong>This action cannot be undone.</strong> This will permanently delete 
            the club "<strong>${escapeHtmlAdmin(
              clubName
            )}</strong>" and all its associated data, 
            including events and memberships.
          </p>
          <div class="form-group">
            <label>To confirm, type the club name exactly:</label>
            <input 
              type="text" 
              id="confirmClubName" 
              placeholder="${escapeHtmlAdmin(clubName)}"
              autocomplete="off"
            />
          </div>
          <p class="type-hint" id="typeHint" style="display: none;">
            <i class="fas fa-check-circle"></i> Club name matches
          </p>
        </div>
      `,
      confirmText: "Delete Club",
      onConfirm: async () => {
        const input = document.getElementById("confirmClubName");
        const typedName = input?.value?.trim();

        if (typedName !== clubName) {
          throw new Error("Club name does not match. Deletion cancelled.");
        }

        logManager.warn("AdminPage: Deleting club from dashboard", {
          clubId,
          clubName,
        });
        await adminDeleteClub(clubId);
        logManager.info("AdminPage: Club deleted from dashboard", {
          clubId,
          clubName,
        });
        await this.loadTabContent("clubs");
      },
    });

    // Add validation listener for the input
    setTimeout(() => {
      const input = document.getElementById("confirmClubName");
      const hint = document.getElementById("typeHint");
      const confirmBtn = document.querySelector(".admin-modal .btn-confirm");

      if (input && confirmBtn) {
        // Initially disable the confirm button
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
  // AUTOMATION TAB (manual triggers for scheduled jobs)
  // ==========================================

  async renderAutomationTab(contentEl) {
    contentEl.innerHTML = `
      <div class="admin-automation">
        <div class="section-header">
          <h2><i class="fas fa-robot"></i> Automation</h2>
          <p class="section-subtitle">
            Run scheduled jobs on-demand. Use this after large schedule imports to sync group memberships.
          </p>
        </div>

        <div class="automation-grid">
          <div class="automation-card glass-card" data-job="classSpacesScheduler">
            <div class="automation-card-header">
              <h3>Class Spaces: Sync Memberships</h3>
              <span class="automation-pill">Daily 06:00</span>
            </div>
            <p class="automation-desc">
              Rebuilds all class space memberships from users' saved schedules. Removes stale memberships and
              clears spaces that no longer meet the 3+ member rule.
            </p>
            <div class="automation-actions">
              <button class="btn-run-automation" data-job="classSpacesScheduler">
                <i class="fas fa-play"></i> Run Now
              </button>
            </div>
            <div class="automation-output" aria-live="polite"></div>
          </div>

          <div class="automation-card glass-card" data-job="trimSpaceMessages">
            <div class="automation-card-header">
              <h3>Class Spaces: Trim Messages</h3>
              <span class="automation-pill">Daily 03:00</span>
            </div>
            <p class="automation-desc">
              Deletes old messages beyond the latest 2,000 per active class space to keep storage usage bounded.
            </p>
            <div class="automation-actions">
              <button class="btn-run-automation" data-job="trimSpaceMessages">
                <i class="fas fa-play"></i> Run Now
              </button>
            </div>
            <div class="automation-output" aria-live="polite"></div>
          </div>
        </div>
      </div>
    `;

    const runButtons = contentEl.querySelectorAll(".btn-run-automation");
    runButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const job = btn.dataset.job;
        const card = btn.closest(".automation-card");
        const outputEl = card?.querySelector(".automation-output");
        if (!job || !card || !outputEl) return;

        const confirmText =
          job === "classSpacesScheduler"
            ? "Run Class Spaces membership sync now? This updates memberships for all users."
            : "Run this automation job now?";
        if (!confirm(confirmText)) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
        outputEl.innerHTML = `
          <div class="automation-status automation-status--running">
            <i class="fas fa-spinner fa-spin"></i> Executing...
          </div>
        `;

        try {
          const data = await adminRunAutomationJob(job);
          const pretty = JSON.stringify(data, null, 2);
          outputEl.innerHTML = `
            <div class="automation-status automation-status--success">
              <i class="fas fa-check-circle"></i> Success
              <span class="automation-time">${new Date().toLocaleString()}</span>
            </div>
            <pre class="automation-result">${escapeHtmlAdmin(pretty)}</pre>
          `;
        } catch (error) {
          const msg =
            error?.message ||
            error?.details ||
            error?.code ||
            "Unknown error";
          outputEl.innerHTML = `
            <div class="automation-status automation-status--error">
              <i class="fas fa-exclamation-triangle"></i> Failed: ${escapeHtmlAdmin(
                msg
              )}
              <span class="automation-time">${new Date().toLocaleString()}</span>
            </div>
          `;
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-play"></i> Run Now';
        }
      });
    });
  }

  // ==========================================
  // MAINTENANCE TAB
  // ==========================================
  //
  // NOTE: The full Maintenance tab UI (clear schedules, old events cleanup,
  // sync denormalized data, etc.) is intentionally disabled for now.
  // The backend Cloud Functions remain available, but the SPA no longer
  // exposes this functionality in the Admin dashboard. When you want to
  // re-enable it, restore the tab button in renderDashboard, re-add the
  // switch case in loadTabContent, and bring back the methods that were
  // previously defined here.

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

// Helper function to escape HTML
function escapeHtmlAdmin(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
