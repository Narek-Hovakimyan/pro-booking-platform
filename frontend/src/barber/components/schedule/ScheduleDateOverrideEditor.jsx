import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { formatDateLabel } from "@/shared/utils/dates";

export default function ScheduleDateOverrideEditor({
  dateOptions,
  selectedDateKey,
  selectedDateObject,
  todayKey,
  isNonWorkingDay,
  hasCustomHours,
  activeDraft,
  isSaving,
  fieldErrors,
  isBreakEnabled,
  timeInputClass,
  onSelectDate,
  onUpdateDraft,
  onUpdateTimeDraft,
  onToggleBreakTime,
  onSaveSelectedDateSchedule,
  onResetDraftToDefault,
  onRemoveOverride,
}) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="p-4 sm:p-6">
        <h2 className="text-lg font-bold">Date-Specific Override</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Customize hours or mark a day off for a specific date.
        </p>

        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            {dateOptions.map((day) => (
              <Button
                className="flex-1 sm:flex-none"
                key={day.value}
                onClick={() => onSelectDate(day.value)}
                variant={selectedDateKey === day.value ? "default" : "outline"}
                size="sm"
                aria-pressed={selectedDateKey === day.value}
              >
                {day.label}
              </Button>
            ))}
          </div>
          <label className="mt-3 grid max-w-xs gap-1.5 text-sm font-medium">
            <span>Or pick a custom date</span>
            <input
              className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-normal focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              min={todayKey}
              type="date"
              value={selectedDateKey}
              onChange={(event) => onSelectDate(event.target.value)}
              aria-label="Select a custom date"
            />
          </label>
        </div>

        <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-neutral-900">
                  {formatDateLabel(selectedDateObject)}
                </h3>
                {isNonWorkingDay && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700 shadow-sm ring-1 ring-red-200">
                    Day off
                  </span>
                )}
                {hasCustomHours && !isNonWorkingDay && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700 shadow-sm ring-1 ring-amber-200">
                    Custom
                  </span>
                )}
                {!hasCustomHours && !isNonWorkingDay && (
                  <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-600 shadow-sm ring-1 ring-neutral-200">
                    Default
                  </span>

                )}
              </div>
              <p className="mt-0.5 text-xs text-neutral-400">{selectedDateKey}</p>
            </div>
          </div>

          {hasCustomHours && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
              This date has custom hours.
            </div>
          )}
          {isNonWorkingDay && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              This date is marked as non-working. No bookings will be accepted.
            </div>
          )}

          <div className="mt-4 border-b border-neutral-100 pb-4">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Specialist works this date</span>
              <button
                type="button"
                role="switch"
                aria-checked={activeDraft.isWorking}
                aria-label="Toggle specialist works this date"
                disabled={isSaving}
                onClick={() => onUpdateDraft("isWorking", !activeDraft.isWorking)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                  "focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  activeDraft.isWorking ? "bg-neutral-900" : "bg-neutral-200"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                    activeDraft.isWorking ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </button>
            </label>
          </div>


          {activeDraft.isWorking ? (
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-neutral-700">
                  Working hours
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Start time
                    <input
                      className={timeInputClass(Boolean(fieldErrors.startTime))}
                      disabled={isSaving}
                      inputMode="numeric"
                      pattern="[0-9]{2}:[0-9]{2}"
                      value={activeDraft.startTime}
                      onChange={(e) => onUpdateTimeDraft("startTime", e.target.value)}
                      placeholder="e.g. 09:00"
                      aria-label="Work start time"
                      aria-describedby={fieldErrors.startTime ? "start-time-error" : undefined}
                      aria-invalid={Boolean(fieldErrors.startTime)}
                    />
                    {fieldErrors.startTime && (
                      <p id="start-time-error" className="text-xs font-normal text-red-600" role="alert">
                        {fieldErrors.startTime}
                      </p>
                    )}
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    End time
                    <input
                      className={timeInputClass(Boolean(fieldErrors.endTime))}
                      disabled={isSaving}
                      inputMode="numeric"
                      pattern="[0-9]{2}:[0-9]{2}"
                      value={activeDraft.endTime}
                      onChange={(e) => onUpdateTimeDraft("endTime", e.target.value)}
                      placeholder="e.g. 18:00"
                      aria-label="Work end time"
                      aria-describedby={fieldErrors.endTime ? "end-time-error" : undefined}
                      aria-invalid={Boolean(fieldErrors.endTime)}
                    />
                    {fieldErrors.endTime && (
                      <p id="end-time-error" className="text-xs font-normal text-red-600" role="alert">
                        {fieldErrors.endTime}
                      </p>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-neutral-700">Break time</h4>
                  {isBreakEnabled ? (
                    <button
                      type="button"
                      onClick={() => onToggleBreakTime(false)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                      aria-label="Remove break time"
                    >
                      Remove break
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleBreakTime(true)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
                      aria-label="Add break time"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add break
                    </button>
                  )}
                </div>
                {isBreakEnabled && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-medium">
                      Break start
                      <input
                        className={timeInputClass(Boolean(fieldErrors.breakStart))}
                        disabled={isSaving}
                        inputMode="numeric"
                        pattern="[0-9]{2}:[0-9]{2}"
                        value={activeDraft.breakStart || ""}
                        onChange={(e) => onUpdateTimeDraft("breakStart", e.target.value)}
                        placeholder="e.g. 12:00"
                        aria-label="Break start time"
                        aria-describedby={fieldErrors.breakStart ? "break-start-error" : undefined}
                        aria-invalid={Boolean(fieldErrors.breakStart)}
                      />
                      {fieldErrors.breakStart && (
                        <p id="break-start-error" className="text-xs font-normal text-red-600" role="alert">
                          {fieldErrors.breakStart}
                        </p>
                      )}
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      Break end
                      <input
                        className={timeInputClass(Boolean(fieldErrors.breakEnd))}
                        disabled={isSaving}
                        inputMode="numeric"
                        pattern="[0-9]{2}:[0-9]{2}"
                        value={activeDraft.breakEnd || ""}
                        onChange={(e) => onUpdateTimeDraft("breakEnd", e.target.value)}
                        placeholder="e.g. 13:00"
                        aria-label="Break end time"
                        aria-describedby={fieldErrors.breakEnd ? "break-end-error" : undefined}
                        aria-invalid={Boolean(fieldErrors.breakEnd)}
                      />
                      {fieldErrors.breakEnd && (
                        <p id="break-end-error" className="text-xs font-normal text-red-600" role="alert">
                          {fieldErrors.breakEnd}
                        </p>
                      )}
                    </label>
                  </div>
                )}
                <p className="mt-2 text-xs text-neutral-400">
                  Break time will not be available for bookings.
                </p>
              </div>


              {fieldErrors.general && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {fieldErrors.general}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">
              This date is marked as a day off. No bookings will be accepted.
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={onSaveSelectedDateSchedule}
              disabled={isSaving}
              className="w-full sm:w-auto"
              aria-label="Save date override"
            >
              {isSaving ? "Saving…" : "Save date schedule"}
            </Button>
            {hasCustomHours && (
              <Button
                variant="outline"
                onClick={onResetDraftToDefault}
                disabled={isSaving}
                className="w-full sm:w-auto"
                aria-label="Reset to default hours"
              >
                Restore to default hours
              </Button>
            )}
            {hasCustomHours && (
              <Button
                variant="outline"
                onClick={() => onRemoveOverride(selectedDateKey)}
                disabled={isSaving}
                className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:w-auto"
                aria-label="Remove date override"
              >
                Remove override
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
