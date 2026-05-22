import { Award, Calendar, Clock, ExternalLink, MapPin, Users } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  canReviewEvent,
  formatEventDate as formatDate,
  formatEventDuration as formatDuration,
  formatEventPrice as formatPrice,
  getCertificate,
  getEventDate,
  getEventImage,
  getEventLocation,
  getEventMaxParticipants,
  getEventRegistrationCount,
  getEventSalonName,
  getEventTime,
  getEventTitle,
  getEventTypeLabel,
  getEventVisibility,
  getRegistrationStatus,
} from "@/features/events/utils/eventFormatters";

export default function MyEventCard({
  activeTab,
  event,
  onReview,
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200">
          {getEventImage(event) ? (
            <img
              alt={getEventTitle(event)}
              className="h-full w-full rounded-xl object-cover"
              src={getEventImage(event)}
            />
          ) : (
            <Calendar className="h-10 w-10 text-neutral-400" />
          )}
        </div>

        <h3 className="font-semibold text-neutral-900 line-clamp-2">
          {getEventTitle(event)}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
            {getEventTypeLabel(event)}
          </span>
          {getEventVisibility(event) === "private" && (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
              Private
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
            <span className="truncate">
              {getEventLocation(event)}
              {getEventSalonName(event) ? ` · ${getEventSalonName(event)}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>
              {getEventRegistrationCount(event) || "?"} /{" "}
              {getEventMaxParticipants(event) || "?"} approved
            </span>
          </div>
        </div>

        <div className="mt-2 text-sm font-medium">
          <span className="text-neutral-700">{event.instructor}</span>
          <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
            {formatPrice(event.price)}
          </span>
        </div>

        {activeTab === "past" && event.attendanceStatus && (
          <div className="mt-3">
            {event.attendanceStatus === "attended" ? (
              <div className="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                ✓ Attended
                {event.certificatesIssued && (
                  <span className="ml-2">· Certificate received 📜</span>
                )}
              </div>
            ) : event.attendanceStatus === "no_show" ? (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                ✗ No Show
              </div>
            ) : (
              <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600">
                Attendance pending
              </div>
            )}
          </div>
        )}

        {getRegistrationStatus(event) === "pending" && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Pending approval
          </div>
        )}

        {getRegistrationStatus(event) === "approved" && activeTab !== "past" && (
          <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
            Approved. You can participate.
          </div>
        )}

        {getRegistrationStatus(event) === "rejected" && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            Rejected
            {event?.rejectionReason ? `: ${event.rejectionReason}` : ""}
          </div>
        )}

        {activeTab === "past" && (
          <div className="mt-3 space-y-2">
            {getCertificate(event)?.status === "issued" ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
                <div className="flex items-center gap-2 font-semibold">
                  <Award className="h-4 w-4" />
                  Certificate issued
                </div>
                <p className="mt-1">ID: {getCertificate(event).certificateId}</p>
                {getCertificate(event).issuedAt && (
                  <p className="mt-0.5">
                    Issued{" "}
                    {new Date(getCertificate(event).issuedAt).toLocaleDateString()}
                  </p>
                )}
                <Button
                  as="a"
                  className="mt-3 w-full"
                  href={`/certificates/${getCertificate(event).certificateId}`}
                  variant="outline"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View certificate
                </Button>
              </div>
            ) : getCertificate(event)?.status === "revoked" ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs font-medium text-red-700">
                Certificate revoked
                {getCertificate(event).revokedReason
                  ? `: ${getCertificate(event).revokedReason}`
                  : ""}
              </div>
            ) : event?.certificatesEnabled && event?.attended ? (
              <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600">
                Certificate not issued yet
              </div>
            ) : event?.certificatesEnabled ? (
              <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600">
                Certificate unavailable
              </div>
            ) : null}

            {event?.hasEventReview ? (
              <Button className="w-full" disabled variant="outline">
                Reviewed
              </Button>
            ) : canReviewEvent(event) ? (
              <Button
                className="w-full"
                onClick={() => onReview(event)}
                variant="outline"
              >
                Leave review
              </Button>
            ) : (
              <Button className="w-full" disabled variant="outline">
                Review unavailable
              </Button>
            )}
          </div>
        )}

        {event.registrationStatus === "cancelled" && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            Registration cancelled
          </div>
        )}

        {event.status === "cancelled" && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            Event cancelled
          </div>
        )}
      </CardContent>
    </Card>
  );
}

