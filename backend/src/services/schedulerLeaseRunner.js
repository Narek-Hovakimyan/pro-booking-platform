import { randomUUID } from "node:crypto";

import {
  DEFAULT_SCHEDULER_LEASE_TTL_MS,
  schedulerLeaseService,
} from "./schedulerLeaseService.js";

const DEFAULT_RENEWAL_LEAD_MS = 5 * 1000;
const DEFAULT_RENEWAL_MIN_DELAY_MS = 1 * 1000;

const toDelayMs = (ttlMs, renewalLeadMs) =>
  Math.max(
    DEFAULT_RENEWAL_MIN_DELAY_MS,
    Math.min(ttlMs - 1, ttlMs - renewalLeadMs)
  );

const normalizeErrorCode = (error) => {
  if (typeof error?.code === "string" && error.code.length > 0) {
    return error.code;
  }

  return "unknown_error";
};

const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;

const isPositiveSafeInteger = (value) => Number.isSafeInteger(value) && value > 0;

const isRecord = (value) => value !== null && typeof value === "object";

const isValidAcquiredLease = ({ lease, expectedJobKey, expectedOwnerToken }) =>
  isRecord(lease) &&
  lease.jobKey === expectedJobKey &&
  lease.ownerToken === expectedOwnerToken &&
  isPositiveSafeInteger(lease.fencingToken) &&
  lease.leaseExpiresAt instanceof Date;

const getFailureReason = (result, fallbackReason) =>
  isNonEmptyString(result?.reason) ? result.reason : fallbackReason;

const createNoopLease = () => ({
  active: false,
  current: null,
  timerId: null,
  renewalPromise: null,
});

export const createSchedulerLeaseRunner = ({
  jobKey,
  intervalMs,
  run,
  logger = console,
  leaseService = schedulerLeaseService,
  leaseTtlMs = DEFAULT_SCHEDULER_LEASE_TTL_MS,
  ownerTokenFactory = randomUUID,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) => {
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new TypeError("intervalMs must be a positive safe integer");
  }
  if (typeof run !== "function") {
    throw new TypeError("run must be a function");
  }
  if (!leaseService || typeof leaseService.acquire !== "function") {
    throw new TypeError("leaseService.acquire must be a function");
  }
  if (typeof leaseService.renew !== "function") {
    throw new TypeError("leaseService.renew must be a function");
  }
  if (typeof leaseService.release !== "function") {
    throw new TypeError("leaseService.release must be a function");
  }
  if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs <= 1) {
    throw new TypeError("leaseTtlMs must be a safe integer greater than 1");
  }
  if (typeof ownerTokenFactory !== "function") {
    throw new TypeError("ownerTokenFactory must be a function");
  }

  const ownerToken = ownerTokenFactory();
  if (typeof ownerToken !== "string" || ownerToken.length === 0) {
    throw new TypeError("ownerTokenFactory must return a non-empty string");
  }

  const state = {
    active: false,
    stopping: false,
    isRunning: false,
    intervalId: null,
    activeTickPromise: null,
    stopPromise: null,
    lease: createNoopLease(),
  };

  const clearRenewalTimer = () => {
    if (!state.lease.timerId) return;
    clearTimeoutFn(state.lease.timerId);
    state.lease.timerId = null;
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

          if (!result.renewed) {
            state.lease.active = false;
            logger.warn?.(
              { event: "scheduler_lease_runner.renew_skipped", jobKey, reason: result.reason },
              "Scheduler lease renewal skipped"
            );
            return;
          }

          state.lease.current = result.lease;
          scheduleRenewal();
        } catch (error) {
          state.lease.active = false;
          logger.error?.(
            {
              event: "scheduler_lease_runner.renew_failed",
              jobKey,
              reason: normalizeErrorCode(error),
            },
            "Scheduler lease renewal failed"
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
          { event: "scheduler_lease_runner.release_skipped", jobKey, reason: result.reason },
          "Scheduler lease release skipped"
        );
      }
    } catch (error) {
      logger.error?.(
        {
          event: "scheduler_lease_runner.release_failed",
          jobKey,
          reason: normalizeErrorCode(error),
        },
        "Scheduler lease release failed"
      );
    }
  };

  const runTick = async () => {
    if (!state.active || state.stopping) return;

    if (state.isRunning) {
      logger.warn?.(
        { event: "scheduler_lease_runner.overlap_skipped", jobKey },
        "Scheduler run skipped due to overlap"
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
            event: "scheduler_lease_runner.acquire_failed",
            jobKey,
            reason: normalizeErrorCode(error),
          },
          "Scheduler lease acquisition failed"
        );
        return;
      }

      if (!isRecord(leaseResult)) {
        logger.error?.(
          {
            event: "scheduler_lease_runner.acquire_invalid",
            jobKey,
            reason: "invalid_result",
          },
          "Scheduler lease acquisition returned an invalid result"
        );
        return;
      }

      if (typeof leaseResult.acquired !== "boolean") {
        logger.error?.(
          {
            event: "scheduler_lease_runner.acquire_invalid",
            jobKey,
            reason: "invalid_result",
          },
          "Scheduler lease acquisition returned an invalid result"
        );
        return;
      }

      if (!leaseResult.acquired) {
        logger.warn?.(
          {
            event: "scheduler_lease_runner.acquire_skipped",
            jobKey,
            reason: getFailureReason(leaseResult, "not_acquired"),
          },
          "Scheduler run skipped because lease was not acquired"
        );
        return;
      }

      if (
        !isValidAcquiredLease({
          lease: leaseResult.lease,
          expectedJobKey: jobKey,
          expectedOwnerToken: ownerToken,
        })
      ) {
        logger.error?.(
          {
            event: "scheduler_lease_runner.acquire_invalid",
            jobKey,
            reason: "invalid_lease",
          },
          "Scheduler lease acquisition returned an invalid lease"
        );
        return;
      }

      state.lease.active = true;
      state.lease.current = leaseResult.lease;
      scheduleRenewal();

      try {
        await run();
      } catch (error) {
        logger.error?.(
          {
            event: "scheduler_lease_runner.run_failed",
            jobKey,
            reason: normalizeErrorCode(error),
          },
          "Scheduler job failed"
        );
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

  const start = () => {
    if (state.intervalId) {
      return { started: false, reason: "already_started" };
    }

    state.active = true;
    state.stopping = false;
    state.stopPromise = null;
    state.intervalId = setIntervalFn(runTick, intervalMs);
    state.intervalId?.unref?.();

    return { started: true, intervalMs };
  };

  const stop = async () => {
    if (state.stopPromise) {
      return state.stopPromise;
    }
    if (!state.intervalId) {
      return { stopped: false };
    }

    state.stopping = true;
    state.active = false;
    clearIntervalFn(state.intervalId);
    state.intervalId = null;

    state.stopPromise = (async () => {
      try {
        if (state.activeTickPromise) {
          await state.activeTickPromise;
        } else {
          await stopRenewalLoop();
        }
      } finally {
        state.isRunning = false;
        state.stopping = false;
        state.stopPromise = null;
      }

      return { stopped: true };
    })();

    return state.stopPromise;
  };

  return { start, stop, runTick };
};
