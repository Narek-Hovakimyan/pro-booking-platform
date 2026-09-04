import { useCallback, useState } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import BarberSettings from "@/barber/components/BarberSettings";
import SalonJoinView from "./SalonJoinView";
import api from "@/shared/api/axios";
import useBarberSettingsData from "./hooks/useBarberSettingsData";
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

vi.mock("@/shared/api/axios", () => ({ default: { patch: vi.fn() } }));
vi.mock("@/barber/components/settings/hooks/useBarberSettingsData", () => ({ default: vi.fn() }));
vi.mock("@/barber/hooks/useDefaultSalonScheduleSettings", () => ({
  default: () => ({
    salonSchedules: {},
    savingSalonId: "",
    savedSalonId: "",
    errorSalonId: "",
    salonScheduleErrors: {},
    updateSalonSchedule: vi.fn(),
    updateWeeklyDaySchedule: vi.fn(),
    saveDefaultSchedule: vi.fn(),
  }),
}));

vi.mock("@/barber/components/TeamSettingsSection", () => ({ default: () => null }));
vi.mock("@/barber/components/SalonPromotionsManager", () => ({ default: () => null }));
vi.mock("@/barber/components/settings/JoinRequestDecisions", () => ({ default: () => null }));

const BARBER_ID = "64b64cfa12ab34cd56ef7890";
const SALON_A = "64b64cfa12ab34cd56ef7891";
const SALON_B = "64b64cfa12ab34cd56ef7892";
const SALON_C = "64b64cfa12ab34cd56ef7893";
const SALON_D = "64b64cfa12ab34cd56ef7894";

const salon = (id, name, extra = {}) => ({ _id: id, name, ...extra });
const states = (salonStates = []) => ({ data: { salonStates } });

function createDeferred() {
  let resolve;
  return {
    promise: new Promise((nextResolve) => {
      resolve = nextResolve;
    }),
    resolve,
  };
}

function renderSalonJoinView(props = {}) {
  return renderWithProviders(
    <SalonJoinView currentUserId={BARBER_ID} refreshRevision="initial" {...props} />
  );
}

