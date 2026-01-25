import { jest } from "@jest/globals";

import { campusLocationService } from "../../../services/location/CampusLocationService.js";

describe("CampusLocationService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    try {
      campusLocationService.cleanupActivityDetection?.();
    } catch (error) { console.debug("Suppressed error", error); }
    try {
      campusLocationService.cleanupMobileLifecycleHandlers?.();
    } catch (error) { console.debug("Suppressed error", error); }
    try {
      campusLocationService.stopPresencePolling?.();
    } catch (error) { console.debug("Suppressed error", error); }
  });

  test("setupLifecycleTracking() is idempotent and removes prior handlers", () => {
    const addDocSpy = jest
      .spyOn(document, "addEventListener")
      .mockImplementation(() => {});
    const removeDocSpy = jest
      .spyOn(document, "removeEventListener")
      .mockImplementation(() => {});
    const addWinSpy = jest.spyOn(window, "addEventListener").mockImplementation(() => {});
    const removeWinSpy = jest
      .spyOn(window, "removeEventListener")
      .mockImplementation(() => {});

    campusLocationService._boundLifecycleVisibility = null;
    campusLocationService._boundLifecycleStorage = null;

    campusLocationService.setupLifecycleTracking();

    const firstVisibility = addDocSpy.mock.calls.find(
      ([type]) => type === "visibilitychange"
    )?.[1];
    const firstStorage = addWinSpy.mock.calls.find(
      ([type]) => type === "storage"
    )?.[1];

    expect(typeof firstVisibility).toBe("function");
    expect(typeof firstStorage).toBe("function");

    campusLocationService.setupLifecycleTracking();

    expect(removeDocSpy).toHaveBeenCalledWith(
      "visibilitychange",
      firstVisibility
    );
    expect(removeWinSpy).toHaveBeenCalledWith("storage", firstStorage);
  });
});

