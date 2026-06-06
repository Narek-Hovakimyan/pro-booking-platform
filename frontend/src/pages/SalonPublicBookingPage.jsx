import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapPin, Phone, Star, Store, UserRound, LogIn, CalendarDays, Scissors, X } from "lucide-react";


import { getPublicSalonBooking } from "@/shared/api/publicSalonBooking";
import api from "@/shared/api/axios";
import { getFriendlyApiError } from "@/shared/api/errors";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import EmptyState from "@/shared/components/common/EmptyState";
import { useBooking } from "@/shared/hooks/useBooking";
import { getMediaUrl } from "@/shared/utils/media";
import { formatDateKey, formatDateLabel, getDayKeyFromDate, getNext7Days, parseDateKey } from "@/shared/utils/dates";
import { calculateDepositEstimate } from "@/shared/utils/deposit";
import { getSalonSlotAvailabilitySummary } from "@/shared/utils/slots";
import { getServicePriceInfo } from "@/shared/data/serviceCategories";
import initialSchedule, { defaultPersonalSchedule, getDayScheduleFromDefaultSchedule } from "@/shared/data/schedule";
import { timeToMinutes } from "@/shared/utils/time";

const EMPTY_SLOT_SUMMARY = {
  availableSlots: [],
  blockedByTime: false,
  blockedByBooking: false,
};

const getMeaningfulWeeklyDay = (daySchedule) =>
  Boolean(daySchedule?.working) &&
  timeToMinutes(daySchedule.from) !== null &&
  timeToMinutes(daySchedule.to) !== null;

const getExplicitWeeklyDayOff = (daySchedule) =>
  daySchedule?.working === false
    ? {
        working: false,
        from: daySchedule.from || "",
        to: daySchedule.to || "",
        breakFrom: daySchedule.breakFrom || "",
        breakTo: daySchedule.breakTo || "",
      }
    : null;

