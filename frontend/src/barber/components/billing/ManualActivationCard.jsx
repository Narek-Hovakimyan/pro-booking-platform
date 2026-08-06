import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { formatCurrency } from "../../utils/salonBillingFormatters";

export function ManualActivationCard({
  showManualActivationPanel,
  manualSeatCount,
  setManualSeatCount,
  manualMonths,
  setManualMonths,
  manualActivationSeatCount,
  pricePerSeat,
  currency,
  manualActivating,
  selectedSalonId,
  onManualActivation,
}) {
  if (!showManualActivationPanel) return null;

  return (
    <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-neutral-950">
            Development/MVP manual activation
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            In development mode, manual activation is available. Seats are still
            assigned separately.
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">Seats</span>
          <input
            className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            min="1"
            onChange={(event) => setManualSeatCount(event.target.value)}
            type="number"
            value={manualSeatCount}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-neutral-700">Months</span>
          <input
            className="mt-2 h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            min="1"
            onChange={(event) => setManualMonths(event.target.value)}
            type="number"
            value={manualMonths}
          />
        </label>
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-700">
          {manualActivationSeatCount} x {formatCurrency(pricePerSeat, currency)} x{" "}
          {Number(manualMonths) || 1} month(s)
        </div>
        <Button
          className="w-full rounded-2xl"
          disabled={manualActivating || !selectedSalonId}
          onClick={onManualActivation}
        >
          {manualActivating ? "Activating..." : "Activate salon manually"}
        </Button>
      </CardContent>
    </Card>
  );
}
