import { runBookingReminders } from "./bookingReminderService.js";
import { createSchedulerLeaseRunner } from "../schedulerLeaseRunner.js";

const DEFAULT_INTERVAL_MS = 60 * 1000;
const JOB_KEY = "booking-reminders";

let schedulerRunner = null;
let schedulerStopPromise = null;

const getIntervalMs = (value) => {
  const intervalMs = Number(value);

  return Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : DEFAULT_INTERVAL_MS;
};

export const startBookingReminderScheduler = ({
  env = process.env,
  logger = console,
  runReminders = runBookingReminders,
  createRunner = createSchedulerLeaseRunner,
  ...runnerOptions
} = {}) => {
  if (schedulerRunner || schedulerStopPromise) {
    return { started: false, reason: "already_started" };
  }

  if (env.ENABLE_BOOKING_REMINDERS !== "true") {
    return { started: false, reason: "disabled" };
  }

  const intervalMs = getIntervalMs(env.BOOKING_REMINDER_INTERVAL_MS);
  schedulerRunner = createRunner({
    jobKey: JOB_KEY,
    intervalMs,
    logger,
    run: runReminders,
    ...runnerOptions,
  });

  const result = schedulerRunner.start();
  if (!result.started) {
    schedulerRunner = null;
    return result;
  }

  logger.info?.(`Booking reminder scheduler started with ${intervalMs}ms interval`);

  return result;
};

export const stopBookingReminderScheduler = () => {
  if (!schedulerRunner) {
    return schedulerStopPromise ?? { stopped: false };
  }

  const activeRunner = schedulerRunner;
  if (schedulerStopPromise) {
    return schedulerStopPromise;
  }

  const stopPromise = (async () => {
    try {
      return await activeRunner.stop();
    } finally {
      if (schedulerRunner === activeRunner && schedulerStopPromise === stopPromise) {
        schedulerRunner = null;
        schedulerStopPromise = null;
      }
    }
  })();

  schedulerStopPromise = stopPromise;
  return stopPromise;
};
