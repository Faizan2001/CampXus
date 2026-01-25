import { onboardingService } from "../../../services/onboarding/OnboardingService.js";

describe("OnboardingService", () => {
  test("getState() returns an object", () => {
    const state = onboardingService.getState();
    expect(state && typeof state === "object").toBe(true);
  });

  test("resetSessionHints() and resetAll() do not throw", () => {
    expect(() => onboardingService.resetSessionHints()).not.toThrow();
    expect(() => onboardingService.resetAll({ persist: false })).not.toThrow();
  });
});

