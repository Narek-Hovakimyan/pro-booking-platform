import fs from "node:fs/promises";
import path from "node:path";

import mongoose from "mongoose";
import BarberProfile from "../src/models/BarberProfile.js";
import MediaObject from "../src/models/MediaObject.js";
import User from "../src/models/User.js";
import { PROFILE_MEDIA_CLASSES, stageProfileMedia } from "../src/services/media/profileMediaService.js";

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

const findMediaByLegacyUrl = async (MediaObjectModel, legacyUrl) => {
  const result = await resolveQuery(MediaObjectModel.find({ legacyUrl }));
  return Array.isArray(result) ? result : [];
};

export const runProfileMediaBackfill = async ({ write = false, UserModel = User, BarberProfileModel = BarberProfile, MediaObjectModel = MediaObject } = {}) => {
  const [users, profiles] = await Promise.all([UserModel.find({}).select("avatarUrl"), BarberProfileModel.find({}).select("barberId imageUrl certifications.imageUrl")]);
  const references = collectProfileMediaReferences({ users, profiles });
  const byUrl = new Map();
  for (const reference of references) {
    const key = `${reference.mediaClass}:${reference.legacyUrl}`;
    byUrl.set(key, [...(byUrl.get(key) || []), reference]);
  }
  const result = { mode: write ? "write" : "dry-run", scanned: references.length, created: 0, ambiguous: 0, collisions: 0, missing: 0, existing: 0 };
  for (const [, entries] of [...byUrl.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ownerKeys = new Set(entries.map((entry) => `${String(entry.ownerId)}:${entry.mediaClass}`));
    if (ownerKeys.size !== 1) { result.ambiguous += 1; continue; }
    const entry = entries[0];
    const existing = await findMediaByLegacyUrl(MediaObjectModel, entry.legacyUrl);
    if (existing.length) {
      if (existing.length === 1 && isExactExistingMapping(existing[0], entry)) {
        result.existing += 1;
      } else {
        result.collisions += 1;
      }
      continue;
    }
    const filename = path.basename(entry.legacyUrl);
    try { await fs.stat(path.join(process.cwd(), "uploads", entry.mediaClass === PROFILE_MEDIA_CLASSES.CERTIFICATION ? "certifications" : "avatars", filename)); } catch { result.missing += 1; continue; }
    if (write) {
      await stageProfileMedia({
        file: { filename, originalname: filename, path: path.join(process.cwd(), "uploads", entry.mediaClass === PROFILE_MEDIA_CLASSES.CERTIFICATION ? "certifications" : "avatars", filename) },
        ownerId: entry.ownerId,
        mediaClass: entry.mediaClass,
        MediaObjectModel,
      });
      result.created += 1;
    }
  }
  if (result.ambiguous || result.collisions) {
    throw Object.assign(new Error("Ambiguous or incompatible profile media references"), { result });
  }
  return result;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes("--write");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  try { process.stdout.write(`${JSON.stringify(await runProfileMediaBackfill({ write }))}\n`); } finally { await mongoose.disconnect(); }
}
