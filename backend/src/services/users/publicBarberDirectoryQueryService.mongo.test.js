import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import BarberProfile from "../../models/BarberProfile.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import Favorite from "../../models/Favorite.js";
import Review from "../../models/Review.js";
import { getPaidAccessByBarberIds } from "../../services/subscriptionService.js";
import { findPublicBarberDirectoryPage } from "./publicBarberDirectoryQueryService.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
const weeklySchedule = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, {
  working: !["sun", "sat"].includes(day), from: ["sun", "sat"].includes(day) ? "" : "09:00", to: ["sun", "sat"].includes(day) ? "" : "18:00", breakFrom: "", breakTo: "",
}]));

const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/public_barber_directory_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), Service.syncIndexes()]);
};
const makeBarber = async ({ id, name, createdAt, onboarding, salons = [], salon, salonStatus }) => {
  const barber = await User.create({ _id: id, name, phone: `9${String(id).slice(-7)}`, email: `${name}@directory.test`, password: "password123", role: "barber", ...(onboarding === undefined ? {} : { specialistOnboarding: onboarding }), salons, ...(salon ? { salon, salonStatus } : {}) });
  await User.collection.updateOne({ _id: barber._id }, { $set: { createdAt } });
  return User.findById(barber._id);
};
const payIndividually = async (barber, plan) => Subscription.create({ ownerType: "barber", ownerId: barber._id, ownerRefModel: "User", payerId: barber._id, planId: plan._id, status: "active", pricePerSeat: 1, totalPrice: 1, currentPeriodEnd: new Date("2027-01-01") });
const independentReady = async (barber, { active = true } = {}) => {
  await BarberProfile.create({ barberId: barber._id, address: "1 Main" });
  await Schedule.create({ barberId: barber._id, weeklySchedule });
  await Service.create({ barberId: barber._id, name: "Cut", price: 1, duration: 30, active });
};

afterEach(async () => { if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {}); });

test("real Mongo paginates only paid public-ready barbers with stable ties and no gaps", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Directory", code: `directory-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const unpaid = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000001"), name: "unpaid", createdAt: new Date("2025-01-01") });
  const inactive = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000002"), name: "inactive", createdAt: new Date("2025-01-02") });
  const unfinalized = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000003"), name: "unfinalized", createdAt: new Date("2025-01-03"), onboarding: { version: 1, status: "in_progress", currentStep: "review", workplace: "independent", completedAt: null } });
  const first = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000010"), name: "first", createdAt: base });
  const second = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000011"), name: "second", createdAt: base });
  const third = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000012"), name: "third", createdAt: base });
  const legacySchedule = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000013"), name: "legacy-schedule", createdAt: base });
  await Promise.all([independentReady(unpaid), independentReady(inactive, { active: false }), independentReady(unfinalized), independentReady(first), independentReady(second), independentReady(third)]);
  await Promise.all([BarberProfile.create({ barberId: legacySchedule._id, address: "1 Main" }), Service.create({ barberId: legacySchedule._id, name: "Cut", price: 1, duration: 30 }), Schedule.collection.insertOne({ barberId: legacySchedule._id, weeklySchedule })]);
  await Promise.all([payIndividually(inactive, plan), payIndividually(unfinalized, plan), payIndividually(first, plan), payIndividually(second, plan), payIndividually(third, plan), payIndividually(legacySchedule, plan)]);

  const pageOne = await findPublicBarberDirectoryPage({ skip: 0, limit: 2, now: new Date("2026-06-01") });
  const pageTwo = await findPublicBarberDirectoryPage({ skip: 2, limit: 2, now: new Date("2026-06-01") });
  const empty = await findPublicBarberDirectoryPage({ skip: 5, limit: 2, now: new Date("2026-06-01") });
  assert.deepEqual(pageOne.map((barber) => barber.name), ["first", "second"]);
  assert.deepEqual(pageTwo.map((barber) => barber.name), ["third", "legacy-schedule"]);
  assert.deepEqual(empty, []);
  assert.equal(new Set([...pageOne, ...pageTwo].map((barber) => String(barber._id))).size, 4);
});

