import { jest } from "@jest/globals";

import { AnalyticsService } from "../../../services/analytics/AnalyticsService.js";

describe("AnalyticsService", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.dataLayer = [];
    window.gtag = jest.fn();
  });

  test("trackPageView() does not throw", () => {
    expect(() => {
      AnalyticsService.trackPageView("home", "#home");
    }).not.toThrow();
  });
});

