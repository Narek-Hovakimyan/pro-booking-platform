import assert from "node:assert/strict";
import test from "node:test";

import { runProfileMediaBackfill } from "./backfill-profile-media.js";

const ownerId = "507f1f77bcf86cd799439011";
const legacyUrl = "/uploads/avatars/avatar.png";

const modelsFor = (media) => ({
  UserModel: {
    find: () => ({ select: async () => [{ _id: ownerId, avatarUrl: legacyUrl }] }),
  },
  BarberProfileModel: {
    find: () => ({ select: async () => [] }),
  },
  MediaObjectModel: {
    find: async () => media,
  },
});

test("profile-media backfill accepts only an exact active owner/class mapping", async () => {
  const result = await runProfileMediaBackfill(modelsFor([{
    ownerModel: "User",
    ownerId,
    mediaClass: "profile-avatar",
    legacyUrl,
    status: "active",
  }]));

  assert.deepEqual(result, {
    mode: "dry-run",
    scanned: 1,
    created: 0,
    ambiguous: 0,
    collisions: 0,
    missing: 0,
    existing: 1,
  });
});

test("profile-media backfill fails closed on an incompatible existing owner/class mapping", async () => {
  await assert.rejects(
    runProfileMediaBackfill(modelsFor([{
      ownerModel: "User",
      ownerId: "507f1f77bcf86cd799439012",
      mediaClass: "profile-avatar",
      legacyUrl,
      status: "active",
    }])),
    (error) => {
      assert.equal(error.result.collisions, 1);
      assert.equal(error.result.existing, 0);
      assert.equal(error.result.created, 0);
      return true;
    }
  );
});
