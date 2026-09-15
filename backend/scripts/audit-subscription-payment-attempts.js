import mongoose from "mongoose";
import SubscriptionPaymentAttempt from "../src/models/SubscriptionPaymentAttempt.js";

const BOOKING_DEPOSIT_PURPOSE = "booking_deposit";
const SAFE_PROVIDERS = new Set([
  "disabled", "manual", "mock", "test", "stripe", "idram", "telcell", "bank",
]);
const SAFE_STATUSES = new Set([
  "pending", "requires_action", "paid", "failed", "cancelled", "refunded", "expired",
]);
const AUDIT_FIELDS = "_id bookingId purpose status provider createdAt updatedAt";

const objectIdString = (value) =>
  value?._bsontype === "ObjectId" ? String(value) : null;

const safeTimestamp = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const compareAttempts = (left, right) =>
  String(left.createdAt || "").localeCompare(String(right.createdAt || "")) ||
  String(left.id || "").localeCompare(String(right.id || ""));

const summarizeAttempt = (attempt) => ({
  id: objectIdString(attempt?._id),
  bookingId: objectIdString(attempt?.bookingId),
  status: SAFE_STATUSES.has(attempt?.status) ? attempt.status : null,
  provider: SAFE_PROVIDERS.has(attempt?.provider) ? attempt.provider : null,
  createdAt: safeTimestamp(attempt?.createdAt),
  updatedAt: safeTimestamp(attempt?.updatedAt),
});

const malformedReasons = (summary) => {
  const reasons = [];
  if (!summary.id) reasons.push("attempt_id_invalid");
  if (!summary.bookingId) reasons.push("booking_id_missing_or_invalid");
  if (!summary.status) reasons.push("status_missing_or_invalid");
  if (!summary.provider) reasons.push("provider_missing_or_invalid");
  return reasons;
};

export const analyzeBookingDepositAttempts = (attempts = []) => {
  const malformedRows = [];
  const groups = new Map();

  for (const attempt of attempts) {
    if (attempt?.purpose !== BOOKING_DEPOSIT_PURPOSE) continue;
    const summary = summarizeAttempt(attempt);
    const reasons = malformedReasons(summary);
    if (reasons.length) {
      malformedRows.push({ id: summary.id, reasons });
      continue;
    }
    const group = groups.get(summary.bookingId) || [];
    group.push(summary);
    groups.set(summary.bookingId, group);
  }

  const duplicateGroups = [...groups.entries()]
    .filter(([, attemptsForBooking]) => attemptsForBooking.length > 1)
    .map(([bookingId, attemptsForBooking]) => ({
      bookingId,
      attempts: attemptsForBooking.sort(compareAttempts),
    }))
    .sort((left, right) => left.bookingId.localeCompare(right.bookingId));

  malformedRows.sort((left, right) =>
    String(left.id || "").localeCompare(String(right.id || ""))
  );

  return {
    scannedBookingDepositAttempts: [...attempts].filter(
      (attempt) => attempt?.purpose === BOOKING_DEPOSIT_PURPOSE
    ).length,
    duplicateGroups,
    malformedRows,
    safeForFutureBookingDepositUniqueIndex:
      duplicateGroups.length === 0 && malformedRows.length === 0,
  };
};

const collectBookingDepositAttempts = async (PaymentAttemptModel) => {
  const query = PaymentAttemptModel.find({ purpose: BOOKING_DEPOSIT_PURPOSE })
    .select(AUDIT_FIELDS)
    .lean();
  const attempts = [];
  for await (const attempt of query.cursor()) attempts.push(attempt);
  return attempts;
};

export const runSubscriptionPaymentAttemptAudit = async ({
  environment = process.env,
  PaymentAttemptModel = SubscriptionPaymentAttempt,
  connect = mongoose.connect.bind(mongoose),
  disconnect = mongoose.disconnect.bind(mongoose),
  writeStdout = (value) => process.stdout.write(value),
  writeStderr = (value) => process.stderr.write(value),
  setExitCode = (code) => { process.exitCode = code; },
} = {}) => {
  const uri = environment.MONGO_URI || environment.MONGODB_URI;
  if (!uri) {
    setExitCode(1);
    writeStderr("Payment-attempt audit failed: database configuration is required\n");
    return null;
  }

  let connected = false;
  let failed = false;
  let result = null;
  try {
    await connect(uri);
    connected = true;
    result = analyzeBookingDepositAttempts(
      await collectBookingDepositAttempts(PaymentAttemptModel)
    );
  } catch {
    failed = true;
    setExitCode(1);
    writeStderr("Payment-attempt audit failed: database inspection could not be completed\n");
  } finally {
    if (connected) {
      try {
        await disconnect();
      } catch {
        failed = true;
        setExitCode(1);
        writeStderr("Payment-attempt audit failed: database disconnect could not be completed\n");
      }
    }
  }

  if (failed) return null;

  writeStdout(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.safeForFutureBookingDepositUniqueIndex) {
    setExitCode(2);
    writeStderr("Payment-attempt audit blocked: manual reconciliation is required\n");
  }
  return result;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await runSubscriptionPaymentAttemptAudit();
}
