import { StrictMode } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import SalonReportsPage from "./SalonReportsPage";
import { get30DaysAgoString, getTodayString } from "./salonReportFormatters";

const apiGet = vi.fn();
const getSalonReports = vi.fn();
const exportSalonReportsCsv = vi.fn();

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: (...args) => apiGet(...args),
  },
}));

vi.mock("@/shared/api/salonReports", () => ({
  exportSalonReportsCsv: (...args) => exportSalonReportsCsv(...args),
  getSalonReports: (...args) => getSalonReports(...args),
}));

const baseSalons = [
  { _id: "salon-1", name: "North Studio" },
  { _id: "salon-2", name: "South Studio" },
];

const baseReport = {
  salon: {
    id: "salon-1",
    name: "North Studio",
    city: "Yerevan",
    address: "Main Street 1",
  },
  range: {
    from: "2026-07-05",
    to: "2026-08-04",
  },
  summary: {
    totalBookings: 3,
    completedBookings: 2,
    pendingBookings: 1,
    acceptedBookings: 1,
    cancelledBookings: 0,
    noShowBookings: 0,
    lateCancelledBookings: 0,
    totalRevenue: 30000,
    grossRevenue: 30000,
    staffEarningsTotal: 15000,
    salonEarningsTotal: 15000,
    fixedPayProratedCount: 1,
    averageBookingValue: 15000,
    uniqueClients: 2,
  },
  byStatus: [
    { status: "completed", count: 2 },
    { status: "pending", count: 1 },
  ],
  byDay: [
    {
      _id: "2026-08-03",
      total: 2,
      completed: 1,
      cancelled: 0,
      noShow: 0,
      pending: 1,
      revenue: 20000,
    },
  ],
  byStaff: [
    {
      barberId: "barber-1",
      barberName: "Alex",
      avatarUrl: "",
      totalBookings: 2,
      completed: 2,
      cancelled: 0,
      noShow: 0,
      grossRevenue: 20000,
      staffEarnings: 12000,
      salonEarnings: 8000,
      paymentType: "commission",
      commissionStaffPercent: 60,
      commissionSalonPercent: 40,
      fixedAmount: null,
      fixedPeriod: "",
      earningsCalculationStatus: "calculated",
      uniqueClients: 1,
    },
    {
      barberId: "barber-2",
      barberName: "Mina",
      avatarUrl: "",
      totalBookings: 1,
      completed: 0,
      cancelled: 0,
      noShow: 0,
      grossRevenue: 10000,
      staffEarnings: 5000,
      salonEarnings: 5000,
      paymentType: "fixed",
      commissionStaffPercent: null,
      commissionSalonPercent: null,
      fixedAmount: 12000,
      fixedPeriod: "weekly",
      earningsCalculationStatus: "calculated_prorated",
      fixedProratedDays: 2,
      fixedProrationUnits: 2,
      uniqueClients: 1,
    },
  ],
  topServices: [
    { _id: "Haircut", count: 2, revenue: 20000 },
  ],
};

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function buildReport(overrides = {}) {
  return {
    ...baseReport,
    ...overrides,
    salon: {
      ...baseReport.salon,
      ...(overrides.salon || {}),
    },
    summary: {
      ...baseReport.summary,
      ...(overrides.summary || {}),
    },
    byStatus: overrides.byStatus ?? baseReport.byStatus,
    byDay: overrides.byDay ?? baseReport.byDay,
    byStaff: overrides.byStaff ?? baseReport.byStaff,
    topServices: overrides.topServices ?? baseReport.topServices,
  };
}

function renderPage() {
  return renderWithProviders(<SalonReportsPage />);
}

function renderStrictPage() {
  return renderWithProviders(
    <StrictMode>
      <SalonReportsPage />
    </StrictMode>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  exportSalonReportsCsv.mockResolvedValue({
    data: new Blob(["csv"]),
    filename: "salon-reports-north-studio.csv",
  });
});

beforeEach(() => {
  apiGet.mockResolvedValue({ data: baseSalons });
  getSalonReports.mockResolvedValue(buildReport());
  exportSalonReportsCsv.mockResolvedValue({
    data: new Blob(["csv"]),
    filename: "salon-reports-north-studio.csv",
  });
});

