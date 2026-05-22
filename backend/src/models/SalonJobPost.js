import mongoose from "mongoose";

export const SALON_JOB_ROLES = [
  "barber",
  "hairdresser",
  "nail-artist",
  "makeup-artist",
  "receptionist",
  "other",
];

export const SALON_JOB_EMPLOYMENT_TYPES = [
  "full-time",
  "part-time",
  "contract",
  "commission",
  "rent-chair",
];

const salonJobPostSchema = new mongoose.Schema(
  {
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: SALON_JOB_ROLES,
      required: true,
      index: true,
    },
    customRole: {
      type: String,
      trim: true,
      default: "",
    },
    employmentType: {
      type: String,
      enum: SALON_JOB_EMPLOYMENT_TYPES,
      default: "full-time",
    },
    salary: {
      type: String,
      trim: true,
      default: "",
    },
    requirements: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    contactInfo: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

salonJobPostSchema.index({ salonId: 1, status: 1 });
salonJobPostSchema.index({ status: 1, createdAt: -1 });
salonJobPostSchema.index({ role: 1, status: 1 });

const SalonJobPost = mongoose.model("SalonJobPost", salonJobPostSchema);

export default SalonJobPost;
