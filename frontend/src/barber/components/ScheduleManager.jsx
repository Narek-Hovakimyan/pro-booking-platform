import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import EmptyState from "@/shared/components/common/EmptyState";
import api from "@/shared/api/axios";
import { setServices } from "@/store/slices/servicesSlice";
import { getDayScheduleFromDefaultSchedule } from "@/shared/data/schedule";
import { cn } from "@/shared/lib/utils";
import {
  formatDateKey,
  getNext7Days,
  parseDateKey,
} from "@/shared/utils/dates";
import { formatTimeInput, timeToMinutes } from "@/shared/utils/time";
import ScheduleSalonDrawer from "@/barber/components/schedule/ScheduleSalonDrawer";
import ScheduleSalonSelector from "@/barber/components/schedule/ScheduleSalonSelector";
import DefaultScheduleSection from "@/barber/components/schedule/DefaultScheduleSection";
import SalonScheduleSection from "@/barber/components/schedule/SalonScheduleSection";
import ScheduleSkeleton from "@/barber/components/ScheduleSkeleton";
import {
  getSalonIdFromEntry,
  getSalonNameFromEntry,
  getSalonAddressFromEntry,
  isSelectableScheduleSalonEntry,
  mergeScheduleSalonEntries,
  normalizeManageableSalonEntries,
  normalizeSchedule,
  areSchedulesEqual,
  normalizeDefaultScheduleDraft,
} from "@/barber/utils/scheduleHelpers";

const timeInputClass = (hasError) =>
  cn(
    "h-12 w-full rounded-2xl border border-purple-100 bg-white px-3 py-2 text-sm font-normal tabular-nums text-neutral-900 shadow-sm transition",
    "focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100",
    "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 disabled:opacity-60",
    hasError &&
      "border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-200"
  );

const isCurrentOrFutureDateKey = (dateKey, todayKey) =>
  Boolean(parseDateKey(dateKey)) && dateKey >= todayKey;

const filterCurrentScheduleOverrides = (scheduleOverrides = {}, todayKey) =>
  Object.fromEntries(
    Object.entries(scheduleOverrides || {}).filter(([dateKey]) =>
      isCurrentOrFutureDateKey(dateKey, todayKey)
    )
  );

const filterCurrentNonWorkingDays = (nonWorkingDays = [], todayKey) =>
  Array.from(
    new Set(
      (Array.isArray(nonWorkingDays) ? nonWorkingDays : []).filter((dateKey) =>
        isCurrentOrFutureDateKey(dateKey, todayKey)
      )
    )
  );

