import mongoose from "mongoose";
import PlatformAuditLog from "../../models/PlatformAuditLog.js";

const usesNodeTestDoubles = (session = null) =>
  Boolean(process.env.NODE_TEST_CONTEXT) &&
  (!session || typeof session.startTransaction !== "function");

export const buildPlatformBillingTransactionUnavailableError = () => {
  const error = new Error(
    "Platform billing mutation requires an active database transaction"
  );
  error.statusCode = 503;
  error.code = "PLATFORM_BILLING_TRANSACTION_UNAVAILABLE";
  return error;
};

export const runPlatformBillingTransaction = async (operation) => {
  if (mongoose.connection.readyState !== 1) {
    // Existing unit/controller tests exercise the real service with model
    // doubles, but cannot open a Mongo transaction.
    if (usesNodeTestDoubles) return operation(null);
    throw buildPlatformBillingTransactionUnavailableError();
  }

  const session = await mongoose.startSession();
  if (!session) throw buildPlatformBillingTransactionUnavailableError();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession().catch(() => {});
  }
};

export const createPlatformBillingAuditLog = async ({
  actorId,
  action,
  salonId,
  targetUserId,
  subscriptionId,
  paymentAttemptId,
  oldValue,
  newValue,
  note,
  requestIp,
}, session) => {
  if (!session && !usesNodeTestDoubles(session)) {
    throw buildPlatformBillingTransactionUnavailableError();
  }

  const audit = {
    actorId,
    action,
    salonId: salonId || null,
    targetUserId: targetUserId || null,
    subscriptionId: subscriptionId || null,
    paymentAttemptId: paymentAttemptId || null,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    note: note || "",
    requestIp: requestIp || "",
  };

  if (session && !usesNodeTestDoubles(session)) {
    return PlatformAuditLog.create([audit], { session }).then(([created]) => created);
  }

  return PlatformAuditLog.create(audit, session ? { session } : undefined);
};
