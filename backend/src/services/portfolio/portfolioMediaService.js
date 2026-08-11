import { createHash } from "crypto";
import { promises as fs } from "fs";
import mongoose from "mongoose";
import path from "path";

import MediaObject, {
  buildMediaLifecycleTimestamps,
  MEDIA_OBJECT_STATES,
} from "../../models/MediaObject.js";
import PortfolioPhoto from "../../models/PortfolioPhoto.js";
import { getLogger } from "../../config/logger.js";
import { LocalMediaStore } from "../media/localMediaStore.js";
import { isMediaStoreError, resolveMediaStageKeys } from "../media/mediaStore.js";

const PORTFOLIO_MEDIA_ROOT = path.join(process.cwd(), "uploads", ".portfolio-media-store");
const PORTFOLIO_TRANSACTION_REQUIRED_MESSAGE = "Portfolio media requires transaction support";
const PORTFOLIO_COMMIT_UNKNOWN_MESSAGE = "Portfolio media commit outcome is unknown; retry later";
const PORTFOLIO_OWNER_MODEL = "PortfolioPhoto";
const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const TRANSACTION_CAPABLE_TOPOLOGIES = new Set(["ReplicaSetWithPrimary", "Sharded", "LoadBalanced"]);
const UNKNOWN_COMMIT_LABELS = new Set(["UnknownTransactionCommitResult"]);
const MEDIA_FIELDS = Object.freeze({
  before: { mediaClass: "portfolio-before", mediaObjectIdField: "beforeMediaObjectId", urlField: "beforeUrl" },
  after: { mediaClass: "portfolio-after", mediaObjectIdField: "afterMediaObjectId", urlField: "afterUrl" },
});

let defaultMediaStore;
let getLoggerForPortfolioMedia = getLogger;

const SAFE_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const SAFE_MEDIA_STATUSES = new Set(Object.values(MEDIA_OBJECT_STATES));

const getMediaStore = () =>
  defaultMediaStore || (defaultMediaStore = new LocalMediaStore({ root: PORTFOLIO_MEDIA_ROOT }));

const getPortfolioMediaLogger = () => {
  try {
    const logger = getLoggerForPortfolioMedia?.();
    if (!logger || typeof logger.child !== "function") return logger || null;
    return logger.child({ component: "portfolio-media" });
  } catch {
    return null;
  }
};

const getSafeObjectId = (value) => {
  if (typeof value !== "string") return undefined;
  return SAFE_OBJECT_ID_PATTERN.test(value) ? value : undefined;
};

const getSafeMediaStatus = (value) =>
  typeof value === "string" && SAFE_MEDIA_STATUSES.has(value) ? value : undefined;

const logPortfolioMediaPersistenceFailure = ({
  event,
  operation,
  mediaObjectId,
  photoId,
  status,
}) => {
  try {
    getPortfolioMediaLogger()?.warn?.(
      {
        event,
        operation,
        mediaObjectId: getSafeObjectId(mediaObjectId),
        photoId: getSafeObjectId(photoId),
        status: getSafeMediaStatus(status),
        err: { name: "Error" },
      },
      event
    );
  } catch {}
};

const getLogicalSessionTimeoutMinutes = (description) => {
  if (Number.isInteger(description?.logicalSessionTimeoutMinutes)) {
    return description.logicalSessionTimeoutMinutes;
  }
  if (!description?.servers?.values) return null;
  let timeout = null;
  for (const server of description.servers.values()) {
    if (!Number.isInteger(server?.logicalSessionTimeoutMinutes)) continue;
    timeout = timeout == null ? server.logicalSessionTimeoutMinutes : Math.min(timeout, server.logicalSessionTimeoutMinutes);
  }
  return timeout;
};

const connectionSupportsTransactions = (connection = mongoose.connection) => {
  if (connection?.readyState !== 1 || typeof connection?.startSession !== "function") return false;
  const description = connection?.client?.topology?.description;
  return Boolean(
    description?.type &&
      TRANSACTION_CAPABLE_TOPOLOGIES.has(description.type) &&
      Number.isInteger(getLogicalSessionTimeoutMinutes(description))
  );
};

const portfolioMediaHooks = {
  getMediaStore,
  supportsTransactions: () => connectionSupportsTransactions(),
  startSession: async () => {
    if (!connectionSupportsTransactions()) return null;
    const session = await mongoose.connection.startSession();
    return typeof session?.withTransaction === "function" ? session : null;
  },
};

