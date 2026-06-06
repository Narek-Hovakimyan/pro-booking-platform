import mongoose from "mongoose";

export const MAX_PHONE_LENGTH = 32;

const defaultScheduleSchema = new mongoose.Schema(
  {
    startTime: { type: String, default: "09:00" },
    endTime: { type: String, default: "18:00" },
    hasBreak: { type: Boolean, default: false },
    breakStart: { type: String, default: "" },
    breakEnd: { type: String, default: "" },
  },
  { _id: false }
);

const salonEntrySchema = new mongoose.Schema(
  {
    salon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    joinedAt: {
      type: Date,
      default: null,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    defaultSchedule: {
      type: defaultScheduleSchema,
      default: () => ({}),
    },
    relationshipType: {
      type: String,
      enum: ["staff", "chair_renter"],
      default: "staff",
    },
    relationshipStatus: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "accepted",
    },
    relationshipRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    relationshipRequestedAt: {
      type: Date,
      default: null,
    },
    relationshipRespondedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: MAX_PHONE_LENGTH,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerifiedAt: {
    type: Date,
    default: null,
  },
  emailVerificationTokenHash: {
    type: String,
    default: "",
    select: false,
  },
  emailVerificationExpires: {
    type: Date,
    default: null,
    select: false,
  },
  emailVerificationSentAt: {
    type: Date,
    default: null,
    select: false,
  },
  city: {
    type: String,
    trim: true,
    default: "",
  },
  avatarUrl: {
    type: String,
    trim: true,
    default: "",
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["client", "barber"],
    default: "client",
  },
  // Legacy single-salon fields (kept for backward compatibility)
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    default: null,
  },
  salonStatus: {
    type: String,
    enum: ["none", "pending", "approved", "rejected"],
    default: "none",
  },
  // New multi-salon support
  salons: {
    type: [salonEntrySchema],
    default: [],
  },
  profession: {
    type: String,
    enum: ["barber", "hair_stylist", "nail_master", "makeup_artist", "cosmetologist", "lash_brow", "massage", "other"],
    default: "barber",
  },
  barberType: {
    type: String,
    enum: ["men", "women", "unisex", ""],
    default: "",
  },
  // Kept for backward compatibility — derived from profession/barberType on read
  specialty: {
    type: String,
    enum: ["men", "women", "unisex"],
    default: "unisex",
  },
  workHistory: [
    {
      salon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Salon",
        default: null,
      },
      salonName: {
        type: String,
        trim: true,
        default: "",
      },
      startDate: {
        type: Date,
        default: Date.now,
      },
      endDate: {
        type: Date,
        default: null,
      },
      isCurrent: {
        type: Boolean,
        default: false,
      },
    },
  ],
  favoriteBarbers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  favoriteSalons: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save: enforce profession/barberType consistency
// - non-barber profession → clear barberType, keep specialty unisex
// - barber profession → default barberType to "unisex", align legacy specialty
userSchema.pre("save", function () {
  if (this.profession && this.profession !== "barber") {
    this.barberType = "";
    if (!["men", "women", "unisex"].includes(this.specialty)) {
      this.specialty = "unisex";
    }
  } else if (this.profession === "barber") {
    this.barberType = this.barberType || "unisex";
    this.specialty = this.barberType;
  }
});

// Pre-findOneAndUpdate: enforce invariants for findByIdAndUpdate queries
// (findByIdAndUpdate bypasses pre('save'))
userSchema.pre("findOneAndUpdate", function () {
  const update = this.getUpdate();
  const set = update?.$set || update;

  if (set.profession !== undefined) {
    if (set.profession !== "barber") {
      // Non-barber → clear barberType, specialty stays valid
      this.set({ barberType: "" });
    } else {
      // Barbers get a default barberType
      this.set({ barberType: set.barberType || "unisex" });
    }
  }

  // Align specialty when barberType is explicitly being set
  // Note: only for barbers — non-barber profession block above already cleared barberType
  if (set.barberType !== undefined) {
    const isBarber = set.profession === undefined || set.profession === "barber";
    if (isBarber && set.barberType && ["men", "women", "unisex"].includes(set.barberType)) {
      this.set({ specialty: set.barberType });
    }
  }
});

// Pre-init: derive profession/barberType from old specialty for backward compatibility
userSchema.pre("init", function (doc) {
  if (!doc.profession && doc.specialty) {
    doc.profession = "barber";
    doc.barberType = doc.specialty;
  }
});

// Virtual getter for backward compatibility - returns the primary approved salon
userSchema.virtual("primarySalon").get(function () {
  const approved = (this.salons || []).filter((s) => s.status === "approved");
  const primary = approved.find((s) => s.isPrimary);
  return primary?.salon || approved[0]?.salon || null;
});

// Helper: get all approved salons
userSchema.methods.getApprovedSalons = function () {
  return (this.salons || []).filter((s) => s.status === "approved");
};

// Helper: check if barber has a specific approved salon
userSchema.methods.hasApprovedSalon = function (salonId) {
  return (this.salons || []).some(
    (s) =>
      s.salon?.toString() === salonId?.toString() && s.status === "approved"
  );
};

userSchema.index({ email: 1 }, { unique: true, sparse: true });

const User = mongoose.model("User", userSchema);

export default User;
