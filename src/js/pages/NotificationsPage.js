/**
 * 🔔 MeetchuThere Notifications Page
 *
 * This module handles the notifications page for location sharing requests
 * and other notification types in the Campus Presence system.
 *
 * Features:
 * - Location sharing request notifications
 * - Friend request notifications
 * - Real-time notification updates
 * - Accept/dismiss actions for notifications
 * - Location permission integration
 *
 * Part of Phase 4.1: Campus Presence Implementation
 */

import { dataManager } from "../services/data/DataService.js";
import { friendsManager } from "../services/friends/FriendsService.js";
import { currentUser } from "../store/userStore.js";
import { avatarManager } from "../utils/avatar/avatarManager.js";
import { db } from "../lib/firebase/firebase-config.js";
import { getAvatarFallback } from "../utils/avatar/avatarUtils.js";
import { notificationManager } from "../services/realtime/NotificationService.js";
import { campusLocationService } from "../services/location/CampusLocationService.js";
import {
  realTimeManager,
  REALTIME_EVENTS,
} from "../services/realtime/RealtimeService.js";

/**
 * NotificationsPage class handles the complete notifications interface
 * for location sharing requests and other notification types
 */
export class NotificationsPage {
  constructor() {
    this.notifications = [];
    this.friendRequests = [];
    this.unsubscribers = [];
    this.isInitialized = false;
    this.isActive = false;
    this.baseRendered = false; // Prevent full re-render flicker
    this.filter = "all"; // 'all' | 'friend' | 'location'
    this._listElement = null; // track current bound list element for delegation
    this._listDelegatedHandler = null; // reference to delegated handler

    console.log("🔔 NotificationsPage initialized");
  }

  /**
   * Initialize the notifications page
   * Loads notifications and sets up real-time listeners
   */
  async init() {
    try {
      console.log("🔔 Initializing NotificationsPage...");
      this.isActive = true;

      await this.loadNotifications();
      this.setupRealtimeListeners();
      this.render(true);

      this.isInitialized = true;
      console.log("✅ NotificationsPage initialization complete");
    } catch (error) {
      console.error("❌ Error initializing NotificationsPage:", error);
      notificationManager.showErrorNotification("Failed to load notifications");
    }
  }

  /**
   * Load user notifications from the database
   */
  async loadNotifications() {
    try {
      console.log("📊 Loading user notifications...");

      if (!currentUser?.uid) {
        console.warn("⚠️ No current user found");
        this.notifications = [];
        return;
      }

      // Load notifications from dataManager
      this.notifications = await dataManager.getUserNotifications(
        currentUser.uid
      );

      console.log(`📊 Loaded ${this.notifications.length} notifications`);
    } catch (error) {
      console.error("❌ Error loading notifications:", error);
      this.notifications = [];
    }
  }

  /**
   * Set up real-time listeners for notification updates
   */
  setupRealtimeListeners() {
    try {
      console.log("🔄 Setting up real-time notification listeners...");

      const currentUserUid = currentUser.state?.user?.uid;
      if (!currentUserUid) {
        console.warn("⚠️ No current user for notifications listener");
        return;
      }

      // Direct real-time listener for notifications - this is the key fix!
      const notificationsUnsubscriber = dataManager.setupNotificationsListener(
        currentUserUid,
        (notifications) => {
          if (this.isActive) {
            console.log(
              "📨 Real-time notifications update received:",
              notifications.length
            );
            this.notifications = notifications;
            this.updateListOnly(); // List-only refresh
          }
        }
      );

      // Listen for user profile changes (secondary updates)
      const profileUnsubscriber = realTimeManager.on(
        REALTIME_EVENTS.USER_PROFILE,
        async (profile) => {
          console.log("👤 User profile updated, refreshing notifications...");
          this.updateListOnly(); // Avoid full re-render to prevent flicker
        }
      );

      // Listen for friendship changes (may affect location sharing notifications)
      const friendshipUnsubscriber = realTimeManager.on(
        REALTIME_EVENTS.FRIENDSHIPS,
        async (friendships) => {
          console.log("🤝 Friendships updated, refreshing notifications...");
          this.updateListOnly(); // Update list without full re-render
        }
      );

      // Listen to pending friend requests in real time and merge into list
      const incomingRequestsUnsub = dataManager.listenToPendingFriendRequests(
        currentUserUid,
        (requests) => {
          if (!this.isActive) return;
          console.log(
            `📬 Incoming friend requests (realtime): ${requests.length}`
          );
          this.friendRequests = requests || [];
          this.updateListOnly();
        }
      );

      this.unsubscribers.push(
        notificationsUnsubscriber,
        profileUnsubscriber,
        friendshipUnsubscriber,
        incomingRequestsUnsub
      );

      console.log("✅ Real-time listeners set up successfully");
    } catch (error) {
      console.error("❌ Error setting up real-time listeners:", error);
    }
  }

