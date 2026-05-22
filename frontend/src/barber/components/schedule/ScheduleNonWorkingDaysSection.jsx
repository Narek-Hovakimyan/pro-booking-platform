import EmptyState from "@/shared/components/common/EmptyState";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { formatDateLabel, parseDateKey } from "@/shared/utils/dates";

export default function ScheduleNonWorkingDaysSection({
  todayKey,
  dayOffDate,
  canMarkDayOff,
  isSaving,
  sortedNonWorkingDays,
  onDayOffDateChange,
  onMarkDayOff,
  onRestoreWorkingDate,
}) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="p-4 sm:p-6">
        <h2 className="text-lg font-bold">Non-Working Days</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Mark specific dates when you are not available.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Select date</span>
            <input
              className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-normal focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              min={todayKey}
              type="date"
              value={dayOffDate}
              onChange={(event) => onDayOffDateChange(event.target.value)}
              aria-label="Select date to mark as day off"
            />
          </label>
          <Button
            className="w-full sm:self-end sm:w-auto"
            disabled={!canMarkDayOff || isSaving}
            onClick={onMarkDayOff}
            variant="outline"
            aria-label="Mark selected date as day off"
          >
            Mark as day off
          </Button>
        </div>

        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-neutral-700">
            Marked days off ({sortedNonWorkingDays.length})
          </h3>
          {sortedNonWorkingDays.length === 0 ? (
            <EmptyState
              title="No days off"
              description="No non-working days have been set yet."
            />
          ) : (
            <div className="space-y-2">
              {sortedNonWorkingDays.map((dateKey) => {
                const formatted = parseDateKey(dateKey);
                const label = formatted ? formatDateLabel(formatted) : dateKey;

                return (
                  <div
                    className="flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50/40 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    key={dateKey}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600" aria-hidden="true">
                        ✕
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {label}
                        </p>
                        <p className="text-xs text-neutral-400">{dateKey}</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => onRestoreWorkingDate(dateKey)}
                      variant="outline"
                      disabled={isSaving}
                      size="sm"
                      className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:w-auto"
                      aria-label={`Restore ${label} as working day`}
                    >
                      Restore to default
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
