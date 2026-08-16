import mongoose from "mongoose";

export const MEDIA_OBJECT_STATES = Object.freeze({
  STAGED: "staged",
  ACTIVE: "active",
  DELETE_PENDING: "delete-pending",
  DELETED: "deleted",
  FAILED: "failed",
});

const states = Object.values(MEDIA_OBJECT_STATES);

export const buildMediaLifecycleTimestamps = (status, now = new Date()) => {
  if (status === MEDIA_OBJECT_STATES.ACTIVE) return { activatedAt: now };
  if (status === MEDIA_OBJECT_STATES.DELETE_PENDING) {
    return { deletePendingAt: now };
  }
  if (status === MEDIA_OBJECT_STATES.DELETED) return { deletedAt: now };
  if (status === MEDIA_OBJECT_STATES.FAILED) return { failedAt: now };
  return {};
};

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

const stageKeyValidator = {
  validator(value) {
    return (
      value === "" ||
      (typeof value === "string" &&
        value.trim() === value &&
        /^[0-9a-f-]{36}\.stage$/.test(value))
    );
  },
  message: "stageKey must identify a staged media object",
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
    stageKey: {
      type: String,
      default: "",
      trim: true,
      validate: stageKeyValidator,
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
    mediaClass: {
      type: String,
      default: "",
      trim: true,
      maxlength: 64,
      index: true,
    },
    access: {
      type: String,
      enum: ["private", "public"],
      default: "private",
      index: true,
    },
    ownerModel: {
      type: String,
      default: "",
      trim: true,
      maxlength: 64,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
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
    reconciliationLeaseToken: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
    reconciliationLeaseExpiresAt: {
      type: Date,
      default: null,
    },
    reconciliationFencingToken: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (value) => Number.isSafeInteger(value) && value >= 0,
        message: "reconciliationFencingToken must be a non-negative safe integer",
      },
    },
    reconciliationRetryCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (value) => Number.isSafeInteger(value) && value >= 0,
        message: "reconciliationRetryCount must be a non-negative safe integer",
      },
    },
    nextReconciliationAt: {
      type: Date,
      default: null,
    },
    lastReconciliationError: {
      type: String,
      default: "",
      trim: true,
      maxlength: 512,
    },
    reconciliationManual: {
      type: Boolean,
      default: false,
      index: true,
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
mediaObjectSchema.index({ status: 1, nextReconciliationAt: 1, reconciliationLeaseExpiresAt: 1 });
mediaObjectSchema.index({ ownerModel: 1, ownerId: 1, mediaClass: 1, legacyUrl: 1 });

mediaObjectSchema.pre("validate", function setLifecycleTimestamps() {
  const now = new Date();
  if (!this.stagedAt) this.stagedAt = now;
  for (const [field, value] of Object.entries(
    buildMediaLifecycleTimestamps(this.status, now)
  )) {
    if (!this[field]) this[field] = value;
  }
});

const MediaObject = mongoose.model("MediaObject", mediaObjectSchema);

export default MediaObject;
