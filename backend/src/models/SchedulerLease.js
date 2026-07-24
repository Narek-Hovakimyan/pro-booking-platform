import mongoose from "mongoose";

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const schedulerLeaseSchema = new mongoose.Schema(
  {
    jobKey: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      maxlength: 200,
      validate: {
        validator: (value) => typeof value === "string" && value.trim().length > 0,
        message: "Job key must be a non-empty string",
      },
    },
    ownerToken: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      validate: {
        validator: (value) => typeof value === "string" && value.trim().length > 0,
        message: "Owner token must be a non-empty string",
      },
    },
    leaseExpiresAt: {
      type: Date,
      required: true,
      validate: {
        validator: isValidDate,
        message: "Lease expiry must be a valid date",
      },
    },
    fencingToken: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value) => Number.isSafeInteger(value) && value > 0,
        message: "Fencing token must be a positive safe integer",
      },
    },
  },
  { timestamps: true }
);

schedulerLeaseSchema.index({ jobKey: 1 }, { unique: true });

const SchedulerLease = mongoose.model("SchedulerLease", schedulerLeaseSchema);

export default SchedulerLease;
