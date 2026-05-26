import mongoose from "mongoose";

/**
 * PortfolioPhoto — before/after photos for beauty professionals.
 *
 * - barberId: required, indexed — who owns this photo.
 * - salonId: optional — which salon context (if any).
 * - serviceId: optional — which service this photo showcases.
 * - beforeUrl / afterUrl: required — stored under /uploads/portfolio/.
 * - isPublic: must be paired with consentConfirmed: true to be visible publicly.
 * - active: soft-delete flag.
 * - consentConfirmed: required true if isPublic is true (enforced at controller level).
 */
const portfolioPhotoSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      default: null,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },
    category: {
      type: String,
      default: "",
      trim: true,
    },
    beforeUrl: {
      type: String,
      required: true,
      trim: true,
    },
    afterUrl: {
      type: String,
      required: true,
      trim: true,
    },
    caption: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    tags: {
      type: [String],
      default: [],
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    consentConfirmed: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

/* ── Indexes ─────────────────────────────────────────── */

// Fast public listing: active + public + consented
portfolioPhotoSchema.index({
  barberId: 1,
  active: 1,
  isPublic: 1,
  consentConfirmed: 1,
});

// Barber's own management listing by sort order
portfolioPhotoSchema.index({ barberId: 1, sortOrder: 1 });

// Recent-first fallback for tie-breaking
portfolioPhotoSchema.index({ barberId: 1, createdAt: -1 });

const PortfolioPhoto = mongoose.model(
  "PortfolioPhoto",
  portfolioPhotoSchema
);

export default PortfolioPhoto;
