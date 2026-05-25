import ScheduleWeeklyHours from "@/barber/components/schedule/ScheduleWeeklyHours";

export default function DefaultScheduleSection({
  defaultSchedule,
  weeklySchedule,
}) {
  return (
    <ScheduleWeeklyHours
      defaultSchedule={defaultSchedule}
      weeklySchedule={weeklySchedule}
    />
  );
}
