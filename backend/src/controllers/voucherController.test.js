import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import Voucher from "../models/Voucher.js";
import {
  createVoucher,
  deleteVoucher,
  getOwnerVouchers,
  getPublicVouchers,
  getVoucherById,
  updateVoucher,
  validateVoucherCode,
} from "./voucherController.js";

/* ── Stub state ─────────────────────────────────────────── */
const originalVoucherFindOne = Voucher.findOne;
const originalVoucherFind = Voucher.find;
const originalVoucherFindById = Voucher.findById;
const originalVoucherFindByIdAndUpdate = Voucher.findByIdAndUpdate;
const originalVoucherCreate = Voucher.create;
const originalVoucherAggregate = Voucher.aggregate;
const originalSalonFindById = Salon.findById;
const originalServiceFindOne = Service.findOne;
const originalServiceFindById = Service.findById;

const barberA = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const barberB = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const client = { _id: new mongoose.Types.ObjectId(), role: "client" };
const salonOwner = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const salonAdmin = { _id: new mongoose.Types.ObjectId(), role: "barber" };

const salonId = new mongoose.Types.ObjectId();
const salonDoc = {
  _id: salonId,
  ownerId: salonOwner._id,
  admins: [salonAdmin._id],
};

const serviceId = new mongoose.Types.ObjectId();
const serviceDoc = {
  _id: serviceId,
  barberId: barberA._id,
  name: "Haircut",
  price: 5000,
  active: true,
};

afterEach(() => {
  Voucher.findOne = originalVoucherFindOne;
  Voucher.find = originalVoucherFind;
  Voucher.findById = originalVoucherFindById;
  Voucher.findByIdAndUpdate = originalVoucherFindByIdAndUpdate;
  Voucher.create = originalVoucherCreate;
  Voucher.aggregate = originalVoucherAggregate;
  Salon.findById = originalSalonFindById;
  Service.findOne = originalServiceFindOne;
  Service.findById = originalServiceFindById;
});

/* ── Helpers ────────────────────────────────────────────── */
const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

/* Chainable query stubs for Mongoose `.select().lean()` etc.
 * Must support both:
 *   .findOne().lean()                        (validateVoucherCode)
 *   .findOne().select("_id").lean()          (createVoucher code check)
 *   .findById().lean()                       (getVoucherById, deleteVoucher)
 *   .find().sort().lean()                    (getOwnerVouchers)
 */
const chainableSelect = (result) => {
  const leanFn = async () => result;
  return {
    select: () => ({ lean: leanFn }),
    lean: leanFn,
  };
};

const chainableFindById = (result) => ({
  lean: async () => result,
});

const chainableFindAndSort = (result) => ({
  sort: () => ({
    lean: async () => result,
  }),
});

const makeVoucherDoc = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  ownerType: "barber",
  ownerId: barberA._id,
  code: "TESTCODE1",
  title: "Test Voucher",
  type: "amount",
  amount: 1000,
  serviceId: null,
  maxUses: 5,
  currentUses: 0,
  redemptionBookingIds: [],
  active: true,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  save: async function save() {
    return this;
  },
  ...overrides,
});

/* ── createVoucher ──────────────────────────────────────── */

test("barber can create barber-scoped voucher", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberA._id,
      title: "New Year Discount",
      type: "amount",
      amount: 2000,
      maxUses: 3,
    },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(null);
  Voucher.create = async (data) => ({
    ...data,
    _id: new mongoose.Types.ObjectId(),
    currentUses: 0,
    redemptionBookingIds: [],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await createVoucher(req, res);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body._id);
  assert.equal(res.body.title, "New Year Discount");
  assert.equal(res.body.amount, 2000);
  assert.equal(res.body.type, "amount");
  assert.equal(res.body.ownerType, "barber");
  assert.ok(res.body.code);
  assert.equal(res.body.code.length, 8);
  assert.match(res.body.code, /^[A-Z0-9]+$/);
});

test("client cannot create voucher", async () => {
  const req = {
    user: client,
    body: {
      ownerType: "barber",
      ownerId: client._id,
      title: "Test",
      type: "amount",
      amount: 1000,
    },
  };
  const res = createResponse();

  await createVoucher(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Only barbers can manage vouchers");
});

test("barber cannot create voucher for another barber", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberB._id,
      title: "Test",
      type: "amount",
      amount: 1000,
    },
  };
  const res = createResponse();

  await createVoucher(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "You can only manage barber-scoped vouchers for yourself");
});

