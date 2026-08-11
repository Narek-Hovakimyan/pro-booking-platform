import { getIO } from "../../socket.js";
import User from "../../models/User.js";
import {
  formatCancelledMessage,
  formatRejectedMessage,
  formatStatusMessage,
  serializeBookingForResponse,
} from "../../utils/bookingUtils.js";
import { createNotification } from "../notification/notificationService.js";
import { notifyMatchingWaitlistEntries } from "../waitlist/waitlistService.js";
import { getLogger } from "../../config/logger.js";

let getIOForBookingSideEffects = getIO;
let notifyMatchingWaitlistEntriesForBookingSideEffects = notifyMatchingWaitlistEntries;
let createNotificationForBookingSideEffects = createNotification;
let getLoggerForBookingSideEffects = getLogger;

const MONGO_OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const getSafeIdentifier = (value) => {
  if (typeof value !== "string") return undefined;
  return MONGO_OBJECT_ID_REGEX.test(value) ? value : undefined;
};

const getSafeSocketErrorMetadata = (err) => {
  if (!err || typeof err !== "object") return undefined;
  return { name: "Error" };
};

const logBookingSocketFailure = ({ booking, userId, err }) => {
  try {
    const logger = getLoggerForBookingSideEffects?.();
    logger?.warn?.(
      {
        event: "booking.socket_emit_failed",
        operation: "emitBookingUpdated",
        bookingId: getSafeIdentifier(booking?._id),
        barberId: getSafeIdentifier(booking?.barberId),
        salonId: getSafeIdentifier(booking?.salonId),
        userId: getSafeIdentifier(userId),
        error: getSafeSocketErrorMetadata(err),
      },
      "booking.socket_emit_failed"
    );
  } catch {
    // Booking socket fan-out is non-critical and logging must stay best-effort.
  }
};

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

const getBookingNotificationData = (booking) =>
  booking?._id ? { bookingId: booking._id } : undefined;

export const emitBookingUpdated = (booking, action = "updated") => {
  let recipientUserId = booking?.barberId;

  try {
    const io = getIOForBookingSideEffects();
    if (!io) return;

    const barberPayload = {
      booking: serializeBookingForResponse(booking, {
        _id: booking.barberId,
        role: "barber",
      }),
      action,
    };

    io.to(`user:${booking.barberId}`).emit("bookingUpdated", barberPayload);
    if (booking.clientId) {
      recipientUserId = booking.clientId;
      const clientPayload = {
        booking: serializeBookingForResponse(booking, {
          _id: booking.clientId,
          role: "client",
        }),
        action,
      };

      io.to(`user:${booking.clientId}`).emit("bookingUpdated", clientPayload);
    }
  } catch (err) {
    logBookingSocketFailure({ booking, userId: recipientUserId, err });
  }
};

export const notifyWaitlistForReleasedBookingSlot = (booking, requestLogger) => {
  notifyMatchingWaitlistEntriesForBookingSideEffects({
    barberId: booking.barberId,
    salonId: booking.salonId,
    date: booking.bookingDate,
    serviceId: booking.serviceId,
    time: booking.time,
  }).catch((err) => {
    try {
      const logger = requestLogger || getLoggerForBookingSideEffects?.();
      logger?.warn?.(
        {
          err,
          event: "booking.waitlist_notification_failed",
          bookingId: booking._id,
          barberId: booking.barberId,
          salonId: booking.salonId || undefined,
          serviceId: booking.serviceId,
        },
        "booking.waitlist_notification_failed"
      );
    } catch {
      // Waitlist fan-out is non-critical and logging must stay best-effort.
    }
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
      data: getBookingNotificationData(booking),
    });
  }

  if (status === "rejected" && booking.clientId) {
    const barberName = await getBarberName(booking.barberId);

    await createNotificationForBookingSideEffects({
      userId: booking.clientId,
      type: "booking_rejected",
      message: formatRejectedMessage(barberName, booking),
      data: getBookingNotificationData(booking),
    });
  }

  if (status === "cancelled" && isBookingClient) {
    const notificationClientName = await getClientName(booking, requester);

    await createNotificationForBookingSideEffects({
      userId: booking.barberId,
      type: "booking_cancelled",
      message: formatCancelledMessage(notificationClientName, booking),
      data: getBookingNotificationData(booking),
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
  setLogger(nextLogger) {
    getLoggerForBookingSideEffects = () => nextLogger;
  },
  resetLogger() {
    getLoggerForBookingSideEffects = getLogger;
  },
};
