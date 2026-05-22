import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      default: "",
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
    reply: {
      message: { type: String, trim: true, default: "" },
      repliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

reviewSchema.index({ bookingId: 1 }, { unique: true });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
