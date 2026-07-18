import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import api from "@/shared/api/axios";
import { getMyBarberOnboarding } from "@/shared/api/barberOnboarding";
import { getOnboardingStepRoute } from "@/shared/utils/barberOnboardingRoutes";
import ScheduleSkeleton from "@/barber/components/ScheduleSkeleton";
import { timeToMinutes } from "@/shared/utils/time";

const ENDPOINT = (uid) => `/schedules/${uid}/personal`;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function makeEmptyDay() {
  return { working: false, from: "", to: "", breakFrom: "", breakTo: "" };
}

function normalizeTimeValue(value) {
  return typeof value === "string" ? value : "";
}

function normalizeDay(day) {
  if (!day || typeof day !== "object") return makeEmptyDay();
  const working = day.working === true;
  return {
    working,
    from: working ? normalizeTimeValue(day.from) : "",
    to: working ? normalizeTimeValue(day.to) : "",
    breakFrom: working ? normalizeTimeValue(day.breakFrom) : "",
    breakTo: working ? normalizeTimeValue(day.breakTo) : "",
  };
}

function normalizeWeeklySchedule(rawWeekly) {
  const source = rawWeekly && typeof rawWeekly === "object" ? rawWeekly : {};
  return Object.fromEntries(
    DAY_KEYS.map((dayKey) => [dayKey, normalizeDay(source[dayKey])])
  );
}

function resolveNextRoute(onboardingStatus) {
  if (
    onboardingStatus?.needsOnboarding === false ||
    onboardingStatus?.legacyCompatible === true
  ) {
    return "/admin";
  }

  return getOnboardingStepRoute(onboardingStatus?.state?.currentStep);
}

function validateWeeklySchedule(weeklySchedule) {
  const keys = Object.keys(weeklySchedule || {});
  if (
    keys.length !== DAY_KEYS.length ||
    !DAY_KEYS.every((dayKey) => Object.prototype.hasOwnProperty.call(weeklySchedule, dayKey))
  ) {
    return "Schedule must include all seven days.";
  }

  let hasWorkingDay = false;

  for (const dayKey of DAY_KEYS) {
    const day = weeklySchedule[dayKey];
    if (!day || typeof day.working !== "boolean") {
      return "Each day must have a working status.";
    }

    if (!day.working) continue;
    hasWorkingDay = true;

    if (!TIME_PATTERN.test(day.from) || !TIME_PATTERN.test(day.to)) {
      return "Working days need valid start and end times.";
    }

    const startMinutes = timeToMinutes(day.from);
    const endMinutes = timeToMinutes(day.to);
    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
      return "End time must be later than start time.";
    }

    const hasBreakStart = Boolean(day.breakFrom);
    const hasBreakEnd = Boolean(day.breakTo);
    if (hasBreakStart || hasBreakEnd) {
      if (!hasBreakStart || !hasBreakEnd) {
        return "Break start and break end must both be filled.";
      }
      if (!TIME_PATTERN.test(day.breakFrom) || !TIME_PATTERN.test(day.breakTo)) {
        return "Break time must use HH:mm format.";
      }

      const breakStartMinutes = timeToMinutes(day.breakFrom);
      const breakEndMinutes = timeToMinutes(day.breakTo);
      if (
        breakStartMinutes === null ||
        breakEndMinutes === null ||
        !(startMinutes < breakStartMinutes && breakStartMinutes < breakEndMinutes && breakEndMinutes < endMinutes)
      ) {
        return "Break time must be inside working hours.";
      }
    }
  }

  return hasWorkingDay ? "" : "At least one working day is required.";
}

