import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DepositSettingsSection from "./DepositSettingsSection";
import api from "@/shared/api/axios";

const mockGet = vi.mocked(api.get);
const mockPatch = vi.mocked(api.patch);

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function renderSection(depositSettings) {
  mockGet.mockResolvedValueOnce({
    data: {
      depositSettings,
    },
  });

  return render(<DepositSettingsSection />);
}

async function loadEnabledSection(depositSettings) {
  renderSection(depositSettings);

  const toggle = await screen.findByRole("checkbox", {
    name: "Require deposit for bookings",
  });

  return { toggle };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DepositSettingsSection", () => {
  it("shows loading and accessible field labels once loaded", async () => {
    const request = deferred();
    mockGet.mockReturnValueOnce(request.promise);

    render(<DepositSettingsSection />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading deposit settings..."
    );

    request.resolve({
      data: {
        depositSettings: {
          enabled: true,
          mode: "percentage",
          value: 25,
          minimumBookingPrice: 0,
          noShowPolicyText: "Deposit policy.",
        },
      },
    });

    await screen.findByRole("group", { name: "Deposit mode" });
    expect(
      screen.getByRole("checkbox", { name: "Require deposit for bookings" })
    ).toBeChecked();
    expect(
      screen.getByLabelText("Deposit percentage (%)")
    ).toHaveAttribute("min", "1");
    expect(
      screen.getByLabelText("Deposit percentage (%)")
    ).toHaveAttribute("max", "100");
    expect(
      screen.getByLabelText("Minimum booking price (AMD)")
    ).toHaveValue(0);
    expect(screen.getByLabelText("No-show policy text")).toHaveValue(
      "Deposit policy."
    );
  });

  it("switches percentage and fixed constraints without losing the toggle", async () => {
    renderSection({
      enabled: true,
      mode: "percentage",
      value: 25,
      minimumBookingPrice: null,
      noShowPolicyText: "",
    });

    const percentage = await screen.findByLabelText("Deposit percentage (%)");
    expect(percentage).toHaveAttribute("min", "1");
    expect(percentage).toHaveAttribute("max", "100");

    fireEvent.click(screen.getByLabelText("Fixed amount"));

    const fixed = await screen.findByLabelText("Deposit amount (AMD)");
    expect(fixed).toHaveAttribute("min", "0");
    expect(fixed).not.toHaveAttribute("max");
    expect(
      screen.getByRole("checkbox", { name: "Require deposit for bookings" })
    ).toBeChecked();
  });

  it("keeps a loaded zero minimum visible and submits a zero threshold", async () => {
    renderSection({
      enabled: true,
      mode: "fixed",
      value: 5000,
      minimumBookingPrice: 0,
      noShowPolicyText: "",
    });

    const minimumInput = await screen.findByLabelText(
      "Minimum booking price (AMD)"
    );
    expect(minimumInput).toHaveValue(0);

    mockPatch.mockResolvedValueOnce({
      data: {
        depositSettings: {
          enabled: true,
          mode: "fixed",
          value: 5000,
          minimumBookingPrice: 0,
          noShowPolicyText: "",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/barbers/me/deposit-settings", {
        enabled: true,
        mode: "fixed",
        value: 5000,
        minimumBookingPrice: 0,
        noShowPolicyText: "",
      });
    });
  });

  it("submits percentage settings with the exact payload", async () => {
    await loadEnabledSection({
      enabled: false,
      mode: "percentage",
      value: 0,
      minimumBookingPrice: null,
      noShowPolicyText: "",
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Require deposit for bookings" })
    );
    fireEvent.change(screen.getByLabelText("Deposit percentage (%)"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText("Minimum booking price (AMD)"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("No-show policy text"), {
      target: { value: "Deposits are non-refundable." },
    });

    mockPatch.mockResolvedValueOnce({
      data: {
        depositSettings: {
          enabled: true,
          mode: "percentage",
          value: 25,
          minimumBookingPrice: 1000,
          noShowPolicyText: "Deposits are non-refundable.",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/barbers/me/deposit-settings", {
        enabled: true,
        mode: "percentage",
        value: 25,
        minimumBookingPrice: 1000,
        noShowPolicyText: "Deposits are non-refundable.",
      });
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Deposit settings saved."
    );
  });

  it("submits a fixed amount payload with a zero threshold", async () => {
    renderSection({
      enabled: true,
      mode: "percentage",
      value: 10,
      minimumBookingPrice: null,
      noShowPolicyText: "",
    });

    fireEvent.click(await screen.findByLabelText("Fixed amount"));
    fireEvent.change(screen.getByLabelText("Deposit amount (AMD)"), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByLabelText("Minimum booking price (AMD)"), {
      target: { value: "0" },
    });

    mockPatch.mockResolvedValueOnce({
      data: {
        depositSettings: {
          enabled: true,
          mode: "fixed",
          value: 5000,
          minimumBookingPrice: 0,
          noShowPolicyText: "",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/barbers/me/deposit-settings", {
        enabled: true,
        mode: "fixed",
        value: 5000,
        minimumBookingPrice: 0,
        noShowPolicyText: "",
      });
    });
  });

  it("submits a null minimum threshold when the field is cleared", async () => {
    renderSection({
      enabled: true,
      mode: "fixed",
      value: 5000,
      minimumBookingPrice: 2500,
      noShowPolicyText: "",
    });

    fireEvent.change(await screen.findByLabelText("Minimum booking price (AMD)"), {
      target: { value: "" },
    });

    mockPatch.mockResolvedValueOnce({
      data: {
        depositSettings: {
          enabled: true,
          mode: "fixed",
          value: 5000,
          minimumBookingPrice: null,
          noShowPolicyText: "",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/barbers/me/deposit-settings", {
        enabled: true,
        mode: "fixed",
        value: 5000,
        minimumBookingPrice: null,
        noShowPolicyText: "",
      });
    });
  });

  it("shows success and error feedback accessibly", async () => {
    renderSection({
      enabled: true,
      mode: "percentage",
      value: 25,
      minimumBookingPrice: null,
      noShowPolicyText: "",
    });

    await screen.findByRole("button", { name: "Save" });

    mockPatch.mockResolvedValueOnce({
      data: {
        depositSettings: {
          enabled: true,
          mode: "percentage",
          value: 25,
          minimumBookingPrice: null,
          noShowPolicyText: "",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Deposit settings saved."
    );

    mockPatch.mockRejectedValueOnce({
      response: { data: { message: "Could not save deposit settings" } },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save deposit settings"
    );
  });
});