test("real Mongo scopes favorite rank and explicit barber IDs", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Favorite", code: `favorite-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const first = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000040"), name: "first", createdAt: base });
  const second = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000041"), name: "second", createdAt: base });
  const third = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000042"), name: "third", createdAt: base });
  await Promise.all([independentReady(first), independentReady(second), independentReady(third), payIndividually(first, plan), payIndividually(second, plan), payIndividually(third, plan)]);
  const clientA = new mongoose.Types.ObjectId();
  const clientB = new mongoose.Types.ObjectId();
  await Favorite.create([{ clientId: clientA, barberId: third._id }, { clientId: clientB, barberId: second._id }]);
  const ranked = await findPublicBarberDirectoryPage({ skip: 0, limit: 3, now: new Date("2026-06-01"), favoriteClientId: clientA, barberIds: [first._id, second._id, third._id] });
  assert.deepEqual(ranked.map((barber) => barber.name), ["third", "first", "second"]);
  assert.equal(ranked.some((barber) => "_favorite" in barber || "_favoriteRank" in barber), false);
  const restricted = await findPublicBarberDirectoryPage({ skip: 0, limit: 3, now: new Date("2026-06-01"), barberIds: [second._id] });
  assert.deepEqual(restricted.map((barber) => barber.name), ["second"]);
});

test("real Mongo applies literal case-insensitive name filtering before pagination", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Name", code: `name-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const rows = await Promise.all(["Earlier", "Another", "ANN[1] Later", "ann[1] Final"].map((name, index) => makeBarber({ id: new mongoose.Types.ObjectId(`64b0000000000000000000${50 + index}`), name, createdAt: new Date(base.getTime() + index * 1000) })));
  await Promise.all(rows.flatMap((barber) => [independentReady(barber), payIndividually(barber, plan)]));
  const page = await findPublicBarberDirectoryPage({ name: "ann[1]", skip: 0, limit: 2, now: new Date("2026-06-01") });
  assert.deepEqual(page.map((barber) => barber.name), ["ANN[1] Later", "ann[1] Final"]);
});

test("real Mongo applies city, profession, and normalized barber type before pagination", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Fields", code: `fields-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const rows = await Promise.all(["wrong-city", "non-barber", "direct", "direct-later", "specialty", "unisex"].map((name, index) => makeBarber({ id: new mongoose.Types.ObjectId(`64b0000000000000000000${60 + index}`), name, createdAt: new Date(base.getTime() + index * 1000) })));
  await Promise.all(rows.flatMap((barber) => [independentReady(barber), payIndividually(barber, plan)]));
  await Promise.all([
    User.collection.updateOne({ _id: rows[0]._id }, { $set: { city: "Elsewhere", profession: "barber", barberType: "fade" } }),
    User.collection.updateOne({ _id: rows[1]._id }, { $set: { city: "Yerevan", profession: "stylist", specialty: "fade" } }),
    User.collection.updateOne({ _id: rows[2]._id }, { $set: { city: "Yerevan", profession: "barber", barberType: "fade" } }),
    User.collection.updateOne({ _id: rows[3]._id }, { $set: { city: "Yerevan", profession: "barber", barberType: "fade" } }),
    User.collection.updateOne({ _id: rows[4]._id }, { $set: { city: "Yerevan", profession: "barber", specialty: "curl" }, $unset: { barberType: "" } }),
    User.collection.updateOne({ _id: rows[5]._id }, { $set: { city: "Yerevan", profession: "barber" }, $unset: { barberType: "", specialty: "" } }),
  ]);
  const options = { skip: 0, limit: 2, now: new Date("2026-06-01"), city: "Yerevan", profession: "barber" };
  assert.deepEqual((await findPublicBarberDirectoryPage({ ...options, barberType: "fade" })).map((barber) => barber.name), ["direct", "direct-later"]);
  assert.deepEqual((await findPublicBarberDirectoryPage({ ...options, barberType: "curl" })).map((barber) => barber.name), ["specialty"]);
  assert.deepEqual((await findPublicBarberDirectoryPage({ ...options, barberType: "unisex" })).map((barber) => barber.name), ["unisex"]);
});

