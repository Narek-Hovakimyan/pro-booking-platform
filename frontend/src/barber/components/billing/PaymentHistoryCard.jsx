import { CalendarDays, History } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";
import {
  formatCurrency,
  formatDate,
  formatPaymentPeriod,
  formatStatusText,
} from "../../utils/salonBillingFormatters";

export function PaymentHistoryCard({
  payments,
  paymentsError,
  subscriptionIsCancelled,
}) {
  return (
    <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-violet-500" />
          <h2 className="font-semibold text-neutral-950">Payment history</h2>
        </div>
        {subscriptionIsCancelled && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
            Paid payments remain in history. Subscription is currently cancelled.
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
            {payments.map((payment, index) => (
              <div
                className="space-y-3 p-4 text-sm"
                key={[
                  payment.paidAt || payment.createdAt || "payment",
                  payment.amount || 0,
                  index,
                ].join("-")}
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
                    {payment.seatCount || 1} seat(s) - {formatPaymentPeriod(payment)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
