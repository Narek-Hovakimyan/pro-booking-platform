import {
  getArmeniaDateKey,
  isBeyondBookingHorizon,
  isDateKey,
  timeToMinutes,
} from "../utils/bookingDateTime.js";

export const OPEN_WAITLIST_STATUSES = ["active", "notified", "offered"];
export const CANCELLABLE_WAITLIST_STATUSES = ["active", "notified"];

export const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

export const getWaitlistCreationLockKey = ({
  clientId,
  barberId,
  salonId,
  serviceId,
  date,
  preferredStartTime,
  preferredEndTime,
}) =>
  [
    clientId,
    barberId,
    salonId || "",
    serviceId,
    date,
    preferredStartTime || "",
    preferredEndTime || "",
  ]
    .map((value) => String(value))
    .join(":");

export const validatePreferredWindow = ({ preferredStartTime, preferredEndTime }) => {
  const startMinutes = preferredStartTime ? timeToMinutes(preferredStartTime) : null;
  const endMinutes = preferredEndTime ? timeToMinutes(preferredEndTime) : null;

  if (preferredStartTime && startMinutes === null) {
    return "preferredStartTime must be HH:mm";
  }

  if (preferredEndTime && endMinutes === null) {
    return "preferredEndTime must be HH:mm";
  }

  if (startMinutes !== null && endMinutes !== null && startMinutes > endMinutes) {
    return "preferredStartTime must be before or equal to preferredEndTime";
  }

  return "";
};

export const validateWaitlistDate = (date) => {
  if (!isDateKey(date)) {
    return "date must be a valid YYYY-MM-DD calendar date";
  }

  if (date < getArmeniaDateKey(new Date())) {
    return "date cannot be in the past";
  }

  if (isBeyondBookingHorizon(date)) {
    return "date is too far in the future";
  }

  return "";
};

export const throwDuplicateWaitlistEntryError = () => {
  const error = new Error(
    "You already have an active waitlist entry for this barber, service, date, and time window"
  );
  error.code = "DUPLICATE_WAITLIST_ENTRY";
  throw error;
};

export const createWaitlistActionError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};