test("real Mongo applies active exact service names before pagination", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Service", code: `service-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const rows = await Promise.all(["different", "inactive", "third", "fourth"].map((name, index) => makeBarber({ id: new mongoose.Types.ObjectId(`64b0000000000000000000${70 + index}`), name, createdAt: new Date(base.getTime() + index * 1000) })));
  await Promise.all(rows.flatMap((barber) => [independentReady(barber), payIndividually(barber, plan)]));
  await Promise.all([
    Service.create({ barberId: rows[1]._id, name: "Requested", price: 1, duration: 30, active: false }),
    Service.create({ barberId: rows[2]._id, name: "Requested", price: 1, duration: 30, active: true }),
    Service.create({ barberId: rows[3]._id, name: "Requested", price: 1, duration: 30, active: true }),
  ]);
  const page = await findPublicBarberDirectoryPage({ serviceName: "Requested", skip: 0, limit: 2, now: new Date("2026-06-01") });
  assert.deepEqual(page.map((barber) => barber.name), ["third", "fourth"]);
});

test("real Mongo applies active other categories before pagination", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Category", code: `category-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const rows = await Promise.all(["haircut", "inactive-other", "explicit-other", "missing-other", "null-other"].map((name, index) => makeBarber({ id: new mongoose.Types.ObjectId(`64b0000000000000000000${80 + index}`), name, createdAt: new Date(base.getTime() + index * 1000) })));
  await Promise.all(rows.flatMap((barber) => [independentReady(barber), payIndividually(barber, plan)]));
  await Promise.all([
    Service.updateOne({ barberId: rows[0]._id, name: "Cut" }, { $set: { category: "haircut" } }),
    Service.updateOne({ barberId: rows[1]._id, name: "Cut" }, { $set: { category: "haircut" } }),
    Service.create({ barberId: rows[1]._id, name: "Other", price: 1, duration: 30, category: "other", active: false }),
    Service.updateOne({ barberId: rows[2]._id, name: "Cut" }, { $set: { category: "other" } }),
    Service.updateOne({ barberId: rows[3]._id, name: "Cut" }, { $unset: { category: "" } }),
    Service.collection.updateOne({ barberId: rows[4]._id, name: "Cut" }, { $set: { category: null } }),
  ]);
  const page = await findPublicBarberDirectoryPage({ category: "other", skip: 0, limit: 3, now: new Date("2026-06-01") });
  assert.deepEqual(page.map((barber) => barber.name), ["explicit-other", "missing-other", "null-other"]);
  assert.equal(page.some((barber) => Object.keys(barber).some((key) => key.startsWith("_serviceFilter"))), false);
});

test("real Mongo applies literal active service search before pagination", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Search", code: `search-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const rows = await Promise.all(["earlier", "inactive", "name", "category", "tags"].map((name, index) => makeBarber({ id: new mongoose.Types.ObjectId(`64b0000000000000000000${90 + index}`), name, createdAt: new Date(base.getTime() + index * 1000) })));
  await Promise.all(rows.flatMap((barber) => [independentReady(barber), payIndividually(barber, plan)]));
  await Promise.all([
    Service.collection.updateOne({ barberId: rows[0]._id, name: "Cut" }, { $set: { name: "Needle decoy" } }),
    Service.create({ barberId: rows[1]._id, name: "Needle[.+]* inactive", price: 1, duration: 30, active: false }),
    Service.collection.updateOne({ barberId: rows[2]._id, name: "Cut" }, { $set: { name: "Needle[.+]* name" } }),
    Service.collection.updateOne({ barberId: rows[3]._id, name: "Cut" }, { $set: { category: "Needle[.+]* category" } }),
    Service.collection.updateOne({ barberId: rows[4]._id, name: "Cut" }, { $set: { tags: ["needle[.+]* tag"] } }),
  ]);
  const page = await findPublicBarberDirectoryPage({ serviceSearch: "  NeEdLe[.+]*  ", skip: 0, limit: 3, now: new Date("2026-06-01") });
  assert.deepEqual(page.map((barber) => barber.name), ["name", "category", "tags"]);
});

