/**
 * HybridLocationService.js
 * 
 * Enterprise-grade location service that intelligently combines browser geolocation API
 * and Google Geolocation API to provide the most accurate location data possible.
 * 
 * Features:
 * - Automatic provider selection based on accuracy and reliability
 * - Smart fallback system (Browser API → Google API → Cached data)
 * - Real-time accuracy comparison with detailed logging
 * - Battery-optimized request management
 * - Campus proximity detection for enhanced precision
 * - Performance monitoring and adaptive provider preferences
 * - Circuit breaker protection against API failures
 * 
 * Phase 1.2 - Hybrid GPS System Implementation
 */

import { googleGeolocationProvider } from './GoogleGeolocationProvider.js';
import { locationAccuracyComparator } from './LocationAccuracyComparator.js';

export class HybridLocationService {
  constructor() {
    // Provider management
    this.availableProviders = ['browser', 'google'];
    this.preferredProvider = 'auto'; // 'browser', 'google', or 'auto'
    this.fallbackEnabled = true;
    
    // Request management
    this.simultaneousRequests = true; // Request from both APIs simultaneously
    this.requestTimeout = 10000; // 10 second timeout per provider
    this.maxRetries = 2;
    
    // Performance tracking
    this.performanceStats = {
      totalRequests: 0,
      browserSuccessful: 0,
      googleSuccessful: 0,
      hybridSelections: 0,
      averageResponseTime: 0,
      lastRequestTime: null
    };
    
    // Circuit breaker for failing providers
    this.circuitBreaker = {
      browser: { failures: 0, lastFailure: null, isOpen: false },
      google: { failures: 0, lastFailure: null, isOpen: false }
    };
    this.maxFailuresBeforeBreak = 3;
    this.circuitBreakerResetTime = 5 * 60 * 1000; // 5 minutes
    
    // Caching system
    this.locationCache = new Map();
    this.cacheExpiry = 2 * 60 * 1000; // 2 minutes for location cache
    this.maxCacheSize = 5;
    
    // Campus configuration for enhanced precision
    this.campusConfig = null;
    this.campusProximityBonus = true;
    
    console.log('🎯 HybridLocationService initialized', {
      providers: this.availableProviders,
      simultaneousRequests: this.simultaneousRequests,
      fallbackEnabled: this.fallbackEnabled,
      cacheEnabled: true
    });
    
    // Initialize accuracy comparator with campus config if available
    this.initializeCampusConfig();
  }

  /**
   * Initialize campus configuration for proximity-based accuracy bonuses
   */
  async initializeCampusConfig() {
    try {
      // Try to import campus config
      const { getCampusConfig } = await import('./UniversityCampusConfig.js');
      this.campusConfig = getCampusConfig('iub'); // Default to IUB
      locationAccuracyComparator.setCampusConfig(this.campusConfig);
      console.log('🏫 HybridLocationService: Campus config loaded for enhanced precision');
    } catch (error) {
      console.warn('⚠️ HybridLocationService: Campus config not available:', error);
    }
  }

  /**
   * Get current location using hybrid approach
   * @param {Object} options - Location request options
   * @returns {Promise<Object>} Best available location data
   */
  async getCurrentLocation(options = {}) {
    const startTime = Date.now();
    this.performanceStats.totalRequests++;
    
    console.log('📍 HybridLocationService: Requesting location using hybrid approach...');
    
    try {
      // Check cache first if allowed
      if (options.allowCached !== false) {
        const cachedLocation = this.getCachedLocation();
        if (cachedLocation) {
          console.log('💾 HybridLocationService: Returning cached location');
          return this.formatHybridResponse(cachedLocation, { source: 'cache' });
        }
      }
      
      // Determine which providers to use
      const providersToTry = this.determineProvidersToUse(options);
      console.log('📡 HybridLocationService: Using providers:', providersToTry);
      
      if (this.simultaneousRequests && providersToTry.length > 1) {
        return await this.getLocationSimultaneous(providersToTry, options, startTime);
      } else {
        return await this.getLocationSequential(providersToTry, options, startTime);
      }
      
    } catch (error) {
      console.error('❌ HybridLocationService: All location providers failed:', error);
      
      // Last resort: return cached data even if expired
      const staleCache = this.getCachedLocation(true);
      if (staleCache) {
        console.log('🆘 HybridLocationService: Returning stale cached location as last resort');
        return this.formatHybridResponse(staleCache, { 
          source: 'stale_cache',
          warning: 'Using stale cached data - all providers failed'
        });
      }
      
      throw error;
    }
  }

