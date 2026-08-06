import { Users } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatCurrency, formatDate } from "../../utils/salonBillingFormatters";

export function SeatUpdateCard({
  subscription,
  paidSeatCount,
  seatCountInput,
  setSeatCountInput,
  pricePerSeat,
  currency,
  purchaseSeatCount,
  preparingPayment,
  selectedSalonId,
  onPreparePayment,
}) {
  if (!subscription) return null;

  return (
    <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-500" />
          <h2 className="font-semibold text-neutral-950">Update seats</h2>
        </div>
        <p className="text-sm text-neutral-500">
          Changes how many specialists can be covered. Expiry date will not change.
        </p>
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">
            New seat count
          </span>
          <input
            className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            min="1"
            onChange={(event) => setSeatCountInput(event.target.value)}
            type="number"
            value={seatCountInput}
          />
        </label>
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-700">
          <div>
            Current seats: <strong>{paidSeatCount}</strong>
          </div>
          <div>
            New seats: <strong>{purchaseSeatCount}</strong>
          </div>
          <div className="mt-2 font-semibold text-neutral-950">
            Extra cost:{" "}
            {formatCurrency(Math.max(0, purchaseSeatCount - paidSeatCount) * pricePerSeat, currency)}
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            Expiry: {formatDate(subscription?.currentPeriodEnd)}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Final billing is confirmed by the server.
          </div>
        </div>
        <Button
          className="w-full rounded-2xl"
          disabled={preparingPayment || !selectedSalonId}
          onClick={() => onPreparePayment("update_seats")}
          variant="outline"
        >
          {preparingPayment ? "Preparing..." : "Prepare seat update"}
        </Button>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
          Seat updates only change capacity. Subscription period remains unchanged.
        </div>
      </CardContent>
    </Card>
  );
}
