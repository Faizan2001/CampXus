import { DEFAULT_TIMESLOTS } from "../../utils/constants.js";

export const PRESENCE_STATES = {
  IN_CLASS: "IN_CLASS",
  FREE_ON_CAMPUS: "FREE_ON_CAMPUS",
  OFF_CAMPUS: "OFF_CAMPUS",
  NO_CLASSES: "NO_CLASSES",
  UNKNOWN_NO_DATA: "UNKNOWN_NO_DATA",
  UNKNOWN_PRIVATE: "UNKNOWN_PRIVATE",
};

export const PRESENCE_CONFIG = {
  MAX_CAMPUS_GAP_MINUTES: 180,
  LAST_CLASS_FREE_WINDOW_MINUTES: 20,
  POST_CLASS_TIMEOUT_MINUTES: 120,
  GPS_PRIORITY_WINDOW_MINUTES: 30,
  STATUS_UPDATE_INTERVAL_MS: 60000,
  SCHEDULE_CACHE_TTL_MS: 300000,
  STATUS_CACHE_TTL_MS: 60000,
  MAX_FRIENDS_PER_BATCH: 50,
  SCROLL_DEBOUNCE_MS: 500,
};

export class SchedulePresenceService {
  /**
   * Derive a friend's presence status based on privacy, GPS, and schedule data.
   * @param {Object} friend
   * @param {Date} [now]
   * @returns {Object} status payload
   */
  static deriveStatus(friend = {}, now = new Date()) {
    const safeNow = getSafeDate(now);
    const baseMetadata = {
      source: "none",
      hasSchedule: false,
      hasFreshGPS: false,
      inDayGap: false,
      nextClassTime: null,
      currentClassEnd: null,
      postClassTimeoutReached: false,
    };

    if (!friend || friend.isRestricted) {
      return {
        state: PRESENCE_STATES.UNKNOWN_PRIVATE,
        pillText: "PRIVATE",
        color: "grey",
        metadata: baseMetadata,
      };
    }

    const gpsInfo = deriveGpsInfo(friend, safeNow);
    const scheduleContext = deriveScheduleContext(friend, safeNow);
    const status = {
      state: PRESENCE_STATES.UNKNOWN_NO_DATA,
      pillText: "NO DATA",
      color: "grey",
      metadata: {
        ...baseMetadata,
        hasSchedule: scheduleContext.hasSchedule,
        inDayGap: scheduleContext.inGap,
        nextClassTime: scheduleContext.nextClass
          ? new Date(scheduleContext.nextClass.start)
          : null,
        currentClassEnd: scheduleContext.currentClass
          ? new Date(scheduleContext.currentClass.end)
          : null,
        hasFreshGPS: gpsInfo.isFresh,
        postClassTimeoutReached: scheduleContext.postClassTimeoutReached,
      },
    };

    // Privacy already handled, now apply GPS priority rules
    if (gpsInfo.effectiveStatus === "on") {
      if (scheduleContext.scheduleState === "in_class") {
        status.state = PRESENCE_STATES.IN_CLASS;
        status.pillText = "CLASS";
        status.color = "blue";
        status.metadata.source = scheduleContext.hasSchedule ? "mixed" : "gps";
      } else {
        status.state = PRESENCE_STATES.FREE_ON_CAMPUS;
        status.pillText = "FREE";
        status.color = "green";
        status.metadata.source = "gps";
      }
      return status;
    }

    if (gpsInfo.effectiveStatus === "off") {
      status.state = PRESENCE_STATES.OFF_CAMPUS;
      status.pillText = "OFF CAMPUS";
      status.color = "red";
      status.metadata.source = "gps";
      return status;
    }

    // GPS unknown - rely on schedule/fallback
    const getMinutesToNextClass = () => {
      try {
        const next = scheduleContext.nextClass;
        if (!next || !(next.start instanceof Date)) return Infinity;
        return getMinutesBetween(next.start, safeNow);
      } catch {
        return Infinity;
      }
    };

    switch (scheduleContext.scheduleState) {
      case "in_class":
        status.state = PRESENCE_STATES.IN_CLASS;
        status.pillText = "CLASS";
        status.color = "blue";
        status.metadata.source = "schedule";
        break;
      case "between_classes":
        status.state = PRESENCE_STATES.FREE_ON_CAMPUS;
        status.pillText = "FREE";
        status.color = "green";
        status.metadata.source = "schedule";
        break;
      case "no_class_now_but_later":
        status.state = PRESENCE_STATES.NO_CLASSES;
        status.pillText = "CLASS LATER";
        // Within 30 minutes of next class, clarify as "CLASS SOON"
        {
          const minutesToNext = getMinutesToNextClass();
          if (minutesToNext > 0 && minutesToNext <= 30) {
            status.pillText = "CLASS SOON";
          }
        }
        status.color = "grey";
        status.metadata.source = "schedule";
        break;
      case "no_classes_today":
        status.state = PRESENCE_STATES.NO_CLASSES;
        status.pillText = "NO CLASSES";
        status.color = "grey";
        status.metadata.source = "schedule";
        break;
      case "no_schedule_data":
      default:
        status.state = PRESENCE_STATES.UNKNOWN_NO_DATA;
        status.pillText = "NO DATA";
        status.color = "grey";
        status.metadata.source = "none";
        break;
    }

    return status;
  }

