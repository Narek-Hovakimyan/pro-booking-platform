const BOOKING_QUOTE_EVENT = "booking.quote.outcome";
const BOOKING_CREATE_EVENT = "booking.create.outcome";
const BOOKING_DEPOSIT_RECOVERY_EVENT = "booking.deposit.recovery";

const safeStatusCode = (value) =>
  Number.isInteger(value) && value >= 100 && value <= 599 ? value : 500;

const emit = (logger, level, payload) => {
  try {
    logger?.[level]?.(payload, payload.event);
  } catch {
    // Observability is strictly best-effort.
  }
};

export const logBookingQuoteOutcome = ({ logger, result }) => {
  const statusCode = safeStatusCode(result?.status);
  const outcome = statusCode === 200
    ? "success"
    : result?.body?.code === "BARBER_UNAVAILABLE"
      ? "availability_rejected"
      : "controlled_rejection";
  emit(logger, "info", {
    event: BOOKING_QUOTE_EVENT,
    operation: "quote",
    outcome,
    statusCode,
  });
};

export const logBookingCreateOutcome = ({ logger, result }) => {
  const statusCode = safeStatusCode(result?.status);
  const replay = result?.idempotencyReplay === true;
  const outcome = replay
    ? "idempotency_replay"
    : result?.observabilityOutcome ||
      (statusCode === 201
        ? "created"
        : statusCode === 409
          ? "idempotency_conflict"
          : statusCode >= 500
            ? "transaction_unavailable"
            : "controlled_rejection");
  emit(logger, statusCode >= 500 ? "warn" : "info", {
    event: BOOKING_CREATE_EVENT,
    operation: "create",
    outcome,
    replay,
    statusCode,
  });
};

export const logBookingDepositRecovery = ({ logger }) => {
  emit(logger, "warn", {
    event: BOOKING_DEPOSIT_RECOVERY_EVENT,
    operation: "create",
    outcome: "initialization_recovered",
  });
};
