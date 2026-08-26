import { useNavigate } from "react-router-dom";

import BookingCard from "@/client/components/BookingCard";
import MyBookingsHeader from "@/client/components/bookings/MyBookingsHeader";
import MyBookingsModals from "@/client/components/bookings/MyBookingsModals";
import MyBookingsSections from "@/client/components/bookings/MyBookingsSections";
import NextBookingSection from "@/client/components/bookings/NextBookingSection";
import LoyaltyBanner from "@/client/components/LoyaltyBanner";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatCurrency } from "@/platform/utils/billingFormatters";
import { Container } from "@/shared/components/ui/Container";
import { canReviewSalonBooking, hasSalonReviewForBooking, isBookingReviewed } from "@/client/utils/bookingReviewUtils";
import { getBookingBarberId, getBookingDate, getBookingId, getBookingTime, getEntityId, getUpcomingStatusClass, getUpcomingStatusLabel } from "@/client/utils/bookingStatusUtils";
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
      groupedHistoryBookings={data.groupedHistoryBookings} historyBookings={data.historyBookings} initialLoading={initialLoading} renderBookingCard={renderBookingCard} view={view} />
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
