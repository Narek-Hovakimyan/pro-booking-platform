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
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Date-Specific Overrides</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Review custom dates, day-off overrides, and break changes for this salon.
            </p>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
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
                    "rounded-2xl border p-4 shadow-sm",
                    isWorkingOverride
                      ? "border-neutral-200 bg-white"
                      : "border-red-100 bg-red-50/60"
                  )}
                  key={dateKey}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-neutral-950">
                        {parsedDate ? formatDateLabel(parsedDate) : dateKey}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {dateKey}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        isWorkingOverride
                          ? "bg-green-50 text-green-700"
                          : "bg-red-100 text-red-700"
                      )}
                    >
                      {isWorkingOverride ? "Working" : "Off"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-neutral-600">
                    <p>
                      <span className="font-medium text-neutral-800">
                        Hours:
                      </span>{" "}
                      {isWorkingOverride
                        ? `${override.startTime || "—"} to ${override.endTime || "—"}`
                        : "No bookings"}
                    </p>
                    <p>
                      <span className="font-medium text-neutral-800">
                        Break:
                      </span>{" "}
                      {isWorkingOverride && hasOverrideBreak
                        ? `${override.breakStart} to ${override.breakEnd}`
                        : "None"}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="w-full sm:w-auto"
                      disabled={disabled}
                      onClick={() => onEdit(dateKey)}
                      size="sm"
                      variant="outline"
                    >
                      Edit
                    </Button>
                    <Button
                      className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:w-auto"
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
