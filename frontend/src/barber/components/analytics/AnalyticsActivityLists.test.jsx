import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import AnalyticsActivityLists from "./AnalyticsActivityLists";

describe("AnalyticsActivityLists", () => {
  test("formats booking dates and avoids raw ISO strings", () => {
    render(
      <AnalyticsActivityLists
        recentCompleted={[
          {
            id: "booking-1",
            clientName: "Alice",
            serviceName: "Cut",
            bookingDate: "2026-08-02",
            time: "09:00",
            updatedAt: "2026-08-02T10:00:00.000Z",
          },
          {
            id: "booking-2",
            clientName: "Bob",
            serviceName: "Color",
            bookingDate: "not-a-date",
            time: "10:30",
            createdAt: "2026-08-02T11:00:00.000Z",
          },
        ]}
        upcomingBookings={[
          {
            id: "booking-3",
            clientName: "Cara",
            serviceName: "Blow Dry",
            bookingDate: "2026-08-03",
            time: "11:00",
            status: "accepted",
          },
        ]}
        getBookingId={(booking) => booking.id}
        getClientName={(booking) => booking.clientName}
        getServiceName={(booking) => booking.serviceName}
        getBookingTime={(booking) => booking.time}
        formatTimeAgo={() => "2h ago"}
      />
    );

    expect(screen.getByText("Alice · Cut")).toBeInTheDocument();
    expect(screen.getByText("Sun, Aug 2 at 09:00 · 2h ago")).toBeInTheDocument();
    expect(screen.getByText("Bob · Color")).toBeInTheDocument();
    expect(screen.getByText("— at 10:30 · 2h ago")).toBeInTheDocument();
    expect(screen.getByText("Cara · Blow Dry")).toBeInTheDocument();
    expect(screen.getByText("Mon, Aug 3 at 11:00")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-02")).not.toBeInTheDocument();
    expect(screen.queryByText("not-a-date")).not.toBeInTheDocument();
  });
});
