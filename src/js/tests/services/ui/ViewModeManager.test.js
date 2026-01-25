import { jest } from "@jest/globals";

import viewModeManager from "../../../services/ui/ViewModeManager.js";

describe("ViewModeManager", () => {
  test("does not expose window globals in test environment", () => {
    expect(window.viewModeManager).toBeUndefined();
    expect(window.testViewModeManager).toBeUndefined();
  });

  test("initialize() rejects when required DOM elements are missing", async () => {
    jest.useFakeTimers();
    const promise = viewModeManager.initialize("day", false);
    // Avoid Jest unhandled rejection warnings while we advance timers.
    promise.catch(() => {});
    await jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow();
    jest.useRealTimers();
  });
});
