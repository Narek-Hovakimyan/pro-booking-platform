import { createSchedulerLeaseRunner } from "./schedulerLeaseRunner.js";
import { expireSubscriptions } from "./subscriptionService.js";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const JOB_KEY = "subscription-expiration";

let schedulerRunner = null;
let schedulerStopPromise = null;

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
  createRunner = createSchedulerLeaseRunner,
  ...runnerOptions
} = {}) => {
  if (schedulerRunner || schedulerStopPromise) {
    return { started: false, reason: "already_started" };
  }

  if (env.ENABLE_SUBSCRIPTION_EXPIRATION_CRON !== "true") {
    return { started: false, reason: "disabled" };
  }

  const intervalMs = getIntervalMs(env.SUBSCRIPTION_EXPIRATION_INTERVAL_MS);
  schedulerRunner = createRunner({
    jobKey: JOB_KEY,
    intervalMs,
    logger,
    run: async (leaseContext) => {
      try {
        const summary = await expireFn({ leaseContext });
        logger.info?.("Subscription expiration summary", summary);
      } catch (error) {
        logger.error?.("Subscription expiration scheduler error:", error);
        throw error;
      }
    },
    ...runnerOptions,
  });

  const result = schedulerRunner.start();
  if (!result.started) {
    schedulerRunner = null;
    return result;
  }

  logger.info?.(`Subscription expiration scheduler started with ${intervalMs}ms interval`);

  return result;
};

export const stopSubscriptionExpirationScheduler = () => {
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
