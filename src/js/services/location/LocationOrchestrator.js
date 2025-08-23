/**
 * LocationOrchestrator.js
 *
 * Centralized orchestrator for CampXus 3-tier location system with enhanced
 * API call reduction and intelligent tier cascading control.
 *
 * Tier 1: Campus IP Ranges
 * Tier 2: Browser GPS
 * Tier 3: Google Geolocation API (heavily optimized)
 *
 * Key Features:
 * - Request deduplication across all tiers
 * - Intelligent tier selection based on confidence scores
 * - Cost optimization with quota management
 * - Comprehensive caching and throttling
 * - Performance monitoring and analytics
 */

export class LocationOrchestrator {
  constructor() {
    // Tier system configuration
    this.tierConfig = {
      maxTier1Attempts: 2,
      maxTier2Attempts: 3,
      maxTier3Attempts: 1, // Minimized Google API usage
      tier3MinInterval: 30000, // 30 seconds between Google API calls
      preferredTierTimeout: 8000, // 8 seconds max wait per tier
    };

    // Request orchestration
    this.activeRequests = new Map();
    this.requestHistory = new Map();
    this.tierPerformanceStats = {
      tier1: { success: 0, failures: 0, avgResponseTime: 0 },
      tier2: { success: 0, failures: 0, avgResponseTime: 0 },
      tier3: { success: 0, failures: 0, avgResponseTime: 0 },
    };

    // Intelligent caching across all tiers
    this.orchestratorCache = new Map();
    this.cacheConfig = {
      maxSize: 100,
      defaultTTL: 10 * 60 * 1000, // 10 minutes
      highConfidenceTTL: 30 * 60 * 1000, // 30 minutes for high confidence results
      lowConfidenceTTL: 2 * 60 * 1000, // 2 minutes for low confidence
    };

    // Cost and quota management (now per-user with reduced limits)
    this.quotaManager = {
      maxDailyGoogleCallsPerUser: 5, // Reduced from 50 to 5 per user
      lastQuotaReset: new Date().toDateString(),
      perUserTracking: new Map(), // Track per-user usage
    };

    // Load existing quota data
    this.loadPerUserQuotaData();

    // Performance monitoring
    this.performanceMetrics = {
      totalRequests: 0,
      cacheHits: 0,
      tier1Success: 0,
      tier2Success: 0,
      tier3Success: 0,
      averageResolutionTime: 0,
      costSavings: 0, // Estimated cost savings from optimizations
    };

    if (typeof logManager !== "undefined") {
      logManager.dev.info("🎯 LocationOrchestrator initialized", {
        maxDailyGoogleCallsPerUser: this.quotaManager.maxDailyGoogleCallsPerUser,
        cacheEnabled: true,
        tierOptimization: true
      });
    }
  }

