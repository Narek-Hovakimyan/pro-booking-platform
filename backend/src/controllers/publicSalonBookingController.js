import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import Schedule from "../models/Schedule.js";
import User from "../models/User.js";
import { getPaidAccessByBarberIdsForSalon } from "../services/subscriptionService.js";
import { isBookableSalonSpecialist } from "../services/salon/salonRelationshipService.js";
import { getSalonReviewStats } from "./salonReviewController.js";
import { getTodayFirstAvailableSlot } from "../utils/barberCardAvailability.js";
import { getArmeniaDateKey } from "../utils/bookingDateTime.js";
import { getIdString } from "../utils/bookingUtils.js";
import { sendControllerError } from "../utils/controllerError.js";
import { defaultScheduleFallback } from "../utils/scheduleUtils.js";
import { getPublicBarberReadinessByIds } from "../services/barber/publicBarberReadinessService.js";

const asPlainObject = (doc) => doc?.toObject?.() || doc || {};
let getPaidAccessByBarberIdsForPublicBooking = getPaidAccessByBarberIdsForSalon;
let getSalonReviewStatsForPublicBooking = getSalonReviewStats;

const getApprovedSalonEntry = (barber, salonId, salon) => {
  const approvedEntry = (barber?.salons || []).find(
    (entry) =>
      String(entry?.salon?._id || entry?.salon) === String(salonId) &&
      entry?.status === "approved"
  );

  if (approvedEntry) {
    return {
      ...asPlainObject(approvedEntry),
      salon: salon
        ? {
            ...asPlainObject(salon),
            id: salon.id || salon._id,
          }
        : approvedEntry.salon,
    };
  }

  if (
    String(barber?.salon?._id || barber?.salon) === String(salonId) &&
    barber?.salonStatus === "approved"
  ) {
    return {
      salon: salon
        ? {
            ...asPlainObject(salon),
            id: salon.id || salon._id,
          }
        : salonId,
      status: "approved",
      isPrimary: true,
      relationshipType: "staff",
      defaultSchedule: {},
    };
  }

  return null;
};

/**
 * GET /api/salons/:salonId/public-booking
 * Public — no auth required.
 * Returns salon info, approved+paid barbers, and their active services.
 * Does NOT expose private salon owner dashboard data.
 */
