import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

function timeInputClass(hasError) {
  return cn(
    "h-12 w-full rounded-xl border px-3 py-2 font-normal tabular-nums transition",
    "focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10",
    "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400",
    hasError &&
      "border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-200"
  );
}

export default function DefaultScheduleSection({
  allSalonEntries,
  salonSchedules,
  savingSalonId,
  savedSalonId,
  errorSalonId,
  salonScheduleErrors,
  onUpdateSchedule,
  onSaveSchedule,
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-neutral-950">
          Default working hours
        </h3>
        <p className="text-sm text-neutral-500">
          Used when a selected date does not have a custom override.
        </p>
      </div>

      {allSalonEntries.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          No salons found. Join a salon first.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {allSalonEntries.map((entry) => {
            const salonData = entry.salon || {};
            const salonId = salonData?.id || salonData?._id || entry.salon;
            const salonName = salonData?.name || "Salon";
            const schedule = salonSchedules[salonId] || {
              startTime: "09:00",
              endTime: "18:00",
              hasBreak: false,
              breakStart: "",
              breakEnd: "",
            };
            const isSaving = savingSalonId === salonId;
            const saved = savedSalonId === salonId;
            const error = errorSalonId === salonId ? salonScheduleErrors[salonId] : "";

            return (
              <div
                key={salonId}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
              >
                <h4 className="text-lg font-semibold text-neutral-950 mb-4">
                  {salonName}
                </h4>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold">
                    Default work start
                    <input
                      className={timeInputClass(error && error.includes("start"))}
                      inputMode="numeric"
                      pattern="[0-9]{2}:[0-9]{2}"
                      value={schedule.startTime}
                      onChange={(e) =>
                        onUpdateSchedule(salonId, "startTime", e.target.value)
                      }
                      placeholder="HH:mm"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold">
                    Default work end
                    <input
                      className={timeInputClass(error && error.includes("end"))}
                      inputMode="numeric"
                      pattern="[0-9]{2}:[0-9]{2}"
                      value={schedule.endTime}
                      onChange={(e) =>
                        onUpdateSchedule(salonId, "endTime", e.target.value)
                      }
                      placeholder="HH:mm"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h5 className="font-semibold text-neutral-950 text-sm">
                      Break time
                    </h5>
                    <p className="text-xs text-neutral-500">
                      Optional default break for regular working days.
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={schedule.hasBreak}
                      onChange={(e) =>
                        onUpdateSchedule(salonId, "hasBreak", e.target.checked)
                      }
                    />
                    Has break?
                  </label>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold">
                    Break start
                    <input
                      className={timeInputClass(error && error.includes("Break"))}
                      disabled={!schedule.hasBreak}
                      inputMode="numeric"
                      pattern="[0-9]{2}:[0-9]{2}"
                      value={schedule.breakStart || ""}
                      onChange={(e) =>
                        onUpdateSchedule(salonId, "breakStart", e.target.value)
                      }
                      placeholder="HH:mm"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold">
                    Break end
                    <input
                      className={timeInputClass(error && error.includes("Break"))}
                      disabled={!schedule.hasBreak}
                      inputMode="numeric"
                      pattern="[0-9]{2}:[0-9]{2}"
                      value={schedule.breakEnd || ""}
                      onChange={(e) =>
                        onUpdateSchedule(salonId, "breakEnd", e.target.value)
                      }
                      placeholder="HH:mm"
                    />
                  </label>
                </div>

                {error && (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                {saved && (
                  <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    Default schedule saved for {salonName}.
                  </p>
                )}

                <Button
                  className="mt-4 w-full sm:w-auto"
                  disabled={isSaving}
                  onClick={() => onSaveSchedule(salonId)}
                >
                  {isSaving ? "Saving..." : `Save for ${salonName}`}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
