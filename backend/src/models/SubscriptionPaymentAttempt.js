import mongoose from "mongoose";

const SUPPORTED_CURRENCY = "AMD";
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_METADATA_DEPTH = 5;
const MAX_PROCESSED_WEBHOOK_EVENTS = 100;

const metadataDepth = (value, depth = 0) => {
  if (value === null || typeof value !== "object") return depth;
  return Math.max(
    depth,
    ...Object.values(value).map((child) => metadataDepth(child, depth + 1))
  );
};

const metadataIsSafe = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    return (
      Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_METADATA_BYTES &&
      metadataDepth(value) <= MAX_METADATA_DEPTH
    );
  } catch {
    return false;
  }
};

const subscriptionPaymentAttemptSchema = new mongoose.Schema(
  {
    purpose: {
      type: String,
      enum: ["subscription", "booking_deposit"],
      default: "subscription",
      required: true,
      index: true,
    },
    ownerType: {
      type: String,
      required: true,
      enum: ["barber", "salon"],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    payerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    provider: {
      type: String,
      enum: ["disabled", "manual", "mock", "test", "stripe", "idram", "telcell", "bank"],
      default: "manual",
    },
    providerPaymentId: {
      type: String,
      default: null,
      trim: true,
    },
    providerIntentId: {
      type: String,
      default: null,
      trim: true,
    },
    checkoutUrl: {
      type: String,
      default: null,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "AMD",
      trim: true,
      uppercase: true,
    },
    seatCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    months: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "requires_action",
        "paid",
        "failed",
        "cancelled",
        "refunded",
        "expired",
      ],
      default: "pending",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    paidAt: {
      type: Date,
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    processedWebhookEventIds: {
      type: [String],
      default: [],
      validate: {
        validator: (ids) =>
          Array.isArray(ids) &&
          ids.length <= MAX_PROCESSED_WEBHOOK_EVENTS &&
          new Set(ids).size === ids.length &&
          ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 256),
        message: "processedWebhookEventIds is invalid or too large",
      },
    },
  },
  { timestamps: true }
);

subscriptionPaymentAttemptSchema.path("amount").validate(
  (value) => Number.isFinite(value) && Number.isInteger(value) && value > 0,
  "amount must be a finite positive integer"
);
for (const field of ["seatCount", "months"]) {
  subscriptionPaymentAttemptSchema.path(field).validate(
    (value) => Number.isFinite(value) && Number.isInteger(value) && value > 0,
    `${field} must be a finite positive integer`
  );
}
subscriptionPaymentAttemptSchema.path("currency").validate(
  (value) => value === SUPPORTED_CURRENCY,
  "currency is not supported"
);
subscriptionPaymentAttemptSchema.path("metadata").validate(
  metadataIsSafe,
  "metadata exceeds the allowed size or depth"
);
subscriptionPaymentAttemptSchema.pre("validate", function validatePurposeReferences() {
  const hasSubscription = Boolean(this.subscriptionId);
  const hasBooking = Boolean(this.bookingId);
  if (this.purpose === "subscription" && (hasBooking || (this.status === "paid" && !hasSubscription))) {
    this.invalidate(
      "subscriptionId",
      "subscription payment attempts require subscriptionId when paid and forbid bookingId"
    );
  }
  if (this.purpose === "booking_deposit" && (!hasBooking || hasSubscription)) {
    this.invalidate(
      "bookingId",
      "booking deposit attempts require bookingId and forbid subscriptionId"
    );
  }
});

subscriptionPaymentAttemptSchema.index({ payerId: 1, status: 1, createdAt: -1 });
subscriptionPaymentAttemptSchema.index({ ownerType: 1, ownerId: 1, status: 1 });
subscriptionPaymentAttemptSchema.index({ purpose: 1, bookingId: 1, status: 1 });
subscriptionPaymentAttemptSchema.index(
  { provider: 1, providerIntentId: 1 },
  { unique: true, partialFilterExpression: { providerIntentId: { $type: "string", $gt: "" } } }
);
subscriptionPaymentAttemptSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string", $gt: "" } } }
);

export const subscriptionPaymentAttemptLimits = {
  MAX_METADATA_BYTES,
  MAX_METADATA_DEPTH,
  MAX_PROCESSED_WEBHOOK_EVENTS,
  SUPPORTED_CURRENCY,
};

const SubscriptionPaymentAttempt = mongoose.model(
  "SubscriptionPaymentAttempt",
  subscriptionPaymentAttemptSchema
);

export default SubscriptionPaymentAttempt;
