/**
 * ClubCreatorModal - Club creation/editing with image cropping and live preview
 *
 * Features:
 * - Image cropper for logo (1:1 square) and banner (16:9 wide)
 * - Live preview that mirrors the actual club card appearance
 * - Supports both create and edit modes
 * - Reusable by AdminPage and SafModeratePage
 */

import { logManager } from "../../utils/debug/LogManager.js";
import { escapeHTML, escapeAttr } from "../../utils/security/sanitize.js";

export class ClubCreatorModal {
  constructor(options = {}) {
    this.universities = options.universities || [];
    this.presetUniversityId =
      options.presetUniversityId || options.universityId || null;
    this.presetUniversityName =
      options.presetUniversityName || options.universityName || null;
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});

    // Edit mode - accept both clubData and existingClub for backwards compatibility
    this.existingClub = options.existingClub || options.clubData || null;
    this.editMode = options.editMode || !!this.existingClub;

    // Existing image URLs for edit mode
    this.existingLogoUrl =
      options.existingLogoUrl || this.existingClub?.logoUrl || null;
    this.existingBannerUrl =
      options.existingBannerUrl || this.existingClub?.bannerUrl || null;

    this.overlay = null;
    this.logoBlob = null;
    this.bannerBlob = null;
    this.logoPreviewUrl = this.existingLogoUrl;
    this.bannerPreviewUrl = this.existingBannerUrl;

    // Cropper state
    this.cropperOverlay = null;
    this.cropperCanvas = null;
    this.cropperCtx = null;
    this.cropperImg = null;
    this.cropperType = null; // 'logo' or 'banner'
    this.cropperAspectRatio = 1;
    this.cropperZoom = 1;
    this.cropperPanX = 0;
    this.cropperPanY = 0;
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;

    // Output dimensions
    this.logoOutputSize = 400; // 400x400 for logo
    this.bannerOutputWidth = 1200;
    this.bannerOutputHeight = 400; // 3:1 ratio for banner

    // Bound methods
    this.boundDragMove = this.handleDragMove.bind(this);
    this.boundDragEnd = this.handleDragEnd.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
  }

  /**
   * Show the club creator modal
   */
  show() {
    this.render();
    this.bindEvents();
    this.populateEditData();
    requestAnimationFrame(() => {
      this.overlay?.classList.add("active");
    });
    document.body.style.overflow = "hidden";
  }

  /**
   * Hide and cleanup
   */
  hide() {
    document.body.style.overflow = "";
    this.cleanupCropper();

    // Remove ESC handler
    if (this.escHandler) {
      document.removeEventListener("keydown", this.escHandler);
      this.escHandler = null;
    }

    // Revoke preview URLs - only revoke blob URLs, not external Firebase URLs
    if (this.logoPreviewUrl && this.logoPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(this.logoPreviewUrl);
    }
    if (this.bannerPreviewUrl && this.bannerPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(this.bannerPreviewUrl);
    }

    if (this.overlay) {
      this.overlay.classList.remove("active");
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 300);
    }
  }

  /**
   * Render the modal
   */
  render() {
    document.querySelector(".club-creator-modal-overlay")?.remove();

    const universityOptions = this.presetUniversityId
      ? `<option value="${this.presetUniversityId}" selected>${escapeHTML(
          this.presetUniversityName || this.presetUniversityId
        )}</option>`
      : this.universities.length > 0
      ? `<option value="">Select university</option>` +
        this.universities
          .map(
            (u) =>
              `<option value="${u.id}">${escapeHTML(u.name || u.id)}</option>`
          )
          .join("")
      : `<option value="">No universities available</option>`;

    // Edit mode adjustments
    const modalTitle = this.editMode ? "Edit Club" : "Create New Club";
    const modalIcon = this.editMode ? "fa-edit" : "fa-plus-circle";
    const confirmText = this.editMode ? "Save Changes" : "Create Club";
    const confirmIcon = this.editMode ? "fa-save" : "fa-plus";

    this.overlay = document.createElement("div");
    this.overlay.className = "club-creator-modal-overlay";
    this.overlay.innerHTML = `
      <div class="club-creator-modal">
        <div class="club-creator-header">
          <h2><i class="fas ${modalIcon}"></i> ${modalTitle}</h2>
          <button class="club-creator-close-btn" type="button" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="club-creator-body">
          <!-- Left: Form -->
          <div class="club-creator-form-section">
            <form id="club-creator-form" class="admin-form">
              <div class="form-group">
                <label>Club Name *</label>
                <input type="text" name="name" id="club-name-input" required placeholder="Enter club name" maxlength="60">
              </div>

              <div class="form-group">
                <label>Description</label>
                <textarea name="description" id="club-desc-input" rows="2" placeholder="Brief description" maxlength="200"></textarea>
              </div>

              <div class="form-group">
                <label>University *</label>
                <select name="universityId" id="club-uni-input" required ${
                  this.presetUniversityId || this.editMode ? "disabled" : ""
                }>
                  ${universityOptions}
                </select>
              </div>

              <div class="form-group">
                <label>Category</label>
                <select name="category" id="club-category-input">
                  <option value="academic">Academic</option>
                  <option value="social">Social</option>
                  <option value="sports">Sports</option>
                  <option value="arts">Arts & Culture</option>
                  <option value="tech">Technology</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div class="form-group">
                <label>Accent Color</label>
                <div class="accent-color-picker">
                  <button type="button" class="color-swatch selected" data-color="blue" style="--swatch-color: #3b82f6;"></button>
                  <button type="button" class="color-swatch" data-color="purple" style="--swatch-color: #8b5cf6;"></button>
                  <button type="button" class="color-swatch" data-color="green" style="--swatch-color: #10b981;"></button>
                  <button type="button" class="color-swatch" data-color="orange" style="--swatch-color: #f59e0b;"></button>
                  <button type="button" class="color-swatch" data-color="pink" style="--swatch-color: #ec4899;"></button>
                  <button type="button" class="color-swatch" data-color="red" style="--swatch-color: #ef4444;"></button>
                </div>
                <input type="hidden" name="accentColor" id="club-color-input" value="blue">
              </div>

              <!-- Image Upload Buttons -->
              <div class="form-group image-uploads">
                <div class="image-upload-row">
                  <div class="image-upload-item">
                    <label>Club Logo</label>
                    <button type="button" class="image-upload-btn ${
                      this.logoPreviewUrl ? "has-image" : ""
                    }" id="logo-upload-btn">
                      <i class="fas ${
                        this.logoPreviewUrl ? "fa-check" : "fa-camera"
                      }"></i>
                      <span id="logo-upload-text">${
                        this.logoPreviewUrl ? "Change Logo" : "Choose Logo"
                      }</span>
                    </button>
                    <input type="file" id="logo-file-input" accept="image/*" hidden>
                  </div>
                  <div class="image-upload-item">
                    <label>Club Banner</label>
                    <button type="button" class="image-upload-btn ${
                      this.bannerPreviewUrl ? "has-image" : ""
                    }" id="banner-upload-btn">
                      <i class="fas ${
                        this.bannerPreviewUrl ? "fa-check" : "fa-image"
                      }"></i>
                      <span id="banner-upload-text">${
                        this.bannerPreviewUrl
                          ? "Change Banner"
                          : "Choose Banner"
                      }</span>
                    </button>
                    <input type="file" id="banner-file-input" accept="image/*" hidden>
                  </div>
                </div>
              </div>

              ${
                this.editMode
                  ? `
              <div class="form-group checkbox-group">
                <label class="inline-checkbox">
                  <input type="checkbox" name="isActive" id="club-active-input" checked>
                  <span>Active (visible in Clubs UI)</span>
                </label>
              </div>
              `
                  : ""
              }

              <!-- SAF approval is mandatory for all events (per Data Model) -->
              <div class="form-group saf-notice">
                <p class="info-text">
                  <i class="fas fa-shield-alt"></i>
                  SAF approval is required for all club events.
                </p>
              </div>
            </form>
          </div>

          <!-- Right: Live Preview -->
          <div class="club-creator-preview-section">
            <div class="preview-label">
              <i class="fas fa-eye"></i> Live Preview
            </div>
            <div class="club-preview-container">
              ${this.renderPreviewCard()}
            </div>
          </div>
        </div>

        <div class="club-creator-footer">
          <button type="button" class="btn secondary" id="club-creator-cancel">
            Cancel
          </button>
          <button type="button" class="btn primary" id="club-creator-confirm">
            <i class="fas ${confirmIcon}"></i> ${confirmText}
          </button>
        </div>
      </div>

      <!-- Image Cropper (hidden by default) -->
      <div class="club-image-cropper" id="club-image-cropper">
        <div class="cropper-container">
          <div class="cropper-header">
            <h3 id="cropper-title"><i class="fas fa-crop-alt"></i> Adjust Image</h3>
            <button type="button" class="cropper-close-btn" id="cropper-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="cropper-canvas-area">
            <canvas id="club-cropper-canvas"></canvas>
          </div>
          <div class="cropper-controls">
            <button type="button" class="zoom-btn" id="cropper-zoom-out">
              <i class="fas fa-minus"></i>
            </button>
            <input type="range" id="cropper-zoom-slider" min="100" max="300" value="100">
            <button type="button" class="zoom-btn" id="cropper-zoom-in">
              <i class="fas fa-plus"></i>
            </button>
          </div>
          <div class="cropper-hint">
            <i class="fas fa-arrows-alt"></i> Drag to reposition
          </div>
          <div class="cropper-actions">
            <button type="button" class="btn secondary" id="cropper-cancel">Cancel</button>
            <button type="button" class="btn primary" id="cropper-apply">
              <i class="fas fa-check"></i> Apply
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
  }

  /**
   * Render the preview card HTML - shows banner (like ClubDetailPage) + card layout (like ClubsPage)
   */
  renderPreviewCard(data = {}) {
    const name = data.name || "Club Name";
    const description =
      data.description || "Your club description will appear here...";
    const university = data.university || "University";
    const accentColor = data.accentColor || "purple";
    // Use newly cropped preview URL, or fall back to existing URL in edit mode
    const logoUrl = this.logoPreviewUrl || this.existingLogoUrl;

    return `
      <div class="club-card" data-accent="${escapeAttr(accentColor)}">
        <div class="club-card-body">
          <div class="club-card-header">
            <div class="club-logo">
              ${
                logoUrl
                  ? `<img src="${escapeAttr(logoUrl)}" alt="Logo">`
                  : `<i class="fas fa-flag"></i>`
              }
            </div>
            <div class="club-info">
              <h3>${escapeHTML(name)}</h3>
              <span class="club-university"><i class="fas fa-university"></i> ${escapeHTML(
                university
              )}</span>
            </div>
          </div>
          <p class="club-description">${
            escapeHTML(description) || "No description"
          }</p>
          <div class="club-stats">
            <i class="fas fa-users"></i> 0 followers
          </div>
          <div class="club-actions">
            <button class="btn primary" disabled>
              <i class="fas fa-plus"></i> Follow
            </button>
            <button class="btn secondary" disabled>
              View <i class="fas fa-arrow-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Update the preview card
   */
  updatePreview() {
    const previewContainer = this.overlay?.querySelector(
      ".club-preview-container"
    );
    if (!previewContainer) return;

    const name = this.overlay.querySelector("#club-name-input")?.value || "";
    const description =
      this.overlay.querySelector("#club-desc-input")?.value || "";
    const universitySelect = this.overlay.querySelector("#club-uni-input");
    const university =
      universitySelect?.options[universitySelect.selectedIndex]?.text || "";
    const accentColor =
      this.overlay.querySelector("#club-color-input")?.value || "blue";

    previewContainer.innerHTML = this.renderPreviewCard({
      name,
      description,
      university,
      accentColor,
    });
  }

  /**
   * Bind all event listeners
   */
  bindEvents() {
    // Close button
    this.overlay
      .querySelector(".club-creator-close-btn")
      ?.addEventListener("click", () => {
        this.hide();
        this.onCancel();
      });

    // Cancel button
    this.overlay
      .querySelector("#club-creator-cancel")
      ?.addEventListener("click", () => {
        this.hide();
        this.onCancel();
      });

    // Confirm button
    this.overlay
      .querySelector("#club-creator-confirm")
      ?.addEventListener("click", () => {
        this.handleConfirm();
      });

    // Form input changes - update preview
    const formInputs = this.overlay.querySelectorAll(
      "#club-name-input, #club-desc-input, #club-uni-input"
    );
    formInputs.forEach((input) => {
      input.addEventListener("input", () => this.updatePreview());
      input.addEventListener("change", () => this.updatePreview());
    });

    // Color picker
    const colorSwatches = this.overlay.querySelectorAll(".color-swatch");
    const colorInput = this.overlay.querySelector("#club-color-input");
    colorSwatches.forEach((swatch) => {
      swatch.addEventListener("click", () => {
        colorSwatches.forEach((s) => s.classList.remove("selected"));
        swatch.classList.add("selected");
        if (colorInput) colorInput.value = swatch.dataset.color;
        this.updatePreview();
      });
    });

    // Logo upload
    const logoBtn = this.overlay.querySelector("#logo-upload-btn");
    const logoInput = this.overlay.querySelector("#logo-file-input");
    logoBtn?.addEventListener("click", () => logoInput?.click());
    logoInput?.addEventListener("change", (e) => {
      if (e.target.files?.[0]) {
        this.openCropper(e.target.files[0], "logo");
      }
    });

    // Banner upload
    const bannerBtn = this.overlay.querySelector("#banner-upload-btn");
    const bannerInput = this.overlay.querySelector("#banner-file-input");
    bannerBtn?.addEventListener("click", () => bannerInput?.click());
    bannerInput?.addEventListener("change", (e) => {
      if (e.target.files?.[0]) {
        this.openCropper(e.target.files[0], "banner");
      }
    });

    // Cropper events
    this.bindCropperEvents();

    // ESC key to close
    this.escHandler = (e) => {
      if (e.key === "Escape") {
        const cropper = this.overlay?.querySelector("#club-image-cropper");
        if (cropper?.classList.contains("active")) {
          this.closeCropper();
        } else {
          this.hide();
          this.onCancel();
        }
      }
    };
    document.addEventListener("keydown", this.escHandler);
  }

  /**
   * Populate form fields with existing club data (for edit mode)
   */
  populateEditData() {
    if (!this.editMode || !this.existingClub) return;

    const form = this.overlay?.querySelector("#club-creator-form");
    if (!form) return;

    const club = this.existingClub;

    // Set text fields
    const nameInput = form.querySelector("#club-name-input");
    const descInput = form.querySelector("#club-desc-input");
    const categoryInput = form.querySelector("#club-category-input");
    const colorInput = form.querySelector("#club-color-input");

    if (nameInput) nameInput.value = club.name || "";
    if (descInput) descInput.value = club.description || "";
    if (categoryInput) categoryInput.value = club.category || "other";
    // Note: requireSafApproval checkbox removed - SAF approval is mandatory for all events

    // Set accent color
    const accentColor = club.accentColor || "blue";
    if (colorInput) colorInput.value = accentColor;

    // Select the color swatch
    const colorSwatches = this.overlay.querySelectorAll(".color-swatch");
    colorSwatches.forEach((swatch) => {
      if (swatch.dataset.color === accentColor) {
        swatch.classList.add("selected");
      } else {
        swatch.classList.remove("selected");
      }
    });

    // Set existing logo preview
    if (this.existingLogoUrl) {
      const logoPreview = this.overlay.querySelector("#logo-preview-area");
      if (logoPreview) {
        logoPreview.innerHTML = `<img src="${escapeHTML(
          this.existingLogoUrl
        )}" alt="Logo" class="upload-preview-img">`;
        logoPreview.classList.add("has-image");
      }
    }

    // Set existing banner preview
    if (this.existingBannerUrl) {
      const bannerPreview = this.overlay.querySelector("#banner-preview-area");
      if (bannerPreview) {
        bannerPreview.innerHTML = `<img src="${escapeHTML(
          this.existingBannerUrl
        )}" alt="Banner" class="upload-preview-img">`;
        bannerPreview.classList.add("has-image");
      }
    }

    // Update the card preview
    this.updatePreview();
  }

  /**
   * Bind cropper-specific events
   */
  bindCropperEvents() {
    const cropper = this.overlay?.querySelector("#club-image-cropper");
    if (!cropper) return;

    // Close cropper
    cropper
      .querySelector("#cropper-close")
      ?.addEventListener("click", () => this.closeCropper());
    cropper
      .querySelector("#cropper-cancel")
      ?.addEventListener("click", () => this.closeCropper());

    // Apply crop
    cropper
      .querySelector("#cropper-apply")
      ?.addEventListener("click", () => this.applyCrop());

    // Zoom controls
    const slider = cropper.querySelector("#cropper-zoom-slider");
    slider?.addEventListener("input", (e) => {
      this.cropperZoom = parseInt(e.target.value) / 100;
      this.drawCropper();
    });

    cropper.querySelector("#cropper-zoom-in")?.addEventListener("click", () => {
      this.cropperZoom = Math.min(3, this.cropperZoom + 0.1);
      if (slider) slider.value = Math.round(this.cropperZoom * 100);
      this.drawCropper();
    });

    cropper
      .querySelector("#cropper-zoom-out")
      ?.addEventListener("click", () => {
        this.cropperZoom = Math.max(1, this.cropperZoom - 0.1);
        if (slider) slider.value = Math.round(this.cropperZoom * 100);
        this.drawCropper();
      });
  }

  /**
   * Open the image cropper
   */
  async openCropper(file, type) {
    try {
      this.cropperType = type;
      this.cropperAspectRatio = type === "logo" ? 1 : 3; // 1:1 for logo, 3:1 for banner
      this.cropperZoom = 1;
      this.cropperPanX = 0;
      this.cropperPanY = 0;

      // Load image
      this.cropperImg = await this.loadImage(file);

      // Setup canvas
      const cropper = this.overlay?.querySelector("#club-image-cropper");
      const canvas = cropper?.querySelector("#club-cropper-canvas");
      const title = cropper?.querySelector("#cropper-title");

      if (!cropper || !canvas) return;

      this.cropperCanvas = canvas;
      this.cropperCtx = canvas.getContext("2d");

      // Update title
      if (title) {
        title.innerHTML = `<i class="fas fa-crop-alt"></i> Adjust ${
          type === "logo" ? "Logo" : "Banner"
        }`;
      }

      // Reset zoom slider
      const slider = cropper.querySelector("#cropper-zoom-slider");
      if (slider) slider.value = 100;

      // Show cropper
      cropper.classList.add("active");

      // Initialize canvas size after DOM update
      requestAnimationFrame(() => {
        this.initCropperCanvas();
        this.bindCropperDrag();
      });
    } catch (err) {
      logManager.error("[ClubCreatorModal] Failed to open cropper:", err);
    }
  }

  /**
   * Load image from file
   */
  loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error("Failed to load image"));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Initialize cropper canvas dimensions
   */
  initCropperCanvas() {
    const wrapper = this.cropperCanvas?.parentElement;
    if (!wrapper || !this.cropperCanvas) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const maxWidth = wrapperRect.width - 32;
    const maxHeight = Math.min(wrapperRect.height - 32, 300);

    let displayWidth, displayHeight;

    if (maxWidth / maxHeight > this.cropperAspectRatio) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * this.cropperAspectRatio;
    } else {
      displayWidth = maxWidth;
      displayHeight = displayWidth / this.cropperAspectRatio;
    }

    this.cropperDisplayWidth = displayWidth;
    this.cropperDisplayHeight = displayHeight;

    this.cropperCanvas.style.width = `${displayWidth}px`;
    this.cropperCanvas.style.height = `${displayHeight}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cropperCanvas.width = displayWidth * dpr;
    this.cropperCanvas.height = displayHeight * dpr;
    this.cropperCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Calculate base crop
    this.calculateBaseCrop();
    this.drawCropper();
  }

  /**
   * Calculate base crop rectangle
   */
  calculateBaseCrop() {
    if (!this.cropperImg) return;

    const imgAspect = this.cropperImg.width / this.cropperImg.height;
    const cropAspect = this.cropperAspectRatio;

    if (imgAspect > cropAspect) {
      this.baseCropHeight = this.cropperImg.height;
      this.baseCropWidth = this.baseCropHeight * cropAspect;
    } else {
      this.baseCropWidth = this.cropperImg.width;
      this.baseCropHeight = this.baseCropWidth / cropAspect;
    }
  }

  /**
   * Draw the cropper canvas
   */
  drawCropper() {
    if (!this.cropperCtx || !this.cropperImg) return;

    const ctx = this.cropperCtx;
    const displayW = this.cropperDisplayWidth;
    const displayH = this.cropperDisplayHeight;

    // Clear canvas
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, displayW, displayH);

    // Calculate visible crop area in image coordinates
    const cropW = this.baseCropWidth / this.cropperZoom;
    const cropH = this.baseCropHeight / this.cropperZoom;

    // Center point with pan offset
    const centerX = this.cropperImg.width / 2 + this.cropperPanX;
    const centerY = this.cropperImg.height / 2 + this.cropperPanY;

    // Source rectangle
    const sx = centerX - cropW / 2;
    const sy = centerY - cropH / 2;

    // Draw image
    ctx.drawImage(
      this.cropperImg,
      sx,
      sy,
      cropW,
      cropH,
      0,
      0,
      displayW,
      displayH
    );

    // Draw crop overlay guides
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;

    // Rule of thirds
    const thirdW = displayW / 3;
    const thirdH = displayH / 3;

    ctx.beginPath();
    ctx.moveTo(thirdW, 0);
    ctx.lineTo(thirdW, displayH);
    ctx.moveTo(thirdW * 2, 0);
    ctx.lineTo(thirdW * 2, displayH);
    ctx.moveTo(0, thirdH);
    ctx.lineTo(displayW, thirdH);
    ctx.moveTo(0, thirdH * 2);
    ctx.lineTo(displayW, thirdH * 2);
    ctx.stroke();
  }

  /**
   * Bind drag events for cropper
   */
  bindCropperDrag() {
    if (!this.cropperCanvas) return;

    this.cropperCanvas.addEventListener("mousedown", (e) =>
      this.handleDragStart(e)
    );
    this.cropperCanvas.addEventListener(
      "touchstart",
      (e) => this.handleTouchStart(e),
      { passive: false }
    );

    document.addEventListener("mousemove", this.boundDragMove);
    document.addEventListener("mouseup", this.boundDragEnd);
    document.addEventListener("touchmove", this.boundTouchMove, {
      passive: false,
    });
    document.addEventListener("touchend", this.boundDragEnd);
  }

  handleDragStart(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  handleTouchStart(e) {
    if (e.touches.length === 1) {
      e.preventDefault();
      this.isDragging = true;
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    }
  }

  handleDragMove(e) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;

    this.updatePan(deltaX, deltaY);

    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  handleTouchMove(e) {
    if (!this.isDragging || e.touches.length !== 1) return;
    e.preventDefault();

    const deltaX = e.touches[0].clientX - this.lastX;
    const deltaY = e.touches[0].clientY - this.lastY;

    this.updatePan(deltaX, deltaY);

    this.lastX = e.touches[0].clientX;
    this.lastY = e.touches[0].clientY;
  }

  handleDragEnd() {
    this.isDragging = false;
  }

  updatePan(deltaX, deltaY) {
    if (!this.cropperImg) return;

    // Convert screen delta to image delta
    const scale =
      this.baseCropWidth / (this.cropperZoom * this.cropperDisplayWidth);

    this.cropperPanX -= deltaX * scale;
    this.cropperPanY -= deltaY * scale;

    // Clamp pan to keep image within bounds
    const cropW = this.baseCropWidth / this.cropperZoom;
    const cropH = this.baseCropHeight / this.cropperZoom;
    const maxPanX = (this.cropperImg.width - cropW) / 2;
    const maxPanY = (this.cropperImg.height - cropH) / 2;

    this.cropperPanX = Math.max(-maxPanX, Math.min(maxPanX, this.cropperPanX));
    this.cropperPanY = Math.max(-maxPanY, Math.min(maxPanY, this.cropperPanY));

    this.drawCropper();
  }

  /**
   * Apply the crop and save the blob
   */
  async applyCrop() {
    if (!this.cropperImg) return;

    const outputWidth =
      this.cropperType === "logo"
        ? this.logoOutputSize
        : this.bannerOutputWidth;
    const outputHeight =
      this.cropperType === "logo"
        ? this.logoOutputSize
        : this.bannerOutputHeight;

    // Create output canvas
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const outCtx = outputCanvas.getContext("2d");

    // Calculate source rectangle
    const cropW = this.baseCropWidth / this.cropperZoom;
    const cropH = this.baseCropHeight / this.cropperZoom;
    const centerX = this.cropperImg.width / 2 + this.cropperPanX;
    const centerY = this.cropperImg.height / 2 + this.cropperPanY;
    const sx = centerX - cropW / 2;
    const sy = centerY - cropH / 2;

    outCtx.drawImage(
      this.cropperImg,
      sx,
      sy,
      cropW,
      cropH,
      0,
      0,
      outputWidth,
      outputHeight
    );

    // Convert to blob
    const blob = await new Promise((resolve) => {
      outputCanvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    // Store blob and create preview URL
    if (this.cropperType === "logo") {
      // Only revoke if it's a blob URL, not an external Firebase URL
      if (this.logoPreviewUrl?.startsWith("blob:"))
        URL.revokeObjectURL(this.logoPreviewUrl);
      this.logoBlob = blob;
      this.logoPreviewUrl = URL.createObjectURL(blob);

      // Update button text
      const textEl = this.overlay?.querySelector("#logo-upload-text");
      if (textEl) textEl.textContent = "Change Logo";
    } else {
      // Only revoke if it's a blob URL, not an external Firebase URL
      if (this.bannerPreviewUrl?.startsWith("blob:"))
        URL.revokeObjectURL(this.bannerPreviewUrl);
      this.bannerBlob = blob;
      this.bannerPreviewUrl = URL.createObjectURL(blob);

      // Update button text
      const textEl = this.overlay?.querySelector("#banner-upload-text");
      if (textEl) textEl.textContent = "Change Banner";
    }

    // Update preview and close cropper
    this.updatePreview();
    this.closeCropper();
  }

  /**
   * Close the cropper
   */
  closeCropper() {
    const cropper = this.overlay?.querySelector("#club-image-cropper");
    cropper?.classList.remove("active");
    this.cleanupCropper();
  }

  /**
   * Cleanup cropper resources
   */
  cleanupCropper() {
    document.removeEventListener("mousemove", this.boundDragMove);
    document.removeEventListener("mouseup", this.boundDragEnd);
    document.removeEventListener("touchmove", this.boundTouchMove);
    document.removeEventListener("touchend", this.boundDragEnd);

    this.cropperImg = null;
    this.cropperCanvas = null;
    this.cropperCtx = null;
  }

  /**
   * Handle confirm/create
   */
  async handleConfirm() {
    const form = this.overlay?.querySelector("#club-creator-form");
    if (!form) return;

    const name = form.querySelector("#club-name-input")?.value?.trim();
    if (!name) {
      alert("Please enter a club name");
      return;
    }

    const universitySelect = form.querySelector("#club-uni-input");
    const universityId = this.presetUniversityId || universitySelect?.value;
    if (!universityId) {
      alert("Please select a university");
      return;
    }

    const universityName =
      this.presetUniversityName ||
      universitySelect?.options[universitySelect.selectedIndex]?.text ||
      universityId;

    const data = {
      name,
      description: form.querySelector("#club-desc-input")?.value || "",
      universityId,
      universityName,
      category: form.querySelector("#club-category-input")?.value || "other",
      accentColor: form.querySelector("#club-color-input")?.value || "blue",
      // SAF approval is mandatory for all events (per Data Model)
      // requireSafApproval is deprecated and always true
      requireSafApproval: true,
      logoBlob: this.logoBlob,
      bannerBlob: this.bannerBlob,
    };

    // Include clubId for edit mode
    if (this.editMode && this.existingClub?.id) {
      data.clubId = this.existingClub.id;
    }

    this.hide();
    this.onConfirm(data);
  }
}

export default ClubCreatorModal;
