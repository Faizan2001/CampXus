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
   * Get current location from browser geolocation API
   * @returns {Promise<GeolocationPosition|null>} Current position or null if failed
   */
  async getCurrentLocation() {
    console.log("[CampusLocationService] Getting current location...");

    if (!this.isLocationSupported) {
      console.error("[CampusLocationService] Geolocation not supported");
      return null;
    }

    return new Promise((resolve, reject) => {
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes cache
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
      this.trackingWatchId = this.watchPosition(async (position, error) => {
        if (error) {
          // Use appropriate logging level based on error type
          if (error.code === 3) {
            // TIMEOUT
            console.warn(
              "[CampusLocationService] ⏱️ Location timeout in tracking (normal indoors) - GPS will retry automatically"
            );
          } else {
            console.error(
              "[CampusLocationService] Error in location tracking:",
              error
            );
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

    // Stop activity heartbeat as well
    this.stopActivityHeartbeat();

    // Reset state
    this.isUpdatingLocation = false;
    this.lastLocationUpdate = null;
    this.isUpdatingActivity = false;

    console.log(
      "[CampusLocationService] ✅ Location tracking and activity heartbeat stopped"
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
   * Set up periodic location updates as fallback (only when watchPosition is not active)
   * Updates location every 5 minutes when GPS tracking is unavailable
   */
  async startPeriodicLocationUpdates() {
    // Don't start periodic updates if watchPosition is already active
    if (this.trackingWatchId) {
      console.log(
        "[CampusLocationService] 🚫 Not starting periodic updates - watchPosition is active"
      );
      return;
    }

    console.log(
      "[CampusLocationService] Starting periodic location updates (5-minute intervals) as GPS fallback..."
    );

    this.periodicUpdateInterval = setInterval(async () => {
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
          "[CampusLocationService] Performing periodic location update..."
        );

        const position = await this.getCurrentLocation();
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
      "[CampusLocationService] ✅ Periodic location updates started (GPS fallback mode)"
    );
  }

  /**
   * Automatically start location tracking if user has location sharing enabled
   * Called when user loads the website or profile is loaded
   */
  async autoStartLocationTracking() {
    try {
      console.log(
        "[CampusLocationService] Checking if automatic location tracking should start..."
      );

      // Import required services
      const { dataManager } = await import("../data/DataService.js");
      const { currentUser } = await import("../../store/userStore.js");

      // Check if user is logged in
      if (!currentUser?.uid) {
        console.log(
          "[CampusLocationService] No user logged in - skipping auto-start"
        );
        return;
      }

      // Wait for user profile to be available
      const userProfile = await currentUser.waitForProfile();
      if (!userProfile) {
        console.log(
          "[CampusLocationService] No user profile available - skipping auto-start"
        );
        return;
      }

      // Check if global location sharing is enabled
      const globalLocationEnabled =
        userProfile?.systemInfo?.locationSharingEnabled;
      if (!globalLocationEnabled) {
        console.log(
          "[CampusLocationService] Global location sharing disabled - skipping auto-start"
        );
        return;
      }

      // Check if user has any friends with mutual location sharing enabled
      const hasLocationSharingFriends =
        await this.checkForLocationSharingFriends();
      if (!hasLocationSharingFriends) {
        console.log(
          "[CampusLocationService] No friends with mutual location sharing - skipping auto-start"
        );
        return;
      }

      // Check if tracking is already active
      if (this.isTrackingActive()) {
        console.log("[CampusLocationService] Location tracking already active");
        return;
      }

      console.log(
        "[CampusLocationService] ✅ Conditions met - starting automatic location tracking"
      );
      await this.startLocationTracking();

      // If watchPosition fails to start, fall back to periodic updates
      if (!this.trackingWatchId) {
        console.log(
          "[CampusLocationService] ⚠️ watchPosition failed, starting periodic updates as fallback"
        );
        await this.startPeriodicLocationUpdates();
      }

      // Always start activity heartbeat for user presence tracking
      // This runs independently of location tracking for better battery efficiency
      this.startActivityHeartbeat();
      console.log(
        "[CampusLocationService] 💓 Activity heartbeat started alongside location tracking"
      );
    } catch (error) {
      console.error(
        "[CampusLocationService] Error in auto-start location tracking:",
        error
      );
    }
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
