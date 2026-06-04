import { expireSubscriptions } from "./subscriptionService.js";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

let intervalId = null;
let clearSchedulerInterval = clearInterval;
let isRunning = false;

const getIntervalMs = (value) => {
  const intervalMs = Number(value);

  return Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : DEFAULT_INTERVAL_MS;
};

export const startSubscriptionExpirationScheduler = ({
  env = process.env,
  logger = console,
  expireFn = expireSubscriptions,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) => {
  if (intervalId) {
    return { started: false, reason: "already_started" };
  }

  if (env.ENABLE_SUBSCRIPTION_EXPIRATION_CRON !== "true") {
    return { started: false, reason: "disabled" };
  }

  const intervalMs = getIntervalMs(env.SUBSCRIPTION_EXPIRATION_INTERVAL_MS);

  const runTick = async () => {
    if (isRunning) {
      logger.warn?.("Subscription expiration scheduler skipped overlapping run");
      return;
    }

    isRunning = true;

    try {
      const summary = await expireFn();
      logger.info?.("Subscription expiration summary", summary);
    } catch (error) {
      logger.error?.("Subscription expiration scheduler error:", error);
    } finally {
      isRunning = false;
    }
  };

  intervalId = setIntervalFn(runTick, intervalMs);
  clearSchedulerInterval = clearIntervalFn;
  intervalId?.unref?.();

  logger.info?.(`Subscription expiration scheduler started with ${intervalMs}ms interval`);

  return { started: true, intervalMs };
};

export const stopSubscriptionExpirationScheduler = () => {
  if (!intervalId) {
    return { stopped: false };
  }

  clearSchedulerInterval(intervalId);
  intervalId = null;
  clearSchedulerInterval = clearInterval;

  return { stopped: true };
};
