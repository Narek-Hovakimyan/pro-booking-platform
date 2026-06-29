import EmptyState from "@/shared/components/common/EmptyState";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { formatDateLabel, parseDateKey } from "@/shared/utils/dates";

export default function ScheduleNonWorkingDaysSection({
  isSaving,
  sortedNonWorkingDays,
  onRestoreWorkingDate,
}) {
  return (
    <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40">
      <CardContent className="p-4 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-purple-500">
          Time Off
        </p>
        <h2 className="mt-1 text-lg font-bold text-neutral-950">
          Non-working days
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Dates marked as days off. Use the Date-Specific Override editor above to mark a date as day off.
        </p>

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
                    className="flex flex-col gap-3 rounded-2xl border border-rose-100 bg-rose-50/50 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    key={dateKey}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-600" aria-hidden="true">
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
                      className="w-full border-rose-200 text-rose-700 hover:bg-rose-50 sm:w-auto"
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
