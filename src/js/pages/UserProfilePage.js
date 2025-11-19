import { currentUser } from "../store/userStore.js";
import { authManager } from "../services/auth/AuthService.js";
import { dataManager } from "../services/data/DataService.js";
import { friendsManager } from "../services/friends/FriendsService.js";
import { getAvatarUrl } from "../utils/avatar/avatarUtils.js";
import { mutualFriendsModal } from "../components/friends/MutualFriendsModal.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import { logManager } from "../utils/debug/LogManager.js";

class UserProfilePage {
  constructor() {
    this.targetUid = null;
    this.dom = {};
    this.fullHash = ""; // Store the full hash from the event
    this.mutualFriendIds = []; // Store mutual friend IDs for modal
    this.viewedUserHandle = ""; // Store viewed user's handle for modal title
  }

  /**
   * Parse user ID from a hash string
   * @param {string} hash - The full hash including query params (e.g., "#user?id=123")
   * @returns {string|null} The user ID or null
   */
  parseUserIdFromHash(hash = "") {
    try {
      const hashStr = hash || window.location.hash || "";
      logManager.dev.debug(
        "[UserProfilePage] parseUserIdFromHash - raw hash:",
        hashStr
      );
      const idx = hashStr.indexOf("?");
      const qs = idx >= 0 ? hashStr.substring(idx + 1) : "";
      const params = new URLSearchParams(qs);
      const raw = params.get("id");
      const result = raw ? decodeURIComponent(raw) : null;
      logManager.dev.debug(
        "[UserProfilePage] parseUserIdFromHash - final result:",
        result
      );
      return result;
    } catch (e) {
      logManager.ui.error("[UserProfilePage] parseUserIdFromHash - error:", e);
      return null;
    }
  }

  isPreviewMode(hash = "") {
    try {
      const hashStr = hash || window.location.hash || "";
      const idx = hashStr.indexOf("?");
      const qs = idx >= 0 ? hashStr.substring(idx + 1) : "";
      const params = new URLSearchParams(qs);
      const v = params.get("preview");
      return v === "1" || v === "true";
    } catch (_) {
      return false;
    }
  }

  cacheDom() {
    this.dom.photo = document.getElementById("profile-photo");
    this.dom.name = document.getElementById("profile-name");
    this.dom.handle = document.getElementById("profile-handle");
    this.dom.major = document.getElementById("profile-major");
    this.dom.actions = document.getElementById("header-actions");

    this.dom.bioSection = document.getElementById("bio-section");
    this.dom.bio = document.getElementById("profile-bio");
    this.dom.socialSection = document.getElementById("social-section");
    this.dom.social = document.getElementById("social-links");
    this.dom.interestsSection = document.getElementById("interests-section");
    this.dom.interests = document.getElementById("interests-list");
    this.dom.qaSection = document.getElementById("qa-section");
    this.dom.qaList = document.getElementById("qa-list");
    this.dom.mutualSection = document.getElementById("mutual-section");
    this.dom.mutual = document.getElementById("mutual-friends");
    this.dom.classesSection = document.getElementById("classes-section");
    this.dom.classes = document.getElementById("common-classes");
    this.dom.privacyNote = document.getElementById("privacy-note");
  }

  /**
   * Show skeleton loading state
   */
  showLoadingState() {
    // Header skeletons
    if (this.dom.photo)
      this.dom.photo.innerHTML = '<div class="skeleton skeleton-photo"></div>';
    if (this.dom.name)
      this.dom.name.innerHTML =
        '<div class="skeleton skeleton-text w-50" style="height: 1.4rem; margin-bottom: 0;"></div>';
    if (this.dom.handle)
      this.dom.handle.innerHTML =
        '<div class="skeleton skeleton-text w-30" style="display: inline-block;"></div>';
    if (this.dom.major)
      this.dom.major.innerHTML =
        '<div class="skeleton skeleton-text w-40" style="display: inline-block;"></div>';
    if (this.dom.actions)
      this.dom.actions.innerHTML = '<div class="skeleton skeleton-btn"></div>';

    // Bio skeleton
    if (this.dom.bio) {
      this.dom.bio.innerHTML = `
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text w-75"></div>
      `;
      this.show(this.dom.bioSection);
    }

    // Interests skeleton
    if (this.dom.interests) {
      this.dom.interests.innerHTML = `
        <div class="skeleton skeleton-chip"></div>
        <div class="skeleton skeleton-chip"></div>
        <div class="skeleton skeleton-chip"></div>
      `;
      this.show(this.dom.interestsSection);
    }
  }

