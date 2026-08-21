import assert from "node:assert/strict";
import { test } from "node:test";

import { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import {
  __mediaReconciliationTestHooks,
  reconcileDueMediaObjects,
  reconcileMediaObject,
} from "./mediaReconciliationService.js";

const id = (value) => value;
const match = (doc, query = {}) => {
  if (query.$and && !query.$and.every((part) => match(doc, part))) return false;
  if (query.$or && !query.$or.some((part) => match(doc, part))) return false;
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$and" || key === "$or") return true;
    const actual = doc[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$in" in expected) return expected.$in.some((value) => Array.isArray(actual) ? actual.includes(value) : String(actual) === String(value));
      if ("$lte" in expected) return actual == null || new Date(actual).getTime() <= new Date(expected.$lte).getTime();
      if ("$gt" in expected) return actual != null && new Date(actual).getTime() > new Date(expected.$gt).getTime();
      if ("$ne" in expected) return actual !== expected.$ne;
      return match(actual || {}, expected);
    }
    return Array.isArray(actual) ? actual.includes(expected) : String(actual ?? "") === String(expected ?? "");
  });
};

const query = (values) => {
  const q = Promise.resolve(values);
  q.sort = () => q;
  q.limit = (limit) => Promise.resolve(values.slice(0, limit));
  q.lean = () => q;
  return q;
};

const createModels = ({ media = [], bookings = [], photos = [] } = {}) => {
  const update = (doc, operation = {}) => {
    for (const [key, value] of Object.entries(operation.$set || {})) doc[key] = value;
    for (const [key, value] of Object.entries(operation.$inc || {})) doc[key] = (doc[key] || 0) + value;
    for (const key of Object.keys(operation.$unset || {})) delete doc[key];
    return doc;
  };
  const model = (docs) => ({
    docs,
    find(filter) { return query(docs.filter((doc) => match(doc, filter))); },
    findOne(filter) { return Promise.resolve(docs.find((doc) => match(doc, filter)) || null); },
    async findOneAndUpdate(filter, operation) {
      const doc = docs.find((entry) => match(entry, filter));
      return doc ? update(doc, operation) : null;
    },
  });
  return { MediaObjectModel: model(media), BookingModel: model(bookings), PortfolioPhotoModel: model(photos) };
};

const mediaDoc = (overrides = {}) => ({
  _id: id(overrides._id || "media-1"),
  status: MEDIA_OBJECT_STATES.DELETE_PENDING,
  storageKey: "media-1.jpg",
  stageKey: "",
  mediaClass: "booking-reference",
  ownerModel: "Booking",
  ownerId: "booking-1",
  legacyUrl: "uploads/booking-references/a.jpg",
  reconciliationLeaseToken: "",
  reconciliationLeaseExpiresAt: null,
  reconciliationFencingToken: 0,
  reconciliationRetryCount: 0,
  nextReconciliationAt: null,
  reconciliationManual: false,
  ...overrides,
});

const store = ({ fail = false, missing = false } = {}) => ({
  deleted: [],
  async delete(key) {
    this.deleted.push(key);
    if (fail) throw new Error("temporary storage failure");
    return { deleted: !missing };
  },
});

test("due selection and valid lease acquisition are atomic", async () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const docs = [mediaDoc(), mediaDoc({ _id: "future", nextReconciliationAt: new Date("2026-02-01") })];
  const { MediaObjectModel } = createModels({ media: docs });
  const due = await __mediaReconciliationTestHooks.findDue({ MediaObjectModel, now, limit: 10 });
  assert.equal(due.length, 1);
  const lease = await __mediaReconciliationTestHooks.acquireLease({ MediaObjectModel, mediaObjectId: "media-1", now, tokenFactory: () => "lease-a", leaseTtlMs: 1000 });
  assert.equal(lease.token, "lease-a");
  assert.equal(docs[0].reconciliationFencingToken, 1);
  const stolen = await __mediaReconciliationTestHooks.acquireLease({ MediaObjectModel, mediaObjectId: "media-1", now, tokenFactory: () => "lease-b", leaseTtlMs: 1000 });
  assert.equal(stolen, null);
});