  /**
   * Render the notifications page
   */
  render(isInitial = false) {
    try {
      const container = document.querySelector(".notifications-page");
      if (this.baseRendered && container && !isInitial) {
        this.updateListOnly();
        return;
      }
      console.log("🎨 Rendering NotificationsPage...");

      const template = `
        <div class="content-grid">
          <div class="notifications-page">
            <section class="glass-card notifications-card">
              <div class="notifications-card-header">
                <h1 class="page-title">
                  <i class="fas fa-bell"></i>
                  Notifications
                </h1>
                <div class="header-actions">
                  <button type="button" class="mark-all-read button secondary" ${
                    this.notifications.length === 0 ? "disabled" : ""
                  }>
                    <i class="fas fa-check-double"></i>
                    Mark All Seen
                  </button>
                </div>
              </div>
              <div class="notifications-filters">
                <button class="filter-btn ${
                  this.filter === "all" ? "active" : ""
                }" data-filter="all">
                  <i class="fas fa-list"></i>
                  All
                </button>
                <button class="filter-btn ${
                  this.filter === "friend" ? "active" : ""
                }" data-filter="friend">
                  <i class="fas fa-user-plus"></i>
                  Friend Requests
                </button>
                <button class="filter-btn ${
                  this.filter === "location" ? "active" : ""
                }" data-filter="location">
                  <i class="fas fa-map-marker-alt"></i>
                  Location Requests
                </button>
              </div>
              <div id="notificationsList" class="notifications-scrollable-container">
                ${this.renderNotifications()}
              </div>
            </section>
          </div>
        </div>
      `;

      const mainContent = document.querySelector(".main-content");
      if (mainContent) {
        mainContent.innerHTML = template;
        this.baseRendered = true;
        this.setupEventHandlers();
        console.log("✅ NotificationsPage rendered successfully");
      } else {
        console.error("❌ Main content container not found");
      }
    } catch (error) {
      console.error("❌ Error rendering NotificationsPage:", error);
    }
  }

  /**
   * Update only notifications list and related controls to avoid flicker
   */
  updateListOnly() {
    const list = document.getElementById("notificationsList");
    if (list) {
      const html = this.renderNotifications();
      if (html !== this._lastListHTML) {
        list.innerHTML = html;
        this._lastListHTML = html;
        // Ensure delegated list handlers are bound (no-op if already attached)
        this.ensureListDelegationBound();
        console.log("🔄 Notifications list updated");
      }
    }
    // Update filter active state
    document
      .querySelectorAll(".notifications-filters .filter-btn")
      .forEach((btn) => {
        const f = btn.getAttribute("data-filter");
        btn.classList.toggle(
          "active",
          (f === "all" && this.filter === "all") ||
            (f === "friend" && this.filter === "friend") ||
            (f === "location" && this.filter === "location")
        );
      });
    const markAll = document.querySelector(".mark-all-read");
    if (markAll) {
      if (this.notifications.length === 0) markAll.setAttribute("disabled", "");
      else markAll.removeAttribute("disabled");
    }
  }

