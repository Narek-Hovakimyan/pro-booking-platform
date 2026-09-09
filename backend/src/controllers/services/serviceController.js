import Service, {
  hasActivePackageReference,
  touchServiceDependencies,
  validateIncludedServices,
  withServiceDependencyTransaction,
} from "../../models/Service.js";
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

const queryWithSession = (query, session) =>
  session && typeof query?.session === "function" ? query.session(session) : query;

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

const dependencyError = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });

const resolveServiceUpdate = async ({
  service,
  body,
  barberId,
  session = null,
  customCategoryAssignment,
}) => {
  const existingValidationSource = getServiceValidationSource(service);
  const { value, error } = validateServicePayload(body, {
    partial: true,
    existing: existingValidationSource,
  });
  if (error) return { error, statusCode: 400 };
  if (customCategoryAssignment.hasField) {
    value.customCategoryId = customCategoryAssignment.value;
  }

  const resolvedType = value.type || service.type || "single";
  let includedResult;
  if (resolvedType === "package") {
    if (service.type !== "package" && !hasOwnBodyField(body, "includedServiceIds")) {
      return { error: "includedServiceIds must be an array", statusCode: 400 };
    }
    includedResult = await validateIncludedServices(
      hasOwnBodyField(body, "includedServiceIds")
        ? body.includedServiceIds
        : service.includedServiceIds || [],
      barberId,
      service._id,
      session
    );
    if (includedResult.error) return { error: includedResult.error, statusCode: 400 };
    if (hasOwnBodyField(body, "includedServiceIds")) {
      value.includedServiceIds = includedResult.value;
    }
    if (hasOwnBodyField(body, "packagePriceMode")) {
      if (!['manual', 'sum'].includes(body.packagePriceMode)) {
        return { error: "packagePriceMode must be 'manual' or 'sum'", statusCode: 400 };
      }
      value.packagePriceMode = body.packagePriceMode;
    }
    if (hasOwnBodyField(body, "packageDurationMode")) {
      if (!['manual', 'sum'].includes(body.packageDurationMode)) {
        return { error: "packageDurationMode must be 'manual' or 'sum'", statusCode: 400 };
      }
      value.packageDurationMode = body.packageDurationMode;
    }
    const priceMode = value.packagePriceMode || service.packagePriceMode || "manual";
    const durationMode = value.packageDurationMode || service.packageDurationMode || "manual";
    if (priceMode === "sum") {
      value.price = includedResult.services.reduce((sum, item) => sum + (item.price || 0), 0);
    }
    if (durationMode === "sum") {
      value.duration = includedResult.services.reduce((sum, item) => sum + (item.duration || 0), 0);
    }
  }

  if (value.type === "single" && service.type !== "single") {
    value.includedServiceIds = [];
    value.packagePriceMode = "manual";
    value.packageDurationMode = "manual";
  }

  const invalidatesPackageMembers =
    service.type === "single" &&
    (value.active === false || resolvedType === "package");
  if (invalidatesPackageMembers && await hasActivePackageReference(service._id, barberId, session)) {
    return { error: "Service is used by an active package", statusCode: 409 };
  }

  const validationError = validateResolvedServicePayload({
    ...existingValidationSource,
    ...value,
    type: resolvedType,
    packagePriceMode: value.packagePriceMode || service.packagePriceMode || "manual",
    packageDurationMode: value.packageDurationMode || service.packageDurationMode || "manual",
  });
  if (validationError) return { error: validationError.error, statusCode: 400 };
  return { value, resolvedType, includedResult, invalidatesPackageMembers };
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
        : "_id name",
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
      const includedResult = await validateIncludedServices(
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
        value.price = includedResult.services.reduce((sum, s) => sum + (s.price || 0), 0);
      }

      // Auto-calculate duration if sum mode
      if (value.packageDurationMode === "sum") {
        value.duration = includedResult.services.reduce((sum, s) => sum + (s.duration || 0), 0);
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

    const createPayload = { ...value, barberId: req.user._id };
    const hasCustomCategory = hasOwnBodyField(req.body, "customCategoryId") && value.customCategoryId;
    const immutableCreateValue = { ...value, includedServiceIds: [...value.includedServiceIds] };
    const createPackage = async (session) => {
          const attempt = { ...immutableCreateValue, includedServiceIds: [...immutableCreateValue.includedServiceIds] };
          const includedResult = await validateIncludedServices(
            req.body.includedServiceIds,
            req.user._id,
            null,
            session
          );
          if (includedResult.error) {
            const dependencyError = new Error(includedResult.error);
            dependencyError.statusCode = 400;
            throw dependencyError;
          }
          attempt.includedServiceIds = includedResult.value;
          if (attempt.packagePriceMode === "sum") {
            attempt.price = includedResult.services.reduce((sum, item) => sum + (item.price || 0), 0);
          }
          if (attempt.packageDurationMode === "sum") {
            attempt.duration = includedResult.services.reduce((sum, item) => sum + (item.duration || 0), 0);
          }
          const dependencyValidationError = validateResolvedServicePayload(attempt);
          if (dependencyValidationError) {
            const error = new Error(dependencyValidationError.error);
            error.statusCode = 400;
            throw error;
          }
          await touchServiceDependencies(includedResult.services, req.user._id, session);
          return Service.create({ ...createPayload, ...attempt }, { session });
        };
    const service = resolvedType === "package"
      ? hasCustomCategory
        ? await persistServiceWithCategoryReference({
            customCategoryId: value.customCategoryId,
            barberId: req.user._id,
            persist: ({ session }) => createPackage(session),
          })
        : await withServiceDependencyTransaction(createPackage)
      : hasCustomCategory
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
    return sendControllerError(res, error, "Could not create service", {
      duplicateKeyMessage: "Could not create service",
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

    const customCategoryAssignment = {
      hasField: hasOwnBodyField(req.body, "customCategoryId"),
      value: undefined,
    };
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

      customCategoryAssignment.value = customCategoryResult.value;
    }

    const preview = await resolveServiceUpdate({
      service,
      body: req.body,
      barberId: req.user._id,
      customCategoryAssignment,
    });
    if (preview.error) {
      return res.status(preview.statusCode).json({ message: preview.error });
    }

    const preservesExistingInactiveCategory =
      hasOwnBodyField(req.body, "customCategoryId") &&
      service.customCategoryId != null &&
      String(req.body.customCategoryId) === String(service.customCategoryId);

    const hasCustomCategory = customCategoryAssignment.hasField && customCategoryAssignment.value;
    const saveDependencyUpdate = async (session, categoryAssignment = customCategoryAssignment) => {
      const target = session?.inTransaction?.()
        ? await queryWithSession(Service.findOne({ _id: req.params.id, barberId: req.user._id }), session)
        : service;
      if (!target) throw dependencyError(404, "Service not found");
      const attempt = await resolveServiceUpdate({
        service: target,
        body: req.body,
        barberId: req.user._id,
        session,
        customCategoryAssignment: categoryAssignment,
      });
      if (attempt.error) throw dependencyError(attempt.statusCode, attempt.error);
      if (attempt.resolvedType === "package") {
        await touchServiceDependencies(attempt.includedResult.services, req.user._id, session);
      }
      Object.assign(target, attempt.value);
      return target.save({ session });
    };
    const persistCustomCategoryService = ({ session, customCategoryId }) => {
      const assignment = { hasField: true, value: customCategoryId };
      return saveDependencyUpdate(session, assignment);
    };
    const updatedService = hasCustomCategory
      ? await persistServiceWithCategoryReference({
          customCategoryId: customCategoryAssignment.value,
          barberId: req.user._id,
          allowExistingInactive: preservesExistingInactiveCategory,
          persist: persistCustomCategoryService,
        })
      : await withServiceDependencyTransaction(saveDependencyUpdate);

    return res.json(updatedService);
  } catch (error) {
    if (error instanceof ServiceCategoryReferenceIntegrityError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return sendControllerError(res, error, "Could not update service", {
      duplicateKeyMessage: "Could not update service",
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

    const deleteWithDependencyGuard = async (session) => {
      const current = session
        ? await queryWithSession(Service.findOne({ _id: service._id, barberId: req.user._id }), session)
        : service;
      if (!current) {
        const error = new Error("Service not found");
        error.statusCode = 404;
        throw error;
      }
      if (current.type === "single" && await hasActivePackageReference(current._id, req.user._id, session)) {
        const error = new Error("Service is used by an active package");
        error.statusCode = 409;
        throw error;
      }
      return current.deleteOne({ session });
    };
    await withServiceDependencyTransaction(deleteWithDependencyGuard);

    return res.json({ message: "Service deleted" });
  } catch (error) {
    return sendControllerError(res, error, "Could not delete service");
  }
};
