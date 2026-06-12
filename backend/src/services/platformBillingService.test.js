import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Salon from "../models/Salon.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import SubscriptionSeat from "../models/SubscriptionSeat.js";
import SubscriptionPaymentAttempt from "../models/SubscriptionPaymentAttempt.js";
import PlatformAuditLog from "../models/PlatformAuditLog.js";
import {
  activateSalonSubscription,
  updateSalonSeatCount,
  assignSalonSeat,
  revokeSalonSeat,
  confirmSalonPayment,
  getAllSalonBillingSummaries,
  getSalonBillingDetail,
  getSalonPayments,
  getAllSalonPayments,
} from "./platformBillingService.js";

/* ── ObjectId helpers ────────────────────────────────── */

const oid = (hex) => new mongoose.Types.ObjectId(hex);
const salonIdStr = oid("64b000000000000000010000").toString();

/* ── Fixed ObjectIds ─────────────────────────────────── */

const salonId = oid("64b000000000000000010000");
const otherSalonId = oid("64b000000000000000020000");
const ownerId = oid("64b000000000000000030000");

const acceptedStaffId = oid("64b000000000000000040001");
const legacyStaffId = oid("64b000000000000000040002");
const chairRenterId = oid("64b000000000000000040003");
const pendingStaffId = oid("64b000000000000000040004");
const rejectedStaffId = oid("64b000000000000000040005");
const unassignedAcceptedId = oid("64b000000000000000040006");

const subscriptionId = oid("64b000000000000000050000");
const otherSubscriptionId = oid("64b000000000000000050001");
const paymentId = oid("64b000000000000000060000");
const depositPaymentId = oid("64b000000000000000060001");
const otherSalonPaymentId = oid("64b000000000000000060002");

/* ── Shared mock data ────────────────────────────────── */

const salonDoc = {
  _id: salonId,
  name: "Test Salon",
  city: "Yerevan",
  address: "123 Test St",
  phone: "+374000000",
  imageUrl: "/salon.jpg",
  ownerId,
  createdAt: new Date("2025-01-01"),
};

const ownerDoc = {
  _id: ownerId,
  name: "Salon Owner",
  email: "owner@example.com",
  avatarUrl: "/avatar.jpg",
  city: "Yerevan",
  phone: "+374111111",
  password: "hashed-password",
  platformRole: "admin",
  emailVerificationTokenHash: "secret-token",
};

const subscriptionDoc = {
  _id: subscriptionId,
  ownerType: "salon",
  ownerId: salonId,
  status: "active",
  seatCount: 3,
  pricePerSeat: 100,
  totalPrice: 300,
  provider: "manual",
  currentPeriodStart: new Date("2025-06-01"),
  currentPeriodEnd: new Date("2025-07-01"),
  lastPaymentAt: new Date("2025-06-01"),
  createdAt: new Date("2025-06-01"),
  updatedAt: new Date("2025-06-01"),
};

