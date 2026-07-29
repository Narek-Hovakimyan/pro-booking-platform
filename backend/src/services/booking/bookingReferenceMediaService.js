import { createHash } from "crypto";
import { promises as fs } from "fs";
import mongoose from "mongoose";
import path from "path";

import MediaObject, {
  buildMediaLifecycleTimestamps,
  MEDIA_OBJECT_STATES,
} from "../../models/MediaObject.js";
import { LocalMediaStore } from "../media/localMediaStore.js";
import { isMediaStoreError, resolveMediaStageKeys } from "../media/mediaStore.js";
import {
  buildBookingReferenceImagePath,
  isSafeBookingReferenceImageName,
  normalizeBookingReferenceImagePath,
} from "./bookingReferenceImageHelpers.js";

const BOOKING_REFERENCE_MEDIA_CLASS = "booking-reference";
const PRIVATE_MEDIA_ACCESS = "private";
const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const MEDIA_BINDING_TOKEN_PREFIX = "booking-reference-media:";
const mediaStoreRoot = path.join(
  process.cwd(),
  "uploads",
  ".booking-reference-media-store"
);

let defaultMediaStore;

const getMediaStore = () => {
  if (!defaultMediaStore) {
    defaultMediaStore = new LocalMediaStore({ root: mediaStoreRoot });
  }
  return defaultMediaStore;
};

const checksumBuffer = (buffer) =>
  createHash("sha256").update(buffer).digest("hex");

const readUploadBytes = async (file) => {
  if (Buffer.isBuffer(file?.buffer)) {
    return file.buffer;
  }
  if (typeof file?.path === "string" && file.path) {
    try {
      return await fs.readFile(file.path);
    } catch (error) {
      if (
        error?.code === "ENOENT" &&
        !file?.filename &&
        !file?.destination &&
        !Buffer.isBuffer(file?.buffer)
      ) {
        return Buffer.alloc(0);
      }
      throw error;
    }
  }
  return Buffer.alloc(0);
};

const createMediaObjectId = () => new mongoose.Types.ObjectId();

const buildStatusUpdate = (status, fields = {}, now = new Date()) => ({
  $set: {
    ...fields,
    status,
    ...buildMediaLifecycleTimestamps(status, now),
  },
});

export const encodeMediaBindingToken = ({ mediaObjectId, bookingId, legacyUrl }) =>
  `${MEDIA_BINDING_TOKEN_PREFIX}${Buffer.from(
    JSON.stringify({
      mediaObjectId: String(mediaObjectId),
      bookingId: String(bookingId),
      legacyUrl,
    }),
    "utf8"
  ).toString("base64")}`;

