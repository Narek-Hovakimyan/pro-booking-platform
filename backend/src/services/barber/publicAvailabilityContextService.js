import mongoose from "mongoose";

import Schedule from "../../models/Schedule.js";
import { getPublicBarberReadinessByIds } from "./publicBarberReadinessService.js";

const objectIdPattern = /^[a-f\d]{24}$/i;
const nullSalonScheduleKey = "__null_salon__";

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

const getScheduleKey = (salonId) =>
  salonId === null || salonId === undefined ? nullSalonScheduleKey : String(salonId);

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

export const getPublicAvailabilityScheduleMaps = async ({
  barbers = [],
  readinessByBarberId = new Map(),
  includeIndependent = false,
  exactSalonId = null,
} = {}) => {
  const barberIds = [...new Set((barbers || []).map((barber) => getIdString(barber?._id || barber)).filter(Boolean))];
  if (!barberIds.length) return new Map();

  const independentBarberIds = includeIndependent
    ? barberIds.filter((barberId) => readinessByBarberId.get(barberId)?.independentReady)
    : [];
  const salonIds = exactSalonId
    ? [String(exactSalonId)]
    : [...new Set(
        barberIds.flatMap((barberId) => [...(readinessByBarberId.get(barberId)?.eligibleSalonIds || [])].map(String))
      )];
  const scheduleClauses = [];

  if (independentBarberIds.length) {
    scheduleClauses.push({
      barberId: { $in: independentBarberIds },
      salonId: null,
    });
  }

  if (salonIds.length) {
    scheduleClauses.push({
      barberId: { $in: barberIds },
      salonId: exactSalonId ? String(exactSalonId) : { $in: salonIds },
    });
  }

  if (!scheduleClauses.length) return new Map();

  const schedules = await Schedule.find(
    scheduleClauses.length === 1 ? scheduleClauses[0] : { $or: scheduleClauses }
  );
  const schedulesByBarberId = new Map();

  for (const schedule of schedules) {
    const barberId = getIdString(schedule?.barberId);
    if (!barberId) continue;

    const scheduleMap = schedulesByBarberId.get(barberId) || new Map();
    scheduleMap.set(getScheduleKey(schedule?.salonId ?? null), schedule?.toObject?.() || schedule);
    schedulesByBarberId.set(barberId, scheduleMap);
  }

  return schedulesByBarberId;
};

export const getPublicAvailabilitySchedule = (scheduleMap, salonId = null) =>
  scheduleMap?.get(getScheduleKey(salonId)) || null;
