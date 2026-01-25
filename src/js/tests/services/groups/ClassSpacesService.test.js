import { ClassSpacesService } from "../../../services/groups/ClassSpacesService.js";

describe("ClassSpacesService", () => {
  test("isLocalhost() returns a boolean", () => {
    const svc = new ClassSpacesService();
    expect(typeof svc.isLocalhost()).toBe("boolean");
  });
});