const buildStatusUpdate = (status, fields = {}, now = new Date()) => ({
  $set: { ...fields, status, ...buildMediaLifecycleTimestamps(status, now) },
});
const createFailureReason = (error, fallback) =>
  isMediaStoreError(error) ? error.message : error?.message ? String(error.message) : fallback;
const createTransactionRequiredError = () =>
  Object.assign(new Error(PORTFOLIO_TRANSACTION_REQUIRED_MESSAGE), { statusCode: 503, transactionRequired: true });
const createCommitOutcomeUnknownError = () =>
  Object.assign(new Error(PORTFOLIO_COMMIT_UNKNOWN_MESSAGE), { statusCode: 503, retryable: true, commitOutcomeUnknown: true });
const checksumBuffer = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readUploadBytes = async (file) =>
  Buffer.isBuffer(file?.buffer) ? file.buffer : typeof file?.path === "string" && file.path ? fs.readFile(file.path) : Buffer.alloc(0);
const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);
const withStorageKey = (query, storageKey) => (storageKey ? { ...query, storageKey } : query);

const updateMediaObject = async (MediaObjectModel, id, update, options = {}) => {
  if (typeof MediaObjectModel.findByIdAndUpdate === "function") {
    await MediaObjectModel.findByIdAndUpdate(id, update, options);
    return;
  }
  if (typeof MediaObjectModel.updateOne === "function") {
    await MediaObjectModel.updateOne({ _id: id }, update, options);
  }
};

const findMediaObject = async (MediaObjectModel, query) => {
  if (typeof MediaObjectModel.findOne !== "function") return null;
  const result = MediaObjectModel.findOne(query);
  return typeof result?.lean === "function" ? result.lean() : result;
};

const findPortfolioPhoto = async (PortfolioPhotoModel, query) => {
  if (typeof PortfolioPhotoModel.findOne !== "function") return null;
  const result = PortfolioPhotoModel.findOne(query);
  const selected = typeof result?.select === "function" ? result.select("+beforeMediaObjectId +afterMediaObjectId") : result;
  return typeof selected?.lean === "function" ? selected.lean() : selected;
};

const getStructuredErrorCandidates = (error) => {
  const seen = new Set();
  const queue = [error];
  const candidates = [];
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
    for (const key of ["cause", "error", "originalError", "reason"]) {
      if (candidate[key] && typeof candidate[key] === "object") queue.push(candidate[key]);
    }
  }
  return candidates;
};

const hasMongoErrorLabel = (error, expectedLabels) =>
  getStructuredErrorCandidates(error).some((candidate) => {
    if (typeof candidate.hasErrorLabel === "function") {
      for (const label of expectedLabels) {
        if (candidate.hasErrorLabel(label)) return true;
      }
    }
    return Array.isArray(candidate.errorLabels) && candidate.errorLabels.some((label) => expectedLabels.has(label));
  });

const updateMatchingMediaObject = async (MediaObjectModel, query, update, options = {}) => {
  if (typeof MediaObjectModel.findOneAndUpdate === "function") {
    return MediaObjectModel.findOneAndUpdate(query, update, { ...options, new: true });
  }
  const current = await findMediaObject(MediaObjectModel, query);
  if (!current) return null;
  await updateMediaObject(MediaObjectModel, current._id, update, options);
  return { ...current, ...(update.$set || {}) };
};

const createPortfolioRecord = async ({ payload, session, PortfolioPhotoModel }) => {
  if (typeof PortfolioPhotoModel.findOneAndUpdate === "function" && payload?._id) {
    return PortfolioPhotoModel.findOneAndUpdate({ _id: payload._id }, { $setOnInsert: payload }, { new: true, upsert: true, session, setDefaultsOnInsert: true });
  }
  const created = await PortfolioPhotoModel.create([payload], { session });
  return Array.isArray(created) ? created[0] : created;
};

const updatePortfolioPhoto = async ({ PortfolioPhotoModel, photoId, update, session }) => {
  if (typeof PortfolioPhotoModel.findByIdAndUpdate === "function") {
    return PortfolioPhotoModel.findByIdAndUpdate(photoId, update, { new: true, session });
  }
  if (typeof PortfolioPhotoModel.updateOne === "function") {
    await PortfolioPhotoModel.updateOne({ _id: photoId }, update, { session });
  }
  return null;
};