  async mount() {
    logManager.dev.debug("[UserProfilePage] mount() called");

    // Parse user ID from the stored hash (passed from event)
    this.targetUid = this.parseUserIdFromHash(this.fullHash);
    logManager.dev.debug("[UserProfilePage] targetUid parsed:", this.targetUid);
    this.cacheDom();

    if (!this.targetUid) {
      logManager.ui.warn("[UserProfilePage] No targetUid found in hash");
      if (this.dom.name) this.dom.name.textContent = "Profile not found";
      return;
    }

    // Show loading state immediately
    this.showLoadingState();

    // Immersive mode: hide navs (mobile only via CSS)
    document.body.classList.add("immersive-profile-mode");

    // Add back button
    const backBtn = document.createElement("button");
    backBtn.className = "profile-back-btn";
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
    backBtn.onclick = async () => {
      try {
        const { navigateTo } = await import("../app.js");
        navigateTo("home"); // Default to home or previous if tracked
      } catch (_) {
        window.location.hash = "#home";
      }
    };

    // Insert back button to profile card for relative positioning
    const profileCard = document.getElementById("profile-card");
    if (profileCard) {
      profileCard.insertBefore(backBtn, profileCard.firstChild);
      this.dom.backBtn = backBtn;
    }

    // Add scroll hint
    const hint = document.createElement("div");
    hint.className = "scroll-hint visible";
    hint.innerHTML = '<i class="fas fa-chevron-down"></i>';
    document.body.appendChild(hint);
    this.dom.scrollHint = hint;

    // Scroll listener to hide hint
    const container = document.querySelector(".user-profile-view");
    if (container) {
      this.dom.profileView = container; // Cache the container
      // Scroll hint logic
      const onScroll = () => {
        if (this.dom.profileView.scrollTop > 10) {
          if (hint && hint.parentNode) {
            hint.remove();
          }
          this.dom.profileView.removeEventListener("scroll", onScroll);
        }
      };
      this.dom.profileView.addEventListener("scroll", onScroll);
    }

    // CRITICAL: Wait for auth to be ready before proceeding
    logManager.dev.debug("[UserProfilePage] Waiting for auth readiness...");
    try {
      if (
        authManager?.authReady &&
        typeof authManager.authReady.then === "function"
      ) {
        await Promise.race([
          authManager.authReady,
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }
    } catch (e) {
      logManager.ui.warn("[UserProfilePage] Auth ready wait error:", e);
    }

    // Get myUid with fallback
    let myUid = authManager?.auth?.currentUser?.uid || null;
    if (!myUid && currentUser?.uid) {
      myUid = currentUser.uid;
    }
    if (!myUid && currentUser?.waitForUid) {
      try {
        myUid = await currentUser.waitForUid(2000);
      } catch (e) {
        logManager.ui.warn("[UserProfilePage] waitForUid failed:", e);
      }
    }
    logManager.dev.debug("[UserProfilePage] myUid resolved:", myUid);

    const isSelf = myUid && this.targetUid === myUid;
    const preview = this.isPreviewMode(this.fullHash);
    logManager.dev.debug(
      "[UserProfilePage] isSelf:",
      isSelf,
      "preview:",
      preview
    );

    // Preview banner (optional enhancement)
    try {
      if (preview) {
        const card = document.getElementById("profile-card");
        if (card && !card.querySelector(".preview-banner")) {
          const banner = document.createElement("div");
          banner.className = "preview-banner";
          banner.innerHTML = `
            <i class="fas fa-eye"></i>
            <span>Preview mode: This is how others will see your public profile.</span>
          `;
          card.insertBefore(banner, card.firstChild);
        }
      }
    } catch (_) {}

    // Load profiles
    let myProfile = null;
    if (myUid) {
      myProfile =
        currentUser?.profile || (await dataManager.getUserProfile(myUid));
      logManager.dev.debug("[UserProfilePage] myProfile loaded:", !!myProfile);
    }

    let targetProfile = null;
    logManager.dev.debug(
      "[UserProfilePage] Fetching target profile for:",
      this.targetUid
    );

    try {
      targetProfile = await dataManager.getUserProfile(this.targetUid);
      logManager.dev.debug(
        "[UserProfilePage] getUserProfile result:",
        !!targetProfile
      );
    } catch (e) {
      logManager.ui.error("[UserProfilePage] getUserProfile error:", e);
    }

    // Fallback for preview/self: wait briefly for hydrated profile, then use it
    if (!targetProfile && (isSelf || preview)) {
      logManager.dev.debug(
        "[UserProfilePage] Trying waitForProfileWithTimeout fallback..."
      );
      try {
        if (currentUser.waitForProfileWithTimeout) {
          await currentUser.waitForProfileWithTimeout(1500).catch(() => {});
          targetProfile = currentUser?.profile || null;
          logManager.dev.debug(
            "[UserProfilePage] waitForProfileWithTimeout result:",
            !!targetProfile
          );
        }
      } catch (e) {
        logManager.ui.warn(
          "[UserProfilePage] waitForProfileWithTimeout error:",
          e
        );
      }
    }

    // As a last resort in preview/self, synthesize a minimal stub so the page renders
    if (!targetProfile && (isSelf || preview)) {
      logManager.dev.debug(
        "[UserProfilePage] Creating minimal stub for self/preview"
      );
      const currentEmail = authManager?.auth?.currentUser?.email || "";
      targetProfile = {
        profile: {
          handle:
            currentUser?.profile?.profile?.handle ||
            currentEmail.split("@")[0] ||
            "",
          firstName: currentUser?.profile?.profile?.firstName || "",
          lastName: currentUser?.profile?.profile?.lastName || "",
          major: currentUser?.profile?.profile?.major || "",
          startingYear: currentUser?.profile?.profile?.startingYear || "",
          bio: currentUser?.profile?.profile?.bio || "",
          useAvatar: true,
        },
        avatarConfig: currentUser?.profile?.avatarConfig || null,
        universityInfo: currentUser?.profile?.universityInfo || null,
      };
      logManager.dev.debug(
        "[UserProfilePage] Stub created with handle:",
        targetProfile.profile.handle
      );
    }

    // Try friendship snapshot for minimal header if we are friends
    if (!targetProfile && myUid) {
      logManager.dev.debug("[UserProfilePage] Trying friendship fallback...");
      try {
        const fr = await dataManager.getFriendshipBetweenUsers(
          myUid,
          this.targetUid
        );
        logManager.dev.debug("[UserProfilePage] Friendship result:", !!fr);

        if (
          fr &&
          Array.isArray(fr.users) &&
          fr.users.includes(myUid) &&
          fr.users.includes(this.targetUid)
        ) {
          const info =
            fr.user1Id === this.targetUid ? fr.user1Info : fr.user2Info;
          logManager.dev.debug(
            "[UserProfilePage] Friend info from friendship doc:",
            !!info
          );

          if (info) {
            targetProfile = {
              profile: {
                handle: info.handle || "",
                firstName: info.firstName || "",
                lastName: info.lastName || "",
                major: info.major || "",
                bio: "",
                useAvatar: true,
              },
              avatarConfig: info.avatarConfig || null,
              universityInfo: myProfile?.universityInfo || null,
            };
            logManager.dev.debug(
              "[UserProfilePage] Limited profile created from friendship"
            );
          }
        }
      } catch (e) {
        logManager.ui.error("[UserProfilePage] Friendship fallback error:", e);
      }
    }

    if (!targetProfile) {
      logManager.ui.error(
        "[UserProfilePage] All fallbacks exhausted - no profile data"
      );
      if (this.dom.name) this.dom.name.textContent = "Profile not found";
      return;
    }

    const sameUniversity = this.isSameUniversity(myProfile, targetProfile);
    logManager.dev.debug("[UserProfilePage] Same university:", sameUniversity);

    // Determine relationship status (friends/pending/none)
    let relationship = { type: "none" };
    if (!isSelf && myUid) {
      try {
        const fr = await dataManager.getFriendshipBetweenUsers(
          myUid,
          this.targetUid
        );
        if (fr) {
          relationship = { type: "friends" };
        } else {
          const existing = await dataManager.checkExistingFriendRequest(
            myUid,
            this.targetUid
          );
          if (existing) {
            if (existing.status === "accepted")
              relationship = { type: "friends" };
            else if (existing.status === "pending")
              relationship = { type: "pending" };
          }
        }
      } catch (e) {
        logManager.ui.warn("[UserProfilePage] Relationship lookup failed:", e);
      }
    }

    this.renderHeader(targetProfile, isSelf, preview, relationship);

    // Clear skeletons from sections before rendering real data
    this.hideAllSections();

    if (!isSelf && !sameUniversity) {
      logManager.dev.debug(
        "[UserProfilePage] Different university - showing privacy note"
      );
      this.show(this.dom.privacyNote);
      return;
    }

    // Sections
    this.renderBio(targetProfile);
    this.renderSocial(targetProfile);
    this.renderInterests(targetProfile);
    this.renderQA(targetProfile);
    if (isSelf && preview) {
      this.renderPreviewPlaceholders();
    } else {
      await this.renderMutualFriends(myUid, this.targetUid);
      this.renderClassesInCommon(myProfile, targetProfile);
    }
    logManager.dev.debug("[UserProfilePage] mount() completed successfully");
  }

  isSameUniversity(a, b) {
    try {
      const ua =
        a?.universityInfo?.university ||
        a?.universityInfo?.universityName ||
        null;
      const ub =
        b?.universityInfo?.university ||
        b?.universityInfo?.universityName ||
        null;
      return (
        !!ua && !!ub && String(ua).toLowerCase() === String(ub).toLowerCase()
      );
    } catch (_) {
      return false;
    }
  }

  renderHeader(
    profileDoc,
    isSelf,
    preview = false,
    relationship = { type: "none" }
  ) {
    logManager.dev.info(
      "[UserProfilePage] Rendering header - isSelf:",
      isSelf,
      "preview:",
      preview
    );
    const p = profileDoc?.profile || {};
    const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
    this.dom.name.textContent = name || (p.handle ? `@${p.handle}` : "Profile");
    this.dom.handle.textContent = p.handle ? `@${p.handle}` : "";
    const major = p.major ? p.major : "";
    const year = profileDoc?.profile?.startingYear
      ? ` • ${profileDoc.profile.startingYear}`
      : "";
    this.dom.major.textContent = `${major}${year}`.trim();

    logManager.dev.info(
      "[UserProfilePage] Header text set - name:",
      this.dom.name.textContent,
      "handle:",
      this.dom.handle.textContent
    );

    // Photo or avatar (photo-first unless user explicitly chose avatar)
    const imgEl = document.createElement("img");
    const photoUrl = profileDoc?.profile?.profilePhotoUrl || null;
    const useAvatarFlag = profileDoc?.profile?.useAvatar;
    const shouldUsePhoto = !!photoUrl && useAvatarFlag !== true;

    if (shouldUsePhoto) {
      imgEl.src = photoUrl;
      logManager.dev.info("[UserProfilePage] Using profile photo:", photoUrl);
    } else {
      const url = getAvatarUrl(profileDoc) || "";
      if (url) {
        imgEl.src = url;
        logManager.dev.info(
          "[UserProfilePage] Using avatar URL:",
          url.substring(0, 50) + "..."
        );
      }
    }
    imgEl.alt = name || p.handle || "Profile photo";
    this.dom.photo.innerHTML = "";
    this.dom.photo.appendChild(imgEl);

    // Actions
    this.dom.actions.innerHTML = "";
    if (isSelf && !preview) {
      logManager.dev.info("[UserProfilePage] Rendering Edit Profile button");
      const editBtn = document.createElement("button");
      editBtn.className = "btn secondary";
      editBtn.textContent = "Edit Profile";
      editBtn.addEventListener("click", () => {
        window.location.hash = "#profile";
      });
      this.dom.actions.appendChild(editBtn);
    } else if (!isSelf) {
      // Render relationship-aware action
      if (relationship?.type === "friends") {
        const btn = document.createElement("button");
        btn.className = "btn secondary";
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-user-check"></i> Friends';
        this.dom.actions.appendChild(btn);
      } else if (relationship?.type === "pending") {
        const btn = document.createElement("button");
        btn.className = "btn secondary";
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-clock"></i> Pending';
        this.dom.actions.appendChild(btn);
      } else {
        logManager.dev.info("[UserProfilePage] Rendering Add Friend button");
        const addBtn = document.createElement("button");
        addBtn.className = "btn primary";
        addBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
        addBtn.addEventListener("click", async () => {
          try {
            addBtn.disabled = true;
            addBtn.innerHTML =
              '<i class="fas fa-spinner fa-spin"></i> Sending...';
            const result = await friendsManager.sendFriendRequest(
              this.targetUid,
              profileDoc
            );
            if (result?.success) {
              addBtn.className = "btn secondary";
              addBtn.innerHTML = '<i class="fas fa-clock"></i> Pending';
            } else {
              addBtn.disabled = false;
              addBtn.className = "btn primary";
              addBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
              notificationManager.show(
                result?.message || "Failed to send friend request",
                "error"
              );
            }
          } catch (e) {
            addBtn.disabled = false;
            addBtn.className = "btn primary";
            addBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
            logManager.ui.error(e);
            notificationManager.show("Failed to send friend request", "error");
          }
        });
        this.dom.actions.appendChild(addBtn);
      }
    }
  }

  renderPreviewPlaceholders() {
    // Mutual friends placeholder
    if (this.dom.mutual) {
      this.dom.mutual.innerHTML = `<div class="notice">Up to 3 mutual friends will appear here when viewed by another student.</div>`;
      this.show(this.dom.mutualSection);
    }
    // Classes in common placeholder
    if (this.dom.classes) {
      this.dom.classes.innerHTML = `<div class="notice">Any shared classes with the viewer will be listed here.</div>`;
      this.show(this.dom.classesSection);
    }
  }

  renderBio(profileDoc) {
    const bio = profileDoc?.profile?.bio || "";
    if (!bio) return;
    this.dom.bio.textContent = bio;
    this.show(this.dom.bioSection);
  }

  renderSocial(profileDoc) {
    const links = Array.isArray(profileDoc?.profile?.socialLinks)
      ? profileDoc.profile.socialLinks
      : [];
    if (!links.length) return;
    this.dom.social.innerHTML = links
      .map((l) => this.renderSocialLink(l))
      .join("");
    this.show(this.dom.socialSection);
  }

  renderSocialLink(link) {
    const type = String(link?.type || "custom");
    const url = String(link?.url || "#");

    // Extract username/display text from URL based on platform
    let displayText = "";
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const parts = pathname.split("/").filter((p) => p);

      if (type === "linkedin") {
        // LinkedIn format: /in/username or /company/name
        // Extract the actual username after /in/
        if (parts.length >= 2 && parts[0] === "in") {
          displayText = parts[1];
        } else if (parts.length > 0) {
          displayText = parts[parts.length - 1];
        } else {
          displayText = "LinkedIn";
        }
      } else if (type === "facebook" || type === "github") {
        // Facebook and GitHub: just show username without @
        if (parts.length > 0) {
          displayText = parts[0];
        } else {
          displayText = type;
        }
      } else if (type === "instagram" || type === "x") {
        // Instagram and X/Twitter: show with @ prefix
        if (parts.length > 0) {
          displayText = "@" + parts[0];
        } else {
          displayText = "@" + type;
        }
      } else if (type === "custom") {
        // Custom: show domain name
        displayText = urlObj.hostname.replace("www.", "");
      } else {
        displayText = parts.length > 0 ? parts[0] : type;
      }
    } catch {
      displayText = type;
    }

    const map = {
      instagram: {
        icon: "fab fa-instagram",
        colorClass: "social-chip-instagram",
      },
      facebook: { icon: "fab fa-facebook", colorClass: "social-chip-facebook" },
      linkedin: { icon: "fab fa-linkedin", colorClass: "social-chip-linkedin" },
      github: { icon: "fab fa-github", colorClass: "social-chip-github" },
      x: { icon: "fab fa-x-twitter", colorClass: "social-chip-x" },
      custom: { icon: "fas fa-link", colorClass: "social-chip-custom" },
    };
    const meta = map[type] || map.custom;
    const safeUrl = url.startsWith("http") ? url : `https://${url}`;

    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="social-chip ${
      meta.colorClass
    }">
      <i class="${meta.icon}"></i>
      <span>${this.escapeHtml(displayText)}</span>
    </a>`;
  }

  renderInterests(profileDoc) {
    const arr = Array.isArray(profileDoc?.profile?.interests)
      ? profileDoc.profile.interests
      : [];
    if (!arr.length) return;
    this.dom.interests.innerHTML = arr
      .slice(0, 10)
      .map(
        (i) =>
          `<span class="chip"><i class="fas fa-hashtag"></i>${this.escapeHtml(
            i
          )}</span>`
      )
      .join("");
    this.show(this.dom.interestsSection);
  }

  renderQA(profileDoc) {
    const arr = Array.isArray(profileDoc?.profile?.qnaResponses)
      ? profileDoc.profile.qnaResponses
      : [];
    if (!arr.length) return;
    this.dom.qaList.innerHTML = arr
      .slice(0, 5)
      .map(
        (q) =>
          `<div class="qa-item"><div class="q">${this.escapeHtml(
            q.question || "Question"
          )}</div><div class="a">${this.escapeHtml(q.answer || "")}</div></div>`
      )
      .join("");
    this.show(this.dom.qaSection);
  }

  async renderMutualFriends(myUid, targetUid) {
    try {
      if (!myUid || !targetUid || myUid === targetUid) {
        logManager.dev.info(
          "[UserProfilePage] Skipping mutual friends - invalid uids"
        );
        return;
      }
      logManager.dev.info("[UserProfilePage] Fetching mutual friends...");

      // Try denormalized arrays first
      const myDoc =
        currentUser?.profile || (await dataManager.getUserProfile(myUid));
      const theirDoc = await dataManager.getUserProfile(targetUid);
      let mine = myDoc?.socialInfo?.friendIds || null;
      let theirs = theirDoc?.socialInfo?.friendIds || null;

      logManager.dev.info(
        "[UserProfilePage] Denormalized friendIds - mine:",
        !!mine,
        "theirs:",
        !!theirs
      );

      if (!Array.isArray(mine) || !Array.isArray(theirs)) {
        // Fallback: Get MY friendships only (can't query other people's friendships - security violation)
        logManager.dev.info(
          "[UserProfilePage] Falling back to MY friendship query only..."
        );
        const myFriendships = await dataManager.getUserFriendships(myUid);
        logManager.dev.info(
          "[UserProfilePage] My friendships count:",
          myFriendships?.length
        );

        // Extract my friend IDs
        mine = myFriendships.map((f) =>
          f.user1Id === myUid ? f.user2Id : f.user1Id
        );

        // For their friends, we can only use what's in their profile's denormalized friendIds
        // If not available, we can't determine mutual friends (privacy by design)
        if (!Array.isArray(theirs)) {
          logManager.dev.info(
            "[UserProfilePage] Cannot determine their friends - denormalized data not available"
          );
          theirs = [];
        }
      }

      const mySet = new Set(mine || []);
      const mutualIds = (theirs || []).filter((id) => mySet.has(id));
      logManager.dev.info(
        "[UserProfilePage] Mutual friend IDs found:",
        mutualIds.length
      );

      // Store mutualIds for the modal
      this.mutualFriendIds = mutualIds;
      this.viewedUserHandle = theirDoc?.profile?.handle || "this user";

      if (!mutualIds.length) {
        logManager.dev.info("[UserProfilePage] No mutual friends to display");
        return;
      }

      // Show clickable link instead of inline preview
      this.dom.mutual.innerHTML = `
        <button class="view-mutual-friends-btn">
          <i class="fas fa-user-friends"></i>
          <span>${mutualIds.length} mutual friend${
        mutualIds.length !== 1 ? "s" : ""
      }</span>
          <i class="fas fa-chevron-right"></i>
        </button>
      `;

      // Add click handler to open modal
      const btn = this.dom.mutual.querySelector(".view-mutual-friends-btn");
      if (btn) {
        btn.addEventListener("click", () => this.openMutualFriendsModal());
      }

      this.show(this.dom.mutualSection);
    } catch (e) {
      logManager.ui.error(
        "[UserProfilePage] Error rendering mutual friends:",
        e
      );
      /* non-fatal */
    }
  }

  renderClassesInCommon(myDoc, theirDoc) {
    try {
      logManager.dev.info("[UserProfilePage] Checking classes in common...");
      const a = Array.isArray(myDoc?.courses) ? myDoc.courses : [];
      const b = Array.isArray(theirDoc?.courses) ? theirDoc.courses : [];
      logManager.dev.info(
        "[UserProfilePage] My courses:",
        a.length,
        "Their courses:",
        b.length
      );

      if (!a.length || !b.length) {
        logManager.dev.info("[UserProfilePage] No courses to compare");
        return;
      }

      const key = (c) =>
        `${c.dayPattern || ""}__${c.timeSlot || ""}__${(
          c.classroom || ""
        ).toUpperCase()}__${String(c.section || "")}`;
      const aMap = new Map(a.map((c) => [key(c), c]));
      const common = [];
      for (const c of b) {
        const k = key(c);
        if (aMap.has(k)) {
          // Merge for display
          const ac = aMap.get(k);
          common.push({
            courseCode: ac.courseCode || c.courseCode || null,
            courseName: ac.courseName || c.courseName || "Course",
            section: ac.section || c.section,
            dayPattern: ac.dayPattern || c.dayPattern,
            timeStart: ac.timeStart || c.timeStart,
            timeEnd: ac.timeEnd || c.timeEnd,
            classroom: (ac.classroom || c.classroom || "").toUpperCase(),
          });
        }
      }
      logManager.dev.info(
        "[UserProfilePage] Common classes found:",
        common.length
      );

      if (!common.length) return;

      this.dom.classes.innerHTML = common
        .slice(0, 10)
        .map((s) => {
          const title =
            s.courseCode || this.toTitleCase(s.courseName || "Course");
          const sec = s.section ? `S-${parseInt(s.section, 10)}` : "";
          const slot = `${s.dayPattern || ""} ${s.timeStart || ""}-${
            s.timeEnd || ""
          }`.trim();
          const room = s.classroom || "";
          return `<div class="class-row"><strong>${this.escapeHtml(
            title
          )}</strong> • ${this.escapeHtml(sec)} • ${this.escapeHtml(
            slot
          )} • ${this.escapeHtml(room)}</div>`;
        })
        .join("");
      this.show(this.dom.classesSection);
    } catch (e) {
      logManager.ui.error(
        "[UserProfilePage] Error rendering classes in common:",
        e
      );
      /* non-fatal */
    }
  }

  hideAllSections() {
    [
      this.dom.bioSection,
      this.dom.socialSection,
      this.dom.interestsSection,
      this.dom.qaSection,
      this.dom.mutualSection,
      this.dom.classesSection,
    ].forEach((el) => this.hide(el));
  }

  /**
   * Open the mutual friends modal
   */
  openMutualFriendsModal() {
    if (!this.mutualFriendIds || this.mutualFriendIds.length === 0) {
      logManager.dev.info(
        "[UserProfilePage] No mutual friends to show in modal"
      );
      return;
    }

    logManager.dev.info(
      "[UserProfilePage] Opening mutual friends modal with",
      this.mutualFriendIds.length,
      "friends"
    );
    mutualFriendsModal.open(this.mutualFriendIds, this.viewedUserHandle);
  }

  show(el) {
    if (el) el.classList.remove("hidden");
  }
  hide(el) {
    if (el) el.classList.add("hidden");
  }

  toTitleCase(str) {
    return String(str || "")
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }

  escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  destroy() {
    document.body.classList.remove("immersive-profile-mode");
    if (this.dom.scrollHint) {
      this.dom.scrollHint.remove();
    }
    if (this.dom.backBtn) {
      this.dom.backBtn.remove();
    }
  }
}

let instance = null;
document.addEventListener("spa:page:unload", () => {
  if (instance) {
    instance.destroy();
    instance = null;
  }
});

document.addEventListener("spa:page:load", async (event) => {
  const route = event?.detail?.route;
  if (route !== "user") return;

  // Get the full hash from event detail (preserves query params)
  const fullHash = event?.detail?.hash || window.location.hash || "";
  logManager.dev.info(
    "[UserProfilePage] Event received - route:",
    route,
    "hash:",
    fullHash
  );

  instance = new UserProfilePage();
  instance.fullHash = fullHash; // Store hash before mounting
  await instance.mount();
});

export { UserProfilePage };
export default UserProfilePage;
