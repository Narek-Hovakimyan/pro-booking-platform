import fs from "node:fs/promises";
import path from "node:path";

import mongoose from "mongoose";

import EventCertificate from "../src/models/EventCertificate.js";
import MediaObject from "../src/models/MediaObject.js";
import {
  EVENT_CERTIFICATE_MEDIA_CLASS,
  attachEventCertificateMediaAtomically,
} from "../src/services/media/eventCertificateMediaService.js";

const safeFileUrl = (url) => {
  const prefix = "/uploads/certificate-files/";
  const filename = typeof url === "string" ? url.slice(prefix.length) : "";
  return url?.startsWith(prefix) && filename === path.basename(filename) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:pdf|jpe?g|png|webp)$/i.test(filename)
    ? filename : "";
};
const queryResult = async (query) => query?.lean ? query.lean() : query;

const exactMapping = (media, certificate) =>
  media?.ownerModel === "EventCertificate" &&
  String(media.ownerId) === String(certificate._id) &&
  media.mediaClass === EVENT_CERTIFICATE_MEDIA_CLASS &&
  media.legacyUrl === certificate.fileUrl && media.status === "active" &&
  String(certificate.mediaObjectId || "") === String(media._id);

export const runEventCertificateMediaBackfill = async ({
  write = false,
  EventCertificateModel = EventCertificate,
  MediaObjectModel = MediaObject,
  attach = attachEventCertificateMediaAtomically,
} = {}) => {
  const certificates = await queryResult(EventCertificateModel.find({ fileUrl: { $ne: "" } }).select("fileUrl mediaObjectId status"));
  const result = { mode: write ? "write" : "dry-run", scanned: certificates.length, created: 0, existing: 0, missing: 0, ambiguous: 0, collisions: 0 };
  for (const certificate of [...certificates].sort((a, b) => String(a._id).localeCompare(String(b._id)))) {
    const filename = safeFileUrl(certificate.fileUrl);
    if (!filename || certificate.status !== "issued") { result.ambiguous += 1; continue; }
    const mappings = await queryResult(MediaObjectModel.find({ legacyUrl: certificate.fileUrl }));
    if (mappings.length) {
      if (mappings.length === 1 && exactMapping(mappings[0], certificate)) result.existing += 1;
      else result.collisions += 1;
      continue;
    }
    const filePath = path.join(process.cwd(), "uploads", "certificate-files", filename);
    try { await fs.stat(filePath); } catch { result.missing += 1; continue; }
    if (write) {
      await attach({ certificateId: certificate._id, expectedFileUrl: certificate.fileUrl, file: { filename, originalname: filename, path: filePath } });
      result.created += 1;
    }
  }
  if (result.ambiguous || result.collisions) {
    throw Object.assign(new Error("Ambiguous or incompatible event certificate media"), { result });
  }
  return result;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  try {
    process.stdout.write(`${JSON.stringify(await runEventCertificateMediaBackfill({ write: process.argv.includes("--write") }))}\n`);
  } finally {
    await mongoose.disconnect();
  }
}
