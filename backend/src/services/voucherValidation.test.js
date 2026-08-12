import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import {
  assertVoucherOwnerAccess,
  calculateVoucherDiscountPreview,
  getActiveVoucherService,
  validateManagedVoucherServiceReference,
  validateManualVoucherCode,
  validateVoucherApplicability,
  validateVoucherCreateInput,
} from "./voucherValidation.js";

const originalSalonFindById = Salon.findById;
const originalServiceFindOne = Service.findOne;

const ownerId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
const memberId = new mongoose.Types.ObjectId();
const otherBarberId = new mongoose.Types.ObjectId();
const salonId = new mongoose.Types.ObjectId();
const serviceId = new mongoose.Types.ObjectId();

const query = (result) => ({
  select() {
    return this;
  },
  lean: async () => result,
});

const createVoucher = (overrides = {}) => ({
  ownerType: "barber",
  ownerId,
  active: true,
  expiresAt: null,
  startDate: null,
  currentUses: 0,
  maxUses: 5,
  serviceId: null,
  applicableServiceIds: [],
  applicableBarberIds: [],
  amount: 10,
  discountType: "fixed",
  ...overrides,
});

afterEach(() => {
  Salon.findById = originalSalonFindById;
  Service.findOne = originalServiceFindOne;
});

test("validateVoucherCreateInput preserves valid and invalid payload behavior", () => {
  assert.deepEqual(
    validateVoucherCreateInput({
      ownerType: "barber",
      ownerId,
      title: " Summer ",
      type: "amount",
      amount: "5",
      maxUses: "2",
      visibility: "public",
    }),
    []
  );

  assert.deepEqual(
    validateVoucherCreateInput({
      ownerType: "invalid",
      title: " ",
      type: "amount",
      amount: 0,
      maxUses: 0,
      visibility: "secret",
    }),
    [
      "ownerType must be 'barber' or 'salon'",
      "ownerId is required",
      "title is required",
      "amount must be greater than 0",
      "maxUses must be >= 1",
      "visibility must be 'private' or 'public'",
    ]
  );
});

test("validateManualVoucherCode preserves boundaries and hostile input rejection", () => {
  assert.deepEqual(validateManualVoucherCode(" save10 "), { value: "SAVE10" });
  assert.equal(
    validateManualVoucherCode("abc").error,
    "Code must be between 4 and 20 characters"
  );
  assert.equal(
    validateManualVoucherCode("bad-code").error,
    "Code must be alphanumeric"
  );
  assert.equal(
    validateManualVoucherCode({ toString: () => "a/b" }).error,
    "Code must be between 4 and 20 characters"
  );
  assert.equal(
    validateManualVoucherCode(Symbol("voucher")).error,
    "Code must be alphanumeric"
  );
});

test("assertVoucherOwnerAccess stays fail-closed for barber and salon scopes", async () => {
  const owner = { _id: ownerId, role: "barber" };
  const admin = { _id: adminId, role: "barber" };
  const member = { _id: memberId, role: "barber" };

  Salon.findById = () =>
    query({
      _id: salonId,
      ownerId,
      admins: [adminId],
    });

  assert.deepEqual(
    await assertVoucherOwnerAccess({ user: owner, ownerType: "barber", ownerId }),
    { allowed: true }
  );
  assert.deepEqual(
    await assertVoucherOwnerAccess({ user: member, ownerType: "barber", ownerId }),
    {
      error: "You can only manage barber-scoped vouchers for yourself",
      code: 403,
    }
  );
  assert.deepEqual(
    await assertVoucherOwnerAccess({ user: admin, ownerType: "salon", ownerId: salonId }),
    { allowed: true }
  );
  assert.deepEqual(
    await assertVoucherOwnerAccess({ user: member, ownerType: "salon", ownerId: salonId }),
    {
      error: "Only salon owner or admin can manage salon-scoped vouchers",
      code: 403,
    }
  );
});

test("assertVoucherOwnerAccess does not leak salon data on invalid or missing salon", async () => {
  const user = { _id: ownerId, role: "barber" };

  assert.deepEqual(
    await assertVoucherOwnerAccess({ user, ownerType: "salon", ownerId: "not-an-id" }),
    { error: "Invalid salon ID", code: 400 }
  );

  Salon.findById = () => query(null);
  assert.deepEqual(
    await assertVoucherOwnerAccess({ user, ownerType: "salon", ownerId: salonId }),
    { error: "Salon not found", code: 404 }
  );
});

