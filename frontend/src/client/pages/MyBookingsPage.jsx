import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import BookingCard from "@/client/components/BookingCard";
import MyBookingsHeader from "@/client/components/bookings/MyBookingsHeader";
import BookingHistoryFilters from "@/client/components/bookings/BookingHistoryFilters";
import MyBookingsModals from "@/client/components/bookings/MyBookingsModals";
import MyBookingsSections from "@/client/components/bookings/MyBookingsSections";
import NextBookingSection from "@/client/components/bookings/NextBookingSection";
import LoyaltyBanner from "@/client/components/LoyaltyBanner";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatCurrency } from "@/platform/utils/billingFormatters";
import { Container } from "@/shared/components/ui/Container";
import { canReviewSalonBooking, hasSalonReviewForBooking, isBookingReviewed } from "@/client/utils/bookingReviewUtils";
import { getBookingBarberId, getBookingDate, getBookingId, getBookingSalonId, getBookingTime, getEntityId, getUpcomingStatusClass, getUpcomingStatusLabel } from "@/client/utils/bookingStatusUtils";
import useClientBookingActions from "@/client/hooks/useClientBookingActions";
import useClientBookingsData from "@/client/hooks/useClientBookingsData";

export default function MyBookingsPage({ view = "active" }) {
  const navigate = useNavigate();
  const data = useClientBookingsData();
  const actions = useClientBookingActions({
    currentUser: data.currentUser,
    navigate,
    refreshBookings: data.refreshBookings,
    setError: data.setError,
    getBarberForBooking: data.getBarberForBooking,
    getSalonForBooking: data.getSalonForBooking,
    addSalonReview: data.addSalonReview,
  });
  const isHistoryView = view === "history";
  const [historyFilters, setHistoryFilters] = useState({ fromDate: "", toDate: "", status: "", specialistId: "", salonId: "" });
  const initialLoading = data.isLoading && data.myBookings.length === 0;
  const getServiceName = (booking) => {
    const service = booking?.service;
    return (service && typeof service === "object" ? service.name : "") || booking?.serviceName || "Service";
  };
  const getServiceDuration = (booking) => {
    const service = booking?.service;
    return service && typeof service === "object" && service.duration !== undefined ? service.duration : booking?.duration;
  };
  const getSalonName = (booking) => data.getSalonForBooking(booking)?.name || "";
  const getBarberName = (booking) => data.getBarberForBooking(booking)?.name || "Specialist";
  const renderBarberName = (booking) => {
    const barber = data.getBarberForBooking(booking);
    const barberId = getBookingBarberId(booking) || getEntityId(barber);
    const name = barber?.name || "Specialist";
    if (!barberId) return name;
    return <button className="cursor-pointer font-semibold text-neutral-900 hover:underline" onClick={() => actions.openBarberProfile(booking)} type="button">{name}</button>;
  };
  const specialistOptions = useMemo(() => {
    const options = new Map();
    data.historyBookings.forEach((booking) => {
      const id = getBookingBarberId(booking);
      if (id) options.set(String(id), data.getBarberForBooking(booking)?.name || "Specialist");
    });
    return [...options].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.historyBookings, data.getBarberForBooking]);
  const salonOptions = useMemo(() => {
    const options = new Map();
    data.historyBookings.forEach((booking) => {
      const id = getBookingSalonId(booking);
      if (id) options.set(String(id), getSalonName(booking) || "Salon");
    });
    return [...options].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.historyBookings, data.getSalonForBooking]);
  const filteredHistoryBookings = useMemo(() => data.historyBookings.filter((booking) => {
    const date = getBookingDate(booking);
    if (historyFilters.fromDate && (!date || date < historyFilters.fromDate)) return false;
    if (historyFilters.toDate && (!date || date > historyFilters.toDate)) return false;
    if (historyFilters.status === "confirmed" && !["accepted", "confirmed"].includes(booking?.status)) return false;
    if (historyFilters.status && historyFilters.status !== "confirmed" && booking?.status !== historyFilters.status) return false;
    if (historyFilters.specialistId && String(getBookingBarberId(booking)) !== historyFilters.specialistId) return false;
    if (historyFilters.salonId && String(getBookingSalonId(booking)) !== historyFilters.salonId) return false;
    return true;
  }), [data.historyBookings, historyFilters]);
  const filteredGroupedHistoryBookings = useMemo(() => data.groupedHistoryBookings.map((group) => ({
    ...group,
    bookings: group.bookings.filter((booking) => filteredHistoryBookings.includes(booking)),
  })), [data.groupedHistoryBookings, filteredHistoryBookings]);
  const hasHistoryFilters = Object.values(historyFilters).some(Boolean);
  const updateHistoryFilter = (field, value) => setHistoryFilters((current) => ({ ...current, [field]: value }));
  const renderBookingCard = (booking, section) => {
    const price = booking?.finalPrice ?? booking?.price;
    return <BookingCard
      key={getBookingId(booking)}
      barberId={getBookingBarberId(booking)} barberName={renderBarberName(booking)} booking={booking}
      bookingDate={getBookingDate(booking)} bookingId={getBookingId(booking)} bookingTime={getBookingTime(booking)}
      canCancel={actions.canChangeBooking(booking)} canDelay={actions.canDelayClientBooking(booking)}
      canReviewSalon={canReviewSalonBooking(booking)} duration={getServiceDuration(booking)} isActive={section === "active"}
      isBookAgainEligible={actions.isBookAgainEligible(booking)} isBarberReviewed={isBookingReviewed(booking, data.reviews)}
      isSalonReviewed={hasSalonReviewForBooking(data.salonReviews, booking)} onBookAgain={actions.startBookAgain}
      onCancel={actions.openCancelBookingModal} onDetails={actions.openBookingDetailsModal} onDelay={actions.openDelayBookingModal}
      onMessage={actions.messageBarber} onReschedule={actions.setReschedulingBooking}
      onReviewBarber={(next) => { actions.setReviewError(""); actions.setReviewingBooking(next); }}
      onReviewSalon={(next) => { actions.setReviewError(""); actions.setReviewingSalonBooking(next); }}
      price={price === undefined || price === null || price === "" ? "" : formatCurrency(price)} salonName={getSalonName(booking)} serviceName={getServiceName(booking)}
    />;
  };

  return <Container size="wide"><div className="space-y-6 sm:space-y-8">
    <MyBookingsHeader error={data.error} view={view} />
    {!isHistoryView && <LoyaltyBanner />}
    {!isHistoryView && <Card className="rounded-2xl sm:rounded-3xl"><CardContent className="space-y-4 p-4 sm:p-6">
      <NextBookingSection barberId={data.nextBooking ? getBookingBarberId(data.nextBooking) : ""} barberName={getBarberName(data.nextBooking)}
        bookingDate={getBookingDate(data.nextBooking)} bookingTime={getBookingTime(data.nextBooking)} canCancel={actions.canChangeBooking(data.nextBooking)}
        canDelay={actions.canDelayClientBooking(data.nextBooking)} nextBooking={data.nextBooking} salonName={getSalonName(data.nextBooking)}
        serviceName={getServiceName(data.nextBooking)} statusClass={getUpcomingStatusClass(data.nextBooking?.status)} statusLabel={getUpcomingStatusLabel(data.nextBooking?.status)}
        onCancel={() => actions.openCancelBookingModal(data.nextBooking)} onDelay={() => actions.openDelayBookingModal(data.nextBooking)}
        onFindBarber={() => navigate("/specialists")} onMessage={actions.messageBarber} onViewDetails={() => actions.openBookingDetailsModal(data.nextBooking)} />
    </CardContent></Card>}
    <MyBookingsSections activeBookings={data.visibleActiveBookings} groupedActiveBookings={data.groupedActiveBookings}
      groupedHistoryBookings={filteredGroupedHistoryBookings} historyBookings={filteredHistoryBookings} initialLoading={initialLoading} renderBookingCard={renderBookingCard} view={view}
      historyEmptyText={hasHistoryFilters ? "No booking history matches these filters" : "No booking history yet"}
      historyFilters={isHistoryView && <BookingHistoryFilters filters={historyFilters} specialistOptions={specialistOptions} salonOptions={salonOptions} onChange={updateHistoryFilter} onReset={() => setHistoryFilters({ fromDate: "", toDate: "", status: "", specialistId: "", salonId: "" })} />} />
    <MyBookingsModals cancelError={actions.cancelError} cancellingBooking={actions.cancellingBooking} closeBookingDetailsModal={actions.closeBookingDetailsModal}
      createReview={actions.createReview} createSalonReview={actions.createSalonReview} delayError={actions.delayError} delayingBooking={actions.delayingBooking}
      getBarberForBooking={data.getBarberForBooking} getSalonName={getSalonName} isCancelSubmitting={actions.isCancelSubmitting} isDelaySubmitting={actions.isDelaySubmitting}
      isReviewSubmitting={actions.isReviewSubmitting} messageBarber={actions.messageBarber} openCancelBookingModal={actions.openCancelBookingModal}
      reschedulingBooking={actions.reschedulingBooking} reviewError={actions.reviewError} reviewingBooking={actions.reviewingBooking} reviewingSalonBooking={actions.reviewingSalonBooking}
      selectedBookingForDetails={actions.selectedBookingForDetails} showBookingDetailsModal={actions.showBookingDetailsModal}
      onCloseCancel={() => actions.setCancellingBooking(null)} onCloseDelay={() => actions.setDelayingBooking(null)} onCloseReschedule={() => actions.setReschedulingBooking(null)}
      onCloseReview={() => actions.setReviewingBooking(null)} onCloseSalonReview={() => actions.setReviewingSalonBooking(null)} onSubmitCancel={actions.cancelClientBooking} onSubmitDelay={actions.delayClientBooking} />
  </div></Container>;
}
