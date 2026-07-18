import mongoose from "mongoose";

import Schedule from "../../models/Schedule.js";
import { getPublicBarberReadinessByIds } from "./publicBarberReadinessService.js";

const objectIdPattern = /^[a-f\d]{24}$/i;

export const publicScheduleUnavailable = () => ({
  status: 403,
  body: {
    code: "BARBER_UNAVAILABLE",
    message: "This specialist is not currently accepting bookings.",
  },
});

export const normalizePublicAvailabilityId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (typeof value !== "string" || !objectIdPattern.test(value)) return null;
  return value.toLowerCase();
};

export const normalizePublicAvailabilityIds = ({
  barberId,
  salonId,
  requireSalon = false,
} = {}) => {
  const normalizedBarberId = normalizePublicAvailabilityId(barberId);
  const normalizedSalonId = salonId === undefined || salonId === null
    ? null
    : normalizePublicAvailabilityId(salonId);

  if (
    !normalizedBarberId ||
    (requireSalon && !normalizedSalonId) ||
    (salonId !== undefined && salonId !== null && !normalizedSalonId)
  ) {
    return {
      status: 400,
      body: { message: "Invalid schedule identifiers" },
    };
  }

  return {
    barberId: normalizedBarberId,
    salonId: normalizedSalonId,
  };
};

export const resolvePublicScheduleContext = async ({
  barberId,
  salonId = null,
  requireSalon = false,
} = {}) => {
  const normalizedIds = normalizePublicAvailabilityIds({
    barberId,
    salonId,
    requireSalon,
  });
  if (normalizedIds.body) return normalizedIds;

  const readiness = (await getPublicBarberReadinessByIds([normalizedIds.barberId]))
    .get(normalizedIds.barberId);
  if (!readiness?.onboardingReady || !readiness.hasActiveService) {
    return publicScheduleUnavailable();
  }

  if (requireSalon) {
    if (!readiness.eligibleSalonIds?.has(normalizedIds.salonId)) {
      return publicScheduleUnavailable();
    }

    const schedule = await Schedule.findOne({
      barberId: normalizedIds.barberId,
      salonId: normalizedIds.salonId,
    });
    if (!schedule) return { status: 404, body: { message: "Schedule not found" } };

    return { ...normalizedIds, readiness, schedule };
  }

  if (!readiness.independentReady) {
    return publicScheduleUnavailable();
  }

  const schedule = await Schedule.findOne({
    barberId: normalizedIds.barberId,
    salonId: null,
  });
  if (!schedule) return { status: 404, body: { message: "Schedule not found" } };

  return { ...normalizedIds, readiness, schedule };
};
