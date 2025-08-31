/**
 * LocationTierService.js
 *
 * Extracted 3-tier location acquisition pipeline.
 *
 * TIER 1: Network/IP detection (FREE)
 * TIER 2: Browser GPS (FREE) — up to 3 attempts, 12s timeout, <= 2100m accuracy
 * TIER 3: Google API (PAID) — per-user quota (5/day)
 */

import { networkDetectionService } from "./NetworkDetectionService.js";
import { googleGeolocationProvider } from "./GoogleGeolocationProvider.js";
import { logManager } from "../../utils/debug/LogManager.js";

class LocationTierService {
  constructor() {
    this.browserAttempts = 3;
    this.browserTimeoutMs = 12000; // 12s
    this.accuracyThreshold = 2000;
    this.accuracyTolerance = 0.05; // 5%
  }

  async getCurrentLocation(highAccuracy = false, trigger = "unknown", userId = null) {
    const startTime = Date.now();
    logManager.location.info(`3-TIER location request: ${trigger}`, {
      userId: userId ? userId.substring(0, 8) + "..." : "anonymous",
      trigger,
      highAccuracy,
      timestamp: new Date().toLocaleTimeString(),
    });

    // Tier 1: Network/IP detection (FREE)
    try {
      logManager.location.tier1("Network/IP Detection starting (FREE)");
      const t1 = await networkDetectionService.detectCampusPresence("iub");
      if (t1?.success) {
        const responseTime = Date.now() - startTime;
        logManager.location.success(
          `TIER 1 completed in ${responseTime}ms: ${String(t1.campusStatus).toUpperCase()} via ${t1.method}`
        );
        if (t1.campusStatus === "on_campus") {
          return {
            coords: {
              latitude: null,
              longitude: null,
              accuracy: 50,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
            source: "ip_organization_detection",
            tier: 1,
            cost: 0,
            campusStatus: "on_campus",
            confidence: "high",
            userIP: t1.userIP,
            userOrganization: t1.userOrganization,
            matchReason: t1.matchReason,
            responseTime,
            method: t1.method,
            provider: "network_detection_service",
            shouldWriteToDatabase: true,
            batteryOptimized: true,
          };
        }
      }
    } catch (e) {
      logManager.location.warn(`TIER 1 failed: ${e?.message || e}`);
    }

    // Tier 2: Browser GPS — up to 3 attempts
    const acceptableAccuracy = this.accuracyThreshold * (1 + this.accuracyTolerance); // 2100m
    for (let attempt = 1; attempt <= this.browserAttempts; attempt++) {
      try {
        logManager.location.attempt(
          `Attempt ${attempt}/${this.browserAttempts} (${this.browserTimeoutMs / 1000}s timeout)`
        );

        const position = await this.getBrowserLocationWithTimeout(highAccuracy, this.browserTimeoutMs);
        if (position?.coords) {
          const accuracy = Math.round(position.coords.accuracy);
          const responseTime = Date.now() - startTime;
          logManager.location.success(
            `TIER 2 completed in ${responseTime}ms (attempt ${attempt}): ±${accuracy}m accuracy`
          );
          if (accuracy <= acceptableAccuracy) {
            const result = this.formatPositionResponse(position, "browser_enhanced", 0);
            result.tier = 2;
            result.attempt = attempt;
            result.responseTime = responseTime;
            result.shouldWriteToDatabase = true;
            return result;
          }
        }
      } catch (e) {
        logManager.location.warn(`TIER 2 attempt ${attempt} failed: ${e?.message || e}`);
      }
    }

    // Tier 3: Google Geolocation API (PAID)
    try {
      logManager.location.tier3("Google Geolocation Provider starting (PAID)");
      const gloc = await googleGeolocationProvider.getCurrentLocation({ timeout: 5000, userId });
      if (gloc?.coords) {
        const responseTime = Date.now() - startTime;
        const result = this.formatPositionResponse(gloc, "google_provider", 0.005);
        result.tier = 3;
        result.responseTime = responseTime;
        result.shouldWriteToDatabase = true;
        return result;
      }
    } catch (e) {
      logManager.location.fail(`TIER 3 failed: ${e?.message || e}`);
    }

    // All tiers failed
    logManager.location.warn("All 3 tiers failed to provide location");
    return null;
  }

  getBrowserLocationWithTimeout(highAccuracy, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      const opts = {
        enableHighAccuracy: !!highAccuracy,
        timeout: timeoutMs,
        maximumAge: 0,
      };
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        opts
      );
    });
  }

  formatPositionResponse(position, source, cost = 0) {
    return {
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude ?? null,
        altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
        heading: position.coords.heading ?? null,
        speed: position.coords.speed ?? null,
      },
      timestamp: position.timestamp || Date.now(),
      source,
      provider: source,
      cost,
    };
  }
}

export const locationTierService = new LocationTierService();

