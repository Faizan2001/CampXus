import { LocationIntegration } from "../../../services/location/LocationIntegration.js";

describe("LocationIntegration", () => {
  test("sanitizeOptionsForLogging() removes callbacks and truncates long strings", () => {
    const integration = new LocationIntegration();
    const long = "x".repeat(150);

    const sanitized = integration.sanitizeOptionsForLogging({
      userId: "u1",
      onSuccess: () => {},
      onError: () => {},
      callback: () => {},
      long,
    });

    expect(sanitized.onSuccess).toBeUndefined();
    expect(sanitized.onError).toBeUndefined();
    expect(sanitized.callback).toBeUndefined();
    expect(sanitized.long.endsWith("...")).toBe(true);
    expect(sanitized.long.length).toBeLessThanOrEqual(103);
  });

  test("transformResultForCompatibility() normalizes shape and preserves context", () => {
    const integration = new LocationIntegration();
    const result = integration.transformResultForCompatibility(
      {
        latitude: 23.81,
        longitude: 90.42,
        accuracy: 25,
        tier: 1,
        source: "ipinfo",
        confidence: "high",
      },
      "campus_detection_iub"
    );

    expect(result.optimized).toBe(true);
    expect(result.integrationContext).toBe("campus_detection_iub");
    expect(result.coords.latitude).toBe(23.81);
    expect(result.coords.longitude).toBe(90.42);
    expect(result.coords.accuracy).toBe(25);
    expect(result.tier).toBe(1);
    expect(result.source).toBe("ipinfo");
    expect(result._originalResult).toBeDefined();
  });
});

