import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import EventCertificate from "../../models/EventCertificate.js";
import MediaObject, { MEDIA_OBJECT_STATES } from "../../models/MediaObject.js";
import PortfolioPhoto from "../../models/PortfolioPhoto.js";
import { __mediaReconciliationTestHooks, reconcileMediaObject } from "./mediaReconciliationService.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);

const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/aud012_media_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([MediaObject.deleteMany({}), Booking.deleteMany({}), PortfolioPhoto.deleteMany({}), EventCertificate.deleteMany({})]);
  await Promise.all([MediaObject.createIndexes(), Booking.createIndexes(), PortfolioPhoto.createIndexes(), EventCertificate.createIndexes()]);
};

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
});

const storage = ({ fail = false } = {}) => ({
  deleted: [],
  async delete(key) {
    this.deleted.push(key);
    if (fail) throw new Error("storage unavailable");
    return { deleted: this.deleted.length === 1 };
  },
});

const createMedia = async (overrides = {}) => MediaObject.create({
  storageKey: `${new mongoose.Types.ObjectId()}.jpg`,
  status: MEDIA_OBJECT_STATES.DELETE_PENDING,
  mediaClass: "booking-reference",
  access: "private",
  ownerModel: "Booking",
  ownerId: new mongoose.Types.ObjectId(),
  legacyUrl: `uploads/booking-references/${new mongoose.Types.ObjectId()}.jpg`,
  ...overrides,
});

const createBooking = async ({ referenceImages = [] } = {}) => Booking.create({
  barberId: new mongoose.Types.ObjectId(),
  clientId: new mongoose.Types.ObjectId(),
  serviceId: new mongoose.Types.ObjectId(),
  dayKey: "2099-01-01",
  bookingDate: "2099-01-01",
  time: "10:00",
  duration: 30,
  price: 100,
  status: "pending",
  referenceImages,
});

test("real Mongo concurrent workers have one lease owner", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia();
  const results = await Promise.all([
    __mediaReconciliationTestHooks.acquireLease({ MediaObjectModel: MediaObject, mediaObjectId: media._id, tokenFactory: () => "worker-a", now: new Date(), leaseTtlMs: 60000 }),
    __mediaReconciliationTestHooks.acquireLease({ MediaObjectModel: MediaObject, mediaObjectId: media._id, tokenFactory: () => "worker-b", now: new Date(), leaseTtlMs: 60000 }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await MediaObject.findById(media._id)).reconciliationFencingToken, 1);
});

test("real Mongo expired takeover fences stale finalization", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia({ reconciliationLeaseToken: "old", reconciliationLeaseExpiresAt: new Date("2020-01-01"), reconciliationFencingToken: 3 });
  const lease = await __mediaReconciliationTestHooks.acquireLease({ MediaObjectModel: MediaObject, mediaObjectId: media._id, tokenFactory: () => "new", now: new Date("2026-01-01"), leaseTtlMs: 60000 });
  assert.equal(lease.fencingToken, 4);
  const stale = await MediaObject.findOneAndUpdate({ _id: media._id, reconciliationLeaseToken: "old" }, { $set: { status: MEDIA_OBJECT_STATES.DELETED } });
  assert.equal(stale, null);
  assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.DELETE_PENDING);
});

