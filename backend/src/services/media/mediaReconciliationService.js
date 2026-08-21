import { randomUUID } from "node:crypto";

import Booking from "../../models/Booking.js";
import MediaObject, {
  buildMediaLifecycleTimestamps,
  MEDIA_OBJECT_STATES,
} from "../../models/MediaObject.js";
import PortfolioPhoto from "../../models/PortfolioPhoto.js";
import BarberProfile from "../../models/BarberProfile.js";
import User from "../../models/User.js";
import { normalizeBookingReferenceImagePath } from "../booking/bookingReferenceImageHelpers.js";
import { LocalMediaStore } from "./localMediaStore.js";

export const MEDIA_RECONCILIATION_JOB_KEY = "media-reconciliation";
export const DEFAULT_MEDIA_RECONCILIATION_BATCH_SIZE = 25;
export const DEFAULT_MEDIA_RECONCILIATION_LEASE_TTL_MS = 60 * 1000;
export const DEFAULT_MEDIA_RECONCILIATION_STAGE_AGE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MEDIA_RECONCILIATION_RETRY_LIMIT = 8;
export const DEFAULT_MEDIA_RECONCILIATION_RETRY_BASE_MS = 30 * 1000;
export const DEFAULT_MEDIA_RECONCILIATION_RETRY_MAX_MS = 6 * 60 * 60 * 1000;

const RECONCILIABLE_STATES = [
  MEDIA_OBJECT_STATES.STAGED,
  MEDIA_OBJECT_STATES.DELETE_PENDING,
  MEDIA_OBJECT_STATES.FAILED,
];
const DELETE_FAILURE_CODES = new Set([
  "BOOKING_REFERENCE_MEDIA_DELETE_PENDING",
  "PORTFOLIO_MEDIA_DELETE_PENDING",
]);
const mediaStoreFor = (mediaObject) =>
  String(mediaObject?.mediaClass || "").startsWith("portfolio-")
    ? new LocalMediaStore({ root: `${process.cwd()}/uploads/.portfolio-media-store` })
    : String(mediaObject?.mediaClass || "").startsWith("profile-")
      ? new LocalMediaStore({ root: `${process.cwd()}/uploads/.profile-media-store` })
    : new LocalMediaStore({ root: `${process.cwd()}/uploads/.booking-reference-media-store` });

const getNow = (now) => {
  const value = typeof now === "function" ? now() : now;
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
};

const asId = (value) => (value == null ? "" : String(value));

const queryResult = async (result) => {
  if (result && typeof result.lean === "function") return result.lean();
  return result;
};

const findOne = async (Model, query, options = {}) => {
  if (typeof Model?.findOne !== "function") throw new Error("reference lookup unavailable");
  let result = Model.findOne(query, null, options);
  if (result && typeof result.select === "function" && options.select) result = result.select(options.select);
  return queryResult(result);
};

const findDue = async ({ MediaObjectModel, now, limit }) => {
  const current = getNow(now);
  const result = MediaObjectModel.find({
    status: { $in: RECONCILIABLE_STATES },
    reconciliationManual: { $ne: true },
    $and: [
      { $or: [{ nextReconciliationAt: null }, { nextReconciliationAt: { $lte: current } }] },
      { $or: [{ reconciliationLeaseExpiresAt: null }, { reconciliationLeaseExpiresAt: { $lte: current } }] },
      { $or: [{ status: { $ne: MEDIA_OBJECT_STATES.STAGED } }, { createdAt: { $lte: new Date(current.getTime() - DEFAULT_MEDIA_RECONCILIATION_STAGE_AGE_MS) } }] },
    ],
  })
    .sort({ nextReconciliationAt: 1, createdAt: 1 })
    .limit(limit);
  return queryResult(result);
};

const acquireLease = async ({ MediaObjectModel, mediaObjectId, now, tokenFactory, leaseTtlMs }) => {
  const current = getNow(now);
  const token = tokenFactory();
  const result = await MediaObjectModel.findOneAndUpdate(
    {
      _id: mediaObjectId,
      status: { $in: RECONCILIABLE_STATES },
      reconciliationManual: { $ne: true },
      $or: [{ reconciliationLeaseExpiresAt: null }, { reconciliationLeaseExpiresAt: { $lte: current } }],
      $and: [{ $or: [{ nextReconciliationAt: null }, { nextReconciliationAt: { $lte: current } }] }],
    },
    {
      $set: {
        reconciliationLeaseToken: token,
        reconciliationLeaseExpiresAt: new Date(current.getTime() + leaseTtlMs),
      },
      $inc: { reconciliationFencingToken: 1 },
    },
    { new: true, returnDocument: "after", runValidators: true }
  );
  if (!result || asId(result.reconciliationLeaseToken) !== token) return null;
  return { object: result, token, fencingToken: result.reconciliationFencingToken };
};

