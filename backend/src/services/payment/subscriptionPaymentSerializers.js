const toRawObject = (value) => (value?.toObject ? value.toObject() : value);

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  if (typeof value.id === "string") return value.id;
  return String(value);
};

const getAttemptAction = (raw) => {
  const action = raw?.metadata?.action;
  return ["renew", "update_seats"].includes(action) ? action : null;
};

export const serializeUserPaymentAttempt = (attempt) => {
  if (!attempt) return null;
  const raw = toRawObject(attempt);

  return {
    id: toIdString(raw._id || raw.id),
    status: raw.status,
    amount: raw.amount,
    currency: raw.currency,
    seatCount: raw.seatCount,
    months: raw.months,
    action: getAttemptAction(raw),
    checkoutUrl: raw.checkoutUrl || null,
    paidAt: raw.paidAt || null,
    confirmedAt: raw.confirmedAt || null,
    failedAt: raw.failedAt || null,
    refundedAt: raw.refundedAt || null,
    expiresAt: raw.expiresAt || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
};

export const serializeUserPaymentRecord = (payment) => {
  if (!payment) return null;
  const raw = toRawObject(payment);

  return {
    status: raw.status,
    amount: raw.amount,
    currency: raw.currency,
    seatCount: raw.seatCount,
    periodStart: raw.periodStart || null,
    periodEnd: raw.periodEnd || null,
    paidAt: raw.paidAt || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
};
