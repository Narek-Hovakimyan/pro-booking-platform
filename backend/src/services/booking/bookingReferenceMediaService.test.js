import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

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

afterEach(() => {
  __bookingReferenceMediaTestHooks.resetLogger();
});

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

test("logs one sanitized warning when staged failure persistence cannot be recorded", async () => {
  const logs = [];
  const MediaObjectModel = createMediaObjectModel();
  let updateAttempts = 0;
  MediaObjectModel.findByIdAndUpdate = async () => {
    updateAttempts += 1;
    throw new Error("write failed at /srv/private/ref-a.jpg");
  };
  const mediaStore = createMediaStore({
    async stage() {
      throw new Error("storage offline with token secret_123");
    },
  });

  __bookingReferenceMediaTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });

  await assert.rejects(
    () =>
      stageBookingReferenceMedia({
        files: [
          {
            filename: "ref-a.jpg",
            originalname: "before.jpg",
            buffer: Buffer.from("before"),
          },
        ],
        mediaStore,
        MediaObjectModel,
      }),
    /storage offline/
  );

  assert.equal(updateAttempts, 1);
  assert.deepEqual(logs, [
    [
      {
        event: "booking_reference_media.stage_failure_persist_failed",
        operation: "stageBookingReferenceMedia",
        mediaObjectId: String(MediaObjectModel.docs[0]._id),
        bookingId: undefined,
        status: MEDIA_OBJECT_STATES.FAILED,
        err: { name: "Error" },
      },
      "booking_reference_media.stage_failure_persist_failed",
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /secret_123|storage offline|\/srv\/private|ref-a\.jpg/i);
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.STAGED);
});

test("logger absence or throws do not mask staged failure persistence problems", async () => {
  const MediaObjectModel = createMediaObjectModel();
  MediaObjectModel.findByIdAndUpdate = async () => {
    throw new Error("write failed");
  };

  __bookingReferenceMediaTestHooks.setLogger(null);
  await assert.rejects(
    () =>
      stageBookingReferenceMedia({
        files: [{ filename: "ref-a.jpg", originalname: "before.jpg", buffer: Buffer.from("a") }],
        mediaStore: createMediaStore({
          async stage() {
            throw new Error("storage offline");
          },
        }),
        MediaObjectModel,
      }),
    /storage offline/
  );

  __bookingReferenceMediaTestHooks.setLogger({
    warn() {
      throw new Error("logger unavailable");
    },
  });
  await assert.rejects(
    () =>
      stageBookingReferenceMedia({
        files: [{ filename: "ref-b.jpg", originalname: "after.jpg", buffer: Buffer.from("b") }],
        mediaStore: createMediaStore({
          async stage() {
            throw new Error("storage offline");
          },
        }),
        MediaObjectModel: createMediaObjectModel(),
      }),
    /storage offline/
  );
});

test("logs sanitized warning when staged compensation status update fails", async () => {
  const logs = [];
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const staged = await stageBookingReferenceMedia({
    files: [{ filename: "ref-a.jpg", originalname: "before.jpg", buffer: Buffer.from("before") }],
    mediaStore,
    MediaObjectModel,
  });

  let updateAttempts = 0;
  MediaObjectModel.findByIdAndUpdate = async (id, update) => {
    if (update?.$set?.failureCode === "BOOKING_REFERENCE_MEDIA_STAGED") {
      updateAttempts += 1;
      throw new Error("persist failed at /tmp/write.log");
    }
    const doc = MediaObjectModel.docs.find((entry) => entry._id === id);
    if (!doc) return null;
    Object.assign(doc, update.$set || {});
    return doc;
  };

  __bookingReferenceMediaTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });

  await compensateBookingReferenceMediaFailure({
    media: staged,
    promotedMedia: [],
    bookingId: "../bad-booking-id",
    error: new Error("rollback failed secret_123"),
    mediaStore,
    MediaObjectModel,
  });

  assert.equal(updateAttempts, 1);
  assert.deepEqual(logs, [
    [
      {
        event: "booking_reference_media.compensation_status_persist_failed",
        operation: "compensateBookingReferenceMediaFailure",
        mediaObjectId: undefined,
        bookingId: undefined,
        status: MEDIA_OBJECT_STATES.STAGED,
        err: { name: "Error" },
      },
      "booking_reference_media.compensation_status_persist_failed",
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /secret_123|rollback failed|\/tmp\/write\.log|\.\.\/bad-booking-id/i);
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.STAGED);
  assert.deepEqual(mediaStore.deleted, []);
});

