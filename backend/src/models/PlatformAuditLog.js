import mongoose from "mongoose";

const platformAuditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Actor ID is required"],
    },
    action: {
      type: String,
      required: [true, "Action is required"],
      trim: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      default: null,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

platformAuditLogSchema.index({ actorId: 1, createdAt: -1 });
platformAuditLogSchema.index({ salonId: 1, createdAt: -1 });
platformAuditLogSchema.index({ action: 1, createdAt: -1 });

const PlatformAuditLog = mongoose.model(
  "PlatformAuditLog",
  platformAuditLogSchema
);

export default PlatformAuditLog;
