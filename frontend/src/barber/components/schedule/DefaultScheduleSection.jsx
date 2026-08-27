import ScheduleWeeklyHours from "@/barber/components/schedule/ScheduleWeeklyHours";

export default function DefaultScheduleSection({
  defaultSchedule,
  weeklySchedule,
  explicitWeeklyDays,
  isSaving,
  onUseDefaultHours,
}) {
  return (
    <ScheduleWeeklyHours
      defaultSchedule={defaultSchedule}
      weeklySchedule={weeklySchedule}
      explicitWeeklyDays={explicitWeeklyDays}
      isSaving={isSaving}
      onUseDefaultHours={onUseDefaultHours}
    />
  );
}