const expiredSubscriptionDoc = {
  _id: otherSubscriptionId,
  ownerType: "salon",
  ownerId: otherSalonId,
  status: "expired",
  seatCount: 1,
  pricePerSeat: 100,
  totalPrice: 100,
  provider: "manual",
  currentPeriodStart: new Date("2024-01-01"),
  currentPeriodEnd: new Date("2024-02-01"),
  lastPaymentAt: new Date("2024-01-01"),
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/* ── Staff barber documents ──────────────────────────── */

const acceptedStaffDoc = {
  _id: acceptedStaffId,
  name: "Accepted Staff",
  email: "accepted@example.com",
  avatarUrl: null,
  profession: "hair",
  barberType: "staff",
  password: "hashed-password",
  platformRole: "admin",
  emailVerificationTokenHash: "secret-token",
  salons: [
    {
      salon: salonId,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "accepted",
    },
  ],
};

const legacyStaffDoc = {
  _id: legacyStaffId,
  name: "Legacy Staff",
  email: "legacy@example.com",
  avatarUrl: null,
  profession: "barber",
  barberType: "staff",
  salons: [],
  salon: salonId,
  salonStatus: "approved",
};

const chairRenterDoc = {
  _id: chairRenterId,
  name: "Chair Renter",
  email: "renter@example.com",
  avatarUrl: null,
  profession: "hair",
  barberType: "chair_renter",
  salons: [
    {
      salon: salonId,
      status: "approved",
      relationshipType: "chair_renter",
      relationshipStatus: "accepted",
    },
  ],
};

const pendingStaffDoc = {
  _id: pendingStaffId,
  name: "Pending Staff",
  email: "pending@example.com",
  avatarUrl: null,
  profession: "hair",
  barberType: "staff",
  salons: [
    {
      salon: salonId,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "pending",
    },
  ],
};

const rejectedStaffDoc = {
  _id: rejectedStaffId,
  name: "Rejected Staff",
  email: "rejected@example.com",
  avatarUrl: null,
  profession: "hair",
  barberType: "staff",
  salons: [
    {
      salon: salonId,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "rejected",
    },
  ],
};

const unassignedAcceptedDoc = {
  _id: unassignedAcceptedId,
  name: "Unassigned Accepted",
  email: "unassigned@example.com",
  avatarUrl: null,
  profession: "hair",
  barberType: "staff",
  salons: [
    {
      salon: salonId,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "accepted",
    },
  ],
};

const acceptedSeatDoc = {
  _id: oid("64b000000000000000070001"),
  subscriptionId,
  salonId,
  barberId: {
    _id: acceptedStaffId,
    name: "Accepted Staff",
    avatarUrl: null,
    email: "accepted@example.com",
    profession: "hair",
    barberType: "staff",
    password: "hashed-password",
    platformRole: "admin",
    emailVerificationTokenHash: "secret-token",
  },
  status: "active",
  assignedAt: new Date("2025-06-01"),
};

const legacySeatDoc = {
  _id: oid("64b000000000000000070002"),
  subscriptionId,
  salonId,
  barberId: {
    _id: legacyStaffId,
    name: "Legacy Staff",
    avatarUrl: null,
    email: "legacy@example.com",
    profession: "barber",
    barberType: "staff",
  },
  status: "active",
  assignedAt: new Date("2025-06-01"),
};

const chairRenterSeatDoc = {
  _id: oid("64b000000000000000070003"),
  subscriptionId,
  salonId,
  barberId: {
    _id: chairRenterId,
    name: "Chair Renter",
    avatarUrl: null,
    email: "renter@example.com",
    profession: "hair",
    barberType: "chair_renter",
  },
  status: "active",
  assignedAt: new Date("2025-06-01"),
};

const pendingSeatDoc = {
  _id: oid("64b000000000000000070004"),
  subscriptionId,
  salonId,
  barberId: {
    _id: pendingStaffId,
    name: "Pending Staff",
    avatarUrl: null,
    email: "pending@example.com",
    profession: "hair",
    barberType: "staff",
  },
  status: "active",
  assignedAt: new Date("2025-06-01"),
};

const rejectedSeatDoc = {
  _id: oid("64b000000000000000070005"),
  subscriptionId,
  salonId,
  barberId: {
    _id: rejectedStaffId,
    name: "Rejected Staff",
    avatarUrl: null,
    email: "rejected@example.com",
    profession: "hair",
    barberType: "staff",
  },
  status: "active",
  assignedAt: new Date("2025-06-01"),
};

const subscriptionPaymentDoc = {
  _id: paymentId,
  purpose: "subscription",
  ownerType: "salon",
  ownerId: salonId,
  payerId: ownerId,
  subscriptionId,
  amount: 300,
  currency: "AMD",
  status: "paid",
  provider: "manual",
  seatCount: 3,
  months: 1,
  paidAt: new Date("2025-06-01"),
  confirmedAt: new Date("2025-06-01"),
  createdAt: new Date("2025-06-01"),
  updatedAt: new Date("2025-06-01"),
  checkoutUrl: null,
  providerPaymentId: null,
};

const depositPaymentDoc = {
  _id: depositPaymentId,
  purpose: "booking_deposit",
  ownerType: "barber",
  ownerId: acceptedStaffId,
  payerId: oid("64b000000000000000080001"),
  amount: 50,
  currency: "AMD",
  status: "paid",
  provider: "manual",
  createdAt: new Date("2025-06-01"),
  updatedAt: new Date("2025-06-01"),
  checkoutUrl: null,
  providerPaymentId: null,
  metadata: { sensitive: "data" },
};

const otherSalonPaymentDoc = {
  _id: otherSalonPaymentId,
  purpose: "subscription",
  ownerType: "salon",
  ownerId: otherSalonId,
  payerId: oid("64b000000000000000090001"),
  subscriptionId: otherSubscriptionId,
  amount: 100,
  currency: "AMD",
  status: "paid",
  provider: "manual",
  createdAt: new Date("2025-06-01"),
  updatedAt: new Date("2025-06-01"),
  checkoutUrl: null,
  providerPaymentId: null,
};

/* ── Mock infrastructure ────────────────────────────── */

// Generic store for saving originals
const originals = {};

const saveOriginal = (obj, key) => {
  const storageKey = `${obj.modelName || obj.name || obj.constructor?.name}__${key}`;
  if (originals[storageKey] === undefined) {
    originals[storageKey] = obj[key];
  }
};

const restoreOriginals = () => {
  for (const [key, value] of Object.entries(originals)) {
    const [modelName, method] = key.split("__");
    const modelMap = {
      Salon, User, Subscription, SubscriptionPlan, SubscriptionSeat, SubscriptionPaymentAttempt, PlatformAuditLog,
    };
    if (modelMap[modelName] && value !== undefined) {
      modelMap[modelName][method] = value;
    }
    delete originals[key];
  }
};

const cloneValue = (value) => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value instanceof Date || value instanceof mongoose.Types.ObjectId) return value;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)])
    );
  }
  return value;
};

const setNestedValue = (target, source, parts) => {
  const [part, ...rest] = parts;
  if (!part || source?.[part] === undefined) return;

  if (rest.length === 0) {
    target[part] = cloneValue(source[part]);
    return;
  }

  if (Array.isArray(source[part])) {
    target[part] = target[part] || source[part].map(() => ({}));
    source[part].forEach((entry, index) => {
      const nestedTarget = target[part][index] || {};
      setNestedValue(nestedTarget, entry, rest);
      target[part][index] = nestedTarget;
    });
    return;
  }

  target[part] = target[part] || {};
  setNestedValue(target[part], source[part], rest);
};

const projectDoc = (doc, fields) => {
  if (!fields) return doc;

  const fieldNames = String(fields)
    .split(/\s+/)
    .map((field) => field.trim())
    .filter(Boolean);
  if (fieldNames.length === 0) return doc;

  const projected = {};
  if (doc?._id !== undefined) projected._id = doc._id;

  for (const field of fieldNames) {
    if (field.startsWith("-")) continue;
    setNestedValue(projected, doc, field.split("."));
  }

  return projected;
};

/**
 * Flexible mock chain builder.
 * Supports: .sort() .skip() .limit() .select() .lean() .populate()
 */
const qc = (result, selectedFields = null) => ({
  sort: () => qc(result, selectedFields),
  skip: () => qc(result, selectedFields),
  limit: () => qc(result, selectedFields),
  select: (fields) => qc(result, fields),
  populate: () => qc(result, selectedFields),
  lean: async () =>
    Array.isArray(result)
      ? result.map((item) => projectDoc(item, selectedFields))
	    : projectDoc(result, selectedFields),
});

