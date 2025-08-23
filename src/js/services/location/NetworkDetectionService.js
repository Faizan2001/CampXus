/**
 * NetworkDetectionService.js
 *
 * Tier 1 location detection using IP ownership/organization analysis. 
 * This is a reliable and scalable method for instant campus detection.
 *
 * 🆓 FREE TIER - No API costs, 45 requests/minute limit
 * ⚡ INSTANT - No GPS delays or permission prompts  
 * 🎯 ACCURATE - Highly reliable for campus network detection
 * 🏢 SCALABLE - Works for any university by checking organization name
 */

import { logManager } from "../../utils/debug/LogManager.js";
import { getCampusConfig } from "./UniversityCampusConfig.js";

export class NetworkDetectionService {
  constructor() {
    // Using ipinfo.io as the primary, reliable source for IP and organization data.
    this.ipServiceEndpoints = [
      {
        url: "https://ipinfo.io?token=d951df9d159d4d",
        name: "ipinfo.io",
        orgField: "org", // The organization name is in the 'org' field for this endpoint
        ipField: "ip",
        ispField: "org", // Use org as a substitute for ISP
        asField: "org"
      }
    ];

    this.maxRetries = 2;
    this.requestTimeout = 5000; // 5 second timeout
    this.rateLimitDelay = 1500; // Small delay between requests to respect rate limits

    logManager.location.info(
      "NetworkDetectionService initialized for organization-based detection",
      {
        primaryEndpoint: this.ipServiceEndpoints[0].name,
        fallbackEndpoints: this.ipServiceEndpoints.slice(1).map(e => e.name)
      }
    );
  }

