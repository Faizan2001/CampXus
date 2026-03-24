import { jest } from "@jest/globals";

if (!globalThis.fetch) {
  globalThis.fetch = jest.fn();
}
if (!globalThis.Headers) {
  globalThis.Headers = class Headers {};
}
if (!globalThis.Request) {
  globalThis.Request = class Request {};
}
if (!globalThis.Response) {
  globalThis.Response = class Response {};
}

const { ScheduleStorageService } = await import(
  "../../services/schedule/ScheduleStorageService.js"
);
const { currentUser } = await import("../../store/userStore.js");
const { DEFAULT_TIMESLOTS } = await import("../../utils/constants.js");

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

  test("normalizes Ramadan-adjusted slots back to canonical IUB slots before save", async () => {
    const service = makeServiceWithMocks();

    await service.saveUserSchedule(userId, {
      timeSlots: [
        { start: "08:00", end: "09:15", label: "08:00-09:15" },
        { start: "09:20", end: "10:35", label: "09:20-10:35" },
        { start: "10:40", end: "11:55", label: "10:40-11:55" },
        { start: "12:00", end: "13:15", label: "12:00-13:15" },
        { start: "13:20", end: "14:35", label: "13:20-14:35" },
        { start: "14:40", end: "15:55", label: "14:40-15:55" },
      ],
    });

    const [, savedSchedule] = service.dataManager.saveUserSchedule.mock.calls[0];
    expect(savedSchedule.timeSlots).toEqual(DEFAULT_TIMESLOTS);
  });

  test("normalizes Ramadan-adjusted slots when converting Firestore data for the current user", () => {
    currentUser.setUser({ uid: userId, email: "test@iub.edu.bd" });
    currentUser.setProfile({ universityInfo: { university: "IUB" } });

    const service = makeServiceWithMocks();
    const result = service.convertToHomePageFormat(
      {
        schedule: {},
        slotInfo: {},
        pinnedSlots: {},
        timeBasedPins: {},
        timeSlots: [
          { start: "08:00", end: "09:15", label: "08:00-09:15" },
          { start: "09:20", end: "10:35", label: "09:20-10:35" },
          { start: "10:40", end: "11:55", label: "10:40-11:55" },
          { start: "12:00", end: "13:15", label: "12:00-13:15" },
          { start: "13:20", end: "14:35", label: "13:20-14:35" },
          { start: "14:40", end: "15:55", label: "14:40-15:55" },
        ],
      },
      userId
    );

    expect(result.users[userId].timeSlots).toEqual(DEFAULT_TIMESLOTS);
    currentUser.reset();
  });
});
