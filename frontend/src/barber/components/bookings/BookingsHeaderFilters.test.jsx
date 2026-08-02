import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import BookingsHeaderFilters from "./BookingsHeaderFilters";

const translations = {
  en: { "nav.bookings": "Bookings" },
  hy: { "nav.bookings": "Ամրագրումներ" },
};

let currentLanguage = "en";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => translations[currentLanguage]?.[key] || key,
  }),
}));

describe("BookingsHeaderFilters", () => {
  test("renders the English bookings title", () => {
    currentLanguage = "en";

    render(
      <BookingsHeaderFilters
        dateOptions={[{ value: "2026-08-02", label: "Sun, Aug 2" }]}
        selectedDate="2026-08-02"
        selectedDateLabel="Sun, Aug 2"
        onAddBooking={vi.fn()}
        onSelectDate={vi.fn()}
        onDateInputChange={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Bookings" })).toBeInTheDocument();
  });

  test("renders the Armenian bookings title", () => {
    currentLanguage = "hy";

    render(
      <BookingsHeaderFilters
        dateOptions={[{ value: "2026-08-02", label: "Sun, Aug 2" }]}
        selectedDate="2026-08-02"
        selectedDateLabel="Sun, Aug 2"
        onAddBooking={vi.fn()}
        onSelectDate={vi.fn()}
        onDateInputChange={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Ամրագրումներ" })).toBeInTheDocument();
  });
});
