import mongoose from "mongoose";

const notificationDataSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    eventRegistrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventRegistration",
      default: null,
    },
    jobApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalonJobApplication",
      default: null,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalonJobPost",
      default: null,
    },
    salonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salon",
      default: null,
    },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyProgram",
      default: null,
    },
    waitlistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WaitlistEntry",
      default: null,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      default: null,
    },
  },
  { _id: false }
);

const TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days
const INTERNAL_HASH_PATH = "internalHash";

const stripInternalFields = (_doc, ret) => {
  if (ret && typeof ret === "object") {
    delete ret[INTERNAL_HASH_PATH];
  }

  return ret;
};

const isInternalHashPath = (value) =>
  typeof value === "string" &&
  value
    .split(".")
    .filter(Boolean)[0] === INTERNAL_HASH_PATH;

const stripImmutableInternalHashUpdate = (update) => {
  if (!update || typeof update !== "object") {
    return update;
  }

  delete update[INTERNAL_HASH_PATH];

  for (const operator of ["$set", "$unset", "$setOnInsert"]) {
    if (!update[operator] || typeof update[operator] !== "object") {
      continue;
    }

    delete update[operator][INTERNAL_HASH_PATH];

    if (Object.keys(update[operator]).length === 0) {
      delete update[operator];
    }
  }

  if (update.$rename && typeof update.$rename === "object") {
    for (const [source, destination] of Object.entries(update.$rename)) {
      if (
        isInternalHashPath(source) ||
        isInternalHashPath(destination)
      ) {
        delete update.$rename[source];
      }
    }

    if (Object.keys(update.$rename).length === 0) {
      delete update.$rename;
    }
  }

  return update;
};

const preserveExistingInternalHashOnReplacement = async function preserveExistingInternalHash() {
  const replacement = this.getUpdate();

  if (
    !replacement ||
    typeof replacement !== "object" ||
    Array.isArray(replacement) ||
    Object.keys(replacement).some((key) => key.startsWith("$"))
  ) {
    return;
  }

  const existing = await this.model
    .findOne(this.getQuery())
    .select(`+${INTERNAL_HASH_PATH}`)
    .lean();

  if (existing?.internalHash) {
    replacement.internalHash = existing.internalHash;
  } else {
    delete replacement.internalHash;
  }

  this.setUpdate(replacement);
};

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    data: {
      type: notificationDataSchema,
      default: undefined,
    },
    internalHash: {
      type: String,
      trim: true,
      default: undefined,
      select: false,
      immutable: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { transform: stripInternalFields },
    toObject: { transform: stripInternalFields },
  },
);

// TTL index: auto-delete documents 180 days after createdAt
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: TTL_SECONDS }
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ internalHash: 1 }, { unique: true, sparse: true });
notificationSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate"],
  function preserveImmutableInternalHash() {
    this.setUpdate(stripImmutableInternalHashUpdate(this.getUpdate()));
  }
);
notificationSchema.pre(
  ["replaceOne", "findOneAndReplace"],
  preserveExistingInternalHashOnReplacement
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
