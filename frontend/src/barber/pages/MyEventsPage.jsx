import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import ReviewModal from "@/client/components/ReviewModal";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import EmptyState from "@/shared/components/common/EmptyState";
import MyEventCard from "@/features/events/components/MyEventCard";
import OrganizedEventCard from "@/features/events/components/OrganizedEventCard";
import {
  getEventDateTime,
  getEventTitle,
  getRegistrationStatus,
} from "@/features/events/utils/eventFormatters";

export default function MyEventsPage() {
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.auth);
  const isBarber = currentUser?.role === "barber";
  const [events, setEvents] = useState([]);
  const [organizedEvents, setOrganizedEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOrganizedLoading, setIsOrganizedLoading] = useState(true);
  const [error, setError] = useState("");
  const [organizedError, setOrganizedError] = useState("");
  const [activeTab, setActiveTab] = useState("upcoming");
  const [reviewingEvent, setReviewingEvent] = useState(null);
  const [reviewError, setReviewError] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    async function fetchMyEvents() {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get("/events/my-registrations");
        setEvents(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load events");
      } finally {
        setIsLoading(false);
      }
    }
    fetchMyEvents();
  }, []);

  useEffect(() => {
    async function fetchOrganizedEvents() {
      setIsOrganizedLoading(true);
      setOrganizedError("");

      try {
        const { data } = await api.get("/events/mine");
        setOrganizedEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        setOrganizedError(
          err.response?.data?.message || "Could not load organized events"
        );
      } finally {
        setIsOrganizedLoading(false);
      }
    }

    if (isBarber && (currentUser?._id || currentUser?.id)) {
      void fetchOrganizedEvents();
    }
  }, [currentUser?._id, currentUser?.id, isBarber]);

  const now = new Date();

  const grouped = {
    upcoming: events.filter(
      (e) => {
        const eventDateTime = getEventDateTime(e);

        return (
          ["pending", "approved", "waitlisted"].includes(getRegistrationStatus(e)) &&
          e.status === "upcoming" &&
          Boolean(eventDateTime && eventDateTime >= now)
        );
      }
    ),
    past: events.filter(
      (e) => {
        const eventDateTime = getEventDateTime(e);

        return (
          getRegistrationStatus(e) === "approved" &&
          (e.status === "completed" || Boolean(eventDateTime && eventDateTime < now))
        );
      }
    ),
    cancelled: events.filter(
      (e) =>
        ["cancelled", "rejected"].includes(getRegistrationStatus(e)) ||
        e.status === "cancelled"
    ),
  };

  const tabs = [
    { key: "upcoming", label: "Upcoming", count: grouped.upcoming.length },
    { key: "past", label: "Past", count: grouped.past.length },
    { key: "cancelled", label: "Cancelled", count: grouped.cancelled.length },
  ];

  const currentEvents = grouped[activeTab];
  const upcomingOrganizedEvents = organizedEvents.filter((event) => {
    const eventDateTime = getEventDateTime(event);
    return Boolean(eventDateTime && eventDateTime >= now);
  });
  const pastOrganizedEvents = organizedEvents.filter((event) => {
    const eventDateTime = getEventDateTime(event);
    return Boolean(eventDateTime && eventDateTime < now);
  });

  const createEventReview = async (reviewData) => {
    if (!reviewingEvent) return;

    setIsSubmittingReview(true);
    setReviewError("");

    try {
      await api.post(`/events/${reviewingEvent.eventId || reviewingEvent._id}/reviews`, {
        registrationId: reviewingEvent.registrationId,
        ...reviewData,
      });

      setEvents((prev) =>
        prev.map((event) =>
          String(event.registrationId) === String(reviewingEvent.registrationId)
            ? { ...event, hasEventReview: true }
            : event
        )
      );
      setReviewingEvent(null);
    } catch (err) {
      setReviewError(
        err.response?.data?.message || "Could not save event review"
      );
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">My Events</h1>
        <Button variant="outline" onClick={() => navigate("/events")}>
          Browse Events
        </Button>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {isBarber && (
        <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Events You Organize
            </h2>
            <p className="text-sm text-neutral-500">
              Public and private events you created.
            </p>
          </div>
        </div>

        {organizedError && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {organizedError}
          </p>
        )}

        {isOrganizedLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
                  <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
                  <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Upcoming Organized Events */}
            <h3 className="text-md font-semibold text-neutral-800">
              Upcoming Events
            </h3>
            {upcomingOrganizedEvents.length === 0 ? (
              <p className="text-sm text-neutral-500">No upcoming organized events.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingOrganizedEvents.map((event) => (
                  <OrganizedEventCard event={event} key={event._id} />
                ))}
              </div>
            )}

            {/* Stories / Past Organized Events */}
            <h3 className="text-md mt-6 font-semibold text-neutral-800">
              Past Events
            </h3>
            {pastOrganizedEvents.length === 0 ? (
              <p className="text-sm text-neutral-500">No past organized events.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastOrganizedEvents.map((event) => (
                  <OrganizedEventCard event={event} key={event._id} variant="past" />
                ))}
              </div>
            )}
          </>
        )}
        </section>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
                <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && currentEvents.length === 0 && (
        <EmptyState
          description={
            activeTab === "upcoming"
              ? "You haven't registered for any upcoming events"
              : activeTab === "past"
                ? "No past events"
                : "No cancelled events"
          }
          title="No events yet"
        />
      )}

      {/* Events list */}
      {!isLoading && currentEvents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {currentEvents.map((event) => (
            <MyEventCard
              activeTab={activeTab}
              event={event}
              key={event._id}
              onReview={(nextEvent) => {
                setReviewError("");
                setReviewingEvent(nextEvent);
              }}
            />
          ))}
        </div>
      )}

      {reviewingEvent && (
        <ReviewModal
          booking={reviewingEvent}
          commentRequired
          error={reviewError}
          isSubmitting={isSubmittingReview}
          onClose={() => {
            setReviewError("");
            setReviewingEvent(null);
          }}
          onSubmit={createEventReview}
          subtitle={getEventTitle(reviewingEvent)}
          title="Review Event"
        />
      )}
    </div>
  );
}
