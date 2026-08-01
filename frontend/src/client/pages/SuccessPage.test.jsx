import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import SuccessPage from "./SuccessPage";

const amdFormatter = new Intl.NumberFormat("hy-AM");
const armenianDateFormatter = new Intl.DateTimeFormat("hy-AM", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function renderSuccessPage({ state, client = { name: "" } } = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/success", state }]}>
      <Routes>
        <Route
          path="/success"
          element={<SuccessPage client={client} resetBooking={vi.fn()} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function hasExactText(text) {
  return (_, node) => node?.textContent === text;
}

describe("SuccessPage", () => {
  it("shows pending wording and appointment details from navigation state", () => {
    renderSuccessPage({
      state: {
        booking: {
          status: "pending",
          serviceName: "Մազերի կտրվածք",
          bookingDate: "2026-08-04",
          time: "14:30",
          duration: 45,
          barber: { id: "barber-1", name: "Աննա" },
          salon: { id: "salon-1", name: "Salon One" },
          serviceOriginalPrice: 12000,
          serviceDiscountAmount: 2000,
          finalPrice: 10000,
        },
      },
    });

    expect(
      screen.getByRole("heading", { name: "Ամրագրման հարցումը ուղարկված է" })
    ).toBeInTheDocument();
    expect(screen.getByText("Մազերի կտրվածք")).toBeInTheDocument();
    expect(screen.getByText("14:30")).toBeInTheDocument();
    expect(screen.getByText("45 րոպե")).toBeInTheDocument();
    expect(screen.getByText("Սպասման մեջ")).toBeInTheDocument();
    expect(screen.getByText("Աննա")).toBeInTheDocument();
    expect(screen.getByText("Salon One")).toBeInTheDocument();
    expect(
      screen.getByText(hasExactText(armenianDateFormatter.format(new Date(2026, 7, 4))))
    ).toBeInTheDocument();
  });

  it("supports raw and populated barber and salon shapes without rendering object strings", () => {
    renderSuccessPage({
      state: {
        booking: {
          status: "accepted",
          service: { id: "service-1", name: "Haircut" },
          bookingDate: "2026-08-02",
          time: "10:00",
          duration: 30,
          barberId: "barber-7",
          barber: "barber-7",
          salonId: "salon-9",
          salon: "salon-9",
          price: 15000,
        },
      },
    });

    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Գրել մասնագետին" })).toHaveAttribute(
      "href",
      "/messages/barber-7"
    );
    expect(screen.queryByText("barber-7")).not.toBeInTheDocument();
    expect(screen.queryByText("salon-9")).not.toBeInTheDocument();
  });

  it("keeps useful success content when reset client state is blank", () => {
    renderSuccessPage({
      client: { name: "" },
      state: {
        booking: {
          status: "accepted",
          serviceName: "Beard trim",
          bookingDate: "2026-08-03",
          time: "12:00",
          duration: 20,
          barber: { id: "barber-2", name: "Karen" },
          finalPrice: 8000,
        },
      },
    });

    expect(
      screen.getByRole("heading", { name: "Ամրագրումը հաստատված է" })
    ).toBeInTheDocument();
    expect(screen.getByText(hasExactText("Beard trim"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Իմ ամրագրումները" })).toHaveAttribute(
      "href",
      "/my-bookings"
    );
  });

  it("omits the message action when no valid barber id is available", () => {
    renderSuccessPage({
      state: {
        booking: {
          status: "accepted",
          serviceName: "Haircut",
          bookingDate: "2026-08-05",
          time: "09:00",
          duration: 25,
          price: 9000,
        },
      },
    });

    expect(
      screen.queryByRole("link", { name: "Գրել մասնագետին" })
    ).not.toBeInTheDocument();
  });

  it("shows a safe fallback when opened without navigation state", () => {
    renderSuccessPage();

    expect(
      screen.getByRole("heading", { name: "Ամրագրման տվյալները հասանելի չեն" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Իմ ամրագրումները" })).toHaveAttribute(
      "href",
      "/my-bookings"
    );
    expect(screen.getByRole("link", { name: "Նոր ամրագրում" })).toHaveAttribute(
      "href",
      "/specialists"
    );
  });

  it("preserves existing price and deposit sections", () => {
    renderSuccessPage({
      state: {
        booking: {
          status: "pending",
          serviceName: "Coloring",
          bookingDate: "2026-08-06",
          time: "16:00",
          duration: 90,
          serviceOriginalPrice: 20000,
          serviceDiscountAmount: 3000,
          voucherDiscount: 2000,
          finalPrice: 15000,
        },
        payment: {
          paymentStatus: "pending",
          checkoutUrl: "https://payments.example/checkout",
        },
      },
    });

    expect(screen.getByText("Price summary")).toBeInTheDocument();
    expect(
      screen.getByText(hasExactText(`${amdFormatter.format(20000)} դրամ`))
    ).toBeInTheDocument();
    expect(
      screen.getByText(hasExactText(`-${amdFormatter.format(3000)} դրամ`))
    ).toBeInTheDocument();
    expect(
      screen.getByText(hasExactText(`-${amdFormatter.format(2000)} դրամ`))
    ).toBeInTheDocument();
    expect(
      screen.getByText(hasExactText(`${amdFormatter.format(15000)} դրամ`))
    ).toBeInTheDocument();
    expect(screen.getByText("Deposit required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pay deposit" })).toHaveAttribute(
      "href",
      "https://payments.example/checkout"
    );
  });
});
