/**
 * Mutual Friends Modal Component
 *
 * Displays a scrollable list of mutual friends between two users
 * Mobile-first design with friend cards showing avatar, name, handle
 * Click on friend to view their profile
 */

import { dataManager } from "../../services/data/DataService.js";
import { getAvatarUrl } from "../../utils/avatar/avatarUtils.js";

export class MutualFriendsModal {
  constructor() {
    this.modal = null;
    this.isOpen = false;
    this.currentMutualIds = [];
    this.viewingUserHandle = null;
  }

  /**
   * Open the modal with mutual friends list
   * @param {string[]} mutualFriendIds - Array of mutual friend user IDs
   * @param {string} viewingUserHandle - Handle of the user being viewed (for title)
   */
  async open(mutualFriendIds, viewingUserHandle = "this user") {
    if (this.isOpen) return;

    this.currentMutualIds = mutualFriendIds || [];
    this.viewingUserHandle = viewingUserHandle;

    console.log(
      "[MutualFriendsModal] Opening with",
      this.currentMutualIds.length,
      "friends"
    );

    this.createModal();
    this.isOpen = true;

    // Load friend data
    await this.loadFriends();
  }

  createModal() {
    // Remove any existing modal
    this.close();

    const modalHtml = `
      <div class="mutual-friends-modal-overlay">
        <div class="mutual-friends-modal">
          <div class="mutual-friends-header">
            <h3>Mutual Friends with ${this.escapeHtml(
              this.viewingUserHandle
            )}</h3>
            <button class="close-btn" aria-label="Close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="mutual-friends-count">
            ${this.currentMutualIds.length} mutual friend${
      this.currentMutualIds.length !== 1 ? "s" : ""
    }
          </div>
          <div class="mutual-friends-list">
            <div class="loading-spinner">
              <i class="fas fa-spinner fa-spin"></i> Loading friends...
            </div>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement("div");
    container.innerHTML = modalHtml;
    this.modal = container.firstElementChild;
    document.body.appendChild(this.modal);

    // Add event listeners
    this.modal
      .querySelector(".close-btn")
      .addEventListener("click", () => this.close());
    // Close when clicking on the dark overlay background
    this.modal.addEventListener("click", (e) => {
      if (e.target.classList.contains("mutual-friends-modal-overlay")) {
        this.close();
      }
    });

    // Animate in
    requestAnimationFrame(() => {
      this.modal.classList.add("show");
    });
  }

  async loadFriends() {
    if (!this.modal) return;
    const listContainer = this.modal.querySelector(".mutual-friends-list");

    if (this.currentMutualIds.length === 0) {
      listContainer.innerHTML = `
        <div class="no-mutual-friends">
          <i class="fas fa-user-friends"></i>
          <p>No mutual friends</p>
        </div>
      `;
      return;
    }

    try {
      // Fetch all friend profiles
      const friends = await Promise.all(
        this.currentMutualIds.map((id) => dataManager.getUserProfileMinimal(id))
      );

      // Filter out nulls and render
      const validFriends = friends.filter((f) => f);

      if (validFriends.length === 0) {
        listContainer.innerHTML = `
          <div class="no-mutual-friends">
            <i class="fas fa-user-friends"></i>
            <p>No mutual friends found</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = validFriends
        .map((friend) => this.renderFriendCard(friend))
        .join("");

      // Add click handlers to friend cards
      listContainer.querySelectorAll(".mutual-friend-card").forEach((card) => {
        card.addEventListener("click", () => {
          const userId = card.dataset.userId;
          this.close();
          window.location.hash = `#user?id=${userId}`;
        });
      });
    } catch (error) {
      console.error("[MutualFriendsModal] Error loading friends:", error);
      listContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error loading mutual friends</p>
        </div>
      `;
    }
  }

  renderFriendCard(friend) {
    const handle = friend.handle ? `@${friend.handle}` : "User";
    const fullName = `${friend.firstName || ""} ${friend.lastName || ""}`.trim();
    const name = fullName || friend.handle || "Friend";
    const major = friend.major || "";

    // Determine avatar/photo
    let avatarHtml;
    if (friend.profilePhotoUrl) {
      avatarHtml = `<img src="${this.escapeHtml(
        friend.profilePhotoUrl
      )}" alt="${this.escapeHtml(name)}" class="friend-photo">`;
    } else {
      const avatarUrl = getAvatarUrl(friend);
      if (avatarUrl) {
        avatarHtml = `<img src="${this.escapeHtml(
          avatarUrl
        )}" alt="${this.escapeHtml(name)}" class="friend-avatar">`;
      } else {
        avatarHtml = `<div class="friend-avatar-placeholder"><i class="fas fa-user"></i></div>`;
      }
    }

    return `
      <div class="mutual-friend-card" data-user-id="${this.escapeHtml(
        friend.uid || friend.id || ""
      )}">
        <div class="friend-card-avatar">
          ${avatarHtml}
        </div>
        <div class="friend-card-info">
          <div class="friend-card-name">${this.escapeHtml(name)}</div>
          <div class="friend-card-handle">${this.escapeHtml(handle)}</div>
          ${
            major
              ? `<div class="friend-card-major">${this.escapeHtml(major)}</div>`
              : ""
          }
        </div>
        <div class="friend-card-arrow">
          <i class="fas fa-chevron-right"></i>
        </div>
      </div>
    `;
  }

  close() {
    if (!this.modal) return;

    this.modal.classList.remove("show");
    setTimeout(() => {
      if (this.modal && this.modal.parentNode) {
        this.modal.parentNode.removeChild(this.modal);
      }
      this.modal = null;
      this.isOpen = false;
    }, 300); // Match CSS transition duration
  }

  escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Singleton instance
export const mutualFriendsModal = new MutualFriendsModal();
