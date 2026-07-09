import Booking from "../../models/Booking.js";
import { isValidObjectId, canManageBookingSalon, sameId } from "./bookingControllerHelpers.js";

const treatmentRecordAllowedFields = [
  "colorFormula",
  "tonerFormula",
  "developer",
  "processingTime",
  "productsUsed",
  "techniqueNotes",
  "outcomeNotes",
  "reactionNotes",
];

/**
 * Update the treatment record on a booking.
 * Returns { success: true, booking } on success, or { error: message, status } on failure.
 */
export const updateBookingTreatmentRecord = async ({ bookingId, body, user }) => {
  if (!isValidObjectId(bookingId)) {
    return { error: "Invalid booking ID", status: 400 };
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return { error: "Booking not found", status: 404 };
  }

  // Authorization: assigned barber OR salon owner/admin
  const isAssignedBarber =
    user?.role === "barber" && sameId(user._id, booking.barberId);
  const isSalonManager =
    !isAssignedBarber && (await canManageBookingSalon(booking, user._id));

  if (!isAssignedBarber && !isSalonManager) {
    return { error: "Not authorized to modify treatment record", status: 403 };
  }

  // Status restriction: only accepted or completed
  if (booking.status !== "accepted" && booking.status !== "completed") {
    return {
      error: `Treatment record can only be added to accepted or completed bookings, not ${booking.status}`,
      status: 400,
    };
  }

  // Build treatment record from whitelisted fields only
  const treatmentRecord = {};

  for (const field of treatmentRecordAllowedFields) {
    if (body[field] !== undefined) {
      treatmentRecord[field] = String(body[field]).trim();
    } else if (booking.treatmentRecord?.[field]) {
      treatmentRecord[field] = booking.treatmentRecord[field];
    } else {
      treatmentRecord[field] = "";
    }
  }

  // Server-side timestamps and recordedBy
  if (booking.treatmentRecord?.recordedAt) {
    treatmentRecord.recordedAt = booking.treatmentRecord.recordedAt;
    treatmentRecord.recordedBy = booking.treatmentRecord.recordedBy;
  } else {
    treatmentRecord.recordedAt = new Date();
    treatmentRecord.recordedBy = user._id;
  }

  treatmentRecord.updatedAt = new Date();

  booking.treatmentRecord = treatmentRecord;
  await booking.save();

  return { success: true, booking };
};