test("salon-scoped voucher works for salon owner", async () => {
  const req = {
    user: salonOwner,
    body: {
      ownerType: "salon",
      ownerId: salonId,
      title: "Salon Voucher",
      type: "amount",
      amount: 3000,
    },
  };
  const res = createResponse();

  Salon.findById = () => chainableSelect(salonDoc);
  Voucher.findOne = () => chainableSelect(null);
  Voucher.create = async (data) => ({
    ...data,
    _id: new mongoose.Types.ObjectId(),
    currentUses: 0,
    redemptionBookingIds: [],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await createVoucher(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.title, "Salon Voucher");
  assert.equal(res.body.ownerType, "salon");
});

test("salon-scoped voucher works for salon admin", async () => {
  const req = {
    user: salonAdmin,
    body: {
      ownerType: "salon",
      ownerId: salonId,
      title: "Admin Voucher",
      type: "amount",
      amount: 1500,
    },
  };
  const res = createResponse();

  Salon.findById = () => chainableSelect(salonDoc);
  Voucher.findOne = () => chainableSelect(null);
  Voucher.create = async (data) => ({
    ...data,
    _id: new mongoose.Types.ObjectId(),
    currentUses: 0,
    redemptionBookingIds: [],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await createVoucher(req, res);

  assert.equal(res.statusCode, 201);
});

test("duplicate manual code returns clean 400", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberA._id,
      title: "Duplicate",
      type: "amount",
      amount: 1000,
      code: "DUPE1234",
    },
  };
  const res = createResponse();

  // First Voucher.findOne call is code uniqueness — return existing doc
  Voucher.findOne = () => chainableSelect({ _id: new mongoose.Types.ObjectId(), code: "DUPE1234" });

  await createVoucher(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("already exists"));
});

test("invalid amount rejected", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberA._id,
      title: "Bad Amount",
      type: "amount",
      amount: 0,
    },
  };
  const res = createResponse();

  await createVoucher(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("amount"));
});

test("invalid maxUses rejected", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberA._id,
      title: "Bad Uses",
      type: "amount",
      amount: 1000,
      maxUses: 0,
    },
  };
  const res = createResponse();

  await createVoucher(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("maxUses"));
});

test("type=service requires valid serviceId belonging to barber", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberA._id,
      title: "Service Voucher",
      type: "service",
      serviceId,
    },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(null);
  Service.findOne = () => chainableSelect(serviceDoc);
  Voucher.create = async (data) => ({
    ...data,
    _id: new mongoose.Types.ObjectId(),
    currentUses: 0,
    redemptionBookingIds: [],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await createVoucher(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.serviceId.toString(), serviceId.toString());
  assert.equal(res.body.amount, 0);
});

/* ── getOwnerVouchers ───────────────────────────────────── */

