import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ServiceStep from "./ServiceStep";

const expectNoUnsafeCurrency = (container) => {
  expect(container).not.toHaveTextContent("դր");
  expect(container).not.toHaveTextContent("դրամ");
  expect(container).not.toHaveTextContent(/AMD\s+AMD/u);
  expect(container).not.toHaveTextContent(/NaN AMD/u);
};

describe("ServiceStep", () => {
  it("renders discounted and regular service prices in AMD and preserves selection behavior", async () => {
    const user = userEvent.setup();
    const onSelectService = vi.fn();
    const onContinue = vi.fn();
    const services = [
      {
        id: "svc-1",
        active: true,
        category: "haircut",
        duration: 45,
        name: "Signature Cut",
        price: 5000,
        discountType: "fixed",
        discountValue: 1000,
      },
      {
        id: "svc-2",
        active: true,
        category: "hair-color",
        duration: 90,
        name: "Color Package",
        price: 3000,
        type: "package",
        includedServiceIds: [{ name: "Gloss" }, { name: "Blowout" }],
      },
    ];

    const { container } = render(
      <ServiceStep
        onContinue={onContinue}
        onSelectService={onSelectService}
        selectedServiceId="svc-1"
        services={services}
      />
    );

    expect(screen.getByText("Haircut")).toBeInTheDocument();
    expect(screen.getByText("Hair color")).toBeInTheDocument();
    expect(screen.getByText("-1,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("Package")).toBeInTheDocument();
    expect(screen.getByText("Gloss + Blowout")).toBeInTheDocument();
    expect(screen.getByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("4,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("3,000 AMD")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /color package/i }));
    expect(onSelectService).toHaveBeenCalledWith("svc-2");

    await user.click(screen.getByRole("button", { name: "Շարունակել" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expectNoUnsafeCurrency(container);
  });

  it("renders numeric-string and zero service prices safely", () => {
    const services = [
      {
        id: "svc-1",
        active: true,
        category: "haircut",
        duration: 30,
        name: "Zero Trim",
        price: "0",
      },
      {
        id: "svc-2",
        active: true,
        category: "styling",
        duration: 60,
        name: "Event Styling",
        price: "6500",
        discountType: "fixed",
        discountValue: "1500",
      },
    ];

    const { container } = render(
      <ServiceStep
        onContinue={vi.fn()}
        onSelectService={vi.fn()}
        selectedServiceId="svc-1"
        services={services}
      />
    );

    expect(screen.getByText("0 AMD")).toBeInTheDocument();
    expect(screen.getByText("6,500 AMD")).toBeInTheDocument();
    expect(screen.getByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.getByText("-1,500 AMD")).toBeInTheDocument();
    expectNoUnsafeCurrency(container);
  });
});
