import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

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
import ScheduleWeeklyHours from "@/barber/components/schedule/ScheduleWeeklyHours";
import ScheduleOverridesList from "@/barber/components/schedule/ScheduleOverridesList";
import ScheduleDateOverrideEditor from "@/barber/components/schedule/ScheduleDateOverrideEditor";
import ScheduleNonWorkingDaysSection from "@/barber/components/schedule/ScheduleNonWorkingDaysSection";
import AvailabilityDebugPanel from "@/barber/components/schedule/AvailabilityDebugPanel";
import ScheduleSkeleton from "@/barber/components/ScheduleSkeleton";
import {
  getSalonNameFromEntry,
  getSalonAddressFromEntry,
  normalizeManageableSalonEntries,
  getSalonListFromResponse,
  normalizeSchedule,
  areSchedulesEqual,
  normalizeDefaultScheduleDraft,
} from "@/barber/utils/scheduleHelpers";

const timeInputClass = (hasError) =>
  cn(
    "h-11 w-full rounded-xl border px-3 py-2 text-sm font-normal tabular-nums transition",
    "focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10",
    "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 disabled:opacity-60",
    hasError &&
      "border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-200"
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
  const [isPerSalonLoading, setIsPerSalonLoading] = useState(false);
  const [perSalonError, setPerSalonError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [manageableSalons, setManageableSalons] = useState([]);
  const [isLoadingManageable, setIsLoadingManageable] = useState(false);
  const isMountedRef = useRef(true);
  const hasNoUserRef = useRef(false);
  const hasSetInitialSalon = useRef(false);
  const servicesFetchAttemptedRef = useRef("");

  const getSalonIdFromEntry = useCallback((entry) => {
    if (!entry) return null;
    if (typeof entry.salon === "object" && (entry.salon?._id || entry.salon?.id)) {
      return entry.salon._id || entry.salon.id;
    }
    if (typeof entry.salon === "string") return entry.salon;
    if (entry._id || entry.id) return entry._id || entry.id;
    return null;
  }, []);

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
          (s) => s.status === "approved"
        );
        const nextEntries =
          manageableEntries.length > 0 ? manageableEntries : approvedEntries;

        if (nextEntries.length > 0) {
          setSalonEntries((currentEntries) =>
            JSON.stringify(currentEntries) === JSON.stringify(nextEntries)
              ? currentEntries
              : nextEntries
          );
        } else if (statusData.salon && statusData.salonStatus === "approved") {
          const nextEntries = [{
            salon: statusData.salon,
            status: "approved",
            isPrimary: true,
          }];
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
    () => (salonEntries || []).filter((s) => s.status === "approved"),
    [salonEntries]
  );
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
        (entry) => String(getSalonIdFromEntry(entry)) === String(selectedSalonId)
      ) || null,
    [approvedSalons, getSalonIdFromEntry, selectedSalonId]
  );

  // Reset initial salon selection when approved salons change
  useEffect(() => {
    hasSetInitialSalon.current = false;
  }, [approvedSalons.length]);

  // Set initial selected salon when data arrives (runs once)
  useEffect(() => {
    if (approvedSalons.length > 0 && !hasSetInitialSalon.current) {
      const primary = approvedSalons.find((s) => s.isPrimary) || approvedSalons[0];
      const id = getSalonIdFromEntry(primary);
      if (id) {
        // Use setTimeout to defer state update outside the effect
        const timer = setTimeout(() => {
          setSelectedSalonId(id);
          hasSetInitialSalon.current = true;
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [approvedSalons, getSalonIdFromEntry]);

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

  // Fetch schedule when selectedSalonId changes
  useEffect(() => {
    if (!currentUserId || !selectedSalonId) return;

    let cancelled = false;

    async function fetchSchedule() {
      setIsPerSalonLoading((current) => (current ? current : true));
      setPerSalonError("");

      try {
        const { data } = await api.get(
          `/schedules/${currentUserId}/${selectedSalonId}`
        );

        const normalized = normalizeSchedule(data);

        if (!cancelled) {
          setPerSalonSchedule((currentSchedule) =>
            areSchedulesEqual(currentSchedule, normalized)
              ? currentSchedule
              : normalized
          );
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
  }, [currentUserId, selectedSalonId]);

  const effectiveSchedule = perSalonSchedule || schedule;
  const currentDefaultSchedule = useMemo(
    () => normalizeDefaultScheduleDraft(effectiveSchedule.defaultSchedule),
    [effectiveSchedule.defaultSchedule]
  );

  const dateOptions = useMemo(() => getNext7Days(), []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const scheduleOverrides = useMemo(
    () => effectiveSchedule.scheduleOverrides || {},
    [effectiveSchedule.scheduleOverrides]
  );
  const nonWorkingDays = useMemo(
    () => effectiveSchedule.nonWorkingDays || [],
    [effectiveSchedule.nonWorkingDays]
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
  const hasBreakTime = Boolean(activeDraft.breakStart || activeDraft.breakEnd);
  const isBreakEnabled =
    breakToggleState.dateKey === selectedDateKey
      ? breakToggleState.enabled || hasBreakTime
      : hasBreakTime;
  const todayKey = formatDateKey(new Date());
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
  const isSaving = Boolean(isPerSalonLoading && !isLoadingSalons && selectedSalonId);

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
    if (!currentUserId || !selectedSalonId) return;

    setSaveSuccess("");

    if (!activeDraft.isWorking) {
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
    if (!currentUserId || !selectedSalonId) return;

    setIsPerSalonLoading((current) => (current ? current : true));
    setPerSalonError("");
    setSaveSuccess("");

    try {
      const { data } = await api.put(
        `/schedules/${currentUserId}/${selectedSalonId}`,
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
    if (!currentUserId || !selectedSalonId) return;

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
    if (!currentUserId || !selectedSalonId || !canMarkDayOff) return;

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
    if (!currentUserId || !selectedSalonId) return;

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
    setIsLoadingManageable(true);
    setIsDrawerOpen(true);
    api.get("/salons/mine/manageable")
      .then(({ data }) => {
        const salonsList = getSalonListFromResponse(data);
        setManageableSalons(salonsList);
      })
      .catch(() => {
        setManageableSalons([]);
      })
      .finally(() => {
        setIsLoadingManageable(false);
      });
  }, []);

  const handleSalonSelect = useCallback((salonId) => {
    setSelectedSalonId(salonId);
    setPerSalonSchedule(null);
    setIsPerSalonLoading(true);
    setSaveSuccess("");
  }, []);

  const isLoadingEffective = isLoading || isPerSalonLoading || isLoadingSalons;
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
      <Card className="rounded-2xl sm:rounded-3xl lg:col-span-3">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <h2 className="text-xl font-bold sm:text-2xl">Schedule</h2>
          <EmptyState
            title="No salons available for schedule management"
            description="Once you are approved for a salon, you can manage that salon's schedule here."
          />
        </CardContent>
      </Card>
    );
  }

  // No salon selected
  if (!selectedSalonId) {
    return (
      <>
        <Card className="rounded-2xl sm:rounded-3xl lg:col-span-3">
          <CardContent className="space-y-5 p-4 sm:p-6">
            <h2 className="text-xl font-bold sm:text-2xl">Schedule</h2>
            <p className="text-neutral-500">
              Please select a salon to manage schedule.
            </p>
            <Button className="w-full sm:w-auto" onClick={openDrawer} variant="outline">
              Select Salon
            </Button>
          </CardContent>
        </Card>
        <ScheduleSalonDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          salons={manageableSalons}
          selectedId={selectedSalonId}
          onSelect={handleSalonSelect}
          isLoading={isLoadingManageable}
        />
      </>
    );
  }

  // Empty schedule state - no default schedule at all
  const hasNoScheduleData = !effectiveSchedule || !effectiveSchedule.defaultSchedule;
  const isScheduleEmpty = hasNoScheduleData && !isLoadingEffective;

  return (
    <div className={cn("space-y-6", approvedSalons.length > 0 && selectedSalonId ? "lg:col-span-3" : "")}>
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Schedule
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Set your working hours, breaks, and day-specific overrides for the selected salon.
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
        <Card className="rounded-2xl sm:rounded-3xl">
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
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              role="alert"
            >
              <strong className="block font-semibold">Error</strong>
              <p className="mt-1">{displayError}</p>
            </div>
          )}
          {saveSuccess && (
            <div
              className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"
              role="status"
            >
              {saveSuccess}
            </div>
          )}

          <ScheduleWeeklyHours

            defaultSchedule={currentDefaultSchedule}
            weeklySchedule={effectiveSchedule.weeklySchedule}
          />

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
                onSelectDate={selectDate}
                onUpdateDraft={updateDraft}
                onUpdateTimeDraft={updateTimeDraft}
                onToggleBreakTime={toggleBreakTime}
                onSaveSelectedDateSchedule={saveSelectedDateSchedule}
                onResetDraftToDefault={resetDraftToDefault}
                onRemoveOverride={removeOverride}
                onMarkDayOff={markDayOff}
              />

              <ScheduleOverridesList
                overrides={sortedOverrides}
                onEdit={selectDate}
                onRemove={removeOverride}
                disabled={isSaving}
              />

              <ScheduleNonWorkingDaysSection
                isSaving={isSaving}
                sortedNonWorkingDays={sortedNonWorkingDays}
                onRestoreWorkingDate={restoreWorkingDate}
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
      )}

      {/* ─── Salon Selection Drawer ─── */}
      <ScheduleSalonDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        salons={manageableSalons}
        selectedId={selectedSalonId}
        onSelect={handleSalonSelect}
        isLoading={isLoadingManageable}
      />
    </div>
  );
}
