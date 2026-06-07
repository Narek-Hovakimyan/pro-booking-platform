const allowedTransitions = {
  pending: new Set(["paid", "failed", "cancelled"]),
  requires_action: new Set(["paid", "failed"]),
  paid: new Set(["refunded"]),
};

export const assertPaymentAttemptTransition = (fromStatus, toStatus) => {
  if (fromStatus === "paid" && toStatus === "paid") {
    return { idempotent: true };
  }

  if (allowedTransitions[fromStatus]?.has(toStatus)) {
    return { idempotent: false };
  }

  const error = new Error(
    `Invalid payment attempt transition: ${fromStatus} -> ${toStatus}`
  );
  error.code = "INVALID_PAYMENT_ATTEMPT_TRANSITION";
  error.statusCode = 400;
  throw error;
};

export const applyPaymentAttemptTransition = (attempt, toStatus, now = new Date()) => {
  const transition = assertPaymentAttemptTransition(attempt.status, toStatus);

  if (transition.idempotent) {
    return transition;
  }

  attempt.status = toStatus;

  if (toStatus === "paid") {
    attempt.paidAt = now;
    attempt.confirmedAt = now;
  }

  if (toStatus === "failed") {
    attempt.failedAt = now;
  }

  if (toStatus === "refunded") {
    attempt.refundedAt = now;
  }

  return transition;
};