const referencePaths = (legacyUrl) => [legacyUrl, legacyUrl ? `/${legacyUrl.replace(/^\/+/, "")}` : ""].filter(Boolean);

const bookingReferencePaths = (legacyUrl) => {
  const normalized = normalizeBookingReferenceImagePath(legacyUrl);
  return normalized ? [normalized, `/${normalized}`] : [];
};

const checkReferences = async ({ mediaObject, BookingModel, PortfolioPhotoModel, UserModel, BarberProfileModel, allowMissingOwner = false }) => {
  const paths = referencePaths(mediaObject.legacyUrl);
  try {
    if (mediaObject.ownerModel === "Booking" || mediaObject.mediaClass === "booking-reference") {
      const bookingPaths = bookingReferencePaths(mediaObject.legacyUrl);
      if (!bookingPaths.length) {
        return { referenced: false, ambiguous: true, reason: "invalid_booking_reference_metadata" };
      }
      const booking = await findOne(BookingModel, { referenceImages: { $in: bookingPaths } });
      if (booking) return { referenced: true, ambiguous: false };
    }
    if (mediaObject.ownerModel === "PortfolioPhoto" || String(mediaObject.mediaClass || "").startsWith("portfolio-")) {
      const portfolio = await findOne(PortfolioPhotoModel, {
        $or: [
          { beforeMediaObjectId: mediaObject._id },
          { afterMediaObjectId: mediaObject._id },
          ...(paths.length ? [{ beforeUrl: { $in: paths } }, { afterUrl: { $in: paths } }] : []),
        ],
      });
      if (portfolio) return { referenced: true, ambiguous: false };
    }
    if (mediaObject.ownerModel === "User" || String(mediaObject.mediaClass || "").startsWith("profile-")) {
      const user = await findOne(UserModel, { _id: mediaObject.ownerId, avatarUrl: mediaObject.legacyUrl });
      const profile = await findOne(
        BarberProfileModel,
        mediaObject.mediaClass === "profile-certification"
          ? { barberId: mediaObject.ownerId, "certifications.imageUrl": mediaObject.legacyUrl }
          : { barberId: mediaObject.ownerId, imageUrl: mediaObject.legacyUrl }
      );
      if (user || profile) return { referenced: true, ambiguous: false };
    }
    if (!mediaObject.ownerModel && mediaObject.status === MEDIA_OBJECT_STATES.STAGED) {
      const booking = await findOne(BookingModel, { referenceImages: { $in: paths } });
      const portfolio = await findOne(PortfolioPhotoModel, {
        $or: [
          ...(paths.length ? [{ beforeUrl: { $in: paths } }, { afterUrl: { $in: paths } }] : []),
          { beforeMediaObjectId: mediaObject._id },
          { afterMediaObjectId: mediaObject._id },
        ],
      });
      if (booking || portfolio) return { referenced: true, ambiguous: false };
    }
    if (!mediaObject.ownerModel && mediaObject.status === MEDIA_OBJECT_STATES.DELETE_PENDING && !allowMissingOwner) {
      return { referenced: false, ambiguous: true, reason: "missing_owner" };
    }
    if (!mediaObject.ownerModel && allowMissingOwner) {
      return { referenced: false, ambiguous: false };
    }
    if (mediaObject.ownerModel && !["Booking", "PortfolioPhoto", "User"].includes(mediaObject.ownerModel)) {
      return { referenced: false, ambiguous: true, reason: "unknown_owner_model" };
    }
    return { referenced: false, ambiguous: false };
  } catch {
    return { referenced: false, ambiguous: true, reason: "reference_lookup_failed" };
  }
};

const releaseLease = async ({
  MediaObjectModel,
  mediaObject,
  token,
  fencingToken,
  expectedStatus,
  update = {},
}) =>
  MediaObjectModel.findOneAndUpdate(
    {
      _id: mediaObject._id,
      reconciliationLeaseToken: token,
      reconciliationFencingToken: fencingToken,
      status: expectedStatus,
    },
    {
      $set: update,
      $unset: { reconciliationLeaseToken: "", reconciliationLeaseExpiresAt: "" },
    },
    { new: true, returnDocument: "after", runValidators: true }
  );

