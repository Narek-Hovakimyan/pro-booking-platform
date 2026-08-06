import { AlertTriangle, CheckCircle2, CreditCard } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";
import {
  formatCurrency,
  formatDate,
  getStatusBadgeClass,
  getStatusPanelClass,
  getSubscriptionStatusLabel,
} from "../../utils/salonBillingFormatters";

const SummaryTile = ({ label, value, detail }) => (
  <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
    <div className="text-xs font-semibold uppercase text-neutral-500">
      {label}
    </div>
    <div className="mt-2 text-2xl font-bold text-neutral-950">{value}</div>
    {detail && <div className="mt-1 text-xs text-neutral-500">{detail}</div>}
  </div>
);

export function SubscriptionOverview({
  selectedSalonName,
  subscription,
  subscriptionIsActive,
  subscriptionIsCancelled,
  currency,
  pricePerSeat,
  paidSeatCount,
  usedSeatCount,
  visibleAvailableSeatCount,
  approvedMembersCount,
  daysRemaining,
  expiryDate,
}) {
  const subscriptionStatus = getSubscriptionStatusLabel(subscription?.status);

  return (
    <Card className="overflow-hidden rounded-3xl border-white/80 bg-white/95 shadow-sm">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-950">
              {selectedSalonName}
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              Subscription seats cover approved staff members. Payment does not
              assign seats automatically.
            </p>
          </div>
          <div
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${getStatusBadgeClass(
              subscription
            )}`}
          >
            <CheckCircle2 className="h-4 w-4" />
            {subscriptionStatus}
          </div>
        </div>

        <div
          className={`rounded-3xl border p-5 ${getStatusPanelClass(subscription)}`}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Current subscription</div>
              <div className="mt-1 text-3xl font-bold">{subscriptionStatus}</div>
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
                  {subscriptionIsActive ? daysRemaining ?? "0" : "0"}
                </div>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <div className="text-xs font-semibold uppercase opacity-70">
                  Expiry
                </div>
                <div className="mt-1 text-sm font-bold">{formatDate(expiryDate)}</div>
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
            value={approvedMembersCount}
          />
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
                <div className="mt-1 font-bold">{formatCurrency(pricePerSeat, currency)}</div>
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
                  {formatCurrency(subscription.monthlyTotal ?? subscription.totalPrice, currency)}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-violet-700">
              Final billing is confirmed by the server.
            </p>
          </div>
        )}

        {subscription?.isExpiringSoon && subscriptionIsActive && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Salon subscription expiring soon
            </div>
            <p className="mt-1">
              Prepare payment early. After payment is confirmed, subscription
              will be activated.
            </p>
          </div>
        )}

        {subscription?.isExpired && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="font-semibold">Salon subscription expired</div>
            <p className="mt-1">
              Assigned salon seats no longer unlock specialist access until the
              salon subscription is active again.
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
            <div className="font-semibold">Salon subscription cancelled</div>
            <p className="mt-1">
              Existing seat assignments remain listed for history, but they do
              not unlock specialist access until the subscription is renewed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
