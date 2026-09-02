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

function VoucherHarness({
  barberId = "barber-1",
  clearBookingQuote = noop,
  salonId = "salon-1",
  serviceId = "service-1",
}) {
  const [voucherCode, setVoucherCode] = useState("");
  const voucher = useClientBookingVoucher({
    selectedBarberId: barberId,
    selectedSalonId: salonId,
    selectedServiceEntityId: serviceId,
    voucherCode,
    setVoucherCode,
    clearBookingQuote,
    setQuoteError: noop,
  });

  return (
    <div>
      <div data-testid="code">{voucherCode}</div>
      <div data-testid="preview">{voucher.voucherPreview?.code || ""}</div>
      <div data-testid="discount">{voucher.discountPreview}</div>
      <div data-testid="loading">{voucher.voucherLoading ? "loading" : "idle"}</div>
      <div data-testid="public-vouchers">{voucher.publicVouchers.map((voucher) => voucher.code).join(",")}</div>
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

  it("does not settle voucher discovery after unmount", async () => {
    const pending = deferred();
    api.get.mockReturnValue(pending.promise);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<VoucherHarness />);

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      pending.resolve({ data: [{ code: "LATE" }] });
      await Promise.resolve();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("does not settle voucher validation or external quote clearing after unmount", async () => {
    const pending = deferred();
    const clearBookingQuote = vi.fn();
    api.post.mockReturnValue(pending.promise);
    const { unmount } = render(<VoucherHarness clearBookingQuote={clearBookingQuote} />);
    clearBookingQuote.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "apply-first" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("loading")).toHaveTextContent("loading");
    unmount();

    await act(async () => {
      pending.resolve(validVoucher("FIRST"));
      await Promise.resolve();
    });

    expect(clearBookingQuote).not.toHaveBeenCalled();
  });
});
