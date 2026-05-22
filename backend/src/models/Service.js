import mongoose from "mongoose";

export const SERVICE_CATEGORIES = [
  "haircut",
  "hair-color",
  "styling",
  "beard",
  "nails",
  "makeup",
  "cosmetology",
  "lashes-brows",
  "massage",
  "other",
];

const serviceSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    duration: {
      type: Number,
      required: true,
      min: 1,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      enum: SERVICE_CATEGORIES,
      default: "other",
    },
    tags: {
      type: [String],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Service = mongoose.model("Service", serviceSchema);

export default Service;
