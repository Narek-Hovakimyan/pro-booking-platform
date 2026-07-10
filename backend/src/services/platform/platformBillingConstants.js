export const SAFE_OWNER_FIELDS = "name email avatarUrl city emailVerified profession barberType";
export const SAFE_BARBER_SEAT_FIELDS =
  "name avatarUrl profession barberType email salon salonStatus salons.salon salons.status salons.relationshipType salons.relationshipStatus salons.worksAsSpecialist";
export const SAFE_INDIVIDUAL_FIELDS = "name email avatarUrl city profession barberType createdAt";
export const SAFE_PAYMENT_FIELDS = [
  "amount", "currency", "status", "provider",
  "seatCount", "months", "createdAt", "updatedAt",
  "paidAt", "confirmedAt", "failedAt", "cancelledAt",
  "refundedAt", "expiresAt", "periodStart", "periodEnd",
  "source", "action",
];
