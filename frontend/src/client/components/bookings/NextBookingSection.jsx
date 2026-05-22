import { MessageCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function NextBookingSection({
  barberId,
  barberName,
  bookingDate,
  bookingTime,
  canCancel,
  canDelay,
  nextBooking,
  salonName,
  serviceName,
  statusClass,
  statusLabel,
  onCancel,
  onDelay,
  onFindBarber,
  onMessage,
  onViewDetails,
}) {
  return (
    <div>
      <h2 className="text-xl font-bold sm:text-2xl">Next booking</h2>

      {nextBooking ? (
        <>
          <div className="mt-4 space-y-2">
            <p className="text-lg font-semibold text-neutral-950">
              {barberName} — {serviceName}
            </p>
            <p className="text-sm text-neutral-600">
              {bookingDate || "No date"} at {bookingTime || "HH:mm"}
            </p>
            {salonName && (
              <p className="text-sm text-neutral-500">{salonName}</p>
            )}
            <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
              <span>Status:</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}
              >
                {statusLabel}
              </span>
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:flex">
            <Button
              className="w-full sm:w-auto"
              onClick={onViewDetails}
              variant="outline"
            >
              View details
            </Button>
            {barberId && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => onMessage(barberId)}
                variant="outline"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Message barber
              </Button>
            )}
            {canCancel && (
              <Button
                className="w-full sm:w-auto"
                onClick={onCancel}
                variant="outline"
              >
                Cancel booking
              </Button>
            )}
            {canDelay && (
              <Button
                className="w-full sm:w-auto"
                onClick={onDelay}
                variant="outline"
              >
                I'm running late
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-neutral-800">No upcoming booking</p>
            <p className="mt-1 text-sm text-neutral-500">
              Bookings you create will appear here.
            </p>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={onFindBarber}
            variant="outline"
          >
            Find a barber
          </Button>
        </div>
      )}
    </div>
  );
}
