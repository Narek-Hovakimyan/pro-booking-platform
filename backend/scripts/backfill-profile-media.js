import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import mongoose from "mongoose";
import BarberProfile from "../src/models/BarberProfile.js";
import MediaObject from "../src/models/MediaObject.js";
import User from "../src/models/User.js";
import {
  PROFILE_MEDIA_CLASSES,
  profileMediaStore,
} from "../src/services/media/profileMediaService.js";
import { MEDIA_OBJECT_STATES } from "../src/models/MediaObject.js";

const prefixFor = (mediaClass) =>
  mediaClass === PROFILE_MEDIA_CLASSES.CERTIFICATION ? "/uploads/certifications/" : "/uploads/avatars/";
const safeUrl = (url, mediaClass) => {
  const prefix = prefixFor(mediaClass);
  const filename = typeof url === "string" ? url.slice(prefix.length) : "";
  return url?.startsWith(prefix) && filename === path.basename(filename) && /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(filename);
};

export const collectProfileMediaReferences = ({ users = [], profiles = [] } = {}) => {
  const references = [];
  for (const user of users) {
    if (safeUrl(user.avatarUrl, PROFILE_MEDIA_CLASSES.AVATAR)) references.push({ ownerId: user._id, legacyUrl: user.avatarUrl, mediaClass: PROFILE_MEDIA_CLASSES.AVATAR });
  }
  for (const profile of profiles) {
    if (safeUrl(profile.imageUrl, PROFILE_MEDIA_CLASSES.AVATAR)) references.push({ ownerId: profile.barberId, legacyUrl: profile.imageUrl, mediaClass: PROFILE_MEDIA_CLASSES.AVATAR });
    for (const certification of profile.certifications || []) {
      if (safeUrl(certification?.imageUrl, PROFILE_MEDIA_CLASSES.CERTIFICATION)) references.push({ ownerId: profile.barberId, legacyUrl: certification.imageUrl, mediaClass: PROFILE_MEDIA_CLASSES.CERTIFICATION });
    }
  }
  return references;
};

const resolveQuery = async (query) =>
  query && typeof query.lean === "function" ? query.lean() : query;

const isExactExistingMapping = (media, reference) =>
  media?.ownerModel === "User" &&
  String(media.ownerId) === String(reference.ownerId) &&
  media.mediaClass === reference.mediaClass &&
  media.legacyUrl === reference.legacyUrl &&
  media.status === "active";

const isExactStagedMapping = (media, reference) =>
  media?.ownerModel === "User" &&
  String(media.ownerId) === String(reference.ownerId) &&
  media.mediaClass === reference.mediaClass &&
  media.legacyUrl === reference.legacyUrl &&
  media.status === "staged";

const isExactRecoverableMapping = (media, reference) =>
  media?.ownerModel === "User" &&
  String(media.ownerId) === String(reference.ownerId) &&
  media.mediaClass === reference.mediaClass &&
  media.legacyUrl === reference.legacyUrl &&
  (media.status === "staged" || media.status === "delete-pending");

const findMediaByLegacyUrl = async (MediaObjectModel, legacyUrl) => {
  const result = await resolveQuery(MediaObjectModel.find({ legacyUrl }));
  return Array.isArray(result) ? result : [];
};

const legacyFilePath = (mediaClass, filename) =>
  path.join(process.cwd(), "uploads", mediaClass === PROFILE_MEDIA_CLASSES.CERTIFICATION ? "certifications" : "avatars", filename);

