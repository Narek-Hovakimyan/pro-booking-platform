import { CreditCard } from "lucide-react";

import { BillingActionButton } from "./BillingActionButton";
import { InfoRow } from "./InfoRow";
import { Card, CardContent } from "../../../shared/components/ui/card";
import { formatCurrency, formatDateTime, getProviderLabel } from "../../utils/billingFormatters";

export function SalonBillingPendingPaymentCard({
  latestPendingAttempt,
  isConfirmablePayment,
  isPlatformAdmin,
  onConfirmPayment,
}) {
  if (!latestPendingAttempt) return null;

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Pending Payment
          </h2>
          {isPlatformAdmin && isConfirmablePayment && (
            <BillingActionButton
              icon={CreditCard}
              label="Confirm manual payment"
              onClick={() =>
                onConfirmPayment({ paymentId: latestPendingAttempt.id })
              }
              variant="success"
            />
          )}
        </div>
        <div className="space-y-2 text-sm">
          <InfoRow label="Amount" value={formatCurrency(latestPendingAttempt.amount)} />
          <InfoRow
            label="Status"
            value="Pending — not paid"
            valueClass="text-amber-600"
          />
          <InfoRow
            label="Provider"
            value={getProviderLabel(latestPendingAttempt.provider)}
          />
          <InfoRow
            label="Created"
            value={formatDateTime(latestPendingAttempt.createdAt)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
