import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import Review from "../models/Review.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service, { SERVICE_CATEGORIES } from "../models/Service.js";
import User from "../models/User.js";
import { createCrudController } from "./crudController.js";
import { getTodayFirstAvailableSlot } from "../utils/barberCardAvailability.js";
import { barberHasPaidAccess, getPaidAccessByBarberIds } from "../services/subscriptionService.js";
import { getArmeniaDateKey } from "../utils/bookingDateTime.js";
import { getDefaultSchedule, getUploadedAvatarPath } from "../utils/barberProfileUtils.js";
import { deleteUploadedFile } from "../middleware/uploadMiddleware.js";
import {
  BarberProfileMutationPayloadError,
  validateBarberProfileMutationPayload,
} from "../utils/barberProfileMutationPayload.js";
import { sendControllerError } from "../utils/controllerError.js";
import {
  serializePublicBarberCard,
  serializePublicBarberProfile,
  serializePublicBarberProfileRecord,
} from "../utils/publicBarberSerializer.js";
import {
  mutateSelfBarberProfile,
  SelfBarberProfileMutationError,
} from "../services/barber/selfBarberProfileMutationService.js";

const genericBarberProfileController = createCrudController(
  BarberProfile,
  "Barber profile"
);

export const barberProfileController = {
  ...genericBarberProfileController,
  getAll: async (_req, res) => {
    try {
      const items = await BarberProfile.find();
      return res.json(items.map(serializePublicBarberProfileRecord));
    } catch (error) {
      return sendControllerError(res, error, "Could not fetch Barber profile");
    }
  },
  getById: async (req, res) => {
    try {
      const item = await BarberProfile.findById(req.params.id);
      if (!item) return res.status(404).json({ message: "Barber profile not found" });
      return res.json(serializePublicBarberProfileRecord(item));
    } catch (error) {
      return sendControllerError(res, error, "Could not fetch Barber profile");
    }
  },
};

const defaultScheduleFallback = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const asPlainObject = (doc) => doc?.toObject?.() || doc || {};

const normalizeForResponse = (doc) => {
  const plain = asPlainObject(doc);

  return {
    ...plain,
    id: plain.id || plain._id,
  };
};

const groupByBarberId = (items = []) => {
  const result = new Map();

  for (const item of items) {
    const barberId = getIdString(item?.barberId);

    if (!barberId) continue;

    result.set(barberId, [...(result.get(barberId) || []), normalizeForResponse(item)]);
  }

  return result;
};

const chainToArray = async (query) => {
  if (!query) return [];
  if (typeof query.lean === "function") return query.lean();
  return query;
};

const getReviewStatsByBarberId = (reviews = []) => {
  const result = new Map();

  for (const review of reviews) {
    const barberId = getIdString(review?.barberId);

    if (!barberId) continue;

    const current = result.get(barberId) || { total: 0, count: 0 };

    current.total += Number(review?.rating || 0);
    current.count += 1;
    result.set(barberId, current);
  }

  return result;
};

const normalizeSearchValue = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const serviceMatchesDiscoveryFilters = (service, filters) => {
  if (!service?.active) return false;

  const serviceName = normalizeSearchValue(service.name);
  const category = normalizeSearchValue(service.category || "other");
  const tags = Array.isArray(service.tags)
    ? service.tags.map(normalizeSearchValue).filter(Boolean)
    : [];

  if (filters.category && category !== filters.category) {
    return false;
  }

  if (filters.search) {
    const search = filters.search;
    const matchesName = serviceName.includes(search);
    const matchesCategory = category.includes(search);
    const matchesTag = tags.some((tag) => tag.includes(search));

    if (!matchesName && !matchesCategory && !matchesTag) {
      return false;
    }
  }

  return true;
};

const getApprovedSalonEntries = (barber, salonsById) => {
  const entries = [];
  const salons = Array.isArray(barber?.salons) ? barber.salons : [];

  for (const entry of salons) {
    if (entry?.status !== "approved") continue;

    const salonId = getIdString(entry.salon);
    const salon = salonsById.get(salonId);

    if (!salon) continue;

    entries.push({
      ...normalizeForResponse(salon),
      id: salon._id || salon.id || salonId,
      salon: normalizeForResponse(salon),
      status: entry.status,
      isPrimary: Boolean(entry.isPrimary),
      joinedAt: entry.joinedAt,
      defaultSchedule: entry.defaultSchedule || {},
    });
  }

  if (entries.length === 0 && barber?.salonStatus === "approved" && barber?.salon) {
    const salonId = getIdString(barber.salon);
    const salon = salonsById.get(salonId);

    if (salon) {
      entries.push({
        ...normalizeForResponse(salon),
        id: salon._id || salon.id || salonId,
        salon: normalizeForResponse(salon),
        status: "approved",
        isPrimary: true,
        joinedAt: barber.createdAt || new Date(),
        defaultSchedule: {},
      });
    }
  }

  return entries;
};