const saveableDoc = (doc, onSave = null) => ({
  ...cloneValue(doc),
  async save() {
    if (onSave) onSave(this);
    return this;
  },
});

/**
 * Mock a model method with a chainable query.
 * Example: mockQuery(User, "find", [userDoc])  → User.find() returns chain
 */
const mockQuery = (Model, method, result) => {
  saveOriginal(Model, method);
  Model[method] = () => qc(result);
};

/**
 * Mock a model method with a custom implementation.
 */
const mockMethod = (Model, method, impl) => {
  saveOriginal(Model, method);
  Model[method] = impl;
};

afterEach(() => {
  restoreOriginals();
});

/* ════════════════════════════════════════════════════════ */
/* Test 1: detail includes modern accepted staff            */
/* ════════════════════════════════════════════════════════ */

test("salon billing detail includes modern accepted staff", async () => {
  const barbers = [acceptedStaffDoc, legacyStaffDoc, chairRenterDoc, pendingStaffDoc, rejectedStaffDoc];

  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockQuery(Subscription, "findOne", subscriptionDoc);
  mockMethod(User, "find", () => qc(barbers));
  mockMethod(SubscriptionSeat, "find", () => qc([acceptedSeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");

  const staffNames = detail.acceptedStaff.map((s) => s.name);
  assert.ok(staffNames.includes("Accepted Staff"), "Modern accepted staff included");
  assert.ok(staffNames.includes("Legacy Staff"), "Legacy accepted staff included");
  assert.equal(staffNames.includes("Chair Renter"), false, "Chair renter excluded");
  assert.equal(staffNames.includes("Pending Staff"), false, "Pending staff excluded");
  assert.equal(staffNames.includes("Rejected Staff"), false, "Rejected staff excluded");

  assert.equal(detail.seats.used, 1, "Only 1 accepted staff seat used");
  assert.equal(detail.seats.total, 3, "Total seats = subscription seatCount");
  assert.equal(detail.seats.available, 2, "Available = total - used");
  assert.equal(detail.owner.password, undefined, "Owner password excluded");
  assert.equal(detail.owner.platformRole, undefined, "Owner platformRole excluded");
  assert.equal(detail.owner.emailVerificationTokenHash, undefined, "Owner private auth fields excluded");
  assert.equal(detail.acceptedStaff[0].password, undefined, "Staff password excluded");
  assert.equal(detail.acceptedStaff[0].platformRole, undefined, "Staff platformRole excluded");
  assert.equal(detail.seats.assignments[0].barber.password, undefined, "Seat barber password excluded");
  assert.equal(detail.seats.assignments[0].barber.platformRole, undefined, "Seat barber platformRole excluded");
});

/* ════════════════════════════════════════════════════════ */
/* Test 2: detail includes legacy staff                    */
/* ════════════════════════════════════════════════════════ */

test("salon billing detail includes legacy accepted staff (barber.salon + salonStatus)", async () => {
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockQuery(Subscription, "findOne", subscriptionDoc);
  mockMethod(User, "find", () => qc([legacyStaffDoc]));
  mockMethod(SubscriptionSeat, "find", () => qc([legacySeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");
  assert.ok(detail.acceptedStaff.map((s) => s.name).includes("Legacy Staff"), "Legacy staff included");
  assert.equal(detail.seats.used, 1, "Legacy staff seat counted");
});

/* ════════════════════════════════════════════════════════ */
/* Test 3: chair renter excluded                           */
/* ════════════════════════════════════════════════════════ */

test("chair renter excluded from staff list, used seats, and assignments", async () => {
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockQuery(Subscription, "findOne", subscriptionDoc);
  mockMethod(User, "find", () => qc([chairRenterDoc]));
  mockMethod(SubscriptionSeat, "find", () => qc([chairRenterSeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");

  assert.equal(detail.acceptedStaff.length, 0, "No accepted staff (chair renter excluded)");
  assert.equal(detail.seats.used, 0, "Chair renter seat does not consume capacity");
  assert.equal(detail.seats.assignments.length, 0, "No seat assignments for chair renter");
  assert.equal(detail.seats.available, 3, "Full capacity available");
});

/* ════════════════════════════════════════════════════════ */
/* Test 4: pending staff excluded                          */
/* ════════════════════════════════════════════════════════ */

test("pending staff excluded from staff list and seat usage", async () => {
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockQuery(Subscription, "findOne", subscriptionDoc);
  mockMethod(User, "find", () => qc([pendingStaffDoc]));
  mockMethod(SubscriptionSeat, "find", () => qc([pendingSeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");
  assert.equal(detail.acceptedStaff.length, 0, "Pending staff excluded");
  assert.equal(detail.seats.used, 0, "Pending staff seat not counted");
  assert.equal(detail.seats.available, 3, "Full capacity available");
});

/* ════════════════════════════════════════════════════════ */
/* Test 5: rejected staff excluded                         */
/* ════════════════════════════════════════════════════════ */

test("rejected staff excluded from staff list and seat usage", async () => {
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockQuery(Subscription, "findOne", subscriptionDoc);
  mockMethod(User, "find", () => qc([rejectedStaffDoc]));
  mockMethod(SubscriptionSeat, "find", () => qc([rejectedSeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");
  assert.equal(detail.acceptedStaff.length, 0, "Rejected staff excluded");
  assert.equal(detail.seats.used, 0, "Rejected staff seat not counted");
});

/* ════════════════════════════════════════════════════════ */
/* Test 6: used seats count only active accepted staff     */
/* ════════════════════════════════════════════════════════ */

test("used seats count only accepted staff with active seat", async () => {
  const barbers = [acceptedStaffDoc, legacyStaffDoc, unassignedAcceptedDoc];

  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockQuery(Subscription, "findOne", subscriptionDoc);
  mockMethod(User, "find", () => qc(barbers));
  mockMethod(SubscriptionSeat, "find", () => qc([acceptedSeatDoc, legacySeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");
  assert.equal(detail.seats.used, 2, "2 accepted staff have active seats");
  assert.equal(detail.seats.total, 3, "Total = 3 seats");
  assert.equal(detail.seats.available, 1, "Available = 3 - 2");
  assert.equal(detail.acceptedStaff.length, 3, "3 accepted staff in list");
});

/* ════════════════════════════════════════════════════════ */
/* Test 7: chair renter seat does not consume capacity     */
/* ════════════════════════════════════════════════════════ */

test("chair renter active seat does not consume salon seat capacity", async () => {
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockQuery(Subscription, "findOne", subscriptionDoc);
  mockMethod(User, "find", () => qc([acceptedStaffDoc, chairRenterDoc]));
  mockMethod(SubscriptionSeat, "find", () => qc([acceptedSeatDoc, chairRenterSeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");
  assert.equal(detail.seats.used, 1, "Only 1 accepted staff seat counted");
  assert.equal(detail.seats.available, 2, "Chair renter seat does not reduce availability");
  assert.equal(detail.seats.assignments.length, 1, "Only accepted staff in assignments");
});

/* ════════════════════════════════════════════════════════ */
/* Test 8: pending/rejected seats do not consume capacity  */
/* ════════════════════════════════════════════════════════ */

test("pending or rejected staff seats do not consume capacity", async () => {
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockQuery(Subscription, "findOne", subscriptionDoc);
  mockMethod(User, "find", () => qc([pendingStaffDoc, rejectedStaffDoc]));
  mockMethod(SubscriptionSeat, "find", () => qc([pendingSeatDoc, rejectedSeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");
  assert.equal(detail.seats.used, 0, "Neither pending nor rejected seat counted");
  assert.equal(detail.seats.available, 3, "Full capacity available");
  assert.equal(detail.seats.assignments.length, 0, "No assignments for non-accepted staff");
});

/* ════════════════════════════════════════════════════════ */
/* Test 9: available seats never below 0                   */
/* ════════════════════════════════════════════════════════ */

test("available seats never goes below 0 even with over-assignment", async () => {
  const lowSeatCountSub = { ...subscriptionDoc, seatCount: 1 };

  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockMethod(Subscription, "findOne", () => qc(lowSeatCountSub));
  mockMethod(User, "find", () => qc([acceptedStaffDoc, legacyStaffDoc]));
  mockMethod(SubscriptionSeat, "find", () => qc([acceptedSeatDoc, legacySeatDoc]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail");
  assert.equal(detail.seats.used, 2, "2 accepted staff seats used");
  assert.equal(detail.seats.available, 0, "Available = max(0, 1 - 2) = 0");
});

/* ════════════════════════════════════════════════════════ */
/* Test 10: getSalonPayments filter correctness            */
/* ════════════════════════════════════════════════════════ */

test("getSalonPayments filters by ownerType=salon, matching ownerId, purpose=subscription", async () => {
  let capturedFilter;

  mockMethod(SubscriptionPaymentAttempt, "countDocuments", async (filter) => {
    capturedFilter = filter;
    return 1;
  });

  mockMethod(SubscriptionPaymentAttempt, "find", (filter) => {
    capturedFilter = filter;
    return {
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [subscriptionPaymentDoc],
          }),
        }),
      }),
    };
  });

  const result = await getSalonPayments(salonIdStr, { page: 1, limit: 20 });
  assert.ok(result, "Should return payments");
  assert.equal(capturedFilter.ownerType, "salon", "ownerType = salon");
  assert.equal(capturedFilter.purpose, "subscription", "purpose = subscription");
  assert.ok(capturedFilter.ownerId instanceof mongoose.Types.ObjectId, "ownerId is ObjectId");
  assert.equal(capturedFilter.ownerId.toString(), salonIdStr, "ownerId matches salon");
});

/* ════════════════════════════════════════════════════════ */
/* Test 11: booking deposit attempts excluded              */
/* ════════════════════════════════════════════════════════ */

test("getSalonPayments excludes booking deposit attempts", async () => {
  mockMethod(SubscriptionPaymentAttempt, "countDocuments", async () => 0);
  mockMethod(SubscriptionPaymentAttempt, "find", () => ({
    sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }),
  }));

  const result = await getSalonPayments(salonIdStr, { page: 1, limit: 20 });
  assert.ok(result, "Should return payments");
  assert.equal(result.total, 0, "No subscription payments found");
  assert.equal(result.payments.length, 0, "Deposit payments excluded");
});

test("getAllSalonPayments excludes booking deposit attempts", async () => {
  let capturedFilter;

  mockMethod(SubscriptionPaymentAttempt, "countDocuments", async (filter) => {
    capturedFilter = filter;
    return 1;
  });

  mockMethod(SubscriptionPaymentAttempt, "find", (filter) => {
    capturedFilter = filter;
    return {
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [subscriptionPaymentDoc],
          }),
        }),
      }),
    };
  });

  const result = await getAllSalonPayments({ page: 1, limit: 20 });
  assert.ok(result, "Should return payments");
  assert.equal(capturedFilter.ownerType, "salon", "ownerType = salon");
  assert.equal(capturedFilter.purpose, "subscription", "purpose = subscription");
});

/* ════════════════════════════════════════════════════════ */
/* Test 12: other salon payments excluded                  */
/* ════════════════════════════════════════════════════════ */

test("getSalonPayments excludes other salon subscription attempts", async () => {
  mockMethod(SubscriptionPaymentAttempt, "countDocuments", async () => 0);
  mockMethod(SubscriptionPaymentAttempt, "find", () => ({
    sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }),
  }));

  const result = await getSalonPayments(salonIdStr, { page: 1, limit: 20 });
  assert.equal(result.total, 0, "Other salon payments excluded");
});

/* ════════════════════════════════════════════════════════ */
/* Test 13: payment response excludes sensitive fields     */
/* ════════════════════════════════════════════════════════ */

test("payment responses exclude sensitive metadata and tokens", async () => {
  const paymentWithMetadata = {
    ...subscriptionPaymentDoc,
    metadata: { internal: "secret" },
    rawProviderResponse: { secret: true },
  };

  mockMethod(SubscriptionPaymentAttempt, "countDocuments", async () => 1);
  mockMethod(SubscriptionPaymentAttempt, "find", () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          lean: async () => [paymentWithMetadata],
        }),
      }),
    }),
  }));

  const result = await getSalonPayments(salonIdStr, { page: 1, limit: 20 });
  assert.ok(result, "Should return payments");
  assert.equal(result.payments.length, 1, "One payment returned");

  const payment = result.payments[0];
  assert.equal(payment.metadata, undefined, "metadata excluded");
  assert.equal(payment.rawProviderResponse, undefined, "rawProviderResponse excluded");
  assert.equal(payment.amount, 300, "amount present");
  assert.equal(payment.status, "paid", "status present");
});

/* ════════════════════════════════════════════════════════ */
/* Test 14: no-subscription salon returns safe empty state */
/* ════════════════════════════════════════════════════════ */

test("salon without subscription returns null subscription and zero seats", async () => {
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockMethod(Subscription, "findOne", () => qc(null));
  // getAcceptedStaffBarbersForSalon calls User.find().select().lean()
  mockMethod(User, "find", () => qc([]));

  const detail = await getSalonBillingDetail(salonIdStr);
  assert.ok(detail, "Should return salon detail even without subscription");
  assert.equal(detail.subscription, null, "subscription is null");
  assert.equal(detail.seats.total, 0, "total = 0 no subscription");
  assert.equal(detail.seats.used, 0, "used = 0 no subscription");
  assert.equal(detail.seats.available, 0, "available = 0 no subscription");
  assert.equal(detail.latestPendingAttempt, null, "no pending attempt");
});

/* ════════════════════════════════════════════════════════ */
/* Test 15: expired subscription returns clear state       */
/* ════════════════════════════════════════════════════════ */

test("expired subscription returns subscription with isExpired=true and 0 days remaining", async () => {
  const otherSalonStr = otherSalonId.toString();

  mockMethod(Salon, "findById", () => qc({
    ...salonDoc,
    _id: otherSalonId,
    ownerId: oid("64b000000000000000090001"),
  }));

  mockMethod(User, "findById", () => qc({
    _id: oid("64b000000000000000090001"),
    name: "Other Owner",
    email: "other@example.com",
    avatarUrl: null,
    city: "Yerevan",
  }));

  mockMethod(Subscription, "findOne", () => qc(expiredSubscriptionDoc));
  mockMethod(User, "find", () => qc([]));
  mockMethod(SubscriptionSeat, "find", () => qc([]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));

  const detail = await getSalonBillingDetail(otherSalonStr);
  assert.ok(detail, "Should return salon detail");
  assert.ok(detail.subscription, "Subscription exists");
  assert.equal(detail.subscription.isExpired, true, "isExpired = true");
  assert.equal(detail.subscription.status, "expired", "status = expired");
  assert.equal(detail.subscription.daysRemaining, 0, "daysRemaining = 0");
});

/* ════════════════════════════════════════════════════════ */
/* Test 16: getAllSalonBillingSummaries pagination/search  */
/* ════════════════════════════════════════════════════════ */

test("getAllSalonBillingSummaries returns paginated results", async () => {
  mockMethod(Salon, "countDocuments", async () => 1);
  mockMethod(Salon, "find", () => qc([{ ...salonDoc, ownerId }]));
  mockMethod(User, "find", () => qc([ownerDoc]));
  mockMethod(Subscription, "find", () => qc([subscriptionDoc]));
  mockMethod(SubscriptionPaymentAttempt, "aggregate", async () => []);
  // Second User.find call inside getSeatUsageForSalon
  mockMethod(SubscriptionSeat, "find", () => qc([]));

  const result = await getAllSalonBillingSummaries({ page: 1, limit: 20 });
  assert.ok(result, "Should return summaries");
  assert.equal(result.salons.length, 1, "One salon returned");
  assert.equal(result.total, 1, "Total = 1");
  assert.equal(result.page, 1, "Page = 1");
});

test("getAllSalonBillingSummaries searches by salon name", async () => {
  let capturedFilter;

  mockMethod(Salon, "countDocuments", async (filter) => {
    capturedFilter = filter;
    return 1;
  });

  mockMethod(Salon, "find", (filter) => {
    capturedFilter = filter;
    return qc([{ ...salonDoc, name: "Alpha Salon" }]);
  });

  mockMethod(User, "find", () => qc([ownerDoc]));
  mockMethod(Subscription, "find", () => qc([subscriptionDoc]));
  mockMethod(SubscriptionPaymentAttempt, "aggregate", async () => []);
  mockMethod(SubscriptionSeat, "find", () => qc([]));

  const result = await getAllSalonBillingSummaries({
    search: "Alpha",
    page: 1,
    limit: 20,
  });

  assert.ok(capturedFilter.$or, "Search should use $or filter");
  assert.ok(capturedFilter.$or[0].name.$regex, "Search should use regex");
  assert.equal(result.salons.length, 1, "One salon matches search");
});

test("getAllSalonBillingSummaries applies active subscription filter before pagination", async () => {
  const activeSubscriptionDoc = {
    ...subscriptionDoc,
    currentPeriodStart: new Date("2026-06-01"),
    currentPeriodEnd: new Date("2026-07-01"),
  };
  let capturedSalonFilter;
  let subscriptionFindCallCount = 0;

  mockMethod(Salon, "countDocuments", async (filter) => {
    capturedSalonFilter = filter;
    return 1;
  });
  mockMethod(Salon, "find", (filter) => {
    capturedSalonFilter = filter;
    return qc([{ ...salonDoc, ownerId }]);
  });
  mockMethod(Subscription, "find", () => {
    subscriptionFindCallCount += 1;
    return subscriptionFindCallCount === 1
      ? qc([activeSubscriptionDoc, expiredSubscriptionDoc])
      : qc([activeSubscriptionDoc]);
  });
  mockMethod(User, "find", () => qc([ownerDoc]));
  mockMethod(SubscriptionPaymentAttempt, "aggregate", async () => []);
  mockMethod(SubscriptionSeat, "find", () => qc([]));

  const result = await getAllSalonBillingSummaries({
    subscriptionStatus: "active",
    page: 1,
    limit: 20,
  });

  assert.ok(capturedSalonFilter._id?.$in, "Salon query constrained by active subscription ids");
  assert.deepEqual(
    capturedSalonFilter._id.$in.map((id) => id.toString()),
    [salonId.toString()]
  );
  assert.equal(result.total, 1);
  assert.equal(result.salons.length, 1);
});

test("getAllSalonBillingSummaries applies none subscription filter before pagination", async () => {
  let capturedSalonFilter;

  mockMethod(Salon, "countDocuments", async (filter) => {
    capturedSalonFilter = filter;
    return 1;
  });
  mockMethod(Salon, "find", (filter) => {
    capturedSalonFilter = filter;
    return qc([]);
  });
  mockMethod(Subscription, "find", () => qc([subscriptionDoc, expiredSubscriptionDoc]));
  mockMethod(User, "find", () => qc([]));
  mockMethod(SubscriptionPaymentAttempt, "aggregate", async () => []);
  mockMethod(SubscriptionSeat, "find", () => qc([]));

  const result = await getAllSalonBillingSummaries({
    subscriptionStatus: "none",
    page: 1,
    limit: 20,
  });

  assert.ok(capturedSalonFilter._id?.$nin, "Salon query excludes subscribed salon ids");
  assert.deepEqual(
    capturedSalonFilter._id.$nin.map((id) => id.toString()).sort(),
    [otherSalonId.toString(), salonId.toString()].sort()
  );
  assert.equal(result.total, 1);
  assert.equal(result.salons.length, 0);
});

/* ════════════════════════════════════════════════════════ */
/* Phase 3 mutation safety tests                            */
/* ════════════════════════════════════════════════════════ */

const platformActor = { _id: oid("64b0000000000000000a0001") };
const requestIp = "203.0.113.10";
const planDoc = {
  _id: oid("64b0000000000000000b0001"),
  pricePerSeat: 100,
};

const acceptedStaffWithRole = { ...acceptedStaffDoc, role: "barber" };
const chairRenterWithRole = { ...chairRenterDoc, role: "barber" };

const mockPostMutationDetail = (subscription = subscriptionDoc, seats = []) => {
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockMethod(User, "find", () => qc([]));
  mockMethod(SubscriptionSeat, "find", () => qc(seats));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));
  return subscription;
};

