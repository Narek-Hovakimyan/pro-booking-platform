import { deleteUploadedFile } from "../../middleware/uploadMiddleware.js";

/**
 * Collect reference image file paths from a multer req.files array.
 */
export const collectReferenceImagePaths = (req) => {
  if (!req.files || !Array.isArray(req.files)) return [];
  return req.files.map((file) => `uploads/booking-references/${file.filename}`);
};

/**
 * Delete previously uploaded reference image files.
 */
export const cleanupReferenceImages = (paths) => {
  if (!paths || !paths.length) return;
  paths.forEach(deleteUploadedFile);
};