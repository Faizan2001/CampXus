/**
 * LocationIntegration.js
 *
 * Integration layer for location orchestration debug helpers
 * 
 * This file provides backward-compatible interfaces while leveraging
 * the new cost optimization and API call reduction features.
 */

import { campusLocationService } from './CampusLocationService.js';

/**
 * Enhanced location integration with comprehensive monitoring
 */
export class LocationIntegration {
  constructor() {
    this.integrationStats = {
      totalRequests: 0,
      orchestratorUsage: 0,
      fallbackUsage: 0,
      errorRate: 0,
      averageResponseTime: 0
    };

    this.monitoringEnabled = true;
    this.lastStatsReset = Date.now();

    if (typeof logManager !== "undefined") {
      logManager.dev.info("🔗 LocationIntegration initialized", {
        orchestratorEnabled: true,
        monitoringEnabled: this.monitoringEnabled
      });
    }
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
   * Enhanced location request with automatic optimization
   * @param {Object} options - Location request options
   * @param {string} context - Context for debugging (e.g., "campus_detection", "user_request")
   * @returns {Promise<Object>} Location result
   */
  async getOptimizedLocation(options = {}, context = "unknown") {
    const startTime = Date.now();
    this.integrationStats.totalRequests++;
    
    // Ensure user ID is available for quota tracking
    const userId = options.userId || this.getCurrentUserId();
    if (!userId) {
      if (typeof logManager !== "undefined") {
        logManager.location.warn("⚠️ LocationIntegration: No user ID available for quota tracking", { context });
      }
    }

    try {
      if (typeof logManager !== "undefined") {
        logManager.location.info("🎯 LocationIntegration: Processing optimized location request", {
          context,
          userId: userId || 'unknown',
          options: this.sanitizeOptionsForLogging(options),
          orchestratorEnabled: true
        });
      }

      // Use the LocationOrchestrator for intelligent tier management
      const result = await locationOrchestrator.getLocation({
        ...options,
        userId: userId,
        context: context
      });

      if (result && !result.error) {
        this.integrationStats.orchestratorUsage++;
        
        // Optional: track integration usage only

        if (typeof logManager !== "undefined") {
          logManager.location.success("✅ LocationIntegration: Optimized location obtained", {
            tier: result.tier,
            source: result.source,
            confidence: result.confidence,
            responseTime: `${Date.now() - startTime}ms`,
            fromCache: result.fromCache || false,
            context,
            userId: userId || 'unknown'
          });
        }

        // Transform result to maintain backward compatibility
        return this.transformResultForCompatibility(result, context);
      } else {
        throw new Error(result?.error || "Location orchestration failed");
      }

    } catch (error) {
      // Fallback to browser geolocation directly
      if (typeof logManager !== "undefined") {
        logManager.location.warn("⚠️ LocationIntegration: Falling back to browser geolocation", {
          error: error.message,
          context
        });
      }

      try {
        const fallbackResult = await campusLocationService.getBrowserLocationWithTimeout(
          !!options.highAccuracy,
          options.timeout || 10000
        );
        this.integrationStats.fallbackUsage++;

        if (typeof logManager !== "undefined") {
          logManager.location.success("✅ LocationIntegration: Fallback successful", {
            source: "browser_fallback",
            responseTime: `${Date.now() - startTime}ms`,
            context,
            userId: userId || 'unknown'
          });
        }

        return this.transformResultForCompatibility(fallbackResult, context);
      } catch (fallbackError) {
        this.updateErrorStats(startTime);
        
        if (typeof logManager !== "undefined") {
          logManager.location.fail("❌ LocationIntegration: All location methods failed", {
            originalError: error.message,
            fallbackError: fallbackError.message,
            context,
            responseTime: `${Date.now() - startTime}ms`
          });
        }

        throw new Error(`Location integration failed: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Get enhanced location for campus detection with optimizations
   * @param {string} university - University identifier
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Campus-optimized location result
   */
  async getCampusOptimizedLocation(university, options = {}) {
    const userId = options.userId || this.getCurrentUserId();
    return await this.getOptimizedLocation({
      ...options,
      userId: userId,
      highAccuracy: false, // Campus detection doesn't need GPS precision
      maximumAge: 5 * 60 * 1000, // 5 minutes acceptable for campus detection
      context: `campus_detection_${university}`
    }, `campus_detection_${university}`);
  }

  /**
   * Get high-accuracy location for user-initiated requests
   * @param {Object} options - Location options
   * @returns {Promise<Object>} High-accuracy location result
   */
  async getHighAccuracyLocation(options = {}) {
    const userId = options.userId || this.getCurrentUserId();
    return await this.getOptimizedLocation({
      ...options,
      userId: userId,
      highAccuracy: true,
      maximumAge: 30 * 1000 // 30 seconds max age for high accuracy
    }, "user_high_accuracy_request");
  }

  /**
   * Transform orchestrator result for backward compatibility
   * @param {Object} result - Orchestrator result
   * @param {string} context - Request context
   * @returns {Object} Compatible result
   */
  transformResultForCompatibility(result, context) {
    // Ensure compatibility with existing code expectations
    return {
      coords: result.coords || {
        latitude: result.latitude || 0,
        longitude: result.longitude || 0,
        accuracy: result.accuracy || 999999,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: result.timestamp || Date.now(),
      
      // Enhanced metadata
      source: result.source || result.provider || "unknown",
      tier: result.tier || 0,
      confidence: result.confidence || "unknown",
      fromCache: result.fromCache || false,
      
      // Context information
      integrationContext: context,
      optimized: true,
      
      // Original result for debugging
      _originalResult: result
    };
  }

  /**
   * Update error statistics
   * @param {number} startTime - Request start time
   */
  updateErrorStats(startTime) {
    const responseTime = Date.now() - startTime;
    this.integrationStats.errorRate = 
      (this.integrationStats.errorRate * (this.integrationStats.totalRequests - 1) + 1) 
      / this.integrationStats.totalRequests;

    this.updateAverageResponseTime(responseTime);
  }

  /**
   * Update average response time
   * @param {number} responseTime - Response time in milliseconds
   */
  updateAverageResponseTime(responseTime) {
    this.integrationStats.averageResponseTime = 
      ((this.integrationStats.averageResponseTime * (this.integrationStats.totalRequests - 1)) + responseTime) 
      / this.integrationStats.totalRequests;
  }

  /**
   * Sanitize options for logging (remove sensitive data)
   * @param {Object} options - Options to sanitize
   * @returns {Object} Sanitized options
   */
  sanitizeOptionsForLogging(options) {
    const sanitized = { ...options };
    
    // Remove potentially sensitive or large objects
    delete sanitized.onSuccess;
    delete sanitized.onError;
    delete sanitized.callback;
    
    // Truncate large strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 100) {
        sanitized[key] = sanitized[key].substring(0, 100) + '...';
      }
    });
    
    return sanitized;
  }

  /**
   * Get comprehensive integration statistics
   * @param {string} userId - Optional user ID to get specific user stats
   * @returns {Object} Integration statistics
   */
  getIntegrationStats(userId = null) {
    const currentUserId = userId || this.getCurrentUserId();
    const orchestratorStats = locationOrchestrator.getStats(currentUserId);

    const stats = {
      integration: {
        ...this.integrationStats,
        uptime: Date.now() - this.lastStatsReset,
        successRate: this.integrationStats.totalRequests > 0 ? 
                     ((1 - this.integrationStats.errorRate) * 100).toFixed(1) + '%' : '100%',
        currentUserId: currentUserId || 'unknown'
      },
      orchestrator: orchestratorStats,
      summary: {
        preferredTierUsage: {
          tier1: orchestratorStats.performance?.tier1Success || 0,
          tier2: orchestratorStats.performance?.tier2Success || 0,
          tier3: orchestratorStats.performance?.tier3Success || 0
        },
        optimizationEffectiveness: this.calculateOptimizationEffectiveness()
      }
    };

    // Add per-user quota information if available
    if (currentUserId) {
      stats.userQuota = { orchestratorQuota: orchestratorStats.user || null };
    }

    return stats;
  }

  /**
   * Calculate optimization effectiveness score
   * @returns {string} Effectiveness percentage
   */
  calculateOptimizationEffectiveness() {
    const stats = this.integrationStats;
    if (stats.totalRequests === 0) return '100%';
    
    const effectiveness = (stats.orchestratorUsage / Math.max(1, stats.totalRequests)) * 100;
    
    return Math.max(0, Math.min(100, effectiveness)).toFixed(1) + '%';
  }

  /**
   * Reset statistics for testing or monitoring
   */
  resetStats() {
    this.integrationStats = {
      totalRequests: 0,
      orchestratorUsage: 0,
      fallbackUsage: 0,
      errorRate: 0,
      averageResponseTime: 0
    };
    
    this.lastStatsReset = Date.now();
    
    if (typeof logManager !== "undefined") {
      logManager.dev.info("🔄 LocationIntegration: Statistics reset");
    }
  }

  /**
   * Enable/disable monitoring
   * @param {boolean} enabled - Whether to enable monitoring
   */
  setMonitoring(enabled) {
    this.monitoringEnabled = enabled;
    
    if (typeof logManager !== "undefined") {
      logManager.dev.info(`🔧 LocationIntegration: Monitoring ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Test all location methods
   * @param {string} userId - Optional user ID for testing
   * @returns {Promise<Object>} Test results
   */
  async runIntegrationTest(userId = null) {
    const testUserId = userId || this.getCurrentUserId();
    const testResults = {
      timestamp: new Date().toISOString(),
      userId: testUserId || 'unknown',
      tests: {},
      summary: { passed: 0, failed: 0, total: 0 }
    };

    const tests = [
      { name: 'orchestrator_basic', fn: () => this.getOptimizedLocation({ userId: testUserId }, 'integration_test') },
      { name: 'campus_optimized', fn: () => this.getCampusOptimizedLocation('test_university', { userId: testUserId }) },
      { name: 'high_accuracy', fn: () => this.getHighAccuracyLocation({ timeout: 5000, userId: testUserId }) },
    ];

    for (const test of tests) {
      const testStart = Date.now();
      try {
        const result = await test.fn();
        testResults.tests[test.name] = {
          status: 'passed',
          responseTime: Date.now() - testStart,
          result: {
            source: result.source,
            tier: result.tier,
            confidence: result.confidence,
            hasCoords: !!(result.coords?.latitude)
          }
        };
        testResults.summary.passed++;
      } catch (error) {
        testResults.tests[test.name] = {
          status: 'failed',
          responseTime: Date.now() - testStart,
          error: error.message
        };
        testResults.summary.failed++;
      }
      testResults.summary.total++;
    }

    if (typeof logManager !== "undefined") {
      logManager.dev.info("🧪 LocationIntegration: Test completed", {
        passed: testResults.summary.passed,
        failed: testResults.summary.failed,
        total: testResults.summary.total,
        userId: testUserId || 'unknown'
      });
    }

    return testResults;
  }
}

// Create singleton instance
export const locationIntegration = new LocationIntegration();

// Debug commands for development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.locationIntegrationDebug = {
    getStats: (userId = null) => locationIntegration.getIntegrationStats(userId),
    getUserStats: (userId = null) => {
      const uid = userId || locationIntegration.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return null;
      }
      return locationIntegration.getIntegrationStats(uid);
    },
    runTest: (userId = null) => locationIntegration.runIntegrationTest(userId),
    resetStats: () => locationIntegration.resetStats(),
    testCampusLocation: (university = 'iub', userId = null) => {
      const uid = userId || locationIntegration.getCurrentUserId();
      return locationIntegration.getCampusOptimizedLocation(university, { userId: uid });
    },
    testHighAccuracy: (userId = null) => {
      const uid = userId || locationIntegration.getCurrentUserId();
      return locationIntegration.getHighAccuracyLocation({ userId: uid });
    },
    getUserQuotaStatus: (userId = null) => {
      const uid = userId || locationIntegration.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return null;
      }
      return {
        orchestrator: locationOrchestrator.getStats(uid).user || null
      };
    },
    help: () => {
      console.log(`
🔗 LocationIntegration Debug Commands:
- locationIntegrationDebug.getStats(userId?) - Get integration stats
- locationIntegrationDebug.getUserStats(userId?) - Stats for specific user
- locationIntegrationDebug.runTest(userId?) - Run integration test suite
- locationIntegrationDebug.resetStats() - Reset statistics
- locationIntegrationDebug.testCampusLocation('university', userId?) - Test campus detection
- locationIntegrationDebug.testHighAccuracy(userId?) - Test high accuracy location

💡 Note: If userId is not provided, current user will be used when available.
      `);
    }
  };
}

// Global integration commands (available in development)
if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1') || window.location.port)) {
  window.locationSystemDebug = {
    getFullStats: (userId = null) => {
      const uid = userId || locationIntegration.getCurrentUserId();
      try {
        return {
          integration: locationIntegration ? locationIntegration.getIntegrationStats(uid) : { error: 'LocationIntegration not available' },
          orchestrator: typeof locationOrchestrator !== 'undefined' ? locationOrchestrator.getStats(uid) : { error: 'LocationOrchestrator not available' },
          userId: uid || 'unknown'
        };
      } catch (error) {
        return { error: `Failed to get stats: ${error.message}` };
      }
    },
    getUserFullStats: (userId = null) => {
      const uid = userId || locationIntegration.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return null;
      }
      return window.locationSystemDebug.getFullStats(uid);
    },
    getAllUsersStats: () => ({
      integration: locationIntegration.getIntegrationStats(),
      orchestrator: locationOrchestrator.getStats()
    }),
    testAllSystems: async (userId = null) => {
      try {
        if (!locationIntegration) {
          console.error('❌ LocationIntegration not available');
          return { error: 'LocationIntegration not available' };
        }
        const uid = userId || locationIntegration.getCurrentUserId();
      console.log(`🧪 Testing all location systems for user: ${uid || 'unknown'}...`);
      
        const results = {
          userId: uid || 'unknown',
          integration: await locationIntegration.runIntegrationTest(uid),
        orchestratorStats: locationOrchestrator.getStats(uid)
        };
      
      console.log("📊 Complete system test results:", results);
      return results;
      } catch (error) {
        console.error('❌ Error testing location systems:', error.message);
        return { error: `Test failed: ${error.message}` };
      }
    },
    getQuotaStatusForUser: (userId = null) => {
      const uid = userId || locationIntegration.getCurrentUserId();
      if (!uid) {
        console.log('⚠️ No user ID provided and no current user found');
        return null;
      }
      
      const quotaStatus = {
        userId: uid,
        orchestrator: locationOrchestrator.getStats(uid).user || null
      };
      
      console.log(`📊 Quota status for user ${uid}:`, quotaStatus);
      return quotaStatus;
    },
    help: () => {
      console.log(`
🌍 MeetchuThere Location System Debug Commands:

📊 Statistics & Monitoring:
- locationSystemDebug.getFullStats(userId?) - Complete system statistics
- locationSystemDebug.getUserFullStats(userId?) - Stats for specific user
- locationSystemDebug.getAllUsersStats() - Aggregate stats for all users
- locationSystemDebug.estimateCostSavings(userId?) - View cost optimization results
- locationSystemDebug.getQuotaStatusForUser(userId?) - User quota status across all systems

🧪 Testing:
- locationSystemDebug.testAllSystems(userId?) - Comprehensive system test

📍 Individual Component Testing:
- locationOrchestratorDebug.* - Orchestrator commands (per-user quota)
- locationIntegrationDebug.* - Integration commands (per-user quota)

💡 Quick Start:
  locationSystemDebug.testAllSystems() // Test for current user
  locationSystemDebug.getQuotaStatusForUser() // Check current user's quota

 
      `);
    }
  };
  
  // Location system debug helpers available via window.locationSystemDebug
}
