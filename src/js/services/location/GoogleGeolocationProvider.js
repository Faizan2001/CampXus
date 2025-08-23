/**
 * GoogleGeolocationProvider.js
 *
 * Service for interacting with Google's Geolocation API as an alternative/fallback
 * to the browser's native geolocation API. Provides enhanced accuracy and reliability
 * for campus presence detection.
 *
 * Features:
 * - Secure API key handling from environment variables
 * - Intelligent retry logic with exponential backoff
 * - Battery-optimized request management
 * - Enterprise-grade error handling and logging
 * - Performance monitoring and success tracking
 * - Request caching to minimize API usage
 *
 * Phase 1.2 - Hybrid GPS System Implementation
 */

export class GoogleGeolocationProvider {
  constructor() {
    // API configuration
    this.apiKey = window.ENV?.GOOGLE_GEOLOCATION_API_KEY;
    this.apiEndpoint = "https://www.googleapis.com/geolocation/v1/geolocate";

    // Request management
    this.requestTimeout = 10000; // 10 second timeout
    this.maxRetries = 3;
    this.retryDelay = 1000; // Start with 1 second, exponential backoff

    // Performance tracking
    this.requestStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: null,
      accuracyHistory: [],
    };

    // Enhanced Caching System (Extended to 30 minutes)
    this.locationCache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes for better cost control
    this.maxCacheSize = 20; // Increased cache size
    this.confidenceBasedCaching = true;

    // Rate limiting to prevent API abuse
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.minRequestInterval = 30000; // Increased to 30 seconds between requests

    // Request Deduplication System
    this.activeRequests = new Map(); // Track ongoing requests
    this.requestFingerprints = new Map(); // Track request fingerprints
    this.fingerprintExpiry = 60000; // 1 minute fingerprint cache

    // Per-User Daily Quota Management (5 requests max per day per user)
    this.REQUEST_QUOTA = 5; // Reduced from 50 to 5 requests per user per day
    this.quotaResetHour = 0; // Reset at midnight
    this.perUserQuotas = new Map(); // Track quota per user
    this.loadPerUserQuotas();

    // Enhanced Rate Limiting
    this.rateLimiter = {
      requestsPerHour: 10, // Max 10 requests per hour
      hourlyRequests: new Map(),
      isBlocked: false,
      blockedUntil: null
    };

    // Validation
    this.validateConfiguration();

    // Setup quota reset handler
    this.setupQuotaResetHandler();

