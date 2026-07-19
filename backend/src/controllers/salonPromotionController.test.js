import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Voucher from "../models/Voucher.js";
import {
  createSalonPromotion,
  validateSalonPromotion,
} from "./promotions/salonPromotionController.js";

const originalMethods = {
  salonFindById: Salon.findById,
  serviceFindOne: Service.findOne,
  userFindById: User.findById,
  voucherCreate: Voucher.create,
  voucherFindOne: Voucher.findOne,
};

const ownerId = "64d000000000000000000001";
const adminId = "64d000000000000000000002";
const memberId = "64d000000000000000000003";
const outsiderId = "64d000000000000000000004";
const salonId = "64d000000000000000000005";
const serviceId = "64d000000000000000000006";
const staffBarberId = "64d000000000000000000007";
const chairRenterId = "64d000000000000000000008";

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

const query = (result) => ({
  select() {
    return this;
  },
  lean: async () => result,
});

const installSalon = ({ admins = [], owner = ownerId } = {}) => {
  Salon.findById = () =>
    query({
      _id: salonId,
      ownerId: owner,
      admins,
    });
};

const installUserRelationships = () => {
  User.findById = (id) => ({
    select: async () => {
      if (String(id) === String(staffBarberId)) {
        return {
          _id: staffBarberId,
          role: "barber",
          salons: [
            {
              salon: salonId,
              status: "approved",
              relationshipType: "staff",
              relationshipStatus: "accepted",
            },
          ],
        };
      }

      if (String(id) === String(chairRenterId)) {
        return {
          _id: chairRenterId,
          role: "barber",
          salons: [
            {
              salon: salonId,
              status: "approved",
              relationshipType: "chair_renter",
              relationshipStatus: "accepted",
            },
          ],
        };
      }

      return null;
    },
  });
};

const basePromotionBody = (overrides = {}) => ({
  code: "SAVE10",
  title: "Save Ten",
  discountType: "fixed",
  discountValue: 10,
  maxUses: 5,
  ...overrides,
});

const baseVoucher = (overrides = {}) => ({
  _id: "promotion-1",
  ownerType: "salon",
  ownerId: salonId,
  code: "SAVE10",
  title: "Save Ten",
  description: "",
  discountType: "fixed",
  amount: 10,
  active: true,
  startDate: null,
  expiresAt: null,
  maxUses: 5,
  currentUses: 0,
  applicableServiceIds: [],
  applicableBarberIds: [],
  ...overrides,
});

afterEach(() => {
  Salon.findById = originalMethods.salonFindById;
  Service.findOne = originalMethods.serviceFindOne;
  User.findById = originalMethods.userFindById;
  Voucher.create = originalMethods.voucherCreate;
  Voucher.findOne = originalMethods.voucherFindOne;
});

test("owner can create promotion", async () => {
  installSalon();
  installUserRelationships();
  Voucher.findOne = () => query(null);
  Voucher.create = async (payload) => payload;

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody(),
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ownerType, "salon");
  assert.equal(res.body.ownerId, salonId);
  assert.equal(res.body.code, "SAVE10");
});

test("admin can create promotion", async () => {
  installSalon({ admins: [adminId] });
  installUserRelationships();
  Voucher.findOne = () => query(null);
  Voucher.create = async (payload) => payload;

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: adminId, role: "barber" },
      params: { salonId },
      body: basePromotionBody({ code: "ADMIN10" }),
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.code, "ADMIN10");
});

test("normal member cannot create promotion", async () => {
  installSalon();

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: memberId, role: "barber" },
      params: { salonId },
      body: basePromotionBody(),
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("non-member cannot create promotion", async () => {
  installSalon();

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: outsiderId, role: "barber" },
      params: { salonId },
      body: basePromotionBody(),
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("duplicate code rejected per salon", async () => {
  installSalon();
  Voucher.findOne = () => query({ _id: "existing" });

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody(),
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /already exists/);
});

test("chair_renter is not included as owner-managed private promotion target", async () => {
  installSalon();
  installUserRelationships();
  Voucher.findOne = () => query(null);
  Voucher.create = async (payload) => payload;

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody({
        applicableBarberIds: [staffBarberId, chairRenterId],
      }),
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body.applicableBarberIds, [staffBarberId]);
});

test("inactive promotion rejected", async () => {
  installSalon();
  Voucher.findOne = () => query(baseVoucher({ active: false }));

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVE10", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /no longer active/);
});

test("expired promotion rejected", async () => {
  installSalon();
  Voucher.findOne = () =>
    query(baseVoucher({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }));

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVE10", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /expired/);
});

test("future promotion rejected", async () => {
  installSalon();
  Voucher.findOne = () =>
    query(baseVoucher({ startDate: new Date("2999-01-01T00:00:00.000Z") }));

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVE10", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /not yet active/);
});

test("maxUses reached rejected", async () => {
  installSalon();
  Voucher.findOne = () => query(baseVoucher({ maxUses: 2, currentUses: 2 }));

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVE10", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /fully redeemed/);
});

test("percentage discount calculated correctly", async () => {
  installSalon();
  Voucher.findOne = () =>
    query(baseVoucher({ discountType: "percentage", amount: 20 }));
  Service.findOne = () =>
    query({ _id: serviceId, price: 100, discountType: "none", discountValue: 0 });

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVE20", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.discountAmount, 20);
  assert.equal(res.body.finalPrice, 80);
});

test("fixed discount calculated correctly", async () => {
  installSalon();
  Voucher.findOne = () => query(baseVoucher({ amount: 15 }));
  Service.findOne = () =>
    query({ _id: serviceId, price: 100, discountType: "none", discountValue: 0 });

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVE15", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.discountAmount, 15);
  assert.equal(res.body.finalPrice, 85);
});

test("discount cannot go below zero", async () => {
  installSalon();
  Voucher.findOne = () => query(baseVoucher({ amount: 500 }));
  Service.findOne = () =>
    query({ _id: serviceId, price: 100, discountType: "none", discountValue: 0 });

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "FREE", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.discountAmount, 100);
  assert.equal(res.body.finalPrice, 0);
});

test("service restriction works", async () => {
  installSalon();
  Voucher.findOne = () =>
    query(baseVoucher({ applicableServiceIds: ["64d000000000000000000099"] }));

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVE10", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /does not apply to this service/);
});

test("barber restriction works", async () => {
  installSalon();
  Voucher.findOne = () =>
    query(baseVoucher({ applicableBarberIds: ["64d000000000000000000099"] }));

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVE10", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /does not apply to this barber/);
});
