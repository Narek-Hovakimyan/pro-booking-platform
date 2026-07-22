import mongoose from "mongoose";

export const REFRESH_SESSION_REVOKE_REASONS = [
  "rotated",
  "logout",
  "logout_all",
  "password_change",
  "password_reset",
  "user_disabled",
  "user_deleted",
  "expired",
  "reuse_detected",
];

export const REFRESH_SESSION_MAX_IP_LENGTH = 128;
export const REFRESH_SESSION_MAX_USER_AGENT_LENGTH = 512;

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    familyId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
      immutable: true,
      select: false,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedReason: {
      type: String,
      enum: REFRESH_SESSION_REVOKE_REASONS,
      default: null,
    },
    replacedBySessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefreshSession",
      default: null,
    },
    parentSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefreshSession",
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    createdByIp: {
      type: String,
      default: "",
      trim: true,
      maxlength: REFRESH_SESSION_MAX_IP_LENGTH,
    },
    lastUsedIp: {
      type: String,
      default: "",
      trim: true,
      maxlength: REFRESH_SESSION_MAX_IP_LENGTH,
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
      maxlength: REFRESH_SESSION_MAX_USER_AGENT_LENGTH,
    },
  },
  { timestamps: true }
);

refreshSessionSchema.index({ tokenHash: 1 }, { unique: true });
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
refreshSessionSchema.index({ familyId: 1, revokedAt: 1 });
refreshSessionSchema.index({ parentSessionId: 1 });

const RefreshSession =
  mongoose.models.RefreshSession ||
  mongoose.model("RefreshSession", refreshSessionSchema);

export default RefreshSession;