const decodeMediaBindingToken = (value) => {
  if (typeof value !== "string" || !value.startsWith(MEDIA_BINDING_TOKEN_PREFIX)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(value.slice(MEDIA_BINDING_TOKEN_PREFIX.length), "base64").toString(
        "utf8"
      )
    );
    if (
      !decoded?.mediaObjectId ||
      !decoded?.bookingId ||
      typeof decoded?.legacyUrl !== "string"
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

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

const updateMatchingMediaObject = async (
  MediaObjectModel,
  query,
  update,
  options = {}
) => {
  if (typeof MediaObjectModel.findOneAndUpdate === "function") {
    return MediaObjectModel.findOneAndUpdate(query, update, {
      ...options,
      new: true,
    });
  }

  const current = await findMediaObject(MediaObjectModel, query);
  if (!current) return null;
  await updateMediaObject(MediaObjectModel, current._id, update, options);
  return { ...current, ...(update.$set || {}) };
};

const bindMediaObject = async (
  MediaObjectModel,
  { mediaObjectId, storageKey, legacyUrl, bookingId },
  options = {}
) => {
  const baseFilter = {
    _id: mediaObjectId,
    storageKey,
    mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
    access: PRIVATE_MEDIA_ACCESS,
    legacyUrl,
  };
  const stagedMatch = await updateMatchingMediaObject(
    MediaObjectModel,
    {
      ...baseFilter,
      status: MEDIA_OBJECT_STATES.STAGED,
      stageKey: "",
      ownerModel: "",
      ownerId: null,
    },
    buildStatusUpdate(MEDIA_OBJECT_STATES.ACTIVE, {
      stageKey: "",
      ownerModel: "Booking",
      ownerId: bookingId,
      mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
      access: PRIVATE_MEDIA_ACCESS,
      legacyUrl,
      failureCode: "",
      failureReason: "",
    }),
    options
  );
  if (stagedMatch) return true;

  const alreadyBound = await findMediaObject(MediaObjectModel, {
    ...baseFilter,
    status: MEDIA_OBJECT_STATES.ACTIVE,
    ownerModel: "Booking",
    ownerId: bookingId,
  });
  return Boolean(alreadyBound);
};

const markMediaObjects = async (MediaObjectModel, media, updateFactory, options = {}) => {
  for (const entry of media) {
    if (!entry?.mediaObjectId) continue;
    await updateMediaObject(MediaObjectModel, entry.mediaObjectId, updateFactory(entry), options);
  }
};

const createFailureReason = (error, fallback) => {
  if (isMediaStoreError(error)) return error.message;
  if (error?.message) return String(error.message);
  return fallback;
};

export const stageBookingReferenceMedia = async ({
  files = [],
  mediaStore = getMediaStore(),
  MediaObjectModel = MediaObject,
} = {}) => {
  const staged = [];

  try {
    for (const file of files) {
      const filename = file?.filename || path.basename(file?.path || "");
      const legacyUrl = buildBookingReferenceImagePath(filename);
      const bytes = await readUploadBytes(file);
      const { storageKey, stageKey } = resolveMediaStageKeys({
        extension: path.extname(file?.originalname || filename || ""),
      });
      const mediaObjectId = createMediaObjectId();
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
        mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
        access: PRIVATE_MEDIA_ACCESS,
      });
      const entry = {
        fileName: filename,
        legacyUrl,
        mediaObjectId,
        storageKey,
        stageKey,
      };
      staged.push(entry);

      let stageResult;
      try {
        stageResult = await mediaStore.stage({
          buffer: bytes,
          extension: path.extname(file?.originalname || filename || ""),
          storageKey,
          stageKey,
        });
      } catch (stageError) {
        stageError.stageFailureMediaObjectId = mediaObjectId;
        throw stageError;
      }

      await updateMediaObject(MediaObjectModel, mediaObjectId, {
        $set: {
          provider: stageResult.provider,
          byteSize: Number(file?.size || stageResult.bytes || bytes.length || 0),
          failureCode: "",
          failureReason: "",
        },
      });
    }

    return staged;
  } catch (error) {
    const failedMediaId = String(error?.stageFailureMediaObjectId || "");
    await markMediaObjects(MediaObjectModel, staged, (entry) => {
      const isFailedIntent = failedMediaId && String(entry.mediaObjectId) === failedMediaId;
      return {
        $set: {
          ...(isFailedIntent
            ? buildStatusUpdate(MEDIA_OBJECT_STATES.FAILED, {
                failureCode: "BOOKING_REFERENCE_STAGE_FAILED",
                failureReason: createFailureReason(
                  error,
                  "Could not stage booking reference media"
                ),
              }).$set
            : {
                status: MEDIA_OBJECT_STATES.STAGED,
                failureCode: "BOOKING_REFERENCE_STAGE_INCOMPLETE",
                failureReason: createFailureReason(
                  error,
                  "Could not stage booking reference media"
                ),
              }),
        },
      };
    }).catch(() => {});
    throw error;
  }
};

