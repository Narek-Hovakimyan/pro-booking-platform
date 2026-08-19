import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import BarberProfile from "../../models/BarberProfile.js";
import Booking from "../../models/Booking.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import Salon from "../../models/Salon.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import Voucher from "../../models/Voucher.js";
import {
  createBooking,
  quoteBookingPrice,
  updateBooking,
} from "./bookingController.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true";
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const weeklySchedule = Object.fromEntries(
  ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [
    day, { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
  ])
);

const connectIsolatedDb = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("RUN_REAL_MONGO_TRANSACTION_TESTS=true requires MONGO_URI");
  const isolated = new URL(uri);
  const name = isolated.pathname.replace(/^\/+|\/+$/g, "") || "hairbook_ci_test";
  isolated.pathname = `/${name}_voucher_${process.pid}`;
  await mongoose.connect(isolated.toString(), { serverSelectionTimeoutMS: 5000 });
};

afterEach(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
});

test("real Mongo scoped voucher quote/create parity, ambiguity, and contention", { skip: !enabled }, async () => {
  await connectIsolatedDb();
  await Promise.all([Booking.deleteMany({}), BookingSlotHold.deleteMany({}), Voucher.deleteMany({}), User.deleteMany({}), Salon.deleteMany({}), Service.deleteMany({}), Schedule.deleteMany({}), BarberProfile.deleteMany({}), Subscription.deleteMany({}), SubscriptionSeat.deleteMany({}), SubscriptionPlan.deleteMany({})]);
  await Promise.all([Voucher.createIndexes(), BookingSlotHold.createIndexes(), Subscription.createIndexes(), SubscriptionSeat.createIndexes()]);

  const barberId = new mongoose.Types.ObjectId();
  const clientId = new mongoose.Types.ObjectId();
  const salonAId = new mongoose.Types.ObjectId();
  const salonBId = new mongoose.Types.ObjectId();
  const fixtureKey = `voucher-${process.pid}`;
  const plan = await SubscriptionPlan.create({ name: "Test", code: `voucher-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  await User.create([
    { _id: barberId, role: "barber", name: "Barber", phone: `+3749000${process.pid}1`, email: `${fixtureKey}-barber@example.com`, password: "hashed-password", salons: [{ salon: salonAId, status: "approved", relationshipStatus: "accepted", worksAsSpecialist: true }] },
    { _id: clientId, role: "client", name: "Client", phone: `+3749000${process.pid}2`, email: `${fixtureKey}-client@example.com`, password: "hashed-password" },
  ]);
  await Salon.create([{ _id: salonAId, name: "A", ownerId: barberId }, { _id: salonBId, name: "B", ownerId: barberId }]);
  const subscription = await Subscription.create({ ownerType: "salon", ownerId: salonAId, ownerRefModel: "Salon", payerId: barberId, planId: plan._id, status: "active", seatCount: 1, activeSeatCount: 1, pricePerSeat: 1, totalPrice: 1, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86_400_000) });
  await SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: salonAId, barberId, assignedBy: barberId, status: "active" });
  const service = await Service.create({ barberId, name: "Cut", price: 100, duration: 30, active: true });
  await Schedule.create({ barberId, salonId: salonAId, weeklySchedule });

  const day = "2026-12-15";
  const body = (code, time) => ({ barberId, clientId, salonId: salonAId, serviceId: service._id, bookingDate: day, dayKey: "tue", time, clientName: "Client", voucherCode: code });
  const invokeQuote = async (code) => { const res = response(); await quoteBookingPrice({ user: { _id: clientId, role: "client" }, body: body(code, "10:00") }, res); return res; };
  const invokeCreate = async (code, time) => { const res = response(); await createBooking({ user: { _id: clientId, role: "client" }, body: body(code, time) }, res); return res; };
  const invokeStatus = async (bookingId, status, user) => {
    const res = response();
    const body = status === "rejected"
      ? { status, rejectionReason: "Unavailable" }
      : { status, cancelReason: "Plans changed" };
    await updateBooking({ user, params: { id: bookingId }, body }, res);
    return res;
  };

  const [a, b] = await Voucher.create([{ ownerType: "salon", ownerId: salonAId, code: "SAME", title: "A", type: "amount", amount: 10, maxUses: 2 }, { ownerType: "salon", ownerId: salonBId, code: "SAME", title: "B", type: "amount", amount: 40, maxUses: 2 }]);
  const quote = await invokeQuote("SAME");
  assert.equal(quote.statusCode, 200);
  assert.equal(quote.body.voucherDiscountAmount, 10);
  assert.equal(quote.body.finalPrice, 90);
  const created = await invokeCreate("SAME", "10:00");
  assert.equal(created.statusCode, 201);
  assert.equal(String((await Booking.findOne({ voucherCode: "SAME" })).voucherId), String(a._id));
  assert.equal((await Voucher.findById(a._id)).currentUses, 1);
  assert.equal((await Voucher.findById(b._id)).currentUses, 0);

  const barberCollision = await Voucher.create({ ownerType: "barber", ownerId: barberId, code: "SAME", title: "Collision", type: "amount", amount: 10, maxUses: 2 });
  assert.equal((await invokeQuote("SAME")).statusCode, 400);
  assert.equal((await invokeCreate("SAME", "11:00")).statusCode, 400);
  assert.equal((await Booking.countDocuments({ time: "11:00" })), 0);
  assert.equal((await Voucher.findById(a._id)).currentUses, 1);
  assert.equal((await Voucher.findById(barberCollision._id)).currentUses, 0);

  const limited = await Voucher.create({ ownerType: "salon", ownerId: salonAId, code: "LIMIT", title: "Limited", type: "amount", amount: 10, maxUses: 1 });
  const other = await Voucher.create({ ownerType: "salon", ownerId: salonBId, code: "LIMIT", title: "Other", type: "amount", amount: 10, maxUses: 1 });
  const results = await Promise.all([invokeCreate("LIMIT", "12:00"), invokeCreate("LIMIT", "13:00")]);
  assert.equal(results.filter((result) => result.statusCode === 201).length, 1);
  assert.equal((await Voucher.findById(limited._id)).currentUses, 1);
  assert.equal((await Voucher.findById(other._id)).currentUses, 0);
  const bookings = await Booking.find({ voucherId: limited._id });
  assert.equal(bookings.length, 1);
  assert.equal((await Voucher.findById(limited._id)).redemptionBookingIds.length, 1);

  const cancelled = await invokeStatus(bookings[0]._id, "cancelled", {
    _id: clientId,
    role: "client",
  });
  assert.equal(cancelled.statusCode, 200);
  assert.equal((await Booking.findById(bookings[0]._id)).status, "cancelled");
  assert.equal((await Voucher.findById(limited._id)).currentUses, 0);
  assert.equal((await Voucher.findById(limited._id)).redemptionBookingIds.length, 0);

  const cancelReplay = await invokeStatus(bookings[0]._id, "cancelled", {
    _id: clientId,
    role: "client",
  });
  assert.equal(cancelReplay.statusCode, 400);
  assert.equal((await Voucher.findById(limited._id)).currentUses, 0);

  const rejectVoucher = await Voucher.create({ ownerType: "salon", ownerId: salonAId, code: "REJECT", title: "Reject", type: "amount", amount: 10, maxUses: 1 });
  assert.equal((await invokeCreate("REJECT", "14:00")).statusCode, 201);
  const rejectBooking = await Booking.findOne({ voucherId: rejectVoucher._id });
  const rejected = await invokeStatus(rejectBooking._id, "rejected", {
    _id: barberId,
    role: "barber",
  });
  assert.equal(rejected.statusCode, 200);
  assert.equal((await Voucher.findById(rejectVoucher._id)).currentUses, 0);
  assert.equal((await Voucher.findById(rejectVoucher._id)).redemptionBookingIds.length, 0);

  const failingVoucher = await Voucher.create({ ownerType: "salon", ownerId: salonAId, code: "FAILRESTORE", title: "Failure", type: "amount", amount: 10, maxUses: 1 });
  assert.equal((await invokeCreate("FAILRESTORE", "15:00")).statusCode, 201);
  const failingBooking = await Booking.findOne({ voucherId: failingVoucher._id });
  const originalFindOneAndUpdate = Voucher.findOneAndUpdate;
  Voucher.findOneAndUpdate = async (filter, ...args) => {
    if (String(filter?._id) === String(failingVoucher._id) && filter.redemptionBookingIds) {
      throw new Error("restore failed");
    }
    return originalFindOneAndUpdate.call(Voucher, filter, ...args);
  };
  try {
    const failedCancel = await invokeStatus(failingBooking._id, "cancelled", {
      _id: clientId,
      role: "client",
    });
    assert.equal(failedCancel.statusCode, 500);
  } finally {
    Voucher.findOneAndUpdate = originalFindOneAndUpdate;
  }
  assert.equal((await Booking.findById(failingBooking._id)).status, "pending");
  assert.equal((await Voucher.findById(failingVoucher._id)).currentUses, 1);
  assert.equal((await Voucher.findById(failingVoucher._id)).redemptionBookingIds.length, 1);
});