  /**
   * Render the list of notifications
   * @returns {string} HTML string for notifications
   */
  renderNotifications() {
    // Normalize + merge: notification docs + incoming friendRequests
    const normalizedFriendRequests = (this.friendRequests || []).map((r) => ({
      id: r.id,
      type: "friend_request",
      fromUserId: r.fromUserId,
      fromUserInfo: r.fromUserInfo,
      createdAt: r.createdAt,
    }));

    const normalizedNotifications = (this.notifications || []).map((n) => ({
      id: n.id,
      type: n.type,
      fromUserId: n.fromUserId,
      fromUserInfo: n.fromUserInfo,
      createdAt: n.createdAt,
      locationRequest: n.locationRequest,
      read: n.read,
    }));

    let merged = [...normalizedNotifications, ...normalizedFriendRequests];

    // Apply filter
    if (this.filter === "friend") {
      merged = merged.filter((n) => n.type === "friend_request");
    } else if (this.filter === "location") {
      merged = merged.filter((n) => n.type === "location_share_request");
    }

    // Sort newest first
    merged.sort((a, b) => {
      const ta = a.createdAt?.toDate
        ? a.createdAt.toDate().getTime()
        : new Date(a.createdAt || 0).getTime();
      const tb = b.createdAt?.toDate
        ? b.createdAt.toDate().getTime()
        : new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });

    if (merged.length === 0) {
      return `
        <div class="no-notifications">
          <div class="no-notifications-icon">🔔</div>
          <h4 class="no-notifications-text">All caught up!</h4>
          <p class="no-notifications-subtitle">
            No new notifications right now. When friends send you requests or share their location,
            you'll see them here.
          </p>
          <div class="empty-actions">
            <button type="button" class="button secondary" data-spa-route="friends">
              <i class="fas fa-users"></i>
              Find Friends
            </button>
          </div>
        </div>
      `;
    }

    return merged
      .map((notification) => {
        if (notification.type === "location_share_request") {
          return this.renderLocationShareRequest(notification);
        } else if (notification.type === "friend_request") {
          return this.renderFriendRequest(notification);
        } else if (notification.type === "location_sharing_enabled") {
          return this.renderLocationSharingEnabled(notification);
        }

        // Default notification rendering
        return this.renderGenericNotification(notification);
      })
      .join("");
  }

