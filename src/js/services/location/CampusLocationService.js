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

// Import Google API provider for strategic use cases
import { googleGeolocationProvider } from './GoogleGeolocationProvider.js';

/**
 * Service class for campus location detection and presence management
 */
export class CampusLocationService {
  /**
   * 🎯 PHASE 2 ENHANCEMENT: Sets up document visibility and lifecycle tracking
   * for better trigger scenario detection
   */
  setupLifecycleTracking() {
    this.wasDocumentHidden = false;
    
    // Track document visibility changes for tab return detection
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.wasDocumentHidden = true;
        localStorage.setItem('campusLocation_lastActive', Date.now().toString());
      } else if (document.visibilityState === 'visible' && this.wasDocumentHidden) {
        // Tab returned - trigger immediate location update
        console.log('[CampusLocationService] 👁️ Tab return detected - triggering immediate location update');
        this.handleTriggerEvent('tab_return');
      }
    });

    // Track authentication events for login detection
    window.addEventListener('storage', (e) => {
      if (e.key === 'campusLocation_authTime') {
        console.log('[CampusLocationService] 🔐 Login event detected');
        this.handleTriggerEvent('login');
      }
    });

    console.log('[CampusLocationService] 📱 Lifecycle tracking initialized');
  }

  /**
   * 🚀 PHASE 2 ENHANCEMENT: Handles different trigger events with immediate response
   */
  async handleTriggerEvent(triggerType) {
    try {
      console.log(`[CampusLocationService] ⚡ Handling trigger event: ${triggerType}`);
      
      // Skip if we're already handling an update to prevent conflicts
      if (this.isUpdatingLocation) {
        console.log('[CampusLocationService] ⚠️ Update in progress, skipping trigger event');
        return;
      }

      // Immediate presence update with trigger context
      await this.immediatePresenceUpdate(triggerType);
      
      // For high-priority scenarios, also get fresh GPS if possible
      if (['login', 'tab_return', 'reload'].includes(triggerType)) {
        console.log(`[CampusLocationService] 📍 High-priority trigger (${triggerType}) - requesting fresh GPS`);
        this.requestSingleLocationUpdate();
      }
      
    } catch (error) {
      console.error('[CampusLocationService] ❌ Failed to handle trigger event:', error);
    }
  }

  /**
   * 📍 PHASE 2 ENHANCEMENT: Requests a single fresh GPS location without debouncing
   */
  requestSingleLocationUpdate() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[CampusLocationService] 🎯 Fresh GPS obtained for trigger event');
          // Process immediately without debounce for trigger events
          this.processFreshLocation(position);
        },
        (error) => {
          console.warn('[CampusLocationService] ⚠️ Fresh GPS failed for trigger event:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0 // Force fresh location
        }
      );
    }
  }

  /**
   * 📍 PHASE 2 ENHANCEMENT: Processes fresh location for trigger events
   */
  async processFreshLocation(position) {
    try {
      console.log('[CampusLocationService] 🎯 Processing fresh location for trigger event (immediate database write)');
      
      // 🚀 TRIGGER EVENT: Use smart system with trigger flag for immediate database write
      this.debouncedLocationUpdate(position, { isTrigger: true });
      
      console.log('[CampusLocationService] ✅ Fresh trigger location queued for immediate processing');

    } catch (error) {
      console.error('[CampusLocationService] ❌ Failed to process fresh location:', error);
    }
  }
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

    // 🚀 PHASE 1 FIX: Coordinate change detection
    this.lastSignificantLocation = null; // Cache for coordinate change detection

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

    // 🎯 PHASE 2 ENHANCEMENT: Trigger scenario tracking
    this.wasDocumentHidden = false;
    this.isFirstLocationUpdate = true; // Track if this is the first location update
    this.lastUpdateTrigger = null; // Track the trigger for the last update

    // 💰 COST OPTIMIZATION: Strategic Google API usage control
    // Reasonable limits for 2000+ university users while controlling costs
    this.maxGoogleCallsPerUser = 10; // Max Google API calls per user per day (allows active campus use)
    this.maxDailyGoogleCalls = 1500; // Max total Google API calls per day (caps cost at ~$7.50/day)
    this.googleApiCooldown = 3 * 60 * 1000; // 3 minutes between Google API calls per user (reduced for better UX)
    
    // User tracking for rate limiting
    this.userApiUsage = new Map(); // Track per-user API usage
    this.dailyApiUsage = this.loadDailyUsage(); // Track total daily usage
    
    // 🎯 STRATEGIC GOOGLE API TRIGGERS: Only use paid API for these critical scenarios
    // This prevents unnecessary costs while ensuring accuracy when it matters most
    this.googleApiTriggers = [
      'first_visit',              // New user's first location request (optimal accuracy for campus detection)
      'manual_reload',            // User manually refreshes (F5/Ctrl+R) - wants fresh data
      'reload',                   // Page reload/navigation - immediate accurate location for presence dots
      'high_accuracy_request',    // App explicitly requests high accuracy (critical operations)
      'campus_boundary_detection', // Detecting if user is on/off campus (precision matters)
      'browser_api_failure'       // Browser API failed completely - Google API as rescue fallback
    ];
    
    // 🌐 THREE-TIER COST-OPTIMIZED FALLBACK SYSTEM:
    // TIER 1: Browser API (FREE, best accuracy ~5-50m)
    // TIER 2: Google API (PAID $0.005, high accuracy ~5-50m) - STRATEGIC USE ONLY
    // Note: IP Geolocation tier removed to fix CSP violations
    
    // Caching for cost optimization
    this.locationCache = new Map();
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes cache

    console.log("[CampusLocationService] Service initialized with cost optimization", {
      geolocationSupported: this.isLocationSupported,
      isMobile: this.isMobile,
      isAppVisible: this.isAppVisible,
      isOnline: this.isOnline,
      costLimits: {
        maxGoogleCallsPerUser: this.maxGoogleCallsPerUser,
        maxDailyGoogleCalls: this.maxDailyGoogleCalls,
        currentDailyUsage: this.dailyApiUsage,
        estimatedMaxDailyCost: `$${(this.maxDailyGoogleCalls * 0.005).toFixed(2)}`
      },
      timestamp: new Date().toISOString(),
    });

    // Initialize activity detection
    this.initializeActivityDetection();
    
    // 🔧 MOBILE FIX: Initialize mobile lifecycle management
    if (this.isMobile) {
      this.initializeMobileLifecycleHandlers();
      console.log("[CampusLocationService] 📱 Mobile lifecycle management initialized");
    }

    // 🎯 PHASE 2 ENHANCEMENT: Initialize lifecycle tracking for trigger scenarios
    this.setupLifecycleTracking();
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
   * 💰 COST-OPTIMIZED LOCATION SERVICE
   * 
   * Three-tier fallback system designed for 2000+ university users:
   * 
   * TIER 1: Browser API (FREE) - Try first, 8s timeout for fast failover
   * TIER 2: IP Geolocation (FREE) - City-level accuracy, sufficient for most campus detection  
   * TIER 3: Google API (PAID) - Strategic use only for critical scenarios
   * 
   * Google API Rate Limits:
   * - 10 calls per user per day (allows active campus use)
   * - 1500 total calls per day (max cost: $7.50/day = $225/month)
   * - 3-minute cooldown between user calls
   * 
   * Strategic Triggers for Google API:
   * - first_visit: New user needs optimal accuracy for campus detection
   * - manual_reload: User explicitly refreshed, wants fresh data
   * - high_accuracy_request: App requires precision for critical operations
   * - campus_boundary_detection: Precise on/off campus determination needed
   * - browser_api_failure: Browser API failed, Google API as rescue fallback
   * 
   * @param {boolean} highAccuracy - Whether to use high accuracy mode (default: false for battery efficiency)
   * @param {string} trigger - What triggered this request (for strategic API usage)
   * @param {string} userId - User ID for rate limiting (optional)
   * @returns {Promise<GeolocationPosition|null>} Current position or null if failed
   */
  async getCurrentLocation(highAccuracy = false, trigger = 'unknown', userId = null) {
  console.log(`💰 [CampusLocationService] Cost-optimized location request: ${trigger}`, {
    userId: userId ? userId.substring(0, 8) + '...' : 'anonymous',
    trigger,
    highAccuracy
  });

  if (!this.isLocationSupported) {
    console.error("[CampusLocationService] Geolocation not supported");
    return null;
  }

  // Determine if this is a strategic use case for Google API
  const shouldUseGoogleAPI = this.shouldUseGoogleAPI(trigger, userId, highAccuracy);
  
  try {
    // Tier 1: Browser API (Free, usually most accurate)
    if (!shouldUseGoogleAPI || trigger !== 'browser_api_failure') {
      try {
        console.log('🆓 [CampusLocationService] Tier 1: Trying Browser API (FREE)...');
        const browserResult = await this.getBrowserLocation(highAccuracy);
        
        if (browserResult && browserResult.coords.accuracy <= 100) {
          console.log(`✅ Browser API success: ±${Math.round(browserResult.coords.accuracy)}m (FREE)`);
          return this.formatLocationResponse(browserResult, 'browser', 0);
        } else if (browserResult) {
          console.log(`⚡ Browser API low accuracy: ±${Math.round(browserResult.coords.accuracy)}m, considering Google API...`);
          // For strategic triggers (like reload), use Google API even if browser API succeeds with low accuracy
          if (!shouldUseGoogleAPI && browserResult.coords.accuracy <= 1000) {
            return this.formatLocationResponse(browserResult, 'browser', 0);
          }
        }
      } catch (error) {
        console.log('❌ Tier 1 (Browser API) failed:', error.message);
        if (error.code === 1) { // PERMISSION_DENIED
          console.log('🚫 Location permission denied by user');
          return null;
        }
      }
    }
    
    // 🔧 CSP FIX: Removed Tier 2 (IP Geolocation) entirely - was causing CSP violations
    // Previous implementation tried ipapi.co, ip-api.com, api.ipify.org which are blocked by CSP
    // Now falls back directly to Google API for better accuracy and strategic usage
    
    // Tier 2: Google Geolocation API (Paid, highest accuracy) - renamed from Tier 3
    if (shouldUseGoogleAPI && this.canUseGoogleAPI(userId)) {
      try {
        console.log('💰 [CampusLocationService] Tier 2: Trying Google Geolocation API (PAID)...');
        const googleResult = await this.getGoogleLocation(highAccuracy);
        
        if (googleResult) {
          // Track usage for cost monitoring
          this.trackGoogleApiUsage(userId, trigger);
          console.log(`✅ Google API success: ±${Math.round(googleResult.coords.accuracy)}m (COST: $0.005)`);
          return this.formatLocationResponse(googleResult, 'google', 0.005);
        }
      } catch (error) {
        console.log('❌ Tier 2 (Google API) failed:', error.message);
      }
    } else if (shouldUseGoogleAPI) {
      console.log('🚫 Google API usage limit reached or blocked');
    }
    
    // All tiers failed
    console.error('[CampusLocationService] All location services failed');
    return null;
    
  } catch (error) {
    console.error('[CampusLocationService] Unexpected error in getCurrentLocation:', error);
    return null;
  }
}

  /**
   * 🎯 HYBRID GPS: Calculate optimal timeout based on platform and accuracy requirements
   * @param {boolean} isMobile - Whether this is a mobile device
   * @param {boolean} isIOSSafari - Whether this is iOS Safari
   * @param {boolean} isAndroidChrome - Whether this is Android Chrome
   * @param {boolean} highAccuracy - Whether high accuracy is requested
   * @returns {number} Optimal timeout in milliseconds
   */
  calculateOptimalTimeout(isMobile, isIOSSafari, isAndroidChrome, highAccuracy) {
    let baseTimeout = highAccuracy ? 15000 : 10000; // Base timeout
    
    if (isMobile) {
      // Mobile devices need more time for GPS acquisition
      if (isIOSSafari) {
        baseTimeout = highAccuracy ? 25000 : 15000; // iOS Safari needs extra time
      } else if (isAndroidChrome) {
        baseTimeout = highAccuracy ? 20000 : 12000; // Android Chrome is more efficient
      } else {
        baseTimeout = highAccuracy ? 22000 : 14000; // Generic mobile
      }
    }
    
    console.log(`⏱️ [CampusLocationService] Calculated timeout: ${baseTimeout}ms (${isMobile ? 'mobile' : 'desktop'}, highAccuracy: ${highAccuracy})`);
    return baseTimeout;
  }

  /**
   * 🎯 HYBRID GPS: Determine preferred provider based on platform characteristics
   * @param {boolean} isMobile - Whether this is a mobile device
   * @param {boolean} isIOSSafari - Whether this is iOS Safari
   * @param {boolean} isAndroidChrome - Whether this is Android Chrome
   * @returns {string} Preferred provider ('browser', 'google', or 'auto')
   */
  determinePreferredProvider(isMobile, isIOSSafari, isAndroidChrome) {
    // Desktop generally has better browser GPS support
    if (!isMobile) {
      return 'auto'; // Let hybrid system decide
    }
    
    // Mobile platform-specific preferences
    if (isIOSSafari) {
      // iOS Safari has excellent native GPS but sometimes slow
      return 'auto'; // Compare both for best results
    } else if (isAndroidChrome) {
      // Android Chrome has good GPS support
      return 'auto'; // Let accuracy comparison decide
    } else {
      // Generic mobile browsers might have weaker GPS
      return 'auto'; // Use Google API as potential fallback
    }
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
      // Get current location for campus boundary detection
      const position = await this.getCurrentLocation(false, 'campus_boundary_detection');
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
          // Background updates are low priority - no immediate database write needed
          console.log("[CampusLocationService] 📱 Skipping background location update - user not visible");
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
        const currentLocation = await this.getCurrentLocation(false, 'tab_return');
        
        if (currentLocation) {
          console.log("[CampusLocationService] 📱 Fresh location acquired after resume");
          
          // Update location immediately
          this.debouncedLocationUpdate(currentLocation, { isTrigger: true }); // App resume = trigger event
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
        this.debouncedLocationUpdate(this.currentPosition, { isTrigger: true }); // Network reconnection = trigger event
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

  // 🎯 SPA NAVIGATION HANDLER: Handle single-page app navigation events
  async handleSPANavigation(event) {
    const { route } = event.detail;
    console.log(`[CampusLocationService] 🎯 SPA navigation detected: ${route}`);

    try {
      // Import required services
      const { currentUser } = await import('../../store/userStore.js');
      
      // Only trigger location updates for authenticated users
      if (!currentUser?.uid) {
        console.log('[CampusLocationService] ⏳ No user logged in - skipping navigation location update');
        return;
      }

      // 🚀 SMART NAVIGATION TRIGGERS: Update location for key pages that benefit from fresh data
      const locationRelevantPages = ['home', 'friends'];
      
      if (locationRelevantPages.includes(route)) {
        console.log(`[CampusLocationService] 🎯 Navigation to ${route} - triggering immediate location update`);
        
        // Mark this as user activity (navigation is active user behavior)
        this.isUserCurrentlyActive = true;
        this.lastActivityDetected = Date.now();
        
        // Trigger immediate presence update with navigation context
        const success = await this.immediatePresenceUpdate('spa_navigation');
        
        if (success) {
          console.log(`[CampusLocationService] ✅ Navigation-triggered location update completed for ${route}`);
        } else {
          console.warn(`[CampusLocationService] ⚠️ Navigation-triggered location update failed for ${route}`);
        }
      } else {
        console.log(`[CampusLocationService] ℹ️ Navigation to ${route} - no location update needed`);
      }
    } catch (error) {
      console.error('[CampusLocationService] ❌ SPA navigation handler error:', error);
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

  // =========================
  // IMMEDIATE PRESENCE UPDATE SYSTEM
  // =========================

  /**
   * Phase 1: Immediate presence update (0-1 seconds)
   * Updates user activity timestamp immediately when they open/reload/login
   * Uses cached location if available for instant social feedback
   * @param {string} scenario - 'login', 'reload', 'tab-return', or 'general'
   */
  async immediatePresenceUpdate(scenario = 'general') {
    try {
      console.log(`[CampusLocationService] 🚀 Phase 1: Immediate presence update (${scenario})`);
      
      // Import required services
      const { currentUser } = await import('../../store/userStore.js');
      const { dataManager } = await import('../data/DataService.js');
      const { serverTimestamp } = await import('firebase/firestore');
      
      if (!currentUser?.uid) {
        console.warn('[CampusLocationService] No current user for immediate presence update');
        return false;
      }
      
      // 🎯 PHASE 2 ENHANCEMENT: Track authentication time for login detection
      if (scenario === 'login' || scenario === 'initialization') {
        localStorage.setItem('campusLocation_authTime', Date.now().toString());
        console.log('[CampusLocationService] 🔐 Authentication time tracked for login detection');
      }
      
      // 🔧 FIX: For reload scenarios, fetch fresh coordinates immediately using Google API
      if (scenario === 'reload') {
        console.log('[CampusLocationService] 🚀 Reload detected - fetching fresh coordinates with Google API...');
        
        try {
          // Use Google API immediately for reload scenarios (strategic trigger)
          this.lastUpdateTrigger = 'reload'; // Store trigger for accuracy context
          const freshLocation = await this.getCurrentLocation(true, 'reload', currentUser.uid);
          
          if (freshLocation && freshLocation.coords) {
            // Detect campus presence with fresh coordinates
            const campusResult = await this.detectCampusPresence(currentUser.university || 'iub');
            
            if (campusResult && campusResult.onCampus !== undefined) {
              const campusStatus = campusResult.onCampus ? 'on_campus' : 'off_campus';
              const coordinates = {
                latitude: freshLocation.coords.latitude,
                longitude: freshLocation.coords.longitude,
                accuracy: freshLocation.coords.accuracy,
                timestamp: freshLocation.timestamp || Date.now()
              };
              
              // Update database with fresh coordinates and campus status
              await dataManager.updateUserLocationStatus(currentUser.uid, campusStatus, coordinates);
              
              console.log('[CampusLocationService] ✅ Reload: Fresh location and campus status updated immediately:', {
                campusStatus,
                accuracy: Math.round(freshLocation.coords.accuracy) + 'm',
                coordinates: `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
              });
              
              return true;
            }
          }
        } catch (error) {
          console.warn('[CampusLocationService] ⚠️ Fresh location fetch failed for reload, falling back to cached data:', error.message);
        }
      }
      
      // 🔧 FALLBACK: Use cached location if available and has coordinates
      const cachedLocation = this.getCachedLocation();
      if (cachedLocation && cachedLocation.campusStatus && cachedLocation.coordinates) {
        // Use updateUserLocationStatus for proper systemInfo field handling
        await dataManager.updateUserLocationStatus(
          currentUser.uid, 
          cachedLocation.campusStatus,
          cachedLocation.coordinates
        );
        console.log('[CampusLocationService] 📍 Using cached location with coordinates for immediate update:', {
          campusStatus: cachedLocation.campusStatus,
          age: Math.round((Date.now() - cachedLocation.timestamp) / 1000) + 's',
          scenario
        });
      } else {
        // Fallback: Direct systemInfo update with proper field handling  
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../../lib/firebase/firebase-config.js');
        
        await dataManager.ensureSystemInfoExists(currentUser.uid);
        
        await updateDoc(doc(db, "users", currentUser.uid), {
          'systemInfo.lastActive': serverTimestamp(),
          'systemInfo.status': 'online',
          'systemInfo.lastUpdated': serverTimestamp()
        });
        console.log('[CampusLocationService] ⚡ Direct systemInfo update completed (no cached location)');
      }
      
      console.log(`[CampusLocationService] ✅ Phase 1 complete: Immediate presence updated (${scenario})`);
      
      // Trigger animation based on scenario and data availability
      let animationType = 'immediate_presence';
      if (cachedLocation) {
        animationType = scenario === 'login' ? 'login_cached' : 'cached_location';
      }
      
      // Create proper location data for animation
      const immediateAnimationData = {
        coordinatesChanged: false, // This is an immediate presence update, not a coordinate change
        campusStatusChanged: false, // Status detection happens in other methods
        hasValidCoordinates: cachedLocation && cachedLocation.latitude != null && cachedLocation.longitude != null,
        hasLastActiveUpdate: true, // We're always updating lastActive in immediate presence
        previousStatus: 'unknown',
        newStatus: cachedLocation ? cachedLocation.campusStatus : 'unknown',
        // 🔧 FIX: Include actual coordinate data for UI animations
        coordinates: (cachedLocation && cachedLocation.latitude != null && cachedLocation.longitude != null) ? {
          latitude: cachedLocation.latitude,
          longitude: cachedLocation.longitude,
          accuracy: cachedLocation.accuracy
        } : null
      };
      
      this.triggerLocationAnimation(animationType, immediateAnimationData);
      console.log(`[CampusLocationService] 🟣 Animation triggered: ${animationType}`);
      
      return true;
      
    } catch (error) {
      console.error('[CampusLocationService] ❌ Immediate presence update failed:', error);
      return false;
    }
  }

  /**
   * Get cached location from localStorage
   * @returns {Object|null} Cached location data or null if not available/expired
   */
  getCachedLocation() {
    try {
      const cached = localStorage.getItem('campxus_last_location');
      if (!cached) return null;
      
      const locationData = JSON.parse(cached);
      
      // Check if cache is expired (24 hours)
      const cacheAge = Date.now() - locationData.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (cacheAge > maxAge) {
        console.log('[CampusLocationService] 🗑️ Cached location expired, removing');
        localStorage.removeItem('campxus_last_location');
        return null;
      }
      
      console.log('[CampusLocationService] 📦 Found cached location:', {
        campusStatus: locationData.campusStatus,
        ageMinutes: Math.round(cacheAge / 60000),
        accuracy: locationData.accuracy
      });
      
      return locationData;
      
    } catch (error) {
      console.warn('[CampusLocationService] Failed to get cached location:', error);
      return null;
    }
  }

  /**
   * Cache location data to localStorage
   * @param {Object} locationData - Location data to cache
   */
  setCachedLocation(locationData) {
    try {
      const cacheData = {
        ...locationData,
        timestamp: Date.now()
      };
      
      localStorage.setItem('campxus_last_location', JSON.stringify(cacheData));
      
      console.log('[CampusLocationService] 💾 Cached location:', {
        campusStatus: locationData.campusStatus,
        accuracy: locationData.accuracy
      });
      
    } catch (error) {
      console.warn('[CampusLocationService] Failed to cache location:', error);
    }
  }

  /**
   * Trigger location update animation in HorizontalFriendsBar
   * @param {string} source - Source of the animation trigger
   * @param {Object} locationData - Location update data
   */
  async triggerLocationAnimation(source = 'location_update', locationData = null) {
    try {
      // Import the animation trigger function
      const { triggerUserLocationUpdateAnimation } = await import('../../components/friends/HorizontalFriendsBar.js');
      
      console.log(`[CampusLocationService] 🟣 Triggering location animation (${source})`);
      
      // Pass proper data structure to HorizontalFriendsBar
      if (locationData) {
        triggerUserLocationUpdateAnimation(locationData);
      } else {
        // Fallback with basic valid structure to prevent null errors
        triggerUserLocationUpdateAnimation({
          coordinatesChanged: true,
          campusStatusChanged: false,
          hasValidCoordinates: true,
          hasLastActiveUpdate: true,
          previousStatus: 'unknown',
          newStatus: 'unknown'
        });
      }
      
    } catch (error) {
      console.warn('[CampusLocationService] Could not trigger location animation:', error);
    }
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

    // 🎯 SPA NAVIGATION: Listen for single-page app navigation events
    document.addEventListener('spa:page:load', (event) => {
      this.handleSPANavigation(event);
    });

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

    console.log("[CampusLocationService] 📱 Mobile lifecycle handlers initialized (including SPA navigation)");
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
   * 🚀 ENTERPRISE FIX: Real-time campus presence tracking with mobile-first GPS management
   * Implements aggressive location tracking for accurate campus presence detection
   * @param {Function} callback - Callback function for position updates
   * @returns {number|null} Watch ID for stopping the watch
   */
  watchPosition(callback) {
    console.log("[CampusLocationService] 🌍 Starting enterprise-grade real-time position watch for campus presence...");

    if (!this.isLocationSupported) {
      console.error(
        "[CampusLocationService] Cannot watch position - geolocation not supported"
      );
      return null;
    }

    // 🚀 ENTERPRISE FIX: Aggressive real-time settings for campus presence tracking
    // Trade battery for accuracy - campus presence requires immediate updates
    const options = {
      enableHighAccuracy: true, // CHANGED: High accuracy required for campus geofencing
      timeout: 10000, // REDUCED: 10 seconds for faster GPS fixes
      maximumAge: 30000, // REDUCED: 30 seconds cache for more frequent updates
    };

    console.log("[CampusLocationService] 🎯 Using aggressive GPS settings for real-time campus tracking:", {
      highAccuracy: options.enableHighAccuracy,
      timeout: options.timeout + 'ms',
      maxAge: options.maximumAge + 'ms',
      purpose: 'campus_presence_detection'
    });

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentPosition = position;
        
        // 🚀 ENTERPRISE FIX: GPS quality monitoring for mobile reliability
        this.lastSuccessfulGPSUpdate = Date.now();
        const accuracy = position.coords.accuracy;
        
        console.log("[CampusLocationService] 🌍 Position update received:", {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: accuracy + 'm',
          timestamp: new Date(position.timestamp).toISOString(),
          quality: accuracy < 50 ? 'excellent' : accuracy < 100 ? 'good' : accuracy < 200 ? 'fair' : 'poor'
        });
        
        // 🚀 ENTERPRISE FIX: Smart GPS reset logic to prevent loops with stale coordinates
        if (accuracy > 500) {
          console.warn("[CampusLocationService] 📍 Poor GPS accuracy detected:", accuracy + 'm');
          this.poorGPSReadings = (this.poorGPSReadings || 0) + 1;
          
          // 🎯 SMART RESET: Only reset if coordinates have actually changed OR accuracy is extremely poor
          const coordinatesChanged = this.hasLocationChanged(position, 5); // 5m threshold for GPS reset decisions
          const extremelyPoorAccuracy = accuracy > 2000; // 2km+ is extremely poor
          
          if (this.poorGPSReadings >= 3) {
            if (coordinatesChanged || extremelyPoorAccuracy) {
              console.log("[CampusLocationService] 🔄 Triggering GPS reset - poor accuracy with new/extremely poor data:", {
                coordinatesChanged,
                extremelyPoorAccuracy,
                accuracy: accuracy + 'm'
              });
              this.scheduleGPSReset();
            } else {
              console.log("[CampusLocationService] 🛑 GPS reset skipped - same stale coordinates with poor accuracy:", {
                accuracy: accuracy + 'm',
                message: 'Preventing infinite reset loop'
              });
              // Don't reset counters - let it continue to accumulate until we get different coordinates
            }
          }
        } else {
          // Reset counters on good GPS
          this.poorGPSReadings = 0;
          this.consecutiveGPSErrors = 0; // Reset error counter on successful update
        }
        
        if (callback) callback(position);
      },
      (error) => {
        // 🚀 ENTERPRISE FIX: Enhanced error handling with GPS reset triggers
        this.consecutiveGPSErrors = (this.consecutiveGPSErrors || 0) + 1;
        
        switch (error.code) {
          case error.TIMEOUT:
            console.warn(
              "[CampusLocationService] ⏱️ GPS timeout - will retry on next update (error", 
              this.consecutiveGPSErrors, "of 5)"
            );
            break;
          case error.PERMISSION_DENIED:
            console.error(
              "[CampusLocationService] 🚫 Location permission denied - cannot continue"
            );
            this.consecutiveGPSErrors = 0; // Don't count permission errors
            break;
          case error.POSITION_UNAVAILABLE:
            console.warn(
              "[CampusLocationService] 📍 GPS temporarily unavailable (error", 
              this.consecutiveGPSErrors, "of 5) - will retry"
            );
            break;
          default:
            console.warn(
              "[CampusLocationService] 📍 Location error (", 
              this.consecutiveGPSErrors, "of 5):", error.message
            );
        }

        // 🎯 SMART ERROR HANDLING: Only trigger GPS reset for non-permission errors
        if (this.consecutiveGPSErrors >= 5 && error.code !== error.PERMISSION_DENIED) {
          console.warn("[CampusLocationService] 🔄 Too many GPS errors - triggering reset");
          this.consecutiveGPSErrors = 0;
          this.scheduleGPSReset();
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
  debouncedLocationUpdate(position, options = {}) {
    // Clear any pending debounce timeout
    if (this.locationUpdateDebounceTimeout) {
      clearTimeout(this.locationUpdateDebounceTimeout);
    }

    // 🎯 SMART ACTIVITY CHECK: Only write to database for meaningful interactions
    const isTriggeredUpdate = options.isTrigger || false;
    const isSignificantActivity = this.isSignificantUserActivity();
    const shouldWriteToDatabase = isTriggeredUpdate || isSignificantActivity;

    const now = Date.now();
    
    console.log('[CampusLocationService] 🎯 Smart location update decision:', {
      isTriggeredUpdate,
      isSignificantActivity,
      shouldWriteToDatabase,
      timeSinceLastActivity: this.lastActivityDetected ? Math.round((now - this.lastActivityDetected) / 1000) + 's' : 'none',
      timeSinceLastUpdate: this.lastLocationUpdate ? Math.round((now - this.lastLocationUpdate) / 1000) + 's' : 'none'
    });

    // Always update cache for immediate presence updates, regardless of database write decision
    const campusStatus = this.getCachedCampusStatus(position) || 'unknown';
    this.setCachedLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
      campusStatus: campusStatus
    });

    // 🟣 Always trigger animation for any location update (cached or database)
    // Create proper location data structure for animation with actual coordinates
    const locationAnimationData = {
      coordinatesChanged: this.hasLocationChanged(position, 10), // Use the existing method
      campusStatusChanged: false, // Status change detection is handled in updateLocationAndPresence
      hasValidCoordinates: this.isValidCoordinates(position),
      hasLastActiveUpdate: shouldWriteToDatabase, // Only true when writing to database (updating lastActive)
      previousStatus: this.lastKnownCampusStatus || 'unknown',
      newStatus: campusStatus,
      // 🔧 FIX: Include actual coordinate data for UI animations
      coordinates: this.isValidCoordinates(position) ? {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      } : null
    };
    
    this.triggerLocationAnimation(
      shouldWriteToDatabase ? 'activity_gps' : 'cached_update',
      locationAnimationData
    );

    if (!shouldWriteToDatabase) {
      console.log('[CampusLocationService] 🎯 SMART SKIP: Not writing to database - user is passively browsing');
      return;
    }

    // Check timing constraints for database writes
    if (
      this.lastLocationUpdate &&
      now - this.lastLocationUpdate < this.minUpdateInterval &&
      !isTriggeredUpdate
    ) {
      console.log(
        `[CampusLocationService] ⏱️ Skipping database write - only ${Math.round(
          (now - this.lastLocationUpdate) / 1000
        )}s since last write (min: 60s)`
      );
      return;
    }

    // 🚀 SMART DATABASE WRITE: Only for meaningful user activity
    const debounceTime = isTriggeredUpdate ? 1000 : 10000; // Faster for triggers, slower for activity
    
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
        const finalCampusStatus =
          campusPresenceResult?.onCampus !== undefined
            ? campusPresenceResult.onCampus
              ? "on_campus"
              : "off_campus"
            : "unknown";

        console.log(
          "[CampusLocationService] 🎯 SMART UPDATE: Writing to database:",
          {
            campusStatus: finalCampusStatus,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            reason: isTriggeredUpdate ? 'trigger_event' : 'user_activity',
            intervalSinceLastUpdate: this.lastLocationUpdate
              ? `${Math.round((now - this.lastLocationUpdate) / 1000)}s`
              : "first_update",
          }
        );

        // Update user location status in database
        const updateResult = await dataManager.updateUserLocationStatus(
          currentUser.uid,
          finalCampusStatus,
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          }
        );

        if (updateResult.success) {
          console.log(
            "[CampusLocationService] ✅ Smart location update successful"
          );

          // Update cache with accurate data
          this.setCachedLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
            campusStatus: finalCampusStatus
          });

          // 🟣 Trigger animation for database write
          // Create proper location data for animation with actual coordinates
          const databaseWriteAnimationData = {
            coordinatesChanged: this.hasLocationChanged(position, 10),
            campusStatusChanged: (this.lastKnownCampusStatus || 'unknown') !== finalCampusStatus,
            hasValidCoordinates: this.isValidCoordinates(position),
            hasLastActiveUpdate: true, // Database write always updates lastActive
            previousStatus: this.lastKnownCampusStatus || 'unknown',
            newStatus: finalCampusStatus,
            // 🔧 FIX: Include actual coordinate data for UI animations
            coordinates: this.isValidCoordinates(position) ? {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            } : null
          };
          
          this.triggerLocationAnimation('database_write', databaseWriteAnimationData);

          // Emit real-time campus presence change event for friends to see updates
          try {
            const { realTimeManager } = await import(
              "../realtime/RealtimeService.js"
            );
            realTimeManager.emitCampusPresenceChange(
              currentUser.uid,
              finalCampusStatus,
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
            "[CampusLocationService] ❌ Failed to update location:",
            updateResult.error
          );
        }
      } catch (updateError) {
        console.error(
          "[CampusLocationService] Error in smart location update:",
          updateError
        );
      } finally {
        this.isUpdatingLocation = false;
      }
    }, debounceTime);
  }

  /**
   * 🎯 SMART ACTIVITY DETECTION: Determines if user activity warrants database writes
   */
  isSignificantUserActivity() {
    const now = Date.now();
    const activityThreshold = 5 * 60 * 1000; // 5 minutes of inactivity = passive browsing
    
    // No recent activity detected = passive browsing
    if (!this.lastActivityDetected || (now - this.lastActivityDetected) > activityThreshold) {
      return false;
    }
    
    // Check for meaningful interactions (not just passive scrolling)
    const recentActivityWindow = 2 * 60 * 1000; // 2 minutes
    const hasRecentActivity = (now - this.lastActivityDetected) < recentActivityWindow;
    
    return hasRecentActivity;
  }

  /**
   * 🎯 CACHED CAMPUS STATUS: Get campus status from cached location data
   */
  getCachedCampusStatus(position) {
    try {
      const cachedLocation = this.getCachedLocation();
      if (cachedLocation && cachedLocation.campusStatus) {
        // If position is close to cached position, use cached status
        const distance = this.calculateDistance(
          position.coords.latitude,
          position.coords.longitude,
          cachedLocation.latitude,
          cachedLocation.longitude
        );
        
        // Within 100 meters = same campus status
        if (distance < 100) {
          return cachedLocation.campusStatus;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('[CampusLocationService] Failed to get cached campus status:', error);
      return null;
    }
  }

  /**
   * 🎯 DISTANCE CALCULATION: Simple distance between two coordinates
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
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
        const position = await this.getCurrentLocation(false, 'periodic_update');
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
  /**
   * 🎯 PHASE 2 ENHANCEMENT: Detects the type of trigger that initiated location tracking
   * Helps optimize the immediate presence update strategy based on user context
   */
  detectTriggerScenario() {
    try {
      // Check for page reload indicators
      if (performance.navigation) {
        // Legacy API
        const navType = performance.navigation.type;
        if (navType === performance.navigation.TYPE_RELOAD) {
          return 'reload';
        }
        if (navType === performance.navigation.TYPE_NAVIGATE) {
          return 'navigate';
        }
        if (navType === performance.navigation.TYPE_BACK_FORWARD) {
          return 'back_forward';
        }
      }

      // Modern Navigation API (newer browsers)
      if (performance.getEntriesByType && performance.getEntriesByType('navigation').length > 0) {
        const navEntry = performance.getEntriesByType('navigation')[0];
        if (navEntry.type === 'reload') {
          return 'reload';
        }
        if (navEntry.type === 'navigate') {
          return 'navigate';
        }
        if (navEntry.type === 'back_forward') {
          return 'back_forward';
        }
      }

      // Check if this is likely a tab return (document was hidden and now visible)
      if (document.visibilityState === 'visible' && this.wasDocumentHidden) {
        return 'tab_return';
      }

      // Check for authentication state to detect login
      if (this.isRecentLogin()) {
        return 'login';
      }

      // Check if this is an app restart after being idle
      if (this.wasAppIdle()) {
        return 'app_restart';
      }

      return 'initialization';
    } catch (error) {
      console.warn('[CampusLocationService] Failed to detect trigger scenario:', error);
      return 'initialization';
    }
  }

  /**
   * 🔍 Helper: Checks if this is a recent login scenario
   */
  isRecentLogin() {
    try {
      const authTime = localStorage.getItem('campusLocation_authTime');
      if (!authTime) return false;
      
      const timeSinceAuth = Date.now() - parseInt(authTime);
      // Consider it a recent login if auth happened within last 30 seconds
      return timeSinceAuth < 30000;
    } catch (error) {
      return false;
    }
  }

  /**
   * 🔍 Helper: Checks if app was idle and is now restarting
   */
  wasAppIdle() {
    try {
      const lastActive = localStorage.getItem('campusLocation_lastActive');
      if (!lastActive) return false;
      
      const timeSinceActive = Date.now() - parseInt(lastActive);
      // Consider app idle if last activity was more than 5 minutes ago
      return timeSinceActive > 300000;
    } catch (error) {
      return false;
    }
  }

  async autoStartLocationTracking() {
    this.initializationAttempts++;
    
    try {
      console.log(
        `[CampusLocationService] 🚀 Initialization attempt ${this.initializationAttempts}/${this.maxInitializationAttempts} - checking if automatic location tracking should start...`
      );

      // 🎯 PHASE 2 ENHANCEMENT: Detect trigger scenario for optimized handling
      const triggerScenario = this.detectTriggerScenario();
      this.lastUpdateTrigger = triggerScenario; // Store trigger for accuracy context
      console.log(`[CampusLocationService] 🎯 Trigger scenario detected: ${triggerScenario}`);

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
      
      // 🚀 PHASE 1: Immediate presence update with trigger context
      console.log(`[CampusLocationService] 🚀 Starting Phase 1: Immediate presence update (${triggerScenario})...`);
      const immediateUpdateSuccess = await this.immediatePresenceUpdate(triggerScenario);
      
      if (immediateUpdateSuccess) {
        console.log('[CampusLocationService] ✅ Phase 1 complete - user presence updated immediately');
        
        // 🎯 PHASE 2 ENHANCEMENT: For high-priority triggers, request fresh GPS immediately
        if (['login', 'reload', 'tab_return'].includes(triggerScenario)) {
          console.log(`[CampusLocationService] ⚡ High-priority trigger detected - requesting immediate fresh GPS`);
          this.requestSingleLocationUpdate();
        }
      } else {
        console.warn('[CampusLocationService] ⚠️ Phase 1 failed - continuing with Phase 2');
      }
      
      console.log('[CampusLocationService] 🔍 Starting Phase 2: Accurate location acquisition...');

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
        "[CampusLocationService] ✅ All conditions met - starting Phase 2 location tracking with GPS accuracy"
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
        `[CampusLocationService] 🎉 Location tracking initialization completed successfully (${triggerScenario})`
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

    // 🔧 FIX: Mark page load/initialization as user activity
    this.isUserCurrentlyActive = true;
    this.lastActivityDetected = Date.now();
    console.log("[CampusLocationService] 🚀 Page load detected - marked as initial user activity");

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

    console.log("[CampusLocationService] 💊 Starting enhanced health monitoring system...");

    // Perform health check every 10 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 10 * 60 * 1000);

    // Perform initial health check
    setTimeout(() => this.performHealthCheck(), 5000);

    // 🚀 ENTERPRISE FIX: Start GPS health monitoring for mobile reliability
    this.setupGPSHealthMonitoring();

    console.log("[CampusLocationService] ✅ Enhanced health monitoring started (10-minute intervals)");
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

  /**
   * 🚀 ENTERPRISE FIX: Core location and presence update method
   * Processes location changes and publishes campus status updates
   * @param {boolean} highAccuracy - Whether to use high accuracy GPS
   */
  /**
   * 🚀 ENTERPRISE FIX: Validate coordinates to prevent null database writes
   */
  isValidCoordinates(position) {
    if (!position || !position.coords) {
      console.warn("[CampusLocationService] ❌ Invalid position object");
      return false;
    }

    const { latitude, longitude, accuracy } = position.coords;

    // Check for null/undefined coordinates
    if (latitude === null || latitude === undefined ||
        longitude === null || longitude === undefined) {
      console.warn("[CampusLocationService] ❌ Null or undefined coordinates detected");
      return false;
    }

    // Check for valid coordinate ranges
    if (latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180) {
      console.warn("[CampusLocationService] ❌ Coordinates out of valid range:", {
        latitude,
        longitude
      });
      return false;
    }

    // Check for obviously invalid coordinates (0, 0) which often indicates GPS failure
    if (latitude === 0 && longitude === 0) {
      console.warn("[CampusLocationService] ❌ Suspicious coordinates (0, 0) detected");
      return false;
    }

    console.log("[CampusLocationService] ✅ Coordinates validated successfully:", {
      latitude,
      longitude,
      accuracy: accuracy + 'm'
    });

    return true;
  }

  /**
   * 🚀 ENTERPRISE FIX: Check if location has meaningfully changed using Haversine distance
   */
  hasLocationChanged(newPosition, thresholdMeters = 10) {
    // Always return true if no previous location cached
    if (!this.lastSignificantLocation) {
      console.log("[CampusLocationService] 📍 No previous location - treating as changed");
      return true;
    }

    const distance = this.calculateDistance(
      this.lastSignificantLocation.latitude,
      this.lastSignificantLocation.longitude,
      newPosition.coords.latitude,
      newPosition.coords.longitude
    );

    const hasChanged = distance >= thresholdMeters;

    console.log("[CampusLocationService] 📏 Location change analysis:", {
      previousLat: this.lastSignificantLocation.latitude,
      previousLng: this.lastSignificantLocation.longitude,
      newLat: newPosition.coords.latitude,
      newLng: newPosition.coords.longitude,
      distance: distance.toFixed(2) + 'm',
      threshold: thresholdMeters + 'm',
      hasChanged
    });

    return hasChanged;
  }

  /**
   * 🚀 ENTERPRISE FIX: Determine if location update is worthy of database write and animation
   */
  isLocationUpdateWorthy(position, campusStatusChanged, context = 'normal') {
    // 1. Must have valid coordinates
    if (!this.isValidCoordinates(position)) {
      console.warn("[CampusLocationService] 🚫 Location update not worthy - invalid coordinates");
      return { worthy: false, reason: 'invalid_coordinates' };
    }

    // 2. Must have reasonable accuracy for campus detection
    const accuracy = position.coords.accuracy;
    
    // 🔧 FIX: More lenient accuracy requirements for initial/reload scenarios
    let maxAccuracy = 1000; // Default threshold
    if (context === 'initial' || context === 'reload' || context === 'first_load') {
      maxAccuracy = 5000; // Allow up to 5km accuracy for immediate presence indication
      console.log("[CampusLocationService] 🎯 Using relaxed accuracy threshold for " + context + " scenario: " + maxAccuracy + 'm');
    }
    
    if (accuracy > maxAccuracy) {
      console.warn("[CampusLocationService] 🚫 Location update not worthy - poor accuracy:", accuracy + 'm (max: ' + maxAccuracy + 'm for ' + context + ')');
      return { worthy: false, reason: 'poor_accuracy', accuracy, context };
    }

    // 3. Either campus status must have changed OR coordinates must have changed meaningfully
    const coordinatesChanged = this.hasLocationChanged(position, 10); // 10-meter threshold

    if (campusStatusChanged || coordinatesChanged) {
      console.log("[CampusLocationService] ✅ Location update worthy:", {
        campusStatusChanged,
        coordinatesChanged,
        accuracy: accuracy + 'm'
      });

      // Cache this as the new significant location
      this.lastSignificantLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: accuracy,
        timestamp: position.timestamp || Date.now()
      };

      return { 
        worthy: true, 
        reason: 'meaningful_change',
        coordinatesChanged,
        campusStatusChanged
      };
    }

    console.log("[CampusLocationService] 🚫 Location update not worthy - no meaningful change");
    return { worthy: false, reason: 'no_meaningful_change' };
  }


  async updateLocationAndPresence(highAccuracy = false) {
    try {
      console.log(`[CampusLocationService] 🌍 Updating location and presence (high accuracy: ${highAccuracy})...`);
      
      // Get current location
      const trigger = highAccuracy ? 'high_accuracy_request' : 'manual_update';
      this.lastUpdateTrigger = trigger; // Store trigger for accuracy context
      const position = await this.getCurrentLocation(highAccuracy, trigger);
      if (!position) {
        console.warn("[CampusLocationService] 📍 No position available for presence update");
        return;
      }

      // 🚀 ENTERPRISE FIX: Validate coordinates before processing
      if (!this.isValidCoordinates(position)) {
        console.error("[CampusLocationService] ❌ Skipping location update - invalid coordinates");
        return;
      }
      
      // Determine campus status
      const campusPresenceResult = await this.detectCampusPresence("iub");
      const newCampusStatus = campusPresenceResult?.onCampus !== undefined
        ? campusPresenceResult.onCampus ? "on_campus" : "off_campus"
        : "unknown";
      
      // Track status changes for meaningful updates only
      const previousStatus = this.lastKnownCampusStatus || 'unknown';
      const statusChanged = previousStatus !== newCampusStatus;
      
      console.log(`[CampusLocationService] 🌍 Campus presence update:`, {
        previous: previousStatus,
        current: newCampusStatus,
        changed: statusChanged,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy + 'm'
      });
      
      // Update cached status
      this.lastKnownCampusStatus = newCampusStatus;
      
      // Update cached location with new status
      this.setCachedLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        campusStatus: newCampusStatus
      });
      
      // 🚀 ENTERPRISE FIX: Only update database and trigger animations for worthy location changes
      // Determine context based on trigger information
      let context = 'normal';
      if (this.isFirstLocationUpdate) {
        context = 'initial';
        this.isFirstLocationUpdate = false;
      } else if (this.lastUpdateTrigger === 'reload' || this.lastUpdateTrigger === 'first_visit') {
        context = 'reload';
      }
      
      const updateWorthiness = this.isLocationUpdateWorthy(position, statusChanged, context);
      
      if (updateWorthiness.worthy) {
        console.log(`[CampusLocationService] 🔄 Meaningful location change detected: ${updateWorthiness.reason}`);
        
        // Publish real-time campus presence change
        await this.publishCampusStatusChange(newCampusStatus, previousStatus, position);
        
        // Update user profile in database
        await this.updateUserLocationInDatabase(position, newCampusStatus);
        
        // Notify HorizontalFriendsBar about meaningful status change with coordinate info
        if (typeof window !== 'undefined' && window.HorizontalFriendsBar?.getInstance) {
          const friendsBar = window.HorizontalFriendsBar.getInstance();
          if (friendsBar && friendsBar.notifyLocationUpdated) {
            friendsBar.notifyLocationUpdated({
              previousStatus,
              newStatus: newCampusStatus,
              coordinatesChanged: updateWorthiness.coordinatesChanged,
              campusStatusChanged: updateWorthiness.campusStatusChanged,
              hasValidCoordinates: true,
              hasLastActiveUpdate: true // We're updating lastActive in database
            });
          }
        }
      } else {
        console.log(`[CampusLocationService] ✓ Location update skipped - ${updateWorthiness.reason}`);
      }
      
    } catch (error) {
      console.error("[CampusLocationService] ❌ Failed to update location and presence:", error);
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: Publish campus status changes to real-time system
   */
  async publishCampusStatusChange(newStatus, previousStatus, position) {
    try {
      // Check if realTimeManager is available
      if (typeof realTimeManager !== 'undefined' && realTimeManager.publish) {
        const statusChangeEvent = {
          userId: currentUser?.user?.uid,
          campusStatus: newStatus,
          previousStatus,
          locationData: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          },
          timestamp: Date.now()
        };
        
        console.log(`[CampusLocationService] 📡 Publishing campus presence change:`, statusChangeEvent);
        
        // Publish to real-time system
        realTimeManager.publish('campusPresenceChanged', statusChangeEvent);
      }
    } catch (error) {
      console.error("[CampusLocationService] ❌ Failed to publish campus status change:", error);
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: Update user location in database
   */
  async updateUserLocationInDatabase(position, campusStatus) {
    try {
      // Check if DataService is available
      if (typeof dataManager !== 'undefined' && dataManager.updateUserSystemInfo) {
        const locationData = {
          lastKnownLocation: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            campusStatus,
            timestamp: serverTimestamp ? serverTimestamp() : new Date()
          },
          lastActive: serverTimestamp ? serverTimestamp() : new Date(),
          status: 'online'
        };
        
        console.log(`[CampusLocationService] 💾 Updating user location in database:`, {
          campusStatus,
          accuracy: position.coords.accuracy + 'm'
        });
        
        await dataManager.updateUserSystemInfo(currentUser?.user?.uid, locationData);
      }
    } catch (error) {
      console.error("[CampusLocationService] ❌ Failed to update user location in database:", error);
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: GPS Reset System for Mobile Reliability
   * Handles GPS degradation by restarting location tracking with fresh settings
   */
  scheduleGPSReset() {
    // Prevent multiple resets
    if (this.isGPSResetInProgress) {
      console.log("[CampusLocationService] 🛑 GPS reset already in progress - skipping");
      return;
    }

    console.log("[CampusLocationService] 🔄 Scheduling GPS reset for mobile reliability...");
    
    this.isGPSResetInProgress = true;
    
    // Schedule reset with short delay to let current operations complete
    setTimeout(() => {
      this.performGPSReset();
    }, 2000);
  }

  /**
   * 🚀 ENTERPRISE FIX: Perform GPS system reset
   * Stops current tracking and restarts with fresh GPS connection
   */
  async performGPSReset() {
    try {
      console.log("[CampusLocationService] 🔄 Performing GPS reset...");
      
      // Stop current tracking
      if (this.trackingWatchId) {
        navigator.geolocation.clearWatch(this.trackingWatchId);
        this.trackingWatchId = null;
        console.log("[CampusLocationService] 🔄 Stopped existing GPS watch");
      }
      
      // Clear GPS-related state
      this.currentPosition = null;
      this.poorGPSReadings = 0;
      this.lastSuccessfulGPSUpdate = null;
      
      // Wait for GPS to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Restart location tracking with fresh GPS connection
      console.log("[CampusLocationService] 🔄 Restarting location tracking after GPS reset...");
      await this.startLocationTracking();
      
      // Perform immediate location update to verify reset worked
      setTimeout(() => {
        this.updateLocationAndPresence(true); // High accuracy for verification
      }, 1000);
      
      console.log("[CampusLocationService] ✅ GPS reset completed successfully");
      
    } catch (error) {
      console.error("[CampusLocationService] ❌ GPS reset failed:", error);
    } finally {
      this.isGPSResetInProgress = false;
    }
  }

  /**
   * 🚀 ENTERPRISE FIX: Setup periodic GPS health monitoring
   * Monitors GPS performance and triggers resets when needed
   */
  setupGPSHealthMonitoring() {
    // Don't setup multiple monitors
    if (this.gpsHealthMonitorInterval) {
      return;
    }

    console.log("[CampusLocationService] 🏥 Starting GPS health monitoring system...");
    
    // Check GPS health every 10 minutes
    this.gpsHealthMonitorInterval = setInterval(() => {
      this.checkGPSHealth();
    }, 10 * 60 * 1000);
    
    console.log("[CampusLocationService] ✅ GPS health monitoring started (10-minute intervals)");
  }

  /**
   * 🚀 ENTERPRISE FIX: Check GPS health and trigger reset if needed
   */
  checkGPSHealth() {
    const now = Date.now();
    const timeSinceLastUpdate = this.lastSuccessfulGPSUpdate ? 
      now - this.lastSuccessfulGPSUpdate : null;
    
    // If no GPS updates for 15 minutes, trigger reset
    if (timeSinceLastUpdate && timeSinceLastUpdate > 15 * 60 * 1000) {
      console.warn("[CampusLocationService] 🏥 GPS health check failed - no updates for 15+ minutes");
      console.log("[CampusLocationService] 🔄 Triggering GPS reset due to health check failure");
      this.scheduleGPSReset();
      return;
    }
    
    // Log health status
    console.log("[CampusLocationService] 🏥 GPS health check passed:", {
      lastUpdate: timeSinceLastUpdate ? Math.round(timeSinceLastUpdate / 1000) + 's ago' : 'never',
      isTracking: this.trackingWatchId !== null,
      poorReadings: this.poorGPSReadings || 0
    });
  }

  // 💰 COST OPTIMIZATION METHODS

  /**
   * Handle initialization with appropriate trigger detection
   */
  async handleInitialization() {
    try {
      // Detect if this is a first visit or reload
      const isFirstVisit = !localStorage.getItem('campusLocationService_visited');
      const isReload = sessionStorage.getItem('campusLocationService_reload') === 'true';
      
      let trigger = 'unknown';
      if (isFirstVisit) {
        trigger = 'first_visit';
        localStorage.setItem('campusLocationService_visited', 'true');
        console.log('🎯 First visit detected - Google API authorized for optimal accuracy');
      } else if (isReload) {
        trigger = 'manual_reload';
        console.log('🎯 Manual reload detected - Google API authorized for fresh location');
      } else {
        trigger = 'app_init';
        console.log('🎯 Normal app initialization - using cost-optimized approach');
      }
      
      // Clear reload flag
      sessionStorage.removeItem('campusLocationService_reload');
      
      // Request initial location with appropriate trigger
      const position = await this.getCurrentLocation(false, trigger);
      
      if (position) {
        console.log(`✅ Initial location acquired via ${trigger}:`, {
          provider: position.source,
          accuracy: Math.round(position.coords.accuracy),
          cost: position.costOptimization?.cost || 0
        });
        
        // Start presence detection
        await this.detectCampusPresence('iub');
      } else {
        console.warn('⚠️ Failed to acquire initial location');
      }
      
    } catch (error) {
      console.error('❌ Failed to handle initialization:', error);
    }
  }

  /**
   * Mark that a manual reload occurred
   */
  static markManualReload() {
    sessionStorage.setItem('campusLocationService_reload', 'true');
  }

  /**
   * Determine if Google API should be used for this request
   */
  shouldUseGoogleAPI(trigger, userId, highAccuracy) {
    // Always use for strategic triggers
    if (this.googleApiTriggers.includes(trigger)) {
      console.log(`🎯 Strategic trigger detected: ${trigger} - Google API authorized`);
      return true;
    }
    
    // Use for high accuracy requests if user hasn't exceeded limits
    if (highAccuracy && userId) {
      const userUsage = this.getUserApiUsage(userId);
      if (userUsage.googleCalls < this.maxGoogleCallsPerUser) {
        console.log('🎯 High accuracy request - Google API authorized');
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get browser location (Tier 1 - Free)
   */
  async getBrowserLocation(highAccuracy) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Browser geolocation not supported'));
        return;
      }
      
      const options = {
        enableHighAccuracy: highAccuracy !== false,
        timeout: 8000, // Shorter timeout to fail fast
        maximumAge: 30000
      };
      
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          coords: position.coords,
          timestamp: position.timestamp,
          source: 'browser',
          provider: 'browser'
        }),
        (error) => reject(error),
        options
      );
    });
  }

  /**
   * Get Google Geolocation API location (Tier 2 - Paid)
   */
  async getGoogleLocation(highAccuracy = false) {
    try {
      const result = await googleGeolocationProvider.getCurrentLocation({
        highAccuracy,
        timeout: 10000,
        requestId: `campus-${Date.now()}`
      });
      
      if (result && result.coords) {
        return {
          coords: result.coords,
          timestamp: result.timestamp || Date.now(),
          source: 'google',
          provider: 'google_geolocation_api'
        };
      }
      
      throw new Error('Invalid response from Google Geolocation API');
    } catch (error) {
      console.error('[CampusLocationService] Google Geolocation API error:', error);
      throw error;
    }
  }


  /**
   * Check if Google API can be used (rate limiting)
   */
  canUseGoogleAPI(userId) {
    // Check daily limit
    if (this.dailyApiUsage >= this.maxDailyGoogleCalls) {
      console.log(`🚫 Daily Google API limit reached: ${this.dailyApiUsage}/${this.maxDailyGoogleCalls}`);
      return false;
    }
    
    if (!userId) return true; // Allow for anonymous users (with daily limit)
    
    const userUsage = this.getUserApiUsage(userId);
    
    // Check user daily limit
    if (userUsage.googleCalls >= this.maxGoogleCallsPerUser) {
      console.log(`🚫 User Google API limit reached: ${userUsage.googleCalls}/${this.maxGoogleCallsPerUser}`);
      return false;
    }
    
    // Check cooldown period
    const timeSinceLastCall = Date.now() - (userUsage.lastGoogleCall || 0);
    if (timeSinceLastCall < this.googleApiCooldown) {
      const waitTime = this.googleApiCooldown - timeSinceLastCall;
      console.log(`⏱️ Google API cooldown: ${Math.round(waitTime / 1000)}s remaining`);
      return false;
    }
    
    return true;
  }

  /**
   * Track Google API usage for cost control
   */
  trackGoogleApiUsage(userId) {
    // Update daily usage
    this.dailyApiUsage++;
    this.saveDailyUsage();
    
    if (userId) {
      // Update user usage
      const userUsage = this.getUserApiUsage(userId);
      userUsage.googleCalls++;
      userUsage.lastGoogleCall = Date.now();
      
      console.log(`📊 Google API usage tracked:`, {
        user: userId.substring(0, 8) + '...',
        userCalls: userUsage.googleCalls,
        dailyTotal: this.dailyApiUsage,
        cost: '$' + (this.dailyApiUsage * 0.005).toFixed(3)
      });
    }
  }

  /**
   * Get user API usage statistics
   */
  getUserApiUsage(userId) {
    if (!this.userApiUsage.has(userId)) {
      this.userApiUsage.set(userId, {
        googleCalls: 0,
        lastGoogleCall: null,
        firstCall: Date.now()
      });
    }
    return this.userApiUsage.get(userId);
  }

  /**
   * Get fallback location from cache
   */
  getFallbackLocation() {
    // Try cached location first
    const cached = this.locationCache.get('last_good');
    if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) { // 1 hour
      return cached.data;
    }
    
    return null;
  }

  /**
   * Format location response consistently
   */
  formatLocationResponse(location, tier, cost) {
    // Cache good locations
    if (location.coords.accuracy <= 1000) {
      this.locationCache.set('last_good', {
        data: location,
        timestamp: Date.now()
      });
    }
    
    // Store current position for the service
    this.currentPosition = {
      coords: location.coords,
      timestamp: location.timestamp
    };
    
    return {
      coords: location.coords,
      timestamp: location.timestamp,
      
      // Cost optimization metadata
      costOptimization: {
        tier: tier,
        cost: cost,
        provider: location.provider || location.source,
        accuracy: location.coords.accuracy,
        source: location.source,
        dailyApiUsage: this.dailyApiUsage,
        estimatedDailyCost: this.dailyApiUsage * 0.005
      },
      
      // Standard fields
      source: location.source,
      provider: 'cost_optimized'
    };
  }

  /**
   * Load daily usage from localStorage
   */
  loadDailyUsage() {
    try {
      const stored = localStorage.getItem('daily_google_api_usage');
      if (stored) {
        const data = JSON.parse(stored);
        const today = new Date().toDateString();
        
        if (data.date === today) {
          return data.usage || 0;
        }
      }
    } catch (error) {
      console.warn('Failed to load daily API usage:', error);
    }
    return 0;
  }

  /**
   * Save daily usage to localStorage
   */
  saveDailyUsage() {
    try {
      const data = {
        date: new Date().toDateString(),
        usage: this.dailyApiUsage
      };
      localStorage.setItem('daily_google_api_usage', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save daily API usage:', error);
    }
  }

  /**
   * Get comprehensive cost optimization statistics
   * 💰 Use this to monitor API usage and costs
   */
  getCostStats() {
    const estimatedDailyCost = this.dailyApiUsage * 0.005;
    const estimatedMonthlyCost = estimatedDailyCost * 30;
    const maxDailyCost = this.maxDailyGoogleCalls * 0.005;
    const maxMonthlyCost = maxDailyCost * 30;
    
    return {
      // Current usage
      dailyApiUsage: this.dailyApiUsage,
      estimatedDailyCost: '$' + estimatedDailyCost.toFixed(3),
      estimatedMonthlyCost: '$' + estimatedMonthlyCost.toFixed(2),
      
      // Limits and budget
      maxDailyLimit: this.maxDailyGoogleCalls,
      maxUserLimit: this.maxGoogleCallsPerUser,
      remainingDailyBudget: this.maxDailyGoogleCalls - this.dailyApiUsage,
      maxDailyCost: '$' + maxDailyCost.toFixed(2),
      maxMonthlyCost: '$' + maxMonthlyCost.toFixed(2),
      
      // User statistics
      activeUsers: this.userApiUsage.size,
      averageCallsPerUser: this.userApiUsage.size > 0 ? 
        (Array.from(this.userApiUsage.values()).reduce((sum, user) => sum + user.googleCalls, 0) / this.userApiUsage.size).toFixed(1) : 0,
      
      // Usage percentage
      dailyUsagePercent: ((this.dailyApiUsage / this.maxDailyGoogleCalls) * 100).toFixed(1) + '%',
      
      // Rate limiting info
      cooldownMinutes: this.googleApiCooldown / (60 * 1000)
    };
  }

  /**
   * Reset daily usage for testing or new day
   * 🔧 Admin/testing function to reset API usage counters
   */
  resetDailyUsage() {
    this.dailyApiUsage = 0;
    this.userApiUsage.clear();
    this.saveDailyUsage();
    console.log('🔄 Daily API usage reset - all limits cleared');
    
    return {
      message: 'Daily usage reset successfully',
      dailyUsage: this.dailyApiUsage,
      activeUsers: this.userApiUsage.size
    };
  }
}

// Export singleton instance
export const campusLocationService = new CampusLocationService();

// 🛠️ DEBUGGING: Make campusLocationService globally available for console access and cost monitoring
if (typeof window !== "undefined") {
  window.campusLocationService = campusLocationService;
  console.log(
    "🛠️ CampusLocationService available globally as window.campusLocationService for debugging"
  );
  console.log(
    "💰 Cost monitoring: Use campusLocationService.getCostStats() to check API usage and costs"
  );
}
