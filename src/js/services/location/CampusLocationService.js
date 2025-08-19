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

    // 🔧 MOBILE LIFECYCLE MANAGEMENT PROPERTIES
    this.isMobile = this.detectMobileBrowser();
    this.isAppVisible = !document.hidden;
    this.isOnline = navigator.onLine;
    this.wasTrackingBeforeBackground = false;
    this.backgroundStartTime = null;
    this.foregroundResumeTime = null;
    this.visibilityChangeCount = 0;
    this.networkReconnectionAttempts = 0;
    this.maxNetworkReconnectionAttempts = 3;
    
    // Mobile-specific intervals and timeouts
    this.backgroundGracePeriod = 30000; // 30 seconds grace period before pausing
    this.foregroundResumeTimeout = null;
    this.backgroundPauseTimeout = null;
    this.networkReconnectionTimeout = null;

    console.log("[CampusLocationService] Service initialized", {
      geolocationSupported: this.isLocationSupported,
      isMobile: this.isMobile,
      isAppVisible: this.isAppVisible,
      isOnline: this.isOnline,
      timestamp: new Date().toISOString(),
    });

    // Initialize activity detection
    this.initializeActivityDetection();
    
    // 🔧 MOBILE FIX: Initialize mobile lifecycle management
    if (this.isMobile) {
      this.initializeMobileLifecycleHandlers();
      console.log("[CampusLocationService] 📱 Mobile lifecycle management initialized");
    }
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

      // 🔧 MOBILE FIX: Detect mobile browser and adjust behavior accordingly
      const isMobile = this.detectMobileBrowser();
      const isIOSSafari = this.detectIOSSafari();
      const isAndroidChrome = this.detectAndroidChrome();

      console.log("[CampusLocationService] Mobile browser detection:", {
        isMobile,
        isIOSSafari,
        isAndroidChrome,
        userAgent: navigator.userAgent
      });

      // IMPORTANT: To trigger the browser permission dialog, we must actually call getCurrentPosition
      // Just checking permissions.query doesn't trigger the dialog
      console.log(
        "[CampusLocationService] Triggering permission dialog with getCurrentPosition..."
      );

      return new Promise((resolve) => {
        // 🔧 MOBILE FIX: Adaptive timeout based on mobile platform
        let timeoutDuration = 15000; // Default 15 seconds for desktop
        if (isIOSSafari) {
          timeoutDuration = 45000; // iOS Safari needs up to 45 seconds
        } else if (isAndroidChrome) {
          timeoutDuration = 35000; // Android Chrome needs up to 35 seconds
        } else if (isMobile) {
          timeoutDuration = 40000; // Other mobile browsers get 40 seconds
        }

        console.log(`[CampusLocationService] Using ${timeoutDuration}ms timeout for ${isMobile ? 'mobile' : 'desktop'} platform`);

        const permissionOptions = {
          timeout: timeoutDuration,
          enableHighAccuracy: false, // Don't need high accuracy for permission test
          maximumAge: 600000, // 10 minutes cache acceptable for permission test
        };

        // 🔧 MOBILE FIX: iOS Safari permission handling with user interaction context
        if (isIOSSafari) {
          console.log("[CampusLocationService] Applying iOS Safari permission handling");
          // iOS Safari requires permission requests to be triggered by user interaction
          // We'll log this for debugging mobile permission issues
          console.log("[CampusLocationService] iOS detected - permission must be user-initiated");
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log(
              "[CampusLocationService] ✅ Location permission GRANTED by user"
            );
            this.permissionStatus = "granted";
            this.currentPosition = position;

            // 🔧 MOBILE FIX: Enhanced permission monitoring for mobile browsers
            if ("permissions" in navigator) {
              navigator.permissions
                .query({ name: "geolocation" })
                .then((permission) => {
                  console.log(`[CampusLocationService] Permission API state: ${permission.state}`);
                  
                  permission.addEventListener("change", () => {
                    this.permissionStatus = permission.state;
                    console.log(
                      "[CampusLocationService] Permission changed to:",
                      permission.state
                    );

                    // 🔧 MOBILE FIX: Handle mobile-specific permission revocation
                    if (permission.state === "denied" && isMobile) {
                      console.warn("[CampusLocationService] 📱 Mobile permission revoked - stopping all location tracking");
                      this.stopLocationTracking();
                    }
                  });
                })
                .catch((permError) => {
                  console.warn("[CampusLocationService] Permission API not fully supported:", permError);
                });
            }

            resolve(true);
          },
          (error) => {
            console.log("[CampusLocationService] Location permission result:", {
              code: error.code,
              message: error.message,
              timestamp: new Date().toISOString(),
              platform: isMobile ? 'mobile' : 'desktop',
              browser: isIOSSafari ? 'iOS Safari' : isAndroidChrome ? 'Android Chrome' : 'Other'
            });

            // 🔧 MOBILE FIX: Enhanced mobile-specific error handling
            switch (error.code) {
              case error.PERMISSION_DENIED:
                console.log(
                  "[CampusLocationService] ❌ Location permission DENIED by user"
                );
                this.permissionStatus = "denied";
                
                if (isIOSSafari) {
                  console.log("[CampusLocationService] 📱 iOS Safari: User must enable location in Settings > Safari > Location Services");
                } else if (isAndroidChrome) {
                  console.log("[CampusLocationService] 📱 Android Chrome: Check site permissions in browser settings");
                }
                break;
                
              case error.POSITION_UNAVAILABLE:
                console.log(
                  "[CampusLocationService] ⚠️ Location unavailable (GPS off or no signal)"
                );
                this.permissionStatus = "granted"; // Permission granted but location unavailable
                
                if (isMobile) {
                  console.log("[CampusLocationService] 📱 Mobile: Try moving outdoors or enabling high accuracy GPS");
                }
                break;
                
              case error.TIMEOUT:
                console.log(
                  `[CampusLocationService] ⏱️ Location request timeout after ${timeoutDuration}ms`
                );
                this.permissionStatus = "granted"; // Permission granted but timed out
                
                if (isMobile) {
                  console.log("[CampusLocationService] 📱 Mobile timeout: GPS acquisition can take longer indoors");
                  // On mobile timeout, we still consider permission potentially granted
                  // The user will get another chance during actual location tracking
                  resolve(true);
                  return;
                }
                break;
                
              default:
                console.log(
                  "[CampusLocationService] ❓ Unknown location error"
                );
                this.permissionStatus = "prompt";
                break;
            }

            // 🔧 MOBILE FIX: More lenient mobile permission resolution
            // On mobile, timeouts and position unavailable don't necessarily mean permission denied
            const mobilePermissionGranted = isMobile && (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE);
            resolve(error.code !== error.PERMISSION_DENIED || mobilePermissionGranted);
          },
          permissionOptions
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

    // 🔧 MOBILE FIX: Detect platform for mobile-specific GPS handling
    const isMobile = this.detectMobileBrowser();
    const isIOSSafari = this.detectIOSSafari();
    const isAndroidChrome = this.detectAndroidChrome();

    return new Promise((resolve, reject) => {
      // 🔧 MOBILE FIX: Adaptive GPS settings based on mobile platform
      let options = {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 15000 : 30000,
        maximumAge: highAccuracy ? 60000 : 300000,
      };

      // Platform-specific GPS optimization
      if (isMobile) {
        console.log("[CampusLocationService] 📱 Applying mobile GPS optimizations");
        
        if (isIOSSafari) {
          // iOS Safari GPS behavior
          options = {
            enableHighAccuracy: highAccuracy,
            timeout: highAccuracy ? 45000 : 60000, // iOS needs more time
            maximumAge: highAccuracy ? 30000 : 180000, // More aggressive caching for battery
          };
          console.log("[CampusLocationService] 🍎 iOS Safari GPS settings applied");
        } else if (isAndroidChrome) {
          // Android Chrome GPS behavior
          options = {
            enableHighAccuracy: highAccuracy,
            timeout: highAccuracy ? 35000 : 50000, // Android reasonable timeout
            maximumAge: highAccuracy ? 45000 : 240000, // Conservative caching
          };
          console.log("[CampusLocationService] 🤖 Android Chrome GPS settings applied");
        } else {
          // Generic mobile browser settings
          options = {
            enableHighAccuracy: highAccuracy,
            timeout: highAccuracy ? 40000 : 55000,
            maximumAge: highAccuracy ? 60000 : 300000,
          };
          console.log("[CampusLocationService] 📱 Generic mobile GPS settings applied");
        }
      }

      console.log("[CampusLocationService] GPS options:", {
        platform: isMobile ? 'mobile' : 'desktop',
        browser: isIOSSafari ? 'iOS Safari' : isAndroidChrome ? 'Android Chrome' : 'Other',
        options
      });

      // 🔧 MOBILE FIX: Multi-attempt GPS acquisition for mobile reliability
      let attemptCount = 0;
      const maxAttempts = isMobile ? 3 : 1; // Mobile gets multiple attempts

      const attemptLocationAcquisition = () => {
        attemptCount++;
        console.log(`[CampusLocationService] GPS attempt ${attemptCount}/${maxAttempts} for ${isMobile ? 'mobile' : 'desktop'}`);

        navigator.geolocation.getCurrentPosition(
          (position) => {
            this.currentPosition = position;
            
            console.log("[CampusLocationService] Location obtained:", {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: new Date(position.timestamp).toISOString(),
              attempt: attemptCount,
              platform: isMobile ? 'mobile' : 'desktop'
            });

            // 🔧 MOBILE FIX: Validate GPS accuracy on mobile
            if (isMobile && position.coords.accuracy > 1000) {
              console.warn(`[CampusLocationService] 📱 Poor mobile GPS accuracy: ${position.coords.accuracy}m - attempt ${attemptCount}/${maxAttempts}`);
              
              // If we have more attempts and accuracy is poor, try again with high accuracy
              if (attemptCount < maxAttempts) {
                console.log("[CampusLocationService] 📱 Retrying with high accuracy GPS...");
                options.enableHighAccuracy = true;
                options.timeout = Math.min(options.timeout + 15000, 60000); // Increase timeout
                setTimeout(() => attemptLocationAcquisition(), 1000);
                return;
              }
            }

            resolve(position);
          },
          (error) => {
            console.error(`[CampusLocationService] Error getting location (attempt ${attemptCount}/${maxAttempts}):`, {
              code: error.code,
              message: error.message,
              timestamp: new Date().toISOString(),
              platform: isMobile ? 'mobile' : 'desktop',
              browser: isIOSSafari ? 'iOS Safari' : isAndroidChrome ? 'Android Chrome' : 'Other'
            });

            // 🔧 MOBILE FIX: Enhanced mobile error handling with retry logic
            const shouldRetry = isMobile && attemptCount < maxAttempts && 
              (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE);

            switch (error.code) {
              case error.PERMISSION_DENIED:
                console.error("[CampusLocationService] Location access denied by user");
                if (isMobile) {
                  console.error("[CampusLocationService] 📱 Mobile permission denied - check browser location settings");
                }
                resolve(null); // Don't retry permission denials
                break;
                
              case error.POSITION_UNAVAILABLE:
                console.error("[CampusLocationService] Location information unavailable");
                if (shouldRetry) {
                  console.log(`[CampusLocationService] 📱 Mobile GPS unavailable - retrying attempt ${attemptCount + 1}/${maxAttempts}`);
                  // Try with different settings
                  options.enableHighAccuracy = !options.enableHighAccuracy;
                  options.maximumAge = 0; // Force fresh GPS reading
                  setTimeout(() => attemptLocationAcquisition(), 2000);
                } else {
                  resolve(null);
                }
                break;
                
              case error.TIMEOUT:
                console.error(`[CampusLocationService] Location request timeout after ${options.timeout}ms`);
                if (shouldRetry) {
                  console.log(`[CampusLocationService] 📱 Mobile GPS timeout - retrying attempt ${attemptCount + 1}/${maxAttempts} with extended timeout`);
                  options.timeout = Math.min(options.timeout + 20000, 75000); // Increase timeout progressively
                  options.enableHighAccuracy = false; // Use low power mode for retry
                  setTimeout(() => attemptLocationAcquisition(), 1000);
                } else {
                  if (isMobile) {
                    console.warn("[CampusLocationService] 📱 Mobile GPS acquisition failed after all attempts - this may affect presence updates");
                  }
                  resolve(null);
                }
                break;
                
              default:
                console.error("[CampusLocationService] Unknown location error");
                if (shouldRetry) {
                  console.log(`[CampusLocationService] 📱 Unknown mobile GPS error - final retry attempt ${attemptCount + 1}/${maxAttempts}`);
                  setTimeout(() => attemptLocationAcquisition(), 3000);
                } else {
                  resolve(null);
                }
                break;
            }
          },
          options
        );
      };

      // Start the GPS acquisition process
      attemptLocationAcquisition();
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

  // 🔧 MOBILE BROWSER DETECTION METHODS
  detectMobileBrowser() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Check for mobile device indicators
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const isMobileUA = mobileRegex.test(userAgent);
    
    // Check for touch capability
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Check screen size as additional indicator
    const isSmallScreen = window.screen.width <= 768 || window.screen.height <= 768;
    
    const isMobile = isMobileUA || (hasTouch && isSmallScreen);
    
    console.log(`[CampusLocationService] Mobile detection: UA=${isMobileUA}, Touch=${hasTouch}, SmallScreen=${isSmallScreen}, Result=${isMobile}`);
    
    return isMobile;
  }

  detectIOSSafari() {
    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS/.test(userAgent);
    
    // Additional check for iOS WebView
    const isIOSWebView = isIOS && !isSafari && !/Chrome|CriOS|FxiOS/.test(userAgent);
    
    const result = isIOS && (isSafari || isIOSWebView);
    
    console.log(`[CampusLocationService] iOS Safari detection: iOS=${isIOS}, Safari=${isSafari}, WebView=${isIOSWebView}, Result=${result}`);
    
    return result;
  }

  detectAndroidChrome() {
    const userAgent = navigator.userAgent;
    const isAndroid = /Android/.test(userAgent);
    const isChrome = /Chrome/.test(userAgent) && !/Edge|OPR/.test(userAgent);
    
    // Check for Android Chrome specifically
    const isChromeAndroid = isAndroid && isChrome;
    
    console.log(`[CampusLocationService] Android Chrome detection: Android=${isAndroid}, Chrome=${isChrome}, Result=${isChromeAndroid}`);
    
    return isChromeAndroid;
  }

  // 🔧 MOBILE LIFECYCLE MANAGEMENT METHODS
  initializeMobileLifecycleHandlers() {
    console.log("[CampusLocationService] 📱 Setting up mobile lifecycle event handlers");

    // Handle app visibility changes (background/foreground)
    document.addEventListener('visibilitychange', () => {
      this.handleVisibilityChange();
    });

    // Handle network connectivity changes
    window.addEventListener('online', () => {
      this.handleNetworkReconnection();
    });

    window.addEventListener('offline', () => {
      this.handleNetworkDisconnection();
    });

    // Handle page focus/blur events as backup for visibility
    window.addEventListener('focus', () => {
      this.handleAppFocus();
    });

    window.addEventListener('blur', () => {
      this.handleAppBlur();
    });

    // Handle beforeunload to save state
    window.addEventListener('beforeunload', () => {
      this.handleAppUnload();
    });

    // Handle page show/hide events for better mobile support
    window.addEventListener('pageshow', (event) => {
      this.handlePageShow(event);
    });

    window.addEventListener('pagehide', (event) => {
      this.handlePageHide(event);
    });

    console.log("[CampusLocationService] 📱 Mobile lifecycle handlers registered");
  }

  handleVisibilityChange() {
    const wasVisible = this.isAppVisible;
    this.isAppVisible = !document.hidden;
    this.visibilityChangeCount++;

    console.log(`[CampusLocationService] 📱 Visibility changed: ${wasVisible ? 'visible' : 'hidden'} → ${this.isAppVisible ? 'visible' : 'hidden'} (count: ${this.visibilityChangeCount})`);

    if (!this.isAppVisible && wasVisible) {
      // App going to background
      this.handleAppGoingToBackground();
    } else if (this.isAppVisible && !wasVisible) {
      // App returning to foreground
      this.handleAppReturningToForeground();
    }
  }

  handleAppGoingToBackground() {
    console.log("[CampusLocationService] 📱 App going to background - implementing smart pause strategy");
    
    this.backgroundStartTime = Date.now();
    this.wasTrackingBeforeBackground = this.isTrackingActive();

    // Clear any existing background pause timeout
    if (this.backgroundPauseTimeout) {
      clearTimeout(this.backgroundPauseTimeout);
    }

    // Don't immediately pause - give a grace period for quick app switches
    this.backgroundPauseTimeout = setTimeout(() => {
      if (!this.isAppVisible) {
        console.log("[CampusLocationService] 📱 Grace period expired - pausing location tracking for battery conservation");
        
        // Pause location tracking but maintain minimal presence updates
        if (this.wasTrackingBeforeBackground) {
          this.pauseLocationTrackingForBackground();
        }
      }
    }, this.backgroundGracePeriod);
  }

  handleAppReturningToForeground() {
    console.log("[CampusLocationService] 📱 App returning to foreground - implementing smart resume strategy");
    
    this.foregroundResumeTime = Date.now();
    
    // Clear background pause timeout since we're back in foreground
    if (this.backgroundPauseTimeout) {
      clearTimeout(this.backgroundPauseTimeout);
      this.backgroundPauseTimeout = null;
    }

    // Calculate how long we were in background
    const backgroundDuration = this.backgroundStartTime ? 
      this.foregroundResumeTime - this.backgroundStartTime : 0;

    console.log(`[CampusLocationService] 📱 Background duration: ${Math.round(backgroundDuration / 1000)}s`);

    // Clear any existing resume timeout
    if (this.foregroundResumeTimeout) {
      clearTimeout(this.foregroundResumeTimeout);
    }

    // Delay resume slightly to let the app stabilize
    this.foregroundResumeTimeout = setTimeout(() => {
      this.resumeLocationTrackingFromBackground(backgroundDuration);
    }, 1000); // 1 second delay for app stabilization
  }

  pauseLocationTrackingForBackground() {
    console.log("[CampusLocationService] 📱 Pausing location tracking for background mode");

    // Stop active location tracking to save battery
    if (this.trackingWatchId) {
      navigator.geolocation.clearWatch(this.trackingWatchId);
      this.trackingWatchId = null;
      console.log("[CampusLocationService] 📱 Stopped watchPosition for background");
    }

    // Keep periodic updates but reduce frequency significantly
    if (this.periodicUpdateInterval) {
      clearInterval(this.periodicUpdateInterval);
      this.periodicUpdateInterval = null;
    }

    // Start ultra-low-frequency background updates (every 10 minutes)
    this.periodicUpdateInterval = setInterval(async () => {
      if (!this.isAppVisible) {
        console.log("[CampusLocationService] 📱 Background location ping");
        try {
          await this.debouncedLocationUpdate(null, true); // Force update with minimal accuracy
        } catch (error) {
          console.warn("[CampusLocationService] 📱 Background location update failed:", error);
        }
      }
    }, 600000); // 10 minutes for background updates
  }

  async resumeLocationTrackingFromBackground(backgroundDuration) {
    console.log("[CampusLocationService] 📱 Resuming location tracking from background");

    try {
      // If we were tracking before background, resume tracking
      if (this.wasTrackingBeforeBackground) {
        console.log("[CampusLocationService] 📱 Restarting location tracking after background period");

        // Force a fresh location reading first
        const currentLocation = await this.getCurrentLocation(false);
        
        if (currentLocation) {
          console.log("[CampusLocationService] 📱 Fresh location acquired after resume");
          
          // Update location immediately
          await this.debouncedLocationUpdate(currentLocation, true);
        } else {
          console.warn("[CampusLocationService] 📱 Failed to get fresh location after resume");
        }

        // Restart full location tracking
        await this.startLocationTracking();
        
        // Restart activity heartbeat
        this.startActivityHeartbeat();
        
        // Perform health check
        setTimeout(() => {
          this.performHealthCheck();
        }, 5000);
      }

      // Reset background state
      this.wasTrackingBeforeBackground = false;
      this.backgroundStartTime = null;
      this.foregroundResumeTime = null;

      console.log("[CampusLocationService] 📱 Successfully resumed from background mode");
      
    } catch (error) {
      console.error("[CampusLocationService] 📱 Error resuming from background:", error);
      
      // Try to recover by reinitializing
      setTimeout(() => {
        console.log("[CampusLocationService] 📱 Attempting recovery reinitialization");
        this.autoStartLocationTracking();
      }, 3000);
    }
  }

  handleNetworkReconnection() {
    const wasOnline = this.isOnline;
    this.isOnline = true;
    
    console.log(`[CampusLocationService] 📱 Network reconnected: ${wasOnline ? 'was online' : 'was offline'} → online`);
    
    if (!wasOnline) {
      // Clear any existing reconnection timeout
      if (this.networkReconnectionTimeout) {
        clearTimeout(this.networkReconnectionTimeout);
      }

      // Delay reconnection handling to ensure network is stable
      this.networkReconnectionTimeout = setTimeout(() => {
        this.handleNetworkReconnectionRecovery();
      }, 2000);
    }
  }

  handleNetworkDisconnection() {
    this.isOnline = false;
    
    console.log("[CampusLocationService] 📱 Network disconnected - maintaining location tracking but reducing frequency");
    
    // Don't stop location tracking completely, but reduce frequency
    // The location system can still work offline for presence detection
  }

  async handleNetworkReconnectionRecovery() {
    console.log("[CampusLocationService] 📱 Recovering from network disconnection");
    
    this.networkReconnectionAttempts++;
    
    try {
      // Force a location update to sync with server after reconnection
      if (this.currentPosition) {
        console.log("[CampusLocationService] 📱 Syncing location after network recovery");
        await this.debouncedLocationUpdate(this.currentPosition, true);
      }

      // Restart health monitoring
      this.startHealthMonitoring();
      
      // Reset network reconnection attempts
      this.networkReconnectionAttempts = 0;
      
      console.log("[CampusLocationService] 📱 Network recovery completed successfully");
      
    } catch (error) {
      console.error("[CampusLocationService] 📱 Network recovery failed:", error);
      
      if (this.networkReconnectionAttempts < this.maxNetworkReconnectionAttempts) {
        console.log(`[CampusLocationService] 📱 Retrying network recovery (${this.networkReconnectionAttempts}/${this.maxNetworkReconnectionAttempts})`);
        
        setTimeout(() => {
          this.handleNetworkReconnectionRecovery();
        }, 5000 * this.networkReconnectionAttempts); // Progressive backoff
      } else {
        console.error("[CampusLocationService] 📱 Max network recovery attempts reached");
        this.networkReconnectionAttempts = 0; // Reset for next time
      }
    }
  }

  handleAppFocus() {
    console.log("[CampusLocationService] 📱 App gained focus");
    
    // Additional check if visibility API missed the event
    if (!this.isAppVisible) {
      this.isAppVisible = true;
      this.handleAppReturningToForeground();
    }
  }

  handleAppBlur() {
    console.log("[CampusLocationService] 📱 App lost focus");
    
    // Additional check if visibility API missed the event
    if (this.isAppVisible) {
      this.isAppVisible = false;
      this.handleAppGoingToBackground();
    }
  }

  handleAppUnload() {
    console.log("[CampusLocationService] 📱 App unloading - cleaning up resources");
    
    // Clear all timeouts and intervals
    if (this.backgroundPauseTimeout) clearTimeout(this.backgroundPauseTimeout);
    if (this.foregroundResumeTimeout) clearTimeout(this.foregroundResumeTimeout);
    if (this.networkReconnectionTimeout) clearTimeout(this.networkReconnectionTimeout);
    
    // Stop location tracking
    this.stopLocationTracking();
  }

  handlePageShow(event) {
    console.log(`[CampusLocationService] 📱 Page show event (persisted: ${event.persisted})`);
    
    // If page was loaded from cache (back/forward navigation), ensure proper state
    if (event.persisted && this.isMobile) {
      setTimeout(() => {
        this.handleAppReturningToForeground();
      }, 500);
    }
  }

  handlePageHide(event) {
    console.log(`[CampusLocationService] 📱 Page hide event (persisted: ${event.persisted})`);
    
    // Handle page going into back/forward cache
    if (this.isMobile) {
      this.handleAppGoingToBackground();
    }
  }

  // Helper method to get current mobile lifecycle status
  getMobileLifecycleStatus() {
    return {
      isMobile: this.isMobile,
      isAppVisible: this.isAppVisible,
      isOnline: this.isOnline,
      visibilityChangeCount: this.visibilityChangeCount,
      backgroundStartTime: this.backgroundStartTime,
      wasTrackingBeforeBackground: this.wasTrackingBeforeBackground,
      networkReconnectionAttempts: this.networkReconnectionAttempts
    };
  }

  // 🔧 MOBILE-RESILIENT FIREBASE LISTENER MANAGEMENT
  createMobileResilientListener(listenerConfig) {
    console.log(`[CampusLocationService] 📱 Creating mobile-resilient Firebase listener: ${listenerConfig.name}`);
    
    const listener = {
      name: listenerConfig.name,
      query: listenerConfig.query,
      callback: listenerConfig.callback,
      errorCallback: listenerConfig.errorCallback || this.defaultListenerErrorHandler.bind(this),
      
      // Connection state
      isConnected: true,
      unsubscribe: null,
      reconnectionAttempts: 0,
      maxReconnectionAttempts: 5,
      reconnectionDelay: 1000,
      maxReconnectionDelay: 30000,
      
      // Mobile-specific properties
      lastSuccessfulConnection: Date.now(),
      connectionTimeouts: 0,
      networkChangeCount: 0,
      isBackgroundPaused: false,
      
      // Queued updates for offline resilience
      queuedUpdates: [],
      maxQueueSize: 50,
      
      // Reconnection management
      reconnectionTimeout: null,
      heartbeatInterval: null
    };
    
    this.setupMobileResilientConnection(listener);
    return listener;
  }

  setupMobileResilientConnection(listener) {
    console.log(`[CampusLocationService] 📱 Setting up resilient connection for: ${listener.name}`);
    
    const connectListener = () => {
      try {
        // Clear any existing connection
        if (listener.unsubscribe) {
          listener.unsubscribe();
          listener.unsubscribe = null;
        }

        console.log(`[CampusLocationService] 📱 Connecting Firebase listener: ${listener.name} (attempt ${listener.reconnectionAttempts + 1})`);

        // Import Firebase dynamically to handle potential import issues
        import('firebase/firestore').then(({ onSnapshot }) => {
          listener.unsubscribe = onSnapshot(
            listener.query,
            
            // Success callback with mobile-specific enhancements
            (snapshot) => {
              listener.isConnected = true;
              listener.lastSuccessfulConnection = Date.now();
              listener.reconnectionAttempts = 0;
              listener.connectionTimeouts = 0;

              console.log(`[CampusLocationService] 📱 Successful listener update: ${listener.name}`);

              // Process any queued updates first (offline resilience)
              if (listener.queuedUpdates.length > 0) {
                console.log(`[CampusLocationService] 📱 Processing ${listener.queuedUpdates.length} queued updates for ${listener.name}`);
                listener.queuedUpdates.forEach(update => {
                  try {
                    listener.callback(update.data, update.metadata);
                  } catch (callbackError) {
                    console.error(`[CampusLocationService] 📱 Error processing queued update:`, callbackError);
                  }
                });
                listener.queuedUpdates = [];
              }

              // Process current update
              try {
                const metadata = {
                  isFromCache: snapshot.metadata?.fromCache || false,
                  hasPendingWrites: snapshot.metadata?.hasPendingWrites || false,
                  connectionAttempts: listener.reconnectionAttempts,
                  isMobileOptimized: true
                };

                listener.callback(snapshot, metadata);
              } catch (callbackError) {
                console.error(`[CampusLocationService] 📱 Error in listener callback:`, callbackError);
                listener.errorCallback(callbackError, 'callback_error');
              }
            },
            
            // Error callback with mobile-specific retry logic
            (error) => {
              console.error(`[CampusLocationService] 📱 Firebase listener error for ${listener.name}:`, {
                code: error.code,
                message: error.message,
                connectionAttempts: listener.reconnectionAttempts,
                isOnline: this.isOnline,
                isAppVisible: this.isAppVisible
              });

              listener.isConnected = false;

              // Handle different error types with mobile-specific strategies
              this.handleMobileListenerError(listener, error);
            }
          );

          // Start connection health monitoring
          this.startListenerHealthMonitoring(listener);

        }).catch(importError => {
          console.error(`[CampusLocationService] 📱 Failed to import Firebase modules:`, importError);
          this.scheduleListenerReconnection(listener, 'import_error');
        });

      } catch (connectionError) {
        console.error(`[CampusLocationService] 📱 Error setting up listener connection:`, connectionError);
        this.scheduleListenerReconnection(listener, 'connection_error');
      }
    };

    // Initial connection
    connectListener();
    listener.connect = connectListener;
  }

  handleMobileListenerError(listener, error) {
    const errorType = this.classifyFirebaseError(error);
    
    console.log(`[CampusLocationService] 📱 Handling ${errorType} error for ${listener.name}`);

    switch (errorType) {
      case 'network_error':
        // Network-related errors - implement exponential backoff
        if (!this.isOnline) {
          console.log(`[CampusLocationService] 📱 Device offline - queuing reconnection for ${listener.name}`);
          // Will reconnect when network comes back
          return;
        }
        this.scheduleListenerReconnection(listener, 'network_error');
        break;

      case 'permission_error':
        // Permission/authentication errors - don't retry immediately
        console.error(`[CampusLocationService] 📱 Permission error for ${listener.name} - delayed retry`);
        setTimeout(() => {
          this.scheduleListenerReconnection(listener, 'permission_error');
        }, 5000);
        break;

      case 'firestore_error':
        // Firestore-specific errors - moderate retry
        this.scheduleListenerReconnection(listener, 'firestore_error');
        break;

      case 'unknown_error':
      default:
        // Unknown errors - conservative retry
        this.scheduleListenerReconnection(listener, 'unknown_error');
        break;
    }

    // Notify error callback
    listener.errorCallback(error, errorType);
  }

  classifyFirebaseError(error) {
    if (!error.code) return 'unknown_error';

    const networkErrors = ['unavailable', 'cancelled', 'deadline-exceeded'];
    const permissionErrors = ['permission-denied', 'unauthenticated'];
    const firestoreErrors = ['resource-exhausted', 'internal', 'unknown'];

    if (networkErrors.includes(error.code)) return 'network_error';
    if (permissionErrors.includes(error.code)) return 'permission_error';
    if (firestoreErrors.includes(error.code)) return 'firestore_error';
    
    return 'unknown_error';
  }

  scheduleListenerReconnection(listener, errorType) {
    // Don't schedule if we're already scheduled or at max attempts
    if (listener.reconnectionTimeout || 
        listener.reconnectionAttempts >= listener.maxReconnectionAttempts) {
      return;
    }

    listener.reconnectionAttempts++;
    
    // Calculate exponential backoff delay with jitter
    const baseDelay = Math.min(
      listener.reconnectionDelay * Math.pow(2, listener.reconnectionAttempts - 1),
      listener.maxReconnectionDelay
    );
    const jitter = Math.random() * 1000; // Add up to 1 second jitter
    const delay = baseDelay + jitter;

    console.log(`[CampusLocationService] 📱 Scheduling reconnection for ${listener.name} in ${Math.round(delay)}ms (attempt ${listener.reconnectionAttempts}/${listener.maxReconnectionAttempts})`);

    listener.reconnectionTimeout = setTimeout(() => {
      listener.reconnectionTimeout = null;
      
      // Don't reconnect if app is backgrounded and this isn't critical
      if (!this.isAppVisible && listener.name !== 'friendships') {
        console.log(`[CampusLocationService] 📱 Skipping reconnection for ${listener.name} - app backgrounded`);
        return;
      }

      console.log(`[CampusLocationService] 📱 Attempting reconnection for ${listener.name}`);
      listener.connect();
    }, delay);
  }

  startListenerHealthMonitoring(listener) {
    // Clear any existing health monitoring
    if (listener.heartbeatInterval) {
      clearInterval(listener.heartbeatInterval);
    }

    // Start periodic health checks (every 30 seconds on mobile)
    listener.heartbeatInterval = setInterval(() => {
      if (!this.isAppVisible) {
        return; // Skip health checks when backgrounded
      }

      const timeSinceLastConnection = Date.now() - listener.lastSuccessfulConnection;
      const healthThreshold = 60000; // 60 seconds

      if (timeSinceLastConnection > healthThreshold && this.isOnline) {
        console.warn(`[CampusLocationService] 📱 Health check failed for ${listener.name} - ${Math.round(timeSinceLastConnection/1000)}s since last update`);
        
        // Force reconnection
        listener.reconnectionAttempts = 0; // Reset attempts for health-triggered reconnection
        this.scheduleListenerReconnection(listener, 'health_check_failed');
      }
    }, 30000);
  }

  defaultListenerErrorHandler(error, errorType) {
    console.error(`[CampusLocationService] 📱 Default listener error handler:`, {
      error: error.message,
      errorType,
      timestamp: new Date().toISOString()
    });
  }

  // Helper method to cleanup mobile-resilient listeners
  cleanupMobileResilientListener(listener) {
    console.log(`[CampusLocationService] 📱 Cleaning up resilient listener: ${listener.name}`);
    
    if (listener.unsubscribe) {
      listener.unsubscribe();
      listener.unsubscribe = null;
    }
    
    if (listener.reconnectionTimeout) {
      clearTimeout(listener.reconnectionTimeout);
      listener.reconnectionTimeout = null;
    }
    
    if (listener.heartbeatInterval) {
      clearInterval(listener.heartbeatInterval);
      listener.heartbeatInterval = null;
    }
    
    listener.queuedUpdates = [];
    listener.isConnected = false;
  }

  // 🔧 POLYGON DEBUGGING HELPER
  debugPolygonDetection(userLat, userLng, university = 'iub') {
    console.log("🔍 [POLYGON DEBUG] Starting detailed polygon analysis");
    
    // Import campus config
    import('../location/UniversityCampusConfig.js').then(({ getCampusConfig }) => {
      const campusConfig = getCampusConfig(university);
      if (!campusConfig) {
        console.error("🔍 [POLYGON DEBUG] No campus config found for:", university);
        return;
      }

      const userPoint = { lat: userLat, lng: userLng };
      
      console.log("🔍 [POLYGON DEBUG] Analysis Details:", {
        userLocation: userPoint,
        campusCenter: campusConfig.center,
        boundaryPoints: campusConfig.boundary.length
      });

      // Calculate distance from center
      const distanceFromCenter = this.calculateDistance(userPoint, campusConfig.center);
      
      console.log("🔍 [POLYGON DEBUG] Distance Analysis:", {
        distanceFromCenterMeters: Math.round(distanceFromCenter),
        userPoint,
        campusCenter: campusConfig.center
      });

      // Show boundary coordinate ranges
      const lats = campusConfig.boundary.map(p => p.lat);
      const lngs = campusConfig.boundary.map(p => p.lng);
      const boundaryBounds = {
        latMin: Math.min(...lats),
        latMax: Math.max(...lats),
        lngMin: Math.min(...lngs),
        lngMax: Math.max(...lngs)
      };
      
      console.log("🔍 [POLYGON DEBUG] Boundary Bounds:", boundaryBounds);
      
      // Check if user is within bounding rectangle
      const withinBounds = userLat >= boundaryBounds.latMin && userLat <= boundaryBounds.latMax &&
                          userLng >= boundaryBounds.lngMin && userLng <= boundaryBounds.lngMax;
      
      console.log("🔍 [POLYGON DEBUG] Bounding Box Check:", {
        withinBoundingRectangle: withinBounds,
        userLat,
        userLng,
        bounds: boundaryBounds
      });

      // Run point-in-polygon with detailed logging
      console.log("🔍 [POLYGON DEBUG] Running detailed ray casting...");
      const isInside = this.debugPointInPolygon(userPoint, campusConfig.boundary);
      
      console.log("🔍 [POLYGON DEBUG] Final Result:", {
        pointInPolygon: isInside,
        withinBoundingBox: withinBounds,
        distanceFromCenter: Math.round(distanceFromCenter),
        recommendation: isInside ? "✅ Should show GREEN dot" : "❌ Shows RED dot - check coordinates"
      });

      // Generate Google Maps URL for visual verification
      const mapsUrl = `https://www.google.com/maps?q=${userLat},${userLng}&z=18`;
      console.log("🔍 [POLYGON DEBUG] Visual Check:", {
        googleMapsUrl: mapsUrl,
        instructions: "Open this URL to verify your actual GPS location matches expected location"
      });

    }).catch(error => {
      console.error("🔍 [POLYGON DEBUG] Error loading campus config:", error);
    });
  }

  debugPointInPolygon(point, polygon) {
    console.log("🔍 [RAY CASTING DEBUG] Starting detailed ray casting analysis");
    
    if (!polygon || polygon.length < 3) {
      console.error("🔍 [RAY CASTING DEBUG] Invalid polygon - need at least 3 vertices");
      return false;
    }

    let isInside = false;
    let intersectionCount = 0;
    const x = point.lng;
    const y = point.lat;

    console.log("🔍 [RAY CASTING DEBUG] Test point:", { x, y });
    console.log("🔍 [RAY CASTING DEBUG] Polygon vertices:", polygon.length);

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      // Ray casting algorithm with debug info
      const condition1 = yi > y !== yj > y;
      const intersectionX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      const condition2 = x < intersectionX;
      
      if (condition1 && condition2) {
        isInside = !isInside;
        intersectionCount++;
        
        console.log(`🔍 [RAY CASTING DEBUG] Intersection ${intersectionCount}:`, {
          edge: `${i} -> ${j}`,
          edgePoints: { from: {x: xi, y: yi}, to: {x: xj, y: yj} },
          intersectionX,
          rayX: x,
          intersects: true,
          newState: isInside
        });
      }
    }

    console.log("🔍 [RAY CASTING DEBUG] Ray casting complete:", {
      totalIntersections: intersectionCount,
      finalResult: isInside,
      rule: "Odd intersections = inside, Even intersections = outside"
    });

    return isInside;
  }

  // 🔧 POLYGON BUFFER HELPER - Expand boundary for GPS accuracy tolerance
  createBufferedPolygon(originalPolygon, bufferMeters = 20) {
    console.log(`🔍 [POLYGON BUFFER] Creating ${bufferMeters}m buffer around polygon`);
    
    // Simple approach: expand each coordinate by buffer amount in degrees
    // 1 meter ≈ 0.000009 degrees latitude (varies by location)
    // 1 meter ≈ 0.000009 / cos(latitude) degrees longitude
    
    const bufferLat = bufferMeters * 0.000009; // Latitude buffer in degrees
    const avgLat = originalPolygon.reduce((sum, p) => sum + p.lat, 0) / originalPolygon.length;
    const bufferLng = bufferMeters * 0.000009 / Math.cos(avgLat * Math.PI / 180); // Longitude buffer
    
    console.log(`🔍 [POLYGON BUFFER] Buffer amounts:`, {
      bufferMeters,
      bufferLat: bufferLat.toFixed(8),
      bufferLng: bufferLng.toFixed(8),
      avgLatitude: avgLat.toFixed(6)
    });
    
    // Find polygon centroid
    const centroid = {
      lat: avgLat,
      lng: originalPolygon.reduce((sum, p) => sum + p.lng, 0) / originalPolygon.length
    };
    
    // Expand each point away from centroid
    const bufferedPolygon = originalPolygon.map(point => {
      const latDiff = point.lat - centroid.lat;
      const lngDiff = point.lng - centroid.lng;
      
      // Normalize and apply buffer
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      const factor = distance > 0 ? (distance + bufferLat) / distance : 1;
      
      return {
        lat: centroid.lat + latDiff * factor,
        lng: centroid.lng + lngDiff * factor
      };
    });
    
    console.log(`🔍 [POLYGON BUFFER] Created buffered polygon with ${bufferedPolygon.length} points`);
    return bufferedPolygon;
  }

  // 🔧 TEST DIFFERENT BUFFER SIZES
  testPolygonWithBuffers(userLat, userLng, university = 'iub') {
    console.log("🔍 [BUFFER TEST] Testing polygon with different buffer sizes");
    
    import('../location/UniversityCampusConfig.js').then(({ getCampusConfig }) => {
      const campusConfig = getCampusConfig(university);
      if (!campusConfig) return;

      const userPoint = { lat: userLat, lng: userLng };
      const originalResult = this.pointInPolygon(userPoint, campusConfig.boundary);
      
      console.log("🔍 [BUFFER TEST] Results:", {
        originalPolygon: originalResult,
        "buffer10m": this.pointInPolygon(userPoint, this.createBufferedPolygon(campusConfig.boundary, 10)),
        "buffer20m": this.pointInPolygon(userPoint, this.createBufferedPolygon(campusConfig.boundary, 20)),
        "buffer30m": this.pointInPolygon(userPoint, this.createBufferedPolygon(campusConfig.boundary, 30)),
        "buffer50m": this.pointInPolygon(userPoint, this.createBufferedPolygon(campusConfig.boundary, 50))
      });
    });
  }

  // 🔧 MOBILE LIFECYCLE MANAGEMENT METHODS
  initializeMobileLifecycleHandlers() {
    if (!this.detectMobileBrowser()) {
      console.log("[CampusLocationService] Desktop detected - skipping mobile lifecycle handlers");
      return;
    }

    console.log("[CampusLocationService] 📱 Initializing mobile app lifecycle handlers");

    // Page Visibility API - handle app going to background/foreground
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Network connectivity changes - mobile networks are unstable
    this.handleOnlineStatus = this.handleOnlineStatus.bind(this);
    window.addEventListener('online', this.handleOnlineStatus);
    window.addEventListener('offline', this.handleOnlineStatus);

    // Page focus/blur events - additional mobile lifecycle coverage
    this.handleAppFocus = this.handleAppFocus.bind(this);
    this.handleAppBlur = this.handleAppBlur.bind(this);
    window.addEventListener('focus', this.handleAppFocus);
    window.addEventListener('blur', this.handleAppBlur);

    // Battery API if available (experimental but useful for mobile optimization)
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        this.batteryLevel = battery.level;
        this.isCharging = battery.charging;
        
        console.log(`[CampusLocationService] 🔋 Battery status: ${Math.round(battery.level * 100)}% (${battery.charging ? 'charging' : 'not charging'})`);
        
        battery.addEventListener('levelchange', () => {
          this.batteryLevel = battery.level;
          this.adjustTrackingForBattery();
        });
        
        battery.addEventListener('chargingchange', () => {
          this.isCharging = battery.charging;
          this.adjustTrackingForBattery();
        });
      }).catch(error => {
        console.log("[CampusLocationService] Battery API not available:", error);
      });
    }

    // Store initial network status
    this.isOnline = navigator.onLine;
    this.lastOnlineTime = Date.now();

    console.log("[CampusLocationService] 📱 Mobile lifecycle handlers initialized");
  }

  handleVisibilityChange() {
    const isVisible = !document.hidden;
    const now = Date.now();
    
    console.log(`[CampusLocationService] 📱 Visibility changed: ${isVisible ? 'visible' : 'hidden'} at ${new Date(now).toISOString()}`);

    if (isVisible) {
      // App came to foreground
      const backgroundDuration = now - (this.backgroundTime || now);
      console.log(`[CampusLocationService] 📱 App returned to foreground after ${Math.round(backgroundDuration / 1000)}s`);

      // If we were in background for more than 2 minutes, reinitialize location tracking
      if (backgroundDuration > 120000) {
        console.log("[CampusLocationService] 📱 Long background duration - reinitializing location tracking");
        this.handleAppResume();
      } else {
        // Short background - just resume updates
        console.log("[CampusLocationService] 📱 Short background duration - resuming location updates");
        this.resumeLocationTracking();
      }
      
      this.backgroundTime = null;
    } else {
      // App went to background
      this.backgroundTime = now;
      console.log("[CampusLocationService] 📱 App went to background - pausing intensive location tracking");
      this.pauseLocationTracking();
    }
  }

  handleOnlineStatus() {
    const wasOnline = this.isOnline;
    this.isOnline = navigator.onLine;
    const now = Date.now();
    
    console.log(`[CampusLocationService] 📱 Network status changed: ${this.isOnline ? 'online' : 'offline'} at ${new Date(now).toISOString()}`);

    if (this.isOnline && !wasOnline) {
      // Just came back online
      const offlineDuration = now - (this.offlineTime || now);
      console.log(`[CampusLocationService] 📱 Network restored after ${Math.round(offlineDuration / 1000)}s offline`);
      
      this.lastOnlineTime = now;
      this.offlineTime = null;
      
      // Reinitialize if we were offline for more than 30 seconds
      if (offlineDuration > 30000) {
        console.log("[CampusLocationService] 📱 Extended offline period - reinitializing services");
        setTimeout(() => this.handleAppResume(), 2000); // Give network time to stabilize
      }
    } else if (!this.isOnline && wasOnline) {
      // Just went offline
      this.offlineTime = now;
      console.log("[CampusLocationService] 📱 Network lost - pausing network-dependent operations");
    }
  }

  handleAppFocus() {
    console.log("[CampusLocationService] 📱 App gained focus");
    // App focus doesn't always trigger visibility change on mobile
    if (!this.hasFocus) {
      this.hasFocus = true;
      // Resume location tracking if needed
      if (this.isInitialized && this.shouldTrackLocation()) {
        this.resumeLocationTracking();
      }
    }
  }

  handleAppBlur() {
    console.log("[CampusLocationService] 📱 App lost focus");
    this.hasFocus = false;
    // Don't immediately pause - wait for visibility change
    // This prevents unnecessary pause/resume cycles during quick focus changes
  }

  pauseLocationTracking() {
    console.log("[CampusLocationService] 📱 Pausing location tracking for mobile background mode");
    
    // Store current tracking state
    this.wasPaused = true;
    this.pausedWatchId = this.trackingWatchId;
    this.pausedPeriodicTimer = this.periodicLocationTimer;
    
    // Stop intensive GPS watching but keep basic heartbeat
    if (this.trackingWatchId) {
      navigator.geolocation.clearWatch(this.trackingWatchId);
      this.trackingWatchId = null;
      console.log("[CampusLocationService] 📱 GPS watch stopped for background mode");
    }

    // Reduce periodic updates to every 10 minutes instead of 5
    if (this.periodicLocationTimer) {
      clearInterval(this.periodicLocationTimer);
      this.periodicLocationTimer = setInterval(() => {
        if (!document.hidden && navigator.onLine) {
          console.log("[CampusLocationService] 📱 Background periodic location update");
          this.updateLocationAndPresence(false); // Low accuracy for battery saving
        }
      }, 10 * 60 * 1000); // 10 minutes
    }
  }

  resumeLocationTracking() {
    if (!this.wasPaused) {
      console.log("[CampusLocationService] 📱 Location tracking was not paused - no resume needed");
      return;
    }

    console.log("[CampusLocationService] 📱 Resuming location tracking from mobile background");
    this.wasPaused = false;

    // Check if we should still be tracking
    if (!this.shouldTrackLocation()) {
      console.log("[CampusLocationService] 📱 Location tracking no longer needed - staying paused");
      return;
    }

    // Restart GPS watching if it was active
    if (this.pausedWatchId && !this.trackingWatchId) {
      console.log("[CampusLocationService] 📱 Restarting GPS watch");
      this.startLocationTracking();
    }

    // Reset periodic updates to normal frequency
    if (this.periodicLocationTimer) {
      clearInterval(this.periodicLocationTimer);
      this.startPeriodicLocationUpdates();
    }

    // Immediate location update to refresh presence
    setTimeout(() => {
      console.log("[CampusLocationService] 📱 Performing immediate location update after resume");
      this.updateLocationAndPresence(false);
    }, 1000);

    this.pausedWatchId = null;
    this.pausedPeriodicTimer = null;
  }

  handleAppResume() {
    console.log("[CampusLocationService] 📱 Handling full app resume - reinitializing location services");
    
    // Reset initialization state to trigger fresh start
    this.isInitialized = false;
    this.initializationAttempts = 0;
    
    // Clear any existing timers
    this.stopLocationTracking();
    
    // Restart the full initialization process
    setTimeout(() => {
      console.log("[CampusLocationService] 📱 Starting fresh initialization after resume");
      this.autoStartLocationTracking();
    }, 1000);
  }

  adjustTrackingForBattery() {
    if (!this.batteryLevel) return;
    
    const batteryPercent = Math.round(this.batteryLevel * 100);
    console.log(`[CampusLocationService] 🔋 Battery level: ${batteryPercent}% (${this.isCharging ? 'charging' : 'not charging'})`);
    
    // If battery is low and not charging, reduce location tracking frequency
    if (batteryPercent < 20 && !this.isCharging) {
      console.log("[CampusLocationService] 🔋 Low battery detected - reducing location tracking frequency");
      
      if (this.periodicLocationTimer) {
        clearInterval(this.periodicLocationTimer);
        // Increase interval to 10 minutes when battery is low
        this.periodicLocationTimer = setInterval(() => {
          this.updateLocationAndPresence(false); // Force low accuracy
        }, 10 * 60 * 1000);
      }
    } else if (batteryPercent > 50 || this.isCharging) {
      // Normal battery level - resume normal tracking
      if (this.isTrackingActive() && this.periodicLocationTimer) {
        console.log("[CampusLocationService] 🔋 Battery level good - resuming normal location tracking frequency");
        this.startPeriodicLocationUpdates(); // This will reset to normal 5-minute interval
      }
    }
  }

  shouldTrackLocation() {
    // Check if location tracking should be active based on current conditions
    return this.isOnline && 
           this.permissionStatus === 'granted' && 
           (this.hasFocus || !document.hidden) &&
           this.isInitialized;
  }

  cleanupMobileLifecycleHandlers() {
    console.log("[CampusLocationService] 📱 Cleaning up mobile lifecycle handlers");
    
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('online', this.handleOnlineStatus);
    window.removeEventListener('offline', this.handleOnlineStatus);
    window.removeEventListener('focus', this.handleAppFocus);
    window.removeEventListener('blur', this.handleAppBlur);
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
