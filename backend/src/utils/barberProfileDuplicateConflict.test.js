import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BARBER_PROFILE_UNIQUE_INDEX,
  BarberProfileWriteError,
  isBarberProfileDuplicateConflict,
  retryBarberProfileUpsertOnDuplicate,
} from "./barberProfileDuplicateConflict.js";

const expectedDuplicate = () => {
  const error = new Error(
    `E11000 duplicate key error index: ${BARBER_PROFILE_UNIQUE_INDEX} dup key`
  );
  error.code = 11000;
  error.keyPattern = { barberId: 1 };
  return error;
};

test("recognizes only the expected barber profile unique-index conflict", () => {
  assert.equal(isBarberProfileDuplicateConflict(expectedDuplicate()), true);

  const unrelated = expectedDuplicate();
  unrelated.keyPattern = { email: 1 };
  assert.equal(isBarberProfileDuplicateConflict(unrelated), false);

  assert.equal(isBarberProfileDuplicateConflict({ code: 11000 }), false);
  assert.equal(
    isBarberProfileDuplicateConflict({
      code: 11000,
      keyPattern: { barberId: 1 },
      message: "duplicate key",
    }),
    false
  );
});

test("retries the expected duplicate once without upsert and bounds unexpected errors", async () => {
  const calls = [];
  const BarberProfileModel = {
    async findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      if (calls.length === 1) throw expectedDuplicate();
      return { barberId: "trusted" };
    },
  };
  const update = { $set: { bio: "Bio" }, $setOnInsert: { barberId: "trusted" } };
  const options = { returnDocument: "after", runValidators: true, upsert: true };

  const profile = await retryBarberProfileUpsertOnDuplicate({
    BarberProfileModel,
    barberId: "trusted",
    update,
    options,
  });

  assert.deepEqual(profile, { barberId: "trusted" });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { filter: { barberId: "trusted" }, update, options });
  assert.deepEqual(calls[1], {
    filter: { barberId: "trusted" },
    update,
    options: { returnDocument: "after", runValidators: true },
  });

  const unexpected = new Error("raw Mongo details");
  unexpected.code = 11000;
  unexpected.keyPattern = { email: 1 };
  await assert.rejects(
    () =>
      retryBarberProfileUpsertOnDuplicate({
        BarberProfileModel: { findOneAndUpdate: async () => { throw unexpected; } },
        barberId: "trusted",
        update,
        options,
      }),
    (error) =>
      error instanceof BarberProfileWriteError && !error.message.includes("Mongo")
  );
});