describe("SalonReportsPage", () => {
  it("loads salons, reports, and keeps the exact default API parameters", async () => {
    renderPage();

    expect(screen.getByText("Loading salons...")).toBeInTheDocument();

    await waitFor(() => expect(getSalonReports).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "North Studio" })).toBeInTheDocument();
    expect(screen.getByText("Date-range analytics for salon-managed staff.")).toBeInTheDocument();
    expect(screen.getByText("Commission 60/40")).toBeInTheDocument();
    expect(screen.getByText("Fixed — prorated estimate")).toBeInTheDocument();
    expect(screen.getByText("12,000 AMD / weekly")).toBeInTheDocument();
    expect(screen.getByText("Top Services")).toBeInTheDocument();
    expect(screen.getByText("Booking Status Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Daily Breakdown")).toBeInTheDocument();

    expect(getSalonReports).toHaveBeenCalledWith("salon-1", {
      from: get30DaysAgoString(),
      to: getTodayString(),
    });
  });

  it("updates API params when salon, date, and barber filters change", async () => {
    renderPage();
    await waitFor(() => expect(getSalonReports).toHaveBeenCalledTimes(1));
    await screen.findByRole("heading", { name: "North Studio" });

    fireEvent.change(screen.getByLabelText("Salon"), {
      target: { value: "salon-2" },
    });

    await waitFor(() => {
      expect(getSalonReports).toHaveBeenLastCalledWith("salon-2", {
        from: get30DaysAgoString(),
        to: getTodayString(),
      });
    });

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-15" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-08-02" },
    });

    await waitFor(() => {
      expect(getSalonReports).toHaveBeenLastCalledWith("salon-2", {
        from: "2026-07-15",
        to: "2026-08-02",
      });
    });

    fireEvent.change(screen.getByLabelText("Staff member"), {
      target: { value: "barber-2" },
    });

    await waitFor(() => {
      expect(getSalonReports).toHaveBeenLastCalledWith("salon-2", {
        from: "2026-07-15",
        to: "2026-08-02",
        barberId: "barber-2",
      });
    });
  });

  it("keeps stale responses from replacing newer report results", async () => {
    const first = createDeferred();
    const second = createDeferred();
    let callCount = 0;

    getSalonReports.mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? first.promise : second.promise;
    });

    renderPage();
    await waitFor(() => expect(getSalonReports).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Salon"), {
      target: { value: "salon-2" },
    });

    second.resolve(
      buildReport({
        salon: {
          id: "salon-2",
          name: "South Studio",
        },
        range: {
          from: "2026-07-05",
          to: "2026-08-04",
        },
      })
    );

    expect(await screen.findByRole("heading", { name: "South Studio" })).toBeInTheDocument();

    first.resolve(buildReport());
    await first.promise;

    expect(screen.getByRole("heading", { name: "South Studio" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "North Studio" })).not.toBeInTheDocument();
  });

  it("loads and refreshes reports inside React.StrictMode without stale overwrites", async () => {
    const firstReport = createDeferred();
    const secondReport = createDeferred();
    let reportCallCount = 0;

    getSalonReports.mockImplementation(() => {
      reportCallCount += 1;
      return reportCallCount === 1 ? firstReport.promise : secondReport.promise;
    });

    renderStrictPage();

    expect(screen.getByText("Loading salons...")).toBeInTheDocument();
    await waitFor(() => expect(getSalonReports).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Salon"), {
      target: { value: "salon-2" },
    });

    await waitFor(() => {
      expect(getSalonReports).toHaveBeenLastCalledWith("salon-2", {
        from: get30DaysAgoString(),
        to: getTodayString(),
      });
    });

    secondReport.resolve(
      buildReport({
        salon: {
          id: "salon-2",
          name: "South Studio",
        },
      })
    );

    expect(await screen.findByRole("heading", { name: "South Studio" })).toBeInTheDocument();
    expect(screen.getByText("Commission 60/40")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(getSalonReports).toHaveBeenLastCalledWith("salon-2", {
        from: get30DaysAgoString(),
        to: getTodayString(),
      });
      expect(getSalonReports).toHaveBeenCalledTimes(3);
    });

    firstReport.resolve(buildReport());
    await firstReport.promise;

    expect(screen.getByRole("heading", { name: "South Studio" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "North Studio" })).not.toBeInTheDocument();
  });

  it("refreshes the current report with the existing params", async () => {
    renderPage();
    await screen.findByText("North Studio");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(getSalonReports).toHaveBeenCalledTimes(2);
      expect(getSalonReports).toHaveBeenLastCalledWith("salon-1", {
        from: get30DaysAgoString(),
        to: getTodayString(),
      });
    });
  });

  it("shows report and export errors in the existing layout", async () => {
    getSalonReports.mockRejectedValueOnce({
      response: {
        data: {
          message: "Could not load reports.",
          code: "REPORT_FAILED",
        },
      },
    });

    renderPage();

    expect(await screen.findByText("Could not load reports.")).toBeInTheDocument();
    expect(screen.queryByText("Salon subscription required")).not.toBeInTheDocument();
  });

  it("shows the subscription-required state when the backend asks for it", async () => {
    getSalonReports.mockRejectedValueOnce({
      response: {
        data: {
          message: "An active salon subscription is required to access reports",
          code: "SALON_SUBSCRIPTION_REQUIRED",
        },
      },
    });

    renderPage();

    expect(await screen.findByText("Salon subscription required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Salon Billing" })).toHaveAttribute(
      "href",
      "/admin/salon/billing"
    );
  });

  it("shows the empty report state without changing the layout", async () => {
    getSalonReports.mockResolvedValueOnce(
      buildReport({
        byStatus: [],
        byDay: [],
        byStaff: [],
        topServices: [],
      })
    );

    renderPage();

    expect(await screen.findByText("No data in this period")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "North Studio" })).toBeInTheDocument();
    expect(screen.getByText("Report period: 2026-07-05 – 2026-08-04")).toBeInTheDocument();
  });

  it("exports the current filters as CSV", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const appendChild = vi.spyOn(document.body, "appendChild");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderPage();
    await screen.findByText("North Studio");

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(exportSalonReportsCsv).toHaveBeenCalledWith("salon-1", {
        from: get30DaysAgoString(),
        to: getTodayString(),
      });
    });

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:csv");

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    appendChild.mockRestore();
    click.mockRestore();
  });
});
