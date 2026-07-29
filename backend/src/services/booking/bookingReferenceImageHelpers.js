import path from "path";

import { deleteUploadedFile } from "../../middleware/uploadMiddleware.js";

export const bookingReferencePathPrefix = "uploads/booking-references/";

const safeReferenceNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i;

export const isSafeBookingReferenceImageName = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 255 &&
  value === value.trim() &&
  !value.includes("/") &&
  !value.includes("\\") &&
  !value.includes("..") &&
  safeReferenceNamePattern.test(value);

export const buildBookingReferenceImagePath = (filename, leadingSlash = false) => {
  if (!isSafeBookingReferenceImageName(filename)) return "";
  const relativePath = `${bookingReferencePathPrefix}${filename}`;
  return leadingSlash ? `/${relativePath}` : relativePath;
};

export const normalizeBookingReferenceImagePath = (value) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/^\/+/, "");
  if (!normalized.startsWith(bookingReferencePathPrefix)) return "";
  const filename = normalized.slice(bookingReferencePathPrefix.length);
  return buildBookingReferenceImagePath(filename);
};

export const collectReferenceImageUploads = (req) =>
  Array.isArray(req?.files) ? req.files : [];

const getReferenceUploadFilename = (file) =>
  file?.filename || (typeof file?.path === "string" ? path.basename(file.path) : "");

/**
 * Collect reference image file paths from a multer req.files array.
 */
export const collectReferenceImagePaths = (req) => {
  return collectReferenceImageUploads(req)
    .map((file) => buildBookingReferenceImagePath(getReferenceUploadFilename(file)))
    .filter(Boolean);
};

/**
 * Delete previously uploaded reference image files.
 */
export const cleanupReferenceImages = (paths) => {
  if (!paths || !paths.length) return;
  paths.forEach(deleteUploadedFile);
};
