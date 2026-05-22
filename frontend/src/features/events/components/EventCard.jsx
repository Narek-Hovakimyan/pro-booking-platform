import { Calendar, Clock, MapPin, Users } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
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
  getRegistrationReason,
  getRegistrationStatus,
} from "@/features/events/utils/eventFormatters";

export default function EventCard({
  canManage = false,
  currentUser = null,
  currentUserId = "",
  event,
  onOpen,
  onRegister,
  onUnregister,
  registeringEventId = null,
  registration = null,
}) {
  const registrationStatus = getRegistrationStatus(registration);
  const rejectionReasonText = getRegistrationReason(registration);
  const registrationCount = getEventRegistrationCount(event);
  const maxParticipants = getEventMaxParticipants(event);
  const salonName = getEventSalonName(event);
  const organizerName = getEventOrganizerName(event);
  const imageUrl = getEventImage(event);
  const isFull = maxParticipants > 0 && registrationCount >= maxParticipants;
  const isPast =
    Boolean(getEventDate(event)) &&
    getEventDate(event) < new Date().toISOString().slice(0, 10);

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onOpen(event)}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200">
          {imageUrl ? (
            <img
              alt={getEventTitle(event)}
              className="h-full w-full rounded-xl object-cover"
              src={imageUrl}
            />
          ) : (
            <Calendar className="h-10 w-10 text-neutral-400" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-neutral-900 line-clamp-2">
            {getEventTitle(event)}
          </h3>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
            {getEventTypeLabel(event)}
          </span>
          {getEventVisibility(event) === "private" && canManage && (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
              Private
            </span>
          )}
          {event?.certificatesEnabled && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              Certificates
            </span>
          )}
        </div>

        <div className="mt-2 space-y-1 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{formatDate(getEventDate(event))}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              {getEventTime(event)} · {formatDuration(event.duration)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{getEventLocation(event)}</span>
          </div>
          {(salonName || organizerName) && (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span>Organized by: {salonName || organizerName}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>
              {registrationCount} / {maxParticipants || "?"} approved
            </span>
          </div>
        </div>

        <div className="mt-2 text-sm font-medium">
          <span className="text-neutral-700">{event.instructor}</span>
          <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
            {formatPrice(event.price)}
          </span>
        </div>

        {currentUser && !isPast && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            {String(event?.organizerId?._id || event?.organizerId) ===
            String(currentUserId) ? (
              <Button className="w-full" disabled variant="outline">
                You are the organizer
              </Button>
            ) : registrationStatus === "pending" ||
              registrationStatus === "waitlisted" ? (
              <>
                {registrationStatus === "pending" && (
                  <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Pending approval
                  </div>
                )}
                {registrationStatus === "approved" && (
                  <div className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                    Approved. You can participate.
                  </div>
                )}
                {registrationStatus === "waitlisted" && (
                  <div className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                    Waitlisted. You are on the waiting list.
                  </div>
                )}
                {registrationStatus === "rejected" && (
                  <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    Rejected
                    {rejectionReasonText ? `: ${rejectionReasonText}` : ""}
                  </div>
                )}
                {registrationStatus === "pending" ||
                registrationStatus === "waitlisted" ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => onUnregister(event._id)}
                  >
                    {registrationStatus === "pending"
                      ? "Cancel Request"
                      : "Leave Waiting List"}
                  </Button>
                ) : registrationStatus === "rejected" ? (
                  <Button className="w-full" disabled variant="outline">
                    Request Closed
                  </Button>
                ) : registrationStatus === "approved" ? (
                  <Button className="w-full" disabled variant="outline">
                    Approved
                  </Button>
                ) : isFull ? (
                  <Button className="w-full" disabled variant="outline">
                    Full
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    disabled={registeringEventId === event._id}
                    onClick={() => onRegister(event._id)}
                  >
                    {registeringEventId === event._id
                      ? "Registering..."
                      : "Register"}
                  </Button>
                )}
              </>
            ) : registrationStatus === "rejected" ? (
              <Button className="w-full" disabled variant="outline">
                Request Closed
              </Button>
            ) : registrationStatus === "approved" ? (
              <Button className="w-full" disabled variant="outline">
                Approved
              </Button>
            ) : isFull ? (
              <Button className="w-full" disabled variant="outline">
                Full
              </Button>
            ) : (
              <Button
                className="w-full"
                disabled={registeringEventId === event._id}
                onClick={() => onRegister(event._id)}
              >
                {registeringEventId === event._id ? "Registering..." : "Register"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