test("logs sanitized warning when delete-pending cleanup metadata update fails", async () => {
  const logs = [];
  const MediaObjectModel = createMediaObjectModel();
  const mediaStore = createMediaStore();
  const staged = await stageBookingReferenceMedia({
    files: [{ filename: "ref-a.jpg", originalname: "before.jpg", buffer: Buffer.from("before") }],
    mediaStore,
    MediaObjectModel,
  });

  await promoteBookingReferenceMedia({ media: staged, mediaStore, MediaObjectModel });
  await activateBookingReferenceMedia({
    media: staged,
    bookingId: "64c000000000000000000123",
    MediaObjectModel,
  });

  let updateAttempts = 0;
  MediaObjectModel.findByIdAndUpdate = async (id, update) => {
    if (update?.$set?.failureCode === "BOOKING_REFERENCE_MEDIA_DELETE_PENDING") {
      updateAttempts += 1;
      throw new Error("write failed at /srv/private/delete");
    }
    const doc = MediaObjectModel.docs.find((entry) => entry._id === id);
    if (!doc) return null;
    Object.assign(doc, update.$set || {});
    return doc;
  };

  __bookingReferenceMediaTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });

  await compensateBookingReferenceMediaFailure({
    media: staged,
    promotedMedia: staged,
    bookingId: "64c000000000000000000123",
    error: new Error("delete failed secret_123"),
    mediaStore: createMediaStore({
      async delete() {
        throw new Error("storage delete failed /srv/private/blob");
      },
    }),
    MediaObjectModel,
  });

  assert.equal(updateAttempts, 1);
  assert.deepEqual(logs, [
    [
      {
        event: "booking_reference_media.cleanup_finalize_persist_failed",
        operation: "compensateBookingReferenceMediaFailure",
        mediaObjectId: undefined,
        bookingId: "64c000000000000000000123",
        status: MEDIA_OBJECT_STATES.DELETE_PENDING,
        err: { name: "Error" },
      },
      "booking_reference_media.cleanup_finalize_persist_failed",
    ],
  ]);
  assert.doesNotMatch(
    JSON.stringify(logs),
    /secret_123|delete failed|storage delete failed|\/srv\/private\/blob|\/srv\/private\/delete/i
  );
  assert.equal(MediaObjectModel.docs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
});

test("hostile booking logger identifiers are neither coerced nor logged", async () => {
  const logs = [];
  const coercionCounters = {
    bookingToString: 0,
    bookingValueOf: 0,
    bookingPrimitive: 0,
  };
  const hostileBookingId = {
    toString() {
      coercionCounters.bookingToString += 1;
      return "../secrets/customer@example.com";
    },
    valueOf() {
      coercionCounters.bookingValueOf += 1;
      return "64c000000000000000000999";
    },
    [Symbol.toPrimitive]() {
      coercionCounters.bookingPrimitive += 1;
      return "64c000000000000000000999";
    },
  };

  const MediaObjectModel = createMediaObjectModel();

  let updateAttempts = 0;
  MediaObjectModel.findByIdAndUpdate = async (id, update) => {
    if (update?.$set?.failureCode === "BOOKING_REFERENCE_MEDIA_STAGED") {
      updateAttempts += 1;
      throw new Error("persist failed");
    }
    return null;
  };

  __bookingReferenceMediaTestHooks.setLogger({
    warn: (...args) => logs.push(args),
  });

  await compensateBookingReferenceMediaFailure({
    media: [{ mediaObjectId: "64c000000000000000000555" }],
    promotedMedia: [],
    bookingId: hostileBookingId,
    error: new Error("rollback failed secret_123"),
    mediaStore: createMediaStore(),
    MediaObjectModel,
  });

  assert.equal(updateAttempts, 1);
  assert.deepEqual(coercionCounters, {
    bookingToString: 0,
    bookingValueOf: 0,
    bookingPrimitive: 0,
  });
  assert.deepEqual(logs, [
    [
      {
        event: "booking_reference_media.compensation_status_persist_failed",
        operation: "compensateBookingReferenceMediaFailure",
        mediaObjectId: "64c000000000000000000555",
        bookingId: undefined,
        status: MEDIA_OBJECT_STATES.STAGED,
        err: { name: "Error" },
      },
      "booking_reference_media.compensation_status_persist_failed",
    ],
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /secret_123|customer@example\.com|64c000000000000000000999/i);
});
