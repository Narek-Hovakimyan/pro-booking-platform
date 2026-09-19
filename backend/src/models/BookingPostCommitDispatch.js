import mongoose from "mongoose";

const bookingPostCommitDispatchSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: ["booking_created"],
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "processing", "failed", "delivered"],
      default: "pending",
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    nextAttemptAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    leaseToken: {
      type: String,
      select: false,
      default: "",
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    lastFailureCode: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

bookingPostCommitDispatchSchema.index(
  { bookingId: 1, eventType: 1 },
  { unique: true }
);
bookingPostCommitDispatchSchema.index({ status: 1, nextAttemptAt: 1 });
bookingPostCommitDispatchSchema.index({ status: 1, leaseExpiresAt: 1 });

export default mongoose.model(
  "BookingPostCommitDispatch",
  bookingPostCommitDispatchSchema
);
