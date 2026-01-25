import { jest } from "@jest/globals";

import { locationScheduler } from "../../../services/location/LocationScheduler.js";

describe("LocationScheduler", () => {
  let addDocSpy;
  let removeDocSpy;
  let addWinSpy;
  let removeWinSpy;

  beforeEach(() => {
    // Keep tests isolated even if a previous test failed mid-way
    try {
      locationScheduler.destroy();
    } catch (error) { console.debug("Suppressed error", error); }

    addDocSpy = jest
      .spyOn(document, "addEventListener")
      .mockImplementation(() => {});
    removeDocSpy = jest
      .spyOn(document, "removeEventListener")
      .mockImplementation(() => {});
    addWinSpy = jest.spyOn(window, "addEventListener").mockImplementation(() => {});
    removeWinSpy = jest
      .spyOn(window, "removeEventListener")
      .mockImplementation(() => {});

    jest.spyOn(locationScheduler, "isSharingEnabled").mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    try {
      locationScheduler.destroy();
    } catch (error) { console.debug("Suppressed error", error); }
  });

  test("start() registers listeners and destroy() removes the same handlers", () => {
    locationScheduler.start();

    const pageLoadHandler = addDocSpy.mock.calls.find(
      ([type]) => type === "spa:page:load"
    )?.[1];
    const pageUnloadHandler = addDocSpy.mock.calls.find(
      ([type]) => type === "spa:page:unload"
    )?.[1];
    const visibilityHandler = addDocSpy.mock.calls.find(
      ([type]) => type === "visibilitychange"
    )?.[1];
    const focusHandler = addWinSpy.mock.calls.find(([type]) => type === "focus")?.[1];
    const onlineHandler = addWinSpy.mock.calls.find(([type]) => type === "online")?.[1];
    const offlineHandler = addWinSpy.mock.calls.find(([type]) => type === "offline")?.[1];
    const storageHandler = addWinSpy.mock.calls.find(
      ([type]) => type === "storage"
    )?.[1];

    expect(typeof pageLoadHandler).toBe("function");
    expect(typeof pageUnloadHandler).toBe("function");
    expect(typeof visibilityHandler).toBe("function");
    expect(typeof focusHandler).toBe("function");
    expect(typeof onlineHandler).toBe("function");
    expect(typeof offlineHandler).toBe("function");
    expect(typeof storageHandler).toBe("function");

    locationScheduler.destroy();

    expect(removeDocSpy).toHaveBeenCalledWith("spa:page:load", pageLoadHandler);
    expect(removeDocSpy).toHaveBeenCalledWith("spa:page:unload", pageUnloadHandler);
    expect(removeDocSpy).toHaveBeenCalledWith("visibilitychange", visibilityHandler);
    expect(removeWinSpy).toHaveBeenCalledWith("focus", focusHandler);
    expect(removeWinSpy).toHaveBeenCalledWith("online", onlineHandler);
    expect(removeWinSpy).toHaveBeenCalledWith("offline", offlineHandler);
    expect(removeWinSpy).toHaveBeenCalledWith("storage", storageHandler);
  });

  test("start() is idempotent", () => {
    locationScheduler.start();
    const docCalls = addDocSpy.mock.calls.length;
    const winCalls = addWinSpy.mock.calls.length;

    locationScheduler.start();
    expect(addDocSpy.mock.calls.length).toBe(docCalls);
    expect(addWinSpy.mock.calls.length).toBe(winCalls);
  });
});

