import mongoose from "mongoose";

const voucherSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: ["barber", "salon"],
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ["amount", "service"],
      required: true,
    },
    amount: {
      type: Number,
      min: 0,
      default: 0,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },
    maxUses: {
      type: Number,
      min: 1,
      default: 1,
    },
    currentUses: {
      type: Number,
      min: 0,
      default: 0,
    },
    redemptionBookingIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Booking" }],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

voucherSchema.index({ ownerType: 1, ownerId: 1 });
voucherSchema.index({ code: 1 }, { unique: true });
voucherSchema.index({ active: 1, expiresAt: 1 });

const Voucher = mongoose.model("Voucher", voucherSchema);

export default Voucher;
