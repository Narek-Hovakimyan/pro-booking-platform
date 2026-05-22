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
  },
  { timestamps: true }
);

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