const createMediaEntry = async ({ kind, file, mediaStore, MediaObjectModel }) => {
  const config = MEDIA_FIELDS[kind];
  const filename = file?.filename || path.basename(file?.path || "");
  const legacyUrl = `/uploads/portfolio/${filename}`;
  const bytes = await readUploadBytes(file);
  const extension = path.extname(file?.originalname || filename || "");
  const { storageKey, stageKey } = resolveMediaStageKeys({ extension });
  const mediaObjectId = new mongoose.Types.ObjectId();

  await MediaObjectModel.create({
    _id: mediaObjectId,
    provider: mediaStore.provider || "local",
    storageKey,
    stageKey,
    status: MEDIA_OBJECT_STATES.STAGED,
    contentType: file?.mimetype || "",
    byteSize: Number(file?.size || bytes.length || 0),
    checksumSha256: checksumBuffer(bytes),
    originalFilename: file?.originalname || "",
    legacyUrl,
    mediaClass: config.mediaClass,
    access: "private",
  });

  try {
    const stageResult = await mediaStore.stage({ buffer: bytes, extension, storageKey, stageKey });
    await updateMediaObject(MediaObjectModel, mediaObjectId, {
      $set: {
        provider: stageResult.provider,
        byteSize: Number(file?.size || stageResult.bytes || bytes.length || 0),
        failureCode: "",
        failureReason: "",
      },
    });
    return { kind, legacyUrl, mediaClass: config.mediaClass, mediaObjectId, storageKey, stageKey };
  } catch (error) {
    error.stageFailureMediaObjectId = mediaObjectId;
    throw error;
  }
};

const markStageFailure = async (MediaObjectModel, mediaObjectId, status, error, code) =>
  updateMediaObject(MediaObjectModel, mediaObjectId, {
    $set:
      status === MEDIA_OBJECT_STATES.FAILED
        ? buildStatusUpdate(status, {
            failureCode: code,
            failureReason: createFailureReason(error, "Could not stage portfolio media"),
          }).$set
        : {
            status,
            failureCode: code,
            failureReason: createFailureReason(error, "Could not stage portfolio media"),
          },
  }).catch(() => {
    logPortfolioMediaPersistenceFailure({
      event: "portfolio_media.stage_failure_persist_failed",
      operation: "markStageFailure",
      mediaObjectId,
      status,
    });
  });

const stagePortfolioMedia = async ({ filesByKind, mediaStore, MediaObjectModel }) => {
  const staged = [];
  try {
    for (const kind of Object.keys(MEDIA_FIELDS)) {
      staged.push(await createMediaEntry({ kind, file: filesByKind[kind], mediaStore, MediaObjectModel }));
    }
    return staged;
  } catch (error) {
    const failedId = String(error?.stageFailureMediaObjectId || "");
    await Promise.all(
      staged.map((entry) =>
        markStageFailure(
          MediaObjectModel,
          entry.mediaObjectId,
          failedId && String(entry.mediaObjectId) === failedId ? MEDIA_OBJECT_STATES.FAILED : MEDIA_OBJECT_STATES.STAGED,
          error,
          failedId && String(entry.mediaObjectId) === failedId ? "PORTFOLIO_MEDIA_STAGE_FAILED" : "PORTFOLIO_MEDIA_STAGE_INCOMPLETE"
        )
      )
    );
    if (failedId && !staged.some((entry) => String(entry.mediaObjectId) === failedId)) {
      await markStageFailure(
        MediaObjectModel,
        failedId,
        MEDIA_OBJECT_STATES.FAILED,
        error,
        "PORTFOLIO_MEDIA_STAGE_FAILED"
      );
    }
    throw error;
  }
};

const promotePortfolioMedia = async ({ media, mediaStore, MediaObjectModel }) => {
  const promoted = [];
  try {
    for (const entry of media) {
      await mediaStore.promote({ storageKey: entry.storageKey, stageKey: entry.stageKey });
      promoted.push(entry);
    }
    return promoted;
  } catch (error) {
    error.promotedMedia = promoted;
    throw error;
  }
};

