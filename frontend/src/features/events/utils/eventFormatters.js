export const EVENT_TYPE_OPTIONS = [
  { value: "training", label: "Training" },
  { value: "masterclass", label: "Masterclass" },
  { value: "salon_opening", label: "Salon Opening" },
  { value: "discount_day", label: "Discount Day" },
  { value: "competition", label: "Competition" },
  { value: "networking", label: "Networking" },
];

export const EVENT_TYPE_LABELS = Object.fromEntries(
  EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

export const formatEventDate = (dateStr) => {
  if (!dateStr) return "Date not set";
  const date = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "Date not set";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export const formatEventPrice = (price) => {
  if (!price || price === 0) return "Free";
  return `${Number(price).toLocaleString()} AMD`;
};

export const formatEventDuration = (minutes) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export const getEventTitle = (event) => event?.title || "Untitled event";
export const getEventDate = (event) => event?.date || "";
export const getEventTime = (event) => event?.time || "Time not set";
export const getEventLocation = (event) => event?.location || "Location not set";
export const getEventImage = (event) => event?.imageUrl || event?.image || "";
export const getEventSalonName = (event) =>
  event?.salon?.name || event?.salonId?.name || "";
export const getEventOrganizerName = (event) =>
  event?.organizer?.name || event?.organizerId?.name || "";
export const getEventRegistrationCount = (event) =>
  Number(event?.registrationCount) || 0;
export const getEventMaxParticipants = (event) =>
  Number(event?.maxParticipants) || 0;
export const getEventType = (event) => event?.type || "training";
export const getEventTypeLabel = (event) =>
  EVENT_TYPE_LABELS[getEventType(event)] || "Event";
export const getEventVisibility = (event) => event?.visibility || "public";
export const getRegistrationStatus = (registration) =>
  registration?.registrationStatus || registration?.status || "";
export const getRegistrationReason = (registration) =>
  registration?.rejectionReason || "";
export const getRegistrationEventId = (registration) =>
  registration?.eventId || registration?._id;
export const getRegistrationStatusClasses = (status) => {
  if (status === "approved") return "bg-green-100 text-green-700";
  if (status === "rejected") return "bg-red-100 text-red-700";
  if (status === "cancelled") return "bg-neutral-100 text-neutral-600";
  return "bg-amber-100 text-amber-700";
};
export const getRegistrationStatusLabel = (status) => {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "cancelled") return "Cancelled";
  if (status === "waitlisted") return "Waitlisted";
  return "Pending approval";
};
export const getEventDateTime = (event) => {
  if (!event?.date || !event?.time) return null;
  const dateTime = new Date(`${event.date}T${event.time}:00`);

  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
};
export const isEventEnded = (event) => {
  const startsAt = getEventDateTime(event);
  if (!startsAt) return false;

  const durationMs = Math.max(0, Number(event?.duration || 0)) * 60 * 1000;
  return new Date(startsAt.getTime() + durationMs) < new Date();
};
export const canReviewEvent = (event) => {
  const registrationStatus = getRegistrationStatus(event);
  const eventDateTime = getEventDateTime(event);

  return (
    registrationStatus === "approved" &&
    Boolean(event?.attended) &&
    Boolean(eventDateTime && eventDateTime < new Date()) &&
    !event?.hasEventReview
  );
};
export const getCertificate = (registration) => registration?.certificate || null;

