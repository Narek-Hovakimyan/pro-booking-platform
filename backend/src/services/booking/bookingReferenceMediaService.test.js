import assert from "node:assert/strict";
import { test } from "node:test";

import { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import {
  __bookingReferenceMediaTestHooks,
  activateBookingReferenceMedia,
  compensateBookingReferenceMediaFailure,
  openBookingReferenceMediaStream,
  promoteBookingReferenceMedia,
  resolveBookingReferenceMedia,
  stageBookingReferenceMedia,
} from "./bookingReferenceMediaService.js";

const matchesQuery = (doc, query) =>
  Object.entries(query).every(([key, value]) => {
    if (key === "$or") {
      return value.some((entry) => matchesQuery(doc, entry));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("$in" in value) return value.$in.includes(doc[key]);
    }
    return String(doc[key]) === String(value);
  });

const createMediaObjectModel = () => {
  const docs = [];

  return {
    docs,
    async create(payload) {
      const doc = {
        _id: payload._id ?? `media-${docs.length + 1}`,
        ownerModel: "",
        ownerId: null,
        ...payload,
      };
      docs.push(doc);
      return doc;
    },
    async findByIdAndUpdate(id, update) {
      const doc = docs.find((entry) => entry._id === id);
      if (!doc) return null;
      Object.assign(doc, update.$set || {});
      return doc;
    },
    async findOneAndUpdate(query, update) {
      const doc = docs.find((entry) => matchesQuery(entry, query));
      if (!doc) return null;
      Object.assign(doc, update.$set || {});
      return doc;
    },
    find(query) {
      const matches = docs.filter((doc) => matchesQuery(doc, query));
      return {
        sort() {
          return {
            async lean() {
              return [...matches].reverse();
            },
          };
        },
      };
    },
    findOne(query) {
      const doc = docs.find((entry) => matchesQuery(entry, query)) || null;
      return {
        async lean() {
          return doc;
        },
      };
    },
  };
};

const createMediaStore = (overrides = {}) => ({
  staged: [],
  promoted: [],
  deleted: [],
  readRequests: [],
  async stage({ extension, storageKey, stageKey }) {
    const index = this.staged.length + 1;
    const result = {
      provider: "local",
      storageKey:
        storageKey ||
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}${extension}`,
      stageKey:
        stageKey ||
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}.stage`,
      bytes: 12,
    };
    this.staged.push(result);
    return result;
  },
  async promote({ stageKey, storageKey }) {
    this.promoted.push({ stageKey, storageKey });
    return { provider: "local", storageKey, promoted: true };
  },
  async delete(storageKey) {
    this.deleted.push(storageKey);
    return { provider: "local", storageKey, deleted: true };
  },
  async createReadStream(storageKey) {
    this.readRequests.push(storageKey);
    return `stream:${storageKey}`;
  },
  ...overrides,
});

test("stages booking reference uploads and persists staged private MediaObjects", async () => {
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();

  const staged = await stageBookingReferenceMedia({
    files: [
      {
        filename: "ref-a.jpg",
        originalname: "before.JPG",
        mimetype: "image/jpeg",
        size: 10,
        buffer: Buffer.from("before"),
      },
      {
        filename: "ref-b.webp",
        originalname: "after.WEBP",
        mimetype: "image/webp",
        size: 9,
        buffer: Buffer.from("after"),
      },
    ],
    mediaStore,
    MediaObjectModel,
  });

  assert.equal(staged.length, 2);
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.STAGED);
  assert.equal(MediaObjectModel.docs[0].mediaClass, "booking-reference");
  assert.equal(MediaObjectModel.docs[0].access, "private");
  assert.equal(MediaObjectModel.docs[0].legacyUrl, "uploads/booking-references/ref-a.jpg");
});

test("partial multi-file staging failure keeps prior blobs tracked and marks only the failed intent", async () => {
  const MediaObjectModel = createMediaObjectModel();
  let attempts = 0;
  const mediaStore = createMediaStore({
    async stage(args) {
      attempts += 1;
      if (attempts === 2) {
        const error = new Error("storage offline");
        error.status = 503;
        throw error;
      }
      return createMediaStore().stage.call(this, args);
    },
  });

  await assert.rejects(
    () =>
      stageBookingReferenceMedia({
        files: [
          {
            filename: "ref-a.jpg",
            originalname: "before.jpg",
            mimetype: "image/jpeg",
            size: 10,
            buffer: Buffer.from("before"),
          },
          {
            filename: "ref-b.jpg",
            originalname: "after.jpg",
            mimetype: "image/jpeg",
            size: 10,
            buffer: Buffer.from("after"),
          },
        ],
        mediaStore,
        MediaObjectModel,
      }),
    /storage offline/
  );

  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.STAGED);
  assert.equal(MediaObjectModel.docs[0].failureCode, "BOOKING_REFERENCE_STAGE_INCOMPLETE");
  assert.equal(MediaObjectModel.docs[1].status, MEDIA_OBJECT_STATES.FAILED);
  assert.equal(MediaObjectModel.docs[1].failureCode, "BOOKING_REFERENCE_STAGE_FAILED");
  assert.ok(MediaObjectModel.docs[1].failedAt instanceof Date);
});

