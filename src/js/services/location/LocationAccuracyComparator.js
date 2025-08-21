/**
 * LocationAccuracyComparator.js
 * 
 * Intelligent location accuracy comparison and selection system.
 * Compares location data from multiple sources (browser API, Google API, cached data)
 * and determines the most accurate and reliable option for campus presence detection.
 * 
 * Features:
 * - Multi-factor accuracy assessment (accuracy, age, source reliability)
 * - Campus proximity boost for boundary detection optimization
 * - Historical performance tracking per provider
 * - Smart fallback logic and confidence scoring
 * - Battery-optimized selection preferences
 * - Detailed logging for debugging and optimization
 * 
 * Phase 1.2 - Hybrid GPS System Implementation
 */

export class LocationAccuracyComparator {
  constructor() {
    // Provider reliability history
    this.providerStats = {
      browser: {
        successRate: 0.85, // Default assumption
        averageAccuracy: 25, // Default accuracy in meters
        averageResponseTime: 2000, // Default response time in ms
        recentFailures: 0,
        totalRequests: 0,
        successfulRequests: 0,
        lastSuccess: null
      },
      google: {
        successRate: 0.95, // Default assumption for Google API
        averageAccuracy: 15, // Google typically more accurate
        averageResponseTime: 3000, // Slightly slower due to network
        recentFailures: 0,
        totalRequests: 0,
        successfulRequests: 0,
        lastSuccess: null
      }
    };
    
    // Campus configuration for proximity bonuses
    this.campusConfig = null;
    this.campusBoundaryBuffer = 100; // 100m buffer around campus for proximity detection
    
    // Scoring weights for different factors
    this.scoringWeights = {
      accuracy: 0.4,        // 40% - Primary factor
      age: 0.2,            // 20% - How recent the data is
      reliability: 0.2,     // 20% - Provider historical performance
      proximity: 0.1,      // 10% - Bonus for campus proximity
      battery: 0.1         // 10% - Battery optimization factor
    };
    
    // Age penalties (older data is less valuable)
    this.agePenalties = {
      excellent: 0,      // 0-30 seconds
      good: 0.1,        // 30-60 seconds
      fair: 0.3,        // 1-5 minutes
      poor: 0.6,        // 5+ minutes
      stale: 0.9        // 15+ minutes
    };
    
    console.log('🎯 LocationAccuracyComparator initialized', {
      scoringWeights: this.scoringWeights,
      trackingProviders: Object.keys(this.providerStats)
    });
  }

  /**
   * Set campus configuration for proximity bonuses
   * @param {Object} campusConfig - Campus boundary configuration
   */
  setCampusConfig(campusConfig) {
    this.campusConfig = campusConfig;
    console.log('🏫 LocationAccuracyComparator: Campus config set', {
      campus: campusConfig?.name || 'unknown',
      hasBoundary: !!campusConfig?.boundary
    });
  }

  /**
   * Compare multiple location sources and select the best one
   * @param {Object[]} locations - Array of location objects from different sources
   * @param {Object} options - Comparison options
   * @returns {Object} Best location with selection details
   */
  selectBestLocation(locations, options = {}) {
    if (!locations || locations.length === 0) {
      throw new Error('No locations provided for comparison');
    }
    
    console.log(`🔍 LocationAccuracyComparator: Comparing ${locations.length} location sources...`);
    
    // Score each location
    const scoredLocations = locations.map(location => {
      const score = this.calculateLocationScore(location, options);
      return {
        ...location,
        comparisonScore: score.totalScore,
        scoreBreakdown: score.breakdown,
        selectionReason: score.reason
      };
    });
    
    // Sort by score (highest first)
    scoredLocations.sort((a, b) => b.comparisonScore - a.comparisonScore);
    
    const bestLocation = scoredLocations[0];
    const alternatives = scoredLocations.slice(1);
    
    // Log the selection decision
    this.logSelectionDecision(bestLocation, alternatives);
    
    // Update provider statistics
    this.updateProviderStats(bestLocation.source || bestLocation.provider, true);
    
    return {
      selectedLocation: bestLocation,
      alternatives: alternatives,
      selectionMetadata: {
        comparedSources: locations.length,
        winningScore: bestLocation.comparisonScore,
        scoreDifference: alternatives.length > 0 ? 
          bestLocation.comparisonScore - alternatives[0].comparisonScore : 0,
        selectionTime: Date.now()
      }
    };
  }

