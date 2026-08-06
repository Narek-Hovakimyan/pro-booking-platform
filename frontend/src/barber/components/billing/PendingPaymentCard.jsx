import { CreditCard } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  formatCurrency,
  formatStatusText,
} from "../../utils/salonBillingFormatters";

export function PendingPaymentCard({
  pendingAttempt,
  attemptIsSeatUpdate,
  showManualActivationPanel,
  confirmingAttempt,
  cancellingAttempt,
  onConfirmAttempt,
  onCancelAttempt,
}) {
  if (!pendingAttempt) return null;

  return (
    <Card className="rounded-3xl border-blue-100 bg-blue-50/90 shadow-sm">
      <CardContent className="space-y-4 p-5 text-sm text-blue-900">
        <div className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4" />
          Payment pending
        </div>
        <p>
          You can continue or cancel this payment. Subscription changes apply
          only after payment confirmation.
        </p>
        <div className="grid gap-2 rounded-2xl bg-white/70 p-4 text-xs sm:grid-cols-2">
          <div>
            <div className="font-semibold uppercase text-blue-600">Status</div>
            <div className="mt-1 capitalize">{formatStatusText(pendingAttempt.status)}</div>
          </div>
          <div>
            <div className="font-semibold uppercase text-blue-600">Amount</div>
            <div className="mt-1">
              {formatCurrency(pendingAttempt.amount, pendingAttempt.currency)}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase text-blue-600">Seats</div>
            <div className="mt-1">{pendingAttempt.seatCount || 1}</div>
          </div>
          <div>
            <div className="font-semibold uppercase text-blue-600">Period</div>
            <div className="mt-1">
              {attemptIsSeatUpdate
                ? "No period change"
                : `${pendingAttempt.months || 1} month(s)`}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {showManualActivationPanel && pendingAttempt.status === "pending" && (
            <Button
              className="rounded-2xl"
              disabled={confirmingAttempt}
              onClick={onConfirmAttempt}
            >
              {confirmingAttempt
                ? "Confirming..."
                : `Confirm ${attemptIsSeatUpdate ? "seat update" : "manually"}`}
            </Button>
          )}
          {pendingAttempt.status === "pending" && (
            <Button
              className="rounded-2xl"
              disabled={cancellingAttempt}
              onClick={onCancelAttempt}
              variant="outline"
            >
              {cancellingAttempt ? "Cancelling..." : "Cancel prepared payment"}
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
  );
}