  /**
   * Main orchestration method - intelligently routes through tiers
   * @param {Object} options - Location request options
   * @returns {Promise<Object>} Location result with tier information
   */
  async getLocation(options = {}) {
    const requestId = this.generateRequestId(options);
    const startTime = Date.now();

    try {
      // Check for active duplicate requests
      if (this.activeRequests.has(requestId)) {
        if (typeof logManager !== "undefined") {
          logManager.dev.info("🔄 LocationOrchestrator: Returning active request");
        }
        return await this.activeRequests.get(requestId);
      }

      // Check orchestrator cache first
      const cachedResult = this.getCachedResult(requestId, options);
      if (cachedResult) {
        this.performanceMetrics.cacheHits++;
        if (typeof logManager !== "undefined") {
          logManager.dev.info("💾 LocationOrchestrator: Cache hit", {
            tier: cachedResult.tier,
            confidence: cachedResult.confidence,
            age: Math.round((Date.now() - cachedResult.timestamp) / 1000) + "s"
          });
        }
        return cachedResult;
      }

      // Create request promise and track it
      const requestPromise = this.performTieredLocation(options, startTime);
      this.activeRequests.set(requestId, requestPromise);

      try {
        const result = await requestPromise;
        
        // Cache successful results
        if (result && !result.error) {
          this.cacheResult(requestId, result, options);
        }

        // Update performance metrics
        this.updatePerformanceMetrics(result, startTime);

        return result;
      } finally {
        this.activeRequests.delete(requestId);
      }

    } catch (error) {
      this.activeRequests.delete(requestId);
      
      if (typeof logManager !== "undefined") {
        logManager.location.fail("❌ LocationOrchestrator: Failed to get location", error);
      }

      return {
        error: error.message,
        tier: 'failed',
        confidence: 0,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Perform intelligent tiered location detection
   * @param {Object} options - Request options
   * @param {number} startTime - Request start time
   * @returns {Promise<Object>} Location result
   */
  async performTieredLocation(options, startTime) {
    const results = [];
    let bestResult = null;
    let currentTier = 1;

    // Tier 1: Campus IP Detection (Fast, Free)
    try {
      if (typeof logManager !== "undefined") {
        logManager.location.tier1("🌐 Tier 1: Checking campus IP ranges...");
      }
      
      const tier1Result = await this.executeTier1Detection(options);
      if (tier1Result && this.isHighConfidenceResult(tier1Result)) {
        tier1Result.tier = 1;
        tier1Result.source = 'campus_ip';
        this.tierPerformanceStats.tier1.success++;
        
        if (typeof logManager !== "undefined") {
          logManager.location.success("✅ Tier 1 success - high confidence IP detection");
        }
        
        return tier1Result;
      }
      
      if (tier1Result) {
        results.push({ ...tier1Result, tier: 1 });
      }
    } catch (error) {
      this.tierPerformanceStats.tier1.failures++;
      if (typeof logManager !== "undefined") {
        logManager.location.warn("⚠️ Tier 1 failed:", error.message);
      }
    }

    // Tier 2: Browser GPS (Accurate, Free, but slower)
    try {
      if (typeof logManager !== "undefined") {
        logManager.location.tier2("📍 Tier 2: Browser GPS detection...");
      }

      const tier2Result = await this.executeTier2Detection(options);
      if (tier2Result && this.isHighConfidenceResult(tier2Result)) {
        tier2Result.tier = 2;
        tier2Result.source = 'browser_gps';
        this.tierPerformanceStats.tier2.success++;
        
        if (typeof logManager !== "undefined") {
          logManager.location.success("✅ Tier 2 success - high confidence GPS");
        }
        
        return tier2Result;
      }
      
      if (tier2Result) {
        results.push({ ...tier2Result, tier: 2 });
      }
    } catch (error) {
      this.tierPerformanceStats.tier2.failures++;
      if (typeof logManager !== "undefined") {
        logManager.location.warn("⚠️ Tier 2 failed:", error.message);
      }
    }

    // Tier 3: Google API (Most accurate, but costs money - use sparingly)
    if (this.shouldUseGoogleAPI(options)) {
      try {
        if (typeof logManager !== "undefined") {
          logManager.location.tier3("🔍 Tier 3: Google Geolocation API (quota-managed)...");
        }

        const tier3Result = await this.executeTier3Detection(options);
        if (tier3Result && !tier3Result.error) {
          tier3Result.tier = 3;
          tier3Result.source = 'google_api';
          this.tierPerformanceStats.tier3.success++;
          
          // Update per-user tracking
          const userId = options.userId || this.getCurrentUserId();
          if (userId) {
            const userTracking = this.getUserTracking(userId);
            userTracking.dailyCalls++;
            userTracking.estimatedCostToday += 0.005; // ~$0.005 per call
            userTracking.lastTier3Call = Date.now();
            this.savePerUserQuotaData();
          }
          
          if (typeof logManager !== "undefined") {
            logManager.location.success("✅ Tier 3 success - Google API", {
              userId: userId || 'unknown',
              userDailyUsage: userId ? `${this.getUserTracking(userId).dailyCalls}/${this.quotaManager.maxDailyGoogleCallsPerUser}` : 'N/A',
              estimatedCostForUser: userId ? `$${this.getUserTracking(userId).estimatedCostToday.toFixed(3)}` : 'N/A'
            });
          }
          
          return tier3Result;
        }
        
        if (tier3Result) {
          results.push({ ...tier3Result, tier: 3 });
        }
      } catch (error) {
        this.tierPerformanceStats.tier3.failures++;
        if (typeof logManager !== "undefined") {
          logManager.location.warn("⚠️ Tier 3 failed:", error.message);
        }
      }
    } else {
      if (typeof logManager !== "undefined") {
        const userId = options.userId || this.getCurrentUserId();
        logManager.location.warn("🚫 Tier 3 skipped - quota/conditions not met", {
          userId: userId || 'unknown',
          userDailyUsage: userId ? `${this.getUserTracking(userId).dailyCalls}/${this.quotaManager.maxDailyGoogleCallsPerUser}` : 'N/A',
          reason: this.getGoogleAPIBlockReason(userId)
        });
      }
    }

    // Select best available result
    bestResult = this.selectBestResult(results);
    
    if (!bestResult) {
      throw new Error("All location tiers failed");
    }

    if (typeof logManager !== "undefined") {
      logManager.location.info("🎯 LocationOrchestrator: Best result selected", {
        tier: bestResult.tier,
        source: bestResult.source,
        confidence: bestResult.confidence || 'unknown'
      });
    }

    return bestResult;
  }

  /**
   * Get current user ID from various sources
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
   * Get user tracking data, creating if it doesn't exist
   * @param {string} userId - User ID
   * @returns {Object} User tracking data
   */
  getUserTracking(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    if (!this.quotaManager.perUserTracking.has(userId)) {
      // Initialize tracking for new user
      const newTracking = {
        dailyCalls: 0,
        estimatedCostToday: 0,
        lastTier3Call: null,
        createdAt: Date.now()
      };
      this.quotaManager.perUserTracking.set(userId, newTracking);
      this.savePerUserQuotaData();
      return newTracking;
    }
    
    return this.quotaManager.perUserTracking.get(userId);
  }

  /**
   * Execute Tier 1: Campus IP Range Detection
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Tier 1 result
   */
  async executeTier1Detection(options) {
    // This would integrate with existing IP detection logic
    // For now, return a placeholder that indicates IP detection was attempted
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          onCampus: false,
          confidence: 0.3,
          method: 'ip_detection',
          timestamp: Date.now()
        });
      }, 100);
    });
  }

  /**
   * Execute Tier 2: Browser GPS Detection
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Tier 2 result
   */
  async executeTier2Detection(options) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Browser geolocation not available"));
        return;
      }

      const gpsOptions = {
        enableHighAccuracy: options.highAccuracy || false,
        timeout: this.tierConfig.preferredTierTimeout,
        maximumAge: options.maximumAge || 60000 // 1 minute max age
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            },
            timestamp: position.timestamp,
            confidence: this.calculateGPSConfidence(position.coords.accuracy),
            method: 'browser_gps'
          });
        },
        (error) => {
          reject(new Error(`GPS error: ${error.message}`));
        },
        gpsOptions
      );
    });
  }

  /**
   * Execute Tier 3: Google Geolocation API
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Tier 3 result
   */
  async executeTier3Detection(options) {
    // Use the enhanced GoogleGeolocationProvider
    if (typeof googleGeolocationProvider !== "undefined") {
      return await googleGeolocationProvider.getCurrentLocation(options);
    } else {
      throw new Error("Google Geolocation Provider not available");
    }
  }

  /**
   * Determine if Google API should be used based on conditions
   * @param {Object} options - Request options
   * @returns {boolean} Whether to use Google API
   */
  shouldUseGoogleAPI(options) {
    const userId = options.userId || this.getCurrentUserId();
    
    if (!userId) {
      if (typeof logManager !== "undefined") {
        logManager.location.warn("⚠️ No user ID available for Google API quota check");
      }
      return false;
    }

    // Check per-user daily quota
    const userTracking = this.getUserTracking(userId);
    if (userTracking.dailyCalls >= this.quotaManager.maxDailyGoogleCallsPerUser) {
      return false;
    }

    // Check if explicitly requested
    if (options.forceGoogleAPI) {
      return true;
    }

    // Check if high accuracy is required and other tiers failed
    if (options.highAccuracy) {
      return true;
    }

    // Check time-based throttling per user
    const lastTier3Call = userTracking.lastTier3Call;
    if (lastTier3Call && (Date.now() - lastTier3Call) < this.tierConfig.tier3MinInterval) {
      return false;
    }

    // Default: allow but prefer other tiers
    return true;
  }

  /**
   * Get reason why Google API is blocked
   * @param {string} userId - User ID
   * @returns {string} Block reason
   */
  getGoogleAPIBlockReason(userId = null) {
    if (!userId) {
      userId = this.getCurrentUserId();
    }
    
    if (!userId) {
      return "No user ID available";
    }
    
    const userTracking = this.getUserTracking(userId);
    
    if (userTracking.dailyCalls >= this.quotaManager.maxDailyGoogleCallsPerUser) {
      return `Daily quota exceeded for user (${userTracking.dailyCalls}/${this.quotaManager.maxDailyGoogleCallsPerUser})`;
    }
    
    const lastTier3Call = userTracking.lastTier3Call;
    if (lastTier3Call && (Date.now() - lastTier3Call) < this.tierConfig.tier3MinInterval) {
      const waitTime = Math.ceil((this.tierConfig.tier3MinInterval - (Date.now() - lastTier3Call)) / 1000);
      return `Rate limited for user (${waitTime}s remaining)`;
    }
    
    return "Conditions not met";
  }

  /**
   * Check if result has high confidence
   * @param {Object} result - Location result
   * @returns {boolean} Whether result has high confidence
   */
  isHighConfidenceResult(result) {
    if (result.confidence && typeof result.confidence === 'string') {
      return ['excellent', 'high'].includes(result.confidence);
    }
    
    if (result.confidence && typeof result.confidence === 'number') {
      return result.confidence > 0.7;
    }
    
    if (result.coords && result.coords.accuracy) {
      return result.coords.accuracy <= 50; // 50 meters or better
    }
    
    return false;
  }

  /**
   * Calculate GPS confidence based on accuracy
   * @param {number} accuracy - GPS accuracy in meters
   * @returns {number} Confidence score (0-1)
   */
  calculateGPSConfidence(accuracy) {
    if (accuracy <= 10) return 0.95;
    if (accuracy <= 25) return 0.85;
    if (accuracy <= 50) return 0.70;
    if (accuracy <= 100) return 0.50;
    return 0.30;
  }

  /**
   * Select the best result from multiple tier results
   * @param {Array} results - Array of tier results
   * @returns {Object} Best result
   */
  selectBestResult(results) {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];

    // Sort by confidence and tier preference
    return results.sort((a, b) => {
      const aConfidence = this.getResultConfidenceScore(a);
      const bConfidence = this.getResultConfidenceScore(b);
      
      // Higher confidence wins
      if (aConfidence !== bConfidence) {
        return bConfidence - aConfidence;
      }
      
      // For equal confidence, prefer lower tier (cheaper/faster)
      return a.tier - b.tier;
    })[0];
  }

  /**
   * Get numeric confidence score for result comparison
   * @param {Object} result - Location result
   * @returns {number} Confidence score
   */
  getResultConfidenceScore(result) {
    if (typeof result.confidence === 'number') {
      return result.confidence;
    }
    
    const confidenceMap = {
      'excellent': 0.95,
      'high': 0.85,
      'medium': 0.70,
      'low': 0.50,
      'very_low': 0.30
    };
    
    return confidenceMap[result.confidence] || 0.30;
  }

  /**
   * Generate unique request ID for deduplication
   * @param {Object} options - Request options
   * @returns {string} Request ID
   */
  generateRequestId(options) {
    const relevantOptions = {
      highAccuracy: options.highAccuracy || false,
      maximumAge: options.maximumAge || 60000
    };
    return `orchestrator_${JSON.stringify(relevantOptions)}_${Math.floor(Date.now() / 30000)}`; // 30s buckets
  }

  /**
   * Get cached result if valid
   * @param {string} requestId - Request ID
   * @param {Object} options - Request options
   * @returns {Object|null} Cached result or null
   */
  getCachedResult(requestId, options) {
    const cached = this.orchestratorCache.get(requestId);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    let ttl = this.cacheConfig.defaultTTL;

    // Adjust TTL based on result confidence
    if (this.isHighConfidenceResult(cached)) {
      ttl = this.cacheConfig.highConfidenceTTL;
    } else if (cached.confidence < 0.5) {
      ttl = this.cacheConfig.lowConfidenceTTL;
    }

    // Check if expired
    if (age > ttl) {
      this.orchestratorCache.delete(requestId);
      return null;
    }

    return { ...cached, fromCache: true, cacheAge: age };
  }

  /**
   * Cache location result
   * @param {string} requestId - Request ID
   * @param {Object} result - Location result
   * @param {Object} options - Request options
   */
  cacheResult(requestId, result, options) {
    // Clean cache if too large
    if (this.orchestratorCache.size >= this.cacheConfig.maxSize) {
      const entries = Array.from(this.orchestratorCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20%
      const removeCount = Math.floor(entries.length * 0.2);
      for (let i = 0; i < removeCount; i++) {
        this.orchestratorCache.delete(entries[i][0]);
      }
    }

    this.orchestratorCache.set(requestId, {
      ...result,
      cachedAt: Date.now()
    });
  }

  /**
   * Load per-user quota data from localStorage
   */
  loadPerUserQuotaData() {
    try {
      const stored = localStorage.getItem('location_orchestrator_per_user_quota');
      if (stored) {
        const data = JSON.parse(stored);
        const today = new Date().toDateString();
        
        if (data.date === today && data.perUserTracking) {
          // Convert stored object to Map
          this.quotaManager.perUserTracking = new Map(Object.entries(data.perUserTracking));
          this.quotaManager.lastQuotaReset = data.date;
        }
      }
    } catch (error) {
      // Ignore storage errors
    }
  }

  /**
   * Save per-user quota data to localStorage
   */
  savePerUserQuotaData() {
    try {
      const data = {
        date: new Date().toDateString(),
        maxDailyGoogleCallsPerUser: this.quotaManager.maxDailyGoogleCallsPerUser,
        perUserTracking: Object.fromEntries(this.quotaManager.perUserTracking)
      };
      localStorage.setItem('location_orchestrator_per_user_quota', JSON.stringify(data));
    } catch (error) {
      // Ignore storage errors
    }
  }

  /**
   * Get timestamp of last Tier 3 call
   * @returns {number|null} Timestamp or null
   */
  getLastTier3CallTime() {
    // This would be tracked more comprehensively in a full implementation
    return localStorage.getItem('last_tier3_call') ? 
           parseInt(localStorage.getItem('last_tier3_call')) : null;
  }

  /**
   * Update performance metrics
   * @param {Object} result - Location result
   * @param {number} startTime - Request start time
   */
  updatePerformanceMetrics(result, startTime) {
    this.performanceMetrics.totalRequests++;
    
    const responseTime = Date.now() - startTime;
    this.performanceMetrics.averageResolutionTime = 
      ((this.performanceMetrics.averageResolutionTime * (this.performanceMetrics.totalRequests - 1)) + responseTime) 
      / this.performanceMetrics.totalRequests;

    if (result.tier === 1) this.performanceMetrics.tier1Success++;
    else if (result.tier === 2) this.performanceMetrics.tier2Success++;
    else if (result.tier === 3) this.performanceMetrics.tier3Success++;

    // Calculate cost savings from not using Google API
    if (result.tier < 3) {
      this.performanceMetrics.costSavings += 0.005; // $0.005 saved per non-Google result
    }
  }

  /**
   * Get comprehensive orchestrator statistics
   * @param {string} userId - Optional user ID to get specific user stats
   * @returns {Object} Statistics object
   */
  getStats(userId = null) {
    const stats = {
      performance: this.performanceMetrics,
      tierStats: this.tierPerformanceStats,
      quota: {
        maxDailyGoogleCallsPerUser: this.quotaManager.maxDailyGoogleCallsPerUser,
        costSavings: this.performanceMetrics.costSavings
      },
      cache: {
        size: this.orchestratorCache.size,
        hitRate: this.performanceMetrics.totalRequests > 0 ? 
                 (this.performanceMetrics.cacheHits / this.performanceMetrics.totalRequests * 100).toFixed(1) + '%' 
                 : '0%'
      }
    };

    if (userId) {
      // Get specific user stats
      const userTracking = this.getUserTracking(userId);
      stats.user = {
        userId: userId,
        dailyCalls: userTracking.dailyCalls,
        remainingQuota: Math.max(0, this.quotaManager.maxDailyGoogleCallsPerUser - userTracking.dailyCalls),
        estimatedCostToday: userTracking.estimatedCostToday,
        lastTier3Call: userTracking.lastTier3Call ? new Date(userTracking.lastTier3Call) : null,
        canUseGoogleAPI: this.shouldUseGoogleAPI({ userId: userId })
      };
    } else {
      // Get aggregate stats for all users
      const allUsers = Array.from(this.quotaManager.perUserTracking.entries()).map(([uid, tracking]) => ({
        userId: uid,
        dailyCalls: tracking.dailyCalls,
        estimatedCostToday: tracking.estimatedCostToday,
        lastTier3Call: tracking.lastTier3Call ? new Date(tracking.lastTier3Call) : null
      }));
      
      stats.allUsers = {
        totalUsers: allUsers.length,
        totalCalls: allUsers.reduce((sum, user) => sum + user.dailyCalls, 0),
        totalCosts: allUsers.reduce((sum, user) => sum + user.estimatedCostToday, 0),
        users: allUsers
      };
    }

    return stats;
  }
}

