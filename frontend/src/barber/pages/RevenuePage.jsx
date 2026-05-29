import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import { getMyRevenue } from "@/shared/api/revenue";
import { Card, CardContent } from "@/shared/components/ui/card";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (amount) =>
  `${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} AMD`;

const getToday = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getWeekRange = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { from: fmt(monday), to: fmt(sunday) };
};

const getMonthRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const from = `${y}-${m}-01`;
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
};

const datePresets = [
  { label: "Today", getRange: () => {
    const today = getToday();
    return { from: today, to: today };
  }},
  { label: "This Week", getRange: getWeekRange },
  { label: "This Month", getRange: getMonthRange },
];

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, subtitle, accent }) {
  const borderColor =
    accent === "emerald"
      ? "border-emerald-400"
      : accent === "blue"
        ? "border-blue-400"
        : accent === "purple"
          ? "border-purple-400"
          : "border-neutral-300";

  return (
    <div className={`rounded-xl border-l-4 ${borderColor} bg-white p-4 shadow-sm`}>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat row component for tables
// ---------------------------------------------------------------------------

function StatRow({ label, value, barMax, accent }) {
  const pct = barMax > 0 ? Math.min((value / barMax) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-1/3 truncate text-sm text-neutral-700">{label}</span>
      <div className="flex-1">
        <div className="h-2 w-full rounded-full bg-neutral-100">
          <div
            className={`h-2 rounded-full ${accent === "emerald" ? "bg-emerald-400" : "bg-blue-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="w-24 text-right text-sm font-medium text-neutral-800">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-neutral-100" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-neutral-100" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-neutral-100" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RevenuePage() {
  const { currentUser } = useSelector((state) => state.auth);
  const [revenueData, setRevenueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(() => getMonthRange().from);
  const [to, setTo] = useState(() => getMonthRange().to);
  const [activePreset, setActivePreset] = useState("This Month");

  const fetchRevenue = useCallback(async (range, signal) => {
    if (!currentUser?._id && !currentUser?.id) return;

    setLoading(true);
    setError("");

    try {
      const data = await getMyRevenue({
        from: range.from,
        to: range.to,
      });
      if (signal?.aborted) return;
      setRevenueData(data);
      setFrom(range.from);
      setTo(range.to);
    } catch (err) {
      if (signal?.aborted) return;
      setError(
        err.response?.data?.message || "Could not load revenue data"
      );
      setRevenueData(null);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;
    const range = getMonthRange();

    (async () => {
      setLoading(true);
      setError("");

      try {
        const data = await getMyRevenue({
          from: range.from,
          to: range.to,
        });
        if (signal.aborted) return;
        setRevenueData(data);
        setFrom(range.from);
        setTo(range.to);
      } catch (err) {
        if (signal.aborted) return;
        setError(
          err.response?.data?.message || "Could not load revenue data"
        );
        setRevenueData(null);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [currentUser]);

  const handlePreset = useCallback(
    (preset) => {
      setActivePreset(preset.label);
      fetchRevenue(preset.getRange());
    },
    [fetchRevenue]
  );

  const handleCustomDate = useCallback(() => {
    setActivePreset("");
    fetchRevenue({ from, to });
  }, [fetchRevenue, from, to]);

  const formatDateDisplay = useCallback((dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
  }, []);

  // ── Metrics ──

  const totalRevenue = revenueData?.totalRevenue ?? 0;
  const completedCount = revenueData?.completedBookingsCount ?? 0;
  const avgValue = revenueData?.averageBookingValue ?? 0;
  const revenueByDay = revenueData?.revenueByDay ?? [];
  const topByRevenue = revenueData?.topServicesByRevenue ?? [];
  const topByCount = revenueData?.topServicesByCount ?? [];
  const statusBreakdown = revenueData?.statusBreakdown ?? {};

  const maxDailyRevenue = useMemo(
    () => Math.max(...revenueByDay.map((d) => d.revenue), 0),
    [revenueByDay]
  );

  const maxServiceRevenue = useMemo(
    () => Math.max(...topByRevenue.map((s) => s.revenue), 0),
    [topByRevenue]
  );

  const maxServiceCount = useMemo(
    () => Math.max(...topByCount.map((s) => s.count), 0),
    [topByCount]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-xl font-bold text-neutral-900">Revenue Dashboard</h1>

      {/* ── Date controls ── */}
      <div className="flex flex-wrap items-center gap-2">
        {datePresets.map((preset) => (
          <button
            key={preset.label}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activePreset === preset.label
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
            onClick={() => handlePreset(preset)}
            type="button"
          >
            {preset.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-neutral-500">From</label>
          <input
            className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <label className="text-xs text-neutral-500">To</label>
          <input
            className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700"
            onClick={handleCustomDate}
            type="button"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ── Date range label ── */}
      {revenueData && !loading && (
        <p className="text-xs text-neutral-400">
          Showing data from {formatDateDisplay(revenueData.from)} to{" "}
          {formatDateDisplay(revenueData.to)}
        </p>
      )}

      {loading && <Skeleton />}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && revenueData && (
        <>
          {/* ── Summary cards ── */}
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              accent="emerald"
              label="Total Revenue"
              value={formatCurrency(totalRevenue)}
              subtitle={`${completedCount} completed bookings`}
            />
            <SummaryCard
              accent="blue"
              label="Completed Bookings"
              value={completedCount}
              subtitle={`Avg ${formatCurrency(avgValue)} per booking`}
            />
            <SummaryCard
              accent="purple"
              label="Average Booking Value"
              value={formatCurrency(avgValue)}
            />
          </div>

          {/* ── Revenue by Day ── */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-neutral-700">
                Revenue by Day
              </h2>
              {revenueByDay.length === 0 ? (
                <p className="text-sm text-neutral-400">
                  No completed bookings in this period.
                </p>
              ) : (
                <div className="space-y-2">
                  {revenueByDay.map((day) => (
                    <StatRow
                      key={day.date}
                      label={formatDateDisplay(day.date)}
                      value={`${formatCurrency(day.revenue)} (${day.count})`}
                      barMax={maxDailyRevenue}
                      accent="emerald"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Top Services ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4 sm:p-5">
                <h2 className="mb-3 text-sm font-semibold text-neutral-700">
                  Top Services by Revenue
                </h2>
                {topByRevenue.length === 0 ? (
                  <p className="text-sm text-neutral-400">No data.</p>
                ) : (
                  <div className="space-y-2">
                    {topByRevenue.map((svc) => (
                      <StatRow
                        key={svc.serviceName}
                        label={svc.serviceName}
                        value={`${formatCurrency(svc.revenue)} (${svc.count})`}
                        barMax={maxServiceRevenue}
                        accent="blue"
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <h2 className="mb-3 text-sm font-semibold text-neutral-700">
                  Top Services by Count
                </h2>
                {topByCount.length === 0 ? (
                  <p className="text-sm text-neutral-400">No data.</p>
                ) : (
                  <div className="space-y-2">
                    {topByCount.map((svc) => (
                      <StatRow
                        key={svc.serviceName}
                        label={svc.serviceName}
                        value={`${svc.count} (${formatCurrency(svc.revenue)})`}
                        barMax={maxServiceCount}
                        accent="blue"
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Status breakdown ── */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-neutral-700">
                Status Breakdown
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(statusBreakdown).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2"
                  >
                    <span className="text-xs capitalize text-neutral-500">
                      {status.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-semibold text-neutral-800">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!loading && !error && !revenueData && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-neutral-400">No data available.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
