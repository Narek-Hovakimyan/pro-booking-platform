const ACTION_FIELDS = Object.freeze({
  "salon_subscription.activate": ["status", "seatCount", "currentPeriodEnd"],
  "salon_subscription.cancel": ["status", "cancelledAt"],
  "salon_subscription.seat_count_update": ["seatCount"],
  "salon_subscription.seat_assign": ["seatId", "barberId"],
  "salon_subscription.seat_revoke": ["seatId", "barberId", "status"],
  "salon_subscription.payment_confirm": [
    "status",
    "paidAt",
    "confirmedAt",
    "subscriptionStatus",
  ],
});

const DATE_FIELDS = new Set([
  "currentPeriodEnd",
  "cancelledAt",
  "paidAt",
  "confirmedAt",
]);
const ID_FIELDS = new Set(["seatId", "barberId"]);

const serializeField = (field, value) => {
  if (value === null || value === undefined) return undefined;

  if (DATE_FIELDS.has(field)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (ID_FIELDS.has(field)) {
    const id = String(value);
    return /^[a-f\d]{24}$/i.test(id) ? id : undefined;
  }

  if (field === "seatCount") {
    return Number.isFinite(value) ? value : undefined;
  }

  return typeof value === "string" ? value : undefined;
};

const pickAllowedFields = (value, fields) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const result = {};
  for (const field of fields) {
    const serialized = serializeField(field, value[field]);
    if (serialized !== undefined) result[field] = serialized;
  }
  return Object.keys(result).length ? result : null;
};

export const serializePlatformAuditChanges = ({ action, oldValue, newValue }) => {
  const fields = ACTION_FIELDS[action];
  if (!fields) return null;

  const before = pickAllowedFields(oldValue, fields);
  const after = pickAllowedFields(newValue, fields);
  return before || after ? { before, after } : null;
};

