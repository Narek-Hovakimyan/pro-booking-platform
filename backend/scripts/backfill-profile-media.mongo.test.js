import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import MediaObject from "../src/models/MediaObject.js";
import { LocalMediaStore } from "../src/services/media/localMediaStore.js";
import { runProfileMediaBackfill } from "./backfill-profile-media.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
const cleanups = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
});

test("real Mongo concurrent profile-media backfills reserve one mapping", { skip: !enabled }, async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/profile_media_backfill_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await MediaObject.deleteMany({});
  await MediaObject.createIndexes();

  const root = await mkdtemp(path.join(os.tmpdir(), "profile-media-backfill-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const uploadDir = path.join(root, "uploads", "avatars");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, "concurrent.png"), Buffer.from("concurrent-media"));
  const previousCwd = process.cwd();
  process.chdir(root);
  cleanups.push(() => { process.chdir(previousCwd); });

  const ownerId = new mongoose.Types.ObjectId();
  const reference = { _id: ownerId, avatarUrl: "/uploads/avatars/concurrent.png" };
  const UserModel = { find: () => ({ select: async () => [reference] }) };
  const BarberProfileModel = { find: () => ({ select: async () => [] }) };
  const mediaStore = new LocalMediaStore({ root: path.join(root, "media") });
  cleanups.push(() => mediaStore.close());
  const options = { write: true, UserModel, BarberProfileModel, mediaStore };
  const results = await Promise.allSettled([
    runProfileMediaBackfill(options),
    runProfileMediaBackfill(options),
  ]);

  assert.ok(results.some((result) => result.status === "fulfilled"));
  const mappings = await MediaObject.find({ legacyUrl: reference.avatarUrl }).lean();
  assert.equal(mappings.length, 1);
  assert.equal(mappings[0].ownerId.toString(), ownerId.toString());
  assert.equal(mappings[0].mediaClass, "profile-avatar");
  assert.equal(mappings[0].status, "active");
});
