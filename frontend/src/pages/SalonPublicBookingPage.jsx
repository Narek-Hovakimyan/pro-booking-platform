import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Phone, Star, Store } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

import SalonBookingSteps from "./salon-public-booking/SalonBookingSteps";
import SalonBookingSuccess from "./salon-public-booking/SalonBookingSuccess";
import { useSalonBookingAvailability } from "./salon-public-booking/useSalonBookingAvailability";
import { useSalonBookingSubmission } from "./salon-public-booking/useSalonBookingSubmission";
import { useSalonPublicBookingData } from "./salon-public-booking/useSalonPublicBookingData";

export default function SalonPublicBookingPage() {
  const { salonId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.auth);
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

  const authRedirect = encodeURIComponent(`/salons/${salonId}/book`);
  const { salon, barbers, services, isLoading, error } =
    useSalonPublicBookingData(salonId);

  const availability = useSalonBookingAvailability({
    salonId,
    barbers,
    services,
    selectedBarber,
    selectedServiceId,
    selectedDate,
    selectedTime,
    setSelectedDate,
    setSelectedTime,
  });

  const submission = useSalonBookingSubmission({
    salonId,
    currentUser,
    selectedBarber,
    selectedService: availability.selectedService,
    selectedDate,
    selectedDateDayKey: availability.selectedDateDayKey,
    validSelectedTime: availability.validSelectedTime,
    client,
  });

  useEffect(() => {
    if (!selectedBarberIdIsValid(selectedBarber, barbers)) {
      const resetId = window.setTimeout(() => {
        setSelectedBarber(null);
        setSelectedServiceId(null);
        setSelectedDate("");
        setSelectedTime("");
      }, 0);

      return () => window.clearTimeout(resetId);
    }

    return undefined;
  }, [barbers, selectedBarber]);

  const handleSelectBarber = (barber) => {
    setSelectedBarber(barber);
    setSelectedServiceId(null);
    setSelectedDate("");
    setSelectedTime("");
    submission.resetPromoState();
  };

  const handleSelectService = (serviceId) => {
    setSelectedServiceId(serviceId);
    setSelectedDate("");
    setSelectedTime("");
    submission.resetPromoState();
  };

  const handleBookAgain = () => {
    submission.resetBookingFlow();
    setStep(1);
    setSelectedBarber(null);
    setSelectedServiceId(null);
    setSelectedDate("");
    setSelectedTime("");
    setClient({ name: "", phone: "", note: "" });
  };

  const handleConfirmBooking = async () => {
    const createdBooking = await submission.submitBooking();
    if (createdBooking) {
      setStep(0);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

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

  if (submission.bookingSuccess) {
    return (
      <SalonBookingSuccess
        salon={salon}
        bookingPayment={submission.bookingPayment}
        onViewBookings={() => navigate("/my-bookings")}
        onBookAgain={handleBookAgain}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
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

      <SalonBookingSteps
        salon={salon}
        step={step}
        setStep={setStep}
        selectedBarber={selectedBarber}
        selectedBarberId={availability.selectedBarberId}
        selectedBarberServices={availability.selectedBarberServices}
        barbers={barbers}
        services={services}
        selectedService={availability.selectedService}
        selectedServiceId={selectedServiceId}
        handleSelectBarber={handleSelectBarber}
        handleSelectService={handleSelectService}
        dateOptions={availability.dateOptions}
        selectedDate={selectedDate}
        selectedDateLabel={availability.selectedDateLabel}
        nonWorkingDays={availability.nonWorkingDays}
        selectDate={availability.selectDate}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        availableSlots={availability.availableSlots}
        scheduleLoading={availability.scheduleLoading}
        bookingsLoading={availability.bookingsLoading}
        availabilityError={availability.availabilityError}
        slotMessage={availability.slotMessage}
        validSelectedTime={availability.validSelectedTime}
        currentUser={currentUser}
        client={client}
        setClient={setClient}
        promoCode={submission.promoCode}
        setPromoCode={submission.setPromoCode}
        promoStatus={submission.promoStatus}
        validatedPromo={submission.validatedPromo}
        validatingPromo={submission.validatingPromo}
        onApplyPromo={submission.handleApplyPromo}
        onRemovePromo={submission.handleRemovePromo}
        submitError={submission.submitError}
        canConfirmBooking={submission.canConfirmBooking}
        confirmDisabledReason={submission.confirmDisabledReason}
        isSaving={submission.isSaving}
        onConfirm={handleConfirmBooking}
        onBackFromConfirm={() => setStep(3)}
        authRedirect={authRedirect}
      />
    </div>
  );
}

function selectedBarberIdIsValid(selectedBarber, barbers) {
  if (!selectedBarber) return true;

  const selectedBarberId = selectedBarber.id || selectedBarber._id;
  return (barbers || []).some(
    (barber) => String(barber.id || barber._id) === String(selectedBarberId)
  );
}
