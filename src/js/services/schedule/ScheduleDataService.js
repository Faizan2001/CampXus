// services/ScheduleDataService.js
export class ScheduleDataService {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.cache = new Map();
  }

  async getUserSchedule(userId) {
    if (this.cache.has(userId)) {
      return this.cache.get(userId);
    }

    try {
      const rawData = await this.dataManager.getUserSchedule(userId);
      const standardizedData = this.convertFirestoreToStandardFormat(rawData);
      this.cache.set(userId, standardizedData);
      return standardizedData;
    } catch (error) {
      console.error(`Failed to load schedule for ${userId}:`, error);
      throw new ScheduleLoadError(
        `Unable to load schedule for user ${userId}`,
        error
      );
    }
  }

  convertFirestoreToStandardFormat(firestoreData) {
    if (!firestoreData || typeof firestoreData !== "object") {
      return this.createEmptySchedule();
    }

    try {
      const numSlots =
        firestoreData.timeSlots?.length || DEFAULT_TIMESLOTS.length;

      return {
        timeSlots: firestoreData.timeSlots || DEFAULT_TIMESLOTS,
        schedule: this.convertScheduleMatrix(firestoreData.schedule, numSlots),
        slotInfo: this.convertSlotInfoMatrix(firestoreData.slotInfo, numSlots),
        pinnedSlots: this.convertPinnedSlotsMatrix(
          firestoreData.pinnedSlots,
          numSlots
        ),
      };
    } catch (error) {
      console.error("Error converting Firestore data:", error);
      return this.createEmptySchedule();
    }
  }

  convertScheduleMatrix(scheduleData, numSlots) {
    if (!scheduleData || typeof scheduleData !== "object") {
      return this.createWeeklyMatrix(numSlots, false);
    }

    const matrix = [];
    for (let day = 0; day < 7; day++) {
      const dayData = scheduleData[day.toString()];
      const dayArray = [];

      if (dayData && typeof dayData === "object") {
        for (let slot = 0; slot < numSlots; slot++) {
          dayArray[slot] = Boolean(dayData[slot.toString()]);
        }
      } else {
        dayArray.fill(false, 0, numSlots);
      }

      matrix[day] = dayArray;
    }
    return matrix;
  }

  convertSlotInfoMatrix(slotInfoData, numSlots) {
    if (!slotInfoData || typeof slotInfoData !== "object") {
      return this.createWeeklyMatrix(numSlots, () => ({
        courseCode: "",
        classroomNumber: "",
      }));
    }

    const matrix = [];
    for (let day = 0; day < 7; day++) {
      const dayData = slotInfoData[day.toString()];
      const dayArray = [];

      if (dayData && typeof dayData === "object") {
        for (let slot = 0; slot < numSlots; slot++) {
          const slotData = dayData[slot.toString()];
          dayArray[slot] =
            slotData && typeof slotData === "object"
              ? {
                  courseCode: slotData.courseCode || "",
                  classroomNumber: slotData.classroomNumber || "",
                }
              : { courseCode: "", classroomNumber: "" };
        }
      } else {
        // Create a fresh object per slot to avoid shared references
        for (let slot = 0; slot < numSlots; slot++) {
          dayArray[slot] = { courseCode: "", classroomNumber: "" };
        }
      }

      matrix[day] = dayArray;
    }
    return matrix;
  }

  convertPinnedSlotsMatrix(pinnedData, numSlots) {
    if (!pinnedData || typeof pinnedData !== "object") {
      return this.createWeeklyMatrix(numSlots, false);
    }

    const matrix = [];
    for (let day = 0; day < 7; day++) {
      const dayData = pinnedData[day.toString()];
      const dayArray = [];

      if (dayData && typeof dayData === "object") {
        for (let slot = 0; slot < numSlots; slot++) {
          dayArray[slot] = Boolean(dayData[slot.toString()]);
        }
      } else {
        dayArray.fill(false, 0, numSlots);
      }

      matrix[day] = dayArray;
    }
    return matrix;
  }

  createWeeklyMatrix(slots, defaultValue) {
    return Array.from({ length: 7 }, () =>
      Array.from({ length: slots }, () =>
        typeof defaultValue === "function" ? defaultValue() : defaultValue
      )
    );
  }

  createEmptySchedule() {
    const numSlots = DEFAULT_TIMESLOTS.length;
    return {
      timeSlots: DEFAULT_TIMESLOTS,
      schedule: this.createWeeklyMatrix(numSlots, false),
      slotInfo: this.createWeeklyMatrix(numSlots, () => ({
        courseCode: "",
        classroomNumber: "",
      })),
      pinnedSlots: this.createWeeklyMatrix(numSlots, false),
    };
  }

  clearCache() {
    this.cache.clear();
  }

  getCachedSchedule(userId) {
    return this.cache.get(userId);
  }
}

export class ScheduleLoadError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = "ScheduleLoadError";
    this.originalError = originalError;
  }
}