export default function PersonalScheduleView({
  currentUserId,
  embedded = false,
  onStatusChange,
}) {
  const navigate = useNavigate();
  const [weeklySchedule, setWeeklySchedule] = useState(() =>
    normalizeWeeklySchedule()
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const tokenRef = useRef(0);
  const mountedRef = useRef(true);
  const isActiveRequest = useCallback(
    (token) => mountedRef.current && tokenRef.current === token,
    []
  );

  // Load personal schedule
  useEffect(() => {
    mountedRef.current = true;
    const token = ++tokenRef.current;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(ENDPOINT(currentUserId));
        if (!isActiveRequest(token)) return;
        setWeeklySchedule(normalizeWeeklySchedule((data?.schedule || data)?.weeklySchedule));
      } catch {
        if (isActiveRequest(token)) setError("Could not load schedule.");
      } finally {
        if (isActiveRequest(token)) setLoading(false);
      }
    }

    if (currentUserId) {
      load();
    } else {
      Promise.resolve().then(() => {
        if (!isActiveRequest(token)) return;
        setLoading(false);
        setError("Could not load schedule.");
      });
    }
    return () => {
      mountedRef.current = false;
      tokenRef.current += 1;
    };
  }, [currentUserId, isActiveRequest]);

  // For onboarding, default schedule is unused; weeklySchedule is the contract.
  const dayEntries = useMemo(() => DAY_KEYS.map((day) => ({
    key: day,
    label: DAY_LABELS[day],
    entry: weeklySchedule[day] || makeEmptyDay(),
  })), [weeklySchedule]);

  const allWorking = useMemo(() => dayEntries.some((d) => d.entry.working), [dayEntries]);

  const updateDay = useCallback((dayKey, field, value) => {
    setWeeklySchedule((currentWeekly) => {
      const updated = { ...currentWeekly };
      updated[dayKey] = { ...(updated[dayKey] || makeEmptyDay()), [field]: value };
      if (field === "working" && value === false) {
        updated[dayKey] = makeEmptyDay();
      }
      return normalizeWeeklySchedule(updated);
    });
  }, []);

  const handleSave = async () => {
    if (!currentUserId || saving) return;
    const token = ++tokenRef.current;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Build clean weeklySchedule payload
      const nextWeeklySchedule = {};
      for (const day of dayEntries) {
        nextWeeklySchedule[day.key] = normalizeDay(day.entry);
      }

      const validationError = validateWeeklySchedule(nextWeeklySchedule);
      if (validationError) {
        if (isActiveRequest(token)) setError(validationError);
        return;
      }

      await api.put(ENDPOINT(currentUserId), { weeklySchedule: nextWeeklySchedule });
      if (!isActiveRequest(token)) return;

      setSuccess("Schedule saved.");

      // Navigate by onboarding step
      try {
        const onboardingStatus = await getMyBarberOnboarding();
        if (!isActiveRequest(token)) return;
        if (embedded) {
          onStatusChange?.(onboardingStatus);
          return;
        }

        const stepRoute = resolveNextRoute(onboardingStatus);
        if (stepRoute !== "/admin/schedule") {
          navigate(stepRoute);
        }
      } catch {
        // Stay
      }
    } catch {
      if (isActiveRequest(token)) setError("Could not save schedule.");
    } finally {
      if (isActiveRequest(token)) setSaving(false);
    }
  };

  if (loading) return <ScheduleSkeleton />;

  return (
    <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40 lg:col-span-3">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <h2 className="text-xl font-bold sm:text-2xl">Personal Schedule</h2>
        <p className="text-sm text-neutral-500">Set your weekly availability. At least one working day is required.</p>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

        <div className="space-y-4">
          {dayEntries.map(({ key, label, entry }) => (
            <div key={key} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 min-w-[100px]">
                  <input
                    type="checkbox"
                    checked={entry.working}
                    onChange={(e) => updateDay(key, "working", e.target.checked)}
                    className="h-4 w-4"
                  />
                  {label}
                </label>
                {entry.working && (
                  <>
                    <div>
                      <label className="text-xs text-neutral-500">Start</label>
                      <input
                        type="time"
                        value={entry.from}
                        onChange={(e) => updateDay(key, "from", e.target.value)}
                        className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500">End</label>
                      <input
                        type="time"
                        value={entry.to}
                        onChange={(e) => updateDay(key, "to", e.target.value)}
                        className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500">Break start</label>
                      <input
                        type="time"
                        value={entry.breakFrom}
                        onChange={(e) => updateDay(key, "breakFrom", e.target.value)}
                        className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500">Break end</label>
                      <input
                        type="time"
                        value={entry.breakTo}
                        onChange={(e) => updateDay(key, "breakTo", e.target.value)}
                        className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button disabled={!allWorking || saving} onClick={handleSave}>
          {saving ? "Saving..." : "Save schedule"}
        </Button>
      </CardContent>
    </Card>
  );
}
