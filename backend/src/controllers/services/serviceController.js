import mongoose from "mongoose";

import Service from "../../models/Service.js";
import { sendControllerError } from "../../utils/controllerError.js";
import { barberHasBookingPaidAccessForSalon as _barberHasPaidAccess } from "../../services/subscription/subscriptionPaidAccessQueries.js";
import {
  calculateServiceDiscountedPrice,
  validateServicePayload,
} from "../../services/serviceValidation.js";
import {
  persistServiceWithCategoryReference,
  ServiceCategoryReferenceIntegrityError,
  validateCustomCategoryForBarber,
} from "../../services/serviceCategoryReferenceIntegrity.js";

export { calculateServiceDiscountedPrice } from "../../services/serviceValidation.js";

// Test hooks — allows tests to override dependencies without a DI framework
let barberHasPaidAccess = _barberHasPaidAccess;
export const __serviceControllerTestHooks = {
  resetBarberHasPaidAccess() {
    barberHasPaidAccess = _barberHasPaidAccess;
  },
  setBarberHasPaidAccess(fn) {
    barberHasPaidAccess = fn;
  },
};

const isBarber = (user) => user?.role === "barber";


const hasOwnBodyField = (body, field) =>
  Object.prototype.hasOwnProperty.call(body || {}, field);

const validateAndResolveIncludedServices = async (includedServiceIds, barberId, existingServiceId) => {
  if (!Array.isArray(includedServiceIds)) {
    return { error: "includedServiceIds must be an array" };
  }

  // Deduplicate
  const uniqueIds = [...new Set(includedServiceIds.map((id) => String(id)))];

  if (uniqueIds.length < 2) {
    return { error: "Package must include at least 2 services" };
  }

  // Validate ObjectIds
  for (const id of uniqueIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { error: `Invalid included service ID: ${id}` };
    }
  }

  // Check self-reference
  if (existingServiceId && uniqueIds.includes(String(existingServiceId))) {
    return { error: "Package cannot include itself" };
  }

  // Fetch all included services
  const includedServices = await Service.find({
    _id: { $in: uniqueIds },
    barberId,
  });

  if (includedServices.length !== uniqueIds.length) {
    return { error: "Some included services not found or belong to another barber" };
  }

  // Verify all are active and type single
  for (const svc of includedServices) {
    if (!svc.active) {
      return { error: `Included service "${svc.name}" is inactive` };
    }
    if (svc.type !== "single") {
      return { error: `Included service "${svc.name}" is a package; packages cannot include packages` };
    }
  }

  return {
    value: includedServices.map((s) => s._id),
    services: includedServices,
  };
};

const getServiceValidationSource = (service) => {
  const source = typeof service?.toObject === "function"
    ? service.toObject()
    : { ...service };

  return {
    category: "other",
    discountType: "none",
    discountValue: 0,
    type: "single",
    packagePriceMode: "manual",
    packageDurationMode: "manual",
    ...source,
  };
};

const validateResolvedServicePayload = (value) => {
  const { error } = validateServicePayload(value);
  return error ? { error } : null;
};

export const getServicesByBarber = async (req, res) => {
  try {
    // Phase 11: Hide unpaid/expired barbers from public endpoint
    const hasAccess = await barberHasPaidAccess(
      req.params.barberId,
      req.query?.salonId || null
    );
    if (!hasAccess) {
      return res.status(404).json({ message: "Barber not found" });
    }

    const requesterId = req.user?._id || req.user?.id;
    const isOwnerBarber =
      req.user?.role === "barber" &&
      requesterId &&
      String(requesterId) === String(req.params.barberId);
    const query = isOwnerBarber
      ? { barberId: req.params.barberId }
      : { barberId: req.params.barberId, active: true };

    const categoryPopulate = {
      path: "customCategoryId",
      select: isOwnerBarber
        ? "_id name ownerType ownerId sortOrder active"
        : "_id name ownerType ownerId sortOrder",
    };
    if (isOwnerBarber) {
      categoryPopulate.transform = (category, id) => {
        if (category || !id) return category;
        return {
          _id: id,
          name: "Unavailable custom category",
          active: false,
          missing: true,
        };
      };
    }
    if (!isOwnerBarber) {
      categoryPopulate.match = { active: true };
    }

    const services = await Service.find(query).populate(categoryPopulate);
    return res.json(services);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch services");
  }
};

