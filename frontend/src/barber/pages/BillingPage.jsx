import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  History,
  Info,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  cancelSubscriptionPaymentAttempt,
  createSubscriptionPaymentIntent,
  devConfirmSubscriptionPaymentAttempt,
  extendManualSubscription,
  getMySubscriptionPayments,
  getMySubscription,
} from "@/shared/api/subscriptions";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  loadSubscriptionFailure,
  loadSubscriptionStart,
  loadSubscriptionSuccess,
} from "@/store/slices/subscriptionSlice";

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

const getStatusLabel = (subscription) => {
  if (!subscription?.loaded) return "Loading";
  if (subscription.hasAccess) return "Active access";
  return "Subscription required";
};

const getSubscriptionStatusLabel = (status) => {
  if (status === "active") return "Active";
  if (status === "trialing") return "Trial";
  if (status === "expired") return "Expired";
  if (status === "past_due") return "Past due";
  return status ? status.replace("_", " ") : "No subscription";
};

const getStatusBadgeClass = (subscription) => {
  if (subscription?.isExpired || subscription?.status === "expired") {
    return "bg-red-50 text-red-700";
  }

  if (subscription?.status === "past_due") {
    return "bg-amber-50 text-amber-700";
  }

  if (subscription?.status === "active" || subscription?.status === "trialing") {
    return "bg-emerald-50 text-emerald-700";
  }

  return "bg-neutral-100 text-neutral-700";
};

const formatPaymentPeriod = (payment) =>
  `${formatDate(payment?.periodStart)} - ${formatDate(payment?.periodEnd)}`;

