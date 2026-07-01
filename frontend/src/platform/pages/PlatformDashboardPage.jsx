import {
  AlertTriangle,
  Banknote,
  Building2,
  Calendar,
  CreditCard,
  RefreshCw,
  Users,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { getPlatformDashboardSummary } from "@/shared/api/platformBilling";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";

/* ─── Helpers ─── */

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatCurrency = (amount = 0, currency = "AMD") =>
  `${Number(amount || 0).toLocaleString()} ${currency || "AMD"}`;

const formatMoney = (money) => {
  if (!money) return "0 AMD";
  if (money.currency === "MIXED" && Array.isArray(money.byCurrency)) {
    return money.byCurrency
      .map((entry) => formatCurrency(entry.amount, entry.currency))
      .join(" + ");
  }
  return formatCurrency(money.amount, money.currency);
};

const getStatusBadge = (status) => {
  const colors = {
    active: "bg-green-100 text-green-800",
    trialing: "bg-blue-100 text-blue-800",
    expired: "bg-red-100 text-red-800",
    past_due: "bg-amber-100 text-amber-800",
    cancelled: "bg-neutral-100 text-neutral-700",
  };
  return colors[status] || "bg-neutral-100 text-neutral-700";
};

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
        <Icon className="h-4 w-4 text-purple-500" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-neutral-950">{value ?? "—"}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

/* ─── Main Page ─── */

export default function PlatformDashboardPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    getPlatformDashboardSummary()
      .then((data) => {
        if (isMounted) {
          setSummary(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Could not load dashboard summary.");
          setLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, []);

  const fetchSummary = () => {
    getPlatformDashboardSummary()
      .then((data) => {
        setSummary(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load dashboard summary.");
        setLoading(false);
      });
  };

  const overview = summary?.overview || {};
  const revenue = summary?.revenueThisMonth || {};
  const payments = summary?.recentPayments || [];
  const alertGroups = summary?.alerts || {};
  const alerts = [
    ...(alertGroups.expired || []),
    ...(alertGroups.pastDue || []),
  ];

  const isPlatformAdmin = Boolean(currentUser?.platformRole === "superuser");

  if (!isPlatformAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md rounded-3xl border-0 shadow-lg">
          <CardContent className="space-y-4 p-6 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-neutral-300" />
            <h2 className="text-lg font-bold text-neutral-950">Access Denied</h2>
            <p className="text-sm text-neutral-500">
              Platform admin privileges required.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/80 to-neutral-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Header */}
        <Card className="overflow-hidden rounded-3xl border-0 shadow-lg">
          <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">Platform Dashboard</h1>
                <p className="mt-1 text-sm text-purple-100">
                  High-level overview of salon and individual subscriptions.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/admin/platform/billing/salons"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/30"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Salon Billing
                </Link>
                <Button
                  className="gap-2 bg-white/20 text-white hover:bg-white/30"
                  disabled={loading}
                  onClick={fetchSummary}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
            <button
              className="ml-3 font-semibold underline underline-offset-2"
              onClick={fetchSummary}
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
            <CardContent className="p-5 text-sm text-neutral-500">
              Loading dashboard data...
            </CardContent>
          </Card>
        )}

        {/* Dashboard content */}
        {!loading && !error && summary && (
          <div className="space-y-6">
            {/* Overview cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
              <StatCard
                icon={Building2}
                label="Total salons"
                value={overview.totalSalons ?? 0}
              />
              <StatCard
                icon={Users}
                label="Total individuals"
                value={overview.totalBarbers ?? 0}
              />
              <StatCard
                icon={CreditCard}
                label="Active salon subs"
                value={overview.activeSalonSubscriptions ?? 0}
              />
              <StatCard
                icon={CreditCard}
                label="Active individual subs"
                value={overview.activeIndividualSubscriptions ?? 0}
              />
              <StatCard
                icon={Calendar}
                label="Trial subscriptions"
                value={overview.trialSubscriptions ?? 0}
              />
              <StatCard
                icon={AlertTriangle}
                label="Expired subscriptions"
                value={overview.expiredSubscriptions ?? 0}
              />
            </div>

            {/* Revenue this month */}
            <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
              <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
                <DollarSign className="h-5 w-5 text-purple-500" />
                <h2 className="font-semibold text-neutral-950">
                  Revenue this month
                </h2>
              </div>
              <CardContent className="space-y-3 p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                    <div className="text-xs font-medium text-neutral-500">
                      Salon revenue
                    </div>
                    <div className="text-lg font-bold text-neutral-950">
                      {formatMoney(revenue.salon)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                    <div className="text-xs font-medium text-neutral-500">
                      Individual revenue
                    </div>
                    <div className="text-lg font-bold text-neutral-950">
                      {formatMoney(revenue.individual)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                    <div className="text-xs font-medium text-neutral-500">
                      Total revenue
                    </div>
                    <div className="text-lg font-bold text-neutral-950">
                      {formatMoney(revenue.total)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent payments */}
            <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
              <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
                <Banknote className="h-5 w-5 text-purple-500" />
                <h2 className="font-semibold text-neutral-950">Recent payments</h2>
              </div>
              <CardContent className="p-5">
                {payments.length === 0 ? (
                  <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">
                    No recent payments.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {payments.map((payment) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-100 p-3 text-sm"
                        key={payment.id}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-neutral-900">
                            {payment.ownerName || payment.ownerEmail || "Unknown"}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {payment.ownerType === "salon" ? "Salon" : "Individual"}
                            {payment.source ? ` · ${payment.source}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-neutral-950">
                            {formatCurrency(payment.amount, payment.currency)}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {payment.status === "paid" ? "Paid" : payment.status || "—"}
                          </div>
                        </div>
                        <div className="text-xs text-neutral-400">
                          {formatDate(payment.paidAt || payment.createdAt)}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadge(payment.status)}`}
                        >
                          {payment.status || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Alerts */}
            {alerts.length > 0 && (
              <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <h2 className="font-semibold text-neutral-950">
                    Alerts ({alerts.length})
                  </h2>
                </div>
                <CardContent className="space-y-2 p-5">
                  {alerts.map((alert, index) => (
                    <div
                      className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm"
                      key={`${alert.ownerType}-${alert.ownerName}-${alert.status}-${alert.currentPeriodEnd || index}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-amber-900">
                            {alert.ownerName || alert.ownerEmail || "Unknown"}
                          </div>
                          <div className="text-xs text-amber-700">
                            {alert.ownerType === "salon" ? "Salon" : "Individual"}
                            {" · "}
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${getStatusBadge(alert.status)}`}
                            >
                              {alert.status || "expired"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-amber-600">
                            Period end: {formatDate(alert.currentPeriodEnd)}
                          </div>
                        </div>
                        <Link
                          className="shrink-0 text-xs font-semibold text-amber-800 underline underline-offset-2 transition hover:text-amber-950"
                          to="/admin/platform/billing/salons"
                        >
                          View billing
                        </Link>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* No data state */}
            {!summary && !loading && !error && (
              <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                <CardContent className="p-5 text-center text-sm text-neutral-500">
                  No dashboard data available.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