export default function SalonPublicBookingPage() {
  const { salonId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.auth);
  const { createBooking } = useBooking();
  const authRedirect = encodeURIComponent(`/salons/${salonId}/book`);

  // Data from public endpoint
  const [salon, setSalon] = useState(null);
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Step: 1=barber select, 2=service select, 3=date/time, 4=confirm
  const [step, setStep] = useState(1);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [client, setClient] = useState(() => ({
    name: currentUser?.name || "",
    phone: currentUser?.phone || "",
    note: "",
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Schedule data (fetched per-barber)
  const [barberScheduleEntry, setBarberScheduleEntry] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [barberBookings, setBarberBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const dateOptions = useMemo(() => getNext7Days(), []);
  const todayKey = formatDateKey(new Date());
  const selectedBarberId = selectedBarber?.id || selectedBarber?._id;
  const selectedBarberServices = useMemo(() => {
    if (!selectedBarber) return [];

    if (Array.isArray(selectedBarber.services) && selectedBarber.services.length > 0) {
      return selectedBarber.services;
    }

    return (services || []).filter(
      (service) => String(service?.barberId) === String(selectedBarberId)
    );
  }, [selectedBarber, selectedBarberId, services]);

  // ── Combined handler to change barber and reset dependent state ──
  const handleSelectBarber = (barber) => {
    setSelectedBarber(barber);
    setSelectedServiceId(null);
    setSelectedDate("");
    setSelectedTime("");
    setPromoCode("");
    setValidatedPromo(null);
    setPromoStatus({ type: "", message: "" });
  };

  // ── Combined handler to change service and reset dependent state ──
  const handleSelectService = (serviceId) => {
    setSelectedServiceId(serviceId);
    setSelectedDate("");
    setSelectedTime("");
    setPromoCode("");
    setValidatedPromo(null);
    setPromoStatus({ type: "", message: "" });
  };

  // ── Load public salon booking data ──
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError("");

      try {
        const data = await getPublicSalonBooking(salonId);

        if (!isMounted) return;

        setSalon(data.salon || null);
        setBarbers(data.barbers || []);
        setServices(data.services || []);
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load salon booking data."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (salonId) {
      load();
    }

    return () => {
      isMounted = false;
    };
  }, [salonId]);

  // ── Fetch schedule when barber is selected ──
  useEffect(() => {
    if (!selectedBarber) {
      return;
    }

    let isMounted = true;

    async function loadAvailabilityData() {
      setScheduleLoading(true);
      setBookingsLoading(true);
      setBarberBookings([]);

      try {
        const barberId = selectedBarber.id || selectedBarber._id;
        const [scheduleResponse, bookingsResponse] = await Promise.all([
          api.get(`/schedules/${barberId}/${salonId}`),
          api.get(`/bookings/barber/${barberId}`),
        ]);

        if (!isMounted) return;

        setBarberScheduleEntry({
          weeklySchedule:
            scheduleResponse.data?.weeklySchedule || initialSchedule,
          dateSchedules: scheduleResponse.data?.dateSchedules || {},
          scheduleOverrides: scheduleResponse.data?.scheduleOverrides || {},
          defaultSchedule:
            scheduleResponse.data?.defaultSchedule || defaultPersonalSchedule,
          nonWorkingDays: scheduleResponse.data?.nonWorkingDays || [],
        });
        setBarberBookings(bookingsResponse.data || []);
      } catch {
        // If schedule can't be loaded, use defaults
        if (isMounted) {
          setBarberScheduleEntry({
            weeklySchedule: initialSchedule,
            dateSchedules: {},
            scheduleOverrides: {},
            defaultSchedule: defaultPersonalSchedule,
            nonWorkingDays: [],
          });
          setBarberBookings([]);
        }
      } finally {
        if (isMounted) {
          setScheduleLoading(false);
          setBookingsLoading(false);
        }
      }
    }

    loadAvailabilityData();

    return () => {
      isMounted = false;
    };
  }, [salonId, selectedBarber]);

  const selectedService = useMemo(() => {
    if (!selectedBarber || !selectedServiceId) return null;
    return selectedBarberServices.find(
      (s) => String(s.id || s._id) === String(selectedServiceId)
    );
  }, [selectedBarber, selectedBarberServices, selectedServiceId]);

  // ── Slot computation ──
  const nonWorkingDays = barberScheduleEntry?.nonWorkingDays || [];
  const barberWeeklySchedule = useMemo(
    () => barberScheduleEntry?.weeklySchedule || {},
    [barberScheduleEntry?.weeklySchedule]
  );
  const barberDefaultSchedule =
    barberScheduleEntry?.defaultSchedule || defaultPersonalSchedule;
  const barberScheduleOverrides = barberScheduleEntry?.scheduleOverrides || {};

  const selectedDateObject = parseDateKey(selectedDate);
  const selectedDateOption = selectedDateObject
    ? {
        date: selectedDateObject,
        value: selectedDate,
        dayKey: getDayKeyFromDate(selectedDateObject),
        label: formatDateLabel(selectedDateObject),
      }
    : null;
  const selectedDateLabel = selectedDateOption?.label || selectedDate || "";
  const selectedDateDayKey = selectedDateOption?.dayKey || "";

  const selectedOverride = barberScheduleOverrides[selectedDate];
  const selectedDaySchedule = useMemo(() => {
    if (selectedOverride) {
      return {
        working: Boolean(selectedOverride.isWorking),
        from: selectedOverride.startTime || "",
        to: selectedOverride.endTime || "",
        breakFrom: selectedOverride.breakStart || "",
        breakTo: selectedOverride.breakEnd || "",
      };
    }

    const weeklyDaySchedule = selectedDateDayKey
      ? barberWeeklySchedule[selectedDateDayKey]
      : null;
    const explicitWeeklyDayOff = getExplicitWeeklyDayOff(weeklyDaySchedule);

    if (explicitWeeklyDayOff) {
      return explicitWeeklyDayOff;
    }

    return getMeaningfulWeeklyDay(weeklyDaySchedule)
      ? weeklyDaySchedule
      : getDayScheduleFromDefaultSchedule(barberDefaultSchedule);
  }, [
    barberDefaultSchedule,
    barberWeeklySchedule,
    selectedDateDayKey,
    selectedOverride,
  ]);

  const isWeeklyDayOff = !selectedDaySchedule?.working;
  const isSelectedDateNonWorking = (nonWorkingDays || []).includes(selectedDate);

  const slotSummary = useMemo(() => {
    if (
      !selectedBarber ||
      !selectedService ||
      !selectedDate ||
      !selectedDateDayKey ||
      isSelectedDateNonWorking ||
      isWeeklyDayOff
    ) {
      return EMPTY_SLOT_SUMMARY;
    }

    // Use all bookings from Redux for this barber to prevent double-booking display
    return getSalonSlotAvailabilitySummary(
      selectedDaySchedule,
      selectedService?.duration || 20,
      barberBookings,
      selectedDateDayKey,
      { selectedDate }
    );
  }, [
    selectedBarber,
    selectedService,
    selectedDate,
    selectedDateDayKey,
    isSelectedDateNonWorking,
    isWeeklyDayOff,
    selectedDaySchedule,
    barberBookings,
  ]);

  const availableSlots = slotSummary.availableSlots;

  // Derive valid selected time from available slots (replaces useEffect for validation)
  const validSelectedTime =
    selectedTime && availableSlots.includes(selectedTime) ? selectedTime : "";

  const slotMessage = !selectedService
    ? "Select service first"
    : !selectedDate
      ? "Choose a date first"
      : isSelectedDateNonWorking || isWeeklyDayOff
        ? "Barber is not working this day"
        : slotSummary.blockedByTime
          ? "Not enough time for selected service"
          : slotSummary.blockedByBooking
            ? "This time is already booked"
            : "No available slots";

  // ── Select date ──
  const selectDate = (dateKey) => {
    const date = parseDateKey(dateKey);
    if (!date || dateKey < todayKey) return;

    setSelectedDate(dateKey);
    setSelectedTime("");
  };

  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState({ type: "", message: "" });
  const [validatedPromo, setValidatedPromo] = useState(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const selectedServicePriceInfo = getServicePriceInfo(selectedService);
  const publicPromoDiscount = Math.max(0, Number(validatedPromo?.discountAmount || 0));
  const publicFinalPrice = Math.max(
    0,
    Number(validatedPromo?.finalPrice ?? selectedServicePriceInfo.discountedPrice ?? 0)
  );
  const depositEstimate = calculateDepositEstimate(
    selectedBarber?.depositSettings,
    publicFinalPrice
  );

  // ── Promo code validation ──
  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setValidatingPromo(true);
    setPromoStatus({ type: "", message: "" });
    try {
      const res = await api.post(`/salons/${salonId}/promotions/validate`, {
        code,
        serviceId: selectedService?.id || selectedService?._id,
        barberId: selectedBarber?.id || selectedBarber?._id,
      });
      if (res.data.valid) {
        setValidatedPromo(res.data);
        setPromoStatus({ type: "success", message: `${res.data.promotion.title} applied! ${res.data.discountAmount > 0 ? `Save ${Number(res.data.discountAmount).toLocaleString()} դր.` : ""}` });
      }
    } catch (err) {
      setValidatedPromo(null);
      setPromoStatus({ type: "error", message: err.response?.data?.message || "Invalid promo code" });
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode("");
    setValidatedPromo(null);
    setPromoStatus({ type: "", message: "" });
  };

  // ── Submit booking ──
  const submitBooking = async () => {
    if (
      isSaving ||
      !currentUser ||
      !selectedBarber ||
      !selectedService ||
      !selectedDate ||
      !selectedDateDayKey ||
      !validSelectedTime
    ) {
      return;
    }

    setIsSaving(true);
    setSubmitError("");

    try {
      const barberId = selectedBarber.id || selectedBarber._id;
      const serviceEntityId = selectedService.id || selectedService._id;

      const bookingPayload = {
        barberId,
        clientId: currentUser.id || currentUser._id,
        serviceId: serviceEntityId,
        serviceName: selectedService.name,
        price: selectedService.price,
        duration: selectedService?.duration || 20,
        dayKey: selectedDateDayKey,
        bookingDate: selectedDate,
        time: validSelectedTime,
        status: "pending",
        clientName: client.name,
        phone: client.phone,
        note: client.note,
        salonId,
      };

      if (validatedPromo) {
        bookingPayload.promotionCode = validatedPromo.promotion?.code;
      }

      await createBooking(bookingPayload);

      setBookingSuccess(true);
      setStep(0);
    } catch (requestError) {
      setSubmitError(
        getFriendlyApiError(
          requestError,
          "Could not create booking. Please try again."
        )
      );
    } finally {
      setIsSaving(false);
    }
  };

  const canConfirmBooking = Boolean(
    currentUser &&
      (selectedBarber?.id || selectedBarber?._id) &&
      selectedService &&
      selectedDate &&
      selectedDateDayKey &&
      validSelectedTime &&
      client.name &&
      client.phone &&
      !isSaving
  );

  // ── Loading state ──

  if (isLoading) {

    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  // ── Error state ──
  if (error || !salon) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Salon not found."}
        </p>
        <Button onClick={() => navigate(-1)} variant="outline">
          Go back
        </Button>
      </div>
    );
  }

  // ── Success state ──
  if (bookingSuccess) {
    return (
      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Booking request sent!</h2>
          <p className="text-neutral-500">
            Your booking at <strong>{salon.name}</strong> has been submitted. The barber will confirm shortly.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate("/my-bookings")}>
              View my bookings
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBookingSuccess(false);
                setStep(1);
                setSelectedBarber(null);
                setSelectedServiceId(null);
                setSelectedDate("");
                setSelectedTime("");
                setClient({ name: "", phone: "", note: "" });
              }}
            >
              Book again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Salon Profile ── */}
      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="shrink-0">
              {salon.imageUrl ? (
                <img
                  alt={salon.name}
                  className="h-28 w-28 rounded-2xl object-cover sm:h-32 sm:w-32"
                  src={getMediaUrl(salon.imageUrl)}
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-neutral-100 sm:h-32 sm:w-32">
                  <Store className="h-10 w-10 text-neutral-400" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="text-xl font-bold sm:text-2xl">{salon.name}</h1>
              {(salon.city || salon.address) && (
                <p className="flex items-center gap-2 text-sm text-neutral-500">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>
                    {salon.city}
                    {salon.city && salon.address ? ", " : ""}
                    {salon.address}
                  </span>
                </p>
              )}
              {salon.phone && (
                <p className="flex items-center gap-2 text-sm text-neutral-500">
                  <Phone className="h-4 w-4 shrink-0" />
                  {salon.phone}
                </p>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                {salon.averageRating > 0
                  ? `${Number(salon.averageRating).toFixed(1)} (${salon.totalReviews || 0} reviews)`
                  : "No reviews yet"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Step Indicator ── */}
      {step > 0 && step <= 4 && (
        <div className="flex items-center gap-1 sm:gap-2">
          {[
            { num: 1, label: "Barber" },
            { num: 2, label: "Service" },
            { num: 3, label: "Date & Time" },
            { num: 4, label: "Confirm" },
          ].map((s, i) => {
            const isDone = step > s.num;
            const isActive = step === s.num;
            return (
              <div key={s.num} className="flex items-center gap-1 sm:gap-2">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition sm:h-8 sm:w-8 sm:text-sm ${
                    isDone
                      ? "bg-neutral-900 text-white"
                      : isActive
                        ? "bg-neutral-900 text-white ring-2 ring-neutral-900/20"
                        : "bg-neutral-100 text-neutral-400"
                  }`}
                >
                  {isDone ? "\u2713" : s.num}
                </div>
                <span
                  className={`hidden text-xs font-medium sm:inline ${
                    isActive ? "text-neutral-900" : "text-neutral-400"
                  }`}
                >
                  {s.label}
                </span>
                {i < 3 && (
                  <div
                    className={`mx-0.5 h-px w-3 sm:mx-1 sm:w-6 ${
                      step > s.num ? "bg-neutral-900" : "bg-neutral-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Step 1: Select Barber ── */}
      {step === 1 && (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Choose a specialist</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Select one of our specialists to get started.
              </p>
            </div>

            {barbers.length === 0 ? (
              <EmptyState
                description="No specialists are available for booking at this salon right now."
                title="No specialists available"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {barbers.map((barber) => {
                  const barberId = barber.id || barber._id;
                  const barberServices = Array.isArray(barber.services) && barber.services.length > 0
                    ? barber.services
                    : (services || []).filter(
                        (service) => String(service?.barberId) === String(barberId)
                      );
                  const isSelected = String(selectedBarberId) === String(barberId);
                  return (
                    <button
                      key={barberId}
                      onClick={() => handleSelectBarber(barber)}
                      className={`relative w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white ring-2 ring-neutral-900/20"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-neutral-900">
                          \u2713
                        </span>
                      )}
                      <div className="flex items-center gap-3">
                        {barber.avatarUrl ? (
                          <img
                            alt={barber.name}
                            className="h-12 w-12 rounded-full object-cover"
                            src={getMediaUrl(barber.avatarUrl)}
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                            <UserRound className="h-6 w-6 text-neutral-400" />
                          </div>
                        )}
                        <div>
                          <div className={`font-semibold ${isSelected ? "text-white" : "text-neutral-950"}`}>
                            {barber.name}
                          </div>
                          <div className={`text-sm ${isSelected ? "text-neutral-300" : "text-neutral-500"}`}>
                            {barber.profession || barber.specialty || "Barber"}
                          </div>
                        </div>
                      </div>
                      {barber.firstAvailableSlot && (
                        <div
                          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                            isSelected
                              ? "bg-white/15 text-white"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          Next available today: {barber.firstAvailableSlot}
                        </div>
                      )}
                      {barberServices.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {barberServices.slice(0, 3).map((svc) => (
                            <span
                              key={svc.id || svc._id}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                isSelected
                                  ? "bg-white/20 text-white"
                                  : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {svc.name}
                            </span>
                          ))}
                          {barberServices.length > 3 && (
                            <span className={`text-xs ${isSelected ? "text-neutral-300" : "text-neutral-400"}`}>
                              +{barberServices.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="w-full sm:w-auto"
                disabled={!selectedBarber}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Select Service ── */}
      {step === 2 && selectedBarber && (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Pick a service</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Choose a service from {selectedBarber.name}.
              </p>
            </div>

            {/* Selected barber summary */}
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200">
                <UserRound className="h-5 w-5 text-neutral-500" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-neutral-950">{selectedBarber.name}</div>
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
              >
                Change
              </button>
            </div>

            {selectedBarberServices.length === 0 ? (
              <EmptyState
                description="This specialist has no active services."
                title="No services available"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedBarberServices.map((svc) => {
                  const svcId = svc.id || svc._id;
                  const isSelected = String(selectedServiceId) === String(svcId);
                  const priceInfo = getServicePriceInfo(svc);
                  return (
                    <button
                      key={svcId}
                      onClick={() => handleSelectService(svcId)}
                      className={`relative w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white ring-2 ring-neutral-900/20"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-neutral-900">
                          \u2713
                        </span>
                      )}
                      <div className={`font-semibold ${isSelected ? "text-white" : "text-neutral-950"}`}>
                        {svc.name}
                      </div>
                      {(svc.type === "package" || priceInfo.hasDiscount) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {priceInfo.hasDiscount && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                              isSelected ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-700"
                            }`}>
                              {priceInfo.discountLabel}
                            </span>
                          )}
                          {svc.type === "package" && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              isSelected ? "bg-violet-500 text-white" : "bg-violet-100 text-violet-700"
                            }`}>
                              Package
                            </span>
                          )}
                        </div>
                      )}
                      <div className={`mt-1 text-sm ${isSelected ? "text-neutral-300" : "text-neutral-500"}`}>
                        {svc.duration || 20} min ·{" "}
                        <span className="inline-flex items-center gap-1.5">
                          {priceInfo.hasDiscount && (
                            <span className={`line-through ${isSelected ? "text-neutral-400" : "text-neutral-400"}`}>
                              {Number(priceInfo.originalPrice).toLocaleString()} դրամ
                            </span>
                          )}
                          <span className={`font-semibold ${isSelected ? "text-white" : "text-neutral-800"}`}>
                            {Number(priceInfo.discountedPrice).toLocaleString()} դրամ
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!selectedServiceId}
                onClick={() => {
                  setStep(3);
                }}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Select Date & Time ── */}
      {step === 3 && selectedBarber && selectedService && (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Choose date & time</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Pick a date and time for your appointment.
              </p>
            </div>

            {/* Selected service summary */}
            <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <Scissors className="h-4 w-4" />
                  <span className="font-medium text-neutral-950">{selectedService.name}</span>
                </div>
                <div className="mt-1 text-sm text-neutral-500">
                  {selectedService.duration || 20} min
                </div>
              </div>
              <button
                onClick={() => setStep(2)}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
              >
                Change
              </button>
            </div>

            {/* Date selection */}
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Select date
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {dateOptions.map((day) => (
                  <div key={day.value} className="flex-1 sm:flex-none">
                    <Button
                      className="w-full"
                      variant={selectedDate === day.value ? "default" : "outline"}
                      onClick={() => selectDate(day.value)}
                    >
                      {day.label}
                    </Button>
                    {nonWorkingDays.includes(day.value) && (
                      <div className="mt-1 text-center text-xs text-neutral-500">
                        Day off
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Date picker fallback */}
            <label className="grid gap-2 text-sm font-semibold sm:max-w-xs">
              Or pick a custom date
              <input
                className="rounded-2xl border p-3 font-normal"
                min={todayKey}
                type="date"
                value={selectedDate}
                onChange={(event) => selectDate(event.target.value)}
              />
            </label>

            {/* Selected date/time display */}
            {selectedDate && validSelectedTime && (
              <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="font-semibold">Selected:</span>{" "}
                {selectedDateLabel} at {validSelectedTime}
              </div>
            )}

            {/* Time slots */}
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Available times
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {scheduleLoading ? (
                  <div className="col-span-full text-center text-sm text-neutral-500">
                    Loading available times...
                  </div>
                ) : bookingsLoading ? (
                  <div className="col-span-full text-center text-sm text-neutral-500">
                    Loading current bookings...
                  </div>
                ) : availableSlots.length > 0 ? (
                  availableSlots.map((time) => (
                    <Button
                      key={time}
                      variant={validSelectedTime === time ? "default" : "outline"}
                      onClick={() => setSelectedTime(time)}
                    >
                      {time}
                    </Button>
                  ))
                ) : (
                  <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center text-sm text-neutral-500">
                    {selectedDate && nonWorkingDays.includes(selectedDate)
                      ? "This is a non-working day — no slots available."
                      : slotMessage}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!validSelectedTime}
                onClick={() => setStep(4)}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Confirm Booking ── */}
      {step === 4 && selectedBarber && selectedService && validSelectedTime && (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Confirm booking</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {currentUser
                  ? "Fill in your details to confirm."
                  : "Please log in to confirm your booking."}
              </p>
            </div>

            {/* Booking summary */}
            <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 text-sm">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-neutral-500">Salon</span>
                <span className="font-semibold text-neutral-950">{salon.name}</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-neutral-500">Specialist</span>
                <span className="font-semibold text-neutral-950">{selectedBarber.name}</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-neutral-500">Service</span>
                <span className="font-semibold text-neutral-950">{selectedService.name}</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-neutral-500">Duration</span>
                <span className="font-semibold text-neutral-950">{selectedService.duration || 20} min</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-neutral-500">Date</span>
                <span className="font-semibold text-neutral-950">{selectedDateLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-neutral-500">Time</span>
                <span className="font-semibold text-neutral-950">{validSelectedTime}</span>
              </div>
              {(selectedServicePriceInfo.hasDiscount || publicPromoDiscount > 0) && (
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="text-neutral-500">Original price</span>
                  <span className="font-semibold text-neutral-950">
                    {Number(selectedServicePriceInfo.originalPrice || 0).toLocaleString()} դրամ
                  </span>
                </div>
              )}
              {selectedServicePriceInfo.hasDiscount && (
                <div className="flex items-center justify-between gap-4 bg-rose-50 px-4 py-2 text-rose-800">
                  <span className="font-medium">Service discount</span>
                  <span className="font-semibold">
                    -{Number(selectedServicePriceInfo.serviceDiscountAmount || 0).toLocaleString()} դր
                  </span>
                </div>
              )}
              {publicPromoDiscount > 0 && (
                <div className="flex items-center justify-between gap-4 bg-amber-50 px-4 py-2 text-amber-800">
                  <span className="font-medium">
                    Promo code discount ({validatedPromo?.promotion?.code})
                  </span>
                  <span className="font-semibold">
                    -{publicPromoDiscount.toLocaleString()} դր
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 rounded-b-2xl bg-neutral-900 px-4 py-3 text-white">
                <span className="font-medium">
                  {depositEstimate.depositRequired ? "Final price" : "Price"}
                </span>
                <span className="text-lg font-bold">
                  {publicFinalPrice.toLocaleString()} դրամ
                </span>
              </div>
            </div>

            {depositEstimate.depositRequired && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">Deposit due</span>
                  <span className="font-bold">
                    {depositEstimate.depositAmount.toLocaleString()} դրամ
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 text-amber-800">
                  <span>Remaining due at appointment</span>
                  <span className="font-semibold">
                    {depositEstimate.remainingDue.toLocaleString()} դրամ
                  </span>
                </div>
                {selectedBarber?.depositSettings?.noShowPolicyText && (
                  <p className="mt-3 text-xs leading-relaxed text-amber-800">
                    {selectedBarber.depositSettings.noShowPolicyText}
                  </p>
                )}
              </div>
            )}

            {/* ── Promo code ── */}
            <div className="rounded-2xl border border-neutral-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-600 mb-2">
                Promo code
              </div>
              {validatedPromo ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <div>
                    <span className="font-semibold text-emerald-800">
                      {validatedPromo.promotion?.code}
                    </span>
                    <span className="ml-2 text-emerald-600">
                      — {validatedPromo.promotion?.title}
                    </span>
                  </div>
                  <button
                    onClick={handleRemovePromo}
                    className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    className="flex-1 rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                    placeholder="Enter promo code"
                    maxLength={20}
                  />
                  <button
                    onClick={handleApplyPromo}
                    disabled={validatingPromo || !promoCode.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {validatingPromo ? "..." : "Apply"}
                  </button>
                </div>
              )}
              {promoStatus.message && (
                <p className={`mt-2 text-sm ${promoStatus.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
                  {promoStatus.message}
                </p>
              )}
            </div>

            {currentUser ? (
              <>
                {/* Client details form */}
                <label className="grid gap-1.5 text-sm font-semibold">
                  <span>Name <span className="text-red-500">*</span></span>
                  <input
                    className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                    placeholder="Your name"
                    value={client.name}
                    onChange={(e) => setClient({ ...client, name: e.target.value })}
                  />
                </label>


                <label className="grid gap-1.5 text-sm font-semibold">
                  <span>Phone <span className="text-red-500">*</span></span>
                  <input
                    className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                    placeholder="+374 XX XXX XXX"
                    value={client.phone}
                    onChange={(e) => setClient({ ...client, phone: e.target.value })}
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-semibold">
                  <span className="text-neutral-600">Note (optional)</span>
                  <textarea
                    className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                    placeholder="Any special requests..."
                    rows={3}
                    value={client.note}
                    onChange={(e) => setClient({ ...client, note: e.target.value })}
                  />
                </label>

                {submitError && (
                  <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {submitError}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(3)}>
                    Back
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={!canConfirmBooking}
                    onClick={submitBooking}
                  >
                    {isSaving ? "Booking..." : "Confirm booking"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <LogIn className="mr-2 inline-block h-4 w-4" />
                  You need to log in or register before confirming this booking.
                </p>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    as={Link}
                    to={`/login?redirect=${authRedirect}`}
                    className="w-full sm:w-auto"
                  >
                    Log in
                  </Button>
                  <Button
                    as={Link}
                    to={`/register?redirect=${authRedirect}`}
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    Register
                  </Button>
                  <Button variant="outline" onClick={() => setStep(3)} className="w-full sm:w-auto">
                    Back
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
