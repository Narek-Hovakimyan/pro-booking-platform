import mongoose from "mongoose";

const bookingReminderDispatchSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    reminderType: {
      type: String,
      required: true,
      trim: true,
      enum: ["booking_reminder_24h", "booking_reminder_2h"],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["claimed", "sent", "failed"],
      default: "claimed",
    },
    claimToken: {
      type: String,
      trim: true,
      default: "",
      select: false,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    failureCode: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

bookingReminderDispatchSchema.index(
  { bookingId: 1, reminderType: 1, userId: 1 },
  { unique: true }
);
bookingReminderDispatchSchema.index({ status: 1, claimedAt: 1 });

const BookingReminderDispatch = mongoose.model(
  "BookingReminderDispatch",
  bookingReminderDispatchSchema
);

export default BookingReminderDispatch;
