import { currentUser } from "../store/userStore.js";
import { dataManager } from "../services/data/DataService.js";
import { avatarManager } from "../utils/avatar/avatarManager.js";
import { db } from "../lib/firebase/firebase-config.js";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { notificationManager } from "../services/realtime/NotificationService.js";

export class NotifyFriendsPage {
  constructor() {
    this.isInitialized = false;
    this.unsub = null;
    this.tickTimer = null;
    this.selected = new Set();
    this.cooldowns = new Map(); // friendId -> expiresAtMs
    this.starred = []; // { friendId, handle, avatarConfig }
    this.friendInfo = new Map(); // friendId -> { handle, avatarConfig }
    this.responses = { available: new Set(), busy: new Set() };
    // Local linger cache: friendId -> { status: 'available'|'busy', expiresAtMs, lastCreatedMs }
    // Keeps responses visible for 100 minutes even if backend document expires sooner
    this.responseLinger = new Map();
    this.currentPingId = null; // last sent batch id
  }

  async fetchFriendMinimal(userId) {
    try {
      if (!userId) return null;
      const info = await dataManager.getUserProfileMinimal(userId);
      if (!info) return null;
      return {
        handle: info.handle || "friend",
        avatarConfig: info.avatarConfig || null,
      };
    } catch (_) {
      return null;
    }
  }

  async init() {
    try {
      const main = document.querySelector(".notify-overlay");
      if (!main) return;

      this.bindUi();
      await this.loadStarred();
      await this.loadCooldowns();
      this.renderStarred();
      this.updateControls();
      this.setupRealtimeResponses();
      this.startTicker();

      this.isInitialized = true;
      // Mark responses seen (clear dot)
      try {
        sessionStorage.setItem("notify:lastClearTs", String(Date.now()));
      } catch (_) {}
    } catch (e) {
      console.error("NotifyFriendsPage init error", e);
      notificationManager.showErrorNotification(
        "Failed to open Notify overlay"
      );
    }
  }

  bindUi() {
    const closeBtn = document.getElementById("notifyCloseBtn");
    const backdrop = document.querySelector(".notify-backdrop");
    const selectAll = document.getElementById("notifySelectAll");
    const sendBtn = document.getElementById("notifySendBtn");
    const container = document.getElementById("notifyContainer");
    const notifyBtn = document.getElementById("notifyFriendsBtn");

    const close = () => {
      try {
        this.closeOverlay();
      } catch (_) {}
    };
    closeBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);

    selectAll?.addEventListener("change", () => {
      const enabledFriendIds = this.starred
        .map((f) => f.friendId || f.userId)
        .filter((id) => id && !this.isOnCooldown(id));
      if (selectAll.checked) {
        enabledFriendIds.forEach((id) => this.selected.add(id));
      } else {
        this.selected.clear();
      }
      this.renderStarred();
      this.updateControls();
      // Update label text
      const label = selectAll.parentElement?.querySelector("span");
      if (label) {
        label.textContent = selectAll.checked ? "Unselect all" : "Select all";
      }
    });

    sendBtn?.addEventListener("click", () => this.handleSend());

    // Accessibility: focus close button on open and close on ESC
    try {
      closeBtn?.focus({ preventScroll: true });
    } catch (_) {}
    document.addEventListener(
      "keydown",
      (this._escHandler = (e) => {
        if (e.key === "Escape") close();
      })
    );

