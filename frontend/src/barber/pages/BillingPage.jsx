import { CalendarDays, CheckCircle2, Info, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  createSubscriptionPaymentIntent,
  extendManualSubscription,
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

export default function BillingPage() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const subscription = useSelector((state) => state.subscription);
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [manualMonths, setManualMonths] = useState("1");
  const [manualActivationError, setManualActivationError] = useState("");
  const [manualActivationSuccess, setManualActivationSuccess] = useState("");
  const [isActivatingManually, setIsActivatingManually] = useState(false);
  const plan = subscription.defaultPlan;
  const individual = subscription.individualSubscription;
  const isDev = import.meta.env.DEV;
  const showManualActivationPanel =
    isDev || subscription.manualActivationAvailable;
  const coveredBySalon =
    subscription.coveredBy === "salon" || subscription.coveredBy === "both";
  const hasIndividualAccess =
    individual && ["active", "trialing"].includes(individual.status);

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
  }, [refreshSubscription]);

  const preparePayment = async () => {
    const ownerId = currentUser?.id || currentUser?._id;
    if (!ownerId || isPreparingPayment) return;

    setIsPreparingPayment(true);
    setPaymentError("");
    setPaymentIntent(null);

    try {
      const data = await createSubscriptionPaymentIntent({
        ownerType: "barber",
        ownerId,
        seatCount: 1,
      });
      setPaymentIntent(data);
    } catch (requestError) {
      setPaymentError(
        requestError.response?.data?.message ||
          "Could not prepare manual payment."
      );
    } finally {
      setIsPreparingPayment(false);
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
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  subscription.hasAccess
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {subscription.hasAccess ? "Access enabled" : "Access needed"}
              </span>
            </div>

            {hasIndividualAccess && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="text-xs font-medium uppercase text-neutral-500">
                    Individual plan
                  </div>
                  <div className="mt-1 text-base font-semibold capitalize text-neutral-950">
                    {individual.status}
                  </div>
                </div>
                <div className="rounded-xl bg-neutral-50 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-neutral-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {individual.status === "trialing" ? "Trial ends" : "Period ends"}
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-950">
                    {formatDate(individual.trialEndsAt || individual.currentPeriodEnd)}
                  </div>
                </div>
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
            <Button
              className="w-full"
              disabled={isPreparingPayment}
              onClick={preparePayment}
            >
              {isPreparingPayment ? "Preparing..." : "Prepare payment"}
            </Button>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
              Manual payment / activation required. Preparing payment does not
              activate your subscription.
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
                  Manual grants are available through the backend dev endpoint.
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
    </div>
  );
}
