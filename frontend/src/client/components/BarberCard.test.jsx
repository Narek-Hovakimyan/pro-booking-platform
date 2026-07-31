import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import BarberCard from "./BarberCard";

function renderBarberCard(barber, props = {}) {
  return render(
    <MemoryRouter initialEntries={["/specialists"]}>
      <Routes>
        <Route
          path="/specialists"
          element={<BarberCard barber={barber} {...props} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

const activeService = {
  barberId: "barber-1",
  active: true,
  id: "service-1",
  name: "Haircut",
};

describe("BarberCard booking salon-context navigation", () => {
  it("scopes a single approved salon barber to that salon", () => {
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
  });

  it("resolves a raw salon entry id without an embedded salon object", () => {
    renderBarberCard(
      {
        id: "barber-1",
        salons: [{ status: "approved", id: "raw-salon" }],
      },
      { services: [activeService] }
    );

    expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute(
      "href",
      "/booking/barber-1?salonId=raw-salon"
    );
  });

  it("explicit bookingSalon context always wins and preserves its exact salonId", () => {
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

    expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute(
      "href",
      "/booking/barber-1?salonId=salon-2"
    );
  });

  it("does not auto-select a salon when a barber has multiple salons", () => {
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

    expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute(
      "href",
      "/booking/barber-1"
    );
  });

  it("keeps independent specialists on unscoped booking", () => {
    renderBarberCard(
      { id: "barber-1", salons: [] },
      { services: [activeService] }
    );

    expect(screen.getByRole("link", { name: "Book now" })).toHaveAttribute(
      "href",
      "/booking/barber-1"
    );
  });
});