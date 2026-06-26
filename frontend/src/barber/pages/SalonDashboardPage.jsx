import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CreditCard,
  DollarSign,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import api from "@/shared/api/axios";
import { getSalonDashboard } from "@/shared/api/salonDashboard";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

/* ─── Helpers ─── */

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const getSalonList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.salons)) return data.salons;
  return [];
};

const getSalonId = (salon) => getIdString(salon?.salon || salon);

const getSalonName = (salon) => {
  const salonData = salon?.salon || salon;
  return salonData?.name || salon?.name || "Salon";
};

const getSubscriptionStatusLabel = (status) => {
  if (!status) return "No subscription";
  const labels = {
    active: "Active",
    expired: "Expired",
    pending: "Pending",
    cancelled: "Cancelled",
    grace: "Grace period",
  };
  return labels[status] || status;
};

const formatCurrency = (amount, currency = "AMD") =>
  `${Number(amount || 0).toLocaleString()} ${currency}`;

const formatDate = (value) => {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* ─── Sub-components ─── */

/** A small label + big value widget used inside stat cards. */
function StatWidget({ label, value, icon: Icon, sub }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs font-medium text-neutral-500">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold text-neutral-950">
        {value ?? "—"}
      </div>
      {sub !== undefined && sub !== null && (
        <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>
      )}
    </div>
  );
}

/** Alert row shown in the alerts section. */
function AlertRow({ alert }) {
  const iconMap = {
    warning: AlertTriangle,
    info: null,
    error: AlertTriangle,
  };
  const Icon = iconMap[alert.severity] || null;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
      <span>{alert.message}</span>
    </div>
  );
}

