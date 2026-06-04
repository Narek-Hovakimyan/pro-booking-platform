import mongoose from "mongoose";

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
      enum: ['barber', 'salon'],
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
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
    },
    periodEnd: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    provider: {
      type: String,
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

const PaymentRecord = mongoose.model('PaymentRecord', paymentRecordSchema);

export default PaymentRecord;
