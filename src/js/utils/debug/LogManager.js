/**
 * LogManager.js
 *
 * Centralized logging system with consistent emoji patterns and grouping.
 * Reduces console spam while maintaining important debugging information.
 * Enhanced with performance tracking and better organization.
 */

/**
 * Standard emoji patterns for different log categories
 */
const LOG_EMOJIS = {
  // Database Operations
  DB_READ: "📥", // Database reads/fetches
  DB_WRITE: "📤", // Database writes/saves
  DB_DELETE: "🗑️", // Database deletes
  DB_CACHE: "💾", // Cache operations
  DB_ERROR: "🔥", // Database errors

  // Location System
  LOC_NETWORK: "🌐", // Network/IP detection (Tier 1)
  LOC_GPS: "📍", // GPS/Browser location (Tier 2)
  LOC_GOOGLE: "🛰️", // Google API (Tier 3)
  LOC_SUCCESS: "✅", // Location success
  LOC_FAIL: "❌", // Location failures
  LOC_WARN: "⚠️", // Location warnings

  // Authentication & Users
  AUTH_LOGIN: "🔐", // Login/authentication
  AUTH_LOGOUT: "🚪", // Logout
  AUTH_USER: "👤", // User operations
  AUTH_ERROR: "🚫", // Auth errors

  // Network & API
  NET_REQUEST: "📡", // Network requests
  NET_RESPONSE: "📨", // Network responses
  NET_ERROR: "🔌", // Network errors
  NET_OFFLINE: "📴", // Offline status

  // UI & Navigation
  UI_INIT: "🎯", // Component initialization
  UI_CLICK: "👆", // User interactions
  UI_RENDER: "🎨", // UI rendering/updates
  UI_ERROR: "💢", // UI errors

  // System & Performance
  SYS_INIT: "⚡", // System initialization
  SYS_CONFIG: "⚙️", // Configuration
  SYS_CLEANUP: "🧹", // Cleanup operations
  SYS_ERROR: "💥", // System errors
  SYS_PERF: "📊", // Performance metrics

  // Development
  DEV_DEBUG: "🔧", // Debug information
  DEV_TEST: "🧪", // Testing
  DEV_INFO: "💡", // Information/tips
  
  // Campus Presence
  PRESENCE_INIT: "🌍", // Campus presence initialization
  PRESENCE_UPDATE: "🔄", // Presence updates
  PRESENCE_ERROR: "🚨", // Presence errors
};

/**
 * Log levels for filtering
 */
