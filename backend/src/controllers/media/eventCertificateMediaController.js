import path from "node:path";
import { pipeline } from "node:stream/promises";

import EventCertificate from "../../models/EventCertificate.js";
import MediaObject, { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import {
  EVENT_CERTIFICATE_MEDIA_CLASS,
  openEventCertificateMedia,
} from "../../services/media/eventCertificateMediaService.js";

const safeFilename = (value) =>
  typeof value === "string" && value === path.basename(value) &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:pdf|jpe?g|png|webp)$/i.test(value);
const urlFor = (filename) => `/uploads/certificate-files/${filename}`;

const legacyBound = (legacyUrl) =>
  EventCertificate.exists({ fileUrl: legacyUrl, status: "issued", mediaObjectId: null });

const managedBound = (media) =>
  EventCertificate.exists({
    _id: media.ownerId,
    mediaObjectId: media._id,
    fileUrl: media.legacyUrl,
    status: "issued",
  });

export const serveEventCertificateMedia = async (req, res) => {
  const { filename } = req.params;
  if (!safeFilename(filename)) {
    return res.status(404).json({ message: "Certificate file not found" });
  }
  const legacyUrl = urlFor(filename);
  try {
    const managed = await openEventCertificateMedia({ legacyUrl });
    if (managed) {
      if (managed.media.ownerModel !== "EventCertificate" ||
          managed.media.mediaClass !== EVENT_CERTIFICATE_MEDIA_CLASS ||
          !(await managedBound(managed.media))) {
        return res.status(404).json({ message: "Certificate file not found" });
      }
      res.setHeader("Cache-Control", "no-store");
      if (managed.media.contentType) res.type(managed.media.contentType);
      await pipeline(managed.stream, res);
      return res;
    }
    const inactive = await MediaObject.exists({
      legacyUrl,
      mediaClass: EVENT_CERTIFICATE_MEDIA_CLASS,
      status: { $in: [MEDIA_OBJECT_STATES.DELETE_PENDING, MEDIA_OBJECT_STATES.DELETED] },
    });
    if (inactive || !(await legacyBound(legacyUrl))) {
      return res.status(404).json({ message: "Certificate file not found" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(
      path.resolve(process.cwd(), "uploads", "certificate-files", filename),
      (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({ message: "Certificate file not found" });
        }
      }
    );
  } catch {
    return res.status(404).json({ message: "Certificate file not found" });
  }
};