test("activateSalonSubscription requires note before mutation", async () => {
  let salonRead = false;
  mockMethod(Salon, "findById", () => {
    salonRead = true;
    return qc(salonDoc);
  });

  await assert.rejects(
    () => activateSalonSubscription(salonIdStr, { actor: platformActor, note: " " }),
    { statusCode: 400, message: "note is required" }
  );

  assert.equal(salonRead, false);
});

test("activateSalonSubscription creates one audit log with subscriptionId and requestIp", async () => {
  let auditPayload;
  const subscription = saveableDoc(subscriptionDoc);

  mockQuery(Salon, "findById", salonDoc);
  mockMethod(SubscriptionPlan, "findOne", () => qc(planDoc));
  let subscriptionFindCalls = 0;
  mockMethod(Subscription, "findOne", () => {
    subscriptionFindCalls += 1;
    return subscriptionFindCalls === 1 ? Promise.resolve(subscription) : qc(subscription);
  });
  mockMethod(PlatformAuditLog, "create", async (payload) => {
    auditPayload = payload;
    return payload;
  });
  mockPostMutationDetail(subscription);

  await activateSalonSubscription(salonIdStr, {
    actor: platformActor,
    note: "Manual renewal",
    seatCount: 2,
    months: 1,
    requestIp,
  });

  assert.equal(auditPayload.action, "salon_subscription.activate");
  assert.equal(auditPayload.actorId, platformActor._id);
  assert.equal(auditPayload.salonId.toString(), salonIdStr);
  assert.equal(auditPayload.subscriptionId.toString(), subscriptionId.toString());
  assert.equal(auditPayload.note, "Manual renewal");
  assert.equal(auditPayload.requestIp, requestIp);
});