const getMainScheduleForBarber = ({ barber, profile, schedules }) => {
  const approvedSalons = (barber?.salons || []).filter(
    (entry) => entry?.status === "approved"
  );
  const primaryEntry =
    approvedSalons.find((entry) => entry.isPrimary) || approvedSalons[0];
  const primarySalonId = getIdString(primaryEntry?.salon);
  const schedule =
    schedules.find((item) => getIdString(item?.salonId) === primarySalonId) ||
    schedules[0] ||
    {};

  return {
    ...normalizeForResponse(schedule),
    barberId: getIdString(barber?._id),
    weeklySchedule: schedule?.weeklySchedule || {},
    dateSchedules: schedule?.dateSchedules || {},
    scheduleOverrides: schedule?.scheduleOverrides || {},
    nonWorkingDays: schedule?.nonWorkingDays || [],
    defaultSchedule: {
      ...defaultScheduleFallback,
      ...(schedule?.defaultSchedule || {}),
      ...(primaryEntry?.defaultSchedule || {}),
      ...(profile?.defaultSchedule || {}),
    },
  };
};

export const getBarberCardSummary = async (req, res) => {
  try {
    const selectedServiceName = normalizeSearchValue(req.query?.serviceName);
    const selectedServiceCategory = normalizeSearchValue(req.query?.category);
    const serviceSearch = normalizeSearchValue(req.query?.serviceSearch);

    if (
      selectedServiceCategory &&
      !SERVICE_CATEGORIES.includes(selectedServiceCategory)
    ) {
      return res.status(400).json({ message: "Invalid service category" });
    }

    const discoveryFilters = {
      category: selectedServiceCategory,
      search: serviceSearch || selectedServiceName,
    };
    const hasDiscoveryFilters = Boolean(
      discoveryFilters.category || discoveryFilters.search
    );
    const barbers = await chainToArray(
      User.find({ role: "barber" }).select("-password")
    );

    const paidAccessByBarberId = await getPaidAccessByBarberIds(
      barbers.map((barber) => barber._id)
    );
    const paidBarbers = barbers.filter((barber) =>
      paidAccessByBarberId.get(getIdString(barber._id))
    );

    const barberIds = paidBarbers.map((barber) => barber._id).filter(Boolean);
    const todayKey = getArmeniaDateKey(new Date());

    const allSalonIds = new Set();
    paidBarbers.forEach((barber) => {
      (barber.salons || []).forEach((entry) => {
        const salonId = getIdString(entry?.salon);

        if (salonId) allSalonIds.add(salonId);
      });

      const legacySalonId = getIdString(barber.salon);
      if (legacySalonId) allSalonIds.add(legacySalonId);
    });

    const [
      profiles,
      salons,
      services,
      reviews,
      bookings,
      schedules,
    ] = await Promise.all([
      chainToArray(BarberProfile.find({ barberId: { $in: barberIds } })),
      chainToArray(Salon.find({ _id: { $in: [...allSalonIds] } })),
      Service.find({ barberId: { $in: barberIds }, active: true })
        .populate({
          path: "customCategoryId",
          match: { active: true },
          select: "_id name ownerType ownerId sortOrder",
        })
        .lean(),
      chainToArray(Review.find({ barberId: { $in: barberIds } })),
      chainToArray(
        Booking.find({
          barberId: { $in: barberIds },
          $or: [{ bookingDate: todayKey }, { dayKey: todayKey }],
        })
      ),
      chainToArray(Schedule.find({ barberId: { $in: barberIds }, salonId: { $ne: null } })),
    ]);
    const profilesByBarberId = new Map(
      profiles.map((profile) => [getIdString(profile.barberId), profile])
    );
    const salonsById = new Map(
      salons.map((salon) => [getIdString(salon._id), salon])
    );
    const servicesByBarberId = groupByBarberId(services);
    const bookingsByBarberId = groupByBarberId(bookings);
    const schedulesByBarberId = groupByBarberId(schedules);
    const reviewStatsByBarberId = getReviewStatsByBarberId(reviews);
    const responseBarbers = [];
    const responseServices = [];
    const responseReviewStats = [];
    const responseAvailability = [];

    for (const barber of paidBarbers) {
      const barberId = getIdString(barber._id);
      const profile = profilesByBarberId.get(barberId);
      const approvedSalons = getApprovedSalonEntries(barber, salonsById);
      const primarySalon =
        approvedSalons.find((salon) => salon.isPrimary) || approvedSalons[0] || null;
      const barberServices = servicesByBarberId.get(barberId) || [];
      const matchingServices = hasDiscoveryFilters
        ? barberServices.filter((service) =>
            serviceMatchesDiscoveryFilters(service, discoveryFilters)
          )
        : barberServices.filter((service) => service?.active);

      if (hasDiscoveryFilters && matchingServices.length === 0) {
        continue;
      }

      const availabilityServices = hasDiscoveryFilters
        ? matchingServices
        : barberServices;
      const barberBookings = bookingsByBarberId.get(barberId) || [];
      const barberSchedules = schedulesByBarberId.get(barberId) || [];
      const mainSchedule = getMainScheduleForBarber({
        barber,
        profile,
        schedules: barberSchedules,
      });
      const schedulesBySalonId = new Map(
        barberSchedules.map((schedule) => [
          getIdString(schedule.salonId),
          normalizeForResponse(schedule),
        ])
      );
      const availability = getTodayFirstAvailableSlot({
        salons: approvedSalons,
        schedulesBySalonId,
        fallbackSchedule: mainSchedule,
        services: availabilityServices,
        bookings: barberBookings,
      });
      const reviewStats = reviewStatsByBarberId.get(barberId) || {
        total: 0,
        count: 0,
      };

      responseBarbers.push(serializePublicBarberCard({
        barber,
        profile,
        salonName: primarySalon?.name || "",
        salon: primarySalon,
        salons: approvedSalons,
        approvedSalons,
        primarySalon,
      }));

      responseServices.push(...barberServices);
      responseReviewStats.push({
        barberId,
        average: reviewStats.count > 0 ? reviewStats.total / reviewStats.count : 0,
        count: reviewStats.count,
      });
      responseAvailability.push({
        barberId,
        status: availability.status,
        firstAvailableSlot: availability.firstAvailableSlot,
        reason: availability.reason,
      });
    }

    return res.json({
      barbers: responseBarbers,
      services: responseServices,
      reviewStats: responseReviewStats,
      availability: responseAvailability,
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch barber card summary");
  }
};

export const getProfileByBarberId = async (req, res) => {
  try {
    const [profile, barber] = await Promise.all([
      BarberProfile.findOne({
        barberId: req.params.barberId,
      }),
      User.findById(req.params.barberId).select("-password"),
    ]);
    const approvedSalon =
      barber?.salonStatus === "approved" && barber?.salon
        ? await Salon.findById(barber.salon)
        : null;

    if (!profile && !barber) {
      return res.json(null);
    }

    // Phase 11: Hide unpaid/expired barbers from public profile
    if (barber) {
      const hasAccess = await barberHasPaidAccess(barber._id);
      if (!hasAccess) {
        return res.status(404).json({ message: "Barber not found" });
      }
    }

    return res.json(serializePublicBarberProfile({
      barber,
      profile,
      salon: approvedSalon,
      barberId: req.params.barberId,
    }));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch barber profile");
  }
};

const boundedErrorMessages = {
  BARBER_PROFILE_FORBIDDEN: "You can edit only your own barber profile",
  INVALID_BARBER_PROFILE_REQUEST: "Invalid barber profile request",
  BARBER_PROFILE_FIELDS_INVALID: "Invalid barber profile fields",
  BARBER_PROFILE_MEDIA_INVALID: "Invalid barber profile media",
  BARBER_PROFILE_NOT_FOUND: "Barber profile not found",
  BARBER_PROFILE_MUTATION_FAILED: "Could not save barber profile",
};

const statusByErrorCode = {
  BARBER_PROFILE_FORBIDDEN: 403,
  INVALID_BARBER_PROFILE_REQUEST: 400,
  BARBER_PROFILE_FIELDS_INVALID: 400,
  BARBER_PROFILE_MEDIA_INVALID: 400,
  BARBER_PROFILE_NOT_FOUND: 404,
  BARBER_PROFILE_MUTATION_FAILED: 500,
};

const sendBoundedBarberProfileError = (res, code) =>
  res.status(statusByErrorCode[code] || 500).json({
    code,
    message: boundedErrorMessages[code] || boundedErrorMessages.BARBER_PROFILE_MUTATION_FAILED,
  });

const cleanupUploadedAvatar = (file) => {
  const uploadedAvatarPath = getUploadedAvatarPath(file);
  if (!uploadedAvatarPath) return;

  try {
    deleteUploadedFile(uploadedAvatarPath);
  } catch {
  }
};

export const createBarberProfileSelfMutationController = (dependencies = {}) => {
  const mutateProfile = dependencies.mutateSelfBarberProfile || mutateSelfBarberProfile;
  const validatePayload =
    dependencies.validateBarberProfileMutationPayload || validateBarberProfileMutationPayload;

  return async function upsertProfileByBarberId(req, res) {
    const trustedBarberId = req.user?._id;
    const uploadedAvatarPath = getUploadedAvatarPath(req.file);

    if (String(trustedBarberId) !== String(req.params.barberId)) {
      cleanupUploadedAvatar(req.file);
      return sendBoundedBarberProfileError(res, "BARBER_PROFILE_FORBIDDEN");
    }

    try {
      const { userUpdates, profileUpdates } = validatePayload(req.body, {
        uploadedAvatarPath,
      });
      const response = await mutateProfile({
        trustedBarberId,
        userUpdates,
        profileUpdates,
      });

      return res.json(response);
    } catch (error) {
      cleanupUploadedAvatar(req.file);

      if (
        error instanceof BarberProfileMutationPayloadError ||
        error instanceof SelfBarberProfileMutationError
      ) {
        return sendBoundedBarberProfileError(res, error.code);
      }

      return sendBoundedBarberProfileError(res, "BARBER_PROFILE_MUTATION_FAILED");
    }
  };
};

export const upsertProfileByBarberId = createBarberProfileSelfMutationController();
