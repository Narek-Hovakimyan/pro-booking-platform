import Booking from "../../models/Booking.js";
import {
  getPendingBookingActionableFilter,
  isPendingBookingActionable,
} from "./bookingExpiration.js";
import {
  serializeAvailabilityBooking,
  serializeBookingForResponse,
} from "../../utils/bookingUtils.js";

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

  const bookings = await Booking.find({ clientId }).select("-treatmentRecord");
  return bookings.map((booking) => serializeBookingForResponse(booking, requester));
};

export const getBarberBookingsForRequester = async ({ barberId, requester, now = new Date() }) => {
  const isOwnBarberCalendar =
    requester?.role === "barber" && String(requester._id) === String(barberId);

  if (requester?.role === "barber" && !isOwnBarberCalendar) {
    throw new BookingReadError(403, "You can fetch only your own bookings");
  }

  const actionablePendingFilter = getPendingBookingActionableFilter(now);
  const bookings = (await Booking.find({
    barberId,
    $or: [
      { status: { $ne: "pending" } },
      { status: "pending", $or: actionablePendingFilter.$or },
    ],
  })).filter((booking) => isPendingBookingActionable(booking, now));

  if (isOwnBarberCalendar) {
    return bookings.map((booking) => serializeBookingForResponse(booking, requester));
  }

  return bookings.map((booking) =>
    serializeAvailabilityBooking(booking, requester?._id)
  );
};