export const promoteBookingReferenceMedia = async ({
  media = [],
  mediaStore = getMediaStore(),
  MediaObjectModel = MediaObject,
} = {}) => {
  const promotedMedia = [];

  try {
    for (const entry of media) {
      await mediaStore.promote({
        stageKey: entry.stageKey,
        storageKey: entry.storageKey,
      });
      promotedMedia.push(entry);
      await updateMediaObject(
        MediaObjectModel,
        entry.mediaObjectId,
        {
          $set: {
            stageKey: "",
            failureCode: "",
            failureReason: "",
          },
        }
      );
    }

    return promotedMedia;
  } catch (error) {
    error.promotedMedia = promotedMedia;
    throw error;
  }
};

export const activateBookingReferenceMedia = async ({
  media = [],
  bookingId,
  session = null,
  MediaObjectModel = MediaObject,
} = {}) => {
  for (const entry of media) {
    const bound = await bindMediaObject(
      MediaObjectModel,
      {
        mediaObjectId: entry.mediaObjectId,
        storageKey: entry.storageKey,
        legacyUrl: entry.legacyUrl,
        bookingId,
      },
      session ? { session } : {}
    );

    if (!bound) {
      throw new Error("Booking reference media binding conflict");
    }
  }

  return media;
};

export const compensateBookingReferenceMediaFailure = async ({
  media = [],
  promotedMedia = [],
  bookingId = null,
  error = null,
  mediaStore = getMediaStore(),
  MediaObjectModel = MediaObject,
} = {}) => {
  const promotedIds = new Set(
    promotedMedia
      .map((entry) => String(entry?.mediaObjectId || ""))
      .filter(Boolean)
  );

  for (const entry of media) {
    if (!entry?.mediaObjectId) continue;

    if (!promotedIds.has(String(entry.mediaObjectId))) {
      await updateMediaObject(MediaObjectModel, entry.mediaObjectId, {
        $set: {
          status: MEDIA_OBJECT_STATES.STAGED,
          failureCode: "BOOKING_REFERENCE_MEDIA_STAGED",
          failureReason: createFailureReason(
            error,
            "Booking reference media remained staged after booking failure"
          ),
        },
      }).catch(() => {});
      continue;
    }

    const deletePendingReason = createFailureReason(
      error,
      "Booking reference media requires deletion"
    );
    const baseFilter = {
      _id: entry.mediaObjectId,
      storageKey: entry.storageKey,
      mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
      access: PRIVATE_MEDIA_ACCESS,
      legacyUrl: entry.legacyUrl,
    };
    let deletePending = await updateMatchingMediaObject(
      MediaObjectModel,
      {
        ...baseFilter,
        status: MEDIA_OBJECT_STATES.ACTIVE,
        ownerModel: "Booking",
        ownerId: bookingId,
      },
      buildStatusUpdate(MEDIA_OBJECT_STATES.DELETE_PENDING, {
        ownerModel: "Booking",
        ownerId: bookingId,
        mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
        access: PRIVATE_MEDIA_ACCESS,
        legacyUrl: entry.legacyUrl,
        failureCode: "BOOKING_REFERENCE_MEDIA_DELETE_PENDING",
        failureReason: deletePendingReason,
      })
    );

    if (!deletePending) {
      deletePending = await updateMatchingMediaObject(
        MediaObjectModel,
        {
          ...baseFilter,
          status: MEDIA_OBJECT_STATES.STAGED,
          stageKey: "",
          ownerModel: "",
          ownerId: null,
        },
        buildStatusUpdate(MEDIA_OBJECT_STATES.DELETE_PENDING, {
          ownerModel: "Booking",
          ownerId: bookingId,
          mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
          access: PRIVATE_MEDIA_ACCESS,
          legacyUrl: entry.legacyUrl,
          failureCode: "BOOKING_REFERENCE_MEDIA_DELETE_PENDING",
          failureReason: deletePendingReason,
        })
      );
    }

    if (!deletePending) {
      const current = await findMediaObject(MediaObjectModel, baseFilter);
      if (current?.status === MEDIA_OBJECT_STATES.DELETED) continue;
      if (
        current?.status === MEDIA_OBJECT_STATES.DELETE_PENDING &&
        current?.ownerModel === "Booking" &&
        String(current?.ownerId) === String(bookingId)
      ) {
        deletePending = current;
      }
    }

    if (!deletePending) continue;

    try {
      await mediaStore.delete(entry.storageKey);
      await updateMatchingMediaObject(
        MediaObjectModel,
        {
          ...baseFilter,
          status: MEDIA_OBJECT_STATES.DELETE_PENDING,
        },
        buildStatusUpdate(MEDIA_OBJECT_STATES.DELETED, {
          ownerModel: "Booking",
          ownerId: bookingId,
          mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
          access: PRIVATE_MEDIA_ACCESS,
          legacyUrl: entry.legacyUrl,
          failureCode: "",
          failureReason: "",
        })
      );
    } catch (deleteError) {
      await updateMediaObject(MediaObjectModel, entry.mediaObjectId, {
        $set: {
          failureCode: "BOOKING_REFERENCE_MEDIA_DELETE_PENDING",
          failureReason: createFailureReason(
            deleteError,
            "Could not delete orphaned booking reference media"
          ),
        },
      }).catch(() => {});
    }
  }
};

