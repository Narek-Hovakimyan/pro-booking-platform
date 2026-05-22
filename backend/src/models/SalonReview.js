import mongoose from "mongoose";

const salonReviewSchema = new mongoose.Schema(
  {
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
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
      required: true,
      trim: true,
      maxlength: 500,
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

salonReviewSchema.index(
  { bookingId: 1, salonId: 1, clientId: 1 },
  { unique: true }
);

const SalonReview = mongoose.model("SalonReview", salonReviewSchema);

export default SalonReview;
