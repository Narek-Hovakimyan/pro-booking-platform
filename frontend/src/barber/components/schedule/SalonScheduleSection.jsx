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
      <div>
        <h2 className="text-lg font-bold sm:text-xl">Date Overrides & Day Offs</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Customize hours or mark specific dates as non-working.
        </p>

        <div className="mt-4 space-y-6">
          <ScheduleDateOverrideEditor
            dateOptions={dateOptions}
            dateStatusMap={dateStatusMap}
            selectedDateKey={selectedDateKey}
            selectedDateObject={selectedDateObject}
            todayKey={todayKey}
            isNonWorkingDay={isNonWorkingDay}
            hasCustomHours={hasCustomHours}
            activeDraft={activeDraft}
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
        <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          <svg className="h-5 w-5 animate-spin text-neutral-400" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Saving schedule…</span>
        </div>
      )}
    </>
  );
}
