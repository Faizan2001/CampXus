import { ScheduleDataService } from "../../../services/schedule/ScheduleDataService.js";

describe("ScheduleDataService", () => {
  test("convertFirestoreToStandardFormat() returns empty schedule for invalid input", () => {
    const svc = new ScheduleDataService({ getUserSchedule: async () => null });
    const converted = svc.convertFirestoreToStandardFormat(null);
    expect(Array.isArray(converted.timeSlots)).toBe(true);
    expect(converted.timeSlots).toHaveLength(0);
    expect(converted.schedule).toHaveLength(7);
  });

  test("getUserSchedule() caches by userId", async () => {
    const dm = {
      getUserSchedule: async () => ({
        timeSlots: ["9:00"],
        schedule: { "0": { "0": true } },
        slotInfo: { "0": { "0": { courseCode: "CSC101", classroomNumber: "A1" } } },
        pinnedSlots: { "0": { "0": true } },
      }),
    };
    const svc = new ScheduleDataService(dm);
    const a = await svc.getUserSchedule("u1");
    const b = await svc.getUserSchedule("u1");
    expect(a).toBe(b);
    expect(a.timeSlots).toEqual(["9:00"]);
    expect(a.schedule[0][0]).toBe(true);
  });

  test("getUserSchedule() wraps failures in ScheduleLoadError", async () => {
    const dm = {
      getUserSchedule: async () => {
        throw new Error("boom");
      },
    };
    const svc = new ScheduleDataService(dm);
    await expect(svc.getUserSchedule("u1")).rejects.toMatchObject({
      name: "ScheduleLoadError",
    });
  });

  test("convertFirestoreToStandardFormat() handles larger schedules without shared slotInfo references", () => {
    const svc = new ScheduleDataService({ getUserSchedule: async () => null });
    const timeSlots = Array.from({ length: 60 }, (_, i) => `T${i}`);
    const converted = svc.convertFirestoreToStandardFormat({
      timeSlots,
      schedule: { "0": { "0": true } },
      slotInfo: { "0": { "0": { courseCode: "X", classroomNumber: "Y" } } },
      pinnedSlots: { "0": { "0": true } },
    });
    expect(converted.timeSlots).toHaveLength(60);
    expect(converted.schedule).toHaveLength(7);
    expect(converted.schedule[0]).toHaveLength(60);
    expect(converted.slotInfo[0]).toHaveLength(60);
    // Ensure different slots do not share the same object reference
    expect(converted.slotInfo[0][1]).not.toBe(converted.slotInfo[0][2]);
  });
});
