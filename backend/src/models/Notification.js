import mongoose from "mongoose";

const notificationDataSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
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
  },
  { _id: false }
);

const TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

const notificationSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// TTL index: auto-delete documents 180 days after createdAt
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: TTL_SECONDS }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
