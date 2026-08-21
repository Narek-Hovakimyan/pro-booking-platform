import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import mongoose from "mongoose";

import EventCertificate from "../../models/EventCertificate.js";
import MediaObject, { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import { LocalMediaStore } from "./localMediaStore.js";
import { resolveMediaStageKeys } from "./mediaStore.js";

export const EVENT_CERTIFICATE_MEDIA_CLASS = "event-certificate";
const root = path.join(process.cwd(), "uploads", ".event-certificate-media-store");
let store;

export const eventCertificateMediaStore = () =>
  store || (store = new LocalMediaStore({ root }));
export const eventCertificateMediaUrl = (filename) =>
  `/uploads/certificate-files/${filename}`;

const readBytes = (file) =>
  Buffer.isBuffer(file?.buffer)
    ? Promise.resolve(file.buffer)
    : file?.path
      ? fs.readFile(file.path)
      : Promise.reject(new Error("Certificate upload is unavailable"));
const extensionFor = (file) => path.extname(file?.originalname || file?.filename || "");
const unknownCommit = (error) =>
  error?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
  error?.errorLabels?.includes("UnknownTransactionCommitResult");

const markPending = async (MediaObjectModel, id) => {
  if (!id) return;
  await MediaObjectModel.updateOne(
    { _id: id, status: MEDIA_OBJECT_STATES.STAGED },
    { $set: { status: MEDIA_OBJECT_STATES.DELETE_PENDING, deletePendingAt: new Date() } }
  ).catch(() => {});
};

export const stageEventCertificateMedia = async ({
  certificateId,
  file,
  MediaObjectModel = MediaObject,
  mediaStore = eventCertificateMediaStore(),
} = {}) => {
  if (!certificateId || !file?.filename) throw new Error("Invalid certificate media upload");
  const bytes = await readBytes(file);
  const { storageKey, stageKey } = resolveMediaStageKeys({ extension: extensionFor(file) });
  const media = await MediaObjectModel.create({
    provider: mediaStore.provider || "local",
    storageKey,
    stageKey,
    status: MEDIA_OBJECT_STATES.STAGED,
    contentType: file.mimetype || "",
    byteSize: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    originalFilename: file.originalname || "",
    legacyUrl: eventCertificateMediaUrl(file.filename),
    mediaClass: EVENT_CERTIFICATE_MEDIA_CLASS,
    access: "public",
    ownerModel: "EventCertificate",
    ownerId: certificateId,
  });
  try {
    await mediaStore.stage({ buffer: bytes, extension: extensionFor(file), storageKey, stageKey });
    await mediaStore.promote({ storageKey, stageKey });
    return media;
  } catch (error) {
    await markPending(MediaObjectModel, media._id);
    throw error;
  }
};

export const attachEventCertificateMediaAtomically = async ({
  certificateId,
  expectedFileUrl = "",
  file,
  EventCertificateModel = EventCertificate,
  MediaObjectModel = MediaObject,
  mediaStore = eventCertificateMediaStore(),
  startSession = () => mongoose.connection.startSession(),
} = {}) => {
  if (!certificateId || !file?.filename) throw new Error("Invalid certificate media attachment");
  const staged = await stageEventCertificateMedia({ certificateId, file, MediaObjectModel, mediaStore });
  let session;
  try {
    session = await startSession();
    if (!session?.withTransaction) throw new Error("Certificate media requires transaction support");
    let certificate;
    await session.withTransaction(async () => {
      certificate = await EventCertificateModel.findOneAndUpdate(
        { _id: certificateId, fileUrl: expectedFileUrl, mediaObjectId: null, status: "issued" },
        { $set: { certificateType: "uploaded", fileUrl: staged.legacyUrl, fileType: file.mimetype || "", originalFileName: file.originalname || "", mediaObjectId: staged._id } },
        { new: true, runValidators: true, session }
      );
      if (!certificate) throw Object.assign(new Error("Certificate changed; refresh and retry"), { statusCode: 409 });
      const active = await MediaObjectModel.findOneAndUpdate(
        { _id: staged._id, ownerModel: "EventCertificate", ownerId: certificateId, mediaClass: EVENT_CERTIFICATE_MEDIA_CLASS, status: MEDIA_OBJECT_STATES.STAGED },
        { $set: { status: MEDIA_OBJECT_STATES.ACTIVE, stageKey: "", activatedAt: new Date() } },
        { new: true, runValidators: true, session }
      );
      if (!active) throw new Error("Could not activate certificate media");
    });
    return certificate;
  } catch (error) {
    if (unknownCommit(error)) {
      const current = await EventCertificateModel.findOne({ _id: certificateId, mediaObjectId: staged._id }).lean().catch(() => null);
      if (current?.fileUrl === staged.legacyUrl) return current;
      error.certificateMediaCommitOutcomeUnknown = true;
      throw error;
    }
    await markPending(MediaObjectModel, staged._id);
    throw error;
  } finally {
    await session?.endSession?.().catch(() => {});
  }
};

export const openEventCertificateMedia = async ({
  legacyUrl,
  MediaObjectModel = MediaObject,
  mediaStore = eventCertificateMediaStore(),
} = {}) => {
  const media = await MediaObjectModel.findOne({
    legacyUrl,
    mediaClass: EVENT_CERTIFICATE_MEDIA_CLASS,
    ownerModel: "EventCertificate",
    access: "public",
    status: MEDIA_OBJECT_STATES.ACTIVE,
  }).lean();
  if (!media) return null;
  return { media, stream: await mediaStore.createReadStream(media.storageKey) };
};
