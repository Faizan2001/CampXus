/**
 * CreateEventModal - Modal for creating/editing club events
 * Self-contained component that renders its own overlay
 * Supports both CREATE and EDIT modes
 * Supports multi-time-slot events (multi-day events)
 */

import { currentUser } from "../../store/userStore.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";
import { logManager } from "../../utils/debug/LogManager.js";

export class CreateEventModal {
  constructor(options = {}) {
    this.clubId = options.clubId;
    this.clubName = options.clubName || "Club";
    this.clubData = options.clubData || null; // Club data for role checking
    this.onSuccess = options.onSuccess || (() => {});
    this.onClose = options.onClose || (() => {});

    // Edit mode: if event is provided, we're editing
    this.editMode = !!options.event;
    this.event = options.event || null;

    this.overlay = null;
    this.isSubmitting = false;

    // Image upload state
    this.selectedImageFile = null;
    this.croppedImageBlob = null;
    this.imagePreviewUrl = null;
    this.originalImageUrl = this.event?.imageUrl || null; // Persisted image when modal opens
    this.existingImageUrl = this.originalImageUrl;
    this.hasStagedReplacement = false; // True when a new (unsaved) image has been selected
    this.removeExistingImage = false;
    this.selectedAspectRatio = 16 / 9;

    // Time slots state - supports multi-day events
    this.timeSlots = this.initializeTimeSlots();
    this.slotCounter = this.timeSlots.length; // For unique IDs
  }

  /**
   * Format a Date to local YYYY-MM-DD string (avoids timezone issues with toISOString)
   */
  formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Initialize time slots from existing event or defaults
   */
  initializeTimeSlots() {
    if (this.editMode && this.event?.timeSlots?.length > 0) {
      // Use existing slots from event being edited
      return this.event.timeSlots.map((slot, index) => ({
        id: index + 1,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));
    }

    // Default: single slot for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return [
      {
        id: 1,
        date: this.formatLocalDate(tomorrow),
        startTime: "17:00",
        endTime: "19:00",
      },
    ];
  }

  /**
   * Render all time slots HTML
   */
  renderTimeSlots(dateMin) {
    return this.timeSlots
      .map((slot, index) => this.renderTimeSlotRow(slot, index, dateMin))
      .join("");
  }

