import { cn } from "@/shared/lib/utils";

import ScheduleSalonDrawer from "@/barber/components/schedule/ScheduleSalonDrawer";
import ScheduleSalonSelector from "@/barber/components/schedule/ScheduleSalonSelector";
import DefaultScheduleSection from "@/barber/components/schedule/DefaultScheduleSection";
import SalonScheduleSection from "@/barber/components/schedule/SalonScheduleSection";
import ScheduleManagerAlerts from "@/barber/components/schedule/ScheduleManagerAlerts";
import ScheduleManagerEmptyStates from "@/barber/components/schedule/ScheduleManagerEmptyStates";
import ScheduleManagerHeader from "@/barber/components/schedule/ScheduleManagerHeader";
import useScheduleManager from "@/barber/hooks/useScheduleManager";
import {
  getSalonAddressFromEntry,
  getSalonNameFromEntry,
} from "@/barber/utils/scheduleHelpers";

export default function ScheduleManager({
  schedule,
  isLoading = false,
  error = "",
}) {
  const manager = useScheduleManager({ schedule, isLoading, error });

  if (manager.isLoadingSalons || manager.isOnboardingStepLoading) {
    return <ScheduleManagerEmptyStates state="loading" />;
  }

  if (manager.approvedSalons.length === 0) {
    return (
      <ScheduleManagerEmptyStates
        currentUserId={manager.currentUserId}
        state={manager.onboardingStep === "personal_schedule" ? "personal_schedule" : "no_salons"}
      />
    );
  }

  if (!manager.activeSalonId) {
    return (
      <>
        <ScheduleManagerEmptyStates
          onOpenDrawer={manager.openDrawer}
          state="no_selection"
        />
        <ScheduleSalonDrawer
          isOpen={manager.isDrawerOpen}
          onClose={manager.closeDrawer}
          salons={manager.approvedSalons}
          selectedId={manager.activeSalonId}
          onSelect={manager.handleSalonSelect}
          isLoading={false}
        />
      </>
    );
  }

  return (
    <div
      className={cn(
        "w-full rounded-[2rem] border border-purple-100 bg-gradient-to-br from-purple-50 via-white to-pink-50/70 p-3 shadow-sm shadow-purple-100/70 sm:p-5",
        manager.approvedSalons.length > 0 && manager.activeSalonId ? "lg:col-span-3" : ""
      )}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <ScheduleManagerHeader />

        <ScheduleSalonSelector
          selectedSalonEntry={manager.selectedSalonEntry}
          approvedSalons={manager.approvedSalons}
          getSalonNameFromEntry={getSalonNameFromEntry}
          getSalonAddressFromEntry={getSalonAddressFromEntry}
          onOpenDrawer={manager.openDrawer}
        />

        {manager.isLoadingEffective ? (
          <ScheduleManagerEmptyStates state="loading" />
        ) : manager.isScheduleEmpty ? (
          <ScheduleManagerEmptyStates state="no_schedule" />
        ) : (
          <>
            <ScheduleManagerAlerts
              displayError={manager.displayError}
              saveSuccess={manager.saveSuccess}
            />

            <DefaultScheduleSection
              defaultSchedule={manager.currentDefaultSchedule}
              weeklySchedule={manager.effectiveSchedule.weeklySchedule}
            />

            <SalonScheduleSection
              dateOptions={manager.dateOptions}
              dateStatusMap={manager.dateStatusMap}
              selectedDateKey={manager.selectedDateKey}
              selectedDateObject={manager.selectedDateObject}
              todayKey={manager.todayKey}
              isNonWorkingDay={manager.isNonWorkingDay}
              hasCustomHours={manager.hasCustomHours}
              activeDraft={manager.activeDraft}
              hasUnsavedChanges={manager.hasUnsavedDateChangesValue}
              isSaving={manager.isSaving}
              fieldErrors={manager.fieldErrors}
              isBreakEnabled={manager.isBreakEnabled}
              timeInputClass={manager.timeInputClass}
              canMarkDayOff={manager.canMarkDayOff}
              sortedOverrides={manager.sortedOverrides}
              sortedNonWorkingDays={manager.sortedNonWorkingDays}
              currentUserId={manager.currentUserId}
              selectedSalonId={manager.activeSalonId}
              barberServices={manager.barberServices}
              isLoadingServices={manager.isLoadingServices}
              servicesError={manager.servicesError}
              onSelectDate={manager.selectDate}
              onUpdateDraft={manager.updateDraft}
              onUpdateTimeDraft={manager.updateTimeDraft}
              onToggleBreakTime={manager.toggleBreakTime}
              onSaveSelectedDateSchedule={manager.saveSelectedDateSchedule}
              onResetDraftToDefault={manager.resetDraftToDefault}
              onRemoveOverride={manager.removeOverride}
              onMarkDayOff={manager.markDayOff}
              onRestoreWorkingDate={manager.restoreWorkingDate}
            />
          </>
        )}

        <ScheduleSalonDrawer
          isOpen={manager.isDrawerOpen}
          onClose={manager.closeDrawer}
          salons={manager.approvedSalons}
          selectedId={manager.activeSalonId}
          onSelect={manager.handleSalonSelect}
          isLoading={false}
        />
      </div>
    </div>
  );
}
