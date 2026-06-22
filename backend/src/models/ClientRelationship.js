import mongoose from "mongoose";

const clientRelationshipSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      default: null,
      index: true,
    },
    isVip: {
      type: Boolean,
      default: false,
    },
    internalNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

clientRelationshipSchema.index({ barberId: 1, clientId: 1 }, { unique: true });

export default mongoose.model("ClientRelationship", clientRelationshipSchema);
