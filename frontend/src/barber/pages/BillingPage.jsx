import { CalendarDays, CheckCircle2, Info, WalletCards } from "lucide-react";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { getMySubscription } from "@/shared/api/subscriptions";
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
  const subscription = useSelector((state) => state.subscription);
  const plan = subscription.defaultPlan;
  const individual = subscription.individualSubscription;
  const isDev = import.meta.env.DEV;
  const coveredBySalon =
    subscription.coveredBy === "salon" || subscription.coveredBy === "both";
  const hasIndividualAccess =
    individual && ["active", "trialing"].includes(individual.status);

  useEffect(() => {
    let isMounted = true;

    async function refreshSubscription() {
      dispatch(loadSubscriptionStart());
      try {
        const data = await getMySubscription();
        if (isMounted) dispatch(loadSubscriptionSuccess(data));
      } catch (error) {
        if (isMounted) {
          dispatch(
            loadSubscriptionFailure(
              error.response?.data?.message ||
                "Could not load subscription status."
            )
          );
        }
      }
    }

    refreshSubscription();

    return () => {
      isMounted = false;
    };
  }, [dispatch]);

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
            <Button className="w-full" disabled>
              Payment integration pending
            </Button>
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
    </div>
  );
}
