import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import SalonCalendarControls from "./salon-calendar/SalonCalendarControls";

function renderControls(props = {}) {
  const onSalonChange = vi.fn();

  render(
    <MemoryRouter>
      <SalonCalendarControls
        calendar={null}
        onBarberChange={vi.fn()}
        onDateChange={vi.fn()}
        onSalonChange={onSalonChange}
        onViewChange={vi.fn()}
        periodLabel="Aug 9"
        salons={[]}
        selectedBarberId=""
        selectedDate="2026-08-09"
        selectedSalonId=""
        staff={[]}
        view="day"
        {...props}
      />
    </MemoryRouter>
  );

  return { onSalonChange };
}

describe("SalonCalendarControls", () => {
  it("uses a scalar nested salon id for option key/value and selection", () => {
    const salons = [
      { salon: "salon-123", name: "North Studio" },
      { _id: "salon-456", name: "South Studio" },
    ];
    const { onSalonChange } = renderControls({
      salons,
      selectedSalonId: "salon-123",
    });

    const select = screen.getByLabelText("Salon");
    const scalarOption = screen.getByRole("option", { name: "North Studio" });

    expect(scalarOption).toHaveAttribute("value", "salon-123");
    expect(select).toHaveValue("salon-123");

    fireEvent.change(select, { target: { value: "salon-123" } });

    expect(onSalonChange).toHaveBeenCalledWith("salon-123");
  });
});
