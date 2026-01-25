import { ComparisonService } from "../../../services/schedule/ComparisonService.js";

describe("ComparisonService", () => {
  test("getSlotComparison() returns no-users status when empty", () => {
    const svc = new ComparisonService();
    const res = svc.getSlotComparison(0, 0);
    expect(res.status).toBe("no-users");
  });

  test("getSlotComparison() detects all-free vs all-busy", () => {
    const svc = new ComparisonService();
    svc.setUsersForComparison([
      { id: "u1", schedule: [[false]], timeSlots: ["9:00"] },
      { id: "u2", schedule: [[false]], timeSlots: ["9:00"] },
    ]);
    expect(svc.getSlotComparison(0, 0).status).toBe("all-free");

    svc.setUsersForComparison([
      { id: "u1", schedule: [[true]], timeSlots: ["9:00"] },
      { id: "u2", schedule: [[true]], timeSlots: ["9:00"] },
    ]);
    expect(svc.getSlotComparison(0, 0).status).toBe("all-busy");
  });
});

