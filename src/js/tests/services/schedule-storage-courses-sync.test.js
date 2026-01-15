import { jest } from "@jest/globals";
import { ScheduleStorageService } from "../../services/schedule/ScheduleStorageService.js";

describe("ScheduleStorageService users.courses sync", () => {
  const userId = "user_123";

  function makeServiceWithMocks() {
    const service = new ScheduleStorageService();
    service.isOnline = true;
    service.dataManager = {
      saveUserSchedule: jest.fn().mockResolvedValue({ success: true }),
      updateUserCourses: jest.fn().mockResolvedValue({ success: true }),
    };
    return service;
  }

  test("writes empty users.courses when courses field present but empty", async () => {
    const service = makeServiceWithMocks();
    await service.saveUserSchedule(userId, { courses: [] });
    expect(service.dataManager.updateUserCourses).toHaveBeenCalledWith(
      userId,
      []
    );
  });

  test("writes empty users.courses when courses field present but normalizes to 0 valid entries", async () => {
    const service = makeServiceWithMocks();
    await service.saveUserSchedule(userId, {
      courses: [
        {
          courseName: "some course",
          courseCode: "CSC101",
          section: 1,
          dayCode: "MW",
          room: "ONLINE",
          startTime: "09:40",
          endTime: "11:10",
        },
      ],
    });
    expect(service.dataManager.updateUserCourses).toHaveBeenCalledWith(
      userId,
      []
    );
  });

  test("writes normalized users.courses when valid entries exist", async () => {
    const service = makeServiceWithMocks();
    await service.saveUserSchedule(userId, {
      courses: [
        {
          courseName: "introduction to computer science",
          courseCode: "CSC101",
          section: 2,
          dayCode: "MW",
          room: "NAC-902",
          startTime: "11:20",
          endTime: "12:50",
        },
      ],
    });

    expect(service.dataManager.updateUserCourses).toHaveBeenCalledTimes(1);
    const [, normalized] = service.dataManager.updateUserCourses.mock.calls[0];
    expect(Array.isArray(normalized)).toBe(true);
    expect(normalized.length).toBe(1);
    expect(normalized[0]).toMatchObject({
      courseCode: "CSC101",
      section: 2,
      dayPattern: "MW",
      timeSlot: "1120-1250",
      classroom: "NAC902",
    });
  });

  test("skips users.courses update when courses field absent on schedule save", async () => {
    const service = makeServiceWithMocks();
    await service.saveUserSchedule(userId, { timeSlots: {} });
    expect(service.dataManager.updateUserCourses).not.toHaveBeenCalled();
  });
});

