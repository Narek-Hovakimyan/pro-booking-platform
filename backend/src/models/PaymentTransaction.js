import mongoose from "mongoose";

const paymentTransactionSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: ["booking", "subscription"],
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      default: null,
      index: true,
    },
    provider: {
      type: String,
      trim: true,
      lowercase: true,
      default: "manual",
    },
    providerPaymentId: {
      type: String,
      trim: true,
      default: null,
    },
    providerTransactionId: {
      type: String,
      trim: true,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "AMD",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "requires_action",
        "paid",
        "failed",
        "cancelled",
        "partially_refunded",
        "refunded",
        "expired",
      ],
      default: "pending",
      index: true,
    },
    type: {
      type: String,
      enum: ["payment", "deposit", "subscription", "refund"],
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ provider: 1, providerPaymentId: 1 });
paymentTransactionSchema.index({ provider: 1, providerTransactionId: 1 });
paymentTransactionSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
paymentTransactionSchema.index({ provider: 1, idempotencyKey: 1 }, { sparse: true });

const PaymentTransaction = mongoose.model(
  "PaymentTransaction",
  paymentTransactionSchema
);

export default PaymentTransaction;
