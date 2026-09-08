export const BILLING_OWNER_SUMMARY_FIELDS = "name email";
export const BILLING_SALON_SUMMARY_FIELDS = "name city ownerId";
export const BILLING_SUBSCRIPTION_SUMMARY_FIELDS =
  "ownerId status seatCount activeSeatCount pricePerSeat totalPrice provider currentPeriodStart currentPeriodEnd trialEndsAt lastPaymentAt cancelledAt";
export const BILLING_SEAT_OPERATOR_FIELDS =
  "name email barberType salon salonStatus salons.salon salons.status salons.relationshipType salons.relationshipStatus salons.worksAsSpecialist";
export const BILLING_INDIVIDUAL_SUMMARY_FIELDS = "name email";
export const SAFE_PAYMENT_FIELDS = [
  "amount", "currency", "status", "provider", "seatCount", "months",
  "createdAt", "paidAt", "periodStart", "periodEnd",
];