const bindPortfolioMediaObject = async ({ MediaObjectModel, entry, photoId, session }) => {
  const base = {
    _id: entry.mediaObjectId,
    storageKey: entry.storageKey,
    mediaClass: entry.mediaClass,
    legacyUrl: entry.legacyUrl,
  };
  const options = session ? { session } : {};
  const stagedMatch = await updateMatchingMediaObject(
    MediaObjectModel,
    { ...base, status: MEDIA_OBJECT_STATES.STAGED, stageKey: entry.stageKey, ownerModel: "", ownerId: null },
    buildStatusUpdate(MEDIA_OBJECT_STATES.ACTIVE, {
      ownerModel: PORTFOLIO_OWNER_MODEL,
      ownerId: photoId,
      access: "private",
      stageKey: "",
      failureCode: "",
      failureReason: "",
    }),
    options
  );
  if (stagedMatch) return true;
  return Boolean(
    await findMediaObject(MediaObjectModel, {
      ...base,
      status: MEDIA_OBJECT_STATES.ACTIVE,
      ownerModel: PORTFOLIO_OWNER_MODEL,
      ownerId: photoId,
    })
  );
};

const markDeletePending = async ({ MediaObjectModel, entry, photoId, session, error }) => {
  const reason = createFailureReason(error, "Portfolio media requires deletion");
  const options = session ? { session } : {};
  const activeQuery = withStorageKey({ _id: entry.mediaObjectId, mediaClass: entry.mediaClass, legacyUrl: entry.legacyUrl, ownerModel: PORTFOLIO_OWNER_MODEL, ownerId: photoId, status: MEDIA_OBJECT_STATES.ACTIVE }, entry.storageKey);
  const stagedQuery = withStorageKey({ _id: entry.mediaObjectId, mediaClass: entry.mediaClass, legacyUrl: entry.legacyUrl, status: MEDIA_OBJECT_STATES.STAGED, stageKey: entry.stageKey, ownerModel: "", ownerId: null }, entry.storageKey);
  const update = buildStatusUpdate(MEDIA_OBJECT_STATES.DELETE_PENDING, {
    ownerModel: PORTFOLIO_OWNER_MODEL,
    ownerId: photoId,
    access: "private",
    failureCode: "PORTFOLIO_MEDIA_DELETE_PENDING",
    failureReason: reason,
  });

  let marked = await updateMatchingMediaObject(MediaObjectModel, activeQuery, update, options);
  if (marked) return marked;
  marked = await updateMatchingMediaObject(MediaObjectModel, stagedQuery, update, options);
  if (marked) return marked;
  const current = await findMediaObject(MediaObjectModel, { _id: entry.mediaObjectId, mediaClass: entry.mediaClass, legacyUrl: entry.legacyUrl });
  if (current?.status === MEDIA_OBJECT_STATES.DELETED) return current;
  if (current?.status === MEDIA_OBJECT_STATES.DELETE_PENDING && current?.ownerModel === PORTFOLIO_OWNER_MODEL && String(current?.ownerId) === String(photoId)) {
    return current;
  }
  return null;
};

const finalizeDeletedMedia = async ({ media, photoId, mediaStore, MediaObjectModel }) => {
  for (const entry of media) {
    try {
      await mediaStore.delete(entry.storageKey);
      await updateMatchingMediaObject(
        MediaObjectModel,
        withStorageKey({
          _id: entry.mediaObjectId,
          mediaClass: entry.mediaClass,
          legacyUrl: entry.legacyUrl,
          ownerModel: PORTFOLIO_OWNER_MODEL,
          ownerId: photoId,
          status: MEDIA_OBJECT_STATES.DELETE_PENDING,
        }, entry.storageKey),
        buildStatusUpdate(MEDIA_OBJECT_STATES.DELETED, {
          access: "private",
          failureCode: "",
          failureReason: "",
        })
      );
    } catch (error) {
      await updateMediaObject(MediaObjectModel, entry.mediaObjectId, {
        $set: {
          failureCode: "PORTFOLIO_MEDIA_DELETE_PENDING",
          failureReason: createFailureReason(error, "Could not delete portfolio media"),
        },
      }).catch(() => {
        logPortfolioMediaPersistenceFailure({
          event: "portfolio_media.cleanup_finalize_persist_failed",
          operation: "finalizeDeletedMedia",
          mediaObjectId: entry.mediaObjectId,
          photoId,
          status: MEDIA_OBJECT_STATES.DELETE_PENDING,
        });
      });
    }
  }
};

