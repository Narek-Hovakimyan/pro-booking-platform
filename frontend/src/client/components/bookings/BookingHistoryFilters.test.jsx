import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import BookingHistoryFilters from "./BookingHistoryFilters";

test("client history filters expose status mapping, scoped entities, and reset", () => {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(<BookingHistoryFilters filters={{ fromDate: "", toDate: "", status: "", specialistId: "", salonId: "" }} specialistOptions={[{ id: "barber-1", name: "Ava" }]} salonOptions={[{ id: "salon-1", name: "North" }]} onChange={onChange} onReset={onReset} />);
  expect(screen.getByRole("option", { name: "Confirmed" })).toHaveValue("confirmed");
  [
    ["Completed", "completed"],
    ["Cancelled", "cancelled"],
    ["Expired", "expired"],
    ["No-show", "no_show"],
    ["Late cancellation", "late_cancelled"],
    ["Rejected", "rejected"],
  ].forEach(([label, value]) => {
    expect(screen.getByRole("option", { name: label })).toHaveValue(value);
  });
  fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-01" } });
  fireEvent.change(screen.getByLabelText("Specialist"), { target: { value: "barber-1" } });
  fireEvent.change(screen.getByLabelText("Salon"), { target: { value: "salon-1" } });
  expect(onChange).toHaveBeenCalledWith("fromDate", "2026-08-01");
  expect(onChange).toHaveBeenCalledWith("specialistId", "barber-1");
  expect(onChange).toHaveBeenCalledWith("salonId", "salon-1");
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(onReset).toHaveBeenCalledTimes(1);
});
