import Booking from "../models/Booking.js";
import { getBookingEndDateTime } from "../utils/bookingDateTime.js";

export class BookingOutcomeError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "BookingOutcomeError";
    this.statusCode = statusCode;
  }
}

const outcomeConfigs = {
  noShow: {
    assignedBarberMessage: "Only the assigned barber can mark no-show",
    acceptedStatusMessage: "Only accepted bookings can be marked as no-show",
    duplicateField: "noShowMarkedAt",
    duplicateMessage: "Booking already marked as no-show",
    futureMessage: "Cannot mark no-show for a future booking",
    claimFailureMessage: "Booking could not be marked as no-show",
    status: "no_show",
    markedAtField: "noShowMarkedAt",
    markedByField: "noShowMarkedBy",
  },
  lateCancel: {
    assignedBarberMessage: "Only the assigned barber can mark late cancellation",
    acceptedStatusMessage: "Only accepted bookings can be marked as late cancellation",
    duplicateField: "lateCancelledAt",
    duplicateMessage: "Booking already marked as late cancellation",
    futureMessage: "Cannot mark late cancellation for a future booking",
    claimFailureMessage: "Booking could not be marked as late cancellation",
    status: "late_cancelled",
    markedAtField: "lateCancelledAt",
    markedByField: "lateCancelledBy",
  },
};

const assertPastAcceptedBookingForBarber = ({ booking, requester, config, now }) => {
  if (
    requester?.role !== "barber" ||
    String(requester._id) !== String(booking.barberId)
  ) {
    throw new BookingOutcomeError(403, config.assignedBarberMessage);
  }

  if (booking.status !== "accepted") {
    throw new BookingOutcomeError(400, config.acceptedStatusMessage);
  }

  if (booking[config.duplicateField]) {
    throw new BookingOutcomeError(400, config.duplicateMessage);
  }

  const bookingEnd = getBookingEndDateTime(booking);

  if (!bookingEnd) {
    throw new BookingOutcomeError(400, "Booking date or time is invalid");
  }

  if (bookingEnd > now) {
    throw new BookingOutcomeError(400, config.futureMessage);
  }
};

const markBookingOutcome = async ({ bookingId, requester, config, now = new Date() }) => {
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw new BookingOutcomeError(404, "Booking not found");
  }

  assertPastAcceptedBookingForBarber({ booking, requester, config, now });

  const updatedBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      barberId: booking.barberId,
      status: "accepted",
    },
    {
      $set: {
        status: config.status,
        [config.markedAtField]: new Date(),
        [config.markedByField]: requester._id,
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedBooking) {
    throw new BookingOutcomeError(400, config.claimFailureMessage);
  }

  return updatedBooking;
};

export const markBookingNoShow = ({ bookingId, requester }) =>
  markBookingOutcome({
    bookingId,
    requester,
    config: outcomeConfigs.noShow,
  });

export const markBookingLateCancel = ({ bookingId, requester }) =>
  markBookingOutcome({
    bookingId,
    requester,
    config: outcomeConfigs.lateCancel,
  });
