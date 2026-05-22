import { useDispatch, useSelector } from "react-redux";

import {
  addBooking,
  cancelBooking as cancelBookingAction,
  fetchBarberBookings,
  fetchClientBookings,
} from "@/store/slices/bookingsSlice";
import api from "@/shared/api/axios";

export function useBooking() {
  const dispatch = useDispatch();
  const bookings = useSelector((state) => state.bookings);

  const createBooking = async (bookingData) => {
    const { data } = await api.post("/bookings", bookingData);
    const action = dispatch(addBooking(data));
    await Promise.all([
      dispatch(fetchClientBookings(bookingData.clientId)),
      dispatch(fetchBarberBookings(bookingData.barberId)),
    ]);

    return action.payload;
  };

  const cancelBooking = async (bookingId, clientId, cancelReason = "") => {
    const { data } = await api.put(`/bookings/${bookingId}`, {
      status: "cancelled",
      cancelReason,
    });
    dispatch(cancelBookingAction(data));

    if (clientId) {
      await dispatch(fetchClientBookings(clientId));
    }
  };

  return {
    bookings,
    createBooking,
    cancelBooking,
  };
}
