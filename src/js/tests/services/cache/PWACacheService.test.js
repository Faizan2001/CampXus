import { pwaCache } from "../../../services/cache/PWACacheService.js";

describe("PWACacheService", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch (_) {}
  });

  test("set() and get() round-trip data", () => {
    const key = pwaCache.keys.userSchedule("u1");
    const ok = pwaCache.set(key, { hello: "world" }, 1000);
    expect(ok).toBe(true);

    const res = pwaCache.get(key);
    expect(res?.data).toEqual({ hello: "world" });
    expect(res?.isExpired).toBe(false);
  });
});

