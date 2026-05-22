import { runBookingReminders } from "./bookingReminderService.js";

const DEFAULT_INTERVAL_MS = 60 * 1000;

let intervalId = null;
let clearSchedulerInterval = clearInterval;
let isRunning = false;

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
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) => {
  if (intervalId) {
    return { started: false, reason: "already_started" };
  }

  if (env.ENABLE_BOOKING_REMINDERS !== "true") {
    return { started: false, reason: "disabled" };
  }

  const intervalMs = getIntervalMs(env.BOOKING_REMINDER_INTERVAL_MS);

  const runTick = async () => {
    if (isRunning) {
      logger.warn?.("Booking reminder scheduler skipped overlapping run");
      return;
    }

    isRunning = true;

    try {
      await runReminders();
    } catch (error) {
      logger.error?.("Booking reminder scheduler error:", error);
    } finally {
      isRunning = false;
    }
  };

  intervalId = setIntervalFn(runTick, intervalMs);
  clearSchedulerInterval = clearIntervalFn;
  intervalId?.unref?.();

  logger.info?.(`Booking reminder scheduler started with ${intervalMs}ms interval`);

  return { started: true, intervalMs };
};

export const stopBookingReminderScheduler = () => {
  if (!intervalId) {
    return { stopped: false };
  }

  clearSchedulerInterval(intervalId);
  intervalId = null;
  clearSchedulerInterval = clearInterval;

  return { stopped: true };
};
