import mongoose from "mongoose";

export const SERVICE_CATEGORIES = [
  "haircut",
  "hair-color",
  "styling",
  "beard",
  "nails",
  "makeup",
  "cosmetology",
  "lashes-brows",
  "massage",
  "other",
];

/**
 * Display labels corresponding to SERVICE_CATEGORIES.
 * Used to prevent custom category names from colliding with system labels.
 */
export const SERVICE_CATEGORY_LABELS = [
  "Haircut",
  "Hair color",
  "Styling",
  "Beard",
  "Nails",
  "Makeup",
  "Cosmetology",
  "Lashes & brows",
  "Massage",
  "Other",
];

const serviceSchema = new mongoose.Schema(
  {
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    duration: {
      type: Number,
      required: true,
      min: 1,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      enum: SERVICE_CATEGORIES,
      default: "other",
    },
    customCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceCategory",
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
    },
    type: {
      type: String,
      enum: ["single", "package"],
      default: "single",
    },
    includedServiceIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }],
      default: [],
    },
    packagePriceMode: {
      type: String,
      enum: ["manual", "sum"],
      default: "manual",
    },
    packageDurationMode: {
      type: String,
      enum: ["manual", "sum"],
      default: "manual",
    },
    discountType: {
      type: String,
      enum: ["none", "percent", "fixed"],
      default: "none",
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

serviceSchema.index({ barberId: 1, customCategoryId: 1 });
serviceSchema.index({ barberId: 1, active: 1 });
serviceSchema.index({ barberId: 1, includedServiceIds: 1, active: 1 });

const Service = mongoose.model("Service", serviceSchema);

const withSession = (query, session) =>
  session && typeof query?.session === "function" ? query.session(session) : query;

export const validateIncludedServices = async (
  includedServiceIds,
  barberId,
  existingServiceId,
  session = null
) => {
  if (!Array.isArray(includedServiceIds)) {
    return { error: "includedServiceIds must be an array" };
  }
  const uniqueIds = [...new Set(includedServiceIds.map((id) => String(id)))];
  if (uniqueIds.length < 2) return { error: "Package must include at least 2 services" };
  for (const id of uniqueIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) return { error: `Invalid included service ID: ${id}` };
  }
  if (existingServiceId && uniqueIds.includes(String(existingServiceId))) {
    return { error: "Package cannot include itself" };
  }
  const services = await withSession(Service.find({ _id: { $in: uniqueIds }, barberId }), session);
  if (services.length !== uniqueIds.length) {
    return { error: "Some included services not found or belong to another barber" };
  }
  for (const service of services) {
    if (!service.active) return { error: `Included service "${service.name}" is inactive` };
    if (service.type !== "single") {
      return { error: `Included service "${service.name}" is a package; packages cannot include packages` };
    }
  }
  return { value: services.map((service) => service._id), services };
};

export const hasActivePackageReference = async (serviceId, barberId, session = null) => {
  const query = Service.exists({
    barberId,
    type: "package",
    active: true,
    includedServiceIds: serviceId,
  });
  return Boolean(session && typeof query.session === "function"
    ? await query.session(session)
    : await query);
};

export const touchServiceDependencies = async (services, barberId, session) => {
  if (!session || mongoose.connection.readyState !== 1 || !services.length) return;
  const result = await Service.updateMany(
    {
      _id: { $in: services.map((service) => service._id) },
      barberId,
      active: true,
      type: "single",
    },
    { $currentDate: { updatedAt: true } },
    { session }
  );
  if (result.matchedCount !== services.length) {
    const error = new Error("Included services changed while saving package");
    error.statusCode = 409;
    throw error;
  }
};

export const withServiceDependencyTransaction = async (work) => {
  if (mongoose.connection.readyState !== 1) return work(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
};

export default Service;