  /**
   * Derive statuses for an array of friends.
   * @param {Array} friends
   * @param {Date} [now]
   * @returns {Object} Map of friendId -> status payload
   */
  static deriveStatusForFriends(friends = [], now = new Date()) {
    if (!Array.isArray(friends) || friends.length === 0) {
      return {};
    }

    const limit = Math.min(
      friends.length,
      PRESENCE_CONFIG.MAX_FRIENDS_PER_BATCH
    );
    const statuses = {};
    for (let i = 0; i < limit; i++) {
      const friend = friends[i];
      const key = getFriendIdentifier(friend, i);
      statuses[key] = SchedulePresenceService.deriveStatus(friend, now);
    }
    return statuses;
  }
}

function getFriendIdentifier(friend, fallbackIndex) {
  if (!friend) return `unknown_${fallbackIndex}`;
  return (
    friend.friendId ||
    friend.userId ||
    friend.uid ||
    friend.id ||
    `friend_${fallbackIndex}`
  );
}

function getSafeDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}

function deriveGpsInfo(friend, now) {
  const rawStatus =
    typeof friend.gpsStatus === "string"
      ? friend.gpsStatus.toLowerCase()
      : "unknown";
  const lastGps = normalizeTimestamp(friend.lastGpsAt);
  const minutesSinceGps =
    lastGps instanceof Date ? getMinutesBetween(now, lastGps) : Infinity;
  const isStatusCandidate = rawStatus === "on" || rawStatus === "off";
  const isFresh =
    isStatusCandidate &&
    minutesSinceGps <= PRESENCE_CONFIG.GPS_PRIORITY_WINDOW_MINUTES;

  return {
    effectiveStatus: isFresh ? rawStatus : "unknown",
    isFresh,
  };
}

function deriveScheduleContext(friend, now) {
  const payload = resolveSchedulePayload(friend);
  if (!payload.hasSchedule) {
    return {
      scheduleState: "no_schedule_data",
      hasSchedule: false,
      classes: [],
      currentClass: null,
      nextClass: null,
      previousClass: null,
      inGap: false,
      minutesSinceLastClass: null,
      postClassTimeoutReached: false,
    };
  }

  const dayIndex = now.getDay();
  const daySchedule = Array.isArray(payload.scheduleMatrix[dayIndex])
    ? payload.scheduleMatrix[dayIndex]
    : [];
  const classes = buildClassesForDay(daySchedule, payload.timeSlots, now);
  const sortedClasses = classes.sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  if (sortedClasses.length === 0) {
    return {
      scheduleState: "no_classes_today",
      hasSchedule: true,
      classes: [],
      currentClass: null,
      nextClass: null,
      previousClass: null,
      inGap: false,
      minutesSinceLastClass: null,
      postClassTimeoutReached: false,
    };
  }

  const nowMs = now.getTime();
  let currentClass = null;
  let previousClass = null;
  let nextClass = null;
  let minutesSinceLastClass = null;
  let postClassTimeoutReached = false;

  for (let i = 0; i < sortedClasses.length; i++) {
    const cls = sortedClasses[i];
    const startMs = cls.start.getTime();
    const endMs = cls.end.getTime();

    if (nowMs >= startMs && nowMs < endMs) {
      currentClass = cls;
      nextClass = sortedClasses[i + 1] || null;
      previousClass = sortedClasses[i - 1] || previousClass;
      break;
    }

    if (endMs <= nowMs) {
      previousClass = cls;
      continue;
    }

    if (startMs > nowMs) {
      nextClass = cls;
      break;
    }
  }

  let scheduleState = "no_classes_today";
  let inGap = false;

  if (currentClass) {
    scheduleState = "in_class";
  }

  if (previousClass && !currentClass && !nextClass) {
    minutesSinceLastClass = getMinutesBetween(now, previousClass.end);
    if (Number.isFinite(minutesSinceLastClass)) {
      postClassTimeoutReached =
        minutesSinceLastClass >= PRESENCE_CONFIG.POST_CLASS_TIMEOUT_MINUTES;
    } else {
      minutesSinceLastClass = null;
    }
  }

  if (currentClass) {
    scheduleState = "in_class";
  } else if (previousClass && nextClass) {
    const gapMinutes = getMinutesBetween(nextClass.start, previousClass.end);
    if (gapMinutes <= PRESENCE_CONFIG.MAX_CAMPUS_GAP_MINUTES) {
      scheduleState = "between_classes";
      inGap = true;
    } else {
      scheduleState = "no_class_now_but_later";
    }
  } else if (!previousClass && nextClass) {
    scheduleState = "no_class_now_but_later";
  } else if (previousClass && !nextClass) {
    if (
      Number.isFinite(minutesSinceLastClass) &&
      minutesSinceLastClass <= PRESENCE_CONFIG.LAST_CLASS_FREE_WINDOW_MINUTES
    ) {
      // Keep users as "FREE" briefly after their final class since they may still be on campus.
      scheduleState = "between_classes";
      inGap = true;
    } else {
      scheduleState = "no_classes_today";
    }
  }

  return {
    scheduleState,
    hasSchedule: true,
    classes: sortedClasses,
    currentClass,
    nextClass,
    previousClass,
    inGap,
    minutesSinceLastClass,
    postClassTimeoutReached,
  };
}