export default function BillingPage() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const subscription = useSelector((state) => state.subscription);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [paymentMonths, setPaymentMonths] = useState("1");
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [attemptActionError, setAttemptActionError] = useState("");
  const [isConfirmingAttempt, setIsConfirmingAttempt] = useState(false);
  const [isCancellingAttempt, setIsCancellingAttempt] = useState(false);
  const [manualMonths, setManualMonths] = useState("1");
  const [manualActivationError, setManualActivationError] = useState("");
  const [manualActivationSuccess, setManualActivationSuccess] = useState("");
  const [isActivatingManually, setIsActivatingManually] = useState(false);
  const [payments, setPayments] = useState([]);
  const [paymentsError, setPaymentsError] = useState("");
  const [loadingPayments, setLoadingPayments] = useState(false);
  const plan = subscription.defaultPlan;
  const individual = subscription.individualSubscription;
  const isDev = import.meta.env.DEV;
  const showManualActivationPanel =
    isDev || subscription.manualActivationAvailable;
  const coveredBySalon =
    subscription.coveredBy === "salon" || subscription.coveredBy === "both";

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    setPaymentsError("");

    try {
      const data = await getMySubscriptionPayments();
      setPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      setPaymentsError(
        error.response?.data?.message || "Could not load payment history."
      );
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    dispatch(loadSubscriptionStart());
    try {
      const data = await getMySubscription();
      dispatch(loadSubscriptionSuccess(data));
    } catch (error) {
      dispatch(
        loadSubscriptionFailure(
          error.response?.data?.message ||
            "Could not load subscription status."
        )
      );
    }
  }, [dispatch]);

  useEffect(() => {
    refreshSubscription();

    async function loadInitialPayments() {
      await loadPayments();
    }

    loadInitialPayments();
  }, [loadPayments, refreshSubscription]);

  const preparePayment = async () => {
    const ownerId = currentUser?.id || currentUser?._id;
    const months = Number(paymentMonths);

    if (!ownerId || isPreparingPayment) return;

    if (!Number.isInteger(months) || months < 1) {
      setPaymentError("Months must be at least 1.");
      return;
    }

    setIsPreparingPayment(true);
    setPaymentError("");
    setAttemptActionError("");
    setPaymentIntent(null);

    try {
      const data = await createSubscriptionPaymentIntent({
        ownerType: "barber",
        ownerId,
        seatCount: 1,
        months,
      });
      setPaymentIntent(data);
      setPendingAttempt(data.paymentAttempt || null);
    } catch (requestError) {
      setPaymentError(
        requestError.response?.data?.message ||
          "Could not prepare manual payment."
      );
    } finally {
      setIsPreparingPayment(false);
    }
  };

  const confirmPendingAttempt = async () => {
    const attemptId = pendingAttempt?.id || pendingAttempt?._id;
    if (!attemptId || isConfirmingAttempt) return;

    setIsConfirmingAttempt(true);
    setAttemptActionError("");

    try {
      const result = await devConfirmSubscriptionPaymentAttempt(attemptId);
      setPendingAttempt(result.paymentAttempt || null);
      await refreshSubscription();
      await loadPayments();
    } catch (requestError) {
      setAttemptActionError(
        requestError.response?.data?.message ||
          "Could not confirm payment attempt."
      );
    } finally {
      setIsConfirmingAttempt(false);
    }
  };

  const cancelPendingAttempt = async () => {
    const attemptId = pendingAttempt?.id || pendingAttempt?._id;
    if (!attemptId || isCancellingAttempt) return;

    setIsCancellingAttempt(true);
    setAttemptActionError("");

    try {
      await cancelSubscriptionPaymentAttempt(attemptId);
      setPendingAttempt(null);
      setPaymentIntent(null);
    } catch (requestError) {
      setAttemptActionError(
        requestError.response?.data?.message ||
          "Could not cancel payment attempt."
      );
    } finally {
      setIsCancellingAttempt(false);
    }
  };

  const activateManually = async () => {
    const ownerId = currentUser?.id || currentUser?._id;
    const months = Number(manualMonths);

    if (!ownerId || isActivatingManually) return;

    if (!Number.isInteger(months) || months < 1) {
      setManualActivationError("Months must be at least 1.");
      return;
    }

    setIsActivatingManually(true);
    setManualActivationError("");
    setManualActivationSuccess("");

    try {
      await extendManualSubscription({
        ownerType: "barber",
        ownerId,
        payerId: ownerId,
        seatCount: 1,
        months,
      });
      setManualActivationSuccess("Manual subscription activated.");
      await refreshSubscription();
      await loadPayments();
    } catch (requestError) {
      setManualActivationError(
        requestError.response?.data?.message ||
          "Manual activation is not available."
      );
    } finally {
      setIsActivatingManually(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Billing
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Manage access for paid barber features.
        </p>
      </div>

      {subscription.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {subscription.error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-800">
                  <WalletCards className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950">
                    {getStatusLabel(subscription)}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    {subscription.hasAccess
                      ? "Your account can use paid barber tools."
                      : "Activate a subscription or ask a salon owner to assign a seat."}
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(individual)}`}
              >
                {getSubscriptionStatusLabel(individual?.status)}
              </span>
            </div>

            {individual && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs font-medium uppercase text-neutral-500">
                    Individual plan
                  </div>
                  <div className="mt-1 text-base font-semibold capitalize text-neutral-950">
                    {getSubscriptionStatusLabel(individual.status)}
                  </div>
                </div>
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs font-medium uppercase text-neutral-500">
                    Days remaining
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-950">
                    {individual.daysRemaining ?? "Not set"}
                  </div>
                </div>
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-neutral-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Expiry date
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-950">
                    {formatDate(individual.renewalRequiredAt || individual.currentPeriodEnd)}
                  </div>
                </div>
              </div>
            )}

            {individual?.isExpiringSoon && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Subscription expiring soon
                </div>
                <p className="mt-1">
                  Prepare payment early. After payment is confirmed,
                  subscription will be activated.
                </p>
              </div>
            )}

            {individual?.isExpired && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                <div className="font-semibold">Subscription expired</div>
                <p className="mt-1">
                  Paid barber tools are blocked until a subscription or salon
                  seat is active again.
                </p>
              </div>
            )}

            {coveredBySalon && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  Covered by salon subscription
                </div>
                <p className="mt-1">
                  A salon has assigned an active seat to your account.
                </p>
              </div>
            )}

            {!subscription.hasAccess && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="font-semibold">Subscription required</div>
                <p className="mt-1">
                  Payment checkout is not connected yet. Backend enforcement is
                  active, so paid tools will stay locked until access is granted.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                Default plan
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Per specialist, monthly.
              </p>
            </div>
            <div className="text-3xl font-bold text-neutral-950">
              {formatCurrency(plan?.pricePerSeat ?? 5000, plan?.currency || "AMD")}
            </div>
            <div className="text-sm text-neutral-500">
              / {plan?.interval || "month"}
            </div>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Months
              </span>
              <input
                className="mt-1 h-10 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                min="1"
                onChange={(event) => setPaymentMonths(event.target.value)}
                type="number"
                value={paymentMonths}
              />
            </label>
            <Button
              className="w-full"
              disabled={isPreparingPayment}
              onClick={preparePayment}
            >
              {isPreparingPayment ? "Preparing..." : "Prepare payment"}
            </Button>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
              Prepare payment does not activate subscription. After payment is
              confirmed, subscription will be activated.
            </div>
            {paymentIntent && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <div className="font-semibold">
                  {paymentIntent.message || "Manual payment activation is required."}
                </div>
                <p className="mt-1">
                  Amount: {formatCurrency(paymentIntent.amount, paymentIntent.currency)}
                </p>
              </div>
            )}
            {pendingAttempt && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <div className="font-semibold">
                  Payment prepared but not active yet
                </div>
                <p className="mt-1">
                  Attempt: {pendingAttempt.id || pendingAttempt._id}
                </p>
                <p className="mt-1 capitalize">Status: {pendingAttempt.status}</p>
                <p className="mt-1">
                  {pendingAttempt.seatCount || 1} seat(s),{" "}
                  {pendingAttempt.months || 1} month(s),{" "}
                  {formatCurrency(pendingAttempt.amount, pendingAttempt.currency)}
                </p>
                <p className="mt-1">
                  Subscription activates only after payment confirmation.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {showManualActivationPanel && pendingAttempt.status === "pending" && (
                    <Button
                      className="flex-1"
                      disabled={isConfirmingAttempt}
                      onClick={confirmPendingAttempt}
                    >
                      {isConfirmingAttempt ? "Confirming..." : "Confirm manually"}
                    </Button>
                  )}
                  {pendingAttempt.status === "pending" && (
                    <Button
                      className="flex-1"
                      disabled={isCancellingAttempt}
                      onClick={cancelPendingAttempt}
                      variant="outline"
                    >
                      {isCancellingAttempt ? "Cancelling..." : "Cancel prepared payment"}
                    </Button>
                  )}
                </div>
                {showManualActivationPanel && (
                  <p className="mt-2 text-blue-700">
                    Manual confirm is development-only.
                  </p>
                )}
              </div>
            )}
            {attemptActionError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {attemptActionError}
              </div>
            )}
            {paymentError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {paymentError}
              </div>
            )}
            {isDev && (
              <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
                <div className="flex items-center gap-1.5 font-semibold text-neutral-800">
                  <Info className="h-3.5 w-3.5" />
                  Development mode
                </div>
                <p className="mt-1">
                  In development mode, manual activation is available.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showManualActivationPanel && (
        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                Development/MVP manual activation
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                This grants access through the protected dev endpoint. It is
                separate from preparing payment.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block sm:w-48">
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
              <Button
                disabled={isActivatingManually}
                onClick={activateManually}
              >
                {isActivatingManually
                  ? "Activating..."
                  : "Activate manually"}
              </Button>
            </div>
            {manualActivationSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {manualActivationSuccess}
              </div>
            )}
            {manualActivationError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {manualActivationError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-neutral-500" />
            <h2 className="text-lg font-semibold text-neutral-950">
              Payment history
            </h2>
          </div>
          {paymentsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {paymentsError}
            </div>
          )}
          {loadingPayments ? (
            <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">
              Loading payment history...
            </div>
          ) : payments.length === 0 ? (
            <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">
              No payment records yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <div className="hidden grid-cols-5 gap-3 border-b border-neutral-100 bg-neutral-50 p-3 text-xs font-semibold uppercase text-neutral-500 sm:grid">
                <span>Amount</span>
                <span>Seats</span>
                <span>Period</span>
                <span>Status</span>
                <span>Paid/provider</span>
              </div>
              <div className="divide-y divide-neutral-100">
                {payments.map((payment) => (
                  <div
                    className="grid gap-2 p-3 text-sm sm:grid-cols-5 sm:gap-3"
                    key={payment._id || payment.id}
                  >
                    <span className="font-semibold text-neutral-950">
                      {formatCurrency(payment.amount, payment.currency)}
                    </span>
                    <span>{payment.seatCount || 1}</span>
                    <span>{formatPaymentPeriod(payment)}</span>
                    <span className="capitalize">{payment.status}</span>
                    <span>
                      {formatDate(payment.paidAt)} / {payment.provider || "manual"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
