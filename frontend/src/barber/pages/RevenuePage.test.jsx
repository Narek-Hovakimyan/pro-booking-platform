import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import { formatDateLabel, parseDateKey } from "@/shared/utils/dates";
import { getMyRevenue } from "@/shared/api/revenue";
import RevenuePage from "./RevenuePage";

vi.mock("@/shared/api/revenue", () => ({
  getMyRevenue: vi.fn(),
}));

const baseRevenueData = {
  from: "2026-08-01",
  to: "2026-08-02",
  totalRevenue: 5000,
  completedBookingsCount: 2,
  averageBookingValue: 2500,
  revenueByDay: [
    { date: "2026-08-01", revenue: 5000, count: 2 },
  ],
  topServicesByRevenue: [
    { serviceName: "Haircut", revenue: 5000, count: 2 },
  ],
  topServicesByCount: [
    { serviceName: "Haircut", revenue: 5000, count: 2 },
  ],
  statusBreakdown: {
    completed: 2,
  },
};

function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthRange() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthLabel = String(month + 1).padStart(2, "0");
  const lastDay = String(new Date(year, month + 1, 0).getDate()).padStart(2, "0");

  return {
    from: `${year}-${monthLabel}-01`,
    to: `${year}-${monthLabel}-${lastDay}`,
  };
}

function renderPage() {
  return renderWithProviders(<RevenuePage />, {
    initialEntries: ["/admin/revenue"],
    preloadedState: {
      auth: {
        currentUser: {
          _id: "barber-1",
          role: "barber",
          name: "Revenue Barber",
        },
        token: "token",
        isAuthenticated: true,
      },
    },
  });
}

describe("RevenuePage", () => {
  beforeEach(() => {
    vi.mocked(getMyRevenue).mockResolvedValue(baseRevenueData);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the shared AMD formatter and renders readable revenue dates", async () => {
    renderPage();

    expect(await screen.findByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.getAllByText("2,500 AMD").length).toBeGreaterThan(0);

    const rangeLabel = `Showing data from ${formatDateLabel(parseDateKey("2026-08-01"))} to ${formatDateLabel(parseDateKey("2026-08-02"))}`;
    expect(screen.getByText(rangeLabel)).toBeInTheDocument();
    expect(screen.getByText(formatDateLabel(parseDateKey("2026-08-01")))).toBeInTheDocument();
    expect(screen.queryByText("2026-08-01")).not.toBeInTheDocument();

    expect(vi.mocked(getMyRevenue)).toHaveBeenCalledWith(getMonthRange());
  });

  it("shows invalid revenue dates as a safe fallback", async () => {
    vi.mocked(getMyRevenue).mockResolvedValueOnce({
      ...baseRevenueData,
      from: "bad-date",
      to: null,
      revenueByDay: [{ date: "not-a-date", revenue: 5000, count: 1 }],
    });

    renderPage();

    expect(await screen.findByText("Showing data from — to —")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("bad-date")).not.toBeInTheDocument();
    expect(screen.queryByText("not-a-date")).not.toBeInTheDocument();
  });

  it("exposes preset selected state and preserves exact preset API parameters", async () => {
    renderPage();
    await screen.findByText("5,000 AMD");

    const monthButton = screen.getByRole("button", { name: "This Month" });
    const todayButton = screen.getByRole("button", { name: "Today" });

    expect(monthButton).toHaveAttribute("aria-pressed", "true");
    expect(todayButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(todayButton);

    await waitFor(() => {
      expect(vi.mocked(getMyRevenue)).toHaveBeenLastCalledWith({
        from: getTodayKey(),
        to: getTodayKey(),
      });
    });

    expect(todayButton).toHaveAttribute("aria-pressed", "true");
    expect(monthButton).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps custom date controls labeled, stacked on mobile, and applies exact date inputs", async () => {
    renderPage();
    await screen.findByText("5,000 AMD");

    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");
    const applyButton = screen.getByRole("button", { name: "Apply" });
    const customControls = applyButton.closest("div");

    expect(fromInput).toHaveAttribute("type", "date");
    expect(toInput).toHaveAttribute("type", "date");
    expect(customControls.className).toContain("flex-col");
    expect(customControls.className).toContain("sm:flex-row");

    fireEvent.change(fromInput, { target: { value: "2026-07-15" } });
    fireEvent.change(toInput, { target: { value: "2026-07-20" } });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(vi.mocked(getMyRevenue)).toHaveBeenLastCalledWith({
        from: "2026-07-15",
        to: "2026-07-20",
      });
    });
  });
});
