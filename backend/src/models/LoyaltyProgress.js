import mongoose from "mongoose";

const loyaltyProgressSchema = new mongoose.Schema(
  {
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyProgram",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    punchCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    punchBookingIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
      },
    ],
    rewardsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

loyaltyProgressSchema.index({ clientId: 1, programId: 1 }, { unique: true });

export default mongoose.model("LoyaltyProgress", loyaltyProgressSchema);
