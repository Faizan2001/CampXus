/**
 * 🔗 Friend Options Menu Component
 *
 * 🎓 BEGINNER EXPLANATION:
 * This component creates the three-dots menu for each friend card.
 * It's a reusable component that can be used anywhere we need friend options.
 *
 * FEATURES:
 * - Glassmorphism dropdown styling
 * - Individual privacy controls (hide/show schedule)
 * - Unfriend functionality
 * - Visual indicators showing current privacy state
 * - Accessible keyboard navigation
 * - Event-driven communication with parent components
 *
 * WHY THIS APPROACH:
 * - Separation of concerns: menu logic separate from friends page
 * - Reusability: can be used in other contexts
 * - Event-driven: loose coupling with parent components
 * - Accessibility: proper ARIA labels and keyboard support
 */

import { friendshipPrivacyService } from "../../services/friends/FriendshipPrivacyService.js";
import { currentUser } from "../../store/userStore.js";

export class FriendOptionsMenu {
  constructor(friend, options = {}) {
    this.friend = friend;
    this.options = {
      showUnfriend: options.showUnfriend !== false, // Default to true
      showPrivacyToggle: options.showPrivacyToggle !== false, // Default to true
      ...options,
    };

    this.isDropdownOpen = false;
    this.element = null;
    this.currentPrivacyStatus = null; // Cache privacy status

    // Bind methods to preserve context
    this.handleButtonClick = this.handleButtonClick.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    console.log(
      `🔗 FriendOptionsMenu created for ${
        friend.displayName || friend.name
      } using bilateral privacy`
    );
  }

  /**
   * 🏗️ Create the menu element
   *
   * BILATERAL PRIVACY EXPLANATION:
   * This method builds the HTML structure using the new bilateral privacy system.
   * Each user controls only their own schedule visibility to friends.
   */
  async createElement() {
    const container = document.createElement("div");
    container.className = "friend-options-menu";
    container.setAttribute("data-friend-id", this.friend.id);

    // Get bilateral privacy status
    await this.updatePrivacyStatus();

    // Determine current privacy state (user's own schedule visibility)
    const currentUserUid = currentUser.state?.user?.uid;
    const myScheduleVisible =
      this.currentPrivacyStatus?.mySchedule?.visible ?? true;

    // Clear labeling for bilateral privacy
    const privacyText = myScheduleVisible
      ? "Hide My Schedule"
      : "Show My Schedule";
    const privacyIcon = myScheduleVisible ? "fa-eye-slash" : "fa-eye";
    const privacyClass = myScheduleVisible
      ? "hide-my-schedule"
      : "show-my-schedule";

    container.innerHTML = `
      <button class="options-button" 
              type="button"
              aria-label="More options for ${
                this.friend.displayName || this.friend.name
              }"
              aria-expanded="false"
              aria-haspopup="true">
        <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
      </button>
      
      <div class="options-dropdown glassmorphism-dropdown" 
           role="menu"
           aria-label="Friend options menu"
           style="display: none;">
        <ul role="none">
          ${
            this.options.showPrivacyToggle
              ? `
            <li role="menuitem" class="menu-option privacy-toggle-option ${privacyClass}"
                title="${
                  myScheduleVisible
                    ? "Hide your schedule from this friend"
                    : "Show your schedule to this friend"
                }">
              <i class="fas ${privacyIcon}" aria-hidden="true"></i>
              <span>${privacyText}</span>
            </li>
          `
              : ""
          }
          
          ${
            this.options.showUnfriend
              ? `
            <li role="menuitem" class="menu-option unfriend-option">
              <i class="fas fa-user-minus" aria-hidden="true"></i>
              <span>Unfriend</span>
            </li>
          `
              : ""
          }
        </ul>
      </div>
    `;

