import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Salon from "../../models/Salon.js";
import { updateSalonJoinApplicationPolicy } from "./salonApplicationPolicyController.js";

const salonId = "64b000000000000000000010";
const ownerId = "64b000000000000000000001";
const adminId = "64b000000000000000000002";
const otherBarberId = "64b000000000000000000003";

const originalFindById = Salon.findById;

afterEach(() => {
  Salon.findById = originalFindById;
});

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const salon = (overrides = {}) => ({
  _id: salonId,
  ownerId,
  admins: [adminId],
  async save() {
    return this;
  },
  ...overrides,
});

const requestFor = (user, joinApplicationPolicy = "closed") => ({
  user,
  params: { salonId },
  body: { joinApplicationPolicy },
});

test("owner and admin can update only the salon join application policy", async () => {
  const document = salon();
  Salon.findById = async () => document;

  for (const user of [
    { _id: ownerId, role: "barber" },
    { _id: adminId, role: "barber" },
  ]) {
    const res = response();
    await updateSalonJoinApplicationPolicy(requestFor(user, "job_only"), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { salonId, joinApplicationPolicy: "job_only" });
    assert.equal(document.joinApplicationPolicy, "job_only");
  }
});

test("unrelated barbers, staff, chair renters, and clients cannot update policy", async () => {
  Salon.findById = async () => salon();

  for (const user of [
    { _id: otherBarberId, role: "barber" },
    { _id: "staff", role: "barber", salons: [{ salon: salonId, status: "approved" }] },
    { _id: "chair", role: "barber", salons: [{ salon: salonId, status: "approved" }] },
    { _id: "client", role: "client" },
  ]) {
    const res = response();
    await updateSalonJoinApplicationPolicy(requestFor(user), res);
    assert.equal(res.statusCode, 403);
  }
});

test("invalid policy and missing salon fail closed", async () => {
  Salon.findById = () => {
    throw new Error("invalid policy must not query");
  };
  const invalidRes = response();
  await updateSalonJoinApplicationPolicy(
    requestFor({ _id: ownerId, role: "barber" }, "anything"),
    invalidRes
  );
  assert.equal(invalidRes.statusCode, 400);

  Salon.findById = async () => null;
  const missingRes = response();
  await updateSalonJoinApplicationPolicy(
    requestFor({ _id: ownerId, role: "barber" }),
    missingRes
  );
  assert.equal(missingRes.statusCode, 404);
});
