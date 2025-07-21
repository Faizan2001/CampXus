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
 * Uses DiceBear API: https://api.dicebear.com/9.x/ (Recommended Update)
 *
 * =============================================================================
 */

class AvatarManager {
  constructor() {
    // Available avatar styles with their display names and customization options
    this.avatarStyles = {
      // --- PRE-EXISTING STYLES (UNCHANGED) ---
      miniavs: {
        name: "Mini Avatars",
        description: "Cute minimalist avatars",
        options: {
          hair: [
            "balndess",
            "classic01",
            "classic02",
            "curly",
            "elvis",
            "long",
            "ponyTail",
            "stylish",
          ],
          backgroundColor: [
            // Solid colors
            "b6e3f4",
            "c0aede",
            "ffd93d",
            "ffdfbf",
            "d1d4f9",
            // Gradient combinations (two colors each)
            "b6e3f4,c0aede",
            "ffd93d,ffdfbf",
            "d1d4f9,b6e3f4",
            "c0aede,ffd93d",
            "ffdfbf,d1d4f9",
          ],
          backgroundType: ["gradientLinear", "solid"],
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
            "variant06",
            "variant07",
            "variant08",
            "variant09",
            "variant10",
            "variant11",
            "variant12",
            "variant13",
            "variant14",
            "variant15",
          ],
          eyebrows: ["variant01", "variant02", "variant03", "variant04"],
          mouth: [
            "variant01",
            "variant02",
            "variant03",
            "variant04",
            "variant05",
            "variant06",
            "variant07",
            "variant08",
            "variant09",
          ],
          glasses: [
            "variant01",
            "variant02",
            "variant03",
            "variant04",
            "variant05",
          ],
          hair: [
            "long01",
            "long02",
            "long03",
            "long04",
            "long05",
            "long06",
            "long07",
            "long08",
            "long09",
            "long10",
            "long11",
            "long12",
            "long13",
            "long14",
            "long15",
            "long16",
            "short01",
            "short02",
            "short03",
            "short04",
            "short05",
            "short06",
            "short07",
            "short08",
            "short09",
            "short10",
            "short11",
            "short12",
            "short13",
            "short14",
            "short15",
            "short16",
          ],
          hairColor: [
            "0e0e0e",
            "3eac2c",
            "6a4e35",
            "85c2c6",
            "796a45",
            "562306",
            "592454",
            "ab2a18",
            "ac6511",
            "afafaf",
            "b9a05f",
            "cb6820",
            "dba3be",
            "e5d7a3",
          ],
          backgroundColor: [
            // Solid colors
            "b6e3f4",
            "c0aede",
            "ffd93d",
            "ffdfbf",
            "d1d4f9",
            // Gradient combinations (two colors each)
            "b6e3f4,c0aede",
            "ffd93d,ffdfbf",
            "d1d4f9,b6e3f4",
            "c0aede,ffd93d",
            "ffdfbf,d1d4f9",
          ],
          backgroundType: ["gradientLinear", "solid"],
        },
      },

      // --- UPDATED AND CORRECTED STYLES BASED ON LATEST DOCUMENTATION ---

      avataaars: {
        name: "Avataaars",
        description: "Detailed character avatars by Pablo Stanley",
        options: {
          accessories: [
            "eyepatch",
            "kurt",
            "prescription01",
            "prescription02",
            "round",
            "sunglasses",
            "wayfarers",
          ],
          clothing: [
            "blazerAndShirt",
            "blazerAndSweater",
            "collarAndSweater",
            "graphicShirt",
            "hoodie",
            "overall",
            "shirtCrewNeck",
            "shirtScoopNeck",
            "shirtVNeck",
          ],
          eyes: [
            "closed",
            "cry",
            "default",
            "eyeRoll",
            "happy",
            "hearts",
            "side",
            "squint",
            "surprised",
            "wink",
            "winkWacky",
            "xDizzy",
          ],
          skinColor: [
            "614335",
            "ae5d29",
            "d08b5b",
            "edb98a",
            "f8d25c",
            "fd9841",
            "ffdbb4",
          ],
          top: [
            "bigHair",
            "bob",
            "bun",
            "curly",
            "curvy",
            "dreads",
            "frida",
            "frizzle",
            "fro",
            "froBand",
            "hat",
            "hijab",
            "longButNotTooLong",
            "miaWallace",
            "shaggy",
            "shaggyMullet",
            "shavedSides",
            "shortCurly",
            "shortFlat",
            "shortRound",
            "shortWaved",
            "sides",
            "straight01",
            "straight02",
            "theCaesar",
            "theCaesarAndSidePart",
            "turban",
            "winterHat01",
            "winterHat02",
            "winterHat03",
            "winterHat04",
          ],
          backgroundColor: [
            // Solid colors
            "b6e3f4",
            "c0aede",
            "d1d4f9",
            "ffd5dc",
            "ffdfbf",
            "a7ffc4",
            "ffdeb5",
            // Gradient combinations (two colors each)
            "b6e3f4,c0aede",
            "d1d4f9,ffd5dc",
            "ffdfbf,a7ffc4",
            "c0aede,ffdeb5",
            "ffd5dc,b6e3f4",
            "a7ffc4,d1d4f9",
          ],
          backgroundType: ["gradientLinear", "solid"],
        },
      },
      notionists: {
        name: "Notionists",
        description: "Professional avatars with clean design",
        options: {
          backgroundColor: [
            // Solid colors
            "b6e3f4",
            "c0aede",
            "d1d4f9",
            "ffd5dc",
            "ffdfbf",
            "a7ffc4",
            "ffdeb5",
            // Gradient combinations (two colors each)
            "b6e3f4,c0aede",
            "d1d4f9,ffd5dc",
            "ffdfbf,a7ffc4",
            "c0aede,ffdeb5",
            "ffd5dc,b6e3f4",
            "a7ffc4,d1d4f9",
          ],
          backgroundType: ["gradientLinear", "solid"],
          body: [
            "variant01",
            "variant02",
            "variant03",
            "variant04",
            "variant05",
            "variant06",
            "variant07",
            "variant08",
            "variant09",
            "variant10",
            "variant11",
            "variant12",
            "variant13",
            "variant14",
            "variant15",
            "variant16",
            "variant17",
            "variant18",
            "variant19",
            "variant20",
            "variant21",
            "variant22",
            "variant23",
            "variant24",
            "variant25",
          ],
        },
      },
      "bottts-neutral": {
        name: "Bottts Neutral",
        description: "Friendly robot avatars with neutral expressions",
        options: {
          eyes: [
            "bulging",
            "dizzy",
            "eva",
            "frame1",
            "frame2",
            "glow",
            "happy",
            "hearts",
            "robocop",
            "round",
            "roundFrame01",
            "roundFrame02",
            "sensor",
            "shade01",
          ],
          mouth: [
            "bite",
            "diagram",
            "grill01",
            "grill02",
            "grill03",
            "smile01",
            "smile02",
            "square01",
            "square02",
          ],
          backgroundColor: [
            "b6e3f4",
            "c0aede",
            "d1d4f9",
            "ffd5dc",
            "ffdfbf",
            "a7ffc4",
            "ffdeb5",
          ],
        },
      },
      thumbs: {
        name: "Thumbs",
        description: "Simple thumbs up avatars",
        options: {
          eyes: [
            "variant1W16",
            "variant2W10",
            "variant3W16",
            "variant4W14",
            "variant5W12",
            "variant7W14",
            "variant9W12",
          ],
          shapeColor: ["0a5b83", "1c799f", "69d2e7", "f1f4dc", "f88c49"],
          backgroundColor: [
            // Solid colors
            "b6e3f4",
            "c0aede",
            "ffd93d",
            "ffdfbf",
            "d1d4f9",
            // Gradient combinations (two colors each)
            "b6e3f4,c0aede",
            "ffd93d,ffdfbf",
            "d1d4f9,b6e3f4",
            "c0aede,ffd93d",
            "ffdfbf,d1d4f9",
          ],
          backgroundType: ["gradientLinear", "solid"],
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
  generateAvatarUrl(config, bustCache = false) {
    if (!config || !config.style || !config.seed) {
      console.warn(
        "⚠️ Invalid config passed to generateAvatarUrl, using fallback."
      );
      config = this.generateDefaultAvatar("fallback-user");
    }
    const { style, seed, options = {} } = config;
    // NOTE: Using latest DiceBear version 9.x is recommended
    const baseUrl = `https://api.dicebear.com/9.x/${style}/svg`;
    const params = new URLSearchParams({ seed });
    Object.entries(options).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    
    // Optional: Add cache-busting parameter for avatar updates
    if (bustCache) {
      params.append('t', Date.now().toString());
    }
    
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
        // Your code is only checking for "backgroundColor".
        // To make other color options like `skinColor` also appear as swatches,
        // you would need to expand this condition.
        // Example: if (key.toLowerCase().includes('color'))
        if (key === "backgroundColor" || key === "skinColor") {
          return this.createColorSwatchesHTML(key, values);
        }

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
   * Helper to create HTML for color swatches with gradient support.
   * @param {string} key - The option key (e.g., 'backgroundColor')
   * @param {string[]} colors - Array of hex color codes or gradient combinations
   */
  createColorSwatchesHTML(key, colors) {
    const currentValue = this.currentConfig.options[key] || "";
    const swatches = colors
      .map((color) => {
        // Check if this is a gradient (contains comma)
        const isGradient = color.includes(",");
        let backgroundStyle;
        let ariaLabel;

        if (isGradient) {
          // Split the gradient colors
          const [color1, color2] = color.split(",");
          backgroundStyle = `background: linear-gradient(135deg, #${color1.trim()}, #${color2.trim()});`;
          ariaLabel = `Gradient from ${color1} to ${color2}`;
        } else {
          // Solid color
          backgroundStyle = `background-color: #${color};`;
          ariaLabel = `Solid color ${color}`;
        }

        return `
          <button 
            class="color-swatch-btn ${
              isGradient ? "gradient-swatch" : "solid-swatch"
            } ${color === currentValue ? "active" : ""}" 
            data-option="${key}" 
            data-value="${color}"
            aria-label="${ariaLabel}"
            style="${backgroundStyle}">
            ${isGradient ? '<span class="gradient-indicator">▲</span>' : ""}
          </button>
        `;
      })
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

    // No need to clean here - DataManager will use clean slate approach
    // Just pass the current config directly to the callback
    if (this.onSaveCallback) {
      this.onSaveCallback(this.currentConfig);
    }
    return true;
  }

  /**
   * Get avatar URL with fallback
   * @param {Object} userConfig - User's avatar configuration
   * @param {string} fallbackUserId - Fallback user ID for default avatar
   * @returns {string} Avatar URL
   */
  getAvatarUrl(userConfig, fallbackUserId = "default") {
    const config =
      userConfig && this.isValidAvatarConfig(userConfig)
        ? userConfig
        : this.generateDefaultAvatar(fallbackUserId);
    return this.generateAvatarUrl(config);
  }

  /**
   * Validate avatar configuration
   * @param {Object} config - Avatar configuration to validate
   * @returns {boolean} True if valid
   */
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

// Export singleton instance for ES6 modules
const avatarManagerInstance = new AvatarManager();
export const avatarManager = avatarManagerInstance;

// Only expose on window in development mode for debugging
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.avatarManager = avatarManagerInstance;
}
