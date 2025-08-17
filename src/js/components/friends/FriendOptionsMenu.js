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
      showLocationToggle: options.enableLocationSharing === true, // Default to false unless explicitly enabled
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

    // Get bilateral privacy status
    await this.updatePrivacyStatus();

    // Get location sharing status if location toggle is enabled
    if (this.options.showLocationToggle) {
      await this.updateLocationStatus();
    }

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

    // Determine current location sharing state (user's own location visibility)
    const myLocationVisible =
      this.currentLocationStatus?.userLocationVisible ?? false;

    // Clear labeling for bilateral location sharing
    const locationText = myLocationVisible
      ? "Hide location"
      : "Share location";
    const locationIcon = myLocationVisible ? "fa-location-arrow" : "fa-location-dot";
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
          
          ${this.options.showLocationToggle
              ? `
            <li role="menuitem" class="menu-option location-toggle-option ${locationClass}"
                title="${
                  myLocationVisible
                    ? "Hide your location from this friend"
                    : "Share your location with this friend"
                }">
              <i class="fas ${locationIcon}" aria-hidden="true"></i>
              <span>${locationText}</span>
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
   * 🌍 Update location sharing status from bilateral privacy service
   */
  async updateLocationStatus() {
    try {
      const currentUserUid = currentUser.state?.user?.uid;
      if (!currentUserUid) {
        console.warn("No current user found for location status update");
        return;
      }

      this.currentLocationStatus =
        await friendshipPrivacyService.getLocationVisibilityStatus(
          currentUserUid,
          this.friend.id
        );

      console.log(
        `🌍 Location status updated for ${this.friend.displayName}:`,
        this.currentLocationStatus
      );
    } catch (error) {
      console.warn(
        `⚠️ Could not fetch location status for ${this.friend.displayName}:`,
        error.message
      );
      // Fallback to default location state
      this.currentLocationStatus = {
        userLocationVisible: false,
        friendLocationVisible: false,
        mutualSharingEnabled: false,
        location: {
          userToFriend: { visible: false, status: "hidden" },
          friendToUser: { visible: false, status: "hidden" },
        },
      };
      console.log(
        `🌍 Using default location status for ${this.friend.displayName}`
      );
    }
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
    const locationOption = this.element.querySelector(".location-toggle-option");
    const unfriendOption = this.element.querySelector(".unfriend-option");

    if (privacyOption) {
      privacyOption.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handlePrivacyToggle();
        this.closeDropdown();
      });
    }

    if (locationOption) {
      locationOption.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleLocationToggle();
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
  async handleLocationToggle() {
    const currentUserUid = currentUser.state?.user?.uid;
    if (!currentUserUid) {
      console.error("No current user found for location toggle");
      return;
    }

    const currentlyVisible =
      this.currentLocationStatus?.userLocationVisible ?? false;
    const newVisibility = !currentlyVisible;

    console.log(
      `🌍 Bilateral location toggle for ${this.friend.displayName}: ${currentlyVisible} → ${newVisibility}`
    );

    // Set flag to prevent friends list re-render during location update
    if (window.friendsPage) {
      window.friendsPage.isUpdatingLocation = true;
    }

    // Batch DOM updates to prevent flickering
    requestAnimationFrame(() => {
      this.updateLocationUI(newVisibility);
    });

    // Update database and create notifications if enabling location sharing
    let success = false;
    
    if (newVisibility) {
      // Use requestLocationSharing to enable location sharing WITH notifications
      const result = await friendsManager.requestLocationSharing(
        this.friend.id,
        this.friend.friendshipId || this.generateFriendshipId(currentUserUid, this.friend.id)
      );
      success = result.success;
      
      if (result.success) {
        console.log(`📍 Location sharing request sent to ${this.friend.displayName} with notification`);
      }
    } else {
      // Use bilateral privacy service to disable location sharing (no notification needed)
      success = await friendshipPrivacyService.updateLocationVisibility(
        currentUserUid, // User updating their own visibility
        this.friend.id, // To this friend
        newVisibility
      );
    }

    if (success) {
      // Update local location status
      if (this.currentLocationStatus) {
        this.currentLocationStatus.userLocationVisible = newVisibility;
        if (this.currentLocationStatus.location?.userToFriend) {
          this.currentLocationStatus.location.userToFriend.visible = newVisibility;
          this.currentLocationStatus.location.userToFriend.status = newVisibility
            ? "visible"
            : "hidden";
        }
      }

      // Update the location status in the friend card directly without triggering re-render
      this.updateFriendCardLocationStatus(newVisibility);

      console.log(
        `✅ Bilateral location sharing updated for ${this.friend.displayName}`
      );
    } else {
      // Revert UI on failure with animation frame
      requestAnimationFrame(() => {
        this.updateLocationUI(currentlyVisible);
        this.updateFriendCardLocationStatus(currentlyVisible);
      });
      console.error(
        `❌ Failed to update bilateral location sharing for ${this.friend.displayName}`
      );
    }

    // Clear the location update flag after a short delay
    setTimeout(() => {
      if (window.friendsPage) {
        window.friendsPage.isUpdatingLocation = false;
      }
    }, 1000); // 1 second delay to allow database changes to propagate
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

    // Set flag to prevent friends list re-render during privacy update
    if (window.friendsPage) {
      window.friendsPage.isUpdatingPrivacy = true;
    }

    // Batch DOM updates to prevent flickering
    requestAnimationFrame(() => {
      this.updatePrivacyUI(newVisibility);
    });

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

      // Update the privacy status in the friend card directly without triggering re-render
      this.updateFriendCardPrivacyStatus(newVisibility);

      console.log(
        `✅ Bilateral privacy updated for ${this.friend.displayName}`
      );
    } else {
      // Revert UI on failure with animation frame
      requestAnimationFrame(() => {
        this.updatePrivacyUI(currentlyVisible);
        this.updateFriendCardPrivacyStatus(currentlyVisible);
      });
      console.error(
        `❌ Failed to update bilateral privacy for ${this.friend.displayName}`
      );
    }

    // Clear the privacy update flag after a short delay
    setTimeout(() => {
      if (window.friendsPage) {
        window.friendsPage.isUpdatingPrivacy = false;
      }
    }, 1000); // 1 second delay to allow database changes to propagate
  }

  /**
   * 🌍 Update location UI elements (bilateral location sharing system)
   * @param {boolean} myLocationVisible - Whether current user's location is visible to friend
   */
  async updateLocationUI(myLocationVisible = null) {
    if (!this.element) return;

    // If no visibility provided, get current status
    if (myLocationVisible === null) {
      await this.updateLocationStatus();
      myLocationVisible =
        this.currentLocationStatus?.userLocationVisible ?? false;
    }

    const locationOption = this.element.querySelector(".location-toggle-option");
    const icon = locationOption?.querySelector("i");
    const text = locationOption?.querySelector("span");

    if (locationOption && icon && text) {
      // Use CSS transitions to prevent flickering - batch all updates
      const updates = () => {
        // Update icon class
        const newIconClass = myLocationVisible
          ? "fas fa-location-arrow"
          : "fas fa-location-dot";
        if (icon.className !== newIconClass) {
          icon.className = newIconClass;
        }

        // Update text content
        const newText = myLocationVisible
          ? "Hide location"
          : "Share location";
        if (text.textContent !== newText) {
          text.textContent = newText;
        }

        // Update class for styling
        const newClassName = `menu-option location-toggle-option ${
          myLocationVisible ? "hide-my-location" : "share-my-location"
        }`;
        if (locationOption.className !== newClassName) {
          locationOption.className = newClassName;
        }

        // Update tooltip
        const newTitle = myLocationVisible
          ? "Hide your location from this friend"
          : "Share your location with this friend";
        if (locationOption.title !== newTitle) {
          locationOption.title = newTitle;
        }
      };

      // Apply all updates in a single animation frame to prevent layout thrashing
      updates();
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
      // Use CSS transitions to prevent flickering - batch all updates
      const updates = () => {
        // Update icon class
        const newIconClass = myScheduleVisible
          ? "fas fa-eye-slash"
          : "fas fa-eye";
        if (icon.className !== newIconClass) {
          icon.className = newIconClass;
        }

        // Update text content
        const newText = myScheduleVisible
          ? "Hide My Schedule"
          : "Show My Schedule";
        if (text.textContent !== newText) {
          text.textContent = newText;
        }

        // Update class for styling
        const newClassName = `menu-option privacy-toggle-option ${
          myScheduleVisible ? "hide-my-schedule" : "show-my-schedule"
        }`;
        if (privacyOption.className !== newClassName) {
          privacyOption.className = newClassName;
        }

        // Update tooltip
        const newTitle = myScheduleVisible
          ? "Hide your schedule from this friend"
          : "Show your schedule to this friend";
        if (privacyOption.title !== newTitle) {
          privacyOption.title = newTitle;
        }
      };

      // Apply all updates in a single animation frame to prevent layout thrashing
      updates();
    }
  }

  /**
   * 🌍 Update location status in friend card without triggering re-render
   * @param {boolean} myLocationVisible - Whether current user's location is visible to friend
   */
  updateFriendCardLocationStatus(myLocationVisible) {
    // Guard clause: Check if element still exists (menu might have been destroyed during re-render)
    if (!this.element || !this.element.parentNode) {
      console.log("🔄 FriendOptionsMenu element destroyed, skipping location status update");
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
      icon.className = myLocationVisible ? "fas fa-location-arrow" : "fas fa-location-dot";

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
  updateFriendCardPrivacyStatus(myScheduleVisible) {
    // Guard clause: Check if element still exists (menu might have been destroyed during re-render)
    if (!this.element || !this.element.parentNode) {
      console.log("🔄 FriendOptionsMenu element destroyed, skipping privacy status update");
      return;
    }

    // Find the friend card that contains this menu
    const friendCard = this.element.closest(".friend-card");
    if (!friendCard) return;

    // Find the privacy status element in the friend card
    const privacyStatus = friendCard.querySelector(
      ".schedule-access.bilateral-privacy"
    );
    if (!privacyStatus) return;

    const icon = privacyStatus.querySelector("i");
    const span = privacyStatus.querySelector("span");

    if (icon && span) {
      // Update icon class
      icon.className = myScheduleVisible ? "fas fa-eye" : "fas fa-eye-slash";

      // Update text content
      span.textContent = myScheduleVisible
        ? "Your schedule is visible"
        : "Your schedule is hidden";

      // Update CSS classes for styling
      privacyStatus.classList.remove(
        "my-schedule-visible",
        "my-schedule-hidden"
      );
      privacyStatus.classList.add(
        myScheduleVisible ? "my-schedule-visible" : "my-schedule-hidden"
      );

      // Update tooltip
      const tooltipText = myScheduleVisible
        ? "Your schedule: Your schedule is visible to this friend\nFriend's schedule: Friend's schedule is visible to you"
        : "Your schedule: Your schedule is hidden from this friend\nFriend's schedule: Friend's schedule is visible to you";
      privacyStatus.title = tooltipText;
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

    // Update privacy status and UI with bilateral privacy
    await this.updatePrivacyStatus();
    this.updatePrivacyUI();

    // Update location status and UI if location toggle is enabled
    if (this.options.showLocationToggle) {
      await this.updateLocationStatus();
      this.updateLocationUI();
    }

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
      console.error("❌ Cannot generate friendship ID with invalid user IDs:", { uid1, uid2 });
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
