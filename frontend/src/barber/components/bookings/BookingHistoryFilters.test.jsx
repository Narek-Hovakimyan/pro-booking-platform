import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import BookingHistoryFilters from "./BookingHistoryFilters";

test("barber history filters provide terminal statuses, client search, and reset", () => {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(<BookingHistoryFilters filters={{ fromDate: "", toDate: "", status: "", clientSearch: "" }} onChange={onChange} onReset={onReset} />);
  expect(screen.queryByRole("option", { name: "Confirmed" })).not.toBeInTheDocument();
  [
    ["Completed", "completed"],
    ["Rejected", "rejected"],
    ["Cancelled", "cancelled"],
    ["Expired", "expired"],
    ["No-show", "no_show"],
    ["Late cancellation", "late_cancelled"],
  ].forEach(([label, value]) => {
    expect(screen.getByRole("option", { name: label })).toHaveValue(value);
  });
  fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-08-31" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "no_show" } });
  fireEvent.change(screen.getByLabelText("Client search"), { target: { value: "555" } });
  expect(onChange).toHaveBeenCalledWith("toDate", "2026-08-31");
  expect(onChange).toHaveBeenCalledWith("status", "no_show");
  expect(onChange).toHaveBeenCalledWith("clientSearch", "555");
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(onReset).toHaveBeenCalledTimes(1);
});