const reservationKeys = (reference) => {
  const digest = createHash("sha256").update(`${String(reference.ownerId)}\u0000${reference.mediaClass}\u0000${reference.legacyUrl}`).digest("hex");
  const hex = digest.slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const uuid = `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
  return { storageKey: `${uuid}${path.extname(reference.legacyUrl).toLowerCase()}`, stageKey: `${uuid}.stage` };
};

const isDuplicateKey = (error) => error?.code === 11000 || error?.codeName === "DuplicateKey";

const stageBackfillProfileMedia = async ({ file, ownerId, mediaClass, MediaObjectModel, mediaStore = profileMediaStore() }) => {
  const bytes = await fs.readFile(file.path);
  const legacyUrl = `/uploads/${mediaClass === PROFILE_MEDIA_CLASSES.CERTIFICATION ? "certifications" : "avatars"}/${file.filename}`;
  const keys = reservationKeys({ ownerId, mediaClass, legacyUrl });
  let created;
  try {
    created = await MediaObjectModel.create({
      provider: mediaStore.provider || "local",
      ...keys,
      status: MEDIA_OBJECT_STATES.STAGED,
      contentType: "",
      byteSize: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      originalFilename: file.originalname || file.filename,
      legacyUrl,
      mediaClass,
      access: "public",
      ownerModel: "User",
      ownerId,
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const winner = await findMediaByLegacyUrl(MediaObjectModel, legacyUrl);
    if (winner.length === 1 && (isExactExistingMapping(winner[0], { ownerId, mediaClass, legacyUrl }) || isExactRecoverableMapping(winner[0], { ownerId, mediaClass, legacyUrl }))) {
      return { reused: true, media: winner[0] };
    }
    throw new Error("Backfill reservation collided with an incompatible profile media mapping");
  }
  try {
    await mediaStore.stage({ buffer: bytes, extension: path.extname(file.filename), storageKey: created.storageKey, stageKey: created.stageKey });
    await mediaStore.promote({ storageKey: created.storageKey, stageKey: created.stageKey });
    return created;
  } catch (error) {
    await MediaObjectModel.findByIdAndUpdate(created._id, { $set: { status: MEDIA_OBJECT_STATES.DELETE_PENDING, deletePendingAt: new Date() } }, { runValidators: true }).catch(() => {});
    throw error;
  }
};

export const verifyPromotedBytes = async (media, mediaStore = profileMediaStore()) => {
  if (!media?.storageKey || !Number.isSafeInteger(media.byteSize) || typeof media.checksumSha256 !== "string" || !media.checksumSha256) return false;
  let stream;
  try {
    stream = await mediaStore.createReadStream(media.storageKey);
    const hash = createHash("sha256");
    let byteSize = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteSize += bytes.length;
      hash.update(bytes);
    }
    return byteSize === media.byteSize && hash.digest("hex") === media.checksumSha256;
  } catch {
    return false;
  } finally {
    stream?.destroy?.();
  }
};

const activateExactRecoverableMapping = async ({ MediaObjectModel, media, reference, expectedStatus = media?.status }) => {
  const activated = await MediaObjectModel.findOneAndUpdate(
    {
      _id: media?._id,
      ownerModel: "User",
      ownerId: reference.ownerId,
      mediaClass: reference.mediaClass,
      legacyUrl: reference.legacyUrl,
      status: expectedStatus,
      storageKey: media.storageKey,
      stageKey: media.stageKey,
      byteSize: media.byteSize,
      checksumSha256: media.checksumSha256,
    },
    { $set: { status: "active", stageKey: "", activatedAt: new Date() }, $unset: { deletePendingAt: "" } },
    { new: true, runValidators: true }
  );
  if (!isExactExistingMapping(activated, reference)) {
    throw new Error("Could not activate exact staged profile media mapping");
  }
  return activated;
};

export const runProfileMediaBackfill = async ({
  write = false,
  UserModel = User,
  BarberProfileModel = BarberProfile,
  MediaObjectModel = MediaObject,
  stage = stageBackfillProfileMedia,
  hasPromoted = verifyPromotedBytes,
  activate = activateExactRecoverableMapping,
  fileExists = (filePath) => fs.stat(filePath),
  mediaStore = profileMediaStore(),
} = {}) => {
  const [users, profiles] = await Promise.all([UserModel.find({}).select("avatarUrl"), BarberProfileModel.find({}).select("barberId imageUrl certifications.imageUrl")]);
  const references = collectProfileMediaReferences({ users, profiles });
  const byUrl = new Map();
  for (const reference of references) {
    const key = `${reference.mediaClass}:${reference.legacyUrl}`;
    byUrl.set(key, [...(byUrl.get(key) || []), reference]);
  }
  const result = { mode: write ? "write" : "dry-run", scanned: references.length, created: 0, recovered: 0, ambiguous: 0, collisions: 0, missing: 0, existing: 0 };
  for (const [, entries] of [...byUrl.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ownerKeys = new Set(entries.map((entry) => `${String(entry.ownerId)}:${entry.mediaClass}`));
    if (ownerKeys.size !== 1) { result.ambiguous += 1; continue; }
    const entry = entries[0];
    const existing = await findMediaByLegacyUrl(MediaObjectModel, entry.legacyUrl);
    if (existing.length) {
      if (existing.length === 1 && isExactExistingMapping(existing[0], entry)) {
        result.existing += 1;
      } else if (existing.length === 1 && isExactRecoverableMapping(existing[0], entry) && await hasPromoted(existing[0], mediaStore)) {
        if (write) await activate({ MediaObjectModel, media: existing[0], reference: entry, expectedStatus: existing[0].status });
        result.recovered += 1;
      } else {
        result.collisions += 1;
      }
      continue;
    }
    const filename = path.basename(entry.legacyUrl);
    const filePath = legacyFilePath(entry.mediaClass, filename);
    try { await fileExists(filePath); } catch { result.missing += 1; continue; }
    if (write) {
      const stagedResult = await stage({
        file: { filename, originalname: filename, path: filePath },
        ownerId: entry.ownerId,
        mediaClass: entry.mediaClass,
        MediaObjectModel,
        mediaStore,
      });
      const staged = stagedResult?.media || stagedResult;
      if (stagedResult?.reused) {
        if (isExactExistingMapping(staged, entry)) { result.existing += 1; continue; }
        if (isExactRecoverableMapping(staged, entry) && await hasPromoted(staged, mediaStore)) {
          if (write) await activate({ MediaObjectModel, media: staged, reference: entry, expectedStatus: staged.status });
          result.recovered += 1;
          continue;
        }
        result.collisions += 1;
        continue;
      }
      if (!isExactStagedMapping(staged, entry)) {
        throw new Error("Staged profile media mapping did not match its legacy reference");
      }
      await activate({ MediaObjectModel, media: staged, reference: entry });
      result.created += 1;
    }
  }
  if (result.ambiguous || result.collisions) {
    throw Object.assign(new Error("Ambiguous or unrecoverable profile media references"), { result });
  }
  return result;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes("--write");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  try { process.stdout.write(`${JSON.stringify(await runProfileMediaBackfill({ write }))}\n`); } finally { await mongoose.disconnect(); }
}
