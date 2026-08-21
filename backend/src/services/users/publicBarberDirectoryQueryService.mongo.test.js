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
