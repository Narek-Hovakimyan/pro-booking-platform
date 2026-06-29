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

const DAYS = [
  { label: "Mon", key: "mon" },
  { label: "Tue", key: "tue" },
  { label: "Wed", key: "wed" },
  { label: "Thu", key: "thu" },
  { label: "Fri", key: "fri" },
  { label: "Sat", key: "sat" },
  { label: "Sun", key: "sun" },
];

const WORK_TIME_PRESETS = ["09:00", "10:00", "18:00", "20:00"];
const BREAK_TIME_PRESETS = ["12:00", "13:00", "14:00", "15:00"];

function TimePresetChips({ disabled, label, onSelect, presets }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-normal text-neutral-400">{label}</span>
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(preset)}
          className="rounded-full border border-purple-100 bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-purple-700 shadow-sm transition hover:border-purple-200 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {preset}
        </button>
      ))}
    </div>
  );
}

const getWeeklyDayState = (schedule, dayKey) => {
  const weeklyDay = schedule.weeklySchedule?.[dayKey] || {};
  const isWorking = weeklyDay.working !== false;

  return {
    isWorking,
    from: isWorking ? weeklyDay.from || schedule.startTime : "",
    to: isWorking ? weeklyDay.to || schedule.endTime : "",
    breakFrom: isWorking ? weeklyDay.breakFrom || "" : "",
    breakTo: isWorking ? weeklyDay.breakTo || "" : "",
  };
};

