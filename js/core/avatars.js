/**
 * =============================================================================
 *                           CAMPXUS AVATAR MANAGER
 *                      DiceBear Avatar System Integration
 * =============================================================================
 *
 * 📋 This module handles avatar generation and customization using DiceBear API
 *
 * Features:
 * ├── Multiple avatar styles (miniavs, adventurer, pixel-art, etc.)
 * ├── Customization options for each style
 * ├── Modal-based avatar editor
 * ├── Avatar URL generation
 * ├── Preview functionality
 * └── Firestore integration ready
 *
 * Uses DiceBear API: https://api.dicebear.com/7.x/
 *
 * =============================================================================
 */

class AvatarManager {
  constructor() {
    // Available avatar styles with their display names and customization options
    this.avatarStyles = {
      miniavs: {
        name: "Mini Avatars",
        description: "Cute minimalist avatars",
        options: {
          mood: ["happy", "sad", "surprised"],
          backgroundColor: ["b6e3f4", "c0aede", "ffd93d", "ffdfbf", "d1d4f9"],
        },
      },
      adventurer: {
        name: "Adventurer",
        description: "Heroic adventure characters",
        options: {
          eyes: [
            "variant01",
            "variant02",
            "variant03",
            "variant04",
            "variant05",
          ],
          eyebrows: ["variant01", "variant02", "variant03", "variant04"],
          mouth: [
            "variant01",
            "variant02",
            "variant03",
            "variant04",
            "variant05",
          ],
          backgroundColor: ["b6e3f4", "c0aede", "ffd93d", "ffdfbf", "d1d4f9"],
        },
      },
      "pixel-art": {
        name: "Pixel Art",
        description: "Retro 8-bit style avatars",
        options: {
          eyes: ["variant01", "variant02", "variant03", "variant04"],
          mouth: ["happy", "sad", "surprised", "smile"],
          backgroundColor: ["b6e3f4", "c0aede", "ffd93d", "ffdfbf", "d1d4f9"],
        },
      },
      lorelei: {
        name: "Lorelei",
        description: "Elegant portrait style",
        options: {
          backgroundColor: ["b6e3f4", "c0aede", "ffd93d", "ffdfbf", "d1d4f9"],
        },
      },
      thumbs: {
        name: "Thumbs",
        description: "Simple thumbs up avatars",
        options: {
          backgroundColor: ["b6e3f4", "c0aede", "ffd93d", "ffdfbf", "d1d4f9"],
        },
      },
    };

    // Default avatar configuration
    this.defaultAvatarConfig = {
      style: "miniavs",
      seed: "default",
      options: {},
    };

    // Modal elements (will be set when modal is opened)
    this.modal = null;
    this.currentConfig = null;
    this.onSaveCallback = null;
  }

