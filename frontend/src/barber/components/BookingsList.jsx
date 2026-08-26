import { useState } from "react";

import { Card, CardContent } from "@/shared/components/ui/card";
import BookingsHeaderFilters from "@/barber/components/bookings/BookingsHeaderFilters";
import BookingSections from "@/barber/components/bookings/BookingSections";
import ManualBookingModal from "@/barber/components/bookings/ManualBookingModal";
import RejectBookingModal from "@/barber/components/RejectBookingModal";
import useBarberBookings from "@/barber/hooks/useBarberBookings";
import { formatDateKey, formatDateLabel, getNext7Days, parseDateKey } from "@/shared/utils/dates";

const activeBookingSections = [
  { key: "pending", title: "Pending", emptyText: "No pending bookings", shouldAlwaysShow: true, statuses: ["pending"] },
  { key: "accepted", title: "Accepted", emptyText: "No accepted bookings", shouldAlwaysShow: true, statuses: ["accepted"] },
];
const historyBookingSections = [
  { key: "completed", title: "Completed", emptyText: "No completed bookings", statuses: ["completed"] },
  { key: "closed", title: "Closed", emptyText: "No closed bookings", statuses: ["rejected", "cancelled", "expired", "no_show", "late_cancelled"] },
];
const getBookingId = (booking) => booking?.id || booking?._id || "";
const getBookingName = (booking) => booking?.client?.name || booking?.clientName || "Client";
const getServiceName = (booking) => booking?.service?.name || booking?.serviceName || "Service";
const getBookingStatus = (booking) => booking?.status || "pending";
const getBookingTime = (booking) => booking?.time || "";

export default function BookingsList({ bookings, services = [], isLoading = false, error = "", view = "active" }) {
  const isHistoryView = view === "history";
  const [selectedDate, setSelectedDate] = useState(getNext7Days()[0].value);
  const dateOptions = getNext7Days();
  const hook = useBarberBookings({ services, selectedDate, setSelectedDate });
  const selectedDateObject = parseDateKey(selectedDate);
  const selectedDateLabel = selectedDateObject ? formatDateLabel(selectedDateObject) : selectedDate;
  const filteredBookings = bookings.filter((booking) => booking?.bookingDate === selectedDate);
  const sections = isHistoryView ? historyBookingSections : activeBookingSections;
  const groupedBookings = sections.map((section) => ({
    ...section,
    bookings: filteredBookings.filter((booking) => section.statuses.includes(getBookingStatus(booking))).sort((a, b) => getBookingTime(a).localeCompare(getBookingTime(b))),
  }));
  const actionError = hook.isAddModalOpen ? "" : hook.actionError;

  return <Card className="rounded-2xl sm:rounded-3xl lg:col-span-2"><CardContent className="space-y-5 p-4 sm:p-6">
    <BookingsHeaderFilters actionError={actionError} dateOptions={dateOptions} error={error} selectedDate={selectedDate} selectedDateLabel={selectedDateLabel}
      successMessage={hook.successMessage} view={view} onAddBooking={isHistoryView ? undefined : hook.openAddBookingModal} onDateInputChange={(value) => setSelectedDate(value || formatDateKey(new Date()))} onSelectDate={setSelectedDate} />
    <BookingSections filteredBookings={filteredBookings} getBookingId={getBookingId} getBookingStatus={getBookingStatus} getBookingTime={getBookingTime}
      getClientName={getBookingName} getServiceName={getServiceName} groupedBookings={groupedBookings} highlightedBookingIds={hook.highlightedBookingIds}
      isEligibleForNoShowLateCancel={hook.isEligibleForNoShowLateCancel} isInitialLoading={hook.isInitialLoading} isLoading={isLoading} showActions={!isHistoryView}
      onMarkLateCancelBooking={hook.markLateCancelBooking} onMarkNoShowBooking={hook.markNoShowBooking} onOpenRejectBookingModal={hook.openRejectBookingModal}
      onAcceptRescheduleRequest={(booking) => hook.respondToRescheduleRequest(booking, "accept")} onRejectRescheduleRequest={(booking) => hook.respondToRescheduleRequest(booking, "reject")}
      rescheduleAction={hook.rescheduleAction} onUpdateBookingStatus={hook.updateBookingStatus} />
    {!isHistoryView && hook.isAddModalOpen && <ManualBookingModal activeServices={hook.activeServices} error={hook.actionError} isAddingBooking={hook.isAddingBooking} manualBooking={hook.manualBooking}
      onClose={() => hook.setIsAddModalOpen(false)} onSubmit={hook.createManualBooking} onUpdateManualBooking={hook.updateManualBooking} />}
    {!isHistoryView && hook.rejectingBooking && <RejectBookingModal booking={hook.rejectingBooking} error={hook.rejectionError} isSubmitting={hook.isRejectingBooking}
      onClose={() => hook.setRejectingBooking(null)} onSubmit={hook.rejectBooking} />}
  </CardContent></Card>;
}
