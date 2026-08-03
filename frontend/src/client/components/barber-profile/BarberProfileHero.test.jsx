import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import BarberProfileHero from "./BarberProfileHero";

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

function renderHero(props = {}) {
  const toggleFavorite = props.toggleFavorite ?? vi.fn();
  const result = render(
    <MemoryRouter initialEntries={["/specialists/barber-1/profile"]}>
      <Routes>
        <Route
          path="/specialists/barber-1/profile"
          element={
            <BarberProfileHero
              barber={{
                barberType: "men",
                bio: "Sharp fades and clean lines.",
                city: "Yerevan",
                id: "barber-1",
                name: "Aram",
                profession: "barber",
                ...props.barber,
              }}
              currentUser={props.currentUser ?? { id: "client-1" }}
              isFavorite={props.isFavorite ?? false}
              profileBarberId="barber-1"
              reviewStats={props.reviewStats ?? { average: 4.8, count: 12 }}
              salonId={props.salonId ?? "salon-1"}
              salonName={props.salonName ?? "Main Salon"}
              salonRating={props.salonRating ?? 4.7}
              showSalonLink={props.showSalonLink ?? true}
              startingPrice={props.startingPrice}
              toggleFavorite={toggleFavorite}
              totalCerts={props.totalCerts ?? 2}
            />
          }
        />
        <Route path="/booking/:barberId" element={<LocationProbe />} />
        <Route path="/messages/:barberId" element={<LocationProbe />} />
        <Route path="/salons/:salonId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

  return { ...result, toggleFavorite };
}

function expectNoUnsafeCurrency(container) {
  expect(container).not.toHaveTextContent("դրամ");
  expect(container).not.toHaveTextContent(/AMD\s+AMD/u);
  expect(container).not.toHaveTextContent(/NaN AMD/u);
}

describe("BarberProfileHero", () => {
  it("formats valid numeric starting prices as AMD and preserves favorite, booking, message, and salon links", async () => {
    const user = userEvent.setup();
    const { container, toggleFavorite } = renderHero({ startingPrice: 5000 });

    expect(screen.getByText("From 5,000 AMD")).toBeInTheDocument();
    expect(container).toHaveTextContent("Men's barber");
    expect(screen.getByText("2 certifications")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Main Salon" })).toHaveAttribute(
      "href",
      "/salons/salon-1"
    );
    expect(
      screen.getByRole("link", { name: "Book appointment" })
    ).toHaveAttribute("href", "/booking/barber-1");
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute(
      "href",
      "/messages/barber-1"
    );

    await user.click(screen.getByRole("button", { name: "Add to favorites" }));
    expect(toggleFavorite).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("link", { name: "Book appointment" }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      '"pathname":"/booking/barber-1"'
    );
    expect(screen.getByTestId("location-probe")).toHaveTextContent('"id":"barber-1"');
    expectNoUnsafeCurrency(container);
  });

  it("supports numeric strings and valid zero without falling back to no services", () => {
    const numericStringRender = renderHero({ startingPrice: "5000" });
    expect(screen.getByText("From 5,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText("No active services")).not.toBeInTheDocument();
    expectNoUnsafeCurrency(numericStringRender.container);

    const zeroRender = renderHero({ startingPrice: 0 });
    expect(screen.getByText("From 0 AMD")).toBeInTheDocument();
    expect(screen.queryByText("No active services")).not.toBeInTheDocument();
    expectNoUnsafeCurrency(zeroRender.container);
  });

  it("shows the existing no-services fallback for null, empty, invalid, negative, and non-finite prices", () => {
    const unusableValues = [null, undefined, "", "oops", -10, Infinity];

    for (const value of unusableValues) {
      const { container, unmount } = renderHero({ startingPrice: value });
      expect(screen.getByText("No active services")).toBeInTheDocument();
      expect(screen.queryByText(/From .* AMD/u)).not.toBeInTheDocument();
      expectNoUnsafeCurrency(container);
      unmount();
    }
  });
});
