export const isSubscriptionRequiredError = (error) =>
  error?.response?.data?.code === "SUBSCRIPTION_REQUIRED";

export const isBarberUnavailableError = (error) =>
  error?.response?.data?.code === "BARBER_UNAVAILABLE";

export const getFriendlyApiError = (
  error,
  fallback = "Something went wrong. Please try again."
) => {
  if (isSubscriptionRequiredError(error)) {
    return "Subscription required. Open Billing to activate your account or use an assigned salon seat.";
  }

  if (isBarberUnavailableError(error)) {
    return "This barber is not currently accepting bookings at this salon.";
  }

  return error?.response?.data?.message || fallback;
};