export const createService = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can create services" });
    }

    if (
      req.body.barberId !== undefined &&
      String(req.body.barberId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Cannot create a service for another barber" });
    }

    const { value, error } = validateServicePayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    // ── Package handling ──
    const resolvedType = value.type || "single";

    if (resolvedType === "package") {
      // Validate and resolve included services
      const includedResult = await validateAndResolveIncludedServices(
        req.body.includedServiceIds,
        req.user._id,
        null
      );

      if (includedResult.error) {
        return res.status(400).json({ message: includedResult.error });
      }

      value.includedServiceIds = includedResult.value;

      const packagePriceMode = req.body.packagePriceMode || "manual";
      const packageDurationMode = req.body.packageDurationMode || "manual";

      // Resolve price mode
      if (hasOwnBodyField(req.body, "packagePriceMode")) {
        if (!["manual", "sum"].includes(req.body.packagePriceMode)) {
          return res.status(400).json({ message: "packagePriceMode must be 'manual' or 'sum'" });
        }
      }
      value.packagePriceMode = packagePriceMode;

      // Resolve duration mode
      if (hasOwnBodyField(req.body, "packageDurationMode")) {
        if (!["manual", "sum"].includes(req.body.packageDurationMode)) {
          return res.status(400).json({ message: "packageDurationMode must be 'manual' or 'sum'" });
        }
      }
      value.packageDurationMode = packageDurationMode;

      // Auto-calculate price if sum mode
      if (value.packagePriceMode === "sum") {
        const includedServices = await Service.find({ _id: { $in: value.includedServiceIds } });
        value.price = includedServices.reduce((sum, s) => sum + (s.price || 0), 0);
      }

      // Auto-calculate duration if sum mode
      if (value.packageDurationMode === "sum") {
        const includedServices = await Service.find({ _id: { $in: value.includedServiceIds } });
        value.duration = includedServices.reduce((sum, s) => sum + (s.duration || 0), 0);
      }
    } else {
      // Single service — clear package fields
      value.includedServiceIds = [];
      value.packagePriceMode = "manual";
      value.packageDurationMode = "manual";
    }

    if (hasOwnBodyField(req.body, "customCategoryId")) {
      const customCategoryResult = await validateCustomCategoryForBarber(
        req.body.customCategoryId,
        req.user._id
      );

      if (customCategoryResult.error) {
        return res
          .status(customCategoryResult.code)
          .json({ message: customCategoryResult.error });
      }

      value.customCategoryId = customCategoryResult.value;
    }

    const validationError = validateResolvedServicePayload(value);
    if (validationError) {
      return res.status(400).json({ message: validationError.error });
    }

    const createPayload = {
      ...value,
      barberId: req.user._id,
    };
    const service = hasOwnBodyField(req.body, "customCategoryId") && value.customCategoryId
      ? await persistServiceWithCategoryReference({
          customCategoryId: value.customCategoryId,
          barberId: req.user._id,
          persist: ({ session, customCategoryId }) =>
            Service.create(
              { ...createPayload, customCategoryId },
              { session }
            ),
        })
      : await Service.create(createPayload);

    return res.status(201).json(service);
  } catch (error) {
    if (error instanceof ServiceCategoryReferenceIntegrityError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res.status(400).json({
      message: error.message || "Could not create service",
    });
  }
};

