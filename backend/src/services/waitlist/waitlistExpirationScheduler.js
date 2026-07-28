import { createSchedulerLeaseRunner } from "../schedulerLeaseRunner.js";
import { expirePastWaitlistEntries } from "./waitlistService.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const JOB_KEY = "waitlist-expiration";

let schedulerRunner = null;
let schedulerStopPromise = null;

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
  createRunner = createSchedulerLeaseRunner,
  ...runnerOptions
} = {}) => {
  if (schedulerRunner || schedulerStopPromise) {
    return { started: false, reason: "already_started" };
  }

  if (env.ENABLE_WAITLIST_EXPIRATION !== "true") {
    return { started: false, reason: "disabled" };
  }

  const intervalMs = getIntervalMs(env.WAITLIST_EXPIRATION_INTERVAL_MS);
  schedulerRunner = createRunner({
    jobKey: JOB_KEY,
    intervalMs,
    logger,
    run: (leaseContext) => expireEntries({ leaseContext }),
    ...runnerOptions,
  });

  const result = schedulerRunner.start();
  if (!result.started) {
    schedulerRunner = null;
    return result;
  }

  logger.info?.(`Waitlist expiration scheduler started with ${intervalMs}ms interval`);

  return result;
};

export const stopWaitlistExpirationScheduler = () => {
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
