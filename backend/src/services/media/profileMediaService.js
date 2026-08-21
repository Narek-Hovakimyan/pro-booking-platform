import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import mongoose from "mongoose";

import MediaObject, { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import BarberProfile from "../../models/BarberProfile.js";
import User from "../../models/User.js";
import { LocalMediaStore } from "./localMediaStore.js";
import { resolveMediaStageKeys } from "./mediaStore.js";

export const PROFILE_MEDIA_CLASSES = Object.freeze({
  AVATAR: "profile-avatar",
  CERTIFICATION: "profile-certification",
});
const classes = new Set(Object.values(PROFILE_MEDIA_CLASSES));
const root = path.join(process.cwd(), "uploads", ".profile-media-store");
let store;

export const isProfileMediaClass = (value) => classes.has(value);
export const profileMediaUrl = (mediaClass, filename) =>
  `/uploads/${mediaClass === PROFILE_MEDIA_CLASSES.CERTIFICATION ? "certifications" : "avatars"}/${filename}`;
export const profileMediaStore = () =>
  store || (store = new LocalMediaStore({ root }));

const extensionFor = (file) => path.extname(file?.originalname || file?.filename || "");
const readBytes = (file) =>
  Buffer.isBuffer(file?.buffer)
    ? Promise.resolve(file.buffer)
    : typeof file?.path === "string" && file.path
      ? fs.readFile(file.path)
      : Promise.reject(new Error("Profile upload is unavailable"));

export class ProfileAvatarConflictError extends Error {
  constructor() {
    super("Profile avatar was changed; refresh and retry");
    this.name = "ProfileAvatarConflictError";
    this.statusCode = 409;
  }
}

export class ProfileMediaTransactionError extends Error {
  constructor() {
    super("Profile media requires transaction support");
    this.name = "ProfileMediaTransactionError";
    this.statusCode = 503;
  }
}

const markPending = async (MediaObjectModel, id) => {
  if (!id) return;
  await MediaObjectModel.findByIdAndUpdate(
    id,
    { $set: { status: MEDIA_OBJECT_STATES.DELETE_PENDING, deletePendingAt: new Date() } },
    { runValidators: true }
  ).catch(() => {});
};

const hasUnknownCommit = (error) =>
  error?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
  error?.errorLabels?.includes("UnknownTransactionCommitResult");

const readUser = async (UserModel, ownerId) => { const query = UserModel.findById(ownerId); return typeof query?.lean === "function" ? query.lean() : query; };
const readOne = async (Model, filter) => { const query = Model.findOne(filter); return typeof query?.lean === "function" ? query.lean() : query; };
const replacementProvenNotCommitted = async ({ staged, ownerId, expectedUserAvatarUrl, expectedProfileImageUrl, UserModel, BarberProfileModel, MediaObjectModel, requireProfile }) => {
  const [media, user, profile, liveUser, liveProfile] = await Promise.all([
    readUser(MediaObjectModel, staged._id),
    readUser(UserModel, ownerId),
    requireProfile ? readOne(BarberProfileModel, { barberId: ownerId }) : null,
    readOne(UserModel, { avatarUrl: staged.legacyUrl }),
    readOne(BarberProfileModel, { imageUrl: staged.legacyUrl }),
  ]);
  return media?.status === MEDIA_OBJECT_STATES.STAGED && user?.avatarUrl === expectedUserAvatarUrl &&
    (!requireProfile || profile?.imageUrl === expectedProfileImageUrl) && !liveUser && !liveProfile;
};
export const stageProfileMedia = async ({
  file,
  ownerId,
  mediaClass,
  MediaObjectModel = MediaObject,
  mediaStore = profileMediaStore(),
} = {}) => {
  if (!file?.filename || !ownerId || !isProfileMediaClass(mediaClass)) {
    throw new Error("Invalid profile media upload");
  }
  const bytes = await readBytes(file);
  const { storageKey, stageKey } = resolveMediaStageKeys({ extension: extensionFor(file) });
  const legacyUrl = profileMediaUrl(mediaClass, file.filename);
  const created = await MediaObjectModel.create({
    provider: mediaStore.provider || "local",
    storageKey,
    stageKey,
    status: MEDIA_OBJECT_STATES.STAGED,
    contentType: file.mimetype || "",
    byteSize: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    originalFilename: file.originalname || "",
    legacyUrl,
    mediaClass,
    access: "public",
    ownerModel: "User",
    ownerId,
  });
  try {
    await mediaStore.stage({ buffer: bytes, extension: extensionFor(file), storageKey, stageKey });
    await mediaStore.promote({ storageKey, stageKey });
    return created;
  } catch (error) {
    await markPending(MediaObjectModel, created._id);
    throw error;
  }
};

const activateStagedUserAvatar = (MediaObjectModel, id, session) =>
  MediaObjectModel.findOneAndUpdate(
    {
      _id: id,
      ownerModel: "User",
      mediaClass: PROFILE_MEDIA_CLASSES.AVATAR,
      status: MEDIA_OBJECT_STATES.STAGED,
    },
    { $set: { status: MEDIA_OBJECT_STATES.ACTIVE, stageKey: "", activatedAt: new Date() } },
    { new: true, runValidators: true, session }
  );

const retireOwnedUserAvatar = (MediaObjectModel, ownerId, legacyUrl, session) => {
  if (!legacyUrl) return Promise.resolve(null);
  return MediaObjectModel.findOneAndUpdate(
    {
      ownerModel: "User",
      ownerId,
      legacyUrl,
      mediaClass: PROFILE_MEDIA_CLASSES.AVATAR,
      status: MEDIA_OBJECT_STATES.ACTIVE,
    },
    { $set: { status: MEDIA_OBJECT_STATES.DELETE_PENDING, deletePendingAt: new Date() } },
    { new: true, runValidators: true, session }
  );
};

export const replaceUserAvatarAtomically = async ({
  ownerId,
  expectedAvatarUrl = "",
  file,
  UserModel = User,
  BarberProfileModel = BarberProfile,
  MediaObjectModel = MediaObject,
  mediaStore = profileMediaStore(),
  startSession = () => mongoose.connection.startSession(),
} = {}) => {
  if (!ownerId || !file?.filename) throw new Error("Invalid profile avatar upload");
  const staged = await stageProfileMedia({
    file,
    ownerId,
    mediaClass: PROFILE_MEDIA_CLASSES.AVATAR,
    MediaObjectModel,
    mediaStore,
  });
  let session;
  let nonCommitProven = false;
  try {
    session = await startSession();
    if (!session?.withTransaction) throw new ProfileMediaTransactionError();
    let user;
    await session.withTransaction(async () => {
      user = await UserModel.findOneAndUpdate(
        { _id: ownerId, avatarUrl: expectedAvatarUrl },
        { $set: { avatarUrl: staged.legacyUrl } },
        { new: true, runValidators: true, session }
      );
      if (!user) throw new ProfileAvatarConflictError();
      if (!await activateStagedUserAvatar(MediaObjectModel, staged._id, session)) {
        throw new Error("Could not activate profile avatar");
      }
      await retireOwnedUserAvatar(MediaObjectModel, ownerId, expectedAvatarUrl, session);
    });
    return user;
  } catch (error) {
    if (hasUnknownCommit(error)) {
      try {
        const current = await readUser(UserModel, ownerId);
        if (current?.avatarUrl === staged.legacyUrl) return current;
        const didNotCommit = await replacementProvenNotCommitted({
          staged, ownerId, expectedUserAvatarUrl: expectedAvatarUrl, UserModel, BarberProfileModel, MediaObjectModel,
        });
        if (didNotCommit) { nonCommitProven = true; await markPending(MediaObjectModel, staged._id); }
        else error.profileMediaCommitOutcomeUnknown = true;
      } catch {}
      if (!nonCommitProven) error.profileMediaCommitOutcomeUnknown = true;
      throw error;
    }
    await markPending(MediaObjectModel, staged._id);
    throw error;
  } finally {
    await session?.endSession?.().catch(() => {});
  }
};

export const clearUserAvatarAtomically = async ({
  ownerId,
  expectedAvatarUrl,
  UserModel = User,
  MediaObjectModel = MediaObject,
  startSession = () => mongoose.connection.startSession(),
} = {}) => {
  if (!ownerId || typeof expectedAvatarUrl !== "string") {
    throw new Error("Invalid profile avatar clear");
  }
  let session;
  try {
    session = await startSession();
    if (!session?.withTransaction) throw new ProfileMediaTransactionError();
    let user;
    await session.withTransaction(async () => {
      user = await UserModel.findOneAndUpdate(
        { _id: ownerId, avatarUrl: expectedAvatarUrl },
        { $set: { avatarUrl: "" } },
        { new: true, runValidators: true, session }
      );
      if (!user) throw new ProfileAvatarConflictError();
      await retireOwnedUserAvatar(MediaObjectModel, ownerId, expectedAvatarUrl, session);
    });
    return user;
  } finally {
    await session?.endSession?.().catch(() => {});
  }
};

const updateBarberProfileImage = (BarberProfileModel, ownerId, expectedImageUrl, imageUrl, session) =>
  BarberProfileModel.findOneAndUpdate(
    { barberId: ownerId, imageUrl: expectedImageUrl },
    { $set: { imageUrl }, $setOnInsert: { barberId: ownerId } },
    { new: true, upsert: true, runValidators: true, session }
  );

export const replaceBarberProfileAvatarAtomically = async ({
  ownerId,
  expectedUserAvatarUrl = "",
  expectedProfileImageUrl = "",
  file,
  UserModel = User,
  BarberProfileModel = BarberProfile,
  MediaObjectModel = MediaObject,
  mediaStore = profileMediaStore(),
  startSession = () => mongoose.connection.startSession(),
} = {}) => {
  if (!ownerId || !file?.filename) throw new Error("Invalid barber profile avatar upload");
  const staged = await stageProfileMedia({
    file,
    ownerId,
    mediaClass: PROFILE_MEDIA_CLASSES.AVATAR,
    MediaObjectModel,
    mediaStore,
  });
  let session;
  let nonCommitProven = false;
  try {
    session = await startSession();
    if (!session?.withTransaction) throw new ProfileMediaTransactionError();
    let user;
    let profile;
    await session.withTransaction(async () => {
      user = await UserModel.findOneAndUpdate(
        { _id: ownerId, role: "barber", avatarUrl: expectedUserAvatarUrl },
        { $set: { avatarUrl: staged.legacyUrl } },
        { new: true, runValidators: true, session }
      );
      if (!user) throw new ProfileAvatarConflictError();
      profile = await updateBarberProfileImage(
        BarberProfileModel, ownerId, expectedProfileImageUrl, staged.legacyUrl, session
      );
      if (!profile) throw new ProfileAvatarConflictError();
      if (!await activateStagedUserAvatar(MediaObjectModel, staged._id, session)) {
        throw new Error("Could not activate barber profile avatar");
      }
      await Promise.all([
        retireOwnedUserAvatar(MediaObjectModel, ownerId, expectedUserAvatarUrl, session),
        retireOwnedUserAvatar(MediaObjectModel, ownerId, expectedProfileImageUrl, session),
      ]);
    });
    return { user, profile };
  } catch (error) {
    if (hasUnknownCommit(error)) {
      try {
        const [currentUser, currentProfile] = await Promise.all([
          readUser(UserModel, ownerId),
          readOne(BarberProfileModel, { barberId: ownerId }),
        ]);
        if (currentUser?.avatarUrl === staged.legacyUrl && currentProfile?.imageUrl === staged.legacyUrl) return { user: currentUser, profile: currentProfile };
        const didNotCommit = await replacementProvenNotCommitted({
          staged, ownerId, expectedUserAvatarUrl, expectedProfileImageUrl, UserModel, BarberProfileModel, MediaObjectModel, requireProfile: true,
        });
        if (didNotCommit) { nonCommitProven = true; await markPending(MediaObjectModel, staged._id); }
        else error.profileMediaCommitOutcomeUnknown = true;
      } catch {}
      if (!nonCommitProven) error.profileMediaCommitOutcomeUnknown = true;
      throw error;
    }
    await markPending(MediaObjectModel, staged._id);
    throw error;
  } finally {
    await session?.endSession?.().catch(() => {});
  }
};

export const clearBarberProfileAvatarAtomically = async ({
  ownerId,
  expectedUserAvatarUrl,
  expectedProfileImageUrl,
  UserModel = User,
  BarberProfileModel = BarberProfile,
  MediaObjectModel = MediaObject,
  startSession = () => mongoose.connection.startSession(),
} = {}) => {
  if (!ownerId || typeof expectedUserAvatarUrl !== "string" || typeof expectedProfileImageUrl !== "string") {
    throw new Error("Invalid barber profile avatar clear");
  }
  let session;
  try {
    session = await startSession();
    if (!session?.withTransaction) throw new ProfileMediaTransactionError();
    let user;
    let profile;
    await session.withTransaction(async () => {
      user = await UserModel.findOneAndUpdate(
        { _id: ownerId, role: "barber", avatarUrl: expectedUserAvatarUrl },
        { $set: { avatarUrl: "" } },
        { new: true, runValidators: true, session }
      );
      if (!user) throw new ProfileAvatarConflictError();
      profile = await updateBarberProfileImage(
        BarberProfileModel, ownerId, expectedProfileImageUrl, "", session
      );
      if (!profile) throw new ProfileAvatarConflictError();
      await Promise.all([
        retireOwnedUserAvatar(MediaObjectModel, ownerId, expectedUserAvatarUrl, session),
        retireOwnedUserAvatar(MediaObjectModel, ownerId, expectedProfileImageUrl, session),
      ]);
    });
    return { user, profile };
  } finally {
    await session?.endSession?.().catch(() => {});
  }
};

const certificationQuery = (ownerId, certId, imageUrl) => ({
  barberId: ownerId,
  certifications: { $elemMatch: { _id: certId, imageUrl } },
});

const activateCertification = (MediaObjectModel, id, session) =>
  MediaObjectModel.findOneAndUpdate(
    { _id: id, ownerModel: "User", mediaClass: PROFILE_MEDIA_CLASSES.CERTIFICATION, status: MEDIA_OBJECT_STATES.STAGED },
    { $set: { status: MEDIA_OBJECT_STATES.ACTIVE, stageKey: "", activatedAt: new Date() } },
    { returnDocument: "after", runValidators: true, session }
  );

const retireCertification = (MediaObjectModel, ownerId, legacyUrl, session) => {
  if (!legacyUrl) return Promise.resolve(null);
  return MediaObjectModel.findOneAndUpdate(
    { ownerModel: "User", ownerId, legacyUrl, mediaClass: PROFILE_MEDIA_CLASSES.CERTIFICATION, status: MEDIA_OBJECT_STATES.ACTIVE },
    { $set: { status: MEDIA_OBJECT_STATES.DELETE_PENDING, deletePendingAt: new Date() } },
    { returnDocument: "after", runValidators: true, session }
  );
};

const readCertification = async (BarberProfileModel, ownerId, certId) => {
  const profile = await BarberProfileModel.findOne({ barberId: ownerId });
  return profile?.certifications?.id?.(certId) || profile?.certifications?.find((item) => String(item._id) === String(certId)) || null;
};

const certificationFromProfile = (profile, certId) =>
  profile?.certifications?.id?.(certId) ||
  profile?.certifications?.find((item) => String(item._id) === String(certId)) ||
  null;

const safeCertificationUpdate = (updates = {}) => Object.fromEntries(
  ["title", "issuedBy", "issueDate", "expiryDate", "description"]
    .filter((key) => Object.hasOwn(updates, key))
    .map((key) => [`certifications.$.${key}`, updates[key]])
);

export const addProfileCertificationAtomically = async ({
  ownerId, certification, file, BarberProfileModel = BarberProfile, MediaObjectModel = MediaObject,
  mediaStore = profileMediaStore(), startSession = () => mongoose.connection.startSession(),
} = {}) => {
  if (!ownerId || !certification?._id || !file?.filename) throw new Error("Invalid certification upload");
  const staged = await stageProfileMedia({ file, ownerId, mediaClass: PROFILE_MEDIA_CLASSES.CERTIFICATION, MediaObjectModel, mediaStore });
  let session;
  let committed = false;
  try {
    session = await startSession();
    if (!session?.withTransaction) throw new ProfileMediaTransactionError();
    let profile;
    await session.withTransaction(async () => {
      profile = await BarberProfileModel.findOneAndUpdate(
        { barberId: ownerId }, { $push: { certifications: { ...certification, imageUrl: staged.legacyUrl } }, $setOnInsert: { barberId: ownerId } },
        { returnDocument: "after", upsert: true, runValidators: true, session }
      );
      if (!profile || !await activateCertification(MediaObjectModel, staged._id, session)) throw new Error("Could not activate certification media");
    });
    committed = true;
    const current = certificationFromProfile(profile, certification._id);
    if (!current) throw new ProfileMediaTransactionError();
    return { profile, certification: current };
  } catch (error) {
    if (hasUnknownCommit(error)) {
      let current;
      try {
        current = await readCertification(BarberProfileModel, ownerId, certification._id);
      } catch {
        throw new ProfileMediaTransactionError();
      }
      if (current?.imageUrl === staged.legacyUrl) return { profile: null, certification: current };
      throw error;
    }
    if (!committed) await markPending(MediaObjectModel, staged._id);
    throw error;
  } finally { await session?.endSession?.().catch(() => {}); }
};

export const replaceProfileCertificationMediaAtomically = async ({
  ownerId, certId, expectedImageUrl, updates, file, BarberProfileModel = BarberProfile,
  MediaObjectModel = MediaObject, mediaStore = profileMediaStore(), startSession = () => mongoose.connection.startSession(),
} = {}) => {
  if (!ownerId || !certId || typeof expectedImageUrl !== "string" || !file?.filename) throw new Error("Invalid certification media replacement");
  const staged = await stageProfileMedia({ file, ownerId, mediaClass: PROFILE_MEDIA_CLASSES.CERTIFICATION, MediaObjectModel, mediaStore });
  let session;
  let committed = false;
  try {
    session = await startSession();
    if (!session?.withTransaction) throw new ProfileMediaTransactionError();
    let profile;
    await session.withTransaction(async () => {
      profile = await BarberProfileModel.findOneAndUpdate(
        certificationQuery(ownerId, certId, expectedImageUrl),
        { $set: { ...safeCertificationUpdate(updates), "certifications.$.imageUrl": staged.legacyUrl } },
        { returnDocument: "after", runValidators: true, session }
      );
      if (!profile) throw new ProfileAvatarConflictError();
      if (!await activateCertification(MediaObjectModel, staged._id, session)) throw new Error("Could not activate certification media");
      await retireCertification(MediaObjectModel, ownerId, expectedImageUrl, session);
    });
    committed = true;
    const current = certificationFromProfile(profile, certId);
    if (!current) throw new ProfileMediaTransactionError();
    return { profile, certification: current };
  } catch (error) {
    if (hasUnknownCommit(error)) {
      let current;
      try {
        current = await readCertification(BarberProfileModel, ownerId, certId);
      } catch {
        throw new ProfileMediaTransactionError();
      }
      if (current?.imageUrl === staged.legacyUrl) return { profile: null, certification: current };
      throw error;
    }
    if (!committed) await markPending(MediaObjectModel, staged._id);
    throw error;
  } finally { await session?.endSession?.().catch(() => {}); }
};

export const deleteProfileCertificationAtomically = async ({
  ownerId, certId, expectedImageUrl, BarberProfileModel = BarberProfile, MediaObjectModel = MediaObject,
  startSession = () => mongoose.connection.startSession(),
} = {}) => {
  if (!ownerId || !certId || typeof expectedImageUrl !== "string") throw new Error("Invalid certification delete");
  let session;
  try {
    session = await startSession();
    if (!session?.withTransaction) throw new ProfileMediaTransactionError();
    let profile;
    await session.withTransaction(async () => {
      profile = await BarberProfileModel.findOneAndUpdate(
        certificationQuery(ownerId, certId, expectedImageUrl), { $pull: { certifications: { _id: certId, imageUrl: expectedImageUrl } } },
        { returnDocument: "after", runValidators: true, session }
      );
      if (!profile) throw new ProfileAvatarConflictError();
      await retireCertification(MediaObjectModel, ownerId, expectedImageUrl, session);
    });
    return profile;
  } finally { await session?.endSession?.().catch(() => {}); }
};

export const markProfileMediaDeletePending = async ({ ownerId, legacyUrl, MediaObjectModel = MediaObject } = {}) => {
  if (!ownerId || typeof legacyUrl !== "string" || !legacyUrl.startsWith("/uploads/")) return null;
  return MediaObjectModel.findOneAndUpdate(
    { ownerModel: "User", ownerId, legacyUrl, mediaClass: { $in: [...classes] }, status: MEDIA_OBJECT_STATES.ACTIVE },
    { $set: { status: MEDIA_OBJECT_STATES.DELETE_PENDING, deletePendingAt: new Date() } },
    { new: true, runValidators: true }
  );
};

export const openProfileMedia = async ({ legacyUrl, MediaObjectModel = MediaObject, mediaStore = profileMediaStore() } = {}) => {
  const media = await MediaObjectModel.findOne({ legacyUrl, access: "public", status: MEDIA_OBJECT_STATES.ACTIVE, mediaClass: { $in: [...classes] } }).lean();
  if (!media) return null;
  return { media, stream: await mediaStore.createReadStream(media.storageKey) };
};
