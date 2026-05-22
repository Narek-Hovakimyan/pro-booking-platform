import mongoose from "mongoose";

const salonJoinRequestSchema = new mongoose.Schema(
  {
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      required: true,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

salonJoinRequestSchema.index(
  { salonId: 1, barberId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

const SalonJoinRequest = mongoose.model(
  "SalonJoinRequest",
  salonJoinRequestSchema
);

export default SalonJoinRequest;
