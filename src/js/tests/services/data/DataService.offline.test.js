import { jest } from "@jest/globals";

import { dataManager } from "../../../services/data/DataService.js";
import { notificationManager } from "../../../services/realtime/NotificationService.js";

describe("DataService offline/online handling", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test("offline handler sets isOnline=false and shows warning", () => {
    const showSpy = jest
      .spyOn(notificationManager, "show")
      .mockImplementation(() => {});

    dataManager.isOnline = true;
    expect(typeof dataManager._boundOffline).toBe("function");

    dataManager._boundOffline();

    expect(dataManager.isOnline).toBe(false);
    expect(showSpy).toHaveBeenCalled();
  });

  test("online handler sets isOnline=true and triggers pending operations processing", () => {
    const showSpy = jest
      .spyOn(notificationManager, "show")
      .mockImplementation(() => {});
    const processSpy = jest
      .spyOn(dataManager, "processPendingOperations")
      .mockImplementation(() => Promise.resolve());

    dataManager.isOnline = false;
    expect(typeof dataManager._boundOnline).toBe("function");

    dataManager._boundOnline();

    expect(dataManager.isOnline).toBe(true);
    expect(showSpy).toHaveBeenCalled();
    expect(processSpy).toHaveBeenCalled();
  });
});