test("updateSalonSeatCount requires note and validates positive integer", async () => {
  await assert.rejects(
    () => updateSalonSeatCount(salonIdStr, { actor: platformActor, seatCount: 2, note: "" }),
    { statusCode: 400, message: "note is required" }
  );

  mockQuery(Salon, "findById", salonDoc);
  let subscriptionFindCalls = 0;
  mockMethod(Subscription, "findOne", () => {
    subscriptionFindCalls += 1;
    return subscriptionFindCalls === 1
      ? Promise.resolve(saveableDoc(subscriptionDoc))
      : qc(subscriptionDoc);
  });

  await assert.rejects(
    () => updateSalonSeatCount(salonIdStr, { actor: platformActor, seatCount: 1.5, note: "Bad count" }),
    { statusCode: 400, message: "seatCount must be a positive integer" }
  );
});

test("updateSalonSeatCount rejects count below used seats and does not audit", async () => {
  let auditCalled = false;
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(Subscription, "findOne", () => Promise.resolve(saveableDoc({ ...subscriptionDoc, seatCount: 3 })));
  mockMethod(SubscriptionSeat, "find", () => qc([acceptedSeatDoc, legacySeatDoc]));
  mockMethod(User, "find", () => qc([acceptedStaffWithRole, { ...legacyStaffDoc, role: "barber" }]));
  mockMethod(PlatformAuditLog, "create", async () => {
    auditCalled = true;
  });

  await assert.rejects(
    () => updateSalonSeatCount(salonIdStr, { actor: platformActor, seatCount: 1, note: "Too low" }),
    { statusCode: 400 }
  );

  assert.equal(auditCalled, false);
});

