import { Minus, RefreshCw, UserPlus, Users, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import api from "@/shared/api/axios";
import {
  assignSalonSeat,
  createSubscriptionPaymentIntent,
  extendManualSubscription,
  getSalonSubscription,
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

const normalizeError = (error, fallback) =>
  error?.response?.data?.message || fallback;

export default function SalonBillingPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const [salons, setSalons] = useState([]);
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [details, setDetails] = useState(null);
  const [seatCountInput, setSeatCountInput] = useState("");
  const [manualSeatCount, setManualSeatCount] = useState("1");
  const [manualMonths, setManualMonths] = useState("1");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [manualActivating, setManualActivating] = useState(false);
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
  const currency = subscription?.currency || plan?.currency || "AMD";
  const pricePerSeat =
    Number(subscription?.pricePerSeat || plan?.pricePerSeat || 0);
  const showManualActivationPanel =
    import.meta.env.DEV || details?.manualActivationAvailable;
  const availableSeatCount = Number(details?.availableSeatCount || 0);
  const paidSeatCount = Number(subscription?.seatCount || 0);
  const usedSeatCount = activeSeats.length;
  const purchaseSeatCount = Math.max(1, Number(seatCountInput) || 1);
  const purchaseTotal = pricePerSeat * purchaseSeatCount;
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

  const handlePreparePayment = async () => {
    const nextSeatCount = Number(seatCountInput || 1);

    if (!selectedSalonId || !Number.isInteger(nextSeatCount) || nextSeatCount < 1) {
      setError("Seat count must be at least 1.");
      return;
    }

    setPreparingPayment(true);
    setError("");
    setSuccess("");
    setPaymentIntent(null);

    try {
      const data = await createSubscriptionPaymentIntent({
        ownerType: "salon",
        ownerId: selectedSalonId,
        seatCount: nextSeatCount,
      });
      setPaymentIntent(data);
    } catch (requestError) {
      setError(normalizeError(requestError, "Could not prepare manual payment."));
    } finally {
      setPreparingPayment(false);
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

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Salon Billing
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage salon subscription seats for approved specialists.
          </p>
        </div>

        <Button
          className="gap-2"
          disabled={!selectedSalonId || loadingDetails}
          onClick={() => loadDetails(selectedSalonId)}
          variant="outline"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {loadingSalons ? (
        <Card>
          <CardContent className="text-sm text-neutral-500">
            Loading salons...
          </CardContent>
        </Card>
      ) : salons.length === 0 ? (
        <Card>
          <CardContent>
            <h2 className="text-lg font-semibold text-neutral-950">
              No manageable salons
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Salon billing appears after you own or administer a salon.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">
                  Salon
                </span>
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
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
            <Card>
              <CardContent className="text-sm text-neutral-500">
                Loading salon subscription...
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardContent className="space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-neutral-950">
                        {getSalonName(selectedSalon)}
                      </h2>
                      <p className="mt-1 text-sm text-neutral-500">
                        You are buying seats for your salon specialists.
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {subscription
                          ? `Status: ${subscription.status}`
                          : "No salon subscription found."}
                      </p>
                    </div>
                    <div className="rounded-xl bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-800">
                      {availableSeatCount} available
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-neutral-50 p-4">
                      <div className="text-xs font-medium uppercase text-neutral-500">
                        Paid seats
                      </div>
                      <div className="mt-1 text-2xl font-bold text-neutral-950">
                        {paidSeatCount}
                      </div>
                    </div>
                    <div className="rounded-xl bg-neutral-50 p-4">
                      <div className="text-xs font-medium uppercase text-neutral-500">
                        Used seats
                      </div>
                      <div className="mt-1 text-2xl font-bold text-neutral-950">
                        {usedSeatCount}
                      </div>
                    </div>
                    <div className="rounded-xl bg-neutral-50 p-4">
                      <div className="text-xs font-medium uppercase text-neutral-500">
                        Available seats
                      </div>
                      <div className="mt-1 text-2xl font-bold text-neutral-950">
                        {availableSeatCount}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">
                    <p>Each active seat can be assigned to one approved salon member.</p>
                    <p className="mt-1">Payment does not assign seats automatically.</p>
                    {subscription && (
                      <p className="mt-2 font-medium text-neutral-800">
                        Active monthly total:{" "}
                        {formatCurrency(subscription.totalPrice, currency)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold text-neutral-950">
                      Active seats
                    </h3>
                    {activeSeats.length === 0 ? (
                      <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">
                        No active seats assigned.
                      </div>
                    ) : (
                      <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                        {activeSeats.map((seat) => (
                          <div
                            className="flex flex-wrap items-center justify-between gap-3 p-3"
                            key={seat._id || seat.id}
                          >
                            <div>
                              <div className="font-medium text-neutral-950">
                                {getPersonName(seat)}
                              </div>
                              <div className="text-xs text-neutral-500">
                                Assigned specialist
                              </div>
                            </div>
                            <Button
                              className="gap-2"
                              disabled={saving}
                              onClick={() => handleRevokeSeat(seat._id || seat.id)}
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
                      <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                        {revokedSeats.map((seat) => (
                          <div
                            className="flex items-center justify-between gap-3 p-3 text-sm"
                            key={seat._id || seat.id}
                          >
                            <span className="font-medium text-neutral-800">
                              {getPersonName(seat)}
                            </span>
                            <span className="text-neutral-500">Revoked</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-neutral-500" />
                      <h2 className="font-semibold text-neutral-950">
                        Salon payment
                      </h2>
                    </div>
                    <p className="text-sm text-neutral-500">
                      You are buying seats for your salon specialists.
                    </p>
                    <label className="block">
                      <span className="text-sm font-medium text-neutral-700">
                        Seats to pay for monthly
                      </span>
                      <input
                        className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                        min="1"
                        onChange={(event) => setSeatCountInput(event.target.value)}
                        type="number"
                        value={seatCountInput}
                      />
                    </label>
                    <div className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">
                      <div>Price per seat: {formatCurrency(pricePerSeat, currency)}</div>
                      <div className="mt-1 font-semibold text-neutral-950">
                        {purchaseSeatCount} x {formatCurrency(pricePerSeat, currency)} ={" "}
                        {formatCurrency(purchaseTotal, currency)}/month
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      disabled={preparingPayment || !selectedSalonId}
                      onClick={handlePreparePayment}
                      variant="outline"
                    >
                      {preparingPayment ? "Preparing..." : "Prepare salon payment"}
                    </Button>
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                      Payment does not assign seats automatically. Each active
                      seat can be assigned to one approved salon member after
                      activation.
                    </div>
                    {paymentIntent && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                        <div className="font-semibold">
                          {paymentIntent.message ||
                            "Manual payment activation is required."}
                        </div>
                        <p className="mt-1">
                          Amount:{" "}
                          {formatCurrency(paymentIntent.amount, paymentIntent.currency)}
                        </p>
                        <p className="mt-1">
                          Seats: {paymentIntent.seatCount} at{" "}
                          {formatCurrency(paymentIntent.pricePerSeat, paymentIntent.currency)}
                          /seat
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {showManualActivationPanel && (
                  <Card>
                    <CardContent className="space-y-4">
                      <div>
                        <h2 className="font-semibold text-neutral-950">
                          Development/MVP manual activation
                        </h2>
                        <p className="mt-1 text-sm text-neutral-500">
                          Activates the salon subscription only. Seats are still
                          assigned separately.
                        </p>
                      </div>
                      <label className="block">
                        <span className="text-sm font-medium text-neutral-700">
                          Seats
                        </span>
                        <input
                          className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                          min="1"
                          onChange={(event) => setManualSeatCount(event.target.value)}
                          type="number"
                          value={manualSeatCount}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-neutral-700">
                          Months
                        </span>
                        <input
                          className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                          min="1"
                          onChange={(event) => setManualMonths(event.target.value)}
                          type="number"
                          value={manualMonths}
                        />
                      </label>
                      <div className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">
                        {manualActivationSeatCount} x{" "}
                        {formatCurrency(pricePerSeat, currency)} x {Number(manualMonths) || 1}{" "}
                        month(s)
                      </div>
                      <Button
                        className="w-full"
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

                <Card>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-neutral-500" />
                      <h2 className="font-semibold text-neutral-950">
                        Assign seat
                      </h2>
                    </div>
                    <select
                      className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                      disabled={assignableMembers.length === 0 || availableSeatCount <= 0}
                      onChange={(event) => setSelectedMemberId(event.target.value)}
                      value={selectedMemberId}
                    >
                      <option value="">
                        {availableSeatCount <= 0
                          ? "No available seats"
                          : "Choose approved member"}
                      </option>
                      {assignableMembers.map((member) => (
                        <option key={getPersonId(member)} value={getPersonId(member)}>
                          {getPersonName(member)}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="w-full gap-2"
                      disabled={!canAssignSeat}
                      onClick={handleAssignSeat}
                    >
                      <UserPlus className="h-4 w-4" />
                      Assign seat
                    </Button>
                    {availableSeatCount <= 0 && (
                      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <Minus className="h-3.5 w-3.5" />
                        Prepare payment or activate more paid seats first.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