  /**
   * Calculate comprehensive score for a location
   * @param {Object} location - Location data
   * @param {Object} options - Scoring options
   * @returns {Object} Score breakdown and total
   */
  calculateLocationScore(location, options = {}) {
    const breakdown = {};
    const reason = [];
    
    // 1. Accuracy Score (lower accuracy value = higher score)
    const accuracyScore = this.calculateAccuracyScore(location);
    breakdown.accuracy = accuracyScore;
    
    // 2. Age Score (newer data = higher score)
    const ageScore = this.calculateAgeScore(location);
    breakdown.age = ageScore;
    
    // 3. Provider Reliability Score
    const reliabilityScore = this.calculateReliabilityScore(location);
    breakdown.reliability = reliabilityScore;
    
    // 4. Campus Proximity Bonus
    const proximityScore = this.calculateProximityBonus(location);
    breakdown.proximity = proximityScore;
    
    // 5. Battery Optimization Score
    const batteryScore = this.calculateBatteryScore(location, options);
    breakdown.battery = batteryScore;
    
    // Calculate weighted total score
    const totalScore = 
      (breakdown.accuracy * this.scoringWeights.accuracy) +
      (breakdown.age * this.scoringWeights.age) +
      (breakdown.reliability * this.scoringWeights.reliability) +
      (breakdown.proximity * this.scoringWeights.proximity) +
      (breakdown.battery * this.scoringWeights.battery);
    
    // Generate selection reason
    if (breakdown.accuracy > 0.8) reason.push('excellent accuracy');
    if (breakdown.age > 0.8) reason.push('very recent data');
    if (breakdown.reliability > 0.8) reason.push('reliable provider');
    if (breakdown.proximity > 0) reason.push('campus proximity bonus');
    
    return {
      totalScore: Math.round(totalScore * 1000) / 1000, // Round to 3 decimal places
      breakdown: breakdown,
      reason: reason.length > 0 ? reason.join(', ') : 'best available option'
    };
  }

  /**
   * Calculate accuracy-based score
   * @param {Object} location - Location data
   * @returns {number} Accuracy score (0-1)
   */
  calculateAccuracyScore(location) {
    const accuracy = location.coords?.accuracy || location.accuracy || Infinity;
    
    // Convert accuracy to score (excellent accuracy gets higher score)
    if (accuracy <= 5) return 1.0;      // GPS quality
    if (accuracy <= 10) return 0.9;     // Excellent
    if (accuracy <= 25) return 0.8;     // Very good
    if (accuracy <= 50) return 0.6;     // Good
    if (accuracy <= 100) return 0.4;    // Fair
    if (accuracy <= 500) return 0.2;    // Poor
    return 0.1; // Very poor
  }

  /**
   * Calculate age-based score (how recent the data is)
   * @param {Object} location - Location data
   * @returns {number} Age score (0-1)
   */
  calculateAgeScore(location) {
    const locationTime = location.timestamp || Date.now();
    const age = Date.now() - locationTime;
    
    if (age <= 30000) return 1.0;        // 0-30 seconds: Excellent
    if (age <= 60000) return 0.9;        // 30-60 seconds: Very good
    if (age <= 300000) return 0.7;       // 1-5 minutes: Good
    if (age <= 900000) return 0.4;       // 5-15 minutes: Fair
    return 0.1; // 15+ minutes: Poor
  }

  /**
   * Calculate provider reliability score based on historical performance
   * @param {Object} location - Location data
   * @returns {number} Reliability score (0-1)
   */
  calculateReliabilityScore(location) {
    const provider = location.source || location.provider || 'unknown';
    const stats = this.providerStats[provider];
    
    if (!stats) return 0.5; // Neutral score for unknown providers
    
    // Factor in success rate and recent performance
    const baseReliability = stats.successRate;
    const recentFailurePenalty = Math.min(stats.recentFailures * 0.1, 0.3);
    
    return Math.max(baseReliability - recentFailurePenalty, 0);
  }

  /**
   * Calculate campus proximity bonus
   * @param {Object} location - Location data
   * @returns {number} Proximity bonus (0-1)
   */
  calculateProximityBonus(location) {
    if (!this.campusConfig || !this.campusConfig.boundary) {
      return 0; // No campus config available
    }
    
    const lat = location.coords?.latitude || location.latitude;
    const lng = location.coords?.longitude || location.longitude;
    
    if (!lat || !lng) return 0;
    
    // Check if location is near campus boundaries
    const isNearCampus = this.isLocationNearCampus({ latitude: lat, longitude: lng });
    
    return isNearCampus ? 1.0 : 0;
  }

  /**
   * Calculate battery optimization score
   * @param {Object} location - Location data
   * @param {Object} options - Options including battery preferences
   * @returns {number} Battery score (0-1)
   */
  calculateBatteryScore(location, options) {
    const provider = location.source || location.provider;
    
    // Browser API is generally more battery friendly
    if (provider === 'browser' || provider === 'geolocation') return 0.8;
    
    // Google API uses network, slightly less battery friendly but more accurate
    if (provider === 'google' || provider === 'google_api') return 0.6;
    
    // Cached data is most battery friendly
    if (location.fromCache) return 1.0;
    
    return 0.5; // Default score
  }

  /**
   * Check if location is near campus boundaries
   * @param {Object} location - Location coordinates
   * @returns {boolean} Whether location is near campus
   */
  isLocationNearCampus(location) {
    if (!this.campusConfig?.center) return false;
    
    const campusCenter = this.campusConfig.center;
    const distance = this.calculateDistance(
      location.latitude, location.longitude,
      campusCenter.lat, campusCenter.lng
    );
    
    // Consider "near campus" if within buffer distance
    return distance <= this.campusBoundaryBuffer;
  }