  /**
   * Request location from multiple providers simultaneously and pick the best
   * @param {string[]} providers - Array of provider names to try
   * @param {Object} options - Request options
   * @param {number} startTime - Request start time
   * @returns {Promise<Object>} Best location from simultaneous requests
   */
  async getLocationSimultaneous(providers, options, startTime) {
    console.log('⚡ HybridLocationService: Making simultaneous requests to all providers...');
    
    const locationPromises = providers.map(provider => 
      this.requestFromProvider(provider, options).catch(error => ({
        error,
        provider,
        failed: true
      }))
    );
    
    // Wait for all requests to complete or timeout
    const results = await Promise.allSettled(locationPromises);
    const locations = results
      .filter(result => result.status === 'fulfilled' && !result.value.failed)
      .map(result => result.value);
    
    if (locations.length === 0) {
      throw new Error('All location providers failed simultaneously');
    }
    
    // Use accuracy comparator to select the best location
    const comparison = locationAccuracyComparator.selectBestLocation(locations, options);
    const bestLocation = comparison.selectedLocation;
    
    // Update performance stats
    this.updatePerformanceStats(bestLocation, startTime);
    this.cacheLocation(bestLocation);
    
    // Log detailed comparison results
    this.logSimultaneousComparison(comparison);
    
    return this.formatHybridResponse(bestLocation, {
      selectionMethod: 'simultaneous',
      comparedProviders: locations.length,
      selectionScore: bestLocation.comparisonScore,
      alternatives: comparison.alternatives.length
    });
  }

