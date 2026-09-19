import { createSchedulerLeaseRunner } from "../schedulerLeaseRunner.js";
import { recoverBookingPostCommitDispatches } from "./bookingPostCommitDispatchService.js";

const DEFAULT_INTERVAL_MS = 60 * 1000;
const JOB_KEY = "booking-post-commit-dispatch";

let schedulerRunner = null;
let schedulerStopPromise = null;

const getIntervalMs = (value) => {
  const intervalMs = Number(value);
  return Number.isSafeInteger(intervalMs) && intervalMs > 0
    ? intervalMs
    : DEFAULT_INTERVAL_MS;
};

export const startBookingPostCommitDispatchScheduler = ({
  env = process.env,
  logger = console,
  recoverDispatches = recoverBookingPostCommitDispatches,
  createRunner = createSchedulerLeaseRunner,
  ...runnerOptions
} = {}) => {
  if (schedulerRunner || schedulerStopPromise) {
    return { started: false, reason: "already_started" };
  }
  if (env.ENABLE_BOOKING_POST_COMMIT_DISPATCH === "false") {
    return { started: false, reason: "disabled" };
  }

  const intervalMs = getIntervalMs(env.BOOKING_POST_COMMIT_DISPATCH_INTERVAL_MS);
  schedulerRunner = createRunner({
    jobKey: JOB_KEY,
    intervalMs,
    logger,
    run: (leaseContext) => recoverDispatches({ leaseContext }),
    ...runnerOptions,
  });
  const result = schedulerRunner.start();
  if (!result.started) {
    schedulerRunner = null;
    return result;
  }
  logger.info?.(`Booking post-commit dispatch scheduler started with ${intervalMs}ms interval`);
  return result;
};

export const stopBookingPostCommitDispatchScheduler = () => {
  if (!schedulerRunner) return schedulerStopPromise ?? { stopped: false };
  if (schedulerStopPromise) return schedulerStopPromise;

  const activeRunner = schedulerRunner;
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
