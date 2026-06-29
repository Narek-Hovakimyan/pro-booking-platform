import { Card, CardContent } from "@/shared/components/ui/card";

const DAYS = [
  { label: "Mon", key: "mon" },
  { label: "Tue", key: "tue" },
  { label: "Wed", key: "wed" },
  { label: "Thu", key: "thu" },
  { label: "Fri", key: "fri" },
  { label: "Sat", key: "sat" },
  { label: "Sun", key: "sun" },
];

const hasValidHours = (schedule) =>
  Boolean(schedule?.startTime && schedule?.endTime);

const getDefaultDayState = (defaultSchedule) => {
  if (defaultSchedule?.working === false || !hasValidHours(defaultSchedule)) {
    return { working: false, label: "Off" };
  }

  const hasBreak =
    defaultSchedule?.hasBreak &&
    defaultSchedule?.breakStart &&
    defaultSchedule?.breakEnd;

  return {
    working: true,
    label: `${defaultSchedule.startTime} to ${defaultSchedule.endTime}`,
    breakLabel: hasBreak
      ? `${defaultSchedule.breakStart} to ${defaultSchedule.breakEnd}`
      : "No default break",
  };
};

const getWeeklyDayState = (daySchedule, defaultDayState) => {
  if (daySchedule?.working === false) {
    return { working: false, label: "Off" };
  }

  if (daySchedule?.working === true && daySchedule?.from && daySchedule?.to) {
    return {
      working: true,
      label: `${daySchedule.from} to ${daySchedule.to}`,
    };
  }

  return defaultDayState;
};

export default function ScheduleWeeklyHours({
  defaultSchedule,
  weeklySchedule = {},
}) {
  const defaultDayState = getDefaultDayState(defaultSchedule);
  const breakLabel = defaultDayState.breakLabel || "No default break";

  const summaryLabel = defaultDayState.working
    ? defaultDayState.label
    : "Off";

  return (
    <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-purple-500">
              Weekly Schedule
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-950">
              Default working hours
            </h2>
          </div>
          <span
            className={
              defaultDayState.working
                ? "w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
                : "w-fit rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
            }
          >
            {defaultDayState.working ? "Open by default" : "Off by default"}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          These default hours apply unless a date-specific override or day off is added.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold text-neutral-700">Working hours</span>
            </div>
            <p className="mt-2 text-lg font-bold tabular-nums text-neutral-900">
              {summaryLabel}
            </p>
          </div>
          <div className="rounded-2xl border border-pink-100 bg-pink-50/60 p-4">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
              </svg>
              <span className="font-semibold text-neutral-700">Break</span>
            </div>
            <p className="mt-2 text-lg font-bold tabular-nums text-neutral-900">
              {breakLabel}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {DAYS.map(({ label, key }) => {
            const dayState = getWeeklyDayState(weeklySchedule?.[key], defaultDayState);

            return (
              <div
                key={label}
                className="rounded-2xl border border-purple-100 bg-white p-3 shadow-sm shadow-purple-100/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-neutral-900">
                    {label}
                  </span>
                  <span
                    className={
                      dayState.working
                        ? "rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200"
                        : "rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 shadow-sm ring-1 ring-rose-200"
                    }
                  >
                    {dayState.working ? "Working" : "Off"}
                  </span>

                </div>
                <p className="mt-2 text-sm tabular-nums text-neutral-600">
                  {dayState.label}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
