import {
  Building2,
  CalendarCheck,
  Download,
  DollarSign,
  RefreshCw,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import api from "@/shared/api/axios";
import {
  exportSalonReportsCsv,
  getSalonReports,
} from "@/shared/api/salonReports";
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

const formatCurrency = (amount, currency = "AMD") =>
  `${Number(amount || 0).toLocaleString()} ${currency}`;

const formatPaymentLabel = (staff) => {
  if (staff.paymentType === "commission") {
    const staffPercent = staff.commissionStaffPercent;
    const salonPercent = staff.commissionSalonPercent;

    if (
      staffPercent !== null &&
      staffPercent !== undefined &&
      salonPercent !== null &&
      salonPercent !== undefined
    ) {
      return `Commission ${staffPercent}/${salonPercent}`;
    }

    return "Commission";
  }

  if (staff.paymentType === "fixed") {
    return "Fixed — prorated estimate";
  }

  return "Not configured";
};

const formatFixedPaymentSub = (staff) => {
  if (
    staff.paymentType !== "fixed" ||
    staff.fixedAmount === null ||
    staff.fixedAmount === undefined
  ) {
    return "";
  }

  const period = staff.fixedPeriod ? ` / ${staff.fixedPeriod}` : "";
  return `${formatCurrency(staff.fixedAmount)}${period}`;
};

const getTodayString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const get30DaysAgoString = () => {
  const past = new Date();
  past.setDate(past.getDate() - 30);
  const y = past.getFullYear();
  const m = String(past.getMonth() + 1).padStart(2, "0");
  const d = String(past.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/* ─── Stat Widget ─── */

function StatWidget({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-neutral-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-neutral-950">
        {value ?? "—"}
      </div>
      {sub !== undefined && sub !== null && (
        <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>
      )}
    </div>
  );
}

/* ─── Reports Page ─── */

export default function SalonReportsPage() {
  const [salons, setSalons] = useState([]);
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [reports, setReports] = useState(null);
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [exportError, setExportError] = useState("");
  const initialLoadDone = useRef(false);

  // Date filter state
  const [fromDate, setFromDate] = useState(get30DaysAgoString);
  const [toDate, setToDate] = useState(getTodayString);
  const [selectedBarberId, setSelectedBarberId] = useState("");

  // Staff list (accepted staff only — fetched from the first response or separately)
  const [staffOptions, setStaffOptions] = useState([]);

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
          setErrorCode("");
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError?.response?.data?.message || "Could not load salons."
          );
          setErrorCode("");
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

  // Fetch reports when filters change
  useEffect(() => {
    if (!selectedSalonId || !fromDate || !toDate) return;

    let isMounted = true;

    async function fetchReports() {
      setLoadingReports(true);
      try {
        const params = { from: fromDate, to: toDate };
        if (selectedBarberId) {
          params.barberId = selectedBarberId;
        }

        const data = await getSalonReports(selectedSalonId, params);
        if (isMounted) {
          setReports(data);
          setError("");
          setErrorCode("");
          setExportError("");

          // Extract staff options from the byStaff response (only staff, no chair_renters)
          if (data.byStaff && data.byStaff.length > 0) {
            setStaffOptions(
              data.byStaff.map((s) => ({
                _id: s.barberId,
                name: s.barberName,
              }))
            );
          }
        }
      } catch (requestError) {
        if (isMounted) {
          setReports(null);
          setError(
            requestError?.response?.data?.message || "Could not load reports."
          );
          setErrorCode(requestError?.response?.data?.code || "");
        }
      } finally {
        if (isMounted) {
          setLoadingReports(false);
        }
      }
    }

    fetchReports();
  }, [selectedSalonId, fromDate, toDate, selectedBarberId]);

  const handleSalonChange = (salonId) => {
    setSelectedSalonId(salonId);
    setSelectedBarberId("");
    setReports(null);
    setStaffOptions([]);
    setErrorCode("");
    setExportError("");
  };

  const handleRefresh = () => {
    if (!selectedSalonId || !fromDate || !toDate) return;
    setLoadingReports(true);
    const params = { from: fromDate, to: toDate };
    if (selectedBarberId) params.barberId = selectedBarberId;

    getSalonReports(selectedSalonId, params)
      .then((data) => {
        setReports(data);
        setError("");
        setErrorCode("");
        setExportError("");
        if (data.byStaff && data.byStaff.length > 0) {
          setStaffOptions(
            data.byStaff.map((s) => ({
              _id: s.barberId,
              name: s.barberName,
            }))
          );
        }
      })
      .catch((requestError) => {
        setReports(null);
        setError(
          requestError?.response?.data?.message || "Could not load reports."
        );
        setErrorCode(requestError?.response?.data?.code || "");
      })
      .finally(() => {
        setLoadingReports(false);
      });
  };

  const handleExportCsv = async () => {
    if (!selectedSalonId || !fromDate || !toDate) return;

    setExportingCsv(true);
    setExportError("");

    try {
      const params = { from: fromDate, to: toDate };
      if (selectedBarberId) params.barberId = selectedBarberId;

      const { data, filename } = await exportSalonReportsCsv(
        selectedSalonId,
        params
      );
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not export salon reports.");
    } finally {
      setExportingCsv(false);
    }
  };

  const summary = reports?.summary || null;
  const byStatus = reports?.byStatus || [];
  const byDay = reports?.byDay || [];
  const byStaff = reports?.byStaff || [];
  const topServices = reports?.topServices || [];
  const isSubscriptionRequiredError =
    errorCode === "SALON_SUBSCRIPTION_REQUIRED";

  /* ── Render ── */

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Salon Reports
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Date-range analytics for salon-managed staff.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            disabled={
              !selectedSalonId ||
              !fromDate ||
              !toDate ||
              loadingReports ||
              exportingCsv
            }
            onClick={handleExportCsv}
            variant="outline"
          >
            <Download
              className={`h-4 w-4 ${exportingCsv ? "animate-pulse" : ""}`}
            />
            {exportingCsv ? "Exporting..." : "Export CSV"}
          </Button>
          <Button
            className="gap-2"
            disabled={!selectedSalonId || loadingReports}
            onClick={handleRefresh}
            variant="outline"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingReports ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Error ─── */}
      {error && !isSubscriptionRequiredError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {exportError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {exportError}
        </div>
      )}

      {/* ─── Loading salons ─── */}
      {loadingSalons ? (
        <Card>
          <CardContent className="text-sm text-neutral-500">
            Loading salons...
          </CardContent>
        </Card>
      ) : salons.length === 0 ? (
        /* ─── No manageable salons ─── */
        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-neutral-300" />
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">
                  No manageable salons
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Salon reports appear after you own or administer a salon.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Filters ─── */}
          <Card>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                {/* Salon selector */}
                {salons.length > 1 && (
                  <div>
                    <label className="block">
                      <span className="text-sm font-medium text-neutral-700">
                        Salon
                      </span>
                      <select
                        className="mt-1 h-11 w-full max-w-xs rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
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
                  </div>
                )}

                {/* From date */}
                <div>
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700">
                      From
                    </span>
                    <input
                      className="mt-1 h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </label>
                </div>

                {/* To date */}
                <div>
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700">
                      To
                    </span>
                    <input
                      className="mt-1 h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </label>
                </div>

                {/* Staff filter */}
                <div>
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-700">
                      Staff member
                    </span>
                    <select
                      className="mt-1 h-11 w-full max-w-xs rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                      onChange={(e) => setSelectedBarberId(e.target.value)}
                      value={selectedBarberId}
                    >
                      <option value="">All staff</option>
                      {staffOptions.map((staff) => (
                        <option key={staff._id} value={staff._id}>
                          {staff.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Reports content ─── */}
          {loadingReports ? (
            <Card>
              <CardContent className="text-sm text-neutral-500">
                Loading reports...
              </CardContent>
            </Card>
          ) : isSubscriptionRequiredError ? (
            <Card>
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-950">
                      Salon subscription required
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      Activate a salon subscription to view reports.
                    </p>
                  </div>
                  <Button as={Link} to="/admin/salon/billing">
                    Go to Salon Billing
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : !reports ? (
            <Card>
              <CardContent className="text-sm text-neutral-500">
                No report data available. Adjust the date range and try again.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5 sm:space-y-6">
              {/* ─── Salon info ─── */}
              {reports.salon && (
                <Card>
                  <CardContent>
                    <div className="flex items-start gap-4">
                      {reports.salon.imageUrl ? (
                        <img
                          alt={reports.salon.name}
                          className="h-14 w-14 rounded-xl object-cover"
                          src={reports.salon.imageUrl}
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-neutral-100">
                          <Building2 className="h-6 w-6 text-neutral-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-bold text-neutral-950">
                          {reports.salon.name}
                        </h2>
                        {reports.salon.city && (
                          <p className="text-sm text-neutral-500">
                            {reports.salon.city}
                            {reports.salon.address
                              ? `, ${reports.salon.address}`
                              : ""}
                          </p>
                        )}
                        {reports.range && (
                          <p className="mt-1 text-xs text-neutral-400">
                            Report period: {reports.range.from} &ndash;{" "}
                            {reports.range.to}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ─── Summary cards ─── */}
              {summary && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <StatWidget
                    icon={CalendarCheck}
                    label="Total bookings"
                    value={summary.totalBookings}
                  />
                  <StatWidget
                    icon={CalendarCheck}
                    label="Completed"
                    value={summary.completedBookings}
                  />
                  <StatWidget
                    icon={DollarSign}
                    label="Total revenue"
                    value={formatCurrency(summary.totalRevenue)}
                    sub="From completed bookings"
                  />
                  <StatWidget
                    icon={DollarSign}
                    label="Gross revenue"
                    value={formatCurrency(summary.grossRevenue)}
                    sub="Completed booking gross"
                  />
                  <StatWidget
                    icon={DollarSign}
                    label="Staff earnings"
                    value={formatCurrency(summary.staffEarningsTotal)}
                  />
                  <StatWidget
                    icon={DollarSign}
                    label="Salon earnings"
                    value={formatCurrency(summary.salonEarningsTotal)}
                  />
                  {Number(summary.fixedPayProratedCount || 0) > 0 && (
                    <StatWidget
                      icon={DollarSign}
                      label="Fixed prorated"
                      value={summary.fixedPayProratedCount}
                      sub="Report activity estimate"
                    />
                  )}
                  <StatWidget
                    icon={DollarSign}
                    label="Avg booking value"
                    value={formatCurrency(summary.averageBookingValue)}
                  />
                  <StatWidget
                    icon={Users}
                    label="Unique clients"
                    value={summary.uniqueClients}
                  />
                </div>
              )}

              {/* ─── Status breakdown ─── */}
              {byStatus.length > 0 && (
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-neutral-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Booking Status Breakdown
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                            <th className="pb-2 pr-3">Status</th>
                            <th className="pb-2">Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byStatus.map((item) => (
                            <tr
                              className="border-b border-neutral-100 last:border-0"
                              key={item.status}
                            >
                              <td className="py-2 pr-3 font-medium capitalize text-neutral-950">
                                {item.status.replace(/_/g, " ")}
                              </td>
                              <td className="py-2 text-neutral-700">
                                {item.count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {summary && (
                      <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-500">
                        Total: {summary.totalBookings} booking(s) &middot;{" "}
                        {summary.completedBookings} completed &middot;{" "}
                        {summary.cancelledBookings} cancelled &middot;{" "}
                        {summary.noShowBookings} no-show &middot;{" "}
                        {summary.pendingBookings} pending &middot;{" "}
                        {summary.acceptedBookings} accepted &middot;{" "}
                        {summary.lateCancelledBookings} late cancelled
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ─── Daily breakdown ─── */}
              {byDay.length > 0 && (
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-neutral-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Daily Breakdown
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                            <th className="pb-2 pr-3">Date</th>
                            <th className="pb-2 pr-3">Total</th>
                            <th className="pb-2 pr-3">Completed</th>
                            <th className="pb-2 pr-3">Cancelled</th>
                            <th className="pb-2 pr-3">No-show</th>
                            <th className="pb-2 pr-3">Pending</th>
                            <th className="pb-2">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byDay.map((day) => (
                            <tr
                              className="border-b border-neutral-100 last:border-0"
                              key={day._id}
                            >
                              <td className="py-2 pr-3 font-medium text-neutral-950">
                                {day._id}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {day.total}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {day.completed}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {day.cancelled}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {day.noShow}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {day.pending}
                              </td>
                              <td className="py-2 text-neutral-700">
                                {formatCurrency(day.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ─── Staff performance ─── */}
              {byStaff.length > 0 && (
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-neutral-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Staff Performance
                      </h3>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Showing accepted staff only. Chair renters are excluded.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                            <th className="pb-2 pr-3">Barber</th>
                            <th className="pb-2 pr-3">Total</th>
                            <th className="pb-2 pr-3">Completed</th>
                            <th className="pb-2 pr-3">Cancelled</th>
                            <th className="pb-2 pr-3">No-show</th>
                            <th className="pb-2 pr-3">Gross revenue</th>
                            <th className="pb-2 pr-3">Staff earnings</th>
                            <th className="pb-2 pr-3">Salon earnings</th>
                            <th className="pb-2 pr-3">Payment</th>
                            <th className="pb-2">Clients</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byStaff.map((staff) => (
                            <tr
                              className="border-b border-neutral-100 last:border-0"
                              key={staff.barberId}
                            >
                              <td className="py-2 pr-3 font-medium text-neutral-950">
                                <div className="flex items-center gap-2">
                                  {staff.avatarUrl ? (
                                    <img
                                      alt={staff.barberName}
                                      className="h-6 w-6 rounded-full object-cover"
                                      src={staff.avatarUrl}
                                    />
                                  ) : (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-xs text-neutral-500">
                                      {staff.barberName?.charAt(0) || "?"}
                                    </div>
                                  )}
                                  <span>{staff.barberName}</span>
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {staff.totalBookings}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {staff.completed}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {staff.cancelled}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {staff.noShow}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {formatCurrency(
                                  staff.grossRevenue ?? staff.revenue
                                )}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {formatCurrency(staff.staffEarnings)}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {formatCurrency(staff.salonEarnings)}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                <div className="min-w-36">
                                  <div className="font-medium text-neutral-800">
                                    {formatPaymentLabel(staff)}
                                  </div>
                                  {formatFixedPaymentSub(staff) && (
                                    <div className="mt-0.5 text-xs text-neutral-500">
                                      {formatFixedPaymentSub(staff)}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 text-neutral-700">
                                {staff.uniqueClients}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ─── Top services ─── */}
              {topServices.length > 0 && (
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-neutral-500" />
                      <h3 className="font-semibold text-neutral-950">
                        Top Services
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                            <th className="pb-2 pr-3">Service</th>
                            <th className="pb-2 pr-3">Bookings</th>
                            <th className="pb-2">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topServices.map((service, idx) => (
                            <tr
                              className="border-b border-neutral-100 last:border-0"
                              key={service._id || idx}
                            >
                              <td className="py-2 pr-3 font-medium text-neutral-950">
                                {service._id}
                              </td>
                              <td className="py-2 pr-3 text-neutral-700">
                                {service.count}
                              </td>
                              <td className="py-2 text-neutral-700">
                                {formatCurrency(service.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ─── Empty state when no data ─── */}
              {byStatus.length === 0 &&
                byDay.length === 0 &&
                byStaff.length === 0 &&
                topServices.length === 0 && (
                  <Card>
                    <CardContent>
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <CalendarCheck className="h-10 w-10 text-neutral-300" />
                        <h3 className="text-lg font-semibold text-neutral-950">
                          No data in this period
                        </h3>
                        <p className="max-w-sm text-sm text-neutral-500">
                          No bookings were found for the selected date range and
                          staff. Try adjusting the filters.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
