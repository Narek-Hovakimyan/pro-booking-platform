import { CalendarDays, Plus } from "lucide-react";

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
}) {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <CalendarDays className="h-6 w-6" />
          Ամրագրումներ
        </h2>

        <Button className="w-full sm:w-auto" onClick={onAddBooking}>
          <Plus className="mr-2 h-4 w-4" />
          Add Booking
        </Button>
      </div>

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