export const updateService = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can update services" });
    }

    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    if (String(service.barberId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized to edit this service" });
    }

    const existingValidationSource = getServiceValidationSource(service);
    const { value, error } = validateServicePayload(req.body, {
      partial: true,
      existing: existingValidationSource,
    });
    if (error) {
      return res.status(400).json({ message: error });
    }

    if (hasOwnBodyField(req.body, "customCategoryId")) {
      const customCategoryResult = await validateCustomCategoryForBarber(
        req.body.customCategoryId,
        req.user._id,
        {
          allowExistingInactive:
            service.customCategoryId != null &&
            String(req.body.customCategoryId) === String(service.customCategoryId),
        }
      );

      if (customCategoryResult.error) {
        return res
          .status(customCategoryResult.code)
          .json({ message: customCategoryResult.error });
      }

      value.customCategoryId = customCategoryResult.value;
    }

    // ── Package handling on update ──
    const resolvedType = value.type || service.type || "single";

    if (resolvedType === "package") {
      const isPackageTransition = service.type !== "package";
      if (isPackageTransition && !hasOwnBodyField(req.body, "includedServiceIds")) {
        return res.status(400).json({
          message: "includedServiceIds must be an array",
        });
      }

      // If includedServiceIds provided, validate them
      if (hasOwnBodyField(req.body, "includedServiceIds")) {
        const includedResult = await validateAndResolveIncludedServices(
          req.body.includedServiceIds,
          req.user._id,
          service._id
        );

        if (includedResult.error) {
          return res.status(400).json({ message: includedResult.error });
        }

        value.includedServiceIds = includedResult.value;
      }

      // Resolve price mode
      if (hasOwnBodyField(req.body, "packagePriceMode")) {
        if (!["manual", "sum"].includes(req.body.packagePriceMode)) {
          return res.status(400).json({ message: "packagePriceMode must be 'manual' or 'sum'" });
        }
        value.packagePriceMode = req.body.packagePriceMode;
      }

      // Resolve duration mode
      if (hasOwnBodyField(req.body, "packageDurationMode")) {
        if (!["manual", "sum"].includes(req.body.packageDurationMode)) {
          return res.status(400).json({ message: "packageDurationMode must be 'manual' or 'sum'" });
        }
        value.packageDurationMode = req.body.packageDurationMode;
      }

      // Auto-calculate price if sum mode
      const effectivePackagePriceMode = value.packagePriceMode || service.packagePriceMode || "manual";
      if (effectivePackagePriceMode === "sum") {
        const ids = value.includedServiceIds || service.includedServiceIds || [];
        if (ids.length > 0) {
          const includedServices = await Service.find({ _id: { $in: ids } });
          value.price = includedServices.reduce((sum, s) => sum + (s.price || 0), 0);
        }
      }

      // Auto-calculate duration if sum mode
      const effectivePackageDurationMode = value.packageDurationMode || service.packageDurationMode || "manual";
      if (effectivePackageDurationMode === "sum") {
        const ids = value.includedServiceIds || service.includedServiceIds || [];
        if (ids.length > 0) {
          const includedServices = await Service.find({ _id: { $in: ids } });
          value.duration = includedServices.reduce((sum, s) => sum + (s.duration || 0), 0);
        }
      }
    }

    // If switching to single, clear package fields
    if (value.type === "single" && service.type !== "single") {
      value.includedServiceIds = [];
      value.packagePriceMode = "manual";
      value.packageDurationMode = "manual";
    }

    const finalValidationSource = {
      ...existingValidationSource,
      ...value,
      type: resolvedType,
      packagePriceMode: value.packagePriceMode || service.packagePriceMode || "manual",
      packageDurationMode: value.packageDurationMode || service.packageDurationMode || "manual",
    };
    const validationError = validateResolvedServicePayload(finalValidationSource);
    if (validationError) {
      return res.status(400).json({ message: validationError.error });
    }

    const preservesExistingInactiveCategory =
      hasOwnBodyField(req.body, "customCategoryId") &&
      service.customCategoryId != null &&
      String(req.body.customCategoryId) === String(service.customCategoryId);

    const updatedService = hasOwnBodyField(req.body, "customCategoryId") && value.customCategoryId
      ? await persistServiceWithCategoryReference({
          customCategoryId: value.customCategoryId,
          barberId: req.user._id,
          allowExistingInactive: preservesExistingInactiveCategory,
          persist: ({ session, customCategoryId }) =>
            Service.findOneAndUpdate(
              { _id: service._id, barberId: req.user._id },
              { $set: { ...value, customCategoryId } },
              { new: true, runValidators: true, session }
            ),
        })
      : (Object.assign(service, value), await service.save());

    return res.json(updatedService);
  } catch (error) {
    if (error instanceof ServiceCategoryReferenceIntegrityError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res.status(400).json({
      message: error.message || "Could not update service",
    });
  }
};

export const deleteService = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can delete services" });
    }

    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    if (String(service.barberId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized to delete this service" });
    }

    await service.deleteOne();

    return res.json({ message: "Service deleted" });
  } catch (error) {
    return sendControllerError(res, error, "Could not delete service");
  }
};