const retryDelay = (retryCount, baseMs, maxMs) =>
  Math.min(maxMs, baseMs * 2 ** Math.max(0, retryCount));

const scheduleRetry = async ({ MediaObjectModel, mediaObject, token, fencingToken, expectedStatus, now, error, retryLimit, retryBaseMs, retryMaxMs }) => {
  const current = getNow(now);
  const nextCount = Number(mediaObject.reconciliationRetryCount || 0) + 1;
  const manual = nextCount >= retryLimit;
  const safeError = String(error?.message || error || "reconciliation failed").slice(0, 512);
  return releaseLease({
    MediaObjectModel,
    mediaObject,
    token,
    fencingToken,
    expectedStatus,
    update: {
      reconciliationRetryCount: nextCount,
      nextReconciliationAt: manual ? null : new Date(current.getTime() + retryDelay(nextCount, retryBaseMs, retryMaxMs)),
      lastReconciliationError: safeError,
      reconciliationManual: manual,
    },
  });
};

const finalizeDeleted = async ({ MediaObjectModel, mediaObject, token, fencingToken, expectedStatus, now }) =>
  releaseLease({
    MediaObjectModel,
    mediaObject,
    token,
    fencingToken,
    expectedStatus,
    update: {
      status: MEDIA_OBJECT_STATES.DELETED,
      ...buildMediaLifecycleTimestamps(MEDIA_OBJECT_STATES.DELETED, getNow(now)),
      reconciliationRetryCount: 0,
      nextReconciliationAt: null,
      lastReconciliationError: "",
      reconciliationManual: false,
    },
  });

const finalizeStagedWithoutStorage = async ({ MediaObjectModel, mediaObject, token, fencingToken, expectedStatus, now }) =>
  scheduleRetry({
    MediaObjectModel,
    mediaObject,
    token,
    fencingToken,
    expectedStatus,
    now,
    error: new Error("staged storage mutation is unavailable"),
    retryLimit: 1,
    retryBaseMs: DEFAULT_MEDIA_RECONCILIATION_RETRY_BASE_MS,
    retryMaxMs: DEFAULT_MEDIA_RECONCILIATION_RETRY_MAX_MS,
  });

const deleteStorage = async ({ mediaStore, mediaObject }) => {
  if (mediaObject.stageKey && typeof mediaStore.deleteStaged === "function") {
    return mediaStore.deleteStaged(mediaObject.stageKey);
  }
  if (mediaObject.stageKey) return { unavailable: true };
  return mediaStore.delete(mediaObject.storageKey);
};

