import Booking from "../models/Booking.js";
import { serializeAvailabilityBooking } from "../utils/bookingUtils.js";

export class BookingReadError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "BookingReadError";
    this.statusCode = statusCode;
  }
}

export const getClientBookingsForRequester = async ({ clientId, requester }) => {
  if (String(requester._id) !== String(clientId)) {
    throw new BookingReadError(403, "You can fetch only your own bookings");
  }

  return Booking.find({ clientId }).select("-treatmentRecord");
};

export const getBarberBookingsForRequester = async ({ barberId, requester }) => {
  const isOwnBarberCalendar =
    requester?.role === "barber" && String(requester._id) === String(barberId);

  if (requester?.role === "barber" && !isOwnBarberCalendar) {
    throw new BookingReadError(403, "You can fetch only your own bookings");
  }

  const bookings = await Booking.find({ barberId });

  if (isOwnBarberCalendar) {
    return bookings;
  }

  return bookings.map((booking) =>
    serializeAvailabilityBooking(booking, requester?._id)
  );
};
