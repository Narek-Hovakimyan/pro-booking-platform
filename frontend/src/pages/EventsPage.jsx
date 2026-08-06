import { Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import AttendanceModal from "@/features/events/components/AttendanceModal";
import CertificateIssueModal from "@/features/events/components/CertificateIssueModal";
import CertificateRevokeModal from "@/features/events/components/CertificateRevokeModal";
import CreateEventModal from "@/features/events/components/CreateEventModal";
import EventCard from "@/features/events/components/EventCard";
import EventDetailModal from "@/features/events/components/EventDetailModal";
import EventFiltersDrawer from "@/features/events/components/EventFiltersDrawer";
import RejectRegistrationModal from "@/features/events/components/RejectRegistrationModal";
import { useCreateEventForm } from "@/hooks/useCreateEventForm";
import { useEventAttendance } from "@/hooks/useEventAttendance";
import { useEventCertificates } from "@/hooks/useEventCertificates";
import { useEventRegistrationActions } from "@/hooks/useEventRegistrationActions";
import { useEventsPageData } from "@/hooks/useEventsPageData";

export default function EventsPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?._id || currentUser?.id || "";
  const navigate = useNavigate();
  const isBarber = currentUser?.role === "barber";
  const selectedEventSyncRef = useRef(null);

  const eventsData = useEventsPageData({
    currentUserId,
    selectedEventSyncRef,
  });
  const isFilterDrawerOpen = eventsData.isFilterDrawerOpen;
  const setIsFilterDrawerOpen = eventsData.setIsFilterDrawerOpen;
  const registrationActions = useEventRegistrationActions({
    canManageEvent: eventsData.canManageEvent,
    currentUser,
    myRegistrationsByEventId: eventsData.myRegistrationsByEventId,
    refreshMyRegistrations: eventsData.refreshMyRegistrations,
    syncEventRegistrationCount: eventsData.syncEventRegistrationCount,
  });
  const { setSelectedEvent } = registrationActions;
  const attendance = useEventAttendance({
    selectedEvent: registrationActions.selectedEvent,
  });
  const certificates = useEventCertificates({
    fetchEventRegistrations: registrationActions.fetchEventRegistrations,
    selectedEvent: registrationActions.selectedEvent,
    setIsUpdatingRegistration: registrationActions.setIsUpdatingRegistration,
    setRegistrationMessage: registrationActions.setRegistrationMessage,
  });
  const createEvent = useCreateEventForm({
    manageableSalons: eventsData.myOwnedSalons,
    refreshEvents: eventsData.refreshEvents,
  });
  useEffect(() => {
    selectedEventSyncRef.current = (eventId, registrationCount) => {
      setSelectedEvent((prev) =>
        prev && prev._id === eventId ? { ...prev, registrationCount } : prev
      );
    };
  }, [setSelectedEvent]);

  useEffect(() => {
    if (!isFilterDrawerOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsFilterDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isFilterDrawerOpen, setIsFilterDrawerOpen]);

  const canManageSelectedEvent = eventsData.canManageEvent(
    registrationActions.selectedEvent
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Events & Seminars</h1>
        <div className="flex gap-2">
          <Button
            className="relative"
            onClick={() => setIsFilterDrawerOpen(true)}
            variant="outline"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {eventsData.activeFiltersCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                {eventsData.activeFiltersCount}
              </span>
            )}
          </Button>
          {eventsData.hasActiveFilters && (
            <Button onClick={eventsData.resetFilters} variant="outline">
              Clear Filters
            </Button>
          )}
          {eventsData.canCreateEvents && (
            <Button onClick={createEvent.openCreateModal}>
              <Plus className="mr-2 h-4 w-4" />
              Create Event
            </Button>
          )}
          {isBarber && (
            <Button variant="outline" onClick={() => navigate("/my-events")}>
              My Events
            </Button>
          )}
        </div>
      </div>

      <EventFiltersDrawer
        activeFiltersCount={eventsData.activeFiltersCount}
        filterChips={eventsData.filterChips}
        filterPrice={eventsData.filterPrice}
        filterSalonId={eventsData.filterSalonId}
        filterType={eventsData.filterType}
        isOpen={isFilterDrawerOpen}
        onApply={() => setIsFilterDrawerOpen(false)}
        onClear={eventsData.resetFilters}
        onClose={() => setIsFilterDrawerOpen(false)}
        salons={eventsData.salons}
        search={eventsData.search}
        setFilterPrice={eventsData.setFilterPrice}
        setFilterSalonId={eventsData.setFilterSalonId}
        setFilterType={eventsData.setFilterType}
        setSearch={eventsData.setSearch}
      />

      {eventsData.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {eventsData.error}
        </p>
      )}

      {eventsData.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
                <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
                <div className="mt-4 h-10 w-full animate-pulse rounded-xl bg-neutral-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!eventsData.isLoading && eventsData.filteredEvents.length === 0 && (
        <EmptyState
          description={
            eventsData.hasActiveFilters ? "No events match your filters" : "No events yet"
          }
          title="No upcoming events"
        />
      )}

      {!eventsData.isLoading && eventsData.filteredEvents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventsData.filteredEvents.map((event) => (
            <EventCard
              canManage={eventsData.canManageEvent(event)}
              currentUser={currentUser}
              currentUserId={currentUserId}
              event={event}
              key={event._id}
              onOpen={registrationActions.openDetail}
              onRegister={registrationActions.handleRegister}
              onUnregister={registrationActions.handleUnregister}
              registeringEventId={registrationActions.registeringEventId}
              registration={
                eventsData.myRegistrationsByEventId.get(String(event._id)) || null
              }
            />
          ))}
        </div>
      )}

      <EventDetailModal
        canManage={canManageSelectedEvent}
        currentUser={currentUser}
        currentUserId={currentUserId}
        event={registrationActions.selectedEvent}
        eventEnded={registrationActions.selectedEventEnded}
        eventRegistrations={registrationActions.eventRegistrations}
        groupedRegistrations={registrationActions.groupedEventRegistrations}
        hasCertificates={registrationActions.selectedEventHasCertificates}
        isDetailLoading={registrationActions.isDetailLoading}
        isRegistrationsLoading={registrationActions.isRegistrationsLoading}
        isUpdatingRegistration={registrationActions.isUpdatingRegistration}
        onApprove={registrationActions.handleApproveRegistration}
        onCheckIn={registrationActions.handleCheckInRegistration}
        onClose={registrationActions.closeDetailModal}
        onIssueCertificate={certificates.openCertificateModal}
        onManageAttendance={attendance.openAttendanceModal}
        onMoveToWaitlist={registrationActions.handleWaitlistRegistration}
        onReject={registrationActions.openRejectRegistrationModal}
        onRegister={registrationActions.handleRegister}
        onRevokeCertificate={certificates.openRevokeCertificateModal}
        onUnregister={registrationActions.handleUnregister}
        pendingCount={registrationActions.pendingRegistrationRequests.length}
        registration={registrationActions.selectedEventRegistration}
        registrationMessage={registrationActions.registrationMessage}
        registrationStatus={registrationActions.selectedEventRegistrationStatus}
        rejectionReason={registrationActions.selectedEventRejectionReason}
        registeringEventId={registrationActions.registeringEventId}
        selectedEvent={registrationActions.selectedEvent}
      />

      <RejectRegistrationModal
        isOpen={registrationActions.showRejectModal}
        registrationToReject={registrationActions.registrationToReject}
        rejectionReason={registrationActions.rejectionReason}
        setRejectionReason={registrationActions.setRejectionReason}
        isUpdatingRegistration={registrationActions.isUpdatingRegistration}
        onClose={registrationActions.closeRejectRegistrationModal}
        onSubmit={registrationActions.handleRejectRegistration}
      />

      <CertificateRevokeModal
        certificateId={certificates.revokingCertificate?.certificateId}
        isOpen={Boolean(certificates.revokingCertificate)}
        isSubmitting={registrationActions.isUpdatingRegistration}
        onClose={certificates.closeRevokeCertificateModal}
        onSubmit={certificates.handleRevokeCertificate}
        revokeReason={certificates.revokedReason}
        setRevokeReason={certificates.setRevokedReason}
      />

      <CertificateIssueModal
        certificateFile={certificates.certificateFile}
        certificateMode={certificates.certificateModal?.mode || "auto"}
        isOpen={Boolean(certificates.certificateModal)}
        isSubmitting={registrationActions.isUpdatingRegistration}
        onClose={certificates.closeCertificateModal}
        onFileChange={(event) => {
          const file = event.target.files?.[0];
          if (file) certificates.setCertificateFile(file);
        }}
        onSubmit={certificates.handleIssueCertificateUpload}
        setCertificateMode={certificates.setCertificateMode}
      />

      <AttendanceModal
        attendanceMessage={attendance.attendanceMessage}
        attendanceRegistrations={attendance.attendanceRegistrations}
        certificatesMessage={attendance.certificatesMessage}
        isAttendanceLoading={attendance.isAttendanceLoading}
        isOpen={attendance.showAttendanceModal}
        isSavingAttendance={attendance.isSavingAttendance}
        onAttendanceChange={attendance.handleAttendanceChange}
        onClose={attendance.closeAttendanceModal}
        onSaveAttendance={attendance.handleSaveAttendance}
        selectedEvent={registrationActions.selectedEvent}
      />

      <CreateEventModal
        eventForm={createEvent.createForm}
        imagePreview={createEvent.eventImagePreview}
        isOpen={createEvent.showCreateModal}
        isSubmitting={createEvent.isCreating}
        manageableSalons={eventsData.myOwnedSalons}
        onClose={createEvent.closeCreateModal}
        onFieldChange={createEvent.handleCreateField}
        onFileChange={createEvent.handleEventImageChange}
        onSalonSelect={createEvent.selectCreateSalon}
        onSubmit={createEvent.handleCreateEvent}
        validationErrors={createEvent.createError}
      />
    </div>
  );
}
