import { getIO } from "../socket.js";
import User from "../models/User.js";
import {
  formatCancelledMessage,
  formatRejectedMessage,
  formatStatusMessage,
} from "../utils/bookingUtils.js";
import { createNotification } from "./notificationService.js";
import { notifyMatchingWaitlistEntries } from "./waitlistService.js";

let getIOForBookingSideEffects = getIO;
let notifyMatchingWaitlistEntriesForBookingSideEffects = notifyMatchingWaitlistEntries;
let createNotificationForBookingSideEffects = createNotification;

const getClientName = async (booking, fallbackUser) => {
  if (booking.clientName) return booking.clientName;
  if (fallbackUser?.name) return fallbackUser.name;

  const client = await User.findById(booking.clientId).select("name");
  return client?.name || "Client";
};

const getBarberName = async (barberId) => {
  const barber = await User.findById(barberId).select("name");
  return barber?.name || "Barber";
};

export const emitBookingUpdated = (booking, action = "updated") => {
  try {
    const io = getIOForBookingSideEffects();
    if (!io) return;

    const payload = { booking, action };

    io.to(`user:${booking.barberId}`).emit("bookingUpdated", payload);
    if (booking.clientId) {
      io.to(`user:${booking.clientId}`).emit("bookingUpdated", payload);
    }
  } catch {
    // Socket emit is non-critical
  }
};

export const notifyWaitlistForReleasedBookingSlot = (booking) => {
  notifyMatchingWaitlistEntriesForBookingSideEffects({
    barberId: booking.barberId,
    salonId: booking.salonId,
    date: booking.bookingDate,
    serviceId: booking.serviceId,
    time: booking.time,
  }).catch((err) => {
    console.error("Waitlist notification error:", err.message);
  });
};

export const notifyUsersForBookingStatusChange = async ({
  booking,
  status,
  requester,
  isBookingClient,
}) => {
  if (status === "accepted" && booking.clientId) {
    const barberName = await getBarberName(booking.barberId);

    await createNotificationForBookingSideEffects({
      userId: booking.clientId,
      type: "booking_accepted",
      message: formatStatusMessage(barberName, booking, "accepted"),
    });
  }

  if (status === "rejected" && booking.clientId) {
    const barberName = await getBarberName(booking.barberId);

    await createNotificationForBookingSideEffects({
      userId: booking.clientId,
      type: "booking_rejected",
      message: formatRejectedMessage(barberName, booking),
    });
  }

  if (status === "cancelled" && isBookingClient) {
    const notificationClientName = await getClientName(booking, requester);

    await createNotificationForBookingSideEffects({
      userId: booking.barberId,
      type: "booking_cancelled",
      message: formatCancelledMessage(notificationClientName, booking),
    });
  }
};

export const __bookingSideEffectsTestHooks = {
  setGetIO(nextGetIO) {
    getIOForBookingSideEffects = nextGetIO || getIO;
  },
  resetGetIO() {
    getIOForBookingSideEffects = getIO;
  },
  setNotifyMatchingWaitlistEntries(nextNotifyMatchingWaitlistEntries) {
    notifyMatchingWaitlistEntriesForBookingSideEffects =
      nextNotifyMatchingWaitlistEntries || notifyMatchingWaitlistEntries;
  },
  resetNotifyMatchingWaitlistEntries() {
    notifyMatchingWaitlistEntriesForBookingSideEffects = notifyMatchingWaitlistEntries;
  },
  setCreateNotification(nextCreateNotification) {
    createNotificationForBookingSideEffects = nextCreateNotification || createNotification;
  },
  resetCreateNotification() {
    createNotificationForBookingSideEffects = createNotification;
  },
};
