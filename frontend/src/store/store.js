import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";

import authReducer from "./slices/authSlice";
import { loginUser, logoutUser } from "./slices/authSlice";
import bookingsReducer from "./slices/bookingsSlice";
import {
  acceptBooking,
  addBooking,
  cancelBooking,
  completeBooking,
  updateBooking,
} from "./slices/bookingsSlice";
import favoritesReducer from "./slices/favoritesSlice";
import { loadState, saveState } from "./localStorage";
import notificationsReducer, {
  addNotification,
} from "./slices/notificationsSlice";
import reviewsReducer from "./slices/reviewsSlice";
import scheduleReducer from "./slices/scheduleSlice";
import servicesReducer from "./slices/servicesSlice";
import usersReducer from "./slices/usersSlice";

const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  actionCreator: acceptBooking,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      addNotification({ message: "Booking accepted", type: "success" })
    );
  },
});

listenerMiddleware.startListening({
  actionCreator: addBooking,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      addNotification({ message: "Booking created", type: "success" })
    );
  },
});

listenerMiddleware.startListening({
  actionCreator: cancelBooking,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      addNotification({ message: "Booking cancelled", type: "info" })
    );
  },
});

listenerMiddleware.startListening({
  actionCreator: completeBooking,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      addNotification({ message: "Service completed", type: "success" })
    );
  },
});

listenerMiddleware.startListening({
  actionCreator: updateBooking,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      addNotification({
        message: "Booking time updated successfully",
        type: "success",
      })
    );
  },
});

listenerMiddleware.startListening({
  actionCreator: loginUser,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      addNotification({ message: "Logged in successfully", type: "success" })
    );
  },
});

listenerMiddleware.startListening({
  actionCreator: logoutUser,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      addNotification({ message: "Logged out", type: "info" })
    );
  },
});

export const store = configureStore({
  reducer: {
    auth: authReducer,
    bookings: bookingsReducer,
    favorites: favoritesReducer,
    notifications: notificationsReducer,
    reviews: reviewsReducer,
    schedule: scheduleReducer,
    services: servicesReducer,
    users: usersReducer,
  },
  preloadedState: loadState(),
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

store.subscribe(() => {
  saveState(store.getState());
});
