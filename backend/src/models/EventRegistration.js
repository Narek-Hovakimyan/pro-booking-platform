import mongoose from "mongoose";

const registrationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Legacy field kept to avoid breaking existing registrations created
    // before the approval-flow migration.
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled", "waitlisted"],
      default: "pending",
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },
    attendanceStatus: {
      type: String,
      enum: ["pending", "attended", "no_show"],
      default: "pending",
    },
    attended: {
      type: Boolean,
      default: false,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },
    reminderSentAt: {
      type: Date,
      default: null,
    },
    certificateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventCertificate",
      default: null,
    },
    certificateIssuedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

registrationSchema.pre("validate", function syncLegacyUserField() {
  if (!this.userId && this.barberId) {
    this.userId = this.barberId;
  }
});

registrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });

const EventRegistration = mongoose.model(
  "EventRegistration",
  registrationSchema
);

export default EventRegistration;
