import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import Salon from "../../models/Salon.js";
import Service from "../../models/Service.js";
import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";
import Voucher from "../../models/Voucher.js";
import {
  createSalonPromotion,
  getSalonPromotions,
  updateSalonPromotion,
  validateSalonPromotion,
} from "./salonPromotionController.js";

const originalMethods = {
  salonFindById: Salon.findById,
  serviceFindOne: Service.findOne,
  subscriptionFindOne: Subscription.findOne,
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

const createLog = () => {
  const calls = [];
  return {
    calls,
    error(...args) {
      calls.push(args);
    },
  };
};

const assertSafeStructuredLog = (log, { err, event, salonId: expectedSalonId, promotionId }) => {
  assert.equal(log.calls.length, 1);
  const [context, message] = log.calls[0];
  assert.equal(context.err, err);
  assert.equal(context.event, event);
  assert.equal(context.salonId, expectedSalonId);
  if (promotionId !== undefined) {
    assert.equal(context.promotionId, promotionId);
  }
  assert.equal(typeof message, "string");

  const logged = JSON.stringify(log.calls);
  assert.equal(logged.includes("SAVESECRET"), false);
  assert.equal(logged.includes("token-123"), false);
  assert.equal(logged.includes("client@example.com"), false);
  assert.equal(logged.includes("+15555550123"), false);
};

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

const mutableVoucher = (overrides = {}) => {
  const promotion = baseVoucher(overrides);
  let saveCalls = 0;
  promotion.save = async () => {
    saveCalls += 1;
    return promotion;
  };
  return { promotion, getSaveCalls: () => saveCalls };
};

afterEach(() => {
  Salon.findById = originalMethods.salonFindById;
  Service.findOne = originalMethods.serviceFindOne;
  Subscription.findOne = originalMethods.subscriptionFindOne;
  User.findById = originalMethods.userFindById;
  Voucher.create = originalMethods.voucherCreate;
  Voucher.findOne = originalMethods.voucherFindOne;
});

beforeEach(() => {
  Subscription.findOne = () =>
    query({
      ownerType: "salon",
      ownerId: salonId,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 60_000),
    });
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

test("unpaid authorized owner cannot create a salon promotion", async () => {
  installSalon();
  Subscription.findOne = () => query(null);
  let createCalled = false;
  Voucher.create = async () => {
    createCalled = true;
  };

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody(),
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "SALON_SUBSCRIPTION_REQUIRED",
    message: "An active salon subscription is required to manage promotions",
  });
  assert.equal(createCalled, false);
});

test("unpaid authorized admin cannot update a salon promotion", async () => {
  installSalon({ admins: [adminId] });
  Subscription.findOne = () => query(null);
  let promotionLookupCalled = false;
  Voucher.findOne = async () => {
    promotionLookupCalled = true;
  };

  const res = createResponse();
  await updateSalonPromotion(
    {
      user: { _id: adminId, role: "barber" },
      params: { salonId, promotionId: "64d000000000000000000099" },
      body: { title: "Renamed" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "SALON_SUBSCRIPTION_REQUIRED");
  assert.equal(promotionLookupCalled, false);
});

test("promotion mutations require an active subscription for the route salon", async () => {
  installSalon();
  let subscriptionFilter;
  Subscription.findOne = (filter) => {
    subscriptionFilter = filter;
    return query({
      ownerType: "salon",
      ownerId: salonId,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 60_000),
    });
  };
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
  assert.equal(subscriptionFilter.ownerType, "salon");
  assert.equal(String(subscriptionFilter.ownerId), salonId);
});

test("a subscription for another salon cannot grant promotion access", async () => {
  installSalon();
  const otherSalonId = "64d000000000000000000088";
  Subscription.findOne = (filter) => {
    if (String(filter.ownerId) === otherSalonId) {
      return query({ ownerType: "salon", ownerId: otherSalonId, status: "active" });
    }
    return query(null);
  };
  Voucher.create = async () => {
    throw new Error("must not create");
  };

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody(),
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "SALON_SUBSCRIPTION_REQUIRED");
});

test("unauthorized promotion requests are denied before subscription lookup", async () => {
  installSalon();
  let subscriptionLookupCalled = false;
  Subscription.findOne = () => {
    subscriptionLookupCalled = true;
    return query({ status: "active" });
  };

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
  assert.equal(subscriptionLookupCalled, false);
});

test("promotion subscription lookup failures fail closed", async () => {
  installSalon();
  Subscription.findOne = () => {
    throw new Error("subscription lookup failed");
  };

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody(),
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not create promotion" });
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

test("duplicate promotion create race returns 400 without logging sensitive code", async () => {
  installSalon();
  Voucher.findOne = () => query(null);
  Voucher.create = async () => {
    const error = new Error("duplicate SAVESECRET token-123 client@example.com +15555550123");
    error.code = 11000;
    throw error;
  };
  const log = createLog();

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody({ code: "SAVESECRET" }),
      log,
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "A promotion with this code already exists");
  assert.equal(log.calls.length, 0);
});

test("update validates the effective discount type and retained amount before mutation", async () => {
  installSalon();
  const { promotion, getSaveCalls } = mutableVoucher({ amount: 200 });
  Voucher.findOne = async () => promotion;

  const res = createResponse();
  await updateSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId, promotionId: "64d000000000000000000099" },
      body: { discountType: "percentage" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /cannot exceed 100/);
  assert.equal(promotion.discountType, "fixed");
  assert.equal(promotion.amount, 200);
  assert.equal(getSaveCalls(), 0);
});