test("real Mongo staged claim rejects stale fencing and current fencing succeeds", { skip: !enabled }, async () => {
  await connect();
  const now = new Date("2026-01-01");
  const stale = await createMedia({ status: MEDIA_OBJECT_STATES.STAGED, ownerModel: "", ownerId: null });
  const mediaStore = storage();
  let intercepted = false;
  const model = {
    findOne: MediaObject.findOne.bind(MediaObject),
    findOneAndUpdate: async (...args) => {
      if (!intercepted && args[0]?.status === MEDIA_OBJECT_STATES.STAGED) {
        intercepted = true;
        await MediaObject.updateOne(
          { _id: stale._id, reconciliationLeaseToken: "worker-a", reconciliationFencingToken: 1 },
          { $set: { reconciliationLeaseExpiresAt: new Date("2020-01-01") } }
        );
        const takeover = await __mediaReconciliationTestHooks.acquireLease({
          MediaObjectModel: MediaObject,
          mediaObjectId: stale._id,
          tokenFactory: () => "worker-b",
          now,
          leaseTtlMs: 60000,
        });
        assert.equal(takeover.fencingToken, 2);
      }
      return MediaObject.findOneAndUpdate(...args);
    },
  };
  const staleResult = await reconcileMediaObject({
    mediaObjectId: stale._id,
    MediaObjectModel: model,
    mediaStore,
    tokenFactory: () => "worker-a",
    now,
  });
  const staleSaved = await MediaObject.findById(stale._id);
  assert.equal(staleResult.reason, "lease_lost");
  assert.equal(mediaStore.deleted.length, 0);
  assert.equal(staleSaved.status, MEDIA_OBJECT_STATES.STAGED);
  assert.equal(staleSaved.reconciliationLeaseToken, "worker-b");
  assert.equal(staleSaved.reconciliationFencingToken, 2);

  const current = await createMedia({ status: MEDIA_OBJECT_STATES.STAGED, ownerModel: "", ownerId: null });
  const currentStore = storage();
  const currentResult = await reconcileMediaObject({ mediaObjectId: current._id, mediaStore: currentStore, tokenFactory: () => "worker-current", now });
  assert.equal(currentResult.processed, true);
  assert.equal(currentStore.deleted.length, 1);
  assert.equal((await MediaObject.findById(current._id)).status, MEDIA_OBJECT_STATES.DELETED);
});

test("real Mongo final and retry CAS reject stale fencing or changed state", { skip: !enabled }, async () => {
  await connect();
  const fenced = await createMedia();
  const fenceStore = {
    async delete() {
      await MediaObject.updateOne(
        { _id: fenced._id },
        { $set: { reconciliationLeaseToken: "new-owner", reconciliationLeaseExpiresAt: new Date("2026-01-02") }, $inc: { reconciliationFencingToken: 1 } }
      );
      return { deleted: true };
    },
  };
  const fencedResult = await reconcileMediaObject({ mediaObjectId: fenced._id, mediaStore: fenceStore, tokenFactory: () => "old-owner", now: new Date("2026-01-01") });
  assert.equal(fencedResult.reason, "lease_lost");
  assert.equal((await MediaObject.findById(fenced._id)).reconciliationLeaseToken, "new-owner");

  const changed = await createMedia();
  const changedStore = {
    async delete() {
      await MediaObject.updateOne({ _id: changed._id }, { $set: { status: MEDIA_OBJECT_STATES.ACTIVE } });
      throw new Error("storage failure after state change");
    },
  };
  const changedResult = await reconcileMediaObject({ mediaObjectId: changed._id, mediaStore: changedStore, tokenFactory: () => "owner", now: new Date("2026-01-01") });
  const saved = await MediaObject.findById(changed._id);
  assert.equal(changedResult.reason, "lease_lost");
  assert.equal(saved.status, MEDIA_OBJECT_STATES.ACTIVE);
  assert.equal(saved.reconciliationRetryCount, 0);
});

test("real Mongo referenced delete-pending object fails closed", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia();
  const booking = await createBooking({ referenceImages: [media.legacyUrl] });
  await MediaObject.updateOne({ _id: media._id }, { $set: { ownerId: booking._id } });
  const mediaStore = storage();
  const result = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01") });
  assert.equal(result.reason, "referenced");
  assert.equal(mediaStore.deleted.length, 0);
  assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.DELETE_PENDING);
});

test("real Mongo referenced EventCertificate media fails closed", { skip: !enabled }, async () => {
  await connect();
  const certificate = await EventCertificate.create({ eventId: new mongoose.Types.ObjectId(), registrationId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), organizerId: new mongoose.Types.ObjectId(), certificateId: "CERT-RECONCILE", verificationCode: "VERIFY-RECONCILE", fileUrl: "/uploads/certificate-files/current.pdf" });
  const media = await createMedia({ mediaClass: "event-certificate", ownerModel: "EventCertificate", ownerId: certificate._id, legacyUrl: certificate.fileUrl, access: "public" });
  await EventCertificate.updateOne({ _id: certificate._id }, { $set: { mediaObjectId: media._id } });
  const mediaStore = storage();
  const result = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01") });
  assert.equal(result.reason, "referenced");
  assert.equal(mediaStore.deleted.length, 0);
});

