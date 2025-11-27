/**
 * CreateEventModal - Modal for creating club events
 * Self-contained component that renders its own overlay
 */

import { currentUser } from "../../store/userStore.js";
import { notificationManager } from "../../services/realtime/NotificationService.js";
import { logManager } from "../../utils/debug/LogManager.js";

export class CreateEventModal {
  constructor(options = {}) {
    this.clubId = options.clubId;
    this.clubName = options.clubName || "Club";
    this.onSuccess = options.onSuccess || (() => {});
    this.onClose = options.onClose || (() => {});
    
    this.overlay = null;
    this.isSubmitting = false;
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

    // Get tomorrow's date as default
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDate = tomorrow.toISOString().split("T")[0];

    this.overlay = document.createElement("div");
    this.overlay.className = "create-event-modal-overlay";
    this.overlay.innerHTML = `
      <div class="create-event-modal">
        <div class="modal-header">
          <h2><i class="fas fa-calendar-plus"></i> Create Event</h2>
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
                required
              />
              <span class="char-count"><span id="titleCount">0</span>/100</span>
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
              ></textarea>
              <span class="char-count"><span id="descCount">0</span>/500</span>
            </div>
          </div>

          <!-- Date & Time Section -->
          <div class="form-section">
            <div class="form-section-title">
              <i class="fas fa-clock"></i> When
            </div>
            
            <div class="form-group">
              <label for="eventDate">
                <i class="fas fa-calendar"></i> Date
              </label>
              <input 
                type="date" 
                id="eventDate" 
                name="date" 
                value="${defaultDate}"
                min="${defaultDate}"
                required
              />
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="eventStartTime">
                  <i class="fas fa-clock"></i> Starts
                </label>
                <input 
                  type="time" 
                  id="eventStartTime" 
                  name="startTime" 
                  value="17:00"
                  required
                />
              </div>
              
              <div class="form-group">
                <label for="eventEndTime">
                  <i class="fas fa-clock"></i> Ends
                </label>
                <input 
                  type="time" 
                  id="eventEndTime" 
                  name="endTime" 
                  value="19:00"
                  required
                />
              </div>
            </div>
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
                required
              />
              <span class="field-hint">
                <i class="fas fa-lightbulb"></i> Be specific so people can find it easily
              </span>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn secondary" id="cancelEventBtn">
              Cancel
            </button>
            <button type="submit" class="btn primary" id="submitEventBtn">
              <i class="fas fa-sparkles"></i> Create Event
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
      this.overlay.querySelector("#titleCount").textContent = titleInput.value.length;
    });
    descInput?.addEventListener("input", () => {
      this.overlay.querySelector("#descCount").textContent = descInput.value.length;
    });

    // Form submit
    form?.addEventListener("submit", (e) => this.handleSubmit(e));
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
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Creating...`;
    submitBtn.disabled = true;

    try {
      const form = this.overlay.querySelector("#createEventForm");
      const formData = new FormData(form);
      
      const title = formData.get("title")?.trim();
      const description = formData.get("description")?.trim() || "";
      const date = formData.get("date");
      const startTime = formData.get("startTime");
      const endTime = formData.get("endTime");
      const location = formData.get("location")?.trim();

      // Validation
      if (!title || !date || !startTime || !endTime || !location) {
        notificationManager.show("Please fill in all required fields", "error");
        return;
      }

      // Check end time is after start time
      if (startTime >= endTime) {
        notificationManager.show("End time must be after start time", "error");
        return;
      }

      // Import Firebase
      const { db } = await import("../../lib/firebase/firebase-config.js");
      const { collection, addDoc, Timestamp } = await import("firebase/firestore");

      const eventData = {
        title,
        description,
        location,
        clubId: this.clubId,
        timeSlots: [
          { date, startTime, endTime }
        ],
        firstSlotStart: Timestamp.fromDate(new Date(`${date}T${startTime}`)),
        lastSlotEnd: Timestamp.fromDate(new Date(`${date}T${endTime}`)),
        status: "approved", // Auto-approve for now (devTest flow)
        isLive: false,
        imageUrl: null,
        createdBy: currentUser?.uid,
        createdByInfo: {
          firstName: currentUser?.firstName || "Unknown",
          lastName: currentUser?.lastName || ""
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      const eventsRef = collection(db, "clubs", this.clubId, "events");
      const docRef = await addDoc(eventsRef, eventData);

      logManager.info("[CreateEventModal] Created event:", docRef.id);
      notificationManager.show(`Event "${title}" created!`, "success");

      // Call success callback and close
      this.onSuccess(docRef.id, eventData);
      this.hide();

    } catch (err) {
      logManager.error("[CreateEventModal] Failed to create event:", err);
      notificationManager.show("Failed to create event. Please try again.", "error");
    } finally {
      this.isSubmitting = false;
      if (submitBtn) {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
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
 * Helper function to show the modal
 */
export function showCreateEventModal(options) {
  const modal = new CreateEventModal(options);
  modal.show();
  return modal;
}
