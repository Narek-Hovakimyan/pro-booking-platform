import { XCircle } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { getPersonName } from "../../utils/salonBillingFormatters";

export function SeatLists({
  activeSeats,
  revokedSeats,
  subscriptionIsActive,
  saving,
  onRevokeSeat,
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="font-semibold text-neutral-950">
            {subscriptionIsActive ? "Active seats" : "Inactive seat assignments"}
          </h3>
          <span className="text-xs font-medium text-neutral-500">
            {activeSeats.length} assigned
          </span>
        </div>
        {activeSeats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-500">
            No active seats assigned.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {activeSeats.map((seat) => (
              <div
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={seat._id || seat.id}
              >
                <div>
                  <div className="font-semibold text-neutral-950">
                    {getPersonName(seat)}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {subscriptionIsActive ? "Assigned specialist" : "Inactive until renewal"}
                  </div>
                </div>
                <Button
                  className="w-full gap-2 rounded-2xl sm:w-auto"
                  disabled={saving}
                  onClick={() => onRevokeSeat(seat._id || seat.id)}
                  variant="outline"
                >
                  <XCircle className="h-4 w-4" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {revokedSeats.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-neutral-950">Revoked seats</h3>
          <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {revokedSeats.map((seat) => (
              <div
                className="flex items-center justify-between gap-3 p-4 text-sm"
                key={seat._id || seat.id}
              >
                <span className="font-medium text-neutral-800">
                  {getPersonName(seat)}
                </span>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500">
                  Revoked
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
