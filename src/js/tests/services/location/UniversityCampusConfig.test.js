import { jest } from "@jest/globals";

import {
  getCampusBoundaryArray,
  getCampusConfig,
  getSupportedUniversities,
  validateCampusConfig,
} from "../../../services/location/UniversityCampusConfig.js";

describe("UniversityCampusConfig", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test("getCampusConfig() returns config (case-insensitive)", () => {
    expect(getCampusConfig("iub")?.shortCode).toBe("iub");
    expect(getCampusConfig("IUB")?.shortCode).toBe("iub");
  });

  test("getCampusConfig() returns null for unknown or missing university", () => {
    expect(getCampusConfig("unknown")).toBeNull();
    expect(getCampusConfig("")).toBeNull();
    expect(getCampusConfig(null)).toBeNull();
  });

  test("getSupportedUniversities() includes iub", () => {
    expect(getSupportedUniversities()).toContain("iub");
  });

  test("validateCampusConfig() is true for iub", () => {
    expect(validateCampusConfig("iub")).toBe(true);
  });

  test("getCampusBoundaryArray() returns [lat,lng] pairs", () => {
    const boundary = getCampusBoundaryArray("iub");
    expect(Array.isArray(boundary)).toBe(true);
    expect(boundary.length).toBeGreaterThanOrEqual(3);
    expect(boundary[0]).toHaveLength(2);
    expect(typeof boundary[0][0]).toBe("number");
    expect(typeof boundary[0][1]).toBe("number");
  });
});

