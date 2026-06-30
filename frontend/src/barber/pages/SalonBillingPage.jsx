import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  History,
  Minus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import api from "@/shared/api/axios";
import {
  assignSalonSeat,
  cancelSubscriptionPaymentAttempt,
  createSubscriptionPaymentIntent,
  devConfirmSubscriptionPaymentAttempt,
  devConfirmSubscriptionSeatUpdate,
  extendManualSubscription,
  getSalonSubscription,
  getSalonSubscriptionPayments,
  revokeSalonSeat,
} from "@/shared/api/subscriptions";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

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

const getPersonName = (person) => {
  const value = person?.barberId || person;
  return value?.name || person?.name || "Specialist";
};

const getPersonId = (person) => getIdString(person?.barberId || person);

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

const formatPaymentPeriod = (payment) =>
  `${formatDate(payment?.periodStart)} - ${formatDate(payment?.periodEnd)}`;

const getSubscriptionStatusLabel = (status) => {
  if (status === "active") return "Active";
  if (status === "trialing") return "Trial";
  if (status === "expired") return "Expired";
  if (status === "past_due") return "Past due";
  if (status === "cancelled") return "Cancelled";
  return status ? status.replace("_", " ") : "No subscription";
};

const getStatusBadgeClass = (subscription) => {
  if (subscription?.isExpired || subscription?.status === "expired") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (subscription?.status === "past_due") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (subscription?.status === "trialing") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (subscription?.status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-neutral-200 bg-neutral-100 text-neutral-700";
};

const getStatusPanelClass = (subscription) => {
  if (subscription?.isExpired || subscription?.status === "expired") {
    return "border-rose-100 bg-rose-50/80 text-rose-800";
  }

  if (subscription?.status === "past_due") {
    return "border-amber-100 bg-amber-50/80 text-amber-800";
  }

  if (subscription?.status === "trialing") {
    return "border-violet-100 bg-violet-50/80 text-violet-800";
  }

  if (subscription?.status === "active") {
    return "border-emerald-100 bg-emerald-50/80 text-emerald-800";
  }

  return "border-neutral-200 bg-white text-neutral-700";
};

const formatStatusText = (status) =>
  status ? status.replace("_", " ") : "Pending";

const normalizeError = (error, fallback) =>
  error?.response?.data?.message || fallback;

const SummaryTile = ({ label, value, detail }) => (
  <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
    <div className="text-xs font-semibold uppercase text-neutral-500">
      {label}
    </div>
    <div className="mt-2 text-2xl font-bold text-neutral-950">{value}</div>
    {detail && <div className="mt-1 text-xs text-neutral-500">{detail}</div>}
  </div>
);

export default function SalonBillingPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const [salons, setSalons] = useState([]);
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [details, setDetails] = useState(null);
  const [seatCountInput, setSeatCountInput] = useState("");
  const [paymentMonths, setPaymentMonths] = useState("1");
  const [manualSeatCount, setManualSeatCount] = useState("1");
  const [manualMonths, setManualMonths] = useState("1");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [attemptActionError, setAttemptActionError] = useState("");
  const [payments, setPayments] = useState([]);
  const [paymentsError, setPaymentsError] = useState("");
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [manualActivating, setManualActivating] = useState(false);
  const [confirmingAttempt, setConfirmingAttempt] = useState(false);
  const [cancellingAttempt, setCancellingAttempt] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadDetails = useCallback(
    async (salonId, { keepMessage = false } = {}) => {
      if (!salonId) return;

      setLoadingDetails(true);
      setError("");
      if (!keepMessage) setSuccess("");

      try {
        const data = await getSalonSubscription(salonId);
        setDetails(data);
        setPendingAttempt(data?.pendingPaymentAttempt || null);
        setAttemptActionError("");
        setPaymentsError("");
        try {
          const paymentData = await getSalonSubscriptionPayments(salonId);
          setPayments(Array.isArray(paymentData) ? paymentData : []);
        } catch (paymentError) {
          setPayments([]);
          setPaymentsError(
            normalizeError(paymentError, "Could not load salon payment history.")
          );
        }
        const nextSeatCount = String(data?.subscription?.seatCount || 1);
        setSeatCountInput(nextSeatCount);
        setManualSeatCount(nextSeatCount);
        setSelectedMemberId("");
      } catch (requestError) {
        setDetails(null);
        setError(
          normalizeError(requestError, "Could not load salon subscription.")
        );
      } finally {
        setLoadingDetails(false);
      }
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    async function loadSalons() {
      setLoadingSalons(true);
      setError("");

      try {
        const { data } = await api.get("/salons/mine/manageable");
        const nextSalons = getSalonList(data);

        if (!isMounted) return;
        setSalons(nextSalons);
        const nextSelectedId = getSalonId(nextSalons[0]);
        setSelectedSalonId(nextSelectedId);
        if (nextSelectedId) loadDetails(nextSelectedId);
      } catch (requestError) {
        if (isMounted) {
          setError(
            normalizeError(
              requestError,
              "Could not load salons you can manage."
            )
          );
        }
      } finally {
        if (isMounted) setLoadingSalons(false);
      }
    }

    loadSalons();

    return () => {
      isMounted = false;
    };
  }, [loadDetails]);

  const activeSeats = useMemo(() => details?.activeSeats || [], [details]);
  const revokedSeats = details?.revokedSeats || [];
  const approvedMembers = details?.approvedMembers || [];
  const subscription = details?.subscription || null;
  const plan = details?.defaultPlan || null;
  const subscriptionIsActive = subscription?.isActive === true;
  const subscriptionIsCancelled = subscription?.status === "cancelled";
  const currency = subscription?.currency || plan?.currency || "AMD";
  const pricePerSeat =
    Number(subscription?.pricePerSeat || plan?.pricePerSeat || 0);
  const showManualActivationPanel =
    import.meta.env.DEV || details?.manualActivationAvailable;
  const availableSeatCount = Number(details?.availableSeatCount || 0);
  const paidSeatCount = Number(subscription?.seatCount || 0);
  const usedSeatCount = activeSeats.length;
  const purchaseSeatCount = Math.max(1, Number(seatCountInput) || 1);
  const purchaseMonths = Math.max(1, Number(paymentMonths) || 1);
  const purchaseMonthlyTotal = pricePerSeat * purchaseSeatCount;
  const purchaseTotal = purchaseMonthlyTotal * purchaseMonths;
  const manualActivationSeatCount = Math.max(1, Number(manualSeatCount) || 1);
  const activeSeatMemberIds = useMemo(
    () => new Set(activeSeats.map((seat) => getPersonId(seat))),
    [activeSeats]
  );
  const assignableMembers = approvedMembers.filter(
    (member) => !activeSeatMemberIds.has(getPersonId(member))
  );
  const selectedSalon = salons.find(
    (salon) => getSalonId(salon) === selectedSalonId
  );
  const canAssignSeat =
    Boolean(selectedMemberId) &&
    subscriptionIsActive &&
    availableSeatCount > 0 &&
    Boolean(subscription) &&
    !saving;

  const handleAssignSeat = async () => {
    if (!canAssignSeat) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await assignSalonSeat(selectedSalonId, selectedMemberId);
      setSuccess("Seat assigned.");
      await loadDetails(selectedSalonId, { keepMessage: true });
    } catch (requestError) {
      setError(normalizeError(requestError, "Could not assign seat."));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSeat = async (seatId) => {
    if (!seatId || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await revokeSalonSeat(seatId);
      setSuccess("Seat revoked.");
      await loadDetails(selectedSalonId, { keepMessage: true });
    } catch (requestError) {
      setError(normalizeError(requestError, "Could not revoke seat."));
    } finally {
      setSaving(false);
    }
  };

  const handlePreparePayment = async (action = "renew") => {
    const nextSeatCount = Number(seatCountInput || 1);
    const months = Number(paymentMonths || 1);

    if (!selectedSalonId || !Number.isInteger(nextSeatCount) || nextSeatCount < 1) {
      setError("Seat count must be at least 1.");
      return;
    }

    if (action === "renew" && (!Number.isInteger(months) || months < 1)) {
      setError("Months must be at least 1.");
      return;
    }

    setPreparingPayment(true);
    setError("");
    setSuccess("");
    setAttemptActionError("");

    try {
      const data = await createSubscriptionPaymentIntent({
        ownerType: "salon",
        ownerId: selectedSalonId,
        seatCount: nextSeatCount,
        months: action === "renew" ? months : 1,
        action,
      });
      setPendingAttempt(data.paymentAttempt || null);
    } catch (requestError) {
      setError(normalizeError(requestError, "Could not prepare payment."));
    } finally {
      setPreparingPayment(false);
    }
  };

  const handleConfirmAttempt = async () => {
    const attemptId = pendingAttempt?.id || pendingAttempt?._id;
    if (!attemptId || confirmingAttempt) return;

    setConfirmingAttempt(true);
    setAttemptActionError("");

    try {
      const isSeatUpdate = pendingAttempt?.metadata?.action === "update_seats";
      const result = isSeatUpdate
        ? await devConfirmSubscriptionSeatUpdate(attemptId)
        : await devConfirmSubscriptionPaymentAttempt(attemptId);
      setPendingAttempt(result.paymentAttempt || null);
      setSuccess(isSeatUpdate ? "Seats updated successfully." : "Payment confirmed.");
      await loadDetails(selectedSalonId, { keepMessage: true });
    } catch (requestError) {
      setAttemptActionError(
        normalizeError(requestError, "Could not confirm payment attempt.")
      );
    } finally {
      setConfirmingAttempt(false);
    }
  };

  const handleCancelAttempt = async () => {
    const attemptId = pendingAttempt?.id || pendingAttempt?._id;
    if (!attemptId || cancellingAttempt) return;

    setCancellingAttempt(true);
    setAttemptActionError("");

    try {
      await cancelSubscriptionPaymentAttempt(attemptId);
      setPendingAttempt(null);
      setSuccess("Prepared payment cancelled.");
      await loadDetails(selectedSalonId, { keepMessage: true });
    } catch (requestError) {
      setAttemptActionError(
        normalizeError(requestError, "Could not cancel payment attempt.")
      );
    } finally {
      setCancellingAttempt(false);
    }
  };

  const handleManualActivation = async () => {
    const nextSeatCount = Number(manualSeatCount || 1);
    const months = Number(manualMonths);

    if (!selectedSalonId) return;

    if (!Number.isInteger(nextSeatCount) || nextSeatCount < 1) {
      setError("Seat count must be at least 1.");
      return;
    }

    if (!Number.isInteger(months) || months < 1) {
      setError("Months must be at least 1.");
      return;
    }

    setManualActivating(true);
    setError("");
    setSuccess("");

    try {
      await extendManualSubscription({
        ownerType: "salon",
        ownerId: selectedSalonId,
        payerId: getIdString(currentUser),
        seatCount: nextSeatCount,
        months,
      });
      setSuccess("Salon subscription activated manually.");
      await loadDetails(selectedSalonId, { keepMessage: true });
    } catch (requestError) {
      setError(
        normalizeError(requestError, "Manual activation is not available.")
      );
    } finally {
      setManualActivating(false);
    }
  };

  const attemptIsSeatUpdate = pendingAttempt?.metadata?.action === "update_seats";
  const expiryDate =
    subscription?.renewalRequiredAt || subscription?.currentPeriodEnd;
  const activeCapacity = subscriptionIsActive ? paidSeatCount : 0;
  const seatUsagePercent =
    activeCapacity > 0
      ? Math.min(100, Math.round((usedSeatCount / activeCapacity) * 100))
      : 0;
  const visibleAvailableSeatCount = subscriptionIsActive
    ? availableSeatCount
    : 0;

  return (
    <div className="min-h-screen rounded-[2rem] bg-gradient-to-br from-violet-50 via-white to-pink-50/70 p-4 sm:p-6">
      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Salon billing workspace
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                Salon Billing
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-600">
                Manage salon subscription, seats, and payments for approved
                specialists.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {selectedSalon && (
                <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm">
                  <div className="text-xs font-semibold uppercase text-neutral-500">
                    Selected salon
                  </div>
                  <div className="mt-1 font-semibold text-neutral-950">
                    {getSalonName(selectedSalon)}
                  </div>
                </div>
              )}
              <Button
                className="gap-2 rounded-2xl"
                disabled={!selectedSalonId || loadingDetails}
                onClick={() => loadDetails(selectedSalonId)}
                variant="outline"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              {selectedSalonId && (
                <Button
                  disabled={loadingDetails}
                  onClick={() => loadDetails(selectedSalonId)}
                  size="sm"
                  variant="outline"
                >
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}

        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
            {success}
          </div>
        )}

        {loadingSalons ? (
          <Card className="rounded-3xl border-white/80 shadow-sm">
            <CardContent className="space-y-3">
              <div className="h-4 w-32 rounded-full bg-neutral-100" />
              <div className="h-11 rounded-2xl bg-neutral-100" />
            </CardContent>
          </Card>
        ) : salons.length === 0 ? (
          <Card className="rounded-3xl border-white/80 shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-neutral-950">
                No manageable salons
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Salon billing appears after you own or administer a salon.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="rounded-3xl border-white/80 shadow-sm">
              <CardContent className="p-5">
                <label className="block">
                  <span className="text-sm font-semibold text-neutral-800">
                    Salon
                  </span>
                  <select
                    className="mt-2 h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    onChange={(event) => {
                      const nextSalonId = event.target.value;
                      setSelectedSalonId(nextSalonId);
                      loadDetails(nextSalonId);
                    }}
                    value={selectedSalonId}
                  >
                    {salons.map((salon) => (
                      <option key={getSalonId(salon)} value={getSalonId(salon)}>
                        {getSalonName(salon)}
                      </option>
                    ))}
                  </select>
                </label>
              </CardContent>
            </Card>

            {loadingDetails ? (
              <Card className="rounded-3xl border-white/80 shadow-sm">
                <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
                  <div className="h-24 rounded-2xl bg-neutral-100" />
                  <div className="h-24 rounded-2xl bg-neutral-100" />
                  <div className="h-24 rounded-2xl bg-neutral-100" />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-5">
                  <Card className="overflow-hidden rounded-3xl border-white/80 bg-white/95 shadow-sm">
                    <CardContent className="space-y-6 p-5 sm:p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h2 className="text-xl font-bold text-neutral-950">
                            {getSalonName(selectedSalon)}
                          </h2>
                          <p className="mt-2 text-sm text-neutral-500">
                            Subscription seats cover approved staff members.
                            Payment does not assign seats automatically.
                          </p>
                        </div>
                        <div
                          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${getStatusBadgeClass(subscription)}`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {getSubscriptionStatusLabel(subscription?.status)}
                        </div>
                      </div>

                      <div
                        className={`rounded-3xl border p-5 ${getStatusPanelClass(subscription)}`}
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold">
                              Current subscription
                            </div>
                            <div className="mt-1 text-3xl font-bold">
                              {getSubscriptionStatusLabel(subscription?.status)}
                            </div>
                            <p className="mt-2 max-w-xl text-sm opacity-90">
                              {subscription
                                ? subscriptionIsActive
                                  ? `Renews or expires on ${formatDate(expiryDate)}.`
                                  : `Last subscription date: ${formatDate(expiryDate)}.`
                                : "No salon subscription found yet."}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-72">
                            <div className="rounded-2xl bg-white/70 p-4">
                              <div className="text-xs font-semibold uppercase opacity-70">
                                Days left
                              </div>
                              <div className="mt-1 text-2xl font-bold">
                                {subscriptionIsActive
                                  ? subscription?.daysRemaining ?? "0"
                                  : "0"}
                              </div>
                            </div>
                            <div className="rounded-2xl bg-white/70 p-4">
                              <div className="text-xs font-semibold uppercase opacity-70">
                                Expiry
                              </div>
                              <div className="mt-1 text-sm font-bold">
                                {formatDate(expiryDate)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <SummaryTile
                          detail="Paid capacity"
                          label={subscriptionIsActive ? "Paid seats" : "Inactive seats"}
                          value={paidSeatCount}
                        />
                        <SummaryTile
                          detail="Assigned now"
                          label={subscriptionIsActive ? "Used seats" : "Assigned seats"}
                          value={usedSeatCount}
                        />
                        <SummaryTile
                          detail="Ready to assign"
                          label={subscriptionIsActive ? "Available" : "Usable"}
                          value={visibleAvailableSeatCount}
                        />
                        <SummaryTile
                          detail="Can receive seats"
                          label="Approved members"
                          value={approvedMembers.length}
                        />
                      </div>

                      <div className="rounded-3xl border border-neutral-100 bg-neutral-50/80 p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-semibold text-neutral-950">
                              Seat usage
                            </h3>
                            <p className="mt-1 text-sm text-neutral-500">
                              {usedSeatCount} of {activeCapacity} active paid
                              seats assigned.
                            </p>
                          </div>
                          <div className="text-sm font-semibold text-neutral-700">
                            {seatUsagePercent}%
                          </div>
                        </div>
                        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
                            style={{ width: `${seatUsagePercent}%` }}
                          />
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-white p-3 text-sm">
                            <div className="text-neutral-500">Active</div>
                            <div className="font-semibold text-neutral-950">
                              {activeSeats.length}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-white p-3 text-sm">
                            <div className="text-neutral-500">Available</div>
                            <div className="font-semibold text-neutral-950">
                              {visibleAvailableSeatCount}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-white p-3 text-sm">
                            <div className="text-neutral-500">Revoked</div>
                            <div className="font-semibold text-neutral-950">
                              {revokedSeats.length}
                            </div>
                          </div>
                        </div>
                      </div>

                      {subscription && (
                        <div className="rounded-3xl border border-violet-100 bg-violet-50/70 p-5 text-sm text-violet-900">
                          <div className="flex items-center gap-2 font-semibold">
                            <CreditCard className="h-4 w-4" />
                            Plan and price summary
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <div>
                              <div className="text-xs font-semibold uppercase text-violet-600">
                                Price per seat
                              </div>
                              <div className="mt-1 font-bold">
                                {formatCurrency(pricePerSeat, currency)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-violet-600">
                                Seats
                              </div>
                              <div className="mt-1 font-bold">{paidSeatCount}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-violet-600">
                                Monthly total
                              </div>
                              <div className="mt-1 font-bold">
                                {formatCurrency(
                                  subscription.monthlyTotal ?? subscription.totalPrice,
                                  currency
                                )}
                              </div>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-violet-700">
                            Final billing is confirmed by the server.
                          </p>
                        </div>
                      )}

                      {subscriptionIsActive && subscription?.isExpiringSoon && (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                          <div className="flex items-center gap-2 font-semibold">
                            <AlertTriangle className="h-4 w-4" />
                            Salon subscription expiring soon
                          </div>
                          <p className="mt-1">
                            Prepare payment early. After payment is confirmed,
                            subscription will be activated.
                          </p>
                        </div>
                      )}

                      {subscription?.isExpired && (
                        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
                          <div className="font-semibold">
                            Salon subscription expired
                          </div>
                          <p className="mt-1">
                            Assigned salon seats no longer unlock specialist access
                            until the salon subscription is active again.
                          </p>
                        </div>
                      )}

                      {subscription?.status === "past_due" && (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                          <div className="font-semibold">
                            Subscription payment needs attention
                          </div>
                          <p className="mt-1">
                            Renew the salon subscription to keep seat access clear.
                          </p>
                        </div>
                      )}

                      {subscriptionIsCancelled && (
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                          <div className="font-semibold">
                            Salon subscription cancelled
                          </div>
                          <p className="mt-1">
                            Existing seat assignments remain listed for history, but
                            they do not unlock specialist access until the subscription
                            is renewed.
                          </p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                          <h3 className="font-semibold text-neutral-950">
                            {subscriptionIsActive
                              ? "Active seats"
                              : "Inactive seat assignments"}
                          </h3>
                          <span className="text-xs font-medium text-neutral-500">
                            {activeSeats.length} assigned
                          </span>
                        </div>
                        {activeSeats.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-500">
                            No active seats assigned.
                          </div>
                        ) : (
                          <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                            {activeSeats.map((seat) => (
                              <div
                                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                                key={seat._id || seat.id}
                              >
                                <div>
                                  <div className="font-semibold text-neutral-950">
                                    {getPersonName(seat)}
                                  </div>
                                  <div className="text-xs text-neutral-500">
                                    {subscriptionIsActive
                                      ? "Assigned specialist"
                                      : "Inactive until renewal"}
                                  </div>
                                </div>
                                <Button
                                  className="w-full gap-2 rounded-2xl sm:w-auto"
                                  disabled={saving}
                                  onClick={() =>
                                    handleRevokeSeat(seat._id || seat.id)
                                  }
                                  variant="outline"
                                >
                                  <XCircle className="h-4 w-4" />
                                  Revoke
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {revokedSeats.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="font-semibold text-neutral-950">
                            Revoked seats
                          </h3>
                          <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                            {revokedSeats.map((seat) => (
                              <div
                                className="flex items-center justify-between gap-3 p-4 text-sm"
                                key={seat._id || seat.id}
                              >
                                <span className="font-medium text-neutral-800">
                                  {getPersonName(seat)}
                                </span>
                                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500">
                                  Revoked
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-5">
                  <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-violet-500" />
                        <h2 className="font-semibold text-neutral-950">
                          Renew subscription
                        </h2>
                      </div>
                      <p className="text-sm text-neutral-500">
                        Extends your subscription period. Choose seats and months.
                      </p>
                      <label className="block">
                        <span className="text-sm font-semibold text-neutral-700">
                          Seats
                        </span>
                        <input
                          className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                          min="1"
                          onChange={(event) => setSeatCountInput(event.target.value)}
                          type="number"
                          value={seatCountInput}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-neutral-700">
                          Months
                        </span>
                        <input
                          className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                          min="1"
                          onChange={(event) => setPaymentMonths(event.target.value)}
                          type="number"
                          value={paymentMonths}
                        />
                      </label>
                      <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-700">
                        <div>
                          Price per seat: {formatCurrency(pricePerSeat, currency)}
                        </div>
                        <div className="mt-2 font-semibold text-neutral-950">
                          {purchaseSeatCount} x{" "}
                          {formatCurrency(pricePerSeat, currency)} ={" "}
                          {formatCurrency(purchaseMonthlyTotal, currency)}/month
                        </div>
                        <div className="mt-1 font-semibold text-neutral-950">
                          Total: {formatCurrency(purchaseTotal, currency)} for{" "}
                          {purchaseMonths} month(s)
                        </div>
                        <div className="mt-2 text-xs text-neutral-500">
                          Final billing is confirmed by the server.
                        </div>
                      </div>
                      <Button
                        className="w-full rounded-2xl"
                        disabled={preparingPayment || !selectedSalonId}
                        onClick={() => handlePreparePayment("renew")}
                        variant="outline"
                      >
                        {preparingPayment ? "Preparing..." : "Prepare renewal payment"}
                      </Button>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                        Renewal extends your subscription period after payment is
                        confirmed.
                      </div>
                    </CardContent>
                  </Card>

                  {subscription && subscriptionIsActive && (
                    <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-violet-500" />
                          <h2 className="font-semibold text-neutral-950">
                            Update seats
                          </h2>
                        </div>
                        <p className="text-sm text-neutral-500">
                          Changes how many specialists can be covered. Expiry date
                          will not change.
                        </p>
                        <label className="block">
                          <span className="text-sm font-semibold text-neutral-700">
                            New seat count
                          </span>
                          <input
                            className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                            min="1"
                            onChange={(event) => setSeatCountInput(event.target.value)}
                            type="number"
                            value={seatCountInput}
                          />
                        </label>
                        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-700">
                          <div>
                            Current seats: <strong>{paidSeatCount}</strong>
                          </div>
                          <div>
                            New seats: <strong>{purchaseSeatCount}</strong>
                          </div>
                          <div className="mt-2 font-semibold text-neutral-950">
                            Extra cost:{" "}
                            {formatCurrency(
                              Math.max(0, purchaseSeatCount - paidSeatCount) *
                                pricePerSeat,
                              currency
                            )}
                          </div>
                          <div className="mt-2 text-xs text-neutral-500">
                            Expiry: {formatDate(subscription?.currentPeriodEnd)}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            Final billing is confirmed by the server.
                          </div>
                        </div>
                        <Button
                          className="w-full rounded-2xl"
                          disabled={preparingPayment || !selectedSalonId}
                          onClick={() => handlePreparePayment("update_seats")}
                          variant="outline"
                        >
                          {preparingPayment ? "Preparing..." : "Prepare seat update"}
                        </Button>
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                          Seat updates only change capacity. Subscription period
                          remains unchanged.
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {pendingAttempt && (
                    <Card className="rounded-3xl border-blue-100 bg-blue-50/90 shadow-sm">
                      <CardContent className="space-y-4 p-5 text-sm text-blue-900">
                        <div className="flex items-center gap-2 font-semibold">
                          <CreditCard className="h-4 w-4" />
                          Payment pending
                        </div>
                        <p>
                          You can continue or cancel this payment. Subscription
                          changes apply only after payment confirmation.
                        </p>
                        <div className="grid gap-2 rounded-2xl bg-white/70 p-4 text-xs sm:grid-cols-2">
                          <div>
                            <div className="font-semibold uppercase text-blue-600">
                              Status
                            </div>
                            <div className="mt-1 capitalize">
                              {formatStatusText(pendingAttempt.status)}
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold uppercase text-blue-600">
                              Amount
                            </div>
                            <div className="mt-1">
                              {formatCurrency(
                                pendingAttempt.amount,
                                pendingAttempt.currency
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold uppercase text-blue-600">
                              Seats
                            </div>
                            <div className="mt-1">
                              {pendingAttempt.seatCount || 1}
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold uppercase text-blue-600">
                              Period
                            </div>
                            <div className="mt-1">
                              {attemptIsSeatUpdate
                                ? "No period change"
                                : `${pendingAttempt.months || 1} month(s)`}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {showManualActivationPanel &&
                            pendingAttempt.status === "pending" && (
                              <Button
                                className="rounded-2xl"
                                disabled={confirmingAttempt}
                                onClick={handleConfirmAttempt}
                              >
                                {confirmingAttempt
                                  ? "Confirming..."
                                  : `Confirm ${
                                      attemptIsSeatUpdate
                                        ? "seat update"
                                        : "manually"
                                    }`}
                              </Button>
                            )}
                          {pendingAttempt.status === "pending" && (
                            <Button
                              className="rounded-2xl"
                              disabled={cancellingAttempt}
                              onClick={handleCancelAttempt}
                              variant="outline"
                            >
                              {cancellingAttempt
                                ? "Cancelling..."
                                : "Cancel prepared payment"}
                            </Button>
                          )}
                        </div>
                        {showManualActivationPanel && (
                          <p className="text-xs text-blue-700">
                            Manual confirm is development-only.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {attemptActionError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                      {attemptActionError}
                    </div>
                  )}

                  {showManualActivationPanel && (
                    <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
                      <CardContent className="space-y-4 p-5">
                        <div>
                          <h2 className="font-semibold text-neutral-950">
                            Development/MVP manual activation
                          </h2>
                          <p className="mt-1 text-sm text-neutral-500">
                            In development mode, manual activation is available.
                            Seats are still assigned separately.
                          </p>
                        </div>
                        <label className="block">
                          <span className="text-sm font-semibold text-neutral-700">
                            Seats
                          </span>
                          <input
                            className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                            min="1"
                            onChange={(event) =>
                              setManualSeatCount(event.target.value)
                            }
                            type="number"
                            value={manualSeatCount}
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-semibold text-neutral-700">
                            Months
                          </span>
                          <input
                            className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                            min="1"
                            onChange={(event) => setManualMonths(event.target.value)}
                            type="number"
                            value={manualMonths}
                          />
                        </label>
                        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-700">
                          {manualActivationSeatCount} x{" "}
                          {formatCurrency(pricePerSeat, currency)} x{" "}
                          {Number(manualMonths) || 1} month(s)
                        </div>
                        <Button
                          className="w-full rounded-2xl"
                          disabled={manualActivating || !selectedSalonId}
                          onClick={handleManualActivation}
                        >
                          {manualActivating
                            ? "Activating..."
                            : "Activate salon manually"}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-violet-500" />
                        <h2 className="font-semibold text-neutral-950">
                          Assign seat
                        </h2>
                      </div>
                      <select
                        className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                        disabled={
                          assignableMembers.length === 0 ||
                          availableSeatCount <= 0
                        }
                        onChange={(event) => setSelectedMemberId(event.target.value)}
                        value={selectedMemberId}
                      >
                        <option value="">
                          {availableSeatCount <= 0
                            ? subscriptionIsActive
                              ? "No available seats"
                              : "Renew subscription to assign seats"
                            : "Choose approved member"}
                        </option>
                        {assignableMembers.map((member) => (
                          <option
                            key={getPersonId(member)}
                            value={getPersonId(member)}
                          >
                            {getPersonName(member)}
                          </option>
                        ))}
                      </select>
                      <Button
                        className="w-full gap-2 rounded-2xl"
                        disabled={!canAssignSeat}
                        onClick={handleAssignSeat}
                      >
                        <UserPlus className="h-4 w-4" />
                        Assign seat
                      </Button>
                      {(!subscriptionIsActive || availableSeatCount <= 0) && (
                        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                          <Minus className="h-3.5 w-3.5" />
                          {subscriptionIsActive
                            ? "Prepare payment or activate more paid seats first."
                            : "Renew the subscription before assigning seats."}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-violet-500" />
                        <h2 className="font-semibold text-neutral-950">
                          Payment history
                        </h2>
                      </div>
                      {subscriptionIsCancelled && (
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                          Paid payments remain in history. Subscription is
                          currently cancelled.
                        </div>
                      )}
                      {paymentsError && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                          {paymentsError}
                        </div>
                      )}
                      {payments.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-500">
                          No salon payment records yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                          {payments.map((payment) => (
                            <div
                              className="space-y-3 p-4 text-sm"
                              key={payment._id || payment.id}
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <span className="font-semibold text-neutral-950">
                                  {formatCurrency(payment.amount, payment.currency)}
                                </span>
                                <span className="w-fit rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold capitalize text-neutral-600">
                                  {formatStatusText(payment.status)}
                                </span>
                              </div>
                              <div className="grid gap-2 text-xs text-neutral-500 sm:grid-cols-2">
                                <span className="inline-flex items-center gap-1.5">
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  {formatDate(payment.paidAt)}
                                </span>
                                <span>
                                  {payment.seatCount || 1} seat(s) -{" "}
                                  {formatPaymentPeriod(payment)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
