import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  type: {
    type: String,
    enum: [
      "training",
      "masterclass",
      "salon_opening",
      "discount_day",
      "competition",
      "networking",
    ],
    default: "training",
  },
  instructor: { type: String, required: true },
  instructorBio: { type: String, default: "" },
  date: { type: String, required: true },
  time: { type: String, required: true },
  duration: { type: Number, required: true },
  price: { type: Number, default: 0 },
  maxParticipants: { type: Number, default: 20 },
  location: { type: String, required: true },
  salonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    required: false,
  },
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  visibility: {
    type: String,
    enum: ["public", "private"],
    default: "public",
  },
  imageUrl: { type: String, default: "" },
  status: {
    type: String,
    enum: ["upcoming", "completed", "cancelled"],
    default: "upcoming",
  },
  certificatesEnabled: { type: Boolean, default: false },
  certificatesIssued: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

eventSchema.index({ date: 1, status: 1 });
eventSchema.index({ salonId: 1 });

const Event = mongoose.model("Event", eventSchema);

export default Event;
