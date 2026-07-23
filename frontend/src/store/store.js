import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";

import authReducer from "./slices/authSlice";
import {
  expireAuthSession,
  loginUser,
  logoutUser,
  registerUser,
  restoreAuthSession,
} from "./slices/authSlice";
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
import subscriptionReducer, { clearSubscription } from "./slices/subscriptionSlice";
import usersReducer from "./slices/usersSlice";
import { initializeAccessToken, setAccessToken, clearAccessToken } from "@/shared/auth/accessTokenStore";
import { configureAuthSessionHandlers } from "@/shared/api/authSession";

const listenerMiddleware = createListenerMiddleware();
const preloadedState = loadState();

initializeAccessToken(preloadedState?.auth?.token);

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
    setAccessToken(action.payload?.token);
    listenerApi.dispatch(
      addNotification({ message: "Logged in successfully", type: "success" })
    );
  },
});

listenerMiddleware.startListening({
  actionCreator: registerUser,
  effect: async (action) => {
    setAccessToken(action.payload?.token);
  },
});

listenerMiddleware.startListening({
  actionCreator: restoreAuthSession,
  effect: async (action) => {
    setAccessToken(action.payload?.token);
  },
});

listenerMiddleware.startListening({
  actionCreator: logoutUser,
  effect: async (action, listenerApi) => {
    clearAccessToken();
    listenerApi.dispatch(clearSubscription());
    listenerApi.dispatch(
      addNotification({ message: "Logged out", type: "info" })
    );
  },
});

listenerMiddleware.startListening({
  actionCreator: expireAuthSession,
  effect: async () => {
    clearAccessToken();
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
    subscription: subscriptionReducer,
    users: usersReducer,
  },
  preloadedState,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

configureAuthSessionHandlers({
  onRefresh: (session) => {
    store.dispatch(restoreAuthSession(session));
  },
  onExpire: () => {
    store.dispatch(expireAuthSession());
  },
});

store.subscribe(() => {
  saveState(store.getState());
});
