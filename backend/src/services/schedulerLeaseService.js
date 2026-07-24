import { randomUUID } from "node:crypto";
import SchedulerLease from "../models/SchedulerLease.js";

export const DEFAULT_SCHEDULER_LEASE_TTL_MS = 60 * 1000;
const MAX_TOKEN_LENGTH = 200;

const notAcquired = (reason = "not_acquired") => ({
  acquired: false,
  lease: null,
  reason,
});

const notRenewed = (reason = "not_renewed") => ({
  renewed: false,
  lease: null,
  reason,
});

const notReleased = (reason = "not_released") => ({
  released: false,
  reason,
});

const validateToken = (name, value) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TOKEN_LENGTH ||
    value.trim() !== value
  ) {
    throw new TypeError(`${name} must be a non-empty trimmed string`);
  }

  return value;
};

export const validateJobKey = (jobKey) => validateToken("jobKey", jobKey);
export const validateOwnerToken = (ownerToken) =>
  validateToken("ownerToken", ownerToken);

export const validateTtlMs = (ttlMs) => {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError("ttlMs must be a positive safe integer");
  }

  return ttlMs;
};

export const validateFencingToken = (fencingToken) => {
  if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) {
    throw new TypeError("fencingToken must be a positive safe integer");
  }

  return fencingToken;
};

