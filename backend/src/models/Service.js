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

/**
 * Display labels corresponding to SERVICE_CATEGORIES.
 * Used to prevent custom category names from colliding with system labels.
 */
export const SERVICE_CATEGORY_LABELS = [
  "Haircut",
  "Hair color",
  "Styling",
  "Beard",
  "Nails",
  "Makeup",
  "Cosmetology",
  "Lashes & brows",
  "Massage",
  "Other",
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
    customCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceCategory",
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
    },
    type: {
      type: String,
      enum: ["single", "package"],
      default: "single",
    },
    includedServiceIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }],
      default: [],
    },
    packagePriceMode: {
      type: String,
      enum: ["manual", "sum"],
      default: "manual",
    },
    packageDurationMode: {
      type: String,
      enum: ["manual", "sum"],
      default: "manual",
    },
  },
  { timestamps: true }
);

serviceSchema.index({ barberId: 1, customCategoryId: 1 });

const Service = mongoose.model("Service", serviceSchema);

export default Service;
