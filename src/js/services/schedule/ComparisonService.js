// services/schedule/ComparisonService.js
export class ComparisonService {
  constructor() {
    this.selectedUsers = new Map();
    this.comparisonCache = new Map();
  }

  /**
   * Add users to comparison
   * @param {Array} users - Array of user objects with schedule data
   */
  setUsersForComparison(users) {
    this.selectedUsers.clear();
    this.comparisonCache.clear();

    users.forEach((user) => {
      if (user && user.id && user.schedule) {
        this.selectedUsers.set(user.id, user);
      }
    });
  }

  /**
   * Get comparison status for a specific time slot
   * @param {number} dayIndex - Day of week (0-6)
   * @param {number} timeIndex - Time slot index
   * @returns {Object} Comparison result with status, users, and metadata
   */
  getSlotComparison(dayIndex, timeIndex) {
    const cacheKey = `${dayIndex}-${timeIndex}`;

    if (this.comparisonCache.has(cacheKey)) {
      return this.comparisonCache.get(cacheKey);
    }

    const comparison = this.calculateSlotComparison(dayIndex, timeIndex);
    this.comparisonCache.set(cacheKey, comparison);

    return comparison;
  }

  calculateSlotComparison(dayIndex, timeIndex) {
    if (this.selectedUsers.size === 0) {
      return {
        status: "no-users",
        cssClass: "no-comparison",
        icon: "fas fa-question",
        text: "No users selected",
        tooltip: "Select users to compare schedules",
        busyUsers: [],
        freeUsers: [],
        totalUsers: 0,
      };
    }

    const users = Array.from(this.selectedUsers.values());
    const busyUsers = [];
    const freeUsers = [];

    users.forEach((user) => {
      if (this.isUserBusyAtSlot(user, dayIndex, timeIndex)) {
        busyUsers.push(user);
      } else {
        freeUsers.push(user);
      }
    });

    return this.determineComparisonStatus(busyUsers, freeUsers, users.length);
  }

  isUserBusyAtSlot(user, dayIndex, timeIndex) {
    try {
      return Boolean(user.schedule?.[dayIndex]?.[timeIndex]);
    } catch (error) {
      console.warn(`Error checking schedule for user ${user.id}:`, error);
      return false;
    }
  }

  determineComparisonStatus(busyUsers, freeUsers, totalUsers) {
    const busyCount = busyUsers.length;
    const freeCount = freeUsers.length;

    if (busyCount === 0) {
      return {
        status: "all-free",
        cssClass: "all-free",
        icon: "fas fa-check-circle",
        text: "All Available",
        tooltip: `All ${totalUsers} users are available`,
        busyUsers,
        freeUsers,
        totalUsers,
      };
    }

    if (freeCount === 0) {
      return {
        status: "all-busy",
        cssClass: "all-busy",
        icon: "fas fa-times-circle",
        text: "All Busy",
        tooltip: `All ${totalUsers} users are busy`,
        busyUsers,
        freeUsers,
        totalUsers,
      };
    }

    return {
      status: "mixed",
      cssClass: "mixed-availability",
      icon: "fas fa-exclamation-triangle",
      text: "Mixed",
      tooltip: `${freeCount} available, ${busyCount} busy`,
      busyUsers,
      freeUsers,
      totalUsers,
    };
  }

  /**
   * Get all free users for a specific time slot
   * @param {number} dayIndex
   * @param {number} timeIndex
   * @returns {Array} Array of free users
   */
  getFreeUsersForSlot(dayIndex, timeIndex) {
    const comparison = this.getSlotComparison(dayIndex, timeIndex);
    return comparison.freeUsers;
  }

  /**
   * Get optimal meeting times (slots where most users are free)
   * @returns {Array} Array of optimal time slots with user counts
   */
  getOptimalMeetingTimes() {
    if (this.selectedUsers.size === 0) return [];

    const optimalTimes = [];
    const firstUser = Array.from(this.selectedUsers.values())[0];
    const numSlots = firstUser.timeSlots?.length || 0;

    for (let day = 0; day < 7; day++) {
      for (let time = 0; time < numSlots; time++) {
        const comparison = this.getSlotComparison(day, time);

        if (comparison.freeUsers.length > 0) {
          optimalTimes.push({
            day,
            time,
            freeCount: comparison.freeUsers.length,
            totalCount: comparison.totalUsers,
            availabilityRatio:
              comparison.freeUsers.length / comparison.totalUsers,
            timeSlot: firstUser.timeSlots[time],
            dayName: this.getDayName(day),
          });
        }
      }
    }

    // Sort by availability ratio (highest first)
    return optimalTimes.sort(
      (a, b) => b.availabilityRatio - a.availabilityRatio
    );
  }

  /**
   * Get conflict summary - slots where all users are busy
   * @returns {Array} Array of conflict time slots
   */
  getConflictSummary() {
    if (this.selectedUsers.size === 0) return [];

    const conflicts = [];
    const firstUser = Array.from(this.selectedUsers.values())[0];
    const numSlots = firstUser.timeSlots?.length || 0;

    for (let day = 0; day < 7; day++) {
      for (let time = 0; time < numSlots; time++) {
        const comparison = this.getSlotComparison(day, time);

        if (comparison.status === "all-busy") {
          conflicts.push({
            day,
            time,
            timeSlot: firstUser.timeSlots[time],
            dayName: this.getDayName(day),
            busyUsers: comparison.busyUsers,
          });
        }
      }
    }

    return conflicts;
  }

  getDayName(dayIndex) {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    return days[dayIndex] || "Unknown";
  }

  /**
   * Clear comparison data
   */
  clear() {
    this.selectedUsers.clear();
    this.comparisonCache.clear();
  }

  /**
   * Get summary statistics for current comparison
   * @returns {Object} Statistics object
   */
  getComparisonStats() {
    if (this.selectedUsers.size === 0) {
      return {
        totalUsers: 0,
        totalSlots: 0,
        freeSlots: 0,
        busySlots: 0,
        mixedSlots: 0,
        bestMeetingTimes: [],
      };
    }

    const firstUser = Array.from(this.selectedUsers.values())[0];
    const numSlots = firstUser.timeSlots?.length || 0;
    const totalSlots = 7 * numSlots;

    let freeSlots = 0;
    let busySlots = 0;
    let mixedSlots = 0;

    for (let day = 0; day < 7; day++) {
      for (let time = 0; time < numSlots; time++) {
        const comparison = this.getSlotComparison(day, time);

        switch (comparison.status) {
          case "all-free":
            freeSlots++;
            break;
          case "all-busy":
            busySlots++;
            break;
          case "mixed":
            mixedSlots++;
            break;
        }
      }
    }

    return {
      totalUsers: this.selectedUsers.size,
      totalSlots,
      freeSlots,
      busySlots,
      mixedSlots,
      bestMeetingTimes: this.getOptimalMeetingTimes().slice(0, 10), // Top 10
    };
  }
}
