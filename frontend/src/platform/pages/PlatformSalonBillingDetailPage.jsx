import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Loader2,
  UserCheck,
  XCircle,
  Users,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

import {
  getPlatformBillingSalonDetail,
  getPlatformBillingSalonPayments,
} from "@/shared/api/platformBilling";
import { Card, CardContent } from "@/shared/components/ui/card";

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

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (amount, currency = "AMD") =>
  `${Number(amount || 0).toLocaleString()} ${currency}`;

const getStatusBadgeClass = (isExpired, status) => {
  if (isExpired || status === "expired") return "bg-red-50 text-red-700";
  if (status === "past_due") return "bg-amber-50 text-amber-700";
  if (status === "active" || status === "trialing")
    return "bg-emerald-50 text-emerald-700";
  return "bg-neutral-100 text-neutral-700";
};

const getPaymentStatusLabel = (payment) => {
  if (!payment) return null;
  const status = payment.status || "unknown";
  if (status === "paid" || status === "confirmed") return "Paid";
  if (status === "pending") return "Pending — not paid";
  if (status === "requires_action") return "Requires action";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "refunded") return "Refunded";
  return status.replace(/_/g, " ");
};

const getProviderLabel = (provider) => {
  if (!provider || provider === "manual") return "Manual";
  if (provider === "disabled") return "Disabled";
  return provider;
};

function InfoRow({ label, value, valueClass = "" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <span className={`text-sm text-neutral-900 ${valueClass}`}>{value || "—"}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold text-neutral-900">{value}</p>
      {sub && <p className="text-[11px] text-neutral-400">{sub}</p>}
    </div>
  );
}

