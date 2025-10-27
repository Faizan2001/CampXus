import { DEFAULT_TIMESLOTS } from "../../utils/constants.js";

// Pad helper
const pad2 = (n) => String(n).padStart(2, "0");

// Convert HH:mm to HHmm-HHmm string
function toTimeSlotId(startHHmm, endHHmm) {
  const [sh, sm] = startHHmm.split(":");
  const [eh, em] = endHHmm.split(":");
  return `${pad2(sh)}${pad2(sm)}-${pad2(eh)}${pad2(em)}`;
}

// Try to snap times to known DEFAULT_TIMESLOTS when they nearly match
function snapToDefaultSlots(start, end) {
  const asMin = (t) => {
    const [h, m] = t.split(":").map((x) => parseInt(x, 10));
    return h * 60 + m;
  };
  const sm = asMin(start);
  const em = asMin(end);
  let best = null;
  let bestDelta = Infinity;
  for (const s of DEFAULT_TIMESLOTS) {
    const ds = Math.abs(asMin(s.start) - sm);
    const de = Math.abs(asMin(s.end) - em);
    const delta = ds + de;
    if (delta < bestDelta) {
      best = s;
      bestDelta = delta;
    }
  }
  // If within 2 minutes total difference, snap
  if (best && bestDelta <= 2) {
    return { start: best.start, end: best.end };
  }
  return { start, end };
}

// Normalize classroom string (uppercase, remove spaces/hyphens)
function normalizeClassroom(room) {
  if (!room || typeof room !== "string") return "";
  const up = room.toUpperCase().trim();
  return up.replace(/\s+/g, "").replace(/-/g, "");
}

// Decide if courseName looks truncated/low-quality (fallback to code for display slug)
function isTruncatedOrLowQuality(name) {
  if (!name || typeof name !== "string") return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/\.\.\.$/.test(trimmed)) return true; // ends with ...
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 3) return true;
  const alphaRatio = trimmed.replace(/[^A-Za-z]/g, "").length / trimmed.length;
  return alphaRatio < 0.5; // heuristic
}

// Convert parsed course from UniversityParser to normalized entry for users.courses[]
export function normalizeCourseForSave(parsed, opts = {}) {
  if (!parsed) return null;
  const courseNameRaw = String(parsed.courseName || "").trim();
  const courseCode = parsed.courseCode ? String(parsed.courseCode).trim() : undefined;
  const section = typeof parsed.section === "number" ? parsed.section : parseInt(parsed.section || 0, 10) || 0;
  const dayPattern = String(parsed.dayCode || "").toUpperCase().trim();
  const room = normalizeClassroom(parsed.room || parsed.classroom || "");
  let timeStart = String(parsed.startTime || "").trim();
  let timeEnd = String(parsed.endTime || "").trim();

  if (timeStart && timeEnd) {
    const snapped = snapToDefaultSlots(timeStart, timeEnd);
    timeStart = snapped.start;
    timeEnd = snapped.end;
  }

  const timeSlot = timeStart && timeEnd ? toTimeSlotId(timeStart, timeEnd) : "";

  const courseNameNorm = courseNameRaw
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    courseName: courseNameNorm,
    courseCode,
    section,
    dayPattern,
    timeStart,
    timeEnd,
    timeSlot,
    classroom: room,
  };
}

// Build canonical spaceId; display/title should be decided separately
export function buildSpaceKey(course, university) {
  if (!course || !university) return "";
  if (!course.section || !course.dayPattern || !course.timeSlot || !course.classroom) return "";
  const uni = String(university).toLowerCase().trim();
  const sectionKey = String(course.section).padStart(2, "0");
  // Use courseCode fallback when name looks truncated/low
  const useCode = !course.courseName || isTruncatedOrLowQuality(course.courseName);
  const nameSlug = useCode && course.courseCode
    ? String(course.courseCode).toLowerCase()
    : String(course.courseName || "").replace(/\s+/g, "-").toLowerCase();
  const day = String(course.dayPattern).toUpperCase();
  const slot = String(course.timeSlot);
  const room = String(course.classroom).toUpperCase();
  return `${uni}__${nameSlug}__sec${sectionKey}__${day}__${slot}__${room}`;
}

export function chooseDisplayName(courses) {
  if (!Array.isArray(courses) || courses.length === 0) return { title: "" };
  // Majority vote on name; fallback to code
  const counts = new Map();
  for (const c of courses) {
    const key = c.courseName || c.courseCode || "";
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) {
      best = k; bestCount = v;
    }
  }
  return { title: best };
}

export default {
  normalizeCourseForSave,
  buildSpaceKey,
  chooseDisplayName,
};