/** Status badge for booking table. */
function StatusBadge({ status }) {
  const colors = {
    pending: "bg-amber-100 text-amber-800",
    confirmed: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    "no-show": "bg-neutral-100 text-neutral-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        colors[status] || "bg-neutral-100 text-neutral-700"
      }`}
    >
      {status?.replace(/_/g, " ") || "unknown"}
    </span>
  );
}

/* ─── Dashboard Page ─── */

export default function SalonDashboardPage() {
  const [salons, setSalons] = useState([]);
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState("");
  const initialLoadDone = useRef(false);

  // Load manageable salons once on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchSalons() {
      setLoadingSalons(true);
      try {
        const { data } = await api.get("/salons/mine/manageable");
        const nextSalons = getSalonList(data);

        if (isMounted) {
          setSalons(nextSalons);
          if (nextSalons.length > 0) {
            setSelectedSalonId(getSalonId(nextSalons[0]));
          }
          setError("");
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError?.response?.data?.message || "Could not load salons."
          );
        }
      } finally {
        if (isMounted) {
          setLoadingSalons(false);
          initialLoadDone.current = true;
        }
      }
    }

    fetchSalons();

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch dashboard when selectedSalonId changes
  useEffect(() => {
    if (!selectedSalonId) return;

    let isMounted = true;

    async function fetchDashboard() {
      setLoadingDashboard(true);
      try {
        const data = await getSalonDashboard(selectedSalonId);
        if (isMounted) {
          setDashboard(data);
          setError("");
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError?.response?.data?.message || "Could not load dashboard."
          );
        }
      } finally {
        if (isMounted) {
          setLoadingDashboard(false);
        }
      }
    }

    fetchDashboard();
  }, [selectedSalonId]);

  const handleSalonChange = (salonId) => {
    setSelectedSalonId(salonId);
    setDashboard(null);
  };

  const handleRefresh = () => {
    if (!selectedSalonId) return;

    setLoadingDashboard(true);
    getSalonDashboard(selectedSalonId)
      .then((data) => {
        setDashboard(data);
        setError("");
      })
      .catch((requestError) => {
        setError(
          requestError?.response?.data?.message || "Could not load dashboard."
        );
      })
      .finally(() => setLoadingDashboard(false));
  };

  const subscription = dashboard?.subscriptionSummary || dashboard?.subscription || null;
  const staff = dashboard?.staffSummary || dashboard?.staff || null;
  const bookings = dashboard?.bookingSummary || null;
  const revenue = dashboard?.revenueSummary || null;
  const reviews = dashboard?.reviewSummary || null;
  const alerts = dashboard?.alerts || [];
  const upcomingBookings = dashboard?.upcomingBookings || [];
  const salonInfo = dashboard?.salon || null;

  /* ── Render ── */

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/80 to-neutral-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* ─── Gradient header ─── */}
        <Card className="overflow-hidden rounded-3xl border-0 shadow-lg">
          <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">Salon Dashboard</h1>
                <p className="mt-1 text-sm text-purple-100">
                  Overview of salon performance and team.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  className="text-sm font-semibold text-white/80 underline underline-offset-2 transition hover:text-white"
                  to={selectedSalonId ? `/admin/salon/reports?salonId=${selectedSalonId}` : "/admin/salon/reports"}
                >
                  Salon Reports
                </Link>
                <Button
                  className="gap-2 bg-white/20 text-white hover:bg-white/30"
                  disabled={!selectedSalonId || loadingDashboard}
                  onClick={handleRefresh}
                  variant="outline"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loadingDashboard ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Error ─── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ─── Loading salons ─── */}
        {loadingSalons ? (
          <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
            <CardContent className="text-sm text-neutral-500 p-5">
              Loading salons...
            </CardContent>
          </Card>
        ) : salons.length === 0 ? (
          /* ─── No manageable salons ─── */
          <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-neutral-300" />
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950">
                    No manageable salons
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Salon dashboard appears after you own or administer a salon.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ─── Salon selector ─── */}
            {salons.length > 1 && (
              <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                <CardContent className="p-5">
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700">
                      Salon
                    </span>
                    <select
                      className="mt-1 h-11 w-full max-w-xs rounded-xl border border-purple-100 bg-white px-3 text-sm outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                      onChange={(event) =>
                        handleSalonChange(event.target.value)
                      }
                      value={selectedSalonId}
                    >
                      {salons.map((salon) => (
                        <option
                          key={getSalonId(salon)}
                          value={getSalonId(salon)}
                        >
                          {getSalonName(salon)}
                        </option>
                      ))}
                    </select>
                  </label>
                </CardContent>
              </Card>
            )}

            {/* ─── Dashboard content ─── */}
            {loadingDashboard ? (
              <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                <CardContent className="p-5 text-sm text-neutral-500">
                  Loading dashboard data...
                </CardContent>
              </Card>
            ) : !dashboard ? (
              <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                <CardContent className="p-5 text-sm text-neutral-500">
                  No dashboard data available.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* ─── Salon summary card ─── */}
                {salonInfo && (
                  <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                    <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
                      <h2 className="font-bold text-white">Salon</h2>
                    </div>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {salonInfo.imageUrl ? (
                          <img
                            alt={salonInfo.name}
                            className="h-14 w-14 rounded-xl object-cover ring-2 ring-purple-200"
                            src={salonInfo.imageUrl}
                          />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-100">
                            <Building2 className="h-6 w-6 text-purple-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h2 className="text-xl font-bold text-neutral-950">
                            {salonInfo.name}
                          </h2>
                          {salonInfo.city && (
                            <p className="text-sm text-neutral-500">
                              {salonInfo.city}
                              {salonInfo.address
                                ? `, ${salonInfo.address}`
                                : ""}
                            </p>
                          )}
                          {salonInfo.phone && (
                            <p className="text-sm text-neutral-500">
                              {salonInfo.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ─── Alerts ─── */}
                {alerts.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                      Alerts
                    </h3>
                    <div className="space-y-2">
                      {alerts.map((alert, idx) => (
                        <AlertRow alert={alert} key={idx} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── Stats grid ─── */}
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                  {/* Subscription card */}
                  <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                    <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
                      <CreditCard className="h-5 w-5 text-purple-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Subscription
                      </h3>
                    </div>
                    <CardContent className="space-y-4 p-5">
                      <div className="grid grid-cols-2 gap-3">
                        <StatWidget
                          label="Status"
                          value={getSubscriptionStatusLabel(subscription?.status)}
                        />
                        <StatWidget
                          label="Days remaining"
                          value={
                            subscription?.daysRemaining !== null &&
                            subscription?.daysRemaining !== undefined
                              ? subscription.daysRemaining
                              : "—"
                          }
                        />
                        <StatWidget
                          label="Paid seats"
                          value={subscription?.seatCount ?? 0}
                        />
                        <StatWidget
                          label="Used seats"
                          value={subscription?.usedSeats ?? 0}
                        />
                        <StatWidget
                          label="Available seats"
                          value={subscription?.availableSeats ?? 0}
                        />
                      </div>
                      {(subscription?.isExpired ||
                        subscription?.isExpiringSoon) && (
                        <div
                          className={`rounded-xl border p-3 text-xs ${
                            subscription.isExpired
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                          }`}
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {subscription.isExpired
                              ? "Salon subscription expired"
                              : `Expiring in ${subscription.daysRemaining} day(s)`}
                          </div>
                          <Link
                            className="mt-1 block underline underline-offset-2 transition hover:opacity-70"
                            to="/admin/salon/billing"
                          >
                            Go to Salon Billing
                          </Link>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Staff card */}
                  <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                    <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
                      <Users className="h-5 w-5 text-purple-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Staff
                      </h3>
                    </div>
                    <CardContent className="space-y-4 p-5">
                      <div className="grid grid-cols-2 gap-3">
                        <StatWidget
                          label="Approved staff"
                          value={staff?.totalApprovedStaff ?? 0}
                        />
                        <StatWidget
                          label="Chair renters"
                          value={staff?.totalChairRenters ?? 0}
                        />
                        <StatWidget
                          label="Pending requests"
                          value={staff?.totalPendingRequests ?? 0}
                          sub={
                            staff?.totalPendingRequests > 0
                              ? "Review in salon settings"
                              : undefined
                          }
                        />
                        <StatWidget
                          label="Staff without seat"
                          value={staff?.staffWithoutSeat ?? 0}
                          sub={
                            staff?.staffWithoutSeat > 0
                              ? "Assign seats in billing"
                              : undefined
                          }
                        />
                      </div>
                      {staff?.staffWithoutSeat > 0 && (
                        <Link
                          className="block rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 underline underline-offset-2 transition hover:opacity-70"
                          to="/admin/salon/billing"
                        >
                          {staff.staffWithoutSeat} staff member(s) without an
                          active seat. Assign seats in Salon Billing.
                        </Link>
                      )}
                      {staff?.totalPendingRequests > 0 && (
                        <Link
                          className="block rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 underline underline-offset-2 transition hover:opacity-70"
                          to="/admin/settings/salon"
                        >
                          {staff.totalPendingRequests} pending join request(s).
                          Review in salon settings.
                        </Link>
                      )}
                    </CardContent>
                  </Card>

                  {/* Booking card */}
                  <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                    <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
                      <CalendarCheck className="h-5 w-5 text-purple-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Bookings
                      </h3>
                    </div>
                    <CardContent className="space-y-4 p-5">
                      <div className="grid grid-cols-2 gap-3">
                        <StatWidget
                          icon={CalendarCheck}
                          label="Today"
                          value={bookings?.todayBookings ?? 0}
                        />
                        <StatWidget
                          label="Upcoming"
                          value={bookings?.upcomingBookingsCount ?? 0}
                        />
                        <StatWidget
                          label="Pending"
                          value={bookings?.pendingBookings ?? 0}
                        />
                        <StatWidget
                          label="Completed (month)"
                          value={bookings?.completedThisMonth ?? 0}
                        />
                        <StatWidget
                          label="Cancelled (month)"
                          value={bookings?.cancelledThisMonth ?? 0}
                        />
                        <StatWidget
                          label="No-show (month)"
                          value={bookings?.noShowThisMonth ?? 0}
                        />
                      </div>
                      {bookings?.rejectedThisMonth > 0 && (
                        <p className="text-xs text-neutral-500">
                          + {bookings.rejectedThisMonth} rejected this month
                        </p>
                      )}
                      {bookings?.lateCancelledThisMonth > 0 && (
                        <p className="text-xs text-neutral-500">
                          + {bookings.lateCancelledThisMonth} late cancellations
                          this month
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Revenue card */}
                  <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                    <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
                      <DollarSign className="h-5 w-5 text-purple-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Revenue
                      </h3>
                    </div>
                    <CardContent className="space-y-4 p-5">
                      <p className="text-xs text-neutral-500">
                        From completed bookings only (staff).
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <StatWidget
                          label="Today"
                          value={formatCurrency(revenue?.todayRevenue ?? 0)}
                        />
                        <StatWidget
                          label="This month"
                          value={formatCurrency(revenue?.monthRevenue ?? 0)}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Reviews card */}
                  <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                    <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
                      <Star className="h-5 w-5 text-purple-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Reviews
                      </h3>
                    </div>
                    <CardContent className="space-y-4 p-5">
                      <div className="grid grid-cols-2 gap-3">
                        <StatWidget
                          label="Average rating"
                          value={
                            reviews?.averageRating
                              ? Number(reviews.averageRating).toFixed(1)
                              : "—"
                          }
                        />
                        <StatWidget
                          label="Total reviews"
                          value={reviews?.totalReviews ?? 0}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ─── Upcoming bookings ─── */}
                <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-5 w-5 text-purple-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Upcoming Bookings
                      </h3>
                    </div>
                    {selectedSalonId && (
                      <Link
                        className="text-sm font-semibold text-purple-600 underline underline-offset-2 transition hover:text-purple-800"
                        to={`/admin/salon/calendar?salonId=${selectedSalonId}`}
                      >
                        Open Salon Calendar
                      </Link>
                    )}
                  </div>
                  <CardContent className="p-5">
                    {upcomingBookings.length === 0 ? (
                      <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">
                        No upcoming bookings.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                              <th className="pb-2 pr-3">Client</th>
                              <th className="pb-2 pr-3">Barber</th>
                              <th className="pb-2 pr-3">Service</th>
                              <th className="pb-2 pr-3">Date</th>
                              <th className="pb-2 pr-3">Time</th>
                              <th className="pb-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {upcomingBookings.map((booking) => (
                              <tr
                                className="border-b border-neutral-100 last:border-0"
                                key={booking.id}
                              >
                                <td className="py-2 pr-3 font-medium text-neutral-950">
                                  {booking.clientName}
                                </td>
                                <td className="py-2 pr-3 text-neutral-700">
                                  {booking.barberName}
                                </td>
                                <td className="py-2 pr-3 text-neutral-700">
                                  {booking.serviceName}
                                </td>
                                <td className="py-2 pr-3 text-neutral-700">
                                  {formatDate(booking.date)}
                                </td>
                                <td className="py-2 pr-3 text-neutral-700">
                                  {formatTime(booking.time || booking.date)}
                                </td>
                                <td className="py-2">
                                  <StatusBadge status={booking.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
