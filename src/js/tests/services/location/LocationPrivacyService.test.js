import { jest } from "@jest/globals";

const friendshipPath = new URL(
  "../../../services/friends/FriendshipPrivacyService.js",
  import.meta.url
).pathname;
const dataServicePath = new URL(
  "../../../services/data/DataService.js",
  import.meta.url
).pathname;
const campusLocationPath = new URL(
  "../../../services/location/CampusLocationService.js",
  import.meta.url
).pathname;
const userStorePath = new URL(
  "../../../store/userStore.js",
  import.meta.url
).pathname;
const realtimePath = new URL(
  "../../../services/realtime/RealtimeService.js",
  import.meta.url
).pathname;

const isLocationVisible = jest.fn();
const updateLocationVisibility = jest.fn();
const getMyFriends = jest.fn();

jest.unstable_mockModule(friendshipPath, () => ({
  friendshipPrivacyService: {
    isLocationVisible,
    updateLocationVisibility,
  },
}));

jest.unstable_mockModule(dataServicePath, () => ({
  dataManager: {
    friendships: {
      getMyFriends,
    },
  },
}));

jest.unstable_mockModule(campusLocationPath, () => ({
  campusLocationService: {},
}));

jest.unstable_mockModule(userStorePath, () => ({
  currentUser: {},
}));

jest.unstable_mockModule(realtimePath, () => ({
  realTimeManager: {},
}));

const { locationPrivacyService } = await import(
  "../../../services/location/LocationPrivacyService.js"
);

describe("LocationPrivacyService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    locationPrivacyService.privacyStateCache?.clear?.();
    locationPrivacyService.locationCache?.clear?.();
    locationPrivacyService.globalPreferencesCache?.clear?.();
    locationPrivacyService.cacheExpiry = 60 * 60 * 1000; // 1h for stable tests
  });

  test("canAccessLocation() caches access checks", async () => {
    isLocationVisible.mockResolvedValue(true);

    const first = await locationPrivacyService.canAccessLocation("viewer", "target");
    expect(first).toBe(true);
    expect(isLocationVisible).toHaveBeenCalledTimes(1);
    expect(isLocationVisible).toHaveBeenCalledWith("target", "viewer");

    const second = await locationPrivacyService.canAccessLocation("viewer", "target");
    expect(second).toBe(true);
    expect(isLocationVisible).toHaveBeenCalledTimes(1);
  });

  test("canAccessLocation() returns false for invalid IDs without calling dependencies", async () => {
    expect(await locationPrivacyService.canAccessLocation("", "x")).toBe(false);
    expect(await locationPrivacyService.canAccessLocation("x", "")).toBe(false);
    expect(isLocationVisible).not.toHaveBeenCalled();
  });
});

