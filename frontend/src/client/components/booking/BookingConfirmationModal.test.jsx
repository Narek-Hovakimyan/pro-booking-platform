import { StrictMode, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import BookingConfirmationModal from "./BookingConfirmationModal";

const baseService = {
  id: "svc-1",
  name: "Color Refresh",
  duration: 90,
  price: 5000,
  discountType: "fixed",
  discountValue: 1000,
};

const baseProps = {
  barberName: "Anna",
  canConfirm: true,
  consent: null,
  consultation: null,
  depositSettings: null,
  disabledReason: "",
  discountPreview: 0,
  error: "",
  isOpen: true,
  isQuoteLoading: false,
  isServiceLoading: false,
  isSubmitting: false,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  pricingQuote: {
    finalPrice: 4000,
    originalPrice: 5000,
    serviceDiscountAmount: 1000,
    serviceDiscountedPrice: 4000,
    voucherDiscountAmount: 0,
  },
  quoteError: "",
  selectedDate: "August 1, 2099",
  selectedSalonName: "Downtown",
  selectedService: baseService,
  selectedTime: "10:00",
  voucherCode: "",
};

const expectNoUnsafeCurrency = (container) => {
  expect(container).not.toHaveTextContent("դր");
  expect(container).not.toHaveTextContent("դրամ");
  expect(container).not.toHaveTextContent(/AMD\s+AMD/u);
  expect(container).not.toHaveTextContent(/NaN AMD/u);
};

function ConfirmationHarness({ onClose = vi.fn() }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <StrictMode>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open confirmation
      </button>
      <button type="button">After close</button>
      <BookingConfirmationModal
        {...baseProps}
        isOpen={isOpen}
        onClose={() => {
          onClose();
          setIsOpen(false);
        }}
      />
    </StrictMode>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("BookingConfirmationModal", () => {
  it("formats string pricing values in AMD, keeps one minus sign, and preserves modal actions", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <BookingConfirmationModal
        {...baseProps}
        onClose={onClose}
        onConfirm={onConfirm}
        pricingQuote={{
          finalPrice: "4500",
          originalPrice: "6500",
          serviceDiscountAmount: "1500",
          serviceDiscountedPrice: "5000",
          voucherDiscountAmount: "500",
        }}
        voucherCode="SAVE500"
      />
    );

    expect(screen.getByText("6,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("-1,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("-500 AMD")).toBeInTheDocument();
    expect(screen.getByText("4,500 AMD")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm booking" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expectNoUnsafeCurrency(container);
  });

  it("uses empty, null, undefined, and invalid quote values only after valid fallbacks and keeps deposits finite", () => {
    const { container } = render(
      <BookingConfirmationModal
        {...baseProps}
        depositSettings={{
          enabled: true,
          minimumBookingPrice: 0,
          mode: "fixed",
          value: 1500,
        }}
        pricingQuote={{
          finalPrice: "not-a-number",
          originalPrice: "",
          serviceDiscountAmount: null,
          serviceDiscountedPrice: undefined,
          voucherDiscountAmount: "invalid",
        }}
      />
    );

    expect(screen.getAllByText("5,000 AMD").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("-1,000 AMD").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("4,000 AMD").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("1,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("2,500 AMD")).toBeInTheDocument();
    expect(screen.queryByText(/Promo code discount/u)).not.toBeInTheDocument();
    expectNoUnsafeCurrency(container);
  });

  it("keeps valid zero pricing distinct from fallback values and formats loyalty discounts once", () => {
    const zeroQuote = {
      finalPrice: "0",
      originalPrice: "0",
      serviceDiscountAmount: "0",
      serviceDiscountedPrice: "0",
      voucherDiscountAmount: "0",
    };
    const { container, rerender } = render(
      <BookingConfirmationModal
        {...baseProps}
        pricingQuote={zeroQuote}
      />
    );

    expect(screen.getAllByText("0 AMD").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("5,000 AMD")).not.toBeInTheDocument();

    rerender(
      <BookingConfirmationModal
        {...baseProps}
        pricingQuote={{
          finalPrice: "4250",
          loyaltyDiscountAmount: "750",
          loyaltyDiscountApplied: true,
          loyaltyDiscountPercent: "15",
          originalPrice: "5000",
          serviceDiscountAmount: "0",
          serviceDiscountedPrice: "5000",
          voucherDiscountAmount: "0",
        }}
      />
    );

    expect(screen.getByText("Loyalty discount (15%)")).toBeInTheDocument();
    expect(screen.getByText("-750 AMD")).toBeInTheDocument();
    expect(screen.getByText("4,250 AMD")).toBeInTheDocument();
    expectNoUnsafeCurrency(container);
  });

  it("restores focus and closes from escape, cancel, and backdrop interactions", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfirmationHarness onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();

    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Confirm booking" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    fireEvent.click(screen.getByRole("dialog", { name: "Confirm booking" }).parentElement);
    await waitFor(() => expect(trigger).toHaveFocus());

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