test("promotion and activation happen in separate steps with durable staged metadata", async () => {
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const staged = await stageBookingReferenceMedia({
    files: [
      {
        filename: "ref-a.jpg",
        originalname: "before.jpg",
        mimetype: "image/jpeg",
        size: 10,
        buffer: Buffer.from("before"),
      },
    ],
    mediaStore,
    MediaObjectModel,
  });

  const promoted = await promoteBookingReferenceMedia({
    media: staged,
    mediaStore,
    MediaObjectModel,
  });
  await activateBookingReferenceMedia({
    media: promoted,
    bookingId: "booking-1",
    MediaObjectModel,
  });

  assert.deepEqual(mediaStore.promoted.length, 1);
  assert.equal(MediaObjectModel.docs[0].stageKey, "");
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.ACTIVE);
  assert.equal(MediaObjectModel.docs[0].ownerModel, "Booking");
  assert.equal(String(MediaObjectModel.docs[0].ownerId), "booking-1");
  assert.ok(MediaObjectModel.docs[0].activatedAt instanceof Date);
});

test("compensation marks orphaned active media delete-pending then deleted", async () => {
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const staged = await stageBookingReferenceMedia({
    files: [
      {
        filename: "ref-a.jpg",
        originalname: "before.jpg",
        mimetype: "image/jpeg",
        size: 10,
        buffer: Buffer.from("before"),
      },
      {
        filename: "ref-b.jpg",
        originalname: "after.jpg",
        mimetype: "image/jpeg",
        size: 10,
        buffer: Buffer.from("after"),
      },
    ],
    mediaStore,
    MediaObjectModel,
  });
  const promoted = await promoteBookingReferenceMedia({
    media: [staged[0]],
    mediaStore,
    MediaObjectModel,
  });

  await compensateBookingReferenceMediaFailure({
    media: staged,
    promotedMedia: promoted,
    bookingId: "booking-1",
    error: new Error("promotion failed"),
    mediaStore,
    MediaObjectModel,
  });

  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.DELETED);
  assert.ok(MediaObjectModel.docs[0].deletePendingAt instanceof Date);
  assert.ok(MediaObjectModel.docs[0].deletedAt instanceof Date);
  assert.equal(MediaObjectModel.docs[1].status, MEDIA_OBJECT_STATES.STAGED);
  assert.equal(MediaObjectModel.docs[1].failureCode, "BOOKING_REFERENCE_MEDIA_STAGED");
  assert.deepEqual(mediaStore.deleted, [staged[0].storageKey]);
});

test("activation is idempotent for duplicate transaction callback execution", async () => {
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const staged = await stageBookingReferenceMedia({
    files: [
      {
        filename: "ref-a.jpg",
        originalname: "before.jpg",
        mimetype: "image/jpeg",
        size: 10,
        buffer: Buffer.from("before"),
      },
    ],
    mediaStore,
    MediaObjectModel,
  });

  await promoteBookingReferenceMedia({
    media: staged,
    mediaStore,
    MediaObjectModel,
  });
  await activateBookingReferenceMedia({
    media: staged,
    bookingId: "booking-1",
    MediaObjectModel,
  });
  const activatedAt = MediaObjectModel.docs[0].activatedAt;
  await activateBookingReferenceMedia({
    media: staged,
    bookingId: "booking-1",
    MediaObjectModel,
  });

  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.ACTIVE);
  assert.equal(String(MediaObjectModel.docs[0].ownerId), "booking-1");
  assert.equal(MediaObjectModel.docs[0].activatedAt, activatedAt);
});

