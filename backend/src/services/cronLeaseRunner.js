import { randomUUID } from "node:crypto";
import cron from "node-cron";

import SchedulerLease from "../models/SchedulerLease.js";
import {
  DEFAULT_SCHEDULER_LEASE_TTL_MS,
  schedulerLeaseService,
} from "./schedulerLeaseService.js";

const DEFAULT_RENEWAL_LEAD_MS = 5 * 1000;
const DEFAULT_RENEWAL_MIN_DELAY_MS = 1 * 1000;
const LEASE_LOST_ERROR_CODE = "scheduler_lease_lost";

const toDelayMs = (ttlMs, renewalLeadMs) =>
  Math.max(
    DEFAULT_RENEWAL_MIN_DELAY_MS,
    Math.min(ttlMs - 1, ttlMs - renewalLeadMs)
  );

const normalizeErrorCode = (error) =>
  typeof error?.code === "string" && error.code.length > 0 ? error.code : "unknown_error";

const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());
const isPositiveSafeInteger = (value) => Number.isSafeInteger(value) && value > 0;
const isRecord = (value) => value !== null && typeof value === "object";

const isValidAcquiredLease = ({
  lease,
  expectedJobKey,
  expectedOwnerToken,
  currentTime,
}) =>
  isRecord(lease) &&
  lease.jobKey === expectedJobKey &&
  lease.ownerToken === expectedOwnerToken &&
  isPositiveSafeInteger(lease.fencingToken) &&
  isValidDate(lease.leaseExpiresAt) &&
  (!currentTime || lease.leaseExpiresAt.getTime() > currentTime.getTime());

const getFailureReason = (result, fallbackReason) =>
  isNonEmptyString(result?.reason) ? result.reason : fallbackReason;

const createNoopLease = () => ({
  active: false,
  current: null,
  timerId: null,
  renewalPromise: null,
  abortController: null,
  lostError: null,
});

const createLeaseLostError = (reason = "not_owner") => {
  const error = new Error("Cron lease ownership lost");
  error.code = LEASE_LOST_ERROR_CODE;
  error.reason = reason;
  return error;
};

