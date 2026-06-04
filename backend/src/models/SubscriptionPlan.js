import mongoose from "mongoose";

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Plan code is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    pricePerSeat: {
      type: Number,
      required: [true, 'Price per seat is required'],
      min: [0, 'Price per seat cannot be negative'],
    },
    currency: {
      type: String,
      default: 'AMD',
      trim: true,
      uppercase: true,
    },
    interval: {
      type: String,
      enum: ['month'],
      default: 'month',
    },
    features: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan;