test("getOwnerVouchers respects ownership", async () => {
  const req = {
    user: barberA,
    params: { ownerType: "barber", ownerId: barberA._id },
  };
  const res = createResponse();

  Voucher.find = () => chainableFindAndSort([]);

  await getOwnerVouchers(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
});

test("getOwnerVouchers rejects other barber", async () => {
  const req = {
    user: barberA,
    params: { ownerType: "barber", ownerId: barberB._id },
  };
  const res = createResponse();

  await getOwnerVouchers(req, res);

  assert.equal(res.statusCode, 403);
});

/* ── getVoucherById ─────────────────────────────────────── */

test("getVoucherById returns voucher for owner barber", async () => {
  const voucherDoc = makeVoucherDoc();
  const req = {
    user: barberA,
    params: { id: voucherDoc._id },
  };
  const res = createResponse();

  Voucher.findById = () => chainableFindById(voucherDoc);

  await getVoucherById(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.code, "TESTCODE1");
});

test("getVoucherById rejects stranger barber", async () => {
  const voucherDoc = makeVoucherDoc();
  const req = {
    user: barberB,
    params: { id: voucherDoc._id },
  };
  const res = createResponse();

  Voucher.findById = () => chainableFindById(voucherDoc);

  await getVoucherById(req, res);

  assert.equal(res.statusCode, 403);
});

/* ── updateVoucher ──────────────────────────────────────── */

test("updateVoucher rejects changing protected fields", async () => {
  const voucherDoc = makeVoucherDoc();
  const req = {
    user: barberA,
    params: { id: voucherDoc._id },
    body: { ownerId: barberB._id },
  };
  const res = createResponse();

  Voucher.findById = async () => voucherDoc;

  await updateVoucher(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("ownerId"));
});

test("updateVoucher rejects maxUses below currentUses", async () => {
  const voucherDoc = makeVoucherDoc({ currentUses: 3 });
  const req = {
    user: barberA,
    params: { id: voucherDoc._id },
    body: { maxUses: 2 },
  };
  const res = createResponse();

  Voucher.findById = async () => voucherDoc;

  await updateVoucher(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("currentUses"));
});

test("updateVoucher can update title, amount, active", async () => {
  const voucherDoc = makeVoucherDoc();
  let saved = false;
  voucherDoc.save = async function () {
    saved = true;
    return this;
  };

  const req = {
    user: barberA,
    params: { id: voucherDoc._id },
    body: { title: "Updated Title", amount: 5000, active: false },
  };
  const res = createResponse();

  Voucher.findById = async () => voucherDoc;

  await updateVoucher(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.title, "Updated Title");
  assert.equal(res.body.amount, 5000);
  assert.equal(res.body.active, false);
  assert.ok(saved);
});

/* ── deleteVoucher ──────────────────────────────────────── */

test("deleteVoucher sets active=false", async () => {
  const voucherDoc = makeVoucherDoc();
  const req = {
    user: barberA,
    params: { id: voucherDoc._id },
  };
  const res = createResponse();
  let updated = false;

  Voucher.findById = () => chainableFindById(voucherDoc);
  Voucher.findByIdAndUpdate = async (id, update) => {
    updated = true;
    assert.deepEqual(update, { $set: { active: false } });
    return voucherDoc;
  };

  await deleteVoucher(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(updated);
});

/* ── validateVoucherCode ────────────────────────────────── */

test("validate rejects expired voucher", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const voucherDoc = makeVoucherDoc({
    expiresAt: yesterday,
  });

  const req = {
    user: client,
    body: { code: "TESTCODE1", barberId: barberA._id, serviceId },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(voucherDoc);

  await validateVoucherCode(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("expired"));
});

test("validate rejects inactive voucher", async () => {
  const voucherDoc = makeVoucherDoc({ active: false });

  const req = {
    user: client,
    body: { code: "TESTCODE1", barberId: barberA._id },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(voucherDoc);

  await validateVoucherCode(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("active"));
});

test("validate rejects overused voucher", async () => {
  const voucherDoc = makeVoucherDoc({ currentUses: 5, maxUses: 5 });

  const req = {
    user: client,
    body: { code: "TESTCODE1", barberId: barberA._id },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(voucherDoc);

  await validateVoucherCode(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("fully redeemed"));
});

test("validate rejects voucher for wrong barber", async () => {
  const voucherDoc = makeVoucherDoc({ ownerId: barberB._id });

  const req = {
    user: client,
    body: { code: "TESTCODE1", barberId: barberA._id },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(voucherDoc);

  await validateVoucherCode(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("does not apply to this barber"));
});

test("validate rejects voucher for wrong salon", async () => {
  const voucherDoc = makeVoucherDoc({
    ownerType: "salon",
    ownerId: new mongoose.Types.ObjectId(),
  });
  const otherSalonId = new mongoose.Types.ObjectId();

  const req = {
    user: client,
    body: {
      code: "TESTCODE1",
      barberId: barberA._id,
      salonId: otherSalonId,
    },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(voucherDoc);

  await validateVoucherCode(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("does not apply to this salon"));
});

test("validate rejects voucher for wrong service", async () => {
  const voucherDoc = makeVoucherDoc({
    type: "service",
    serviceId: new mongoose.Types.ObjectId(),
  });

  const req = {
    user: client,
    body: {
      code: "TESTCODE1",
      barberId: barberA._id,
      serviceId: new mongoose.Types.ObjectId(),
    },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(voucherDoc);

  await validateVoucherCode(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("does not apply to this service"));
});

test("validate rejects inactive requested service", async () => {
  const voucherDoc = makeVoucherDoc({ amount: 1000 });

  const req = {
    user: client,
    body: {
      code: "TESTCODE1",
      barberId: barberA._id,
      serviceId,
    },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(voucherDoc);
  Service.findOne = () => chainableSelect(null);

  await validateVoucherCode(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("inactive"));
});

test("validate returns safe payload and caps discountPreview against discounted service price", async () => {
  const voucherDoc = makeVoucherDoc({ amount: 10000 });

  const req = {
    user: client,
    body: {
      code: "TESTCODE1",
      barberId: barberA._id,
      serviceId,
    },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(voucherDoc);
  Service.findOne = () => chainableSelect({
    price: 12000,
    discountType: "fixed",
    discountValue: 7000,
    _id: serviceId,
    active: true,
  });

  await validateVoucherCode(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
  assert.ok(res.body.voucher);
  assert.equal(res.body.voucher.code, "TESTCODE1");
  assert.equal(res.body.voucher.title, "Test Voucher");
  assert.equal(res.body.voucher.amount, 10000);
  // discounted service price = 5000, so this must not cap against the raw 12000 price
  assert.equal(res.body.discountPreview, 5000);
  // Confirm no sensitive fields leaked
  assert.equal(res.body.voucher.redemptionBookingIds, undefined);
});

/* ── Visibility & createVoucher ─────────────────────────── */

test("create voucher defaults visibility to private", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberA._id,
      title: "Default Private",
      type: "amount",
      amount: 1000,
    },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(null);
  Voucher.create = async (data) => ({
    ...data,
    _id: new mongoose.Types.ObjectId(),
    currentUses: 0,
    redemptionBookingIds: [],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await createVoucher(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.visibility, "private");
});

test("create voucher accepts public visibility", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberA._id,
      title: "Public Voucher",
      type: "amount",
      amount: 1000,
      visibility: "public",
    },
  };
  const res = createResponse();

  Voucher.findOne = () => chainableSelect(null);
  Voucher.create = async (data) => ({
    ...data,
    _id: new mongoose.Types.ObjectId(),
    currentUses: 0,
    redemptionBookingIds: [],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await createVoucher(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.visibility, "public");
});

test("create voucher rejects invalid visibility", async () => {
  const req = {
    user: barberA,
    body: {
      ownerType: "barber",
      ownerId: barberA._id,
      title: "Bad Visibility",
      type: "amount",
      amount: 1000,
      visibility: "invalid",
    },
  };
  const res = createResponse();

  await createVoucher(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("visibility"));
});

test("updateVoucher can update visibility", async () => {
  const voucherDoc = makeVoucherDoc({ visibility: "private" });
  let saved = false;
  voucherDoc.save = async function () {
    saved = true;
    return this;
  };

  const req = {
    user: barberA,
    params: { id: voucherDoc._id },
    body: { visibility: "public" },
  };
  const res = createResponse();

  Voucher.findById = async () => voucherDoc;

  await updateVoucher(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.visibility, "public");
  assert.ok(saved);
});

test("updateVoucher rejects invalid visibility", async () => {
  const voucherDoc = makeVoucherDoc({ visibility: "private" });

  const req = {
    user: barberA,
    params: { id: voucherDoc._id },
    body: { visibility: "secret" },
  };
  const res = createResponse();

  Voucher.findById = async () => voucherDoc;

  await updateVoucher(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("visibility"));
});

/* ── getPublicVouchers ──────────────────────────────────── */

test("getPublicVouchers rejects invalid ownerType", async () => {
  const req = {
    params: { ownerType: "invalid", ownerId: barberA._id },
  };
  const res = createResponse();

  await getPublicVouchers(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("ownerType"));
});

test("getPublicVouchers rejects invalid ownerId", async () => {
  const req = {
    params: { ownerType: "barber", ownerId: "not-an-objectid" },
  };
  const res = createResponse();

  await getPublicVouchers(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.message.includes("ownerId"));
});

test("getPublicVouchers returns public active voucher list", async () => {
  const now = new Date();
  const future = new Date(now.getTime() + 86400000); // +1 day

  const req = {
    params: { ownerType: "barber", ownerId: barberA._id },
  };
  const res = createResponse();

  const fakeResult = [
    {
      code: "PUBLIC1",
      title: "Public Promo",
      type: "amount",
      amount: 1000,
      serviceId: null,
      expiresAt: future,
      maxUses: 10,
      currentUses: 2,
      visibility: "public",
    },
  ];

  Voucher.aggregate = async () => fakeResult;

  await getPublicVouchers(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].code, "PUBLIC1");
  // Confirm unsafe fields are not present
  assert.equal(res.body[0].redemptionBookingIds, undefined);
  assert.equal(res.body[0].ownerId, undefined);
  assert.equal(res.body[0].active, undefined);
  assert.equal(res.body[0]._id, undefined);
});

test("getPublicVouchers returns empty array for private vouchers", async () => {
  const req = {
    params: { ownerType: "barber", ownerId: barberA._id },
  };
  const res = createResponse();

  Voucher.aggregate = async () => [];

  await getPublicVouchers(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 0);
});
