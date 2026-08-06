import WaitlistEntry from "../../models/WaitlistEntry.js";
import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import Service from "../../models/Service.js";
import User from "../../models/User.js";
import {
  getArmeniaDateKey,
  getDayKeyFromDate,
  isDateKey,
  isTimeKey,
  timeToMinutes,
} from "../../utils/bookingDateTime.js";
import { blockingBookingStatuses, slotOverlaps } from "../../utils/bookingUtils.js";
import {
  canUserManageSalon,
  getApprovedUserSalonIds,
} from "../salon/salonMembershipService.js";
import { getIdString, createWaitlistActionError } from "./waitlistValidation.js";

export const waitlistDisplayPopulate = [
  { path: "clientId", select: "name" },
  { path: "barberId", select: "name" },
  { path: "salonId", select: "name" },
  { path: "serviceId", select: "name" },
  { path: "convertedBooking", select: "bookingDate time status" },
];

export const convertibleWaitlistStatuses = ["active", "notified"];

export const exactFieldPredicate = (document, field) =>
  document?.[field] === undefined ? { $exists: false } : document[field];

export const exactWaitlistNotificationPredicate = (entry) => ({
  _id: entry._id,
  status: "active",
  clientId: exactFieldPredicate(entry, "clientId"),
  barberId: exactFieldPredicate(entry, "barberId"),
  salonId: exactFieldPredicate(entry, "salonId"),
  serviceId: exactFieldPredicate(entry, "serviceId"),
  date: exactFieldPredicate(entry, "date"),
  preferredStartTime: exactFieldPredicate(entry, "preferredStartTime"),
  preferredEndTime: exactFieldPredicate(entry, "preferredEndTime"),
});

export const populateWaitlistEntry = async (entry) => {
  if (!entry) return entry;
  return WaitlistEntry.populate(entry, waitlistDisplayPopulate);
};

export const getClientWaitlistEntries = async (clientId) => {
  return WaitlistEntry.find({ clientId })
    .populate(waitlistDisplayPopulate)
    .sort({ createdAt: -1 });
};

export const getBarberWaitlistEntries = async (barberId) => {
  return WaitlistEntry.find({ barberId })
    .populate(waitlistDisplayPopulate)
    .sort({ createdAt: -1 });
};

export const getActionableWaitlistEntry = async (entryId, barberId) => {
  const entry = await WaitlistEntry.findById(entryId);

  if (!entry) {
    throw createWaitlistActionError("Waitlist entry not found", "NOT_FOUND");
  }

  if (String(entry.barberId) !== String(barberId)) {
    throw createWaitlistActionError(
      "Only the assigned barber can manage this waitlist entry",
      "FORBIDDEN"
    );
  }

  if (!convertibleWaitlistStatuses.includes(entry.status)) {
    throw createWaitlistActionError(
      "Only active or notified waitlist entries can be updated",
      "INVALID_STATUS"
    );
  }

  return entry;
};

export const getValidatedWaitlistConversionContext = async (entry, time) => {
  if (!isTimeKey(time)) {
    throw createWaitlistActionError("time must be HH:mm", "VALIDATION_ERROR");
  }

  if (!isDateKey(entry.date)) {
    throw createWaitlistActionError("Waitlist date is invalid", "VALIDATION_ERROR");
  }

  if (entry.date < getArmeniaDateKey(new Date())) {
    throw createWaitlistActionError("Waitlist date is in the past", "VALIDATION_ERROR");
  }

  const [client, barber, service, salon] = await Promise.all([
    User.findById(entry.clientId).select("name"),
    User.findById(entry.barberId).select("name role"),
    Service.findOne({ _id: entry.serviceId, barberId: entry.barberId }),
    entry.salonId ? Salon.findById(entry.salonId) : Promise.resolve(null),
  ]);

  if (!client) {
    throw createWaitlistActionError("Client not found", "VALIDATION_ERROR");
  }

  if (!barber || barber.role !== "barber") {
    throw createWaitlistActionError("Barber not found", "VALIDATION_ERROR");
  }

  if (!service) {
    throw createWaitlistActionError(
      "Service is not available for this barber",
      "VALIDATION_ERROR"
    );
  }

  if (entry.salonId && !salon) {
    throw createWaitlistActionError("Salon not found", "VALIDATION_ERROR");
  }

  const duration = Number(service.duration);
  const price = Number(service.price);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw createWaitlistActionError("Service duration is invalid", "VALIDATION_ERROR");
  }

  const activeBookings = await Booking.find({
    barberId: entry.barberId,
    status: { $in: blockingBookingStatuses },
    $or: [{ bookingDate: entry.date }, { dayKey: entry.date }],
  });
  const hasOverlap = activeBookings.some(
    (booking) =>
      blockingBookingStatuses.includes(booking?.status) &&
      slotOverlaps(booking, time, duration)
  );

  if (hasOverlap) {
    throw createWaitlistActionError("This time is already booked", "VALIDATION_ERROR");
  }

  return {
    client,
    service,
    duration,
    price: Number.isFinite(price) ? price : 0,
  };
};

export const validateWaitlistRelationships = async ({ barberId, salonId, serviceId }) => {
  const service = await Service.findOne({ _id: serviceId, barberId });

  if (!service) {
    return "Service is not available for this barber";
  }

  if (!salonId) {
    return "";
  }

  const [barber, salon] = await Promise.all([
    User.findById(barberId).select("salon salonStatus salons role"),
    Salon.findById(salonId).select("ownerId admins"),
  ]);

  if (!barber || barber.role !== "barber") {
    return "Barber not found";
  }

  if (!salon) {
    return "Salon not found";
  }

  const isApproved = getApprovedUserSalonIds(barber).includes(getIdString(salonId));
  const isManageable = canUserManageSalon(barber, salon);

  if (!isApproved && !isManageable) {
    return "Barber does not work in selected salon";
  }

  return "";
};

export const getWaitlistNotificationQuery = (entry) => exactWaitlistNotificationPredicate(entry);

export const getWaitlistDisplayQuery = () => waitlistDisplayPopulate;