test("updateSalonSeatCount audits and rolls back when audit creation fails", async () => {
  const subscription = saveableDoc({ ...subscriptionDoc, seatCount: 3 });
  const savedValues = [];

  subscription.save = async function save() {
    savedValues.push(this.seatCount);
    return this;
  };

  mockQuery(Salon, "findById", salonDoc);
  let subscriptionFindCalls = 0;
  mockMethod(Subscription, "findOne", () => {
    subscriptionFindCalls += 1;
    return subscriptionFindCalls === 1 ? Promise.resolve(subscription) : qc(subscription);
  });
  mockMethod(SubscriptionSeat, "find", () => qc([]));
  mockMethod(User, "find", () => qc([]));
  mockMethod(PlatformAuditLog, "create", async () => {
    throw new Error("audit unavailable");
  });

  await assert.rejects(
    () => updateSalonSeatCount(salonIdStr, {
      actor: platformActor,
      seatCount: 4,
      note: "Increase seats",
      requestIp,
    }),
    /audit unavailable/
  );

  assert.deepEqual(savedValues, [4, 3]);
  assert.equal(subscription.seatCount, 3);
});

test("assignSalonSeat rejects chair_renter, duplicate, and over-cap without audit", async () => {
  let auditCalls = 0;
  let seatCreates = 0;
  mockQuery(Salon, "findById", salonDoc);
  mockMethod(Subscription, "findOne", () => Promise.resolve(saveableDoc({ ...subscriptionDoc, seatCount: 1 })));
  mockMethod(PlatformAuditLog, "create", async () => {
    auditCalls += 1;
  });
  mockMethod(SubscriptionSeat, "create", async () => {
    seatCreates += 1;
  });

  mockMethod(User, "findById", () => qc(chairRenterWithRole));
  await assert.rejects(
    () => assignSalonSeat(salonIdStr, { actor: platformActor, barberId: chairRenterId, note: "Assign" }),
    { statusCode: 400, message: "Cannot assign a seat to a chair_renter" }
  );

  mockMethod(User, "findById", () => qc(acceptedStaffWithRole));
  mockMethod(SubscriptionSeat, "findOne", () => Promise.resolve(acceptedSeatDoc));
  await assert.rejects(
    () => assignSalonSeat(salonIdStr, { actor: platformActor, barberId: acceptedStaffId, note: "Assign" }),
    { statusCode: 400, message: "Barber already has an active seat on this subscription" }
  );

  mockMethod(SubscriptionSeat, "findOne", () => Promise.resolve(null));
  mockMethod(SubscriptionSeat, "find", () => qc([acceptedSeatDoc]));
  mockMethod(User, "find", () => qc([acceptedStaffWithRole]));
  await assert.rejects(
    () => assignSalonSeat(salonIdStr, { actor: platformActor, barberId: acceptedStaffId, note: "Assign" }),
    { statusCode: 400 }
  );

  assert.equal(auditCalls, 0);
  assert.equal(seatCreates, 0);
});