test("real Mongo applies original active-service prices before pagination", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Price", code: `price-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const rows = await Promise.all(["low", "inactive-high", "discounted-mid", "high"].map((name, index) => makeBarber({ id: new mongoose.Types.ObjectId(`64b000000000000000000${100 + index}`), name, createdAt: new Date(base.getTime() + index * 1000) })));
  await Promise.all(rows.flatMap((barber) => [independentReady(barber), payIndividually(barber, plan)]));
  await Promise.all([
    Service.collection.updateOne({ barberId: rows[0]._id, name: "Cut" }, { $set: { price: 5 } }),
    Service.collection.updateOne({ barberId: rows[1]._id, name: "Cut" }, { $set: { price: 6 } }),
    Service.create({ barberId: rows[1]._id, name: "Inactive expensive", price: 100, duration: 30, active: false }),
    Service.collection.updateOne({ barberId: rows[2]._id, name: "Cut" }, { $set: { price: 20, discountType: "fixed", discountValue: 19 } }),
    Service.collection.updateOne({ barberId: rows[3]._id, name: "Cut" }, { $set: { price: 40 } }),
  ]);
  const options = { skip: 0, limit: 2, now: new Date("2026-06-01") };
  assert.deepEqual((await findPublicBarberDirectoryPage({ ...options, minPrice: 20 })).map((barber) => barber.name), ["discounted-mid", "high"]);
  assert.deepEqual((await findPublicBarberDirectoryPage({ ...options, maxPrice: 5 })).map((barber) => barber.name), ["low"]);
  assert.deepEqual((await findPublicBarberDirectoryPage({ ...options, minPrice: 15, maxPrice: 25 })).map((barber) => barber.name), ["discounted-mid"]);
});

test("real Mongo applies active frontend-compatible discounts before pagination", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Discount", code: `discount-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const rows = await Promise.all(["none", "zero", "rounded-zero", "fixed-free", "fixed", "percent", "independent"].map((name, index) => makeBarber({ id: new mongoose.Types.ObjectId(`64b000000000000000000${110 + index}`), name, createdAt: new Date(base.getTime() + index * 1000) })));
  await Promise.all(rows.flatMap((barber) => [independentReady(barber), payIndividually(barber, plan)]));
  await Promise.all([
    Service.collection.updateOne({ barberId: rows[0]._id, name: "Cut" }, { $set: { price: 10, discountType: "none", discountValue: 0 } }),
    Service.collection.updateOne({ barberId: rows[1]._id, name: "Cut" }, { $set: { price: 10, discountType: "percent", discountValue: 0 } }),
    Service.collection.updateOne({ barberId: rows[2]._id, name: "Cut" }, { $set: { price: 1, discountType: "percent", discountValue: 1 } }),
    Service.collection.updateOne({ barberId: rows[3]._id, name: "Cut" }, { $set: { price: 5, discountType: "fixed", discountValue: 5 } }),
    Service.collection.updateOne({ barberId: rows[4]._id, name: "Cut" }, { $set: { price: 10, discountType: "fixed", discountValue: 2 } }),
    Service.collection.updateOne({ barberId: rows[5]._id, name: "Cut" }, { $set: { price: 100, discountType: "percent", discountValue: 5 } }),
    Service.collection.updateOne({ barberId: rows[6]._id, name: "Cut" }, { $set: { price: 100, discountType: "none", discountValue: 0 } }),
    Service.create({ barberId: rows[6]._id, name: "Discount", price: 5, duration: 30, discountType: "fixed", discountValue: 1 }),
  ]);
  const page = await findPublicBarberDirectoryPage({ discountOnly: true, skip: 0, limit: 3, now: new Date("2026-06-01") });
  assert.deepEqual(page.map((barber) => barber.name), ["fixed-free", "fixed", "percent"]);
  assert.deepEqual((await findPublicBarberDirectoryPage({ discountOnly: true, minPrice: 50, skip: 0, limit: 2, now: new Date("2026-06-01") })).map((barber) => barber.name), ["percent", "independent"]);
});

