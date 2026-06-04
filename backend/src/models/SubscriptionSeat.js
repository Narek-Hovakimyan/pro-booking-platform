import mongoose from "mongoose";

const subscriptionSeatSchema = new mongoose.Schema(
  {
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: [true, 'Subscription ID is required'],
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Salon',
      default: null,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Barber ID is required'],
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned by user ID is required'],
    },
    status: {
      type: String,
      enum: ['active', 'revoked'],
      default: 'active',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

subscriptionSeatSchema.index({ barberId: 1, status: 1 });
subscriptionSeatSchema.index({ subscriptionId: 1, status: 1 });
subscriptionSeatSchema.index({ subscriptionId: 1, barberId: 1 }, { unique: true });

const SubscriptionSeat = mongoose.model('SubscriptionSeat', subscriptionSeatSchema);

export default SubscriptionSeat;
