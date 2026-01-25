import { classSpacesService } from "../services/groups/ClassSpacesService.js";
import { logManager } from "../utils/debug/LogManager.js";
import { unreadTracker } from "../services/groups/UnreadTracker.js";
import { currentUser } from "../store/userStore.js";
import { blockService } from "../services/social/BlockService.js";
import { getAvatarUrl } from "../utils/avatar/avatarUtils.js";
import { friendsManager } from "../services/friends/FriendsService.js";
import { notificationManager } from "../services/realtime/NotificationService.js";

export class GroupDetailPage {
  constructor() {
    this.container = null;
    this.spaceId = null;
    this.unsub = null;
    this.allMessages = [];
    this.lastDocs = []; // Latest window docs (for realtime deduplication)
    this.earliestDoc = null; // Pagination cursor (preserved across realtime updates)
    this.hasMoreMessages = true;
    this.isLoadingMore = false;
    this._initialRenderDone = false; // track first paint for auto-scroll
    this._lastSendAtBySpace = {}; // client-side rate limit (per space)
    this._dom = null;
    this._space = null;
    this._memberInfo = null;
    this._myUid = null;
    this._myFriendIds = new Set();
    this._backBtn = null;
    this._leaveBtn = null;

    this._handleMembersListClick = this._handleMembersListClick.bind(this);
    this._handleMessagesClick = this._handleMessagesClick.bind(this);
    this._handleTabChatClick = this._handleTabChatClick.bind(this);
    this._handleTabMembersClick = this._handleTabMembersClick.bind(this);
    this._handleLoadOlderMessagesClick =
      this._handleLoadOlderMessagesClick.bind(this);
    this._handleSendMessageClick = this._handleSendMessageClick.bind(this);
    this._handleMessageInputKeydown =
      this._handleMessageInputKeydown.bind(this);
    this._handleBackClick = this._handleBackClick.bind(this);
    this._handleLeaveClick = this._handleLeaveClick.bind(this);
  }

  // Re-render members list state (blocked badges/buttons) without full reload
  refreshMembersList(space, myUid) {
    try {
      const membersList = document.getElementById("membersList");
      if (!membersList) return;
      membersList.querySelectorAll(".member-item").forEach((row) => {
        const uid = row.getAttribute("data-uid");
        if (!uid || uid === myUid) return;
        const blocked = blockService.isBlocked(myUid, uid);
        row.classList.toggle("blocked", blocked);
        const badge = row.querySelector(".member-badge");
        if (badge) badge.style.display = blocked ? "inline-block" : "none";
        const actions = row.querySelector(".member-actions");
        if (!actions) return;
        const reportBtn = actions.querySelector(".member-report-btn");
        let blockBtn = actions.querySelector(".member-block-btn");
        let unblockBtn = actions.querySelector(".member-unblock-btn");
        if (blocked) {
          if (blockBtn) blockBtn.remove();
          if (!unblockBtn) {
            unblockBtn = document.createElement("button");
            unblockBtn.className = "member-unblock-btn";
            unblockBtn.dataset.uid = uid;
            unblockBtn.title = "Unblock user";
            unblockBtn.setAttribute("aria-label", "Unblock user");
            unblockBtn.innerHTML = '<i class="fas fa-user-check"></i>';
            actions.insertBefore(unblockBtn, reportBtn);
          }
        } else {
          if (unblockBtn) unblockBtn.remove();
          if (!blockBtn) {
            blockBtn = document.createElement("button");
            blockBtn.className = "member-block-btn";
            blockBtn.dataset.uid = uid;
            blockBtn.title = "Block user";
            blockBtn.setAttribute("aria-label", "Block user");
            blockBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
            actions.insertBefore(blockBtn, reportBtn);
          }
        }
      });
    } catch (e) {
      logManager?.dev?.debug?.("[GroupDetailPage] refreshMembersList failed", e);
    }
  }
  parseSpaceIdFromHash() {
    try {
      const hash = window.location.hash || ""; // e.g., #group?id=abc
      const idx = hash.indexOf("?");
      const qs = idx >= 0 ? hash.substring(idx + 1) : "";
      const params = new URLSearchParams(qs);
      const fromQuery = params.get("id");
      if (fromQuery) return fromQuery;
      try {
        const fromStore = sessionStorage.getItem("group:spaceId");
        if (fromStore) return fromStore;
      } catch (err) {
        logManager.dev.debug("Storage access failed: reading group:spaceId", err);
      }
      return null;
    } catch (err) {
      logManager.dev.debug("parseSpaceIdFromHash failed", err);
      return null;
    }
  }