  /**
   * Format date for display (e.g., "Nov 29, 2025")
   */
  formatDateDisplay(dateStr) {
    if (!dateStr) return "Select date";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  /**
   * Format time for display (e.g., "5:30 PM")
   */
  formatTimeDisplay(timeStr) {
    if (!timeStr) return "--:--";
    const [hours, minutes] = timeStr.split(":");
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  }

  /**
   * Render a single time slot row - Modern 2025 Design with Custom Pickers
   */
  renderTimeSlotRow(slot, index, dateMin) {
    const canRemove = this.timeSlots.length > 1;
    const slotNumber = index + 1;

    return `
      <div class="schedule-card" data-slot-id="${slot.id}">
        <div class="schedule-card-header">
          <div class="schedule-day-badge">
            <span class="day-number">${slotNumber}</span>
            <span class="day-label">${
              this.timeSlots.length > 1 ? `Day ${slotNumber}` : "Schedule"
            }</span>
          </div>
          ${
            canRemove
              ? `
            <button type="button" class="schedule-remove-btn" data-slot-id="${slot.id}" aria-label="Remove day ${slotNumber}">
              <i class="fas fa-trash-alt"></i>
            </button>
          `
              : ""
          }
        </div>
        
        <div class="schedule-card-body">
          <!-- Date Picker - Clickable -->
          <div class="schedule-date-picker" data-slot-id="${
            slot.id
          }" tabindex="0" role="button" aria-label="Select date">
            <div class="picker-icon">
              <i class="fas fa-calendar-day"></i>
            </div>
            <div class="picker-content">
              <span class="picker-label">Date</span>
              <span class="picker-value date-display">${this.formatDateDisplay(
                slot.date
              )}</span>
              <input 
                type="date" 
                name="slotDate_${slot.id}" 
                value="${slot.date}"
                min="${dateMin}"
                class="schedule-date-input hidden-native-input"
                required
              />
            </div>
            <div class="picker-arrow">
              <i class="fas fa-chevron-down"></i>
            </div>
          </div>
          
          <!-- Time Range Picker -->
          <div class="schedule-time-range">
            <div class="time-picker start-time" data-slot-id="${
              slot.id
            }" data-type="start" tabindex="0" role="button" aria-label="Select start time">
              <div class="picker-icon start">
                <i class="fas fa-play"></i>
              </div>
              <div class="picker-content">
                <span class="picker-label">Starts</span>
                <span class="picker-value time-display">${this.formatTimeDisplay(
                  slot.startTime
                )}</span>
                <input 
                  type="time" 
                  name="slotStartTime_${slot.id}" 
                  value="${slot.startTime}"
                  class="schedule-time-input hidden-native-input"
                  required
                />
              </div>
            </div>
            
            <div class="time-range-connector">
              <span class="connector-icon">→</span>
            </div>
            
            <div class="time-picker end-time" data-slot-id="${
              slot.id
            }" data-type="end" tabindex="0" role="button" aria-label="Select end time">
              <div class="picker-icon end">
                <i class="fas fa-stop"></i>
              </div>
              <div class="picker-content">
                <span class="picker-label">Ends</span>
                <span class="picker-value time-display">${this.formatTimeDisplay(
                  slot.endTime
                )}</span>
                <input 
                  type="time" 
                  name="slotEndTime_${slot.id}" 
                  value="${slot.endTime}"
                  class="schedule-time-input hidden-native-input"
                  required
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Add a new time slot
   */
  addTimeSlot() {
    // Get values from the last slot to use as defaults
    const lastSlot = this.timeSlots[this.timeSlots.length - 1];

    // Default to next day after last slot
    const lastDate = new Date(lastSlot.date + "T00:00:00");
    lastDate.setDate(lastDate.getDate() + 1);

    this.slotCounter++;
    const newSlot = {
      id: this.slotCounter,
      date: this.formatLocalDate(lastDate),
      startTime: lastSlot.startTime,
      endTime: lastSlot.endTime,
    };

    this.timeSlots.push(newSlot);
    this.rerenderTimeSlots();
  }

  /**
   * Remove a time slot by ID
   */
  removeTimeSlot(slotId) {
    if (this.timeSlots.length <= 1) return; // Keep at least one

    this.timeSlots = this.timeSlots.filter((s) => s.id !== slotId);
    this.rerenderTimeSlots();
  }

  /**
   * Re-render time slots and rebind events
   */
  rerenderTimeSlots() {
    const container = this.overlay?.querySelector("#timeSlotsContainer");
    if (!container) return;

    const today = this.formatLocalDate(new Date());
    const hasAnyPastDate = this.timeSlots.some((slot) => slot.date < today);
    const dateMin = hasAnyPastDate ? this.timeSlots[0].date : today;

    container.innerHTML = this.renderTimeSlots(dateMin);
    this.bindTimeSlotEvents();

    // Update section hint
    const sectionHint = this.overlay?.querySelector(
      ".form-section-title .section-hint"
    );
    if (sectionHint) {
      sectionHint.textContent =
        this.timeSlots.length > 1 ? `${this.timeSlots.length} days` : "";
    }
  }

  /**
   * Bind events for time slot add/remove buttons and custom pickers
   */
  bindTimeSlotEvents() {
    // Remove slot buttons
    this.overlay?.querySelectorAll(".schedule-remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slotId = parseInt(btn.dataset.slotId, 10);
        this.removeTimeSlot(slotId);
      });
    });

    // Date picker click handlers
    this.overlay
      ?.querySelectorAll(".schedule-date-picker")
      .forEach((picker) => {
        picker.addEventListener("click", (e) => {
          e.preventDefault();
          const slotId = parseInt(picker.dataset.slotId, 10);
          this.showDatePicker(slotId, picker);
        });
        picker.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const slotId = parseInt(picker.dataset.slotId, 10);
            this.showDatePicker(slotId, picker);
          }
        });
      });

    // Time picker click handlers
    this.overlay?.querySelectorAll(".time-picker").forEach((picker) => {
      picker.addEventListener("click", (e) => {
        e.preventDefault();
        const slotId = parseInt(picker.dataset.slotId, 10);
        const type = picker.dataset.type; // 'start' or 'end'
        this.showTimePicker(slotId, type, picker);
      });
      picker.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const slotId = parseInt(picker.dataset.slotId, 10);
          const type = picker.dataset.type;
          this.showTimePicker(slotId, type, picker);
        }
      });
    });

    // Sync hidden input changes to state
    this.overlay?.querySelectorAll(".schedule-card").forEach((row) => {
      const slotId = parseInt(row.dataset.slotId, 10);
      const slot = this.timeSlots.find((s) => s.id === slotId);
      if (!slot) return;

      row
        .querySelector(`[name="slotDate_${slotId}"]`)
        ?.addEventListener("change", (e) => {
          slot.date = e.target.value;
          // Update display
          const display = row.querySelector(
            ".schedule-date-picker .date-display"
          );
          if (display)
            display.textContent = this.formatDateDisplay(e.target.value);
        });
      row
        .querySelector(`[name="slotStartTime_${slotId}"]`)
        ?.addEventListener("change", (e) => {
          slot.startTime = e.target.value;
          const display = row.querySelector(".start-time .time-display");
          if (display)
            display.textContent = this.formatTimeDisplay(e.target.value);
        });
      row
        .querySelector(`[name="slotEndTime_${slotId}"]`)
        ?.addEventListener("change", (e) => {
          slot.endTime = e.target.value;
          const display = row.querySelector(".end-time .time-display");
          if (display)
            display.textContent = this.formatTimeDisplay(e.target.value);
        });
    });
  }

  /**
   * Show custom date picker modal
   */
  showDatePicker(slotId, triggerElement) {
    const slot = this.timeSlots.find((s) => s.id === slotId);
    if (!slot) return;

    const currentDate = slot.date
      ? new Date(slot.date + "T00:00:00")
      : new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use class method for consistent date formatting
    const formatLocalDate = (date) => this.formatLocalDate(date);

    // Create date picker modal
    const pickerOverlay = document.createElement("div");
    pickerOverlay.className = "custom-picker-overlay";
    pickerOverlay.innerHTML = `
      <div class="custom-picker date-picker-modal">
        <div class="picker-modal-header">
          <h3><i class="fas fa-calendar-day"></i> Select Date</h3>
          <button type="button" class="picker-close-btn"><i class="fas fa-times"></i></button>
        </div>
        <div class="picker-modal-body">
          <div class="calendar-nav">
            <button type="button" class="cal-nav-btn prev-month"><i class="fas fa-chevron-left"></i></button>
            <span class="cal-month-year"></span>
            <button type="button" class="cal-nav-btn next-month"><i class="fas fa-chevron-right"></i></button>
          </div>
          <div class="calendar-weekdays">
            <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
          </div>
          <div class="calendar-days"></div>
        </div>
        <div class="picker-modal-footer">
          <button type="button" class="picker-today-btn">Today</button>
        </div>
      </div>
    `;

    document.body.appendChild(pickerOverlay);

    let viewDate = new Date(currentDate);
    const selectedDate = new Date(currentDate);

    const renderCalendar = () => {
      const monthYear = pickerOverlay.querySelector(".cal-month-year");
      const daysContainer = pickerOverlay.querySelector(".calendar-days");

      monthYear.textContent = viewDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });

      const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      const lastDay = new Date(
        viewDate.getFullYear(),
        viewDate.getMonth() + 1,
        0
      );
      const startPadding = firstDay.getDay();

      let html = "";

      // Padding days
      for (let i = 0; i < startPadding; i++) {
        html += '<span class="cal-day empty"></span>';
      }

      // Actual days
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
        const isPast = date < today;
        const isSelected = date.toDateString() === selectedDate.toDateString();
        const isToday = date.toDateString() === today.toDateString();

        const classes = ["cal-day"];
        if (isPast) classes.push("disabled");
        if (isSelected) classes.push("selected");
        if (isToday) classes.push("today");
        // Use LOCAL date format, not UTC!
        const dateAttr = formatLocalDate(date);
        html +=
          '<span class="' +
          classes.join(" ") +
          '" data-date="' +
          dateAttr +
          '">' +
          d +
          "</span>";
      }

      daysContainer.innerHTML = html;
    };

    renderCalendar();

    // Event handlers
    pickerOverlay.querySelector(".prev-month").addEventListener("click", () => {
      viewDate.setMonth(viewDate.getMonth() - 1);
      renderCalendar();
    });

    pickerOverlay.querySelector(".next-month").addEventListener("click", () => {
      viewDate.setMonth(viewDate.getMonth() + 1);
      renderCalendar();
    });

    pickerOverlay
      .querySelector(".picker-today-btn")
      .addEventListener("click", () => {
        const todayStr = formatLocalDate(today);
        this.setDateValue(slotId, todayStr);
        pickerOverlay.remove();
      });

    pickerOverlay
      .querySelector(".calendar-days")
      .addEventListener("click", (e) => {
        const day = e.target.closest(".cal-day:not(.empty):not(.disabled)");
        if (day) {
          const dateStr = day.dataset.date;
          this.setDateValue(slotId, dateStr);
          pickerOverlay.remove();
        }
      });

    pickerOverlay
      .querySelector(".picker-close-btn")
      .addEventListener("click", () => {
        pickerOverlay.remove();
      });

    pickerOverlay.addEventListener("click", (e) => {
      if (e.target === pickerOverlay) {
        pickerOverlay.remove();
      }
    });

    // Animate in
    requestAnimationFrame(() => {
      pickerOverlay.classList.add("active");
    });
  }

  /**
   * Set date value and update display
   */
  setDateValue(slotId, dateStr) {
    const slot = this.timeSlots.find((s) => s.id === slotId);
    if (!slot) return;

    slot.date = dateStr;

    const card = this.overlay?.querySelector(
      '.schedule-card[data-slot-id="' + slotId + '"]'
    );
    if (card) {
      const input = card.querySelector('[name="slotDate_' + slotId + '"]');
      const display = card.querySelector(".date-display");
      if (input) input.value = dateStr;
      if (display) display.textContent = this.formatDateDisplay(dateStr);
    }
  }

  /**
   * Show custom time picker modal with smooth physics scrolling
   */
  showTimePicker(slotId, type, triggerElement) {
    const slot = this.timeSlots.find((s) => s.id === slotId);
    if (!slot) return;

    const currentTime = type === "start" ? slot.startTime : slot.endTime;
    let [hour24, minute] = (currentTime || "12:00").split(":").map(Number);

    // Round minutes to nearest 5 and keep within 0-55
    let roundedMinute = Math.round((Number.isNaN(minute) ? 0 : minute) / 5) * 5;
    if (roundedMinute === 60) {
      roundedMinute = 0;
      hour24 = (hour24 + 1) % 24;
    }

    // Create time picker modal
    const pickerOverlay = document.createElement("div");
    pickerOverlay.className = "custom-picker-overlay";

    const headerText = type === "start" ? "Start" : "End";
    pickerOverlay.innerHTML = `
	      <div class="custom-picker time-picker-modal">
	        <div class="picker-modal-header">
	          <h3><i class="fas fa-clock"></i> Select ${headerText} Time</h3>
	          <button type="button" class="picker-close-btn"><i class="fas fa-times"></i></button>
	        </div>
	        <div class="picker-modal-body">
	          <div class="time-picker-wheels">
	            <div class="time-wheel hour-wheel">
	              <div class="wheel-label">Hour</div>
	              <div class="wheel-scroll-container">
	                <div class="wheel-scroll" data-wheel="hour"></div>
	                <div class="wheel-highlight"></div>
	              </div>
	            </div>
	            <div class="time-separator">:</div>
	            <div class="time-wheel minute-wheel">
	              <div class="wheel-label">Min</div>
	              <div class="wheel-scroll-container">
	                <div class="wheel-scroll" data-wheel="minute"></div>
	                <div class="wheel-highlight"></div>
	              </div>
	            </div>
	            <div class="time-wheel ampm-wheel">
	              <div class="wheel-label"></div>
	              <div class="wheel-scroll-container">
	                <div class="wheel-scroll" data-wheel="ampm"></div>
	                <div class="wheel-highlight"></div>
	              </div>
	            </div>
	          </div>
	        </div>
	        <div class="picker-modal-footer">
	          <button type="button" class="picker-cancel-btn">Cancel</button>
	          <button type="button" class="picker-confirm-btn">Set Time</button>
	        </div>
	      </div>
	    `;

    document.body.appendChild(pickerOverlay);

    // State
    let selectedHour = hour24 % 12 || 12;
    let selectedMinute = roundedMinute;
    let selectedAmPm = hour24 >= 12 ? "PM" : "AM";

    const ITEM_HEIGHT = 44; // Height of each wheel item in pixels
    const VISIBLE_ITEMS = 5; // Number of visible items
    const CENTER_OFFSET = Math.floor(VISIBLE_ITEMS / 2) * ITEM_HEIGHT;

    // Store cleanup functions for event listeners
    const cleanupFunctions = [];

    /**
     * Smooth iOS-style wheel picker with momentum scrolling
     */
    const setupWheelScroll = (container, items, initialIndex, onSelect) => {
      let position = initialIndex * ITEM_HEIGHT;
      let velocity = 0;
      let amplitude = 0;
      let timestamp = 0;
      let target = position;

      let isDragging = false;
      let dragStartY = 0;
      let dragStartPosition = 0;
      let lastDragY = 0;
      let lastDragTime = 0;
      let trackingPoints = [];

      let animationId = null;
      let wheelTimeout = null;

      const minPosition = 0;
      const maxPosition = (items.length - 1) * ITEM_HEIGHT;

      // Clamp position within bounds with rubber band effect
      const clampPosition = (pos, allowOverscroll = false) => {
        if (allowOverscroll) {
          const overscroll = ITEM_HEIGHT * 0.5;
          if (pos < minPosition) {
            return minPosition - (minPosition - pos) * 0.3;
          }
          if (pos > maxPosition) {
            return maxPosition + (pos - maxPosition) * 0.3;
          }
        }
        return Math.max(minPosition, Math.min(maxPosition, pos));
      };

      // Render the wheel at current position
      const render = () => {
        const clampedPos = clampPosition(position, isDragging);
        container.style.transform = `translateY(${
          CENTER_OFFSET - clampedPos
        }px)`;

        const centerIndex = Math.round(clampedPos / ITEM_HEIGHT);
        const safeIndex = Math.max(0, Math.min(items.length - 1, centerIndex));

        container.querySelectorAll(".wheel-item").forEach((item, idx) => {
          const distance = Math.abs(idx - clampedPos / ITEM_HEIGHT);
          const isCenter =
            idx === safeIndex &&
            Math.abs(clampedPos - safeIndex * ITEM_HEIGHT) < ITEM_HEIGHT * 0.5;

          item.classList.toggle("selected", isCenter);

          // Smooth opacity and scale based on distance
          const opacity = Math.max(0.25, 1 - distance * 0.3);
          const scale = Math.max(0.8, 1 - distance * 0.1);

          item.style.opacity = opacity;
          item.style.transform = `scale(${scale})`;
        });
      };

      // Snap to nearest item with smooth animation
      const snapToNearest = () => {
        const nearestIndex = Math.round(position / ITEM_HEIGHT);
        const clampedIndex = Math.max(
          0,
          Math.min(items.length - 1, nearestIndex)
        );
        target = clampedIndex * ITEM_HEIGHT;

        onSelect(items[clampedIndex], clampedIndex);

        const animateSnap = () => {
          const diff = target - position;
          if (Math.abs(diff) < 0.3) {
            position = target;
            render();
            animationId = null;
            return;
          }

          // Smooth easing
          position += diff * 0.18;
          render();
          animationId = requestAnimationFrame(animateSnap);
        };

        if (animationId) cancelAnimationFrame(animationId);
        animateSnap();
      };

      // Momentum scroll with deceleration
      const momentumScroll = () => {
        if (isDragging) return;

        const elapsed = Date.now() - timestamp;
        const decay = Math.exp(-elapsed / 325); // Time constant for decay

        if (Math.abs(amplitude) > 0.5 && decay > 0.01) {
          position = target - amplitude * decay;

          // Rubber band at edges
          if (position < minPosition || position > maxPosition) {
            position = clampPosition(position, true);
            amplitude *= 0.5; // Reduce amplitude when hitting edge
          }

          render();
          animationId = requestAnimationFrame(momentumScroll);
        } else {
          // Snap to nearest when momentum dies
          snapToNearest();
        }
      };

      // Calculate velocity from tracking points
      const calculateVelocity = () => {
        const now = Date.now();
        // Only use points from last 100ms
        const recentPoints = trackingPoints.filter((p) => now - p.time < 100);

        if (recentPoints.length < 2) return 0;

        const first = recentPoints[0];
        const last = recentPoints[recentPoints.length - 1];
        const dt = last.time - first.time;

        if (dt === 0) return 0;

        return ((last.y - first.y) / dt) * 1000; // pixels per second
      };

      // Start drag
      const handleDragStart = (clientY) => {
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
        if (wheelTimeout) {
          clearTimeout(wheelTimeout);
          wheelTimeout = null;
        }

        isDragging = true;
        dragStartY = clientY;
        dragStartPosition = position;
        lastDragY = clientY;
        lastDragTime = Date.now();
        trackingPoints = [{ y: clientY, time: Date.now() }];
        velocity = 0;
        amplitude = 0;
      };

      // During drag
      const handleDragMove = (clientY) => {
        if (!isDragging) return;

        const deltaY = dragStartY - clientY;
        position = dragStartPosition + deltaY;

        // Track points for velocity calculation
        const now = Date.now();
        trackingPoints.push({ y: clientY, time: now });
        // Keep only last 5 points
        if (trackingPoints.length > 5) trackingPoints.shift();

        lastDragY = clientY;
        lastDragTime = now;

        render();
      };

      // End drag
      const handleDragEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        // Calculate velocity
        const v = -calculateVelocity(); // Negative because drag up = scroll down

        if (Math.abs(v) > 100) {
          // Start momentum scroll
          velocity = v;
          amplitude = velocity * 0.8;
          timestamp = Date.now();
          target = position + amplitude;

          // Clamp target to valid range
          const nearestTarget = Math.round(target / ITEM_HEIGHT) * ITEM_HEIGHT;
          target = Math.max(minPosition, Math.min(maxPosition, nearestTarget));
          amplitude = target - position;

          animationId = requestAnimationFrame(momentumScroll);
        } else {
          // Just snap
          snapToNearest();
        }
      };

      // Mouse wheel handler
      const handleWheel = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }

        // Smooth wheel scrolling
        const delta = e.deltaY > 0 ? ITEM_HEIGHT * 0.4 : -ITEM_HEIGHT * 0.4;
        position = clampPosition(position + delta, false);
        render();

        // Debounce snap
        if (wheelTimeout) clearTimeout(wheelTimeout);
        wheelTimeout = setTimeout(() => {
          snapToNearest();
        }, 120);
      };

      // Get scroll container
      const scrollContainer = container.parentElement;

      // Touch events
      scrollContainer.addEventListener(
        "touchstart",
        (e) => {
          handleDragStart(e.touches[0].clientY);
        },
        { passive: true }
      );

      scrollContainer.addEventListener(
        "touchmove",
        (e) => {
          e.preventDefault();
          handleDragMove(e.touches[0].clientY);
        },
        { passive: false }
      );

      scrollContainer.addEventListener("touchend", handleDragEnd);
      scrollContainer.addEventListener("touchcancel", handleDragEnd);

      // Mouse events
      const handleMouseDown = (e) => {
        e.preventDefault();
        handleDragStart(e.clientY);
      };

      const handleMouseMove = (e) => {
        if (isDragging) {
          e.preventDefault();
          handleDragMove(e.clientY);
        }
      };

      const handleMouseUp = () => {
        handleDragEnd();
      };

      scrollContainer.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      // Mouse wheel
      scrollContainer.addEventListener("wheel", handleWheel, {
        passive: false,
      });

      // Click to select specific item
      const handleClick = (e) => {
        // Ignore if was dragging
        if (Math.abs(dragStartY - e.clientY) > 8) return;

        const item = e.target.closest(".wheel-item");
        if (!item) return;

        const idx = Array.from(container.children).indexOf(item);
        if (idx === -1) return;

        target = idx * ITEM_HEIGHT;
        onSelect(items[idx], idx);

        if (animationId) cancelAnimationFrame(animationId);

        const animateToTarget = () => {
          const diff = target - position;
          if (Math.abs(diff) < 0.3) {
            position = target;
            render();
            return;
          }
          position += diff * 0.15;
          render();
          animationId = requestAnimationFrame(animateToTarget);
        };
        animateToTarget();
      };

      container.addEventListener("click", handleClick);

      // Cleanup
      cleanupFunctions.push(() => {
        if (animationId) cancelAnimationFrame(animationId);
        if (wheelTimeout) clearTimeout(wheelTimeout);
        scrollContainer.removeEventListener("touchstart", handleDragStart);
        scrollContainer.removeEventListener("touchmove", handleDragMove);
        scrollContainer.removeEventListener("touchend", handleDragEnd);
        scrollContainer.removeEventListener("touchcancel", handleDragEnd);
        scrollContainer.removeEventListener("mousedown", handleMouseDown);
        scrollContainer.removeEventListener("wheel", handleWheel);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        container.removeEventListener("click", handleClick);
      });

      // Initial render
      render();

      return {
        scrollTo: (idx) => {
          position = idx * ITEM_HEIGHT;
          render();
        },
      };
    };

    // Hours (1-12)
    const hours = Array.from({ length: 12 }, (_, i) => i + 1);
    const hourContainer = pickerOverlay.querySelector('[data-wheel="hour"]');
    hourContainer.innerHTML = hours
      .map((h) => `<div class="wheel-item" data-value="${h}">${h}</div>`)
      .join("");

    const hourScroll = setupWheelScroll(
      hourContainer,
      hours,
      hours.indexOf(selectedHour),
      (val) => {
        selectedHour = val;
      }
    );

    // Minutes (0, 5, 10, ... 55)
    const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
    const minuteContainer = pickerOverlay.querySelector(
      '[data-wheel="minute"]'
    );
    minuteContainer.innerHTML = minutes
      .map(
        (m) =>
          `<div class="wheel-item" data-value="${m}">${m
            .toString()
            .padStart(2, "0")}</div>`
      )
      .join("");

    const minuteScroll = setupWheelScroll(
      minuteContainer,
      minutes,
      minutes.indexOf(selectedMinute),
      (val) => {
        selectedMinute = val;
      }
    );

    // AM/PM - Simple toggle instead of scroll wheel
    const ampmOptions = ["AM", "PM"];
    const ampmContainer = pickerOverlay.querySelector('[data-wheel="ampm"]');

    const renderAmPm = () => {
      ampmContainer.innerHTML = ampmOptions
        .map(
          (ap) =>
            `<div class="wheel-item ampm-item ${
              ap === selectedAmPm ? "selected" : ""
            }" data-value="${ap}">${ap}</div>`
        )
        .join("");
    };
    renderAmPm();

    // Simple click toggle for AM/PM
    const ampmScrollContainer = ampmContainer.parentElement;
    const handleAmPmClick = (e) => {
      const item = e.target.closest(".wheel-item");
      if (item) {
        selectedAmPm = item.dataset.value;
        renderAmPm();
      }
    };

    // Wheel scroll to toggle
    const handleAmPmWheel = (e) => {
      e.preventDefault();
      selectedAmPm = selectedAmPm === "AM" ? "PM" : "AM";
      renderAmPm();
    };

    ampmScrollContainer.addEventListener("click", handleAmPmClick);
    ampmScrollContainer.addEventListener("wheel", handleAmPmWheel, {
      passive: false,
    });

    cleanupFunctions.push(() => {
      ampmScrollContainer.removeEventListener("click", handleAmPmClick);
      ampmScrollContainer.removeEventListener("wheel", handleAmPmWheel);
    });

    // Helper to cleanup and remove
    const closeAndCleanup = () => {
      cleanupFunctions.forEach((fn) => fn());
      pickerOverlay.remove();
    };

    // Confirm
    pickerOverlay
      .querySelector(".picker-confirm-btn")
      .addEventListener("click", () => {
        let hour24 = selectedHour;
        if (selectedAmPm === "PM" && selectedHour !== 12) hour24 += 12;
        if (selectedAmPm === "AM" && selectedHour === 12) hour24 = 0;

        const timeStr =
          hour24.toString().padStart(2, "0") +
          ":" +
          selectedMinute.toString().padStart(2, "0");
        this.setTimeValue(slotId, type, timeStr);
        closeAndCleanup();
      });

    // Cancel / Close
    pickerOverlay
      .querySelector(".picker-cancel-btn")
      .addEventListener("click", () => {
        closeAndCleanup();
      });

    pickerOverlay
      .querySelector(".picker-close-btn")
      .addEventListener("click", () => {
        closeAndCleanup();
      });

    pickerOverlay.addEventListener("click", (e) => {
      if (e.target === pickerOverlay) {
        closeAndCleanup();
      }
    });

    // Animate in
    requestAnimationFrame(() => {
      pickerOverlay.classList.add("active");
    });
  }

  /**
   * Set time value and update display
   */
  setTimeValue(slotId, type, timeStr) {
    const slot = this.timeSlots.find((s) => s.id === slotId);
    if (!slot) return;

    if (type === "start") {
      slot.startTime = timeStr;
    } else {
      slot.endTime = timeStr;
    }

    const card = this.overlay?.querySelector(
      '.schedule-card[data-slot-id="' + slotId + '"]'
    );
    if (card) {
      const inputName =
        type === "start" ? "slotStartTime_" + slotId : "slotEndTime_" + slotId;
      const input = card.querySelector('[name="' + inputName + '"]');
      const display = card.querySelector("." + type + "-time .time-display");
      if (input) input.value = timeStr;
      if (display) display.textContent = this.formatTimeDisplay(timeStr);
    }
  }

  /**
   * Collect all time slots from the form
   */
  collectTimeSlots() {
    return this.timeSlots.map((slot) => ({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
  }

  /**
   * Validate all time slots
   * Note: Overnight events (e.g., 10PM-1AM) are allowed - end time on next day is implicit
   */
  validateTimeSlots() {
    for (let i = 0; i < this.timeSlots.length; i++) {
      const slot = this.timeSlots[i];

      if (!slot.date || !slot.startTime || !slot.endTime) {
        return {
          valid: false,
          error: `Day ${i + 1}: Please fill in all date and time fields`,
        };
      }

      // Note: We allow end time to be "before" start time for overnight events
      // e.g., 10:00 PM (22:00) to 1:00 AM (01:00) is valid - ends next day
      // This is handled in time calculations by adding a day when end < start
    }

    return { valid: true };
  }

  /**
   * Check if current user is the club president (can auto-approve events)
   */
  isUserPresident() {
    const uid = currentUser?.uid;
    if (!uid || !this.clubData) return false;

    // DevTest: devOwnerUid is treated as president
    if (this.clubData.devTest && this.clubData.devOwnerUid === uid) return true;

    // Production: presidentId or createdBy
    if (this.clubData.presidentId === uid) return true;
    if (this.clubData.createdBy === uid) return true;

    return false;
  }

  /**
   * Show the modal
   */
  show() {
    this.render();
    this.bindEvents();

    // Animate in
    requestAnimationFrame(() => {
      this.overlay?.classList.add("active");
    });
  }

  /**
   * Hide and destroy the modal
   */
  hide() {
    // Remove escape handler to prevent leaks
    if (this.escHandler) {
      document.removeEventListener("keydown", this.escHandler);
      this.escHandler = null;
    }
    if (this.overlay) {
      this.overlay.classList.remove("active");
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 300);
    }
    this.onClose();
  }

  /**
   * Render the modal DOM
   */
  render() {
    // Remove any existing modal
    document.querySelector(".create-event-modal-overlay")?.remove();

    // Get default values for text fields
    let defaultTitle, defaultDescription, defaultLocation;

    if (this.editMode && this.event) {
      defaultTitle = this.event.title || "";
      defaultDescription = this.event.description || "";
      defaultLocation = this.event.location || "";
    } else {
      defaultTitle = "";
      defaultDescription = "";
      defaultLocation = "";
    }

    // For date picker min - use today for new events
    const today = this.formatLocalDate(new Date());

    // In edit mode, allow past dates if event already has them
    const hasAnyPastDate = this.timeSlots.some((slot) => slot.date < today);
    const dateMin = hasAnyPastDate ? this.timeSlots[0].date : today;

    const modalTitle = this.editMode ? "Edit Event" : "Create Event";
    const submitText = this.editMode ? "Save Changes" : "Create Event";
    const submitIcon = this.editMode ? "fa-save" : "fa-sparkles";

    this.overlay = document.createElement("div");
    this.overlay.className = "create-event-modal-overlay";
    this.overlay.innerHTML = `
      <div class="create-event-modal">
        <div class="modal-header">
          <h2><i class="fas ${
            this.editMode ? "fa-edit" : "fa-calendar-plus"
          }"></i> ${modalTitle}</h2>
          <button class="modal-close-btn" type="button" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <form class="event-form" id="createEventForm">
          <!-- Event Details Section -->
          <div class="form-section">
            <div class="form-section-title">
              <i class="fas fa-info-circle"></i> Event Details
            </div>
            
            <div class="form-group">
              <label for="eventTitle">
                <i class="fas fa-heading"></i> Title
              </label>
              <input 
                type="text" 
                id="eventTitle" 
                name="title" 
                placeholder="What's this event called?"
                maxlength="100"
                value="${escapeAttr(defaultTitle)}"
                required
              />
              <span class="char-count"><span id="titleCount">${
                defaultTitle.length
              }</span>/100</span>
            </div>

            <div class="form-group">
              <label for="eventDescription">
                <i class="fas fa-align-left"></i> Description
              </label>
              <textarea 
                id="eventDescription" 
                name="description" 
                placeholder="Share what this event is about, what to expect, any special instructions..."
                maxlength="500"
                rows="3"
              >${escapeHtml(defaultDescription)}</textarea>
              <span class="char-count"><span id="descCount">${
                defaultDescription.length
              }</span>/500</span>
            </div>
          </div>

          <!-- Date & Time Section - Supports Multiple Time Slots -->
          <div class="form-section">
            <div class="form-section-title">
              <i class="fas fa-clock"></i> When
              <span class="section-hint">${
                this.timeSlots.length > 1 ? `${this.timeSlots.length} days` : ""
              }</span>
            </div>
            
            <div class="time-slots-container" id="timeSlotsContainer">
              ${this.renderTimeSlots(dateMin)}
            </div>
            
            <button type="button" class="add-slot-btn" id="addTimeSlotBtn">
              <i class="fas fa-plus"></i> Add Another Day
            </button>
          </div>

          <!-- Location Section -->
          <div class="form-section">
            <div class="form-section-title">
              <i class="fas fa-map-marker-alt"></i> Where
            </div>
            
            <div class="form-group">
              <label for="eventLocation">
                <i class="fas fa-map-marker-alt"></i> Location
              </label>
              <input 
                type="text" 
                id="eventLocation" 
                name="location" 
                placeholder="Building, room number, or address"
                maxlength="200"
                value="${escapeAttr(defaultLocation)}"
                required
              />
              <span class="field-hint">
                <i class="fas fa-lightbulb"></i> Be specific so people can find it easily
              </span>
            </div>
          </div>

          <!-- Image Upload Section -->
          <div class="form-section">
            <div class="form-section-title">
              <i class="fas fa-image"></i> Cover Image <span class="optional-badge">Optional</span>
            </div>
            
            <div class="image-upload-wrapper">
              <div class="image-upload-area" id="imageUploadArea">
                <div class="image-upload-placeholder ${
                  this.existingImageUrl ? "hidden" : ""
                }" id="uploadPlaceholder">
                  <div class="upload-icon-wrapper">
                    <i class="fas fa-cloud-upload-alt"></i>
                  </div>
                  <span class="upload-main-text">Click to upload cover image</span>
                  <span class="upload-hint">JPG, PNG, WebP • Max 5MB</span>
                  <span class="upload-hint">You can crop and adjust after selecting</span>
                </div>
                <div class="image-preview ${
                  this.existingImageUrl ? "" : "hidden"
                }" id="imagePreview">
                  <img src="${
                    this.existingImageUrl
                      ? escapeAttr(this.existingImageUrl)
                      : ""
                  }" alt="Event image preview" id="previewImg" />
                  <div class="image-overlay">
                    <button type="button" class="image-action-btn edit-btn" id="editImageBtn" title="Change image">
                      <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button type="button" class="image-action-btn remove-btn" id="removeImageBtn" title="Remove image">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
              <input 
                type="file" 
                id="eventImage" 
                name="image" 
                accept="image/jpeg,image/png,image/webp"
                class="hidden-file-input"
              />
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn secondary" id="cancelEventBtn">
              Cancel
            </button>
            <button type="submit" class="btn primary" id="submitEventBtn">
              <i class="fas ${submitIcon}"></i> ${submitText}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(this.overlay);
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const form = this.overlay.querySelector("#createEventForm");
    const closeBtn = this.overlay.querySelector(".modal-close-btn");
    const cancelBtn = this.overlay.querySelector("#cancelEventBtn");
    const titleInput = this.overlay.querySelector("#eventTitle");
    const descInput = this.overlay.querySelector("#eventDescription");
    const addSlotBtn = this.overlay.querySelector("#addTimeSlotBtn");

    // Close handlers
    closeBtn?.addEventListener("click", () => this.hide());
    cancelBtn?.addEventListener("click", () => this.hide());

    // Close on overlay click
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.hide();
    });

    // Close on Escape
    this.escHandler = (e) => {
      if (e.key === "Escape") this.hide();
    };
    document.addEventListener("keydown", this.escHandler);

    // Character counters
    titleInput?.addEventListener("input", () => {
      this.overlay.querySelector("#titleCount").textContent =
        titleInput.value.length;
    });
    descInput?.addEventListener("input", () => {
      this.overlay.querySelector("#descCount").textContent =
        descInput.value.length;
    });

    // Time slot management
    addSlotBtn?.addEventListener("click", () => this.addTimeSlot());
    this.bindTimeSlotEvents();

    // Image upload handling
    this.bindImageUpload();

    // Form submit
    form?.addEventListener("submit", (e) => this.handleSubmit(e));
  }

  /**
   * Bind image upload events
   */
  bindImageUpload() {
    const uploadArea = this.overlay.querySelector("#imageUploadArea");
    const fileInput = this.overlay.querySelector("#eventImage");
    const removeBtn = this.overlay.querySelector("#removeImageBtn");
    const editBtn = this.overlay.querySelector("#editImageBtn");

    // Click to upload - only on placeholder or edit button
    uploadArea?.addEventListener("click", (e) => {
      // Don't trigger if clicking action buttons
      if (e.target.closest(".image-action-btn")) return;
      // Only trigger on placeholder or if no image
      if (!this.imagePreviewUrl && !this.existingImageUrl) {
        fileInput?.click();
      }
    });

    // Edit button click - opens file picker for new image
    editBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    // File selected - reset input value first to allow re-selecting same file
    fileInput?.addEventListener("click", () => {
      fileInput.value = "";
    });

    fileInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this.handleImageSelect(file);
      }
    });

    // Drag and drop
    uploadArea?.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.add("dragover");
    });

    uploadArea?.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.remove("dragover");
    });

    uploadArea?.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.remove("dragover");

      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) {
        this.handleImageSelect(file);
      }
    });

    // Remove image
    removeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleImageRemove();
    });
  }

  /**
   * Handle image file selection - opens cropper
   */
  async handleImageSelect(file) {
    // Validate file type
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      notificationManager.show(
        "Please select a JPG, PNG, or WebP image",
        "error"
      );
      return;
    }

    // Validate file size (max 5MB before processing)
    if (file.size > 5 * 1024 * 1024) {
      notificationManager.show("Image too large. Max 5MB allowed.", "error");
      return;
    }

    // Store original file
    this.selectedImageFile = file;

    // Open cropper modal
    try {
      const { showImageCropper } = await import("./ImageCropperModal.js");

      showImageCropper({
        file,
        onConfirm: (result) => {
          // Store cropped result
          this.croppedImageBlob = result.blob;
          this.imagePreviewUrl = result.previewUrl;
          this.selectedAspectRatio = result.aspectRatio;
          this.removeExistingImage = false;
          this.hasStagedReplacement = true;
          // Hide persisted image while staging new one; keep originalImageUrl for revert
          this.existingImageUrl = null;
          this.updateImagePreview();
        },
        onCancel: () => {
          // Clear all image state when user cancels cropper
          // This prevents the original file from being uploaded unintentionally
          this.selectedImageFile = null;
          this.croppedImageBlob = null;
          this.imagePreviewUrl = null;
          this.selectedAspectRatio = null;
          this.hasStagedReplacement = false;
          this.existingImageUrl = this.originalImageUrl;
          this.removeExistingImage = false;

          // Reset file input
          const fileInput = this.overlay?.querySelector("#eventImage");
          if (fileInput) fileInput.value = "";

          // Update UI to reflect cleared state
          this.updateImagePreview();
        },
      });
    } catch (err) {
      logManager.error("[CreateEventModal] Failed to open cropper:", err);
      notificationManager.show("Failed to open image editor", "error");
    }
  }

  /**
   * Update the image preview in the UI
   */
  updateImagePreview() {
    const placeholder = this.overlay.querySelector("#uploadPlaceholder");
    const preview = this.overlay.querySelector("#imagePreview");
    const previewImg = this.overlay.querySelector("#previewImg");

    const hasImage = this.imagePreviewUrl || this.existingImageUrl;

    if (hasImage) {
      placeholder?.classList.add("hidden");
      preview?.classList.remove("hidden");
      if (previewImg) {
        previewImg.src = this.imagePreviewUrl || this.existingImageUrl;
      }
    } else {
      placeholder?.classList.remove("hidden");
      preview?.classList.add("hidden");
      if (previewImg) {
        previewImg.src = "";
      }
    }
  }

  /**
   * Handle image removal
   */
  handleImageRemove() {
    // If user discards a staged replacement, revert to the original image
    if (this.hasStagedReplacement || this.imagePreviewUrl) {
      this.selectedImageFile = null;
      this.croppedImageBlob = null;
      this.imagePreviewUrl = null;
      this.selectedAspectRatio = null;
      this.hasStagedReplacement = false;
      this.removeExistingImage = false;
      this.existingImageUrl = this.originalImageUrl;

      const fileInput = this.overlay.querySelector("#eventImage");
      if (fileInput) fileInput.value = "";

      this.updateImagePreview();
      return;
    }

    this.selectedImageFile = null;
    this.croppedImageBlob = null;
    this.imagePreviewUrl = null;

    // If editing, mark to remove existing image
    if (this.existingImageUrl) {
      this.removeExistingImage = true;
      this.existingImageUrl = null;
    }

    // Reset file input
    const fileInput = this.overlay.querySelector("#eventImage");
    if (fileInput) fileInput.value = "";

    // Update UI
    this.updateImagePreview();
  }

  /**
   * Handle form submission
   */
  async handleSubmit(e) {
    e.preventDefault();

    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const submitBtn = this.overlay.querySelector("#submitEventBtn");
    const originalText = submitBtn.innerHTML;
    const actionWord = this.editMode ? "Saving..." : "Creating...";
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${actionWord}`;
    submitBtn.disabled = true;

    // Helper to reset submission state on validation failure
    const resetSubmitState = () => {
      this.isSubmitting = false;
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    };

    try {
      const form = this.overlay.querySelector("#createEventForm");
      const formData = new FormData(form);

      const title = formData.get("title")?.trim();
      const description = formData.get("description")?.trim() || "";
      const location = formData.get("location")?.trim();

      // Validate basic fields
      if (!title || !location) {
        notificationManager.show("Please fill in title and location", "error");
        resetSubmitState();
        return;
      }

      // Validate time slots
      const slotsValidation = this.validateTimeSlots();
      if (!slotsValidation.valid) {
        notificationManager.show(slotsValidation.error, "error");
        resetSubmitState();
        return;
      }

      // Collect time slots and compute first/last timestamps
      const timeSlots = this.collectTimeSlots();

      // Sort slots by date and time
      timeSlots.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.startTime.localeCompare(b.startTime);
      });

      // Compute firstSlotStart and lastSlotEnd
      const firstSlot = timeSlots[0];
      const lastSlot = timeSlots[timeSlots.length - 1];
      const firstSlotStartDate = new Date(
        `${firstSlot.date}T${firstSlot.startTime}`
      );
      let lastSlotEndDate = new Date(`${lastSlot.date}T${lastSlot.endTime}`);

      // Handle overnight events: if end time is before start time, it means the event
      // ends the next day (e.g., 10PM to 1AM)
      if (lastSlot.endTime < lastSlot.startTime) {
        lastSlotEndDate.setDate(lastSlotEndDate.getDate() + 1);
      }

      // Import Firebase
      const { db } = await import("../../lib/firebase/firebase-config.js");
      const { collection, addDoc, doc, updateDoc, Timestamp } = await import(
        "firebase/firestore"
      );

      if (this.editMode && this.event?.id) {
        // UPDATE existing event
        const wasRejected = this.event.status === "rejected";
        const wasLive = this.event.isLive === true;
        const wasApproved = this.event.status === "approved";
        const isPresident = this.isUserPresident();

        const updateData = {
          title,
          description,
          location,
          timeSlots,
          firstSlotStart: Timestamp.fromDate(firstSlotStartDate),
          lastSlotEnd: Timestamp.fromDate(lastSlotEndDate),
          updatedAt: Timestamp.now(),
          updatedBy: currentUser?.uid,
        };

        // R7: If a live event is edited, stop it and require re-approval
        // The event must go back through the approval process
        if (wasLive || wasApproved) {
          updateData.isLive = false;
          updateData.status = "pending_president";
          updateData.liveStoppedAt = Timestamp.now();
          updateData.liveStoppedBy = currentUser?.uid;
          updateData.liveStopReason = "edited";
          // Clear any previous approval data
          updateData.approvedAt = null;
          updateData.approvedBy = null;
          updateData.approvedByInfo = null;
        }

        // If a non‑president edits a rejected event, treat it as a resubmission:
        // send it back to pending_president and clear rejection metadata so it
        // re-enters the moderation queue.
        if (!isPresident && wasRejected) {
          updateData.status = "pending_president";
          updateData.rejectionReason = null;
          updateData.rejectedAt = null;
          updateData.rejectedBy = null;
          updateData.rejectedByInfo = null;
        }

        // Handle image changes
        if (this.croppedImageBlob || this.selectedImageFile) {
          // Upload new image
          submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading image...`;
          const imageUrl = await this.uploadImage(this.event.id);
          if (imageUrl) {
            updateData.imageUrl = imageUrl;
          }
        } else if (this.removeExistingImage) {
          // Remove existing image
          updateData.imageUrl = null;
          // Optionally delete from storage (fire and forget)
          this.deleteExistingImage(this.event.id);
        }

        const eventRef = doc(db, "clubs", this.clubId, "events", this.event.id);
        await updateDoc(eventRef, updateData);

        logManager.info("[CreateEventModal] Updated event:", this.event.id);

        // Show appropriate message based on what happened
        if (wasLive) {
          notificationManager.show(
            `Event "${title}" has been stopped and requires re-approval.`,
            "warning"
          );
        } else if (wasApproved) {
          notificationManager.show(
            `Event "${title}" updated and requires re-approval.`,
            "warning"
          );
        } else if (
          !isPresident &&
          wasRejected &&
          updateData.status === "pending_president"
        ) {
          notificationManager.show(
            `Event "${title}" updated and resubmitted for approval.`,
            "success"
          );
        } else {
          notificationManager.show(`Event "${title}" updated!`, "success");
        }

        // Call success callback with updated data
        this.onSuccess(this.event.id, { ...this.event, ...updateData });
      } else {
        // CREATE new event - first create the doc to get an ID
        const profileFirstName =
          currentUser?.profile?.profile?.firstName || "Unknown";
        const profileLastName = currentUser?.profile?.profile?.lastName || "";

        // Determine status based on user role
        // Presidents and devOwners can auto-approve unless SAF approval is required,
        // in which case events move to pending_saf after president review.
        const isPresident = this.isUserPresident();
        const requiresSafApproval = this.clubData?.requireSafApproval === true;
        const eventStatus = isPresident
          ? requiresSafApproval
            ? "pending_saf"
            : "approved"
          : "pending_president";

        const eventData = {
          title,
          description,
          location,
          clubId: this.clubId,
          timeSlots,
          firstSlotStart: Timestamp.fromDate(firstSlotStartDate),
          lastSlotEnd: Timestamp.fromDate(lastSlotEndDate),
          status: eventStatus,
          isLive: false,
          imageUrl: null,
          createdBy: currentUser?.uid,
          createdByInfo: {
            name: `${profileFirstName} ${profileLastName}`.trim() || "Unknown",
            uid: currentUser?.uid,
            firstName: profileFirstName,
            lastName: profileLastName,
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        const eventsRef = collection(db, "clubs", this.clubId, "events");
        const docRef = await addDoc(eventsRef, eventData);
        const eventId = docRef.id;

        // Upload image if selected
        if (this.croppedImageBlob || this.selectedImageFile) {
          submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading image...`;
          const imageUrl = await this.uploadImage(eventId);
          if (imageUrl) {
            // Update the event with the image URL
            await updateDoc(docRef, { imageUrl });
            eventData.imageUrl = imageUrl;
          }
        }

        logManager.info("[CreateEventModal] Created event:", eventId);

        // Show appropriate message based on status
        if (eventStatus === "pending_president") {
          notificationManager.show(
            `Event "${title}" submitted for approval! The president will review it soon.`,
            "success"
          );
        } else {
          notificationManager.show(`Event "${title}" created!`, "success");
        }

        // Call success callback and close
        this.onSuccess(eventId, eventData);
      }

      this.hide();
    } catch (err) {
      logManager.error("[CreateEventModal] Failed to save event:", err);
      notificationManager.show(
        `Failed to ${
          this.editMode ? "update" : "create"
        } event. Please try again.`,
        "error"
      );
    } finally {
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    }
  }

  /**
   * Upload the selected image to Firebase Storage
   */
  async uploadImage(eventId) {
    // Use cropped blob if available, otherwise process original file
    const blobToUpload = this.croppedImageBlob;

    if (!blobToUpload && !this.selectedImageFile) return null;

    try {
      const { processEventImage, uploadEventImage } = await import(
        "../../services/clubs/ClubImageService.js"
      );

      let blob = blobToUpload;

      // If no cropped blob, process the original file
      if (!blob && this.selectedImageFile) {
        blob = await processEventImage(this.selectedImageFile);
      }

      // Upload to Storage
      const url = await uploadEventImage(this.clubId, eventId, blob);

      logManager.info("[CreateEventModal] Image uploaded:", url);
      return url;
    } catch (err) {
      logManager.error("[CreateEventModal] Image upload failed:", err);
      notificationManager.show(
        "Image upload failed, but event was saved",
        "warning"
      );
      return null;
    }
  }

  /**
   * Delete existing image from Storage (fire and forget)
   */
  async deleteExistingImage(eventId) {
    try {
      const { deleteEventImage } = await import(
        "../../services/clubs/ClubImageService.js"
      );
      await deleteEventImage(this.clubId, eventId);
    } catch (err) {
      // Ignore errors - image might not exist
      logManager.warn("[CreateEventModal] Failed to delete old image:", err);
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.escHandler) {
      document.removeEventListener("keydown", this.escHandler);
    }
    this.overlay?.remove();
    this.overlay = null;
  }
}

/**
 * Escape HTML entities
 */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escape for attribute values (handles quotes)
 */
function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Helper function to show the modal (create mode)
 */
export function showCreateEventModal(options) {
  const modal = new CreateEventModal(options);
  modal.show();
  return modal;
}

/**
 * Helper function to show the modal in edit mode
 */
export function showEditEventModal(options) {
  const modal = new CreateEventModal({
    ...options,
    // event is already passed in options
  });
  modal.show();
  return modal;
}
