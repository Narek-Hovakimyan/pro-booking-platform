import cron from "node-cron";
import Schedule from "../src/models/Schedule.js";
import {
  cleanPastScheduleDates,
  getTodayKey,
} from "../src/utils/scheduleUtils.js";

const areFieldsEqual = (left, right) =>
  JSON.stringify(left || {}) === JSON.stringify(right || {});

export const startCleanupNonWorkingDaysCron = () => {
  return cron.schedule("0 0 * * *", async () => {
    try {
      const today = getTodayKey();
      const schedules = await Schedule.find({
        $or: [
          { nonWorkingDays: { $exists: true, $ne: [] } },
          { scheduleOverrides: { $exists: true, $ne: {} } },
          { dateSchedules: { $exists: true, $ne: {} } },
        ],
      });

      for (const schedule of schedules) {
        const cleaned = cleanPastScheduleDates(schedule, today);
        const hasChanges =
          !areFieldsEqual(cleaned.nonWorkingDays, schedule.nonWorkingDays) ||
          !areFieldsEqual(cleaned.scheduleOverrides, schedule.scheduleOverrides) ||
          !areFieldsEqual(cleaned.dateSchedules, schedule.dateSchedules);

        if (!hasChanges) continue;

        schedule.nonWorkingDays = cleaned.nonWorkingDays;
        schedule.scheduleOverrides = cleaned.scheduleOverrides;
        schedule.dateSchedules = cleaned.dateSchedules;
        await schedule.save();
      }

      console.log("Schedule past date cleanup job executed");
    } catch (error) {
      console.error("Schedule past date cleanup error:", error);
    }
  });
};
