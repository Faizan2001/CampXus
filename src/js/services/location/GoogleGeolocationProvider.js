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
    this.apiEndpoint = 'https://www.googleapis.com/geolocation/v1/geolocate';
    
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
      accuracyHistory: []
    };
    
    // Caching for efficiency (5 minute cache)
    this.locationCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = 10;
    
    // Rate limiting to prevent API abuse
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.minRequestInterval = 2000; // Minimum 2 seconds between requests
    
    // Validation
    this.validateConfiguration();
    
    console.log('📍 GoogleGeolocationProvider initialized', {
      hasApiKey: !!this.apiKey,
      endpoint: this.apiEndpoint,
      cacheEnabled: true,
      rateLimitEnabled: true
    });
  }

  /**
   * Validates that the service is properly configured
   */
  validateConfiguration() {
    if (!this.apiKey || this.apiKey.trim() === '') {
      console.warn('⚠️ GoogleGeolocationProvider: No API key found. Google API requests will fail.');
      console.warn('   Add GOOGLE_GEOLOCATION_API_KEY to your .env.local file');
      this.isConfigValid = false;
    } else {
      this.isConfigValid = true;
      console.log('✅ GoogleGeolocationProvider: API key configured successfully');
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
      console.log('📍 GoogleGeolocationProvider: Requesting location from Google API...');
      
      // Check configuration
      if (!this.isConfigValid) {
        throw new Error('Google Geolocation API not properly configured');
      }
      
      // Check cache first
      const cachedLocation = this.getCachedLocation();
      if (cachedLocation && options.allowCached !== false) {
        console.log('💾 GoogleGeolocationProvider: Returning cached location');
        return this.formatLocationResponse(cachedLocation, { fromCache: true });
      }
      
      // Add to request queue for rate limiting
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ resolve, reject, options, startTime });
        this.processRequestQueue();
      });
      
    } catch (error) {
      this.updateStats(startTime, false);
      console.error('❌ GoogleGeolocationProvider: Failed to get location:', error);
      throw error;
    }
  }

  /**
   * Process the request queue with rate limiting
   */
  async processRequestQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const { resolve, reject, options, startTime } = this.requestQueue.shift();
      
      try {
        // Check minimum interval between requests
        const timeSinceLastRequest = Date.now() - (this.requestStats.lastRequestTime || 0);
        if (timeSinceLastRequest < this.minRequestInterval) {
          const waitTime = this.minRequestInterval - timeSinceLastRequest;
          console.log(`⏱️ GoogleGeolocationProvider: Rate limiting - waiting ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        const location = await this.makeApiRequest(options);
        this.updateStats(startTime, true, location.accuracy);
        this.cacheLocation(location);
        resolve(this.formatLocationResponse(location));
        
      } catch (error) {
        this.updateStats(startTime, false);
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
  async makeApiRequest(options, retryCount = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    
    try {
      // Build request payload
      const requestPayload = {
        considerIp: true, // Use IP for initial estimate
        wifiAccessPoints: [], // Could be enhanced with WiFi scanning
        cellTowers: [] // Could be enhanced with cell tower data
      };
      
      console.log(`📡 GoogleGeolocationProvider: Making API request (attempt ${retryCount + 1}/${this.maxRetries + 1})`);
      
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.location) {
        throw new Error('No location data in Google API response');
      }
      
      console.log('✅ GoogleGeolocationProvider: API request successful', {
        latitude: data.location.lat,
        longitude: data.location.lng,
        accuracy: data.accuracy
      });
      
      return {
        latitude: data.location.lat,
        longitude: data.location.lng,
        accuracy: data.accuracy,
        timestamp: Date.now(),
        source: 'google_api'
      };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Retry logic with exponential backoff
      if (retryCount < this.maxRetries && !controller.signal.aborted) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        console.warn(`⚠️ GoogleGeolocationProvider: Request failed, retrying in ${delay}ms (${retryCount + 1}/${this.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeApiRequest(options, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Cache location data for efficiency
   * @param {Object} location - Location data to cache
   */
  cacheLocation(location) {
    // Implement simple LRU cache
    if (this.locationCache.size >= this.maxCacheSize) {
      const firstKey = this.locationCache.keys().next().value;
      this.locationCache.delete(firstKey);
    }
    
    const cacheKey = 'current_location';
    this.locationCache.set(cacheKey, {
      ...location,
      cachedAt: Date.now()
    });
    
    console.log('💾 GoogleGeolocationProvider: Location cached successfully');
  }

  /**
   * Get cached location if still valid
   * @returns {Object|null} Cached location or null if expired/not found
   */
  getCachedLocation() {
    const cached = this.locationCache.get('current_location');
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.cachedAt > this.cacheExpiry;
    if (isExpired) {
      this.locationCache.delete('current_location');
      return null;
    }
    
    return cached;
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
        speed: null
      },
      timestamp: location.timestamp || Date.now(),
      source: location.source || 'google_api',
      provider: 'google',
      fromCache: meta.fromCache || false,
      // Enhanced metadata for hybrid system
      confidence: this.calculateConfidenceScore(location.accuracy),
      quality: this.assessLocationQuality(location)
    };
  }

  /**
   * Calculate confidence score based on accuracy
   * @param {number} accuracy - Accuracy in meters
   * @returns {string} Confidence level
   */
  calculateConfidenceScore(accuracy) {
    if (accuracy <= 10) return 'high';
    if (accuracy <= 50) return 'medium';
    if (accuracy <= 100) return 'low';
    return 'very_low';
  }

  /**
   * Assess overall location quality
   * @param {Object} location - Location data
   * @returns {string} Quality assessment
   */
  assessLocationQuality(location) {
    const accuracy = location.accuracy || Infinity;
    const age = Date.now() - (location.timestamp || 0);
    
    if (accuracy <= 10 && age < 30000) return 'excellent';
    if (accuracy <= 25 && age < 60000) return 'good';
    if (accuracy <= 50 && age < 120000) return 'fair';
    return 'poor';
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
      (this.requestStats.averageResponseTime * (totalSuccessfulRequests - 1) + responseTime) / totalSuccessfulRequests;
  }

  /**
   * Get service statistics for monitoring
   * @returns {Object} Performance statistics
   */
  getStats() {
    const stats = { ...this.requestStats };
    
    if (stats.accuracyHistory.length > 0) {
      stats.averageAccuracy = stats.accuracyHistory.reduce((a, b) => a + b, 0) / stats.accuracyHistory.length;
      stats.bestAccuracy = Math.min(...stats.accuracyHistory);
      stats.worstAccuracy = Math.max(...stats.accuracyHistory);
    }
    
    stats.successRate = stats.totalRequests > 0 ? 
      (stats.successfulRequests / stats.totalRequests * 100).toFixed(2) + '%' : '0%';
    
    return stats;
  }

  /**
   * Check if the service is available and properly configured
   * @returns {boolean} Whether service is available
   */
  isAvailable() {
    return this.isConfigValid && navigator.onLine;
  }

  /**
   * Test the Google Geolocation API connection
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    console.log('🧪 GoogleGeolocationProvider: Testing API connection...');
    
    try {
      const testLocation = await this.getCurrentLocation({ 
        allowCached: false,
        timeout: 5000 
      });
      
      console.log('✅ GoogleGeolocationProvider: Connection test successful');
      return {
        success: true,
        location: testLocation,
        responseTime: Date.now(),
        message: 'Google Geolocation API is working correctly'
      };
      
    } catch (error) {
      console.error('❌ GoogleGeolocationProvider: Connection test failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to Google Geolocation API'
      };
    }
  }
}

// Create singleton instance
export const googleGeolocationProvider = new GoogleGeolocationProvider();