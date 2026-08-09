import { RefreshCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function SalonCalendarHeader({
  loadingCalendar,
  onRefresh,
  selectedSalonId,
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Salon Calendar
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          View salon-managed staff bookings without exposing chair renter
          private activity.
        </p>
      </div>

      <Button
        className="gap-2"
        disabled={!selectedSalonId || loadingCalendar}
        onClick={onRefresh}
        variant="outline"
      >
        <RefreshCw className={`h-4 w-4 ${loadingCalendar ? "animate-spin" : ""}`} />
        Refresh
      </Button>
    </div>
  );
}
