import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import BookingSummary from "./BookingSummary";

const service = {
  _id: "service-1",
  name: "Precision Cut",
  price: 10000,
  discountType: "fixed",
  discountValue: 2000,
};

const baseProps = {
  selectedService: service,
  selectedServiceId: "service-1",
  selectedDateLabel: "Mon, Aug 3",
  selectedTime: "10:30",
  client: { name: "Ani" },
};

function renderSummary(props = {}) {
  return render(<BookingSummary {...baseProps} {...props} />);
}

function expectNoLegacyCurrency(container) {
  expect(container).not.toHaveTextContent("դր");
  expect(container).not.toHaveTextContent("դրամ");
  expect(container).not.toHaveTextContent(/AMD\s+AMD/u);
  expect(container).not.toHaveTextContent(/NaN AMD/u);
}

describe("BookingSummary pricing display", () => {
  test("formats original, service discount, promo, final, deposit, and remaining amounts as AMD", () => {
    const { container } = renderSummary({
      pricingQuote: {
        originalPrice: 10000,
        serviceDiscountAmount: 2000,
        serviceDiscountedPrice: 8000,
        voucherDiscountAmount: 1000,
        finalPrice: 7000,
      },
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 2500,
        noShowPolicyText: "Cancellations inside 24 hours may forfeit the deposit.",
      },
    });

    expect(screen.getAllByText("10,000 AMD")).toHaveLength(2);
    expect(screen.getByText("Service discount").parentElement).toHaveTextContent(
      "-2,000 AMD"
    );
    expect(screen.getByText("Discount").parentElement).toHaveTextContent(
      "-3,000 AMD"
    );
    expect(screen.getByText("-1,000 AMD")).toBeInTheDocument();
    expect(screen.getAllByText("7,000 AMD")).toHaveLength(2);
    expect(screen.getByText("2,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("4,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("Precision Cut")).toBeInTheDocument();
    expect(screen.getByText("Mon, Aug 3")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
    expect(screen.getByText("Ani")).toBeInTheDocument();
    expectNoLegacyCurrency(container);
  });

  test("formats loyalty discounts with a leading minus when no promo is applied", () => {
    const { container } = renderSummary({
      pricingQuote: {
        originalPrice: 9000,
        serviceDiscountAmount: 1000,
        serviceDiscountedPrice: 8000,
        loyaltyDiscountApplied: true,
        loyaltyDiscountAmount: 500,
        finalPrice: 7500,
      },
    });

    expect(screen.getByText("-1,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("-500 AMD")).toBeInTheDocument();
    expect(screen.getByText("7,500 AMD")).toBeInTheDocument();
    expectNoLegacyCurrency(container);
  });

  test("uses existing service fallbacks when quote values are null", () => {
    const { container } = renderSummary({
      pricingQuote: {
        originalPrice: null,
        serviceDiscountAmount: null,
        serviceDiscountedPrice: null,
        voucherDiscountAmount: null,
        finalPrice: null,
      },
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 2500,
      },
    });

    expect(screen.getAllByText("10,000 AMD")).toHaveLength(2);
    expect(screen.getAllByText("-2,000 AMD")).toHaveLength(2);
    expect(screen.getAllByText("8,000 AMD")).toHaveLength(2);
    expect(screen.getByText("2,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("5,500 AMD")).toBeInTheDocument();
    expectNoLegacyCurrency(container);
  });

  test("uses existing service fallbacks when quote values are empty strings", () => {
    const { container } = renderSummary({
      pricingQuote: {
        originalPrice: "",
        serviceDiscountAmount: "",
        serviceDiscountedPrice: "",
        voucherDiscountAmount: "",
        finalPrice: "",
      },
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 2500,
      },
    });

    expect(screen.getAllByText("10,000 AMD")).toHaveLength(2);
    expect(screen.getAllByText(/-2,000 AMD/u)).toHaveLength(2);
    expect(screen.getAllByText("8,000 AMD")).toHaveLength(2);
    expect(screen.getByText("2,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("5,500 AMD")).toBeInTheDocument();
    expectNoLegacyCurrency(container);
  });

  test("preserves valid numeric zero values without triggering fallbacks", () => {
    const { container, rerender } = renderSummary({
      pricingQuote: {
        originalPrice: 0,
        serviceDiscountAmount: 0,
        serviceDiscountedPrice: 0,
        voucherDiscountAmount: 0,
        finalPrice: 0,
      },
    });

    expect(screen.getAllByText("0 AMD").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("-2,000 AMD")).not.toBeInTheDocument();
    expectNoLegacyCurrency(container);

    rerender(
      <BookingSummary
        {...baseProps}
        pricingQuote={{
          originalPrice: "5000",
          serviceDiscountAmount: "0",
          serviceDiscountedPrice: "5000",
          voucherDiscountAmount: "0",
          finalPrice: "0",
        }}
      />
    );

    expect(screen.getByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.getAllByText("0 AMD").length).toBeGreaterThanOrEqual(1);
    expectNoLegacyCurrency(container);
  });

  test("uses valid fallbacks when primary quote values are invalid", () => {
    const { container } = renderSummary({
      pricingQuote: {
        originalPrice: "bad",
        serviceDiscountAmount: "bad",
        serviceDiscountedPrice: "bad",
        voucherDiscountAmount: "bad",
        finalPrice: "bad",
      },
      discountPreview: 1000,
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 2500,
      },
    });

    expect(screen.getAllByText("10,000 AMD")).toHaveLength(2);
    expect(screen.getByText("-2,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("-1,000 AMD")).toBeInTheDocument();
    expect(screen.getAllByText("7,000 AMD")).toHaveLength(2);
    expect(screen.getByText("4,500 AMD")).toBeInTheDocument();
    expectNoLegacyCurrency(container);
  });

  test("resolves invalid primary and invalid fallback data safely", () => {
    const { container } = renderSummary({
      selectedService: {
        ...service,
        price: "bad",
        discountValue: "bad",
      },
      pricingQuote: {
        originalPrice: "bad",
        serviceDiscountAmount: "bad",
        serviceDiscountedPrice: "bad",
        voucherDiscountAmount: "bad",
        finalPrice: "bad",
      },
    });

    expect(screen.getAllByText("0 AMD").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/-\d[\d,]* AMD/u)).not.toBeInTheDocument();
    expectNoLegacyCurrency(container);
  });

  test("keeps deposit calculations and display safe with invalid fallback data", () => {
    const { container } = renderSummary({
      selectedService: {
        ...service,
        price: "bad",
        discountType: "fixed",
        discountValue: "bad",
      },
      pricingQuote: {
        originalPrice: undefined,
        serviceDiscountAmount: undefined,
        serviceDiscountedPrice: undefined,
        voucherDiscountAmount: "bad",
        finalPrice: undefined,
      },
      depositSettings: {
        enabled: true,
        mode: "fixed",
        value: 2500,
      },
    });

    expect(screen.getAllByText("0 AMD").length).toBeGreaterThan(0);
    expectNoLegacyCurrency(container);
  });
});