test("validateManagedVoucherServiceReference remains scoped to requesting barber", async () => {
  Service.findOne = () => query({ _id: serviceId });

  assert.equal(
    (await validateManagedVoucherServiceReference({
      serviceId,
      barberId: ownerId,
    })).service._id.toString(),
    serviceId.toString()
  );

  assert.deepEqual(
    await validateManagedVoucherServiceReference({
      serviceId: "not-an-id",
      barberId: ownerId,
    }),
    { error: "Invalid serviceId", code: 400 }
  );

  Service.findOne = () => query(null);
  assert.deepEqual(
    await validateManagedVoucherServiceReference({
      serviceId,
      barberId: otherBarberId,
    }),
    { error: "Service not found or does not belong to you", code: 400 }
  );
});

test("validateVoucherApplicability preserves fail-closed boundaries and does not mutate inputs", () => {
  const voucher = createVoucher({
    ownerId,
    applicableServiceIds: [serviceId],
    applicableBarberIds: [ownerId],
  });
  const before = {
    ownerId: voucher.ownerId.toString(),
    applicableServiceIds: voucher.applicableServiceIds.map(String),
    applicableBarberIds: voucher.applicableBarberIds.map(String),
  };

  assert.deepEqual(
    validateVoucherApplicability({
      voucher,
      barberId: ownerId,
      serviceId,
    }),
    { allowed: true }
  );
  assert.deepEqual(
    {
      ownerId: voucher.ownerId.toString(),
      applicableServiceIds: voucher.applicableServiceIds.map(String),
      applicableBarberIds: voucher.applicableBarberIds.map(String),
    },
    before
  );

  assert.deepEqual(
    validateVoucherApplicability({
      voucher: createVoucher({ active: false }),
      barberId: ownerId,
      serviceId,
    }),
    { error: "This voucher is no longer active", code: 400 }
  );

  assert.deepEqual(
    validateVoucherApplicability({
      voucher: createVoucher({ ownerId: otherBarberId }),
      barberId: ownerId,
      serviceId,
    }),
    { error: "This voucher does not apply to this barber", code: 400 }
  );

  assert.deepEqual(
    validateVoucherApplicability({
      voucher: createVoucher({ ownerType: "salon", ownerId: salonId }),
      barberId: ownerId,
      serviceId,
    }),
    { error: "salonId is required for salon-scoped vouchers", code: 400 }
  );

  assert.deepEqual(
    validateVoucherApplicability({
      voucher: createVoucher({ serviceId }),
      barberId: ownerId,
    }),
    { error: "serviceId is required for service-specific vouchers", code: 400 }
  );
});

test("calculateVoucherDiscountPreview preserves discounted-price caps and input purity", () => {
  const voucher = createVoucher({ amount: 10000, discountType: "fixed" });
  const service = {
    price: 12000,
    discountType: "fixed",
    discountValue: 7000,
  };
  const voucherBefore = {
    amount: voucher.amount,
    discountType: voucher.discountType,
    ownerId: voucher.ownerId.toString(),
  };
  const serviceBefore = { ...service };

  assert.equal(
    calculateVoucherDiscountPreview({ voucher, service }),
    5000
  );
  assert.equal(
    calculateVoucherDiscountPreview({
      voucher: createVoucher({ amount: 250, discountType: "percentage" }),
      service: { price: 100, discountType: "none", discountValue: 0 },
    }),
    100
  );
  assert.deepEqual(
    {
      amount: voucher.amount,
      discountType: voucher.discountType,
      ownerId: voucher.ownerId.toString(),
    },
    voucherBefore
  );
  assert.deepEqual(service, serviceBefore);
});

test("getActiveVoucherService preserves active-only lookup behavior", async () => {
  Service.findOne = () =>
    query({
      _id: serviceId,
      price: 50,
      discountType: "none",
      discountValue: 0,
    });

  assert.equal(
    (await getActiveVoucherService({ serviceId })).service._id.toString(),
    serviceId.toString()
  );

  Service.findOne = () => query(null);
  assert.deepEqual(
    await getActiveVoucherService({ serviceId }),
    { error: "Service not found or inactive", code: 400 }
  );
});
