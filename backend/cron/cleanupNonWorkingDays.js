import cron from "node-cron";
import Schedule from "../src/models/Schedule.js";

const getTodayKey = () => new Date().toISOString().split("T")[0];

export const startCleanupNonWorkingDaysCron = () => {
  return cron.schedule("0 0 * * *", async () => {
    try {
      const today = getTodayKey();
      const schedules = await Schedule.find({
        nonWorkingDays: { $exists: true, $ne: [] },
      });

      for (const schedule of schedules) {
        const filtered = schedule.nonWorkingDays.filter(
          (dateKey) => dateKey >= today
        );

        if (filtered.length !== schedule.nonWorkingDays.length) {
          schedule.nonWorkingDays = filtered;
          await schedule.save();
        }
      }

      console.log("Non-working days cleanup job executed");
    } catch (error) {
      console.error("Non-working days cleanup error:", error);
    }
  });
};