    this.element = container;
    this.attachEventListeners();
    return container;
  }

  /**
   * 📊 Update privacy status from bilateral privacy service
   */
  async updatePrivacyStatus() {
    try {
      const currentUserUid = currentUser.state?.user?.uid;
      if (!currentUserUid) {
        console.warn("No current user found for privacy status update");
        return;
      }

      this.currentPrivacyStatus =
        await friendshipPrivacyService.getPrivacyStatus(
          currentUserUid,
          this.friend.id
        );

      console.log(
        `📊 Privacy status updated for ${this.friend.displayName}:`,
        this.currentPrivacyStatus
      );
    } catch (error) {
      console.warn(
        `⚠️ Could not fetch privacy status for ${this.friend.displayName}:`,
        error.message
      );
      // Fallback to default privacy state
      this.currentPrivacyStatus = {
        mySchedule: { visible: true, status: "visible" },
        friendSchedule: { visible: true, status: "visible" },
      };
      console.log(
        `📊 Using default privacy status for ${this.friend.displayName}`
      );
    }
  }

  /**
   * 🎯 Attach event listeners
   *
   * BEGINNER EXPLANATION:
   * This connects user interactions (clicks, keyboard) to our JavaScript methods.
   * We use event delegation and proper cleanup to prevent memory leaks.
   */
  attachEventListeners() {
    if (!this.element) return;

    const button = this.element.querySelector(".options-button");

    // Main button click
    button.addEventListener("click", this.handleButtonClick);

    // Menu option clicks
    const privacyOption = this.element.querySelector(".privacy-toggle-option");
    const unfriendOption = this.element.querySelector(".unfriend-option");

    if (privacyOption) {
      privacyOption.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handlePrivacyToggle();
        this.closeDropdown();
      });
    }

    if (unfriendOption) {
      unfriendOption.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleUnfriend();
        this.closeDropdown();
      });
    }

    // Keyboard navigation
    this.element.addEventListener("keydown", this.handleKeyDown);

    // Close dropdown when clicking outside
    document.addEventListener("click", this.handleOutsideClick);

    console.log("🎯 Event listeners attached to friend options menu");
  }

  /**
   * 🖱️ Handle button click to toggle dropdown
   */
  handleButtonClick(e) {
    e.stopPropagation();

    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  /**
   * 📂 Open the dropdown menu
   */
  openDropdown() {
    if (!this.element) return;

    // Close any other open dropdowns first
    this.closeAllDropdowns();

    const button = this.element.querySelector(".options-button");
    const dropdown = this.element.querySelector(".options-dropdown");

    dropdown.style.display = "block";
    button.setAttribute("aria-expanded", "true");
    this.isDropdownOpen = true;

    // Focus first menu item for keyboard navigation
    const firstMenuItem = dropdown.querySelector(".menu-option");
    if (firstMenuItem) {
      firstMenuItem.focus();
    }

    console.log("📂 Friend options dropdown opened");
  }

  /**
   * 📁 Close the dropdown menu
   */
  closeDropdown() {
    if (!this.element) return;

    const button = this.element.querySelector(".options-button");
    const dropdown = this.element.querySelector(".options-dropdown");

    dropdown.style.display = "none";
    button.setAttribute("aria-expanded", "false");
    this.isDropdownOpen = false;

    console.log("📁 Friend options dropdown closed");
  }

  /**
   * 🔒 Handle privacy toggle (bilateral - user controls their own schedule visibility)
   */
  async handlePrivacyToggle() {
    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.error("No current user found for privacy toggle");
      return;
    }

    const currentlyVisible =
      this.currentPrivacyStatus?.mySchedule?.visible ?? true;
    const newVisibility = !currentlyVisible;

    console.log(
      `🔒 Bilateral privacy toggle for ${this.friend.displayName}: ${currentlyVisible} → ${newVisibility}`
    );

    // Optimistic UI update
    await this.updatePrivacyUI(newVisibility);

    // Update database using bilateral privacy service
    const success = await friendshipPrivacyService.updateScheduleVisibility(
      currentUserUid, // User updating their own visibility
      this.friend.id, // To this friend
      newVisibility
    );

    if (success) {
      // Update local privacy status
      if (this.currentPrivacyStatus) {
        this.currentPrivacyStatus.mySchedule.visible = newVisibility;
        this.currentPrivacyStatus.mySchedule.status = newVisibility
          ? "visible"
          : "hidden";
      }

      // Emit event for parent components to update (check if element still exists)
      if (this.element) {
        this.element.dispatchEvent(
          new CustomEvent("privacy-changed", {
            bubbles: true,
            detail: {
              friendId: this.friend.id,
              myScheduleVisible: newVisibility,
              privacyStatus: this.currentPrivacyStatus,
              friend: this.friend,
            },
          })
        );
      } else {
        console.warn(`⚠️ Element destroyed before privacy event could be dispatched for ${this.friend.displayName}`);
      }

      console.log(
        `✅ Bilateral privacy updated for ${this.friend.displayName}`
      );
    } else {
      // Revert UI on failure
      await this.updatePrivacyUI(currentlyVisible);
      console.error(
        `❌ Failed to update bilateral privacy for ${this.friend.displayName}`
      );
    }
  }

  /**
   * 🎨 Update privacy UI elements (bilateral privacy system)
   * @param {boolean} myScheduleVisible - Whether current user's schedule is visible to friend
   */
  async updatePrivacyUI(myScheduleVisible = null) {
    if (!this.element) return;

    // If no visibility provided, get current status
    if (myScheduleVisible === null) {
      await this.updatePrivacyStatus();
      myScheduleVisible =
        this.currentPrivacyStatus?.mySchedule?.visible ?? true;
    }

    const privacyOption = this.element.querySelector(".privacy-toggle-option");
    const icon = privacyOption?.querySelector("i");
    const text = privacyOption?.querySelector("span");

    if (privacyOption && icon && text) {
      // Update icon (bilateral privacy - user controls their own visibility)
      icon.className = myScheduleVisible ? "fas fa-eye-slash" : "fas fa-eye";

      // Update text with clear bilateral labeling
      text.textContent = myScheduleVisible
        ? "Hide My Schedule"
        : "Show My Schedule";

      // Update class for styling
      privacyOption.className = `menu-option privacy-toggle-option ${
        myScheduleVisible ? "hide-my-schedule" : "show-my-schedule"
      }`;

      // Update tooltip
      privacyOption.title = myScheduleVisible
        ? "Hide your schedule from this friend"
        : "Show your schedule to this friend";
    }
  }

  /**
   * 👋 Handle unfriend action
   */
  handleUnfriend() {
    console.log(`👋 Unfriend requested for ${this.friend.displayName}`);

    // Emit event for parent components to handle
    this.element.dispatchEvent(
      new CustomEvent("unfriend-requested", {
        bubbles: true,
        detail: {
          friendId: this.friend.id,
          friendName: this.friend.displayName || this.friend.name,
          friend: this.friend,
        },
      })
    );
  }

  /**
   * ⌨️ Handle keyboard navigation
   */
  handleKeyDown(e) {
    if (!this.isDropdownOpen) return;

    const menuItems = this.element.querySelectorAll(".menu-option");
    const currentIndex = Array.from(menuItems).findIndex(
      (item) => item === document.activeElement
    );

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        this.closeDropdown();
        this.element.querySelector(".options-button").focus();
        break;

      case "ArrowDown":
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % menuItems.length;
        menuItems[nextIndex].focus();
        break;

      case "ArrowUp":
        e.preventDefault();
        const prevIndex =
          currentIndex === 0 ? menuItems.length - 1 : currentIndex - 1;
        menuItems[prevIndex].focus();
        break;

      case "Enter":
      case " ":
        e.preventDefault();
        if (document.activeElement) {
          document.activeElement.click();
        }
        break;
    }
  }

  /**
   * 🌐 Handle clicks outside the menu to close it
   */
  handleOutsideClick(e) {
    if (!this.element || !this.isDropdownOpen) return;

    if (!this.element.contains(e.target)) {
      this.closeDropdown();
    }
  }

  /**
   * 🔄 Update friend data and refresh privacy status
   * @param {Object} newFriendData - Updated friend information
   */
  async updateFriend(newFriendData) {
    this.friend = { ...this.friend, ...newFriendData };

    // Update privacy status and UI with bilateral privacy
    await this.updatePrivacyStatus();
    await this.updatePrivacyUI();

    console.log(
      `🔄 Friend data updated for ${this.friend.displayName} with bilateral privacy`
    );
  }

  /**
   * 🌍 Close all open dropdowns (utility method)
   */
  closeAllDropdowns() {
    const allMenus = document.querySelectorAll(".friend-options-menu");
    allMenus.forEach((menu) => {
      const dropdown = menu.querySelector(".options-dropdown");
      const button = menu.querySelector(".options-button");

      if (dropdown && dropdown.style.display === "block") {
        dropdown.style.display = "none";
        if (button) {
          button.setAttribute("aria-expanded", "false");
        }
      }
    });
  }

  /**
   * 🧹 Clean up event listeners and DOM
   */
  destroy() {
    if (!this.element) return;

    // Remove event listeners
    document.removeEventListener("click", this.handleOutsideClick);

    // Remove element from DOM
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    this.element = null;
    this.isDropdownOpen = false;

    console.log(
      `🧹 FriendOptionsMenu destroyed for ${this.friend.displayName}`
    );
  }

  /**
   * 🎭 Render the menu into a parent element (async for bilateral privacy)
   * @param {HTMLElement} parentElement - Element to render into
   */
  async render(parentElement) {
    if (!parentElement) {
      console.error(
        "❌ Parent element is required to render FriendOptionsMenu"
      );
      return;
    }

    if (!this.element) {
      await this.createElement();
    }

    parentElement.appendChild(this.element);
    console.log(
      `🎭 FriendOptionsMenu rendered for ${this.friend.displayName} with bilateral privacy`
    );
  }
}
