import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { getMyBarberOnboarding } from "@/shared/api/barberOnboarding";
import { getDayScheduleFromDefaultSchedule } from "@/shared/data/schedule";
import { getArmeniaTodayKey, getNext7ArmeniaDays, isBeforeArmeniaToday, parseDateKey } from "@/shared/utils/dates";
import { formatTimeInput } from "@/shared/utils/time";
import { setServices } from "@/store/slices/servicesSlice";
import {
  areSchedulesEqual,
  getSalonIdFromEntry,
  isSelectableScheduleSalonEntry,
  mergeScheduleSalonEntries,
  normalizeDefaultScheduleDraft,
  normalizeManageableSalonEntries,
  normalizeSchedule,
} from "@/barber/utils/scheduleHelpers";
import {
  filterCurrentNonWorkingDays,
  filterCurrentScheduleOverrides,
  getDefaultDateOverrideDraft,
  getNormalizedDateOverride,
  getResetDateOverrideDraft,
  getSelectedDateScheduleSavePlan,
  getScheduleManagerViewState,
  getScheduleSaveRequestPayload,
  timeInputClass,
} from "@/barber/utils/scheduleManagerHelpers";

export default function useScheduleManager({
  schedule,
  isLoading = false,
  error = "",
}) {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const services = useSelector((state) => state.services);

  const currentUserId = currentUser?.id || currentUser?._id;
  const [salonEntries, setSalonEntries] = useState([]), [isLoadingSalons, setIsLoadingSalons] = useState(true), [isLoadingServices, setIsLoadingServices] = useState(false), [servicesError, setServicesError] = useState(""), [selectedSalonId, setSelectedSalonId] = useState(null), [perSalonSchedule, setPerSalonSchedule] = useState(null), [loadedScheduleSalonId, setLoadedScheduleSalonId] = useState(null), [isPerSalonLoading, setIsPerSalonLoading] = useState(false), [perSalonError, setPerSalonError] = useState(""), [saveSuccess, setSaveSuccess] = useState(""), [isDrawerOpen, setIsDrawerOpen] = useState(false), [onboardingStep, setOnboardingStep] = useState(null), [isOnboardingStepLoading, setIsOnboardingStepLoading] = useState(false), [validationState, setValidationState] = useState({ dateKey: "", message: "" }), [breakToggleState, setBreakToggleState] = useState({ dateKey: "", enabled: false });
  const initialDateOptions = getNext7ArmeniaDays(), initialSelectedDateKey = initialDateOptions[0].value, initialTodayKey = getArmeniaTodayKey();
  const [selectedDate, setSelectedDate] = useState(initialSelectedDateKey);
  const [draftOverride, setDraftOverride] = useState(() => getDefaultDateOverrideDraft(initialSelectedDateKey, getNormalizedDateOverride({ selectedDateKey: initialSelectedDateKey, scheduleOverrides: filterCurrentScheduleOverrides(schedule.scheduleOverrides || {}, initialTodayKey), nonWorkingDays: filterCurrentNonWorkingDays(schedule.nonWorkingDays || [], initialTodayKey), defaultDaySchedule: getDayScheduleFromDefaultSchedule(normalizeDefaultScheduleDraft(schedule.defaultSchedule)) })));
  const isMountedRef = useRef(true), servicesFetchAttemptedRef = useRef(""), onboardingRequestRef = useRef(0), salonLoadRequestRef = useRef(0), scheduleLoadRequestRef = useRef(0), saveRequestRef = useRef(0), activeSalonIdRef = useRef(null);
  const approvedSalons = useMemo(() => (salonEntries || []).filter(isSelectableScheduleSalonEntry), [salonEntries]);
  const initialSalonId = useMemo(() => {
    if (approvedSalons.length === 0) return null;
    const primary = approvedSalons.find((salon) => salon.isPrimary) || approvedSalons[0];
    return getSalonIdFromEntry(primary);
  }, [approvedSalons]);
  const activeSalonId = selectedSalonId || initialSalonId;
  useEffect(() => { activeSalonIdRef.current = activeSalonId; }, [activeSalonId]);
  const barberServices = useMemo(() => (services || []).filter((service) => String(service?.barberId) === String(currentUserId)), [currentUserId, services]);
  const selectedSalonEntry = useMemo(() => approvedSalons.find((entry) => String(getSalonIdFromEntry(entry)) === String(activeSalonId)) || null, [activeSalonId, approvedSalons]);
  useEffect(() => {
    isMountedRef.current = true;
    if (!currentUserId) {
      Promise.resolve().then(() => {
        if (isMountedRef.current) {
          setIsLoadingSalons(false);
        }
      });
      return () => {
        isMountedRef.current = false;
      };
    }
    const requestId = ++salonLoadRequestRef.current; let cancelled = false;
    (async () => {
      setIsLoadingSalons(true);
      try {
        const [statusResult, manageableResult] = await Promise.allSettled([api.get("/salons/me/status"), api.get("/salons/mine/manageable")]);
        if (cancelled || !isMountedRef.current || salonLoadRequestRef.current !== requestId) return;
        const statusData = statusResult.status === "fulfilled" ? statusResult.value.data : {}, manageableEntries = manageableResult.status === "fulfilled" ? normalizeManageableSalonEntries(manageableResult.value.data) : [], approvedEntries = (statusData.salons || []).filter(isSelectableScheduleSalonEntry), legacyEntries = statusData.salon && statusData.salonStatus === "approved" ? [{ salon: statusData.salon, status: "approved", isPrimary: true }] : [], nextEntries = mergeScheduleSalonEntries(approvedEntries, legacyEntries, manageableEntries);
        setSalonEntries((currentEntries) => (JSON.stringify(currentEntries) === JSON.stringify(nextEntries) ? currentEntries : nextEntries));
      } catch {
        if (cancelled || !isMountedRef.current || salonLoadRequestRef.current !== requestId) return;
        setSalonEntries((currentEntries) => (currentEntries.length === 0 ? currentEntries : []));
      } finally {
        if (!cancelled && isMountedRef.current && salonLoadRequestRef.current === requestId) setIsLoadingSalons(false);
      }
    })();
    return () => { cancelled = true; isMountedRef.current = false; salonLoadRequestRef.current += 1; };
  }, [currentUserId]);
  useEffect(() => {
    isMountedRef.current = true;
    if (!currentUserId || isLoadingSalons || salonEntries.length > 0) {
      if (!currentUserId || salonEntries.length > 0) {
        Promise.resolve().then(() => { if (!isMountedRef.current) return; setOnboardingStep(null); setIsOnboardingStepLoading(false); });
      }
      return () => { isMountedRef.current = false; };
    }
    const requestId = ++onboardingRequestRef.current; let cancelled = false;
    (async () => {
      setIsOnboardingStepLoading(true);
      try {
        const status = await getMyBarberOnboarding();
        if (cancelled || !isMountedRef.current || onboardingRequestRef.current !== requestId) return;
        setOnboardingStep(status?.state?.currentStep || null);
      } catch {
        if (cancelled || !isMountedRef.current || onboardingRequestRef.current !== requestId) return;
        setOnboardingStep(null);
      } finally {
        if (!cancelled && isMountedRef.current && onboardingRequestRef.current === requestId) setIsOnboardingStepLoading(false);
      }
    })();
    return () => { cancelled = true; isMountedRef.current = false; onboardingRequestRef.current += 1; };
  }, [currentUserId, isLoadingSalons, salonEntries.length]);
  useEffect(() => {
    if (!currentUserId || barberServices.length > 0) return;
    if (servicesFetchAttemptedRef.current === String(currentUserId)) return;
    let cancelled = false; servicesFetchAttemptedRef.current = String(currentUserId);
    (async () => {
      setIsLoadingServices(true); setServicesError("");
      try {
        const { data } = await api.get(`/services/${currentUserId}`);
        if (!cancelled) dispatch(setServices({ barberId: currentUserId, services: data }));
      } catch (requestError) {
        if (!cancelled) setServicesError(requestError.response?.data?.message || "Could not load services for diagnostics.");
      } finally {
        if (!cancelled) setIsLoadingServices(false);
      }
    })();
    return () => { cancelled = true; };
  }, [barberServices.length, currentUserId, dispatch]);
  useEffect(() => {
    if (!currentUserId || !activeSalonId) return;
    isMountedRef.current = true;
    const requestId = ++scheduleLoadRequestRef.current, requestSalonId = String(activeSalonId); let cancelled = false;
    (async () => {
      setIsPerSalonLoading((current) => (current ? current : true)); setPerSalonError("");
      try {
        const { data } = await api.get(`/schedules/${currentUserId}/${activeSalonId}`), normalized = normalizeSchedule(data);
        if (cancelled || !isMountedRef.current || scheduleLoadRequestRef.current !== requestId || String(activeSalonIdRef.current) !== requestSalonId) return;
        setPerSalonSchedule((currentSchedule) => (areSchedulesEqual(currentSchedule, normalized) ? currentSchedule : normalized)); setLoadedScheduleSalonId(activeSalonId);
      } catch (requestError) {
        if (cancelled || !isMountedRef.current || scheduleLoadRequestRef.current !== requestId || String(activeSalonIdRef.current) !== requestSalonId) return;
        setPerSalonError(requestError.response?.data?.message || "Could not load schedule for this salon.");
      } finally {
        if (!cancelled && isMountedRef.current && scheduleLoadRequestRef.current === requestId && String(activeSalonIdRef.current) === requestSalonId) setIsPerSalonLoading(false);
      }
    })();
    return () => { cancelled = true; isMountedRef.current = false; scheduleLoadRequestRef.current += 1; };
  }, [activeSalonId, currentUserId]);
  const activePerSalonSchedule = String(loadedScheduleSalonId) === String(activeSalonId) ? perSalonSchedule : null;
  const viewState = useMemo(
    () =>
      getScheduleManagerViewState({
        schedule,
        activePerSalonSchedule,
        selectedDate,
        draftOverride,
        validationState,
        breakToggleState,
        activeSalonId,
        isLoading,
        isLoadingSalons,
        isPerSalonLoading,
        perSalonError,
        error,
      }),
    [
      activePerSalonSchedule,
      activeSalonId,
      breakToggleState,
      draftOverride,
      error,
      isLoading,
      isLoadingSalons,
      isPerSalonLoading,
      perSalonError,
      schedule,
      selectedDate,
      validationState,
    ]
  );
  const { activeDraft, canMarkDayOff, currentDefaultSchedule, dateOptions, dateStatusMap, defaultDaySchedule, displayError, effectiveSchedule, fieldErrors, hasCustomHours, hasUnsavedDateChangesValue, isBreakEnabled, isLoadingEffective, isNonWorkingDay, isSaving, isScheduleEmpty, nonWorkingDays, normalizedOverride, scheduleOverrides, selectedDateKey, selectedDateObject, sortedNonWorkingDays, sortedOverrides, todayKey } = viewState;
  const prevScheduleRef = useRef(effectiveSchedule);
  useEffect(() => {
    if (prevScheduleRef.current !== effectiveSchedule) {
      prevScheduleRef.current = effectiveSchedule;
      setDraftOverride(getDefaultDateOverrideDraft(selectedDateKey, normalizedOverride));
      setBreakToggleState({
        dateKey: selectedDateKey,
        enabled: Boolean(normalizedOverride.breakStart || normalizedOverride.breakEnd),
      });
      setValidationState({ dateKey: selectedDateKey, message: "" });
    }
  }, [effectiveSchedule, normalizedOverride, selectedDateKey]);
  const selectDate = useCallback(
    (dateKey) => {
      if (!parseDateKey(dateKey) || isBeforeArmeniaToday(dateKey)) return;
      setSelectedDate(dateKey);
      setValidationState({ dateKey, message: "" });
    },
    []
  );

  const updateDraft = useCallback(
    (field, value) => {
      setValidationState({ dateKey: selectedDateKey, message: "" });
      setSaveSuccess("");
      setDraftOverride((currentDraft) => ({
        ...(currentDraft.dateKey === selectedDateKey
          ? currentDraft
          : getDefaultDateOverrideDraft(selectedDateKey, normalizedOverride)),
        [field]: value,
      }));
    },
    [normalizedOverride, selectedDateKey]
  );

  const updateTimeDraft = useCallback(
    (field, value) => {
      updateDraft(field, formatTimeInput(value, activeDraft[field] || ""));
    },
    [activeDraft, updateDraft]
  );

  const toggleBreakTime = useCallback(
    (enabled) => {
      setBreakToggleState({ dateKey: selectedDateKey, enabled });
      if (!enabled) {
        updateDraft("breakStart", "");
        updateDraft("breakEnd", "");
      }
    },
    [selectedDateKey, updateDraft]
  );

  const savePerSalonSchedule = async (updates) => {
    if (
      !currentUserId ||
      !activeSalonId ||
      saveRequestRef.current > 0 ||
      isPerSalonLoading
    ) {
      return;
    }

    const requestId = ++saveRequestRef.current;
    const requestSalonId = String(activeSalonId);

    setIsPerSalonLoading(true);
    setPerSalonError("");
    setSaveSuccess("");

    try {
      const { data } = await api.put(
        `/schedules/${currentUserId}/${activeSalonId}`,
        getScheduleSaveRequestPayload({
          currentUserId,
          effectiveSchedule,
          updates,
          scheduleOverrides,
          nonWorkingDays,
          currentDefaultSchedule,
        })
      );

      if (
        !isMountedRef.current ||
        requestId !== saveRequestRef.current ||
        String(activeSalonIdRef.current) !== requestSalonId
      ) {
        return;
      }

      const normalized = normalizeSchedule(data);
      setPerSalonSchedule((currentSchedule) =>
        areSchedulesEqual(currentSchedule, normalized)
          ? currentSchedule
          : normalized
      );
      setLoadedScheduleSalonId(activeSalonId);
      setSaveSuccess("Schedule saved successfully!");
    } catch (requestError) {
      if (
        !isMountedRef.current ||
        requestId !== saveRequestRef.current ||
        String(activeSalonIdRef.current) !== requestSalonId
      ) {
        return;
      }
      setPerSalonError(
        requestError.response?.data?.message ||
          "Could not save schedule. Please try again."
      );
    } finally {
      if (requestId === saveRequestRef.current) {
        saveRequestRef.current = 0;
        if (
          isMountedRef.current &&
          String(activeSalonIdRef.current) === requestSalonId
        ) {
          setIsPerSalonLoading(false);
        }
      }
    }
  };

  const saveSelectedDateSchedule = async () => {
    if (
      !currentUserId ||
      !activeSalonId ||
      isPerSalonLoading ||
      saveRequestRef.current > 0
    ) {
      return;
    }

    setSaveSuccess("");

    const savePlan = getSelectedDateScheduleSavePlan({
      activeDraft,
      selectedDateKey,
      scheduleOverrides,
      nonWorkingDays,
      isNonWorkingDay,
    });

    if (savePlan.error) {
      setValidationState({
        dateKey: selectedDateKey,
        message: savePlan.error,
      });
      return;
    }

    if (savePlan.confirmMessage && !window.confirm(savePlan.confirmMessage)) {
      return;
    }

    await savePerSalonSchedule(savePlan.updates);
  };

  const restoreWorkingDate = async (dateKey) => {
    if (
      !currentUserId ||
      !activeSalonId ||
      isPerSalonLoading ||
      saveRequestRef.current > 0
    ) {
      return;
    }
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
    if (
      !currentUserId ||
      !activeSalonId ||
      !canMarkDayOff ||
      isPerSalonLoading ||
      saveRequestRef.current > 0
    ) {
      return;
    }
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
    if (
      !currentUserId ||
      !activeSalonId ||
      isPerSalonLoading ||
      saveRequestRef.current > 0
    ) {
      return;
    }
    if (!window.confirm("Remove this date override?")) return;

    const nextOverrides = { ...scheduleOverrides };
    delete nextOverrides[dateKey];

    await savePerSalonSchedule({
      scheduleOverrides: nextOverrides,
      nonWorkingDays: nonWorkingDays.filter((day) => day !== dateKey),
    });
  };

  const resetDraftToDefault = () => {
    setValidationState({ dateKey: selectedDateKey, message: "" });
    setSaveSuccess("");
    setDraftOverride(
      getResetDateOverrideDraft({
        selectedDateKey,
        defaultDaySchedule,
      })
    );
  };

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const handleSalonSelect = useCallback(
    (salonId) => {
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
    },
    [activeSalonId]
  );

  return {
    activeDraft,
    activeSalonId,
    approvedSalons,
    barberServices,
    canMarkDayOff,
    closeDrawer,
    currentDefaultSchedule,
    currentUserId,
    dateOptions,
    dateStatusMap,
    defaultDaySchedule,
    displayError,
    effectiveSchedule,
    fieldErrors,
    hasCustomHours,
    hasUnsavedDateChangesValue,
    isBreakEnabled,
    isDrawerOpen,
    isLoadingEffective,
    isLoadingSalons,
    isLoadingServices,
    isOnboardingStepLoading,
    isNonWorkingDay,
    isSaving,
    isScheduleEmpty,
    handleSalonSelect,
    markDayOff,
    nonWorkingDays,
    onboardingStep,
    openDrawer,
    removeOverride,
    restoreWorkingDate,
    resetDraftToDefault,
    saveSelectedDateSchedule,
    saveSuccess,
    selectedDateKey,
    selectedDateObject,
    selectedSalonEntry,
    selectDate,
    sortedNonWorkingDays,
    sortedOverrides,
    servicesError,
    timeInputClass,
    todayKey,
    toggleBreakTime,
    updateDraft,
    updateTimeDraft,
  };
}