test("real Mongo Booking rows without valid legacyUrl fail closed", { skip: !enabled }, async () => {
  await connect();
  for (const legacyUrl of ["", undefined, "not-a-booking-reference"]) {
    const media = await createMedia({ legacyUrl });
    const mediaStore = storage();
    const result = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01") });
    assert.equal(result.reason, "ambiguous");
    assert.equal(mediaStore.deleted.length, 0);
    assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.DELETE_PENDING);
  }
});

test("real Mongo safe delete and replay finalize once", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia();
  const mediaStore = storage();
  const first = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01") });
  const replay = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01") });
  assert.equal(first.processed, true);
  assert.equal(replay.processed, false);
  assert.equal(mediaStore.deleted.length, 1);
  assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.DELETED);
});

test("real Mongo missing physical object is idempotent", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia();
  const mediaStore = storage();
  await reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01") });
  assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.DELETED);
});

test("real Mongo recovers after storage deletion before DB finalization", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia();
  const mediaStore = storage();
  let failFinalize = true;
  const model = {
    findOne: MediaObject.findOne.bind(MediaObject),
    findOneAndUpdate: async (...args) => {
      if (failFinalize && args[1]?.$set?.status === MEDIA_OBJECT_STATES.DELETED) {
        failFinalize = false;
        throw new Error("simulated finalize crash");
      }
      return MediaObject.findOneAndUpdate(...args);
    },
  };
  const first = await reconcileMediaObject({ mediaObjectId: media._id, MediaObjectModel: model, mediaStore, now: new Date("2026-01-01"), retryLimit: 3 });
  assert.equal(first.reason, "retry_scheduled");
  assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.DELETE_PENDING);
  await MediaObject.updateOne({ _id: media._id }, { $set: { nextReconciliationAt: new Date("2025-01-01"), reconciliationLeaseExpiresAt: new Date("2025-01-01") } });
  const second = await reconcileMediaObject({ mediaObjectId: media._id, MediaObjectModel: model, mediaStore, now: new Date("2026-01-01") });
  assert.equal(second.processed, true);
  assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.DELETED);
});

test("real Mongo storage failure persists retry metadata atomically", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia();
  const result = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore: storage({ fail: true }), now: new Date("2026-01-01"), retryLimit: 2, retryBaseMs: 10, retryMaxMs: 100 });
  const saved = await MediaObject.findById(media._id);
  assert.equal(result.reason, "retry_scheduled");
  assert.equal(saved.reconciliationRetryCount, 1);
  assert.equal(saved.reconciliationManual, false);
  assert.ok(saved.nextReconciliationAt instanceof Date);
});

test("real Mongo ambiguous owner never deletes", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia({ ownerModel: "Unknown" });
  const mediaStore = storage();
  const result = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01") });
  assert.equal(result.reason, "ambiguous");
  assert.equal(mediaStore.deleted.length, 0);
});

test("real Mongo concurrent reconciliation does not duplicate deletion", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia();
  const mediaStore = storage();
  const results = await Promise.all([
    reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01"), tokenFactory: () => "a" }),
    reconcileMediaObject({ mediaObjectId: media._id, mediaStore, now: new Date("2026-01-01"), tokenFactory: () => "b" }),
  ]);
  assert.equal(results.filter((result) => result.processed).length, 1);
  assert.equal(mediaStore.deleted.length, 1);
  assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.DELETED);
});

test("real Mongo staged cleanup never deletes an active object", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia({ status: MEDIA_OBJECT_STATES.ACTIVE, ownerModel: "PortfolioPhoto", mediaClass: "portfolio-before" });
  const result = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore: storage(), now: new Date("2026-01-01") });
  assert.equal(result.reason, "not_due_or_contended");
  assert.equal((await MediaObject.findById(media._id)).status, MEDIA_OBJECT_STATES.ACTIVE);
});

test("real Mongo failed state is retained for manual reconciliation", { skip: !enabled }, async () => {
  await connect();
  const media = await createMedia({ status: MEDIA_OBJECT_STATES.FAILED, failureCode: "BOOKING_REFERENCE_STAGE_FAILED" });
  const result = await reconcileMediaObject({ mediaObjectId: media._id, mediaStore: storage(), now: new Date("2026-01-01") });
  assert.equal(result.reason, "manual_required");
  assert.equal((await MediaObject.findById(media._id)).reconciliationManual, true);
});