export const validateDate = (name, value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${name} must be a valid Date`);
  }

  return value;
};

const getNow = (nowFn) => validateDate("now", nowFn());

const getLeaseExpiry = (now, ttlMs) => {
  const leaseExpiresAt = new Date(now.getTime() + ttlMs);
  if (Number.isNaN(leaseExpiresAt.getTime())) {
    throw new TypeError("lease expiry must be a valid Date");
  }

  return leaseExpiresAt;
};

const isDuplicateKeyError = (error) => error?.code === 11000;

const getDocumentValue = (document) =>
  document && typeof document.toObject === "function"
    ? document.toObject()
    : document;

const normalizeLease = (document) => {
  const source = getDocumentValue(document);

  if (!source) return null;

  try {
    const jobKey = validateJobKey(source.jobKey);
    const ownerToken = validateOwnerToken(source.ownerToken);
    const leaseExpiresAt = validateDate("leaseExpiresAt", source.leaseExpiresAt);
    const fencingToken = validateFencingToken(source.fencingToken);

    return {
      jobKey,
      ownerToken,
      leaseExpiresAt: new Date(leaseExpiresAt),
      fencingToken,
      ...(source._id ? { _id: source._id } : {}),
      ...(source.createdAt ? { createdAt: new Date(source.createdAt) } : {}),
      ...(source.updatedAt ? { updatedAt: new Date(source.updatedAt) } : {}),
    };
  } catch {
    return null;
  }
};

const isExactLease = (lease, { jobKey, ownerToken, fencingToken }) =>
  lease?.jobKey === jobKey &&
  lease?.ownerToken === ownerToken &&
  lease?.fencingToken === fencingToken;

const acquired = (lease) => ({ acquired: true, lease });
const renewed = (lease) => ({ renewed: true, lease });

export const createSchedulerLeaseService = ({
  model = SchedulerLease,
  now = () => new Date(),
  ownerTokenFactory = randomUUID,
} = {}) => {
  if (
    !model ||
    typeof model.findOne !== "function" ||
    typeof model.create !== "function" ||
    typeof model.findOneAndUpdate !== "function"
  ) {
    throw new TypeError("model must provide findOne, create, and findOneAndUpdate");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (typeof ownerTokenFactory !== "function") {
    throw new TypeError("ownerTokenFactory must be a function");
  }

  const acquire = async ({
    jobKey,
    ownerToken = ownerTokenFactory(),
    ttlMs = DEFAULT_SCHEDULER_LEASE_TTL_MS,
  } = {}) => {
    const normalizedJobKey = validateJobKey(jobKey);
    const normalizedOwnerToken = validateOwnerToken(ownerToken);
    const validatedTtlMs = validateTtlMs(ttlMs);
    const currentTime = getNow(now);
    const leaseExpiresAt = getLeaseExpiry(currentTime, validatedTtlMs);

    let existingDocument;
    try {
      existingDocument = await model.findOne({ jobKey: normalizedJobKey });
    } catch {
      return notAcquired("storage_error");
    }

    if (!existingDocument) {
      try {
        const createdDocument = await model.create({
          jobKey: normalizedJobKey,
          ownerToken: normalizedOwnerToken,
          leaseExpiresAt,
          fencingToken: 1,
        });
        const lease = normalizeLease(createdDocument);

        if (!isExactLease(lease, {
          jobKey: normalizedJobKey,
          ownerToken: normalizedOwnerToken,
          fencingToken: 1,
        })) {
          return notAcquired("invalid_storage_result");
        }

        return acquired(lease);
      } catch (error) {
        return notAcquired(isDuplicateKeyError(error) ? "contended" : "storage_error");
      }
    }

    const existingLease = normalizeLease(existingDocument);
    if (!existingLease) return notAcquired("invalid_storage_result");

    if (existingLease.leaseExpiresAt.getTime() > currentTime.getTime()) {
      return notAcquired("active");
    }

    try {
      const takeoverDocument = await model.findOneAndUpdate(
        {
          jobKey: normalizedJobKey,
          ownerToken: existingLease.ownerToken,
          fencingToken: existingLease.fencingToken,
          leaseExpiresAt: { $lte: currentTime },
        },
        {
          $set: {
            ownerToken: normalizedOwnerToken,
            leaseExpiresAt,
          },
          $inc: { fencingToken: 1 },
        },
        { new: true, returnDocument: "after", runValidators: true }
      );
      const lease = normalizeLease(takeoverDocument);

      if (!isExactLease(lease, {
        jobKey: normalizedJobKey,
        ownerToken: normalizedOwnerToken,
        fencingToken: existingLease.fencingToken + 1,
      })) {
        return notAcquired("contended");
      }

      return acquired(lease);
    } catch {
      return notAcquired("storage_error");
    }
  };

  const renew = async ({ jobKey, ownerToken, fencingToken, ttlMs } = {}) => {
    const normalizedJobKey = validateJobKey(jobKey);
    const normalizedOwnerToken = validateOwnerToken(ownerToken);
    const validatedFencingToken = validateFencingToken(fencingToken);
    const validatedTtlMs = validateTtlMs(ttlMs);
    const currentTime = getNow(now);
    const leaseExpiresAt = getLeaseExpiry(currentTime, validatedTtlMs);

    try {
      const renewedDocument = await model.findOneAndUpdate(
        {
          jobKey: normalizedJobKey,
          ownerToken: normalizedOwnerToken,
          fencingToken: validatedFencingToken,
          leaseExpiresAt: { $gt: currentTime },
        },
        { $set: { leaseExpiresAt } },
        { new: true, returnDocument: "after", runValidators: true }
      );
      const lease = normalizeLease(renewedDocument);

      if (!isExactLease(lease, {
        jobKey: normalizedJobKey,
        ownerToken: normalizedOwnerToken,
        fencingToken: validatedFencingToken,
      })) {
        return notRenewed("not_owner");
      }

      return renewed(lease);
    } catch {
      return notRenewed("storage_error");
    }
  };

  const release = async ({ jobKey, ownerToken, fencingToken } = {}) => {
    const normalizedJobKey = validateJobKey(jobKey);
    const normalizedOwnerToken = validateOwnerToken(ownerToken);
    const validatedFencingToken = validateFencingToken(fencingToken);
    const currentTime = getNow(now);

    try {
      const releasedDocument = await model.findOneAndUpdate(
        {
          jobKey: normalizedJobKey,
          ownerToken: normalizedOwnerToken,
          fencingToken: validatedFencingToken,
        },
        { $set: { leaseExpiresAt: currentTime } },
        { new: true, returnDocument: "after", runValidators: true }
      );
      const lease = normalizeLease(releasedDocument);

      if (!isExactLease(lease, {
        jobKey: normalizedJobKey,
        ownerToken: normalizedOwnerToken,
        fencingToken: validatedFencingToken,
      })) {
        return notReleased("not_owner");
      }

      return { released: true, lease };
    } catch {
      return notReleased("storage_error");
    }
  };

  return { acquire, renew, release };
};

export const schedulerLeaseService = createSchedulerLeaseService();
export const acquireSchedulerLease = (...args) =>
  schedulerLeaseService.acquire(...args);
export const renewSchedulerLease = (...args) =>
  schedulerLeaseService.renew(...args);
export const releaseSchedulerLease = (...args) =>
  schedulerLeaseService.release(...args);