export const getPublicSalonBooking = async (req, res) => {
  try {
    const { salonId } = req.params;

    const salon = await Salon.findById(salonId);
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    const [reviewStatsBySalonId] = await Promise.all([
      getSalonReviewStatsForPublicBooking(salon._id),
    ]);
    const salonReviewStats = reviewStatsBySalonId.get(String(salon._id)) || {
      averageRating: 0,
      totalReviews: 0,
      reviewsCount: 0,
    };

    // Find approved barbers in this salon
    const barbers = await User.find({
      role: "barber",
      $or: [
        { "salons.salon": salon._id, "salons.status": "approved" },
        { salon: salon._id, salonStatus: "approved" },
      ],
    }).select("-password");

    if (barbers.length === 0) {
      return res.json({
        salon: {
          id: salon._id,
          name: salon.name,
          city: salon.city,
          address: salon.address,
          phone: salon.phone,
          imageUrl: salon.imageUrl,
          averageRating: salonReviewStats.averageRating || 0,
          totalReviews:
            salonReviewStats.totalReviews ?? salonReviewStats.reviewsCount ?? 0,
        },
        barbers: [],
        services: [],
      });
    }

    // Filter by paid access
    const barberIds = barbers.map((b) => b._id);
    const paidAccessMap = await getPaidAccessByBarberIdsForPublicBooking(
      barberIds,
      salon._id
    );
    const readinessByBarberId = await getPublicBarberReadinessByIds(barberIds);
    const paidBarbers = barbers.filter(
      (barber) =>
        paidAccessMap.get(String(barber._id)) === true &&
        readinessByBarberId.get(String(barber._id))?.publicReady &&
        readinessByBarberId.get(String(barber._id))?.eligibleSalonIds.has(String(salon._id)) &&
        isBookableSalonSpecialist(getApprovedSalonEntry(barber, salon._id, salon))
    );

    const paidBarberIds = paidBarbers.map((barber) => barber._id).filter(Boolean);
    const todayKey = getArmeniaDateKey(new Date());

    const [profiles, services, schedules, todayBookings] = await Promise.all([
      BarberProfile.find({
        barberId: { $in: paidBarberIds },
      }),
      Service.find({
        barberId: { $in: paidBarberIds },
        active: true,
      }).lean(),
      Schedule.find({
        barberId: { $in: paidBarberIds },
        salonId: salon._id,
      }),
      Booking.find({
        barberId: { $in: paidBarberIds },
        $or: [{ bookingDate: todayKey }, { dayKey: todayKey }],
      }),
    ]);

    const profilesByBarberId = new Map(
      profiles.map((profile) => [String(profile.barberId), profile])
    );
    const schedulesByBarberId = new Map(
      schedules.map((schedule) => [String(schedule.barberId), asPlainObject(schedule)])
    );
    const bookingsByBarberId = new Map();
    for (const booking of todayBookings) {
      const bookingBarberId = String(booking.barberId);
      bookingsByBarberId.set(bookingBarberId, [
        ...(bookingsByBarberId.get(bookingBarberId) || []),
        booking,
      ]);
    }
    const servicesByBarberId = new Map();
    for (const service of services) {
      const serviceBarberId = String(service.barberId);
      servicesByBarberId.set(serviceBarberId, [
        ...(servicesByBarberId.get(serviceBarberId) || []),
        service,
      ]);
    }

    const serializedBarbers = paidBarbers.map((barber) => {
      const profile = profilesByBarberId.get(String(barber._id));
      const approvedSalonEntry = getApprovedSalonEntry(barber, salon._id, salon);
      const barberServices = servicesByBarberId.get(String(barber._id)) || [];
      const schedule = schedulesByBarberId.get(String(barber._id)) || null;
      const availability = getTodayFirstAvailableSlot({
        salons: approvedSalonEntry ? [approvedSalonEntry] : [],
        schedulesBySalonId: new Map(
          schedule ? [[String(salon._id), schedule]] : []
        ),
        fallbackSchedule: {
          weeklySchedule: schedule?.weeklySchedule || {},
          dateSchedules: schedule?.dateSchedules || {},
          scheduleOverrides: schedule?.scheduleOverrides || {},
          nonWorkingDays: schedule?.nonWorkingDays || [],
          defaultSchedule: {
            ...defaultScheduleFallback,
            ...(approvedSalonEntry?.defaultSchedule || {}),
            ...(profile?.defaultSchedule || {}),
            ...(schedule?.defaultSchedule || {}),
          },
        },
        services: barberServices,
        bookings: bookingsByBarberId.get(String(barber._id)) || [],
      });

      return {
        id: barber._id,
        name: barber.name,
        avatarUrl: profile?.imageUrl || barber.avatarUrl || "",
        city: profile?.city || barber.city || "",
        profession: barber.profession,
        barberType: barber.barberType || "",
        specialty: barber.specialty,
        bio: profile?.bio || "",
        relationshipType: approvedSalonEntry?.relationshipType || "staff",
        availabilityStatus: availability.status,
        firstAvailableSlot: availability.firstAvailableSlot,
        depositSettings: profile?.depositSettings
          ? {
              enabled: profile.depositSettings.enabled || false,
              mode: profile.depositSettings.mode || "percentage",
              value: profile.depositSettings.value || 0,
              minimumBookingPrice: profile.depositSettings.minimumBookingPrice ?? null,
              noShowPolicyText: String(profile.depositSettings.noShowPolicyText || "").slice(0, 1000),
            }
          : {
              enabled: false,
              mode: "percentage",
              value: 0,
              minimumBookingPrice: null,
              noShowPolicyText: "",
            },
        availabilityReason: availability.reason,
        services: barberServices.map((svc) => ({
          id: svc._id,
          name: svc.name,
          barberId: getIdString(svc.barberId),
          price: svc.price,
          duration: svc.duration,
          description: svc.description,
          category: svc.category,
          tags: svc.tags || [],
          type: svc.type || "single",
          discountType: svc.discountType,
          discountValue: svc.discountValue,
        })),
      };
    });

    return res.json({
      salon: {
        id: salon._id,
        name: salon.name,
        city: salon.city,
        address: salon.address,
        phone: salon.phone,
        imageUrl: salon.imageUrl,
        averageRating: salonReviewStats.averageRating || 0,
        totalReviews:
          salonReviewStats.totalReviews ?? salonReviewStats.reviewsCount ?? 0,
      },
      barbers: serializedBarbers,
      services: services.map((svc) => ({
        id: svc._id,
        barberId: getIdString(svc.barberId),
        name: svc.name,
        price: svc.price,
        duration: svc.duration,
        description: svc.description,
        category: svc.category,
        tags: svc.tags || [],
        type: svc.type || "single",
        discountType: svc.discountType,
        discountValue: svc.discountValue,
      })),
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Could not fetch public salon booking data"
    );
  }
};

export const __publicSalonBookingTestHooks = {
  setGetPaidAccessByBarberIds(nextGetPaidAccessByBarberIds) {
    getPaidAccessByBarberIdsForPublicBooking =
      nextGetPaidAccessByBarberIds || getPaidAccessByBarberIdsForSalon;
  },
  resetGetPaidAccessByBarberIds() {
    getPaidAccessByBarberIdsForPublicBooking = getPaidAccessByBarberIdsForSalon;
  },
  setGetSalonReviewStats(nextGetSalonReviewStats) {
    getSalonReviewStatsForPublicBooking =
      nextGetSalonReviewStats || getSalonReviewStats;
  },
  resetGetSalonReviewStats() {
    getSalonReviewStatsForPublicBooking = getSalonReviewStats;
  },
};