function buildClassesForDay(daySchedule, timeSlots, now) {
  if (!Array.isArray(daySchedule) || daySchedule.length === 0) {
    return [];
  }

  const slots =
    Array.isArray(timeSlots) && timeSlots.length
      ? timeSlots
      : DEFAULT_TIMESLOTS;

  const limit = Math.min(daySchedule.length, slots.length);
  const classes = [];
  for (let i = 0; i < limit; i++) {
    if (!daySchedule[i]) continue;
    const slot = slots[i];
    const start = buildDateFromSlot(now, slot?.start);
    const end = buildDateFromSlot(now, slot?.end);
    if (!start || !end) continue;
    classes.push({
      start,
      end,
      slotIndex: i,
    });
  }

  return classes;
}

function buildDateFromSlot(now, timeString) {
  if (!timeString || typeof timeString !== "string") {
    return null;
  }
  const parts = timeString.split(":");
  if (parts.length < 2) return null;
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  const date = new Date(now.getTime());
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function resolveSchedulePayload(friend) {
  if (!friend) {
    return {
      hasSchedule: false,
      scheduleMatrix: null,
      timeSlots: DEFAULT_TIMESLOTS,
    };
  }

  const scheduleMatrix =
    extractScheduleMatrix(friend) ||
    extractScheduleMatrix(friend.schedule) ||
    extractScheduleMatrix(friend.scheduleData) ||
    extractScheduleMatrix(friend.scheduleDoc);

  const timeSlots =
    extractTimeSlots(friend) ||
    extractTimeSlots(friend.schedule) ||
    extractTimeSlots(friend.scheduleData) ||
    DEFAULT_TIMESLOTS;

  return {
    hasSchedule: Array.isArray(scheduleMatrix),
    scheduleMatrix: scheduleMatrix || [],
    timeSlots,
  };
}

function extractScheduleMatrix(source) {
  if (!source) return null;
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.schedule)) return source.schedule;
  if (Array.isArray(source?.scheduleMatrix)) return source.scheduleMatrix;
  if (Array.isArray(source?.matrix)) return source.matrix;
  if (Array.isArray(source?.data)) return source.data;
  return null;
}

function extractTimeSlots(source) {
  if (!source) return null;
  if (Array.isArray(source.timeSlots) && source.timeSlots.length > 0) {
    return source.timeSlots;
  }
  if (Array.isArray(source.slotDefinitions) && source.slotDefinitions.length) {
    return source.slotDefinitions;
  }
  return null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (
      typeof value.seconds === "number" &&
      typeof value.nanoseconds === "number"
    ) {
      const ms = value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function getMinutesBetween(later, earlier) {
  if (!(later instanceof Date) || !(earlier instanceof Date)) {
    return Infinity;
  }
  return Math.max(0, (later.getTime() - earlier.getTime()) / 60000);
}
