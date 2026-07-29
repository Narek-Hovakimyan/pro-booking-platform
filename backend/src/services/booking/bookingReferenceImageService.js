import path from "path";
import Booking from "../../models/Booking.js";
import { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import {
  isValidObjectId,
  sameId,
  canManageBookingPrivateData,
} from "./bookingControllerHelpers.js";
import {
  buildBookingReferenceImagePath,
  isSafeBookingReferenceImageName,
} from "./bookingReferenceImageHelpers.js";
import {
  encodeMediaBindingToken,
  isBookingReferencePathOwnedByBooking,
  resolveBookingReferenceMedia,
} from "./bookingReferenceMediaService.js";

export const resolveReferenceImageRequest = async ({ bookingId, imageName, user }) => {
  if (!isValidObjectId(bookingId)) {
    return { status: 400, error: "Invalid booking ID" };
  }

  // Prevent path traversal
  if (!isSafeBookingReferenceImageName(imageName)) {
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
    await canManageBookingPrivateData(booking, user?._id);

  if (!isBookingClient && !isAssignedBarber && !isSalonManager) {
    return { status: 403, error: "Not authorized to view these images" };
  }

  if (!isBookingReferencePathOwnedByBooking(booking, imageName)) {
    return { status: 404, error: "Image not found in booking" };
  }

  const mediaObjects = await resolveBookingReferenceMedia({
    bookingId: booking._id,
    imageName,
  });
  const activeMediaObject = mediaObjects.find(
    (mediaObject) => mediaObject.status === MEDIA_OBJECT_STATES.ACTIVE
  );

  if (activeMediaObject) {
    return {
      kind: "media",
      mediaObjectId: encodeMediaBindingToken({
        mediaObjectId: activeMediaObject._id,
        bookingId: booking._id,
        legacyUrl: activeMediaObject.legacyUrl,
      }),
      contentType: activeMediaObject.contentType || "",
    };
  }

  if (mediaObjects.length > 0) {
    return { status: 404, error: "Image not found in booking" };
  }

  const relativePath = buildBookingReferenceImagePath(imageName);
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const uploadsDir = path.resolve(process.cwd(), "uploads", "booking-references");
  const relativeToDir = path.relative(uploadsDir, absolutePath);

  if (relativeToDir.startsWith("..") || path.isAbsolute(relativeToDir)) {
    return { status: 400, error: "Invalid image path" };
  }

  return { kind: "legacy", absolutePath };
};