  /**
   * Render a location sharing request notification
   * @param {Object} notification - The location share request notification
   * @returns {string} HTML string for the notification
   */
  renderLocationShareRequest(notification) {
    const isRead = notification.read || false;
    const readClass = isRead ? "notification-read" : "notification-unread";

    return `
      <div class="notification-item location-request ${readClass}" data-notification-id="${
      notification.id
    }">
        <div class="notification-content">
          <div class="notification-avatar">
            <img src="${avatarManager.generateAvatarUrl(
              notification.fromUserInfo.avatarConfig
            )}" 
                 alt="@${notification.fromUserInfo.handle || 'unknown'}"
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCA0MCA0MCI+CiAgPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNlNWU3ZWIiLz4KICA8cGF0aCBkPSJNMjAgMThjMS4xIDAtMi0uOS0yLTJzLjktMiAyLTIgMiAuOSAyIDItLjkgMi0yIDJaTTI4IDE2YzAgNC40LTMuNiA4LTggOHMtOC0zLjYtOC04IDMuNi04IDgtOCA4IDMuNiA4IDhaIiBmaWxsPSIjNjM2MzYzIi8+Cjwvc3ZnPgo='">
          </div>
          <div class="notification-text-content">
            <div class="notification-text">
              <strong>${
                '@' + (notification.fromUserInfo.handle || 'unknown')
              }</strong><span class="action-verb"> wants to share location</span>
            </div>
            <div class="notification-time">${this.formatTime(
              notification.createdAt
            )}</div>
          </div>
        </div>
        
        <div class="notification-actions">
          <button class="accept-location-btn" data-friendship-id="${
            notification.locationRequest.friendshipId
          }" data-notification-id="${notification.id}">
            Share Location
          </button>
          <button class="dismiss-btn" data-notification-id="${notification.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render a friend request notification
   * @param {Object} notification - The friend request notification
   * @returns {string} HTML string for the notification
   */
  renderFriendRequest(notification) {
    const isRead = notification.read || false;
    const readClass = isRead ? "notification-read" : "notification-unread";
    const requestId =
      (notification.friendRequest && notification.friendRequest.requestId) ||
      notification.id;

    return `
      <div class="notification-item friend-request ${readClass}" data-notification-id="${
      notification.id
    }">
        <div class="notification-content">
          <div class="notification-avatar">
            <img src="${avatarManager.generateAvatarUrl(
              notification.fromUserInfo.avatarConfig
            )}" 
                 alt="@${notification.fromUserInfo.handle || 'unknown'}"
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCA0MCA0MCI+CiAgPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNlNWU3ZWIiLz4KICA8cGF0aCBkPSJNMjAgMThjMS4xIDAtMi0uOS0yLTJzLjktMiAyLTIgMiAuOSAyIDItLjkgMi0yIDJaTTI4IDE2YzAgNC40LTMuNiA4LTggOHMtOC0zLjYtOC04IDMuNi04IDgtOCA4IDMuNiA4IDhaIiBmaWxsPSIjNjM2MzYzIi8+Cjwvc3ZnPgo='">
          </div>
          <div class="notification-text-content">
            <div class="notification-text">
              <strong>${
                '@' + (notification.fromUserInfo.handle || 'unknown')
              }</strong><span class="action-verb"> sent a friend request</span>
            </div>
            <div class="notification-time">${this.formatTime(
              notification.createdAt
            )}</div>
          </div>
        </div>
        
        <div class="notification-actions">
          <button class="accept-friend-btn" data-request-id="${requestId}">
            Accept
          </button>
          <button class="reject-friend-btn" data-request-id="${requestId}">
            Decline
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render a location sharing enabled notification
   * @param {Object} notification - The location sharing enabled notification
   * @returns {string} HTML string for the notification
   */
  renderLocationSharingEnabled(notification) {
    const isRead = notification.read || false;
    const readClass = isRead ? "notification-read" : "notification-unread";

    return `
      <div class="notification-item location-enabled ${readClass}" data-notification-id="${
      notification.id
    }">
        <div class="notification-avatar">
          <img src="${avatarManager.generateAvatarUrl(
            notification.fromUserInfo.avatarConfig
          )}" 
               alt="@${notification.fromUserInfo.handle || 'unknown'}"
               onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCA0MCA0MCI+CiAgPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNlNWU3ZWIiLz4KICA8cGF0aCBkPSJNMjAgMThjMS4xIDAtMi0uOS0yLTJzLjktMiAyLTIgMiAuOSAyIDItLjkgMi0yIDJaTTI4IDE2YzAgNC40LTMuNiA4LTggOHMtOC0zLjYtOC04IDMuNi04IDgtOCA4IDMuNiA4IDhaIiBmaWxsPSIjNjM2MzYzIi8+Cjwvc3ZnPgo='">
        </div>
        
        <div class="notification-content">
          <div class="notification-text">
            <span class="notification-icon type-enabled" aria-hidden="true"><i class="fas fa-signal"></i></span>
            <strong>${
              '@' + (notification.fromUserInfo.handle || 'unknown')
            }</strong><span class="action-verb"> enabled location sharing</span>
          </div>
          <div class="notification-details">
            You can now see each other on the campus map
          </div>
          <div class="notification-time">${this.formatTime(
            notification.createdAt
          )}</div>
        </div>
        
        <div class="notification-actions">
          <button class="dismiss-btn" data-notification-id="${notification.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render a generic notification
   * @param {Object} notification - The generic notification
   * @returns {string} HTML string for the notification
   */
  renderGenericNotification(notification) {
    const isRead = notification.read || false;
    const readClass = isRead ? "notification-read" : "notification-unread";

    return `
      <div class="notification-item generic ${readClass}" data-notification-id="${
      notification.id
    }">
        <div class="notification-content">
          <div class="notification-text">
            <span class="notification-icon type-generic" aria-hidden="true"><i class="fas fa-bell"></i></span>
            ${notification.message || "Notification"}
          </div>
          <div class="notification-time">${this.formatTime(
            notification.createdAt
          )}</div>
        </div>
        
        <div class="notification-actions">
          <button class="dismiss-btn" data-notification-id="${notification.id}">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Set up event handlers for notification interactions
   */
  setupEventHandlers(listOnly = false) {
    try {
      if (!listOnly)
        console.log("🔧 Setting up notification event handlers...");
      // Use delegated events for dynamic list items to avoid re-binding per item
      this.ensureListDelegationBound();

      // Individual button listeners not needed; handled via single delegated list handler

      // Handle mark all read (bind once; avoid duplicate listeners)
      if (!listOnly) {
        const markAllReadBtn = document.querySelector(".mark-all-read");
        if (markAllReadBtn && !markAllReadBtn.dataset.bound) {
          markAllReadBtn.dataset.bound = "true";
          markAllReadBtn.addEventListener("click", async () => {
            console.log("📖 Marking all notifications as read");
            await this.markAllNotificationsRead();
          });
        }

        // Filter buttons (bind on header once)
        const filters = document.querySelector(".notifications-filters");
        if (filters && !filters.dataset.bound) {
          filters.dataset.bound = "true";
          filters.addEventListener("click", (e) => {
            const btn = e.target.closest(".filter-btn");
            if (!btn) return;
            const newFilter = btn.getAttribute("data-filter");
            if (!newFilter) return;
            this.filter = newFilter; // update filter and refresh list only
            this.updateListOnly();
          });
        }
      }

      if (!listOnly) console.log("✅ Event handlers set up successfully");
    } catch (error) {
      console.error("❌ Error setting up event handlers:", error);
    }
  }

  /**
   * Bind a single delegated click handler for list actions (once)
   */
  ensureListDelegationBound() {
    const list = document.getElementById("notificationsList");
    if (!list) return;
    // Re-bind if the element changed (after full re-render) to avoid losing handlers
    if (this._listElement !== list) {
      if (this._listElement && this._listDelegatedHandler) {
        this._listElement.removeEventListener(
          "click",
          this._listDelegatedHandler
        );
      }
      this._listElement = list;
      this._listDelegatedHandler = async (e) => {
        const acceptLoc = e.target.closest(".accept-location-btn");
        if (acceptLoc) {
          const friendshipId = acceptLoc.dataset.friendshipId;
          const notificationId = acceptLoc.dataset.notificationId;
          console.log(
            "📍 Accepting location sharing for friendship:",
            friendshipId,
            "notification:",
            notificationId
          );
          await this.acceptLocationSharing(friendshipId, notificationId);
          return;
        }

        const acceptFriend = e.target.closest(".accept-friend-btn");
        if (acceptFriend) {
          const requestId = acceptFriend.dataset.requestId;
          console.log("✅ Accepting friend request:", requestId);
          await this.acceptFriendRequest(requestId);
          return;
        }

        const rejectFriend = e.target.closest(".reject-friend-btn");
        if (rejectFriend) {
          const requestId = rejectFriend.dataset.requestId;
          console.log("❌ Rejecting friend request:", requestId);
          await this.rejectFriendRequest(requestId);
          return;
        }

        const dismiss = e.target.closest(".dismiss-btn");
        if (dismiss) {
          const notificationId = dismiss.dataset.notificationId;
          console.log("🗑️ Dismissing notification:", notificationId);
          await this.dismissNotification(notificationId);
          return;
        }
      };
      list.addEventListener("click", this._listDelegatedHandler);
    }
  }

  /**
   * Accept location sharing with a friend
   * @param {string} friendshipId - The friendship ID to enable location sharing for
   * @param {string} notificationId - The notification ID to dismiss after acceptance
   */
  async acceptLocationSharing(friendshipId, notificationId) {
    try {
      console.log("📍 Processing location sharing acceptance...");

      // 1. FIRST: Enable global location sharing for current user
      console.log("🔧 Enabling global location sharing for current user...");
      const globalResult = await dataManager.updateLocationSharingPreference(
        currentUser.uid,
        true
      );
      if (!globalResult.success) {
        throw new Error("Failed to enable global location sharing");
      }

      // 2. Enable bilateral location sharing in friendship document
      const result = await dataManager.updateBilateralLocationSharing(
        friendshipId,
        currentUser.uid,
        true
      );

      if (result.success) {
        // Mark handshake complete so future toggles don't require a request
        try {
          const { doc, updateDoc } = await import("firebase/firestore");
          await updateDoc(doc(db, "friendships", friendshipId), {
            "locationSharingMetadata.mutualSharingEnabled": true,
            "locationSharingMetadata.lastLocationUpdate": new Date().getTime(),
            "locationSharingMetadata.locationUpdatedBy": currentUser.uid,
          });
        } catch (metaErr) {
          console.warn(
            "⚠️ Could not set mutualSharingEnabled metadata:",
            metaErr
          );
        }
        // 3. Request location permission and start tracking
        if (campusLocationService.getPermissionStatus() !== "granted") {
          console.log("📍 Requesting location permission...");
          try {
            await campusLocationService.requestLocationPermission();
          } catch (permError) {
            console.warn(
              "⚠️ Location permission denied, but continuing with location sharing enabled"
            );
            // Continue even if permission denied - user can still enable sharing
          }
        }

        // 4. Start location tracking if permission granted
        await this.startLocationTracking();

        // 5. Update user's location status immediately with current detection
        console.log("🏫 Attempting initial campus detection...");
        try {
          const campusDetectionResult =
            await campusLocationService.detectCampusPresence("iub");
          // Extract the campus status string from the detection result
          const campusStatus = campusDetectionResult.onCampus
            ? "on_campus"
            : "off_campus";
          await dataManager.updateUserLocationStatus(
            currentUser.uid,
            campusStatus
          );
          console.log(`✅ Initial campus status set: ${campusStatus}`);
        } catch (detectionError) {
          console.warn(
            "⚠️ Initial campus detection failed, setting unknown status"
          );
          await dataManager.updateUserLocationStatus(
            currentUser.uid,
            "unknown"
          );
        }

        // 6. Dismiss the notification after successful acceptance
        if (notificationId) {
          const el = document.querySelector(
            `[data-notification-id="${notificationId}"]`
          );
          if (el) el.classList.add("notification-accept");
          setTimeout(() => this.dismissNotification(notificationId), 380);
        }

        notificationManager.showSuccessNotification(
          "Location sharing enabled!"
        );

        // 7. Refresh notifications to update UI
        await this.loadNotifications();
        this.render();

        console.log("✅ Location sharing accepted successfully");
      } else {
        throw new Error(result.error || "Failed to enable location sharing");
      }
    } catch (error) {
      console.error("❌ Error accepting location sharing:", error);
      notificationManager.showErrorNotification(
        "Failed to enable location sharing"
      );
    }
  }

  /**
   * Accept a friend request
   * @param {string} requestId - The friend request ID to accept
   */
  async acceptFriendRequest(requestId) {
    try {
      console.log("👥 Processing friend request acceptance...");

      // Try to build requestData from the notification payload to use FriendsService
      const notif = this.notifications.find(
        (n) => n.friendRequest?.requestId === requestId
      );

      let result;
      if (notif) {
        // Fetch current user's profile for toUserInfo
        const userProfile = await currentUser.waitForProfile();
        const requestData = {
          id: requestId,
          fromUserId: notif.fromUserId,
          toUserId: userProfile?.uid || currentUser.uid,
          fromUserInfo: notif.fromUserInfo,
          toUserInfo: {
            handle: userProfile?.profile?.handle,
            major: userProfile?.profile?.major,
            university: userProfile?.universityInfo?.university,
            avatarConfig: userProfile?.avatarConfig,
          },
        };
        result = await friendsManager.acceptFriendRequest(
          requestId,
          requestData
        );
      } else {
        // Fallback: pull latest pending requests and try to find it
        const pending = await friendsManager.getPendingRequests();
        const reqData = pending.find((r) => r.id === requestId);
        if (!reqData) {
          throw new Error("Request not found");
        }
        result = await friendsManager.acceptFriendRequest(requestId, reqData);
      }

      if (result.success) {
        notificationManager.showSuccessNotification("Friend request accepted!");

        // Refresh notifications to update UI
        await this.loadNotifications();
        this.render();

        console.log("✅ Friend request accepted successfully");
      } else {
        throw new Error(result.error || "Failed to accept friend request");
      }
    } catch (error) {
      console.error("❌ Error accepting friend request:", error);
      notificationManager.showErrorNotification(
        "Failed to accept friend request"
      );
    }
  }

  /**
   * Reject a friend request
   * @param {string} requestId - The friend request ID to reject
   */
  async rejectFriendRequest(requestId) {
    try {
      console.log("❌ Processing friend request rejection...");
      // Try to get request data from pending list
      let reqData = (this.friendRequests || []).find((r) => r.id === requestId);
      if (!reqData) {
        const pending = await friendsManager.getPendingRequests();
        reqData = pending.find((r) => r.id === requestId);
      }

      const result = await friendsManager.rejectFriendRequest(
        requestId,
        reqData || null
      );
      if (result.success) {
        notificationManager.showSuccessNotification("Friend request declined");
        // refresh merged list
        this.updateListOnly();
      } else {
        throw new Error(result.error || "Failed to decline");
      }
    } catch (error) {
      console.error("❌ Error rejecting friend request:", error);
      notificationManager.showErrorNotification(
        "Failed to decline friend request"
      );
    }
  }

  /**
   * Dismiss a notification
   * @param {string} notificationId - The notification ID to dismiss
   */
  async dismissNotification(notificationId) {
    try {
      console.log("🗑️ Dismissing notification:", notificationId);
      // play animation if element still present
      const el = document.querySelector(
        `[data-notification-id="${notificationId}"]`
      );
      if (el && !el.classList.contains("notification-exit")) {
        el.classList.add("notification-exit");
      }
      const result = await dataManager.dismissNotification(notificationId);

      if (result.success) {
        // Remove from local array immediately for responsive UI
        this.notifications = this.notifications.filter(
          (n) => n.id !== notificationId
        );
        // delay actual DOM refresh slightly to allow animation
        setTimeout(() => this.updateListOnly(), 210);

        console.log("✅ Notification dismissed successfully");
      } else {
        throw new Error(result.error || "Failed to dismiss notification");
      }
    } catch (error) {
      console.error("❌ Error dismissing notification:", error);
      notificationManager.showErrorNotification(
        "Failed to dismiss notification"
      );
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead() {
    try {
      console.log("📖 Marking all notifications as read...");

      const result = await dataManager.markAllNotificationsRead(
        currentUser.uid
      );

      if (result.success) {
        // Update local notifications
        this.notifications = this.notifications.map((n) => ({
          ...n,
          read: true,
        }));
        this.render();

        notificationManager.showSuccessNotification(
          "All notifications marked as read"
        );
        console.log("✅ All notifications marked as read");
      } else {
        throw new Error(result.error || "Failed to mark notifications as read");
      }
    } catch (error) {
      console.error("❌ Error marking all notifications as read:", error);
      notificationManager.showErrorNotification(
        "Failed to mark notifications as read"
      );
    }
  }

  /**
   * Start location tracking for the current user
   */
  async startLocationTracking() {
    try {
      console.log("📍 Starting location tracking...");

      if (campusLocationService.getPermissionStatus() === "granted") {
        await campusLocationService.startLocationTracking();
        console.log("✅ Location tracking started");
      } else {
        console.log("📍 Location permission not granted, requesting...");
        await campusLocationService.requestLocationPermission();

        if (campusLocationService.getPermissionStatus() === "granted") {
          await campusLocationService.startLocationTracking();
          console.log("✅ Location tracking started after permission granted");
        }
      }
    } catch (error) {
      console.error("❌ Error starting location tracking:", error);
      notificationManager.showErrorNotification(
        "Failed to start location tracking"
      );
    }
  }

  /**
   * Format timestamp for display
   * @param {Object} timestamp - Firestore timestamp or Date object
   * @returns {string} Formatted time string
   */
  formatTime(timestamp) {
    try {
      let date;

      if (timestamp?.toDate) {
        // Firestore timestamp
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (
        typeof timestamp === "string" ||
        typeof timestamp === "number"
      ) {
        date = new Date(timestamp);
      } else {
        return "Just now";
      }

      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch (error) {
      console.error("❌ Error formatting time:", error);
      return "Recently";
    }
  }

  /**
   * Clean up resources when leaving the page
   */
  cleanup() {
    try {
      console.log("🧹 Cleaning up NotificationsPage...");

      this.isActive = false;

      // Unsubscribe from all real-time listeners
      this.unsubscribers.forEach((unsubscriber) => {
        if (typeof unsubscriber === "function") {
          unsubscriber();
        }
      });
      this.unsubscribers = [];

      console.log("✅ NotificationsPage cleanup complete");
    } catch (error) {
      console.error("❌ Error during NotificationsPage cleanup:", error);
    }
  }

  /**
   * Check if the page is currently active
   * @returns {boolean} True if page is active
   */
  isPageActive() {
    return this.isActive && this.isInitialized;
  }
}

// Export singleton instance
export const notificationsPage = new NotificationsPage();

// 🎯 Connect to SPA Router - listen for page load events
console.log(
  "🔔 NotificationsPage: Registering spa:page:load event listener..."
);
document.addEventListener("spa:page:load", (event) => {
  console.log(
    `🔔 NotificationsPage: Received spa:page:load event for route: ${event.detail.route}`
  );
  if (event.detail.route === "notifications") {
    console.log(
      "🔔 Notifications page loaded, initializing NotificationsPage..."
    );
    notificationsPage.init();
  }
});

// Clean up when leaving the notifications page
document.addEventListener("spa:page:unload", (event) => {
  if (event.detail.route === "notifications") {
    console.log("🔔 Notifications page unloading, cleaning up...");
    notificationsPage.cleanup();
  }
});