const getBoundMediaEntries = (photo) =>
  Object.entries(MEDIA_FIELDS).map(([kind, config]) => photo?.[config.mediaObjectIdField] && photo?.[config.urlField] ? { kind, mediaObjectId: photo[config.mediaObjectIdField], legacyUrl: photo[config.urlField], mediaClass: config.mediaClass } : null).filter(Boolean);

export const hasBoundPortfolioMedia = (photo, kind) =>
  Boolean(MEDIA_FIELDS[kind] && photo?.[MEDIA_FIELDS[kind].mediaObjectIdField]);

const reconcileCommittedCreate = async ({ payload, stagedMedia, PortfolioPhotoModel, MediaObjectModel }) => {
  const photoId = payload?._id;
  const before = stagedMedia.find((entry) => entry.kind === "before");
  const after = stagedMedia.find((entry) => entry.kind === "after");
  if (!photoId || !before?.mediaObjectId || !after?.mediaObjectId) return null;
  const photo = await findPortfolioPhoto(PortfolioPhotoModel, { _id: photoId, beforeUrl: payload.beforeUrl, afterUrl: payload.afterUrl, beforeMediaObjectId: before.mediaObjectId, afterMediaObjectId: after.mediaObjectId });
  if (!photo) return null;
  for (const entry of stagedMedia) {
    const mediaObject = await findMediaObject(MediaObjectModel, { _id: entry.mediaObjectId, storageKey: entry.storageKey, status: MEDIA_OBJECT_STATES.ACTIVE, ownerModel: PORTFOLIO_OWNER_MODEL, ownerId: photoId, mediaClass: entry.mediaClass, legacyUrl: entry.legacyUrl });
    if (!mediaObject) return null;
  }
  return photo;
};

export const createPortfolioPhotoWithMedia = async ({
  payload,
  filesByKind,
  PortfolioPhotoModel = PortfolioPhoto,
  MediaObjectModel = MediaObject,
  mediaStore = portfolioMediaHooks.getMediaStore(),
} = {}) => {
  if (!portfolioMediaHooks.supportsTransactions()) throw createTransactionRequiredError();
  const stagedMedia = await stagePortfolioMedia({ filesByKind, mediaStore, MediaObjectModel });
  let promotedMedia = [];
  let session = null;
  try {
    session = await portfolioMediaHooks.startSession();
    if (!session) throw createTransactionRequiredError();
    promotedMedia = await promotePortfolioMedia({ media: stagedMedia, mediaStore, MediaObjectModel });
    let photo;
    await session.withTransaction(async () => {
      photo = await createPortfolioRecord({
        payload: { ...payload, beforeMediaObjectId: stagedMedia.find((entry) => entry.kind === "before")?.mediaObjectId, afterMediaObjectId: stagedMedia.find((entry) => entry.kind === "after")?.mediaObjectId },
        session,
        PortfolioPhotoModel,
      });
      for (const entry of stagedMedia) {
        const bound = await bindPortfolioMediaObject({ MediaObjectModel, entry, photoId: photo._id, session });
        if (!bound) throw new Error("Portfolio media binding conflict");
      }
    });
    return photo;
  } catch (error) {
    if (hasMongoErrorLabel(error, UNKNOWN_COMMIT_LABELS)) {
      try {
        const reconciledPhoto = await reconcileCommittedCreate({ payload, stagedMedia, PortfolioPhotoModel, MediaObjectModel });
        if (reconciledPhoto) return reconciledPhoto;
      } catch {
        throw createCommitOutcomeUnknownError();
      }
      throw createCommitOutcomeUnknownError();
    }
    const photoId = payload?._id || null;
    const promotedIds = new Set((promotedMedia.length ? promotedMedia : error?.promotedMedia || []).map((entry) => String(entry?.mediaObjectId || "")).filter(Boolean));
    for (const entry of stagedMedia) {
      if (!promotedIds.has(String(entry.mediaObjectId))) {
        await updateMediaObject(MediaObjectModel, entry.mediaObjectId, {
          $set: {
            status: MEDIA_OBJECT_STATES.STAGED,
            failureCode: "PORTFOLIO_MEDIA_STAGED",
            failureReason: createFailureReason(error, "Portfolio media remained staged after create failure"),
          },
        }).catch(() => {
          logPortfolioMediaPersistenceFailure({
            event: "portfolio_media.compensation_status_persist_failed",
            operation: "createPortfolioPhotoWithMedia",
            mediaObjectId: entry.mediaObjectId,
            photoId,
            status: MEDIA_OBJECT_STATES.STAGED,
          });
        });
        continue;
      }
      const marked = await markDeletePending({ MediaObjectModel, entry, photoId, error }).catch(() => {
        logPortfolioMediaPersistenceFailure({
          event: "portfolio_media.delete_pending_persist_failed",
          operation: "markDeletePending",
          mediaObjectId: entry.mediaObjectId,
          photoId,
          status: MEDIA_OBJECT_STATES.DELETE_PENDING,
        });
        return null;
      });
      if (marked) {
        await finalizeDeletedMedia({ media: [entry], photoId, mediaStore, MediaObjectModel });
      }
    }
    throw error;
  } finally {
    await session?.endSession?.().catch(() => {});
  }
};

