import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import LoyaltyRewardRedemption from "../../models/LoyaltyRewardRedemption.js";
import Voucher from "../../models/Voucher.js";
import {
  claimLoyaltyReward,
  consumeLoyaltyRewardForBooking,
  restoreLoyaltyRewardForBooking,
} from "./loyaltyRewardRedemptionService.js";
import { buildBookingPricing } from "./bookingPricingService.js";

const enabled =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" &&
  Boolean(process.env.MONGO_URI);

const ids = {
  barberId: new mongoose.Types.ObjectId(),
  clientId: new mongoose.Types.ObjectId(),
  serviceId: new mongoose.Types.ObjectId(),
};
const rewardScope = {
  barberId: ids.barberId,
  clientId: ids.clientId,
};

const connect = async () => {
  const isolatedUri = new URL(process.env.MONGO_URI);
  isolatedUri.pathname = `/aud009_loyalty_${process.pid}`;
  await mongoose.connect(isolatedUri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    LoyaltyRewardRedemption.deleteMany({}),
    Booking.deleteMany({}),
    Voucher.deleteMany({}),
  ]);
  await LoyaltyRewardRedemption.createIndexes();
};

const inTransaction = async (callback) => {
  const session = await mongoose.startSession();
  try {
    let value;
    await session.withTransaction(async () => {
      value = await callback(session);
    });
    return value;
  } finally {
    await session.endSession();
  }
};

const claim = (bookingId, overrides = {}) =>
  claimLoyaltyReward({
    ...ids,
    milestone: 1,
    bookingId,
    ...overrides,
  });

const createBooking = ({ _id, status = "pending", ...overrides } = {}) =>
  Booking.create({
    _id,
    barberId: ids.barberId,
    clientId: ids.clientId,
    serviceId: ids.serviceId,
    dayKey: "2099-01-01",
    bookingDate: "2099-01-01",
    time: "10:00",
    duration: 30,
    price: 100,
    status,
    ...overrides,
  });

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
});

test("real Mongo concurrent claims leave exactly one authoritative owner", { skip: !enabled }, async () => {
  await connect();
  const bookingIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const results = await Promise.allSettled(
    bookingIds.map((bookingId) => inTransaction((session) => claim(bookingId, { session })))
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await LoyaltyRewardRedemption.countDocuments({ status: "claimed" }), 1);
  assert.equal(await LoyaltyRewardRedemption.countDocuments({ milestone: 1 }), 1);
});

test("real Mongo transaction rollback removes a reward claim", { skip: !enabled }, async () => {
  await connect();
  const bookingId = new mongoose.Types.ObjectId();
  await assert.rejects(() => inTransaction(async (session) => {
    await claim(bookingId, { session });
    throw new Error("forced booking-create rollback");
  }));
  assert.equal(await LoyaltyRewardRedemption.countDocuments({}), 0);
});

test("real Mongo cancel and reject restoration is idempotent", { skip: !enabled }, async () => {
  await connect();
  for (const terminalAction of ["cancelled", "rejected"]) {
    const bookingId = new mongoose.Types.ObjectId();
    await inTransaction((session) => claim(bookingId, { session }));
    await inTransaction((session) => restoreLoyaltyRewardForBooking({ ...ids, bookingId, session }));
    await inTransaction((session) => restoreLoyaltyRewardForBooking({ ...ids, bookingId, session }));
    const reward = await LoyaltyRewardRedemption.findOne({ ...rewardScope, milestone: 1 });
    assert.equal(reward.status, "restored", terminalAction);
    await LoyaltyRewardRedemption.deleteMany({});
  }
});

test("real Mongo completion consumes permanently and replay is harmless", { skip: !enabled }, async () => {
  await connect();
  const bookingId = new mongoose.Types.ObjectId();
  await inTransaction((session) => claim(bookingId, { session }));
  await inTransaction((session) => consumeLoyaltyRewardForBooking({ ...ids, bookingId, session }));
  await inTransaction((session) => consumeLoyaltyRewardForBooking({ ...ids, bookingId, session }));
  const reward = await LoyaltyRewardRedemption.findOne({ ...rewardScope, milestone: 1 });
  assert.equal(reward.status, "consumed");
  await assert.rejects(() => inTransaction((session) => claim(new mongoose.Types.ObjectId(), { session })));
});

test("real Mongo concurrent completion versus restore preserves one terminal ledger state", { skip: !enabled }, async () => {
  await connect();
  const bookingId = new mongoose.Types.ObjectId();
  await inTransaction((session) => claim(bookingId, { session }));
  const race = await Promise.allSettled([
    inTransaction((session) => consumeLoyaltyRewardForBooking({ ...ids, bookingId, session })),
    inTransaction((session) => restoreLoyaltyRewardForBooking({ ...ids, bookingId, session })),
  ]);
  assert.equal(race.filter((result) => result.status === "rejected").length, 0);
  const reward = await LoyaltyRewardRedemption.findOne({ ...rewardScope, milestone: 1 });
  assert.ok(["restored", "consumed"].includes(reward.status));
});

test("real Mongo pair isolation prevents cross-client or cross-barber mutation", { skip: !enabled }, async () => {
  await connect();
  const bookingId = new mongoose.Types.ObjectId();
  await inTransaction((session) => claim(bookingId, { session }));
  const unrelated = {
    barberId: new mongoose.Types.ObjectId(),
    clientId: new mongoose.Types.ObjectId(),
    bookingId,
  };
  assert.equal(await restoreLoyaltyRewardForBooking(unrelated), null);
  assert.equal(await consumeLoyaltyRewardForBooking(unrelated), null);
  const reward = await LoyaltyRewardRedemption.findOne({ ...rewardScope, milestone: 1 });
  assert.equal(reward.status, "claimed");
});

test("real Mongo booking references can be created independently of the reward ledger", { skip: !enabled }, async () => {
  await connect();
  const booking = await createBooking({ status: "pending" });
  const reward = await inTransaction((session) => claim(booking._id, { session }));
  assert.equal(String(reward.bookingId), String(booking._id));
  assert.equal(await Booking.countDocuments({ _id: booking._id, status: "pending" }), 1);
});

test("real Mongo pricing keeps voucher and loyalty rewards mutually exclusive", { skip: !enabled }, async () => {
  await connect();
  await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      createBooking({
        _id: new mongoose.Types.ObjectId(),
        status: "completed",
        bookingDate: `2099-01-0${index + 1}`,
        dayKey: `2099-01-0${index + 1}`,
      })
    )
  );
  await Voucher.create({
    ownerType: "barber",
    ownerId: ids.barberId,
    code: "STACK10",
    title: "Stack test",
    type: "amount",
    amount: 20,
    discountType: "fixed",
    maxUses: 1,
    currentUses: 0,
    active: true,
  });

  const pricing = await buildBookingPricing({
    barber: {
      loyaltyDiscountSettings: {
        enabled: true,
        thresholdCompletedBookings: 4,
        discountPercent: 10,
        maxDiscountPercent: 50,
      },
    },
    barberId: ids.barberId,
    clientId: ids.clientId,
    service: {
      _id: ids.serviceId,
      price: 100,
      duration: 30,
      discountType: "percent",
      discountValue: 10,
    },
    serviceId: ids.serviceId,
    voucherCode: "STACK10",
  });

  assert.equal(pricing.serviceDiscountedPrice, 90);
  assert.equal(pricing.voucherDiscountAmount, 20);
  assert.equal(pricing.loyaltyDiscount.applied, false);
  assert.equal(pricing.finalPrice, 70);
});
