import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import SalonJoinView from "./SalonJoinView";
import {
  cancelJoinRequestBySalon,
  fetchMySalonStatus,
  fetchSalons,
  requestJoinSalon,
} from "@/shared/api/salonMembership";

vi.mock("@/shared/api/salonMembership", () => ({
  fetchMySalonStatus: vi.fn(),
  fetchSalons: vi.fn(),
  requestJoinSalon: vi.fn(),
  cancelJoinRequestBySalon: vi.fn(),
}));

const BARBER_ID = "64b64cfa12ab34cd56ef7890";
const SALON_A = "64b64cfa12ab34cd56ef7891";
const SALON_B = "64b64cfa12ab34cd56ef7892";
const SALON_C = "64b64cfa12ab34cd56ef7893";
const SALON_D = "64b64cfa12ab34cd56ef7894";
const SALON_E = "64b64cfa12ab34cd56ef7895";

const salon = (id, name, extra = {}) => ({ _id: id, name, ...extra });

function renderSalonJoinView() {
  return renderWithProviders(<SalonJoinView currentUserId={BARBER_ID} />);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("SalonJoinView", () => {
  it("keeps valid available salons selectable when status data is null", async () => {
    fetchMySalonStatus.mockResolvedValue({ data: null });
    fetchSalons.mockResolvedValue({
      data: [salon(SALON_A, "North Studio"), salon(SALON_B, "South Studio")],
    });

    renderSalonJoinView();

    const select = await screen.findByRole("combobox");
    const options = within(select).getAllByRole("option").map((option) => option.textContent);

    expect(options).toEqual(["Select salon", "North Studio", "South Studio"]);
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();
  });

  it("ignores malformed status shapes without crashing", async () => {
    fetchMySalonStatus.mockResolvedValue({
      data: {
        salonStates: [null, "pending", 7, { salonId: "bad", status: "pending" }, { salon: "x" }],
        salons: "not-an-array",
        pendingEntries: [null, "abc", 1, { salonId: "" }],
        pendingRequest: ["bad"],
      },
    });
    fetchSalons.mockResolvedValue({
      data: [salon(SALON_A, "North Studio"), { _id: "bad", name: "Broken Studio" }],
    });

    renderSalonJoinView();

    const select = await screen.findByRole("combobox");
    expect(within(select).getByRole("option", { name: "North Studio" })).toBeInTheDocument();
    expect(screen.queryByText("Broken Studio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("treats valid salonStates as authoritative over compatibility arrays", async () => {
    fetchMySalonStatus.mockResolvedValue({
      data: {
        salonStates: [
          { salonId: SALON_A, status: "accepted", salon: { name: "Accepted Studio" } },
          { salonId: SALON_B, status: "pending", salon: { name: "Pending Studio" } },
          { salonId: SALON_C, status: "approved", salon: { name: "Ignored Approved" } },
        ],
        salons: [{ salonId: SALON_D, status: "approved", salon: { name: "Legacy Accepted" } }],
        pendingEntries: [{ salonId: SALON_E, status: "pending", salon: { name: "Legacy Pending" } }],
      },
    });
    fetchSalons.mockResolvedValue({ data: [salon(SALON_D, "Legacy Accepted"), salon(SALON_E, "Legacy Pending")] });

    renderSalonJoinView();

    expect(await screen.findByText("Accepted Studio")).toBeVisible();
    expect(screen.getByText("Pending Studio")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Request again" })).not.toBeInTheDocument();
    expect(screen.queryByText("Ignored Approved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("normalizes canonical salon IDs and ignores invalid salon records for actions", async () => {
    fetchMySalonStatus.mockResolvedValue({ data: { salonStates: [] } });
    fetchSalons.mockResolvedValue({
      data: [
        { _id: ` ${SALON_A} `, name: "Trim House" },
        { _id: 42, name: "Number Salon" },
        { _id: "short-id", name: "Short Salon" },
        { _id: { value: SALON_B }, name: "Object Salon" },
        { name: "Missing Id Salon" },
      ],
    });
    requestJoinSalon.mockResolvedValue({ data: {} });
    fetchMySalonStatus
      .mockResolvedValueOnce({ data: { salonStates: [] } })
      .mockResolvedValueOnce({ data: { salonStates: [{ salonId: SALON_A, status: "pending", salon: { name: "Trim House" } }] } });

    renderSalonJoinView();

    const user = userEvent.setup();
    const select = await screen.findByRole("combobox");

    expect(within(select).getAllByRole("option")).toHaveLength(2);
    await user.selectOptions(select, SALON_A);
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(requestJoinSalon).toHaveBeenCalledWith(SALON_A);
    expect(requestJoinSalon).toHaveBeenCalledTimes(1);
  });

  it("uses compatibility mappings when authoritative salonStates is empty", async () => {
    fetchMySalonStatus.mockResolvedValue({
      data: {
        salonStates: [],
        salons: [
          { salonId: SALON_A, status: "approved", salon: { name: "Legacy Accepted" } },
          { salonId: SALON_B, status: "rejected", salon: { name: "Ignored Legacy Rejected" } },
        ],
        pendingEntries: [
          { salonId: SALON_C, status: "pending", salon: { name: "Legacy Pending" } },
          { salonId: SALON_D, status: "approved", salon: { name: "Ignored Pending Approved" } },
        ],
        pendingRequest: { salonId: SALON_E, status: "pending", salon: { name: "Single Pending" } },
      },
    });
    fetchSalons.mockResolvedValue({ data: [] });

    renderSalonJoinView();

    expect(await screen.findByText("Legacy Accepted")).toBeVisible();
    expect(screen.getByText("Legacy Pending")).toBeVisible();
    expect(screen.getByText("Single Pending")).toBeVisible();
    expect(screen.queryByText("Ignored Legacy Rejected")).not.toBeInTheDocument();
    expect(screen.queryByText("Ignored Pending Approved")).not.toBeInTheDocument();
  });

  it("excludes accepted and pending salons from available options while allowing rejected and cancelled retry actions", async () => {
    fetchMySalonStatus.mockResolvedValue({
      data: {
        salonStates: [
          { salonId: SALON_A, status: "accepted", salon: { name: "Accepted Studio" } },
          { salonId: SALON_B, status: "pending", salon: { name: "Pending Studio" } },
          { salonId: SALON_C, status: "rejected", salon: { name: "Rejected Studio" } },
          { salonId: SALON_D, status: "cancelled", salon: { name: "Cancelled Studio" } },
          { salonId: SALON_C, status: "rejected", salon: { name: "Rejected Studio Duplicate" } },
        ],
      },
    });
    fetchSalons.mockResolvedValue({
      data: [
        salon(SALON_A, "Accepted Studio"),
        salon(SALON_B, "Pending Studio"),
        salon(SALON_C, "Rejected Studio"),
        salon(SALON_D, "Cancelled Studio"),
      ],
    });

    renderSalonJoinView();

    const select = await screen.findByRole("combobox");
    const options = within(select).getAllByRole("option").map((option) => option.textContent);

    expect(options).toEqual(["Select salon", "Rejected Studio", "Cancelled Studio"]);
    expect(screen.getAllByRole("button", { name: "Request again" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("keeps the first valid authoritative state when duplicate canonical salon IDs are present", async () => {
    fetchMySalonStatus.mockResolvedValue({
      data: {
        salonStates: [
          { salonId: SALON_C, status: "pending", salon: { name: "First Salon" } },
          { salonId: ` ${SALON_C} `, status: "rejected", salon: { name: "Duplicate Salon" } },
        ],
      },
    });
    fetchSalons.mockResolvedValue({ data: [salon(SALON_C, "First Salon")] });

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      renderSalonJoinView();

      expect(await screen.findAllByText("First Salon")).toHaveLength(1);
      expect(screen.queryByText("Duplicate Salon")).not.toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeVisible();
      expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Request again" })).not.toBeInTheDocument();
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Encountered two children with the same key")
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("renders the bounded load error when salon data fails to load", async () => {
    fetchMySalonStatus.mockRejectedValue(new Error("load failed"));
    fetchSalons.mockResolvedValue({ data: [salon(SALON_A, "North Studio")] });

    renderSalonJoinView();

    expect(
      await screen.findByText("Unable to load salon data. Please try again.")
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(cancelJoinRequestBySalon).not.toHaveBeenCalled();
  });
});
