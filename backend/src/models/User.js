import mongoose from "mongoose";

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