// Create singleton instance
export const locationOrchestrator = new LocationOrchestrator();

// Debug commands for development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.locationOrchestratorDebug = {
    getStats: (userId = null) => locationOrchestrator.getStats(userId),
    getUserStats: (userId = null) => {
      const uid = userId || locationOrchestrator.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return null;
      }
      return locationOrchestrator.getStats(uid);
    },
    getAllUserStats: () => locationOrchestrator.getStats(),
    clearCache: () => {
      locationOrchestrator.orchestratorCache.clear();
      console.log('🗑️ LocationOrchestrator cache cleared');
    },
    resetUserQuota: (userId = null) => {
      const uid = userId || locationOrchestrator.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return;
      }
      locationOrchestrator.quotaManager.perUserTracking.set(uid, {
        dailyCalls: 0,
        estimatedCostToday: 0,
        lastTier3Call: null,
        createdAt: Date.now()
      });
      locationOrchestrator.savePerUserQuotaData();
      console.log(`🔄 Quota reset for user: ${uid}`);
    },
    resetAllQuotas: () => {
      locationOrchestrator.quotaManager.perUserTracking.clear();
      locationOrchestrator.savePerUserQuotaData();
      console.log('🔄 All user quotas reset');
    },
    testTier: async (tier, userId = null) => {
      const uid = userId || locationOrchestrator.getCurrentUserId();
      console.log(`🧪 Testing Tier ${tier} for user ${uid || 'unknown'}...`);
      try {
        const options = { userId: uid };
        if (tier === 1) return await locationOrchestrator.executeTier1Detection(options);
        if (tier === 2) return await locationOrchestrator.executeTier2Detection(options);
        if (tier === 3) return await locationOrchestrator.executeTier3Detection(options);
      } catch (error) {
        console.error(`❌ Tier ${tier} test failed:`, error);
        return { error: error.message };
      }
    },
    simulateQuotaExceeded: (userId = null) => {
      const uid = userId || locationOrchestrator.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return;
      }
      locationOrchestrator.quotaManager.perUserTracking.set(uid, {
        dailyCalls: locationOrchestrator.quotaManager.maxDailyGoogleCallsPerUser,
        estimatedCostToday: locationOrchestrator.quotaManager.maxDailyGoogleCallsPerUser * 0.005,
        lastTier3Call: Date.now(),
        createdAt: Date.now()
      });
      locationOrchestrator.savePerUserQuotaData();
      console.log(`🚫 Simulated quota exceeded for user: ${uid}`);
    },
    help: () => {
      console.log(`
🎯 LocationOrchestrator Debug Commands (Per-User Quota System):
- locationOrchestratorDebug.getStats(userId?) - Get comprehensive stats for user or all users
- locationOrchestratorDebug.getUserStats(userId?) - Get stats for specific user
- locationOrchestratorDebug.getAllUserStats() - Get aggregate stats for all users
- locationOrchestratorDebug.clearCache() - Clear orchestrator cache  
- locationOrchestratorDebug.resetUserQuota(userId?) - Reset quota for specific user
- locationOrchestratorDebug.resetAllQuotas() - Reset quotas for all users
- locationOrchestratorDebug.testTier(1|2|3, userId?) - Test individual tier for user
- locationOrchestratorDebug.simulateQuotaExceeded(userId?) - Simulate quota exceeded for testing

💡 Note: If userId is not provided, current user will be used when available.
      `);
    }
  };
}