import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      required: [true, 'Owner type is required'],
      enum: ['barber', 'salon'],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Owner ID is required'],
    },
    ownerRefModel: {
      type: String,
      required: [true, 'Owner reference model is required'],
      enum: ['User', 'Salon'],
    },
    payerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Payer ID is required'],
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: [true, 'Plan ID is required'],
    },
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'],
      default: 'trialing',
    },
    seatCount: {
      type: Number,
      default: 1,
      min: [1, 'Seat count must be at least 1'],
    },
    pricePerSeat: {
      type: Number,
      required: [true, 'Price per seat is required'],
      min: [0, 'Price per seat cannot be negative'],
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Total price cannot be negative'],
    },
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
    trialEndsAt: {
      type: Date,
    },
    provider: {
      type: String,
      enum: ['manual', 'stripe', 'idram', 'telcell', 'bank'],
      default: 'manual',
    },
    providerCustomerId: {
      type: String,
      default: null,
    },
    providerSubscriptionId: {
      type: String,
      default: null,
    },
    lastPaymentAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.index({ ownerType: 1, ownerId: 1, status: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
