import mongoose from "mongoose";

const subscriptionPaymentAttemptSchema = new mongoose.Schema(
  {
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
    provider: {
      type: String,
      enum: ["manual", "stripe", "idram", "telcell", "bank"],
      default: "manual",
    },
    providerIntentId: {
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
      enum: ["pending", "paid", "failed", "cancelled", "expired"],
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
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

subscriptionPaymentAttemptSchema.index({ payerId: 1, status: 1, createdAt: -1 });
subscriptionPaymentAttemptSchema.index({ ownerType: 1, ownerId: 1, status: 1 });
subscriptionPaymentAttemptSchema.index({ provider: 1, providerIntentId: 1 });

const SubscriptionPaymentAttempt = mongoose.model(
  "SubscriptionPaymentAttempt",
  subscriptionPaymentAttemptSchema
);

export default SubscriptionPaymentAttempt;