export const deletePortfolioPhotoWithMedia = async ({
  photo,
  PortfolioPhotoModel = PortfolioPhoto,
  MediaObjectModel = MediaObject,
  mediaStore = portfolioMediaHooks.getMediaStore(),
} = {}) => {
  const photoId = toObjectId(photo?._id);
  const boundMedia = getBoundMediaEntries(photo);
  if (!boundMedia.length) {
    await updatePortfolioPhoto({ PortfolioPhotoModel, photoId, update: { $set: { active: false } }, session: null });
    return;
  }
  if (!portfolioMediaHooks.supportsTransactions()) throw createTransactionRequiredError();

  let session = null;
  try {
    session = await portfolioMediaHooks.startSession();
    if (!session) throw createTransactionRequiredError();

    await session.withTransaction(async () => {
      await updatePortfolioPhoto({
        PortfolioPhotoModel,
        photoId,
        update: { $set: { active: false } },
        session,
      });
      for (const entry of boundMedia) {
        const marked = await markDeletePending({ MediaObjectModel, entry, photoId, session });
        if (!marked) throw new Error("Portfolio media delete binding conflict");
        if (marked.storageKey) entry.storageKey = marked.storageKey;
      }
    });
  } finally {
    await session?.endSession?.().catch(() => {});
  }

  await finalizeDeletedMedia({ media: boundMedia, photoId, mediaStore, MediaObjectModel });
};

export const openPortfolioPhotoMedia = async ({
  photo,
  kind,
  MediaObjectModel = MediaObject,
  mediaStore = portfolioMediaHooks.getMediaStore(),
} = {}) => {
  const config = MEDIA_FIELDS[kind];
  if (!config) return null;
  const mediaObjectId = photo?.[config.mediaObjectIdField];
  const legacyUrl = photo?.[config.urlField];
  if (!mediaObjectId || !legacyUrl || !photo?._id) return null;

  const mediaObject = await findMediaObject(MediaObjectModel, {
    _id: mediaObjectId,
    status: MEDIA_OBJECT_STATES.ACTIVE,
    ownerModel: PORTFOLIO_OWNER_MODEL,
    ownerId: photo._id,
    mediaClass: config.mediaClass,
    legacyUrl,
  });
  if (!mediaObject) return null;

  return {
    stream: await mediaStore.createReadStream(mediaObject.storageKey),
    contentType: mediaObject.contentType || DEFAULT_CONTENT_TYPE,
  };
};

export const __portfolioMediaServiceTestHooks = {
  resetMediaStore() {
    defaultMediaStore = undefined;
  },
  setMediaStore(store) {
    defaultMediaStore = store;
  },
  setLogger(nextLogger) {
    getLoggerForPortfolioMedia = nextLogger ? () => nextLogger : getLogger;
  },
  resetLogger() {
    getLoggerForPortfolioMedia = getLogger;
  },
  supportsTransactions() {
    return portfolioMediaHooks.supportsTransactions();
  },
  setSupportsTransactions(fn) {
    portfolioMediaHooks.supportsTransactions = fn;
  },
  resetSupportsTransactions() {
    portfolioMediaHooks.supportsTransactions = () => connectionSupportsTransactions();
  },
  setStartSession(fn) {
    portfolioMediaHooks.startSession = fn;
  },
  resetStartSession() {
    portfolioMediaHooks.startSession = async () => {
      if (!connectionSupportsTransactions()) return null;
      const session = await mongoose.connection.startSession();
      return typeof session?.withTransaction === "function" ? session : null;
    };
  },
  createTransactionRequiredError,
  PORTFOLIO_TRANSACTION_REQUIRED_MESSAGE,
};
