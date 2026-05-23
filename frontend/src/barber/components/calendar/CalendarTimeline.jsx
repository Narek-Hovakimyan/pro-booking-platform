import { CalendarDays, Eye, EyeOff, List } from "lucide-react";
import { useMemo } from "react";

import CalendarBookingCard from "@/barber/components/calendar/CalendarBookingCard";
import { Button } from "@/shared/components/ui/button";
import { minutesToTime, timeToMinutes } from "@/shared/utils/time";

function getBookingStatus(booking) {
  return booking?.status || "pending";
}

function getBookingNotes(booking) {
  return booking?.notes || booking?.note || booking?.reason || "";
}

function getClientPhone(booking) {
  return booking?.client?.phone || booking?.clientPhone || booking?.phone || "";
}

function getClientName(booking) {
  return booking?.client?.name || booking?.clientName || "Client";
}

function getServiceName(booking) {
  return booking?.service?.name || booking?.serviceName || "Service";
}

function getBookingTime(booking) {
  return booking?.time || "";
}

function getBookingDuration(booking) {
  const duration = Number(booking?.duration || 20);
  return Number.isFinite(duration) && duration > 0 ? duration : 20;
}

function getBookingPrice(booking) {
  const price = Number(booking?.price);
  return Number.isFinite(price) ? price : 0;
}

function formatTimeRange(startTime, duration) {
  const startMinutes = timeToMinutes(startTime);
  if (startMinutes === null) return startTime || "";

  return `${minutesToTime(startMinutes)} - ${minutesToTime(startMinutes + duration)}`;
}