    // Mobile swipe-to-dismiss
    let startY = null;
    container?.addEventListener("pointerdown", (e) => {
      startY = e.clientY;
    });
    container?.addEventListener("pointerup", (e) => {
      if (startY !== null && e.clientY - startY > 60) close();
      startY = null;
    });
  }

  async loadStarred() {
    const uid = currentUser?.uid;
    if (!uid) return;
    const qa = await dataManager.getQuickAccessFriends(uid);
    const friends = qa?.starredFriends || [];
    this.starred = friends.map((f) => ({
      friendId: f.friendId || f.userId,
      handle: f.handle || f.profile?.handle || "friend",
      avatarConfig: f.avatarConfig || f.profile?.avatarConfig || null,
    }));
    this.starred.forEach((f) => {
      const id = f.friendId;
      if (id)
        this.friendInfo.set(id, {
          handle: f.handle,
          avatarConfig: f.avatarConfig,
        });
    });
    const empty = document.getElementById("notifyStarredEmpty");
    const grid = document.getElementById("notifyStarredGrid");
    if (empty && grid) {
      const has = this.starred.length > 0;
      empty.hidden = has;
      grid.style.display = has ? "grid" : "none";
    }
  }

  async loadCooldowns() {
    const uid = currentUser?.uid;
    if (!uid) return;
    const map = await dataManager.getActiveAvailabilityPingMap(uid);
    this.cooldowns = map;
  }

  isOnCooldown(friendId) {
    const exp = this.cooldowns.get(friendId);
    return exp && exp > Date.now();
  }

  formatCooldown(expMs) {
    const ms = Math.max(0, expMs - Date.now());
    const mins = Math.ceil(ms / 60000);
    if (mins > 5) return `${Math.ceil(mins / 5) * 5}m`;
    return `${mins}m`;
  }

  renderStarred() {
    const grid = document.getElementById("notifyStarredGrid");
    if (!grid) return;
    grid.innerHTML = "";

    // Sort starred friends alphabetically by handle (A-Z)
    const sortedStarred = [...this.starred].sort((a, b) => {
      const handleA = (a.handle || "").toLowerCase();
      const handleB = (b.handle || "").toLowerCase();
      return handleA.localeCompare(handleB);
    });

    sortedStarred.forEach((f) => {
      const id = f.friendId;
      const disabled = this.isOnCooldown(id);
      const card = document.createElement("div");
      const isSelected = this.selected.has(id);
      card.className = `notify-friend-card${disabled ? " disabled" : ""}${
        isSelected ? " selected" : ""
      }`;
      card.dataset.friendId = id;
      card.setAttribute("role", "checkbox");
      card.setAttribute("aria-checked", String(isSelected));

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "friend-select";
      chk.checked = this.selected.has(id);
      chk.disabled = disabled;
      chk.addEventListener("change", () => {
        if (chk.checked) this.selected.add(id);
        else this.selected.delete(id);
        card.classList.toggle("selected", chk.checked);
        card.setAttribute("aria-checked", String(chk.checked));
        this.updateControls();
      });

      const avatar = document.createElement("div");
      avatar.className = "friend-avatar";
      const cfg = f.avatarConfig;
      if (
        cfg &&
        avatarManager &&
        typeof avatarManager.generateAvatarUrl === "function"
      ) {
        const url = avatarManager.generateAvatarUrl(cfg);
        avatar.innerHTML = `<img src="${url}" alt="@${f.handle}" style="width:100%;height:100%;object-fit:cover;"/>`;
      } else {
        avatar.innerHTML = '<i class="fas fa-user-circle"></i>';
      }

      const name = document.createElement("div");
      name.className = "friend-name";
      name.textContent = f.handle || "friend";
      name.title = f.handle || "friend"; // Show full name on hover

      card.appendChild(chk);
      card.appendChild(avatar);
      card.appendChild(name);

      if (disabled) {
        const exp = this.cooldowns.get(id);
        const badge = document.createElement("div");
        badge.className = "friend-badge";
        badge.title = "Can notify again in " + this.formatCooldown(exp);
        badge.setAttribute(
          "aria-label",
          "Can notify again in " + this.formatCooldown(exp)
        );
        badge.textContent = this.formatCooldown(exp);
        card.appendChild(badge);
      }

      grid.appendChild(card);

      // Toggle selection by clicking card (except when disabled)
      if (!disabled) {
        card.tabIndex = 0;
        card.addEventListener("click", (e) => {
          if (e.target === chk) return;
          const newVal = !this.selected.has(id);
          if (newVal) this.selected.add(id);
          else this.selected.delete(id);
          chk.checked = newVal;
          card.classList.toggle("selected", newVal);
          card.setAttribute("aria-checked", String(newVal));
          this.updateControls();
        });
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const newVal = !this.selected.has(id);
            if (newVal) this.selected.add(id);
            else this.selected.delete(id);
            chk.checked = newVal;
            card.classList.toggle("selected", newVal);
            card.setAttribute("aria-checked", String(newVal));
            this.updateControls();
          }
        });
      }
    });
  }

  updateControls() {
    const sendBtn = document.getElementById("notifySendBtn");
    const selectAll = document.getElementById("notifySelectAll");
    const totalSelectable = this.starred.filter(
      (f) => !this.isOnCooldown(f.friendId)
    ).length;
    if (selectAll) selectAll.disabled = totalSelectable === 0;
    if (sendBtn)
      sendBtn.disabled =
        this.selected.size === 0 || totalSelectable === 0 || !navigator.onLine;
  }

  async handleSend() {
    try {
      if (!navigator.onLine) {
        notificationManager.showWarningNotification("You are offline");
        return;
      }
      const uid = currentUser?.uid;
      const profile = currentUser?.profile;
      if (!uid || !profile) return;
      const recipients = Array.from(this.selected);
      if (recipients.length === 0) return;

      const fromUserInfo = {
        handle: profile?.profile?.handle || profile?.handle || "user",
        avatarConfig:
          profile?.avatarConfig || profile?.profile?.avatarConfig || null,
      };

      const pingId = `ping_${Date.now()}`;
      this.currentPingId = pingId;

      const res = await dataManager.createAvailabilityPings(
        uid,
        recipients,
        fromUserInfo,
        pingId
      );
      if (res?.success) {
        // Update cooldowns only for friends who actually received a new ping (5m cooldown)
        const exp = Date.now() + 5 * 60 * 1000;
        const skipped = Array.isArray(res.skipped)
          ? new Set(res.skipped)
          : new Set();
        let created = 0;
        recipients.forEach((id) => {
          if (!skipped.has(id)) {
            this.cooldowns.set(id, exp);
            created++;
          }
        });
        // If any were skipped due to existing cooldown, reload cooldowns to avoid UI drift
        if (skipped.size > 0) {
          try {
            await this.loadCooldowns();
          } catch (_) {}
        }
        this.selected.clear();
        this.renderStarred();
        this.updateControls();
        notificationManager.showSuccessNotification("Notifications sent");
      } else {
        notificationManager.showErrorNotification("Failed to send");
      }
    } catch (e) {
      console.error(e);
      notificationManager.showErrorNotification("Failed to send");
    }
  }

  setupRealtimeResponses() {
    try {
      const uid = currentUser?.uid;
      if (!uid) return;
      if (this.unsub) {
        try {
          this.unsub();
        } catch (_) {}
      }
      // Listen for availability responses addressed TO me (sender)
      const qRef = query(
        collection(db, "notifications"),
        where("userId", "==", uid),
        where("type", "==", "availability_response")
      );
      const unsubs = [];

      // Listener A: response docs created by Cloud Functions
      unsubs.push(onSnapshot(
        qRef,
        async (snap) => {
          // Do not clear local state here; we maintain a 100m local linger window
          for (const d of snap.docs) {
            const data = d.data();
            const responderId = data?.fromUserId;
            if (!responderId) continue;
            const resp = (data?.response || "").toLowerCase();
            if (resp !== "available" && resp !== "busy") continue;

            // Determine createdAt for this response
            const createdAtMs =
              data?.createdAt?.toDate?.()?.getTime?.() ||
              new Date(data?.createdAt || Date.now()).getTime();
            // Linger for 100 minutes regardless of backend expiry
            const hundredMinutes = 100 * 60 * 1000;

            const existing = this.responseLinger.get(responderId);
            // If this is newer or there is no existing entry, update and reset expiry
            if (!existing || (createdAtMs && createdAtMs >= (existing.lastCreatedMs || 0))) {
              this.responseLinger.set(responderId, {
                status: resp,
                expiresAtMs: createdAtMs + hundredMinutes,
                lastCreatedMs: createdAtMs,
              });
            }

            // Cache friend info if missing
            if (!this.friendInfo.has(responderId)) {
              try {
                const minimal = await this.fetchFriendMinimal(responderId);
                if (minimal) this.friendInfo.set(responderId, minimal);
              } catch (_) {}
            }
          }

          // Recompute visible response sets from linger cache and render
          this.refreshResponsesFromLinger();
        },
        (err) => console.warn("Notify responses listener error", err)
      ));

      // Listener B: track changes directly on outgoing ping docs for immediate updates
      try {
        const pingRef = query(
          collection(db, "notifications"),
          where("fromUserId", "==", uid),
          where("type", "==", "availability_ping")
        );
        unsubs.push(
          onSnapshot(
            pingRef,
            async (snap) => {
              for (const d of snap.docs) {
                const data = d.data();
                const toUserId = data?.userId;
                const resp = (data?.response || "").toLowerCase();
                if (!toUserId) continue;
                if (resp !== "available" && resp !== "busy") continue;
                // Prefer respondedAt if present; otherwise fallback to createdAt
                const respondedAtMs =
                  data?.respondedAt?.toDate?.()?.getTime?.() ||
                  new Date(data?.respondedAt || 0).getTime();
                const createdAtMs =
                  data?.createdAt?.toDate?.()?.getTime?.() ||
                  new Date(data?.createdAt || Date.now()).getTime();
                const eventTimeMs = respondedAtMs || createdAtMs || Date.now();
                const hundredMinutes = 100 * 60 * 1000;

                const existing = this.responseLinger.get(toUserId);
                if (!existing || eventTimeMs >= (existing.lastCreatedMs || 0)) {
                  this.responseLinger.set(toUserId, {
                    status: resp,
                    expiresAtMs: eventTimeMs + hundredMinutes,
                    lastCreatedMs: eventTimeMs,
                  });
                }
                if (!this.friendInfo.has(toUserId)) {
                  try {
                    const minimal = await this.fetchFriendMinimal(toUserId);
                    if (minimal) this.friendInfo.set(toUserId, minimal);
                  } catch (_) {}
                }
              }
              this.refreshResponsesFromLinger();
            },
            (err) => console.warn("Notify ping listener error", err)
          )
        );
      } catch (_) {}

      // Combine unsubs into a single handle
      this.unsub = () => {
        unsubs.forEach((u) => {
          try {
            if (typeof u === "function") u();
          } catch (_) {}
        });
      };
    } catch (e) {
      console.warn("setupRealtimeResponses error", e);
    }
  }

  refreshResponsesFromLinger() {
    const now = Date.now();
    let changed = false;
    // Drop expired entries and rebuild sets
    const nextAvailable = new Set();
    const nextBusy = new Set();
    for (const [friendId, entry] of this.responseLinger.entries()) {
      if (!entry || !entry.expiresAtMs || entry.expiresAtMs <= now) {
        this.responseLinger.delete(friendId);
        changed = true;
        continue;
      }
      if (entry.status === "available") nextAvailable.add(friendId);
      else if (entry.status === "busy") nextBusy.add(friendId);
    }

    // Detect if sets actually changed to avoid unnecessary re-render
    const sameSize =
      nextAvailable.size === this.responses.available.size &&
      nextBusy.size === this.responses.busy.size;
    let sameMembers = sameSize;
    if (sameMembers) {
      for (const id of nextAvailable) if (!this.responses.available.has(id)) { sameMembers = false; break; }
      if (sameMembers) for (const id of nextBusy) if (!this.responses.busy.has(id)) { sameMembers = false; break; }
    }

    if (!sameMembers) {
      this.responses.available = nextAvailable;
      this.responses.busy = nextBusy;
      changed = true;
    }

    if (changed) this.renderResponses();
  }

  renderResponseGrid(gridId, emptyId, ids, isAvailable) {
    const grid = document.getElementById(gridId);
    const empty = document.getElementById(emptyId);
    if (!grid || !empty) return;
    grid.innerHTML = "";
    if (ids.length === 0) {
      empty.style.display = "block";
      grid.style.display = "none";
      return;
    }
    empty.style.display = "none";
    grid.style.display = "grid";
    ids.forEach((id) => {
      const info = this.friendInfo.get(id) || {
        handle: "friend",
        avatarConfig: null,
      };
      const card = document.createElement("div");
      card.className = "notify-friend-card";
      const avatar = document.createElement("div");
      avatar.className = "friend-avatar";
      const cfg = info.avatarConfig;
      if (
        cfg &&
        avatarManager &&
        typeof avatarManager.generateAvatarUrl === "function"
      ) {
        const url = avatarManager.generateAvatarUrl(cfg);
        avatar.innerHTML = `<img src="${url}" alt="@${info.handle}" style="width:100%;height:100%;object-fit:cover;"/>`;
      } else {
        avatar.innerHTML = '<i class="fas fa-user-circle"></i>';
      }
      const name = document.createElement("div");
      name.className = "friend-name";
      name.textContent = info.handle || "friend";
      name.title = info.handle || "friend"; // Show full name on hover
      const statusIcon = document.createElement("i");
      statusIcon.className = `fa-solid ${
        isAvailable ? "fa-circle-check" : "fa-circle-xmark"
      } friend-status-icon ${isAvailable ? "available" : "busy"}`;
      statusIcon.setAttribute("aria-label", isAvailable ? "Available" : "Busy");
      statusIcon.title = isAvailable ? "Available" : "Busy";
      card.appendChild(avatar);
      card.appendChild(name);
      card.appendChild(statusIcon);
      grid.appendChild(card);
    });
  }

  renderResponses() {
    this.renderResponseGrid(
      "notifyAvailableGrid",
      "notifyAvailableEmpty",
      Array.from(this.responses.available),
      true
    );
    this.renderResponseGrid(
      "notifyBusyGrid",
      "notifyBusyEmpty",
      Array.from(this.responses.busy),
      false
    );
  }

  startTicker() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.tickTimer = setInterval(() => {
      let changed = false;
      this.starred.forEach((f) => {
        if (this.isOnCooldown(f.friendId)) changed = true;
      });
      if (changed) this.renderStarred();
      // Periodically prune expired linger responses (100m window)
      this.refreshResponsesFromLinger();
    }, 60000);
  }

  cleanup() {
    try {
      if (this.unsub) this.unsub();
    } catch (_) {}
    this.unsub = null;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.isInitialized = false;
    if (this._escHandler) {
      try {
        document.removeEventListener("keydown", this._escHandler);
      } catch (_) {}
      this._escHandler = null;
    }
    // Clear selected friends when closing overlay
    this.selected.clear();
    // Clear lingering responses on close to free memory
    this.responseLinger.clear();
  }

  closeOverlay() {
    try {
      const root = document.querySelector(".notify-overlay");
      if (root && root.parentNode) {
        // Add closing class for animation
        root.classList.add("closing");

        // Wait for animation to complete before removing
        setTimeout(() => {
          if (root.parentNode) {
            root.parentNode.removeChild(root);
          }
        }, 250); // Match animation duration
      }
    } catch (_) {}
    this.cleanup();
  }
}

export const notifyFriendsPage = new NotifyFriendsPage();

export async function openNotifyOverlay() {
  // Prevent duplicate overlays
  if (document.querySelector(".notify-overlay")) {
    document.dispatchEvent(new CustomEvent("notify:overlay:open"));
    return;
  }
  try {
    // Ensure CSS is loaded on demand (avoid global import collisions)
    const CSS_ID = "notify-css";
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/src/css/notify.css";
      link.id = CSS_ID;
      document.head.appendChild(link);
    }

    const resp = await fetch("/templates/notify.html", { cache: "no-store" });
    const html = await resp.text();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();
    const overlay = wrapper.firstElementChild;
    if (!overlay) throw new Error("Invalid notify template");
    document.body.appendChild(overlay);
    document.dispatchEvent(new CustomEvent("notify:overlay:open"));
    await notifyFriendsPage.init();
  } catch (e) {
    console.error("Failed to open notify overlay:", e);
    notificationManager.showErrorNotification("Failed to open Notify");
  }
}
