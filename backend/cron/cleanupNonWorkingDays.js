import Schedule from "../src/models/Schedule.js";
import { createCronLeaseRunner } from "../src/services/cronLeaseRunner.js";
import {
  cleanPastScheduleDates,
  getTodayKey,
} from "../src/utils/scheduleUtils.js";

const areFieldsEqual = (left, right) =>
  JSON.stringify(left || {}) === JSON.stringify(right || {});

const cloneValue = (value) =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

const updateScheduleCleanupFields = async ({
  schedule,
  cleaned,
  updateSchedule = Schedule.findOneAndUpdate.bind(Schedule),
  session,
}) =>
  updateSchedule(
    {
      _id: schedule._id,
      nonWorkingDays: cloneValue(schedule.nonWorkingDays) || [],
      scheduleOverrides: cloneValue(schedule.scheduleOverrides) || {},
      dateSchedules: cloneValue(schedule.dateSchedules) || {},
    },
    {
      $set: {
        nonWorkingDays: cleaned.nonWorkingDays,
        scheduleOverrides: cleaned.scheduleOverrides,
        dateSchedules: cleaned.dateSchedules,
      },
    },
    {
      returnDocument: "after",
      session,
    }
  );

export const CLEANUP_NON_WORKING_DAYS_CRON = "0 0 * * *";

export const startCleanupNonWorkingDaysCron = ({
  logger = console,
  createRunner = createCronLeaseRunner,
  findSchedules = Schedule.find.bind(Schedule),
  updateSchedule = Schedule.findOneAndUpdate.bind(Schedule),
  getTodayKeyFn = getTodayKey,
  cleanPastScheduleDatesFn = cleanPastScheduleDates,
  ...runnerOptions
} = {}) =>
  createRunner({
    jobKey: "cleanup-non-working-days",
    expression: CLEANUP_NON_WORKING_DAYS_CRON,
    logger,
    run: async (leaseContext) => {
      try {
        const withFencedWrite =
          typeof leaseContext?.withFencedWrite === "function"
            ? (write) => leaseContext.withFencedWrite(write)
            : (write) => write({});
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

          await withFencedWrite(({ session } = {}) =>
            updateScheduleCleanupFields({
              schedule,
              cleaned,
              updateSchedule,
              session,
            })
          );
        }

        logger.log?.("Schedule past date cleanup job executed");
      } catch (error) {
        logger.error?.("Schedule past date cleanup error:", error);
        throw error;
      }
    },
    ...runnerOptions,
  }).start();
