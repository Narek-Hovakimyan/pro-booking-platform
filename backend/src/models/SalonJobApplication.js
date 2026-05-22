import mongoose from "mongoose";

const salonJobApplicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalonJobPost",
      required: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      required: true,
    },
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    experience: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    contactInfo: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    statusUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

salonJobApplicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true });
salonJobApplicationSchema.index({ salonId: 1, status: 1 });
salonJobApplicationSchema.index({ applicantId: 1, createdAt: -1 });

const SalonJobApplication = mongoose.model(
  "SalonJobApplication",
  salonJobApplicationSchema
);

export default SalonJobApplication;
