import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import Review from "../models/Review.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service, { SERVICE_CATEGORIES } from "../models/Service.js";
import User, { MAX_PHONE_LENGTH } from "../models/User.js";
import { createCrudController } from "./crudController.js";
import { getTodayFirstAvailableSlot } from "../utils/barberCardAvailability.js";
import { getArmeniaDateKey } from "../utils/bookingDateTime.js";
import {
  sanitizeDefaultSchedule,
  getDefaultSchedule,
  parseDefaultSchedulePayload,
  getUploadedAvatarPath,
} from "../utils/barberProfileUtils.js";
import { sanitizeMediaUrl } from "../utils/mediaUrl.js";
import { sendControllerError } from "../utils/controllerError.js";


export const barberProfileController = createCrudController(
  BarberProfile,
  "Barber profile"
);

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

const normalizePhone = (phone) =>
  typeof phone === "string" ? phone.trim() : "";

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
    const barberIds = barbers.map((barber) => barber._id).filter(Boolean);
    const todayKey = getArmeniaDateKey(new Date());

    const allSalonIds = new Set();
    barbers.forEach((barber) => {
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
      Service.find({ barberId: { $in: barberIds } })
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
      chainToArray(Schedule.find({ barberId: { $in: barberIds } })),
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

    for (const barber of barbers) {
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
      const publicBarber = asPlainObject(barber);
      const reviewStats = reviewStatsByBarberId.get(barberId) || {
        total: 0,
        count: 0,
      };

      delete publicBarber.password;
      delete publicBarber.workHistory;
      delete publicBarber.email;
      delete publicBarber.emailVerified;
      delete publicBarber.emailVerifiedAt;
      delete publicBarber.emailVerificationTokenHash;
      delete publicBarber.emailVerificationExpires;
      delete publicBarber.emailVerificationSentAt;

      responseBarbers.push({
        ...publicBarber,
        id: publicBarber._id,
        salonName: primarySalon?.name || "",
        salon: primarySalon,
        salons: approvedSalons,
        approvedSalons,
        primarySalon,
        profession: barber.profession || "barber",
        barberType: barber.barberType || "",
        specialty: barber.specialty || "unisex",
        bio: profile?.bio || "",
        city: profile?.city || barber.city || "",
        address: profile?.address || "",
        instagram: profile?.instagram || "",
        avatarUrl: barber.avatarUrl || "",
        imageUrl: profile?.imageUrl || barber.avatarUrl || "",
        galleryImages: profile?.galleryImages || [],
        defaultSchedule: {
          ...defaultScheduleFallback,
          ...(profile?.defaultSchedule || {}),
        },
      });

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

    return res.json({
      ...(profile?.toObject() || {}),
      barberId: req.params.barberId,
      name: barber?.name || "",
      phone: barber?.phone || "",
      salon:
        approvedSalon
          ? {
              ...approvedSalon.toObject(),
              id: approvedSalon._id,
            }
          : null,
      salonStatus: barber?.salonStatus || "none",
      salonName: approvedSalon?.name || "",
      workHistory: barber?.workHistory || [],
      profession: barber?.profession || "barber",
      barberType: barber?.barberType || "",
      specialty: barber?.specialty || "unisex",
      city: profile?.city || barber?.city || "",
      avatarUrl: barber?.avatarUrl || "",
      imageUrl: profile?.imageUrl || barber?.avatarUrl || "",
      galleryImages: profile?.galleryImages || [],
      defaultSchedule: getDefaultSchedule(profile),
    });
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch barber profile");
  }
};

export const upsertProfileByBarberId = async (req, res) => {
  try {
    if (String(req.user._id) !== String(req.params.barberId)) {
      return res.status(403).json({ message: "You can edit only your profile" });
    }

    const {
      name,
      phone,
      salonName,
      bio,
      city,
      address,
      instagram,
      specialty,
      profession,
      barberType,
      imageUrl: bodyImageUrl,
      avatarUrl: bodyAvatarUrl,
      galleryImages,
      defaultSchedule: defaultSchedulePayload,
    } = req.body;
    const uploadedAvatarPath = getUploadedAvatarPath(req.file);
    const imageUrl = uploadedAvatarPath || sanitizeMediaUrl(bodyImageUrl);
    const avatarUrl = uploadedAvatarPath || sanitizeMediaUrl(bodyAvatarUrl);

    const defaultSchedule = parseDefaultSchedulePayload(defaultSchedulePayload);
    const userUpdates = {};
    const profileUpdates = {
      barberId: req.params.barberId,
    };

    if (name !== undefined) userUpdates.name = name;
    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);

      if (!normalizedPhone) {
        return res.status(400).json({ message: "Phone is required" });
      }

      if (normalizedPhone.length > MAX_PHONE_LENGTH) {
        return res.status(400).json({
          message: `Phone must be ${MAX_PHONE_LENGTH} characters or less`,
        });
      }

      userUpdates.phone = normalizedPhone;
    }
    if (city !== undefined) {
      userUpdates.city = city;
      profileUpdates.city = city;
    }
    if (avatarUrl !== undefined || imageUrl !== undefined) {
      userUpdates.avatarUrl = avatarUrl ?? imageUrl;
      profileUpdates.imageUrl = imageUrl ?? avatarUrl;
    }
    if (salonName !== undefined) profileUpdates.salonName = salonName;
    if (bio !== undefined) profileUpdates.bio = bio;
    if (address !== undefined) profileUpdates.address = address;
    if (instagram !== undefined) profileUpdates.instagram = instagram;
    if (specialty !== undefined) userUpdates.specialty = specialty;
    if (profession !== undefined) userUpdates.profession = profession;
    if (barberType !== undefined) userUpdates.barberType = barberType;
    if (Array.isArray(galleryImages)) {
      profileUpdates.galleryImages = galleryImages.filter(Boolean);
    }
    if (defaultSchedule !== undefined) {
      profileUpdates.defaultSchedule = sanitizeDefaultSchedule(defaultSchedule);
    }

    let user = null;

    if (Object.keys(userUpdates).length > 0) {
      user = await User.findByIdAndUpdate(req.params.barberId, userUpdates, {
        returnDocument: "after",
        runValidators: true,
      }).select("-password");
    }

    const profile = await BarberProfile.findOneAndUpdate(
      { barberId: req.params.barberId },
      profileUpdates,
      { returnDocument: "after", runValidators: true, upsert: true }
    );

    if (!user) {
      user = await User.findById(req.params.barberId).select("-password");
    }

    return res.json({
      ...profile.toObject(),
      name: user?.name || "",
      phone: user?.phone || "",
      salon: user?.salon || null,
      salonStatus: user?.salonStatus || "none",
      workHistory: user?.workHistory || [],
      profession: user?.profession || "barber",
      barberType: user?.barberType || "",
      specialty: user?.specialty || "unisex",
      city: profile.city || user?.city || "",
      avatarUrl: user?.avatarUrl || "",
      imageUrl: profile.imageUrl || user?.avatarUrl || "",
      galleryImages: profile.galleryImages || [],
      defaultSchedule: getDefaultSchedule(profile),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    return res.status(400).json({
      message: error.message || "Could not save barber profile",
    });
  }
};

