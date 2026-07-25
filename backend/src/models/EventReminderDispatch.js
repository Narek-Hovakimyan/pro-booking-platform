import mongoose from "mongoose";

const eventReminderDispatchSchema = new mongoose.Schema(
  {
    eventRegistrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventRegistration",
      required: true,
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

eventReminderDispatchSchema.index(
  { eventRegistrationId: 1, userId: 1 },
  { unique: true }
);
eventReminderDispatchSchema.index({ status: 1, claimedAt: 1 });

const EventReminderDispatch = mongoose.model(
  "EventReminderDispatch",
  eventReminderDispatchSchema
);

export default EventReminderDispatch;