test("real Mongo applies average rating before pagination without leaking review helpers", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Rating", code: `rating-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const base = new Date("2026-01-01T00:00:00Z");
  const rows = await Promise.all(["early-miss", "exact", "high", "no-reviews"].map((name, index) => makeBarber({ id: new mongoose.Types.ObjectId(`64b000000000000000000${120 + index}`), name, createdAt: new Date(base.getTime() + index * 1000) })));
  await Promise.all(rows.flatMap((barber) => [independentReady(barber), payIndividually(barber, plan)]));
  await Review.collection.insertMany([
    { barberId: rows[0]._id, clientId: new mongoose.Types.ObjectId(), bookingId: new mongoose.Types.ObjectId(), rating: 2 },
    { barberId: rows[0]._id, clientId: new mongoose.Types.ObjectId(), bookingId: new mongoose.Types.ObjectId(), rating: 4 },
    { barberId: rows[1]._id, clientId: new mongoose.Types.ObjectId(), bookingId: new mongoose.Types.ObjectId(), rating: 3 },
    { barberId: rows[1]._id, clientId: new mongoose.Types.ObjectId(), bookingId: new mongoose.Types.ObjectId(), rating: 5 },
    { barberId: rows[2]._id, clientId: new mongoose.Types.ObjectId(), bookingId: new mongoose.Types.ObjectId(), rating: 5 },
  ]);
  const options = { skip: 0, limit: 4, now: new Date("2026-06-01") };
  const threshold = await findPublicBarberDirectoryPage({ ...options, rating: 4, limit: 2 });
  assert.deepEqual(threshold.map((barber) => barber.name), ["exact", "high"]);
  assert.equal(threshold.some((barber) => "_rating" in barber || "_reviewStats" in barber), false);
  assert.deepEqual((await findPublicBarberDirectoryPage({ ...options, rating: 4.1 })).map((barber) => barber.name), ["high"]);
  assert.deepEqual((await findPublicBarberDirectoryPage({ ...options, rating: 0 })).map((barber) => barber.name), ["early-miss", "exact", "high", "no-reviews"]);
});

test("real Mongo rejects malformed barber IDs before aggregation", { skip: !enabled }, async () => {
  await connect();
  await assert.rejects(
    findPublicBarberDirectoryPage({ barberIds: ["not-an-object-id"], skip: 0, limit: 1 }),
    /barberIds/
  );
  let aggregateCalls = 0;
  await assert.rejects(
    findPublicBarberDirectoryPage({ barberIds: ["not-an-object-id"], UserModel: { aggregate() { aggregateCalls += 1; return Promise.resolve([]); } } }),
    /barberIds/
  );
  assert.equal(aggregateCalls, 0);
});

