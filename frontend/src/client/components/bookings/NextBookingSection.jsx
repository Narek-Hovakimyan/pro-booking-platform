import { CalendarClock, MessageCircle } from "lucide-react";
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
      <div className="mb-4 flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-brand-600" />
        <h2 className="text-xl font-bold tracking-tight text-neutral-950 sm:text-2xl">
          Next booking
        </h2>
      </div>

      {nextBooking ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-neutral-950">
                {barberName}
              </p>
              <p className="mt-0.5 text-sm text-neutral-600">
                {serviceName}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {bookingDate || "No date"} at {bookingTime || "HH:mm"}
              </p>
              {salonName && (
                <p className="mt-0.5 text-sm text-neutral-500">{salonName}</p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:flex">
            <Button className="w-full sm:w-auto" onClick={onViewDetails}>
              View details
            </Button>
            {canCancel && (
              <Button className="w-full sm:w-auto" onClick={onCancel} variant="outline">
                Cancel
              </Button>
            )}
            {canDelay && (
              <Button className="w-full sm:w-auto" onClick={onDelay} variant="outline">
                Delay
              </Button>
            )}
            {barberId && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => onMessage(barberId)}
                variant="outline"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Message
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-5 text-center shadow-card">
          <CalendarClock className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-2 font-medium text-neutral-950">No upcoming booking</p>
          <p className="mt-1 text-sm text-neutral-500">
            Find a specialist and book your next appointment.
          </p>
          <Button className="mt-3" onClick={onFindBarber}>
            Browse specialists
          </Button>
        </div>
      )}
    </div>
  );
}