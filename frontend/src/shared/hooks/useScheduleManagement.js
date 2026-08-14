import { useCallback, useEffect, useMemo, useRef } from "react";

import api from "../api/axios";
import { getFriendlyApiError } from "../api/errors";
import { setSchedule } from "../../store/slices/scheduleSlice";
import { getDayKeyFromDate, parseDateKey } from "../utils/dates";

const EMPTY_DAY = {
  working: false,
  from: "",
  to: "",
  breakFrom: "",
  breakTo: "",
};

const copyObject = (value) =>
  value && typeof value === "object" ? { ...value } : {};

const copyEntries = (value) =>
  Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {}).map(
      ([key, entry]) => [key, copyObject(entry)]
    )
  );

const copySchedule = ({
  weeklySchedule,
  dateSchedules,
  scheduleOverrides,
  defaultSchedule,
  nonWorkingDays,
}) => ({
  weeklySchedule: copyEntries(weeklySchedule),
  dateSchedules: copyEntries(dateSchedules),
  scheduleOverrides: copyEntries(scheduleOverrides),
  defaultSchedule: copyObject(defaultSchedule),
  nonWorkingDays: Array.isArray(nonWorkingDays) ? [...nonWorkingDays] : [],
});

const toResponseSchedule = (data, fallback) => {
  if (!data || typeof data !== "object" || !data.weeklySchedule) {
    return null;
  }

  return copySchedule({
    weeklySchedule: data.weeklySchedule,
    dateSchedules: data.dateSchedules || fallback.dateSchedules,
    scheduleOverrides: data.scheduleOverrides || fallback.scheduleOverrides,
    defaultSchedule: data.defaultSchedule || fallback.defaultSchedule,
    nonWorkingDays: data.nonWorkingDays || fallback.nonWorkingDays,
  });
};

const toPayload = (barberId, schedule) => ({
  barberId,
  weeklySchedule: schedule.weeklySchedule,
  dateSchedules: schedule.dateSchedules,
  scheduleOverrides: schedule.scheduleOverrides,
  nonWorkingDays: schedule.nonWorkingDays,
});

