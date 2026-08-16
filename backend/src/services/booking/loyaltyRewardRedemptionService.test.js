import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import LoyaltyRewardRedemption from "../../models/LoyaltyRewardRedemption.js";
import {
  claimLoyaltyReward,
  consumeLoyaltyRewardForBooking,
  getLoyaltyMilestone,
  LoyaltyRewardUnavailableError,
  restoreLoyaltyRewardForBooking,
} from "./loyaltyRewardRedemptionService.js";

const original = {
  findOne: LoyaltyRewardRedemption.findOne,
  findOneAndUpdate: LoyaltyRewardRedemption.findOneAndUpdate,
};

afterEach(() => {
  LoyaltyRewardRedemption.findOne = original.findOne;
  LoyaltyRewardRedemption.findOneAndUpdate = original.findOneAndUpdate;
});

const ids = {
  barberId: "64b000000000000000000001",
  clientId: "64b000000000000000000002",
  bookingId: "64b000000000000000000003",
};

test("milestone identity uses the existing threshold calculation", () => {
  assert.equal(
    getLoyaltyMilestone({
      applied: true,
      eligibleCompletedBookings: 8,
      ruleSnapshot: { thresholdCompletedBookings: 4 },
    }),
    2
  );
  assert.equal(getLoyaltyMilestone({ applied: false }), null);
});

test("claim is session-bound, upserted once, and idempotent for the same booking", async () => {
  const calls = [];
  LoyaltyRewardRedemption.findOneAndUpdate = async (filter, update, options) => {
    calls.push({ filter, update, options });
    return { ...ids, milestone: 1, status: "claimed" };
  };

  const session = { id: "session-1" };
  const result = await claimLoyaltyReward({
    ...ids,
    milestone: 1,
    session,
  });

  assert.equal(result.status, "claimed");
  assert.deepEqual(calls[0].filter.$or, [
    { status: "restored" },
    { status: "claimed", bookingId: ids.bookingId },
  ]);
  assert.equal(calls[0].options.session, session);
  assert.equal(calls[0].options.upsert, true);
  assert.equal(calls[0].update.$set.bookingId, ids.bookingId);
});

test("claim fails closed when another booking owns the unique reward", async () => {
  LoyaltyRewardRedemption.findOneAndUpdate = async () => {
    throw Object.assign(new Error("duplicate"), { code: 11000 });
  };

  await assert.rejects(
    () => claimLoyaltyReward({ ...ids, milestone: 1 }),
    (error) => error instanceof LoyaltyRewardUnavailableError && error.statusCode === 400
  );
});

test("restore is conditional on the exact claimed booking and is replay-safe", async () => {
  let captured;
  LoyaltyRewardRedemption.findOneAndUpdate = async (filter, update, options) => {
    captured = { filter, update, options };
    return null;
  };

  const session = { id: "session-2" };
  assert.equal(
    await restoreLoyaltyRewardForBooking({ ...ids, session }),
    null
  );
  assert.deepEqual(captured.filter, {
    barberId: ids.barberId,
    clientId: ids.clientId,
    bookingId: ids.bookingId,
    status: "claimed",
  });
  assert.equal(captured.update.$set.status, "restored");
  assert.equal(captured.options.session, session);
});

test("completion consumes only the exact claim and recognizes an already-consumed replay", async () => {
  const calls = [];
  LoyaltyRewardRedemption.findOneAndUpdate = async (filter, update) => {
    calls.push({ filter, update });
    return null;
  };
  LoyaltyRewardRedemption.findOne = async (filter) => {
    assert.deepEqual(filter, {
      barberId: ids.barberId,
      clientId: ids.clientId,
      bookingId: ids.bookingId,
      status: "consumed",
    });
    return { status: "consumed", bookingId: ids.bookingId };
  };

  const result = await consumeLoyaltyRewardForBooking(ids);
  assert.equal(result.status, "consumed");
  assert.equal(calls[0].filter.status, "claimed");
  assert.equal(calls[0].update.$set.status, "consumed");
});