test("resolve/open serves only active MediaStore-backed booking references", async () => {
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();

  await MediaObjectModel.create({
    provider: "local",
    storageKey: "00000000-0000-4000-8000-000000000001.jpg",
    stageKey: "00000000-0000-4000-8000-000000000001.stage",
    status: MEDIA_OBJECT_STATES.ACTIVE,
    contentType: "image/jpeg",
    legacyUrl: "uploads/booking-references/ref-a.jpg",
    mediaClass: "booking-reference",
    access: "private",
    ownerModel: "Booking",
    ownerId: "booking-1",
  });
  await MediaObjectModel.create({
    provider: "local",
    storageKey: "00000000-0000-4000-8000-000000000002.jpg",
    stageKey: "00000000-0000-4000-8000-000000000002.stage",
    status: MEDIA_OBJECT_STATES.DELETE_PENDING,
    contentType: "image/jpeg",
    legacyUrl: "uploads/booking-references/ref-b.jpg",
    mediaClass: "booking-reference",
    access: "private",
    ownerModel: "Booking",
    ownerId: "booking-1",
  });

  const active = await resolveBookingReferenceMedia({
    bookingId: "booking-1",
    imageName: "ref-a.jpg",
    MediaObjectModel,
  });
  const inactive = await resolveBookingReferenceMedia({
    bookingId: "booking-1",
    imageName: "ref-b.jpg",
    MediaObjectModel,
  });
  const mediaToken = __bookingReferenceMediaTestHooks.encodeMediaBindingToken({
    mediaObjectId: active[0]._id,
    bookingId: "booking-1",
    legacyUrl: "uploads/booking-references/ref-a.jpg",
  });
  const stream = await openBookingReferenceMediaStream({
    mediaObjectId: mediaToken,
    mediaStore,
    MediaObjectModel,
  });
  const missing = await openBookingReferenceMediaStream({
    mediaObjectId: inactive[0]._id,
    mediaStore,
    MediaObjectModel,
  });

  assert.equal(active[0].status, MEDIA_OBJECT_STATES.ACTIVE);
  assert.equal(inactive[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
  assert.equal(stream.stream, "stream:00000000-0000-4000-8000-000000000001.jpg");
  assert.equal(stream.contentType, "image/jpeg");
  assert.equal(missing, null);
});

test("stream open fails closed for cross-booking or mismatched-reference bindings", async () => {
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();

  await MediaObjectModel.create({
    _id: "media-1",
    provider: "local",
    storageKey: "00000000-0000-4000-8000-000000000001.jpg",
    stageKey: "",
    status: MEDIA_OBJECT_STATES.ACTIVE,
    legacyUrl: "uploads/booking-references/ref-a.jpg",
    mediaClass: "booking-reference",
    access: "private",
    ownerModel: "Booking",
    ownerId: "booking-1",
  });

  const wrongBooking = await openBookingReferenceMediaStream({
    mediaObjectId: __bookingReferenceMediaTestHooks.encodeMediaBindingToken({
      mediaObjectId: "media-1",
      bookingId: "booking-2",
      legacyUrl: "uploads/booking-references/ref-a.jpg",
    }),
    mediaStore,
    MediaObjectModel,
  });
  const wrongReference = await openBookingReferenceMediaStream({
    mediaObjectId: __bookingReferenceMediaTestHooks.encodeMediaBindingToken({
      mediaObjectId: "media-1",
      bookingId: "booking-1",
      legacyUrl: "uploads/booking-references/ref-b.jpg",
    }),
    mediaStore,
    MediaObjectModel,
  });

  assert.equal(wrongBooking, null);
  assert.equal(wrongReference, null);
  assert.deepEqual(mediaStore.readRequests, []);
});

test("compensation skips deletion when delete-pending CAS does not persist", async () => {
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const staged = await stageBookingReferenceMedia({
    files: [
      {
        filename: "ref-a.jpg",
        originalname: "before.jpg",
        mimetype: "image/jpeg",
        size: 10,
        buffer: Buffer.from("before"),
      },
    ],
    mediaStore,
    MediaObjectModel,
  });

  await promoteBookingReferenceMedia({
    media: staged,
    mediaStore,
    MediaObjectModel,
  });
  await activateBookingReferenceMedia({
    media: staged,
    bookingId: "booking-1",
    MediaObjectModel,
  });

  const originalFindOneAndUpdate = MediaObjectModel.findOneAndUpdate;
  MediaObjectModel.findOneAndUpdate = async (query, update) => {
    if (update?.$set?.status === MEDIA_OBJECT_STATES.DELETE_PENDING) {
      return null;
    }
    return originalFindOneAndUpdate.call(MediaObjectModel, query, update);
  };

  await compensateBookingReferenceMediaFailure({
    media: staged,
    promotedMedia: staged,
    bookingId: "booking-1",
    error: new Error("commit failed"),
    mediaStore,
    MediaObjectModel,
  });

  assert.deepEqual(mediaStore.deleted, []);
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.ACTIVE);
});
