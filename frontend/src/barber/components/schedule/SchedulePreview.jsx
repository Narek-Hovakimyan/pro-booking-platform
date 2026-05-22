import { Card, CardContent } from "@/shared/components/ui/card";

export default function SchedulePreview({
  selectedDateLabel,
  isNonWorkingDay,
  isWorking,
  startTime,
  endTime,
  isBreakEnabled,
  breakStart,
  breakEnd,
  hasCustomHours,
}) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="p-4 sm:p-6">
        <h2 className="text-lg font-bold">
          Preview: {selectedDateLabel}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Summary of schedule for the selected date.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Status
            </span>
            <p className="mt-1 font-semibold">
              {isNonWorkingDay || !isWorking ? (
                <span className="text-red-600">Day off</span>
              ) : (
                <span className="text-green-600">Working</span>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Hours
            </span>
            <p className="mt-1 font-semibold tabular-nums">
              {isNonWorkingDay || !isWorking
                ? "—"
                : `${startTime || "—"} — ${endTime || "—"}`}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Break
            </span>
            <p className="mt-1 font-semibold tabular-nums">
              {isNonWorkingDay || !isWorking || !isBreakEnabled
                ? "None"
                : `${breakStart || "—"} — ${breakEnd || "—"}`}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Type
            </span>
            <p className="mt-1 font-semibold">
              {hasCustomHours ? "Custom override" : "Default schedule"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
