import {
  applyQuickAccessOptimisticUpdate,
  buildQuickAccessCacheEntry,
} from "../../utils/friends/quickAccessOptimisticCache.js";

describe("quickAccessOptimisticCache", () => {
  test("buildQuickAccessCacheEntry returns null without an id", () => {
    expect(buildQuickAccessCacheEntry("", {})).toBeNull();
    expect(buildQuickAccessCacheEntry(null, {})).toBeNull();
  });

  test("buildQuickAccessCacheEntry builds a minimal entry for caching", () => {
    const entry = buildQuickAccessCacheEntry("abc", {
      handle: "alice",
      major: "CS",
      profilePhotoUrl: "https://example.com/photo.webp",
      avatarConfig: { seed: "x", style: "notionists" },
      useAvatar: true,
      friendshipId: "a_b",
    });

    expect(entry.friendId).toBe("abc");
    expect(entry.userId).toBe("abc");
    expect(entry.uid).toBe("abc");
    expect(entry.handle).toBe("alice");
    expect(entry.major).toBe("CS");
    expect(entry.profilePhotoUrl).toBe("https://example.com/photo.webp");
    expect(entry.avatarConfig).toEqual({ seed: "x", style: "notionists" });
    expect(entry.useAvatar).toBe(true);
    expect(entry.friendshipId).toBe("a_b");
    expect(entry.lastInteraction).toBeInstanceOf(Date);
  });

  test("applyQuickAccessOptimisticUpdate adds to front and de-dupes", () => {
    const entry1 = buildQuickAccessCacheEntry("a", { handle: "a" });
    const entry2 = buildQuickAccessCacheEntry("b", { handle: "b" });
    const entry1b = buildQuickAccessCacheEntry("a", { handle: "a2" });

    const list = applyQuickAccessOptimisticUpdate([entry1, entry2], entry1b, "add");
    expect(list.map((x) => x.friendId)).toEqual(["a", "b"]);
    expect(list[0].handle).toBe("a2");
  });

  test("applyQuickAccessOptimisticUpdate removes entries by id", () => {
    const entry1 = buildQuickAccessCacheEntry("a", { handle: "a" });
    const entry2 = buildQuickAccessCacheEntry("b", { handle: "b" });

    const list = applyQuickAccessOptimisticUpdate([entry1, entry2], entry1, "remove");
    expect(list.map((x) => x.friendId)).toEqual(["b"]);
  });
});