export default function ScheduleManager({
  schedule,
  isLoading = false,
  error = "",
}) {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const services = useSelector((state) => state.services);
  const currentUserId = currentUser?.id || currentUser?._id;
  const [salonEntries, setSalonEntries] = useState([]);
  const [isLoadingSalons, setIsLoadingSalons] = useState(true);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [selectedSalonId, setSelectedSalonId] = useState(null);
  const [perSalonSchedule, setPerSalonSchedule] = useState(null);
  const [loadedScheduleSalonId, setLoadedScheduleSalonId] = useState(null);
  const [isPerSalonLoading, setIsPerSalonLoading] = useState(false);
  const [perSalonError, setPerSalonError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isMountedRef = useRef(true);
  const hasNoUserRef = useRef(false);
  const servicesFetchAttemptedRef = useRef("");

  // Fetch barber's salons from API
  useEffect(() => {
    let cancelled = false;

    isMountedRef.current = true;

    if (!currentUserId) {
      hasNoUserRef.current = true;
      return;
    }

    async function fetchSalons() {
      setIsLoadingSalons(true);

      try {
        const [statusResult, manageableResult] = await Promise.allSettled([
          api.get("/salons/me/status"),
          api.get("/salons/mine/manageable"),
        ]);
        if (cancelled || !isMountedRef.current) return;

        const statusData =
          statusResult.status === "fulfilled" ? statusResult.value.data : {};
        const manageableEntries =
          manageableResult.status === "fulfilled"
            ? normalizeManageableSalonEntries(manageableResult.value.data)
            : [];
        const approvedEntries = (statusData.salons || []).filter(
          isSelectableScheduleSalonEntry
        );
        const legacyEntries =
          statusData.salon && statusData.salonStatus === "approved"
            ? [
                {
                  salon: statusData.salon,
                  status: "approved",
                  isPrimary: true,
                },
              ]
            : [];
        const nextEntries = mergeScheduleSalonEntries(
          approvedEntries,
          legacyEntries,
          manageableEntries
        );

        if (nextEntries.length > 0) {
          setSalonEntries((currentEntries) =>
            JSON.stringify(currentEntries) === JSON.stringify(nextEntries)
              ? currentEntries
              : nextEntries
          );
        } else {
          setSalonEntries((currentEntries) =>
            currentEntries.length === 0 ? currentEntries : []
          );
        }
      } catch {
        if (cancelled || !isMountedRef.current) return;
        setSalonEntries((currentEntries) =>
          currentEntries.length === 0 ? currentEntries : []
        );

      } finally {
        if (!cancelled && isMountedRef.current) setIsLoadingSalons(false);
      }
    }

    fetchSalons();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [currentUserId]);

  // Handle no-user case separately to avoid setState in effect
  useEffect(() => {
    if (hasNoUserRef.current) {
      setIsLoadingSalons(false);
    }
  }, []);

  const approvedSalons = useMemo(
    () => (salonEntries || []).filter(isSelectableScheduleSalonEntry),
    [salonEntries]
  );
  const initialSalonId = useMemo(() => {
    if (approvedSalons.length === 0) return null;
    const primary = approvedSalons.find((s) => s.isPrimary) || approvedSalons[0];
    return getSalonIdFromEntry(primary);
  }, [approvedSalons]);
  const activeSalonId = selectedSalonId || initialSalonId;
  const barberServices = useMemo(
    () =>
      (services || []).filter(
        (service) => String(service?.barberId) === String(currentUserId)
      ),
    [currentUserId, services]
  );
  const selectedSalonEntry = useMemo(
    () =>
      approvedSalons.find(
        (entry) => String(getSalonIdFromEntry(entry)) === String(activeSalonId)
      ) || null,
    [activeSalonId, approvedSalons]
  );

  useEffect(() => {
    if (!currentUserId || barberServices.length > 0) return;
    if (servicesFetchAttemptedRef.current === String(currentUserId)) return;

    let cancelled = false;
    servicesFetchAttemptedRef.current = String(currentUserId);

    async function fetchServices() {
      setIsLoadingServices(true);
      setServicesError("");

      try {
        const { data } = await api.get(`/services/${currentUserId}`);

        if (!cancelled) {
          dispatch(
            setServices({
              barberId: currentUserId,
              services: data,
            })
          );
        }
      } catch (requestError) {
        if (!cancelled) {
          setServicesError(
            requestError.response?.data?.message ||
              "Could not load services for diagnostics."
          );
        }
      } finally {
        if (!cancelled) setIsLoadingServices(false);
      }
    }

    fetchServices();

    return () => {
      cancelled = true;
    };
  }, [barberServices.length, currentUserId, dispatch]);

  // Fetch schedule when the active salon changes
  useEffect(() => {
    if (!currentUserId || !activeSalonId) return;

    let cancelled = false;

    async function fetchSchedule() {
      setIsPerSalonLoading((current) => (current ? current : true));
      setPerSalonError("");

      try {
        const { data } = await api.get(
          `/schedules/${currentUserId}/${activeSalonId}`
        );

        const normalized = normalizeSchedule(data);

        if (!cancelled) {
          setPerSalonSchedule((currentSchedule) =>
            areSchedulesEqual(currentSchedule, normalized)
              ? currentSchedule
              : normalized
          );
          setLoadedScheduleSalonId(activeSalonId);
        }
      } catch (requestError) {
        if (!cancelled) {
          setPerSalonError(
            requestError.response?.data?.message ||
              "Could not load schedule for this salon."
          );
        }
      } finally {
        if (!cancelled) setIsPerSalonLoading(false);
      }
    }

    fetchSchedule();

    return () => {
      cancelled = true;
    };
  }, [activeSalonId, currentUserId]);

  const activePerSalonSchedule =
    String(loadedScheduleSalonId) === String(activeSalonId)
      ? perSalonSchedule
      : null;
  const effectiveSchedule = activePerSalonSchedule || schedule;
  const currentDefaultSchedule = useMemo(
    () => normalizeDefaultScheduleDraft(effectiveSchedule.defaultSchedule),
    [effectiveSchedule.defaultSchedule]
  );

  const dateOptions = useMemo(() => getNext7Days(), []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const todayKey = formatDateKey(new Date());
  const scheduleOverrides = useMemo(
    () =>
      filterCurrentScheduleOverrides(
        effectiveSchedule.scheduleOverrides || {},
        todayKey
      ),
    [effectiveSchedule.scheduleOverrides, todayKey]
  );
  const nonWorkingDays = useMemo(
    () =>
      filterCurrentNonWorkingDays(
        effectiveSchedule.nonWorkingDays || [],
        todayKey
      ),
    [effectiveSchedule.nonWorkingDays, todayKey]
  );
  const defaultDaySchedule = useMemo(
    () => getDayScheduleFromDefaultSchedule(currentDefaultSchedule),
    [currentDefaultSchedule]
  );
  const selectedDateObject = parseDateKey(selectedDate) || dateOptions[0].date;
  const selectedDateKey = selectedDateObject
    ? formatDateKey(selectedDateObject)
    : dateOptions[0].value;
  const normalizedOverride = useMemo(() => {
    const override = scheduleOverrides[selectedDateKey];
    return override
      ? {
          isWorking: Boolean(override.isWorking),
          startTime: override.startTime || "",
          endTime: override.endTime || "",
          breakStart: override.breakStart || "",
          breakEnd: override.breakEnd || "",
        }
      : {
          isWorking:
            !nonWorkingDays.includes(selectedDateKey) &&
            defaultDaySchedule.working,
          startTime: defaultDaySchedule.from,
          endTime: defaultDaySchedule.to,
          breakStart: defaultDaySchedule.breakFrom,
          breakEnd: defaultDaySchedule.breakTo,
        };
  }, [
    defaultDaySchedule,
    nonWorkingDays,
    scheduleOverrides,
    selectedDateKey,
  ]);
  const [draftOverride, setDraftOverride] = useState({
    dateKey: selectedDateKey,
    ...normalizedOverride,
  });

  // Reset draft when schedule changes (e.g., switching salons)
  // Use a ref to track the previous schedule to avoid stale state
  const prevScheduleRef = useRef(effectiveSchedule);
  useEffect(() => {
    if (prevScheduleRef.current !== effectiveSchedule) {
      prevScheduleRef.current = effectiveSchedule;
      setDraftOverride({
        dateKey: selectedDateKey,
        ...normalizedOverride,
      });
    }
  }, [effectiveSchedule, selectedDateKey, normalizedOverride]);

  const [validationState, setValidationState] = useState({
    dateKey: selectedDateKey,
    message: "",
  });
  const [breakToggleState, setBreakToggleState] = useState({
    dateKey: selectedDateKey,
    enabled: false,
  });
  const activeDraft = useMemo(
    () =>
      draftOverride.dateKey === selectedDateKey
        ? draftOverride
        : { dateKey: selectedDateKey, ...normalizedOverride },
    [draftOverride, normalizedOverride, selectedDateKey]
  );
  const validationError =
    validationState.dateKey === selectedDateKey ? validationState.message : "";
  const hasUnsavedDateChanges = useMemo(
    () =>
      ["isWorking", "startTime", "endTime", "breakStart", "breakEnd"].some(
        (field) => String(activeDraft[field] || "") !== String(normalizedOverride[field] || "")
      ),
    [activeDraft, normalizedOverride]
  );
  const hasBreakTime = Boolean(activeDraft.breakStart || activeDraft.breakEnd);
  const isBreakEnabled =
    breakToggleState.dateKey === selectedDateKey
      ? breakToggleState.enabled || hasBreakTime
      : hasBreakTime;
  const sortedNonWorkingDays = useMemo(
    () => [...nonWorkingDays].sort(),
    [nonWorkingDays]
  );
  const sortedOverrides = useMemo(
    () =>
      Object.entries(scheduleOverrides)
        .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
        .map(([dateKey, override]) => ({ dateKey, override })),
    [scheduleOverrides]
  );
  const isNonWorkingDay = nonWorkingDays.includes(selectedDateKey);
  const hasCustomHours = Boolean(scheduleOverrides[selectedDateKey]);
  const canMarkDayOff =
    selectedDateKey >= todayKey &&
    !nonWorkingDays.includes(selectedDateKey);
  const isSaving = Boolean(isPerSalonLoading && !isLoadingSalons && activeSalonId);
  const isWaitingForSelectedSalonSchedule = Boolean(
    activeSalonId && !activePerSalonSchedule && !perSalonError
  );

  const dateStatusMap = useMemo(() => {
    const map = {};
    dateOptions.forEach(({ value }) => {
      const inOverride = Boolean(scheduleOverrides[value]);
      const isDayOff =
        nonWorkingDays.includes(value) ||
        (inOverride && scheduleOverrides[value].isWorking === false);
      map[value] = {
        isDefault: !inOverride && !isDayOff,
        isCustom: inOverride && scheduleOverrides[value].isWorking !== false,
        isDayOff,
        isPast: value < todayKey,
        isSelected: value === selectedDateKey,
      };
    });
    return map;
  }, [dateOptions, scheduleOverrides, nonWorkingDays, todayKey, selectedDateKey]);

  const selectDate = useCallback((dateKey) => {
    if (!parseDateKey(dateKey) || dateKey < todayKey) return;
    setSelectedDate(dateKey);
    // Reset validation when switching dates
    setValidationState({ dateKey, message: "" });
  }, [todayKey]);

  const updateDraft = useCallback((field, value) => {
    setValidationState({ dateKey: selectedDateKey, message: "" });
    setSaveSuccess("");
    setDraftOverride((currentDraft) => ({
      ...(currentDraft.dateKey === selectedDateKey
        ? currentDraft
        : { dateKey: selectedDateKey, ...normalizedOverride }),
      [field]: value,
    }));
  }, [normalizedOverride, selectedDateKey]);

  const updateTimeDraft = useCallback((field, value) => {
    updateDraft(field, formatTimeInput(value, activeDraft[field] || ""));
  }, [activeDraft, updateDraft]);

  const toggleBreakTime = useCallback((enabled) => {
    setBreakToggleState({ dateKey: selectedDateKey, enabled });
    if (!enabled) {
      updateDraft("breakStart", "");
      updateDraft("breakEnd", "");
    }
  }, [selectedDateKey, updateDraft]);

  const saveSelectedDateSchedule = async () => {
    if (!currentUserId || !activeSalonId) return;

    setSaveSuccess("");

    if (!activeDraft.isWorking) {
      if (
        !isNonWorkingDay &&
        !window.confirm("Mark this day as non-working?")
      ) {
        return;
      }

      await savePerSalonSchedule({
        scheduleOverrides: {
          ...scheduleOverrides,
          [selectedDateKey]: { isWorking: false },
        },
        nonWorkingDays: Array.from(
          new Set([...nonWorkingDays, selectedDateKey])
        ),
      });
      return;
    }

    const startMinutes = timeToMinutes(activeDraft.startTime);
    const endMinutes = timeToMinutes(activeDraft.endTime);
    const breakStartFilled = Boolean(activeDraft.breakStart);
    const breakEndFilled = Boolean(activeDraft.breakEnd);
    const breakStartMinutes = timeToMinutes(activeDraft.breakStart);
    const breakEndMinutes = timeToMinutes(activeDraft.breakEnd);

    if (startMinutes === null || endMinutes === null) {
      setValidationState({
        dateKey: selectedDateKey,
        message: "Work start and work end are required in HH:mm format.",
      });
      return;
    }

    if (endMinutes <= startMinutes) {
      setValidationState({
        dateKey: selectedDateKey,
        message: "End time must be later than start time.",
      });
      return;
    }

    if (breakStartFilled !== breakEndFilled) {
      setValidationState({
        dateKey: selectedDateKey,
        message: "Break start and break end must both be filled or both empty.",
      });
      return;
    }

    if (breakStartFilled && (breakStartMinutes === null || breakEndMinutes === null)) {
      setValidationState({
        dateKey: selectedDateKey,
        message: "Break time must use HH:mm format.",
      });
      return;
    }

    if (breakStartFilled && breakEndMinutes <= breakStartMinutes) {
      setValidationState({
        dateKey: selectedDateKey,
        message: "Break end must be later than break start.",
      });
      return;
    }

    if (
      breakStartFilled &&
      (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes)
    ) {
      setValidationState({
        dateKey: selectedDateKey,
        message: "Break time must be inside working hours.",
      });
      return;
    }

    await savePerSalonSchedule({
      scheduleOverrides: {
        ...scheduleOverrides,
        [selectedDateKey]: {
          isWorking: true,
          startTime: activeDraft.startTime,
          endTime: activeDraft.endTime,
          breakStart: activeDraft.breakStart || "",
          breakEnd: activeDraft.breakEnd || "",
        },
      },
      nonWorkingDays: nonWorkingDays.filter((day) => day !== selectedDateKey),
    });
  };

  const savePerSalonSchedule = async (updates) => {
    if (!currentUserId || !activeSalonId) return;

    setIsPerSalonLoading((current) => (current ? current : true));
    setPerSalonError("");
    setSaveSuccess("");

    try {
      const { data } = await api.put(
        `/schedules/${currentUserId}/${activeSalonId}`,
        {
          barberId: currentUserId,
          weeklySchedule: effectiveSchedule.weeklySchedule || {},
          dateSchedules: effectiveSchedule.dateSchedules || {},
          scheduleOverrides: updates.scheduleOverrides || scheduleOverrides,
          nonWorkingDays: updates.nonWorkingDays || nonWorkingDays,
          defaultSchedule: updates.defaultSchedule || currentDefaultSchedule,
        }
      );

      const normalized = normalizeSchedule(data);
      setPerSalonSchedule((currentSchedule) =>
        areSchedulesEqual(currentSchedule, normalized)
          ? currentSchedule
          : normalized
      );
      setLoadedScheduleSalonId(activeSalonId);
      setSaveSuccess("Schedule saved successfully!");
    } catch (requestError) {
      setPerSalonError(
        requestError.response?.data?.message ||
          "Could not save schedule. Please try again."
      );
    } finally {
      setIsPerSalonLoading(false);
    }
  };

  const restoreWorkingDate = async (dateKey) => {
    if (!currentUserId || !activeSalonId) return;
    if (!window.confirm("Restore this working day?")) return;

    setSaveSuccess("");

    await savePerSalonSchedule({
      scheduleOverrides: {
        ...scheduleOverrides,
        [dateKey]: {
          isWorking: true,
          startTime: defaultDaySchedule.from,
          endTime: defaultDaySchedule.to,
          breakStart: defaultDaySchedule.breakFrom,
          breakEnd: defaultDaySchedule.breakTo,
        },
      },
      nonWorkingDays: nonWorkingDays.filter((day) => day !== dateKey),
    });
  };

  const markDayOff = async () => {
    if (!currentUserId || !activeSalonId || !canMarkDayOff) return;
    if (!window.confirm("Mark this day as non-working?")) return;

    setSaveSuccess("");

    await savePerSalonSchedule({
      scheduleOverrides: {
        ...scheduleOverrides,
        [selectedDateKey]: { isWorking: false },
      },
      nonWorkingDays: Array.from(new Set([...nonWorkingDays, selectedDateKey])),
    });
  };

  const removeOverride = async (dateKey) => {
    if (!currentUserId || !activeSalonId) return;
    if (!window.confirm("Remove this date override?")) return;

    const nextOverrides = { ...scheduleOverrides };
    delete nextOverrides[dateKey];

    await savePerSalonSchedule({
      scheduleOverrides: nextOverrides,
      nonWorkingDays: nonWorkingDays.filter((day) => day !== dateKey),
    });
  };

  const resetDraftToDefault = () => {
    updateDraft("isWorking", defaultDaySchedule.working);
    updateDraft("startTime", defaultDaySchedule.from);
    updateDraft("endTime", defaultDaySchedule.to);
    updateDraft("breakStart", defaultDaySchedule.breakFrom);
    updateDraft("breakEnd", defaultDaySchedule.breakTo);
  };

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const handleSalonSelect = useCallback((salonId) => {
    if (!salonId) {
      setIsDrawerOpen(false);
      return;
    }

    if (String(activeSalonId) === String(salonId)) {
      setIsDrawerOpen(false);
      return;
    }

    const nextSalonId = String(salonId);
    setSelectedSalonId(nextSalonId);
    setPerSalonSchedule(null);
    setLoadedScheduleSalonId(null);
    setIsPerSalonLoading(true);
    setSaveSuccess("");
    setIsDrawerOpen(false);
  }, [activeSalonId]);

  const isLoadingEffective =
    isLoading ||
    isPerSalonLoading ||
    isLoadingSalons ||
    isWaitingForSelectedSalonSchedule;
  const displayError = error || perSalonError;

  // Field-specific error parsing
  const fieldErrors = useMemo(() => {
    const errs = { startTime: "", endTime: "", breakStart: "", breakEnd: "", general: "" };
    if (!validationError) return errs;
    if (validationError.includes("Work start") && validationError.includes("End time")) {
      errs.startTime = validationError;
      errs.endTime = validationError;
    } else if (validationError.includes("End time")) {
      errs.endTime = validationError;
    } else if (validationError.includes("Break end must be later")) {
      errs.breakEnd = validationError;
    } else if (validationError.includes("Break start") && validationError.includes("Break end")) {
      errs.breakStart = validationError;
      errs.breakEnd = validationError;
    } else if (validationError.includes("Break time must be inside")) {
      errs.breakStart = validationError;
      errs.breakEnd = validationError;
    } else if (validationError.includes("Break")) {
      errs.breakStart = validationError;
      errs.breakEnd = validationError;
    } else {
      errs.general = validationError;
    }
    return errs;
  }, [validationError]);
  // Loading state
  if (isLoadingSalons) {
    return <ScheduleSkeleton />;
  }

  // No salon memberships
  if (approvedSalons.length === 0) {
    return (
      <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40 lg:col-span-3">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <h2 className="text-xl font-bold sm:text-2xl">Schedule</h2>
          <EmptyState
            title="No salons available for schedule management"
            description="Schedule is salon-based. Create your salon or join an existing salon to start managing working hours."
            action={
              <Button
                as={Link}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md shadow-purple-200 hover:from-purple-700 hover:to-pink-600 sm:w-auto"
                to="/admin/settings/salon"
              >
                Create or join a salon
              </Button>
            }
          >
            <p className="mt-2 text-sm text-neutral-500">
              After approval, schedule controls will appear automatically.
            </p>
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  // No salon selected
  if (!activeSalonId) {
    return (
      <>
        <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40 lg:col-span-3">
          <CardContent className="space-y-5 p-4 sm:p-6">
            <h2 className="text-xl font-bold sm:text-2xl">Schedule</h2>
            <p className="text-neutral-500">
              Please select a salon to manage schedule.
            </p>
            <Button className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 sm:w-auto" onClick={openDrawer} variant="outline">
              Select Salon
            </Button>
          </CardContent>
        </Card>
        <ScheduleSalonDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          salons={approvedSalons}
          selectedId={activeSalonId}
          onSelect={handleSalonSelect}
          isLoading={false}
        />
      </>
    );
  }

  // Empty schedule state - no default schedule at all
  const hasNoScheduleData = !effectiveSchedule || !effectiveSchedule.defaultSchedule;
  const isScheduleEmpty = hasNoScheduleData && !isLoadingEffective;

  return (
    <div
      className={cn(
        "w-full rounded-[2rem] border border-purple-100 bg-gradient-to-br from-purple-50 via-white to-pink-50/70 p-3 shadow-sm shadow-purple-100/70 sm:p-5",
        approvedSalons.length > 0 && activeSalonId ? "lg:col-span-3" : ""
      )}
    >
      <div className="mx-auto max-w-6xl space-y-6">
      {/* ─── Header ─── */}
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

      <ScheduleSalonSelector
        selectedSalonEntry={selectedSalonEntry}
        approvedSalons={approvedSalons}
        getSalonNameFromEntry={getSalonNameFromEntry}
        getSalonAddressFromEntry={getSalonAddressFromEntry}
        onOpenDrawer={openDrawer}
      />

      {/* ─── Loading State ─── */}
      {isLoadingEffective ? (
        <ScheduleSkeleton />
      ) : isScheduleEmpty ? (
        <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40">
          <CardContent className="p-4 sm:p-6">
            <EmptyState
              title="No schedule configured yet"
              description="Set your working hours to start accepting bookings."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Inline Status Banner ─── */}
          {displayError && (
            <div
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm"
              role="alert"
            >
              <strong className="block font-semibold">Error</strong>
              <p className="mt-1">{displayError}</p>
            </div>
          )}
          {saveSuccess && (
            <div
              className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700 shadow-sm"
              role="status"
            >
              {saveSuccess}
            </div>
          )}

          <DefaultScheduleSection
            defaultSchedule={currentDefaultSchedule}
            weeklySchedule={effectiveSchedule.weeklySchedule}
          />

          <SalonScheduleSection
            dateOptions={dateOptions}
            dateStatusMap={dateStatusMap}
            selectedDateKey={selectedDateKey}
            selectedDateObject={selectedDateObject}
            todayKey={todayKey}
            isNonWorkingDay={isNonWorkingDay}
            hasCustomHours={hasCustomHours}
            activeDraft={activeDraft}
            hasUnsavedChanges={hasUnsavedDateChanges}
            isSaving={isSaving}
            fieldErrors={fieldErrors}
            isBreakEnabled={isBreakEnabled}
            timeInputClass={timeInputClass}
            canMarkDayOff={canMarkDayOff}
            sortedOverrides={sortedOverrides}
            sortedNonWorkingDays={sortedNonWorkingDays}
            currentUserId={currentUserId}
            selectedSalonId={activeSalonId}
            barberServices={barberServices}
            isLoadingServices={isLoadingServices}
            servicesError={servicesError}
            onSelectDate={selectDate}
            onUpdateDraft={updateDraft}
            onUpdateTimeDraft={updateTimeDraft}
            onToggleBreakTime={toggleBreakTime}
            onSaveSelectedDateSchedule={saveSelectedDateSchedule}
            onResetDraftToDefault={resetDraftToDefault}
            onRemoveOverride={removeOverride}
            onMarkDayOff={markDayOff}
            onRestoreWorkingDate={restoreWorkingDate}
          />
        </>
      )}

      {/* ─── Salon Selection Drawer ─── */}
      <ScheduleSalonDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        salons={approvedSalons}
        selectedId={activeSalonId}
        onSelect={handleSalonSelect}
        isLoading={false}
      />
      </div>
    </div>
  );
}
