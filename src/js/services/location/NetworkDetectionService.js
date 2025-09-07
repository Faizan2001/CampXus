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
    // Use IPinfo Lite for tier-1 detection via ASN domain (as_domain)
    this.ipServiceEndpoints = [
      {
        url: "https://api.ipinfo.io/lite/me?token=d951df9d159d4d",
        name: "ipinfo-lite",
        ipField: "ip",
        asnField: "asn",
        asNameField: "as_name",
        asDomainField: "as_domain",
      },
    ];

    this.maxRetries = 2;
    this.requestTimeout = 5000; // 5 second timeout
    this.rateLimitDelay = 1500; // Small delay between requests to respect rate limits

    logManager.location.info(
      "NetworkDetectionService initialized (IPinfo Lite as_domain matching)",
      {
        primaryEndpoint: this.ipServiceEndpoints[0].name,
        fallbackEndpoints: this.ipServiceEndpoints.slice(1).map((e) => e.name),
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
        `Starting IPinfo Lite detection for ${university.toUpperCase()}`
      );

      // Step 1: Get the campus configuration which contains the network info
      const campusConfig = getCampusConfig(university);
      if (!campusConfig?.networkInfo) {
        throw new Error(
          `No networkInfo configured for university: ${university}`
        );
      }

      const expectedAsDomain = campusConfig.networkInfo.asDomain;
      const expectedOrg = campusConfig.networkInfo.organization; // legacy fallback
      const alternativeNames = campusConfig.networkInfo.alternativeNames || [];

      // Step 2: Get user's public IP information including organization
      const userIpInfo = await this.getUserIPInfo();
      if (!userIpInfo) {
        throw new Error("Unable to detect IP information");
      }

      const userIP = userIpInfo.ip;
      const userASN = userIpInfo.asn;
      const userAsName = userIpInfo.as_name;
      const userAsDomain = userIpInfo.as_domain;

      // 🔍 CHECK: Do we have as_domain for campus detection?
      if (!userAsDomain) {
        logManager.location.warn(
          `⚠️ No as_domain available from ${userIpInfo.service} - cannot perform campus detection`
        );
        logManager.location.info(
          `📍 IP detected: ${userIP} via ${userIpInfo.service}`
        );

        return {
          success: false,
          method: "ipinfo_lite_as_domain",
          tier: 1,
          error: "as_domain not available - fallback to GPS detection",
          userIP,
          userOrganization: null,
          as_domain: null,
          as_name: userAsName || null,
          asn: userASN || null,
          responseTime: Date.now() - startTime,
          timestamp: Date.now(),
          fallbackReason: "no_as_domain",
          gracefulFallback: true,
        };
      }

      logManager.location.info("User network info detected (IPinfo Lite)", {
        ip: userIP,
        asn: userASN,
        as_name: userAsName,
        as_domain: userAsDomain,
        expectedAsDomain,
      });

      // Step 3: Check if AS domain matches the university domain
      const isOnCampus = this.checkAsDomainMatch(userAsDomain, expectedAsDomain) ||
        // Fallback to legacy organization matching if needed
        this.checkOrganizationMatch(userAsName, expectedOrg, alternativeNames);
      const responseTime = Date.now() - startTime;

      const result = {
        success: true,
        method: "ipinfo_lite_as_domain",
        tier: 1,
        campusStatus: isOnCampus ? "on_campus" : "off_campus",
        confidence: "high",
        userIP,
        // Keep userOrganization for compatibility with existing consumers
        userOrganization: userAsDomain,
        as_domain: userAsDomain,
        as_name: userAsName,
        asn: userASN,
        expectedAsDomain,
        university: university,
        responseTime: responseTime,
        timestamp: Date.now(),
        matchReason: isOnCampus ? "as_domain_match" : "no_match",
      };

      logManager.dev.info(
        `NetworkDetectionService: TIER 1 result in ${responseTime}ms: ${result.campusStatus.toUpperCase()} via IPinfo Lite`,
        { result }
      );

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      logManager.location.fail(
        `TIER 1 failed in ${responseTime}ms: ${error.message}`
      );

      return {
        success: false,
        method: "ipinfo_lite_as_domain",
        tier: 1,
        error: error.message,
        responseTime: responseTime,
        timestamp: Date.now(),
        fallbackReason: "ip_detection_failed",
      };
    }
  }

  /**
   * 🌐 Get user's public IP information (IPinfo Lite)
   * @returns {Promise<Object>} User's IP info including AS fields
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
          await new Promise((resolve) =>
            setTimeout(resolve, this.rateLimitDelay)
          );
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
        if (data.status === "fail") {
          throw new Error(`API error: ${data.message || "Unknown error"}`);
        }

        // Extract fields for IPinfo Lite
        const ip = data[endpoint.ipField];
        const asn = data[endpoint.asnField];
        const as_name = data[endpoint.asNameField];
        const as_domain = data[endpoint.asDomainField];

        if (!ip) {
          throw new Error(`Missing IP field from ${endpoint.name}`);
        }

        const result = {
          ip,
          asn: asn || null,
          as_name: as_name || null,
          as_domain: as_domain || null,
          service: endpoint.name,
          rawData: data,
        };

        logManager.location.success(
          `IPinfo Lite data fetched via ${endpoint.name}`,
          { ip, asn, as_name, as_domain }
        );

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
   * 🎯 Match AS domain to expected campus domain
   */
  checkAsDomainMatch(userAsDomain, expectedAsDomain) {
    if (!userAsDomain || !expectedAsDomain) return false;
    try {
      return userAsDomain.toLowerCase() === expectedAsDomain.toLowerCase();
    } catch (_) {
      return false;
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
      serviceType: "ipinfo_lite_as_domain",
      tier: 1,
      cost: "FREE",
      rateLimit: "Unlimited (IPinfo Lite)",
      method: "AS domain equality (as_domain)",
      endpoints: this.ipServiceEndpoints.map((e) => ({
        name: e.name,
        url: e.url,
        ipField: e.ipField,
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
      networkDetectionService.updateUniversityNetworkInfo(
        university,
        networkInfo
      ),
  };

  // Expose a single centralized debug message
  // Quiet by default; helpers remain available on window.debugNetworkDetection
}
