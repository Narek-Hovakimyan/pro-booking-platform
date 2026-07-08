import { Card, CardContent } from "../../../shared/components/ui/card";
import {
  formatCurrency,
  formatDate,
  getPaymentStatusLabel,
  getPaymentActionLabel,
  getProviderLabel,
} from "../../utils/billingFormatters";

const statusColors = {
  paid: "bg-emerald-50 text-emerald-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  requires_action: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-red-50 text-red-700",
  refunded: "bg-red-50 text-red-700",
};

const defaultColor = "bg-neutral-100 text-neutral-700";

function getStatusColor(status) {
  return statusColors[status] || defaultColor;
}

export function SalonBillingPaymentHistory({
  payments,
  paymentsTotal,
  totalPaymentsPages,
  paymentsPage,
  subscriptionIsCancelled,
  onPageChange,
}) {
  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Payment History
          </h2>
          {payments.length > 0 && (
            <span className="text-xs text-neutral-400">
              {paymentsTotal} payment{paymentsTotal !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {subscriptionIsCancelled && (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
            Paid payments remain in history. Subscription is currently cancelled.
          </div>
        )}

        {payments.length === 0 ? (
          <p className="text-sm text-neutral-400">No payment attempts found.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              <div className="col-span-3">Date</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Provider</div>
              <div className="col-span-2">Action</div>
              <div className="col-span-1">Seats</div>
              <div className="col-span-2">Period</div>
            </div>

            {payments.map((payment) => (
              <div
                key={`${payment.source || "payment"}-${payment.id}`}
                className="grid grid-cols-12 gap-3 rounded-xl border border-neutral-100 px-3 py-2.5 text-sm"
              >
                <div className="col-span-3 text-neutral-500">
                  {formatDate(payment.createdAt)}
                </div>
                <div className="col-span-2 font-medium text-neutral-900">
                  {formatCurrency(payment.amount)}
                </div>
                <div className="col-span-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(payment.status)}`}
                  >
                    {getPaymentStatusLabel(payment)}
                  </span>
                </div>
                <div className="col-span-2 text-neutral-500">
                  {getProviderLabel(payment.provider)}
                </div>
                <div className="col-span-2 text-neutral-500">
                  {getPaymentActionLabel(payment)}
                </div>
                <div className="col-span-1 text-neutral-500">
                  {payment.seatCount || "—"}
                  {payment.months ? ` / ${payment.months}m` : ""}
                </div>
                <div className="col-span-2 text-neutral-500">
                  {payment.periodStart && payment.periodEnd
                    ? `${formatDate(payment.periodStart)} — ${formatDate(payment.periodEnd)}`
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPaymentsPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => onPageChange(Math.max(1, paymentsPage - 1))}
              disabled={paymentsPage <= 1}
              className="text-xs font-medium text-neutral-600 transition hover:text-neutral-900 disabled:opacity-30"
              type="button"
            >
              Previous
            </button>
            <span className="text-xs text-neutral-500">
              {paymentsPage} of {totalPaymentsPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPaymentsPages, paymentsPage + 1))}
              disabled={paymentsPage >= totalPaymentsPages}
              className="text-xs font-medium text-neutral-600 transition hover:text-neutral-900 disabled:opacity-30"
              type="button"
            >
              Next
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
