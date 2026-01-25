import { jest } from "@jest/globals";

import { locationTierService } from "../../../services/location/LocationTierService.js";
import { networkDetectionService } from "../../../services/location/NetworkDetectionService.js";

describe("LocationTierService", () => {
  let originalGeolocation;

  beforeEach(() => {
    originalGeolocation = navigator.geolocation;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    try {
      Object.defineProperty(navigator, "geolocation", {
        value: originalGeolocation,
        configurable: true,
      });
    } catch (error) { console.debug("Suppressed error", error); }
  });

  test("returns Tier 1 result when network detection reports on_campus", async () => {
    jest
      .spyOn(networkDetectionService, "detectCampusPresence")
      .mockResolvedValue({
        success: true,
        campusStatus: "on_campus",
        method: "ipinfo_lite_as_domain",
        userIP: "1.2.3.4",
        userOrganization: "example.edu",
        matchReason: "as_domain_match",
      });

    const result = await locationTierService.getCurrentLocation(
      false,
      "test",
      "user123"
    );

    expect(result).toBeTruthy();
    expect(result.tier).toBe(1);
    expect(result.campusStatus).toBe("on_campus");
    expect(result.source).toBe("ipinfo_lite_as_domain");
    expect(result.shouldWriteToDatabase).toBe(true);
  });

  test("falls back to Tier 2 when Tier 1 is not on_campus", async () => {
    jest
      .spyOn(networkDetectionService, "detectCampusPresence")
      .mockResolvedValue({
        success: true,
        campusStatus: "off_campus",
        method: "ipinfo_lite_as_domain",
      });

    const getCurrentPosition = jest.fn((success) => {
      success({
        coords: {
          latitude: 40,
          longitude: -74,
          accuracy: 500,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });
    });
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    const result = await locationTierService.getCurrentLocation(
      true,
      "test",
      "user123"
    );

    expect(result).toBeTruthy();
    expect(result.tier).toBe(2);
    expect(result.source).toBe("browser_enhanced");
    expect(result.shouldWriteToDatabase).toBe(true);
  });

  test("returns null when Tier 1 fails and geolocation is unavailable", async () => {
    jest
      .spyOn(networkDetectionService, "detectCampusPresence")
      .mockRejectedValue(new Error("network down"));

    Object.defineProperty(navigator, "geolocation", {
      value: null,
      configurable: true,
    });

    const result = await locationTierService.getCurrentLocation(
      false,
      "test",
      "user123"
    );
    expect(result).toBeNull();
  });
});

