import { Card, CardContent } from "@/shared/components/ui/card";
import {
  WEEKDAYS,
  getBookingColor,
  getBookingId,
  getClientName,
  getBookingTime,
  getBookingStatus,
  getEffectiveDaySchedule,
  isDayToday,
  isDaySelected,
  getDayDateStr,
} from "@/barber/utils/calendarHelpers";

export default function CalendarGrid({
  monthDays,
  viewYear,
  viewMonth,
  todayKey,
  selectedDateKey,
  bookingsByDate,
  scheduleEntry,
  barberDefaultSchedule,
  onDayClick,
}) {
  const handleDayClick = (day) => {
    if (day === null) return;
    const dateStr = getDayDateStr(day, viewYear, viewMonth);
    onDayClick(dateStr);
  };

  return (
    <Card className="overflow-hidden rounded-2xl sm:rounded-3xl">
      <CardContent className="p-2 sm:p-4">
        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-7">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-semibold uppercase text-neutral-500"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {monthDays.map((day, idx) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="aspect-square border border-neutral-100 bg-neutral-50/50"
                />
              );
            }

            const dateStr = getDayDateStr(day, viewYear, viewMonth);
            const dayBookings = bookingsByDate[dateStr] || [];
            const { isNonWorkingDay: isNonWorking } = getEffectiveDaySchedule(
              scheduleEntry,
              dateStr,
              barberDefaultSchedule
            );
            const dots = dayBookings.slice(0, 3);
            const extraCount = dayBookings.length - 3;

            return (
              <button
                key={dateStr}
                onClick={() => handleDayClick(day)}
                className={`relative flex min-h-[70px] flex-col items-center justify-start gap-0.5 border border-neutral-100 p-1 text-sm transition-colors hover:bg-neutral-50 sm:min-h-[90px] ${
                  isDaySelected(day, viewYear, viewMonth, selectedDateKey)
                    ? "bg-neutral-50 ring-2 ring-inset ring-neutral-900"
                    : ""
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium sm:text-sm ${
                    isDayToday(day, viewYear, viewMonth, todayKey)
                      ? "bg-neutral-900 text-white"
                      : isNonWorking
                        ? "text-red-400"
                        : "text-neutral-700"
                  }`}
                >
                  {day}
                </span>

                {dots.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-0.5">
                    {dots.map((b) => (
                      <span
                        key={getBookingId(b)}
                        className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${getBookingColor(b.status)}`}
                        title={`${getClientName(b)} - ${getBookingTime(b)} (${getBookingStatus(b)})`}
                      />
                    ))}
                  </div>
                )}

                {extraCount > 0 && (
                  <span className="text-[10px] font-medium leading-none text-neutral-400">
                    +{extraCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
