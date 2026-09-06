import crypto from "node:crypto";

import PlatformBillingIdempotencyOperation from "../../models/PlatformBillingIdempotencyOperation.js";

export const PLATFORM_SALON_ACTIVATION_ACTION = "salon_subscription.activate.v1";
const MAX_KEY_LENGTH = 200;

const error = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export const normalizePlatformBillingIdempotencyKey = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > MAX_KEY_LENGTH) {
    throw error("Idempotency-Key must be a non-empty string up to 200 characters", 400);
  }
  return value.trim();
};

export const createActivationRequestFingerprint = ({ months, hasSeatCount, seatCount, note }) =>
  crypto.createHash("sha256").update(JSON.stringify({
    months,
    hasSeatCount,
    seatCount: hasSeatCount ? seatCount : null,
    note: note.trim(),
  })).digest("hex");

const operationFilter = ({ actorId, action, resourceType, resourceId, key }) => ({
  actorId, action, resourceType, resourceId, key,
});

export const findPlatformBillingOperation = (context, session = null) =>
  PlatformBillingIdempotencyOperation.findOne(
    operationFilter(context),
    null,
    session ? { session } : undefined
  );

export const assertMatchingPlatformBillingOperation = (operation, fingerprint) => {
  if (operation.requestFingerprint !== fingerprint) {
    throw error("Idempotency-Key was already used with a different request", 409);
  }
  return operation.responseSnapshot;
};

export const createPlatformBillingOperation = (context, responseSnapshot, session) =>
  PlatformBillingIdempotencyOperation.create(
    [{ ...operationFilter(context), requestFingerprint: context.requestFingerprint, status: "completed", responseSnapshot }],
    { session }
  ).then(([operation]) => operation);

export const isDuplicatePlatformBillingOperationError = (value) => value?.code === 11000;