  /**
   * Request location from providers sequentially (fallback chain)
   * @param {string[]} providers - Array of provider names to try in order
   * @param {Object} options - Request options
   * @param {number} startTime - Request start time
   * @returns {Promise<Object>} First successful location
   */
  async getLocationSequential(providers, options, startTime) {
    console.log('🔄 HybridLocationService: Trying providers sequentially...');
    
    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      
      try {
        console.log(`📡 HybridLocationService: Trying provider ${i + 1}/${providers.length}: ${provider}`);
        
        const location = await this.requestFromProvider(provider, options);
        
        // Update performance stats and cache
        this.updatePerformanceStats(location, startTime);
        this.cacheLocation(location);
        
        console.log(`✅ HybridLocationService: ${provider} provider successful`);
        
        return this.formatHybridResponse(location, {
          selectionMethod: 'sequential',
          providerUsed: provider,
          attemptNumber: i + 1,
          totalProviders: providers.length
        });
        
      } catch (error) {
        console.warn(`⚠️ HybridLocationService: ${provider} provider failed:`, error.message);
        this.updateCircuitBreaker(provider, false);
        
        // If this was the last provider, throw the error
        if (i === providers.length - 1) {
          throw new Error(`All ${providers.length} providers failed. Last error: ${error.message}`);
        }
      }
    }
  }

  /**
   * Request location from a specific provider
   * @param {string} provider - Provider name ('browser' or 'google')
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Location data from the provider
   */
  async requestFromProvider(provider, options) {
    const requestStart = Date.now();
    
    try {
      let location;
      
      if (provider === 'browser') {
        location = await this.getBrowserLocation(options);
        this.performanceStats.browserSuccessful++;
      } else if (provider === 'google') {
        location = await googleGeolocationProvider.getCurrentLocation(options);
        this.performanceStats.googleSuccessful++;
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
      
      // Add provider info and timing
      location.provider = provider;
      location.responseTime = Date.now() - requestStart;
      
      // Update circuit breaker
      this.updateCircuitBreaker(provider, true);
      
      return location;
      
    } catch (error) {
      this.updateCircuitBreaker(provider, false);
      throw error;
    }
  }

  /**
   * Get location from browser's geolocation API
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Browser location data
   */
  getBrowserLocation(options) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Browser geolocation not supported'));
        return;
      }
      
      const browserOptions = {
        enableHighAccuracy: options.enableHighAccuracy !== false,
        timeout: options.timeout || this.requestTimeout,
        maximumAge: options.maximumAge || 0
      };
      
      console.log('📱 HybridLocationService: Requesting browser geolocation...');
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('✅ HybridLocationService: Browser geolocation successful', {
            accuracy: Math.round(position.coords.accuracy) + 'm',
            coordinates: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`
          });
          
          resolve({
            coords: position.coords,
            timestamp: position.timestamp,
            source: 'browser',
            provider: 'browser'
          });
        },
        (error) => {
          console.warn('⚠️ HybridLocationService: Browser geolocation failed:', error.message);
          reject(new Error(`Browser geolocation failed: ${error.message}`));
        },
        browserOptions
      );
    });
  }

  /**
   * Determine which providers to use based on availability and circuit breaker status
   * @param {Object} options - Request options
   * @returns {string[]} Array of provider names to try
   */
  determineProvidersToUse(options) {
    let providers = [];
    
    // Check preferred provider setting
    if (this.preferredProvider === 'browser' && this.isProviderAvailable('browser')) {
      providers.push('browser');
      if (this.fallbackEnabled && this.isProviderAvailable('google')) {
        providers.push('google');
      }
    } else if (this.preferredProvider === 'google' && this.isProviderAvailable('google')) {
      providers.push('google');
      if (this.fallbackEnabled && this.isProviderAvailable('browser')) {
        providers.push('browser');
      }
    } else {
      // Auto mode: use all available providers
      if (this.isProviderAvailable('browser')) providers.push('browser');
      if (this.isProviderAvailable('google')) providers.push('google');
    }
    
    if (providers.length === 0) {
      throw new Error('No location providers are currently available');
    }
    
    return providers;
  }

  /**
   * Check if a provider is available and not circuit-broken
   * @param {string} provider - Provider name
   * @returns {boolean} Whether provider is available
   */
  isProviderAvailable(provider) {
    // Check basic availability
    if (provider === 'browser' && !navigator.geolocation) return false;
    if (provider === 'google' && !googleGeolocationProvider.isAvailable()) return false;
    
    // Check circuit breaker status
    const breaker = this.circuitBreaker[provider];
    if (breaker?.isOpen) {
      // Check if enough time has passed to reset the circuit breaker
      const timeSinceLastFailure = Date.now() - (breaker.lastFailure || 0);
      if (timeSinceLastFailure > this.circuitBreakerResetTime) {
        console.log(`🔄 HybridLocationService: Resetting circuit breaker for ${provider}`);
        breaker.isOpen = false;
        breaker.failures = 0;
        return true;
      }
      return false;
    }
    
    return true;
  }

  /**
   * Update circuit breaker state for a provider
   * @param {string} provider - Provider name
   * @param {boolean} success - Whether the request was successful
   */
  updateCircuitBreaker(provider, success) {
    if (!this.circuitBreaker[provider]) {
      this.circuitBreaker[provider] = { failures: 0, lastFailure: null, isOpen: false };
    }
    
    const breaker = this.circuitBreaker[provider];
    
    if (success) {
      // Reset on success
      breaker.failures = 0;
      breaker.isOpen = false;
    } else {
      // Increment failures
      breaker.failures++;
      breaker.lastFailure = Date.now();
      
      // Open circuit breaker if too many failures
      if (breaker.failures >= this.maxFailuresBeforeBreak) {
        breaker.isOpen = true;
        console.warn(`🚫 HybridLocationService: Circuit breaker OPEN for ${provider} (${breaker.failures} failures)`);
      }
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
    
    this.locationCache.set('current', {
      ...location,
      cachedAt: Date.now()
    });
    
    console.log('💾 HybridLocationService: Location cached successfully');
  }

  /**
   * Get cached location if still valid
   * @param {boolean} allowStale - Allow stale cached data
   * @returns {Object|null} Cached location or null
   */
  getCachedLocation(allowStale = false) {
    const cached = this.locationCache.get('current');
    if (!cached) return null;
    
    const age = Date.now() - cached.cachedAt;
    const isExpired = age > this.cacheExpiry;
    
    if (isExpired && !allowStale) {
      this.locationCache.delete('current');
      return null;
    }
    
    return cached;
  }

  /**
   * Update performance statistics
   * @param {Object} location - Selected location
   * @param {number} startTime - Request start time
   */
  updatePerformanceStats(location, startTime) {
    const responseTime = Date.now() - startTime;
    
    // Update average response time
    this.performanceStats.averageResponseTime = 
      (this.performanceStats.averageResponseTime * (this.performanceStats.totalRequests - 1) + responseTime) / 
      this.performanceStats.totalRequests;
    
    this.performanceStats.lastRequestTime = Date.now();
    
    if (location.comparisonScore) {
      this.performanceStats.hybridSelections++;
    }
  }

  /**
   * Log detailed comparison results for simultaneous requests
   * @param {Object} comparison - Comparison results from accuracy comparator
   */
  logSimultaneousComparison(comparison) {
    const selected = comparison.selectedLocation;
    const alternatives = comparison.alternatives;
    
    console.log('🔍 HybridLocationService: Simultaneous provider comparison:');
    console.log(`   🥇 SELECTED: ${selected.provider?.toUpperCase()} API - ±${Math.round(selected.coords?.accuracy || 0)}m accuracy (score: ${selected.comparisonScore})`);
    console.log(`   📊 Reason: ${selected.selectionReason}`);
    
    if (alternatives.length > 0) {
      alternatives.slice(0, 2).forEach((alt, index) => {
        const emoji = index === 0 ? '🥈' : '🥉';
        const accuracy = Math.round(alt.coords?.accuracy || 0);
        console.log(`   ${emoji} ${alt.provider?.toUpperCase()}: ±${accuracy}m (score: ${alt.comparisonScore})`);
      });
    }
  }

  /**
   * Format the final hybrid response with metadata
   * @param {Object} location - Selected location data
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Formatted hybrid response
   */
  formatHybridResponse(location, metadata = {}) {
    return {
      // Standard location data
      coords: location.coords,
      timestamp: location.timestamp || Date.now(),
      
      // Hybrid system metadata
      hybrid: {
        selectedProvider: location.provider || location.source,
        selectionMethod: metadata.selectionMethod || 'unknown',
        selectionScore: location.comparisonScore || null,
        responseTime: location.responseTime || null,
        fromCache: metadata.source === 'cache' || metadata.source === 'stale_cache',
        isStale: metadata.source === 'stale_cache',
        ...metadata
      },
      
      // Compatibility with existing code
      source: location.provider || location.source || 'hybrid',
      provider: 'hybrid'
    };
  }

  /**
   * Get comprehensive service statistics
   * @returns {Object} Service performance statistics
   */
  getStats() {
    return {
      performance: { ...this.performanceStats },
      circuitBreakers: JSON.parse(JSON.stringify(this.circuitBreaker)),
      providers: {
        browser: {
          available: this.isProviderAvailable('browser'),
          successRate: this.performanceStats.totalRequests > 0 ? 
            (this.performanceStats.browserSuccessful / this.performanceStats.totalRequests * 100).toFixed(1) + '%' : '0%'
        },
        google: {
          available: this.isProviderAvailable('google'),
          successRate: this.performanceStats.totalRequests > 0 ? 
            (this.performanceStats.googleSuccessful / this.performanceStats.totalRequests * 100).toFixed(1) + '%' : '0%'
        }
      },
      cache: {
        size: this.locationCache.size,
        hasValidCache: !!this.getCachedLocation()
      }
    };
  }

  /**
   * Configure hybrid service settings
   * @param {Object} config - Configuration options
   */
  configure(config) {
    if (config.preferredProvider) this.preferredProvider = config.preferredProvider;
    if (config.simultaneousRequests !== undefined) this.simultaneousRequests = config.simultaneousRequests;
    if (config.fallbackEnabled !== undefined) this.fallbackEnabled = config.fallbackEnabled;
    if (config.requestTimeout) this.requestTimeout = config.requestTimeout;
    
    console.log('⚙️ HybridLocationService: Configuration updated', config);
  }

  /**
   * Test all available providers and return comparison
   * @returns {Promise<Object>} Test results for all providers
   */
  async testAllProviders() {
    console.log('🧪 HybridLocationService: Testing all providers...');
    
    const results = {};
    
    for (const provider of this.availableProviders) {
      if (this.isProviderAvailable(provider)) {
        try {
          const startTime = Date.now();
          const location = await this.requestFromProvider(provider, { allowCached: false });
          
          results[provider] = {
            success: true,
            location,
            responseTime: Date.now() - startTime,
            accuracy: location.coords?.accuracy || null
          };
          
          console.log(`✅ ${provider}: ±${Math.round(location.coords?.accuracy || 0)}m in ${results[provider].responseTime}ms`);
          
        } catch (error) {
          results[provider] = {
            success: false,
            error: error.message,
            responseTime: null,
            accuracy: null
          };
          
          console.error(`❌ ${provider}: ${error.message}`);
        }
      } else {
        results[provider] = {
          success: false,
          error: 'Provider not available',
          responseTime: null,
          accuracy: null
        };
      }
    }
    
    return results;
  }
}

// Create singleton instance
export const hybridLocationService = new HybridLocationService();