test("assignSalonSeat creates active seat and audit log for accepted staff", async () => {
  let auditPayload;
  const newSeat = {
    _id: oid("64b000000000000000070010"),
    subscriptionId,
    salonId,
    barberId: acceptedStaffId,
    status: "active",
    assignedAt: new Date("2026-06-01"),
  };

  mockQuery(Salon, "findById", salonDoc);
  let subscriptionFindCalls = 0;
  mockMethod(Subscription, "findOne", () => {
    subscriptionFindCalls += 1;
    return subscriptionFindCalls === 1
      ? Promise.resolve(saveableDoc(subscriptionDoc))
      : qc(subscriptionDoc);
  });
  let userFindByIdCalls = 0;
  mockMethod(User, "findById", () => {
    userFindByIdCalls += 1;
    return userFindByIdCalls === 1 ? qc(acceptedStaffWithRole) : qc(ownerDoc);
  });
  mockMethod(SubscriptionSeat, "findOne", () => Promise.resolve(null));
  mockMethod(SubscriptionSeat, "find", () => qc([]));
  mockMethod(SubscriptionSeat, "create", async () => newSeat);
  mockMethod(User, "find", () => qc([acceptedStaffWithRole]));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));
  mockMethod(PlatformAuditLog, "create", async (payload) => {
    auditPayload = payload;
    return payload;
  });

  await assignSalonSeat(salonIdStr, {
    actor: platformActor,
    barberId: acceptedStaffId,
    note: "Assign accepted staff",
    requestIp,
  });

  assert.equal(auditPayload.action, "salon_subscription.seat_assign");
  assert.equal(auditPayload.targetUserId.toString(), acceptedStaffId.toString());
  assert.equal(auditPayload.subscriptionId.toString(), subscriptionId.toString());
  assert.equal(auditPayload.newValue.seatId.toString(), newSeat._id.toString());
  assert.equal(auditPayload.requestIp, requestIp);
});

