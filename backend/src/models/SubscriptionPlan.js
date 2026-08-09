import mongoose from "mongoose";

const SUPPORTED_CURRENCY = "AMD";
const SUPPORTED_INTERVAL = "month";

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
      required: [true, 'Currency is required'],
      default: 'AMD',
      trim: true,
      uppercase: true,
    },
    interval: {
      type: String,
      required: [true, 'Billing interval is required'],
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

subscriptionPlanSchema.path("currency").validate(
  (value) => value === SUPPORTED_CURRENCY,
  "currency is not supported"
);
subscriptionPlanSchema.path("interval").validate(
  (value) => value === SUPPORTED_INTERVAL,
  "billing interval is not supported"
);

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan;
