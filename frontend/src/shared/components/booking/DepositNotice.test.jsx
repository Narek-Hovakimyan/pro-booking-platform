import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import DepositNotice from "./DepositNotice";

function expectNoUnsafeCurrency(container) {
  expect(container).not.toHaveTextContent("դր");
  expect(container).not.toHaveTextContent("դրամ");
  expect(container).not.toHaveTextContent(/AMD\s+AMD/u);
  expect(container).not.toHaveTextContent(/NaN AMD/u);
}

describe("DepositNotice", () => {
  test("formats pricing, keeps checkout link, payment status, and policy text intact", () => {
    const { container } = render(
      <DepositNotice
        originalPrice={10000}
        discountAmount={2000}
        finalPrice={8000}
        depositAmount={2500}
        remainingDue={5500}
        paymentStatus="requires_action"
        checkoutUrl="https://checkout.example/pay"
        policyText="No-show policy stays visible."
      />
    );

    expect(screen.getByText("10,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("-2,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("8,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("2,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("5,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("requires_action")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pay deposit" })).toHaveAttribute(
      "href",
      "https://checkout.example/pay"
    );
    expect(screen.getByText("No-show policy stays visible.")).toBeInTheDocument();
    expectNoUnsafeCurrency(container);
  });

  test("handles numeric strings, zero, missing, invalid values, and payment message safely", () => {
    const { container } = render(
      <DepositNotice
        originalPrice="5000"
        discountAmount="invalid"
        finalPrice="0"
        remainingDue={undefined}
        paymentStatus=""
        paymentMessage="Manual deposit collection is available."
      />
    );

    expect(screen.getByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText("Discount")).not.toBeInTheDocument();
    expect(screen.getAllByText("0 AMD").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(
      screen.getByText("Manual deposit collection is available.")
    ).toBeInTheDocument();
    expectNoUnsafeCurrency(container);
  });
});
