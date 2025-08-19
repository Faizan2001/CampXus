/**
 * CampusLocationService.js
 *
 * Service for detecting campus presence using geolocation and polygon-based boundary detection.
 * Implements point-in-polygon algorithm to determine if user is physically on campus.
 *
 * Phase 1.1 - Campus Presence Implementation
 */

// Import campus boundary configurations
import {
  getCampusConfig,
  validateCampusConfig,
} from "./UniversityCampusConfig.js";

/**
 * Service class for campus location detection and presence management
 */
export class CampusLocationService {
  constructor() {
    this.isLocationSupported = "geolocation" in navigator;
    this.currentPosition = null;
    this.permissionStatus = null;

    // Location tracking properties
    this.trackingWatchId = null;
    this.periodicUpdateInterval = null;

    // Debouncing and optimization properties
    this.lastLocationUpdate = null;
    this.locationUpdateDebounceTimeout = null;
    this.minUpdateInterval = 60000; // Minimum 60 seconds between updates
    this.isUpdatingLocation = false; // Prevent concurrent updates

    // Initialization and health monitoring properties
    this.initializationAttempts = 0;
    this.maxInitializationAttempts = 5;
    this.initializationRetryTimeout = null;
    this.lastHealthCheck = null;
    this.healthCheckInterval = null;
    this.isInitialized = false;
    this.initializationErrors = [];

    // Activity tracking properties
    this.isUserCurrentlyActive = false;
    this.lastActivityDetected = null;
    this.activityHeartbeatInterval = null;
    this.minActivityInterval = 60000; // OPTIMIZED: Activity updates every 60 seconds for better battery life
    this.isUpdatingActivity = false; // Prevent concurrent activity updates

    console.log("[CampusLocationService] Service initialized", {
      geolocationSupported: this.isLocationSupported,
      timestamp: new Date().toISOString(),
    });

    // Initialize activity detection
    this.initializeActivityDetection();
  }

