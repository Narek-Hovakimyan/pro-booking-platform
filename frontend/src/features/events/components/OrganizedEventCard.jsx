import { Award, Calendar, Clock, MapPin, Users } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";
import {
  formatEventDate as formatDate,
  formatEventDuration as formatDuration,
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
} from "@/features/events/utils/eventFormatters";

export default function OrganizedEventCard({ event, variant = "upcoming" }) {
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

        {variant === "upcoming" ? (
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-neutral-900 line-clamp-2">
              {getEventTitle(event)}
            </h3>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
              {getEventTypeLabel(event)}
            </span>
            {getEventVisibility(event) === "private" && (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                Private
              </span>
            )}
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-neutral-900 line-clamp-2">
              {getEventTitle(event)}
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                {getEventTypeLabel(event)}
              </span>
            </div>
          </>
        )}

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
          {variant === "upcoming" && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {getEventLocation(event)}
                {getEventSalonName(event) ? ` · ${getEventSalonName(event)}` : ""}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>
              {variant === "upcoming"
                ? `${getEventRegistrationCount(event) || "?"} / ${getEventMaxParticipants(event) || "?"} approved`
                : `${getEventRegistrationCount(event) || "?"} approved participants`}
            </span>
          </div>
          {variant === "past" && (
            <>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span>{event?.attendedCount || 0} attended</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <Award className="h-3.5 w-3.5 shrink-0" />
                <span>{event?.certificatesCount || 0} certificates issued</span>
              </div>
            </>
          )}
        </div>

        {variant === "upcoming" && (
          <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Manage registration requests from the Events page event details.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

