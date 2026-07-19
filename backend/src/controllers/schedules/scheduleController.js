import Schedule from "../../models/Schedule.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import {
  canUserManageSalon,
  hasAcceptedSalonJoinRequest,
  isUserApprovedForSalon,
} from "../../services/salon/salonMembershipService.js";
import { barberHasPaidAccessForSalon } from "../../services/subscriptionService.js";
import {
  normalizePublicAvailabilityIds,
  resolvePublicScheduleContext,
} from "../../services/barber/publicAvailabilityContextService.js";
import { createCrudController } from "../crudController.js";
import {
  cleanCurrentAndFutureDateKeys,
  cleanPastScheduleDates,
  getIdString,
  getTodayKey,
  markExplicitAllDaysOffWeeklySchedule,
  normalizeAutoClosedWeeklySchedule,
  sanitizeDateSchedules,
  sanitizeDefaultSchedule,
  sanitizeScheduleOverrides,
  serializeDefaultSchedule,
  sanitizeWeeklySchedule,
} from "../../utils/scheduleUtils.js";
import { sendControllerError } from "../../utils/controllerError.js";

export const scheduleController = createCrudController(Schedule, "Schedule");

const canEditSalonSchedule = async ({ barberId, salonId, user }) => {
  if (user?.role !== "barber") {
    return { allowed: false, status: 403, message: "Only barbers can edit schedules" };
  }

  if (String(user?._id) !== String(barberId)) {
    return { allowed: false, status: 403, message: "You can edit only your schedule" };
  }

  const [barber, salon] = await Promise.all([
    User.findById(barberId).select("salon salonStatus salons role"),
    Salon.findById(salonId).select("ownerId admins"),
  ]);

  if (!barber || barber.role !== "barber") {
    return { allowed: false, status: 404, message: "Barber not found" };
  }

  if (!salon) {
    return { allowed: false, status: 404, message: "Salon not found" };
  }

  if (
    canUserManageSalon(user, salon) ||
    isUserApprovedForSalon(barber, salonId)
  ) {
    return { allowed: true };
  }

  if (await hasAcceptedSalonJoinRequest(barberId, salonId)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 403,
    message: "You can edit schedules only for salons you are approved to work in",
  };
};

const getCleanedScheduleFields = (schedule = {}) => ({
  ...cleanPastScheduleDates(schedule),
  weeklySchedule: normalizeAutoClosedWeeklySchedule(schedule?.weeklySchedule),
});

export const getScheduleByBarber = async (req, res) => {
  try {
    const { barberId } = req.params;
    const context = await resolvePublicScheduleContext({ barberId });
    if (context.body) return res.status(context.status).json(context.body);

    const { schedule } = context;
    const defaultSchedule = schedule.defaultSchedule
      ? serializeDefaultSchedule(schedule.defaultSchedule)
      : null;
    const cleanedScheduleFields = getCleanedScheduleFields(schedule);

    return res.json({
      ...schedule.toObject(),
      ...cleanedScheduleFields,
      defaultSchedule,
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch schedule");
  }
};

export const getScheduleByBarberAndSalon = async (req, res) => {
  try {
    const { barberId, salonId } = req.params;
    const normalizedIds = normalizePublicAvailabilityIds({
      barberId,
      salonId,
      requireSalon: true,
    });
    if (normalizedIds.body) {
      return res.status(normalizedIds.status).json(normalizedIds.body);
    }

    const hasPaidAccess = await barberHasPaidAccessForSalon(
      normalizedIds.barberId,
      normalizedIds.salonId
    );
    if (!hasPaidAccess) {
      return res.status(403).json({
        code: "BARBER_UNAVAILABLE",
        message: "This specialist is not currently accepting bookings.",
      });
    }

    const context = await resolvePublicScheduleContext({
      barberId: normalizedIds.barberId,
      salonId: normalizedIds.salonId,
      requireSalon: true,
    });
    if (context.body) return res.status(context.status).json(context.body);

    const { schedule } = context;
    const defaultSchedule = schedule.defaultSchedule
      ? serializeDefaultSchedule(schedule.defaultSchedule)
      : null;
    const cleanedScheduleFields = getCleanedScheduleFields(schedule);

    return res.json({
      ...schedule.toObject(),
      ...cleanedScheduleFields,
      defaultSchedule,
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch schedule");
  }
};

export const upsertSchedule = async (req, res) => {
  try {
    return res.status(400).json({
      message: "salonId is required. Use PUT /api/schedules/:barberId/:salonId",
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not update schedule");
  }
};

export const upsertScheduleByBarberAndSalon = async (req, res) => {
  try {
    const { barberId, salonId } = req.params;
    const {
      weeklySchedule,
      dateSchedules = {},
      scheduleOverrides = {},
      nonWorkingDays = [],
      defaultSchedule: defaultSchedulePayload,
    } = req.body;
    const todayKey = getTodayKey();
    const uniqueNonWorkingDays = cleanCurrentAndFutureDateKeys(
      nonWorkingDays,
      todayKey
    );

    if (!weeklySchedule) {
      return res.status(400).json({
        message: "weeklySchedule is required",
      });
    }

    const permission = await canEditSalonSchedule({
      barberId,
      salonId,
      user: req.user,
    });

    if (!permission.allowed) {
      return res.status(permission.status).json({ message: permission.message });
    }

    const sanitizedWeeklySchedule = normalizeAutoClosedWeeklySchedule(
      markExplicitAllDaysOffWeeklySchedule(sanitizeWeeklySchedule(weeklySchedule))
    );
    const sanitizedDateSchedules = sanitizeDateSchedules(dateSchedules);
    const sanitizedScheduleOverrides =
      sanitizeScheduleOverrides(scheduleOverrides);
    const sanitizedDefaultSchedule =
      defaultSchedulePayload !== undefined
        ? sanitizeDefaultSchedule(defaultSchedulePayload)
        : null;
    const nextNonWorkingDays = new Set(uniqueNonWorkingDays);

    for (const [dateKey, override] of Object.entries(sanitizedScheduleOverrides)) {
      if (override.isWorking) {
        nextNonWorkingDays.delete(dateKey);
      } else {
        nextNonWorkingDays.add(dateKey);
      }
    }

    const scheduleUpdate = {
      barberId,
      salonId,
      weeklySchedule: sanitizedWeeklySchedule,
      dateSchedules: sanitizedDateSchedules,
      scheduleOverrides: sanitizedScheduleOverrides,
      nonWorkingDays: Array.from(nextNonWorkingDays).sort(),
    };

    if (sanitizedDefaultSchedule) {
      scheduleUpdate.defaultSchedule = sanitizedDefaultSchedule;
    }

    const schedule = await Schedule.findOneAndUpdate(
      { barberId, salonId },
      scheduleUpdate,
      { returnDocument: "after", runValidators: true, upsert: true }
    );

    // Update defaultSchedule on the barber's salon entry if provided
    if (sanitizedDefaultSchedule) {
      await User.findOneAndUpdate(
        { _id: barberId, "salons.salon": salonId },
        { $set: { "salons.$.defaultSchedule": sanitizedDefaultSchedule } }
      );
    }

    // Fetch barber to get the updated defaultSchedule
    const barber = await User.findById(barberId).select("-password");
    const salonEntry = (barber?.salons || []).find(
      (s) => getIdString(s?.salon) === String(salonId)
    );

    const defaultSchedule = serializeDefaultSchedule(
      schedule.defaultSchedule,
      salonEntry?.defaultSchedule
    );

    return res.json({
      ...schedule.toObject(),
      defaultSchedule,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update schedule",
    });
  }
};
