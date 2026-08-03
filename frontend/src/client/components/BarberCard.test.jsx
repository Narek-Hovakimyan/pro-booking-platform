import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import BarberCard from "./BarberCard";

function LocationProbe() {
  const location = useLocation();

  return (
    <div data-testid="location-probe">
      {JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        state: location.state,
      })}
    </div>
  );
}

function renderBarberCard(barber, props = {}) {
  return render(
    <MemoryRouter initialEntries={["/specialists"]}>
      <Routes>
        <Route
          path="/specialists"
          element={<BarberCard barber={barber} {...props} />}
        />
        <Route path="/booking/:barberId" element={<LocationProbe />} />
        <Route path="/messages/:barberId" element={<LocationProbe />} />
        <Route path="/specialists/:barberId/profile" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function expectNoUnsafeCurrency(container) {
  expect(container).not.toHaveTextContent("դրամ");
  expect(container).not.toHaveTextContent(/AMD\s+AMD/u);
  expect(container).not.toHaveTextContent(/NaN AMD/u);
}

const activeService = {
  active: true,
  barberId: "barber-1",
  id: "service-1",
  name: "Haircut",
};

describe("BarberCard", () => {
  it("scopes booking links for single, raw, explicit, multi-salon, and independent cases", () => {
    renderBarberCard(
      {
        id: "barber-1",
        salons: [
          { status: "approved", salon: { id: "salon-1", name: "Main Salon" } },
        ],
      },
      { services: [activeService] }
    );
    expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute(
      "href",
      "/booking/barber-1?salonId=salon-1"
    );

    renderBarberCard(
      {
        id: "barber-1",
        salons: [{ status: "approved", id: "raw-salon" }],
      },
      { services: [activeService] }
    );
    expect(screen.getAllByRole("link", { name: "Book now" })[1]).toHaveAttribute(
      "href",
      "/booking/barber-1?salonId=raw-salon"
    );

    renderBarberCard(
      {
        id: "barber-1",
        salons: [
          { status: "approved", salon: { id: "salon-1", name: "Salon One" } },
          { status: "approved", salon: { id: "salon-2", name: "Salon Two" } },
        ],
      },
      {
        bookingSalon: { id: "salon-2", name: "Salon Two" },
        services: [activeService],
      }
    );
    expect(screen.getAllByRole("link", { name: "Book now" })[2]).toHaveAttribute(
      "href",
      "/booking/barber-1?salonId=salon-2"
    );

    renderBarberCard(
      {
        id: "barber-1",
        salons: [
          { status: "approved", salon: { id: "salon-1", name: "Salon One" } },
          { status: "approved", salon: { id: "salon-2", name: "Salon Two" } },
        ],
      },
      { services: [activeService] }
    );
    expect(screen.getAllByRole("link", { name: "Book now" })[3]).toHaveAttribute(
      "href",
      "/booking/barber-1"
    );

    renderBarberCard(
      { id: "barber-1", salons: [] },
      { services: [activeService] }
    );
    expect(screen.getAllByRole("link", { name: "Book now" })[4]).toHaveAttribute(
      "href",
      "/booking/barber-1"
    );
  });

  it("formats the minimum active-service starting price in AMD and excludes unsafe prices", () => {
    const { container } = renderBarberCard(
      {
        id: "barber-1",
        name: "Anna",
      },
      {
        services: [
          { ...activeService, id: "service-1", name: "Cut", price: 5000 },
          { ...activeService, id: "service-2", name: "Color", price: "3000" },
          { ...activeService, id: "service-3", name: "Polish", price: "" },
          { ...activeService, id: "service-4", name: "Style", price: -100 },
          { ...activeService, id: "service-5", name: "Wash", price: Infinity },
          { ...activeService, id: "service-6", name: "Trim", active: false, price: 1000 },
          { ...activeService, id: "service-7", barberId: "barber-2", price: 2000 },
        ],
      }
    );

    expect(screen.getByText("3,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("starting price")).toBeInTheDocument();
    expect(screen.getByLabelText("Services")).toHaveTextContent("Cut");
    expect(screen.getByLabelText("Services")).toHaveTextContent("Color");
    expect(screen.getByLabelText("Services")).toHaveTextContent("Polish");
    expect(screen.getByLabelText("Services")).not.toHaveTextContent("Trim");
    expectNoUnsafeCurrency(container);
  });

  it("supports numeric-string and zero prices and preserves profile, booking, and message destinations", async () => {
    const user = userEvent.setup();
    const barber = {
      id: "barber-1",
      name: "Anna",
      salons: [
        { status: "approved", salon: { id: "salon-1", name: "Main Salon" } },
      ],
    };
    const { container } = renderBarberCard(barber, {
      services: [
        { ...activeService, id: "service-1", name: "Cut", price: "6500" },
        { ...activeService, id: "service-2", name: "Buzz", price: 0 },
      ],
      favorites: [{ barberId: "barber-2", clientId: "client-1" }],
      currentUser: { id: "client-1" },
      onToggleFavorite: vi.fn(),
    });

    expect(screen.getByText("0 AMD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute(
      "href",
      "/specialists/barber-1/profile"
    );
    expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute(
      "href",
      "/booking/barber-1?salonId=salon-1"
    );
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute(
      "href",
      "/messages/barber-1"
    );

    await user.click(screen.getByRole("link", { name: "Book now" }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent('"pathname":"/booking/barber-1"');
    expect(screen.getByTestId("location-probe")).toHaveTextContent('"search":"?salonId=salon-1"');
    expect(screen.getByTestId("location-probe")).toHaveTextContent('"selectedSalonId":"salon-1"');
    expect(screen.getByTestId("location-probe")).toHaveTextContent('"id":"barber-1"');
    expectNoUnsafeCurrency(container);
  });

  it("shows a disabled booking button when no active services exist", () => {
    renderBarberCard(
      { id: "barber-1", name: "Anna" },
      { services: [{ ...activeService, active: false, price: 5000 }] }
    );

    expect(screen.getAllByText("No services yet").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "No services yet" })).toBeDisabled();
  });
});
