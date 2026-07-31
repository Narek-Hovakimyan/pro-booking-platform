import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import RejectBookingModal from "@/barber/components/RejectBookingModal";
import ManualBookingModal from "@/barber/components/bookings/ManualBookingModal";
import CancelBookingModal from "@/client/components/CancelBookingModal";
import DelayBookingModal from "@/client/components/bookings/DelayBookingModal";
import BookingDetailsModal from "@/shared/components/BookingDetailsModal";
import ReviewModal from "@/client/components/ReviewModal";
import RescheduleBooking from "@/client/components/RescheduleBooking";
import Drawer from "@/shared/components/common/Drawer";

vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector) =>
    selector({ bookings: [], users: [{ id: "barber-1", role: "barber" }] }),
}));

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn(() => new Promise(() => {})),
  },
}));

vi.mock("@/store/slices/bookingsSlice", () => ({
  fetchBarberBookings: vi.fn(() => ({ type: "fetchBarberBookings" })),
  fetchClientBookings: vi.fn(() => ({ type: "fetchClientBookings" })),
  updateBooking: vi.fn((booking) => ({ type: "updateBooking", payload: booking })),
}));

vi.mock("@/shared/utils/slots", () => ({
  getSlotAvailabilitySummary: vi.fn(() => ({
    availableSlots: ["10:00"],
    blockedByTime: false,
    blockedByBooking: false,
  })),
}));

function DrawerHarness({ closeLabel = "Close filters drawer", isOpen = true, onClose }) {
  return (
    <Drawer
      closeLabel={closeLabel}
      description="Filter specialists by city."
      isOpen={isOpen}
      onClose={onClose}
      title="Filters"
    >
      <label className="grid gap-2">
        Search
        <input type="text" />
      </label>
    </Drawer>
  );
}

function ReopenableDrawerHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <StrictMode>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open drawer
      </button>
      <DrawerHarness isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </StrictMode>
  );
}

function ReviewHarness({ isSubmitting = false, onClose = vi.fn() }) {
  return (
    <ReviewModal
      booking={{ serviceName: "Haircut" }}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={vi.fn()}
      title="Leave Review"
    />
  );
}

function CancelHarness({ isSubmitting = false, onClose = vi.fn() }) {
  return (
    <CancelBookingModal
      booking={{ serviceName: "Haircut", bookingDate: "2026-07-31", time: "10:00" }}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={vi.fn()}
    />
  );
}

function RejectHarness({ isSubmitting = false, onClose = vi.fn() }) {
  return (
    <RejectBookingModal
      booking={{ clientName: "Anna", bookingDate: "2026-07-31", time: "10:00" }}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={vi.fn()}
    />
  );
}

const bookingFixture = {
  id: "booking-1",
  barberId: "barber-1",
  clientId: "client-1",
  bookingDate: "2026-08-01",
  duration: 60,
  serviceName: "Haircut",
  status: "accepted",
  time: "10:00",
};

function BookingDetailsHarness({ onClose = vi.fn(), detachedOnClose = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
        >
          Open booking details
        </button>
      )}
      {isOpen && (
        <BookingDetailsModal
          booking={bookingFixture}
          onClose={() => {
            onClose();
            setIsOpen(false);
            if (detachedOnClose) setShowTrigger(false);
          }}
        />
      )}
    </>
  );
}

function DelayHarness({ isSubmitting = false, onClose = vi.fn() }) {
  return (
    <DelayBookingModal
      booking={bookingFixture}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={vi.fn()}
    />
  );
}

function ManualHarness({ isAddingBooking = false, onClose = vi.fn() }) {
  const [manualBooking, setManualBooking] = useState({
    clientName: "",
    clientPhone: "",
    serviceId: "service-1",
    bookingDate: "2026-08-01",
    time: "10:00",
  });

  return (
    <ManualBookingModal
      activeServices={[{ id: "service-1", name: "Haircut", duration: 60 }]}
      isAddingBooking={isAddingBooking}
      manualBooking={manualBooking}
      onClose={onClose}
      onSubmit={(event) => event.preventDefault()}
      onUpdateManualBooking={(field, value) =>
        setManualBooking((current) => ({ ...current, [field]: value }))
      }
    />
  );
}

function RescheduleHarness({ onClose = vi.fn() }) {
  return <RescheduleBooking booking={bookingFixture} onClose={onClose} />;
}

