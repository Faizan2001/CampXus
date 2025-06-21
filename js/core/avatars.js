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
 * ├── Customization options for each style with color swatch support
 * ├── Modal-based avatar editor
 * ├── Avatar URL generation
 * ├── Preview functionality
 * └── Firestore integration ready
 *
 * Uses DiceBear API: https://api.dicebear.com/8.x/
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

    this.currentConfig = null;
    this.onSaveCallback = null;
    // Bind the keydown handler once to `this` to manage its removal
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Generate avatar URL based on configuration
   * @param {Object} config - Avatar configuration
   * @returns {string} Complete DiceBear API URL
   */
  generateAvatarUrl(config) {
    if (!config || !config.style || !config.seed) {
      console.warn(
        "⚠️ Invalid config passed to generateAvatarUrl, using fallback."
      );
      config = this.generateDefaultAvatar("fallback-user");
    }
    const { style, seed, options = {} } = config;
    // NOTE: Using latest DiceBear version 8.x
    const baseUrl = `https://api.dicebear.com/8.x/${style}/svg`;
    const params = new URLSearchParams({ seed });
    Object.entries(options).forEach(([key, value]) => {
      if (value) params.append(key, value);
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
    // BUG FIX: Deep copy the current config to avoid modifying the original state until 'Save' is clicked.
    this.currentConfig = JSON.parse(
      JSON.stringify(currentAvatar || this.generateDefaultAvatar("preview"))
    );
    this.onSaveCallback = onSave;
    this.createAndShowModal();
  }

  createAndShowModal() {
    this.removeExistingModal();
    const modalHTML = this.createModalHTML();
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    // Use a short delay to ensure the DOM is ready for JS manipulation
    setTimeout(() => {
      this.initializeAvatarEditor();
      this.setupModalEventListeners();
      this.showModal();
    }, 10);
  }

  createModalHTML() {
    return `
      <div id="avatar-editor-modal" class="avatar-modal-overlay">
        <div class="avatar-modal-content">
          <div class="avatar-modal-header">
            <h2 class="avatar-modal-title">Choose Your Avatar</h2>
            <button class="avatar-modal-close-btn" aria-label="Close modal"><i class="fas fa-times"></i></button>
          </div>
          <div class="avatar-modal-body">${this.createAvatarEditorHTML()}</div>
          <div class="avatar-modal-footer">
            <button class="avatar-modal-button cancel">Cancel</button>
            <button class="avatar-modal-button confirm">Save Avatar</button>
          </div>
        </div>
      </div>
    `;
  }

  removeExistingModal() {
    const existingModal = document.getElementById("avatar-editor-modal");
    if (existingModal) existingModal.remove();
  }

  showModal() {
    const modal = document.getElementById("avatar-editor-modal");
    if (modal) modal.classList.add("active");
  }

  hideModal() {
    document.removeEventListener("keydown", this.handleKeyDown);
    const modal = document.getElementById("avatar-editor-modal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => modal.remove(), 300);
    }
  }

  handleKeyDown(e) {
    if (e.key === "Escape") {
      this.hideModal();
    }
  }

  setupModalEventListeners() {
    const modal = document.getElementById("avatar-editor-modal");
    if (!modal) return;
    modal
      .querySelector(".avatar-modal-close-btn")
      .addEventListener("click", () => this.hideModal());
    modal
      .querySelector(".avatar-modal-button.cancel")
      .addEventListener("click", () => this.hideModal());
    modal
      .querySelector(".avatar-modal-button.confirm")
      .addEventListener("click", () => {
        this.handleSaveAvatar();
        this.hideModal();
      });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.hideModal();
    });
    document.addEventListener("keydown", this.handleKeyDown);
  }

  createAvatarEditorHTML() {
    return `
      <div class="avatar-editor-container">
        <div class="avatar-editor-content">
          <!-- 🎨 Fixed Preview Section (stays visible on mobile) -->
          <div class="avatar-preview-section">
            <div class="avatar-preview-container">
              <img id="avatar-preview" class="avatar-preview-image" src="" alt="Avatar Preview" />
            </div>
            <p class="avatar-preview-label">Your Avatar Preview</p>
            
            <!-- 🎲 Move randomize button to preview section for better mobile access -->
            <div class="preview-controls">
              <button id="randomize-avatar" class="button secondary randomize-btn">
                <i class="fas fa-dice"></i> Randomize
              </button>
            </div>
          </div>
          
          <!-- 🎛️ Scrollable Controls Section -->
          <div class="avatar-controls-section">
            <div class="controls-content">
              <div class="control-group">
                <label for="avatar-style-select" class="control-label">
                  <i class="fas fa-palette"></i> Avatar Style
                </label>
                <select id="avatar-style-select" class="control-select">${this.generateStyleOptions()}</select>
                <p id="style-description" class="style-description"></p>
              </div>
              
              <hr class="control-divider">
              
              <!-- 📱 Compact options container with better mobile layout -->
              <div class="customization-header">
                <h4>Customize Your Avatar</h4>
              </div>
              <div id="avatar-options-container" class="avatar-options-container"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  generateStyleOptions() {
    return Object.entries(this.avatarStyles)
      .map(([key, style]) => `<option value="${key}">${style.name}</option>`)
      .join("");
  }

  initializeAvatarEditor() {
    console.log("🎯 Initializing avatar editor...");
    const styleSelect = document.getElementById("avatar-style-select");
    if (styleSelect) styleSelect.value = this.currentConfig.style;
    this.updateAvatarPreview();
    this.updateStyleDescription();
    this.populateStyleOptions(this.currentConfig.style);
    this.setupAvatarEditorEventListeners();
    console.log("✅ Avatar editor initialized");
  }

  setupAvatarEditorEventListeners() {
    document
      .getElementById("avatar-style-select")
      ?.addEventListener("change", (e) => {
        console.log("🎨 Style changed to:", e.target.value);
        this.currentConfig.style = e.target.value;
        this.currentConfig.options = {};
        this.updateStyleDescription();
        this.populateStyleOptions(e.target.value);
        this.updateAvatarPreview();
      });
    document
      .getElementById("randomize-avatar")
      ?.addEventListener("click", () => {
        console.log("🎲 Randomizing avatar...");
        this.randomizeAvatar();
      });
  }

  updateStyleDescription() {
    const descElement = document.getElementById("style-description");
    const styleInfo = this.avatarStyles[this.currentConfig.style];
    if (descElement && styleInfo)
      descElement.textContent = styleInfo.description;
  }

  /**
   * Populate customization options, handling color swatches correctly.
   * @param {string} style - Selected avatar style
   */
  populateStyleOptions(style) {
    const container = document.getElementById("avatar-options-container");
    if (!container) return;

    const styleInfo = this.avatarStyles[style];
    if (!styleInfo || Object.keys(styleInfo.options).length === 0) {
      container.innerHTML =
        '<p class="no-options">No customization options available.</p>';
      return;
    }

    const optionsHTML = Object.entries(styleInfo.options)
      .map(([key, values]) => {
        // *** BUG FIX START: Check for 'backgroundColor' and render swatches ***
        if (key === "backgroundColor") {
          return this.createColorSwatchesHTML(key, values);
        }
        // *** BUG FIX END ***

        // Render standard dropdown for other options
        const currentValue = this.currentConfig.options[key] || "";
        const selectOptions = values
          .map(
            (val) =>
              `<option value="${val}" ${
                val === currentValue ? "selected" : ""
              }>${this.formatOptionValue(val)}</option>`
          )
          .join("");
        return `
        <div class="option-group">
          <label for="option-${key}" class="option-label">${this.formatOptionName(
          key
        )}</label>
          <select id="option-${key}" class="option-select" data-option="${key}">
            <option value="">Default</option>${selectOptions}
          </select>
        </div>
      `;
      })
      .join("");

    container.innerHTML = optionsHTML;
    this.addOptionEventListeners(container);
  }

  /**
   * NEW: Helper to create HTML for color swatches.
   * @param {string} key - The option key (e.g., 'backgroundColor')
   * @param {string[]} colors - Array of hex color codes (without #)
   */
  createColorSwatchesHTML(key, colors) {
    const currentValue = this.currentConfig.options[key] || "";
    const swatches = colors
      .map(
        (color) => `
      <button 
        class="color-swatch-btn ${color === currentValue ? "active" : ""}" 
        data-option="${key}" 
        data-value="${color}"
        aria-label="Color ${color}"
        style="background-color: #${color};">
      </button>
    `
      )
      .join("");
    return `
      <div class="option-group">
        <label class="option-label">${this.formatOptionName(key)}</label>
        <div class="color-swatch-container">${swatches}</div>
      </div>
    `;
  }

  /**
   * NEW: Add event listeners to all generated options (both selects and swatches).
   */
  addOptionEventListeners(container) {
    container.querySelectorAll(".option-select").forEach((select) => {
      select.addEventListener("change", (e) => {
        const key = e.target.dataset.option;
        const value = e.target.value;
        if (value) this.currentConfig.options[key] = value;
        else delete this.currentConfig.options[key];
        this.updateAvatarPreview();
      });
    });

    container.querySelectorAll(".color-swatch-btn").forEach((button) => {
      button.addEventListener("click", (e) => {
        const key = e.currentTarget.dataset.option;
        const value = e.currentTarget.dataset.value;
        this.currentConfig.options[key] = value;
        // Update active state visual
        container
          .querySelectorAll(`[data-option="${key}"]`)
          .forEach((btn) => btn.classList.remove("active"));
        e.currentTarget.classList.add("active");
        this.updateAvatarPreview();
      });
    });
  }

  formatOptionName(name) {
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  }

  formatOptionValue(value) {
    return value
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/variant0?(\d+)/i, "Style $1");
  }

  updateAvatarPreview() {
    const previewImg = document.getElementById("avatar-preview");
    if (previewImg) previewImg.src = this.generateAvatarUrl(this.currentConfig);
  }

  randomizeAvatar() {
    const styleInfo = this.avatarStyles[this.currentConfig.style];
    if (!styleInfo || Object.keys(styleInfo.options).length === 0) return;
    this.currentConfig.seed = Math.random().toString(36).substring(2, 15);
    this.currentConfig.options = {}; // Clear previous options
    Object.entries(styleInfo.options).forEach(([key, values]) => {
      if (values.length > 0) {
        this.currentConfig.options[key] =
          values[Math.floor(Math.random() * values.length)];
      }
    });
    this.populateStyleOptions(this.currentConfig.style);
    this.updateAvatarPreview();
  }

  handleSaveAvatar() {
    console.log("💾 Saving avatar configuration:", this.currentConfig);
    if (this.onSaveCallback) this.onSaveCallback(this.currentConfig);
    return true;
  }

  getAvatarUrl(userConfig, fallbackUserId = "default") {
    const config =
      userConfig && this.isValidAvatarConfig(userConfig)
        ? userConfig
        : this.generateDefaultAvatar(fallbackUserId);
    return this.generateAvatarUrl(config);
  }

  isValidAvatarConfig(config) {
    return (
      config &&
      typeof config === "object" &&
      config.style &&
      this.avatarStyles[config.style] &&
      config.seed
    );
  }
}

// Global instance to be used by other scripts
window.avatarManager = new AvatarManager();
console.log(
  "🎨 Avatar Manager loaded globally and available at window.avatarManager"
);
export default window.avatarManager;
