import mongoose from "mongoose";

export const formatServiceCategoryName = (name) =>
  typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";

export const normalizeServiceCategoryName = (name) =>
  formatServiceCategoryName(name).toLowerCase();

export const isValidServiceCategorySortOrder = (value) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0;

/**
 * ServiceCategory — stores both system-controlled and owner-scoped custom categories.
 *
 * - `source: "system"`  → global app-controlled categories (seeded or from static taxonomy).
 * - `source: "custom"`  → created by a barber or salon owner.
 *
 * Only `source: "custom"` categories have a meaningful `ownerId` / `ownerType`.
 */
const serviceCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /* Canonical custom-category name used for owner-scoped uniqueness. */
    normalizedName: {
      type: String,
      trim: true,
      default: "",
    },
    /* Stable key for system categories (e.g. "haircut", "nails").
       Empty for custom categories — they are identified by _id. */
    key: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      enum: ["system", "custom"],
      default: "custom",
    },
    ownerType: {
      type: String,
      enum: ["global", "barber", "salon"],
      default: "barber",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      set: (value) => {
        if (!isValidServiceCategorySortOrder(value)) {
          throw new mongoose.Error.CastError("Number", value, "sortOrder");
        }
        return value;
      },
      validate: {
        validator: isValidServiceCategorySortOrder,
        message: "sortOrder must be a finite, non-negative integer",
      },
    },
    /* Marks rows allocated under the collision-safe ordering index. Legacy
       rows intentionally omit this field so their historical ties remain readable. */
    sortOrderReserved: {
      type: Boolean,
      default: false,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, value) => {
        delete value.sortOrderReserved;
        return value;
      },
    },
  }
);

/* ── Indexes ────────────────────────────────────────────── */

// Unique active custom-category name per owner. Legacy rows without a
// normalizedName remain readable and are protected by controller checks until
// they are next saved.
serviceCategorySchema.index(
  { ownerType: 1, ownerId: 1, normalizedName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      active: true,
      source: "custom",
      normalizedName: { $type: "string", $ne: "" },
    },
  }
);

// New allocations reserve an owner-scoped position in the database. The
// partial filter keeps pre-existing legacy duplicate positions indexable.
serviceCategorySchema.index(
  { ownerType: 1, ownerId: 1, sortOrder: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "custom",
      active: true,
      sortOrderReserved: true,
    },
  }
);

// Unique key for system categories — prevents duplicate seed inserts.
// Only applies when source="system" and key is a non-empty string,
// so custom categories (key: "") are not affected.
serviceCategorySchema.index(
  { key: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "system",
      key: { $type: "string", $ne: "" },
    },
  }
);

// Fast lookup of system categories
serviceCategorySchema.index({ source: 1, active: 1, sortOrder: 1 });

// Fast lookup by owner (barber / salon)
serviceCategorySchema.index({ ownerType: 1, ownerId: 1, active: 1, sortOrder: 1 });

serviceCategorySchema.pre("validate", function normalizeCustomCategoryName() {
  if (this.source === "custom") {
    this.name = formatServiceCategoryName(this.name);
    this.normalizedName = normalizeServiceCategoryName(this.name);
  }
});

const ServiceCategory = mongoose.model("ServiceCategory", serviceCategorySchema);

export default ServiceCategory;
