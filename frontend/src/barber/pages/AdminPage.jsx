import AdminPanel from "@/barber/components/AdminPanel";

export default function AdminPage({
  bookings,
  services,
  removeService,
  addService,
  updateService,
  schedule,
  updateSchedule,
  updateScheduleOverride,
  updateNonWorkingDay,
  isLoading,
  isSaving,
  error,
  section,
}) {
  return (
    <AdminPanel
      bookings={bookings}
      services={services}
      removeService={removeService}
      addService={addService}
      updateService={updateService}
      schedule={schedule}
      updateSchedule={updateSchedule}
      updateScheduleOverride={updateScheduleOverride}
      updateNonWorkingDay={updateNonWorkingDay}
      isLoading={isLoading}
      isSaving={isSaving}
      error={error}
      section={section}
    />
  );
}
