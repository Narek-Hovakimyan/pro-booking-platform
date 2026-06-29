import AvailabilityDebugPanel from "@/barber/components/schedule/AvailabilityDebugPanel";
import ScheduleDateOverrideEditor from "@/barber/components/schedule/ScheduleDateOverrideEditor";
import ScheduleNonWorkingDaysSection from "@/barber/components/schedule/ScheduleNonWorkingDaysSection";
import ScheduleOverridesList from "@/barber/components/schedule/ScheduleOverridesList";

export default function SalonScheduleSection({
  dateOptions,
  dateStatusMap,
  selectedDateKey,
  selectedDateObject,
  todayKey,
  isNonWorkingDay,
  hasCustomHours,
  activeDraft,
  hasUnsavedChanges,
  isSaving,
  fieldErrors,
  isBreakEnabled,
  timeInputClass,
  canMarkDayOff,
  sortedOverrides,
  sortedNonWorkingDays,
  currentUserId,
  selectedSalonId,
  barberServices,
  isLoadingServices,
  servicesError,
  onSelectDate,
  onUpdateDraft,
  onUpdateTimeDraft,
  onToggleBreakTime,
  onSaveSelectedDateSchedule,
  onResetDraftToDefault,
  onRemoveOverride,
  onMarkDayOff,
  onRestoreWorkingDate,
}) {
  return (
    <>
      <div className="space-y-5">
        <div className="rounded-3xl border border-purple-100 bg-white p-4 shadow-lg shadow-purple-100/40 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-purple-500">
            Salon Schedule
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-950 sm:text-xl">
            Date overrides and days off
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Customize hours or mark specific dates as non-working.
          </p>
        </div>

        <div className="space-y-6">
          <ScheduleDateOverrideEditor
            dateOptions={dateOptions}
            dateStatusMap={dateStatusMap}
            selectedDateKey={selectedDateKey}
            selectedDateObject={selectedDateObject}
            todayKey={todayKey}
            isNonWorkingDay={isNonWorkingDay}
            hasCustomHours={hasCustomHours}
            activeDraft={activeDraft}
            hasUnsavedChanges={hasUnsavedChanges}
            isSaving={isSaving}
            fieldErrors={fieldErrors}
            isBreakEnabled={isBreakEnabled}
            timeInputClass={timeInputClass}
            canMarkDayOff={canMarkDayOff}
            onSelectDate={onSelectDate}
            onUpdateDraft={onUpdateDraft}
            onUpdateTimeDraft={onUpdateTimeDraft}
            onToggleBreakTime={onToggleBreakTime}
            onSaveSelectedDateSchedule={onSaveSelectedDateSchedule}
            onResetDraftToDefault={onResetDraftToDefault}
            onRemoveOverride={onRemoveOverride}
            onMarkDayOff={onMarkDayOff}
          />

          <ScheduleOverridesList
            overrides={sortedOverrides}
            onEdit={onSelectDate}
            onRemove={onRemoveOverride}
            disabled={isSaving}
          />

          <ScheduleNonWorkingDaysSection
            isSaving={isSaving}
            sortedNonWorkingDays={sortedNonWorkingDays}
            onRestoreWorkingDate={onRestoreWorkingDate}
          />
        </div>
      </div>

      <AvailabilityDebugPanel
        barberId={currentUserId}
        selectedSalonId={selectedSalonId}
        selectedDateKey={selectedDateKey}
        services={barberServices}
        isServicesLoading={isLoadingServices}
        servicesError={servicesError}
      />

      {/* ─── Save Feedback Bar ─── */}
      {isSaving && (
        <div className="flex items-center gap-3 rounded-2xl border border-purple-100 bg-white p-4 text-sm text-neutral-600 shadow-sm shadow-purple-100/50">
          <svg className="h-5 w-5 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Saving schedule…</span>
        </div>
      )}
    </>
  );
}
