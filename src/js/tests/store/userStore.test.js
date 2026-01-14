import { currentUser } from "../../store/userStore.js";

describe("currentUser.getDisplayInfo", () => {
  afterEach(() => {
    currentUser.reset(false);
  });

  test("prefers nested profile.useAvatar when present", () => {
    currentUser.setUser({ uid: "u1", email: "u1@example.com" });
    currentUser.setProfile({
      profile: {
        handle: "u1",
        email: "u1@example.com",
        useAvatar: true,
        profilePhotoUrl: "https://example.com/photo.jpg",
      },
      avatarConfig: { seed: "abc" },
    });

    const info = currentUser.getDisplayInfo();
    expect(info.useAvatar).toBe(true);
  });

  test("falls back to legacy top-level useAvatar when nested is missing", () => {
    currentUser.setUser({ uid: "u2", email: "u2@example.com" });
    currentUser.setProfile({
      profile: {
        handle: "u2",
        email: "u2@example.com",
      },
      useAvatar: true,
    });

    const info = currentUser.getDisplayInfo();
    expect(info.useAvatar).toBe(true);
  });
});

