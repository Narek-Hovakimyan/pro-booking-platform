import { CheckCircle2, UserCheck, Users } from "lucide-react";

import { StatCard } from "./StatCard";
import { InfoRow } from "./InfoRow";
import { Card, CardContent } from "../../../shared/components/ui/card";
import { formatDate, formatDateTime, formatCurrency, getSubscriptionStatusLabel, getProviderLabel } from "../../utils/billingFormatters";

export function SalonBillingSummaryCards({ owner, subscription, seats, subscriptionIsCancelled }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Owner</h2>
          {owner ? (
            <div className="space-y-2 text-sm">
              <InfoRow label="Name" value={owner.name} />
              <InfoRow label="Email" value={owner.email} />
              <InfoRow label="City" value={owner.city} />
            </div>
          ) : (
            <p className="text-sm text-neutral-400">No owner data</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Subscription</h2>
          {subscription ? (
            <div className="space-y-2 text-sm">
              <InfoRow label="Status" value={getSubscriptionStatusLabel(subscription)} />
              <InfoRow label="Provider" value={getProviderLabel(subscription.provider)} />
              {subscriptionIsCancelled && (
                <InfoRow label="Cancelled" value={formatDateTime(subscription.cancelledAt)} />
              )}
              <InfoRow label="Period" value={`${formatDate(subscription.currentPeriodStart)} — ${formatDate(subscription.currentPeriodEnd)}`} />
              <InfoRow label="Days remaining" value={subscription.daysRemaining >= 0 ? `${subscription.daysRemaining}d` : "Expired"} />
              <InfoRow label="Price/seat" value={formatCurrency(subscription.pricePerSeat)} />
              <InfoRow label="Total price" value={formatCurrency(subscription.totalPrice)} />
            </div>
          ) : (
            <p className="text-sm text-neutral-400">No subscription</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Seat Usage</h2>
          {subscription ? (
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={Users} label="Total Seats" value={seats?.total ?? 0} />
              <StatCard icon={UserCheck} label="Used" value={seats?.used ?? 0} sub={`${seats?.assignments?.length || 0} assigned`} />
              <StatCard icon={CheckCircle2} label="Available" value={seats?.available ?? 0} />
            </div>
          ) : (
            <p className="text-sm text-neutral-400">No subscription</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
