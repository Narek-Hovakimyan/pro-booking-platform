import mongoose from "mongoose";

const loyaltyProgramSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: ["barber", "salon"],
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "ownerTypeRef",
    },
    ownerTypeRef: {
      type: String,
      enum: ["BarberProfile", "Salon"],
      default: "BarberProfile",
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    requiredVisits: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    rewardText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

loyaltyProgramSchema.index({ ownerType: 1, ownerId: 1, active: 1 });

export default mongoose.model("LoyaltyProgram", loyaltyProgramSchema);
