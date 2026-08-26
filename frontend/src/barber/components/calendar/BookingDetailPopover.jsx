import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import CalendarBookingCard from "@/barber/components/calendar/CalendarBookingCard";
import { getBookingDuration, getBookingServiceName, getBookingTime, getClientName } from "@/barber/utils/calendarHelpers";
import { minutesToTime, timeToMinutes } from "@/shared/utils/time";

const getPhone = (booking) => booking?.client?.phone || booking?.clientPhone || booking?.phone || "";
const getPrice = (booking) => Number.isFinite(Number(booking?.price)) ? Number(booking.price) : 0;
const getNotes = (booking) => booking?.notes || booking?.note || booking?.reason || "";
const getStatus = (booking) => booking?.status || "pending";
const getTimeRange = (booking) => {
  const time = getBookingTime(booking);
  const start = timeToMinutes(time);
  return start === null ? time : `${time} – ${minutesToTime(start + getBookingDuration(booking))}`;
};

export default function BookingDetailPopover({ booking, topPx, heightPx, totalHeight, onClose, onAccept, onReject, onComplete, onNoShow, onLateCancel, isActionPending, returnFocus }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.querySelector("button")?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocus?.focus?.();
    };
  }, [onClose, returnFocus]);
  if (!booking) return null;
  const below = topPx + heightPx + 8;
  const top = totalHeight - below >= 320 ? below : Math.max(20, topPx - 328);
  const closeAfter = (action) => () => { action?.(booking); onClose(); };
  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Booking details for ${getClientName(booking)}`} className="absolute z-50 w-full max-w-[360px] rounded-2xl border border-neutral-200 bg-white shadow-xl" style={{ top: `${top}px`, left: "50%", transform: "translateX(-50%)", minWidth: "260px" }}>
    <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700" aria-label="Close booking detail"><X className="h-4 w-4" /></button>
    <div className="p-4 sm:p-5"><CalendarBookingCard booking={booking} status={getStatus(booking)} clientName={getClientName(booking)} timeRange={getTimeRange(booking)} serviceName={getBookingServiceName(booking)} phone={getPhone(booking)} duration={getBookingDuration(booking)} price={getPrice(booking)} notes={getNotes(booking)} onAccept={closeAfter(onAccept)} onReject={closeAfter(onReject)} onComplete={closeAfter(onComplete)} onNoShow={closeAfter(onNoShow)} onLateCancel={closeAfter(onLateCancel)} isActionPending={isActionPending} /></div>
  </div>;
}
