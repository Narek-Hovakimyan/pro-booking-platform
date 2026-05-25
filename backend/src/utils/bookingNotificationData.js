export const getBookingNotificationData = (booking) =>
  booking?._id ? { bookingId: booking._id } : undefined;
