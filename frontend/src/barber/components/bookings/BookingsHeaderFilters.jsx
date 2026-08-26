import { CalendarDays, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useInRouterContext } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";

export default function BookingsHeaderFilters({
  dateOptions,
  selectedDate,
  selectedDateLabel,
  error,
  actionError,
  successMessage,
  onAddBooking,
  onSelectDate,
  onDateInputChange,
  view = "active",
}) {
  const { t } = useTranslation();
  const isHistoryView = view === "history";
  const hasRouter = useInRouterContext();
  const BookingViewLink = hasRouter ? Link : "a";
  const upcomingLinkProps = hasRouter
    ? { to: "/admin/bookings" }
    : { href: "/admin/bookings" };
  const historyLinkProps = hasRouter
    ? { to: "/admin/booking-history" }
    : { href: "/admin/booking-history" };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <CalendarDays className="h-6 w-6" />
          {isHistoryView ? "Booking History" : t("nav.bookings")}
        </h2>

        {!isHistoryView && (
          <Button className="w-full sm:w-auto" onClick={onAddBooking}>
            <Plus className="mr-2 h-4 w-4" />
            Add Booking
          </Button>
        )}
      </div>

      <nav aria-label="Booking views" className="flex gap-2">
        <Button
          aria-current={!isHistoryView ? "page" : undefined}
          as={BookingViewLink}
          {...upcomingLinkProps}
          variant={!isHistoryView ? "default" : "outline"}
        >
          Upcoming
        </Button>
        <Button
          aria-current={isHistoryView ? "page" : undefined}
          as={BookingViewLink}
          {...historyLinkProps}
          variant={isHistoryView ? "default" : "outline"}
        >
          History
        </Button>
      </nav>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {actionError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError}
        </p>
      )}
      {successMessage && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {dateOptions.map((day) => (
          <Button
            className="flex-1 sm:flex-none"
            key={day.value}
            onClick={() => onSelectDate(day.value)}
            variant={selectedDate === day.value ? "default" : "outline"}
          >
            {day.label}
          </Button>
        ))}
      </div>

      <label className="grid max-w-xs gap-2 text-sm font-semibold">
        Filter by date
        <input
          className="rounded-2xl border p-3 font-normal"
          type="date"
          value={selectedDate}
          onChange={(event) => onDateInputChange(event.target.value)}
        />
      </label>

      <p className="text-sm font-medium text-neutral-600">
        Showing bookings for {selectedDateLabel}
      </p>
    </>
  );
}
