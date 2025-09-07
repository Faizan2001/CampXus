/**
 * PresenceDot Component - Campus Presence Indicator
 *
 * Creates reusable presence dots showing campus status and activity timing.
 * Part of the Campus Presence System (Phase 3.1)
 *
 * @author MeetchuThere Development Team
 * @version 1.0.0
 */

export class PresenceDot {
  /**
   * Normalize various timestamp formats (Firestore Timestamp, plain object {seconds,nanoseconds}, ms/seconds number, Date, ISO string)
   * into a valid Date instance. Returns null if it cannot be normalized.
   * @param {*} value
   * @returns {Date|null}
   */
  static normalizeTimestamp(value) {
    if (!value) return null;
    try {
      // Firestore Timestamp
      if (typeof value.toDate === 'function') {
        const d = value.toDate();
        return isNaN(d.getTime()) ? null : d;
      }
      // Plain object {seconds, nanoseconds}
      if (typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
        const ms = (value.seconds * 1000) + Math.floor(value.nanoseconds / 1e6);
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      }
      // Number (heuristic: if < 1e12 treat as seconds, else ms)
      if (typeof value === 'number') {
        const ms = value < 1e12 ? value * 1000 : value; // support seconds input
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      }
      // String (ISO or parseable date)
      if (typeof value === 'string') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      // Date
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
      }
    } catch (_) {
      return null;
    }
    return null;
  }
  /**
   * Converts minutes ago to human-readable time intervals
   * Uses exact time intervals as specified in Campus Presence Implementation Plan
   *
   * @param {number} minutesAgo - Minutes since last activity
   * @returns {string} Human-readable time string (e.g., "5m", "2h")
   */
  static getTimeText(minutesAgo) {
    // Input validation
    if (typeof minutesAgo !== "number" || minutesAgo < 0) {
      console.warn("[PresenceDot] Invalid minutesAgo value:", minutesAgo);
      return "?";
    }

    // Precise time intervals for better accuracy
    if (minutesAgo < 1) return "1m";
    if (minutesAgo < 2) return "2m";
    if (minutesAgo < 3) return "3m";
    if (minutesAgo < 4) return "4m";  // 🛠️ FIX: Added missing "4m" case
    if (minutesAgo < 5) return "5m";
    if (minutesAgo < 6) return "6m";
    if (minutesAgo < 7) return "7m";
    if (minutesAgo < 8) return "8m";
    if (minutesAgo < 9) return "9m";  // 🛠️ FIX: Added missing "9m" case
    if (minutesAgo < 10) return "10m";
    if (minutesAgo < 15) return "15m";
    if (minutesAgo < 20) return "20m";
    if (minutesAgo < 25) return "25m";
    if (minutesAgo < 30) return "30m";
    if (minutesAgo < 35) return "35m";
    if (minutesAgo < 40) return "40m";
    if (minutesAgo < 45) return "45m";
    if (minutesAgo < 50) return "50m";
    if (minutesAgo < 60) return "1h";
    if (minutesAgo < 120) return "2h";
    if (minutesAgo < 180) return "3h";
    if (minutesAgo < 240) return "4h";
    if (minutesAgo < 300) return "5h";
    if (minutesAgo < 360) return "6h";
    if (minutesAgo < 420) return "7h";
    if (minutesAgo < 480) return "8h";
    if (minutesAgo < 540) return "9h";
    if (minutesAgo < 600) return "10h";
    if (minutesAgo < 660) return "11h";
    return "12h"; // Cap at 12h since dots disappear after that
  }

  // Removed legacy loading markup in favor of non-intrusive spinner overlay

  /**
   * Creates a presence dot HTML element
   *
   * @param {Date|Object|null} lastActive - Last activity timestamp (Firebase Timestamp or Date)
   * @param {Object|null} lastKnownLocation - Location data with campusStatus
   * @param {boolean} hasLocationSharing - Whether user has location sharing enabled
   * @param {Object} options - Additional options
   * @param {boolean} options.isLoading - Whether to show loading state
   * @param {boolean} options.forceFreshData - Whether this requires fresh data (show loading until fresh)
   * @returns {string} HTML string for presence dot element
   */
  static create(lastActive, lastKnownLocation, hasLocationSharing = false, options = {}) {
    // Legacy inline loading removed: overlay ring is applied via CSS class instead

    // Input validation and early returns for grey dots
    if (!hasLocationSharing) {
      return '<div class="presence-dot grey"></div>';
    }

    if (!lastActive) {
      return '<div class="presence-dot grey"></div>';
    }

    if (!lastKnownLocation) {
      return '<div class="presence-dot grey"></div>';
    }

    // Convert Firebase timestamp to Date if needed
    const now = Date.now();
    let lastActiveTime;

    lastActiveTime = this.normalizeTimestamp(lastActive);
    if (!lastActiveTime) {
      console.warn("[PresenceDot] Invalid lastActive timestamp:", lastActive, new Error('normalize failed'));
      return '<div class="presence-dot grey"></div>';
    }
    let minutesAgo = Math.floor((now - lastActiveTime.getTime()) / (1000 * 60));
    if (minutesAgo < 0) minutesAgo = 0; // guard against clock skew / future timestamps

    // Don't show presence if >12 hours (720 minutes)
    if (minutesAgo > 12 * 60) {
      return '<div class="presence-dot grey"></div>';
    }

    const campusStatus = lastKnownLocation.campusStatus;

    // Determine dot color based on campus status
    let dotClass = "grey";
    if (campusStatus === "on_campus") {
      dotClass = "green";
    } else if (campusStatus === "off_campus") {
      dotClass = "red";
    }

    // Return grey dot if status is unknown
    if (dotClass === "grey") {
      return '<div class="presence-dot grey"></div>';
    }

    // NEW LOGIC: Show solid dot (no text) for active users within 2 minutes
    // Also force solid during fresh-data loading to prevent brief timer flicker
    const forceSolid = options.forceSolid === true;
    if (minutesAgo < 2 || forceSolid) {
      // Only log when actually creating for active user (throttled by LogManager)
      if (window.logManager) window.logManager.presenceDotUpdate('user', `active ${campusStatus}`);

      const extraClass = options.extraClass ? ` ${options.extraClass}` : '';
      return `
        <div class="presence-dot ${dotClass}${extraClass}" 
             title="${this.getTooltip(lastActive, lastKnownLocation)}">
        </div>
      `;
    }

    // EXISTING LOGIC: Show timer text for inactive users (2+ minutes)
    const timeText = this.getTimeText(minutesAgo);

    const extraClass = options.extraClass ? ` ${options.extraClass}` : '';
    const presenceDot = `
      <div class="presence-dot ${dotClass}${extraClass}" 
           title="${this.getTooltip(lastActive, lastKnownLocation)}">
        <span class="dot-text">${timeText}</span>
      </div>
    `;

    return presenceDot;
  }

  // Removed duplicate createWithFreshDataPriority (use the unified version below)

  /**
   * Updates an existing presence dot element with fresh location data
   * 
   * @param {HTMLElement} dotElement - The presence dot element to update
   * @param {Date|Object|null} lastActive - Fresh last activity timestamp
   * @param {Object|null} lastKnownLocation - Fresh location data
   * @param {boolean} hasLocationSharing - Location sharing status
   */
  // Removed duplicate updateWithFreshData (use the unified version below)

  /**
   * Generates tooltip text for presence dots
   *
   * @param {Date|Object} lastActive - Last activity timestamp
   * @param {Object} lastKnownLocation - Location data with campusStatus
   * @returns {string} Tooltip text
   */
  static getTooltip(lastActive, lastKnownLocation) {
    // Input validation
    if (!lastActive || !lastKnownLocation) {
      return "Status unknown";
    }

    const lastActiveTime = this.normalizeTimestamp(lastActive);
    if (!lastActiveTime) {
      console.warn("[PresenceDot] Invalid timestamp in tooltip:", lastActive);
      return "Status unknown";
    }

    const status = lastKnownLocation?.campusStatus;
    const timeStr = lastActiveTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Check if user is currently active (within last 2 minutes)
    const minutesAgo = Math.floor((Date.now() - lastActiveTime) / (1000 * 60));
    const isCurrentlyActive = minutesAgo < 2;

    // Generate status-specific tooltip with activity context
    if (status === "on_campus") {
      return isCurrentlyActive ? "Active on campus" : `On campus - ${timeStr}`;
    }
    if (status === "off_campus") {
      return isCurrentlyActive
        ? "Active off campus"
        : `Off campus - ${timeStr}`;
    }

    return isCurrentlyActive ? "Currently active" : `Last seen - ${timeStr}`;
  }

  /**
   * Validates presence data structure
   *
   * @param {Object} presenceData - Complete presence data object
   * @returns {boolean} Whether the data is valid
   */
  static validatePresenceData(presenceData) {
    if (!presenceData || typeof presenceData !== "object") {
      return false;
    }

    const { lastActive, lastKnownLocation, hasLocationSharing } = presenceData;

    // Check basic structure
    if (typeof hasLocationSharing !== "boolean") {
      return false;
    }

    // If location sharing is disabled, data is valid (will show grey dot)
    if (!hasLocationSharing) {
      return true;
    }

    // If location sharing is enabled, require valid data
    if (!lastActive || !lastKnownLocation) {
      return false;
    }

    // Validate lastKnownLocation structure
    if (!lastKnownLocation.campusStatus) {
      return false;
    }

    const validStatuses = ["on_campus", "off_campus", "unknown"];
    if (!validStatuses.includes(lastKnownLocation.campusStatus)) {
      return false;
    }

    return true;
  }

  /**
   * Creates multiple presence dots for batch rendering
   *
   * @param {Array} presenceDataArray - Array of presence data objects
   * @returns {Array} Array of HTML strings
   */
  static createBatch(presenceDataArray) {
    if (!Array.isArray(presenceDataArray)) {
      console.warn("[PresenceDot] createBatch expects an array");
      return [];
    }

    return presenceDataArray.map((data, index) => {
      try {
        const { lastActive, lastKnownLocation, hasLocationSharing } = data;
        return this.create(lastActive, lastKnownLocation, hasLocationSharing);
      } catch (error) {
        console.error(
          `[PresenceDot] Error creating dot at index ${index}:`,
          error
        );
        return '<div class="presence-dot grey"></div>';
      }
    });
  }

  /**
   * Gets the current campus status color for a given status
   *
   * @param {string} campusStatus - Campus status ('on_campus', 'off_campus', etc.)
   * @returns {string} CSS class for the dot color
   */
  static getStatusColor(campusStatus) {
    switch (campusStatus) {
      case "on_campus":
        return "green";
      case "off_campus":
        return "red";
      default:
        return "grey";
    }
  }

  // Removed legacy createLoadingDot in favor of overlay ring

  /**
   * 🚀 FRESH DATA PRIORITY: Create presence dot with fresh data priority
   * Detects if fresh data is being loaded and shows loading state accordingly
   *
   * @param {Date|Object|null} lastActive - Last activity timestamp
   * @param {Object|null} lastKnownLocation - Location data with campusStatus
   * @param {boolean} hasLocationSharing - Whether user has location sharing enabled
   * @param {boolean} waitingForFreshData - Whether to show loading state for fresh data
   * @returns {string} HTML string for presence dot element
   */
  static createWithFreshDataPriority(lastActive, lastKnownLocation, hasLocationSharing = undefined, waitingForFreshData = false) {
    const sharingUnknown = typeof hasLocationSharing !== "boolean";
    const forceFreshData = sessionStorage.getItem("campusPresence_forceFreshData") === "true";
    const priorityMode = sessionStorage.getItem("campusPresence_priorityMode");

    const addOverlay = waitingForFreshData || forceFreshData || priorityMode === "fresh_data" || sharingUnknown;

    // If explicitly disabled, show grey (no overlay)
    if (hasLocationSharing === false) {
      return '<div class="presence-dot grey"></div>';
    }

    // Build normal dot and add spinner overlay class if needed
    const extraClass = addOverlay ? 'spinner-overlay' : '';
    const forceSolid = addOverlay; // While loading fresh data, suppress timer flicker
    const sharingFlag = hasLocationSharing === true;
    return this.create(lastActive, lastKnownLocation, sharingFlag, { extraClass, forceSolid });
  }

  /**
   * 🚀 FRESH DATA PRIORITY: Update presence dot element with fresh data
   * Used to replace loading dots with actual presence data
   *
   * @param {HTMLElement} dotElement - The presence dot element to update
   * @param {Date|Object|null} lastActive - Last activity timestamp
   * @param {Object|null} lastKnownLocation - Location data with campusStatus
   * @param {boolean} hasLocationSharing - Whether user has location sharing enabled
   */
  static updateWithFreshData(dotElement, lastActive, lastKnownLocation, hasLocationSharing = false) {
    if (!dotElement) {
      console.warn("[PresenceDot] Cannot update: dot element not found");
      return;
    }

    // Create the new presence dot HTML
    const newDotHtml = this.create(lastActive, lastKnownLocation, hasLocationSharing);
    
    // Parse the new HTML to get attributes
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newDotHtml;
    const newDot = tempDiv.firstElementChild;

    if (newDot) {
      // Update the existing element's classes and content
      dotElement.className = newDot.className;
      dotElement.innerHTML = newDot.innerHTML;
      dotElement.title = newDot.title || '';
      
      // Add a subtle animation to indicate fresh data
      dotElement.style.animation = 'fresh-data-pulse 0.5s ease-out';
      setTimeout(() => {
        if (dotElement) {
          dotElement.style.animation = '';
        }
      }, 500);
      
      // Dot updated successfully
    }
  }
}

// Development helper for testing
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  window.PresenceDot = PresenceDot;
}
