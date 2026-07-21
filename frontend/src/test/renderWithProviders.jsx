import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import authReducer from "@/store/slices/authSlice";
import bookingsReducer from "@/store/slices/bookingsSlice";
import favoritesReducer from "@/store/slices/favoritesSlice";
import notificationsReducer from "@/store/slices/notificationsSlice";
import reviewsReducer from "@/store/slices/reviewsSlice";
import scheduleReducer from "@/store/slices/scheduleSlice";
import servicesReducer from "@/store/slices/servicesSlice";
import subscriptionReducer from "@/store/slices/subscriptionSlice";
import usersReducer from "@/store/slices/usersSlice";

const reducers = {
  auth: authReducer,
  bookings: bookingsReducer,
  favorites: favoritesReducer,
  notifications: notificationsReducer,
  reviews: reviewsReducer,
  schedule: scheduleReducer,
  services: servicesReducer,
  subscription: subscriptionReducer,
  users: usersReducer,
};

export function renderWithProviders(
  ui,
  {
    initialEntries = ["/"],
    initialIndex,
    preloadedState,
    store = configureStore({ reducer: reducers, preloadedState }),
    ...renderOptions
  } = {}
) {
  const routerProps = { initialEntries };
  if (initialIndex !== undefined) routerProps.initialIndex = initialIndex;

  function Wrapper({ children }) {
    return (
      <Provider store={store}>
        <MemoryRouter {...routerProps}>{children}</MemoryRouter>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
