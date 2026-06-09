import mongoose from "mongoose";

import Salon from "../models/Salon.js";
import Service, { SERVICE_CATEGORIES } from "../models/Service.js";
import ServiceCategory from "../models/ServiceCategory.js";
import { createCrudController } from "./crudController.js";
import { canManageSalonRequest } from "../utils/salonPermissions.js";
import { sendControllerError } from "../utils/controllerError.js";
import { barberHasPaidAccess as _barberHasPaidAccess } from "../services/subscriptionService.js";

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

export const serviceController = createCrudController(Service, "Service");

/**
 * Calculate the discounted price for a service based on its discount settings.
 *
 * Rules:
 * - "none": discount = 0
 * - "percent": discount = Math.round(price * discountValue / 100)
 * - "fixed": discount = Math.min(discountValue, price)
 * - discountedPrice = Math.max(0, price - discountAmount)
 *
 * @param {object} service - A Service document or plain object with price, discountType, discountValue.
 * @returns {{ discountAmount: number, discountedPrice: number }}
 */
export const calculateServiceDiscountedPrice = (service) => {
  const price = Number(service?.price ?? 0);
  const discountType = service?.discountType || "none";
  const discountValue = Number(service?.discountValue ?? 0);
  let discountAmount = 0;

  if (discountType === "percent" && discountValue > 0) {
    discountAmount = Math.round(price * discountValue / 100);
  } else if (discountType === "fixed" && discountValue > 0) {
    discountAmount = Math.min(discountValue, price);
  }

  const discountedPrice = Math.max(0, price - discountAmount);
  return { discountAmount, discountedPrice };
};

const isBarber = (user) => user?.role === "barber";


const hasOwnBodyField = (body, field) =>
  Object.prototype.hasOwnProperty.call(body || {}, field);

const isBlankNumberInput = (value) =>
  value === null || (typeof value === "string" && !value.trim());

const maxServiceTags = 10;
const maxServiceTagLength = 32;

const sanitizeTags = (tags) => {
  if (tags === undefined) return { value: undefined };
  if (!Array.isArray(tags)) return { error: "Tags must be an array" };

  const nextTags = [];
  const seenTags = new Set();

  for (const tag of tags) {
    if (typeof tag !== "string") {
      return { error: "Tags must be strings" };
    }

    const normalizedTag = tag.trim().toLowerCase();

    if (!normalizedTag) continue;
    if (normalizedTag.length > maxServiceTagLength) {
      return { error: `Tags must be ${maxServiceTagLength} characters or less` };
    }
    if (seenTags.has(normalizedTag)) continue;

    seenTags.add(normalizedTag);
    nextTags.push(normalizedTag);
  }

  if (nextTags.length > maxServiceTags) {
    return { error: `Use ${maxServiceTags} tags or fewer` };
  }

  return { value: nextTags };
};

