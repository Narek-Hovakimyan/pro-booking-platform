import { useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "./renderWithProviders";

function SmokeView() {
  const location = useLocation();
  const userName = useSelector((state) => state.auth.currentUser?.name);

  return (
    <main>
      <h1>Test foundation</h1>
      <p data-testid="user-name">{userName}</p>
      <p data-testid="route">{location.pathname}</p>
      <Link to="/next">Next route</Link>
    </main>
  );
}

test("renders JSX with Redux state and navigates in MemoryRouter", async () => {
  const user = userEvent.setup();
  const { store } = renderWithProviders(<SmokeView />, {
    initialEntries: ["/smoke"],
    preloadedState: {
      auth: {
        currentUser: { name: "Test Barber" },
        token: null,
        isAuthenticated: false,
      },
    },
  });

  expect(document.body).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Test foundation" })).toBeVisible();
  expect(screen.getByTestId("user-name")).toHaveTextContent("Test Barber");
  expect(screen.getByTestId("route")).toHaveTextContent("/smoke");
  expect(store.getState().auth.currentUser.name).toBe("Test Barber");

  await user.click(screen.getByRole("link", { name: "Next route" }));
  expect(screen.getByTestId("route")).toHaveTextContent("/next");
});