export function useScheduleManagement({
  currentUserId,
  dispatch,
  barberSchedule,
  barberDateSchedules,
  barberScheduleOverrides,
  barberDefaultSchedule,
  barberNonWorkingDays,
  setDataError,
}) {
  const confirmedScheduleRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const pendingCountRef = useRef(0);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const currentUserIdRef = useRef(currentUserId);
  const authoritativeUnknownRef = useRef(false);

  const incomingSchedule = useMemo(
    () =>
      copySchedule({
        weeklySchedule: barberSchedule,
        dateSchedules: barberDateSchedules,
        scheduleOverrides: barberScheduleOverrides,
        defaultSchedule: barberDefaultSchedule,
        nonWorkingDays: barberNonWorkingDays,
      }),
    [
      barberDateSchedules,
      barberDefaultSchedule,
      barberNonWorkingDays,
      barberSchedule,
      barberScheduleOverrides,
    ]
  );
  const incomingScheduleRef = useRef(incomingSchedule);

  useEffect(() => {
    incomingScheduleRef.current = incomingSchedule;
    if (pendingCountRef.current === 0) {
      confirmedScheduleRef.current = incomingSchedule;
      authoritativeUnknownRef.current = false;
    }
  }, [
    barberDateSchedules,
    barberDefaultSchedule,
    barberNonWorkingDays,
    barberSchedule,
    barberScheduleOverrides,
    incomingSchedule,
  ]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
    generationRef.current += 1;
    confirmedScheduleRef.current = incomingScheduleRef.current;
    authoritativeUnknownRef.current = false;
    queueRef.current = Promise.resolve();
  }, [currentUserId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const applyAuthoritativeSchedule = useCallback(
    (schedule, generation, barberId) => {
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        String(currentUserIdRef.current) !== String(barberId)
      ) {
        return false;
      }

      confirmedScheduleRef.current = schedule;
      authoritativeUnknownRef.current = false;
      dispatch(
        setSchedule({
          barberId,
          weeklySchedule: schedule.weeklySchedule,
          dateSchedules: schedule.dateSchedules,
          scheduleOverrides: schedule.scheduleOverrides,
          defaultSchedule: schedule.defaultSchedule,
          nonWorkingDays: schedule.nonWorkingDays,
        })
      );
      return true;
    },
    [dispatch]
  );

  const enqueueMutation = useCallback(
    (buildSchedule, fallbackMessage) => {
      if (!currentUserId) return Promise.resolve();

      const barberId = currentUserId;
      const generation = generationRef.current;
      pendingCountRef.current += 1;
      setDataError("");

      const run = async () => {
        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          String(currentUserIdRef.current) !== String(barberId)
        ) {
          pendingCountRef.current -= 1;
          return;
        }

        if (authoritativeUnknownRef.current) {
          if (mountedRef.current && generation === generationRef.current) {
            setDataError("Could not confirm the current schedule. Please try again.");
          }
          pendingCountRef.current -= 1;
          return;
        }

        const base = confirmedScheduleRef.current || incomingSchedule;
        let nextSchedule;
        try {
          nextSchedule = buildSchedule(copySchedule(base));
        } catch (buildError) {
          if (mountedRef.current && generation === generationRef.current) {
            setDataError(
              getFriendlyApiError(buildError, fallbackMessage)
            );
          }
          pendingCountRef.current -= 1;
          return;
        }

        try {
          const { data } = await api.put(
            "/schedules",
            toPayload(barberId, nextSchedule)
          );
          const authoritative = toResponseSchedule(data, nextSchedule);

          if (!authoritative) {
            throw new Error("Schedule response was incomplete");
          }

          if (applyAuthoritativeSchedule(authoritative, generation, barberId)) {
            setDataError("");
          }
        } catch (requestError) {
          if (
            !mountedRef.current ||
            generation !== generationRef.current ||
            String(currentUserIdRef.current) !== String(barberId)
          ) {
            pendingCountRef.current -= 1;
            return;
          }

          // A failed whole-schedule write may have reached the server. Rebase
          // the confirmed snapshot before the next queued intent is applied.
          try {
            const { data } = await api.get(`/schedules/${barberId}`);
            const authoritative = toResponseSchedule(data, base);
            if (authoritative) {
              applyAuthoritativeSchedule(authoritative, generation, barberId);
            }
          } catch {
            // Do not send queued intents from an unverified snapshot.
            authoritativeUnknownRef.current = true;
          }

          if (mountedRef.current && generation === generationRef.current) {
            setDataError(
              getFriendlyApiError(requestError, fallbackMessage)
            );
          }
        } finally {
          pendingCountRef.current -= 1;
        }
      };

      const queued = queueRef.current.then(run, run);
      queueRef.current = queued.catch(() => undefined);
      return queued;
    },
    [
      applyAuthoritativeSchedule,
      currentUserId,
      incomingSchedule,
      setDataError,
    ]
  );

  const updateSchedule = useCallback(
    (scheduleKey, field, value) => {
      const selectedDate = parseDateKey(scheduleKey);
      return enqueueMutation((schedule) => {
        const fallbackDayKey = selectedDate
          ? getDayKeyFromDate(selectedDate)
          : scheduleKey;
        const fallbackSchedule =
          schedule.weeklySchedule[fallbackDayKey] || EMPTY_DAY;

        if (selectedDate) {
          schedule.dateSchedules[scheduleKey] = {
            ...fallbackSchedule,
            ...schedule.dateSchedules[scheduleKey],
            [field]: value,
          };
        } else {
          schedule.weeklySchedule[scheduleKey] = {
            ...schedule.weeklySchedule[scheduleKey],
            [field]: value,
          };
        }
        return schedule;
      }, "Could not save schedule. Please try again.");
    },
    [enqueueMutation]
  );

  const updateNonWorkingDay = useCallback(
    (dateKey, isNonWorking) =>
      enqueueMutation((schedule) => {
        schedule.nonWorkingDays = isNonWorking
          ? Array.from(new Set([...schedule.nonWorkingDays, dateKey]))
          : schedule.nonWorkingDays.filter((day) => day !== dateKey);
        return schedule;
      }, "Could not save day off. Please try again."),
    [enqueueMutation]
  );

  const updateScheduleOverride = useCallback(
    (dateKey, override) =>
      enqueueMutation((schedule) => {
        if (override == null) {
          delete schedule.scheduleOverrides[dateKey];
        } else {
          schedule.scheduleOverrides[dateKey] = copyObject(override);
        }
        if (override?.isWorking) {
          schedule.nonWorkingDays = schedule.nonWorkingDays.filter(
            (day) => day !== dateKey
          );
        } else if (override) {
          schedule.nonWorkingDays = Array.from(
            new Set([...schedule.nonWorkingDays, dateKey])
          );
        }
        return schedule;
      }, "Could not save schedule. Please try again."),
    [enqueueMutation]
  );

  return {
    updateSchedule,
    updateNonWorkingDay,
    updateScheduleOverride,
  };
}