test("real Mongo keeps canonical salon coverage isolated and admits independent completed onboarding", { skip: !enabled }, async () => {
  await connect();
  const plan = await SubscriptionPlan.create({ name: "Directory", code: `directory-salon-${process.pid}`, pricePerSeat: 1, currency: "AMD", interval: "month" });
  const salon = await Salon.create({ name: "Public", ownerId: new mongoose.Types.ObjectId() });
  const eligible = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000020"), name: "salon", createdAt: new Date("2026-01-01"), onboarding: { version: 1, status: "completed", currentStep: "review", workplace: "salon", completedAt: new Date() }, salons: [{ salon: salon._id, status: "approved", worksAsSpecialist: true }] });
  const rejected = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000021"), name: "rejected", createdAt: new Date("2026-01-02"), onboarding: { version: 1, status: "completed", currentStep: "review", workplace: "salon", completedAt: new Date() }, salons: [{ salon: salon._id, status: "rejected", worksAsSpecialist: true }] });
  const independent = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000022"), name: "independent", createdAt: new Date("2026-01-03"), onboarding: { version: 1, status: "completed", currentStep: "review", workplace: "independent", completedAt: new Date() } });
  const legacySeat = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000023"), name: "legacy-seat", createdAt: new Date("2026-01-04"), salon: salon._id, salonStatus: "approved" });
  const otherSalon = await Salon.create({ name: "Other", ownerId: new mongoose.Types.ObjectId() });
  const crossSalon = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000024"), name: "cross-salon", createdAt: new Date("2026-01-05"), onboarding: { version: 1, status: "completed", currentStep: "review", workplace: "salon", completedAt: new Date() }, salons: [{ salon: otherSalon._id, status: "approved", worksAsSpecialist: true }] });
  const chairRenter = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000025"), name: "chair-renter", createdAt: new Date("2026-01-06"), onboarding: { version: 1, status: "completed", currentStep: "review", workplace: "salon", completedAt: new Date() }, salons: [{ salon: salon._id, status: "approved", relationshipType: "chair_renter", worksAsSpecialist: true }] });
  const firstDuplicateRejected = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000026"), name: "duplicate-first-rejected", createdAt: new Date("2026-01-07"), onboarding: { version: 1, status: "completed", currentStep: "review", workplace: "salon", completedAt: new Date() }, salons: [{ salon: salon._id, status: "approved", relationshipType: "chair_renter", worksAsSpecialist: true }, { salon: salon._id, status: "approved", relationshipType: "staff", worksAsSpecialist: true }] });
  const firstDuplicateEligible = await makeBarber({ id: new mongoose.Types.ObjectId("64b000000000000000000027"), name: "duplicate-first-eligible", createdAt: new Date("2026-01-08"), onboarding: { version: 1, status: "completed", currentStep: "review", workplace: "salon", completedAt: new Date() }, salons: [{ salon: salon._id, status: "approved", relationshipType: "staff", worksAsSpecialist: true }, { salon: salon._id, status: "approved", relationshipType: "chair_renter", worksAsSpecialist: true }] });
  const subscription = await Subscription.create({ ownerType: "salon", ownerId: salon._id, ownerRefModel: "Salon", payerId: salon.ownerId, planId: plan._id, status: "active", pricePerSeat: 1, totalPrice: 1, currentPeriodEnd: new Date("2027-01-01") });
  const legacyParent = await Subscription.create({ ownerType: "barber", ownerId: new mongoose.Types.ObjectId(), ownerRefModel: "User", payerId: salon.ownerId, planId: plan._id, status: "active", pricePerSeat: 1, totalPrice: 1, currentPeriodEnd: new Date("2027-01-01") });
  await Promise.all([Service.create({ barberId: eligible._id, name: "Cut", price: 1, duration: 30 }), Service.create({ barberId: rejected._id, name: "Cut", price: 1, duration: 30 }), independentReady(independent), independentReady(legacySeat), Service.create({ barberId: crossSalon._id, name: "Cut", price: 1, duration: 30 }), Service.create({ barberId: chairRenter._id, name: "Cut", price: 1, duration: 30 }), Service.create({ barberId: firstDuplicateRejected._id, name: "Cut", price: 1, duration: 30 }), Service.create({ barberId: firstDuplicateEligible._id, name: "Cut", price: 1, duration: 30 })]);
  await Promise.all([SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: salon._id, barberId: eligible._id, assignedBy: salon.ownerId }), SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: salon._id, barberId: rejected._id, assignedBy: salon.ownerId }), SubscriptionSeat.create({ subscriptionId: legacyParent._id, salonId: salon._id, barberId: legacySeat._id, assignedBy: salon.ownerId }), SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: salon._id, barberId: crossSalon._id, assignedBy: salon.ownerId }), SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: salon._id, barberId: chairRenter._id, assignedBy: salon.ownerId }), SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: salon._id, barberId: firstDuplicateRejected._id, assignedBy: salon.ownerId }), SubscriptionSeat.create({ subscriptionId: subscription._id, salonId: salon._id, barberId: firstDuplicateEligible._id, assignedBy: salon.ownerId }), payIndividually(independent, plan)]);

  const page = await findPublicBarberDirectoryPage({ skip: 0, limit: 10, now: new Date("2026-06-01") });
  const paidAccess = await getPaidAccessByBarberIds([firstDuplicateRejected._id, firstDuplicateEligible._id]);
  assert.equal(paidAccess.get(String(firstDuplicateRejected._id)), false);
  assert.equal(paidAccess.get(String(firstDuplicateEligible._id)), true);
  assert.deepEqual(page.map((barber) => barber.name), ["salon", "independent", "legacy-seat", "duplicate-first-eligible"]);
  assert.deepEqual(page[0]._eligibleSalonIds.map(String), [String(salon._id)]);
});
