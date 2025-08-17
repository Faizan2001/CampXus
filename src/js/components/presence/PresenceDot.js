/**
 * PresenceDot Component - Campus Presence Indicator
 * 
 * Creates reusable presence dots showing campus status and activity timing.
 * Part of the Campus Presence System (Phase 3.1)
 * 
 * @author CampXus Development Team
 * @version 1.0.0
 */

export class PresenceDot {
  /**
   * Converts minutes ago to human-readable time intervals
   * Uses exact time intervals as specified in Campus Presence Implementation Plan
   * 
   * @param {number} minutesAgo - Minutes since last activity
   * @returns {string} Human-readable time string (e.g., "5m", "2h")
   */
  static getTimeText(minutesAgo) {
    // Input validation
    if (typeof minutesAgo !== 'number' || minutesAgo < 0) {
      console.warn('[PresenceDot] Invalid minutesAgo value:', minutesAgo);
      return "?";
    }

    // Exact time intervals from implementation plan
    if (minutesAgo < 1) return "1m";
    if (minutesAgo < 2) return "2m";
    if (minutesAgo < 5) return "5m";
    if (minutesAgo < 10) return "10m";
    if (minutesAgo < 15) return "15m";
    if (minutesAgo < 20) return "20m";
    if (minutesAgo < 30) return "30m";
    if (minutesAgo < 45) return "45m";
    if (minutesAgo < 60) return "1h";
    if (minutesAgo < 120) return "2h";
    if (minutesAgo < 180) return "3h";
    if (minutesAgo < 240) return "4h";
    if (minutesAgo < 300) return "5h";
    if (minutesAgo < 360) return "6h";
    return Math.floor(minutesAgo / 60) + "h"; // 7h, 8h, 9h, 10h, 11h, 12h
  }

  /**
   * Creates a presence dot HTML element
   * 
   * @param {Date|Object|null} lastActive - Last activity timestamp (Firebase Timestamp or Date)
   * @param {Object|null} lastKnownLocation - Location data with campusStatus
   * @param {boolean} hasLocationSharing - Whether user has location sharing enabled
   * @returns {string} HTML string for presence dot element
   */
  static create(lastActive, lastKnownLocation, hasLocationSharing = false) {
    console.log('[PresenceDot] Creating presence dot:', {
      hasLastActive: !!lastActive,
      hasLocation: !!lastKnownLocation,
      hasLocationSharing,
      campusStatus: lastKnownLocation?.campusStatus
    });

    // Input validation and early returns for grey dots
    if (!hasLocationSharing) {
      console.log('[PresenceDot] No location sharing - returning grey dot');
      return '<div class="presence-dot grey"></div>';
    }

    if (!lastActive) {
      console.log('[PresenceDot] No lastActive timestamp - returning grey dot');
      return '<div class="presence-dot grey"></div>';
    }

    if (!lastKnownLocation) {
      console.log('[PresenceDot] No lastKnownLocation data - returning grey dot');
      return '<div class="presence-dot grey"></div>';
    }

    // Convert Firebase timestamp to Date if needed
    const now = Date.now();
    let lastActiveTime;
    
    try {
      lastActiveTime = lastActive?.toDate?.() || new Date(lastActive);
      if (isNaN(lastActiveTime.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      console.warn('[PresenceDot] Invalid lastActive timestamp:', lastActive, error);
      return '<div class="presence-dot grey"></div>';
    }

    const minutesAgo = Math.floor((now - lastActiveTime) / (1000 * 60));
    console.log('[PresenceDot] Time calculation:', {
      now,
      lastActiveTime: lastActiveTime.toISOString(),
      minutesAgo
    });

    // Don't show presence if >12 hours (720 minutes)
    if (minutesAgo > 12 * 60) {
      console.log('[PresenceDot] Activity too old (>12h) - returning grey dot');
      return '<div class="presence-dot grey"></div>';
    }

    const timeText = this.getTimeText(minutesAgo);
    const campusStatus = lastKnownLocation.campusStatus;
    
    // Determine dot color based on campus status
    let dotClass = "grey";
    if (campusStatus === "on_campus") {
      dotClass = "green";
    } else if (campusStatus === "off_campus") {
      dotClass = "red";
    }

    console.log('[PresenceDot] Dot configuration:', {
      timeText,
      campusStatus,
      dotClass,
      minutesAgo
    });

    // Return grey dot if status is unknown
    if (dotClass === "grey") {
      console.log('[PresenceDot] Unknown campus status - returning grey dot');
      return '<div class="presence-dot grey"></div>';
    }

    // Create presence dot with time text and tooltip
    const presenceDot = `
      <div class="presence-dot ${dotClass}" 
           title="${this.getTooltip(lastActive, lastKnownLocation)}">
        <span class="dot-text">${timeText}</span>
      </div>
    `;

    console.log('[PresenceDot] Created presence dot:', {
      class: dotClass,
      timeText,
      tooltip: this.getTooltip(lastActive, lastKnownLocation)
    });

    return presenceDot;
  }

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
      return 'Status unknown';
    }

    let lastActiveTime;
    try {
      lastActiveTime = lastActive?.toDate?.() || new Date(lastActive);
      if (isNaN(lastActiveTime.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      console.warn('[PresenceDot] Invalid timestamp in tooltip:', lastActive, error);
      return 'Status unknown';
    }

    const status = lastKnownLocation?.campusStatus;
    const timeStr = lastActiveTime.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Generate status-specific tooltip
    if (status === "on_campus") {
      return `On campus - ${timeStr}`;
    }
    if (status === "off_campus") {
      return `Off campus - ${timeStr}`;
    }
    
    return `Last seen - ${timeStr}`;
  }

  /**
   * Validates presence data structure
   * 
   * @param {Object} presenceData - Complete presence data object
   * @returns {boolean} Whether the data is valid
   */
  static validatePresenceData(presenceData) {
    if (!presenceData || typeof presenceData !== 'object') {
      return false;
    }

    const { lastActive, lastKnownLocation, hasLocationSharing } = presenceData;

    // Check basic structure
    if (typeof hasLocationSharing !== 'boolean') {
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

    const validStatuses = ['on_campus', 'off_campus', 'unknown'];
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
      console.warn('[PresenceDot] createBatch expects an array');
      return [];
    }

    return presenceDataArray.map((data, index) => {
      try {
        const { lastActive, lastKnownLocation, hasLocationSharing } = data;
        return this.create(lastActive, lastKnownLocation, hasLocationSharing);
      } catch (error) {
        console.error(`[PresenceDot] Error creating dot at index ${index}:`, error);
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
      case 'on_campus':
        return 'green';
      case 'off_campus':
        return 'red';
      default:
        return 'grey';
    }
  }
}

// Development helper for testing
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.PresenceDot = PresenceDot;
  console.log('[PresenceDot] Component loaded and available globally for testing');
}