export const resolveBookingReferenceMedia = async ({
  bookingId,
  imageName,
  MediaObjectModel = MediaObject,
} = {}) => {
  if (!bookingId || !isSafeBookingReferenceImageName(imageName)) return [];

  return MediaObjectModel.find({
    ownerModel: "Booking",
    ownerId: bookingId,
    mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
    legacyUrl: {
      $in: [
        buildBookingReferenceImagePath(imageName),
        buildBookingReferenceImagePath(imageName, true),
      ],
    },
  })
    .sort({ createdAt: -1 })
    .lean();
};

export const openBookingReferenceMediaStream = async ({
  mediaObjectId,
  bookingId,
  legacyUrl,
  mediaStore = getMediaStore(),
  MediaObjectModel = MediaObject,
} = {}) => {
  const bindingToken = decodeMediaBindingToken(mediaObjectId);
  if (bindingToken) {
    mediaObjectId = bindingToken.mediaObjectId;
    if (bookingId != null && String(bookingId) !== String(bindingToken.bookingId)) {
      return null;
    }
    if (legacyUrl && legacyUrl !== bindingToken.legacyUrl) {
      return null;
    }
    bookingId = bindingToken.bookingId;
    legacyUrl = bindingToken.legacyUrl;
  }

  const query = {
    _id: mediaObjectId,
    status: MEDIA_OBJECT_STATES.ACTIVE,
    mediaClass: BOOKING_REFERENCE_MEDIA_CLASS,
    access: PRIVATE_MEDIA_ACCESS,
    ownerModel: "Booking",
  };
  if (bookingId != null) query.ownerId = bookingId;
  if (legacyUrl) query.legacyUrl = legacyUrl;

  const mediaObject = await MediaObjectModel.findOne(query).lean();

  if (!mediaObject) return null;

  const stream = await mediaStore.createReadStream(mediaObject.storageKey);
  return {
    stream,
    contentType: mediaObject.contentType || DEFAULT_CONTENT_TYPE,
  };
};

export const isBookingReferencePathOwnedByBooking = (booking, imageName) => {
  const normalizedPath = normalizeBookingReferenceImagePath(
    buildBookingReferenceImagePath(imageName)
  );

  if (!normalizedPath) return false;

  return (booking?.referenceImages || [])
    .map((value) => normalizeBookingReferenceImagePath(value))
    .includes(normalizedPath);
};

export const __bookingReferenceMediaTestHooks = {
  encodeMediaBindingToken,
  resetMediaStore() {
    defaultMediaStore = undefined;
  },
  setMediaStore(store) {
    defaultMediaStore = store;
  },
};
