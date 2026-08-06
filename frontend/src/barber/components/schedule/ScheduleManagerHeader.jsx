export default function ScheduleManagerHeader() {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-sm shadow-purple-100/60 backdrop-blur sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-purple-500">
        Admin schedule
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
        Schedule
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
        Set weekly hours, days off, breaks, and date overrides for the selected salon.
      </p>
    </div>
  );
}
