import { useDispatch, useSelector } from "react-redux";

import {
  cancelBooking as cancelBookingAction,
  fetchBarberBookings,
  fetchClientBookings,
} from "@/store/slices/bookingsSlice";
import api from "@/shared/api/axios";

export function useBooking() {
  const dispatch = useDispatch();
  const bookings = useSelector((state) => state.bookings);

  const createBooking = async (bookingData, { onSuccess } = {}) => {
    // If referenceImages (File[]) are included, send as FormData
    const hasFiles = bookingData.files && bookingData.files.length > 0;
    let payload;

    if (hasFiles) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(bookingData)) {
        if (key === "files") continue;
        // Objects must be JSON-stringified for multipart/form-data
        // Otherwise the browser serializes them as "[object Object]"
        if (key === "consultation" || key === "consent") {
          formData.append(key, JSON.stringify(value || {}));
        } else {
          formData.append(key, value);
        }
      }
      for (const file of bookingData.files) {
        formData.append("referenceImages", file);
      }
      const { data } = await api.post("/bookings", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      payload = data;
    } else {
      const { data } = await api.post("/bookings", bookingData);
      payload = data;
    }

    try {
      onSuccess?.(payload);
    } catch {
      // The booking already exists. A UI handoff failure must not make it retryable.
    }

    void Promise.allSettled([
      dispatch(fetchClientBookings(bookingData.clientId)),
      dispatch(fetchBarberBookings(bookingData.barberId)),
    ]);

    return payload;
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