test("revokeSalonSeat rejects non-assigned staff and audits successful revoke", async () => {
  let auditPayload;
  const activeSeat = saveableDoc({ ...acceptedSeatDoc, barberId: acceptedStaffId, revokedAt: null });

  mockQuery(Salon, "findById", salonDoc);
  mockMethod(Subscription, "findOne", () => Promise.resolve(saveableDoc(subscriptionDoc)));
  mockMethod(SubscriptionSeat, "findOne", () => Promise.resolve(null));

  await assert.rejects(
    () => revokeSalonSeat(salonIdStr, { actor: platformActor, barberId: acceptedStaffId, note: "Revoke" }),
    { statusCode: 400, message: "Barber does not have an active seat on this subscription" }
  );

  let subscriptionFindCalls = 0;
  mockMethod(Subscription, "findOne", () => {
    subscriptionFindCalls += 1;
    return subscriptionFindCalls === 1
      ? Promise.resolve(saveableDoc(subscriptionDoc))
      : qc(subscriptionDoc);
  });
  mockMethod(SubscriptionSeat, "findOne", () => Promise.resolve(activeSeat));
  mockMethod(SubscriptionSeat, "find", () => qc([]));
  mockMethod(User, "find", () => qc([]));
  mockMethod(User, "findById", () => qc(ownerDoc));
  mockMethod(SubscriptionPaymentAttempt, "findOne", () => ({
    sort: () => ({ lean: async () => null }),
  }));
  mockMethod(PlatformAuditLog, "create", async (payload) => {
    auditPayload = payload;
    return payload;
  });

  await revokeSalonSeat(salonIdStr, {
    actor: platformActor,
    barberId: acceptedStaffId,
    note: "Revoke accepted staff",
    requestIp,
  });

  assert.equal(activeSeat.status, "revoked");
  assert.ok(activeSeat.revokedAt);
  assert.equal(auditPayload.action, "salon_subscription.seat_revoke");
  assert.equal(auditPayload.targetUserId.toString(), acceptedStaffId.toString());
  assert.equal(auditPayload.requestIp, requestIp);
});

test("confirmSalonPayment rejects missing note, booking deposits, disabled provider, and non-confirmable statuses", async () => {
  await assert.rejects(
    () => confirmSalonPayment(paymentId.toString(), { actor: platformActor, note: " " }),
    { statusCode: 400, message: "note is required" }
  );

  mockMethod(SubscriptionPaymentAttempt, "findById", async () =>
    saveableDoc({ ...depositPaymentDoc, ownerType: "salon", status: "pending" })
  );
  await assert.rejects(
    () => confirmSalonPayment(depositPaymentId.toString(), { actor: platformActor, note: "Confirm" }),
    { statusCode: 400, message: "Only subscription payment attempts can be confirmed" }
  );

  mockMethod(SubscriptionPaymentAttempt, "findById", async () =>
    saveableDoc({ ...subscriptionPaymentDoc, status: "pending", provider: "disabled" })
  );
  await assert.rejects(
    () => confirmSalonPayment(paymentId.toString(), { actor: platformActor, note: "Confirm" }),
    { statusCode: 400 }
  );

  mockMethod(SubscriptionPaymentAttempt, "findById", async () =>
    saveableDoc({ ...subscriptionPaymentDoc, status: "paid", provider: "manual" })
  );
  await assert.rejects(
    () => confirmSalonPayment(paymentId.toString(), { actor: platformActor, note: "Confirm" }),
    { statusCode: 400 }
  );

  let savedMismatchedAttempt = false;
  const mismatchedAttempt = saveableDoc({
    ...subscriptionPaymentDoc,
    status: "pending",
    provider: "manual",
  });
  mismatchedAttempt.save = async () => {
    savedMismatchedAttempt = true;
    return mismatchedAttempt;
  };
  mockMethod(SubscriptionPaymentAttempt, "findById", async () => mismatchedAttempt);
  mockMethod(Subscription, "findById", async () =>
    saveableDoc({ ...subscriptionDoc, ownerId: otherSalonId })
  );
  await assert.rejects(
    () => confirmSalonPayment(paymentId.toString(), { actor: platformActor, note: "Confirm" }),
    { statusCode: 400, message: "Payment attempt subscription does not match the salon owner" }
  );
  assert.equal(savedMismatchedAttempt, false);
});

test("confirmSalonPayment manually confirms subscription payment with audit and sanitized response", async () => {
  let auditPayload;
  const attempt = saveableDoc({
    ...subscriptionPaymentDoc,
    status: "pending",
    paidAt: null,
    confirmedAt: null,
    subscriptionId: null,
    metadata: { private: true },
    rawProviderResponse: { private: true },
  });

  mockMethod(SubscriptionPaymentAttempt, "findById", async () => attempt);
  mockMethod(PlatformAuditLog, "create", async (payload) => {
    auditPayload = payload;
    return payload;
  });

  const result = await confirmSalonPayment(paymentId.toString(), {
    actor: platformActor,
    note: "Manual payment verified",
    requestIp,
  });

  assert.equal(attempt.status, "paid");
  assert.ok(attempt.paidAt);
  assert.ok(attempt.confirmedAt);
  assert.equal(auditPayload.action, "salon_subscription.payment_confirm");
  assert.equal(auditPayload.paymentAttemptId.toString(), paymentId.toString());
  assert.equal(auditPayload.salonId.toString(), salonId.toString());
  assert.equal(auditPayload.note, "Manual payment verified");
  assert.equal(auditPayload.requestIp, requestIp);
  assert.equal(result.paymentAttempt.metadata, undefined);
  assert.equal(result.paymentAttempt.rawProviderResponse, undefined);
});
