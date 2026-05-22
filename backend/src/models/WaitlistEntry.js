import mongoose from "mongoose";

const waitlistEntrySchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
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
      required: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
    },
    preferredStartTime: {
      type: String,
      trim: true,
      default: "",
    },
    preferredEndTime: {
      type: String,
      trim: true,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    offeredTime: {
      type: String,
      trim: true,
      default: "",
    },
    offeredAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "active",
        "notified",
        "offered",
        "converting",
        "converted",
        "rejected",
        "cancelled",
        "expired",
      ],
      default: "active",
    },
    convertedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    convertedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    expiredAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index to efficiently find active waitlist entries by barber/date
waitlistEntrySchema.index({ barberId: 1, date: 1, status: 1 });

// Compound index for duplicate detection
waitlistEntrySchema.index({
  clientId: 1,
  barberId: 1,
  salonId: 1,
  serviceId: 1,
  date: 1,
  preferredStartTime: 1,
  preferredEndTime: 1,
  status: 1,
});

const WaitlistEntry = mongoose.model("WaitlistEntry", waitlistEntrySchema);

export default WaitlistEntry;