export default function DefaultScheduleSection({
  allSalonEntries,
  salonSchedules,
  savingSalonId,
  savedSalonId,
  errorSalonId,
  salonScheduleErrors,
  onUpdateSchedule,
  onUpdateWeeklyDay,
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
              weeklySchedule: {},
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
                    <p className="text-xs font-normal text-neutral-400">
                      Use 24-hour format, for example 09:00.
                    </p>
                    <TimePresetChips
                      disabled={isSaving}
                      label="Set start:"
                      presets={WORK_TIME_PRESETS}
                      onSelect={(value) =>
                        onUpdateSchedule(salonId, "startTime", value)
                      }
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
                    <p className="text-xs font-normal text-neutral-400">
                      End time must be after start time.
                    </p>
                    <TimePresetChips
                      disabled={isSaving}
                      label="Set end:"
                      presets={WORK_TIME_PRESETS}
                      onSelect={(value) =>
                        onUpdateSchedule(salonId, "endTime", value)
                      }
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-purple-100 bg-white p-3 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

                  <p className="mt-3 text-xs text-neutral-500">
                    Break time should stay inside working hours. It remains optional.
                  </p>

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
                    <TimePresetChips
                      disabled={isSaving || !schedule.hasBreak}
                      label="Set start:"
                      presets={BREAK_TIME_PRESETS}
                      onSelect={(value) =>
                        onUpdateSchedule(salonId, "breakStart", value)
                      }
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
                    <TimePresetChips
                      disabled={isSaving || !schedule.hasBreak}
                      label="Set end:"
                      presets={BREAK_TIME_PRESETS}
                      onSelect={(value) =>
                        onUpdateSchedule(salonId, "breakEnd", value)
                      }
                    />
                  </label>
                </div>
                </div>

                <div className="mt-5">
                  <div className="mb-3">
                    <h5 className="font-semibold text-neutral-950 text-sm">
                      Weekly defaults
                    </h5>
                    <p className="text-xs text-neutral-500">
                      Turn off regular rest days. Date-specific overrides still take priority.
                    </p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {DAYS.map(({ label, key }) => {
                      const dayState = getWeeklyDayState(schedule, key);

                      return (
                        <div
                          key={key}
                          className={cn(
                            "rounded-2xl border p-3 shadow-sm transition",
                            dayState.isWorking
                              ? "border-emerald-100 bg-emerald-50/40"
                              : "border-rose-100 bg-rose-50/50"
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-neutral-950">
                                {label}
                              </div>
                              <span
                                className={cn(
                                  "mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                                  dayState.isWorking
                                    ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                                    : "bg-rose-100 text-rose-700 ring-rose-200"
                                )}
                              >
                                {dayState.isWorking ? "Working" : "Day off / Rest day"}
                              </span>
                            </div>

                            <label className="inline-flex items-center gap-2 text-sm font-semibold">
                              <input
                                type="checkbox"
                                checked={dayState.isWorking}
                                onChange={(event) =>
                                  onUpdateWeeklyDay(
                                    salonId,
                                    key,
                                    event.target.checked
                                      ? {
                                          working: true,
                                          from: dayState.from || schedule.startTime,
                                          to: dayState.to || schedule.endTime,
                                          breakFrom: dayState.breakFrom || "",
                                          breakTo: dayState.breakTo || "",
                                        }
                                      : {
                                          working: false,
                                          from: "",
                                          to: "",
                                          breakFrom: "",
                                          breakTo: "",
                                        }
                                  )
                                }
                              />
                              Working
                            </label>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <label className="grid gap-1 text-xs font-semibold text-neutral-600">
                              Work start
                              <input
                                className={timeInputClass(Boolean(error))}
                                disabled={!dayState.isWorking}
                                inputMode="numeric"
                                pattern="[0-9]{2}:[0-9]{2}"
                                value={dayState.from}
                                onChange={(event) =>
                                  onUpdateWeeklyDay(salonId, key, {
                                    working: true,
                                    from: event.target.value,
                                    to: dayState.to || schedule.endTime,
                                    breakFrom: dayState.breakFrom || "",
                                    breakTo: dayState.breakTo || "",
                                  })
                                }
                                placeholder="HH:mm"
                              />
                              <p className="font-normal text-neutral-400">
                                Use 24-hour format.
                              </p>
                              <TimePresetChips
                                disabled={isSaving || !dayState.isWorking}
                                label="Set:"
                                presets={WORK_TIME_PRESETS}
                                onSelect={(value) =>
                                  onUpdateWeeklyDay(salonId, key, {
                                    working: true,
                                    from: value,
                                    to: dayState.to || schedule.endTime,
                                    breakFrom: dayState.breakFrom || "",
                                    breakTo: dayState.breakTo || "",
                                  })
                                }
                              />
                            </label>

                            <label className="grid gap-1 text-xs font-semibold text-neutral-600">
                              Work end
                              <input
                                className={timeInputClass(Boolean(error))}
                                disabled={!dayState.isWorking}
                                inputMode="numeric"
                                pattern="[0-9]{2}:[0-9]{2}"
                                value={dayState.to}
                                onChange={(event) =>
                                  onUpdateWeeklyDay(salonId, key, {
                                    working: true,
                                    from: dayState.from || schedule.startTime,
                                    to: event.target.value,
                                    breakFrom: dayState.breakFrom || "",
                                    breakTo: dayState.breakTo || "",
                                  })
                                }
                                placeholder="HH:mm"
                              />
                              <p className="font-normal text-neutral-400">
                                End time must be after start time.
                              </p>
                              <TimePresetChips
                                disabled={isSaving || !dayState.isWorking}
                                label="Set:"
                                presets={WORK_TIME_PRESETS}
                                onSelect={(value) =>
                                  onUpdateWeeklyDay(salonId, key, {
                                    working: true,
                                    from: dayState.from || schedule.startTime,
                                    to: value,
                                    breakFrom: dayState.breakFrom || "",
                                    breakTo: dayState.breakTo || "",
                                  })
                                }
                              />
                            </label>

                            <div className="rounded-xl border border-purple-100 bg-white p-3 sm:col-span-2">
                              <p className="mb-2 text-xs font-normal text-neutral-400">
                                Break time should stay inside working hours and is optional.
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                            <label className="grid gap-1 text-xs font-semibold text-neutral-600">
                              Break start
                              <input
                                className={timeInputClass(Boolean(error))}
                                disabled={!dayState.isWorking}
                                inputMode="numeric"
                                pattern="[0-9]{2}:[0-9]{2}"
                                value={dayState.breakFrom}
                                onChange={(event) =>
                                  onUpdateWeeklyDay(salonId, key, {
                                    working: true,
                                    from: dayState.from || schedule.startTime,
                                    to: dayState.to || schedule.endTime,
                                    breakFrom: event.target.value,
                                    breakTo: dayState.breakTo || "",
                                  })
                                }
                                placeholder="HH:mm"
                              />
                              <TimePresetChips
                                disabled={isSaving || !dayState.isWorking}
                                label="Set:"
                                presets={BREAK_TIME_PRESETS}
                                onSelect={(value) =>
                                  onUpdateWeeklyDay(salonId, key, {
                                    working: true,
                                    from: dayState.from || schedule.startTime,
                                    to: dayState.to || schedule.endTime,
                                    breakFrom: value,
                                    breakTo: dayState.breakTo || "",
                                  })
                                }
                              />
                            </label>

                            <label className="grid gap-1 text-xs font-semibold text-neutral-600">
                              Break end
                              <input
                                className={timeInputClass(Boolean(error))}
                                disabled={!dayState.isWorking}
                                inputMode="numeric"
                                pattern="[0-9]{2}:[0-9]{2}"
                                value={dayState.breakTo}
                                onChange={(event) =>
                                  onUpdateWeeklyDay(salonId, key, {
                                    working: true,
                                    from: dayState.from || schedule.startTime,
                                    to: dayState.to || schedule.endTime,
                                    breakFrom: dayState.breakFrom || "",
                                    breakTo: event.target.value,
                                  })
                                }
                                placeholder="HH:mm"
                              />
                              <TimePresetChips
                                disabled={isSaving || !dayState.isWorking}
                                label="Set:"
                                presets={BREAK_TIME_PRESETS}
                                onSelect={(value) =>
                                  onUpdateWeeklyDay(salonId, key, {
                                    working: true,
                                    from: dayState.from || schedule.startTime,
                                    to: dayState.to || schedule.endTime,
                                    breakFrom: dayState.breakFrom || "",
                                    breakTo: value,
                                  })
                                }
                              />
                            </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
