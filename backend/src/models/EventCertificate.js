import mongoose from "mongoose";

const eventCertificateSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventRegistration",
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      default: null,
    },
    certificateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    participantName: {
      type: String,
      trim: true,
      default: "",
    },
    eventTitle: {
      type: String,
      trim: true,
      default: "",
    },
    organizerName: {
      type: String,
      trim: true,
      default: "",
    },
    salonName: {
      type: String,
      trim: true,
      default: "",
    },
    eventDate: {
      type: String,
      default: "",
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["issued", "revoked"],
      default: "issued",
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedReason: {
      type: String,
      trim: true,
      default: "",
    },
    verificationCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    certificateType: {
      type: String,
      enum: ["auto", "uploaded"],
      default: "auto",
    },
    fileUrl: {
      type: String,
      default: "",
    },
    fileType: {
      type: String,
      default: "",
    },
    originalFileName: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

eventCertificateSchema.index(
  { eventId: 1, userId: 1, registrationId: 1 },
  { unique: true }
);

const EventCertificate = mongoose.model(
  "EventCertificate",
  eventCertificateSchema
);

export default EventCertificate;