export const reconcileMediaObject = async ({
  mediaObjectId,
  now = () => new Date(),
  MediaObjectModel = MediaObject,
  BookingModel = Booking,
  PortfolioPhotoModel = PortfolioPhoto,
  UserModel = User,
  BarberProfileModel = BarberProfile,
  mediaStore,
  tokenFactory = randomUUID,
  leaseTtlMs = DEFAULT_MEDIA_RECONCILIATION_LEASE_TTL_MS,
  retryLimit = DEFAULT_MEDIA_RECONCILIATION_RETRY_LIMIT,
  retryBaseMs = DEFAULT_MEDIA_RECONCILIATION_RETRY_BASE_MS,
  retryMaxMs = DEFAULT_MEDIA_RECONCILIATION_RETRY_MAX_MS,
  leaseContext = null,
} = {}) => {
  const lease = await acquireLease({ MediaObjectModel, mediaObjectId, now, tokenFactory, leaseTtlMs });
  if (!lease) return { processed: false, reason: "not_due_or_contended" };
  const { object: mediaObject, token, fencingToken } = lease;
  const wasStaged = mediaObject.status === MEDIA_OBJECT_STATES.STAGED;

  if (mediaObject.status === MEDIA_OBJECT_STATES.STAGED) {
    const claimed = await MediaObjectModel.findOneAndUpdate(
      {
        _id: mediaObject._id,
        reconciliationLeaseToken: token,
        reconciliationFencingToken: fencingToken,
        status: MEDIA_OBJECT_STATES.STAGED,
      },
      { $set: { status: MEDIA_OBJECT_STATES.DELETE_PENDING, ...buildMediaLifecycleTimestamps(MEDIA_OBJECT_STATES.DELETE_PENDING, getNow(now)) } },
      { new: true, returnDocument: "after", runValidators: true }
    );
    if (!claimed) return { processed: false, reason: "lease_lost" };
    mediaObject.status = claimed.status;
    mediaObject.deletePendingAt = claimed.deletePendingAt;
  }
  let ownedStatus = mediaObject.status;

  const effectiveMediaStore = mediaStore || mediaStoreFor(mediaObject);

  await leaseContext?.assertOwned?.();

  if (mediaObject.status === MEDIA_OBJECT_STATES.FAILED && !DELETE_FAILURE_CODES.has(mediaObject.failureCode)) {
    const released = await releaseLease({
      MediaObjectModel,
      mediaObject,
      token,
      fencingToken,
      expectedStatus: MEDIA_OBJECT_STATES.FAILED,
      update: { reconciliationManual: true, lastReconciliationError: "failed state requires manual reconciliation" },
    });
    return { processed: false, reason: released ? "manual_required" : "lease_lost" };
  }

  const references = await checkReferences({ mediaObject, BookingModel, PortfolioPhotoModel, UserModel, BarberProfileModel, allowMissingOwner: wasStaged });
  if (references.referenced || references.ambiguous) {
    const retried = await scheduleRetry({ MediaObjectModel, mediaObject, token, fencingToken, expectedStatus: ownedStatus, now, error: new Error(references.reason || "media reference is not safely absent"), retryLimit, retryBaseMs, retryMaxMs });
    return { processed: false, reason: retried ? (references.referenced ? "referenced" : "ambiguous") : "lease_lost" };
  }

  if (mediaObject.status === MEDIA_OBJECT_STATES.DELETE_PENDING && mediaObject.stageKey) {
    const finalized = await finalizeStagedWithoutStorage({ MediaObjectModel, mediaObject, token, fencingToken, expectedStatus: MEDIA_OBJECT_STATES.DELETE_PENDING, now });
    return { processed: false, reason: finalized ? "staged_storage_unavailable" : "lease_lost" };
  }

  try {
    const current = await findOne(MediaObjectModel, { _id: mediaObject._id, reconciliationLeaseToken: token, status: { $in: [MEDIA_OBJECT_STATES.STAGED, MEDIA_OBJECT_STATES.DELETE_PENDING, MEDIA_OBJECT_STATES.FAILED] } });
    if (!current) return { processed: false, reason: "lease_lost" };
    ownedStatus = current.status;
    const latestReferences = await checkReferences({ mediaObject: current, BookingModel, PortfolioPhotoModel, UserModel, BarberProfileModel, allowMissingOwner: wasStaged });
    if (latestReferences.referenced || latestReferences.ambiguous) {
      const retried = await scheduleRetry({ MediaObjectModel, mediaObject: current, token, fencingToken, expectedStatus: ownedStatus, now, error: new Error(latestReferences.reason || "media reference changed"), retryLimit, retryBaseMs, retryMaxMs });
      return { processed: false, reason: retried ? (latestReferences.referenced ? "referenced" : "ambiguous") : "lease_lost" };
    }
    await leaseContext?.assertOwned?.();
    const deletion = await deleteStorage({ mediaStore: effectiveMediaStore, mediaObject: current });
    if (deletion?.unavailable) {
      const finalized = await finalizeStagedWithoutStorage({ MediaObjectModel, mediaObject: current, token, fencingToken, expectedStatus: ownedStatus, now });
      return { processed: false, reason: finalized ? "staged_storage_unavailable" : "lease_lost" };
    }
    await leaseContext?.assertOwned?.();
    const finalized = await finalizeDeleted({ MediaObjectModel, mediaObject: current, token, fencingToken, expectedStatus: ownedStatus, now });
    return finalized
      ? { processed: true, status: MEDIA_OBJECT_STATES.DELETED }
      : { processed: false, reason: "lease_lost" };
  } catch (error) {
    const retried = await scheduleRetry({ MediaObjectModel, mediaObject, token, fencingToken, expectedStatus: ownedStatus, now, error, retryLimit, retryBaseMs, retryMaxMs });
    return { processed: false, reason: retried ? "retry_scheduled" : "lease_lost" };
  }
};

export const reconcileDueMediaObjects = async ({
  now = () => new Date(),
  batchSize = DEFAULT_MEDIA_RECONCILIATION_BATCH_SIZE,
  MediaObjectModel = MediaObject,
  ...options
} = {}) => {
  const due = await findDue({ MediaObjectModel, now, limit: batchSize });
  const results = [];
  for (const mediaObject of due) {
    results.push(await reconcileMediaObject({ ...options, now, MediaObjectModel, mediaObjectId: mediaObject._id }));
  }
  return { scanned: due.length, results };
};

export const __mediaReconciliationTestHooks = {
  findDue,
  acquireLease,
  checkReferences,
  retryDelay,
};