  /**
   * Calculate distance between two points using Haversine formula
   * @param {number} lat1 - First point latitude
   * @param {number} lng1 - First point longitude  
   * @param {number} lat2 - Second point latitude
   * @param {number} lng2 - Second point longitude
   * @returns {number} Distance in meters
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * Update provider statistics based on performance
   * @param {string} provider - Provider name
   * @param {boolean} success - Whether request was successful
   * @param {number} accuracy - Location accuracy if successful
   * @param {number} responseTime - Response time in ms
   */
  updateProviderStats(provider, success, accuracy = null, responseTime = null) {
    if (!this.providerStats[provider]) {
      this.providerStats[provider] = {
        successRate: 0.5,
        averageAccuracy: 50,
        averageResponseTime: 5000,
        recentFailures: 0,
        totalRequests: 0,
        successfulRequests: 0,
        lastSuccess: null
      };
    }
    
    const stats = this.providerStats[provider];
    stats.totalRequests++;
    
    if (success) {
      stats.successfulRequests++;
      stats.lastSuccess = Date.now();
      stats.recentFailures = Math.max(0, stats.recentFailures - 1);
      
      // Update success rate
      stats.successRate = stats.successfulRequests / stats.totalRequests;
      
      // Update average accuracy if provided
      if (accuracy !== null) {
        stats.averageAccuracy = 
          (stats.averageAccuracy * (stats.successfulRequests - 1) + accuracy) / stats.successfulRequests;
      }
      
      // Update average response time if provided
      if (responseTime !== null) {
        stats.averageResponseTime = 
          (stats.averageResponseTime * (stats.successfulRequests - 1) + responseTime) / stats.successfulRequests;
      }
      
    } else {
      stats.recentFailures = Math.min(stats.recentFailures + 1, 5); // Cap at 5
      stats.successRate = stats.successfulRequests / stats.totalRequests;
    }
    
    console.log(`📊 LocationAccuracyComparator: Updated stats for ${provider}`, {
      successRate: (stats.successRate * 100).toFixed(1) + '%',
      avgAccuracy: Math.round(stats.averageAccuracy) + 'm',
      recentFailures: stats.recentFailures
    });
  }

  /**
   * Log the location selection decision with detailed reasoning
   * @param {Object} selected - Selected location
   * @param {Object[]} alternatives - Alternative locations
   */
  logSelectionDecision(selected, alternatives) {
    const provider = selected.source || selected.provider || 'unknown';
    const accuracy = selected.coords?.accuracy || selected.accuracy || 'unknown';
    const score = selected.comparisonScore;
    
    console.log(`🎯 LocationAccuracyComparator: Selected ${provider.toUpperCase()} API`, {
      accuracy: typeof accuracy === 'number' ? `±${Math.round(accuracy)}m` : accuracy,
      score: score,
      reason: selected.selectionReason,
      alternatives: alternatives.length
    });
    
    // Show comparison details if multiple options
    if (alternatives.length > 0) {
      console.log('📊 LocationAccuracyComparator: Comparison details:');
      
      // Log selected option
      console.log(`   🥇 SELECTED: ${provider} (±${Math.round(accuracy)}m, score: ${score}) - ${selected.selectionReason}`);
      
      // Log alternatives
      alternatives.slice(0, 2).forEach((alt, index) => {
        const altProvider = alt.source || alt.provider || 'unknown';
        const altAccuracy = alt.coords?.accuracy || alt.accuracy || 'unknown';
        const emoji = index === 0 ? '🥈' : '🥉';
        console.log(`   ${emoji} ${altProvider} (±${Math.round(altAccuracy)}m, score: ${alt.comparisonScore}) - ${alt.selectionReason}`);
      });
    }
  }

  /**
   * Get current provider statistics for monitoring
   * @returns {Object} Provider statistics
   */
  getProviderStats() {
    return JSON.parse(JSON.stringify(this.providerStats));
  }

  /**
   * Reset provider statistics (useful for testing)
   */
  resetStats() {
    Object.keys(this.providerStats).forEach(provider => {
      this.providerStats[provider] = {
        successRate: 0.5,
        averageAccuracy: 50,
        averageResponseTime: 5000,
        recentFailures: 0,
        totalRequests: 0,
        successfulRequests: 0,
        lastSuccess: null
      };
    });
    
    console.log('🔄 LocationAccuracyComparator: Provider statistics reset');
  }

  /**
   * Configure scoring weights for different factors
   * @param {Object} weights - New weight configuration
   */
  configureWeights(weights) {
    this.scoringWeights = { ...this.scoringWeights, ...weights };
    
    // Ensure weights sum to 1.0
    const totalWeight = Object.values(this.scoringWeights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn('⚠️ LocationAccuracyComparator: Scoring weights do not sum to 1.0:', totalWeight);
    }
    
    console.log('⚙️ LocationAccuracyComparator: Scoring weights updated', this.scoringWeights);
  }
}

// Create singleton instance
export const locationAccuracyComparator = new LocationAccuracyComparator();