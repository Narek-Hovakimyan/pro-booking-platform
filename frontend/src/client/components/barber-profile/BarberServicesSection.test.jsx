import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import BarberServicesSection from "./BarberServicesSection";

function LocationProbe() {
  const location = useLocation();

  return (
    <div data-testid="location-probe">
      {JSON.stringify({
        pathname: location.pathname,
        state: location.state,
      })}
    </div>
  );
}

function renderSection(props) {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<BarberServicesSection {...props} />} />
        <Route path="/booking/:barberId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function expectNoUnsafeCurrency(container) {
  expect(container).not.toHaveTextContent("դրամ");
  expect(container).not.toHaveTextContent(/AMD\s+AMD/u);
  expect(container).not.toHaveTextContent(/NaN AMD/u);
}

describe("BarberServicesSection", () => {
  it("formats service prices in AMD, supports numeric strings and zero, and keeps booking state", async () => {
    const user = userEvent.setup();
    const barber = { id: "barber-1", name: "Anna" };
    const { container } = renderSection({
      barber,
      barberServices: [
        {
          id: "service-1",
          category: "haircut",
          description: "Classic shape-up",
          duration: 45,
          name: "Cut",
          price: 5000,
        },
        {
          id: "service-2",
          category: "styling",
          duration: 30,
          name: "Style",
          price: "0",
        },
      ],
      profileBarberId: "barber-1",
    });

    expect(screen.getByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("0 AMD")).toBeInTheDocument();
    expect(screen.getAllByText("Haircut").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Styling").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Classic shape-up")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("2 services")).toBeInTheDocument();

    await user.click(screen.getAllByRole("link", { name: "Book" })[0]);
    expect(screen.getByTestId("location-probe")).toHaveTextContent('"pathname":"/booking/barber-1"');
    expect(screen.getByTestId("location-probe")).toHaveTextContent('"id":"barber-1"');
    expectNoUnsafeCurrency(container);
  });

  it("renders missing, empty, invalid, negative, and non-finite prices safely", () => {
    const { container } = renderSection({
      barber: { id: "barber-1", name: "Anna" },
      barberServices: [
        { id: "service-1", category: "haircut", name: "Missing" },
        { id: "service-2", category: "haircut", name: "Empty", price: "" },
        { id: "service-3", category: "haircut", name: "Invalid", price: "oops" },
        { id: "service-4", category: "haircut", name: "Negative", price: -50 },
        { id: "service-5", category: "haircut", name: "Infinite", price: Infinity },
      ],
      profileBarberId: "barber-1",
    });

    expect(screen.getAllByText("0 AMD")).toHaveLength(5);
    expectNoUnsafeCurrency(container);
  });

  it("preserves the empty state when no services are available", () => {
    renderSection({
      barber: { id: "barber-1", name: "Anna" },
      barberServices: [],
      profileBarberId: "barber-1",
    });

    expect(screen.getByText("No active services yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Check back later for available services.")
    ).toBeInTheDocument();
  });
});
