import { Calendar, Clock, MapPin, X, Users } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import EventRegistrationManager from "@/features/events/components/EventRegistrationManager";
import {
  formatEventDate as formatDate,
  formatEventDuration as formatDuration,
  formatEventPrice as formatPrice,
  getEventDate,
  getEventImage,
  getEventLocation,
  getEventMaxParticipants,
  getEventOrganizerName,
  getEventRegistrationCount,
  getEventSalonName,
  getEventTime,
  getEventTitle,
  getEventTypeLabel,
  getEventVisibility,
  getRegistrationStatusClasses,
  getRegistrationStatusLabel,
} from "@/features/events/utils/eventFormatters";

export default function EventDetailModal({
  event,
  isDetailLoading,
  currentUser,
  currentUserId,
  registration,
  registrationStatus,
  rejectionReason: rejectionReasonProp,
  canManage,
  eventRegistrations,
  groupedRegistrations,
  isRegistrationsLoading,
  registrationMessage,
  isUpdatingRegistration,
  registeringEventId,
  pendingCount,
  hasCertificates,
  eventEnded,
  onClose,
  onRegister,
  onUnregister,
  onApprove,
  onReject,
  onMoveToWaitlist,
  onCheckIn,
  onIssueCertificate,
  onRevokeCertificate,
  onManageAttendance,
}) {
  if (!event) return null;

  const selectedEvent = event;
  const selectedEventRegistrationStatus = registrationStatus;
  const selectedEventRejectionReason = rejectionReasonProp;
  const selectedEventRegistration = registration;
  const canManageSelectedEvent = canManage;
  const selectedEventHasCertificates = hasCertificates;
  const selectedEventEnded = eventEnded;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">{getEventTitle(selectedEvent)}</h2>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                {getEventTypeLabel(selectedEvent)}
              </span>
              {getEventVisibility(selectedEvent) === "private" &&
                canManageSelectedEvent && (
                  <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Private
                  </span>
                )}
              {selectedEventHasCertificates && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  Certificates enabled
                </span>
              )}
            </div>
            {selectedEvent?.reviewsCount > 0 ? (
              <p className="mt-1 text-sm text-neutral-500">
                {Number(selectedEvent.averageRating || 0).toFixed(1)} average rating ·{" "}
                {selectedEvent.reviewsCount} reviews
              </p>
            ) : (
              <p className="mt-1 text-sm text-neutral-500">No event reviews yet</p>
            )}
          </div>
          <button
            className="rounded-full p-1 hover:bg-neutral-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isDetailLoading ? (
          <p className="mt-4 text-neutral-500">Loading details...</p>
        ) : (
          <>
            {getEventImage(selectedEvent) && (
              <img
                alt={getEventTitle(selectedEvent)}
                className="mt-4 h-48 w-full rounded-xl object-cover"
                loading="lazy"
                src={getEventImage(selectedEvent)}
              />
            )}

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-neutral-600">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(getEventDate(selectedEvent))}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-600">
                <Clock className="h-4 w-4" />
                <span>
                  {getEventTime(selectedEvent)} ·{" "}
                  {formatDuration(selectedEvent.duration)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-neutral-600">
                <MapPin className="h-4 w-4" />
                <span>{getEventLocation(selectedEvent)}</span>
              </div>
              {(getEventSalonName(selectedEvent) ||
                getEventOrganizerName(selectedEvent)) && (
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <span>
                    Organized by:{" "}
                    {getEventSalonName(selectedEvent) ||
                      getEventOrganizerName(selectedEvent)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-neutral-600">
                <Users className="h-4 w-4" />
                <span>
                  {getEventRegistrationCount(selectedEvent)} /{" "}
                  {getEventMaxParticipants(selectedEvent) || "?"} approved
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-neutral-50 p-4">
              <p className="font-semibold text-neutral-900">
                Instructor: {selectedEvent.instructor}
              </p>
              {selectedEvent.instructorBio && (
                <p className="mt-1 text-sm text-neutral-600">
                  {selectedEvent.instructorBio}
                </p>
              )}
            </div>

            {selectedEvent.description && (
              <div className="mt-4">
                <h3 className="font-semibold text-neutral-900">
                  About this event
                </h3>
                <p className="mt-1 text-sm text-neutral-600 whitespace-pre-wrap">
                  {selectedEvent.description}
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between rounded-xl border border-neutral-200 p-3">
              <span className="font-semibold">Price</span>
              <span className="text-lg font-bold">
                {formatPrice(selectedEvent.price)}
              </span>
            </div>

            {canManageSelectedEvent && (
              <div className="mt-3 rounded-xl border border-neutral-200 p-3 text-sm text-neutral-600">
                Certificates:{" "}
                <span className="font-semibold text-neutral-900">
                  {selectedEventHasCertificates ? "Enabled" : "Disabled"}
                </span>
              </div>
            )}

            {selectedEvent.registeredBarbers?.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold text-neutral-900">
                  Approved participants (
                  {selectedEvent.registeredBarbers.length})
                </h3>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                  {selectedEvent.registeredBarbers.map((barber) => (
                    <div
                      key={barber._id}
                      className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
                    >
                      {barber.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentUser && selectedEvent.status === "upcoming" && (
              <div className="mt-6">
                {/* Organizer cannot register */}
                {String(selectedEvent?.organizerId?._id || selectedEvent?.organizerId) ===
                  String(currentUserId) ? (
                  <Button className="w-full" disabled variant="outline">
                    You are the organizer
                  </Button>
                ) : (
                  <>
                    {selectedEventRegistrationStatus && (
                      <div
                        className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${getRegistrationStatusClasses(
                          selectedEventRegistrationStatus
                        )}`}
                      >
                        {getRegistrationStatusLabel(selectedEventRegistrationStatus)}
                    {selectedEventRegistrationStatus === "approved" && (
                            <span className="ml-1">You can participate.</span>
                          )}
                        {selectedEventRegistrationStatus === "waitlisted" && (
                            <span className="ml-1">You are on the waiting list.</span>
                          )}
                        {selectedEventRegistrationStatus === "rejected" &&
                          selectedEventRejectionReason && (
                            <span className="ml-1">
                              Reason: {selectedEventRegistration?.rejectionReason}
                            </span>
                          )}
                      </div>
                    )}
                    {selectedEventRegistrationStatus === "pending" ||
                    selectedEventRegistrationStatus === "waitlisted" ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => onUnregister(selectedEvent._id)}
                      >
                        {selectedEventRegistrationStatus === "pending"
                          ? "Cancel Request"
                          : "Leave Waiting List"}
                      </Button>
                    ) : selectedEventRegistrationStatus === "rejected" ? (
                      <Button className="w-full" disabled>
                        Request Closed
                      </Button>
                    ) : selectedEventRegistrationStatus === "approved" ? (
                      <Button className="w-full" disabled variant="outline">
                        Approved
                      </Button>
                    ) : selectedEvent.registrationCount >=
                      selectedEvent.maxParticipants ? (
                      <Button className="w-full" disabled>
                        Event is Full
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={registeringEventId === selectedEvent._id}
                        onClick={() => onRegister(selectedEvent._id)}
                      >
                        {registeringEventId === selectedEvent._id
                          ? "Registering..."
                          : "Register Now"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mt-6">
              <h3 className="font-semibold text-neutral-900">Event Reviews</h3>
              {selectedEvent?.reviews?.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {selectedEvent.reviews.map((review) => (
                    <div
                      key={review?._id || review?.id}
                      className="rounded-xl border border-neutral-200 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {review?.userName || "User"}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {"★".repeat(Math.max(1, Math.min(5, Number(review?.rating || 0))))}
                            {" "}
                            {review?.isVerified ? "Verified event" : ""}
                          </p>
                        </div>
                        {review?.createdAt && (
                          <span className="text-xs text-neutral-400">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-neutral-700">
                        {review?.comment || "No comment provided."}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">No event reviews yet</p>
              )}
            </div>

            {canManageSelectedEvent && (
              <EventRegistrationManager
                event={selectedEvent}
                registrations={eventRegistrations}
                groupedRegistrations={groupedRegistrations}
                isLoading={isRegistrationsLoading}
                message={registrationMessage}
                isSubmitting={isUpdatingRegistration}
                pendingCount={pendingCount}
                selectedEventHasCertificates={selectedEventHasCertificates}
                selectedEventEnded={selectedEventEnded}
                onApprove={onApprove}
                onReject={onReject}
                onMoveToWaitlist={onMoveToWaitlist}
                onCheckIn={onCheckIn}
                onIssueCertificate={onIssueCertificate}
                onRevokeCertificate={onRevokeCertificate}
              />
            )}

            {/* Manage Attendance - for organizers/salon owners */}
            {canManageSelectedEvent &&
              (selectedEvent.status === "upcoming" ||
                selectedEvent.status === "completed") && (
                <div className="mt-4 space-y-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={onManageAttendance}
                  >
                    Manage Attendance
                  </Button>
                  {selectedEvent.certificatesIssued && (
                    <p className="text-center text-xs text-green-600 font-medium">
                      ✓ Certificates issued
                    </p>
                  )}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
