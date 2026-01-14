import { jest } from "@jest/globals";

import SPARouter from "../../router/Router.js";
import { currentUser } from "../../store/userStore.js";

describe("Router auth guard (integration)", () => {
  test("does not allow protected route access without Firebase auth, even if userStore is set", async () => {
    // Avoid router auto-redirect logic interfering with this focused test.
    const authHandlingSpy = jest
      .spyOn(SPARouter.prototype, "setupAuthStateHandling")
      .mockImplementation(() => {});

    document.body.innerHTML = `<div class="main-content"></div>`;

    const router = new SPARouter();
    router.loadPage = jest.fn(async () => {});

    // Simulate a buggy/optimistic state where the store thinks we are logged in,
    // but Firebase auth is not actually authenticated.
    currentUser.setUser({ uid: "cached-uid", email: "cached@example.com" });

    await router.navigateTo("home", false);

    expect(router.loadPage).toHaveBeenCalledTimes(1);
    expect(router.loadPage.mock.calls[0][0]).toBe("landing");

    // Cleanup
    currentUser.reset();
    authHandlingSpy.mockRestore();
  });
});