function useLeaveFlowSalonData() {
  const [salonStatus, setSalonStatus] = useState({
    salonStatus: "approved",
    salons: [salon(SALON_A, "Former Studio", { ownerId: SALON_B })],
  });
  const refreshSalonData = useCallback(async () => {
    setSalonStatus({ salonStatus: "none", salons: [] });
  }, []);
  const isMember = salonStatus.salonStatus === "approved";

  return {
    allSalonEntries: isMember
      ? [{ salon: salon(SALON_A, "Former Studio", { ownerId: SALON_B }) }]
      : [],
    availableSalons: [],
    clearSalonReadError: vi.fn(),
    currentUserId: BARBER_ID,
    eventCertificates: [],
    managedSalons: [],
    ownerRequests: [],
    pendingEntries: [],
    refreshSalonData,
    salonAdmins: {},
    salonDataLoaded: true,
    salonDataLoading: false,
    salonReadError: "",
    salonStaffById: {},
    salonStatus,
    salons: [],
  };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function searchFor(value) {
  fireEvent.change(screen.getByRole("combobox", { name: "Search salons" }), {
    target: { value },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMySalonStatus.mockResolvedValue(states());
  useBarberSettingsData.mockImplementation(useLeaveFlowSalonData);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SalonJoinView", () => {
  it("does not load salons before search and forwards a self-scoped search", async () => {
    fetchSalons.mockResolvedValue({ data: [salon(SALON_A, "North Studio")] });

    renderSalonJoinView();
    await flush();

    expect(fetchSalons).not.toHaveBeenCalled();
    expect(screen.getByText("Search for a salon and send a request.")).toBeVisible();

    await searchFor(" north ");

    expect(fetchSalons).toHaveBeenCalledWith(BARBER_ID, "north");
    expect(screen.getByRole("option", { name: "North Studio" })).toBeVisible();
  });

  it("cancels the previous debounce when the query changes", async () => {
    fetchSalons.mockResolvedValue({ data: [salon(SALON_B, "South Studio")] });

    renderSalonJoinView();
    await flush();
    fireEvent.change(screen.getByRole("combobox", { name: "Search salons" }), {
      target: { value: "North" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Search salons" }), {
      target: { value: "South" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(fetchSalons).toHaveBeenCalledTimes(1);
    expect(fetchSalons).toHaveBeenCalledWith(BARBER_ID, "South");
  });

  it("hides completed results immediately when the query changes", async () => {
    fetchSalons.mockResolvedValue({ data: [salon(SALON_A, "North Studio")] });

    renderSalonJoinView();
    await flush();
    await searchFor("North");
    expect(screen.getByRole("option", { name: "North Studio" })).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Search salons" }), {
      target: { value: "South" },
    });

    expect(screen.queryByRole("option", { name: "North Studio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("Searching salons...")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();
  });

  it("ignores an out-of-order search response", async () => {
    const firstSearch = createDeferred();
    const secondSearch = createDeferred();
    fetchSalons
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise);

    renderSalonJoinView();
    await flush();
    await searchFor("North");
    await searchFor("South");

    await act(async () => {
      secondSearch.resolve({ data: [salon(SALON_B, "South Studio")] });
      await secondSearch.promise;
    });
    expect(screen.getByRole("option", { name: "South Studio" })).toBeVisible();

    await act(async () => {
      firstSearch.resolve({ data: [salon(SALON_A, "North Studio")] });
      await firstSearch.promise;
    });
    expect(screen.queryByRole("option", { name: "North Studio" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "South Studio" })).toBeVisible();
  });

  it("does not update after unmount when a search resolves late", async () => {
    const search = createDeferred();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchSalons.mockReturnValue(search.promise);

    const view = renderSalonJoinView();
    await flush();
    await searchFor("North");
    view.unmount();

    await act(async () => {
      search.resolve({ data: [salon(SALON_A, "North Studio")] });
      await search.promise;
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("collapses the combobox on Escape", async () => {
    fetchSalons.mockResolvedValue({ data: [salon(SALON_A, "North Studio")] });

    renderSalonJoinView();
    await flush();
    await searchFor("North");

    const input = screen.getByRole("combobox", { name: "Search salons" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects a searched salon with the keyboard and preserves its city", async () => {
    fetchSalons.mockResolvedValue({
      data: [salon(SALON_A, "North Studio", { city: "Yerevan" })],
    });
    requestJoinSalon.mockResolvedValue({ data: {} });
    fetchMySalonStatus
      .mockResolvedValueOnce(states())
      .mockResolvedValueOnce(states([{ salonId: SALON_A, status: "pending", salon: { name: "North Studio" } }]));

    renderSalonJoinView();
    await flush();
    await searchFor("North");

    const input = screen.getByRole("combobox", { name: "Search salons" });
    expect(screen.getByText("Yerevan")).toBeVisible();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue("North Studio");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    });

    expect(requestJoinSalon).toHaveBeenCalledWith(SALON_A);
    expect(screen.getByText("Pending")).toBeVisible();
  });

  it("does not expose active approved or pending salons as joinable search results", async () => {
    fetchMySalonStatus.mockResolvedValue(
      states([
        { salonId: SALON_A, status: "accepted", salon: { name: "Approved Studio" } },
        { salonId: SALON_B, status: "pending", salon: { name: "Pending Studio" } },
      ])
    );
    fetchSalons.mockResolvedValue({
      data: [
        salon(SALON_A, "Approved Studio"),
        salon(SALON_B, "Pending Studio"),
        salon(SALON_C, "Joinable Studio"),
      ],
    });

    renderSalonJoinView();
    await flush();
    await searchFor("Studio");

    expect(screen.queryByRole("option", { name: "Approved Studio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Pending Studio" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Joinable Studio" })).toBeVisible();
  });

  it("refreshes a former salon after leave and re-requests it as pending", async () => {
    fetchMySalonStatus
      .mockResolvedValueOnce(states([{ salonId: SALON_A, status: "accepted", salon: { name: "Former Studio" } }]))
      .mockResolvedValueOnce(states([{ salonId: SALON_A, status: "cancelled", salon: { name: "Former Studio" } }]))
      .mockResolvedValueOnce(states([{ salonId: SALON_A, status: "pending", salon: { name: "Former Studio" } }]));
    fetchSalons.mockResolvedValue({ data: [salon(SALON_A, "Former Studio", { city: "Yerevan" })] });
    requestJoinSalon.mockResolvedValue({ data: {} });

    const view = renderSalonJoinView({ refreshRevision: "before-leave" });
    await flush();
    expect(screen.getByText("Accepted")).toBeVisible();

    view.rerender(<SalonJoinView currentUserId={BARBER_ID} refreshRevision="after-leave" />);
    await flush();
    await searchFor("Former");

    fireEvent.click(screen.getByRole("option", { name: /Former Studio/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    });

    expect(requestJoinSalon).toHaveBeenCalledWith(SALON_A);
    expect(screen.getByText("Pending")).toBeVisible();
  });

  it("refreshes SalonJoinView after the actual leave action succeeds", async () => {
    fetchMySalonStatus
      .mockResolvedValueOnce(states([{ salonId: SALON_A, status: "accepted", salon: { name: "Former Studio" } }]))
      .mockResolvedValueOnce(states([{ salonId: SALON_A, status: "cancelled", salon: { name: "Former Studio" } }]));
    api.patch.mockResolvedValue({ data: { user: { salonStatus: "none" } } });

    renderWithProviders(<BarberSettings settingsView="salon" />, {
      preloadedState: { auth: { currentUser: { id: BARBER_ID }, token: "token", isAuthenticated: true } },
    });
    await flush();
    expect(fetchMySalonStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    });
    expect(screen.getByRole("dialog")).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave salon" }));
    });
    await flush();

    expect(api.patch).toHaveBeenCalledWith("/salons/leave", { salonId: SALON_A });
    expect(fetchMySalonStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Leave" })).not.toBeInTheDocument();
  });

  it("does not refresh SalonJoinView when the actual leave action fails", async () => {
    fetchMySalonStatus.mockResolvedValue(
      states([{ salonId: SALON_A, status: "accepted", salon: { name: "Former Studio" } }])
    );
    api.patch.mockRejectedValue(new Error("leave failed"));

    renderWithProviders(<BarberSettings settingsView="salon" />, {
      preloadedState: { auth: { currentUser: { id: BARBER_ID }, token: "token", isAuthenticated: true } },
    });
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Leave salon" }));
    });
    await flush();

    expect(api.patch).toHaveBeenCalledWith("/salons/leave", { salonId: SALON_A });
    expect(fetchMySalonStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Could not update salon staff. Please try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Leave" })).toBeVisible();
  });

  it("keeps rejected and cancelled salons searchable and requestable", async () => {
    fetchMySalonStatus.mockResolvedValue(
      states([
        { salonId: SALON_C, status: "rejected", salon: { name: "Rejected Studio" } },
        { salonId: SALON_D, status: "cancelled", salon: { name: "Cancelled Studio" } },
      ])
    );
    fetchSalons.mockResolvedValue({
      data: [salon(SALON_C, "Rejected Studio"), salon(SALON_D, "Cancelled Studio")],
    });

    renderSalonJoinView();
    await flush();
    await searchFor("Studio");

    expect(screen.getByRole("option", { name: "Rejected Studio" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Cancelled Studio" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Request again" })).toHaveLength(2);
  });

  it("does not submit a duplicate request for an active approved salon", async () => {
    fetchMySalonStatus.mockResolvedValue(
      states([{ salonId: SALON_A, status: "accepted", salon: { name: "Approved Studio" } }])
    );
    fetchSalons.mockResolvedValue({ data: [salon(SALON_A, "Approved Studio")] });

    renderSalonJoinView();
    await flush();
    await searchFor("Approved");

    expect(screen.getByText("No salons found.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();
    expect(requestJoinSalon).not.toHaveBeenCalled();
    expect(cancelJoinRequestBySalon).not.toHaveBeenCalled();
  });
});