const validateServicePayload = (body, { partial = false } = {}) => {
  const source = body || {};
  const next = {};

  if (!partial || source.name !== undefined) {
    if (typeof source.name !== "string" || !source.name.trim()) {
      return { error: "Service name is required" };
    }
    next.name = source.name.trim();
  }

  // Price: required for single services; optional for packages using sum mode
  if (!partial || source.price !== undefined) {
    const isSumPrice =
      source.type === "package" && source.packagePriceMode === "sum";

    if (source.price === undefined && isSumPrice) {
      // Price will be auto-calculated later — skip validation
    } else {
      if (isBlankNumberInput(source.price)) {
        return { error: "Price must be a non-negative number" };
      }

      const parsedPrice = Number(source.price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return { error: "Price must be a non-negative number" };
      }
      next.price = parsedPrice;
    }
  }

  // Duration: required for single services; optional for packages using sum mode
  if (!partial || source.duration !== undefined) {
    const isSumDuration =
      source.type === "package" && source.packageDurationMode === "sum";

    if (source.duration === undefined && isSumDuration) {
      // Duration will be auto-calculated later — skip validation
    } else {
      if (isBlankNumberInput(source.duration)) {
        return { error: "Duration must be a positive number" };
      }

      const parsedDuration = Number(source.duration);
      if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
        return { error: "Duration must be a positive number" };
      }
      next.duration = parsedDuration;
    }
  }

  if (source.description !== undefined) {
    next.description = String(source.description || "").trim();
  }

  if (!partial || source.category !== undefined) {
    const category = String(source.category || "other").trim();

    if (!SERVICE_CATEGORIES.includes(category)) {
      return { error: "Invalid service category" };
    }

    next.category = category;
  }

  if (source.tags !== undefined) {
    const { value, error } = sanitizeTags(source.tags);

    if (error) return { error };
    next.tags = value;
  }

  if (source.active !== undefined) {
    if (typeof source.active !== "boolean") {
      return { error: "Active must be a boolean" };
    }
    next.active = source.active;
  }

  // ── Discount fields ──
  if (!partial || source.discountType !== undefined || source.discountValue !== undefined) {
    const discountType = source.discountType !== undefined ? source.discountType : "none";
    const discountValue = source.discountValue !== undefined ? Number(source.discountValue) : 0;

    if (!["none", "percent", "fixed"].includes(discountType)) {
      return { error: "discountType must be 'none', 'percent', or 'fixed'" };
    }

    if (discountType === "none") {
      if (discountValue !== 0) {
        return { error: "discountValue must be 0 when discountType is 'none'" };
      }
    } else if (discountType === "percent") {
      if (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue > 100) {
        return { error: "discountValue must be between 1 and 100 for percent discount" };
      }
    } else if (discountType === "fixed") {
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        return { error: "discountValue must be greater than 0 for fixed discount" };
      }
      // Validate against price — resolved price may come from body or will be validated later
      const priceForValidation = next.price !== undefined ? next.price : source.price;
      if (priceForValidation !== undefined && Number(priceForValidation) >= 0) {
        if (discountValue > Number(priceForValidation)) {
          return { error: "discountValue cannot exceed the service price for fixed discount" };
        }
      }
    }

    next.discountType = discountType;
    next.discountValue = discountValue;
  }

  // ── Package fields ──
  if (!partial || source.type !== undefined) {
    if (source.type !== undefined && !["single", "package"].includes(source.type)) {
      return { error: "Type must be 'single' or 'package'" };
    }
    next.type = source.type || "single";
  }

  return { value: next };

};

const validateAndResolveIncludedServices = async (includedServiceIds, barberId, existingServiceId) => {
  if (!Array.isArray(includedServiceIds)) {
    return { error: "includedServiceIds must be an array" };
  }

  if (includedServiceIds.length < 2) {
    return { error: "Package must include at least 2 services" };
  }

  // Deduplicate
  const uniqueIds = [...new Set(includedServiceIds.map((id) => String(id)))];

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

const validateCustomCategoryForBarber = async (customCategoryId, barberId) => {
  if (customCategoryId === null || customCategoryId === "") {
    return { value: null };
  }

  if (!mongoose.Types.ObjectId.isValid(customCategoryId)) {
    return { error: "Invalid custom category", code: 400 };
  }

  const category = await ServiceCategory.findById(customCategoryId);

  if (!category || !category.active) {
    return { error: "Invalid custom category", code: 400 };
  }

  if (category.source !== "custom") {
    return {
      error: "customCategoryId must reference a custom category",
      code: 400,
    };
  }

  if (category.ownerType === "barber") {
    if (String(category.ownerId) !== String(barberId)) {
      return { error: "Not authorized to use this custom category", code: 403 };
    }

    return { value: category._id };
  }

  if (category.ownerType === "salon") {
    const salon = await Salon.findById(category.ownerId);

    if (!salon || !canManageSalonRequest(salon, barberId)) {
      return { error: "Not authorized to use this custom category", code: 403 };
    }

    return { value: category._id };
  }

  return { error: "Invalid custom category", code: 400 };
};

export const getServicesByBarber = async (req, res) => {
  try {
    // Phase 11: Hide unpaid/expired barbers from public endpoint
    const hasAccess = await barberHasPaidAccess(req.params.barberId);
    if (!hasAccess) {
      return res.status(404).json({ message: "Barber not found" });
    }

    const services = await Service.find({ barberId: req.params.barberId })
      .populate({
        path: "customCategoryId",
        match: { active: true },
        select: "_id name ownerType ownerId sortOrder",
      });
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

    const service = await Service.create({
      ...value,
      barberId: req.user._id,
    });

    return res.status(201).json(service);
  } catch (error) {
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

    const { value, error } = validateServicePayload(req.body, { partial: true });
    if (error) {
      return res.status(400).json({ message: error });
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

    // ── Package handling on update ──
    const resolvedType = value.type || service.type;

    if (resolvedType === "package") {
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

    Object.assign(service, value);

    const updatedService = await service.save();

    return res.json(updatedService);
  } catch (error) {
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