  /**
   * 🎯 MAIN METHOD: Detect campus presence using IP Organization analysis
   * @param {string} university - University code (e.g., 'iub')
   * @returns {Promise<Object>} Detection result with campus status
   */
  async detectCampusPresence(university = "iub") {
    const startTime = Date.now();

    try {
      logManager.location.tier1(
        `Starting IP Organization detection for ${university.toUpperCase()}`
      );

      // Step 1: Get the campus configuration which contains the network info
      const campusConfig = getCampusConfig(university);
      if (!campusConfig?.networkInfo?.organization) {
        throw new Error(`No networkInfo.organization configured for university: ${university}`);
      }

      const expectedOrg = campusConfig.networkInfo.organization;
      const alternativeNames = campusConfig.networkInfo.alternativeNames || [];

      // Step 2: Get user's public IP information including organization
      const userIpInfo = await this.getUserIPInfo();
      if (!userIpInfo) {
        throw new Error("Unable to detect IP information");
      }

      const userOrg = userIpInfo.organization;
      const userIP = userIpInfo.ip;
      const userISP = userIpInfo.isp;
      const userAS = userIpInfo.as;

      // 🔍 CHECK: Do we have organization data for campus detection?
      if (!userOrg || userIpInfo.ipOnly) {
        logManager.location.warn(`⚠️ No organization data available from ${userIpInfo.service} - cannot perform campus detection`);
        logManager.location.info(`📍 IP detected: ${userIP} via ${userIpInfo.service}`);
        
        return {
          success: false,
          method: "ip_organization_detection",
          tier: 1,
          error: "Organization data not available - fallback to GPS detection",
          userIP: userIP,
          userOrganization: null,
          userISP: userISP,
          userAS: userAS,
          responseTime: Date.now() - startTime,
          timestamp: Date.now(),
          fallbackReason: "no_organization_data",
          gracefulFallback: true
        };
      }

      logManager.location.info("User network info detected", {
        ip: userIP,
        organization: userOrg,
        isp: userISP,
        as: userAS,
        expectedOrganization: expectedOrg
      });

      // Step 3: Check if the user's organization matches the university
      const isOnCampus = this.checkOrganizationMatch(userOrg, expectedOrg, alternativeNames);
      const responseTime = Date.now() - startTime;

      const result = {
        success: true,
        method: "ip_organization_detection",
        tier: 1,
        campusStatus: isOnCampus ? "on_campus" : "off_campus",
        confidence: isOnCampus ? "high" : "high", // Organization detection is always high confidence
        userIP: userIP,
        userOrganization: userOrg,
        userISP: userISP,
        userAS: userAS,
        expectedOrganization: expectedOrg,
        university: university,
        responseTime: responseTime,
        timestamp: Date.now(),
        matchReason: isOnCampus ? this.getMatchReason(userOrg, expectedOrg, alternativeNames) : "no_match"
      };

      logManager.dev.info(
        `NetworkDetectionService: TIER 1 result in ${responseTime}ms: ${result.campusStatus.toUpperCase()} via organization detection`,
        {
          userOrg,
          expectedOrg,
          matchReason: result.matchReason,
          confidence: result.confidence,
          responseTime
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
        method: "ip_organization_detection",
        tier: 1,
        error: error.message,
        responseTime: responseTime,
        timestamp: Date.now(),
        fallbackReason: "ip_detection_failed",
      };
    }
  }

  /**
   * 🌐 Get user's public IP information including organization data
   * @returns {Promise<Object>} User's IP info including organization, IP, ISP, etc.
   */
  async getUserIPInfo() {
    for (let i = 0; i < this.ipServiceEndpoints.length; i++) {
      const endpoint = this.ipServiceEndpoints[i];

      try {
        logManager.location.info(
          `Trying IP info service ${i + 1}/${this.ipServiceEndpoints.length}`,
          { service: endpoint.name }
        );

        // Add delay between requests to respect rate limits
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.requestTimeout
        );

        const requestUrl = endpoint.customUrl || endpoint.url;
        const response = await fetch(requestUrl, {
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

        // Check for API-specific error status
        if (data.status === 'fail') {
          throw new Error(`API error: ${data.message || 'Unknown error'}`);
        }

        // Extract the required fields based on the endpoint
        const organization = data[endpoint.orgField];
        const ip = data[endpoint.ipField];
        const isp = data[endpoint.ispField] || data.isp || data.ISP;
        const as = data[endpoint.asField] || data.as || data.AS;

        // For endpoints that only provide IP (no organization data)
        if (endpoint.ipOnly) {
          if (!ip) {
            throw new Error(`Missing IP field from ${endpoint.name}`);
          }
          
          const result = {
            organization: null,
            ip,
            isp: 'Unknown',
            as: 'Unknown',
            service: endpoint.name,
            ipOnly: true,
            rawData: data
          };

          logManager.location.info(`IP-only service ${endpoint.name} provided IP: ${ip}`);
          return result;
        }

        // For full organization detection endpoints
        if (!organization || !ip) {
          throw new Error(`Missing required fields from ${endpoint.name}: org=${!!organization}, ip=${!!ip}`);
        }

        const result = {
          organization,
          ip,
          isp: isp || 'Unknown',
          as: as || 'Unknown',
          service: endpoint.name,
          rawData: data
        };

        logManager.location.success(`Full IP info detected successfully via ${endpoint.name}`, {
          ip,
          organization,
          isp,
          service: endpoint.name
        });

        return result;

      } catch (error) {
        logManager.location.warn(
          `IP service ${endpoint.name} failed: ${error.message}`
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
   * 🎯 Check if user's organization matches university organization
   * @param {string} userOrg - User's detected organization
   * @param {string} expectedOrg - Expected university organization 
   * @param {string[]} alternativeNames - Alternative organization names to check
   * @returns {boolean} True if organization matches
   */
  checkOrganizationMatch(userOrg, expectedOrg, alternativeNames = []) {
    if (!userOrg || !expectedOrg) return false;

    const userOrgLower = userOrg.toLowerCase();
    const expectedOrgLower = expectedOrg.toLowerCase();

    // Direct match
    if (userOrgLower.includes(expectedOrgLower)) {
      return true;
    }

    // Check alternative names
    for (const altName of alternativeNames) {
      if (userOrgLower.includes(altName.toLowerCase())) {
        return true;
      }
    }

    // Check if expected org is contained in user org (reverse check)
    if (expectedOrgLower.includes(userOrgLower)) {
      return true;
    }

    return false;
  }

  /**
   * � Get the reason why organizations matched (for debugging)
   * @param {string} userOrg - User's detected organization
   * @param {string} expectedOrg - Expected university organization
   * @param {string[]} alternativeNames - Alternative organization names
   * @returns {string} Match reason
   */
  getMatchReason(userOrg, expectedOrg, alternativeNames = []) {
    if (!userOrg || !expectedOrg) return "no_data";

    const userOrgLower = userOrg.toLowerCase();
    const expectedOrgLower = expectedOrg.toLowerCase();

    if (userOrgLower.includes(expectedOrgLower)) {
      return "direct_match";
    }

    for (const altName of alternativeNames) {
      if (userOrgLower.includes(altName.toLowerCase())) {
        return `alternative_match:${altName}`;
      }
    }

    if (expectedOrgLower.includes(userOrgLower)) {
      return "reverse_match";
    }

    return "no_match";
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
   * ⚙️ Update university network info (for dynamic configuration)
   * @param {string} university - University code
   * @param {Object} networkInfo - Network information object
   */
  updateUniversityNetworkInfo(university, networkInfo) {
    logManager.dev.info(
      `⚙️ [NetworkDetection] Updating network info for ${university}:`,
      { networkInfo }
    );
    // This would need to update the campus config, but for now just log
    // In a full implementation, this could update a dynamic config store
  }

  /**
   * 📊 Get service statistics and configuration
   * @returns {Object} Service information
   */
  getServiceInfo() {
    return {
      serviceType: "ip_organization_detection",
      tier: 1,
      cost: "FREE",
      rateLimit: "45 requests/minute",
      method: "Organization name matching",
      endpoints: this.ipServiceEndpoints.map(e => ({
        name: e.name,
        url: e.url,
        orgField: e.orgField,
        ipField: e.ipField
      })),
      timeout: this.requestTimeout,
      maxRetries: this.maxRetries,
    };
  }

  /**
   * 🧪 Test organization detection service
   * @param {string} university - University to test for
   * @returns {Promise<Object>} Test results
   */
  async testService(university = "iub") {
    logManager.dev.info(
      `🧪 [NetworkDetection] Testing organization detection service for ${university}...`
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
    getIPInfo: () => networkDetectionService.getUserIPInfo(),
    getInfo: () => networkDetectionService.getServiceInfo(),
    updateNetworkInfo: (university, networkInfo) =>
      networkDetectionService.updateUniversityNetworkInfo(university, networkInfo),
  };

  // Expose a single centralized debug message
  logManager.dev.info(
    "🏢 Organization-based NetworkDetection debug helpers available: window.debugNetworkDetection"
  );
}
