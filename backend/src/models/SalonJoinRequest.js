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
    // Missing legacy values are interpreted as `direct` by the lifecycle.
    source: {
      type: String,
      enum: ["direct", "job"],
      default: "direct",
    },
    directReapplyAvailableAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    toJSON: { transform: hideInternalDirectRequestFields },
    toObject: { transform: hideInternalDirectRequestFields },
  }
);

function hideInternalDirectRequestFields(_document, value) {
  delete value.source;
  delete value.directReapplyAvailableAt;
  return value;
}

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
