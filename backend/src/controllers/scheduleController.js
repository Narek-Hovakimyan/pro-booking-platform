import BarberProfile from "../models/BarberProfile.js";
import Schedule from "../models/Schedule.js";
import Salon from "../models/Salon.js";
import User from "../models/User.js";
import {
  canUserManageSalon,
  hasAcceptedSalonJoinRequest,
  isUserApprovedForSalon,
} from "../services/salon/salonMembershipService.js";
import { createCrudController } from "./crudController.js";
import {
  getIdString,
  getTodayKey,
  isDateKey,
  normalizeAutoClosedWeeklySchedule,
  sanitizeDateSchedules,
  sanitizeDefaultSchedule,
  sanitizeScheduleOverrides,
  serializeDefaultSchedule,
  sanitizeWeeklySchedule,
} from "../utils/scheduleUtils.js";
import { sendControllerError } from "../utils/controllerError.js";

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

const maybePersistCleanedWeeklySchedule = async (schedule, query, weeklySchedule) => {
  if (!schedule || weeklySchedule === schedule.weeklySchedule) return;

  await Schedule.findOneAndUpdate(query, { $set: { weeklySchedule } });
};

export const getScheduleByBarber = async (req, res) => {
  try {
    const { barberId } = req.params;

    // Try to find the barber's primary salon to get the per-salon schedule
    const barber = await User.findById(barberId).select("-password");
    const primarySalonEntry = (barber?.salons || []).find(
      (s) => s.status === "approved" && s.isPrimary
    ) || (barber?.salons || []).find((s) => s.status === "approved");

    let schedule = null;
    let scheduleQuery = null;

    if (primarySalonEntry?.salon) {
      // Get the per-salon schedule for the primary salon
      scheduleQuery = {
        barberId,
        salonId: primarySalonEntry.salon,
      };
      schedule = await Schedule.findOne(scheduleQuery);
    }

    // Fallback: try to find any schedule for this barber
    if (!schedule) {
      scheduleQuery = { barberId };
      schedule = await Schedule.findOne(scheduleQuery);
    }

    const profile = await BarberProfile.findOne({ barberId });

    // Build defaultSchedule from the schedule or user's salon entry
    const scheduleDefault = schedule?.defaultSchedule;
    const userDefault = primarySalonEntry?.defaultSchedule;

    const defaultSchedule = serializeDefaultSchedule(
      scheduleDefault,
      userDefault,
      profile?.defaultSchedule
    );
    const weeklySchedule =
      normalizeAutoClosedWeeklySchedule(schedule?.weeklySchedule);

    await maybePersistCleanedWeeklySchedule(schedule, scheduleQuery, weeklySchedule);

    return res.json({
      ...(schedule?.toObject() || {
        barberId,
        weeklySchedule: {},
        dateSchedules: {},
        scheduleOverrides: {},
        nonWorkingDays: [],
      }),
      weeklySchedule,
      defaultSchedule,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not fetch schedule",
    });
  }
};

export const getScheduleByBarberAndSalon = async (req, res) => {
  try {
    const { barberId, salonId } = req.params;

    const [schedule, barber] = await Promise.all([
      Schedule.findOne({ barberId, salonId }),
      User.findById(barberId).select("-password"),
    ]);

    // Find the salon entry in barber's salons array to get defaultSchedule
    const salonEntry = (barber?.salons || []).find(
      (s) => getIdString(s?.salon) === String(salonId)
    );

    // Priority: 1) Schedule model's defaultSchedule, 2) User model's salon entry defaultSchedule, 3) hardcoded defaults
    const scheduleDefault = schedule?.defaultSchedule;
    const userDefault = salonEntry?.defaultSchedule;

    const defaultSchedule = serializeDefaultSchedule(scheduleDefault, userDefault);
    const weeklySchedule =
      normalizeAutoClosedWeeklySchedule(schedule?.weeklySchedule);

    await maybePersistCleanedWeeklySchedule(
      schedule,
      { barberId, salonId },
      weeklySchedule
    );

    return res.json({
      ...(schedule?.toObject() || {
        barberId,
        salonId,
        weeklySchedule: {},
        dateSchedules: {},
        scheduleOverrides: {},
        nonWorkingDays: [],
      }),
      weeklySchedule,
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
    const uniqueNonWorkingDays = Array.from(
      new Set(
        nonWorkingDays.filter(
          (dateKey) => isDateKey(dateKey) && dateKey >= todayKey
        )
      )
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
      sanitizeWeeklySchedule(weeklySchedule)
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
