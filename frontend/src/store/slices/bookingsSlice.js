import { createSlice } from "@reduxjs/toolkit";
import api from "@/shared/api/axios";

const getBookingSignature = (bookings) => {
  const latestUpdatedAt = bookings.reduce((latest, booking) => {
    const value = booking.updatedAt || booking.createdAt || "";

    return value > latest ? value : latest;
  }, "");

  return `${bookings.length}:${latestUpdatedAt}`;
};

const normalizeBooking = (booking) => ({
  ...booking,
  id: booking.id || booking._id,
});

export const fetchBarberBookings = (barberId) => async (dispatch, getState) => {
  const { data } = await api.get(`/bookings/barber/${barberId}`);
  const incomingBookings = data.map(normalizeBooking);
  const currentBookings = getState().bookings.filter(
    (booking) => String(booking.barberId) === String(barberId)
  );

  if (getBookingSignature(currentBookings) === getBookingSignature(incomingBookings)) {
    return incomingBookings;
  }

  dispatch(
    setBookings({
      bookings: incomingBookings,
      scope: { key: "barberId", value: barberId },
    })
  );

  return incomingBookings;
};

export const fetchClientBookings = (clientId) => async (dispatch, getState) => {
  const { data } = await api.get(`/bookings/client/${clientId}`);
  const incomingBookings = data.map(normalizeBooking);
  const currentBookings = getState().bookings.filter(
    (booking) => String(booking.clientId) === String(clientId)
  );

  if (getBookingSignature(currentBookings) === getBookingSignature(incomingBookings)) {
    return incomingBookings;
  }

  dispatch(
    setBookings({
      bookings: incomingBookings,
      scope: { key: "clientId", value: clientId },
    })
  );

  return incomingBookings;
};

const bookingsSlice = createSlice({
  name: "bookings",
  initialState: [],
  reducers: {
    setBookings: (state, action) => {
      const bookings = Array.isArray(action.payload)
        ? action.payload
        : action.payload.bookings;
      const scope = Array.isArray(action.payload) ? null : action.payload.scope;
      const incomingBookings = bookings.map(normalizeBooking);
      const knownIds = new Set(
        incomingBookings.map((booking) => String(booking.id))
      );
      const isInScope = (booking) => {
        if (!scope) return knownIds.has(String(booking.id));

        return String(booking[scope.key]) === String(scope.value);
      };
      const untouchedBookings = state.filter(
        (booking) => !isInScope(booking)
      );

      return [...untouchedBookings, ...incomingBookings];
    },
    addBooking: (state, action) => {
      state.push({
        ...action.payload,
        id: action.payload.id || action.payload._id,
      });
    },
    acceptBooking: (state, action) => {
      const booking = state.find((item) => item.id === action.payload);

      if (booking?.status === "pending") {
        booking.status = "accepted";
      }
    },
    completeBooking: (state, action) => {
      const booking = state.find((item) => item.id === action.payload);

      if (booking?.status === "accepted" || booking?.status === "confirmed") {
        booking.status = "completed";
      }
    },
    cancelBooking: (state, action) => {
      const bookingId =
        typeof action.payload === "object"
          ? action.payload.bookingId || action.payload.id || action.payload._id
          : action.payload;
      const booking = state.find((item) => String(item.id) === String(bookingId));

      if (
        booking?.status === "pending" ||
        booking?.status === "accepted" ||
        booking?.status === "confirmed"
      ) {
        Object.assign(
          booking,
          typeof action.payload === "object" ? action.payload : {},
          {
            id:
              typeof action.payload === "object"
                ? action.payload.id || action.payload._id || booking.id
                : booking.id,
            status: "cancelled",
          }
        );
      }
    },
    updateBooking: (state, action) => {
      const bookingId = action.payload.bookingId || action.payload.id || action.payload._id;
      const booking = state.find((item) => String(item.id) === String(bookingId));

      if (booking) {
        Object.assign(booking, action.payload, {
          id: action.payload.id || action.payload._id || booking.id,
        });
      }
    },
  },
});

export const {
  acceptBooking,
  addBooking,
  cancelBooking,
  completeBooking,
  setBookings,
  updateBooking,
} = bookingsSlice.actions;
export default bookingsSlice.reducer;
