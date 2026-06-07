import mongoose from "mongoose";

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
    },
  },
  { timestamps: true }
);

subscriptionPaymentAttemptSchema.index({ payerId: 1, status: 1, createdAt: -1 });
subscriptionPaymentAttemptSchema.index({ ownerType: 1, ownerId: 1, status: 1 });
subscriptionPaymentAttemptSchema.index({ purpose: 1, bookingId: 1, status: 1 });
subscriptionPaymentAttemptSchema.index({ provider: 1, providerIntentId: 1 });
subscriptionPaymentAttemptSchema.index({ provider: 1, providerPaymentId: 1 });

const SubscriptionPaymentAttempt = mongoose.model(
  "SubscriptionPaymentAttempt",
  subscriptionPaymentAttemptSchema
);

export default SubscriptionPaymentAttempt;
