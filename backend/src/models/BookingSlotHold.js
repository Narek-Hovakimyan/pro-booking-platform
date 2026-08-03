import mongoose from "mongoose";

const bookingSlotHoldSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingDate: {
      type: String,
      required: true,
      trim: true,
    },
    minuteOfDay: {
      type: Number,
      required: true,
      min: 0,
      max: 1439,
    },
  },
  { timestamps: true, autoIndex: false }
);

bookingSlotHoldSchema.index(
  { barberId: 1, bookingDate: 1, minuteOfDay: 1 },
  { unique: true }
);
bookingSlotHoldSchema.index(
  { bookingId: 1, bookingDate: 1, minuteOfDay: 1 },
  { unique: true }
);

const BookingSlotHold = mongoose.model("BookingSlotHold", bookingSlotHoldSchema);

export default BookingSlotHold;
