import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BookingDetailPopover from "./BookingDetailPopover";

vi.mock("./CalendarBookingCard", () => ({
  default: ({ onAccept }) => <><button type="button" onClick={onAccept}>Accept</button><button type="button">Last control</button></>,
}));

const booking = { id: "booking-1", clientName: "Alex", status: "pending", time: "10:00", duration: 20 };

describe("BookingDetailPopover", () => {
  it("traps Tab in both directions, closes on Escape, and restores the trigger", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const onClose = vi.fn();
    const { unmount } = render(<BookingDetailPopover booking={booking} topPx={10} heightPx={20} totalHeight={600} onClose={onClose} returnFocus={trigger} />);
    const close = screen.getByRole("button", { name: "Close booking detail" });
    const last = screen.getByRole("button", { name: "Last control" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
