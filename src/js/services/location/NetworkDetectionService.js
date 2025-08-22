/**
 * NetworkDetectionService.js
 *
 * Tier 1 location detection using IP range analysis for FREE campus presence detection.
 * Provides instant, accurate campus detection without GPS or expensive API calls.
 *
 * 🆓 FREE TIER - No API costs, unlimited usage
 * ⚡ INSTANT - No GPS delays or permission prompts
 * 🎯 ACCURATE - Highly reliable for campus network detection
 */

import { logManager } from "../../utils/debug/LogManager.js";

export class NetworkDetectionService {
  constructor() {
    // University IP range configurations
    this.universityIpRanges = {
      iub: [
        // 🧪 PLACEHOLDER - Will be updated with real IUB IP ranges after testing

        "103.81.68.0/24", // Example: IUB network range? Verify
        "103.81.69.0/24", // Example: IUB network range? Verify
        "103.81.70.0/24", // Example: IUB network range? Verify
        "103.81.71.0/24", // Example: IUB network range? Verify
      ],
      // Add more universities as needed
      buet: [
        "103.230.106.0/24", // Example: BUET network
      ],
    };

    // IP detection service endpoints (with fallbacks)
    this.ipServiceEndpoints = [
      "https://api.ipify.org?format=json", // Primary
      "https://ipapi.co/json/", // Fallback 1
      "https://ip.seeip.org/jsonip", // Fallback 2
    ];

    this.maxRetries = 3;
    this.requestTimeout = 5000; // 5 second timeout for IP detection

    logManager.location.info(
      "NetworkDetectionService initialized with university IP ranges",
      {
        universities: Object.keys(this.universityIpRanges),
      }
    );
  }

  /**
   * 🎯 MAIN METHOD: Detect campus presence using IP range analysis
   * @param {string} university - University code (e.g., 'iub')
   * @returns {Promise<Object>} Detection result with campus status
   */
  async detectCampusPresence(university = "iub") {
    const startTime = Date.now();

    try {
      logManager.location.tier1(
        `Starting IP-based campus detection for ${university.toUpperCase()}`
      );

      // Step 1: Get user's public IP address
      const userIP = await this.getUserPublicIP();
      if (!userIP) {
        throw new Error("Unable to detect public IP address");
      }

      // 🧪 TESTING: Log actual IP for tomorrow's campus testing
      logManager.location.info("TESTING MODE: current IP for debugging", {
        ip: userIP,
      });

      // Step 2: Check if IP falls within university ranges
      const isOnCampus = this.isIPInUniversityRange(userIP, university);
      const responseTime = Date.now() - startTime;

      const result = {
        success: true,
        method: "ip_range_detection",
        tier: 1,
        campusStatus: isOnCampus ? "on_campus" : "off_campus",
        confidence: isOnCampus ? "high" : "high", // IP detection is always high confidence
        userIP: userIP,
        university: university,
        responseTime: responseTime,
        timestamp: Date.now(),
        // For debugging
        matchedRange: isOnCampus
          ? this.getMatchingRange(userIP, university)
          : null,
        availableRanges: this.universityIpRanges[university] || [],
      };

      // Downgrade this to a dev/info level so the higher-level orchestrator
      // (`CampusLocationService`) remains the canonical emitter of final
      // "TIER X completed" messages and prevents duplicate entries.
      logManager.dev.info(
        `NetworkDetectionService: TIER 1 result in ${responseTime}ms: ${result.campusStatus.toUpperCase()} via IP detection`,
        {
          userIP,
          matchedRange: result.matchedRange,
          confidence: result.confidence,
          responseTime,
        }
      );

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logManager.location.fail(
        `TIER 1 failed in ${responseTime}ms: ${error.message}`
      );

      return {
        success: false,
        method: "ip_range_detection",
        tier: 1,
        error: error.message,
        responseTime: responseTime,
        timestamp: Date.now(),
        fallbackReason: "ip_detection_failed",
      };
    }
  }

  /**
   * 🌐 Get user's public IP address with fallback endpoints
   * @returns {Promise<string>} User's public IP address
   */
  async getUserPublicIP() {
    for (let i = 0; i < this.ipServiceEndpoints.length; i++) {
      const endpoint = this.ipServiceEndpoints[i];

      try {
        logManager.location.info(
          `Trying IP service ${i + 1}/${this.ipServiceEndpoints.length}`,
          { endpoint }
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.requestTimeout
        );

        const response = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Different services return IP in different fields
        const ip = data.ip || data.query || data.IPv4;

        if (ip && this.isValidIP(ip)) {
          logManager.location.success(`IP detected successfully`, { ip });
          return ip;
        } else {
          throw new Error("Invalid IP format in response");
        }
      } catch (error) {
        logManager.location.warn(
          `IP service ${i + 1} failed: ${error.message}`
        );

        // If this was the last endpoint, throw the error
        if (i === this.ipServiceEndpoints.length - 1) {
          throw new Error("All IP detection services failed");
        }

        // Otherwise, try the next endpoint
        continue;
      }
    }
  }

