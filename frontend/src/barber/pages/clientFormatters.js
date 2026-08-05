import { formatDateLabel, parseDateKey } from "@/shared/utils/dates";

export const formatBookingLabel = (booking) => {
  if (!booking?.date) return "None";

  const parsedDate =
    typeof booking.date === "string" ? parseDateKey(booking.date) : null;
  const pieces = [parsedDate ? formatDateLabel(parsedDate) : "—"];

  if (booking.time) pieces.push(booking.time);
  if (booking.serviceName) pieces.push(booking.serviceName);

  return pieces.join(" · ");
};
