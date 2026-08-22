import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";

import { runProfileMediaBackfill, verifyPromotedBytes } from "./backfill-profile-media.js";

const ownerId = "507f1f77bcf86cd799439011";
const legacyUrl = "/uploads/avatars/avatar.png";
const reference = { _id: ownerId, avatarUrl: legacyUrl };
const active = (overrides = {}) => ({
  _id: "media-1", ownerModel: "User", ownerId, mediaClass: "profile-avatar",
  legacyUrl, status: "active", storageKey: "object.png", stageKey: "", ...overrides,
});
const staged = (overrides = {}) => ({ ...active({ status: "staged", stageKey: "stage.png" }), ...overrides });

const modelsFor = (media) => ({
  UserModel: { find: () => ({ select: async () => [reference] }) },
  BarberProfileModel: { find: () => ({ select: async () => [] }) },
  MediaObjectModel: {
    find: async ({ legacyUrl: url }) => media.filter((item) => item.legacyUrl === url),
    findOneAndUpdate: async (filter, update) => {
      const item = media.find((candidate) => candidate._id === filter._id && candidate.ownerModel === filter.ownerModel && String(candidate.ownerId) === String(filter.ownerId) && candidate.mediaClass === filter.mediaClass && candidate.legacyUrl === filter.legacyUrl && candidate.status === filter.status);
      if (!item) return null;
      Object.assign(item, update.$set);
      return item;
    },
  },
});

const dependencies = (media, overrides = {}) => ({
  ...modelsFor(media),
  fileExists: async () => {},
  hasPromoted: async () => true,
  stage: async () => {
    const item = staged({ _id: `media-${media.length + 1}` });
    media.push(item);
    return item;
  },
  ...overrides,
});

test("profile-media backfill accepts only an exact active owner/class mapping", async () => {
  const result = await runProfileMediaBackfill(dependencies([active()]));
  assert.deepEqual(result, { mode: "dry-run", scanned: 1, created: 0, recovered: 0, ambiguous: 0, collisions: 0, missing: 0, existing: 1 });
});

test("profile-media write activates staged media, and write and dry-run reruns are idempotent", async () => {
  const media = [];
  const options = dependencies(media);
  const written = await runProfileMediaBackfill({ ...options, write: true });
  assert.equal(written.created, 1);
  assert.equal(media[0].status, "active");
  assert.equal(media[0].stageKey, "");
  assert.ok(media[0].activatedAt instanceof Date);

  const rerun = await runProfileMediaBackfill({ ...options, write: true });
  const dryRun = await runProfileMediaBackfill(options);
  assert.equal(rerun.created, 0);
  assert.equal(rerun.existing, 1);
  assert.equal(dryRun.created, 0);
  assert.equal(dryRun.existing, 1);
  assert.equal(media.length, 1);
});

test("profile-media backfill reuses an exact duplicate-key reservation winner", async () => {
  const media = [];
  const winner = active({ _id: "winner" });
  const result = await runProfileMediaBackfill({
    ...dependencies(media),
    write: true,
    stage: async () => { media.push(winner); return { reused: true, media: winner }; },
  });
  assert.equal(result.existing, 1);
  assert.equal(media.length, 1);
});

test("profile-media backfill recovers only an exact promoted staged mapping", async () => {
  const media = [staged()];
  const result = await runProfileMediaBackfill({ ...dependencies(media), write: true });
  assert.equal(result.recovered, 1);
  assert.equal(result.created, 0);
  assert.equal(media[0].status, "active");
  assert.equal(media[0].stageKey, "");
});

test("profile-media recovery fully reads and verifies promoted bytes", async () => {
  const media = staged({ byteSize: 5, checksumSha256: createHash("sha256").update("hello").digest("hex") });
  assert.equal(await verifyPromotedBytes(media, { createReadStream: async () => Readable.from([Buffer.from("he"), Buffer.from("llo")]) }), true);
});

test("profile-media recovery rejects checksum, size, and read failures", async () => {
  const media = staged({ byteSize: 5, checksumSha256: createHash("sha256").update("hello").digest("hex") });
  const stream = { createReadStream: async () => Readable.from([Buffer.from("hello")]) };
  assert.equal(await verifyPromotedBytes({ ...media, checksumSha256: "0".repeat(64) }, stream), false);
  assert.equal(await verifyPromotedBytes({ ...media, byteSize: 6 }, stream), false);
  const failing = { createReadStream: async () => Readable.from((async function* () { yield Buffer.from("hel"); throw new Error("read failed"); })()) };
  assert.equal(await verifyPromotedBytes(media, failing), false);
});

test("profile-media backfill retries an interrupted delete-pending promotion only after verification", async () => {
  const media = [staged({ status: "delete-pending" })];
  const result = await runProfileMediaBackfill({ ...dependencies(media), write: true });
  assert.equal(result.recovered, 1);
  assert.equal(media[0].status, "active");
});

test("profile-media dry-run never activates a recoverable staged mapping", async () => {
  const media = [staged()];
  const result = await runProfileMediaBackfill(dependencies(media));
  assert.equal(result.recovered, 1);
  assert.equal(media[0].status, "staged");
  assert.equal(media[0].stageKey, "stage.png");
});

test("profile-media backfill fails closed on mismatched staged mappings", async () => {
  const media = [staged({ ownerId: "507f1f77bcf86cd799439012" })];
  await assert.rejects(runProfileMediaBackfill({ ...dependencies(media), write: true }), (error) => {
    assert.equal(error.result.collisions, 1);
    assert.equal(media[0].status, "staged");
    return true;
  });
});

test("profile-media backfill refuses exact staged rows without promoted bytes", async () => {
  const media = [staged()];
  await assert.rejects(runProfileMediaBackfill({ ...dependencies(media), hasPromoted: async () => false }), (error) => {
    assert.equal(error.result.collisions, 1);
    assert.equal(media[0].status, "staged");
    return true;
  });
});

test("profile-media backfill surfaces activation failures without counting a creation", async () => {
  const media = [];
  await assert.rejects(runProfileMediaBackfill({
    ...dependencies(media),
    write: true,
    activate: async () => { throw new Error("activation failed"); },
  }), /activation failed/);
  assert.equal(media.length, 1);
  assert.equal(media[0].status, "staged");
});
