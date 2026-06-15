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
  Plus,
  MinusCircle,
  UserPlus,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";

import {
  getPlatformBillingSalonDetail,
  getPlatformBillingSalonPayments,
  activatePlatformSalonSubscription,
  updatePlatformSalonSeatCount,
  assignPlatformSalonSeat,
  revokePlatformSalonSeat,
  cancelPlatformSalonSubscription,
  confirmPlatformSalonPayment,
} from "@/shared/api/platformBilling";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";

/* ─── Helpers ─────────────────────────────────────────── */

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

const getSubscriptionStatusLabel = (subscription) => {
  if (!subscription) return "No subscription";
  if (subscription.isExpired || subscription.status === "expired") return "Expired";
  if (subscription.status === "active") return "Active";
  if (subscription.status === "trialing") return "Trial";
  if (subscription.status === "cancelled") return "Cancelled";
  if (subscription.status === "past_due") return "Past due";
  return subscription.status || "—";
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

/* ─── Note Modal ──────────────────────────────────────── */

function PlatformActionModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  warning,
  confirmLabel = "Confirm",
  isSubmitting = false,
  error = "",
  children,
}) {
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
            {warning && (
              <p className="mt-2 text-sm text-neutral-600">{warning}</p>
            )}
          </div>
          <Button
            aria-label="Close modal"
            disabled={isSubmitting}
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        {/* Extra form fields */}
        {children}

        {/* Note field */}
        <div>
          <label
            htmlFor="action-note"
            className="mb-1 block text-xs font-medium text-neutral-700"
          >
            Audit note <span className="text-red-500">*</span>
          </label>
          <textarea
            id="action-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Required reason for this action..."
            rows={3}
            className="w-full resize-none rounded-xl border border-neutral-200 p-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
            disabled={isSubmitting}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Buttons */}
        <div className="grid gap-2 sm:flex sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={isSubmitting || !note.trim()}
            onClick={handleConfirm}
            type="button"
          >
            {isSubmitting ? "Processing..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Action Button Component ─────────────────────────── */

function ActionButton({ icon: Icon, label, onClick, variant = "default" }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition";
  const variants = {
    default: "bg-neutral-950 text-white hover:bg-neutral-800",
    outline: "border border-neutral-300 text-neutral-700 hover:bg-neutral-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  };

  return (
    <button
      onClick={onClick}
      className={`${base} ${variants[variant] || variants.default}`}
      type="button"
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

/* ─── Page Component ──────────────────────────────────── */

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
  const [successMessage, setSuccessMessage] = useState("");

  /* ── Modal state ── */
  const [modal, setModal] = useState(null); // { type, extra }

  /* ── Data fetching ── */

  const fetchDetail = useCallback(async () => {
    try {
      const result = await getPlatformBillingSalonDetail(salonId);
      setDetail(result);
      return result;
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Access denied. Platform admin privileges required.");
      } else if (err.response?.status === 404) {
        setError("Salon not found.");
      } else {
        setError(err.response?.data?.message || "Failed to load salon billing detail.");
      }
      return null;
    }
  }, [salonId]);

  const fetchPayments = useCallback(async () => {
    if (!salonId) return;
    try {
      const result = await getPlatformBillingSalonPayments(salonId, {
        page: paymentsPage,
        limit: 10,
      });
      setPayments(result.payments || []);
      setPaymentsTotal(result.total || 0);
    } catch {
      // Payments fetch is secondary
    }
  }, [salonId, paymentsPage]);

  // Initial fetch
  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!isMounted) return;
      setIsLoading(true);
      setError("");
      await fetchDetail();
      if (!isMounted) return;
      setIsLoading(false);
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [fetchDetail]);

  // Fetch payments once detail is loaded
  useEffect(() => {
    if (!salonId || !detail) return;
    let isMounted = true;

    async function loadPayments() {
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

    loadPayments();

    return () => {
      isMounted = false;
    };
  }, [salonId, paymentsPage, detail]);

  /* ── Mutation handlers ── */

  const [isSubmitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  const closeModal = () => {
    setModal(null);
    setModalError("");
    setSubmitting(false);
  };

  const handleMutation = async (apiCall, note) => {
    setSubmitting(true);
    setModalError("");

    try {
      await apiCall(note);
      // Success — refresh data
      await fetchDetail();
      fetchPayments();
      setSuccessMessage("Action completed successfully.");
      closeModal();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) {
      const status = err.response?.status;
      if (status === 403 || status === 401) {
        setModalError("Forbidden. Platform admin privileges required.");
      } else if (status === 400) {
        setModalError(err.response?.data?.message || "Validation error.");
      } else {
        setModalError(err.response?.data?.message || "An unexpected error occurred.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Activate / Renew ── */
  const handleActivateConfirm = (note) => {
    handleMutation(async (n) => {
      return activatePlatformSalonSubscription(salonId, {
        note: n,
        seatCount: modal.extra?.seatCount || 1,
        months: modal.extra?.months || 1,
      });
    }, note);
  };

  /* ── Update seat count ── */
  const handleSeatCountConfirm = (note) => {
    const newCount = Number(modal.extra?.newSeatCount);
    if (!Number.isInteger(newCount) || newCount < 1) {
      setModalError("Seat count must be a positive integer.");
      return;
    }
    handleMutation(async (n) => {
      return updatePlatformSalonSeatCount(salonId, {
        seatCount: newCount,
        note: n,
      });
    }, note);
  };

  /* ── Assign seat ── */
  const handleAssignConfirm = (note) => {
    const barberId = modal.extra?.barberId;
    if (!barberId) {
      setModalError("No staff member selected.");
      return;
    }
    handleMutation(async (n) => {
      return assignPlatformSalonSeat(salonId, {
        barberId,
        note: n,
      });
    }, note);
  };

  /* ── Revoke seat ── */
  const handleRevokeConfirm = (note) => {
    const barberId = modal.extra?.barberId;
    if (!barberId) {
      setModalError("No staff member selected.");
      return;
    }
    handleMutation(async (n) => {
      return revokePlatformSalonSeat(salonId, {
        barberId,
        note: n,
      });
    }, note);
  };

  /* ── Cancel subscription ── */
  const handleCancelConfirm = (note) => {
    handleMutation(async (n) => {
      return cancelPlatformSalonSubscription(salonId, {
        note: n,
      });
    }, note);
  };

  /* ── Confirm payment ── */
  const handlePaymentConfirm = (note) => {
    const paymentId = modal.extra?.paymentId;
    if (!paymentId) {
      setModalError("No payment selected.");
      return;
    }
    handleMutation(async (n) => {
      return confirmPlatformSalonPayment(paymentId, {
        note: n,
      });
    }, note);
  };

  /* ── Derived data ── */

  const subscription = detail?.subscription;
  const seats = detail?.seats;
  const acceptedStaff = detail?.acceptedStaff || [];
  const latestPendingAttempt = detail?.latestPendingAttempt;
  const subscriptionIsCancelled = subscription?.status === "cancelled";
  const totalPaymentsPages = Math.max(1, Math.ceil(paymentsTotal / 10));
  const assignedBarberIds = new Set(
    (seats?.assignments || []).map((a) => String(a.barber?._id || a.barber))
  );

  // Determine if a payment attempt is eligible for manual confirmation
  const isConfirmablePayment = latestPendingAttempt
    ? latestPendingAttempt.purpose === "subscription" &&
      latestPendingAttempt.ownerType === "salon" &&
      latestPendingAttempt.provider === "manual" &&
      (latestPendingAttempt.status === "pending" ||
        latestPendingAttempt.status === "requires_action")
    : false;

  /* ── Loading ── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  /* ── Error state (including 403 for non-platform admin) ── */

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

      {/* Success message */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

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
                  {getSubscriptionStatusLabel(subscription)}
                </span>
              )}

              {/* ── Action buttons (platform admin only) ── */}
              {isPlatformAdmin && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ActionButton
                    icon={RefreshCw}
                    label={
                      subscription
                        ? "Renew subscription"
                        : "Activate subscription"
                    }
                    onClick={() => setModal({ type: "activate" })}
                    variant={subscription ? "outline" : "default"}
                  />
                  {subscription && (
                    <ActionButton
                      icon={Users}
                      label="Update seat count"
                      onClick={() => setModal({ type: "seatCount" })}
                      variant="outline"
                    />
                  )}
                  {subscription &&
                    ["trialing", "active", "past_due"].includes(subscription.status) && (
                      <ActionButton
                        icon={XCircle}
                        label="Cancel subscription"
                        onClick={() => setModal({ type: "cancel" })}
                        variant="danger"
                      />
                    )}
                </div>
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
                  value={getSubscriptionStatusLabel(subscription)}
                />
                <InfoRow label="Provider" value={getProviderLabel(subscription.provider)} />
                {subscriptionIsCancelled && (
                  <InfoRow
                    label="Cancelled"
                    value={formatDateTime(subscription.cancelledAt)}
                  />
                )}
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Accepted Staff & Seat Assignments
            </h2>
            {isPlatformAdmin && subscription && (
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  icon={UserPlus}
                  label="Assign seat"
                  onClick={() => setModal({ type: "assign" })}
                  variant="outline"
                />
              </div>
            )}
          </div>

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
                const hasSeat = assignedBarberIds.has(String(staff._id));

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
                    <div className="col-span-3 flex items-center gap-2">
                      {hasSeat ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Seat assigned
                          </span>
                          {isPlatformAdmin && (
                            <button
                              onClick={() =>
                                setModal({
                                  type: "revoke",
                                  extra: { barberId: staff._id, barberName: staff.name },
                                })
                              }
                              className="rounded-lg p-1 text-red-400 transition hover:bg-red-50 hover:text-red-600"
                              title="Revoke seat"
                              type="button"
                            >
                              <MinusCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                            <XCircle className="h-3 w-3" />
                            No seat
                          </span>
                          {isPlatformAdmin && seats?.available > 0 && (
                            <button
                              onClick={() =>
                                setModal({
                                  type: "assign",
                                  extra: { barberId: staff._id, barberName: staff.name },
                                })
                              }
                              className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                              title="Assign seat"
                              type="button"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
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
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Pending Payment
              </h2>
              {isPlatformAdmin && isConfirmablePayment && (
                <ActionButton
                  icon={CreditCard}
                  label="Confirm manual payment"
                  onClick={() =>
                    setModal({
                      type: "confirmPayment",
                      extra: { paymentId: latestPendingAttempt._id },
                    })
                  }
                  variant="success"
                />
              )}
            </div>
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

          {subscriptionIsCancelled && (
            <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
              Paid payments remain in history. Subscription is currently cancelled.
            </div>
          )}

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

      {/* ─── Modals ─── */}

      {/* Activate / Renew */}
      <PlatformActionModal
        key={modal?.type === "activate" ? "activate-open" : "activate-closed"}
        isOpen={modal?.type === "activate"}
        onClose={closeModal}
        onConfirm={handleActivateConfirm}
        title={subscription ? "Renew subscription" : "Activate subscription"}
        warning={`This will ${subscription ? "renew" : "activate"} the salon subscription${subscription ? ` (${subscription.seatCount} seats, ${getProviderLabel(subscription.provider)})` : " (manual provider)"}. An audit note is required.`}
        confirmLabel={subscription ? "Renew" : "Activate"}
        isSubmitting={isSubmitting}
        error={modalError}
      >
        {!subscription && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="activate-seats"
                className="mb-1 block text-xs font-medium text-neutral-700"
              >
                Seat count
              </label>
              <input
                id="activate-seats"
                type="number"
                min="1"
                defaultValue="1"
                onChange={(e) =>
                  setModal((prev) =>
                    prev
                      ? { ...prev, extra: { ...prev.extra, seatCount: Number(e.target.value) } }
                      : prev
                  )
                }
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
            </div>
            <div>
              <label
                htmlFor="activate-months"
                className="mb-1 block text-xs font-medium text-neutral-700"
              >
                Period (months)
              </label>
              <input
                id="activate-months"
                type="number"
                min="1"
                defaultValue="1"
                onChange={(e) =>
                  setModal((prev) =>
                    prev
                      ? { ...prev, extra: { ...prev.extra, months: Number(e.target.value) } }
                      : prev
                  )
                }
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
            </div>
          </div>
        )}
        {subscription && (
          <p className="text-sm text-neutral-500">
            Renewing extends the current period. Current seat count:{" "}
            <strong>{subscription.seatCount}</strong>.
          </p>
        )}
      </PlatformActionModal>

      {/* Update seat count */}
      <PlatformActionModal
        key={modal?.type === "seatCount" ? "seat-count-open" : "seat-count-closed"}
        isOpen={modal?.type === "seatCount"}
        onClose={closeModal}
        onConfirm={handleSeatCountConfirm}
        title="Update seat count"
        warning={`Current: ${seats?.total ?? 0} total, ${seats?.used ?? 0} used. New count must be positive and cannot be lower than used seats.`}
        confirmLabel="Update"
        isSubmitting={isSubmitting}
        error={modalError}
      >
        <div>
          <label
            htmlFor="seatcount-input"
            className="mb-1 block text-xs font-medium text-neutral-700"
          >
            New seat count
          </label>
          <input
            id="seatcount-input"
            type="number"
            min={Math.max(1, seats?.used ?? 0)}
            defaultValue={Math.max(1, seats?.total ?? 1)}
            onChange={(e) =>
              setModal((prev) =>
                prev
                  ? { ...prev, extra: { ...prev.extra, newSeatCount: Number(e.target.value) } }
                  : prev
              )
            }
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Used seats: <strong>{seats?.used ?? 0}</strong>
          </p>
        </div>
      </PlatformActionModal>

      {/* Assign seat */}
      <PlatformActionModal
        key={modal?.type === "assign" ? `assign-${modal?.extra?.barberId || "select"}` : "assign-closed"}
        isOpen={modal?.type === "assign"}
        onClose={closeModal}
        onConfirm={handleAssignConfirm}
        title="Assign seat"
        warning={
          modal?.extra?.barberName
            ? `Assign a subscription seat to "${modal.extra.barberName}".`
            : "Select a staff member from the list below."
        }
        confirmLabel="Assign"
        isSubmitting={isSubmitting}
        error={modalError}
      >
        {!modal?.extra?.barberId ? (
          <div>
            <label
              htmlFor="assign-staff"
              className="mb-1 block text-xs font-medium text-neutral-700"
            >
              Select staff member
            </label>
            <select
              id="assign-staff"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              defaultValue=""
              onChange={(e) =>
                setModal((prev) => {
                  const selected = acceptedStaff.find((s) => s._id === e.target.value);
                  return prev
                    ? {
                        ...prev,
                        extra: {
                          barberId: e.target.value,
                          barberName: selected?.name || "Selected staff",
                        },
                      }
                    : prev;
                })
              }
            >
              <option value="" disabled>
                -- Select staff --
              </option>
              {acceptedStaff
                .filter((s) => !assignedBarberIds.has(String(s._id)))
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name || "Unnamed"} {s.email ? `(${s.email})` : ""}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Only accepted staff without an active seat are shown.
            </p>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            Assign seat to <strong>{modal.extra.barberName}</strong>.
          </p>
        )}
      </PlatformActionModal>

      {/* Revoke seat */}
      <PlatformActionModal
        key={modal?.type === "revoke" ? `revoke-${modal?.extra?.barberId || "select"}` : "revoke-closed"}
        isOpen={modal?.type === "revoke"}
        onClose={closeModal}
        onConfirm={handleRevokeConfirm}
        title="Revoke seat"
        warning={
          modal?.extra?.barberName
            ? `Revoke the subscription seat from "${modal.extra.barberName}". This action cannot be undone manually. The barber will lose access to subscription benefits.`
            : "Revoke seat from a staff member."
        }
        confirmLabel="Revoke"
        isSubmitting={isSubmitting}
        error={modalError}
      >
        {!modal?.extra?.barberId && (
          <div>
            <label
              htmlFor="revoke-staff"
              className="mb-1 block text-xs font-medium text-neutral-700"
            >
              Select staff member with active seat
            </label>
            <select
              id="revoke-staff"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              defaultValue=""
              onChange={(e) =>
                setModal((prev) => {
                  const selected = acceptedStaff.find((s) => s._id === e.target.value);
                  return prev
                    ? {
                        ...prev,
                        extra: {
                          barberId: e.target.value,
                          barberName: selected?.name || "Selected staff",
                        },
                      }
                    : prev;
                })
              }
            >
              <option value="" disabled>
                -- Select staff --
              </option>
              {acceptedStaff
                .filter((s) => assignedBarberIds.has(String(s._id)))
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name || "Unnamed"} {s.email ? `(${s.email})` : ""}
                  </option>
                ))}
            </select>
          </div>
        )}
      </PlatformActionModal>

      {/* Cancel subscription */}
      <PlatformActionModal
        key={modal?.type === "cancel" ? "cancel-open" : "cancel-closed"}
        isOpen={modal?.type === "cancel"}
        onClose={closeModal}
        onConfirm={handleCancelConfirm}
        title="Cancel subscription"
        warning="This will deactivate the salon subscription. Payment history and records will remain. Seats currently assigned will remain but access will be revoked."
        confirmLabel="Cancel subscription"
        isSubmitting={isSubmitting}
        error={modalError}
      />

      {/* Confirm payment */}
      <PlatformActionModal
        key={modal?.type === "confirmPayment" ? "confirm-payment-open" : "confirm-payment-closed"}
        isOpen={modal?.type === "confirmPayment"}
        onClose={closeModal}
        onConfirm={handlePaymentConfirm}
        title="Confirm manual payment"
        warning={`This will mark the pending ${formatCurrency(latestPendingAttempt?.amount || 0)} payment as paid and activate/extend the subscription period.`}
        confirmLabel="Confirm payment"
        isSubmitting={isSubmitting}
        error={modalError}
      />
    </div>
  );
}
