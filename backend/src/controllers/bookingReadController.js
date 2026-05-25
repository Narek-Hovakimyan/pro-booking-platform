import {
  getBarberBookingsForRequester,
  getClientBookingsForRequester,
} from "../services/bookingReadService.js";

export const getClientBookings = async (req, res) => {
  try {
    const bookings = await getClientBookingsForRequester({
      clientId: req.params.clientId,
      requester: req.user,
    });

    return res.json(bookings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch client bookings",
    });
  }
};

export const getBarberBookings = async (req, res) => {
  try {
    const bookings = await getBarberBookingsForRequester({
      barberId: req.params.barberId,
      requester: req.user,
    });

    return res.json(bookings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch barber bookings",
    });
  }
};