describe("Booking and drawer accessibility", () => {
  it("renders named dialogs and supports label-based field access", () => {
    const { rerender } = render(<DrawerHarness onClose={vi.fn()} />);

    expect(
      screen.getByRole("dialog", { name: "Filters" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close filters drawer" })
    ).toBeInTheDocument();

    rerender(<ReviewHarness />);
    expect(
      screen.getByRole("dialog", { name: "Leave Review" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Review")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close review modal" })
    ).toBeInTheDocument();

    rerender(<CancelHarness />);
    expect(
      screen.getByRole("dialog", { name: "Cancel booking" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Reason for cancellation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close cancel booking modal" })
    ).toBeInTheDocument();

    rerender(<RejectHarness />);
    expect(
      screen.getByRole("dialog", { name: "Reject booking" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Reason for rejection")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close reject booking modal" })
    ).toBeInTheDocument();
  });

  it("moves focus into dialogs once per open and restores it on close", async () => {
    const user = userEvent.setup();
    render(<ReopenableDrawerHarness />);

    const openButton = screen.getByRole("button", { name: "Open drawer" });
    openButton.focus();

    await user.click(openButton);
    const searchField = screen.getByLabelText("Search");
    expect(searchField).toHaveFocus();

    await user.type(searchField, "Paris");
    expect(searchField).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(openButton).toHaveFocus();

    await user.click(openButton);
    expect(screen.getByLabelText("Search")).toHaveFocus();
  });

  it("uses existing close paths for escape and direct backdrop clicks only", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<DrawerHarness onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    const drawerDialog = screen.getByRole("dialog", { name: "Filters" });
    await user.click(drawerDialog);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(drawerDialog.parentElement);
    expect(onClose).toHaveBeenCalledTimes(2);

    onClose.mockClear();
    rerender(<ReviewHarness onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    const reviewDialog = screen.getByRole("dialog", { name: "Leave Review" });
    await user.click(reviewDialog);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(reviewDialog.parentElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("prevents closing booking action modals while submitting", async () => {
    const user = userEvent.setup();
    const onCancelClose = vi.fn();
    const { rerender } = render(
      <CancelHarness isSubmitting onClose={onCancelClose} />
    );

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("dialog", { name: "Cancel booking" }).parentElement);
    expect(onCancelClose).not.toHaveBeenCalled();

    const onRejectClose = vi.fn();
    rerender(<RejectHarness isSubmitting onClose={onRejectClose} />);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("dialog", { name: "Reject booking" }).parentElement);
    expect(onRejectClose).not.toHaveBeenCalled();

    const onReviewClose = vi.fn();
    rerender(<ReviewHarness isSubmitting onClose={onReviewClose} />);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("dialog", { name: "Leave Review" }).parentElement);
    expect(onReviewClose).not.toHaveBeenCalled();
  });

  it("remains safe across rerenders, strict mode, and detached triggers", async () => {
    const user = userEvent.setup();
    const { rerender, unmount } = render(
      <StrictMode>
        <DrawerHarness onClose={vi.fn()} />
      </StrictMode>
    );

    const searchField = screen.getByLabelText("Search");
    expect(searchField).toHaveFocus();

    await user.type(searchField, "Lo");
    rerender(
      <StrictMode>
        <Drawer
          closeLabel="Close filters drawer"
          description="Filter specialists by city."
          isOpen
          onClose={vi.fn()}
          title="Filters"
        >
          <label className="grid gap-2">
            Search
            <input type="text" value="Lo" onChange={() => {}} />
          </label>
        </Drawer>
      </StrictMode>
    );
    expect(screen.getByLabelText("Search")).toHaveFocus();

    const trigger = document.createElement("button");
    trigger.textContent = "Detached";
    document.body.appendChild(trigger);
    trigger.focus();
    trigger.remove();

    unmount();
    expect(document.body).toBeInTheDocument();
  });

  it("gives remaining booking overlays names and focuses each once per open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StrictMode>
        <BookingDetailsHarness />
      </StrictMode>
    );

    const trigger = screen.getByRole("button", { name: "Open booking details" });
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Booking details" })).toHaveAttribute(
      "aria-modal",
      "true"
    );
    expect(screen.getByRole("button", { name: "Close booking details" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Close booking details" })).toHaveFocus();

    rerender(<DelayHarness />);
    expect(screen.getByRole("dialog", { name: "Running late?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close delay booking modal" })).toHaveFocus();

    rerender(<ManualHarness />);
    expect(screen.getByRole("dialog", { name: "Add Booking" })).toBeInTheDocument();
    expect(screen.getByLabelText("Client name")).toHaveFocus();
  });

  it("uses direct backdrop and Escape close paths while guarding busy overlays", async () => {
    const user = userEvent.setup();
    const onDelayClose = vi.fn();
    const { rerender } = render(<DelayHarness onClose={onDelayClose} />);
    const delayDialog = screen.getByRole("dialog", { name: "Running late?" });

    await user.click(delayDialog);
    expect(onDelayClose).not.toHaveBeenCalled();
    await user.click(delayDialog.parentElement);
    expect(onDelayClose).toHaveBeenCalledTimes(1);

    const onManualClose = vi.fn();
    rerender(<ManualHarness isAddingBooking onClose={onManualClose} />);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("dialog", { name: "Add Booking" }).parentElement);
    expect(onManualClose).not.toHaveBeenCalled();

    const onRescheduleClose = vi.fn();
    rerender(<RescheduleHarness onClose={onRescheduleClose} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "10:00" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "10:00" }));
    await user.click(screen.getByRole("button", { name: "Send reschedule request" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("dialog", { name: "Reschedule booking" }).parentElement);
    expect(onRescheduleClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("does not restore focus to a detached booking trigger", async () => {
    const user = userEvent.setup();
    render(<BookingDetailsHarness detachedOnClose />);

    const trigger = screen.getByRole("button", { name: "Open booking details" });
    trigger.focus();
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Open booking details" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });
});