test("valid discount type switch succeeds and percentage values above 100 are rejected", async () => {
  installSalon();
  const valid = mutableVoucher({ amount: 200 });
  Voucher.findOne = async () => valid.promotion;

  const validRes = createResponse();
  await updateSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId, promotionId: "64d000000000000000000099" },
      body: { discountType: "percentage", discountValue: 20 },
    },
    validRes
  );

  assert.equal(validRes.statusCode, 200);
  assert.equal(valid.promotion.discountType, "percentage");
  assert.equal(valid.promotion.amount, 20);
  assert.equal(valid.getSaveCalls(), 1);

  const invalid = mutableVoucher();
  Voucher.findOne = async () => invalid.promotion;
  const invalidRes = createResponse();
  await updateSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId, promotionId: "64d000000000000000000099" },
      body: { discountType: "percentage", discountValue: 101 },
    },
    invalidRes
  );

  assert.equal(invalidRes.statusCode, 400);
  assert.match(invalidRes.body.message, /cannot exceed 100/);
  assert.equal(invalid.promotion.discountType, "fixed");
  assert.equal(invalid.promotion.amount, 10);
  assert.equal(invalid.getSaveCalls(), 0);
});

test("create rejects malformed and reversed promotion dates without mutation", async () => {
  installSalon();
  let createCalls = 0;
  Voucher.create = async () => {
    createCalls += 1;
  };

  for (const body of [
    basePromotionBody({ startDate: "not-a-date" }),
    basePromotionBody({ endDate: "not-a-date" }),
    basePromotionBody({ startDate: "2030-05-02T00:00:00.000Z", endDate: "2030-05-01T00:00:00.000Z" }),
  ]) {
    const res = createResponse();
    await createSalonPromotion(
      {
        user: { _id: ownerId, role: "barber" },
        params: { salonId },
        body,
      },
      res
    );
    assert.equal(res.statusCode, 400);
  }

  assert.equal(createCalls, 0);
});

test("update rejects reversed effective dates without mutating the promotion", async () => {
  installSalon();
  const { promotion, getSaveCalls } = mutableVoucher({
    startDate: new Date("2030-05-01T00:00:00.000Z"),
    expiresAt: new Date("2030-05-05T00:00:00.000Z"),
  });
  Voucher.findOne = async () => promotion;

  const res = createResponse();
  await updateSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId, promotionId: "64d000000000000000000099" },
      body: { startDate: "2030-05-06T00:00:00.000Z" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /on or before/);
  assert.equal(promotion.startDate.toISOString(), "2030-05-01T00:00:00.000Z");
  assert.equal(promotion.expiresAt.toISOString(), "2030-05-05T00:00:00.000Z");
  assert.equal(getSaveCalls(), 0);
});

test("ordered and open-ended promotion dates remain valid", async () => {
  installSalon();
  Voucher.findOne = () => query(null);
  Voucher.create = async (payload) => payload;

  const createRes = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody({ startDate: "2030-05-01T00:00:00.000Z" }),
    },
    createRes
  );

  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.startDate.toISOString(), "2030-05-01T00:00:00.000Z");
  assert.equal(createRes.body.expiresAt, null);

  const { promotion, getSaveCalls } = mutableVoucher({
    startDate: new Date("2030-05-01T00:00:00.000Z"),
    expiresAt: null,
  });
  Voucher.findOne = async () => promotion;
  const updateRes = createResponse();
  await updateSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId, promotionId: "64d000000000000000000099" },
      body: { endDate: "2030-05-02T00:00:00.000Z" },
    },
    updateRes
  );

  assert.equal(updateRes.statusCode, 200);
  assert.equal(promotion.expiresAt.toISOString(), "2030-05-02T00:00:00.000Z");
  assert.equal(getSaveCalls(), 1);
});

test("promotion fetch failure logs structured err and preserves response", async () => {
  installSalon();
  const err = new Error("database unavailable");
  Voucher.find = () => {
    throw err;
  };
  const log = createLog();

  const res = createResponse();
  await getSalonPromotions(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      log,
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not fetch promotions" });
  assertSafeStructuredLog(log, {
    err,
    event: "promotion.fetch_failed",
    salonId,
  });
});

test("promotion create failure logs structured safe context", async () => {
  installSalon();
  Voucher.findOne = () => query(null);
  const err = new Error("create failed");
  Voucher.create = async () => {
    throw err;
  };
  const log = createLog();

  const res = createResponse();
  await createSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: basePromotionBody({ code: "SAVESECRET" }),
      log,
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not create promotion" });
  assertSafeStructuredLog(log, {
    err,
    event: "promotion.create_failed",
    salonId,
  });
});

test("promotion update failure logs structured record context", async () => {
  installSalon();
  const promotionId = "64d000000000000000000099";
  const err = new Error("update failed");
  Voucher.findOne = () => {
    throw err;
  };
  const log = createLog();

  const res = createResponse();
  await updateSalonPromotion(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId, promotionId },
      body: { title: "Renamed" },
      log,
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not update promotion" });
  assertSafeStructuredLog(log, {
    err,
    event: "promotion.update_failed",
    salonId,
    promotionId,
  });
});

test("promotion validation failure is unchanged when request logger is absent", async () => {
  const err = new Error("lookup failed");
  Voucher.findOne = () => {
    throw err;
  };

  const res = createResponse();
  await validateSalonPromotion(
    {
      params: { salonId },
      body: { code: "SAVESECRET", serviceId, barberId: staffBarberId },
    },
    res
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Could not validate promotion" });
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
