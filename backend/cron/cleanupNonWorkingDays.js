import Schedule from "../src/models/Schedule.js";
import { createCronLeaseRunner } from "../src/services/cronLeaseRunner.js";
import {
  cleanPastScheduleDates,
  getTodayKey,
} from "../src/utils/scheduleUtils.js";

const areFieldsEqual = (left, right) =>
  JSON.stringify(left || {}) === JSON.stringify(right || {});

export const CLEANUP_NON_WORKING_DAYS_CRON = "0 0 * * *";

export const startCleanupNonWorkingDaysCron = ({
  logger = console,
  createRunner = createCronLeaseRunner,
  findSchedules = Schedule.find.bind(Schedule),
  getTodayKeyFn = getTodayKey,
  cleanPastScheduleDatesFn = cleanPastScheduleDates,
  ...runnerOptions
} = {}) =>
  createRunner({
    jobKey: "cleanup-non-working-days",
    expression: CLEANUP_NON_WORKING_DAYS_CRON,
    logger,
    run: async () => {
      try {
        const today = getTodayKeyFn();
        const schedules = await findSchedules({
          $or: [
            { nonWorkingDays: { $exists: true, $ne: [] } },
            { scheduleOverrides: { $exists: true, $ne: {} } },
            { dateSchedules: { $exists: true, $ne: {} } },
          ],
        });

        for (const schedule of schedules) {
          const cleaned = cleanPastScheduleDatesFn(schedule, today);
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

        logger.log?.("Schedule past date cleanup job executed");
      } catch (error) {
        logger.error?.("Schedule past date cleanup error:", error);
      }
    },
    ...runnerOptions,
  }).start();
