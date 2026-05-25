import WaitlistEntry from "../models/WaitlistEntry.js";
import Booking from "../models/Booking.js";
import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { createNotification } from "./notificationService.js";

import {
  getArmeniaDateKey,
  getDayKeyFromDate,
  isBeyondBookingHorizon,
  isDateKey,
  isTimeKey,
  timeToMinutes,
} from "../utils/bookingDateTime.js";
import { blockingBookingStatuses, slotOverlaps } from "../utils/bookingUtils.js";
import {
  canUserManageSalon,
  getApprovedUserSalonIds,
} from "./salon/salonMembershipService.js";
import {
  OPEN_WAITLIST_STATUSES,
  CANCELLABLE_WAITLIST_STATUSES,
  getIdString,
  getWaitlistCreationLockKey,
  validatePreferredWindow,
  validateWaitlistDate,
  throwDuplicateWaitlistEntryError,
  createWaitlistActionError,
} from "./waitlistValidation.js";

const waitlistCreationLocks = new Map();
const waitlistDisplayPopulate = [
  { path: "clientId", select: "name" },
  { path: "barberId", select: "name" },
  { path: "salonId", select: "name" },
  { path: "serviceId", select: "name" },
  { path: "convertedBooking", select: "bookingDate time status" },
];

/**
 * Populate display fields on a single waitlist entry so action responses
 * match the same shape returned by getClientWaitlistEntries / getBarberWaitlistEntries.
 */
const populateWaitlistEntry = async (entry) => {
  if (!entry) return entry;
  return WaitlistEntry.populate(entry, waitlistDisplayPopulate);
};

const convertibleWaitlistStatuses = ["active", "notified"];

const withWaitlistCreationLock = async (lockKey, task) => {
  const previousLock = waitlistCreationLocks.get(lockKey) || Promise.resolve();
  let releaseCurrentLock;
  const currentLock = new Promise((resolve) => {
    releaseCurrentLock = resolve;
  });

  const queuedLock = previousLock.then(() => currentLock, () => currentLock);
  waitlistCreationLocks.set(lockKey, queuedLock);

  await previousLock.catch(() => {});

  try {
    return await task();
  } finally {
    releaseCurrentLock();

    if (waitlistCreationLocks.get(lockKey) === queuedLock) {
      waitlistCreationLocks.delete(lockKey);
    }
  }
};

