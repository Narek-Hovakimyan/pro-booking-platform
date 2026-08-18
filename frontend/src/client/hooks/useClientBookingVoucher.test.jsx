import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import api from "@/shared/api/axios";
import { useClientBookingVoucher } from "./useClientBookingVoucher";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const noop = () => {};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function VoucherHarness({ barberId = "barber-1", salonId = "salon-1", serviceId = "service-1" }) {
  const [voucherCode, setVoucherCode] = useState("");
  const voucher = useClientBookingVoucher({
    selectedBarberId: barberId,
    selectedSalonId: salonId,
    selectedServiceEntityId: serviceId,
    voucherCode,
    setVoucherCode,
    clearBookingQuote: noop,
    setQuoteError: noop,
  });

  return (
    <div>
      <div data-testid="code">{voucherCode}</div>
      <div data-testid="preview">{voucher.voucherPreview?.code || ""}</div>
      <div data-testid="discount">{voucher.discountPreview}</div>
      <button onClick={() => voucher.applyVoucher("FIRST")} type="button">apply-first</button>
      <button onClick={() => voucher.applyVoucher("SECOND")} type="button">apply-second</button>
    </div>
  );
}

const validVoucher = (code, discountPreview = 10) => ({
  data: { valid: true, voucher: { code }, discountPreview },
});

beforeEach(() => {
  api.get.mockResolvedValue({ data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useClientBookingVoucher validation races", () => {
  it("ignores a validation result that resolves after the service changes", async () => {
    const pending = deferred();
    api.post.mockReturnValue(pending.promise);
    const { rerender } = render(<VoucherHarness />);

    fireEvent.click(screen.getByRole("button", { name: "apply-first" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    rerender(<VoucherHarness serviceId="service-2" />);

    await act(async () => pending.resolve(validVoucher("FIRST")));

    expect(screen.getByTestId("code")).toHaveTextContent("");
    expect(screen.getByTestId("preview")).toHaveTextContent("");
    expect(screen.getByTestId("discount")).toHaveTextContent("0");
  });

  it("ignores a validation result that resolves after the salon context changes", async () => {
    const pending = deferred();
    api.post.mockReturnValue(pending.promise);
    const { rerender } = render(<VoucherHarness />);

    fireEvent.click(screen.getByRole("button", { name: "apply-first" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    rerender(<VoucherHarness salonId="salon-2" />);

    await act(async () => pending.resolve(validVoucher("FIRST")));

    expect(screen.getByTestId("code")).toHaveTextContent("");
    expect(screen.getByTestId("preview")).toHaveTextContent("");
    expect(screen.getByTestId("discount")).toHaveTextContent("0");
  });

  it("keeps only the latest validation result", async () => {
    const first = deferred();
    const second = deferred();
    api.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<VoucherHarness />);

    fireEvent.click(screen.getByRole("button", { name: "apply-first" }));
    fireEvent.click(screen.getByRole("button", { name: "apply-second" }));

    await act(async () => second.resolve(validVoucher("SECOND", 20)));
    await act(async () => first.resolve(validVoucher("FIRST", 10)));

    expect(screen.getByTestId("code")).toHaveTextContent("SECOND");
    expect(screen.getByTestId("preview")).toHaveTextContent("SECOND");
    expect(screen.getByTestId("discount")).toHaveTextContent("20");
  });

  it("preserves a current successful validation", async () => {
    api.post.mockResolvedValue(validVoucher("FIRST", 15));
    render(<VoucherHarness />);

    fireEvent.click(screen.getByRole("button", { name: "apply-first" }));

    await waitFor(() => expect(screen.getByTestId("preview")).toHaveTextContent("FIRST"));
    expect(screen.getByTestId("code")).toHaveTextContent("FIRST");
    expect(screen.getByTestId("discount")).toHaveTextContent("15");
  });
});