export const createCronLeaseRunner = ({
  jobKey,
  expression,
  run,
  logger = console,
  leaseService = schedulerLeaseService,
  leaseModel = SchedulerLease,
  leaseTtlMs = DEFAULT_SCHEDULER_LEASE_TTL_MS,
  ownerTokenFactory = randomUUID,
  scheduleFn = cron.schedule,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  now = () => new Date(),
} = {}) => {
  if (!isNonEmptyString(jobKey)) throw new TypeError("jobKey must be a non-empty string");
  if (!isNonEmptyString(expression)) throw new TypeError("expression must be a non-empty string");
  if (typeof run !== "function") throw new TypeError("run must be a function");
  if (!leaseService || typeof leaseService.acquire !== "function") {
    throw new TypeError("leaseService.acquire must be a function");
  }
  if (typeof leaseService.renew !== "function") {
    throw new TypeError("leaseService.renew must be a function");
  }
  if (typeof leaseService.release !== "function") {
    throw new TypeError("leaseService.release must be a function");
  }
  if (typeof leaseService.withFencedWrite !== "function") {
    throw new TypeError("leaseService.withFencedWrite must be a function");
  }
  if (!leaseModel || typeof leaseModel.findOne !== "function") {
    throw new TypeError("leaseModel.findOne must be a function");
  }
  if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs <= 1) {
    throw new TypeError("leaseTtlMs must be a safe integer greater than 1");
  }
  if (typeof ownerTokenFactory !== "function") throw new TypeError("ownerTokenFactory must be a function");
  if (typeof scheduleFn !== "function") throw new TypeError("scheduleFn must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const ownerToken = ownerTokenFactory();
  if (!isNonEmptyString(ownerToken)) throw new TypeError("ownerTokenFactory must return a non-empty string");

  const state = {
    active: false,
    stopping: false,
    isRunning: false,
    task: null,
    handle: null,
    taskStopFn: null,
    activeTickPromise: null,
    stopPromise: null,
    lease: createNoopLease(),
  };

  const clearRenewalTimer = () => {
    if (!state.lease.timerId) return;
    clearTimeoutFn(state.lease.timerId);
    state.lease.timerId = null;
  };

  const abortLease = (reason = "not_owner") => {
    if (!state.lease.lostError) {
      state.lease.lostError = createLeaseLostError(reason);
    }
    state.lease.active = false;
    clearRenewalTimer();
    if (!state.lease.abortController?.signal.aborted) {
      state.lease.abortController?.abort(state.lease.lostError);
    }
    return state.lease.lostError;
  };

  const stopRenewalLoop = async () => {
    state.lease.active = false;
    clearRenewalTimer();
    if (state.lease.renewalPromise) {
      await state.lease.renewalPromise;
    }
  };

  const scheduleRenewal = () => {
    if (!state.lease.active || !state.lease.current) return;
    const delayMs = toDelayMs(leaseTtlMs, DEFAULT_RENEWAL_LEAD_MS);
    state.lease.timerId = setTimeoutFn(async () => {
      state.lease.timerId = null;
      state.lease.renewalPromise = (async () => {
        try {
          const result = await leaseService.renew({
            jobKey,
            ownerToken: state.lease.current.ownerToken,
            fencingToken: state.lease.current.fencingToken,
            ttlMs: leaseTtlMs,
          });

          if (!isRecord(result) || typeof result.renewed !== "boolean") {
            abortLease("invalid_result");
            logger.error?.(
              {
                event: "cron_lease_runner.renew_invalid",
                jobKey,
                reason: "invalid_result",
              },
              "Cron lease renewal returned an invalid result"
            );
            return;
          }

          if (!result.renewed) {
            abortLease(getFailureReason(result, "not_renewed"));
            logger.warn?.(
              {
                event: "cron_lease_runner.renew_skipped",
                jobKey,
                reason: getFailureReason(result, "not_renewed"),
              },
              "Cron lease renewal skipped"
            );
            return;
          }

          const currentTime = now();
          if (
            !isValidDate(currentTime) ||
            !isValidAcquiredLease({
              lease: result.lease,
              expectedJobKey: jobKey,
              expectedOwnerToken: ownerToken,
              currentTime,
            })
          ) {
            abortLease("invalid_lease");
            logger.error?.(
              {
                event: "cron_lease_runner.renew_invalid",
                jobKey,
                reason: "invalid_lease",
              },
              "Cron lease renewal returned an invalid lease"
            );
            return;
          }

          state.lease.current = result.lease;
          scheduleRenewal();
        } catch (error) {
          abortLease(normalizeErrorCode(error));
          logger.error?.(
            {
              event: "cron_lease_runner.renew_failed",
              jobKey,
              reason: normalizeErrorCode(error),
            },
            "Cron lease renewal failed"
          );
        } finally {
          state.lease.renewalPromise = null;
        }
      })();

      await state.lease.renewalPromise;
    }, delayMs);

    state.lease.timerId?.unref?.();
  };

  const releaseLease = async () => {
    if (!state.lease.current) return;
    const leaseToRelease = state.lease.current;
    state.lease.current = null;

    try {
      const result = await leaseService.release({
        jobKey,
        ownerToken: leaseToRelease.ownerToken,
        fencingToken: leaseToRelease.fencingToken,
      });

      if (!result.released) {
        logger.warn?.(
          { event: "cron_lease_runner.release_skipped", jobKey, reason: result.reason },
          "Cron lease release skipped"
        );
      }
    } catch (error) {
      logger.error?.(
        {
          event: "cron_lease_runner.release_failed",
          jobKey,
          reason: normalizeErrorCode(error),
        },
        "Cron lease release failed"
      );
    }
  };

  const createLeaseExecutionContext = (lease) => {
    const abortController = new AbortController();
    state.lease.abortController = abortController;
    state.lease.lostError = null;
    const assertOwned = async () => {
      if (abortController.signal.aborted) {
        throw state.lease.lostError || createLeaseLostError("not_owner");
      }

      const currentTime = now();
      if (!isValidDate(currentTime)) {
        logger.error?.(
          {
            event: "cron_lease_runner.assert_failed",
            jobKey,
            reason: "invalid_now",
          },
          "Cron lease ownership check failed"
        );
        throw abortLease("invalid_now");
      }

      try {
        const ownedLease = await leaseModel.findOne({
          jobKey: lease.jobKey,
          ownerToken: lease.ownerToken,
          fencingToken: lease.fencingToken,
          leaseExpiresAt: { $gt: currentTime },
        });

        if (!ownedLease) {
          throw abortLease("not_owner");
        }
      } catch (error) {
        if (error?.code === LEASE_LOST_ERROR_CODE) {
          throw error;
        }

        logger.error?.(
          {
            event: "cron_lease_runner.assert_failed",
            jobKey,
            reason: normalizeErrorCode(error),
          },
          "Cron lease ownership check failed"
        );
        throw abortLease("storage_error");
      }

      if (abortController.signal.aborted) {
        throw state.lease.lostError || createLeaseLostError("not_owner");
      }
    };

    const withFencedWrite = async (write) => {
      if (typeof write !== "function") {
        throw new TypeError("write must be a function");
      }
      if (abortController.signal.aborted) {
        throw state.lease.lostError || createLeaseLostError("not_owner");
      }

      try {
        return await leaseService.withFencedWrite({
          jobKey: lease.jobKey,
          ownerToken: lease.ownerToken,
          fencingToken: lease.fencingToken,
          write: async ({ session, lease: updatedLease, writeSequence, afterCommit }) => {
            const currentTime = now();

            if (
              !isValidDate(currentTime) ||
              !isValidAcquiredLease({
                lease: updatedLease,
                expectedJobKey: jobKey,
                expectedOwnerToken: ownerToken,
                currentTime,
              })
            ) {
              throw abortLease("invalid_lease");
            }
            state.lease.current = updatedLease;
            if (abortController.signal.aborted) {
              throw state.lease.lostError || createLeaseLostError("not_owner");
            }
            return write({
              session,
              jobKey,
              ownerToken: updatedLease.ownerToken,
              fencingToken: updatedLease.fencingToken,
              writeSequence,
              signal: abortController.signal,
              assertOwned,
              withFencedWrite,
              afterCommit,
            });
          },
        });
      } catch (error) {
        if (error?.code === LEASE_LOST_ERROR_CODE) {
          throw abortLease(error.reason || "not_owner");
        }
        throw error;
      }
    };

    return {
      jobKey,
      ownerToken: lease.ownerToken,
      fencingToken: lease.fencingToken,
      signal: abortController.signal,
      assertOwned,
      withFencedWrite,
    };
  };

  const runTick = async () => {
    if (!state.active || state.stopping) return;
    if (state.isRunning) {
      logger.warn?.(
        { event: "cron_lease_runner.overlap_skipped", jobKey },
        "Cron run skipped due to overlap"
      );
      return;
    }
    state.isRunning = true;
    const tickPromise = (async () => {
      let leaseResult;

      try {
        leaseResult = await leaseService.acquire({ jobKey, ownerToken, ttlMs: leaseTtlMs });
      } catch (error) {
        logger.error?.(
          {
            event: "cron_lease_runner.acquire_failed",
            jobKey,
            reason: normalizeErrorCode(error),
          },
          "Cron lease acquisition failed"
        );
        return;
      }

      if (!isRecord(leaseResult) || typeof leaseResult.acquired !== "boolean") {
        logger.error?.(
          { event: "cron_lease_runner.acquire_invalid", jobKey, reason: "invalid_result" },
          "Cron lease acquisition returned an invalid result"
        );
        return;
      }

      if (!leaseResult.acquired) {
        logger.warn?.(
          {
            event: "cron_lease_runner.acquire_skipped",
            jobKey,
            reason: getFailureReason(leaseResult, "not_acquired"),
          },
          "Cron run skipped because lease was not acquired"
        );
        return;
      }

      const currentTime = now();
      if (
        !isValidDate(currentTime) ||
        !isValidAcquiredLease({
          lease: leaseResult.lease,
          expectedJobKey: jobKey,
          expectedOwnerToken: ownerToken,
          currentTime,
        })
      ) {
        logger.error?.(
          { event: "cron_lease_runner.acquire_invalid", jobKey, reason: "invalid_lease" },
          "Cron lease acquisition returned an invalid lease"
        );
        return;
      }

      state.lease.active = true;
      state.lease.current = leaseResult.lease;
      const executionContext = createLeaseExecutionContext(leaseResult.lease);
      scheduleRenewal();
      try {
        await run(executionContext);
      } catch (error) {
        if (error?.code !== LEASE_LOST_ERROR_CODE) {
          logger.error?.(
            {
              event: "cron_lease_runner.run_failed",
              jobKey,
              reason: normalizeErrorCode(error),
            },
            "Cron job failed"
          );
        }
      } finally {
        await stopRenewalLoop();
        await releaseLease();
      }
    })();
    state.activeTickPromise = tickPromise;
    try {
      await tickPromise;
    } finally {
      state.activeTickPromise = null;
      state.isRunning = false;
    }
  };

  const stop = () => {
    if (state.stopPromise) {
      return state.stopPromise;
    }
    if (!state.task) {
      return { stopped: false };
    }
    state.stopping = true;
    state.active = false;
    const activeTask = state.task;
    const activeHandle = state.handle;
    const stopPromise = (async () => {
      let stopError = null;

      try {
        try {
          await state.taskStopFn?.();
        } catch (error) {
          stopError = error;
          logger.error?.(
            {
              event: "cron_lease_runner.stop_failed",
              jobKey,
              reason: normalizeErrorCode(error),
            },
            "Cron task stop failed"
          );
        }
      } finally {
        try {
          if (state.activeTickPromise) {
            await state.activeTickPromise;
          } else {
            await stopRenewalLoop();
          }
        } finally {
          if (
            state.task === activeTask &&
            state.handle === activeHandle &&
            state.stopPromise === stopPromise
          ) {
            state.isRunning = false;
            state.stopping = false;
            state.task = null;
            state.handle = null;
            state.taskStopFn = null;
            state.stopPromise = null;
          }
        }
      }

      if (stopError) {
        throw stopError;
      }
      return { stopped: true };
    })();
    state.stopPromise = stopPromise;
    return stopPromise;
  };

  const start = () => {
    if (state.handle) {
      return state.handle;
    }
    state.active = true;
    state.stopping = false;
    const task = scheduleFn(expression, () => {
      void runTick();
    });
    const handle = task;
    state.task = task;
    state.handle = handle;
    state.taskStopFn = typeof task.stop === "function" ? task.stop.bind(task) : null;
    handle.stop = stop;
    return handle;
  };

  return { start, stop, runTick };
};
