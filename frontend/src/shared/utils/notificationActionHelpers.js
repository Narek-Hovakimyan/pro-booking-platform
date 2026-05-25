// ---------------------------------------------------------------------------
// Booking action helpers
// ---------------------------------------------------------------------------

export function getIdString(value) {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
}

export function getNotificationBookingId(notification) {
  return getIdString(notification?.data?.bookingId);
}

export function getBookingId(booking) {
  return getIdString(booking?.id || booking?._id);
}

export function getBookingNotificationAction(notification, booking, currentUser) {
  if (currentUser?.role !== "barber") return null;
  if (!getNotificationBookingId(notification) || !booking) return null;

  if (notification.type === "booking_created" && booking.status === "pending") {
    return {
      primaryAction: "accept-booking",
      primaryLabel: "Accept",
      secondaryAction: "reject-booking",
      secondaryLabel: "Reject",
    };
  }

  if (
    notification.type === "booking_reschedule_requested" &&
    booking.rescheduleRequest?.status === "pending"
  ) {
    return {
      primaryAction: "accept-reschedule",
      primaryLabel: "Approve",
      secondaryAction: "reject-reschedule",
      secondaryLabel: "Reject",
    };
  }

  return null;
}

export function getNotificationEventId(notification) {
  return getIdString(notification?.data?.eventId);
}

export function getNotificationEventRegistrationId(notification) {
  return getIdString(notification?.data?.eventRegistrationId);
}

export function getEventRegistrationId(registration) {
  return getIdString(registration?.id || registration?._id);
}

export function getEventNotificationAction(notification, registration, currentUser) {
  if (currentUser?.role !== "barber") return null;
  if (!getNotificationEventId(notification) || !getNotificationEventRegistrationId(notification)) return null;
  if (!registration) return null;
  if (!["pending", "waitlisted"].includes(registration.status)) return null;

  if (notification.type === "event_registration_request") {
    return {
      primaryAction: "approve-event-registration",
      primaryLabel: "Approve",
      secondaryAction: "reject-event-registration",
      secondaryLabel: "Reject",
    };
  }

  return null;
}

export function getNotificationJobApplicationId(notification) {
  return getIdString(notification?.data?.jobApplicationId);
}

export function getJobApplicationId(application) {
  return getIdString(application?.id || application?._id);
}

export function getJobNotificationAction(notification, application, currentUser) {
  if (currentUser?.role !== "barber") return null;
  if (notification.type !== "salon_job_application_submitted") return null;
  if (!getNotificationJobApplicationId(notification) || !application) return null;
  if (!["pending", "reviewed"].includes(application.status)) return null;

  return {
    primaryAction: "accept-job-application",
    primaryLabel: "Accept",
    secondaryAction: "reject-job-application",
    secondaryLabel: "Reject",
  };
}
