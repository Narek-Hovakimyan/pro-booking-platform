import BarberProfile from "../../models/BarberProfile.js";
import mongoose from "mongoose";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service, {
  touchServiceDependencies,
  validateIncludedServices,
} from "../../models/Service.js";
import User from "../../models/User.js";
import { buildPublicBarberReadiness } from "../barber/publicBarberReadinessService.js";

const objectIdPattern = /^[a-f\d]{24}$/i;

const normalizeObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (typeof value !== "string" || !objectIdPattern.test(value)) return null;
  return value.toLowerCase();
};

const invalidIdentifiers = () => ({
  status: 400,
  body: { message: "Invalid booking identifiers" },
});

export const normalizeScopedBookingReadinessIds = ({
  barberId,
  serviceId,
  salonId,
} = {}) => {
  const normalizedBarberId = normalizeObjectId(barberId);
  const normalizedServiceId = normalizeObjectId(serviceId);
  const normalizedSalonId = salonId === undefined || salonId === null
    ? null
    : normalizeObjectId(salonId);

  if (!normalizedBarberId || !normalizedServiceId || (salonId !== undefined && salonId !== null && !normalizedSalonId)) {
    return invalidIdentifiers();
  }

  return {
    barberId: normalizedBarberId,
    serviceId: normalizedServiceId,
    salonId: normalizedSalonId,
  };
};

const unavailable = () => ({
  status: 403,
  body: {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  },
});

const withSession = (query, session) =>
  session && typeof query?.session === "function" ? query.session(session) : query;

const executeQuery = async (query, projection, session = null) => {
  const selectedQuery = withSession(query, session);
  const selected = projection && typeof selectedQuery?.select === "function"
    ? selectedQuery.select(projection)
    : selectedQuery;
  const lean = typeof selected?.lean === "function" ? selected.lean() : selected;
  return await lean;
};

const unavailableService = () => ({
  status: 400,
  body: { message: "Service is not available for this barber" },
});

const resolveEffectiveService = async (service, barberId, session) => {
  if (service.type !== "package") return { service, packageMembers: [] };

  const included = await validateIncludedServices(
    service.includedServiceIds || [],
    barberId,
    service._id,
    session
  );
  if (included.error) return null;

  const effective = typeof service.toObject === "function" ? service.toObject() : { ...service };
  if (service.packagePriceMode === "sum") {
    effective.price = included.services.reduce((sum, item) => sum + Number(item.price || 0), 0);
  }
  if (service.packageDurationMode === "sum") {
    effective.duration = included.services.reduce((sum, item) => sum + Number(item.duration || 0), 0);
  }
  return { service: effective, packageMembers: included.services };
};

export const resolveScopedBookingReadiness = async ({
  barberId,
  salonId,
  serviceId,
  session = null,
} = {}) => {
  const normalizedIds = normalizeScopedBookingReadinessIds({ barberId, salonId, serviceId });
  if (normalizedIds.body) return normalizedIds;

  const service = await executeQuery(Service.findOne({
    _id: normalizedIds.serviceId,
    barberId: normalizedIds.barberId,
    active: true,
  }), null, session);
  if (!service) {
    return unavailableService();
  }

  const { barberId: normalizedBarberId, salonId: requestedSalonId } = normalizedIds;
  const effectiveService = await resolveEffectiveService(service, normalizedBarberId, session);
  if (!effectiveService) return unavailableService();

  const barber = await executeQuery(
    User.findById(normalizedBarberId),
    "salon salonStatus salons role loyaltyDiscountSettings specialistOnboarding",
    session
  );
  if (!barber || barber.role !== "barber") {
    return { status: 404, body: { message: "Barber not found" } };
  }

  if (requestedSalonId) {
    const salonExists = await withSession(Salon.exists({ _id: requestedSalonId }), session);
    if (!salonExists) {
      return { status: 404, body: { message: "Salon not found" } };
    }

    const readiness = buildPublicBarberReadiness({
      barber,
      activeServices: [effectiveService.service],
    });
    if (!readiness.onboardingReady || !readiness.eligibleSalonIds.has(requestedSalonId)) {
      return unavailable();
    }

    const schedule = await executeQuery(
      Schedule.findOne({ barberId: normalizedBarberId, salonId: requestedSalonId }),
      null,
      session
    );
    if (!schedule) return unavailable();

    return {
      barber,
      readiness,
      salonId: requestedSalonId,
      schedule,
      service: effectiveService.service,
      packageMembers: effectiveService.packageMembers,
    };
  }

  const [profile, personalSchedule] = await Promise.all([
    executeQuery(BarberProfile.findOne({ barberId: normalizedBarberId }), "barberId address", session),
    executeQuery(Schedule.findOne({ barberId: normalizedBarberId, salonId: null }), null, session),
  ]);
  const readiness = buildPublicBarberReadiness({
    barber,
    profile,
    personalSchedule,
    activeServices: [effectiveService.service],
  });

  if (!readiness.onboardingReady || !readiness.independentReady) {
    return unavailable();
  }

  return {
    barber,
    readiness,
    salonId: null,
    schedule: personalSchedule,
    service: effectiveService.service,
    packageMembers: effectiveService.packageMembers,
  };
};

export const touchScopedBookingReadiness = async ({ readiness, session } = {}) => {
  if (!session || mongoose.connection.readyState !== 1) return true;
  const serviceResult = await Service.updateOne(
    { _id: readiness.service._id, barberId: readiness.service.barberId, active: true },
    { $currentDate: { updatedAt: true } },
    { session }
  );
  if (serviceResult.matchedCount !== 1) return false;
  await touchServiceDependencies(readiness.packageMembers || [], readiness.service.barberId, session);
  const barberResult = await User.updateOne(
    { _id: readiness.barber._id, role: "barber" },
    { $currentDate: { updatedAt: true } },
    { session }
  );
  if (barberResult.matchedCount !== 1) return false;
  const scheduleResult = await Schedule.updateOne(
    { barberId: readiness.barber._id, salonId: readiness.salonId },
    { $currentDate: { updatedAt: true } },
    { session }
  );
  if (scheduleResult.matchedCount !== 1) return false;
  if (readiness.salonId !== null) return true;
  const profileResult = await BarberProfile.updateOne(
    { barberId: readiness.barber._id },
    { $currentDate: { updatedAt: true } },
    { session }
  );
  return profileResult.matchedCount === 1;
};
