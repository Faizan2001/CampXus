import { normalizeCourseForSave, buildSpaceKey } from "../../utils/schedule/courseNormalization.js";

describe("courseNormalization", () => {
  test("normalizes parsed course to compact entry", () => {
    const parsed = {
      courseName: "Introduction to Computer Science",
      courseCode: "CSC101",
      section: 2,
      dayCode: "MW",
      room: "NAC 902",
      startTime: "11:20",
      endTime: "12:50",
    };
    const n = normalizeCourseForSave(parsed);
    expect(n).toMatchObject({
      courseName: "introduction to computer science",
      courseCode: "CSC101",
      section: 2,
      dayPattern: "MW",
      timeStart: "11:20",
      timeEnd: "12:50",
      timeSlot: "1120-1250",
      classroom: "NAC902",
    });
  });

  test("builds space key using code fallback when name is truncated", () => {
    const course = {
      courseName: "intro to...",
      courseCode: "CSC101",
      section: 2,
      dayPattern: "MW",
      timeSlot: "1120-1250",
      classroom: "NAC902",
    };
    const key = buildSpaceKey(course, "iub");
    expect(key).toContain("iub__csc101__sec02__MW__1120-1250__NAC902");
  });
});
