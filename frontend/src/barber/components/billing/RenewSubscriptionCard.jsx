import { RefreshCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatCurrency } from "../../utils/salonBillingFormatters";

export function RenewSubscriptionCard({
  seatCountInput,
  paymentMonths,
  purchaseMonths,
  setSeatCountInput,
  setPaymentMonths,
  pricePerSeat,
  currency,
  purchaseSeatCount,
  purchaseMonthlyTotal,
  purchaseTotal,
  preparingPayment,
  selectedSalonId,
  onPreparePayment,
}) {
  return (
    <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-violet-500" />
          <h2 className="font-semibold text-neutral-950">Renew subscription</h2>
        </div>
        <p className="text-sm text-neutral-500">
          Extends your subscription period. Choose seats and months.
        </p>
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">Seats</span>
          <input
            className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            min="1"
            onChange={(event) => setSeatCountInput(event.target.value)}
            type="number"
            value={seatCountInput}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">Months</span>
          <input
            className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            min="1"
            onChange={(event) => setPaymentMonths(event.target.value)}
            type="number"
            value={paymentMonths}
          />
        </label>
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-700">
          <div>Price per seat: {formatCurrency(pricePerSeat, currency)}</div>
          <div className="mt-2 font-semibold text-neutral-950">
            {purchaseSeatCount} x {formatCurrency(pricePerSeat, currency)} ={" "}
            {formatCurrency(purchaseMonthlyTotal, currency)}/month
          </div>
          <div className="mt-1 font-semibold text-neutral-950">
            Total: {formatCurrency(purchaseTotal, currency)} for {purchaseMonths} month(s)
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            Final billing is confirmed by the server.
          </div>
        </div>
        <Button
          className="w-full rounded-2xl"
          disabled={preparingPayment || !selectedSalonId}
          onClick={() => onPreparePayment("renew")}
          variant="outline"
        >
          {preparingPayment ? "Preparing..." : "Prepare renewal payment"}
        </Button>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
          Renewal extends your subscription period after payment is confirmed.
        </div>
      </CardContent>
    </Card>
  );
}