  /**
   * Generate avatar URL based on configuration
   * @param {Object} config - Avatar configuration
   * @param {string} config.style - Avatar style (e.g., 'miniavs', 'adventurer')
   * @param {string} config.seed - Unique seed for avatar generation
   * @param {Object} config.options - Style-specific options
   * @returns {string} Complete DiceBear API URL
   */
  generateAvatarUrl(config) {
    const { style, seed, options = {} } = config;

    // Base DiceBear API URL
    const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`;

    // Build query parameters
    const params = new URLSearchParams();
    params.append("seed", seed);

    // Add style-specific options
    Object.entries(options).forEach(([key, value]) => {
      if (value) {
        params.append(key, value);
      }
    });

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Generate default avatar for a user
   * @param {string} userId - Unique user identifier
   * @returns {Object} Default avatar configuration
   */
  generateDefaultAvatar(userId) {
    return {
      style: "miniavs",
      seed: userId,
      options: {
        mood: "happy",
        backgroundColor: "b6e3f4",
      },
    };
  }

  /**
   * Open the avatar editor modal
   * @param {Object} currentAvatar - Current avatar configuration
   * @param {Function} onSave - Callback function when avatar is saved
   */
  openAvatarEditor(currentAvatar = null, onSave = null) {
    console.log("🎨 Opening avatar editor...");

    // Set current configuration or use default
    this.currentConfig = currentAvatar || this.generateDefaultAvatar("preview");
    this.onSaveCallback = onSave;

    // Create and show the custom modal
    this.createAndShowModal();
  }

  /**
   * Create and display the custom avatar editor modal
   */
  createAndShowModal() {
    // Remove any existing modal
    this.removeExistingModal();

    // Create modal HTML
    const modalHTML = this.createModalHTML();

    // Inject modal into DOM
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Initialize the editor
    setTimeout(() => {
      this.initializeAvatarEditor();
      this.setupModalEventListeners();
      this.showModal();
    }, 10);
  }

  /**
   * Create the complete modal HTML structure
   * @returns {string} Complete modal HTML
   */
  createModalHTML() {
    return `
      <div id="avatar-editor-modal" class="avatar-modal-overlay">
        <div class="avatar-modal-content">
          <div class="avatar-modal-header">
            <h2 class="avatar-modal-title">🎨 Choose Your Avatar</h2>
            <button class="avatar-modal-close-btn" aria-label="Close modal">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="avatar-modal-body">
            ${this.createAvatarEditorHTML()}
          </div>
          
          <div class="avatar-modal-footer">
            <button class="avatar-modal-button cancel">Cancel</button>
            <button class="avatar-modal-button confirm">Save Avatar</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Remove any existing modal from the DOM
   */
  removeExistingModal() {
    const existingModal = document.getElementById("avatar-editor-modal");
    if (existingModal) {
      existingModal.remove();
    }
  }

  /**
   * Show the modal with animation
   */
  showModal() {
    const modal = document.getElementById("avatar-editor-modal");
    if (modal) {
      modal.classList.add("active");
    }
  }

  /**
   * Hide the modal with animation
   */
  hideModal() {
    const modal = document.getElementById("avatar-editor-modal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => {
        modal.remove();
      }, 300);
    }
  }

  /**
   * Set up modal-specific event listeners
   */
  setupModalEventListeners() {
    const modal = document.getElementById("avatar-editor-modal");
    if (!modal) return;

    // Close button
    const closeBtn = modal.querySelector(".avatar-modal-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.hideModal());
    }

    // Cancel button
    const cancelBtn = modal.querySelector(".avatar-modal-button.cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.hideModal());
    }

    // Save button
    const saveBtn = modal.querySelector(".avatar-modal-button.confirm");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        this.handleSaveAvatar();
        this.hideModal();
      });
    }

    // Close on overlay click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.hideModal();
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideModal();
      }
    });
  }

  /**
   * Create the HTML structure for the avatar editor
   * @returns {string} HTML string for the avatar editor
   */
  createAvatarEditorHTML() {
    return `
      <div class="avatar-editor-container">
        <div class="avatar-editor-content">
          <!-- Avatar Preview Section -->
          <div class="avatar-preview-section">
            <div class="avatar-preview-container">
              <img id="avatar-preview" class="avatar-preview-image" src="" alt="Avatar Preview" />
            </div>
            <p class="avatar-preview-label">Your Avatar Preview</p>
          </div>
          
          <!-- Avatar Controls Section -->
          <div class="avatar-controls-section">
            <div class="control-group">
              <label for="avatar-style-select" class="control-label">
                <i class="fas fa-palette"></i> Avatar Style
              </label>
              <select id="avatar-style-select" class="control-select">
                ${this.generateStyleOptions()}
              </select>
              <p id="style-description" class="style-description"></p>
            </div>
            
            <hr class="control-divider">
            
            <div id="avatar-options-container" class="avatar-options-container">
              <!-- Dynamic customization options will be inserted here -->
            </div>
            
            <div class="randomize-section">
              <button id="randomize-avatar" class="button secondary randomize-btn">
                <i class="fas fa-dice"></i> Randomize
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate HTML options for style selection
   * @returns {string} HTML option elements
   */
  generateStyleOptions() {
    return Object.entries(this.avatarStyles)
      .map(([key, style]) => `<option value="${key}">${style.name}</option>`)
      .join("");
  }

  /**
   * Initialize the avatar editor after modal is shown
   */
  initializeAvatarEditor() {
    console.log("🎯 Initializing avatar editor...");

    // Set up initial preview
    this.updateAvatarPreview();

    // Set initial style selection
    const styleSelect = document.getElementById("avatar-style-select");
    if (styleSelect) {
      styleSelect.value = this.currentConfig.style;
      this.updateStyleDescription();
      this.populateStyleOptions(this.currentConfig.style);
    }

    // Set up event listeners
    this.setupAvatarEditorEventListeners();

    console.log("✅ Avatar editor initialized");
  }

  /**
   * Set up event listeners for the avatar editor
   */
  setupAvatarEditorEventListeners() {
    // Style selection change
    const styleSelect = document.getElementById("avatar-style-select");
    if (styleSelect) {
      styleSelect.addEventListener("change", (e) => {
        console.log("🎨 Style changed to:", e.target.value);
        this.currentConfig.style = e.target.value;
        this.currentConfig.options = {}; // Reset options when style changes
        this.updateStyleDescription();
        this.populateStyleOptions(e.target.value);
        this.updateAvatarPreview();
      });
    }

    // Randomize button
    const randomizeBtn = document.getElementById("randomize-avatar");
    if (randomizeBtn) {
      randomizeBtn.addEventListener("click", () => {
        console.log("🎲 Randomizing avatar...");
        this.randomizeAvatar();
      });
    }
  }

  /**
   * Update the style description text
   */
  updateStyleDescription() {
    const descElement = document.getElementById("style-description");
    const styleInfo = this.avatarStyles[this.currentConfig.style];
    if (descElement && styleInfo) {
      descElement.textContent = styleInfo.description;
    }
  }

  /**
   * Populate customization options for the selected style
   * @param {string} style - Selected avatar style
   */
  populateStyleOptions(style) {
    const container = document.getElementById("avatar-options-container");
    if (!container) return;

    const styleInfo = this.avatarStyles[style];
    if (!styleInfo || !styleInfo.options) {
      container.innerHTML =
        '<p class="no-options">No customization options available for this style.</p>';
      return;
    }

    // Generate HTML for each option
    const optionsHTML = Object.entries(styleInfo.options)
      .map(([optionKey, optionValues]) => {
        const currentValue = this.currentConfig.options[optionKey] || "";

        return `
          <div class="option-group">
            <label for="option-${optionKey}" class="option-label">
              ${this.formatOptionName(optionKey)}
            </label>
            <select id="option-${optionKey}" class="option-select" data-option="${optionKey}">
              <option value="">Default</option>
              ${optionValues
                .map(
                  (value) =>
                    `<option value="${value}" ${
                      value === currentValue ? "selected" : ""
                    }>${this.formatOptionValue(value)}</option>`
                )
                .join("")}
            </select>
          </div>
        `;
      })
      .join("");

    container.innerHTML = optionsHTML;

    // Add event listeners to option selects
    container.querySelectorAll(".option-select").forEach((select) => {
      select.addEventListener("change", (e) => {
        const optionKey = e.target.dataset.option;
        const value = e.target.value;

        console.log(`🎛️ Option ${optionKey} changed to:`, value);

        if (value) {
          this.currentConfig.options[optionKey] = value;
        } else {
          delete this.currentConfig.options[optionKey];
        }

        this.updateAvatarPreview();
      });
    });
  }

  /**
   * Format option names for display
   * @param {string} optionName - Raw option name
   * @returns {string} Formatted display name
   */
  formatOptionName(optionName) {
    return optionName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .replace("Background Color", "Background");
  }

  /**
   * Format option values for display
   * @param {string} value - Raw option value
   * @returns {string} Formatted display value
   */
  formatOptionValue(value) {
    if (value.startsWith("#") || /^[0-9a-fA-F]{6}$/.test(value)) {
      return `Color ${value}`;
    }
    return value
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/variant0?(\d+)/i, "Style $1");
  }

  /**
   * Update the avatar preview image
   */
  updateAvatarPreview() {
    const previewImg = document.getElementById("avatar-preview");
    if (previewImg) {
      const avatarUrl = this.generateAvatarUrl(this.currentConfig);
      previewImg.src = avatarUrl;
      console.log("🖼️ Avatar preview updated:", avatarUrl);
    }
  }

  /**
   * Randomize the current avatar configuration
   */
  randomizeAvatar() {
    const styleInfo = this.avatarStyles[this.currentConfig.style];
    if (!styleInfo || !styleInfo.options) return;

    // Generate random seed
    this.currentConfig.seed = Math.random().toString(36).substring(2, 15);

    // Randomize each option
    Object.entries(styleInfo.options).forEach(([optionKey, optionValues]) => {
      if (optionValues.length > 0) {
        const randomIndex = Math.floor(Math.random() * optionValues.length);
        this.currentConfig.options[optionKey] = optionValues[randomIndex];
      }
    });

    // Update the UI to reflect the changes
    this.populateStyleOptions(this.currentConfig.style);
    this.updateAvatarPreview();

    console.log("🎲 Avatar randomized:", this.currentConfig);
  }

  /**
   * Handle saving the avatar configuration
   */
  handleSaveAvatar() {
    console.log("💾 Saving avatar configuration:", this.currentConfig);

    if (this.onSaveCallback && typeof this.onSaveCallback === "function") {
      this.onSaveCallback(this.currentConfig);
    }

    return true; // Allow modal to close
  }

  /**
   * Get avatar URL for display in the application
   * @param {Object} userAvatarConfig - User's saved avatar configuration
   * @param {string} fallbackUserId - Fallback user ID if no config available
   * @returns {string} Avatar URL
   */
  getAvatarUrl(userAvatarConfig, fallbackUserId = "default") {
    if (userAvatarConfig && userAvatarConfig.style) {
      return this.generateAvatarUrl(userAvatarConfig);
    }

    // Fallback to default avatar
    const defaultConfig = this.generateDefaultAvatar(fallbackUserId);
    return this.generateAvatarUrl(defaultConfig);
  }

  /**
   * Validate avatar configuration
   * @param {Object} config - Avatar configuration to validate
   * @returns {boolean} True if valid
   */
  isValidAvatarConfig(config) {
    if (!config || typeof config !== "object") return false;
    if (!config.style || !this.avatarStyles[config.style]) return false;
    if (!config.seed || typeof config.seed !== "string") return false;
    return true;
  }
}

// =============================================================================
//                           GLOBAL INITIALIZATION
// =============================================================================

// Create global instance
window.avatarManager = new AvatarManager();
console.log("🎨 Avatar Manager loaded globally and available at window.avatarManager");

// Export for ES6 modules
export default AvatarManager;
