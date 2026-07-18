import BarberProfile from "../../models/BarberProfile.js";
import mongoose from "mongoose";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
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

const executeQuery = async (query, projection) => {
  const selected = typeof query?.select === "function" ? query.select(projection) : query;
  const lean = typeof selected?.lean === "function" ? selected.lean() : selected;
  return await lean;
};

export const resolveScopedBookingReadiness = async ({
  barberId,
  salonId,
  serviceId,
} = {}) => {
  const normalizedIds = normalizeScopedBookingReadinessIds({ barberId, salonId, serviceId });
  if (normalizedIds.body) return normalizedIds;

  const service = await Service.findOne({
    _id: normalizedIds.serviceId,
    barberId: normalizedIds.barberId,
    active: true,
  });
  if (!service) {
    return {
      status: 400,
      body: { message: "Service is not available for this barber" },
    };
  }

  const { barberId: normalizedBarberId, salonId: requestedSalonId } = normalizedIds;

  const barber = await executeQuery(
    User.findById(normalizedBarberId),
    "salon salonStatus salons role loyaltyDiscountSettings specialistOnboarding"
  );
  if (!barber || barber.role !== "barber") {
    return { status: 404, body: { message: "Barber not found" } };
  }

  if (requestedSalonId) {
    const salonExists = await Salon.exists({ _id: requestedSalonId });
    if (!salonExists) {
      return { status: 404, body: { message: "Salon not found" } };
    }

    const readiness = buildPublicBarberReadiness({
      barber,
      activeServices: [service],
    });
    if (!readiness.onboardingReady || !readiness.eligibleSalonIds.has(requestedSalonId)) {
      return unavailable();
    }

    const schedule = await Schedule.findOne({ barberId: normalizedBarberId, salonId: requestedSalonId });
    if (!schedule) return unavailable();

    return {
      barber,
      readiness,
      salonId: requestedSalonId,
      schedule,
      service,
    };
  }

  const [profile, personalSchedule] = await Promise.all([
    executeQuery(BarberProfile.findOne({ barberId: normalizedBarberId }), "barberId address"),
    Schedule.findOne({ barberId: normalizedBarberId, salonId: null }),
  ]);
  const readiness = buildPublicBarberReadiness({
    barber,
    profile,
    personalSchedule,
    activeServices: [service],
  });

  if (!readiness.onboardingReady || !readiness.independentReady) {
    return unavailable();
  }

  return {
    barber,
    readiness,
    salonId: null,
    schedule: personalSchedule,
    service,
  };
};