export default function PlatformSalonBillingDetailPage() {
  const navigate = useNavigate();
  const { salonId } = useParams();
  const { currentUser } = useSelector((state) => state.auth);

  const [detail, setDetail] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const isPlatformAdmin = Boolean(currentUser?.platformRole === "admin");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch salon billing detail
  useEffect(() => {
    let isMounted = true;

    async function fetchDetail() {
      if (!isMounted) return;
      setIsLoading(true);
      setError("");

      try {
        const result = await getPlatformBillingSalonDetail(salonId);
        if (!isMounted) return;
        setDetail(result);
      } catch (err) {
        if (!isMounted) return;
        if (err.response?.status === 403) {
          setError("Access denied. Platform admin privileges required.");
        } else if (err.response?.status === 404) {
          setError("Salon not found.");
        } else {
          setError(err.response?.data?.message || "Failed to load salon billing detail.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchDetail();

    return () => {
      isMounted = false;
    };
  }, [salonId]);

  // Fetch payments once detail is loaded
  useEffect(() => {
    if (!salonId || !detail) return;
    let isMounted = true;

    async function fetchPayments() {
      if (!isMounted) return;

      try {
        const result = await getPlatformBillingSalonPayments(salonId, {
          page: paymentsPage,
          limit: 10,
        });
        if (!isMounted) return;
        setPayments(result.payments || []);
        setPaymentsTotal(result.total || 0);
      } catch {
        // Payments fetch is secondary
      }
    }

    fetchPayments();

    return () => {
      isMounted = false;
    };
  }, [salonId, paymentsPage, detail]);

  const subscription = detail?.subscription;
  const seats = detail?.seats;
  const acceptedStaff = detail?.acceptedStaff || [];
  const latestPendingAttempt = detail?.latestPendingAttempt;
  const totalPaymentsPages = Math.max(1, Math.ceil(paymentsTotal / 10));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  // Error state (including 403 for non-platform admin)
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <ShieldAlert className="h-10 w-10 text-red-400" />
          <h2 className="text-lg font-semibold text-neutral-900">Access Denied</h2>
          <p className="text-sm text-neutral-600">{error}</p>
          <button
            onClick={() => navigate("/admin/platform/billing")}
            className="mt-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
            type="button"
          >
            Back to Platform Billing
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!detail || !isPlatformAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">Salon not found or access denied.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/admin/platform/billing")}
        className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition hover:text-neutral-900"
        type="button"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Platform Billing
      </button>

      {/* Salon header card */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100">
              {detail.salon?.imageUrl ? (
                <img
                  src={detail.salon.imageUrl}
                  alt={detail.salon.name || ""}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Building2 className="h-7 w-7 text-neutral-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-neutral-900">
                {detail.salon?.name || "Unnamed Salon"}
              </h1>
              <p className="text-sm text-neutral-500">
                {detail.salon?.city || "No city"}
                {detail.salon?.address ? `, ${detail.salon.address}` : ""}
              </p>

              {subscription && (
                <span
                  className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                    subscription.isExpired,
                    subscription.status
                  )}`}
                >
                  {subscription.isExpired
                    ? "Expired"
                    : subscription.status === "active"
                      ? "Active"
                      : subscription.status === "trialing"
                        ? "Trial"
                        : subscription.status}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Owner summary */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Owner
            </h2>
            {detail.owner ? (
              <div className="space-y-2 text-sm">
                <InfoRow label="Name" value={detail.owner.name} />
                <InfoRow label="Email" value={detail.owner.email} />
                <InfoRow label="City" value={detail.owner.city} />
              </div>
            ) : (
              <p className="text-sm text-neutral-400">No owner data</p>
            )}
          </CardContent>
        </Card>

        {/* Subscription summary */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Subscription
            </h2>
            {subscription ? (
              <div className="space-y-2 text-sm">
                <InfoRow
                  label="Status"
                  value={
                    subscription.isExpired
                      ? "Expired"
                      : subscription.status === "active"
                        ? "Active"
                        : subscription.status || "—"
                  }
                />
                <InfoRow label="Provider" value={getProviderLabel(subscription.provider)} />
                <InfoRow
                  label="Period"
                  value={`${formatDate(subscription.currentPeriodStart)} — ${formatDate(subscription.currentPeriodEnd)}`}
                />
                <InfoRow
                  label="Days remaining"
                  value={
                    subscription.daysRemaining >= 0
                      ? `${subscription.daysRemaining}d`
                      : "Expired"
                  }
                />
                <InfoRow label="Price/seat" value={formatCurrency(subscription.pricePerSeat)} />
                <InfoRow label="Total price" value={formatCurrency(subscription.totalPrice)} />
              </div>
            ) : (
              <p className="text-sm text-neutral-400">No subscription</p>
            )}
          </CardContent>
        </Card>

        {/* Seat usage summary */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Seat Usage
            </h2>
            {subscription ? (
              <div className="grid grid-cols-3 gap-2">
                <StatCard
                  icon={Users}
                  label="Total Seats"
                  value={seats?.total ?? 0}
                />
                <StatCard
                  icon={UserCheck}
                  label="Used"
                  value={seats?.used ?? 0}
                  sub={`${seats?.assignments?.length || 0} assigned`}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Available"
                  value={seats?.available ?? 0}
                />
              </div>
            ) : (
              <p className="text-sm text-neutral-400">No subscription</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Accepted staff + seat assignments */}
      <Card>
        <CardContent>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Accepted Staff & Seat Assignments
          </h2>

          {acceptedStaff.length === 0 ? (
            <p className="text-sm text-neutral-400">No accepted staff members.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                <div className="col-span-4">Name</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-3">Seat Status</div>
              </div>

              {acceptedStaff.map((staff) => {
                const hasSeat = (seats?.assignments || []).some(
                  (a) => String(a.barber?._id || a.barber) === String(staff._id)
                );

                return (
                  <div
                    key={staff._id}
                    className="grid grid-cols-12 gap-3 rounded-xl border border-neutral-100 px-3 py-2.5 text-sm"
                  >
                    <div className="col-span-4 flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-600">
                        {staff.name
                          ? staff.name
                              .split(" ")
                              .map((s) => s[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()
                          : "?"}
                      </div>
                      <span className="truncate font-medium text-neutral-900">
                        {staff.name || "Unnamed"}
                      </span>
                    </div>
                    <div className="col-span-3 truncate text-neutral-500">
                      {staff.email || "—"}
                    </div>
                    <div className="col-span-2 text-neutral-500">
                      {staff.barberType || staff.profession || "—"}
                    </div>
                    <div className="col-span-3">
                      {hasSeat ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Seat assigned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                          <XCircle className="h-3 w-3" />
                          No seat
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending payment attempt */}
      {latestPendingAttempt && (
        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Pending Payment
            </h2>
            <div className="space-y-2 text-sm">
              <InfoRow
                label="Amount"
                value={formatCurrency(latestPendingAttempt.amount)}
              />
              <InfoRow
                label="Status"
                value="Pending — not paid"
                valueClass="text-amber-600"
              />
              <InfoRow
                label="Provider"
                value={getProviderLabel(latestPendingAttempt.provider)}
              />
              {latestPendingAttempt.checkoutUrl && (
                <InfoRow label="Checkout URL" value={latestPendingAttempt.checkoutUrl} />
              )}
              <InfoRow
                label="Created"
                value={formatDateTime(latestPendingAttempt.createdAt)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment history */}
      <Card>
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Payment History
            </h2>
            {payments.length > 0 && (
              <span className="text-xs text-neutral-400">
                {paymentsTotal} payment{paymentsTotal !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {payments.length === 0 ? (
            <p className="text-sm text-neutral-400">No payment attempts found.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                <div className="col-span-3">Date</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Provider</div>
                <div className="col-span-3">Period</div>
              </div>

              {payments.map((payment) => (
                <div
                  key={payment._id}
                  className="grid grid-cols-12 gap-3 rounded-xl border border-neutral-100 px-3 py-2.5 text-sm"
                >
                  <div className="col-span-3 text-neutral-500">
                    {formatDate(payment.createdAt)}
                  </div>
                  <div className="col-span-2 font-medium text-neutral-900">
                    {formatCurrency(payment.amount)}
                  </div>
                  <div className="col-span-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        payment.status === "paid" || payment.status === "confirmed"
                          ? "bg-emerald-50 text-emerald-700"
                          : payment.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : payment.status === "failed" || payment.status === "cancelled"
                              ? "bg-red-50 text-red-700"
                              : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {getPaymentStatusLabel(payment)}
                    </span>
                  </div>
                  <div className="col-span-2 text-neutral-500">
                    {getProviderLabel(payment.provider)}
                  </div>
                  <div className="col-span-3 text-neutral-500">
                    {payment.periodStart && payment.periodEnd
                      ? `${formatDate(payment.periodStart)} — ${formatDate(payment.periodEnd)}`
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payment pagination */}
          {totalPaymentsPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                disabled={paymentsPage <= 1}
                className="text-xs font-medium text-neutral-600 transition hover:text-neutral-900 disabled:opacity-30"
                type="button"
              >
                Previous
              </button>
              <span className="text-xs text-neutral-500">
                {paymentsPage} of {totalPaymentsPages}
              </span>
              <button
                onClick={() =>
                  setPaymentsPage((p) => Math.min(totalPaymentsPages, p + 1))
                }
                disabled={paymentsPage >= totalPaymentsPages}
                className="text-xs font-medium text-neutral-600 transition hover:text-neutral-900 disabled:opacity-30"
                type="button"
              >
                Next
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
