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
import { dataManager } from "../../services/data/DataService.js";
import { friendsManager } from "../../services/friends/FriendsService.js";
import { campusLocationService } from "../../services/location/CampusLocationService.js";

export class FriendOptionsMenu {
  constructor(friend, options = {}) {
    this.friend = friend;
    this.options = {
      showUnfriend: options.showUnfriend !== false, // Default to true
      showPrivacyToggle: false, // Removed: schedule privacy toggle now handled by calendar icon
      showLocationToggle: false, // Removed: location toggle handled by action button
      ...options,
    };

    this.isDropdownOpen = false;
    this.element = null;
    this.currentPrivacyStatus = null; // Cache privacy status
    this.currentLocationStatus = null; // Cache location sharing status

    // Bind methods to preserve context
    this.handleButtonClick = this.handleButtonClick.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleWindowResize = this.handleWindowResize.bind(this);

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

    // Skip schedule privacy fetch (handled by card icon). Only fetch if needed in future.

    // Get location sharing status if location toggle is enabled
    // Removed: location status fetch; action button and snapshots drive UI

    // Determine current privacy state (user's own schedule visibility)
    const currentUserUid = currentUser.state?.user?.uid;
    // Removed privacy toggle from 3-dots menu; handled by mutual schedule icon

    // Determine current location sharing state (user's own location visibility)
    const myLocationVisible =
      this.currentLocationStatus?.userLocationVisible ?? false;

    // Clear labeling for bilateral location sharing
    const locationText = myLocationVisible ? "Hide location" : "Share location";
    const locationIcon = myLocationVisible
      ? "fa-location-arrow"
      : "fa-location-dot";
    const locationClass = myLocationVisible
      ? "hide-my-location"
      : "share-my-location";

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
           aria-label="Friend options menu">
        <ul role="none">
          
          
          
          
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
   * 🌍 Update location sharing status from bilateral privacy service
   */
  // Removed: updateLocationStatus (location handled by friend card action button)

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
    // Removed: privacy toggle option handled by mutual icon in card actions
    const unfriendOption = this.element.querySelector(".unfriend-option");

    

    // Removed: location toggle option (handled by mutual-location button)

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

    // Handle window resize and scroll to reposition dropdown
    window.addEventListener("resize", this.handleWindowResize);
    window.addEventListener("scroll", this.handleWindowResize);

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
   * 📂 Open the dropdown menu with smart positioning
   */
  openDropdown() {
    if (!this.element) return;

    // Close any other open dropdowns first
    this.closeAllDropdowns();

    const button = this.element.querySelector(".options-button");
    const dropdown = this.element.querySelector(".options-dropdown");

    // Calculate positioning relative to button
    const buttonRect = button.getBoundingClientRect();

    // Position dropdown below and slightly to the left of the button
    const top = buttonRect.bottom + 8;
    const left = buttonRect.right - 160; // Align dropdown to right edge of button (dropdown is ~150px wide)

    // Ensure dropdown stays within viewport
    const viewportWidth = window.innerWidth;
    const adjustedLeft = Math.max(10, Math.min(left, viewportWidth - 170));

    // Position dropdown near the button
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${adjustedLeft}px`;
    dropdown.style.transform = "none"; // Override any transform that might affect positioning

    // Move dropdown to body to avoid parent positioning issues
    document.body.appendChild(dropdown);

    // Add the show class for animation
    this.element.classList.add("show");

    // Add CSS classes for proper styling via existing CSS
    dropdown.classList.add("glassmorphism-dropdown-active");

    // Ensure proper visibility and positioning
    dropdown.style.opacity = "1";
    dropdown.style.visibility = "visible";
    dropdown.style.display = "block";
    dropdown.style.zIndex = "9999";
    dropdown.style.position = "fixed";
    dropdown.style.transform = "none";

    // Update ARIA and state
    button.setAttribute("aria-expanded", "true");
    this.isDropdownOpen = true;

    // Add slight delay for smooth animation, then focus first menu item
    setTimeout(() => {
      const firstMenuItem = dropdown.querySelector(".menu-option");
      if (firstMenuItem) {
        firstMenuItem.focus();
      }
    }, 150);

    console.log(
      `📂 Friend options dropdown opened for ${this.friend.displayName} at (${adjustedLeft}, ${top})`
    );
  }

  /**
   * 📁 Close the dropdown menu
   */
  closeDropdown() {
    if (!this.element) return;

    const button = this.element.querySelector(".options-button");
    let dropdown = this.element.querySelector(".options-dropdown");

    // Check if dropdown was moved to body
    if (!dropdown) {
      dropdown = document.body.querySelector(".glassmorphism-dropdown-active");
    }

    // Remove show class to trigger close animation
    this.element.classList.remove("show");

    // Clean up dropdown styling and move back to original parent
    if (dropdown && dropdown.parentElement === document.body) {
      dropdown.classList.remove("glassmorphism-dropdown-active");
      this.element.appendChild(dropdown);
    }

    button.setAttribute("aria-expanded", "false");
    this.isDropdownOpen = false;

    console.log("📁 Friend options dropdown closed");
  }

  /**
   * 🌍 Handle location toggle (bilateral - user controls their own location visibility)
   */
  // Removed: handleLocationToggle (handled by mutual-location button)

  /**
   * 🔒 Handle privacy toggle (bilateral - user controls their own schedule visibility)
   */
  // Removed: handlePrivacyToggle (moved to mutual-schedule button in FriendsPage)

  /**
   * 🌍 Update location UI elements (bilateral location sharing system)
   * @param {boolean} myLocationVisible - Whether current user's location is visible to friend
   */
  // Removed: updateLocationUI (menu no longer controls location)

  /**
   * 🎨 Update privacy UI elements (bilateral privacy system)
   * @param {boolean} myScheduleVisible - Whether current user's schedule is visible to friend
   */
  // Removed: updatePrivacyUI (no privacy option in menu)

  /**
   * 🌍 Update location status in friend card without triggering re-render
   * @param {boolean} myLocationVisible - Whether current user's location is visible to friend
   */
  updateFriendCardLocationStatus(myLocationVisible) {
    // Guard clause: Check if element still exists (menu might have been destroyed during re-render)
    if (!this.element || !this.element.parentNode) {
      console.log(
        "🔄 FriendOptionsMenu element destroyed, skipping location status update"
      );
      return;
    }

    // Find the friend card that contains this menu
    const friendCard = this.element.closest(".friend-card");
    if (!friendCard) return;

    // Find the location status element in the friend card
    const locationStatus = friendCard.querySelector(
      ".location-sharing.bilateral-location"
    );
    if (!locationStatus) return;

    const icon = locationStatus.querySelector("i");
    const span = locationStatus.querySelector("span");

    if (icon && span) {
      // Update icon class
      icon.className = myLocationVisible
        ? "fas fa-location-arrow"
        : "fas fa-location-dot";

      // Update text content
      span.textContent = myLocationVisible
        ? "Location sharing enabled"
        : "Location sharing disabled";

      // Update CSS classes for styling
      locationStatus.classList.remove(
        "my-location-visible",
        "my-location-hidden"
      );
      locationStatus.classList.add(
        myLocationVisible ? "my-location-visible" : "my-location-hidden"
      );

      // Update tooltip
      const tooltipText = myLocationVisible
        ? "Your location: Your location is shared with this friend\nFriend's location: Friend's location is shared with you"
        : "Your location: Your location is not shared with this friend\nFriend's location: Friend's location is shared with you";
      locationStatus.title = tooltipText;
    }
  }

  /**
   * 🎯 Update privacy status in friend card without triggering re-render
   * @param {boolean} myScheduleVisible - Whether current user's schedule is visible to friend
   */
  // Removed: updateFriendCardPrivacyStatus (legacy one-way indicator)

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
   * 📏 Handle window resize/scroll to reposition dropdown
   */
  handleWindowResize() {
    if (this.isDropdownOpen && this.element) {
      // Close dropdown on window resize/scroll to avoid positioning issues
      this.closeDropdown();
    }
  }

  /**
   * 🔄 Update friend data and refresh privacy status
   * @param {Object} newFriendData - Updated friend information
   */
  async updateFriend(newFriendData) {
    this.friend = { ...this.friend, ...newFriendData };

    // Removed: schedule privacy UI is handled by friend card action icon

    // Removed: location toggle controlled via friend card action icon

    console.log(
      `🔄 Friend data updated for ${this.friend.displayName} with bilateral privacy and location sharing`
    );
  }

  /**
   * 🔗 Generate friendship ID from two user IDs
   * @param {string} uid1 - First user ID
   * @param {string} uid2 - Second user ID
   * @returns {string} Canonical friendship ID
   */
  generateFriendshipId(uid1, uid2) {
    if (!uid1 || !uid2 || uid1 === uid2) {
      console.error("❌ Cannot generate friendship ID with invalid user IDs:", {
        uid1,
        uid2,
      });
      return null;
    }
    return [uid1, uid2].sort().join("_");
  }

  /**
   * 🌍 Close all open dropdowns (utility method)
   */
  closeAllDropdowns() {
    const allMenus = document.querySelectorAll(".friend-options-menu");
    allMenus.forEach((menu) => {
      const button = menu.querySelector(".options-button");

      if (menu.classList.contains("show")) {
        // Remove show class to trigger close animation
        menu.classList.remove("show");

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

    // Remove document/window event listeners
    document.removeEventListener("click", this.handleOutsideClick);
    window.removeEventListener("resize", this.handleWindowResize);
    window.removeEventListener("scroll", this.handleWindowResize);

    // 🛡️ LEAK PREVENTION: Remove all event listeners by cloning element
    // This removes ALL event listeners including anonymous ones
    if (this.element.parentNode) {
      const cleanElement = this.element.cloneNode(true);
      this.element.parentNode.replaceChild(cleanElement, this.element);
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
