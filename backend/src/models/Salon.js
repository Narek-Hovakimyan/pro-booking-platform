import mongoose from "mongoose";
import { JOIN_APPLICATION_POLICIES } from "../utils/salonJoinApplicationPolicy.js";

const salonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    admins: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    // Intentionally no default: legacy records missing this field remain `open`.
    joinApplicationPolicy: {
      type: String,
      enum: JOIN_APPLICATION_POLICIES,
    },
  },
  { timestamps: true }
);

salonSchema.index({ ownerId: 1 }, { name: "salons_ownerId_idx" });
salonSchema.index({ admins: 1 }, { name: "salons_admins_idx" });

const Salon = mongoose.model("Salon", salonSchema);

export default Salon;
