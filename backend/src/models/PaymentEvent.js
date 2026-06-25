import mongoose from "mongoose";

const paymentEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    providerEventId: {
      type: String,
      required: true,
      trim: true,
    },
    eventType: {
      type: String,
      trim: true,
      default: "",
    },
    ownerType: {
      type: String,
      enum: ["booking", "subscription", "payment_transaction", "unknown"],
      default: "unknown",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      default: null,
    },
    status: {
      type: String,
      enum: ["received", "processed", "ignored", "failed"],
      default: "received",
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      select: false,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    errorMessage: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  { timestamps: true }
);

paymentEventSchema.index(
  { provider: 1, providerEventId: 1 },
  { unique: true }
);
paymentEventSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
paymentEventSchema.index({ transactionId: 1 });
paymentEventSchema.index({ status: 1, createdAt: -1 });

const PaymentEvent = mongoose.model("PaymentEvent", paymentEventSchema);

export default PaymentEvent;
