import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import api from "@/shared/api/axios";
import BookingConfirmationModal from "@/client/components/booking/BookingConfirmationModal";
import SalonListModal from "@/client/components/SalonListModal";
import WaitlistForm from "@/client/components/waitlist/WaitlistForm";

vi.mock("@/shared/api/axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

const bookingConfirmationProps = {
  barberName: "Anna",
  canConfirm: true,
  consent: null,
  consultation: null,
  depositSettings: null,
  discountPreview: 0,
  disabledReason: "",
  error: "",
  isOpen: true,
  isQuoteLoading: false,
  isServiceLoading: false,
  isSubmitting: false,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  pricingQuote: {
    finalPrice: 12000,
    originalPrice: 12000,
    serviceDiscountAmount: 0,
    serviceDiscountedPrice: 12000,
    voucherDiscountAmount: 0,
  },
  quoteError: "",
  selectedDate: "August 1, 2099",
  selectedSalonName: "Downtown",
  selectedService: { duration: 60, name: "Haircut" },
  selectedTime: "10:00",
  voucherCode: "",
};

const salonFixture = [{ id: "salon-1", name: "Downtown", city: "Yerevan" }];

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function BookingConfirmationHarness({
  detachedTrigger = false,
  isSubmitting = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);

  return (
    <StrictMode>
      {showTrigger && (
        <button type="button" onClick={() => setIsOpen(true)}>
          Open confirmation
        </button>
      )}
      <button type="button">Fallback</button>
      <BookingConfirmationModal
        {...bookingConfirmationProps}
        isOpen={isOpen}
        isSubmitting={isSubmitting}
        onClose={() => {
          setIsOpen(false);
          if (detachedTrigger) setShowTrigger(false);
        }}
      />
    </StrictMode>
  );
}

function WaitlistHarness({ onClose = vi.fn(), onSuccess = vi.fn() }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <StrictMode>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open waitlist
      </button>
      {isOpen && (
        <WaitlistForm
          barberId="barber-1"
          date="2099-08-01"
          onClose={() => {
            onClose();
            setIsOpen(false);
          }}
          onSuccess={() => {
            onSuccess();
            setIsOpen(false);
          }}
          salonId="salon-1"
          serviceId="service-1"
        />
      )}
    </StrictMode>
  );
}

function SalonListHarness({ detachedTrigger = false, onClose = vi.fn() }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);

  return (
    <StrictMode>
      {showTrigger && (
        <button type="button" onClick={() => setIsOpen(true)}>
          Open salon list
        </button>
      )}
      <button type="button">After close</button>
      <SalonListModal
        barberName="Anna"
        isOpen={isOpen}
        onClose={() => {
          onClose();
          setIsOpen(false);
          if (detachedTrigger) setShowTrigger(false);
        }}
        onSelectSalon={vi.fn()}
        salons={salonFixture}
      />
    </StrictMode>
  );
}

describe("Client overlay accessibility", () => {
  it("renders named dialogs, labeled fields, and a named salon close button", () => {
    const { rerender } = render(<BookingConfirmationModal {...bookingConfirmationProps} />);

    expect(
      screen.getByRole("dialog", { name: "Confirm booking" })
    ).toBeInTheDocument();

    rerender(
      <WaitlistForm
        barberId="barber-1"
        date="2099-08-01"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        salonId="salon-1"
        serviceId="service-1"
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Notify me when a time opens" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Preferred start time (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Preferred end time (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Note (optional)")).toBeInTheDocument();

    rerender(
      <SalonListModal
        barberName="Anna"
        isOpen
        onClose={vi.fn()}
        onSelectSalon={vi.fn()}
        salons={salonFixture}
      />
    );

    expect(screen.getByRole("dialog", { name: "Anna's salons" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close salon list modal" })
    ).toBeInTheDocument();
  });

  it("focuses booking confirmation controls once per open and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<BookingConfirmationHarness />);

    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();

    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Confirm booking" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Confirm booking" })).toHaveFocus();
  });

  it("keeps booking confirmation closed while submitting", () => {
    const onClose = vi.fn();
    render(
      <BookingConfirmationModal
        {...bookingConfirmationProps}
        isSubmitting
        onClose={onClose}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Confirm booking" });
    fireEvent.click(dialog.parentElement);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("keeps waitlist focus stable through rerenders and restores focus after escape in StrictMode", async () => {
    api.post.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<WaitlistHarness />);

    const trigger = screen.getByRole("button", { name: "Open waitlist" });
    trigger.focus();

    await user.click(trigger);
    const startTime = screen.getByLabelText("Preferred start time (optional)");
    expect(startTime).toHaveFocus();

    await user.type(startTime, "1230");
    expect(startTime).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    expect(screen.getByLabelText("Preferred start time (optional)")).toHaveFocus();
  });

  it("blocks waitlist escape and backdrop dismissal while submitting", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    api.post.mockReturnValueOnce(deferred.promise);
    render(<WaitlistHarness onClose={onClose} onSuccess={onSuccess} />);

    await user.click(screen.getByRole("button", { name: "Open waitlist" }));
    await user.click(
      screen.getByRole("button", { name: "Notify me when a time opens" })
    );

    const dialog = screen.getByRole("dialog", { name: "Notify me when a time opens" });
    fireEvent.click(dialog.parentElement);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    deferred.resolve({ data: {} });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("announces waitlist errors and clears stale alerts on reopen", async () => {
    const user = userEvent.setup();
    api.post
      .mockRejectedValueOnce({
        response: { data: { message: "Could not join waitlist right now." } },
      })
      .mockResolvedValueOnce({ data: {} });
    render(<WaitlistHarness />);

    await user.click(screen.getByRole("button", { name: "Open waitlist" }));
    await user.click(
      screen.getByRole("button", { name: "Notify me when a time opens" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not join waitlist right now."
    );

    await user.click(
      screen.getByRole("button", { name: "Notify me when a time opens" })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Notify me when a time opens" })
      ).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "Open waitlist" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("focuses the first salon action, closes only from direct backdrop clicks, and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SalonListHarness onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "Open salon list" });
    trigger.focus();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Anna's salons" });
    expect(screen.getByRole("button", { name: /Downtown/ })).toHaveFocus();

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog.parentElement);
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("ignores detached salon triggers when restoring focus", async () => {
    const user = userEvent.setup();
    render(<SalonListHarness detachedTrigger />);

    const trigger = screen.getByRole("button", { name: "Open salon list" });
    trigger.focus();

    await user.click(trigger);
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Open salon list" })
      ).not.toBeInTheDocument()
    );
    expect(document.body).toHaveFocus();
  });
});