test("expired leases are reclaimable and stale tokens cannot finalize", async () => {
  const docs = [mediaDoc({ reconciliationLeaseToken: "old", reconciliationLeaseExpiresAt: new Date("2025-01-01"), reconciliationFencingToken: 4 })];
  const { MediaObjectModel } = createModels({ media: docs });
  const lease = await __mediaReconciliationTestHooks.acquireLease({ MediaObjectModel, mediaObjectId: "media-1", now: new Date("2026-01-01"), tokenFactory: () => "new", leaseTtlMs: 1000 });
  assert.equal(lease.fencingToken, 5);
  const stale = await MediaObjectModel.findOneAndUpdate({ _id: "media-1", reconciliationLeaseToken: "old" }, { $set: { status: MEDIA_OBJECT_STATES.DELETED } });
  assert.equal(stale, null);
  assert.equal(docs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
});

test("fencing and expected status prevent stale finalization or retry overwrite", async () => {
  const now = () => new Date("2026-01-01");
  const fencingDocs = [mediaDoc()];
  const fencingModels = createModels({ media: fencingDocs });
  const fencedStore = {
    async delete() {
      fencingDocs[0].reconciliationLeaseToken = "new-owner";
      fencingDocs[0].reconciliationFencingToken = 2;
      fencingDocs[0].reconciliationLeaseExpiresAt = new Date("2026-01-02");
      return { deleted: true };
    },
  };
  const fenced = await reconcileMediaObject({ mediaObjectId: "media-1", ...fencingModels, mediaStore: fencedStore, tokenFactory: () => "old-owner", now });
  assert.equal(fenced.reason, "lease_lost");
  assert.equal(fencingDocs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
  assert.equal(fencingDocs[0].reconciliationLeaseToken, "new-owner");

  const statusDocs = [mediaDoc()];
  const statusModels = createModels({ media: statusDocs });
  const changedStatusStore = {
    async delete() {
      statusDocs[0].status = MEDIA_OBJECT_STATES.ACTIVE;
      return { deleted: true };
    },
  };
  const changed = await reconcileMediaObject({ mediaObjectId: "media-1", ...statusModels, mediaStore: changedStatusStore, tokenFactory: () => "owner", now });
  assert.equal(changed.reason, "lease_lost");
  assert.equal(statusDocs[0].status, MEDIA_OBJECT_STATES.ACTIVE);

  const retryDocs = [mediaDoc()];
  const retryModels = createModels({ media: retryDocs });
  const changedRetryStore = {
    async delete() {
      retryDocs[0].status = MEDIA_OBJECT_STATES.ACTIVE;
      throw new Error("storage failure");
    },
  };
  const staleRetry = await reconcileMediaObject({ mediaObjectId: "media-1", ...retryModels, mediaStore: changedRetryStore, tokenFactory: () => "owner", now });
  assert.equal(staleRetry.reason, "lease_lost");
  assert.equal(retryDocs[0].reconciliationRetryCount, 0);
});

test("staged claims require the exact token, fencing generation, and staged state", async () => {
  const now = () => new Date("2026-01-01");
  const assertStaleClaim = async (mutate, verify) => {
    const docs = [mediaDoc({ status: MEDIA_OBJECT_STATES.STAGED, ownerModel: "", ownerId: null })];
    const models = createModels({ media: docs });
    const originalFindOneAndUpdate = models.MediaObjectModel.findOneAndUpdate.bind(models.MediaObjectModel);
    models.MediaObjectModel.findOneAndUpdate = async (filter, operation) => {
      if (filter.status === MEDIA_OBJECT_STATES.STAGED) mutate(docs[0]);
      return originalFindOneAndUpdate(filter, operation);
    };
    const mediaStore = store();
    const result = await reconcileMediaObject({ mediaObjectId: "media-1", ...models, mediaStore, tokenFactory: () => "worker-a", now });
    assert.equal(result.reason, "lease_lost");
    assert.equal(mediaStore.deleted.length, 0);
    verify(docs[0]);
  };

  await assertStaleClaim(
    (doc) => {
      doc.reconciliationFencingToken = 2;
      doc.reconciliationLeaseExpiresAt = new Date("2026-02-01");
    },
    (doc) => {
      assert.equal(doc.status, MEDIA_OBJECT_STATES.STAGED);
      assert.equal(doc.reconciliationLeaseToken, "worker-a");
      assert.equal(doc.reconciliationFencingToken, 2);
    }
  );
  await assertStaleClaim(
    (doc) => { doc.reconciliationLeaseToken = "worker-b"; },
    (doc) => assert.equal(doc.reconciliationLeaseToken, "worker-b")
  );
  await assertStaleClaim(
    (doc) => { doc.status = MEDIA_OBJECT_STATES.ACTIVE; },
    (doc) => assert.equal(doc.status, MEDIA_OBJECT_STATES.ACTIVE)
  );

  const docs = [mediaDoc({ status: MEDIA_OBJECT_STATES.STAGED, ownerModel: "", ownerId: null })];
  const models = createModels({ media: docs });
  const mediaStore = store();
  const result = await reconcileMediaObject({ mediaObjectId: "media-1", ...models, mediaStore, tokenFactory: () => "worker-a", now });
  assert.equal(result.processed, true);
  assert.equal(docs[0].status, MEDIA_OBJECT_STATES.DELETED);
  assert.equal(mediaStore.deleted.length, 1);
});

test("safe delete-pending reconciliation finalizes once and missing storage is idempotent", async () => {
  for (const missing of [false, true]) {
    const docs = [mediaDoc()];
    const { MediaObjectModel } = createModels({ media: docs });
    const mediaStore = store({ missing });
    const result = await reconcileMediaObject({ mediaObjectId: "media-1", MediaObjectModel, BookingModel: createModels().BookingModel, PortfolioPhotoModel: createModels().PortfolioPhotoModel, mediaStore, tokenFactory: () => "lease", now: () => new Date("2026-01-01") });
    assert.equal(result.processed, true);
    assert.equal(docs[0].status, MEDIA_OBJECT_STATES.DELETED);
    assert.equal(mediaStore.deleted.length, 1);
    const replay = await reconcileMediaObject({ mediaObjectId: "media-1", MediaObjectModel, mediaStore, tokenFactory: () => "lease-2", now: () => new Date("2026-01-01") });
    assert.equal(replay.processed, false);
  }
});

test("referenced and ambiguous objects fail closed", async () => {
  const docs = [mediaDoc({ nextReconciliationAt: new Date("2025-01-01"), reconciliationLeaseExpiresAt: new Date("2025-01-01") })];
  const models = createModels({ media: docs, bookings: [{ _id: "booking-x", referenceImages: [docs[0].legacyUrl] }] });
  const mediaStore = store();
  const result = await reconcileMediaObject({ mediaObjectId: "media-1", ...models, mediaStore, tokenFactory: () => "lease", now: () => new Date("2026-01-01"), retryLimit: 3 });
  assert.equal(result.reason, "referenced");
  assert.equal(mediaStore.deleted.length, 0);
  assert.equal(docs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
  assert.equal(docs[0].reconciliationRetryCount, 1);

  docs[0].ownerModel = "Unknown";
  docs[0].reconciliationLeaseExpiresAt = new Date("2025-01-01");
  docs[0].nextReconciliationAt = new Date("2025-01-01");
  models.BookingModel.docs.length = 0;
  const ambiguous = await reconcileMediaObject({ mediaObjectId: "media-1", ...models, mediaStore, tokenFactory: () => "lease-2", now: () => new Date("2026-01-01"), retryLimit: 3 });
  assert.equal(ambiguous.reason, "ambiguous");
  assert.equal(mediaStore.deleted.length, 0);
});

test("missing or malformed Booking legacyUrl fails closed", async () => {
  for (const legacyUrl of ["", undefined, "not-a-booking-reference"]) {
    const docs = [mediaDoc({ legacyUrl })];
    const models = createModels({ media: docs });
    const mediaStore = store();
    const result = await reconcileMediaObject({ mediaObjectId: "media-1", ...models, mediaStore, tokenFactory: () => "lease", now: () => new Date("2026-01-01") });
    assert.equal(result.reason, "ambiguous");
    assert.equal(mediaStore.deleted.length, 0);
    assert.equal(docs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
  }
});

test("stale staged rows are claimed before cleanup and unsupported staging is manual", async () => {
  const docs = [mediaDoc({ status: MEDIA_OBJECT_STATES.STAGED, ownerModel: "", ownerId: null, stageKey: "old.stage", createdAt: new Date("2025-01-01") })];
  const models = createModels({ media: docs });
  const result = await reconcileMediaObject({ mediaObjectId: "media-1", ...models, mediaStore: store(), tokenFactory: () => "lease", now: () => new Date("2026-01-01") });
  assert.equal(result.reason, "staged_storage_unavailable");
  assert.equal(docs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
  assert.equal(docs[0].reconciliationManual, true);
});

test("storage failures persist bounded exponential retry and manual terminal state", async () => {
  const docs = [mediaDoc({ nextReconciliationAt: new Date("2025-01-01"), reconciliationLeaseExpiresAt: new Date("2025-01-01") })];
  const models = createModels({ media: docs });
  const failedStore = store({ fail: true });
  const result = await reconcileMediaObject({ mediaObjectId: "media-1", ...models, mediaStore: failedStore, tokenFactory: () => "lease", now: () => new Date("2026-01-01"), retryLimit: 2, retryBaseMs: 100, retryMaxMs: 1000 });
  assert.equal(result.reason, "retry_scheduled");
  assert.equal(docs[0].reconciliationRetryCount, 1);
  assert.equal(docs[0].reconciliationManual, false);
  assert.equal(docs[0].nextReconciliationAt.getTime(), new Date("2026-01-01").getTime() + 200);
  docs[0].reconciliationLeaseExpiresAt = new Date("2025-01-01");
  docs[0].nextReconciliationAt = new Date("2025-01-01");
  const final = await reconcileMediaObject({ mediaObjectId: "media-1", ...models, mediaStore: failedStore, tokenFactory: () => "lease-2", now: () => new Date("2026-01-01"), retryLimit: 2, retryBaseMs: 100, retryMaxMs: 1000 });
  assert.equal(final.reason, "retry_scheduled");
  assert.equal(docs[0].reconciliationManual, true);
});

test("active objects are never selected for automatic deletion", async () => {
  const docs = [mediaDoc({ status: MEDIA_OBJECT_STATES.ACTIVE })];
  const { MediaObjectModel } = createModels({ media: docs });
  const summary = await reconcileDueMediaObjects({ MediaObjectModel, now: new Date("2026-01-01"), mediaStore: store() });
  assert.equal(summary.scanned, 0);
  assert.equal(docs[0].status, MEDIA_OBJECT_STATES.ACTIVE);
});

test("referenced certification media is protected from reconciliation deletion", async () => {
  const docs = [mediaDoc({
    mediaClass: "profile-certification",
    ownerModel: "User",
    ownerId: "barber-1",
    legacyUrl: "/uploads/certifications/current.png",
  })];
  const { MediaObjectModel, BookingModel, PortfolioPhotoModel } = createModels({ media: docs });
  const result = await reconcileMediaObject({
    mediaObjectId: "media-1",
    MediaObjectModel,
    BookingModel,
    PortfolioPhotoModel,
    UserModel: { findOne: async () => null },
    BarberProfileModel: { findOne: async () => ({ barberId: "barber-1" }) },
    mediaStore: store(),
    tokenFactory: () => "lease",
    now: () => new Date("2026-01-01"),
  });
  assert.equal(result.reason, "referenced");
  assert.equal(docs[0].status, MEDIA_OBJECT_STATES.DELETE_PENDING);
});
