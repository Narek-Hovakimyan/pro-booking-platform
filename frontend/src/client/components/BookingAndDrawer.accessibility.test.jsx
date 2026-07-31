import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import RejectBookingModal from "@/barber/components/RejectBookingModal";
import CancelBookingModal from "@/client/components/CancelBookingModal";
import ReviewModal from "@/client/components/ReviewModal";
import Drawer from "@/shared/components/common/Drawer";

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
});
