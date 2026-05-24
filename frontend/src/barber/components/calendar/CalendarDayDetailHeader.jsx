// DEPRECATED — currently unused. BarberCalendarDayPage uses its own inline header.
import { CalendarDays } from "lucide-react";

export default function CalendarDayDetailHeader({
  selectedDateLabel,
  selectedDateDayKey,
  selectedDateKey,
  workingHoursLabel,
  breakFrom,
  breakTo,
  onDateChange,
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-100 bg-white/95 px-4 pb-4 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <CalendarDays className="h-5 w-5" />
            {selectedDateLabel}
          </h2>
          <div className="flex flex-wrap gap-2 text-sm text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-3 py-1">
              {selectedDateDayKey.toUpperCase()}
            </span>
            <span className="rounded-full bg-neutral-100 px-3 py-1">
              Working hours: {workingHoursLabel}
            </span>
            {breakFrom && breakTo && (
              <span className="rounded-full bg-neutral-100 px-3 py-1">
                Break: {breakFrom} - {breakTo}
              </span>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:items-end">
          <span>Select date</span>
          <input
            type="date"
            className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400"
            value={selectedDateKey}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