    // Route initialization info through the log manager when available
    if (typeof logManager !== "undefined") {
      logManager.dev.info("📍 GoogleGeolocationProvider initialized", {
        hasApiKey: !!this.apiKey,
        endpoint: this.apiEndpoint,
        cacheEnabled: true,
        rateLimitEnabled: true,
        dailyQuotaPerUser: this.REQUEST_QUOTA,
        enhancedCaching: this.confidenceBasedCaching,
        deduplicationEnabled: true
      });
    }
  }

  /**
   * Validates that the service is properly configured
   */
  validateConfiguration() {
    if (!this.apiKey || this.apiKey.trim() === "") {
      // Missing API key is a location-related warning
      if (typeof logManager !== "undefined") {
        logManager.location.warn(
          "⚠️ GoogleGeolocationProvider: No API key found. Google API requests will fail."
        );
        logManager.dev.info(
          "Add GOOGLE_GEOLOCATION_API_KEY to your .env.local file"
        );
      }
      this.isConfigValid = false;
    } else {
      this.isConfigValid = true;
      if (typeof logManager !== "undefined") {
        logManager.dev.info(
          "✅ GoogleGeolocationProvider: API key configured successfully"
        );
      }
    }
  }

  /**
   * Gets current location using Google's Geolocation API
   * @param {Object} options - Location request options
   * @returns {Promise<Object>} Location data with accuracy metrics
   */
  async getCurrentLocation(options = {}) {
    const startTime = Date.now();

    try {
      if (typeof logManager !== "undefined") {
        logManager.location.tier3("Requesting location from Google API...");
      }

      // Check configuration
      if (!this.isConfigValid) {
        throw new Error("Google Geolocation API not properly configured");
      }

      // Check rate limiting and per-user quota
      const userId = options.userId || this.getCurrentUserId();
      const quotaCheck = this.checkPerUserQuotaAndRateLimit(userId);
      if (!quotaCheck.allowed) {
        if (typeof logManager !== "undefined") {
          logManager.location.warn(`⚠️ Request blocked for user ${userId || 'unknown'}: ${quotaCheck.reason}`);
        }
        throw new Error(`Request blocked: ${quotaCheck.reason}`);
      }

      // Enhanced cache check with confidence-based decisions
      const cachedLocation = this.getEnhancedCachedLocation(options);
      if (cachedLocation && options.allowCached !== false) {
        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            `💾 GoogleGeolocationProvider: Returning enhanced cached location (confidence: ${cachedLocation.confidence})`
          );
        }
        return this.formatLocationResponse(cachedLocation, { fromCache: true });
      }

      // Request deduplication check
      const fingerprint = this.generateRequestFingerprint(options);
      const existingRequest = this.checkRequestDeduplication(fingerprint);
      if (existingRequest) {
        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            "🔄 GoogleGeolocationProvider: Returning deduplicated request result"
          );
        }
        return existingRequest;
      }

      // Add to request queue for rate limiting
      return new Promise((resolve, reject) => {
        const requestInfo = { 
          resolve, 
          reject, 
          options, 
          startTime, 
          fingerprint,
          userId,  // Pass userId to the request queue
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        this.requestQueue.push(requestInfo);
        this.processRequestQueue();
      });
    } catch (error) {
      this.updateStats(startTime, false);
      if (typeof logManager !== "undefined") {
        logManager.location.fail(
          "❌ GoogleGeolocationProvider: Failed to get location",
          error
        );
      } else {
        console.error(
          "❌ GoogleGeolocationProvider: Failed to get location:",
          error
        );
      }
      throw error;
    }
  }

  /**
   * Process the request queue with enhanced rate limiting and deduplication
   */
  async processRequestQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const { resolve, reject, options, startTime, fingerprint, userId, id } = this.requestQueue.shift();

      try {
        // Check minimum interval between requests
        const timeSinceLastRequest =
          Date.now() - (this.requestStats.lastRequestTime || 0);
        if (timeSinceLastRequest < this.minRequestInterval) {
          const waitTime = this.minRequestInterval - timeSinceLastRequest;
          if (typeof logManager !== "undefined") {
            logManager.dev.info(
              `⏱ GoogleGeolocationProvider: Rate limiting - waiting ${waitTime}ms`
            );
          }
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        // Register this active request for deduplication
        const requestPromise = this.makeApiRequest(options, 0, userId);  // Pass userId to makeApiRequest
        this.activeRequests.set(fingerprint, requestPromise);

        const location = await requestPromise;
        
        // Update per-user usage tracking
        this.incrementPerUserUsage(userId);
        this.updateHourlyRequests();
        this.updateStats(startTime, true, location.accuracy);
        
        // Enhanced caching with confidence scoring
        this.cacheLocationEnhanced(location);
        
        const response = this.formatLocationResponse(location);
        
        // Clean up active request tracking
        this.activeRequests.delete(fingerprint);
        this.storeRequestFingerprint(fingerprint, response);
        
        resolve(response);
      } catch (error) {
        this.updateStats(startTime, false);
        this.activeRequests.delete(fingerprint);
        reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Makes the actual API request to Google with retry logic
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Raw location data from Google API
   */
  async makeApiRequest(options, retryCount = 0, userId = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      // Build request payload
      const requestPayload = {
        considerIp: true, // Use IP for initial estimate
        wifiAccessPoints: [], // Could be enhanced with WiFi scanning
        cellTowers: [], // Could be enhanced with cell tower data
      };

      if (typeof logManager !== "undefined") {
        logManager.location.tier3(
          `Making API request (attempt ${retryCount + 1}/${
            this.maxRetries + 1
          })`
        );
      }

      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.location) {
        throw new Error("No location data in Google API response");
      }

      if (typeof logManager !== "undefined") {
        logManager.location.success(
          "✅ GoogleGeolocationProvider: API request successful",
          {
            latitude: data.location.lat,
            longitude: data.location.lng,
            accuracy: data.accuracy,
            userQuotaUsage: `${(this.getUserQuota(userId).requests || 0) + 1}/${this.REQUEST_QUOTA}`,
            userId: userId || 'unknown'
          }
        );
      }

      return {
        latitude: data.location.lat,
        longitude: data.location.lng,
        accuracy: data.accuracy,
        timestamp: Date.now(),
        source: "google_api",
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Retry logic with exponential backoff
      if (retryCount < this.maxRetries && !controller.signal.aborted) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        if (typeof logManager !== "undefined") {
          logManager.location.warn(
            `⚠️ GoogleGeolocationProvider: Request failed, retrying in ${delay}ms (${
              retryCount + 1
            }/${this.maxRetries})`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.makeApiRequest(options, retryCount + 1, userId);
      }

      throw error;
    }
  }

  /**
   * Enhanced location caching with confidence-based replacement
   * @param {Object} location - Location data to cache
   */
  cacheLocationEnhanced(location) {
    const confidence = this.calculateConfidenceScore(location.accuracy);
    const cacheKey = "current_location";
    
    // Check if we should replace existing cache based on confidence
    const existingCached = this.locationCache.get(cacheKey);
    if (existingCached) {
      const existingConfidence = this.calculateConfidenceScore(existingCached.accuracy || Infinity);
      const confidenceScores = { 'excellent': 5, 'high': 4, 'medium': 3, 'low': 2, 'very_low': 1 };
      
      // Only replace if new location has better confidence or existing is old
      const existingAge = Date.now() - existingCached.cachedAt;
      const shouldReplace = confidenceScores[confidence] > confidenceScores[existingConfidence] || 
                           existingAge > (this.cacheExpiry * 0.5); // Replace if more than half cache expiry
      
      if (!shouldReplace) {
        if (typeof logManager !== "undefined") {
          logManager.dev.info(
            `💾 GoogleGeolocationProvider: Keeping existing cached location (${existingConfidence} vs ${confidence})`
          );
        }
        return;
      }
    }

    // Implement LRU cache with confidence prioritization
    if (this.locationCache.size >= this.maxCacheSize) {
      // Remove lowest confidence entries first
      let lowestConfidenceKey = null;
      let lowestConfidenceScore = Infinity;
      
      for (const [key, value] of this.locationCache.entries()) {
        const entryConfidence = this.calculateConfidenceScore(value.accuracy || Infinity);
        const confidenceValue = { 'excellent': 5, 'high': 4, 'medium': 3, 'low': 2, 'very_low': 1 }[entryConfidence] || 0;
        
        if (confidenceValue < lowestConfidenceScore) {
          lowestConfidenceScore = confidenceValue;
          lowestConfidenceKey = key;
        }
      }
      
      if (lowestConfidenceKey) {
        this.locationCache.delete(lowestConfidenceKey);
      } else {
        // Fallback to simple LRU
        const firstKey = this.locationCache.keys().next().value;
        this.locationCache.delete(firstKey);
      }
    }

    this.locationCache.set(cacheKey, {
      ...location,
      cachedAt: Date.now(),
      confidence
    });

    if (typeof logManager !== "undefined") {
      logManager.dev.info(
        `💾 GoogleGeolocationProvider: Enhanced location cached (confidence: ${confidence})`
      );
    }
  }

  /**
   * Legacy cache method for backward compatibility
   * @param {Object} location - Location data to cache
   */
  cacheLocation(location) {
    this.cacheLocationEnhanced(location);
  }

  /**
   * Get enhanced cached location with confidence-based expiry
   * @param {Object} options - Request options to determine cache strategy
   * @returns {Object|null} Cached location or null if expired/not found
   */
  getEnhancedCachedLocation(options = {}) {
    const cached = this.locationCache.get("current_location");
    if (!cached) return null;

    const age = Date.now() - cached.cachedAt;
    const confidence = cached.confidence || this.calculateConfidenceScore(cached.accuracy || Infinity);
    
    // Dynamic expiry based on confidence and options
    let effectiveExpiry = this.cacheExpiry;
    
    // High confidence locations can be cached longer
    if (confidence === 'excellent') {
      effectiveExpiry *= 2; // 1 hour for excellent locations
    } else if (confidence === 'high') {
      effectiveExpiry *= 1.5; // 45 minutes for high confidence
    } else if (confidence === 'very_low') {
      effectiveExpiry *= 0.5; // 15 minutes for low confidence
    }
    
    // If high accuracy is explicitly required, be more strict
    if (options.highAccuracy) {
      effectiveExpiry *= 0.3; // Much shorter cache for high accuracy requests
    }

    const isExpired = age > effectiveExpiry;
    if (isExpired) {
      this.locationCache.delete("current_location");
      if (typeof logManager !== "undefined") {
        logManager.dev.info(
          `🗑️ GoogleGeolocationProvider: Cache expired (age: ${Math.round(age/1000)}s, confidence: ${confidence})`
        );
      }
      return null;
    }

    return cached;
  }

  /**
   * Legacy cache getter for backward compatibility
   * @returns {Object|null} Cached location or null if expired/not found
   */
  getCachedLocation() {
    return this.getEnhancedCachedLocation();
  }

  /**
   * Format location response to match browser geolocation API format
   * @param {Object} location - Raw location data
   * @param {Object} meta - Metadata about the response
   * @returns {Object} Formatted location response
   */
  formatLocationResponse(location, meta = {}) {
    return {
      coords: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: location.timestamp || Date.now(),
      source: location.source || "google_api",
      provider: "google",
      fromCache: meta.fromCache || false,
      // Enhanced metadata for hybrid system
      confidence: this.calculateConfidenceScore(location.accuracy),
      quality: this.assessLocationQuality(location),
    };
  }

  /**
   * Calculate confidence score based on accuracy
   * @param {number} accuracy - Accuracy in meters
   * @returns {string} Confidence level
   */
  calculateConfidenceScore(accuracy) {
    if (accuracy <= 10) return "high";
    if (accuracy <= 50) return "medium";
    if (accuracy <= 100) return "low";
    return "very_low";
  }

  /**
   * Assess overall location quality
   * @param {Object} location - Location data
   * @returns {string} Quality assessment
   */
  assessLocationQuality(location) {
    const accuracy = location.accuracy || Infinity;
    const age = Date.now() - (location.timestamp || 0);

    if (accuracy <= 10 && age < 30000) return "excellent";
    if (accuracy <= 25 && age < 60000) return "good";
    if (accuracy <= 50 && age < 120000) return "fair";
    return "poor";
  }

  /**
   * Update performance statistics
   * @param {number} startTime - Request start time
   * @param {boolean} success - Whether request was successful
   * @param {number} accuracy - Location accuracy if successful
   */
  updateStats(startTime, success, accuracy = null) {
    const responseTime = Date.now() - startTime;

    this.requestStats.totalRequests++;
    this.requestStats.lastRequestTime = Date.now();

    if (success) {
      this.requestStats.successfulRequests++;
      if (accuracy) {
        this.requestStats.accuracyHistory.push(accuracy);
        // Keep only last 20 accuracy readings
        if (this.requestStats.accuracyHistory.length > 20) {
          this.requestStats.accuracyHistory.shift();
        }
      }
    } else {
      this.requestStats.failedRequests++;
    }

    // Update average response time
    const totalSuccessfulRequests = this.requestStats.successfulRequests;
    this.requestStats.averageResponseTime =
      (this.requestStats.averageResponseTime * (totalSuccessfulRequests - 1) +
        responseTime) /
      totalSuccessfulRequests;
  }

  /**
   * Get comprehensive service statistics for monitoring
   * @returns {Object} Performance and usage statistics
   */
  getStats() {
    const stats = { ...this.requestStats };

    if (stats.accuracyHistory.length > 0) {
      stats.averageAccuracy =
        stats.accuracyHistory.reduce((a, b) => a + b, 0) /
        stats.accuracyHistory.length;
      stats.bestAccuracy = Math.min(...stats.accuracyHistory);
      stats.worstAccuracy = Math.max(...stats.accuracyHistory);
    }

    stats.successRate =
      stats.totalRequests > 0
        ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2) +
          "%"
        : "0%";

    // Add enhanced statistics
    stats.usage = this.getUsageStats();
    stats.performance = {
      cacheHitRate: this.calculateCacheHitRate(),
      deduplicationSavings: this.calculateDeduplicationSavings(),
      averageResponseTime: Math.round(stats.averageResponseTime || 0)
    };

    return stats;
  }

  /**
   * Calculate cache hit rate
   * @returns {string} Cache hit rate percentage
   */
  calculateCacheHitRate() {
    const totalAttempts = this.requestStats.totalRequests + (this.cacheHits || 0);
    if (totalAttempts === 0) return "0%";
    
    const hitRate = ((this.cacheHits || 0) / totalAttempts * 100).toFixed(1);
    return `${hitRate}%`;
  }

  /**
   * Calculate deduplication savings
   * @returns {number} Number of requests saved through deduplication
   */
  calculateDeduplicationSavings() {
    return this.deduplicationSavings || 0;
  }

  /**
   * Check if the service is available and properly configured
   * @returns {boolean} Whether service is available
   */
  isAvailable() {
    return this.isConfigValid && navigator.onLine;
  }

  /**
   * Generate a fingerprint for request deduplication
   * @param {Object} options - Request options
   * @returns {string} Request fingerprint
   */
  generateRequestFingerprint(options = {}) {
    const relevantOptions = {
      highAccuracy: options.highAccuracy || false,
      timeout: options.timeout || this.requestTimeout,
      maximumAge: options.maximumAge || 0
    };
    
    return `google_geo_${JSON.stringify(relevantOptions)}`;
  }

  /**
   * Check for duplicate requests and return existing promise if found
   * @param {string} fingerprint - Request fingerprint
   * @returns {Promise|null} Existing request promise or null
   */
  checkRequestDeduplication(fingerprint) {
    // Check if there's an active request with the same fingerprint
    if (this.activeRequests.has(fingerprint)) {
      return this.activeRequests.get(fingerprint);
    }
    
    // Check recent request fingerprints
    const recentResult = this.requestFingerprints.get(fingerprint);
    if (recentResult && Date.now() - recentResult.timestamp < this.fingerprintExpiry) {
      return Promise.resolve(recentResult.result);
    }
    
    return null;
  }

  /**
   * Store request fingerprint for deduplication
   * @param {string} fingerprint - Request fingerprint
   * @param {Object} result - Request result
   */
  storeRequestFingerprint(fingerprint, result) {
    // Clean up old fingerprints to prevent memory leaks
    const now = Date.now();
    for (const [key, value] of this.requestFingerprints.entries()) {
      if (now - value.timestamp > this.fingerprintExpiry) {
        this.requestFingerprints.delete(key);
      }
    }
    
    this.requestFingerprints.set(fingerprint, {
      result: JSON.parse(JSON.stringify(result)), // Deep copy to prevent mutation
      timestamp: now
    });
  }

  /**
   * Check per-user quota and rate limiting
   * @param {string} userId - User ID
   * @returns {Object} Check result with allowed status and reason
   */
  checkPerUserQuotaAndRateLimit(userId) {
    if (!userId) {
      return {
        allowed: false,
        reason: "User ID required for quota check"
      };
    }

    // Check if currently blocked (global rate limiting still applies)
    if (this.rateLimiter.isBlocked && Date.now() < this.rateLimiter.blockedUntil) {
      const remainingTime = Math.ceil((this.rateLimiter.blockedUntil - Date.now()) / 1000);
      return {
        allowed: false,
        reason: `Rate limited - unblocked in ${remainingTime}s`
      };
    }
    
    // Clear block if time has passed
    if (this.rateLimiter.isBlocked && Date.now() >= this.rateLimiter.blockedUntil) {
      this.rateLimiter.isBlocked = false;
      this.rateLimiter.blockedUntil = null;
    }
    
    // Check per-user daily quota
    const userQuota = this.getUserQuota(userId);
    if (userQuota.requests >= this.REQUEST_QUOTA) {
      return {
        allowed: false,
        reason: `Daily quota exceeded for user (${userQuota.requests}/${this.REQUEST_QUOTA})`
      };
    }
    
    // Check hourly rate limit (still applies globally)
    const currentHour = new Date().getHours();
    const hourlyRequests = this.rateLimiter.hourlyRequests.get(currentHour) || 0;
    
    if (hourlyRequests >= this.rateLimiter.requestsPerHour) {
      this.rateLimiter.isBlocked = true;
      this.rateLimiter.blockedUntil = new Date(Date.now() + 60 * 60 * 1000).getTime(); // Block for 1 hour
      
      return {
        allowed: false,
        reason: `Hourly rate limit exceeded (${hourlyRequests}/${this.rateLimiter.requestsPerHour})`
      };
    }
    
    return { allowed: true };
  }

  /**
   * Load per-user quotas from localStorage
   */
  loadPerUserQuotas() {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('google_geo_per_user_quotas');
    
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.date === today) {
          // Convert stored object to Map
          this.perUserQuotas = new Map(Object.entries(data.quotas || {}));
          return;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    // Initialize or reset per-user quotas for new day
    this.perUserQuotas = new Map();
    this.savePerUserQuotas();
  }

  /**
   * Save per-user quotas to localStorage
   */
  savePerUserQuotas() {
    const data = {
      date: new Date().toDateString(),
      quotas: Object.fromEntries(this.perUserQuotas)
    };
    localStorage.setItem('google_geo_per_user_quotas', JSON.stringify(data));
  }

  /**
   * Increment per-user usage counter
   * @param {string} userId - User ID
   */
  incrementPerUserUsage(userId) {
    if (!userId) return;
    
    const userQuota = this.getUserQuota(userId);
    userQuota.requests++;
    userQuota.costs += 0.005; // Approximate cost per request
    userQuota.lastUsed = Date.now();
    
    this.perUserQuotas.set(userId, userQuota);
    this.savePerUserQuotas();
    
    if (typeof logManager !== "undefined") {
      logManager.dev.info(
        `📊 Google API usage for user ${userId}: ${userQuota.requests}/${this.REQUEST_QUOTA} requests today`
      );
    }
  }

  /**
   * Update hourly request tracking
   */
  updateHourlyRequests() {
    const currentHour = new Date().getHours();
    const current = this.rateLimiter.hourlyRequests.get(currentHour) || 0;
    this.rateLimiter.hourlyRequests.set(currentHour, current + 1);
    
    // Clean up old hours (keep only current and previous hour)
    const previousHour = currentHour === 0 ? 23 : currentHour - 1;
    for (const [hour] of this.rateLimiter.hourlyRequests.entries()) {
      if (hour !== currentHour && hour !== previousHour) {
        this.rateLimiter.hourlyRequests.delete(hour);
      }
    }
  }

  /**
   * Setup automatic quota reset at midnight
   */
  setupQuotaResetHandler() {
    const scheduleReset = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(this.quotaResetHour, 0, 0, 0);
      
      const timeUntilReset = tomorrow.getTime() - now.getTime();
      
      setTimeout(() => {
        const userCount = this.perUserQuotas.size;
        this.loadPerUserQuotas(); // This will reset usage for the new day
        if (typeof logManager !== "undefined") {
          logManager.dev.info(`🔄 Google API per-user quotas reset for ${userCount} users`);
        }
        scheduleReset(); // Schedule next reset
      }, timeUntilReset);
    };
    
    scheduleReset();
  }

  /**
   * Get usage statistics for monitoring
   * @param {string} userId - Optional user ID to get specific user stats
   * @returns {Object} Usage statistics
   */
  getUsageStats(userId = null) {
    const currentHour = new Date().getHours();
    const hourlyRequests = this.rateLimiter.hourlyRequests.get(currentHour) || 0;
    
    const stats = {
      hourly: hourlyRequests,
      quotas: {
        dailyLimitPerUser: this.REQUEST_QUOTA,
        hourlyLimit: this.rateLimiter.requestsPerHour
      },
      rateLimiter: {
        isBlocked: this.rateLimiter.isBlocked,
        blockedUntil: this.rateLimiter.blockedUntil
      },
      cache: {
        size: this.locationCache.size,
        maxSize: this.maxCacheSize,
        expiryMinutes: this.cacheExpiry / (60 * 1000)
      },
      deduplication: {
        activeRequests: this.activeRequests.size,
        fingerprints: this.requestFingerprints.size
      }
    };

    if (userId) {
      // Get specific user stats
      stats.user = {
        userId: userId,
        quota: this.getUserQuota(userId),
        canMakeRequest: this.checkPerUserQuotaAndRateLimit(userId).allowed
      };
    } else {
      // Get aggregate stats for all users
      const allUsers = Array.from(this.perUserQuotas.entries()).map(([uid, quota]) => ({
        userId: uid,
        requests: quota.requests,
        costs: quota.costs,
        lastUsed: quota.lastUsed
      }));
      
      stats.allUsers = {
        totalUsers: allUsers.length,
        totalRequests: allUsers.reduce((sum, user) => sum + user.requests, 0),
        totalCosts: allUsers.reduce((sum, user) => sum + user.costs, 0),
        users: allUsers
      };
    }
    
    return stats;
  }

  /**
   * Get current user ID from user store or options
   * @returns {string|null} User ID
   */
  getCurrentUserId() {
    try {
      // Try to get current user from user store
      if (typeof window !== 'undefined' && window.currentUser && window.currentUser.uid) {
        return window.currentUser.uid;
      }
      
      // Try to get from global currentUser (if imported)
      if (typeof currentUser !== 'undefined' && currentUser.uid) {
        return currentUser.uid;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user quota data, creating if it doesn't exist
   * @param {string} userId - User ID
   * @returns {Object} User quota data
   */
  getUserQuota(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    if (!this.perUserQuotas.has(userId)) {
      // Initialize quota for new user
      const newQuota = {
        requests: 0,
        costs: 0,
        lastUsed: null,
        createdAt: Date.now()
      };
      this.perUserQuotas.set(userId, newQuota);
      this.savePerUserQuotas();
      return newQuota;
    }
    
    return this.perUserQuotas.get(userId);
  }

  /**
   * Get quota status for a specific user
   * @param {string} userId - User ID
   * @returns {Object} Quota status with remaining requests and reset info
   */
  getUserQuotaStatus(userId) {
    if (!userId) {
      return {
        error: 'User ID is required',
        canMakeRequest: false
      };
    }
    
    const userQuota = this.getUserQuota(userId);
    const remainingRequests = Math.max(0, this.REQUEST_QUOTA - userQuota.requests);
    const nextResetTime = this.getNextQuotaResetTime();
    
    return {
      userId: userId,
      requestsUsed: userQuota.requests,
      requestsRemaining: remainingRequests,
      dailyLimit: this.REQUEST_QUOTA,
      canMakeRequest: remainingRequests > 0,
      costsToday: userQuota.costs,
      lastUsed: userQuota.lastUsed ? new Date(userQuota.lastUsed) : null,
      nextReset: nextResetTime,
      hoursUntilReset: Math.ceil((nextResetTime - Date.now()) / (1000 * 60 * 60))
    };
  }

  /**
   * Get next quota reset time (midnight)
   * @returns {number} Timestamp of next reset
   */
  getNextQuotaResetTime() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(this.quotaResetHour, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Test the Google Geolocation API connection
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    console.log("🧪 GoogleGeolocationProvider: Testing API connection...");

    try {
      const testLocation = await this.getCurrentLocation({
        allowCached: false,
        timeout: 5000,
      });

      console.log("✅ GoogleGeolocationProvider: Connection test successful");
      return {
        success: true,
        location: testLocation,
        responseTime: Date.now(),
        message: "Google Geolocation API is working correctly",
        usage: this.getUsageStats(),
        userId: options.userId || 'unknown'
      };
    } catch (error) {
      console.error(
        "❌ GoogleGeolocationProvider: Connection test failed:",
        error
      );
      return {
        success: false,
        error: error.message,
        message: "Failed to connect to Google Geolocation API",
        usage: this.getUsageStats(),
        userId: options.userId || 'unknown'
      };
    }
  }
}

// Create singleton instance
export const googleGeolocationProvider = new GoogleGeolocationProvider();

// Debug commands for testing (only in development)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.googleGeoDebug = {
    getStats: (userId = null) => googleGeolocationProvider.getStats(),
    getUsageStats: (userId = null) => googleGeolocationProvider.getUsageStats(userId),
    getUserQuotaStatus: (userId = null) => {
      const uid = userId || googleGeolocationProvider.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return null;
      }
      return googleGeolocationProvider.getUserQuotaStatus(uid);
    },
    getAllUserQuotas: () => {
      const stats = googleGeolocationProvider.getUsageStats();
      return stats.allUsers || { totalUsers: 0, users: [] };
    },
    clearCache: () => {
      googleGeolocationProvider.locationCache.clear();
      console.log('🗑️ Google Geolocation cache cleared');
    },
    resetUserQuota: (userId = null) => {
      const uid = userId || googleGeolocationProvider.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return;
      }
      googleGeolocationProvider.perUserQuotas.set(uid, {
        requests: 0,
        costs: 0,
        lastUsed: null,
        createdAt: Date.now()
      });
      googleGeolocationProvider.savePerUserQuotas();
      console.log(`🔄 Quota reset for user: ${uid}`);
    },
    resetAllQuotas: () => {
      googleGeolocationProvider.perUserQuotas.clear();
      googleGeolocationProvider.savePerUserQuotas();
      console.log('🔄 All user quotas reset manually');
    },
    testConnection: (userId = null) => {
      const uid = userId || googleGeolocationProvider.getCurrentUserId();
      return googleGeolocationProvider.testConnection({ userId: uid });
    },
    simulateQuotaExceeded: (userId = null) => {
      const uid = userId || googleGeolocationProvider.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return;
      }
      googleGeolocationProvider.perUserQuotas.set(uid, {
        requests: googleGeolocationProvider.REQUEST_QUOTA,
        costs: googleGeolocationProvider.REQUEST_QUOTA * 0.005,
        lastUsed: Date.now(),
        createdAt: Date.now()
      });
      googleGeolocationProvider.savePerUserQuotas();
      console.log(`🙅 Simulated quota exceeded for user: ${uid}`);
    },
    help: () => {
      console.log(`
🔧 Google Geolocation Debug Commands (Per-User Quota System):
- googleGeoDebug.getStats(userId?) - Get performance stats
- googleGeoDebug.getUsageStats(userId?) - Get usage/quota stats for specific user or all users
- googleGeoDebug.getUserQuotaStatus(userId?) - Get quota status for specific user
- googleGeoDebug.getAllUserQuotas() - Get quotas for all users
- googleGeoDebug.clearCache() - Clear location cache
- googleGeoDebug.resetUserQuota(userId?) - Reset quota for specific user
- googleGeoDebug.resetAllQuotas() - Reset quotas for all users
- googleGeoDebug.testConnection(userId?) - Test API connection for user
- googleGeoDebug.simulateQuotaExceeded(userId?) - Simulate quota exceeded for testing

💡 Note: If userId is not provided, current user will be used when available.
`);
    }
  };
}
