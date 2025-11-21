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
            unblockBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              blockService.unblock(myUid, uid);
              this.refreshMembersList(space, myUid);
              const messagesEl = document.getElementById("messages");
              this.renderMessages(messagesEl, myUid);
            });
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
            blockBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              blockService.block(myUid, uid);
              this.refreshMembersList(space, myUid);
              const messagesEl = document.getElementById("messages");
              this.renderMessages(messagesEl, myUid);
            });
          }
        }
      });
    } catch (_) {}
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
      } catch (_) {}
      return null;
    } catch (_) {
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

    console.log("[GroupDetailPage] Mount called with spaceId:", this.spaceId);
    
    // If returning from a member profile, restore Members tab
    try {
      const returnTab = sessionStorage.getItem("group:returnTab");
      console.log("[GroupDetailPage] Checking returnTab session value:", returnTab);
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
          } catch(e) {}
        }, 100);
      } else {
        console.log("[GroupDetailPage] No returnTab set, defaulting to chat");
      }
    } catch (e) {
      console.error("[GroupDetailPage] Error restoring members tab", e);
    }

    if (!this.spaceId) {
      logManager.dev.debug("[GroupDetailPage] Missing spaceId before metadata load", { stored: sessionStorage.getItem("group:spaceId") });
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
    backBtn.onclick = async () => {
      try {
        const { navigateTo } = await import("../app.js");
        navigateTo("groups");
      } catch (_) {
        window.location.hash = "#groups";
      }
    };
    
    // Insert back button before title
    if (titleEl && titleEl.parentNode) {
      titleEl.parentNode.insertBefore(backBtn, titleEl);
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

    // Mark this space as viewed (for unread badge tracking)
    if (myUid) {
      unreadTracker.markAsViewed(this.spaceId, myUid);
    }

    logManager.dev.debug("[GroupDetailPage] Rendering members list", { spaceId: this.spaceId, memberCount: Array.isArray(space.memberIds) ? space.memberIds.length : 0 });
    // Members list (with avatar chips + block/unblock actions)
    const memberIds = Array.isArray(space.memberIds) ? space.memberIds : [];
    const memberInfo = space.memberInfo || {};
    // Quick check to avoid showing Add button for existing friends (uses denormalized friendIds)
    const myFriendIds = Array.isArray(
      currentUser?.profile?.socialInfo?.friendIds
    )
      ? new Set(currentUser.profile.socialInfo.friendIds)
      : new Set();
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

    logManager.dev.debug("[GroupDetailPage] Members list HTML rendered", { spaceId: this.spaceId });
    // Bind report buttons for members
    const reportBtns = membersList.querySelectorAll(".member-report-btn");
    reportBtns.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uid = btn.dataset.uid;
        if (!uid) return;

        const { ReportModal } = await import(
          "../components/modals/ReportModal.js"
        );
        const modal = new ReportModal();
        modal.show({
          type: "user",
          reportedId: uid,
          additionalData: { spaceId: this.spaceId },
        });
      });
    });

    // Bind block/unblock buttons
    const blockBtns = membersList.querySelectorAll(".member-block-btn");
    blockBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uid = btn.dataset.uid;
        if (!uid || !myUid) return;
        blockService.block(myUid, uid);
        this.refreshMembersList(space, myUid);
        this.renderMessages(messagesEl, myUid);
      });
    });
    const unblockBtns = membersList.querySelectorAll(".member-unblock-btn");
    unblockBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uid = btn.dataset.uid;
        if (!uid || !myUid) return;
        blockService.unblock(myUid, uid);
        this.refreshMembersList(space, myUid);
        this.renderMessages(messagesEl, myUid);
      });
    });

    logManager.dev.debug("[GroupDetailPage] Binding member action buttons", { spaceId: this.spaceId });
    // Bind add-friend buttons
    const addFriendBtns = membersList.querySelectorAll(".member-add-btn");
    addFriendBtns.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uid = btn.dataset.uid;
        if (!uid) return;

        // Compose minimal target user data using cached memberInfo and space university
        const info = memberInfo[uid] || {};
        const targetUserData = {
          profile: {
            handle: info.handle || "",
            major: info.major || "",
          },
          avatarConfig: info.avatarConfig || null,
          universityInfo: { university: space.university || "" },
        };

        try {
          btn.disabled = true;
          const originalHtml = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          const res = await friendsManager.sendFriendRequest(
            uid,
            targetUserData
          );
          if (res?.success) {
            btn.className = "member-friends-btn";
            btn.innerHTML = '<i class="fas fa-clock"></i>';
            btn.title = "Pending";
            btn.setAttribute("aria-label", "Pending");
            btn.disabled = true;
          } else {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            notificationManager.show(
              res?.message || "Failed to send friend request",
              "error"
            );
          }
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-user-plus"></i>';
          console.error("[GroupDetailPage] Add friend failed", err);
          notificationManager.show("Failed to send friend request", "error");
        }
      });
    });

    // Tabs
    tabChat.addEventListener("click", () => {
      tabChat.classList.add("active");
      tabMembers.classList.remove("active");
      chatPane.classList.remove("hidden");
      membersPane.classList.add("hidden");
      console.log("[GroupDetailPage] Tab switched to chat");
    });
    tabMembers.addEventListener("click", () => {
      tabMembers.classList.add("active");
      tabChat.classList.remove("active");
      membersPane.classList.remove("hidden");
      chatPane.classList.add("hidden");
      console.log("[GroupDetailPage] Tab switched to members");
    });

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
      loadOlderBtn.addEventListener("click", async () => {
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
          this.renderMessages(messagesEl, myUid);

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
      });
    }

    // Send handler
    sendBtn.addEventListener("click", async () => {
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
      } catch (_) {}
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
    });
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });
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

    // Bind report buttons for messages
    const reportBtns = messagesEl.querySelectorAll(".message-report-btn");
    reportBtns.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const msgId = btn.dataset.msgid;
        if (!msgId) return;

        const { ReportModal } = await import(
          "../components/modals/ReportModal.js"
        );
        const modal = new ReportModal();
        modal.show({
          type: "message",
          reportedId: msgId,
          additionalData: { spaceId: this.spaceId },
        });
      });
    });
  }

  destroy() {
    document.body.classList.remove("immersive-chat-mode");
    window.dispatchEvent(new Event("layoutChromeChange"));
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
    // Reset state
    this.allMessages = [];
    this.lastDocs = [];
    this.hasMoreMessages = true;
    this.isLoadingMore = false;
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
document.addEventListener("spa:page:unload", (e) => {
  if (currentPageInstance) {
    currentPageInstance.destroy();
    currentPageInstance = null;
  }
});

document.addEventListener("spa:page:load", async (event) => {
  const route = event?.detail?.route;
  if (route !== "group") return;
  currentPageInstance = new GroupDetailPage();
  await currentPageInstance.mount();
});

export default GroupDetailPage;
