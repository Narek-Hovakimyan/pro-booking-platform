import mongoose from "mongoose";

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
    },
  },
  { timestamps: true }
);

/* ── Indexes ────────────────────────────────────────────── */

// Unique active custom-category name per owner
serviceCategorySchema.index(
  { ownerType: 1, ownerId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true, source: "custom" },
  }
);

// Fast lookup of system categories
serviceCategorySchema.index({ source: 1, active: 1, sortOrder: 1 });

// Fast lookup by owner (barber / salon)
serviceCategorySchema.index({ ownerType: 1, ownerId: 1, active: 1, sortOrder: 1 });

const ServiceCategory = mongoose.model("ServiceCategory", serviceCategorySchema);

export default ServiceCategory;
