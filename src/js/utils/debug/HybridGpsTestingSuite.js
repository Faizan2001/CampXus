/**
 * HybridGpsTestingSuite.js
 * 
 * Comprehensive manual testing framework for the Hybrid GPS system.
 * Provides browser console commands for testing location accuracy,
 * provider comparisons, and campus presence detection.
 * 
 * Usage: Open browser console and use `gpsTest.help()` to see available commands
 * 
 * Phase 1.2 - Hybrid GPS Manual Testing Framework
 */

import { hybridLocationService } from '../../services/location/HybridLocationService.js';
import { googleGeolocationProvider } from '../../services/location/GoogleGeolocationProvider.js';
import { campusLocationService } from '../../services/location/CampusLocationService.js';
import { locationAccuracyComparator } from '../../services/location/LocationAccuracyComparator.js';

class HybridGpsTestingSuite {
  constructor() {
    this.testResults = [];
    this.isTestingInProgress = false;
    
    console.log('🧪 HybridGpsTestingSuite initialized');
    console.log('💡 Use gpsTest.help() to see available testing commands');
  }

  /**
   * Display help information for testing commands
   */
  help() {
    console.log('\n🎯 HYBRID GPS TESTING SUITE - Available Commands:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n📍 BASIC LOCATION TESTS:');
    console.log('  gpsTest.testBrowser()           - Test browser geolocation API only');
    console.log('  gpsTest.testGoogle()            - Test Google geolocation API only');
    console.log('  gpsTest.testHybrid()           - Test hybrid system (both APIs)');
    console.log('  gpsTest.compareProviders()     - Compare all providers side-by-side');
    
    console.log('\n🏫 CAMPUS PRESENCE TESTS:');
    console.log('  gpsTest.testCampusPresence()   - Test campus boundary detection');
    console.log('  gpsTest.simulateMovement()     - Simulate movement near campus bounds');
    
    console.log('\n📊 PERFORMANCE & STATS:');
    console.log('  gpsTest.testAccuracy()         - Run accuracy benchmark test');
    console.log('  gpsTest.stressTest()           - Run multiple location requests');
    console.log('  gpsTest.getStats()             - Show performance statistics');
    console.log('  gpsTest.resetStats()           - Reset all statistics');
    
    console.log('\n🔧 DEBUGGING & UTILITIES:');
    console.log('  gpsTest.testApiKey()           - Verify Google API key is working');
    console.log('  gpsTest.showResults()          - Display all test results');
    console.log('  gpsTest.clearResults()         - Clear test results');
    console.log('  gpsTest.exportResults()        - Export results as JSON');
    
    console.log('\n💡 TIPS:');
    console.log('  • Try testing both indoors and outdoors for accuracy comparison');
    console.log('  • Test near campus boundaries to verify presence detection');
    console.log('  • Check browser console for detailed provider selection logs');
    console.log('  • Use testAccuracy() to see which API provides better precision');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Test browser geolocation API only
   */
  async testBrowser() {
    console.log('\n📱 Testing BROWSER GEOLOCATION API...');
    const startTime = Date.now();
    
    try {
      if (!navigator.geolocation) {
        throw new Error('Browser geolocation not supported');
      }
      
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
      
      const responseTime = Date.now() - startTime;
      const result = {
        provider: 'Browser API',
        success: true,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy),
        responseTime: responseTime,
        timestamp: new Date().toISOString()
      };
      
      this.testResults.push(result);
      
      console.log('✅ BROWSER API RESULTS:');
      console.log(`   📍 Location: ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`);
      console.log(`   🎯 Accuracy: ±${result.accuracy}m`);
      console.log(`   ⚡ Response: ${responseTime}ms`);
      console.log(`   ${this.getAccuracyRating(result.accuracy)}`);
      
      return result;
      
    } catch (error) {
      const result = {
        provider: 'Browser API',
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      this.testResults.push(result);
      console.error('❌ BROWSER API FAILED:', error.message);
      return result;
    }
  }

  /**
   * Test Google geolocation API only
   */
  async testGoogle() {
    console.log('\n📡 Testing GOOGLE GEOLOCATION API...');
    const startTime = Date.now();
    
    try {
      const response = await googleGeolocationProvider.getCurrentLocation({ allowCached: false });
      const responseTime = Date.now() - startTime;
      
      const result = {
        provider: 'Google API',
        success: true,
        latitude: response.coords.latitude,
        longitude: response.coords.longitude,
        accuracy: Math.round(response.coords.accuracy),
        responseTime: responseTime,
        timestamp: new Date().toISOString(),
        confidence: response.confidence,
        quality: response.quality
      };
      
      this.testResults.push(result);
      
      console.log('✅ GOOGLE API RESULTS:');
      console.log(`   📍 Location: ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`);
      console.log(`   🎯 Accuracy: ±${result.accuracy}m`);
      console.log(`   ⚡ Response: ${responseTime}ms`);
      console.log(`   🏆 Confidence: ${response.confidence || 'N/A'}`);
      console.log(`   💎 Quality: ${response.quality || 'N/A'}`);
      console.log(`   ${this.getAccuracyRating(result.accuracy)}`);
      
      return result;
      
    } catch (error) {
      const result = {
        provider: 'Google API',
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      this.testResults.push(result);
      console.error('❌ GOOGLE API FAILED:', error.message);
      return result;
    }
  }

  /**
   * Test hybrid system (automatic provider selection)
   */
  async testHybrid() {
    console.log('\n🎯 Testing HYBRID GPS SYSTEM...');
    const startTime = Date.now();
    
    try {
      const response = await hybridLocationService.getCurrentLocation({ 
        allowCached: false,
        simultaneousRequests: true 
      });
      const responseTime = Date.now() - startTime;
      
      const result = {
        provider: 'Hybrid System',
        success: true,
        latitude: response.coords.latitude,
        longitude: response.coords.longitude,
        accuracy: Math.round(response.coords.accuracy),
        responseTime: responseTime,
        timestamp: new Date().toISOString(),
        selectedProvider: response.hybrid.selectedProvider,
        selectionMethod: response.hybrid.selectionMethod,
        selectionScore: response.hybrid.selectionScore,
        alternatives: response.hybrid.alternatives || 0
      };
      
      this.testResults.push(result);
      
      console.log('✅ HYBRID SYSTEM RESULTS:');
      console.log(`   🏆 SELECTED: ${result.selectedProvider?.toUpperCase()} API`);
      console.log(`   📍 Location: ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`);
      console.log(`   🎯 Accuracy: ±${result.accuracy}m`);
      console.log(`   ⚡ Response: ${responseTime}ms`);
      console.log(`   📊 Method: ${result.selectionMethod}`);
      console.log(`   🏆 Score: ${result.selectionScore || 'N/A'}`);
      console.log(`   🥈 Beat ${result.alternatives} alternatives`);
      console.log(`   ${this.getAccuracyRating(result.accuracy)}`);
      
      return result;
      
    } catch (error) {
      const result = {
        provider: 'Hybrid System',
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      this.testResults.push(result);
      console.error('❌ HYBRID SYSTEM FAILED:', error.message);
      return result;
    }
  }

  /**
   * Compare all providers side-by-side
   */
  async compareProviders() {
    console.log('\n🔍 COMPARING ALL LOCATION PROVIDERS...');
    this.isTestingInProgress = true;
    
    const startTime = Date.now();
    
    try {
      // Test all providers
      const browserResult = await this.testBrowser();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
      
      const googleResult = await this.testGoogle();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
      
      const hybridResult = await this.testHybrid();
      
      // Compare results
      const totalTime = Date.now() - startTime;
      const successfulTests = [browserResult, googleResult, hybridResult].filter(r => r.success);
      
      console.log('\n📊 PROVIDER COMPARISON SUMMARY:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      if (successfulTests.length > 0) {
        // Find most accurate
        const mostAccurate = successfulTests.reduce((best, current) => 
          current.accuracy < best.accuracy ? current : best
        );
        
        // Find fastest
        const fastest = successfulTests.reduce((best, current) => 
          current.responseTime < best.responseTime ? current : best
        );
        
        console.log(`🥇 MOST ACCURATE: ${mostAccurate.provider} (±${mostAccurate.accuracy}m)`);
        console.log(`⚡ FASTEST: ${fastest.provider} (${fastest.responseTime}ms)`);
        
        // Show detailed comparison
        successfulTests.forEach((result, index) => {
          const emoji = ['🥇', '🥈', '🥉'][index] || '📍';
          console.log(`${emoji} ${result.provider}:`);
          console.log(`   Accuracy: ±${result.accuracy}m | Response: ${result.responseTime}ms`);
        });
        
      } else {
        console.error('❌ All providers failed during comparison test');
      }
      
      console.log(`⏱️ Total comparison time: ${totalTime}ms`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
    } catch (error) {
      console.error('❌ Provider comparison failed:', error);
    } finally {
      this.isTestingInProgress = false;
    }
  }

  /**
   * Test campus presence detection
   */
  async testCampusPresence() {
    console.log('\n🏫 Testing CAMPUS PRESENCE DETECTION...');
    
    try {
      const location = await hybridLocationService.getCurrentLocation({ 
        enableHighAccuracy: true 
      });
      
      // Test campus location service
      await campusLocationService.getCurrentLocation(true);
      
      console.log('✅ CAMPUS PRESENCE TEST RESULTS:');
      console.log(`   📍 Current Location: ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`);
      console.log(`   🎯 Accuracy: ±${Math.round(location.coords.accuracy)}m`);
      console.log(`   🏫 Campus Presence: Testing boundary detection...`);
      
      // You would integrate with your campus boundary checking here
      console.log('   💡 Check the CampusLocationService logs for boundary detection results');
      
    } catch (error) {
      console.error('❌ Campus presence test failed:', error.message);
    }
  }

  /**
   * Test API key functionality
   */
  async testApiKey() {
    console.log('\n🔑 Testing GOOGLE API KEY...');
    
    try {
      const connectionTest = await googleGeolocationProvider.testConnection();
      
      if (connectionTest.success) {
        console.log('✅ GOOGLE API KEY WORKING:');
        console.log(`   📡 Successfully connected to Google Geolocation API`);
        console.log(`   📍 Test location obtained successfully`);
        console.log(`   🎯 API key is valid and active`);
      } else {
        console.error('❌ GOOGLE API KEY ISSUES:');
        console.error(`   Error: ${connectionTest.error}`);
        console.error('   💡 Check your .env.local file for correct API key');
      }
      
      return connectionTest;
      
    } catch (error) {
      console.error('❌ API key test failed:', error.message);
      console.error('💡 Make sure you have run: npm run dev:config');
    }
  }

  /**
   * Run accuracy benchmark test
   */
  async testAccuracy() {
    console.log('\n📊 Running ACCURACY BENCHMARK TEST...');
    console.log('   Testing multiple location requests to assess consistency...\n');
    
    this.isTestingInProgress = true;
    const testCount = 5;
    const results = [];
    
    try {
      for (let i = 1; i <= testCount; i++) {
        console.log(`🔄 Accuracy Test ${i}/${testCount}...`);
        
        const result = await hybridLocationService.getCurrentLocation({ 
          allowCached: false,
          enableHighAccuracy: true 
        });
        
        results.push({
          test: i,
          accuracy: result.coords.accuracy,
          provider: result.hybrid.selectedProvider,
          responseTime: result.hybrid.responseTime || 0
        });
        
        console.log(`   ✅ Test ${i}: ±${Math.round(result.coords.accuracy)}m via ${result.hybrid.selectedProvider?.toUpperCase()}`);
        
        // Brief delay between tests
        if (i < testCount) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Calculate statistics
      const accuracies = results.map(r => r.accuracy);
      const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
      const bestAccuracy = Math.min(...accuracies);
      const worstAccuracy = Math.max(...accuracies);
      const consistencyScore = ((bestAccuracy / worstAccuracy) * 100).toFixed(1);
      
      console.log('\n📊 ACCURACY BENCHMARK RESULTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎯 Average Accuracy: ±${Math.round(avgAccuracy)}m`);
      console.log(`🏆 Best Accuracy: ±${Math.round(bestAccuracy)}m`);
      console.log(`📉 Worst Accuracy: ±${Math.round(worstAccuracy)}m`);
      console.log(`📊 Consistency Score: ${consistencyScore}%`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
    } catch (error) {
      console.error('❌ Accuracy benchmark failed:', error.message);
    } finally {
      this.isTestingInProgress = false;
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    console.log('\n📊 HYBRID GPS SYSTEM STATISTICS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Hybrid service stats
    const hybridStats = hybridLocationService.getStats();
    console.log('🎯 HYBRID SERVICE STATS:');
    console.log(`   Total Requests: ${hybridStats.performance.totalRequests}`);
    console.log(`   Browser Successful: ${hybridStats.performance.browserSuccessful}`);
    console.log(`   Google Successful: ${hybridStats.performance.googleSuccessful}`);
    console.log(`   Average Response Time: ${Math.round(hybridStats.performance.averageResponseTime)}ms`);
    
    // Google provider stats
    const googleStats = googleGeolocationProvider.getStats();
    console.log('\n📡 GOOGLE API STATS:');
    console.log(`   Success Rate: ${googleStats.successRate}`);
    console.log(`   Average Accuracy: ±${Math.round(googleStats.averageAccuracy || 0)}m`);
    console.log(`   Average Response Time: ${Math.round(googleStats.averageResponseTime)}ms`);
    
    // Accuracy comparator stats
    const comparatorStats = locationAccuracyComparator.getProviderStats();
    console.log('\n🔍 ACCURACY COMPARATOR STATS:');
    Object.entries(comparatorStats).forEach(([provider, stats]) => {
      console.log(`   ${provider.toUpperCase()}:`);
      console.log(`     Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
      console.log(`     Average Accuracy: ±${Math.round(stats.averageAccuracy)}m`);
      console.log(`     Recent Failures: ${stats.recentFailures}`);
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Show all test results
   */
  showResults() {
    console.log('\n📋 ALL TEST RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (this.testResults.length === 0) {
      console.log('   No test results yet. Run some tests first!');
      return;
    }
    
    this.testResults.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.provider} (${result.timestamp}):`);
      if (result.success) {
        console.log(`   ✅ SUCCESS: ±${result.accuracy}m in ${result.responseTime}ms`);
        if (result.selectedProvider) {
          console.log(`   🏆 Selected: ${result.selectedProvider.toUpperCase()}`);
        }
      } else {
        console.log(`   ❌ FAILED: ${result.error}`);
      }
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Clear all test results
   */
  clearResults() {
    this.testResults = [];
    console.log('🗑️ Test results cleared');
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    locationAccuracyComparator.resetStats();
    console.log('🔄 All statistics reset');
  }

  /**
   * Export results as JSON
   */
  exportResults() {
    const exportData = {
      testResults: this.testResults,
      hybridStats: hybridLocationService.getStats(),
      googleStats: googleGeolocationProvider.getStats(),
      comparatorStats: locationAccuracyComparator.getProviderStats(),
      exportTime: new Date().toISOString()
    };
    
    console.log('📤 Export Data:', exportData);
    return exportData;
  }

  /**
   * Get accuracy rating based on meters
   * @param {number} accuracy - Accuracy in meters
   * @returns {string} Rating with emoji
   */
  getAccuracyRating(accuracy) {
    if (accuracy <= 5) return '🏆 EXCELLENT (GPS-grade precision)';
    if (accuracy <= 10) return '🎯 VERY GOOD (High precision)';
    if (accuracy <= 25) return '✅ GOOD (Suitable for campus detection)';
    if (accuracy <= 50) return '⚠️ FAIR (May affect campus boundary accuracy)';
    if (accuracy <= 100) return '❌ POOR (Limited accuracy)';
    return '🚫 VERY POOR (Unreliable for campus detection)';
  }
}

// Create singleton instance and expose globally for console testing
const gpsTestSuite = new HybridGpsTestingSuite();

// Expose to global scope for browser console access
if (typeof window !== 'undefined') {
  window.gpsTest = gpsTestSuite;
}

export { gpsTestSuite as hybridGpsTestingSuite };