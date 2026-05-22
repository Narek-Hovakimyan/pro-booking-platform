import mongoose from "mongoose";

const eventReviewSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventRegistration",
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

eventReviewSchema.index({ registrationId: 1 }, { unique: true });
eventReviewSchema.index({ eventId: 1, userId: 1, registrationId: 1 }, { unique: true });

const EventReview = mongoose.model("EventReview", eventReviewSchema);

export default EventReview;
