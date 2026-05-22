import { expirePastWaitlistEntries } from "./waitlistService.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

let intervalId = null;
let clearSchedulerInterval = clearInterval;
let isRunning = false;

const getIntervalMs = (value) => {
  const intervalMs = Number(value);

  return Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : DEFAULT_INTERVAL_MS;
};

export const startWaitlistExpirationScheduler = ({
  env = process.env,
  logger = console,
  expireEntries = expirePastWaitlistEntries,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) => {
  if (intervalId) {
    return { started: false, reason: "already_started" };
  }

  if (env.ENABLE_WAITLIST_EXPIRATION !== "true") {
    return { started: false, reason: "disabled" };
  }

  const intervalMs = getIntervalMs(env.WAITLIST_EXPIRATION_INTERVAL_MS);

  const runTick = async () => {
    if (isRunning) {
      logger.warn?.("Waitlist expiration scheduler skipped overlapping run");
      return;
    }

    isRunning = true;

    try {
      await expireEntries();
    } catch (error) {
      logger.error?.("Waitlist expiration scheduler error:", error);
    } finally {
      isRunning = false;
    }
  };

  intervalId = setIntervalFn(runTick, intervalMs);
  clearSchedulerInterval = clearIntervalFn;
  intervalId?.unref?.();

  logger.info?.(`Waitlist expiration scheduler started with ${intervalMs}ms interval`);

  return { started: true, intervalMs };
};

export const stopWaitlistExpirationScheduler = () => {
  if (!intervalId) {
    return { stopped: false };
  }

  clearSchedulerInterval(intervalId);
  intervalId = null;
  clearSchedulerInterval = clearInterval;

  return { stopped: true };
};
