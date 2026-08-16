import { createSchedulerLeaseRunner } from "../schedulerLeaseRunner.js";
import {
  MEDIA_RECONCILIATION_JOB_KEY,
  reconcileDueMediaObjects,
} from "./mediaReconciliationService.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

let schedulerRunner = null;
let schedulerStopPromise = null;

const getIntervalMs = (value) => {
  const intervalMs = Number(value);
  return Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;
};

export const startMediaReconciliationScheduler = ({
  env = process.env,
  logger = console,
  reconcile = reconcileDueMediaObjects,
  createRunner = createSchedulerLeaseRunner,
  ...runnerOptions
} = {}) => {
  if (schedulerRunner || schedulerStopPromise) return { started: false, reason: "already_started" };
  if (env.ENABLE_MEDIA_RECONCILIATION !== "true") return { started: false, reason: "disabled" };

  const intervalMs = getIntervalMs(env.MEDIA_RECONCILIATION_INTERVAL_MS);
  schedulerRunner = createRunner({
    jobKey: MEDIA_RECONCILIATION_JOB_KEY,
    intervalMs,
    logger,
    run: async (leaseContext) => {
      try {
        return await reconcile({ leaseContext });
      } catch (error) {
        logger.error?.({ event: "media_reconciliation.failed", reason: error?.code || "unknown_error" }, "Media reconciliation failed");
        return null;
      }
    },
    ...runnerOptions,
  });

  const result = schedulerRunner.start();
  if (!result.started) {
    schedulerRunner = null;
    return result;
  }
  logger.info?.(`Media reconciliation scheduler started with ${intervalMs}ms interval`);
  return result;
};

export const stopMediaReconciliationScheduler = () => {
  if (!schedulerRunner) return schedulerStopPromise ?? { stopped: false };
  const activeRunner = schedulerRunner;
  if (schedulerStopPromise) return schedulerStopPromise;
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

