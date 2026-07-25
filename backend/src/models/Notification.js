import mongoose from "mongoose";

const notificationDataSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    eventRegistrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventRegistration",
      default: null,
    },
    jobApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalonJobApplication",
      default: null,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalonJobPost",
      default: null,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      default: null,
    },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyProgram",
      default: null,
    },
    waitlistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WaitlistEntry",
      default: null,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      default: null,
    },
  },
  { _id: false }
);

const TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

const stripInternalFields = (_doc, ret) => {
  if (ret && typeof ret === "object") {
    delete ret.internalHash;
  }

  return ret;
};

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    data: {
      type: notificationDataSchema,
      default: undefined,
    },
    internalHash: {
      type: String,
      trim: true,
      default: undefined,
      select: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { transform: stripInternalFields },
    toObject: { transform: stripInternalFields },
  },
);

// TTL index: auto-delete documents 180 days after createdAt
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: TTL_SECONDS }
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ internalHash: 1 }, { unique: true, sparse: true });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
