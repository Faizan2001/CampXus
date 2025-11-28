/**
 * ImageCropperModal - Modal for cropping/adjusting event cover images
 * Mobile-first design with proper crop calculation
 */

import { logManager } from "../../utils/debug/LogManager.js";

export class ImageCropperModal {
  constructor(options = {}) {
    this.file = options.file;
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});

    this.overlay = null;
    this.canvas = null;
    this.ctx = null;
    this.img = null;

    // Crop state - all in image coordinates
    this.aspectRatio = 16 / 9; // Default: wide
    this.zoom = 1; // 1 = image fills crop area, >1 = zoomed in
    this.panX = 0; // Pan offset in image pixels
    this.panY = 0;

    // Drag state
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;

    // Pinch zoom state
    this.initialPinchDistance = 0;
    this.initialZoom = 1;

    // Canvas display info
    this.displayScale = 1;
    this.cropRect = { x: 0, y: 0, width: 0, height: 0 };

    // Output settings
    this.outputWidth = 1200;

    // Aspect ratio presets
    this.aspectRatios = [
      { id: "wide", label: "Wide", value: 16 / 9 },
      { id: "standard", label: "Standard", value: 4 / 3 },
      { id: "square", label: "Square", value: 1 },
      { id: "portrait", label: "Portrait", value: 3 / 4 },
    ];

    // Bound methods for cleanup
    this.boundMouseMove = this.handleDragMove.bind(this);
    this.boundMouseUp = this.handleDragEnd.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleDragEnd.bind(this);
  }

  /**
   * Show the cropper modal
   */
  async show() {
    try {
      this.img = await this.loadImage(this.file);
      this.render();
      this.bindEvents();
      
      // Wait for DOM to be ready, then initialize
      requestAnimationFrame(() => {
        this.initializeCrop();
        this.overlay?.classList.add("active");
      });

      // Prevent body scroll on mobile
      document.body.style.overflow = "hidden";
    } catch (err) {
      logManager.error("[ImageCropperModal] Failed to load image:", err);
      this.onCancel();
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
   * Hide and cleanup
   */
  hide() {
    document.removeEventListener("keydown", this.escHandler);
    document.removeEventListener("mousemove", this.boundMouseMove);
    document.removeEventListener("mouseup", this.boundMouseUp);
    document.removeEventListener("touchmove", this.boundTouchMove);
    document.removeEventListener("touchend", this.boundTouchEnd);

    document.body.style.overflow = "";

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
    document.querySelector(".image-cropper-modal-overlay")?.remove();

    this.overlay = document.createElement("div");
    this.overlay.className = "image-cropper-modal-overlay";
    this.overlay.innerHTML = `
      <div class="image-cropper-modal">
        <div class="cropper-header">
          <h2><i class="fas fa-crop-alt"></i> Adjust Cover</h2>
          <button class="cropper-close-btn" type="button" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="cropper-body">
          <!-- Aspect Ratio Selector -->
          <div class="aspect-ratio-selector">
            ${this.aspectRatios
              .map(
                (ar, i) => `
              <button type="button" class="aspect-btn ${i === 0 ? "active" : ""}" 
                      data-ratio="${ar.value}" data-id="${ar.id}">
                <div class="aspect-icon aspect-icon-${ar.id}"></div>
                <span>${ar.label}</span>
              </button>
            `
              )
              .join("")}
          </div>

          <!-- Canvas Container - Full width on mobile -->
          <div class="cropper-canvas-wrapper">
            <canvas id="cropperCanvas"></canvas>
          </div>

          <!-- Zoom Control -->
          <div class="zoom-control">
            <button type="button" class="zoom-btn" id="zoomOutBtn" aria-label="Zoom out">
              <i class="fas fa-minus"></i>
            </button>
            <div class="zoom-slider-wrapper">
              <input type="range" id="zoomSlider" min="100" max="300" value="100" />
            </div>
            <button type="button" class="zoom-btn" id="zoomInBtn" aria-label="Zoom in">
              <i class="fas fa-plus"></i>
            </button>
          </div>

          <div class="cropper-hint">
            <i class="fas fa-arrows-alt"></i>
            <span>Drag to reposition</span>
          </div>
        </div>

        <div class="cropper-footer">
          <button type="button" class="btn secondary" id="cropperCancelBtn">
            Cancel
          </button>
          <button type="button" class="btn primary" id="cropperConfirmBtn">
            <i class="fas fa-check"></i> Apply
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.canvas = this.overlay.querySelector("#cropperCanvas");
    this.ctx = this.canvas.getContext("2d");
  }

  /**
   * Initialize crop area based on image and aspect ratio
   */
  initializeCrop() {
    const wrapper = this.overlay.querySelector(".cropper-canvas-wrapper");
    const wrapperRect = wrapper.getBoundingClientRect();
    
    // Calculate display dimensions that fit within wrapper
    const maxWidth = wrapperRect.width - 16; // Small padding
    const maxHeight = Math.min(wrapperRect.height - 16, window.innerHeight * 0.45);

    let displayWidth, displayHeight;

    if (maxWidth / maxHeight > this.aspectRatio) {
      // Height constrained
      displayHeight = maxHeight;
      displayWidth = displayHeight * this.aspectRatio;
    } else {
      // Width constrained
      displayWidth = maxWidth;
      displayHeight = displayWidth / this.aspectRatio;
    }

    // Set canvas display size
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;

    // Set canvas internal resolution (higher for quality)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = displayWidth * dpr;
    this.canvas.height = displayHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Calculate base crop (what part of image is visible at zoom=1)
    this.calculateBaseCrop();

    // Reset zoom and pan
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    // Update slider
    const slider = this.overlay.querySelector("#zoomSlider");
    if (slider) slider.value = 100;

    this.draw();
  }

  /**
   * Calculate base crop rectangle (at zoom = 1)
   * This is the largest crop that maintains aspect ratio and fits the image
   */
  calculateBaseCrop() {
    const imgAspect = this.img.width / this.img.height;
    const cropAspect = this.aspectRatio;

    let cropWidth, cropHeight;

    if (imgAspect > cropAspect) {
      // Image is wider than crop - fit height
      cropHeight = this.img.height;
      cropWidth = cropHeight * cropAspect;
    } else {
      // Image is taller than crop - fit width
      cropWidth = this.img.width;
      cropHeight = cropWidth / cropAspect;
    }

    this.baseCropWidth = cropWidth;
    this.baseCropHeight = cropHeight;
  }

  /**
   * Draw the cropped view
   */
  draw() {
    if (!this.ctx || !this.img) return;

    const ctx = this.ctx;

    // Clear canvas
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    // Calculate current crop rect based on zoom and pan
    const cropWidth = this.baseCropWidth / this.zoom;
    const cropHeight = this.baseCropHeight / this.zoom;

    // Center of image + pan offset
    const centerX = this.img.width / 2 + this.panX;
    const centerY = this.img.height / 2 + this.panY;

    let cropX = centerX - cropWidth / 2;
    let cropY = centerY - cropHeight / 2;

    // Clamp to image bounds
    cropX = Math.max(0, Math.min(this.img.width - cropWidth, cropX));
    cropY = Math.max(0, Math.min(this.img.height - cropHeight, cropY));

    // Update pan to reflect clamping
    this.panX = (cropX + cropWidth / 2) - this.img.width / 2;
    this.panY = (cropY + cropHeight / 2) - this.img.height / 2;

    // Store for export
    this.cropRect = {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
    };

    // Draw the cropped portion of the image to fill the canvas
    ctx.drawImage(
      this.img,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      this.displayWidth,
      this.displayHeight
    );

    // Draw border and corners
    this.drawOverlay(ctx);
  }

  /**
   * Draw border and corner markers
   */
  drawOverlay(ctx) {
    const w = this.displayWidth;
    const h = this.displayHeight;

    // Border
    ctx.strokeStyle = "rgba(139, 125, 232, 0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Corner accents
    const size = Math.min(24, w * 0.08, h * 0.08);
    const offset = 3;

    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // Top-left
    ctx.beginPath();
    ctx.moveTo(offset, offset + size);
    ctx.lineTo(offset, offset);
    ctx.lineTo(offset + size, offset);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(w - offset - size, offset);
    ctx.lineTo(w - offset, offset);
    ctx.lineTo(w - offset, offset + size);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(offset, h - offset - size);
    ctx.lineTo(offset, h - offset);
    ctx.lineTo(offset + size, h - offset);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(w - offset - size, h - offset);
    ctx.lineTo(w - offset, h - offset);
    ctx.lineTo(w - offset, h - offset - size);
    ctx.stroke();
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const closeBtn = this.overlay.querySelector(".cropper-close-btn");
    const cancelBtn = this.overlay.querySelector("#cropperCancelBtn");
    const confirmBtn = this.overlay.querySelector("#cropperConfirmBtn");
    const aspectBtns = this.overlay.querySelectorAll(".aspect-btn");
    const zoomSlider = this.overlay.querySelector("#zoomSlider");
    const zoomInBtn = this.overlay.querySelector("#zoomInBtn");
    const zoomOutBtn = this.overlay.querySelector("#zoomOutBtn");

    // Close handlers
    closeBtn?.addEventListener("click", () => {
      this.hide();
      this.onCancel();
    });
    cancelBtn?.addEventListener("click", () => {
      this.hide();
      this.onCancel();
    });

    // Escape key
    this.escHandler = (e) => {
      if (e.key === "Escape") {
        this.hide();
        this.onCancel();
      }
    };
    document.addEventListener("keydown", this.escHandler);

    // Confirm
    confirmBtn?.addEventListener("click", () => this.handleConfirm());

    // Aspect ratio buttons
    aspectBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        aspectBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.aspectRatio = parseFloat(btn.dataset.ratio);
        this.initializeCrop();
      });
    });

    // Zoom slider
    zoomSlider?.addEventListener("input", (e) => {
      this.zoom = parseInt(e.target.value) / 100;
      this.draw();
    });

    // Zoom buttons
    zoomInBtn?.addEventListener("click", () => {
      this.setZoom(this.zoom + 0.25);
    });
    zoomOutBtn?.addEventListener("click", () => {
      this.setZoom(this.zoom - 0.25);
    });

    // Canvas drag events (mouse)
    this.canvas.addEventListener("mousedown", (e) => this.handleDragStart(e));
    document.addEventListener("mousemove", this.boundMouseMove);
    document.addEventListener("mouseup", this.boundMouseUp);

    // Canvas drag events (touch)
    this.canvas.addEventListener("touchstart", (e) => this.handleTouchStart(e), { passive: false });
    document.addEventListener("touchmove", this.boundTouchMove, { passive: false });
    document.addEventListener("touchend", this.boundTouchEnd);

    // Mouse wheel zoom
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.setZoom(this.zoom + delta);
    }, { passive: false });
  }

  /**
   * Set zoom with constraints and update UI
   */
  setZoom(newZoom) {
    this.zoom = Math.max(1, Math.min(3, newZoom));
    this.draw();
    this.updateZoomSlider();
  }

  /**
   * Update zoom slider to match current zoom
   */
  updateZoomSlider() {
    const slider = this.overlay?.querySelector("#zoomSlider");
    if (slider) {
      slider.value = Math.round(this.zoom * 100);
    }
  }

  /**
   * Handle drag start
   */
  handleDragStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.style.cursor = "grabbing";
  }

  /**
   * Handle touch start
   */
  handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      this.initialZoom = this.zoom;
      this.isDragging = false;
    } else if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    }
  }

  /**
   * Handle drag move
   */
  handleDragMove(e) {
    if (!this.isDragging) return;

    const x = e.clientX;
    const y = e.clientY;

    // Convert screen movement to image coordinates
    // Screen pixels to crop pixels, then to image pixels
    const cropWidth = this.baseCropWidth / this.zoom;
    const cropHeight = this.baseCropHeight / this.zoom;
    const scaleX = cropWidth / this.displayWidth;
    const scaleY = cropHeight / this.displayHeight;

    const dx = (x - this.lastX) * scaleX;
    const dy = (y - this.lastY) * scaleY;

    // Reverse direction: drag right moves view right (pan left)
    this.panX -= dx;
    this.panY -= dy;

    this.draw();

    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Handle touch move
   */
  handleTouchMove(e) {
    if (e.touches?.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const scaleChange = distance / this.initialPinchDistance;
      this.setZoom(this.initialZoom * scaleChange);
    } else if (this.isDragging && e.touches?.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      
      const cropWidth = this.baseCropWidth / this.zoom;
      const cropHeight = this.baseCropHeight / this.zoom;
      const scaleX = cropWidth / this.displayWidth;
      const scaleY = cropHeight / this.displayHeight;

      const dx = (touch.clientX - this.lastX) * scaleX;
      const dy = (touch.clientY - this.lastY) * scaleY;

      this.panX -= dx;
      this.panY -= dy;

      this.draw();

      this.lastX = touch.clientX;
      this.lastY = touch.clientY;
    }
  }

  /**
   * Handle drag end
   */
  handleDragEnd() {
    this.isDragging = false;
    if (this.canvas) {
      this.canvas.style.cursor = "grab";
    }
  }

  /**
   * Handle confirm - export cropped image
   */
  async handleConfirm() {
    const confirmBtn = this.overlay.querySelector("#cropperConfirmBtn");
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;
    confirmBtn.disabled = true;

    try {
      // Calculate output dimensions maintaining aspect ratio
      const outputWidth = Math.min(this.outputWidth, Math.round(this.cropRect.width));
      const outputHeight = Math.round(outputWidth / this.aspectRatio);

      // Create output canvas
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = outputWidth;
      outputCanvas.height = outputHeight;
      const outCtx = outputCanvas.getContext("2d");

      // Draw cropped region at output size
      outCtx.drawImage(
        this.img,
        this.cropRect.x,
        this.cropRect.y,
        this.cropRect.width,
        this.cropRect.height,
        0,
        0,
        outputWidth,
        outputHeight
      );

      // Convert to blob
      const blob = await new Promise((resolve) => {
        outputCanvas.toBlob(resolve, "image/webp", 0.85);
      });

      // Generate preview URL
      const previewUrl = outputCanvas.toDataURL("image/webp", 0.8);

      logManager.info("[ImageCropperModal] Cropped image:", {
        cropRect: this.cropRect,
        output: { width: outputWidth, height: outputHeight },
        blobSize: blob.size,
      });

      this.hide();
      this.onConfirm({
        blob,
        previewUrl,
        aspectRatio: this.aspectRatio,
        width: outputWidth,
        height: outputHeight,
      });
    } catch (err) {
      logManager.error("[ImageCropperModal] Failed to process image:", err);
      confirmBtn.innerHTML = originalText;
      confirmBtn.disabled = false;
    }
  }
}

/**
 * Helper to show the cropper modal
 */
export function showImageCropper(options) {
  const modal = new ImageCropperModal(options);
  modal.show();
  return modal;
}