  /**
   * 🎯 Check if IP address falls within university network ranges
   * @param {string} userIP - User's IP address
   * @param {string} university - University code
   * @returns {boolean} True if IP is within university ranges
   */
  isIPInUniversityRange(userIP, university) {
    const ranges = this.universityIpRanges[university];

    if (!ranges || ranges.length === 0) {
      logManager.location.warn(`No IP ranges configured for ${university}`);
      return false;
    }

    for (const range of ranges) {
      if (this.isIPInRange(userIP, range)) {
        logManager.location.tier1(
          `IP ${userIP} matches university range: ${range}`
        );
        return true;
      }
    }

    logManager.location.info(
      `IP ${userIP} not in any university ranges for ${university}`
    );
    return false;
  }

  /**
   * 📐 Check if an IP address falls within a CIDR range
   * @param {string} ip - IP address to check
   * @param {string} cidr - CIDR range (e.g., '192.168.1.0/24')
   * @returns {boolean} True if IP is in range
   */
  isIPInRange(ip, cidr) {
    try {
      const [rangeIP, prefixLength] = cidr.split("/");
      const prefix = parseInt(prefixLength, 10);

      // Convert IP addresses to 32-bit integers
      const ipInt = this.ipToInt(ip);
      const rangeInt = this.ipToInt(rangeIP);

      // Create subnet mask
      const mask = (0xffffffff << (32 - prefix)) >>> 0;

      // Check if IP is in the subnet
      return (ipInt & mask) === (rangeInt & mask);
    } catch (error) {
      logManager.dev.warn(
        `⚠️ [NetworkDetection] Error checking IP range ${ip} in ${cidr}: ${error.message}`
      );
      return false;
    }
  }

  /**
   * 🔢 Convert IP address string to 32-bit integer
   * @param {string} ip - IP address string
   * @returns {number} 32-bit integer representation
   */
  ipToInt(ip) {
    return (
      ip.split(".").reduce((int, octet, index) => {
        return int + (parseInt(octet, 10) << ((3 - index) * 8));
      }, 0) >>> 0
    ); // Unsigned right shift to ensure positive number
  }

  /**
   * 🔍 Get the matching IP range for debugging
   * @param {string} userIP - User's IP address
   * @param {string} university - University code
   * @returns {string|null} Matching CIDR range
   */
  getMatchingRange(userIP, university) {
    const ranges = this.universityIpRanges[university];
    if (!ranges) return null;

    for (const range of ranges) {
      if (this.isIPInRange(userIP, range)) {
        return range;
      }
    }
    return null;
  }

  /**
   * ✅ Validate IP address format
   * @param {string} ip - IP address to validate
   * @returns {boolean} True if valid IPv4 address
   */
  isValidIP(ip) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;

    return ip.split(".").every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }

  /**
   * ⚙️ Update university IP ranges (for dynamic configuration)
   * @param {string} university - University code
   * @param {string[]} ranges - Array of CIDR ranges
   */
  updateUniversityRanges(university, ranges) {
    logManager.dev.info(
      `⚙️ [NetworkDetection] Updating IP ranges for ${university}:`,
      { ranges }
    );
    this.universityIpRanges[university] = ranges;
  }

  /**
   * 📊 Get service statistics and configuration
   * @returns {Object} Service information
   */
  getServiceInfo() {
    return {
      serviceType: "network_ip_detection",
      tier: 1,
      cost: "FREE",
      supportedUniversities: Object.keys(this.universityIpRanges),
      totalRanges: Object.values(this.universityIpRanges).reduce(
        (total, ranges) => total + ranges.length,
        0
      ),
      endpoints: this.ipServiceEndpoints,
      timeout: this.requestTimeout,
      maxRetries: this.maxRetries,
    };
  }

  /**
   * 🧪 Test network detection service
   * @param {string} university - University to test for
   * @returns {Promise<Object>} Test results
   */
  async testService(university = "iub") {
    logManager.dev.info(
      `🧪 [NetworkDetection] Testing service for ${university}...`
    );

    const testStartTime = Date.now();
    const result = await this.detectCampusPresence(university);
    const testDuration = Date.now() - testStartTime;

    logManager.dev.info(
      `🧪 [NetworkDetection] Test completed in ${testDuration}ms`,
      { result }
    );

    return {
      ...result,
      testDuration,
      serviceInfo: this.getServiceInfo(),
    };
  }
}

// Create singleton instance
export const networkDetectionService = new NetworkDetectionService();

// 🧪 TESTING HELPER - Available in browser console for manual testing
if (typeof window !== "undefined") {
  window.debugNetworkDetection = {
    test: () => networkDetectionService.testService("iub"),
    checkIP: (ip, range) => networkDetectionService.isIPInRange(ip, range),
    getInfo: () => networkDetectionService.getServiceInfo(),
    updateRanges: (university, ranges) =>
      networkDetectionService.updateUniversityRanges(university, ranges),
  };

  // Expose a single centralized debug message
  logManager.dev.info(
    "NetworkDetection debug helpers available: window.debugNetworkDetection"
  );
}
