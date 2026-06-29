import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import EmptyState from "@/shared/components/common/EmptyState";
import { cn } from "@/shared/lib/utils";
import { formatDateLabel, parseDateKey } from "@/shared/utils/dates";

export default function ScheduleOverridesList({
  overrides,
  onEdit,
  onRemove,
  disabled,
}) {
  return (
    <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-purple-500">
              Saved Changes
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-950">
              Date-specific overrides
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Review custom dates, day-off overrides, and break changes for this salon.
            </p>
          </div>
          <span className="w-fit rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-100">
            {overrides.length} saved
          </span>
        </div>

        {overrides.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="No custom overrides"
              description="Add an override when a specific day differs from your default schedule."
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {overrides.map(({ dateKey, override }) => {
              const parsedDate = parseDateKey(dateKey);
              const isWorkingOverride = Boolean(override?.isWorking);
              const hasOverrideBreak = Boolean(
                override?.breakStart && override?.breakEnd
              );

              return (
                <div
                  className={cn(
                    "rounded-2xl border p-4 shadow-sm transition hover:shadow-md",
                    isWorkingOverride
                      ? "border-emerald-100 bg-emerald-50/50"
                      : "border-rose-100 bg-rose-50/60"
                  )}
                  key={dateKey}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-neutral-950">
                        {parsedDate ? formatDateLabel(parsedDate) : dateKey}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {dateKey}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold shadow-sm ring-1",
                        isWorkingOverride
                          ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                          : "bg-rose-100 text-rose-700 ring-rose-200"
                      )}
                    >
                      {isWorkingOverride ? "Working" : "Off"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-neutral-600">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500" aria-hidden="true">
                        H
                      </span>
                      <span>
                        <span className="font-medium text-neutral-800">
                          Hours:
                        </span>{" "}
                        {isWorkingOverride
                          ? `${override.startTime || "—"} to ${override.endTime || "—"}`
                          : "No bookings"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500" aria-hidden="true">
                        B
                      </span>
                      <span>
                        <span className="font-medium text-neutral-800">
                          Break:
                        </span>{" "}
                        {isWorkingOverride && hasOverrideBreak
                          ? `${override.breakStart} to ${override.breakEnd}`
                          : "None"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      disabled={disabled}
                      onClick={() => onEdit(dateKey)}
                      size="sm"
                      variant="outline"
                      className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 sm:w-auto"
                    >
                      Edit
                    </Button>
                    <Button
                      className="w-full border-rose-200 text-rose-700 hover:bg-rose-50 sm:w-auto"
                      disabled={disabled}
                      onClick={() => onRemove(dateKey)}
                      size="sm"
                      variant="outline"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
