import mongoose from "mongoose";

const loyaltyRewardRedemptionSchema = new mongoose.Schema(
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
    milestone: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["claimed", "restored", "consumed"],
      required: true,
      default: "claimed",
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    restoredAt: {
      type: Date,
      default: null,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

loyaltyRewardRedemptionSchema.index(
  { barberId: 1, clientId: 1, milestone: 1 },
  { unique: true }
);
loyaltyRewardRedemptionSchema.index({ bookingId: 1, status: 1 });

export default mongoose.model(
  "LoyaltyRewardRedemption",
  loyaltyRewardRedemptionSchema
);
