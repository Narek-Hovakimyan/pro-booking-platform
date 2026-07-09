import path from "path";
import Booking from "../../models/Booking.js";
import {
  isValidObjectId,
  sameId,
  canManageBookingSalon,
} from "./bookingControllerHelpers.js";

export const resolveReferenceImageRequest = async ({ bookingId, imageName, user }) => {
  if (!isValidObjectId(bookingId)) {
    return { status: 400, error: "Invalid booking ID" };
  }

  // Prevent path traversal
  if (imageName.includes("..") || imageName.includes("/") || imageName.includes("\\")) {
    return { status: 400, error: "Invalid image name" };
  }

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    return { status: 404, error: "Booking not found" };
  }

  // Authorize: booking client, assigned barber, or the owner/admin of the
  // salon tied to this booking.
  const isBookingClient =
    booking.clientId &&
    user?._id &&
    sameId(user._id, booking.clientId);
  const isAssignedBarber =
    sameId(user?._id, booking.barberId);
  const isSalonManager =
    !isBookingClient &&
    !isAssignedBarber &&
    await canManageBookingSalon(booking, user?._id);

  if (!isBookingClient && !isAssignedBarber && !isSalonManager) {
    return { status: 403, error: "Not authorized to view these images" };
  }

  // Verify the image is actually listed on this booking
  const fullPath = `uploads/booking-references/${imageName}`;

  if (!booking.referenceImages || !booking.referenceImages.includes(fullPath)) {
    return { status: 404, error: "Image not found in booking" };
  }

  // Resolve path and verify it's still inside uploads/booking-references
  const absolutePath = path.resolve(process.cwd(), "uploads", "booking-references", imageName);
  const uploadsDir = path.resolve(process.cwd(), "uploads", "booking-references");
  const relativeToDir = path.relative(uploadsDir, absolutePath);

  if (relativeToDir.startsWith("..") || path.isAbsolute(relativeToDir)) {
    return { status: 400, error: "Invalid image path" };
  }

  return { absolutePath };
};
