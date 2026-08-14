import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import EventCard from "./EventCard";

const event = {
  _id: "event-1",
  title: "Armenia Midnight Event",
  date: "2026-02-01",
  time: "00:30",
  duration: 60,
  instructor: "Instructor",
  location: "Yerevan",
};

const renderCard = (overrides = {}) =>
  renderWithProviders(
    <EventCard
      currentUser={{ _id: "user-1" }}
      currentUserId="user-1"
      event={{ ...event, ...overrides }}
      onOpen={vi.fn()}
      onRegister={vi.fn()}
      onUnregister={vi.fn()}
    />,
    { preloadedState: { auth: { currentUser: null } } }
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("EventCard Armenia calendar status", () => {
  it("keeps an Armenia-today event registerable before its local start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T20:00:00.000Z"));

    renderCard();

    expect(screen.getByRole("button", { name: "Register" })).toBeEnabled();
  });

  it("hides registration for an event before the Armenia calendar day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T20:00:00.000Z"));

    renderCard({ date: "2026-01-31" });

    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });
});
