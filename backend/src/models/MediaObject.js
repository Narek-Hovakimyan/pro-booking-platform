import mongoose from "mongoose";

export const MEDIA_OBJECT_STATES = Object.freeze({
  STAGED: "staged",
  ACTIVE: "active",
  DELETE_PENDING: "delete-pending",
  DELETED: "deleted",
  FAILED: "failed",
});

const states = Object.values(MEDIA_OBJECT_STATES);

const storageKeyValidator = {
  validator(value) {
    return (
      typeof value === "string" &&
      value.trim() === value &&
      value.length > 0 &&
      value.length <= 512 &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !value.includes("..") &&
      !/[\u0000-\u001f]/.test(value)
    );
  },
  message: "storageKey must be an opaque media storage key",
};

const mediaObjectSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "local",
      maxlength: 64,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      validate: storageKeyValidator,
    },
    status: {
      type: String,
      required: true,
      enum: states,
      default: MEDIA_OBJECT_STATES.STAGED,
      index: true,
    },
    contentType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 255,
    },
    byteSize: {
      type: Number,
      min: 0,
      default: 0,
    },
    checksumSha256: {
      type: String,
      default: "",
      trim: true,
      maxlength: 64,
    },
    originalFilename: {
      type: String,
      default: "",
      trim: true,
      maxlength: 255,
    },
    legacyUrl: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1024,
    },
    stagedAt: {
      type: Date,
      default: Date.now,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    deletePendingAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    failureCode: {
      type: String,
      default: "",
      trim: true,
      maxlength: 128,
    },
    failureReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 512,
    },
  },
  { timestamps: true }
);

mediaObjectSchema.index(
  { storageKey: 1 },
  { unique: true, name: "mediaobjects_storageKey_unique" }
);
mediaObjectSchema.index({ status: 1, createdAt: 1 });
mediaObjectSchema.index({ deletePendingAt: 1 });

mediaObjectSchema.pre("validate", function setLifecycleTimestamps() {
  const now = new Date();
  if (!this.stagedAt) this.stagedAt = now;
  if (this.status === MEDIA_OBJECT_STATES.ACTIVE && !this.activatedAt) {
    this.activatedAt = now;
  }
  if (this.status === MEDIA_OBJECT_STATES.DELETE_PENDING && !this.deletePendingAt) {
    this.deletePendingAt = now;
  }
  if (this.status === MEDIA_OBJECT_STATES.DELETED && !this.deletedAt) {
    this.deletedAt = now;
  }
  if (this.status === MEDIA_OBJECT_STATES.FAILED && !this.failedAt) {
    this.failedAt = now;
  }
});

const MediaObject = mongoose.model("MediaObject", mediaObjectSchema);

export default MediaObject;
