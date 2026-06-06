import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      default: null,
    },
    serviceName: {
      type: String,
      trim: true,
      default: "",
    },
    dayKey: {
      type: String,
      required: true,
      trim: true,
    },
    time: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "completed",
        "cancelled",
        "expired",
        "confirmed",
        "no_show",
        "late_cancelled",
      ],
      default: "pending",
    },
    dayLabel: {
      type: String,
      trim: true,
      default: "",
    },
    bookingDate: {
      type: String,
      trim: true,
      default: "",
    },
    clientName: {
      type: String,
      trim: true,
      default: "",
    },
    clientPhone: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: String,
      enum: ["client", "barber"],
      default: "client",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    referenceImages: {
      type: [String],
      default: [],
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      default: "",
      maxLength: 300,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    expiredAt: {
      type: Date,
      default: null,
    },
    expiredReason: {
      type: String,
      trim: true,
      default: "",
    },
    completedAt: {
      type: Date,
      default: null,
    },
    reviewed: {
      type: Boolean,
      default: false,
    },
    reminderSentAt: {
      type: Date,
      default: null,
    },
    reminder24hSentAt: {
      type: Date,
      default: null,
    },
    reminder2hSentAt: {
      type: Date,
      default: null,
    },
    delayMinutesTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    delayedAt: {
      type: Date,
      default: null,
    },
    noShowMarkedAt: {
      type: Date,
      default: null,
    },
    noShowMarkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lateCancelledAt: {
      type: Date,
      default: null,
    },
    lateCancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    consultation: {
      hairType: { type: String, trim: true, default: "" },
      chemicalTreatments: { type: String, trim: true, default: "" },
      allergies: { type: String, trim: true, default: "" },
      scalpSensitivity: { type: String, trim: true, default: "" },
      desiredOutcome: { type: String, trim: true, default: "" },
      notes: { type: String, trim: true, default: "" },
    },
    consent: {
      accepted: { type: Boolean, default: false },
      acceptedAt: { type: Date, default: null },
      textVersion: { type: String, trim: true, default: "" },
    },
    rescheduleRequest: {
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "cancelled"],
        default: undefined,
      },
      requestedBookingDate: {
        type: Date,
        default: undefined,
      },
      requestedDayKey: {
        type: String,
        trim: true,
        default: "",
      },
      requestedTime: {
        type: String,
        trim: true,
        default: "",
      },
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      requestedAt: {
        type: Date,
        default: null,
      },
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      respondedAt: {
        type: Date,
        default: null,
      },
      rejectionReason: {
        type: String,
        trim: true,
        default: "",
      },
      originalBookingDate: {
        type: Date,
        default: undefined,
      },
      originalDayKey: {
        type: String,
        trim: true,
        default: "",
      },
      originalTime: {
        type: String,
        trim: true,
        default: "",
      },
      requestNote: {
        type: String,
        trim: true,
        default: "",
      },
    },
    treatmentRecord: {
      colorFormula: { type: String, trim: true, default: "" },
      tonerFormula: { type: String, trim: true, default: "" },
      developer: { type: String, trim: true, default: "" },
      processingTime: { type: String, trim: true, default: "" },
      productsUsed: { type: String, trim: true, default: "" },
      techniqueNotes: { type: String, trim: true, default: "" },
      outcomeNotes: { type: String, trim: true, default: "" },
      reactionNotes: { type: String, trim: true, default: "" },
      recordedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      recordedAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      default: null,
    },
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      default: null,
    },
    voucherDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountAmount: {
      type: Number,
      min: 0,
    },
    voucherCode: {
      type: String,
      trim: true,
      default: "",
    },
    promotionCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    originalPrice: {
      type: Number,
      min: 0,
    },
    finalPrice: {
      type: Number,
      min: 0,
    },
    // ── Deposit fields ──
    depositRequired: {
      type: Boolean,
      default: false,
    },
    depositAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    depositStatus: {
      type: String,
      enum: ["not_required", "pending", "paid", "failed", "refunded"],
      default: "not_required",
    },
    depositMode: {
      type: String,
      default: "",
    },
    depositValue: {
      type: Number,
      default: 0,
    },
    depositPolicyText: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
