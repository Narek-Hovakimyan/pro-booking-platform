import mongoose from "mongoose";

const bookingCreateIdempotencyOperationSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    keyHash: { type: String, required: true, select: false },
    requestFingerprint: { type: String, required: true, select: false },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    status: { type: String, enum: ["completed"], required: true },
  },
  { timestamps: true }
);

bookingCreateIdempotencyOperationSchema.index(
  { actorId: 1, keyHash: 1 },
  { unique: true }
);

export default mongoose.model(
  "BookingCreateIdempotencyOperation",
  bookingCreateIdempotencyOperationSchema
);