  /**
   * Request geolocation permission from the browser
   * This method actually triggers the browser's permission dialog
   * @returns {Promise<boolean>} True if permission granted, false otherwise
   */
  async requestLocationPermission() {
    console.log("[CampusLocationService] Requesting location permission...");

    if (!this.isLocationSupported) {
      console.error(
        "[CampusLocationService] Geolocation not supported by browser"
      );
      return false;
    }

    try {
      // Check if we're on a secure context (HTTPS or localhost)
      const isSecureContext =
        window.isSecureContext ||
        location.protocol === "https:" ||
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1";

      if (!isSecureContext) {
        console.warn(
          "[CampusLocationService] ⚠️ Geolocation requires HTTPS in production. For development, this will show a graceful fallback."
        );
        // In development over HTTP, provide a mock location for testing
        this.permissionStatus = "granted";
        return true;
      }

      // IMPORTANT: To trigger the browser permission dialog, we must actually call getCurrentPosition
      // Just checking permissions.query doesn't trigger the dialog
      console.log(
        "[CampusLocationService] Triggering permission dialog with getCurrentPosition..."
      );

      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log(
              "[CampusLocationService] ✅ Location permission GRANTED by user"
            );
            this.permissionStatus = "granted";
            this.currentPosition = position;

            // Update permission status via permissions API if available
            if ("permissions" in navigator) {
              navigator.permissions
                .query({ name: "geolocation" })
                .then((permission) => {
                  permission.addEventListener("change", () => {
                    this.permissionStatus = permission.state;
                    console.log(
                      "[CampusLocationService] Permission changed to:",
                      permission.state
                    );
                  });
                });
            }

            resolve(true);
          },
          (error) => {
            console.log("[CampusLocationService] Location permission result:", {
              code: error.code,
              message: error.message,
              timestamp: new Date().toISOString(),
            });

            switch (error.code) {
              case error.PERMISSION_DENIED:
                console.log(
                  "[CampusLocationService] ❌ Location permission DENIED by user"
                );
                this.permissionStatus = "denied";
                break;
              case error.POSITION_UNAVAILABLE:
                console.log(
                  "[CampusLocationService] ⚠️ Location unavailable (GPS off or no signal)"
                );
                this.permissionStatus = "granted"; // Permission granted but location unavailable
                break;
              case error.TIMEOUT:
                console.log(
                  "[CampusLocationService] ⏱️ Location request timeout"
                );
                this.permissionStatus = "granted"; // Permission granted but timed out
                break;
              default:
                console.log(
                  "[CampusLocationService] ❓ Unknown location error"
                );
                this.permissionStatus = "prompt";
                break;
            }

            resolve(error.code !== error.PERMISSION_DENIED);
          },
          {
            timeout: 10000, // 10 second timeout
            enableHighAccuracy: false, // Don't need high accuracy for permission test
            maximumAge: 600000, // 10 minutes cache acceptable for permission test
          }
        );
      });
    } catch (error) {
      console.error(
        "[CampusLocationService] Error requesting location permission:",
        error
      );
      this.permissionStatus = "denied";
      return false;
    }
  }

  /**
   * Get current location from browser geolocation API with adaptive battery optimization
   * @param {boolean} highAccuracy - Whether to use high accuracy mode (default: false for battery efficiency)
   * @returns {Promise<GeolocationPosition|null>} Current position or null if failed
   */
  async getCurrentLocation(highAccuracy = false) {
    console.log("[CampusLocationService] Getting current location...");

    if (!this.isLocationSupported) {
      console.error("[CampusLocationService] Geolocation not supported");
      return null;
    }

    return new Promise((resolve, reject) => {
      // FIXED: Adaptive GPS settings based on use case for better battery efficiency
      const options = {
        enableHighAccuracy: highAccuracy, // OPTIMIZED: Only use high accuracy when explicitly needed
        timeout: highAccuracy ? 15000 : 30000, // ADAPTIVE: Longer timeout for low-power mode
        maximumAge: highAccuracy ? 60000 : 300000, // ADAPTIVE: More aggressive caching for battery efficiency
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentPosition = position;
          console.log("[CampusLocationService] Location obtained:", {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(position.timestamp).toISOString(),
          });
          resolve(position);
        },
        (error) => {
          console.error("[CampusLocationService] Error getting location:", {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
          });

          // Log specific error types
          switch (error.code) {
            case error.PERMISSION_DENIED:
              console.error(
                "[CampusLocationService] Location access denied by user"
              );
              break;
            case error.POSITION_UNAVAILABLE:
              console.error(
                "[CampusLocationService] Location information unavailable"
              );
              break;
            case error.TIMEOUT:
              console.error("[CampusLocationService] Location request timeout");
              break;
            default:
              console.error("[CampusLocationService] Unknown location error");
              break;
          }

          resolve(null);
        },
        options
      );
    });
  }

  /**
   * Detect if user is currently on campus for a specific university
   * @param {string} university - University code (e.g., 'iub', 'du')
   * @returns {Promise<{onCampus: boolean, confidence: number, location?: object}>}
   */
  async detectCampusPresence(university) {
    console.log(
      "[CampusLocationService] Detecting campus presence for:",
      university
    );

    try {
      // Get current location
      const position = await this.getCurrentLocation();
      if (!position) {
        console.warn(
          "[CampusLocationService] Cannot detect campus presence - location unavailable"
        );
        return {
          onCampus: false,
          confidence: 0,
          error: "Location unavailable",
        };
      }

      // Check if on campus using polygon detection
      const result = this.isLocationOnCampus(position, university);

      console.log("[CampusLocationService] Campus presence detection result:", {
        university,
        onCampus: result.onCampus,
        confidence: result.confidence,
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
        timestamp: new Date().toISOString(),
      });

      return {
        ...result,
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        },
      };
    } catch (error) {
      console.error(
        "[CampusLocationService] Error detecting campus presence:",
        error
      );
      return {
        onCampus: false,
        confidence: 0,
        error: error.message,
      };
    }
  }

  /**
   * Check if a given location is within campus boundaries
   * @param {GeolocationPosition} position - User's current position
   * @param {string} university - University code
   * @returns {{onCampus: boolean, confidence: number, distanceFromCenter?: number}}
   */
  isLocationOnCampus(position, university) {
    console.log("[CampusLocationService] Checking if location is on campus:", {
      university,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });

    // Get campus configuration for the university
    const campusConfig = getCampusConfig(university);
    if (!campusConfig) {
      console.error(
        "[CampusLocationService] No campus configuration found for:",
        university
      );
      return {
        onCampus: false,
        confidence: 0,
        error: "Campus configuration not found",
      };
    }

    const userPoint = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };

    // Check against campus boundary polygon
    const isInside = this.pointInPolygon(userPoint, campusConfig.boundary);

    // Calculate distance from campus center for confidence scoring
    const distanceFromCenter = this.calculateDistance(
      userPoint,
      campusConfig.center
    );

    // Calculate confidence based on accuracy and distance from center
    let confidence = 0;
    if (isInside) {
      // High confidence if inside boundary and good GPS accuracy
      const accuracyFactor = Math.max(0, 1 - position.coords.accuracy / 100);
      const distanceFactor = Math.max(
        0,
        1 - distanceFromCenter / campusConfig.radius
      );
      confidence = Math.min(1, accuracyFactor * 0.6 + distanceFactor * 0.4);
    }

    console.log("[CampusLocationService] Campus boundary check result:", {
      university,
      isInside,
      confidence: Math.round(confidence * 100),
      distanceFromCenter: Math.round(distanceFromCenter),
      gpsAccuracy: position.coords.accuracy,
      campusRadius: campusConfig.radius,
    });

    return {
      onCampus: isInside,
      confidence: Math.round(confidence * 100) / 100, // Round to 2 decimal places
      distanceFromCenter: Math.round(distanceFromCenter),
    };
  }

  /**
   * Point-in-polygon algorithm implementation (Ray Casting)
   * @param {object} point - Point to test {lat, lng}
   * @param {Array} polygon - Array of points defining the polygon boundary
   * @returns {boolean} True if point is inside polygon
   */
  pointInPolygon(point, polygon) {
    console.log("[CampusLocationService] Running point-in-polygon check for:", {
      point,
      polygonVertices: polygon.length,
    });

    if (!polygon || polygon.length < 3) {
      console.error(
        "[CampusLocationService] Invalid polygon - need at least 3 vertices"
      );
      return false;
    }

    let isInside = false;
    const x = point.lng;
    const y = point.lat;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      // Ray casting algorithm
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        isInside = !isInside;
      }
    }

    console.log("[CampusLocationService] Point-in-polygon result:", {
      point,
      isInside,
      algorithm: "ray-casting",
    });

    return isInside;
  }

  /**
   * Calculate distance between two geographic points using Haversine formula
   * @param {object} point1 - First point {lat, lng}
   * @param {object} point2 - Second point {lat, lng}
   * @returns {number} Distance in meters
   */
  calculateDistance(point1, point2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (point1.lat * Math.PI) / 180;
    const φ2 = (point2.lat * Math.PI) / 180;
    const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
    const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;

    console.log("[CampusLocationService] Distance calculated:", {
      from: point1,
      to: point2,
      distance: Math.round(distance),
      unit: "meters",
    });

    return distance;
  }

  /**
   * Get current permission status
   * @returns {string|null} Permission status: 'granted', 'denied', 'prompt', or null
   */
  getPermissionStatus() {
    return this.permissionStatus;
  }

  /**
   * Check if geolocation is supported by the browser
   * @returns {boolean} True if supported
   */
  isGeolocationSupported() {
    return this.isLocationSupported;
  }

  /**
   * Get the last known position
   * @returns {GeolocationPosition|null} Last known position or null
   */
  getLastKnownPosition() {
    return this.currentPosition;
  }

  /**
   * Start watching position changes (for future real-time tracking)
   * @param {Function} callback - Callback function for position updates
   * @returns {number|null} Watch ID for stopping the watch
   */
  watchPosition(callback) {
    console.log("[CampusLocationService] Starting position watch...");

    if (!this.isLocationSupported) {
      console.error(
        "[CampusLocationService] Cannot watch position - geolocation not supported"
      );
      return null;
    }

    // FIXED: Battery-optimized configuration for campus presence tracking
    const options = {
      enableHighAccuracy: false, // CHANGED: Use false for battery efficiency, true only for navigation apps
      timeout: 30000, // INCREASED: 30 seconds for slower GPS fixes, especially indoors
      maximumAge: 300000, // CHANGED: 5 minutes cache to reduce GPS polling frequency
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentPosition = position;
        console.log("[CampusLocationService] Position update received:", {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
        });
        if (callback) callback(position);
      },
      (error) => {
        // Handle different error types with appropriate logging levels
        switch (error.code) {
          case error.TIMEOUT:
            console.warn(
              "[CampusLocationService] ⏱️ GPS timeout (normal for indoor/slow GPS) - will retry on next update"
            );
            break;
          case error.PERMISSION_DENIED:
            console.error(
              "[CampusLocationService] 🚫 Location permission denied"
            );
            break;
          case error.POSITION_UNAVAILABLE:
            console.warn(
              "[CampusLocationService] 📍 GPS temporarily unavailable - will retry"
            );
            break;
          default:
            console.warn(
              "[CampusLocationService] 📍 Location error:",
              error.message
            );
        }
        if (callback) callback(null, error);
      },
      options
    );

    if (watchId !== null) {
      console.log(
        "[CampusLocationService] Position watch started with ID:",
        watchId
      );
      return watchId;
    } else {
      console.error("[CampusLocationService] Failed to start position watch");
      return null;
    }
  }

  /**
   * Stop watching position changes
   * @param {number} watchId - Watch ID returned from watchPosition
   */
  clearWatch(watchId) {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      console.log(
        "[CampusLocationService] Position watch stopped for ID:",
        watchId
      );
    }
  }

  /**
   * Start automatic location tracking for campus presence
   * This method starts watching position and updates database automatically
   * Called when users enable location sharing
   */
  async startLocationTracking() {
    console.log(
      "[CampusLocationService] Starting automatic location tracking..."
    );

    if (!this.isLocationSupported) {
      console.error(
        "[CampusLocationService] Cannot start tracking - geolocation not supported"
      );
      return;
    }

    // Don't start tracking if already tracking
    if (this.trackingWatchId) {
      console.log("[CampusLocationService] Location tracking already active");
      return;
    }

    try {
      // Import DataService dynamically to avoid circular dependencies
      const { dataManager } = await import("../data/DataService.js");
      const { currentUser } = await import("../../store/userStore.js");

      if (!currentUser?.uid) {
        console.error(
          "[CampusLocationService] Cannot start tracking - no current user"
        );
        return;
      }

      console.log(
        "[CampusLocationService] Starting position watch for automatic tracking..."
      );

      // Start watching position with debounced automatic database updates
      // OPTIMIZED: Use battery-efficient GPS settings for continuous tracking
      this.trackingWatchId = this.watchPosition(async (position, error) => {
        if (error) {
          // Enhanced error handling with battery-conscious retry strategies
          switch (error.code) {
            case 1: // PERMISSION_DENIED
              console.error("[CampusLocationService] 🚫 Location permission denied - stopping tracking");
              this.stopLocationTracking();
              return;
            case 2: // POSITION_UNAVAILABLE
              console.warn("[CampusLocationService] 📍 GPS temporarily unavailable - will retry (battery optimized)");
              break;
            case 3: // TIMEOUT
              console.warn("[CampusLocationService] ⏱️ Location timeout (normal indoors) - GPS will retry automatically with longer interval");
              break;
            default:
              console.warn("[CampusLocationService] ⚠️ Location error:", error.message);
          }
          return;
        }

        if (position) {
          // Use debounced update to prevent excessive database calls
          this.debouncedLocationUpdate(position);
        }
      });

      console.log(
        "[CampusLocationService] ✅ Automatic location tracking started with watch ID:",
        this.trackingWatchId
      );

      // Don't start periodic updates when watchPosition is active to avoid dual tracking
      console.log(
        "[CampusLocationService] ⚠️  Skipping periodic updates - watchPosition is handling real-time tracking"
      );
    } catch (error) {
      console.error(
        "[CampusLocationService] Error starting location tracking:",
        error
      );
    }
  }

  /**
   * Stop automatic location tracking
   */
  stopLocationTracking() {
    console.log(
      "[CampusLocationService] Stopping automatic location tracking..."
    );

    // Clear position watch
    if (this.trackingWatchId) {
      this.clearWatch(this.trackingWatchId);
      this.trackingWatchId = null;
      console.log("[CampusLocationService] Position watch stopped");
    }

    // Clear periodic updates
    if (this.periodicUpdateInterval) {
      clearInterval(this.periodicUpdateInterval);
      this.periodicUpdateInterval = null;
      console.log("[CampusLocationService] Periodic updates stopped");
    }

    // Clear debounce timeout
    if (this.locationUpdateDebounceTimeout) {
      clearTimeout(this.locationUpdateDebounceTimeout);
      this.locationUpdateDebounceTimeout = null;
      console.log("[CampusLocationService] Location update debounce cleared");
    }

    // Stop activity heartbeat and health monitoring
    this.stopActivityHeartbeat();
    this.stopHealthMonitoring();

    // Clear initialization retry timeout
    if (this.initializationRetryTimeout) {
      clearTimeout(this.initializationRetryTimeout);
      this.initializationRetryTimeout = null;
    }

    // Reset state
    this.isUpdatingLocation = false;
    this.lastLocationUpdate = null;
    this.isUpdatingActivity = false;
    this.isInitialized = false;
    this.initializationAttempts = 0;
    this.initializationErrors = [];

    console.log(
      "[CampusLocationService] ✅ Location tracking, activity heartbeat, and health monitoring stopped"
    );
  }

  /**
   * Debounced location update method to prevent excessive database calls
   * Only updates if minimum time interval has passed since last update
   * @param {GeolocationPosition} position - GPS position data
   */
  debouncedLocationUpdate(position) {
    // Clear any pending debounce timeout
    if (this.locationUpdateDebounceTimeout) {
      clearTimeout(this.locationUpdateDebounceTimeout);
    }

    // Check if we should skip this update based on timing
    const now = Date.now();
    if (
      this.lastLocationUpdate &&
      now - this.lastLocationUpdate < this.minUpdateInterval
    ) {
      console.log(
        `[CampusLocationService] ⏱️ Skipping location update - only ${Math.round(
          (now - this.lastLocationUpdate) / 1000
        )}s since last update (min: 60s)`
      );
      return;
    }

    // OPTIMIZED: Increased debounce to 10 seconds to reduce database calls and UI churn
    this.locationUpdateDebounceTimeout = setTimeout(async () => {
      try {
        if (this.isUpdatingLocation) {
          console.log(
            "[CampusLocationService] ⚠️ Location update already in progress, skipping"
          );
          return;
        }

        this.isUpdatingLocation = true;
        this.lastLocationUpdate = now;

        // Import DataService dynamically to avoid circular dependencies
        const { dataManager } = await import("../data/DataService.js");
        const { currentUser } = await import("../../store/userStore.js");

        if (!currentUser?.uid) {
          console.error(
            "[CampusLocationService] Cannot update location - no current user"
          );
          return;
        }

        // Detect campus presence
        const campusPresenceResult = await this.detectCampusPresence("iub");
        const campusStatus =
          campusPresenceResult?.onCampus !== undefined
            ? campusPresenceResult.onCampus
              ? "on_campus"
              : "off_campus"
            : "unknown";

        console.log(
          "[CampusLocationService] 📍 Updating location in database (debounced):",
          {
            campusStatus,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            intervalSinceLastUpdate: this.lastLocationUpdate
              ? `${Math.round((now - this.lastLocationUpdate) / 1000)}s`
              : "first_update",
          }
        );

        // Update user location status in database
        const updateResult = await dataManager.updateUserLocationStatus(
          currentUser.uid,
          campusStatus,
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          }
        );

        if (updateResult.success) {
          console.log(
            "[CampusLocationService] ✅ Location updated successfully (debounced)"
          );

          // Emit real-time campus presence change event for friends to see updates
          try {
            const { realTimeManager } = await import(
              "../realtime/RealtimeService.js"
            );
            realTimeManager.emitCampusPresenceChange(
              currentUser.uid,
              campusStatus,
              {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp,
              }
            );
            console.log(
              "[CampusLocationService] 📡 Campus presence change event emitted"
            );
          } catch (realtimeError) {
            console.warn(
              "[CampusLocationService] ⚠️ Failed to emit presence change event:",
              realtimeError
            );
          }
        } else {
          console.error(
            "[CampusLocationService] ❌ Failed to update location (debounced):",
            updateResult.error
          );
        }
      } catch (updateError) {
        console.error(
          "[CampusLocationService] Error in debounced location update:",
          updateError
        );
      } finally {
        this.isUpdatingLocation = false;
      }
    }, 10000); // OPTIMIZED: 10 second debounce for better battery life and reduced UI churn
  }

  /**
   * Set up periodic location updates as fallback system
   * ENHANCED: Now works alongside watchPosition with health monitoring
   * Updates location every 5 minutes as backup when primary GPS tracking fails
   */
  async startPeriodicLocationUpdates() {
    if (this.periodicUpdateInterval) {
      console.log(
        "[CampusLocationService] ⚠️ Periodic updates already running"
      );
      return;
    }

    // FIXED: Allow periodic updates to run as backup even with watchPosition active
    // This provides redundancy when GPS becomes unreliable
    console.log(
      "[CampusLocationService] 🔄 Starting periodic location updates as backup system..."
    );

    this.periodicUpdateInterval = setInterval(async () => {
      // Skip if a location update is already in progress to prevent conflicts
      if (this.isUpdatingLocation) {
        console.log(
          "[CampusLocationService] ⏭️ Skipping periodic update - location update in progress"
        );
        return;
      }
      try {
        const { dataManager } = await import("../data/DataService.js");
        const { currentUser } = await import("../../store/userStore.js");

        if (!currentUser?.uid) {
          console.warn(
            "[CampusLocationService] No current user for periodic update"
          );
          return;
        }

        console.log(
          "[CampusLocationService] 🔄 Performing periodic location update (battery optimized)..."
        );

        // Use battery-optimized GPS for periodic updates
        const position = await this.getCurrentLocation(false);
        if (position) {
          const campusPresenceResult = await this.detectCampusPresence("iub");
          const campusStatus =
            campusPresenceResult?.onCampus !== undefined
              ? campusPresenceResult.onCampus
                ? "on_campus"
                : "off_campus"
              : "unknown";

          console.log(
            "[CampusLocationService] Periodic update - Campus status:",
            campusStatus
          );

          const updateResult = await dataManager.updateUserLocationStatus(
            currentUser.uid,
            campusStatus,
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
            }
          );

          if (updateResult.success) {
            console.log(
              "[CampusLocationService] ✅ Periodic location update successful"
            );
          } else {
            console.error(
              "[CampusLocationService] ❌ Periodic location update failed:",
              updateResult.error
            );
          }
        } else {
          console.warn(
            "[CampusLocationService] Periodic update - no position available"
          );
        }
      } catch (error) {
        console.error(
          "[CampusLocationService] Error in periodic location update:",
          error
        );
      }
    }, 5 * 60 * 1000); // 5 minutes as specified in implementation plan

    console.log(
      "[CampusLocationService] ✅ Periodic location updates started as backup system (5-minute intervals)"
    );
  }

  /**
   * Automatically start location tracking if user has location sharing enabled
   * Called when user loads the website or profile is loaded
   * ENHANCED: Robust initialization with retry logic and health monitoring
   */
  async autoStartLocationTracking() {
    this.initializationAttempts++;
    
    try {
      console.log(
        `[CampusLocationService] 🚀 Initialization attempt ${this.initializationAttempts}/${this.maxInitializationAttempts} - checking if automatic location tracking should start...`
      );

      // Import required services with error handling
      let currentUser;
      try {
        const userModule = await import("../../store/userStore.js");
        currentUser = userModule.currentUser;
      } catch (importError) {
        console.error("[CampusLocationService] ❌ Failed to import required services:", importError);
        this.scheduleInitializationRetry("Service import failed");
        return;
      }

      // Check if user is logged in
      if (!currentUser?.uid) {
        console.log(
          "[CampusLocationService] ⏳ No user logged in - scheduling retry"
        );
        this.scheduleInitializationRetry("No current user");
        return;
      }

      // Wait for user profile with timeout to prevent infinite waiting
      let userProfile;
      try {
        const profilePromise = currentUser.waitForProfile();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile load timeout')), 10000)
        );
        userProfile = await Promise.race([profilePromise, timeoutPromise]);
      } catch (profileError) {
        console.warn("[CampusLocationService] ⏳ Profile loading failed, scheduling retry:", profileError.message);
        this.scheduleInitializationRetry("Profile unavailable");
        return;
      }

      if (!userProfile) {
        console.log(
          "[CampusLocationService] ⏳ No user profile available - scheduling retry"
        );
        this.scheduleInitializationRetry("Profile not ready");
        return;
      }

      // Check if global location sharing is enabled
      const globalLocationEnabled =
        userProfile?.systemInfo?.locationSharingEnabled;
      if (!globalLocationEnabled) {
        console.log(
          "[CampusLocationService] 🔒 Global location sharing disabled - initialization complete (tracking disabled)"
        );
        this.isInitialized = true;
        return;
      }

      // Check if user has any friends with mutual location sharing enabled
      let hasLocationSharingFriends;
      try {
        hasLocationSharingFriends = await this.checkForLocationSharingFriends();
      } catch (friendsError) {
        console.warn("[CampusLocationService] ⚠️ Failed to check location sharing friends:", friendsError);
        this.scheduleInitializationRetry("Friends check failed");
        return;
      }

      if (!hasLocationSharingFriends) {
        console.log(
          "[CampusLocationService] 👥 No friends with mutual location sharing - initialization complete (no sharing needed)"
        );
        this.isInitialized = true;
        return;
      }

      // Check if tracking is already active
      if (this.isTrackingActive()) {
        console.log("[CampusLocationService] ✅ Location tracking already active - initialization complete");
        this.isInitialized = true;
        return;
      }

      console.log(
        "[CampusLocationService] ✅ All conditions met - starting automatic location tracking"
      );
      
      // Start location tracking with fallback mechanisms
      try {
        await this.startLocationTracking();
        
        // Verify tracking started successfully with health check
        setTimeout(() => this.performHealthCheck(), 5000);
        
      } catch (trackingError) {
        console.warn("[CampusLocationService] ⚠️ Primary location tracking failed:", trackingError);
      }

      // Always try to start periodic updates as fallback if watchPosition isn't working
      if (!this.trackingWatchId) {
        console.log(
          "[CampusLocationService] 🔄 watchPosition not active, starting periodic updates as fallback"
        );
        try {
          await this.startPeriodicLocationUpdates();
        } catch (periodicError) {
          console.error("[CampusLocationService] ❌ Periodic updates also failed:", periodicError);
          this.scheduleInitializationRetry("All tracking methods failed");
          return;
        }
      }

      // Always start activity heartbeat for user presence tracking
      this.startActivityHeartbeat();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.isInitialized = true;
      this.initializationAttempts = 0; // Reset counter on success
      this.initializationErrors = []; // Clear error history
      
      console.log(
        "[CampusLocationService] 🎉 Location tracking initialization completed successfully"
      );
      
    } catch (error) {
      console.error(
        "[CampusLocationService] ❌ Unexpected error in auto-start location tracking:",
        error
      );
      this.scheduleInitializationRetry(error.message);
    }
  }

  /**
   * Schedule initialization retry with exponential backoff
   * @param {string} reason - Reason for retry
   */
  scheduleInitializationRetry(reason) {
    if (this.initializationAttempts >= this.maxInitializationAttempts) {
      console.error(
        `[CampusLocationService] ❌ Maximum initialization attempts (${this.maxInitializationAttempts}) reached. Giving up.`,
        {
          attempts: this.initializationAttempts,
          errors: this.initializationErrors,
          lastReason: reason
        }
      );
      return;
    }

    this.initializationErrors.push({
      attempt: this.initializationAttempts,
      reason,
      timestamp: new Date().toISOString()
    });

    // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, 8s, 16s)
    const retryDelay = Math.min(Math.pow(2, this.initializationAttempts) * 1000, 30000); // Max 30s
    
    console.log(
      `[CampusLocationService] ⏳ Scheduling initialization retry ${this.initializationAttempts + 1}/${this.maxInitializationAttempts} in ${retryDelay}ms. Reason: ${reason}`
    );

    if (this.initializationRetryTimeout) {
      clearTimeout(this.initializationRetryTimeout);
    }

    this.initializationRetryTimeout = setTimeout(() => {
      this.autoStartLocationTracking();
    }, retryDelay);
  }

  /**
   * Check if user has any friends with mutual location sharing enabled
   * @returns {Promise<boolean>} True if user has location-sharing friends
   */
  async checkForLocationSharingFriends() {
    try {
      const { dataManager } = await import("../data/DataService.js");
      const { currentUser } = await import("../../store/userStore.js");

      if (!currentUser?.uid) {
        return false;
      }

      // Get all friendships for current user
      const friendships = await dataManager.getUserFriendships(currentUser.uid);

      // Check if any friendship has mutual location sharing enabled
      for (const friendship of friendships) {
        const locationVisibility = friendship.locationVisibility;
        if (locationVisibility) {
          const userShares = locationVisibility[currentUser.uid];
          const friendShares =
            locationVisibility[
              friendship.user1Id === currentUser.uid
                ? friendship.user2Id
                : friendship.user1Id
            ];

          // If both users have enabled location sharing
          if (userShares && friendShares) {
            console.log(
              "[CampusLocationService] Found mutual location sharing with friend:",
              friendship.user1Id === currentUser.uid
                ? friendship.user2Id
                : friendship.user1Id
            );
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error(
        "[CampusLocationService] Error checking for location sharing friends:",
        error
      );
      return false;
    }
  }

  /**
   * Initialize activity detection using Page Visibility API and passive event listeners
   * Called from constructor to set up battery-efficient activity monitoring
   */
  initializeActivityDetection() {
    console.log("[CampusLocationService] Initializing activity detection...");

    // Page Visibility API - detect when user switches tabs/apps
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.isUserCurrentlyActive = true;
        this.lastActivityDetected = Date.now();
        console.log(
          "[CampusLocationService] 👁️ User returned to tab - marked as active"
        );
      }
    });

    // Passive activity listeners - battery efficient, no preventDefault
    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];
    const throttledActivityHandler = this.throttle(() => {
      this.isUserCurrentlyActive = true;
      this.lastActivityDetected = Date.now();
    }, 5000); // Throttle to max once per 5 seconds

    activityEvents.forEach((event) => {
      document.addEventListener(event, throttledActivityHandler, {
        passive: true,
        capture: false,
      });
    });

    console.log(
      "[CampusLocationService] ✅ Activity detection initialized with passive listeners"
    );
  }

  /**
   * Start activity heartbeat system (30-second intervals)
   * Separate from location tracking for better battery efficiency
   */
  startActivityHeartbeat() {
    if (this.activityHeartbeatInterval) {
      console.log("[CampusLocationService] Activity heartbeat already running");
      return;
    }

    console.log(
      "[CampusLocationService] Starting activity heartbeat (60s intervals - optimized for battery life)..."
    );

    this.activityHeartbeatInterval = setInterval(async () => {
      if (this.isUserCurrentlyActive) {
        try {
          if (this.isUpdatingActivity) {
            // Skip logging to reduce console spam - only log if debugging
            if (window.location.hostname === "localhost") {
              console.log(
                "[CampusLocationService] ⚠️ Activity update in progress, skipping this heartbeat"
              );
            }
            return;
          }

          this.isUpdatingActivity = true;

          // Import DataService dynamically to avoid circular dependencies
          const { dataManager } = await import("../data/DataService.js");
          const { currentUser } = await import("../../store/userStore.js");

          if (currentUser?.uid) {
            // Only log activity heartbeat in development to reduce console spam
            if (window.location.hostname === "localhost") {
              console.log(
                "[CampusLocationService] 💓 Activity heartbeat - updating user last active"
              );
            }
            await dataManager.updateUserLastActive(currentUser.uid);

            // Emit activity change event for real-time updates
            try {
              const { realTimeManager } = await import(
                "../realtime/RealtimeService.js"
              );
              realTimeManager.emitUserActivityChange(currentUser.uid, true);
            } catch (realtimeError) {
              console.warn(
                "[CampusLocationService] ⚠️ Failed to emit activity change:",
                realtimeError
              );
            }
          }

          // Reset activity flag after successful update
          this.isUserCurrentlyActive = false;
        } catch (error) {
          console.error(
            "[CampusLocationService] Error in activity heartbeat:",
            error
          );
        } finally {
          this.isUpdatingActivity = false;
        }
      }
    }, this.minActivityInterval); // 60 seconds (optimized)

    console.log("[CampusLocationService] ✅ Activity heartbeat started");
  }

  /**
   * Stop activity heartbeat system
   */
  stopActivityHeartbeat() {
    if (this.activityHeartbeatInterval) {
      clearInterval(this.activityHeartbeatInterval);
      this.activityHeartbeatInterval = null;
      console.log("[CampusLocationService] Activity heartbeat stopped");
    }
  }

  /**
   * Utility function to throttle activity detection
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /**
   * Get current user activity status
   * @returns {Object} Activity status information
   */
  getActivityStatus() {
    return {
      isCurrentlyActive: this.isUserCurrentlyActive,
      lastActivityDetected: this.lastActivityDetected,
      heartbeatRunning: this.activityHeartbeatInterval !== null,
      timeSinceLastActivity: this.lastActivityDetected
        ? Date.now() - this.lastActivityDetected
        : null,
    };
  }

  /**
   * Check if location tracking is currently active
   * @returns {boolean} True if tracking is active
   */
  isTrackingActive() {
    return this.trackingWatchId !== null && this.trackingWatchId !== undefined;
  }

  /**
   * Start health monitoring system to detect and recover from tracking failures
   * Runs periodic checks to ensure location tracking is working properly
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      console.log("[CampusLocationService] 💊 Health monitoring already running");
      return;
    }

    console.log("[CampusLocationService] 💊 Starting health monitoring system...");

    // Perform health check every 10 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 10 * 60 * 1000);

    // Perform initial health check
    setTimeout(() => this.performHealthCheck(), 5000);

    console.log("[CampusLocationService] ✅ Health monitoring started (10-minute intervals)");
  }

  /**
   * Stop health monitoring system
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log("[CampusLocationService] 💊 Health monitoring stopped");
    }
  }

  /**
   * Perform comprehensive health check of location tracking system
   * Detects issues and attempts automatic recovery
   */
  async performHealthCheck() {
    const now = Date.now();
    console.log("[CampusLocationService] 🏥 Performing health check...");

    const healthStatus = {
      timestamp: new Date().toISOString(),
      watchPositionActive: this.trackingWatchId !== null,
      periodicUpdatesActive: this.periodicUpdateInterval !== null,
      activityHeartbeatActive: this.activityHeartbeatInterval !== null,
      lastLocationUpdate: this.lastLocationUpdate,
      timeSinceLastUpdate: this.lastLocationUpdate ? now - this.lastLocationUpdate : null,
      isUpdatingLocation: this.isUpdatingLocation,
      locationPermission: this.permissionStatus,
      issues: [],
      actions: []
    };

    // Check if location updates are stale (no updates in 15 minutes)
    if (healthStatus.timeSinceLastUpdate && healthStatus.timeSinceLastUpdate > 15 * 60 * 1000) {
      healthStatus.issues.push("Location updates are stale (>15 minutes)");
      
      // Attempt to restart location tracking
      if (!this.isUpdatingLocation) {
        console.log("[CampusLocationService] 🔄 Attempting to restart stale location tracking...");
        healthStatus.actions.push("Restarting location tracking");
        
        try {
          // Stop current tracking
          this.stopLocationTracking();
          
          // Wait a moment then restart
          setTimeout(async () => {
            await this.startLocationTracking();
            
            // If watchPosition fails, ensure periodic updates are running
            if (!this.trackingWatchId && !this.periodicUpdateInterval) {
              await this.startPeriodicLocationUpdates();
            }
          }, 2000);
          
        } catch (restartError) {
          console.error("[CampusLocationService] ❌ Failed to restart location tracking:", restartError);
          healthStatus.issues.push(`Restart failed: ${restartError.message}`);
        }
      }
    }

    // Check if watchPosition exists but isn't working (common issue)
    if (healthStatus.watchPositionActive && healthStatus.timeSinceLastUpdate > 10 * 60 * 1000) {
      healthStatus.issues.push("watchPosition exists but not providing updates");
      
      // Start periodic updates as backup if not already running
      if (!healthStatus.periodicUpdatesActive) {
        console.log("[CampusLocationService] 🆘 Starting periodic updates as backup for failing watchPosition...");
        healthStatus.actions.push("Starting periodic updates backup");
        await this.startPeriodicLocationUpdates();
      }
    }

    // Check if neither tracking method is active
    if (!healthStatus.watchPositionActive && !healthStatus.periodicUpdatesActive) {
      healthStatus.issues.push("No location tracking methods active");
      
      // Try to restart both
      console.log("[CampusLocationService] 🚨 No tracking active - attempting full restart...");
      healthStatus.actions.push("Full location tracking restart");
      
      try {
        await this.startLocationTracking();
        if (!this.trackingWatchId) {
          await this.startPeriodicLocationUpdates();
        }
      } catch (fullRestartError) {
        console.error("[CampusLocationService] ❌ Full restart failed:", fullRestartError);
        healthStatus.issues.push(`Full restart failed: ${fullRestartError.message}`);
      }
    }

    this.lastHealthCheck = now;

    // Log health status
    if (healthStatus.issues.length === 0) {
      console.log("[CampusLocationService] ✅ Health check passed - all systems operational");
    } else {
      console.warn("[CampusLocationService] ⚠️ Health check found issues:", {
        issues: healthStatus.issues,
        actions: healthStatus.actions,
        status: healthStatus
      });
    }

    return healthStatus;
  }

  /**
   * Get comprehensive status of location tracking system
   * Useful for debugging and monitoring
   * @returns {Object} Complete status information
   */
  getLocationTrackingStatus() {
    return {
      isInitialized: this.isInitialized,
      isLocationSupported: this.isLocationSupported,
      permissionStatus: this.permissionStatus,
      tracking: {
        watchPositionActive: this.trackingWatchId !== null,
        watchId: this.trackingWatchId,
        periodicUpdatesActive: this.periodicUpdateInterval !== null,
        activityHeartbeatActive: this.activityHeartbeatInterval !== null,
        isUpdatingLocation: this.isUpdatingLocation,
        lastLocationUpdate: this.lastLocationUpdate,
        timeSinceLastUpdate: this.lastLocationUpdate ? Date.now() - this.lastLocationUpdate : null
      },
      initialization: {
        attempts: this.initializationAttempts,
        maxAttempts: this.maxInitializationAttempts,
        errors: this.initializationErrors,
        retryScheduled: this.initializationRetryTimeout !== null
      },
      health: {
        lastHealthCheck: this.lastHealthCheck,
        healthMonitoringActive: this.healthCheckInterval !== null
      },
      activity: this.getActivityStatus()
    };
  }
}

// Export singleton instance
export const campusLocationService = new CampusLocationService();

// 🛠️ DEBUGGING: Make campusLocationService globally available for console access and automation
if (typeof window !== "undefined") {
  window.campusLocationService = campusLocationService;
  console.log(
    "🛠️ CampusLocationService available globally as window.campusLocationService for debugging"
  );
}
