import Subscription from "../../models/Subscription.js";
import { SCHEDULER_LEASE_LOST_ERROR_CODE } from "../schedulerLeaseService.js";
import { PAID_SUBSCRIPTION_STATUSES } from "./subscriptionHelpers.js";

/**
 * Expire subscriptions whose current period or trial has ended.
 */
const FENCED_INFRA_ERROR_NAMES = new Set([
  "MongoExpiredSessionError",
  "MongoNetworkError",
  "MongoNotConnectedError",
  "MongoNetworkError",
  "MongoRuntimeError",
  "MongoServerClosedError",
  "MongoSystemError",
  "MongoTopologyClosedError",
  "MongoTransactionError",
  "MongooseServerSelectionError",
]);

const FENCED_INFRA_ERROR_CODES = new Set([
  91, 112, 189, 251, 10107, 11600, 11602, 13435, 13436,
]);

const FENCED_INFRA_ERROR_CODE_NAMES = new Set([
  "InterruptedAtShutdown",
  "InterruptedDueToReplStateChange",
  "LockTimeout",
  "NoSuchTransaction",
  "NotWritablePrimary",
  "PrimarySteppedDown",
  "ShutdownInProgress",
  "WriteConflict",
]);

const FENCED_INFRA_LABELS = new Set([
  "RetryableWriteError",
  "TransientTransactionError",
  "UnknownTransactionCommitResult",
]);

const getStructuredErrorCandidates = (error) => {
  const seen = new Set();
  const queue = [error];
  const candidates = [];

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    candidates.push(candidate);

    for (const key of ["cause", "error", "originalError", "reason"]) {
      if (candidate[key] && typeof candidate[key] === "object") {
        queue.push(candidate[key]);
      }
    }
  }

  return candidates;
};

const isFencedInfrastructureError = (error) => {
  return getStructuredErrorCandidates(error).some((candidate) => {
    if (candidate.code === SCHEDULER_LEASE_LOST_ERROR_CODE) {
      return true;
    }

    if (
      typeof candidate.code === "number" &&
      FENCED_INFRA_ERROR_CODES.has(candidate.code)
    ) {
      return true;
    }

    if (
      typeof candidate.codeName === "string" &&
      FENCED_INFRA_ERROR_CODE_NAMES.has(candidate.codeName)
    ) {
      return true;
    }

    if (typeof candidate.hasErrorLabel === "function") {
      for (const label of FENCED_INFRA_LABELS) {
        if (candidate.hasErrorLabel(label)) {
          return true;
        }
      }
    }

    if (Array.isArray(candidate.errorLabels)) {
      for (const label of candidate.errorLabels) {
        if (FENCED_INFRA_LABELS.has(label)) {
          return true;
        }
      }
    }

    return (
      typeof candidate.name === "string" &&
      FENCED_INFRA_ERROR_NAMES.has(candidate.name)
    );
  });
};

export const expireSubscriptions = async ({ now = new Date(), leaseContext } = {}) => {
  const withFencedWrite =
    typeof leaseContext?.withFencedWrite === "function"
      ? (write) => leaseContext.withFencedWrite(write)
      : (write) => write({});
  const subscriptions = await Subscription.find({
    status: { $in: PAID_SUBSCRIPTION_STATUSES },
    $or: [
      { currentPeriodEnd: { $lt: now } },
      { trialEndsAt: { $lt: now } },
    ],
  });
  const summary = {
    checkedCount: subscriptions.length,
    expiredCount: 0,
    errorsCount: 0,
    errors: [],
  };

  for (const subscription of subscriptions) {
    try {
      const expiredSubscription = await withFencedWrite(({ session } = {}) =>
        Subscription.findOneAndUpdate(
          {
            _id: subscription._id,
            status: { $in: PAID_SUBSCRIPTION_STATUSES },
            $or: [
              { currentPeriodEnd: { $lt: now } },
              { trialEndsAt: { $lt: now } },
            ],
          },
          { $set: { status: "expired" } },
          { returnDocument: "after", session }
        )
      );

      if (expiredSubscription) {
        summary.expiredCount++;
      }
    } catch (error) {
      if (isFencedInfrastructureError(error)) {
        throw error;
      }
      summary.errorsCount++;
      summary.errors.push({
        subscriptionId: String(subscription._id),
        message: error.message,
      });
    }
  }

  return summary;
};
