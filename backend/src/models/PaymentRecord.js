import mongoose from "mongoose";

const SUPPORTED_CURRENCY = "AMD";

const paymentRecordSchema = new mongoose.Schema(
  {
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: [true, 'Subscription ID is required'],
    },
    payerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    ownerType: {
      type: String,
      required: [true, 'Owner type is required'],
      enum: ['barber', 'salon'],
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Owner ID is required'],
      default: null,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'AMD',
      trim: true,
      uppercase: true,
    },
    seatCount: {
      type: Number,
      default: 1,
    },
    periodStart: {
      type: Date,
      required: [true, 'Period start is required'],
    },
    periodEnd: {
      type: Date,
      required: [true, 'Period end is required'],
    },
    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    provider: {
      type: String,
      required: [true, 'Provider is required'],
      enum: ['manual', 'stripe', 'idram', 'telcell', 'bank'],
      default: 'manual',
    },
    providerPaymentId: {
      type: String,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

paymentRecordSchema.path("currency").validate(
  (value) => value === SUPPORTED_CURRENCY,
  "currency is not supported"
);
paymentRecordSchema.path("seatCount").validate(
  (value) => Number.isFinite(value) && Number.isInteger(value) && value >= 0,
  "seatCount must be a non-negative integer"
);

paymentRecordSchema.index({ payerId: 1, paidAt: -1, createdAt: -1 });
paymentRecordSchema.index({ ownerType: 1, ownerId: 1, paidAt: -1, createdAt: -1 });
paymentRecordSchema.index({ subscriptionId: 1, paidAt: -1, createdAt: -1 });

const PaymentRecord = mongoose.model('PaymentRecord', paymentRecordSchema);

export default PaymentRecord;
