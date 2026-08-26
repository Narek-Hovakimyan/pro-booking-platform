import { Children } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BookingHistoryPage from "./BookingHistoryPage";
import { accountRoutes } from "@/routes/AccountRoutes";

vi.mock("./MyBookingsPage", () => ({
  default: ({ view }) => <div data-testid="bookings-view">{view}</div>,
}));

describe("BookingHistoryPage", () => {
  it("reuses MyBookingsPage in history view", () => {
    render(<BookingHistoryPage />);

    expect(screen.getByTestId("bookings-view")).toHaveTextContent("history");
  });

  it("registers booking history as a client-protected route", () => {
    const historyRoute = Children.toArray(accountRoutes.props.children).find(
      (route) => route.props.path === "/booking-history"
    );

    expect(historyRoute).toBeDefined();
    expect(historyRoute.props.element.props.role).toBe("client");
  });
});
