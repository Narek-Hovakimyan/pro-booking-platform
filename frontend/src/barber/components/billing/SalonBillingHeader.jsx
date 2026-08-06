import { RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { getSalonName } from "../../utils/salonBillingFormatters";

export function SalonBillingHeader({ selectedSalon, onRefresh, refreshDisabled }) {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Salon billing workspace
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            Salon Billing
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Manage salon subscription, seats, and payments for approved
            specialists.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {selectedSalon && (
            <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm">
              <div className="text-xs font-semibold uppercase text-neutral-500">
                Selected salon
              </div>
              <div className="mt-1 font-semibold text-neutral-950">
                {getSalonName(selectedSalon)}
              </div>
            </div>
          )}
          <Button
            className="gap-2 rounded-2xl"
            disabled={refreshDisabled}
            onClick={onRefresh}
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}
