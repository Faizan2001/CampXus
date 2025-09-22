/**
 * =============================================================================
 *                           MEETCHUTHERE PROFILE SETUP
 *                      Modern ES6+ Class-Based Implementation
 * =============================================================================
 *
 * 📋 TABLE OF CONTENTS:
 * ├── 1. Class Definition & Constructor
 * ├── 2. Authentication & User Management
 * ├── 3. Initialization & Setup Methods
 * ├── 4. Form Data Management
 * ├── 5. Step Navigation System
 * ├── 6. Validation & Error Handling
 * ├── 7. UI State Management
 * ├── 8. File Upload & Storage
 * ├── 9. Database Operations
 * ├── 10. Event Listeners & DOM Manipulation
 * ├── 11. Utility & Helper Methods
 * └── 12. Global Initialization System
 *
 * This class manages the complete profile setup workflow for new users,
 * including form validation, file uploads, Firebase integration, and SPA
 * navigation. Uses modern JavaScript features and follows best practices.
 *
 * =============================================================================
 */

// Import Firebase functions we need - consolidated below (removed duplicate serverTimestamp import)

// Import avatar management system
import { avatarManager } from "../../utils/avatar/avatarManager.js";

// Import data manager for Firestore operations
import { dataManager } from "../../services/data/DataService.js";
import { scheduleStorageService } from "../../services/schedule/ScheduleStorageService.js";
import { currentUser } from "../../store/userStore.js";
import { authManager } from "../../services/auth/AuthService.js";
import { AnalyticsService } from "../../services/analytics/AnalyticsService.js";
import { navigateTo } from "../../app.js"; // 🎯 NEW: Import navigateTo for SPA navigation
import { syncUserDataCache } from "../../services/data/DataService.js"; // 🔄 Combined cache sync function (follows DRY principles)
import {
  normalizeHandle,
  validateHandle,
  isReservedHandle,
  canChangeHandle,
  formatCooldown,
} from "../../utils/handle/handleUtils.js";
import {
  getFirestore,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { ScheduleImportService } from "../../services/schedule/ScheduleImportService.js"; // 🎯 NEW: Schedule import functionality
import {
  onboardingService,
  DEFAULT_ONBOARDING_STATE,
} from "../../services/onboarding/OnboardingService.js";

/**
 * =============================================================================
 *                        1. CLASS DEFINITION & CONSTRUCTOR
 * =============================================================================
 */

class ProfileSetup {
  constructor() {
    // CRITICAL: Prevent multiple instances from being created
    if (window.profileSetupInstance) {
      console.warn(
        "⚠️ ProfileSetup instance already exists! Returning existing instance."
      );
      return window.profileSetupInstance;
    }

    this.currentStep = 0;
    this.totalSteps = 3; // Basic Info, Avatar & Bio, Schedule Import
    this.profileData = {};
    this.avatarConfig = null; // Stores user's avatar configuration
    this.scheduleData = null; // Stores imported schedule data
    this.scheduleImportService = new ScheduleImportService(); // 🎯 NEW: Schedule import service
    this.dataLoadInProgress = false; // Prevent duplicate data loading
    this.existingProfileData = null; // Cache for existing profile data
    this.isInitialized = false; // Flag to prevent re-initialization

    this.boundScheduleHelpKeyHandler = (event) => {
      if (event.key === "Escape") {
        this.closeScheduleHelpOverlay();
      }
    };

    // Store this instance globally to prevent duplicates
    window.profileSetupInstance = this;

    // Add offline/online event listeners for UI feedback
    window.addEventListener("offline", () => this.showOfflineBanner(true));
    window.addEventListener("online", () => this.showOfflineBanner(false));
    // Show banner if already offline on load
    if (!navigator.onLine) {
      this.showOfflineBanner(true);
    }

    // Ensure handle field is present even if no profile data yet (first load / reload)
    setTimeout(() => {
      if (typeof this.ensureHandleField === "function") {
        this.ensureHandleField();
      }
    }, 0);

    // Listen for hydration so we can prefill handle from cache immediately
    document.addEventListener("profile:hydrated", (e) => {
      // Only act if not fully initialized yet
      if (this.isInitialized) return;
      const cachedProfile = e.detail?.optimistic
        ? currentUser.profile
        : currentUser.profile;
      if (cachedProfile) {
        this.existingProfileData = cachedProfile;
        // Try to populate form fields (will no-op if DOM not ready yet)
        try {
          this.populateFormFields(cachedProfile);
        } catch (_) {}
      }
    });

    // If a profile was already hydrated BEFORE this page loaded, use it now
    if (!this.isInitialized && currentUser?.profile) {
      this.existingProfileData = currentUser.profile;
      // Defer to allow DOM template injection to complete
      setTimeout(() => {
        try {
          this.populateFormFields(currentUser.profile);
        } catch (_) {}
      }, 0);
    }

    // Cooldown refresh interval reference
    this.handleCooldownInterval = null;

    // Predefined majors list (code → name)
    this.MAJORS = [
      // SBE
      { code: "ACN", name: "Accounting" },
      { code: "BUS", name: "Business (BBA Core)" },
      { code: "ECN", name: "Economics" },
      { code: "FIN", name: "Finance" },
      { code: "HRM", name: "Human Resource Management" },
      { code: "INB", name: "International Business" },
      { code: "MGT", name: "Management" },
      { code: "MIS", name: "Management Information Systems" },
      { code: "MKT", name: "Marketing" },
      // SETS/SECS
      { code: "CSC", name: "Computer Science" },
      { code: "CSE", name: "Computer Science & Engineering" },
      { code: "EEE", name: "Electrical & Electronic Engineering" },
      { code: "CIS", name: "Computing / Information Systems" },
      { code: "MAT", name: "Mathematics" },
      { code: "PHY", name: "Physics" },
      { code: "CHE", name: "Chemistry" },
      // SELS
      { code: "BIO", name: "Biology" },
      { code: "ENV", name: "Environmental Science" },
      { code: "MCB", name: "Microbiology" },
      { code: "BCB", name: "Biochemistry & Biotechnology" },
      // SLASS
      { code: "ANT", name: "Anthropology" },
      { code: "CMN", name: "Media & Communication" },
      { code: "ENG", name: "English" },
      { code: "ELT", name: "English Language Teaching" },
      { code: "GSG", name: "Global Studies & Governance" },
      { code: "HST", name: "History" },
      { code: "SOC", name: "Sociology" },
      { code: "JPN", name: "Japanese" },
      { code: "AAT", name: "Art & Aesthetics" },
      { code: "BLA", name: "Bangla Literature & Art" },
      { code: "BPH", name: "Bangladesh Political History" },
      { code: "NCH", name: "National Culture & Heritage" },
      { code: "PHA", name: "Pharmacy" },
      { code: "LAW", name: "Law" },
    ];
  }

  /**
   * =============================================================================
   *                      1.5. PROFILE DATA LOADING & MANAGEMENT
   * =============================================================================
   */

  /**
   * Load existing profile data from Firestore using dataManager
   * @param {string} userId - User ID to fetch data for
   * @returns {Promise<Object|null>} Profile data or null if not found
   */
  async loadProfileData(userId) {
    if (this.dataLoadInProgress) {
      return this.existingProfileData;
    }

    this.dataLoadInProgress = true;

    try {
      // (Removed custom overlay) Intentionally not showing separate loader; router handles page-level loads.

      // Use dataManager instead of direct Firestore calls
      const data = await dataManager.getUserProfile(userId);

      if (data) {
        this.existingProfileData = data;
        return data;
      } else {
        this.existingProfileData = null;
        return null;
      }
    } catch (error) {
      console.error("❌ Error loading profile data:", error);
      this.showError("Failed to load profile data. Please try again.");
      return null;
    } finally {
      this.dataLoadInProgress = false;
    }
  }

  /**
   * Populate form fields with existing profile data
   * @param {Object} profileData - Profile data from Firestore
   */
  populateFormFields(profileData) {
    // Wait for DOM elements to be available
    const populateFields = () => {
      // Basic Information fields
      const firstName = document.getElementById("setup-first-name");
      const lastName = document.getElementById("setup-last-name");
      const email = document.getElementById("setup-email");
      const studentId = document.getElementById("setup-student-id");
      const startingYear = document.getElementById("setup-starting-year");
      const major = document.getElementById("setup-major");
      const bio = document.getElementById("setup-bio");
      const bioCount = document.getElementById("bio-count");

      // Check if elements are available
      if (!firstName || !lastName) {
        setTimeout(populateFields, 200);
        return;
      }

      // 🎯 FINAL FIX: Handle both nested (from DB) and flat (from sign-in) data structures.
      // This is the key to fixing the pre-filling bug on first sign-in.
      const isNested = profileData.profile && profileData.universityInfo;
      const profile = isNested ? profileData.profile : profileData;
      const universityInfo = isNested ? profileData.universityInfo : {};

      // 🗂️ ORGANIZED DATA ACCESS: Extract from the correct structure
      const getProfileValue = (path, defaultValue = "") => {
        return profile[path] || defaultValue;
      };

      const getUniversityValue = (path, defaultValue = "") => {
        return universityInfo[path] || defaultValue;
      };

      // Populate basic info from organized structure
      if (firstName) firstName.value = getProfileValue("firstName");
      if (lastName) lastName.value = getProfileValue("lastName");
      // Inject handle field if not present
      const nameRow = firstName?.closest(".form-row");
      if (nameRow && !document.getElementById("setup-handle")) {
        const handleRow = document.createElement("div");
        handleRow.className = "form-group";
        handleRow.innerHTML = `
          <label for="setup-handle">Handle <span class="optional-note">(public @name)</span></label>
          <div class="handle-status-wrapper" style="position:relative;">
            <input type="text" id="setup-handle" maxlength="20" placeholder="choose a handle" autocomplete="off" class="form-input" />
            <span id="setup-handle-icon" aria-hidden="true" class="handle-status-icon"></span>
            <span id="setup-handle-cooldown" class="handle-cooldown-badge" style="display:none;"></span>
          </div>
          <div id="setup-handle-feedback" class="field-hint">3–20 chars: letters, numbers, underscore. Must start with a letter.</div>`;
        nameRow.insertAdjacentElement("afterend", handleRow);

        const handleInput = handleRow.querySelector("#setup-handle");
        const feedbackEl = handleRow.querySelector("#setup-handle-feedback");
        let debounceTimer;
        const iconEl = handleRow.querySelector("#setup-handle-icon");
        const setIconState = (state) => {
          if (!iconEl) return;
          // Reset
          iconEl.removeAttribute("data-state");
          iconEl.className = "handle-status-icon";
          iconEl.textContent = "";
          iconEl.innerHTML = "";
          if (!state) return; // hidden
          if (state === "checking") {
            iconEl.setAttribute("data-state", "checking");
            iconEl.classList.add("visible", "checking");
            iconEl.innerHTML = "<span></span><span></span><span></span>";
          } else if (state === "success") {
            iconEl.setAttribute("data-state", "success");
            iconEl.classList.add("visible", "success");
            iconEl.textContent = "✓";
          } else if (state === "error") {
            iconEl.setAttribute("data-state", "error");
            iconEl.classList.add("visible", "error");
            iconEl.textContent = "✕";
          }
        };
        if (!document.getElementById("handle-style-injections")) {
          const styleEl = document.createElement("style");
          styleEl.id = "handle-style-injections";
          styleEl.textContent = `
            .handle-status-wrapper { width:100%; }
            .handle-status-wrapper .form-input { width:100%; padding-right:48px; }
            .handle-status-icon { position:absolute; right:14px; top:50%; transform:translateY(-50%) scale(.85); opacity:0; pointer-events:none; font-size:16px; font-weight:600; transition:opacity .25s, transform .25s; display:inline-flex; align-items:center; justify-content:center; }
            .handle-status-icon.visible { opacity:1; transform:translateY(-50%) scale(1); }
            .handle-status-icon.success { color:#1b9e59; animation:icon-pop .3s ease; }
            .handle-status-icon.error { color:#c53030; animation:icon-shake .4s ease; }
            .handle-status-icon.checking { gap:4px; }
            .handle-status-icon.checking span { width:6px; height:6px; background:var(--text-tertiary); border-radius:50%; animation:dot-bounce .9s infinite ease-in-out; }
            .handle-status-icon.checking span:nth-child(2){ animation-delay:.15s; }
            .handle-status-icon.checking span:nth-child(3){ animation-delay:.3s; }
      .handle-cooldown-badge { position:absolute; right:12px; top:50%; transform:translateY(-50%); padding:4px 10px; font-size:12px; line-height:1; border-radius:14px; backdrop-filter:blur(8px); background:rgba(255,255,255,0.12); color:var(--text-primary,#fff); box-shadow:0 2px 6px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.08) inset; font-weight:500; letter-spacing:.25px; }
      .handle-status-wrapper.cooldown-active .form-input { cursor:not-allowed; opacity:.85; background:linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); }
      .handle-status-wrapper.cooldown-active .form-input:focus { outline:none; box-shadow:0 0 0 2px rgba(255,255,255,0.15); }
      .handle-status-wrapper.cooldown-active .handle-status-icon { display:none !important; }
            @keyframes dot-bounce { 0%,80%,100% { transform:translateY(0); opacity:.45;} 40% { transform:translateY(-6px); opacity:1;} }
            @keyframes icon-pop { 0% { transform:translateY(-50%) scale(.4); opacity:0;} 60% { transform:translateY(-50%) scale(1.15); opacity:1;} 100% { transform:translateY(-50%) scale(1); } }
            @keyframes icon-shake { 0%,100% { transform:translateY(-50%) translateX(0); } 25% { transform:translateY(-50%) translateX(-3px);} 50% { transform:translateY(-50%) translateX(3px);} 75% { transform:translateY(-50%) translateX(-2px);} }
            #setup-handle.form-input { transition:border-color .25s, box-shadow .25s; }
            #setup-handle.form-input.invalid { border-color:#c53030 !important; box-shadow:0 0 0 1px #c53030; }
            #setup-handle.form-input.valid { border-color:#1b9e59 !important; box-shadow:0 0 0 1px #1b9e59; }
          `;
          document.head.appendChild(styleEl);
        }
        const cooldownBadge = handleRow.querySelector("#setup-handle-cooldown");
        const prefilledExistingHandle =
          this.existingProfileData?.profile?.handle ||
          this.existingProfileData?.handle ||
          null;
        handleInput.addEventListener("input", () => {
          clearTimeout(debounceTimer);
          const raw = handleInput.value.trim();
          if (!raw) {
            feedbackEl.textContent = "Handle required before finishing setup.";
            feedbackEl.className = "field-hint error";
            handleInput.classList.remove("valid");
            handleInput.classList.add("invalid");
            setIconState();
            this.validateCurrentStep();
            return;
          }
          const v = validateHandle(raw);
          if (!v.valid) {
            feedbackEl.textContent = `Invalid: ${v.reason.replace(/_/g, " ")}`;
            feedbackEl.className = "field-hint error";
            handleInput.classList.remove("valid");
            handleInput.classList.add("invalid");
            setIconState("error");
            this.validateCurrentStep();
            return;
          }
          if (isReservedHandle(v.normalized)) {
            feedbackEl.textContent = "Reserved handle";
            feedbackEl.className = "field-hint error";
            handleInput.classList.remove("valid");
            handleInput.classList.add("invalid");
            setIconState("error");
            this.validateCurrentStep();
            return;
          }
          // If user re-enters their current handle, treat as valid without availability lookup
          if (
            prefilledExistingHandle &&
            v.normalized === prefilledExistingHandle
          ) {
            feedbackEl.textContent = "Current handle";
            feedbackEl.className = "field-hint success";
            handleInput.classList.remove("invalid");
            handleInput.classList.add("valid");
            setIconState("success");
            this.validateCurrentStep();
            return;
          }
          feedbackEl.textContent = "Checking availability…";
          feedbackEl.className = "field-hint";
          setIconState("checking");
          debounceTimer = setTimeout(async () => {
            try {
              const db = getFirestore();
              const snap = await getDoc(doc(db, "handles", v.normalized));
              if (snap.exists()) {
                feedbackEl.textContent = "Already taken";
                feedbackEl.className = "field-hint error";
                handleInput.classList.remove("valid");
                handleInput.classList.add("invalid");
                setIconState("error");
              } else {
                feedbackEl.textContent = "Available ✔";
                feedbackEl.className = "field-hint success";
                handleInput.classList.remove("invalid");
                handleInput.classList.add("valid");
                setIconState("success");
              }
              this.validateCurrentStep();
            } catch (e) {
              feedbackEl.textContent = "Availability error";
              feedbackEl.className = "field-hint error";
              handleInput.classList.add("invalid");
              setIconState("error");
            }
          }, 400);
        });
        // Prefill existing handle (supports legacy root-level or nested profile.handle)
        const prefilledExistingHandle2 =
          this.existingProfileData?.profile?.handle ||
          this.existingProfileData?.handle;
        if (prefilledExistingHandle2) {
          handleInput.value = prefilledExistingHandle2;
          // Mark as valid without triggering availability check (already owned by user)
          feedbackEl.textContent = "Current handle";
          feedbackEl.className = "field-hint success";
          handleInput.classList.remove("invalid");
          handleInput.classList.add("valid");
          setIconState("success");
          this.validateCurrentStep();
        }
        // Cooldown enforcement (shared logic)
        let cooldownInterval = null;
        const updateCooldownUI = () => {
          try {
            const sysInfo =
              (this.existingProfileData &&
                (this.existingProfileData.systemInfo ||
                  this.existingProfileData.profile?.systemInfo)) ||
              currentUser?.profile?.systemInfo ||
              currentUser?.systemInfo;
            const lastChange = sysInfo?.lastHandleChangeAt;
            const { allowed, remainingMs } = canChangeHandle(lastChange);
            const wrapper = handleRow.querySelector(".handle-status-wrapper");
            if (allowed) {
              handleInput.disabled = false;
              wrapper?.classList.remove("cooldown-active");
              if (cooldownBadge) cooldownBadge.style.display = "none";
              if (cooldownInterval) {
                clearInterval(cooldownInterval);
                cooldownInterval = null;
              }
              return;
            }
            handleInput.disabled = true;
            wrapper?.classList.add("cooldown-active");
            if (cooldownBadge) {
              cooldownBadge.textContent = formatCooldown(remainingMs);
              cooldownBadge.style.display = "inline-flex";
              cooldownBadge.title = "Handle change locked until cooldown ends";
            }
            feedbackEl.textContent = `Handle locked – change available in ${formatCooldown(
              remainingMs
            )}`;
            feedbackEl.className = "field-hint";
            if (prefilledExistingHandle2) handleInput.classList.add("valid");
            if (!cooldownInterval) {
              cooldownInterval = setInterval(() => {
                const res = canChangeHandle(lastChange);
                if (res.allowed) {
                  updateCooldownUI();
                } else if (cooldownBadge) {
                  cooldownBadge.textContent = formatCooldown(res.remainingMs);
                  feedbackEl.textContent = `Handle locked – change available in ${formatCooldown(
                    res.remainingMs
                  )}`;
                }
              }, 60000);
              this.activeTimeouts?.add?.(cooldownInterval);
            }
          } catch (_) {}
        };
        setTimeout(updateCooldownUI, 50);
        document.addEventListener(
          "profile:hydrated",
          () => updateCooldownUI(),
          { once: true }
        );
      }
      if (email) email.value = getProfileValue("email") || "";

      // 🆔 Always populate student ID from organized structure or email fallback
      const loggedInUser = currentUser.user;
      if (studentId && loggedInUser && loggedInUser.email) {
        const savedStudentId = getUniversityValue("studentId");
        const extractedStudentId = loggedInUser.email.split("@")[0];

        studentId.value = savedStudentId || extractedStudentId;
      }

      if (startingYear) startingYear.value = getProfileValue("startingYear");
      if (major) major.value = getProfileValue("major");
      if (bio) bio.value = getProfileValue("bio");

      // Update bio character counter
      const bioValue = getProfileValue("bio");
      if (bioCount) {
        bioCount.textContent = bioValue.length;
      }

      // Handle avatar configuration
      const avatarSource = isNested ? profileData : profile;
      if (avatarSource.avatarConfig) {
        this.avatarConfig = avatarSource.avatarConfig;
      } else {
        this.avatarConfig = null;
      }

      // Schedule privacy settings have been moved to Friends page for better UX

      // 🗂️ ORGANIZED DATA STRUCTURE: Update internal profile data
      const finalStudentId =
        getUniversityValue("studentId") ||
        (loggedInUser && loggedInUser.email
          ? loggedInUser.email.split("@")[0]
          : "");

      this.profileData = {
        firstName: getProfileValue("firstName"),
        lastName: getProfileValue("lastName"),
        email: getProfileValue("email") || "",
        studentId: finalStudentId,
        startingYear: getProfileValue("startingYear"),
        major: getProfileValue("major"),
        bio: getProfileValue("bio"),
      };

      // Add visual indicators for readonly fields (especially email and student ID)
      this.styleReadonlyFields();

      // Re-validate current step after populating
      this.validateCurrentStep();

      // Ensure cooldown state reflects latest systemInfo
      this.applyHandleCooldownState();
    };

    populateFields();
  }

  /**
   * Ensure the handle input exists (id=setup-handle). Safe to call multiple times.
   * This is used on initial page load when there is no existing profile document yet
   * so populateFormFields may not be invoked.
   */
  ensureHandleField() {
    try {
      if (document.getElementById("setup-handle")) return; // already present
      const firstName = document.getElementById("setup-first-name");
      if (!firstName) {
        setTimeout(() => this.ensureHandleField(), 150);
        return;
      }
      const nameRow = firstName.closest(".form-row");
      if (!nameRow) return;
      // Reuse insertion logic (single form-group variant)
      const handleGroup = document.createElement("div");
      handleGroup.className = "form-group";
      handleGroup.innerHTML = `
        <label for="setup-handle">Handle <span class="optional-note">(public @name)</span></label>
        <div class="handle-status-wrapper" style="position:relative;">
          <input type="text" id="setup-handle" maxlength="20" placeholder="choose a handle" autocomplete="off" class="form-input" />
          <span id="setup-handle-icon" aria-hidden="true" class="handle-status-icon"></span>
          <span id="setup-handle-cooldown" class="handle-cooldown-badge" style="display:none;"></span>
        </div>
        <div id="setup-handle-feedback" class="field-hint">3–20 chars: letters, numbers, underscore. Must start with a letter.</div>`;
      nameRow.insertAdjacentElement("afterend", handleGroup);

      const handleInput = handleGroup.querySelector("#setup-handle");
      const feedbackEl = handleGroup.querySelector("#setup-handle-feedback");
      let debounceTimer;
      const iconEl = handleGroup.querySelector("#setup-handle-icon");
      const setIconState = (state) => {
        if (!iconEl) return;
        iconEl.removeAttribute("data-state");
        iconEl.className = "handle-status-icon";
        iconEl.textContent = "";
        iconEl.innerHTML = "";
        if (!state) return;
        if (state === "checking") {
          iconEl.setAttribute("data-state", "checking");
          iconEl.classList.add("visible", "checking");
          iconEl.innerHTML = "<span></span><span></span><span></span>";
        } else if (state === "success") {
          iconEl.setAttribute("data-state", "success");
          iconEl.classList.add("visible", "success");
          iconEl.textContent = "✓";
        } else if (state === "error") {
          iconEl.setAttribute("data-state", "error");
          iconEl.classList.add("visible", "error");
          iconEl.textContent = "✕";
        }
      };
      if (!document.getElementById("handle-style-injections")) {
        const styleEl = document.createElement("style");
        styleEl.id = "handle-style-injections";
        styleEl.textContent = `
          .handle-status-wrapper { width:100%; }
          .handle-status-wrapper .form-input { width:100%; padding-right:48px; }
          .handle-status-icon { position:absolute; right:14px; top:50%; transform:translateY(-50%) scale(.85); opacity:0; pointer-events:none; font-size:16px; font-weight:600; transition:opacity .25s, transform .25s; display:inline-flex; align-items:center; justify-content:center; }
          .handle-status-icon.visible { opacity:1; transform:translateY(-50%) scale(1); }
          .handle-status-icon.success { color:#1b9e59; animation:icon-pop .3s ease; }
          .handle-status-icon.error { color:#c53030; animation:icon-shake .4s ease; }
          .handle-status-icon.checking { gap:4px; }
          .handle-status-icon.checking span { width:6px; height:6px; background:var(--text-tertiary); border-radius:50%; animation:dot-bounce .9s infinite ease-in-out; }
          .handle-status-icon.checking span:nth-child(2){ animation-delay:.15s; }
          .handle-status-icon.checking span:nth-child(3){ animation-delay:.3s; }
          /* Cooldown badge styles */
          .handle-cooldown-badge { position:absolute; right:12px; top:50%; transform:translateY(-50%); padding:4px 10px; font-size:12px; line-height:1; border-radius:14px; backdrop-filter:blur(8px); background:rgba(255,255,255,0.12); color:var(--text-primary,#fff); box-shadow:0 2px 6px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.08) inset; font-weight:500; letter-spacing:.25px; }
          .handle-status-wrapper.cooldown-active .form-input { cursor:not-allowed; opacity:.85; background:linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); }
          .handle-status-wrapper.cooldown-active .form-input:focus { outline:none; box-shadow:0 0 0 2px rgba(255,255,255,0.15); }
          .handle-status-wrapper.cooldown-active .handle-status-icon { display:none !important; }
          @keyframes dot-bounce { 0%,80%,100% { transform:translateY(0); opacity:.45;} 40% { transform:translateY(-6px); opacity:1;} }
          @keyframes icon-pop { 0% { transform:translateY(-50%) scale(.4); opacity:0;} 60% { transform:translateY(-50%) scale(1.15); opacity:1;} 100% { transform:translateY(-50%) scale(1); } }
          @keyframes icon-shake { 0%,100% { transform:translateY(-50%) translateX(0); } 25% { transform:translateY(-50%) translateX(-3px);} 50% { transform:translateY(-50%) translateX(3px);} 75% { transform:translateY(-50%) translateX(-2px);} }
        `;
        document.head.appendChild(styleEl);
      }
      const prefilledExistingHandle3 =
        this.existingProfileData?.profile?.handle ||
        this.existingProfileData?.handle ||
        null;
      const cooldownBadge = handleGroup.querySelector("#setup-handle-cooldown");
      let cooldownInterval = null;

      const updateCooldownUI = () => {
        try {
          // Prefer systemInfo from existingProfileData then currentUser.profile
          const sysInfo =
            this.existingProfileData?.systemInfo ||
            currentUser?.profile?.systemInfo ||
            currentUser?.systemInfo;
          const lastChange = sysInfo?.lastHandleChangeAt;
          const { allowed, remainingMs } = canChangeHandle(lastChange);
          if (allowed) {
            // Clear cooldown state if previously active
            handleInput.disabled = false;
            handleGroup
              .querySelector(".handle-status-wrapper")
              ?.classList.remove("cooldown-active");
            if (cooldownBadge) {
              cooldownBadge.style.display = "none";
            }
            if (cooldownInterval) {
              clearInterval(cooldownInterval);
              cooldownInterval = null;
            }
            return;
          }
          // Still in cooldown
          handleInput.disabled = true;
          const wrapper = handleGroup.querySelector(".handle-status-wrapper");
          wrapper?.classList.add("cooldown-active");
          if (cooldownBadge) {
            cooldownBadge.textContent = formatCooldown(remainingMs);
            cooldownBadge.title = "You can change handle after cooldown ends";
            cooldownBadge.style.display = "inline-flex";
          }
          // Provide feedback text
          feedbackEl.textContent = `Handle locked – change available in ${formatCooldown(
            remainingMs
          )}`;
          feedbackEl.className = "field-hint";
          // Ensure validation passes for current handle
          if (prefilledExistingHandle3) {
            handleInput.classList.add("valid");
          }
          if (!cooldownInterval) {
            cooldownInterval = setInterval(() => {
              const res = canChangeHandle(lastChange);
              if (res.allowed) {
                updateCooldownUI();
              } else if (cooldownBadge) {
                cooldownBadge.textContent = formatCooldown(res.remainingMs);
                feedbackEl.textContent = `Handle locked – change available in ${formatCooldown(
                  res.remainingMs
                )}`;
              }
            }, 60000); // update every minute
            this.activeTimeouts?.add?.(cooldownInterval);
          }
        } catch (_) {}
      };

      // Defer cooldown UI calculation slightly to allow existingProfileData hydration
      setTimeout(updateCooldownUI, 50);
      document.addEventListener("profile:hydrated", () => updateCooldownUI(), {
        once: true,
      });
      handleInput.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        const raw = handleInput.value.trim();
        if (!raw) {
          feedbackEl.textContent = "Handle required before finishing setup.";
          feedbackEl.className = "field-hint error";
          handleInput.classList.remove("valid");
          handleInput.classList.add("invalid");
          setIconState();
          this.validateCurrentStep();
          return;
        }
        const v = validateHandle(raw);
        if (!v.valid) {
          feedbackEl.textContent = `Invalid: ${v.reason.replace(/_/g, " ")}`;
          feedbackEl.className = "field-hint error";
          handleInput.classList.remove("valid");
          handleInput.classList.add("invalid");
          setIconState("error");
          this.validateCurrentStep();
          return;
        }
        if (isReservedHandle(v.normalized)) {
          feedbackEl.textContent = "Reserved handle";
          feedbackEl.className = "field-hint error";
          handleInput.classList.remove("valid");
          handleInput.classList.add("invalid");
          setIconState("error");
          this.validateCurrentStep();
          return;
        }
        if (
          prefilledExistingHandle3 &&
          v.normalized === prefilledExistingHandle3
        ) {
          feedbackEl.textContent = "Current handle";
          feedbackEl.className = "field-hint success";
          handleInput.classList.remove("invalid");
          handleInput.classList.add("valid");
          setIconState("success");
          this.validateCurrentStep();
          return;
        }
        feedbackEl.textContent = "Checking availability…";
        feedbackEl.className = "field-hint";
        setIconState("checking");
        debounceTimer = setTimeout(async () => {
          try {
            const db = getFirestore();
            const snap = await getDoc(doc(db, "handles", v.normalized));
            if (snap.exists()) {
              feedbackEl.textContent = "Already taken";
              feedbackEl.className = "field-hint error";
              handleInput.classList.remove("valid");
              handleInput.classList.add("invalid");
              setIconState("error");
            } else {
              feedbackEl.textContent = "Available ✔";
              feedbackEl.className = "field-hint success";
              handleInput.classList.remove("invalid");
              handleInput.classList.add("valid");
              setIconState("success");
            }
            this.validateCurrentStep();
          } catch (e) {
            feedbackEl.textContent = "Availability error";
            feedbackEl.className = "field-hint error";
            handleInput.classList.add("invalid");
            setIconState("error");
          }
        }, 400);
      });
      // Prefill if existing profile already has handle
      const existingHandle =
        this.existingProfileData?.profile?.handle ||
        this.existingProfileData?.handle;
      if (existingHandle) {
        handleInput.value = existingHandle;
        feedbackEl.textContent = "Current handle";
        feedbackEl.className = "field-hint success";
        handleInput.classList.add("valid");
        setIconState("success");
        this.validateCurrentStep();
        // Re-run cooldown UI in case we now have lastHandleChangeAt
        updateCooldownUI();
      }
    } catch (e) {
      console.warn("ensureHandleField failed:", e);
    }
  }

  /**
   * Show loading state with custom message using SPA router's loading animation
   * @param {string} message - Loading message to display
   */
  showLoadingState() {
    /* removed: rely solely on router loader */
  }

  /**
   * Hide loading state using SPA router's smooth animation
   */
  hideLoadingState() {
    /* no-op */
  }

  /**
   * Show error message to user
   * @param {string} message - Error message to display
   */
  showError(message) {
    // Simple error display - could be enhanced with better UI
    console.error("🚨 Profile Setup Error:", message);
    alert(message); // TODO: Replace with better error UI
  }

  /**
   * Check if user has completed profile setup (using dataManager)
   * @param {Object} profileData - Profile data to check
   * @returns {boolean} True if profile is complete
   */
  isProfileComplete(profileData) {
    // Use dataManager's enhanced validation logic
    return dataManager.isProfileComplete(profileData);
  }

  /**
   * =============================================================================
   *                      2. AUTHENTICATION & USER MANAGEMENT
   * =============================================================================
   */

  /**
   * Navigate to the home page (SPA-style)
   */
  navigateToHome() {
    navigateTo("home");
  }

  /**
   * Disable step animations before leaving the profile page to prevent the
   * "pulled from both sides" visual when router replaces the DOM.
   */
  static disableExitAnimations() {
    try {
      const card = document.querySelector(".profile-setup-card");
      if (card) {
        card.style.animation = "none";
        card.style.transition = "none";
      }
      document.querySelectorAll(".setup-step").forEach((el) => {
        el.style.animation = "none";
        el.style.transition = "none";
      });
    } catch (e) {
      console.warn("Failed to disable profile exit animations", e);
    }
  }

  /**
   * Check if email is a development email.
   * Must match <anything>.dev@iub.edu.bd (case-insensitive)
   * @param {string} email - Email to check
   * @returns {boolean} True if it's a development email
   */
  isDevelopmentEmail(email) {
    if (!email) return false;
    const re = /^[^@]+\.dev@iub\.edu\.bd$/i;
    return re.test(String(email).trim());
  }

  /**
   * Initializes the profile setup process once the user is authenticated.
   * This replaces the old checkAuthentication method.
   */
  async initializeWhenReady() {
    try {
      console.log("⏳ Waiting for user profile to initialize setup...");
      const userProfile = await currentUser.waitForProfile();

      if (userProfile) {
        console.log("✅ User profile loaded, initializing profile setup.");

        // 🎯 CRITICAL: Set this.currentUser from the global currentUser
        this.currentUser = currentUser.user;
        this.existingProfileData = userProfile;

        // The user is authenticated and has a profile,
        // so let's initialize the setup page. It will either be
        // pre-filled for editing or empty for a new user.
        await this.initializeSetup();
      } else {
        console.warn(
          "🤷 No user logged in. Profile setup will not initialize."
        );

        // We can optionally hide the setup form or show a login prompt here.
      }
    } catch (error) {
      console.error("❌ Error during profile setup initialization:", error);
      this.showError("Could not start the profile setup process.");
    }
  }

  /**
   * =============================================================================
   *                      3. INITIALIZATION & SETUP METHODS
   * =============================================================================
   */

  /**
   * Initialize the profile setup UI, populates fields, and sets up listeners.
   * This is the main entry point after the user is authenticated.
   */
  async initializeSetup() {
    // 🎯 FIX for race condition: Wait for the DOM to be ready for painting.
    // This ensures the template from the SPA router has been rendered.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Cache DOM elements for performance
    this.cacheDOMElements();

    // 🎯 LOAD EXISTING PROFILE DATA: Check for existing profile data first
    if (this.currentUser && this.currentUser.uid) {
      try {
        const existingData = await this.loadProfileData(this.currentUser.uid);

        if (existingData) {
          this.populateFormFields(existingData);

          // If profile is complete, show in edit mode
          if (this.isProfileComplete(existingData)) {
            // 🎯 CRITICAL FIX: Always start from step 0 when editing profile
            // This ensures consistent navigation regardless of which step has data
            this.currentStep = 0;
            this.updateStepTitles("edit");
            this.updateStepDisplay();
          } else {
            this.currentStep = 0;
          }
        } else {
          // 🎯 IMMEDIATE DATA PREFILL: Pre-fill email and student ID for new setup
          this.prefillUserData();
        }
      } catch (error) {
        console.error("❌ Error loading profile data:", error);
        // Fallback to normal prefill if data loading fails
        this.prefillUserData();
      }
    } else {
      // No user available, use fallback prefill
      this.prefillUserData();
    }

    this.updateStepDisplay();
    this.setupEventListeners(); // Re-add event listeners
    // Initialize typeahead for Major selection
    this.initMajorTypeahead();
    this.initStartingYearDropdown();
    this.initializeAvatarSystem();
  }

  /**
   * Re-initialize setup for a fresh template (SPA navigation case)
   * This is called when the user navigates back to the profile page
   * and the template has been reloaded but the instance still exists
   */
  async reinitializeForFreshTemplate() {
    // Check if template is loaded
    const profileCard = document.querySelector(".profile-setup-card");
    const setupBody = document.querySelector(".setup-body");

    if (!profileCard || !setupBody) {
      setTimeout(() => this.reinitializeForFreshTemplate(), 100);
      return;
    }

    // Load existing profile data - ALWAYS FRESH DATA for avatar updates
    if (this.currentUser && this.currentUser.uid) {
      try {
        // Always load fresh data from database to ensure we have latest avatar config
        const freshData = await this.loadProfileData(this.currentUser.uid);

        if (freshData) {
          this.existingProfileData = freshData; // Update cache with fresh data
          this.populateFormFields(freshData);

          // If profile is complete, show in edit mode
          if (this.isProfileComplete(freshData)) {
            this.currentStep = 0;
            this.updateStepTitles("edit");
          } else {
            this.currentStep = 0;
          }
        } else {
          this.currentStep = 0;
          this.prefillUserData();
        }
      } catch (error) {
        console.error(
          "❌ Error loading fresh profile data during re-initialization:",
          error
        );
        // Fallback to basic prefill if data loading fails
        this.prefillUserData();
      }
    } else {
      // No user available, use basic prefill
      this.prefillUserData();
    }

    // Re-initialize avatar system
    this.initializeAvatarSystem();

    // Re-setup event listeners (in case they were lost)
    this.setupEventListeners();
    this.initMajorTypeahead();
    this.initStartingYearDropdown();

    // Update display and validation
    this.updateStepDisplay();
    this.updateProgress();
    this.validateCurrentStep();
  }

  /**
   * =============================================================================
   *                        4. FORM DATA MANAGEMENT
   * =============================================================================
   */

  /**
   * Pre-fill form fields with user data from authentication
   */
  prefillUserData() {
    const emailInput = document.getElementById("setup-email");
    const studentIdInput = document.getElementById("setup-student-id");

    // If fields aren't available yet, retry after a short delay
    if (!emailInput || !studentIdInput) {
      setTimeout(() => this.prefillUserData(), 200);
      return;
    }

    // Prefer already assigned auth user
    if (!this.currentUser && authManager) {
      const authUser = authManager.getCurrentUser();
      if (authUser) this.currentUser = authUser;
    }
    // If still no auth user, attempt cached profile fallback (hydrated before auth)
    if (!this.currentUser && window.currentUser && window.currentUser.profile) {
      const cachedEmail = window.currentUser.profile?.profile?.email;
      if (cachedEmail) {
        emailInput.value = cachedEmail;
        const parts = cachedEmail.split("@");
        if (parts.length > 0) studentIdInput.value = parts[0];
        emailInput.placeholder = "Cached email";
        studentIdInput.placeholder = "Cached ID";
        this.styleReadonlyFields();
        return; // done for now; real auth will overwrite later
      }
    }
    if (!this.currentUser) {
      emailInput.placeholder = "Please sign in first";
      studentIdInput.placeholder = "Please sign in first";
      return;
    }

    // Check if this is a development email
    const isDev = this.isDevelopmentEmail(this.currentUser.email);

    // 🎯 IMMEDIATE AUTO-FILL: Pre-fill email immediately without any loading text
    if (emailInput) {
      // Always set the value, even if it was already set (SPA template reload case)
      emailInput.value = this.currentUser.email || "";
      emailInput.placeholder = isDev
        ? "Development email"
        : "Your university email";
    }

    // 🎯 IMMEDIATE AUTO-FILL: Automatically extract and populate Student ID from email immediately
    if (studentIdInput && this.currentUser.email) {
      const emailParts = this.currentUser.email.split("@");
      if (emailParts.length > 0) {
        // Always set the value, even if it was already set (SPA template reload case)
        studentIdInput.value = emailParts[0];
        studentIdInput.placeholder = isDev
          ? "Development ID"
          : "Student ID (from email)";
      }
    }

    // Add visual indicators for readonly fields
    this.styleReadonlyFields();
  }

  /**
   * Collect data from the current step
   */
  collectCurrentStepData() {
    if (this.currentStep === 0) {
      // Format names using our utility function!
      this.profileData.firstName = formatName(
        document.getElementById("setup-first-name").value.trim()
      );
      this.profileData.lastName = formatName(
        document.getElementById("setup-last-name").value.trim()
      );
      this.profileData.email = document.getElementById("setup-email").value; // Already pre-filled and readonly
      this.profileData.studentId = generateStudentId(this.profileData.email); // Generate using our function!
      this.profileData.startingYear = document.getElementById(
        "setup-starting-year"
      ).value;
      this.profileData.major = document
        .getElementById("setup-major")
        .value.trim()
        .toUpperCase();
    } else if (this.currentStep === 1) {
      this.profileData.bio = document.getElementById("setup-bio").value.trim();
      // Avatar configuration is handled by this.avatarConfig
      // Schedule privacy settings are now managed on the Friends page
    } else if (this.currentStep === 2) {
      // Schedule Import step - schedule data is stored separately in this.scheduleData
      // DO NOT add schedule data to profileData to avoid Firestore nested arrays error
      console.log("📅 Schedule import step completed", {
        hasScheduleData: !!this.scheduleData,
        coursesCount: this.scheduleData?.courses?.length || 0,
      });
    }
  }

  getInitialOnboardingState(existingState = {}, runtimeState = {}) {
    const base = JSON.parse(JSON.stringify(DEFAULT_ONBOARDING_STATE));
    const merged = {
      ...base,
      ...(existingState || {}),
    };

    if (runtimeState && typeof runtimeState === "object") {
      Object.entries(runtimeState).forEach(([key, value]) => {
        if (key === "version") {
          return;
        }
        if (value === true || (value && typeof value === "object")) {
          merged[key] = value;
        }
      });
    }

    merged.version = DEFAULT_ONBOARDING_STATE.version;
    return merged;
  }

  /**
   * =============================================================================
   *                         5. STEP NAVIGATION SYSTEM
   * =============================================================================
   */

  /**
   * Move to the next step in the setup process - SIMPLIFIED
   */
  async nextStep() {
    // Validate current step before proceeding
    if (!this.validateStepData()) {
      return; // Don't proceed if validation fails
    }

    // Collect data from current step
    this.collectCurrentStepData();

    if (this.currentStep < this.totalSteps - 1) {
      // Move to next step
      this.currentStep++;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep();

      // Update avatar preview when navigating to avatar step (step 1)
      if (this.currentStep === 1) {
        // Simple single preview update
        this.updateAvatarPreview();
      }
    } else {
      // Final step - save the profile with loading state
      const nextBtn = document.getElementById("setup-next-btn");

      // 🔒 Prevent multiple clicks during save operation
      if (nextBtn && !nextBtn.disabled) {
        nextBtn.disabled = true;
        nextBtn.classList.add("loading");

        // Store original content and add loading dots
        const originalContent = nextBtn.innerHTML;
        nextBtn.innerHTML = `
          <span class="button-text">Completing...</span>
          <div class="loading-dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
        `;

        try {
          await this.saveProfile();
        } catch (error) {
          console.error("❌ Profile save failed:", error);
          // Re-enable button on error
          nextBtn.disabled = false;
          nextBtn.classList.remove("loading");
          nextBtn.innerHTML = originalContent;
          throw error; // Re-throw to handle in calling context
        }
        // Note: Button stays disabled after successful save since user will be redirected
      }
    }
  }

  /**
   * Move to the previous step in the setup process - SIMPLIFIED
   */
  async prevStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.updateStepDisplay();
      this.updateProgress();
      this.validateCurrentStep(); // Validate the new current step

      // Update avatar preview when navigating back to avatar step (step 1)
      if (this.currentStep === 1) {
        // Simple single preview update
        this.updateAvatarPreview();
      }
    }
  }

  /**
   * Skip the entire setup process
   */
  async skipSetup() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (nextBtn) nextBtn.disabled = true;

    try {
      try {
        navigateTo("home");
      } catch (error) {
        console.error(
          "⚠️ SPA Router not available during skip! Cannot navigate to home.",
          error
        );
        // In Vite/SPA mode, we should never fall back to hard refresh
      }
    } catch (error) {
      console.error("Error during skip setup:", error);
      alert("Could not process skip action. Please try again.");
      if (nextBtn) nextBtn.disabled = false;
    }
  }

  /**
   * =============================================================================
   *                       6. VALIDATION & ERROR HANDLING
   * =============================================================================
   */

  /**
   * Validate the current step's input fields
   */
  validateCurrentStep() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (!nextBtn) return;

    if (this.currentStep === 0) {
      // Step 0: Basic Info - Using our validation functions!
      const firstName =
        document.getElementById("setup-first-name")?.value.trim() || "";
      const lastName =
        document.getElementById("setup-last-name")?.value.trim() || "";
      const startingYear =
        document.getElementById("setup-starting-year")?.value || "";
      const majorRaw = document.getElementById("setup-major")?.value.trim() || "";
      const major = majorRaw.toUpperCase();
      const email = document.getElementById("setup-email")?.value.trim() || "";

      // Use our utility functions for validation!
      const hasValidEmail = isValidEmail(email);
      const hasValidStartingYear = isValidStartingYear(startingYear);
      const hasRequiredFields = validateRequiredFields({
        firstName,
        lastName,
        major,
        startingYear,
      });

      // All validations must pass
      let handleValid = false;
      const handleInput = document.getElementById("setup-handle");
      const handleFeedback = document.getElementById("setup-handle-feedback");
      if (handleInput) {
        const raw = handleInput.value.trim();
        if (raw) {
          const v = validateHandle(raw);
          const taken =
            handleFeedback?.classList.contains("error") &&
            /taken/i.test(handleFeedback.textContent || "");
          handleValid =
            v.valid &&
            !taken &&
            !isReservedHandle(v.normalized) &&
            handleFeedback?.classList.contains("success");

          // Cooldown path: input disabled, feedback not marked success but value is existing handle
          if (!handleValid && handleInput.disabled) {
            const existingHandle =
              this.existingProfileData?.profile?.handle ||
              this.existingProfileData?.handle ||
              currentUser?.profile?.profile?.handle ||
              currentUser?.profile?.handle;
            if (
              existingHandle &&
              v.valid &&
              v.normalized === existingHandle &&
              !isReservedHandle(v.normalized)
            ) {
              handleValid = true; // accept locked current handle
            }
          }
        }
      }
      const isMajorValid = this.isValidMajorCode(major);
      const isStepValid =
        hasRequiredFields &&
        hasValidEmail &&
        hasValidStartingYear &&
        handleValid &&
        isMajorValid;

      // Always keep "Next Step →" text, just enable/disable button
      nextBtn.textContent = "Next Step →";
      nextBtn.disabled = !isStepValid;

      // Add visual styling for disabled state
      if (!isStepValid) {
        nextBtn.classList.add("disabled-state");
        // Show specific validation messages
        this.showValidationErrors(
          firstName,
          lastName,
          email,
          startingYear,
          major
        );
      } else {
        nextBtn.classList.remove("disabled-state");
        this.clearValidationErrors();
      }
    } else if (this.currentStep === 1) {
      // Step 1: Avatar & bio (optional)
      nextBtn.textContent = "Next Step →";
      nextBtn.disabled = false;
      nextBtn.classList.remove("disabled-state");
    } else if (this.currentStep === 2) {
      // Step 2: Schedule Import (optional, this is the new final step)
      nextBtn.textContent = "Complete Setup!";
      nextBtn.disabled = false;
      nextBtn.classList.remove("disabled-state");
    }
  }

  /**
   * Validate step data before proceeding to next step
   * @returns {boolean} True if validation passes
   */
  validateStepData() {
    if (this.currentStep === 0) {
      // Validate Step 0 (Basic Info) using our utility functions
      const firstName = document
        .getElementById("setup-first-name")
        .value.trim();
      const lastName = document.getElementById("setup-last-name").value.trim();
      const startingYear = document.getElementById("setup-starting-year").value;
      const major = document.getElementById("setup-major").value.trim();
      const email = document.getElementById("setup-email").value.trim();

      // Use our validation functions!
      const hasRequiredFields = validateRequiredFields({
        firstName,
        lastName,
        major,
        startingYear,
      });
      const hasValidEmail = isValidEmail(email);
      const hasValidStartingYear = isValidStartingYear(startingYear);

      if (!hasRequiredFields || !hasValidEmail || !hasValidStartingYear) {
        // Show visual feedback for incomplete/invalid fields
        this.showIncompleteFieldsFeedback();
        return false;
      }
    }
    // Step 1 (Profile pic/bio) is optional, so no validation needed

    return true;
  }

  /**
   * Show visual feedback when disabled button is clicked
   */
  showIncompleteFieldsFeedback() {
    const nextBtn = document.getElementById("setup-next-btn");
    if (!nextBtn) return;

    // Scroll to button smoothly
    nextBtn.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });

    // Add red glow animation
    nextBtn.classList.add("red-glow-pulse");

    // Remove the animation after it completes
    setTimeout(() => {
      nextBtn.classList.remove("red-glow-pulse");
    }, 800);
  }

  /**
   * Show validation errors to help users fix their input
   * @param {string} firstName - First name value
   * @param {string} lastName - Last name value
   * @param {string} email - Email value
   * @param {string} startingYear - Starting year value
   * @param {string} major - Major value
   */
  showValidationErrors(firstName, lastName, email, startingYear, major) {
    // Clear previous errors first
    this.clearValidationErrors();

    // Check each field and show specific errors
    if (!firstName.trim()) {
      this.showFieldError("setup-first-name", "First name is required");
    }

    if (!lastName.trim()) {
      this.showFieldError("setup-last-name", "Last name is required");
    }

    if (!email.trim()) {
      this.showFieldError("setup-email", "Email is required");
    } else if (!isValidEmail(email)) {
      this.showFieldError("setup-email", "Please enter a valid email address");
    }

    if (!startingYear) {
      this.showFieldError("setup-starting-year", "Starting year is required");
    } else if (!isValidStartingYear(startingYear)) {
      this.showFieldError(
        "setup-starting-year",
        "Please enter a valid starting year"
      );
    }

    if (!major.trim()) {
      this.showFieldError("setup-major", "Major is required");
    } else if (!this.isValidMajorCode(major.toUpperCase())) {
      this.showFieldError(
        "setup-major",
        "Please select a valid major code from the list"
      );
    }
  }

  /**
   * Show an error message for a specific field
   * @param {string} fieldId - The ID of the field element
   * @param {string} message - The error message to display
   */
  showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    // Add error styling to the field
    field.classList.add("error");

    // Create or update error message element
    const errorId = `${fieldId}-error`;
    let errorElement = document.getElementById(errorId);

    if (!errorElement) {
      errorElement = document.createElement("div");
      errorElement.id = errorId;
      errorElement.className = "error-message";
      field.parentNode.appendChild(errorElement);
    }

    errorElement.textContent = message;
    errorElement.style.display = "block";
  }

  /**
   * Clear all validation errors from the form
   */
  clearValidationErrors() {
    // Remove error styling from all form fields
    const formFields = document.querySelectorAll(
      ".form-field input, .form-field select, .form-field textarea"
    );
    formFields.forEach((field) => {
      field.classList.remove("error");
    });

    // Hide all error messages
    const errorMessages = document.querySelectorAll(".error-message");
    errorMessages.forEach((error) => {
      error.style.display = "none";
    });
  }

  /**
   * =============================================================================
   *                          7. UI STATE MANAGEMENT
   * =============================================================================
   */

  /**
   * Update the step display to show current step
   */
  updateStepDisplay() {
    const steps = document.querySelectorAll(".setup-step");
    steps.forEach((step) => step.classList.remove("active")); // More robust way to hide

    const currentStepElement = document.querySelector(
      `.setup-step[data-step="${this.currentStep}"]`
    );

    if (currentStepElement) {
      currentStepElement.classList.add("active"); // More robust way to show
    } else {
      console.error(
        "❌ Could not find step element for step:",
        this.currentStep
      );
    }

    // Update navigation button visibility
    this.updateNavigationButtons();

    // Next button text is handled by validateCurrentStep
    this.validateCurrentStep(); // Re-validate to update button text and state
  }

  /**
   * Update navigation button visibility and state
   */
  updateNavigationButtons() {
    const prevBtn = document.getElementById("setup-prev-btn");
    const skipBtn = document.getElementById("setup-skip-btn");
    const nextButton = document.getElementById("setup-next-btn");
    const finishButton = document.getElementById("finish-setup-button");

    if (prevBtn) {
      prevBtn.style.display = this.currentStep === 0 ? "none" : "flex";
    }

    if (skipBtn) {
      // Show skip button on all steps, including final step
      skipBtn.style.display = "flex";
    }

    if (nextButton) {
      nextButton.style.display = "inline-block";
    }

    if (finishButton) {
      if (this.currentStep === this.totalSteps - 1) {
        nextButton.style.display = "none";
        finishButton.style.display = "inline-block";
      } else {
        nextButton.style.display = "inline-block";
        finishButton.style.display = "none";
      }
    }
  }

  /**
   * Update progress indicator display
   */
  updateProgress() {
    // Update step blocks instead of progress bar
    const stepBlocks = document.querySelectorAll(".step-block");
    stepBlocks.forEach((block, index) => {
      block.classList.remove("active", "completed");

      if (index < this.currentStep) {
        // Previous steps are completed
        block.classList.add("completed");
      } else if (index === this.currentStep) {
        // Current step is active
        block.classList.add("active");
      }
      // Future steps remain default styling
    });

    // Update step text elements
    const currentStepElement = document.querySelector(".current-step");
    const totalStepsElement = document.querySelector(".total-steps");

    if (currentStepElement) {
      currentStepElement.textContent = `Step ${this.currentStep + 1}`;
    }
    if (totalStepsElement) {
      totalStepsElement.textContent = `${this.totalSteps}`;
    }
  }

  /**
   * Shows a success message that replaces the form content.
   * @param {string} message - The main message to display.
   * @param {string} subtitle - A subtitle for the message.
   */
  showSuccessMessage(
    message = "All Set! 🎉",
    subtitle = "Your profile is ready. Redirecting..."
  ) {
    if (this.dom.card) {
      this.dom.card.innerHTML = `
        <div class="setup-header">
          <div class="setup-title-section">
            <h1 class="setup-title">${message}</h1>
          </div>
        </div>
        <div class="setup-body" style="display: flex; align-items: center; justify-content: center; min-height: 300px;">
          <div class="success-message">
            <div class="success-icon">
              <i class="fas fa-check-circle"></i>
            </div>
            <h3>Welcome Aboard!</h3>
            <p>Your profile has been set up successfully.</p>
            <div class="success-animation-overlay"></div>
          </div>
        </div>
      `;
    }
  }

  /**
   * =============================================================================
   *                        8. AVATAR MANAGEMENT SYSTEM & DATABASE OPERATIONS
   * =============================================================================
   */
  /**
   * Initialize avatar system with default avatar for user - SIMPLIFIED
   */
  async initializeAvatarSystem() {
    if (!this.currentUser) {
      console.log("⚠️ No user available for avatar system");
      return;
    }

    // Use existing avatar config from loaded profile data (always fresh)
    if (this.existingProfileData?.avatarConfig) {
      this.avatarConfig = this.existingProfileData.avatarConfig;
    }
    // Generate default avatar if none exists
    else if (!this.avatarConfig && avatarManager) {
      this.avatarConfig = avatarManager.generateDefaultAvatar(
        this.currentUser.uid
      );
    }

    // If user is currently on avatar step (1) ensure preview renders now
    if (this.currentStep === 1) {
      // Defer a frame to let DOM mount
      requestAnimationFrame(() => this.updateAvatarPreview());
    }
  }

  /**
   * Open avatar editor modal - SIMPLIFIED
   */
  openAvatarEditor() {
    if (!avatarManager) {
      console.error("❌ Avatar manager not available");
      alert("Avatar system is not loaded. Please refresh the page.");
      return;
    }

    if (!this.currentUser) {
      console.error("❌ No user available for avatar editor");
      alert("Please sign in to customize your avatar.");
      return;
    }

    // Use current avatar or generate default
    const currentAvatar =
      this.avatarConfig ||
      avatarManager.generateDefaultAvatar(this.currentUser.uid);

    // Open avatar editor with callback
    avatarManager.openAvatarEditor(currentAvatar, async (newAvatarConfig) => {
      this.avatarConfig = newAvatarConfig;

      // Update the preview immediately
      this.updateAvatarPreview();

      // If profile is complete, save the avatar change immediately
      if (
        this.currentUser &&
        this.isProfileComplete(this.existingProfileData || this.profileData)
      ) {
        await this.saveAvatarChange(newAvatarConfig);
      }
    });
  }

  /**
   * Save avatar changes to Firestore and update the in-memory profile.
   * This ensures the UI updates immediately after a successful change.
   * @param {object} newAvatarConfig - The new avatar configuration object
   * @returns {Promise<void>}
   */
  async saveAvatarChange(newAvatarConfig) {
    try {
      // 🛡️ SAFEGUARD: Ensure avatar config is clean (should already be clean from avatar editor)
      console.log(
        "🛡️ [ProfileSetup] Verifying avatar config is clean:",
        newAvatarConfig
      );
      const cleanedConfig = avatarManager.cleanAvatarConfig(newAvatarConfig);
      console.log(
        "🛡️ [ProfileSetup] Verified clean avatar config:",
        cleanedConfig
      );

      // 1. Get the current profile and update avatarConfig
      const currentProfile = { ...currentUser.profile };
      const updatedProfile = {
        ...currentProfile,
        avatarConfig: cleanedConfig,
      };

      // 2. Save the updated profile to Firestore
      const result = await dataManager.saveUserProfile(
        currentUser.user.uid,
        updatedProfile
      );

      if (!result.success) {
        throw new Error(result.error || "Unknown error updating avatar");
      }

      // 3. Update the in-memory profile so the UI updates immediately
      currentUser.setProfile(updatedProfile);
      console.log("🎨 Avatar updated in currentUser store");

      // 4. 🔄 Sync cached user data so friends see avatar changes immediately
      // Using centralized cache sync for consistency and reliability
      syncUserDataCache(this.currentUser.uid)
        .then(() =>
          console.log("✅ Friends will see your cleaned avatar in real-time!")
        )
        .catch((err) =>
          console.log("⚠️ Avatar cache update failed (but profile saved):", err)
        );

      // 5. 🎯 CRITICAL: Dispatch avatar change event to refresh menu immediately
      console.log("🚀 Dispatching avatar:changed event for menu refresh...");
      document.dispatchEvent(
        new CustomEvent("avatar:changed", {
          detail: {
            userData: updatedProfile,
            avatarConfig: cleanedConfig,
            timestamp: Date.now(),
          },
        })
      );

      // 6. 🛡️ FALLBACK: Also try direct force refresh as backup
      try {
        // Dynamic import to avoid circular dependencies
        const { forceAvatarRefresh } = await import(
          "../../components/navigation/Menu.js"
        );
        if (typeof forceAvatarRefresh === "function") {
          forceAvatarRefresh(updatedProfile);
          console.log("✅ Direct avatar refresh fallback called");
        }
      } catch (error) {
        console.log(
          "⚠️ Direct avatar refresh fallback failed (not critical):",
          error
        );
      }

      // Optionally, show a success message or trigger a UI update here
      // showFormSuccess("profile-form", "Avatar updated successfully!");
    } catch (error) {
      console.error("❌ Failed to update avatar:", error);
      // Optionally, show an error message to the user
      // showFormError("profile-form", "Failed to update avatar. Please try again.");
      throw error;
    }
  }

  /**
   * Save the complete profile to Firebase Firestore and schedule to localStorage
   */
  async saveProfile() {
    try {
      // Collect handle from field
      const handleInput = document.getElementById("setup-handle");
      let claimedHandle = null;
      if (handleInput) {
        const raw = handleInput.value.trim();
        const v = validateHandle(raw);
        if (!v.valid) throw new Error("Invalid handle cannot be saved");
        if (isReservedHandle(v.normalized)) throw new Error("Reserved handle");
        claimedHandle = v.normalized;
      } else {
        throw new Error("Handle input missing");
      }

      // 🎯 Create clean profile data with only essential fields (no schedule data)
      const cleanProfileData = {
        firstName: this.profileData.firstName,
        lastName: this.profileData.lastName,
        email: this.profileData.email,
        studentId: this.profileData.studentId,
        startingYear: this.profileData.startingYear,
        major: this.profileData.major,
        bio: this.profileData.bio || "",
        handle: claimedHandle,
      };
      // Derive lowercase search fields
      cleanProfileData.firstName_lower = (
        cleanProfileData.firstName || ""
      ).toLowerCase();
      cleanProfileData.lastName_lower = (
        cleanProfileData.lastName || ""
      ).toLowerCase();
      cleanProfileData.major_lower = (
        cleanProfileData.major || ""
      ).toLowerCase();

      // 🎯 FIXED: Only include clean profile data to avoid Firestore nested arrays error
      // Determine email and UID safely (prefer form email, then auth user)
      const authFallbackUser =
        this.currentUser ||
        authManager.getCurrentUser() ||
        currentUser.user ||
        null;
      const effectiveEmail = (
        cleanProfileData.email ||
        authFallbackUser?.email ||
        ""
      ).trim();
      if (!effectiveEmail) {
        throw new Error(
          "No email available. Please sign in and fill your email."
        );
      }
      const domainPart = effectiveEmail.includes("@")
        ? effectiveEmail.split("@")[1]
        : "";
      const universityKey = domainPart ? domainPart.split(".")[0] : "";

      const profileDataForFirestore = {
        profile: cleanProfileData,
        universityInfo: {
          university: universityKey || "unknown",
          universityName: "Independent University, Bangladesh",
          studentId: this.profileData.studentId,
        },
        avatarConfig: this.avatarConfig,
        systemInfo: {
          profileSetupComplete: true,
          status: "offline",
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        },
      };

      const userId =
        this.currentUser?.uid ||
        currentUser?.uid ||
        authFallbackUser?.uid ||
        null;
      if (!userId) {
        throw new Error("No authenticated user. Please sign in again.");
      }

      console.log("💾 Saving profile to Firestore...", {
        userId,
        profileData: this.profileData,
      });

      // Reserve handle + save profile transactionally with cooldown + old handle release
      const db = getFirestore();
      const desiredHandleRef = doc(db, "handles", cleanProfileData.handle);
      const userRef = doc(db, "users", userId);
      let userWasNew = false;
      let runtimeOnboardingState = {};
      if (onboardingService?.getState) {
        try {
          if (typeof onboardingService.init === "function") {
            await onboardingService.init();
          }
          runtimeOnboardingState = onboardingService.getState();
        } catch (error) {
          console.warn(
            "⚠️ Failed to hydrate onboarding state before profile save; falling back to persisted data",
            error
          );
          runtimeOnboardingState = onboardingService.getState
            ? onboardingService.getState()
            : {};
        }
      }

      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const isNewUser = !userSnap.exists();
        if (isNewUser) {
          userWasNew = true;
        }
        const userData = userSnap.data() || {};
        const previousHandle = userData?.profile?.handle;
        const lastHandleChangeAt = userData?.systemInfo?.lastHandleChangeAt;

        // If changing handle (not first claim), enforce cooldown
        if (previousHandle && previousHandle !== claimedHandle) {
          const cooldown = canChangeHandle(lastHandleChangeAt);
          if (!cooldown.allowed) {
            throw new Error(
              `Handle recently changed. Try again in ${formatCooldown(
                cooldown.remainingMs
              )}.`
            );
          }
        }

        // If the handle is different OR user is new, attempt to create new handle doc
        if (!previousHandle || previousHandle !== claimedHandle) {
          const desiredHandleSnap = await tx.get(desiredHandleRef);
          if (
            desiredHandleSnap.exists() &&
            desiredHandleSnap.data().userId !== userId
          ) {
            throw new Error("Handle taken while saving");
          }
          // Create the new handle doc (rules: create-only). Avoid re-setting if already ours.
          if (!desiredHandleSnap.exists()) {
            tx.set(
              desiredHandleRef,
              {
                userId,
                createdAt: serverTimestamp(),
                lastClaimedAt: serverTimestamp(),
              },
              { merge: false }
            );
          }
          // Release old handle if changing (delete old doc). Product decision: immediate release.
          if (previousHandle && previousHandle !== claimedHandle) {
            const oldHandleRef = doc(db, "handles", previousHandle);
            tx.delete(oldHandleRef);
          }
        }

        // Build systemInfo update preserving existing createdAt
        const systemInfoUpdates = {
          profileSetupComplete: true,
          status: userData?.systemInfo?.status || "offline",
          lastUpdated: serverTimestamp(),
        };
        if (isNewUser) {
          systemInfoUpdates.createdAt = serverTimestamp();
        } else if (userData?.systemInfo?.createdAt) {
          // Preserve createdAt by copying existing value if rules permit serverTimestamp only on new
          systemInfoUpdates.createdAt = userData.systemInfo.createdAt;
        }
        if (!previousHandle || previousHandle !== claimedHandle) {
          systemInfoUpdates.lastHandleChangeAt = serverTimestamp();
        }

        // For brand-new users, start with a clean onboarding slate regardless of any runtime state
        // observed during setup. For existing users, merge to preserve progress.
        systemInfoUpdates.onboarding = this.getInitialOnboardingState(
          userData?.systemInfo?.onboarding,
          isNewUser ? {} : runtimeOnboardingState
        );
        profileDataForFirestore.systemInfo.onboarding =
          systemInfoUpdates.onboarding;

        // Prepare merged user doc update
        const userUpdate = {
          profile: cleanProfileData,
          universityInfo: profileDataForFirestore.universityInfo,
          avatarConfig: profileDataForFirestore.avatarConfig,
          systemInfo: systemInfoUpdates,
        };

        tx.set(userRef, userUpdate, { merge: true });
      });

      if (userWasNew && onboardingService?.resetSessionHints) {
        try {
          onboardingService.resetSessionHints();
        } catch (error) {
          console.warn("⚠️ Failed to reset onboarding session hints for new user", error);
        }
      }

      console.log("✅ Profile saved successfully to Firestore");

      // 📊 Track user registration in analytics (moved outside transaction scope)
      AnalyticsService.trackUserRegistration(
        profileDataForFirestore.universityInfo?.university,
        cleanProfileData.major
      );
      AnalyticsService.setUserProperties(profileDataForFirestore);

      // 🎯 Phase-1: Save schedule to Firestore using ScheduleStorageService
      if (
        this.scheduleData &&
        this.scheduleData.courses &&
        this.scheduleData.courses.length > 0
      ) {
        await this.saveScheduleToFirestore();
        console.log(
          "📅 Schedule saved to Firestore with dual storage strategy"
        );
      }

      // 🔄 NEW: Sync cached user data so friends see changes immediately
      const userInfoForCache = {
        handle: claimedHandle,
        major: cleanProfileData.major,
        university: universityKey || "unknown",
        avatarConfig: this.avatarConfig,
      };

      // Update cache in background (don't wait for it)
      syncUserDataCache(userId, userInfoForCache)
        .then(() => console.log("✅ Friends will see your updated info!"))
        .catch((err) =>
          console.log("⚠️ Cache update failed, but profile saved:", err)
        );

      // 🎯 CRITICAL FIX: Update currentUser store with fresh profile data immediately
      console.log(
        "🔄 Updating currentUser store with fresh profile data after save..."
      );

      // Use the imported currentUser module, not window.currentUser
      if (currentUser && typeof currentUser.setProfile === "function") {
        currentUser.setProfile(profileDataForFirestore);
        console.log("✅ currentUser store updated with fresh profile data");
      } else {
        console.error("❌ currentUser store not available for profile update");
      }

      // Show success message and then dispatch event for SPA navigation
      this.showSuccessMessage();

      // Dispatch event after a short delay so the router handles navigation
      setTimeout(() => {
        console.log(
          "🚀 Dispatching profile:setup:complete event for navigation..."
        );
        document.dispatchEvent(
          new CustomEvent("profile:setup:complete", {
            detail: { userData: profileDataForFirestore },
          })
        );
      }, 1500); // 1.5-second delay
    } catch (error) {
      console.error("❌ Final profile save failed:", error);
      alert(
        "Oh no! Something went wrong while saving your profile. Please check your connection and try again."
      );
    }
  }

  /**
   * Save imported schedule to Firestore using Phase-1 ScheduleStorageService
   * Uses dual storage strategy (Firestore + localStorage cache)
   */
  async saveScheduleToFirestore() {
    try {
      if (
        !this.scheduleData ||
        !this.scheduleData.courses ||
        this.scheduleData.courses.length === 0
      ) {
        console.log("⚠️ No schedule data to save");
        return;
      }

      const userId =
        this.currentUser?.uid ||
        currentUser?.uid ||
        authManager.getCurrentUser()?.uid;
      if (!userId)
        throw new Error("No authenticated user. Please sign in again.");

      console.log("📅 Saving imported schedule to Firestore:", {
        userId,
        coursesImported: this.scheduleData.courses.length,
        importSource: "profile_setup",
      });

      // The scheduleData from ScheduleImportService is already in the correct format:
      // { schedule: 7x7 matrix, slotInfo: 7x7 matrix, courses: array, importedAt: timestamp }

      // Add import metadata for tracking
      const scheduleDataWithMetadata = {
        ...this.scheduleData,
        metadata: {
          importSource: "profile_setup",
          importMethod: this.scheduleData.importedAt ? "text" : "manual",
          coursesCount: this.scheduleData.courses?.length || 0,
          importedAt: this.scheduleData.importedAt || new Date().toISOString(),
        },
      };

      // Use ScheduleStorageService for Phase-1 dual storage strategy
      const success = await scheduleStorageService.saveUserSchedule(
        userId,
        scheduleDataWithMetadata
      );

      if (success) {
        console.log(
          "✅ Schedule saved successfully with dual storage strategy"
        );

        // 📊 Track schedule upload in analytics
        try {
          // Pull university from currentUser store (safer than stale userUpdate)
          const uniKey = (
            currentUser?.profile?.universityInfo?.university ||
            currentUser?.universityInfo?.university ||
            this.profileData?.universityInfo?.university ||
            "unknown"
          )
            .toString()
            .toLowerCase();
          const method = this.scheduleData.importMethod || "profile_setup";
          AnalyticsService.trackScheduleUpload(uniKey, method);
        } catch (e) {
          console.warn("📊 Schedule upload analytics failed (non-blocking)", e);
        }

        // Update currentUser store with schedule data
        currentUser.setScheduleData(scheduleDataWithMetadata);
        currentUser.setScheduleLastSynced(new Date());
        currentUser.clearScheduleError();
      } else {
        throw new Error("ScheduleStorageService returned false");
      }
    } catch (error) {
      console.error("❌ Failed to save schedule to Firestore:", error);

      // Update error state in userStore
      currentUser.setScheduleError(error.message);

      // Don't throw error - profile saving should still succeed even if schedule save fails
      console.warn(
        "⚠️ Profile setup will continue despite schedule save failure"
      );
    }
  }

  /**
   * =============================================================================
   *                      9. EVENT LISTENERS & DOM MANIPULATION
   * =============================================================================
   */

  /**
   * Setup all event listeners for the profile setup form
   */
  setupEventListeners() {
    const nextBtn = document.getElementById("setup-next-btn");
    const prevBtn = document.getElementById("setup-prev-btn");
    const skipBtn = document.getElementById("setup-skip-btn");
    const avatarEditBtn = document.getElementById("avatar-edit-btn");
    const bioInput = document.getElementById("setup-bio");
    const parseScheduleBtn = document.getElementById("parse-schedule-btn");
    const scheduleTextInput = document.getElementById("schedule-text-input");
    const scheduleImageInput = document.getElementById("schedule-image-input");
    const scheduleUploadArea = document.getElementById("schedule-upload-area");

    // 🎯 DEFENSIVE: Remove existing listeners first to prevent duplicates
    if (nextBtn && !nextBtn.hasAttribute("data-listener-attached")) {
      nextBtn.addEventListener("click", (e) => {
        // If button is disabled, show visual feedback and scroll to button
        if (nextBtn.disabled) {
          e.preventDefault();
          this.showIncompleteFieldsFeedback();
          return;
        }

        this.nextStep();
      });
      nextBtn.setAttribute("data-listener-attached", "true");
    }

    if (prevBtn && !prevBtn.hasAttribute("data-listener-attached")) {
      prevBtn.addEventListener("click", () => this.prevStep());
      prevBtn.setAttribute("data-listener-attached", "true");
    }

    if (skipBtn && !skipBtn.hasAttribute("data-listener-attached")) {
      skipBtn.addEventListener("click", () => this.skipSetup());
      skipBtn.setAttribute("data-listener-attached", "true");
    }

    // Avatar editor button event listener
    if (
      avatarEditBtn &&
      !avatarEditBtn.hasAttribute("data-listener-attached")
    ) {
      avatarEditBtn.addEventListener("click", () => {
        this.openAvatarEditor();
      });
      avatarEditBtn.setAttribute("data-listener-attached", "true");
    }

    if (bioInput && !bioInput.hasAttribute("data-listener-attached")) {
      bioInput.addEventListener("input", (e) => {
        const bioCount = document.getElementById("bio-count");
        if (bioCount) {
          bioCount.textContent = e.target.value.length;
        }
      });
      bioInput.setAttribute("data-listener-attached", "true");
    }

    // 🎯 NEW: Schedule import event listeners
    if (
      parseScheduleBtn &&
      !parseScheduleBtn.hasAttribute("data-listener-attached")
    ) {
      parseScheduleBtn.addEventListener("click", () =>
        this.handleScheduleParsing()
      );
      parseScheduleBtn.setAttribute("data-listener-attached", "true");
    }

    if (
      scheduleUploadArea &&
      !scheduleUploadArea.hasAttribute("data-listener-attached")
    ) {
      scheduleUploadArea.addEventListener("click", () => {
        if (scheduleImageInput) scheduleImageInput.click();
      });
      scheduleUploadArea.setAttribute("data-listener-attached", "true");
    }

    if (
      scheduleImageInput &&
      !scheduleImageInput.hasAttribute("data-listener-attached")
    ) {
      scheduleImageInput.addEventListener("change", (e) =>
        this.handleImageUpload(e)
      );
      scheduleImageInput.setAttribute("data-listener-attached", "true");
    }

    const scheduleHelpTrigger = document.getElementById(
      "schedule-help-trigger"
    );
    const scheduleHelpOverlay = document.getElementById(
      "schedule-help-overlay"
    );

    if (
      scheduleHelpTrigger &&
      !scheduleHelpTrigger.hasAttribute("data-listener-attached")
    ) {
      scheduleHelpTrigger.addEventListener("click", () =>
        this.openScheduleHelpOverlay()
      );
      scheduleHelpTrigger.setAttribute("data-listener-attached", "true");
    }

    if (scheduleHelpOverlay) {
      if (!scheduleHelpOverlay.hasAttribute("data-listener-attached")) {
        scheduleHelpOverlay.addEventListener("click", (event) => {
          const target = event.target;
          if (
            target.id === "schedule-help-overlay" ||
            target.classList.contains("schedule-help-backdrop")
          ) {
            this.closeScheduleHelpOverlay();
          }
        });
        scheduleHelpOverlay.setAttribute("data-listener-attached", "true");
      }

      const closeBtn = scheduleHelpOverlay.querySelector(".close-help");
      if (closeBtn && !closeBtn.hasAttribute("data-listener-attached")) {
        closeBtn.addEventListener("click", () => this.closeScheduleHelpOverlay());
        closeBtn.setAttribute("data-listener-attached", "true");
      }
    }

    // Privacy controls have been moved to Friends page for better UX

    this.setupFormValidation();
  }

  openScheduleHelpOverlay() {
    const overlay = document.getElementById("schedule-help-overlay");
    if (!overlay) return;

    overlay.classList.remove("hidden");
    overlay.classList.add("active");
    document.addEventListener("keydown", this.boundScheduleHelpKeyHandler);

    onboardingService
      .markSeen("schedulePasteHelpSeen", { allowPending: true })
      .catch(() => {});
  }

  closeScheduleHelpOverlay() {
    const overlay = document.getElementById("schedule-help-overlay");
    if (!overlay) return;
    overlay.classList.remove("active");
    overlay.classList.add("hidden");
    document.removeEventListener("keydown", this.boundScheduleHelpKeyHandler);
  }

  /**
   * Initialize a lightweight, mobile-friendly typeahead for the Major field
   * - Shows up to 5 matches as the user types
   * - Selection is restricted to predefined options
   * - Saves only the 3-letter code (e.g., CSC)
   */
  initMajorTypeahead() {
    const input = document.getElementById("setup-major");
    if (!input) return;

    // Avoid duplicate initialization
    if (input.getAttribute("data-typeahead-init") === "true") return;
    input.setAttribute("data-typeahead-init", "true");

    // Ensure a wrapper around the input (so dropdown anchors to the input, not the whole form-group)
    let wrapper = input.parentElement;
    if (!wrapper.classList.contains('typeahead-wrapper')) {
      const newWrapper = document.createElement('div');
      newWrapper.className = 'typeahead-wrapper';
      newWrapper.style.position = 'relative';
      newWrapper.style.width = '100%';
      // Insert wrapper and move input inside
      wrapper.insertBefore(newWrapper, input);
      newWrapper.appendChild(input);
      wrapper = newWrapper;
    }

    // Container for suggestions anchored to wrapper
    let list = wrapper.querySelector('#major-suggestions');
    if (!list) {
      list = document.createElement("div");
      list.id = "major-suggestions";
      list.className = "typeahead-list";
      wrapper.appendChild(list);
    }

    const setPlacement = () => {
      // Decide whether to open upwards based on viewport space
      const rect = input.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const spaceBelow = viewportH - rect.bottom;
      const spaceAbove = rect.top;
      const needUp = spaceBelow < 180 && spaceAbove > spaceBelow; // threshold
      list.classList.toggle('open-up', needUp);
    };

    const render = (items) => {
      list.innerHTML = "";
      items.slice(0, 5).forEach((m) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "typeahead-item";
        row.setAttribute("role", "option");
        row.innerHTML = `<span class="typeahead-code">${m.code}</span><span class="typeahead-name">${m.name}</span>`;
        row.addEventListener("click", () => {
          input.value = m.code; // Save only 3-letter code
          input.dataset.selected = m.code;
          list.classList.remove("open");
          this.validateCurrentStep();
        });
        list.appendChild(row);
      });
      if (items.length) {
        list.classList.add("open");
        // compute placement after DOM paints
        requestAnimationFrame(setPlacement);
      } else {
        list.classList.remove("open");
      }
    };

    const filter = (q) => {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      return this.MAJORS.filter(
        (m) =>
          m.code.toLowerCase().includes(s) || m.name.toLowerCase().includes(s)
      );
    };

    // Input events
    input.addEventListener("input", () => {
      const val = input.value;
      const matches = filter(val);
      render(matches);
    });
    input.addEventListener("focus", () => {
      const val = input.value;
      const matches = filter(val);
      render(matches);
    });
    // Close on outside click
    document.addEventListener("click", (e) => {
      if (!list.contains(e.target) && e.target !== input) {
        list.classList.remove("open");
        list.classList.remove("open-up");
      }
    });

    // Keyboard selection
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // If typed code exactly matches a valid code, accept
        const code = input.value.trim().toUpperCase();
        if (this.isValidMajorCode(code)) {
          input.value = code;
          input.dataset.selected = code;
          list.classList.remove("open");
          list.classList.remove("open-up");
          this.validateCurrentStep();
        }
      }
    });
  }

  /** Ensure a given code is one of the predefined majors */
  isValidMajorCode(code) {
    return this.MAJORS.some((m) => m.code === code);
  }

  /**
   * Create a custom-styled dropdown for Starting Year for consistent iOS/Android look
   */
  initStartingYearDropdown() {
    const select = document.getElementById("setup-starting-year");
    if (!select) return;
    if (select.getAttribute("data-customized") === "true") return;
    select.setAttribute("data-customized", "true");

    // Build wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    select.parentElement.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    // Hide native caret differences and add display
    select.classList.add("custom-select-native");
    const display = document.createElement("button");
    display.type = "button";
    display.className = "custom-select-display form-input";
    display.setAttribute("aria-haspopup", "listbox");
    display.setAttribute("aria-expanded", "false");
    display.textContent = select.value || "Select year";
    wrapper.appendChild(display);

    // Dropdown list
    const list = document.createElement("div");
    list.className = "select-dropdown";
    list.setAttribute("role", "listbox");
    wrapper.appendChild(list);

    const renderYears = () => {
      list.innerHTML = "";
      [...select.options]
        .filter((o) => o.value)
        .forEach((opt) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "select-item";
          item.setAttribute("role", "option");
          item.textContent = opt.textContent;
          if (opt.value === select.value) item.classList.add("selected");
          item.addEventListener("click", () => {
            select.value = opt.value;
            display.textContent = opt.textContent;
            list.classList.remove("open");
            display.setAttribute("aria-expanded", "false");
            // Trigger native change for validation
            select.dispatchEvent(new Event("change", { bubbles: true }));
            this.validateCurrentStep();
          });
          list.appendChild(item);
        });
    };

    renderYears();

    const setPlacement = () => {
      const rect = display.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const spaceBelow = viewportH - rect.bottom;
      const spaceAbove = rect.top;
      const needUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      list.classList.toggle('open-up', needUp);
    };

    const toggle = () => {
      const isOpen = list.classList.toggle("open");
      display.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) requestAnimationFrame(setPlacement);
      else list.classList.remove('open-up');
    };

    display.addEventListener("click", toggle);
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        list.classList.remove("open");
        list.classList.remove("open-up");
        display.setAttribute("aria-expanded", "false");
      }
    });

    // Keep in sync if template preselects a value
    select.addEventListener("change", () => {
      display.textContent = select.options[select.selectedIndex]?.text || "Select year";
      renderYears();
    });
  }

  /**
   * Setup form field validation event listeners
   */
  setupFormValidation() {
    // Define required fields for the first step (Basic Information)
    const requiredFieldsStep0 = [
      "setup-first-name",
      "setup-last-name",
      "setup-starting-year",
      "setup-major",
    ];

    // Attach event listeners to all fields in the first step for real-time validation
    requiredFieldsStep0.forEach((fieldId) => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.addEventListener("input", () => this.validateCurrentStep());
        field.addEventListener("blur", () => this.validateCurrentStep());
      }
    });
  }

  /**
   * =============================================================================
   *                       10. SCHEDULE IMPORT METHODS
   * =============================================================================
   */

  /**
   * Handle schedule text parsing when user clicks "Parse Schedule"
   */
  async handleScheduleParsing() {
    const textInput = document.getElementById("schedule-text-input");
    const parseBtn = document.getElementById("parse-schedule-btn");
    const statusDiv = document.getElementById("import-status");
    const previewDiv = document.getElementById("schedule-preview");

    if (!textInput || !textInput.value.trim()) {
      this.showScheduleError("Please enter some schedule text to parse.");
      return;
    }

    try {
      // Show processing status
      this.showScheduleStatus("Parsing your schedule...");
      parseBtn.disabled = true;
      parseBtn.textContent = "Processing...";

      // Process the schedule text
      const result = await this.scheduleImportService.processScheduleText(
        textInput.value
      );

      if (result.success) {
        // Store the schedule data
        this.scheduleData = result.scheduleData;

        // Show preview
        this.showSchedulePreview(result);

        // Hide status
        this.hideScheduleStatus();

        console.log("✅ Schedule parsed successfully:", result);
      } else {
        this.showScheduleError(`Failed to parse schedule: ${result.error}`);
      }
    } catch (error) {
      console.error("❌ Schedule parsing error:", error);
      this.showScheduleError(
        "An error occurred while parsing your schedule. Please try again."
      );
    } finally {
      parseBtn.disabled = false;
      parseBtn.innerHTML = '<i class="fas fa-search"></i> Parse Schedule';
    }
  }

  /**
   * Handle image upload for OCR processing
   */
  async handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Prevent double-processing by checking if we're already processing
    if (this.isProcessingImage) {
      console.log("🚫 Already processing an image, ignoring duplicate request");
      return;
    }

    this.isProcessingImage = true;

    try {
      // Quick check if OCR is likely to work
      if (!this.isOcrLikelySupported()) {
        throw new Error(
          "Image upload requires a modern browser with web worker support. Please use text paste instead."
        );
      }

      // Show processing status
      this.showScheduleStatus("Uploading image...", "info");

      // Validate file type
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select a valid image file (PNG, JPG, etc.)");
      }

      // Check file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error(
          "Image file is too large. Please use an image smaller than 10MB."
        );
      }

      // Process image with OCR
      const result = await this.scheduleImportService.processScheduleImage(
        file,
        (message, progress) => {
          this.showScheduleStatus(message, "info", progress);
        }
      );

      if (result.success) {
        this.scheduleData = result.scheduleData;

        // Check if any courses were actually found
        const courseCount =
          result.validationResult?.validatedCourses?.length || 0;

        if (courseCount > 0) {
          // Success with courses found
          this.showSchedulePreview(result);
          const ocrInfo = `✅ Found ${courseCount} courses! OCR completed with ${result.ocrConfidence}% confidence.`;
          this.showScheduleStatus(ocrInfo, "success");
          console.log(
            "🎉 Image processing successful! Courses found:",
            courseCount
          );
        } else {
          // Success but no courses found - provide helpful guidance
          this.showSchedulePreview(result); // Still show empty preview
          const helpMessage = `📷 OCR completed (${result.ocrConfidence}% confidence) but no courses detected. Try:\n• Taking a clearer photo\n• Ensuring good lighting\n• Cropping to show only the schedule table\n• Or paste the text manually instead`;
          this.showScheduleStatus(helpMessage, "info");
          console.log(
            "ℹ️ OCR successful but no courses parsed. Raw text:",
            result.extractedText || "No text extracted"
          );
        }
      } else {
        throw new Error(result.error || "Failed to process image");
      }
    } catch (error) {
      console.error("Image upload failed:", error);

      // Provide helpful error messages based on the error type
      let errorMessage = `Image processing failed: ${error.message}`;

      if (
        error.message.includes("security settings") ||
        error.message.includes("CSP")
      ) {
        errorMessage =
          "Image upload blocked by browser security. Please refresh the page and try again, or use text paste instead.";
      } else if (error.message.includes("not supported")) {
        errorMessage =
          "Image upload not supported in this browser. Please use text paste instead.";
      } else if (error.message.includes("too large")) {
        errorMessage =
          "Image file is too large. Please use an image smaller than 10MB.";
      } else if (error.message.includes("valid image")) {
        errorMessage = "Please select a valid image file (PNG, JPG, etc.).";
      }

      this.showScheduleError(errorMessage);

      // Clear the file inputCAn
      event.target.value = "";
    } finally {
      // Always reset the processing flag
      this.isProcessingImage = false;
    }
  }

  /**
   * Show schedule processing status with optional progress and type
   * @param {string} message - Status message to display
   * @param {string} type - Status type: 'info', 'success', 'error' (default: 'info')
   * @param {number} progress - Progress percentage 0-100 (optional)
   */
  showScheduleStatus(message, type = "info", progress = null) {
    const statusDiv = document.getElementById("import-status");
    const statusText = document.getElementById("status-text");

    if (statusDiv && statusText) {
      statusText.textContent = message;
      statusDiv.classList.remove("hidden");

      // Update status styling based on type
      statusDiv.className = statusDiv.className.replace(
        /status-(info|success|error)/g,
        ""
      );
      statusDiv.classList.add(`status-${type}`);

      // Show progress if provided
      if (progress !== null && progress >= 0 && progress <= 100) {
        const progressText = ` (${Math.round(progress)}%)`;
        if (!message.includes("%")) {
          statusText.textContent = message + progressText;
        }
      }
    }
  }

  /**
   * Hide schedule processing status
   */
  hideScheduleStatus() {
    const statusDiv = document.getElementById("import-status");
    if (statusDiv) {
      statusDiv.classList.add("hidden");
    }
  }

  /**
   * Quick check if OCR is likely to be supported
   * @returns {boolean} Whether OCR features might work
   */
  isOcrLikelySupported() {
    try {
      // Check for Worker support
      if (typeof Worker === "undefined") {
        console.warn("Web Workers not supported - OCR will fail");
        return false;
      }

      // Check for blob URL support
      if (
        typeof URL === "undefined" ||
        typeof URL.createObjectURL !== "function"
      ) {
        console.warn("Blob URLs not supported - OCR will fail");
        return false;
      }

      // Check for Canvas support
      if (typeof document === "undefined" || !document.createElement) {
        console.warn("Canvas not supported - OCR will fail");
        return false;
      }

      return true;
    } catch (error) {
      console.warn("OCR support check failed:", error);
      return false;
    }
  }

  /**
   * Show schedule error message
   */
  showScheduleError(message) {
    this.hideScheduleStatus();

    // Show error using existing error system or simple alert for now
    console.error("Schedule Import Error:", message);
    alert(message); // TODO: Replace with better error UI
  }

  /**
   * Show schedule preview with parsed courses
   */
  showSchedulePreview(result) {
    const previewDiv = document.getElementById("schedule-preview");
    const coursesFound = document.getElementById("courses-found");
    const previewContent = document.getElementById("preview-content");

    if (!previewDiv || !coursesFound || !previewContent) return;

    // Update stats
    coursesFound.textContent = `${result.stats.validCourses} courses found`;

    // Generate course cards
    const courseCards = result.validationResult.validatedCourses
      .map(
        (course) => `
      <div class="course-card">
        <div class="course-header">
          <span class="course-code">${course.courseCode}</span>
          ${
            course.section
              ? `<span class="course-section">Sec ${course.section}</span>`
              : ""
          }
        </div>
        <h4 class="course-name">${course.courseName}</h4>
        <div class="course-details">
          <div class="time-info">
            <span class="days">${course.days.join(", ")}</span>
            <span class="time">${course.startTime} - ${course.endTime}</span>
          </div>
          <div class="location-info">
            <span class="room">Room: ${course.room}</span>
          </div>
        </div>
      </div>
    `
      )
      .join("");

    previewContent.innerHTML = courseCards;
    previewDiv.classList.remove("hidden");
  }

  /**
   * =============================================================================
   *                       11. UTILITY & HELPER METHODS
   * =============================================================================
   */

  /**
   * Add visual styling for readonly form fields
   */
  styleReadonlyFields() {
    const readonlyFields = document.querySelectorAll(".form-input[readonly]");
    readonlyFields.forEach((field) => {
      field.classList.add("readonly-field");
    });
  }

  /**
   * Verify that initialization completed successfully
   */
  verifyInitialization() {
    const step0 = document.querySelector('.setup-step[data-step="0"]');
    if (!step0) {
      console.error("❌ Step 0 element not found during verification");
      return;
    }

    const hasActive = step0.classList.contains("active");
    const isVisible = window.getComputedStyle(step0).display !== "none";

    if (!hasActive || !isVisible) {
      console.error("❌ Step 0 is not properly visible or active");
    }
  }

  /**
   * Add diagnostic information for debugging display issues
   */
  addDiagnosticInfo() {
    // Only show critical diagnostic info - current step not found
    const currentStepEl = document.querySelector(
      `[data-step="${this.currentStep}"]`
    );
    if (!currentStepEl) {
      console.error("❌ Current step element NOT found!");
      console.error(
        "🔍 Looking for selector:",
        `[data-step="${this.currentStep}"]`
      );
    }
  }

  // handlePrivacyChange method removed - privacy controls moved to Friends page

  /**
   * Update step titles and descriptions based on mode (setup vs edit)
   * @param {string} mode - Either "setup" or "edit"
   */
  updateStepTitles(mode = "setup") {
    const stepDescription = document.querySelector(
      '[data-step="1"] .step-description'
    );

    if (stepDescription) {
      if (mode === "edit") {
        stepDescription.textContent = "Update your avatar and bio information.";
      } else {
        stepDescription.textContent = "Choose your avatar and add a short bio.";
      }
    }

    // Update main title if in edit mode
    const mainTitle = document.querySelector(".setup-title");

    if (mode === "edit" && mainTitle) {
      mainTitle.textContent = "Update Your Profile";
    }
  }

  /**
   * Test DiceBear API connectivity and provide debugging info
   */
  async testAvatarAPIConnectivity() {
    try {
      // Test with the simplest possible URL
      const testUrl = "https://api.dicebear.com/9.x/initials/svg?seed=test";

      const response = await fetch(testUrl, { method: "HEAD" });

      if (response.ok) {
        return true;
      } else {
        console.error(
          "❌ DiceBear API returned error status:",
          response.status
        );
        return false;
      }
    } catch (error) {
      console.error("❌ DiceBear API connectivity test failed:", error);
      return false;
    }
  }

  /**
   * Test avatar API connectivity with a simple request
   */
  async testAvatarAPI() {
    try {
      // Test with the simplest possible request
      const testUrl =
        "https://api.dicebear.com/9.x/initials/svg?seed=test&backgroundColor=b6e3f4";

      const response = await fetch(testUrl, { method: "HEAD" });

      if (response.ok) {
        return true;
      } else {
        console.error("❌ Avatar API returned error:", response.status);
        return false;
      }
    } catch (error) {
      console.error("❌ Avatar API test failed:", error);
      return false;
    }
  }

  /**
   * Create a simple avatar config for testing
   */
  createSimpleAvatarConfig() {
    if (!this.currentUser) return null;

    return {
      style: "initials",
      seed: this.currentUser.uid.substring(0, 8),
      options: {
        backgroundColor: "b6e3f4",
      },
    };
  }

  /**
   * Efficiently update the avatar preview in the profile setup flow.
   * Shows a loading spinner while the avatar image loads, and only shows initials if the image fails to load or no avatar config is present.
   * This method is called when entering the avatar step or after editing the avatar.
   */
  updateAvatarPreview() {
    // Allow re-entrant retry calls but guard too many loops
    const MAX_RETRIES = 3;
    if (typeof this._avatarPreviewAttempts === "undefined") {
      this._avatarPreviewAttempts = 0;
    }
    const previewContainer = document.getElementById("avatar-preview-display");
    if (!previewContainer) {
      console.warn("⚠️ Avatar preview container not found");
      return;
    }

    // Clear previous content
    previewContainer.innerHTML = "";

    // Helper: Get initials from profile data or email
    const getInitials = () => {
      const firstName = this.profileData?.firstName || "";
      const lastName = this.profileData?.lastName || "";
      if (firstName && lastName) {
        return `${firstName[0]}${lastName[0]}`.toUpperCase();
      }
      // Fallback: use email
      const email = this.profileData?.email || this.currentUser?.email || "";
      if (email) {
        return email[0].toUpperCase();
      }
      return "?";
    };

    // Helper: Render fallback initials avatar
    const renderInitials = () => {
      const initials = getInitials();
      const fallbackDiv = document.createElement("div");
      fallbackDiv.className = "avatar-fallback";
      fallbackDiv.setAttribute("aria-label", `Avatar fallback: ${initials}`);
      fallbackDiv.style.cssText = `
        width: 96px;
        height: 96px;
        border-radius: 50%;
        background: var(--avatar-fallback-bg, #b6e3f4);
        color: var(--avatar-fallback-fg, #222);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        user-select: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      `;
      fallbackDiv.textContent = initials;
      previewContainer.innerHTML = "";
      previewContainer.appendChild(fallbackDiv);
    };

    // Helper: Render accessible loading spinner
    const renderSpinner = () => {
      const spinnerWrapper = document.createElement("div");
      spinnerWrapper.className = "avatar-spinner-wrapper";
      spinnerWrapper.style.cssText = `
        width: 96px;
        height: 96px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      // Visually hidden text for screen readers
      const srText = document.createElement("span");
      srText.className = "sr-only";
      srText.textContent = "Loading avatar...";
      srText.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0,0,0,0);
        border: 0;
      `;
      // SVG spinner (accessible, contrast-friendly)
      const spinner = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      spinner.setAttribute("width", "48");
      spinner.setAttribute("height", "48");
      spinner.setAttribute("viewBox", "0 0 50 50");
      spinner.setAttribute("role", "status");
      spinner.setAttribute("aria-label", "Loading avatar");
      spinner.innerHTML = `
        <circle cx="25" cy="25" r="20" fill="none" stroke="#3b82f6" stroke-width="5" opacity="0.2"/>
        <circle cx="25" cy="25" r="20" fill="none" stroke="#3b82f6" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.4 94.2" stroke-dashoffset="0">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite"/>
        </circle>
      `;
      spinnerWrapper.appendChild(spinner);
      spinnerWrapper.appendChild(srText);
      previewContainer.appendChild(spinnerWrapper);
    };

    // If no avatar config or avatarManager, show fallback
    if (!this.avatarConfig || !avatarManager) {
      renderInitials();
      // Retry once shortly if avatarConfig may arrive after hydration
      if (this._avatarPreviewAttempts < MAX_RETRIES) {
        setTimeout(() => {
          this._avatarPreviewAttempts++;
          this.updateAvatarPreview();
        }, 500);
      }
      return;
    }

    // Try to generate avatar image URL
    let avatarUrl = "";
    try {
      avatarUrl = avatarManager.generateAvatarUrl(this.avatarConfig);
    } catch (e) {
      console.error("❌ Failed to generate avatar URL:", e);
      renderInitials();
      return;
    }

    // Show spinner while loading
    renderSpinner();

    let didFinish = false; // Track if image loaded or errored

    // Create image element for avatar
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = "User avatar";
    img.width = 96;
    img.height = 96;
    img.loading = "lazy";
    img.style.cssText = `
      width: 96px;
      height: 96px;
      border-radius: 50%;
      object-fit: cover;
      background: #f3f4f6;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: block;
    `;
    img.setAttribute("aria-label", "User avatar preview");

    // If image fails to load, show fallback
    img.onerror = () => {
      if (didFinish) return;
      didFinish = true;
      previewContainer.innerHTML = "";
      renderInitials();
      // Network hiccup retry logic
      if (this._avatarPreviewAttempts < MAX_RETRIES) {
        this._avatarPreviewAttempts++;
        setTimeout(() => this.updateAvatarPreview(), 1200);
      }
    };

    // When image loads, replace spinner with image
    img.onload = () => {
      if (didFinish) return;
      didFinish = true;
      previewContainer.innerHTML = "";
      previewContainer.appendChild(img);
    };

    // Timeout fallback: if image doesn't load in 5 seconds, show initials
    setTimeout(() => {
      if (!didFinish) {
        didFinish = true;
        previewContainer.innerHTML = "";
        renderInitials();
        if (this._avatarPreviewAttempts < MAX_RETRIES) {
          this._avatarPreviewAttempts++;
          setTimeout(() => this.updateAvatarPreview(), 1500);
        }
      }
    }, 5000);

    // Start loading image (browser will handle caching)
    // Spinner remains until image loads or fails
  }

  /**
   * Show or hide an offline status banner at the top of the profile setup page.
   * This helps users know when they are offline and that changes will sync later.
   */
  showOfflineBanner(isOffline) {
    let banner = document.getElementById("offline-status-banner");
    if (isOffline) {
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "offline-status-banner";
        banner.setAttribute("role", "status");
        banner.setAttribute("aria-live", "polite");
        banner.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          z-index: 20000;
          background: #f87171;
          color: #fff;
          text-align: center;
          font-size: 1rem;
          font-weight: 600;
          padding: 0.75rem 0.5rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          letter-spacing: 0.02em;
        `;
        banner.innerHTML =
          '<span style="display:inline-block;margin-right:0.5em;vertical-align:middle;">⚠️</span>' +
          '<span style="vertical-align:middle;">You are offline. Changes will be saved locally and synced when you are back online.</span>';
        document.body.appendChild(banner);
      } else {
        banner.style.display = "block";
      }
    } else if (banner) {
      banner.style.display = "none";
    }
  }

  /**
   * Caches frequently accessed DOM elements for performance.
   */
  cacheDOMElements() {
    this.dom = {
      // Form fields
      firstName: document.getElementById("setup-first-name"),
      lastName: document.getElementById("setup-last-name"),
      email: document.getElementById("setup-email"),
      studentId: document.getElementById("setup-student-id"),
      startingYear: document.getElementById("setup-starting-year"),
      major: document.getElementById("setup-major"),
      bio: document.getElementById("setup-bio"),
      bioCount: document.getElementById("bio-count"),

      // Buttons
      nextButton: document.getElementById("setup-next-btn"),
      prevButton: document.getElementById("setup-prev-btn"),
      finishButton: document.getElementById("finish-setup-button"),
      skipButton: document.getElementById("setup-skip-btn"),

      // Containers and structural elements
      card: document.querySelector(".profile-setup-card"),
      body: document.querySelector(".setup-body"),
      stepsContainer: document.querySelector(".setup-steps"),
      stepIndicators: document.querySelectorAll(".step-indicator"),
      stepTitle: document.querySelector(".step-title"),
      formSteps: document.querySelectorAll(".form-step"),
      avatarEditorTrigger: document.querySelector(".avatar-editor-trigger"),
      avatarPreview: document.querySelector(".avatar-preview-container"),
      form: document.querySelector(".profile-setup-form"),
    };

    // Re-apply avatar preview if we land directly on step 1 after hydration
    document.addEventListener(
      "profile:hydrated",
      () => {
        if (this.currentStep === 1) {
          setTimeout(() => this.updateAvatarPreview(), 50);
        }
      },
      { once: true }
    );
  }
}

/**
 * =============================================================================
 *                        GLOBAL INITIALIZATION SYSTEM
 * =============================================================================
 */

// Global instance variable and initialization flag
let profileSetupInstance = null;
let initializationInProgress = false;

/**
 * Wait for auth manager to be available
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds
 * @param {number} checkInterval - Interval between checks in milliseconds
 * @returns {Promise<Object>} Promise that resolves with auth manager
 */
function waitForAuthManager(maxWaitTime = 5000, checkInterval = 100) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    function checkAuthManager() {
      if (authManager && typeof authManager.getCurrentUser === "function") {
        console.log("✅ Auth manager is ready!");
        resolve(authManager);
      } else if (Date.now() - startTime >= maxWaitTime) {
        reject(new Error("Timeout waiting for auth manager"));
      } else {
        setTimeout(checkAuthManager, checkInterval);
      }
    }

    checkAuthManager();
  });
}

/**
 * Check authentication once auth manager is available and initialize if needed
 */
function checkAuthenticationAndInitialize() {
  // Check if user is already signed in
  const currentUser = authManager.getCurrentUser();
  console.log(
    "🔍 Current user from auth manager:",
    currentUser?.email || "None"
  );

  if (currentUser) {
    console.log(
      "✅ Found signed-in user, initializing profile setup immediately"
    );

    // Check if we're still on the profile page before creating instance
    const profileElements = document.querySelector(
      "#setup-email, #setup-student-id, .profile-setup-card"
    );
    if (profileElements && !profileSetupInstance) {
      profileSetupInstance = new ProfileSetup();
    } else if (!profileElements) {
      console.log(
        "🔄 User found but not on profile page, skipping initialization"
      );
    }
    return;
  }

  // No user signed in, listen for auth state changes
  console.log("👂 No user signed in, setting up auth state listener...");
  authManager.onAuthStateChanged((user) => {
    if (user && !profileSetupInstance) {
      console.log(
        "✅ User signed in via state change, checking if on profile page"
      );

      // Only initialize if we're on the profile page
      const profileElements = document.querySelector(
        "#setup-email, #setup-student-id, .profile-setup-card"
      );
      if (profileElements) {
        console.log("✅ On profile page, initializing profile setup");
        profileSetupInstance = new ProfileSetup();
      } else {
        console.log("🔄 User authenticated but not on profile page");
      }
    }
  });

  // Redirect to home after a reasonable delay if still no user
  setTimeout(() => {
    if (!profileSetupInstance) {
      console.log("❌ Still no user after waiting, redirecting to home");
      navigateTo("home");
    }
  }, 2000);
}

/**
 * Main initialization function for profile setup
 */
function initializeProfileSetup() {
  console.log("🚀 [DEBUG] initializeProfileSetup triggered.");
  if (!window.profileSetupInstance) {
    console.log("🚀 [DEBUG] No ProfileSetup instance found, creating one.");
    window.profileSetupInstance = new ProfileSetup();
  }

  // Trigger the initialization process.
  // This is now the official entry point.
  window.profileSetupInstance.initializeWhenReady();
}

/**
 * Helper function to retry auth detection for existing instance
 */
function retryAuthDetection() {
  if (
    profileSetupInstance &&
    typeof profileSetupInstance.checkAuthentication === "function"
  ) {
    console.log("🔄 Retrying authentication detection for existing instance");
    profileSetupInstance.checkAuthentication();
  }
}

// =============================================================================
//                           EVENT LISTENERS & INITIALIZATION
// =============================================================================

// 🎯 FIX #1: Listen for SPA navigation to profile page
document.addEventListener("spa:navigation", (event) => {
  if (event.detail.route === "profile") {
    console.log("🔄 Navigated to profile page via SPA...");

    // If profile setup instance doesn't exist, create it now
    if (!profileSetupInstance) {
      console.log("🎯 Profile setup not initialized, creating instance...");

      // Add a small delay to ensure template is loaded
      setTimeout(() => {
        if (!profileSetupInstance) {
          initializeProfileSetup();
        }
      }, 200);
    } else {
      console.log(
        "🔄 Profile setup already exists, checking if template needs re-initialization..."
      );

      // 🎯 CRITICAL FIX: Always re-initialize when navigating back to profile page
      // This handles the case where SPA navigation reloads the template but the instance exists
      setTimeout(() => {
        const emailInput = document.getElementById("setup-email");
        const studentIdInput = document.getElementById("setup-student-id");

        if (emailInput && studentIdInput) {
          const emailEmpty =
            !emailInput.value || emailInput.value.trim() === "";
          const studentIdEmpty =
            !studentIdInput.value || studentIdInput.value.trim() === "";

          console.log(
            `🔍 Template reload check - Email empty: ${emailEmpty}, Student ID empty: ${studentIdEmpty}`
          );

          if (
            emailEmpty &&
            studentIdEmpty &&
            profileSetupInstance.currentUser
          ) {
            console.log(
              "🔄 Template was reloaded with empty fields, re-populating..."
            );
            profileSetupInstance.reinitializeForFreshTemplate();
          } else if (emailEmpty || studentIdEmpty) {
            console.log(
              "🔄 Some fields empty, ensuring all fields are populated..."
            );
            profileSetupInstance.prefillUserData();
          } else {
            console.log("✅ Fields are already populated, no action needed");
          }
        } else {
          console.log("⚠️ Form fields not found in reloaded template");
        }
      }, 100);
    }
  }
});

// 🎯 NEW: Event listener for SPA page loads
document.addEventListener("spa:page:load", (event) => {
  const { route } = event.detail;
  console.log(`[profile-setup.js] Received spa:page:load for route: ${route}`);

  if (route === "profile") {
    console.log("🚀 Initializing Profile Setup page...");
    // The core initialization logic from the old DOMContentLoaded listener
    initializeProfileSetup();
  }
});

// Disable animations right before leaving the profile page to avoid visual pull
document.addEventListener("spa:page:unload", (event) => {
  if (event.detail?.route === "profile") {
    ProfileSetup.disableExitAnimations();
  }
});

// 🗑️ LEGACY: The traditional DOMContentLoaded listener is no longer needed for the SPA.
// The logic has been moved into the `spa:page:load` event listener above to ensure
// it runs every time the profile page is loaded via the router.
// document.addEventListener("DOMContentLoaded", () => {
//   if (document.readyState === "interactive" || document.readyState === "complete") {
//     console.log("🚀 DOM fully loaded and parsed, initializing profile setup...");
//     initializeProfileSetup();
//   } else {
//     console.log("📄 DOM still loading, waiting for DOMContentLoaded...");
//   }
// });

/* ===============================================================================================
 * 🎓 LEARNING MOMENT: From DOMContentLoaded to SPA Events
 *
 * In traditional web development, we often rely on the `DOMContentLoaded` event to initialize scripts
 * that depend on the DOM being fully loaded. However, in Single Page Applications (SPAs), navigation
 * between pages doesn't trigger a full page reload, and thus `DOMContentLoaded` may not fire as expected.
 *
 * To adapt to SPAs, we listen for custom events like `spa:page:load` that signal when a new page is
 * fully loaded and ready for interaction. This ensures our initialization code runs at the right time,
 * every time the user navigates to the profile page, regardless of how they got there.
 *
 * =============================================================================================== */

// =============================================================================
//                         UTILITY FUNCTIONS FOR TESTING
// =============================================================================

/**
 * Email validation utility function
 * @param {string} email - Email to validate
 * @returns {boolean} True if email is valid
 */
export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Name formatting utility function
 * @param {string} name - Name to format
 * @returns {string} Properly formatted name
 */
export function formatName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Extract student ID from email
 * @param {string} email - Email to extract ID from
 * @returns {string} Student ID extracted from email (part before @)
 */
export function generateStudentId(email) {
  if (!email || typeof email !== "string") return "";
  const emailParts = email.split("@");
  return emailParts.length > 0 ? emailParts[0] : "";
}

/**
 * Starting year validation utility
 * @param {string|number} year - Year to validate
 * @returns {boolean} True if year is valid
 */
export function isValidStartingYear(year) {
  if (!year) return false;
  const yearNum = parseInt(year);
  if (isNaN(yearNum)) return false;

  const currentYear = new Date().getFullYear();
  return yearNum >= currentYear - 6 && yearNum <= currentYear;
}

/**
 * Validate required profile fields
 * @param {Object} data - Profile data to validate
 * @returns {boolean} True if all required fields are present
 */
export function validateRequiredFields(data) {
  const required = ["firstName", "lastName", "major", "startingYear"];
  return required.every(
    (field) =>
      data[field] &&
      typeof data[field] === "string" &&
      data[field].trim() !== ""
  );
}

// Fallback global (prototype) method injection if not already defined inside class body
if (!ProfileSetup.prototype.applyHandleCooldownState) {
  ProfileSetup.prototype.applyHandleCooldownState = function (retryCount = 0) {
    try {
      const handleInput = document.getElementById("setup-handle");
      const wrapper = handleInput?.closest(".handle-status-wrapper");
      if (!handleInput || !wrapper) {
        if (retryCount < 10)
          setTimeout(() => this.applyHandleCooldownState(retryCount + 1), 150);
        return;
      }
      let badge = document.getElementById("setup-handle-cooldown");
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "setup-handle-cooldown";
        badge.className = "handle-cooldown-badge";
        badge.style.display = "none";
        wrapper.appendChild(badge);
      }
      if (!document.getElementById("handle-style-injections")) {
        const styleEl = document.createElement("style");
        styleEl.id = "handle-style-injections";
        styleEl.textContent = `
          .handle-cooldown-badge { position:absolute; right:12px; top:50%; transform:translateY(-50%); padding:4px 10px; font-size:12px; line-height:1; border-radius:14px; backdrop-filter:blur(8px); background:rgba(255,255,255,0.12); color:var(--text-primary,#fff); box-shadow:0 2px 6px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.08) inset; font-weight:500; letter-spacing:.25px; }
          .handle-status-wrapper.cooldown-active .form-input { cursor:not-allowed; opacity:.85; background:linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); }
          .handle-status-wrapper.cooldown-active .form-input:focus { outline:none; box-shadow:0 0 0 2px rgba(255,255,255,0.15); }
          .handle-status-wrapper.cooldown-active .handle-status-icon { display:none !important; }
        `;
        document.head.appendChild(styleEl);
      }
      const sysInfo =
        this.existingProfileData?.systemInfo ||
        this.existingProfileData?.profile?.systemInfo ||
        currentUser?.profile?.systemInfo ||
        currentUser?.systemInfo;
      const lastChange = sysInfo?.lastHandleChangeAt;
      if (!lastChange) {
        handleInput.disabled = false;
        wrapper.classList.remove("cooldown-active");
        if (badge) badge.style.display = "none";
        if (this.handleCooldownInterval) {
          clearInterval(this.handleCooldownInterval);
          this.handleCooldownInterval = null;
        }
        return;
      }
      const { allowed, remainingMs } = canChangeHandle(lastChange);
      const feedbackEl = document.getElementById("setup-handle-feedback");
      if (allowed) {
        handleInput.disabled = false;
        wrapper.classList.remove("cooldown-active");
        if (badge) badge.style.display = "none";
        if (this.handleCooldownInterval) {
          clearInterval(this.handleCooldownInterval);
          this.handleCooldownInterval = null;
        }
        return;
      }
      handleInput.disabled = true;
      wrapper.classList.add("cooldown-active");
      badge.textContent = formatCooldown(remainingMs);
      badge.style.display = "inline-flex";
      badge.title = "Handle change locked until cooldown ends";
      if (feedbackEl) {
        feedbackEl.textContent = `Handle locked – change available in ${formatCooldown(
          remainingMs
        )}`;
        feedbackEl.className = "field-hint";
      }
      if (!this.handleCooldownInterval) {
        this.handleCooldownInterval = setInterval(() => {
          const sys =
            this.existingProfileData?.systemInfo ||
            this.existingProfileData?.profile?.systemInfo ||
            currentUser?.profile?.systemInfo ||
            currentUser?.systemInfo;
          const lc = sys?.lastHandleChangeAt;
          const res = canChangeHandle(lc);
          if (res.allowed) {
            this.applyHandleCooldownState();
          } else {
            badge.textContent = formatCooldown(res.remainingMs);
            if (feedbackEl)
              feedbackEl.textContent = `Handle locked – change available in ${formatCooldown(
                res.remainingMs
              )}`;
          }
        }, 60000);
        this.activeTimeouts?.add?.(this.handleCooldownInterval);
      }
    } catch (e) {
      if (retryCount < 5)
        setTimeout(() => this.applyHandleCooldownState(retryCount + 1), 300);
    }
  };
}

// Export the ProfileSetup class for testing
export { ProfileSetup };

// =============================================================================
//                                    END
// =============================================================================