const LOG_LEVELS = {
  SILENT: -1, // No logs
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

/**
 * Categories that should be logged even in production
 */
const PRODUCTION_CRITICAL_CATEGORIES = [
  "error",
  "auth",
  "system",
  "presence"
];

class LogManager {
  constructor() {
    this.currentLevel = LOG_LEVELS.INFO; // Default level
    this.groupCounters = new Map();
    this.enabledCategories = new Set(["all"]); // Enable all by default

    // Throttling system to prevent log spam
    this.throttledMessages = new Map();
    this.throttleIntervals = new Map();

    // Group counters for similar messages
    this.messageGroups = new Map();

    // Performance tracking
    this.performanceMarkers = new Map();

    // More aggressive throttle periods (in milliseconds)
    this.defaultThrottlePeriods = {
      "profile-update": 15000, // Profile updates every 15s max (was 5s)
      "ui-render": 5000, // UI renders every 5s max (was 1s)  
      "listener-setup": 10000, // Listener setups every 10s max (was 3s)
      "real-time-update": 8000, // Real-time updates every 8s max (was 2s)
      "location-attempt": 3000, // Location attempts every 3s max (was 1s)
      "presence-dot-update": 10000, // Presence dot updates every 10s max (was 2s)
      "friend-profile-change": 15000, // Friend profile changes every 15s max (was 3s)
      "view-mode-update": 30000, // View mode changes every 30s max
      "schedule-update": 10000, // Schedule updates every 10s max
      "cleanup": 60000, // Cleanup operations every 60s max
      "debug-validation": 30000, // Debug validation every 30s max
    };

    // Much more aggressive heavy throttling for noisy messages
    this.heavyThrottleMessages = new Set([
      // Presence/Location related noise
      "Profile changed for:",
      "PresenceDot: Creating presence dot",
      "PresenceDot: Time calculation", 
      "PresenceDot: User inactive for 2+ minutes - showing timer dot",
      "PresenceDot: User active within 2 minutes - showing solid dot",
      "User presence dot updated safely",
      "Updated presence dot for",
      "Processing user activity update",
      "Presence loading started:",
      "Emitting presence data loading event",
      "Presence polling started:",
      "Campus presence loading started:",
      "Campus presence ready:",

      // HorizontalFriendsBar noise
      "CIRCUIT BREAKER: Ignoring database update during sync operations",
      "DEBUG: Validated",
      "DEBUG: Real-time update validated", 
      "Quick Access friend list unchanged, skipping expensive operations",
      "Processing real-time Quick Access update",
      "External database update received",
      "Friend list unchanged, updating presence dots only",
      "IMMEDIATE: Privacy changes synced to database",
      "External starred friends update detected",
      
      // UI/ViewMode repetitive updates
      "Day button - active:",
      "Grid button - active:",
      "UpdateViewContainers",
      "UpdateUI rendered",
      "Day view data source:",
      "All critical DOM elements are ready",
      "DOM ready after",
      "UI updated with real-time changes",
      "Cleaning up 0 schedule content event listeners",
      "Successfully cleaned up all schedule content event listeners",
      
      // Real-time update spam
      "Real-time schedule update received",
      "Broadcasting",
      "New subscriber for",
      "User profile update for:",
      "Schedule data update:",
      "Quick Access update:",
      "Profile throttled for:",
      "External database update received:",

      // Location service noise
      "3-TIER location request",
      "Trying IP info service",
      "GPS success:",
      "Browser GPS request",
      "TIER 1:",
      "TIER 2:",
      "TIER 3:",
      "IP detected successfully",
      "Activity heartbeat",
      "Health check passed",
      "Boundary detection",
      "Campus boundary check result",
      "3-tier system provided valid location data",

      // Generic debug spam
      "Setting up",
      "Found",
      "Fetching",
      "Available globally",
      "initialized successfully",
      "listener established",
      "SPA Initialization",
      "Creating SPA Router instance",
      "Template loaded successfully",
      "Injecting template content",
      "ViewModeManager",
      "UniversityCampusConfig",
    ]);
  }

  /**
   * Set logging level
   * @param {string} level - 'error', 'warn', 'info', 'debug'
   */
  setLevel(level) {
    this.currentLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  /**
   * Enable specific categories
   * @param {string[]} categories - Categories to enable
   */
  enableCategories(categories) {
    this.enabledCategories = new Set(categories);
  }

  /**
   * Check if logging should occur
   * @param {number} level - Log level
   * @param {string} category - Log category
   * @param {string} message - Log message
   */
  shouldLog(level, category, message = "") {
    // Respect the current level first
    if (level > this.currentLevel) return false;

    // In production, suppress non-critical info/debug logs UNLESS the category
    // is explicitly enabled (e.g., ?logs=location). This allows targeted
    // debugging like the 3-tier location pipeline without opening the floodgates.
    if (
      process.env.NODE_ENV === "production" &&
      level > LOG_LEVELS.WARN &&
      !PRODUCTION_CRITICAL_CATEGORIES.includes(category) &&
      // Allow explicitly enabled categories (like 'location') in production
      !this.enabledCategories.has(category)
    ) {
      return false;
    }

    if (this.enabledCategories.has("all")) return true;
    return this.enabledCategories.has(category);
  }

  /**
   * Database operation logs
   */
  db = {
    read: (message, data) =>
      this.log(LOG_LEVELS.INFO, "database", LOG_EMOJIS.DB_READ, message, data),
    write: (message, data) =>
      this.log(LOG_LEVELS.INFO, "database", LOG_EMOJIS.DB_WRITE, message, data),
    delete: (message, data) =>
      this.log(
        LOG_LEVELS.INFO,
        "database",
        LOG_EMOJIS.DB_DELETE,
        message,
        data
      ),
    cache: (message, data) =>
      this.log(
        LOG_LEVELS.DEBUG,
        "database",
        LOG_EMOJIS.DB_CACHE,
        message,
        data
      ),
    error: (message, data) =>
      this.log(
        LOG_LEVELS.ERROR,
        "database",
        LOG_EMOJIS.DB_ERROR,
        message,
        data
      ),
  };

  /**
   * Location system logs with smart throttling
   */
  location = {
    tier1: (message, data) =>
      this.log(
        LOG_LEVELS.INFO,
        "location",
        LOG_EMOJIS.LOC_NETWORK,
        `TIER 1: ${message}`,
        data
      ),
    tier2: (message, data) =>
      this.log(
        LOG_LEVELS.INFO,
        "location",
        LOG_EMOJIS.LOC_GPS,
        `TIER 2: ${message}`,
        data
      ),
    tier3: (message, data) =>
      this.log(
        LOG_LEVELS.INFO,
        "location",
        LOG_EMOJIS.LOC_GOOGLE,
        `TIER 3: ${message}`,
        data
      ),
    success: (message, data) =>
      this.log(
        LOG_LEVELS.INFO,
        "location",
        LOG_EMOJIS.LOC_SUCCESS,
        message,
        data
      ),
    fail: (message, data) =>
      this.log(
        LOG_LEVELS.ERROR,
        "location",
        LOG_EMOJIS.LOC_FAIL,
        message,
        data
      ),
    warn: (message, data) =>
      this.log(LOG_LEVELS.WARN, "location", LOG_EMOJIS.LOC_WARN, message, data),
    info: (message, data) =>
      this.log(
        LOG_LEVELS.INFO,
        "location",
        LOG_EMOJIS.LOC_SUCCESS,
        message,
        data
      ),
    tierProgress: (message, data) =>
      this.log(LOG_LEVELS.INFO, "location", LOG_EMOJIS.LOC_GPS, message, data),
    attempt: (message, data) =>
      this.log(LOG_LEVELS.INFO, "location", LOG_EMOJIS.LOC_GPS, message, data),
  };

  /**
   * Authentication logs
   */
  auth = {
    login: (message, data) =>
      this.log(LOG_LEVELS.INFO, "auth", LOG_EMOJIS.AUTH_LOGIN, message, data),
    logout: (message, data) =>
      this.log(LOG_LEVELS.INFO, "auth", LOG_EMOJIS.AUTH_LOGOUT, message, data),
    user: (message, data) =>
      this.log(LOG_LEVELS.INFO, "auth", LOG_EMOJIS.AUTH_USER, message, data),
    error: (message, data) =>
      this.log(LOG_LEVELS.ERROR, "auth", LOG_EMOJIS.AUTH_ERROR, message, data),
  };

  /**
   * Network logs
   */
  network = {
    request: (message, data) =>
      this.log(
        LOG_LEVELS.DEBUG,
        "network",
        LOG_EMOJIS.NET_REQUEST,
        message,
        data
      ),
    response: (message, data) =>
      this.log(
        LOG_LEVELS.DEBUG,
        "network",
        LOG_EMOJIS.NET_RESPONSE,
        message,
        data
      ),
    error: (message, data) =>
      this.log(
        LOG_LEVELS.ERROR,
        "network",
        LOG_EMOJIS.NET_ERROR,
        message,
        data
      ),
    offline: (message, data) =>
      this.log(
        LOG_LEVELS.WARN,
        "network",
        LOG_EMOJIS.NET_OFFLINE,
        message,
        data
      ),
  };

  /**
   * UI logs
   */
  ui = {
    init: (message, data) =>
      this.log(LOG_LEVELS.INFO, "ui", LOG_EMOJIS.UI_INIT, message, data),
    click: (message, data) =>
      this.log(LOG_LEVELS.DEBUG, "ui", LOG_EMOJIS.UI_CLICK, message, data),
    render: (message, data) =>
      this.log(LOG_LEVELS.DEBUG, "ui", LOG_EMOJIS.UI_RENDER, message, data),
    error: (message, data) =>
      this.log(LOG_LEVELS.ERROR, "ui", LOG_EMOJIS.UI_ERROR, message, data),
  };

  /**
   * System logs
   */
  system = {
    init: (message, data) =>
      this.log(LOG_LEVELS.INFO, "system", LOG_EMOJIS.SYS_INIT, message, data),
    config: (message, data) =>
      this.log(LOG_LEVELS.INFO, "system", LOG_EMOJIS.SYS_CONFIG, message, data),
    cleanup: (message, data) =>
      this.log(
        LOG_LEVELS.DEBUG,
        "system",
        LOG_EMOJIS.SYS_CLEANUP,
        message,
        data
      ),
    perf: (message, data) =>
      this.log(LOG_LEVELS.DEBUG, "system", LOG_EMOJIS.SYS_PERF, message, data),
    error: (message, data) =>
      this.log(LOG_LEVELS.ERROR, "system", LOG_EMOJIS.SYS_ERROR, message, data),
  };

  /**
   * Development logs
   */
  dev = {
    debug: (message, data) =>
      this.log(LOG_LEVELS.DEBUG, "dev", LOG_EMOJIS.DEV_DEBUG, message, data),
    test: (message, data) =>
      this.log(LOG_LEVELS.DEBUG, "dev", LOG_EMOJIS.DEV_TEST, message, data),
    info: (message, data) =>
      this.log(LOG_LEVELS.INFO, "dev", LOG_EMOJIS.DEV_INFO, message, data),
  };

  /**
   * Campus Presence logs
   */
  presence = {
    init: (message, data) =>
      this.log(LOG_LEVELS.INFO, "presence", LOG_EMOJIS.PRESENCE_INIT, message, data),
    update: (message, data) =>
      this.log(LOG_LEVELS.INFO, "presence", LOG_EMOJIS.PRESENCE_UPDATE, message, data),
    error: (message, data) =>
      this.log(LOG_LEVELS.ERROR, "presence", LOG_EMOJIS.PRESENCE_ERROR, message, data),
    info: (message, data) =>
      this.log(LOG_LEVELS.INFO, "presence", LOG_EMOJIS.PRESENCE_INIT, message, data),
  };

  /**
   * Core logging method with throttling support
   * @param {number} level - Log level
   * @param {string} category - Log category
   * @param {string} emoji - Emoji for this log type
   * @param {string} message - Log message
   * @param {any} data - Optional data to log
   * @param {string} throttleKey - Optional throttle key to prevent spam
   */
  log(level, category, emoji, message, data, throttleKey = null) {
    // Check if we should log this message at all
    if (!this.shouldLog(level, category, message)) return;

    // Heavy throttling for high-frequency messages
    if (this.isHeavilyThrottled(message)) {
      return;
    }

    // Check if this message should be throttled
    if (throttleKey && this.isThrottled(throttleKey)) {
      this.updateThrottleCount(throttleKey);
      return;
    }

    const logMessage = `${emoji} ${message}`;

    // Add throttle count if exists
    const throttleCount = this.getThrottleCount(throttleKey);
    const finalMessage =
      throttleCount > 0
        ? `${logMessage} (${throttleCount} similar)`
        : logMessage;

    if (level === LOG_LEVELS.ERROR) {
      console.error(finalMessage, data || "");
    } else if (level === LOG_LEVELS.WARN) {
      console.warn(finalMessage, data || "");
    } else {
      // For INFO and DEBUG, use console.log but with a prefix to distinguish
      console.log(finalMessage, data || "");
    }

    // Reset throttle after logging
    if (throttleKey) {
      this.resetThrottleCount(throttleKey);
      this.setThrottleTimer(throttleKey);
    }
  }

  /**
   * Check if a message should be heavily throttled
   * @param {string} message - Log message
   */
  isHeavilyThrottled(message) {
    // Check if message matches any heavily throttled patterns
    for (const pattern of this.heavyThrottleMessages) {
      if (message.includes(pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a message is currently throttled
   */
  isThrottled(throttleKey) {
    return this.throttledMessages.has(throttleKey);
  }

  /**
   * Update throttle count for a key
   */
  updateThrottleCount(throttleKey) {
    const currentCount = this.messageGroups.get(throttleKey) || 0;
    this.messageGroups.set(throttleKey, currentCount + 1);
  }

  /**
   * Get current throttle count
   */
  getThrottleCount(throttleKey) {
    return this.messageGroups.get(throttleKey) || 0;
  }

  /**
   * Reset throttle count
   */
  resetThrottleCount(throttleKey) {
    this.messageGroups.set(throttleKey, 0);
  }

  /**
   * Set throttle timer
   */
  setThrottleTimer(throttleKey) {
    const period = this.defaultThrottlePeriods[throttleKey] || 2000;

    // Clear existing timer
    if (this.throttleIntervals.has(throttleKey)) {
      clearTimeout(this.throttleIntervals.get(throttleKey));
    }

    // Mark as throttled
    this.throttledMessages.set(throttleKey, true);

    // Set timer to unthrottle
    const timer = setTimeout(() => {
      this.throttledMessages.delete(throttleKey);
      this.throttleIntervals.delete(throttleKey);
    }, period);

    this.throttleIntervals.set(throttleKey, timer);
  }

  /**
   * Group related logs together
   * @param {string} groupName - Name of the group
   * @param {function} logFunction - Function containing logs to group
   */
  group(groupName, logFunction) {
    if (!this.shouldLog(LOG_LEVELS.INFO, "dev")) return;
    
    console.group(`📋 ${groupName}`);
    try {
      logFunction();
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Collapsible group for less important logs
   * @param {string} groupName - Name of the group
   * @param {function} logFunction - Function containing logs to group
   */
  groupCollapsed(groupName, logFunction) {
    if (!this.shouldLog(LOG_LEVELS.DEBUG, "dev")) return;
    
    console.groupCollapsed(`📋 ${groupName}`);
    try {
      logFunction();
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Log a summary of operations
   * @param {string} operation - Operation name
   * @param {Object} stats - Statistics object
   */
  summary(operation, stats) {
    if (!this.shouldLog(LOG_LEVELS.INFO, "dev")) return;
    
    this.group(`${operation} Summary`, () => {
      Object.entries(stats).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    });
  }

  /**
   * Performance tracking methods
   */

  /**
   * Start a performance measurement
   * @param {string} markerName - Name of the performance marker
   */
  perfStart(markerName) {
    if (!this.shouldLog(LOG_LEVELS.DEBUG, "performance")) return;
    
    const startTime = performance.now();
    this.performanceMarkers.set(markerName, startTime);
    this.log(
      LOG_LEVELS.DEBUG,
      "performance",
      LOG_EMOJIS.SYS_PERF,
      `⏱️ Performance tracking started for: ${markerName}`
    );
  }

  /**
   * End a performance measurement and log the result
   * @param {string} markerName - Name of the performance marker
   * @param {string} description - Description of what was measured
   */
  perfEnd(markerName, description = "") {
    if (!this.shouldLog(LOG_LEVELS.DEBUG, "performance")) return;
    
    const startTime = this.performanceMarkers.get(markerName);
    if (!startTime) {
      this.log(
        LOG_LEVELS.WARN,
        "performance",
        LOG_EMOJIS.SYS_PERF,
        `⚠️ Performance marker not found: ${markerName}`
      );
      return;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.performanceMarkers.delete(markerName);
    
    const message = description 
      ? `⏱️ ${description} took ${duration.toFixed(2)}ms` 
      : `⏱️ ${markerName} took ${duration.toFixed(2)}ms`;
      
    // Use different log levels based on duration
    const level = duration > 100 ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG;
    
    this.log(
      level,
      "performance",
      LOG_EMOJIS.SYS_PERF,
      message,
      { duration: `${duration.toFixed(2)}ms`, marker: markerName }
    );
  }

  /**
   * Log a performance metric
   * @param {string} metricName - Name of the metric
   * @param {number} value - Metric value
   * @param {string} unit - Unit of measurement
   */
  perfMetric(metricName, value, unit = "") {
    if (!this.shouldLog(LOG_LEVELS.DEBUG, "performance")) return;
    
    const message = `📊 ${metricName}: ${value}${unit}`;
    const level = value > 100 ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG;
    
    this.log(
      level,
      "performance",
      LOG_EMOJIS.SYS_PERF,
      message,
      { metric: metricName, value, unit }
    );
  }

  /**
   * Specialized throttled methods for common verbose patterns
   */

  // Throttled profile update logs
  profileUpdate(userId, action = "update") {
    this.log(
      LOG_LEVELS.DEBUG,
      "auth",
      LOG_EMOJIS.AUTH_USER,
      `Profile ${action} for: ${userId}`,
      null,
      "profile-update"
    );
  }

  // Throttled UI render logs
  uiRender(component, details) {
    this.log(
      LOG_LEVELS.DEBUG,
      "ui",
      LOG_EMOJIS.UI_RENDER,
      `${component} rendered`,
      details,
      "ui-render"
    );
  }

  // Throttled real-time listener logs
  realtimeListener(action, type, userId = "") {
    this.log(
      LOG_LEVELS.DEBUG,
      "network",
      LOG_EMOJIS.NET_REQUEST,
      `${action} ${type} listener${userId ? ` for ${userId}` : ""}`,
      null,
      "listener-setup"
    );
  }

  // Throttled location attempt logs
  locationAttempt(tier, attempt, result) {
    this.log(
      LOG_LEVELS.INFO,
      "location",
      LOG_EMOJIS.LOC_GPS,
      `TIER ${tier}: Attempt ${attempt} - ${result}`,
      null,
      "location-attempt"
    );
  }

  // Throttled presence dot updates
  presenceDotUpdate(friendName, status) {
    this.log(
      LOG_LEVELS.DEBUG,
      "presence",
      LOG_EMOJIS.PRESENCE_UPDATE,
      `Presence dot updated for ${friendName}: ${status}`,
      null,
      "presence-dot-update"
    );
  }

  // Throttled friend profile changes
  friendProfileChange(friendName, changeType) {
    this.log(
      LOG_LEVELS.DEBUG,
      "auth",
      LOG_EMOJIS.AUTH_USER,
      `Friend profile change for ${friendName}: ${changeType}`,
      null,
      "friend-profile-change"
    );
  }

  // Group location tier operations
  locationTierGroup(tier, operations) {
    if (!this.shouldLog(LOG_LEVELS.INFO, "location")) return;
    
    this.groupCollapsed(`🌍 Location Tier ${tier} Operations`, () => {
      operations.forEach((op) => {
        console.log(`  ${op.emoji} ${op.message}`, op.data || "");
      });
    });
  }

  // Group real-time updates
  realtimeGroup(type, updates) {
    if (!this.shouldLog(LOG_LEVELS.DEBUG, "network") || updates.length === 0) return;
    
    if (updates.length > 3) {
      this.groupCollapsed(
        `📡 ${type} Real-time Updates (${updates.length})`,
        () => {
          updates.forEach((update) => {
            console.log(
              `  ${update.emoji} ${update.message}`,
              update.data || ""
            );
          });
        }
      );
    } else {
      // Log normally if few updates
      updates.forEach((update) => {
        this.log(
          LOG_LEVELS.DEBUG,
          "network",
          update.emoji,
          update.message,
          update.data
        );
      });
    }
  }

  // Batch similar operations
  batchOperations(operationType, operations) {
    if (!this.shouldLog(LOG_LEVELS.DEBUG, "database") || operations.length === 0) return;
    
    if (operations.length > 5) {
      this.groupCollapsed(
        `🔄 ${operationType} Operations (${operations.length})`,
        () => {
          operations.forEach((op) => {
            console.log(
              `  ${op.status === "success" ? "✅" : "❌"} ${op.message}`
            );
          });
        }
      );
    } else {
      operations.forEach((op) => {
        const emoji =
          op.status === "success" ? LOG_EMOJIS.DB_READ : LOG_EMOJIS.DB_ERROR;
        this.log(LOG_LEVELS.DEBUG, "database", emoji, op.message, op.data);
      });
    }
  }
}

// Create singleton instance
export const logManager = new LogManager();

// Expose to window for console debugging
if (typeof window !== "undefined") {
  window.logManager = logManager;

  // Add convenient console commands
  window.debugLogs = {
    // Show all log types
    all: () => {
      logManager.setLevel("debug");
      logManager.enableCategories(["all"]);
      console.log("🔧 All logs enabled");
    },

    // Show only location logs
    location: () => {
      logManager.setLevel("debug");
      logManager.enableCategories(["location"]);
      console.log("📍 Location logs only");
    },

    // Show only database logs
    database: () => {
      logManager.setLevel("debug");
      logManager.enableCategories(["database"]);
      console.log("📤 Database logs only");
    },

    // Show only presence logs
    presence: () => {
      logManager.setLevel("debug");
      logManager.enableCategories(["presence"]);
      console.log("🌍 Campus Presence logs only");
    },

    // Show only errors and warnings
    quiet: () => {
      logManager.setLevel("warn");
      logManager.enableCategories(["all"]);
      console.log("🔇 Quiet mode - warnings and errors only");
    },

    // Performance monitoring
    perf: () => {
      logManager.setLevel("debug");
      logManager.enableCategories(["performance"]);
      console.log("⏱️ Performance logs only");
    },

    // Show only critical logs (errors and warnings)
    critical: () => {
      logManager.setLevel("warn");
      logManager.enableCategories(["error", "auth", "system", "presence"]);
      console.log("🚨 Critical logs only (errors, auth, system, presence)");
    },

    // Show help
    help: () => {
      console.log(
        `🔧 Debug Log Controls: 
        debugLogs.all() | debugLogs.location() | debugLogs.database() | 
        debugLogs.presence() | debugLogs.perf() | debugLogs.quiet() | 
        debugLogs.critical() | debugLogs.help()`
      );
    },
  };

  if (process.env.NODE_ENV === "development") {
    console.log("💡 Use debugLogs.help() to see logging controls");
  }
}