const validateWaitlistRelationships = async ({ barberId, salonId, serviceId }) => {
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

/**
 * Fire-and-forget notification after a successful DB state change.
 * If the notification fails we log the error but do NOT throw —
 * the action itself already succeeded.
 */
const sendNotificationSafe = async (payload) => {
  try {
    await createNotification(payload);
  } catch (err) {
    console.warn("Waitlist notification failed (non-fatal):", err.message);
  }
};

const getActionableWaitlistEntry = async (entryId, barberId) => {
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

const getValidatedWaitlistConversionContext = async (entry, time) => {
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
    throw createWaitlistActionError("Service is not available for this barber", "VALIDATION_ERROR");
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
  const hasOverlap = activeBookings.some((booking) =>
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

/**
 * Create a new waitlist entry.
 * Prevents duplicate open entries for the same barber + salon + service + date + time window.
 */
export const createWaitlistEntry = async ({
  clientId,
  barberId,
  salonId = null,
  serviceId,
  date,
  preferredStartTime = "",
  preferredEndTime = "",
  note = "",
}) => {
  const dateError = validateWaitlistDate(date);

  if (dateError) {
    throw new Error(dateError);
  }

  const normalizedPreferredStartTime = preferredStartTime || "";
  const normalizedPreferredEndTime = preferredEndTime || "";
  const preferredWindowError = validatePreferredWindow({
    preferredStartTime: normalizedPreferredStartTime,
    preferredEndTime: normalizedPreferredEndTime,
  });

  if (preferredWindowError) {
    throw new Error(preferredWindowError);
  }

  const relationshipError = await validateWaitlistRelationships({
    barberId,
    salonId,
    serviceId,
  });

  if (relationshipError) {
    throw new Error(relationshipError);
  }

  const existingQuery = {
    clientId,
    barberId,
    salonId: salonId || null,
    serviceId,
    date,
    preferredStartTime: normalizedPreferredStartTime,
    preferredEndTime: normalizedPreferredEndTime,
    status: { $in: OPEN_WAITLIST_STATUSES },
  };
  const lockKey = getWaitlistCreationLockKey(existingQuery);

  return withWaitlistCreationLock(lockKey, async () => {
    const existing = await WaitlistEntry.findOne(existingQuery);

    if (existing) {
      throwDuplicateWaitlistEntryError();
    }

    const entry = await WaitlistEntry.create({
      clientId,
      barberId,
      salonId: salonId || null,
      serviceId,
      date,
      preferredStartTime: normalizedPreferredStartTime,
      preferredEndTime: normalizedPreferredEndTime,
      note: note || "",
      status: "active",
    });

    return entry;
  });
};

/**
 * Cancel a waitlist entry (client can cancel own active/notified entry).
 */
export const cancelWaitlistEntry = async (entryId, clientId) => {
  const entry = await WaitlistEntry.findOne({
    _id: entryId,
    clientId,
    status: { $in: CANCELLABLE_WAITLIST_STATUSES },
  });

  if (!entry) {
    const error = new Error("Waitlist entry not found or already cancelled");
    error.code = "NOT_FOUND";
    throw error;
  }

  entry.status = "cancelled";
  entry.cancelledAt = new Date();
  await entry.save();

  return entry;
};

/**
 * Barber offers a time for an active/notified waitlist entry.
 * Does NOT create a Booking; sets status to "offered" and waits for client response.
 */
export const offerWaitlistEntry = async ({ entryId, barberId, time }) => {
  if (!isTimeKey(time)) {
    throw createWaitlistActionError("time must be HH:mm", "VALIDATION_ERROR");
  }

  const entry = await getActionableWaitlistEntry(entryId, barberId);

  const offeredEntry = await WaitlistEntry.findOneAndUpdate(
    {
      _id: entry._id,
      barberId,
      status: { $in: convertibleWaitlistStatuses },
    },
    {
      $set: {
        status: "offered",
        offeredTime: time,
        offeredAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!offeredEntry) {
    throw createWaitlistActionError(
      "Waitlist entry is already being processed",
      "CONFLICT"
    );
  }

  await sendNotificationSafe({
    userId: offeredEntry.clientId,
    type: "waitlist_offered",
    message: `${offeredEntry.date} at ${time} proposed by barber. Please confirm or decline in the app.`,
  });

  return populateWaitlistEntry(offeredEntry);
};

/**
 * Client accepts a barber's offered time.
 * Creates an accepted Booking after re-checking overlap.
 */
export const acceptWaitlistOffer = async ({ entryId, clientId }) => {
  const entry = await WaitlistEntry.findOne({
    _id: entryId,
    clientId,
    status: "offered",
  });

  if (!entry) {
    throw createWaitlistActionError(
      "Waitlist offer not found or already processed",
      "NOT_FOUND"
    );
  }

  if (!entry.offeredTime) {
    throw createWaitlistActionError(
      "No offered time on this entry",
      "VALIDATION_ERROR"
    );
  }

  // Atomically claim the offer — only one accept wins
  const claimedEntry = await WaitlistEntry.findOneAndUpdate(
    { _id: entry._id, status: "offered" },
    { $set: { status: "converting" } },
    { returnDocument: "after" }
  );

  if (!claimedEntry) {
    throw createWaitlistActionError(
      "Waitlist offer is already being processed",
      "CONFLICT"
    );
  }

  let booking;
  let convertedEntry;

  try {
    // Re-check overlap before creating Booking
    const context = await getValidatedWaitlistConversionContext(claimedEntry, claimedEntry.offeredTime);

    booking = await Booking.create({
      clientId: claimedEntry.clientId,
      barberId: claimedEntry.barberId,
      salonId: claimedEntry.salonId || null,
      serviceId: claimedEntry.serviceId,
      bookingDate: claimedEntry.date,
      dayKey: getDayKeyFromDate(claimedEntry.date),
      time: claimedEntry.offeredTime,
      duration: context.duration,
      price: context.price,
      serviceName: context.service.name || "",
      status: "accepted",
      createdBy: "barber",
    });

    convertedEntry = await WaitlistEntry.findOneAndUpdate(
      { _id: claimedEntry._id, status: "converting" },
      {
        $set: {
          status: "converted",
          convertedAt: new Date(),
          convertedBooking: booking._id,
        },
      },
      { returnDocument: "after" }
    );

    if (!convertedEntry) {
      // Clean up the booking if we can't mark the waitlist
      await Booking.findByIdAndDelete(booking._id);
      throw createWaitlistActionError(
        "Waitlist entry could not be converted",
        "CONFLICT"
      );
    }
  } catch (error) {
    // If the error is overlap, restore to offered so client can retry
    if (error.message === "This time is no longer available" || error.message === "This time is already booked") {
      await WaitlistEntry.findOneAndUpdate(
        { _id: claimedEntry._id, status: "converting" },
        { $set: { status: "offered" } },
        { returnDocument: "after" }
      );
    } else {
      // For other errors (validation, etc.), restore to offered
      await WaitlistEntry.findOneAndUpdate(
        { _id: claimedEntry._id, status: "converting" },
        { $set: { status: "offered" } },
        { returnDocument: "after" }
      );
    }

    throw error;
  }

  // Notify barber
  const client = await User.findById(convertedEntry.clientId).select("name");
  const clientName = client?.name || "Client";

  await sendNotificationSafe({
    userId: convertedEntry.barberId,
    type: "waitlist_accepted",
    message: `${clientName} confirmed the appointment for ${convertedEntry.date} at ${convertedEntry.offeredTime}.`,
  });

  return { entry: await populateWaitlistEntry(convertedEntry), booking };
};

/**
 * Client declines a barber's offered time.
 * Does NOT create a Booking; marks the entry as rejected.
 */
export const declineWaitlistOffer = async ({ entryId, clientId }) => {
  const entry = await WaitlistEntry.findOne({
    _id: entryId,
    clientId,
    status: "offered",
  });

  if (!entry) {
    throw createWaitlistActionError(
      "Waitlist offer not found or already processed",
      "NOT_FOUND"
    );
  }

  const declinedEntry = await WaitlistEntry.findOneAndUpdate(
    { _id: entry._id, clientId, status: "offered" },
    {
      $set: {
        status: "rejected",
        rejectedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!declinedEntry) {
    throw createWaitlistActionError(
      "Waitlist offer is already being processed",
      "CONFLICT"
    );
  }

  const client = await User.findById(declinedEntry.clientId).select("name");
  const clientName = client?.name || "Client";

  await sendNotificationSafe({
    userId: declinedEntry.barberId,
    type: "waitlist_declined",
    message: `${clientName} declined the proposed appointment time.`,
  });

  return populateWaitlistEntry(declinedEntry);
};

export const approveWaitlistEntry = async ({ entryId, barberId, time }) => {
  const entry = await getActionableWaitlistEntry(entryId, barberId);
  const previousStatus = entry.status;
  const context = await getValidatedWaitlistConversionContext(entry, time);
  const claimedEntry = await WaitlistEntry.findOneAndUpdate(
    {
      _id: entry._id,
      barberId,
      status: { $in: convertibleWaitlistStatuses },
    },
    { $set: { status: "converting" } },
    { returnDocument: "after" }
  );

  if (!claimedEntry) {
    throw createWaitlistActionError(
      "Waitlist entry is already being processed",
      "CONFLICT"
    );
  }

  let booking;
  let convertedEntry;

  try {
    booking = await Booking.create({
      clientId: claimedEntry.clientId,
      barberId: claimedEntry.barberId,
      salonId: claimedEntry.salonId || null,
      serviceId: claimedEntry.serviceId,
      bookingDate: claimedEntry.date,
      dayKey: getDayKeyFromDate(claimedEntry.date),
      time,
      duration: context.duration,
      price: context.price,
      serviceName: context.service.name || "",
      status: "accepted",
      createdBy: "barber",
    });

    convertedEntry = await WaitlistEntry.findOneAndUpdate(
      { _id: claimedEntry._id, status: "converting" },
      {
        $set: {
          status: "converted",
          convertedAt: new Date(),
          convertedBooking: booking._id,
        },
      },
      { returnDocument: "after" }
    );

    if (!convertedEntry) {
      throw createWaitlistActionError(
        "Waitlist entry could not be converted",
        "CONFLICT"
      );
    }
  } catch (error) {
    await WaitlistEntry.findOneAndUpdate(
      { _id: claimedEntry._id, status: "converting" },
      { $set: { status: previousStatus } },
      { returnDocument: "after" }
    );

    throw error;
  }

  await createNotification({
    userId: convertedEntry.clientId,
    type: "waitlist_approved",
    message: `Your appointment is confirmed for ${convertedEntry.date} at ${time}.`,
  });

  return { entry: await populateWaitlistEntry(convertedEntry), booking };
};

export const rejectWaitlistEntry = async ({ entryId, barberId }) => {
  const entry = await getActionableWaitlistEntry(entryId, barberId);
  const rejectedEntry = await WaitlistEntry.findOneAndUpdate(
    {
      _id: entry._id,
      barberId,
      status: { $in: convertibleWaitlistStatuses },
    },
    {
      $set: {
        status: "rejected",
        rejectedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!rejectedEntry) {
    throw createWaitlistActionError(
      "Waitlist entry is already being processed",
      "CONFLICT"
    );
  }

  await sendNotificationSafe({
    userId: rejectedEntry.clientId,
    type: "waitlist_rejected",
    message: "No suitable time is available for your waitlist request.",
  });

  return populateWaitlistEntry(rejectedEntry);
};

/**
 * Get waitlist entries for a client.
 */
export const getClientWaitlistEntries = async (clientId) => {
  return WaitlistEntry.find({ clientId })
    .populate(waitlistDisplayPopulate)
    .sort({ createdAt: -1 });
};

/**
 * Get waitlist entries for a barber.
 */
export const getBarberWaitlistEntries = async (barberId) => {
  return WaitlistEntry.find({ barberId })
    .populate(waitlistDisplayPopulate)
    .sort({ createdAt: -1 });
};

/**
 * Find active waitlist entries matching the given criteria and notify them.
 * Idempotent: will not notify entries already in "notified" status.
 *
 * @param {Object} options
 * @param {string} options.barberId
 * @param {string} [options.salonId]
 * @param {string} options.date      - YYYY-MM-DD format
 * @param {string} [options.serviceId]
 * @param {string} [options.time]    - HH:mm opening slot time
 * @returns {Promise<number>} Number of notifications sent
 */
export const notifyMatchingWaitlistEntries = async ({
  barberId,
  salonId,
  date,
  serviceId,
  time,
}) => {
  if (!barberId || !date) {
    return 0;
  }

  if (date < getArmeniaDateKey(new Date())) {
    return 0;
  }

  // Find active, non-expired entries matching barber and date
  const query = {
    barberId,
    date,
    status: "active",
  };

  const matchingEntries = await WaitlistEntry.find(query);

  if (matchingEntries.length === 0) {
    return 0;
  }

  const slotMinutes = timeToMinutes(time || "");
  const matchingEligibleEntries = matchingEntries.filter((entry) => {
    if (entry.salonId && (!salonId || String(entry.salonId) !== String(salonId))) {
      return false;
    }

    if (serviceId && String(entry.serviceId) !== String(serviceId)) {
      return false;
    }

    const startMinutes = timeToMinutes(entry.preferredStartTime || "");
    const endMinutes = timeToMinutes(entry.preferredEndTime || "");

    if (startMinutes === null && endMinutes === null) {
      return true;
    }

    if (slotMinutes === null) {
      return false;
    }

    if (startMinutes !== null && slotMinutes < startMinutes) {
      return false;
    }

    if (endMinutes !== null && slotMinutes > endMinutes) {
      return false;
    }

    return true;
  });

  if (matchingEligibleEntries.length === 0) {
    return 0;
  }

  // Get barber name for notification message
  const barber = await User.findById(barberId).select("name");
  const barberName = barber?.name || "Barber";

  let notificationsSent = 0;

  for (const entry of matchingEligibleEntries) {
    const notifiedAt = new Date();
    const claimedEntry = await WaitlistEntry.findOneAndUpdate(
      { _id: entry._id, status: "active" },
      {
        $set: {
          status: "notified",
          notifiedAt,
        },
      },
      { returnDocument: "after" }
    );

    if (!claimedEntry) {
      continue;
    }

    // Create notification for the client
    await createNotification({
      userId: claimedEntry.clientId,
      type: "waitlist_slot_available",
      message: `A slot may be available with ${barberName} on ${date}.`,
    });

    notificationsSent += 1;
  }

  return notificationsSent;
};

/**
 * Expire waitlist entries for past dates.
 * Simple helper, no scheduler needed for MVP.
 */
export const expirePastWaitlistEntries = async (now = new Date()) => {
  const todayKey = getArmeniaDateKey(now);

  const expiredEntries = await WaitlistEntry.find({
    status: { $in: OPEN_WAITLIST_STATUSES },
    date: { $lt: todayKey },
  });

  for (const entry of expiredEntries) {
    entry.status = "expired";
    entry.expiredAt = new Date(now);
    await entry.save();
  }

  return expiredEntries;
};
