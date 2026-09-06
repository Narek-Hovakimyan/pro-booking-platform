import mongoose from "mongoose";

const platformBillingIdempotencyOperationSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 200 },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    requestFingerprint: { type: String, required: true },
    status: { type: String, enum: ["completed"], required: true },
    responseSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

platformBillingIdempotencyOperationSchema.index(
  { actorId: 1, action: 1, resourceType: 1, resourceId: 1, key: 1 },
  { unique: true }
);

export default mongoose.model(
  "PlatformBillingIdempotencyOperation",
  platformBillingIdempotencyOperationSchema
);