  async mount() {
    // Wait for profile data to load before gating (prevents false negatives on fresh page loads)
    try {
      await currentUser.waitForProfile();
    } catch (e) {
      console.error("[GroupDetailPage] Failed to load profile", e);
    }

    // Start Firestore-backed block list sync (fallbacks to localStorage on failure)
    try {
      if (currentUser?.uid) {
        await blockService.startSync(currentUser.uid);
      }
    } catch (err) {
      logManager.dev.debug("blockService.startSync failed", err);
    }

    // PRD Requirement: Gate Groups until profile setup is complete
    if (!currentUser.isProfileComplete()) {
      const titleEl = document.getElementById("group-title");
      const subEl = document.getElementById("group-sub");
      if (titleEl) {
        titleEl.textContent = "Profile Setup Required";
      }
      if (subEl) {
        subEl.textContent = "Please complete your profile to access groups";
      }
      // Redirect to profile after a moment
      setTimeout(async () => {
        try {
          const { navigateTo } = await import("../app.js");
          window.location.hash = "#profile";
          navigateTo("profile");
        } catch (_) {
          window.location.hash = "#profile";
        }
      }, 1500);
      return;
    }

    this.spaceId = this.parseSpaceIdFromHash();
    // Preserve spaceId in sessionStorage for back navigation from profile
    const titleEl = document.getElementById("group-title");
    const subEl = document.getElementById("group-sub");
    const messagesEl = document.getElementById("messages");
    const sendBtn = document.getElementById("sendMessageBtn");
    const input = document.getElementById("messageText");
    const tabChat = document.getElementById("tab-chat");
    const tabMembers = document.getElementById("tab-members");
    const chatPane = document.getElementById("group-chat");
    const membersPane = document.getElementById("group-members");
    const membersList = document.getElementById("membersList");
    const loadOlderBtn = document.getElementById("loadOlderBtn");

    this._dom = {
      titleEl,
      subEl,
      messagesEl,
      sendBtn,
      input,
      tabChat,
      tabMembers,
      chatPane,
      membersPane,
      membersList,
      loadOlderBtn,
    };

    console.log("[GroupDetailPage] Mount called with spaceId:", this.spaceId);

    // If returning from a member profile, restore Members tab
    try {
      const returnTab = sessionStorage.getItem("group:returnTab");
      console.log(
        "[GroupDetailPage] Checking returnTab session value:",
        returnTab
      );
      if (returnTab === "members") {
        console.log("[GroupDetailPage] Restoring members tab view");
        if (tabMembers) tabMembers.classList.add("active");
        if (tabChat) tabChat.classList.remove("active");
        if (membersPane) membersPane.classList.remove("hidden");
        if (chatPane) chatPane.classList.add("hidden");

        // Defer removal until after first render cycle so a second mount in same tick still sees it
        setTimeout(() => {
          try {
            sessionStorage.removeItem("group:returnTab");
            console.log("[GroupDetailPage] Cleared returnTab session value");
          } catch (e) {}
        }, 100);
      } else {
        console.log("[GroupDetailPage] No returnTab set, defaulting to chat");
      }
    } catch (e) {
      console.error("[GroupDetailPage] Error restoring members tab", e);
    }

    if (!this.spaceId) {
      logManager.dev.debug(
        "[GroupDetailPage] Missing spaceId before metadata load",
        { stored: sessionStorage.getItem("group:spaceId") }
      );
      titleEl.textContent = "Group not found";
      return;
    }

    // Immersive mode: hide navs
    document.body.classList.add("immersive-chat-mode");
    window.dispatchEvent(new Event("layoutChromeChange"));

    // Add back button
    const backBtn = document.createElement("button");
    backBtn.className = "group-back-btn";
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
    backBtn.addEventListener("click", this._handleBackClick);
    this._backBtn = backBtn;

    // Insert back button before title
    if (titleEl && titleEl.parentNode) {
      titleEl.parentNode.insertBefore(backBtn, titleEl);
    }

    // Add Leave button
    const leaveBtn = document.createElement("button");
    leaveBtn.className = "group-leave-btn";
    leaveBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
    leaveBtn.title = "Leave this class space";
    leaveBtn.addEventListener("click", this._handleLeaveClick);
    this._leaveBtn = leaveBtn;

    // Insert leave button after title
    if (titleEl && titleEl.parentNode) {
      titleEl.parentNode.appendChild(leaveBtn);
    }

    // Hide subtitle
    if (subEl) subEl.style.display = "none";

    // Load space metadata
    const space = await classSpacesService.getSpace(this.spaceId);
    if (!space) {
      titleEl.textContent = "Group not found";
      return;
    }
    const title = this.buildTitle(space);
    titleEl.textContent = title;
    subEl.textContent = `${space.classroom || ""} • ${space.dayPattern || ""} ${
      space.timeStart || ""
    }-${space.timeEnd || ""}`;

    // Get current user ID early for member filtering
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    const myUid = auth?.currentUser?.uid || null;
    this._myUid = myUid;

    // Mark this space as viewed (for unread badge tracking)
    if (myUid) {
      unreadTracker.markAsViewed(this.spaceId, myUid);
    }

    logManager.dev.debug("[GroupDetailPage] Rendering members list", {
      spaceId: this.spaceId,
      memberCount: Array.isArray(space.memberIds) ? space.memberIds.length : 0,
    });
    // Members list (with avatar chips + block/unblock actions)
    const memberIds = Array.isArray(space.memberIds) ? space.memberIds : [];
    const memberInfo = space.memberInfo || {};
    this._space = space;
    this._memberInfo = memberInfo;
    // Quick check to avoid showing Add button for existing friends (uses denormalized friendIds)
    const myFriendIds = Array.isArray(
      currentUser?.profile?.socialInfo?.friendIds
    )
      ? new Set(currentUser.profile.socialInfo.friendIds)
      : new Set();
    this._myFriendIds = myFriendIds;
    membersList.innerHTML = memberIds
      .map((uid) => {
        if (uid === myUid) return ""; // Skip self
        const info = memberInfo[uid] || {};
        const name =
          `${info.firstName || ""} ${info.lastName || ""}`.trim() ||
          (info.handle ? `@${info.handle}` : uid);
        const label = name || uid;
        const target = encodeURIComponent(uid);
        const photo = info.profilePhotoUrl || null;
        const avatar =
          photo || getAvatarUrl({ avatarConfig: info.avatarConfig }) || null;
        const blocked = blockService.isBlocked(myUid, uid);
        const alreadyFriend = myFriendIds.has(uid);
        return `
          <div class="member-item${
            blocked ? " blocked" : ""
          }" data-uid="${uid}">
            <div class="member-main">
              <a class="member-avatar" href="#user?id=${target}&from=group&tab=members" aria-label="View profile">
                ${
                  avatar
                    ? `<img src="${avatar}" alt="${escapeHtml(label)}">`
                    : `<div class="avatar-placeholder"><i class="fas fa-user"></i></div>`
                }
              </a>
              <a class="member-link" href="#user?id=${target}&from=group&tab=members">${escapeHtml(
          label
        )}</a>
              ${blocked ? '<span class="member-badge">Blocked</span>' : ""}
            </div>
            <div class="member-actions">
              <a class="member-profile-btn" href="#user?id=${target}&from=group&tab=members" title="View profile" aria-label="View profile">
                <i class="fas fa-id-badge"></i>
              </a>
              ${
                alreadyFriend
                  ? `<button class="member-friends-btn" title="Friends" aria-label="Friends" disabled><i class="fas fa-user-check"></i></button>`
                  : `<button class="member-add-btn" data-uid="${uid}" data-handle="${
                      info.handle || ""
                    }" data-major="${
                      info.major || ""
                    }" title="Add friend" aria-label="Add friend"><i class="fas fa-user-plus"></i></button>`
              }
              ${
                blocked
                  ? `<button class="member-unblock-btn" data-uid="${uid}" title="Unblock user" aria-label="Unblock user"><i class="fas fa-user-check"></i></button>`
                  : `<button class="member-block-btn" data-uid="${uid}" title="Block user" aria-label="Block user"><i class="fas fa-user-slash"></i></button>`
              }
              <button class="member-report-btn" data-uid="${uid}" title="Report user" aria-label="Report user">
                <i class="fas fa-flag"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    logManager.dev.debug("[GroupDetailPage] Members list HTML rendered", {
      spaceId: this.spaceId,
    });
    if (membersList) {
      membersList.addEventListener("click", this._handleMembersListClick);
    }
    if (messagesEl) {
      messagesEl.addEventListener("click", this._handleMessagesClick);
    }

    // Tabs
    if (tabChat) tabChat.addEventListener("click", this._handleTabChatClick);
    if (tabMembers)
      tabMembers.addEventListener("click", this._handleTabMembersClick);

    // Messages listener
    this.unsub = classSpacesService.listenToMessages(
      this.spaceId,
      (items, docs) => {
        // Measure scroll state before re-render
        const prevScrollTop = messagesEl?.scrollTop ?? 0;
        const prevScrollHeight = messagesEl?.scrollHeight ?? 0;
        const nearBottom = (() => {
          if (!messagesEl) return true;
          const bottomGap =
            messagesEl.scrollHeight -
            messagesEl.scrollTop -
            messagesEl.clientHeight;
          return bottomGap < 100; // within 100px of bottom counts as near-bottom
        })();

        // Create a map of existing messages for quick lookups
        const existingMap = new Map(this.allMessages.map((m) => [m.id, m]));

        // Process incoming messages: update existing or add new
        items.forEach((item) => {
          const idx = existingMap.has(item.id)
            ? this.allMessages.findIndex((m) => m.id === item.id)
            : -1;
          if (idx >= 0) {
            // Replace existing message with updated version
            this.allMessages[idx] = item;
          } else {
            // Add new message
            this.allMessages.push(item);
          }
        });

        // Re-sort to maintain chronological order
        this.allMessages.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return aTime - bTime;
        });

        // Initialize pagination cursor only once (preserve oldest loaded doc)
        if (this.earliestDoc === null && docs && docs.length > 0) {
          // docs are oldest → newest per ClassSpacesService
          this.earliestDoc = docs[0];

          // Show pagination button if we got a full page (implies more may exist)
          if (loadOlderBtn && items.length >= 50) {
            this.hasMoreMessages = true;
            loadOlderBtn.classList.remove("hidden");
          }
        }

        // Re-render message list
        this.renderMessages(messagesEl, myUid);

        // Restore or adjust scroll after render
        if (!messagesEl) return;
        if (!this._initialRenderDone) {
          // First paint: scroll to bottom
          messagesEl.scrollTop = messagesEl.scrollHeight;
          this._initialRenderDone = true;
        } else if (nearBottom) {
          // If user was at bottom, keep them at the newest message
          messagesEl.scrollTop = messagesEl.scrollHeight;
        } else {
          // Preserve viewport position when content grew at bottom
          const delta = messagesEl.scrollHeight - prevScrollHeight;
          if (delta > 0) {
            messagesEl.scrollTop = prevScrollTop + delta;
          } else {
            messagesEl.scrollTop = prevScrollTop;
          }
        }
      }
    );

    // Load older messages handler
    if (loadOlderBtn) {
      loadOlderBtn.addEventListener("click", this._handleLoadOlderMessagesClick);
    }

    // Send handler
    if (sendBtn) sendBtn.addEventListener("click", this._handleSendMessageClick);
    if (input)
      input.addEventListener("keydown", this._handleMessageInputKeydown);
  }

  async _handleMembersListClick(e) {
    const membersList = this._dom?.membersList;
    if (!membersList) return;

    const reportBtn = e.target?.closest?.(".member-report-btn");
    if (reportBtn && membersList.contains(reportBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const uid = reportBtn.dataset.uid;
      if (!uid) return;
      try {
        const { ReportModal } = await import(
          "../components/modals/ReportModal.js"
        );
        const modal = new ReportModal();
        modal.show({
          type: "user",
          reportedId: uid,
          additionalData: { spaceId: this.spaceId },
        });
      } catch (err) {
        logManager?.system?.error?.(
          "[GroupDetailPage] Failed to open member report modal",
          err
        );
      }
      return;
    }

    const blockBtn = e.target?.closest?.(".member-block-btn");
    if (blockBtn && membersList.contains(blockBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const uid = blockBtn.dataset.uid;
      if (!uid || !this._myUid) return;
      blockService.block(this._myUid, uid);
      this.refreshMembersList(this._space, this._myUid);
      this.renderMessages(this._dom?.messagesEl, this._myUid);
      return;
    }

    const unblockBtn = e.target?.closest?.(".member-unblock-btn");
    if (unblockBtn && membersList.contains(unblockBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const uid = unblockBtn.dataset.uid;
      if (!uid || !this._myUid) return;
      blockService.unblock(this._myUid, uid);
      this.refreshMembersList(this._space, this._myUid);
      this.renderMessages(this._dom?.messagesEl, this._myUid);
      return;
    }

    const addBtn = e.target?.closest?.(".member-add-btn");
    if (addBtn && membersList.contains(addBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const uid = addBtn.dataset.uid;
      if (!uid) return;

      if (this._myFriendIds?.has?.(uid)) return;

      const info = this._memberInfo?.[uid] || {};
      const targetUserData = {
        profile: {
          handle: info.handle || "",
          major: info.major || "",
        },
        avatarConfig: info.avatarConfig || null,
        universityInfo: { university: this._space?.university || "" },
      };

      const originalHtml = addBtn.innerHTML;
      try {
        addBtn.disabled = true;
        addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        const res = await friendsManager.sendFriendRequest(uid, targetUserData);
        if (res?.success) {
          try {
            this._myFriendIds.add(uid);
          } catch (err) {
            logManager.dev.debug("Data processing error: adding friend to Set", err);
          }
          addBtn.className = "member-friends-btn";
          addBtn.innerHTML = '<i class="fas fa-clock"></i>';
          addBtn.title = "Pending";
          addBtn.setAttribute("aria-label", "Pending");
          addBtn.disabled = true;
        } else {
          addBtn.disabled = false;
          addBtn.innerHTML = originalHtml;
          notificationManager.show(
            res?.message || "Failed to send friend request",
            "error"
          );
        }
      } catch (err) {
        addBtn.disabled = false;
        addBtn.innerHTML = originalHtml;
        logManager?.system?.error?.(
          "[GroupDetailPage] Add friend failed",
          err
        );
        notificationManager.show("Failed to send friend request", "error");
      }
      return;
    }
  }

  async _handleMessagesClick(e) {
    const messagesEl = this._dom?.messagesEl;
    if (!messagesEl) return;

    const reportBtn = e.target?.closest?.(".message-report-btn");
    if (!reportBtn || !messagesEl.contains(reportBtn)) return;

    e.preventDefault();
    e.stopPropagation();
    const msgId = reportBtn.dataset.msgid;
    if (!msgId) return;

    try {
      const { ReportModal } = await import("../components/modals/ReportModal.js");
      const modal = new ReportModal();
      modal.show({
        type: "message",
        reportedId: msgId,
        additionalData: { spaceId: this.spaceId },
      });
    } catch (err) {
      logManager?.system?.error?.(
        "[GroupDetailPage] Failed to open message report modal",
        err
      );
    }
  }

  _handleTabChatClick() {
    const tabChat = this._dom?.tabChat;
    const tabMembers = this._dom?.tabMembers;
    const chatPane = this._dom?.chatPane;
    const membersPane = this._dom?.membersPane;
    if (!tabChat || !tabMembers || !chatPane || !membersPane) return;
    tabChat.classList.add("active");
    tabMembers.classList.remove("active");
    chatPane.classList.remove("hidden");
    membersPane.classList.add("hidden");
    console.log("[GroupDetailPage] Tab switched to chat");
  }

  _handleTabMembersClick() {
    const tabChat = this._dom?.tabChat;
    const tabMembers = this._dom?.tabMembers;
    const chatPane = this._dom?.chatPane;
    const membersPane = this._dom?.membersPane;
    if (!tabChat || !tabMembers || !chatPane || !membersPane) return;
    tabMembers.classList.add("active");
    tabChat.classList.remove("active");
    membersPane.classList.remove("hidden");
    chatPane.classList.add("hidden");
    console.log("[GroupDetailPage] Tab switched to members");
  }

  async _handleLoadOlderMessagesClick() {
    const loadOlderBtn = this._dom?.loadOlderBtn;
    const messagesEl = this._dom?.messagesEl;
    if (!loadOlderBtn || !messagesEl) return;
    if (this.isLoadingMore || !this.hasMoreMessages) return;

    this.isLoadingMore = true;
    loadOlderBtn.disabled = true;
    loadOlderBtn.textContent = "Loading...";

    try {
      // Save scroll position to restore after loading
      const oldScrollHeight = messagesEl.scrollHeight;

      // Use preserved pagination cursor (never affected by realtime updates)
      const firstDoc = this.earliestDoc;
      if (!firstDoc) {
        this.hasMoreMessages = false;
        loadOlderBtn.classList.add("hidden");
        return;
      }

      // Load older messages (docs returned oldest→newest)
      const { items, docs } = await classSpacesService.loadMore(
        this.spaceId,
        firstDoc,
        { pageSize: 50 }
      );

      if (items.length === 0) {
        this.hasMoreMessages = false;
        loadOlderBtn.classList.add("hidden");
        return;
      }

      // Update pagination cursor to the oldest doc from this batch
      this.earliestDoc = docs[0];

      // Update latest window docs (prepend older docs)
      this.lastDocs = [...docs, ...this.lastDocs];

      // Add older messages to the beginning
      const existingIds = new Set(this.allMessages.map((m) => m.id));
      const olderMessages = items.filter((m) => !existingIds.has(m.id));
      this.allMessages = [...olderMessages, ...this.allMessages];

      // Re-render
      this.renderMessages(messagesEl, this._myUid);

      // Restore scroll position (scroll anchoring)
      const newScrollHeight = messagesEl.scrollHeight;
      messagesEl.scrollTop = newScrollHeight - oldScrollHeight;

      // Hide button if we loaded less than page size
      if (items.length < 50) {
        this.hasMoreMessages = false;
        loadOlderBtn.classList.add("hidden");
      }
    } catch (e) {
      logManager?.system?.error?.("Failed to load older messages", e);
      notificationManager.show("Failed to load older messages", "error");
    } finally {
      this.isLoadingMore = false;
      loadOlderBtn.disabled = false;
      loadOlderBtn.textContent = "Load Older Messages";
    }
  }

  async _handleSendMessageClick() {
    const sendBtn = this._dom?.sendBtn;
    const input = this._dom?.input;
    if (!sendBtn || !input) return;
    const text = (input.value || "").trim();
    if (!text) return;
    // Client-side 3s throttle per space (additional to server checks)
    try {
      const now = Date.now();
      const lastAt = this._lastSendAtBySpace[this.spaceId] || 0;
      if (now - lastAt < 3100) {
        const waitMs = 3100 - (now - lastAt);
        const secs = Math.ceil(waitMs / 1000);
        notificationManager.show(
          `Please wait ${secs}s before sending another message.`,
          "warning"
        );
        return;
      }
      this._lastSendAtBySpace[this.spaceId] = now;
    } catch (e) {
      logManager?.dev?.debug?.(
        "[GroupDetailPage] send throttle failed",
        e
      );
    }
    try {
      sendBtn.disabled = true;
      await classSpacesService.sendMessage(this.spaceId, text);
      input.value = "";
    } catch (e) {
      logManager?.system?.error?.("sendMessage failed", e);
      notificationManager.show("Failed to send message", "error");
    } finally {
      sendBtn.disabled = false;
    }
  }

  _handleMessageInputKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void this._handleSendMessageClick();
    }
  }

  async _handleBackClick() {
    try {
      const { navigateTo } = await import("../app.js");
      navigateTo("messages");
    } catch (_) {
      window.location.hash = "#messages";
    }
  }

  _handleLeaveClick() {
    this.showLeaveConfirmModal();
  }

  buildTitle(s) {
    const codeOrName =
      s.courseCode ||
      (s.courseName ? this.toTitleCase(s.courseName) : "Course");
    const sec = s.section ? `S-${parseInt(s.section, 10)}` : "";
    const slot = `${s.dayPattern || ""} ${s.timeStart || ""}-${
      s.timeEnd || ""
    }`.trim();
    return `${codeOrName} • ${sec} • ${slot}`
      .replace(/\s+•\s+•/g, " •")
      .replace(/•\s*$/, "");
  }

  toTitleCase(str) {
    return String(str || "")
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }

  /**
   * Show confirmation modal for leaving the class space
   */
  showLeaveConfirmModal() {
    // Remove existing modal if any
    const existingModal = document.querySelector(".leave-confirm-modal");
    if (existingModal) existingModal.remove();

    const modal = document.createElement("div");
    modal.className = "leave-confirm-modal";
    modal.innerHTML = `
      <div class="leave-confirm-overlay"></div>
      <div class="leave-confirm-content">
        <h3>Leave Class Space?</h3>
        <p>Are you sure you want to leave this class space?</p>
        <p class="leave-confirm-note">You can rejoin once per day if the space is still active.</p>
        <div class="leave-confirm-actions">
          <button class="leave-confirm-cancel">Cancel</button>
          <button class="leave-confirm-submit">Leave</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector(".leave-confirm-cancel");
    const overlayEl = modal.querySelector(".leave-confirm-overlay");
    const submitBtn = modal.querySelector(".leave-confirm-submit");

    const cleanupModalListeners = () => {
      try {
        cancelBtn?.removeEventListener("click", handleCancel);
        overlayEl?.removeEventListener("click", handleCancel);
        submitBtn?.removeEventListener("click", handleSubmit);
      } catch (err) {
        logManager.dev.debug("DOM operation failed: removing modal listeners", err);
      }
    };

    const handleCancel = () => {
      cleanupModalListeners();
      modal.remove();
    };

    const handleSubmit = async () => {
      const submitBtn = modal.querySelector(".leave-confirm-submit");
      submitBtn.disabled = true;
      submitBtn.textContent = "Leaving...";

      try {
        // Basic spaceId sanity check - server does authoritative format validation
        if (!this.spaceId || typeof this.spaceId !== "string" || this.spaceId.trim().length === 0) {
          console.error("[GroupDetailPage] Invalid spaceId:", this.spaceId);
          throw new Error("Space ID not found. Please navigate back and try again.");
        }

        // Stop ALL listeners BEFORE leaving to prevent permission-denied errors
        // (Once we leave, Firestore rules deny access to non-members)

        // 1. Stop message listener
        if (this.unsub) {
          try {
            this.unsub();
          } catch (e) {
            console.warn("[GroupDetailPage] Message listener cleanup failed:", e);
          }
          this.unsub = null;
        }

        // 2. Stop block service listener (also runs on this page)
        try {
          const uid = currentUser?.uid;
          if (uid) {
            blockService.stopSync(uid);
          }
        } catch (e) {
          console.warn("[GroupDetailPage] Block service cleanup failed:", e);
        }

        await classSpacesService.leaveSpace(this.spaceId);
        cleanupModalListeners();
        modal.remove();
        notificationManager.show("You have left the class space", "success");

        // Navigate back to groups list
        try {
          const { navigateTo } = await import("../app.js");
          navigateTo("messages");
        } catch (_) {
          window.location.hash = "#messages";
        }
      } catch (err) {
        console.error("[GroupDetailPage] Leave space failed", err);
        submitBtn.disabled = false;
        submitBtn.textContent = "Leave";

        // Show specific error message if available
        const errMsg = err?.message || err?.code || "Failed to leave class space";
        notificationManager.show(errMsg, "error");
      }
    };

    cancelBtn?.addEventListener("click", handleCancel);
    overlayEl?.addEventListener("click", handleCancel);
    submitBtn?.addEventListener("click", handleSubmit);
  }

  renderMessages(messagesEl, myUid) {
    if (!messagesEl) return;

    // Filter out messages from blocked users (client-side hide)
    const visibleMessages = Array.isArray(this.allMessages)
      ? this.allMessages.filter(
          (m) => !m.senderId || !blockService.isBlocked(myUid, m.senderId)
        )
      : [];

    messagesEl.innerHTML = visibleMessages
      .map((m) => {
        const isMe = myUid && m.senderId === myUid;
        const sender =
          m.senderInfo?.firstName ||
          m.senderInfo?.handle ||
          (isMe ? "You" : m.senderId);
        const safeSender = escapeHtml(sender);
        const text = m.content || "";
        const ts = m.createdAt?.toDate?.() || null;
        const time = ts
          ? new Intl.DateTimeFormat(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            }).format(ts)
          : "";
        const bubbleClass = isMe ? "bubble me" : "bubble other";
        const reportBtn = !isMe
          ? `<button class="message-report-btn" data-msgid="${m.id}" title="Report message"><i class="fas fa-flag"></i></button>`
          : "";
        return `<div class="message" data-msgid="${
          m.id
        }"><div class="${bubbleClass}"><span class="sender">${safeSender}</span><span class="time">${time}</span><div class="text">${escapeHtml(
          text
        )}</div>${reportBtn}</div></div>`;
      })
      .join("");
  }

  destroy() {
    document.body.classList.remove("immersive-chat-mode");
    window.dispatchEvent(new Event("layoutChromeChange"));
    const dom = this._dom;
    if (dom?.membersList) {
      dom.membersList.removeEventListener("click", this._handleMembersListClick);
    }
    if (dom?.messagesEl) {
      dom.messagesEl.removeEventListener("click", this._handleMessagesClick);
    }
    if (dom?.tabChat) {
      dom.tabChat.removeEventListener("click", this._handleTabChatClick);
    }
    if (dom?.tabMembers) {
      dom.tabMembers.removeEventListener("click", this._handleTabMembersClick);
    }
    if (dom?.loadOlderBtn) {
      dom.loadOlderBtn.removeEventListener(
        "click",
        this._handleLoadOlderMessagesClick
      );
    }
    if (dom?.sendBtn) {
      dom.sendBtn.removeEventListener("click", this._handleSendMessageClick);
    }
    if (dom?.input) {
      dom.input.removeEventListener("keydown", this._handleMessageInputKeydown);
    }
    if (this._backBtn) {
      this._backBtn.removeEventListener("click", this._handleBackClick);
      try {
        this._backBtn.remove();
      } catch (err) {
        logManager.dev.debug("DOM operation failed: removing back button", err);
      }
      this._backBtn = null;
    }
    if (this._leaveBtn) {
      this._leaveBtn.removeEventListener("click", this._handleLeaveClick);
      try {
        this._leaveBtn.remove();
      } catch (err) {
        logManager.dev.debug("DOM operation failed: removing leave button", err);
      }
      this._leaveBtn = null;
    }
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
    try {
      const uid = currentUser?.uid;
      if (uid) blockService.stopSync(uid);
    } catch (err) {
      logManager.dev.debug("blockService.stopSync failed", err);
    }
    // Reset state
    this.allMessages = [];
    this.lastDocs = [];
    this.hasMoreMessages = true;
    this.isLoadingMore = false;
    this._initialRenderDone = false;
    this.earliestDoc = null;
    this._space = null;
    this._memberInfo = null;
    this._myUid = null;
    this._myFriendIds = new Set();
    this._dom = null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Wire to SPA lifecycle
let currentPageInstance = null;

function handleGroupDetailPageUnload(e) {
  // Only handle unload for our route
  const route = e?.detail?.route;
  if (route !== "group") return;
  if (currentPageInstance) {
    currentPageInstance.destroy();
    currentPageInstance = null;
  }
}

async function handleGroupDetailPageLoad(event) {
  const route = event?.detail?.route;
  if (route !== "group") return;
  currentPageInstance = new GroupDetailPage();
  await currentPageInstance.mount();
}

document.addEventListener("spa:page:unload", handleGroupDetailPageUnload);
document.addEventListener("spa:page:load", handleGroupDetailPageLoad);

export default GroupDetailPage;
