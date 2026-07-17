import mongoose from "mongoose";

const depositSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    mode: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },
    value: {
      type: Number,
      default: 0,
      min: 0,
    },
    minimumBookingPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    noShowPolicyText: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  { _id: false }
);

const certificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    issuedBy: {
      type: String,
      required: true,
      trim: true,
    },
    issueDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
  },
  { _id: true }
);

const barberProfileSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    salonName: {
      type: String,
      trim: true,
      default: "",
    },
    bio: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    instagram: {
      type: String,
      trim: true,
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    galleryImages: {
      type: [String],
      default: [],
    },
    defaultSchedule: {
      startTime: {
        type: String,
        default: "09:00",
      },
      endTime: {
        type: String,
        default: "18:00",
      },
      hasBreak: {
        type: Boolean,
        default: false,
      },
      breakStart: {
        type: String,
        default: "",
      },
      breakEnd: {
        type: String,
        default: "",
      },
    },
    certifications: {
      type: [certificationSchema],
      default: [],
    },
    depositSettings: {
      type: depositSettingsSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

barberProfileSchema.index(
  { barberId: 1 },
  { unique: true, name: "barberprofiles_barberId_unique" }
);

const BarberProfile = mongoose.model("BarberProfile", barberProfileSchema);

export default BarberProfile;
