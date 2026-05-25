import { getId } from "./eventUtils.js";

/**
 * Build notification data payload for event-related notifications.
 * Returns { eventId, eventRegistrationId } or undefined if empty.
 */
export function getEventNotificationData(event, registration = null) {
  const eventId = getId(event);
  const eventRegistrationId = getId(registration);
  const data = {};

  if (eventId) data.eventId = eventId;
  if (eventRegistrationId) data.eventRegistrationId = eventRegistrationId;

  return Object.keys(data).length > 0 ? data : undefined;
}