export default function CalendarTimeline({
  timelineRows = [],
  isLoading = false,
  isNonWorkingDay = false,
  isEmpty = false,
  showFullTimeline = false,
  onToggleFullTimeline,
  onAccept,
  onReject,
  onComplete,
  onNoShow,
  onLateCancel,
}) {
  // Extract unique bookings that start at a row's slot (agenda view)
  const agendaBookings = useMemo(() => {
    const seen = new Set();
    return timelineRows
      .filter((row) => {
        if (row.rowType !== "booking-start" || !row.bookingEntry?.booking) return false;
        const booking = row.bookingEntry.booking;
        const id = booking?.id || booking?._id || row.slotTime;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((row) => ({
        booking: row.bookingEntry.booking,
        startTime: row.slotTime,
        duration: row.bookingEntry.duration,
      }));
  }, [timelineRows]);

  const hasBookings = agendaBookings.length > 0;

  return (
    <>
      {isLoading && (
        <p className="rounded-2xl bg-neutral-50 p-5 text-sm text-neutral-500">
          Loading bookings...
        </p>
      )}

      {!isLoading && isNonWorkingDay && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-600">
          <p className="font-semibold text-neutral-900">Non-working day</p>
          <p className="mt-1">
            No timeline is shown because this day is marked as unavailable.
          </p>
        </div>
      )}

      {!isLoading && !isNonWorkingDay && isEmpty && !hasBookings && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
            <CalendarDays className="mx-auto mb-2 h-8 w-8 text-neutral-300" />
            <p className="font-medium text-neutral-700">No bookings scheduled for this day</p>
            <p className="mt-1 text-neutral-400">
              The day is marked as working, but there are no bookings yet.
            </p>
          </div>

          {onToggleFullTimeline && (
            <div className="text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleFullTimeline}
              >
                {showFullTimeline ? (
                  <><EyeOff className="mr-2 h-4 w-4" /> Hide full timeline</>
                ) : (
                  <><Eye className="mr-2 h-4 w-4" /> Show full timeline</>
                )}
              </Button>
            </div>
          )}

          {showFullTimeline && timelineRows.length > 0 && (
            <FullTimelineView
              timelineRows={timelineRows}
              onAccept={onAccept}
              onReject={onReject}
              onComplete={onComplete}
              onNoShow={onNoShow}
              onLateCancel={onLateCancel}
            />
          )}
        </div>
      )}

      {!isLoading && !isNonWorkingDay && (hasBookings || showFullTimeline) && (
        <div className="space-y-4">
          {/* Toggle button */}
          {onToggleFullTimeline && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFullTimeline}
                className="text-xs text-neutral-500 hover:text-neutral-900"
              >
                {showFullTimeline ? (
                  <><EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide full timeline</>
                ) : (
                  <><List className="mr-1.5 h-3.5 w-3.5" /> Show full timeline ({agendaBookings.length} booking{agendaBookings.length !== 1 ? "s" : ""})</>
                )}
              </Button>
            </div>
          )}

          {/* Agenda view (default) */}
          {!showFullTimeline && agendaBookings.length > 0 && (
            <div className="space-y-3">
              {agendaBookings.map(({ booking, startTime, duration }) => {
                const status = getBookingStatus(booking);
                const bookingNotes = getBookingNotes(booking);
                const bookingPhone = getClientPhone(booking);

                return (
                  <div key={startTime}>
                    <CalendarBookingCard
                      booking={booking}
                      status={status}
                      clientName={getClientName(booking)}
                      timeRange={formatTimeRange(startTime, duration)}
                      serviceName={getServiceName(booking)}
                      phone={bookingPhone}
                      duration={duration}
                      price={getBookingPrice(booking)}
                      notes={bookingNotes}
                      onAccept={() => onAccept?.(booking)}
                      onReject={() => onReject?.(booking)}
                      onComplete={() => onComplete?.(booking)}
                      onNoShow={() => onNoShow?.(booking)}
                      onLateCancel={() => onLateCancel?.(booking)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Full timeline (detailed view) */}
          {showFullTimeline && timelineRows.length > 0 && (
            <FullTimelineView
              timelineRows={timelineRows}
              onAccept={onAccept}
              onReject={onReject}
              onComplete={onComplete}
              onNoShow={onNoShow}
              onLateCancel={onLateCancel}
            />
          )}
        </div>
      )}
    </>
  );
}

function FullTimelineView({
  timelineRows = [],
  onAccept,
  onReject,
  onComplete,
  onNoShow,
  onLateCancel,
}) {
  // Hide occupied continuation rows — booking card already shows duration
  const visibleRows = timelineRows.filter(
    (row) => row.rowType !== "booking-continue"
  );

  return (
    <div className="space-y-3">
      {visibleRows.map((row) => {
        const booking = row.bookingEntry?.booking;
        const status = booking ? getBookingStatus(booking) : "";
        const bookingNotes = booking ? getBookingNotes(booking) : "";
        const bookingPhone = booking ? getClientPhone(booking) : "";

        return (
          <div
            key={row.slotTime}
            className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-2xl border border-neutral-100 bg-white p-3 sm:grid-cols-[88px_minmax(0,1fr)] sm:p-4"
          >
            <div className="pt-1 text-sm font-semibold text-neutral-700">
              {row.slotTime}
            </div>

            <div className="min-w-0">
              {row.rowType === "free" && (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-400">
                  Free
                </div>
              )}

              {row.rowType === "break-start" && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  <div className="font-semibold">Break</div>
                  <div className="mt-1">{row.breakRange}</div>
                </div>
              )}

              {row.rowType === "break-continue" && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm text-sky-700">
                  Break
                </div>
              )}

              {row.rowType === "booking-start" && booking && (

                <CalendarBookingCard
                  booking={booking}
                  status={status}
                  clientName={getClientName(booking)}
                  timeRange={formatTimeRange(
                    getBookingTime(booking),
                    getBookingDuration(booking)
                  )}
                  serviceName={getServiceName(booking)}
                  phone={bookingPhone}
                  duration={getBookingDuration(booking)}
                  price={getBookingPrice(booking)}
                  notes={bookingNotes}
                  onAccept={() => onAccept?.(booking)}
                  onReject={() => onReject?.(booking)}
                  onComplete={() => onComplete?.(booking)}
                  onNoShow={() => onNoShow?.(booking)}
                  onLateCancel={() => onLateCancel?.(booking)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
