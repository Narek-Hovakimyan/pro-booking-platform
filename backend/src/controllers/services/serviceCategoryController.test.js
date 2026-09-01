import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import ServiceCategory from "../../models/ServiceCategory.js";
import Service, { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from "../../models/Service.js";
import {
  listServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
} from "./serviceCategoryController.js";

/* ── Stub state ─────────────────────────────────────────── */
const originalFind = ServiceCategory.find;
const originalFindOne = ServiceCategory.findOne;
const originalCreate = ServiceCategory.create;
const originalFindById = ServiceCategory.findById;
const originalUpdateOne = ServiceCategory.updateOne;
const originalFindOneAndUpdate = ServiceCategory.findOneAndUpdate;
const originalDeleteOne = ServiceCategory.deleteOne;
const originalCountDocuments = Service.countDocuments;
const originalSalonFindById = Salon.findById;
const originalStartSession = mongoose.startSession;

const barberA = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const barberB = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const client = { _id: new mongoose.Types.ObjectId(), role: "client" };
const salonOwner = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const salonAdmin = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const salonMember = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const stranger = { _id: new mongoose.Types.ObjectId(), role: "barber" };
const anonymous = undefined; // no req.user

const salonId = new mongoose.Types.ObjectId();
const salonDoc = {
  _id: salonId,
  ownerId: salonOwner._id,
  admins: [salonAdmin._id],
};

afterEach(() => {
  ServiceCategory.find = originalFind;
  ServiceCategory.findOne = originalFindOne;
  ServiceCategory.create = originalCreate;
  ServiceCategory.findById = originalFindById;
  ServiceCategory.updateOne = originalUpdateOne;
  ServiceCategory.findOneAndUpdate = originalFindOneAndUpdate;
  ServiceCategory.deleteOne = originalDeleteOne;
  Service.countDocuments = originalCountDocuments;
  Salon.findById = originalSalonFindById;
  mongoose.startSession = originalStartSession;
});

beforeEach(() => {
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  });
  ServiceCategory.updateOne = async () => ({ matchedCount: 1 });
  ServiceCategory.findOneAndUpdate = async (_query, update) => ({ active: false, ...update.$set });
  ServiceCategory.deleteOne = async () => ({ deletedCount: 1 });
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

const makeDoc = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: "My Custom Cat",
  source: "custom",
  ownerType: "barber",
  ownerId: barberA._id,
  createdBy: barberA._id,
  active: true,
  sortOrder: 0,
  save: async function save() {
    return this;
  },
  deleteOne: async function deleteOne() {},
  ...overrides,
});

/**
 * Return a chainable Mongoose query-like object that
 * resolves `lean()` to the given result.
 * Used to stub findOne().sort().select().lean() for sortOrder lookup.
 */
const makeChainableSortQuery = (result) => ({
  sort: () => ({
    select: () => ({
      lean: async () => result,
    }),
  }),
});

const chainableNull = makeChainableSortQuery(null);

/**
 * Create a stub for ServiceCategory.findOne that:
 * - 1st call: returns null (duplicate name check — no duplicate)
 * - 2nd call: returns a chainable query resolving to null (sortOrder lookup)
 * Useful for create tests that don't care about sortOrder value.
 */
const makeCreateFindOneStub = () => {
  let callCount = 0;
  return (_query) => {
    callCount++;
    if (callCount === 1) return null;
    return chainableNull;
  };
};

/* ── listServiceCategories ──────────────────────────────── */

/* PUBLIC: no owner query → system categories only */
test("public GET returns system categories only when no owner params", async () => {
  const res = createResponse();

  await listServiceCategories({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, SERVICE_CATEGORIES.length);

  for (const entry of res.body) {
    assert.equal(entry.source, "system");
    assert.equal(entry.ownerType, "global");
  }
});

test("public GET does not return custom categories", async () => {
  const res = createResponse();

  // Even if we stub find, it shouldn't be called because no ownerType/ownerId
  let findCalled = false;
  ServiceCategory.find = () => {
    findCalled = true;
    return { sort: () => ({ lean: async () => [] }) };
  };

  await listServiceCategories({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(findCalled, false, "ServiceCategory.find should not be called for public list");
});

/* ANONYMOUS with ownerType/ownerId → 401 */
test("anonymous owner-scoped GET returns 401", async () => {
  const res = createResponse();

  await listServiceCategories(
    { query: { ownerType: "barber", ownerId: barberA._id }, user: anonymous },
    res
  );

  assert.equal(res.statusCode, 401);
});

/* AUTHENTICATED but not authorized → 403 */
test("authenticated barber cannot list another barber's custom categories", async () => {
  const res = createResponse();

  await listServiceCategories(
    { query: { ownerType: "barber", ownerId: barberB._id }, user: barberA },
    res
  );

  assert.equal(res.statusCode, 403);
});

/* AUTHENTICATED barber can list own custom categories */
test("authenticated barber can list own custom categories", async () => {
  const res = createResponse();
  const customCats = [
    { _id: new mongoose.Types.ObjectId(), name: "My Custom", ownerType: "barber", ownerId: barberA._id, source: "custom", sortOrder: 0 },
  ];

  const query = { sort() { return this; }, async lean() { return customCats; } };
  ServiceCategory.find = () => query;

  await listServiceCategories(
    { query: { ownerType: "barber", ownerId: barberA._id }, user: barberA },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, SERVICE_CATEGORIES.length + 1);
  const customEntry = res.body.find((c) => c.source === "custom");
  assert.equal(customEntry.name, "My Custom");
});

test("owner-scoped list uses _id to deterministically break legacy order ties", async () => {
  const res = createResponse();
  let sort;
  ServiceCategory.find = () => ({
    sort(value) { sort = value; return this; },
    async lean() { return []; },
  });

  await listServiceCategories(
    { query: { ownerType: "barber", ownerId: barberA._id }, user: barberA },
    res
  );

  assert.deepEqual(sort, { sortOrder: 1, createdAt: -1, _id: 1 });
});

/* SALON owner/admin can list salon custom categories */
test("salon owner can list salon custom categories", async () => {
  const res = createResponse();
  const customCats = [
    { _id: new mongoose.Types.ObjectId(), name: "Salon Cat", ownerType: "salon", ownerId: salonId, source: "custom", sortOrder: 0 },
  ];

  Salon.findById = async () => salonDoc;
  const query = { sort() { return this; }, async lean() { return customCats; } };
  ServiceCategory.find = () => query;

  await listServiceCategories(
    { query: { ownerType: "salon", ownerId: salonId }, user: salonOwner },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, SERVICE_CATEGORIES.length + 1);
});

test("salon admin can list salon custom categories", async () => {
  const res = createResponse();

  Salon.findById = async () => salonDoc;
  const query = { sort() { return this; }, async lean() { return []; } };
  ServiceCategory.find = () => query;

  await listServiceCategories(
    { query: { ownerType: "salon", ownerId: salonId }, user: salonAdmin },
    res
  );

  assert.equal(res.statusCode, 200);
});

test("ordinary salon member cannot list salon custom categories", async () => {
  const res = createResponse();
  let findCalled = false;

  Salon.findById = async () => salonDoc;
  ServiceCategory.find = () => {
    findCalled = true;
    return { sort() { return this; }, async lean() { return []; } };
  };

  await listServiceCategories(
    { query: { ownerType: "salon", ownerId: salonId }, user: salonMember },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(findCalled, false);
});

test("invalid ownerType returns 400", async () => {
  const res = createResponse();

  await listServiceCategories(
    { query: { ownerType: "invalid", ownerId: barberA._id }, user: barberA },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("missing ownerId with ownerType returns 400", async () => {
  const res = createResponse();

  await listServiceCategories(
    { query: { ownerType: "barber" }, user: barberA },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("owner-scoped list with invalid ObjectId ownerId returns 400", async () => {
  const res = createResponse();

  await listServiceCategories(
    { query: { ownerType: "barber", ownerId: "not-an-object-id" }, user: barberA },
    res
  );

  assert.equal(res.statusCode, 400);
});

test("listServiceCategories handles DB errors", async () => {
  const res = createResponse();

  Salon.findById = async () => salonDoc;
  const query = {
    sort() { return this; },
    async lean() { throw new Error("DB down"); },
  };
  ServiceCategory.find = () => query;

  await listServiceCategories(
    { query: { ownerType: "salon", ownerId: salonId }, user: salonOwner },
    res
  );

  assert.equal(res.statusCode, 500);
});

/* ── createServiceCategory ──────────────────────────────── */

test("first custom category for owner gets sortOrder 0", async () => {
  const res = createResponse();
  let createdPayload;

  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Luxury Treatment", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.name, "Luxury Treatment");
  assert.equal(createdPayload.source, "custom");
  assert.equal(createdPayload.ownerType, "barber");
  assert.equal(String(createdPayload.ownerId), String(barberA._id));
  assert.equal(String(createdPayload.createdBy), String(barberA._id));
  assert.equal(createdPayload.sortOrder, 0, "first category gets sortOrder 0");
});

test("create forces source to custom even if client sends system", async () => {
  const res = createResponse();
  let createdPayload;

  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Custom Cat", source: "system", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  // Source is hardcoded to "custom" in the controller, not read from body
  assert.equal(createdPayload.source, "custom");
  assert.equal(createdPayload.sortOrder, 0, "first category gets sortOrder 0");
});

test("cannot create category with system key name", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Haircut", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test("cannot create category with system label name (case-insensitive)", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  // "Hair color" is a display label, not a key — should still be rejected
  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Hair color", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test("cannot create category with system label name case-insensitively", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "hair color", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test("client cannot create custom category", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  await createServiceCategory(
    {
      user: client,
      body: { name: "Custom", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createCalled, false);
});

test("barber cannot create category for another barber", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Custom", ownerType: "barber", ownerId: barberB._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createCalled, false);
});

test("invalid ownerType returns 400 on create", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Cat", ownerType: "invalid", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test("invalid ownerId returns 400 on create", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Cat", ownerType: "barber", ownerId: "not-an-objectid" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test("salon owner can create salon custom category", async () => {
  const res = createResponse();
  let createdPayload;

  Salon.findById = async () => salonDoc;
  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    {
      user: salonOwner,
      body: { name: "Salon Special", ownerType: "salon", ownerId: salonId },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.ownerType, "salon");
  assert.equal(String(createdPayload.ownerId), String(salonId));
  assert.equal(createdPayload.sortOrder, 0, "first category for salon gets sortOrder 0");
});

test("salon admin can create salon custom category", async () => {
  const res = createResponse();
  let createdPayload;

  Salon.findById = async () => salonDoc;
  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    {
      user: salonAdmin,
      body: { name: "Admin Cat", ownerType: "salon", ownerId: salonId },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.sortOrder, 0, "first category for salon gets sortOrder 0");
});

test("ordinary salon member cannot create salon custom category", async () => {
  const res = createResponse();
  let createCalled = false;

  Salon.findById = async () => salonDoc;
  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  await createServiceCategory(
    {
      user: salonMember,
      body: { name: "Member Cat", ownerType: "salon", ownerId: salonId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createCalled, false);
});

test("create validates required fields", async () => {
  const invalidBodies = [
    { ownerType: "barber", ownerId: barberA._id },        // no name
    { name: "", ownerType: "barber", ownerId: barberA._id }, // empty name
    { name: "Cat", ownerId: barberA._id },                 // no ownerType
    { name: "Cat", ownerType: "barber" },                  // no ownerId
    { name: "Cat", ownerType: "invalid", ownerId: barberA._id }, // bad ownerType
  ];

  for (const body of invalidBodies) {
    const res = createResponse();
    let createCalled = false;

    ServiceCategory.create = async () => {
      createCalled = true;
      return {};
    };

    await createServiceCategory({ user: barberA, body }, res);
    assert.equal(
      res.statusCode,
      400,
      `Expected 400 for: ${JSON.stringify(body)}`,
    );
    assert.equal(createCalled, false, `Create should not be called for: ${JSON.stringify(body)}`);
  }
});

test("create rejects non-string category names", async () => {
  for (const name of [42, {}, [], null, true]) {
    const res = createResponse();
    let createCalled = false;
    ServiceCategory.create = async () => {
      createCalled = true;
      return {};
    };

    await createServiceCategory(
      { user: barberA, body: { name, ownerType: "barber", ownerId: barberA._id } },
      res
    );

    assert.equal(res.statusCode, 400, `Expected 400 for: ${JSON.stringify(name)}`);
    assert.equal(res.body.message, "Category name is required");
    assert.equal(createCalled, false);
  }
});

test("duplicate active category name returns 409 (case-insensitive)", async () => {
  const res = createResponse();
  let createCalled = false;

  // Simulate a duplicate by returning an existing doc from findOne
  ServiceCategory.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    name: "my existing cat",
  });
  ServiceCategory.create = async () => {
    createCalled = true;
    return {};
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "My Existing Cat", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(createCalled, false);
});

test("create maps a duplicate-key race to the stable category-name conflict", async () => {
  const res = createResponse();
  const duplicateKeyError = new Error("E11000 duplicate key error collection: categories");
  duplicateKeyError.code = 11000;
  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async () => {
    throw duplicateKeyError;
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Luxury Treatment", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "A custom category with this name already exists");
  assert.equal(res.body.message.includes("E11000"), false);
});

test("different owners can create categories with the same normalized name", async () => {
  const firstRes = createResponse();
  const secondRes = createResponse();
  const createdPayloads = [];
  ServiceCategory.create = async (payload) => {
    createdPayloads.push(payload);
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  ServiceCategory.findOne = makeCreateFindOneStub();
  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Luxury Treatment", ownerType: "barber", ownerId: barberA._id },
    },
    firstRes
  );

  ServiceCategory.findOne = makeCreateFindOneStub();
  await createServiceCategory(
    {
      user: barberB,
      body: { name: "  luxury   treatment  ", ownerType: "barber", ownerId: barberB._id },
    },
    secondRes
  );

  assert.equal(firstRes.statusCode, 201);
  assert.equal(secondRes.statusCode, 201);
  assert.equal(createdPayloads[0].normalizedName, createdPayloads[1].normalizedName);
  assert.notEqual(String(createdPayloads[0].ownerId), String(createdPayloads[1].ownerId));
});

test("create rejects custom-name duplicates that differ only by internal whitespace", async () => {
  const res = createResponse();
  ServiceCategory.findOne = async () => makeDoc({ name: "Luxury   Treatment" });

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Luxury Treatment", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 409);
});

test("create canonicalizes the display and normalized category names", async () => {
  const res = createResponse();
  let createdPayload;
  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "  Luxury   Treatment  ", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.name, "Luxury Treatment");
  assert.equal(createdPayload.normalizedName, "luxury treatment");
});

test("schema declares a unique active normalized-name index per owner", () => {
  const index = ServiceCategory.schema.indexes().find(([fields]) =>
    fields.ownerType === 1 && fields.ownerId === 1 && fields.normalizedName === 1
  );

  assert.equal(index?.[1].unique, true);
  assert.deepEqual(index?.[1].partialFilterExpression, {
    active: true,
    source: "custom",
    normalizedName: { $type: "string", $ne: "" },
  });
});

test("schema reserves active custom sortOrder positions without indexing legacy, inactive, or system rows", () => {
  const index = ServiceCategory.schema.indexes().find(([fields]) =>
    fields.ownerType === 1 && fields.ownerId === 1 && fields.sortOrder === 1
  );

  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, {
    source: "custom",
    active: true,
    sortOrderReserved: true,
  });
});

test("schema normalizes custom-category names before persistence", async () => {
  const category = new ServiceCategory({
    name: "  Luxury   Treatment  ",
    source: "custom",
    ownerType: "barber",
    ownerId: barberA._id,
    createdBy: barberA._id,
  });

  await category.validate();

  assert.equal(category.name, "Luxury Treatment");
  assert.equal(category.normalizedName, "luxury treatment");
});

test("schema rejects invalid sortOrder values without casting strings", async () => {
  for (const sortOrder of ["1", -1, 1.5, Infinity, NaN]) {
    const category = new ServiceCategory({
      name: "Valid Name",
      source: "custom",
      ownerType: "barber",
      ownerId: barberA._id,
      createdBy: barberA._id,
      sortOrder,
    });

    await assert.rejects(category.validate(), /sortOrder/);
  }
});

/* ── sortOrder auto-increment ──────────────────────────── */

test("second custom category for same owner gets sortOrder 1", async () => {
  const res = createResponse();
  let createdPayload;
  let findOneCallCount = 0;

  // 1st call (duplicate check) → null (no duplicate)
  // 2nd call (sortOrder lookup) → existing category with sortOrder 0
  ServiceCategory.findOne = (_query) => {
    findOneCallCount++;
    if (findOneCallCount === 1) return null;
    return makeChainableSortQuery({ sortOrder: 0 });
  };
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Second Service", ownerType: "barber", ownerId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.sortOrder, 1, "second category gets sortOrder 1");
});

test("different barber owner gets independent sortOrder 0", async () => {
  const res = createResponse();
  let createdPayload;

  // BarberB has no categories → sortOrder lookup returns null → 0
  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    {
      user: barberB,
      body: { name: "Barber B Cat", ownerType: "barber", ownerId: barberB._id },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.sortOrder, 0, "different barber starts at 0");
});

test("different salon owner gets independent sortOrder 0", async () => {
  const res = createResponse();
  const salon2Id = new mongoose.Types.ObjectId();
  const salon2Doc = { _id: salon2Id, ownerId: barberA._id, admins: [] };

  let createdPayload;

  Salon.findById = async () => salon2Doc;
  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Salon 2 Cat", ownerType: "salon", ownerId: salon2Id },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.sortOrder, 0, "different salon starts at 0");
});

test("client-provided sortOrder on create does not override server auto value", async () => {
  const res = createResponse();
  let createdPayload;

  ServiceCategory.findOne = makeCreateFindOneStub();
  ServiceCategory.create = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  // Client sends sortOrder: 999 — server should ignore it
  await createServiceCategory(
    {
      user: barberA,
      body: { name: "Ignore My Sort", ownerType: "barber", ownerId: barberA._id, sortOrder: 999 },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.sortOrder, 0, "client-provided sortOrder is ignored");
});

test("omitted sortOrder continues automatic owner-scoped ordering", async () => {
  const res = createResponse();
  let payload;
  ServiceCategory.findOne = (() => {
    let calls = 0;
    return () => (++calls === 1 ? null : makeChainableSortQuery({ sortOrder: 4 }));
  })();
  ServiceCategory.create = async (value) => {
    payload = value;
    return { _id: new mongoose.Types.ObjectId(), ...value };
  };

  await createServiceCategory(
    { user: barberA, body: { name: "Automatic", ownerType: "barber", ownerId: barberA._id } },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(payload.sortOrder, 5);
  assert.equal(payload.sortOrderReserved, true);
});

test("automatic allocation ignores inactive positions that are outside the active ordering index", async () => {
  const res = createResponse();
  let allocationQuery;
  let calls = 0;
  ServiceCategory.findOne = (query) => {
    calls += 1;
    if (calls === 1) return null;
    allocationQuery = query;
    return makeChainableSortQuery({ sortOrder: 2 });
  };
  ServiceCategory.create = async (payload) => ({ _id: new mongoose.Types.ObjectId(), ...payload });

  await createServiceCategory(
    { user: barberA, body: { name: "After Inactive", ownerType: "barber", ownerId: barberA._id } },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.sortOrder, 3);
  assert.equal(allocationQuery.active, true);
});

test("concurrent automatic allocations retry a database sortOrder collision with the next position", async () => {
  const res = createResponse();
  let createCalls = 0;
  let queryCalls = 0;
  ServiceCategory.findOne = () => {
    queryCalls += 1;
    if (queryCalls === 1) return null;
    return makeChainableSortQuery({ sortOrder: queryCalls === 2 ? 0 : 1 });
  };
  ServiceCategory.create = async (payload) => {
    createCalls += 1;
    if (createCalls === 1) {
      const error = new Error("E11000 ownerType_1_ownerId_1_sortOrder_1");
      error.code = 11000;
      error.keyPattern = { ownerType: 1, ownerId: 1, sortOrder: 1 };
      throw error;
    }
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  await createServiceCategory(
    { user: barberA, body: { name: "Concurrent", ownerType: "barber", ownerId: barberA._id } },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createCalls, 2);
  assert.equal(res.body.sortOrder, 2);
});

test("the same automatic position is allowed for different owners", async () => {
  const payloads = [];
  let calls = 0;
  ServiceCategory.findOne = () => (++calls % 2 === 1 ? null : chainableNull);
  ServiceCategory.create = async (payload) => {
    payloads.push(payload);
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };

  for (const user of [barberA, barberB]) {
    await createServiceCategory(
      { user, body: { name: `Owner ${user._id}`, ownerType: "barber", ownerId: user._id } },
      createResponse()
    );
  }

  assert.deepEqual(payloads.map(({ ownerId, sortOrder }) => [String(ownerId), sortOrder]), [
    [String(barberA._id), 0],
    [String(barberB._id), 0],
  ]);
});

/* ── updateServiceCategory ──────────────────────────────── */

test("barber can update a legacy category name and reserve its explicit sortOrder", async () => {
  const res = createResponse();
  const doc = makeDoc({ name: "Old Name" });

  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => null; // no duplicate

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { name: "New Name", sortOrder: 1 },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(doc.name, "New Name");
  assert.equal(doc.sortOrder, 1);
  assert.equal(doc.sortOrderReserved, true);
});

test("update rejects invalid explicit sortOrder values without coercion", async () => {
  for (const sortOrder of ["1", -1, 1.5, Infinity, NaN]) {
    const res = createResponse();
    const doc = makeDoc({ sortOrder: 7 });
    let saveCalled = false;
    doc.save = async () => { saveCalled = true; return doc; };
    ServiceCategory.findById = async () => doc;

    await updateServiceCategory(
      { user: barberA, params: { id: doc._id }, body: { sortOrder } },
      res
    );

    assert.equal(res.statusCode, 400, `Expected 400 for ${String(sortOrder)}`);
    assert.equal(doc.sortOrder, 7);
    assert.equal(saveCalled, false);
  }
});

test("legacy explicit reorder rejects an occupied active legacy position", async () => {
  const res = createResponse();
  const doc = makeDoc({ sortOrder: 1 });
  let saveCalled = false;
  doc.save = async () => { saveCalled = true; return doc; };
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => makeDoc({ sortOrder: 3 });

  await updateServiceCategory(
    { user: barberA, params: { id: doc._id }, body: { sortOrder: 3 } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "Category sortOrder already exists");
  assert.equal(saveCalled, false);
});

test("sortOrder occupancy checks stay owner-scoped", async () => {
  const res = createResponse();
  const doc = makeDoc({ sortOrder: 1 });
  let query;
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = (value) => { query = value; return null; };

  await updateServiceCategory(
    { user: barberA, params: { id: doc._id }, body: { sortOrder: 3 } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(String(query.ownerId), String(barberA._id));
  assert.equal(query.ownerType, "barber");
  assert.equal(query.active, true);
});

test("concurrent explicit sortOrder collision returns a stable conflict instead of E11000", async () => {
  const res = createResponse();
  const doc = makeDoc();
  const error = new Error("E11000 ownerType_1_ownerId_1_sortOrder_1");
  error.code = 11000;
  error.keyPattern = { ownerType: 1, ownerId: 1, sortOrder: 1 };
  doc.save = async () => { throw error; };
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => null;

  await updateServiceCategory(
    { user: barberA, params: { id: doc._id }, body: { sortOrder: 3 } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "Category sortOrder already exists");
  assert.equal(res.body.message.includes("E11000"), false);
});

test("reactivation with an occupied sortOrder returns a stable conflict", async () => {
  const res = createResponse();
  const doc = makeDoc({ active: false });
  const error = new Error("E11000 ownerType_1_ownerId_1_sortOrder_1");
  error.code = 11000;
  error.keyPattern = { ownerType: 1, ownerId: 1, sortOrder: 1 };
  doc.save = async () => { throw error; };
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => null;

  await updateServiceCategory(
    { user: barberA, params: { id: doc._id }, body: { active: true } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "Category sortOrder already exists");
  assert.equal(res.body.message.includes("E11000"), false);
});

test("legacy reactivation reserves a free owner-scoped sortOrder without affecting another owner", async () => {
  const res = createResponse();
  const doc = makeDoc({ active: false, sortOrder: 3, sortOrderReserved: false });
  const otherOwnerCategory = makeDoc({ ownerId: barberB._id, sortOrder: 3, active: true });
  const queries = [];
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async (query) => {
    queries.push(query);
    return null;
  };

  await updateServiceCategory(
    { user: barberA, params: { id: doc._id }, body: { active: true } },
    res
  );

  const sortOrderQuery = queries.find((query) => "sortOrder" in query);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, doc);
  assert.equal(doc.active, true);
  assert.equal(doc.sortOrder, 3);
  assert.equal(doc.sortOrderReserved, true);
  assert.equal(String(sortOrderQuery.ownerId), String(barberA._id));
  assert.equal(otherOwnerCategory.active, true);
  assert.equal(otherOwnerCategory.sortOrder, 3);
});

test("legacy reactivation rejects an occupied active legacy position before saving", async () => {
  const res = createResponse();
  const doc = makeDoc({ active: false, sortOrder: 3 });
  let calls = 0;
  let saveCalled = false;
  doc.save = async () => { saveCalled = true; return doc; };
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => (++calls === 1 ? null : makeDoc({ sortOrder: 3 }));

  await updateServiceCategory(
    { user: barberA, params: { id: doc._id }, body: { active: true } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "Category sortOrder already exists");
  assert.equal(saveCalled, false);
});

test("can soft-disable custom category", async () => {
  const res = createResponse();
  const doc = makeDoc({ active: true });
  let lockQuery;
  let updateQuery;
  let updateValue;

  ServiceCategory.findById = async () => doc;
  ServiceCategory.updateOne = async (query) => {
    lockQuery = query;
    return { matchedCount: 1 };
  };
  ServiceCategory.findOneAndUpdate = async (query, update) => {
    updateQuery = query;
    updateValue = update;
    return { ...doc, ...update.$set };
  };

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { active: false },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(lockQuery, { _id: doc._id, source: "custom" });
  assert.deepEqual(updateQuery, { _id: doc._id, source: "custom" });
  assert.deepEqual(updateValue, { $set: { active: false } });
  assert.equal(res.body.active, false);
});

test("deactivation fails closed when the transactional category lock loses an assignment race", async () => {
  const res = createResponse();
  const doc = makeDoc({ active: true });
  let persisted = false;

  ServiceCategory.findById = async () => doc;
  ServiceCategory.updateOne = async () => ({ matchedCount: 0 });
  ServiceCategory.findOneAndUpdate = async () => {
    persisted = true;
    return null;
  };

  await updateServiceCategory(
    { user: barberA, params: { id: doc._id }, body: { active: false } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Category not found");
  assert.equal(persisted, false);
});

test("rename rejects non-string category names", async () => {
  for (const name of [42, {}, [], null, true]) {
    const res = createResponse();
    const doc = makeDoc({ name: "Existing Category" });
    let saveCalled = false;
    doc.save = async function save() {
      saveCalled = true;
      return this;
    };
    ServiceCategory.findById = async () => doc;

    await updateServiceCategory(
      { user: barberA, params: { id: doc._id }, body: { name } },
      res
    );

    assert.equal(res.statusCode, 400, `Expected 400 for: ${JSON.stringify(name)}`);
    assert.equal(res.body.message, "Category name is required");
    assert.equal(doc.name, "Existing Category");
    assert.equal(saveCalled, false);
  }
});

test("rename rejects a case-only normalized-name collision", async () => {
  const res = createResponse();
  const doc = makeDoc({ name: "Luxury Treatment" });
  let saveCalled = false;
  doc.save = async function save() {
    saveCalled = true;
    return this;
  };
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => makeDoc({ name: "BRIDAL" });

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { name: "bridal" },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(doc.name, "Luxury Treatment");
  assert.equal(saveCalled, false);
});

test("rename maps a duplicate-key race to the stable category-name conflict", async () => {
  const res = createResponse();
  const doc = makeDoc({ name: "Existing Category" });
  const duplicateKeyError = new Error("E11000 duplicate key error collection: categories");
  duplicateKeyError.code = 11000;
  doc.save = async () => {
    throw duplicateKeyError;
  };
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => null;

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { name: "Luxury Treatment" },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "A custom category with this name already exists");
  assert.equal(res.body.message.includes("E11000"), false);
});

test("reactivation rejects a normalized-name collision", async () => {
  const res = createResponse();
  const doc = makeDoc({ name: "Luxury   Treatment", active: false });
  let saveCalled = false;
  doc.save = async function save() {
    saveCalled = true;
    return this;
  };
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => makeDoc({ name: "luxury treatment" });

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { active: true },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(doc.active, false);
  assert.equal(saveCalled, false);
});

test("rename stores the canonical display and normalized names", async () => {
  const res = createResponse();
  const doc = makeDoc({ name: "Old Name" });
  ServiceCategory.findById = async () => doc;
  ServiceCategory.findOne = async () => null;

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { name: "  Luxury   Treatment  " },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(doc.name, "Luxury Treatment");
  assert.equal(doc.normalizedName, "luxury treatment");
});

test("cannot update system category via API", async () => {
  const res = createResponse();
  let saveCalled = false;
  const doc = makeDoc({ source: "system", save: async () => { saveCalled = true; } });

  ServiceCategory.findById = async () => doc;

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { name: "Hacked" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(saveCalled, false);
});

test("cannot update another barber's category", async () => {
  const res = createResponse();
  let saveCalled = false;
  const doc = makeDoc({ ownerId: barberB._id, save: async () => { saveCalled = true; } });

  ServiceCategory.findById = async () => doc;

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { name: "Stolen" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(saveCalled, false);
});

test("update with invalid ObjectId returns 400", async () => {
  const res = createResponse();
  let findByIdCalled = false;

  ServiceCategory.findById = async () => {
    findByIdCalled = true;
    return null;
  };

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: "not-an-objectid" },
      body: { name: "Nope" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(findByIdCalled, false);
});

test("update non-existent category returns 404", async () => {
  const res = createResponse();

  ServiceCategory.findById = async () => null;

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: new mongoose.Types.ObjectId() },
      body: { name: "Nope" },
    },
    res
  );

  assert.equal(res.statusCode, 404);
});

test("update with no valid fields returns 400", async () => {
  const res = createResponse();
  const doc = makeDoc();

  ServiceCategory.findById = async () => doc;

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
});

/* ── deleteServiceCategory ──────────────────────────────── */

test("hard-deletes custom category when no services reference it", async () => {
  const res = createResponse();
  let deleteQuery;
  const doc = makeDoc();

  ServiceCategory.findById = async () => doc;
  Service.countDocuments = async () => 0;
  ServiceCategory.deleteOne = async (query) => {
    deleteQuery = query;
    return { deletedCount: 1 };
  };

  await deleteServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(deleteQuery, { _id: doc._id, source: "custom" });
});

test("delete fails closed when its transactional category lock loses an assignment race", async () => {
  const res = createResponse();
  let deleteCalled = false;
  const doc = makeDoc({
    deleteOne: async () => { deleteCalled = true; },
  });

  ServiceCategory.findById = async () => doc;
  ServiceCategory.updateOne = async () => ({ matchedCount: 0 });
  Service.countDocuments = async () => 0;

  await deleteServiceCategory(
    { user: barberA, params: { id: doc._id } },
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Category not found");
  assert.equal(deleteCalled, false);
});

test("soft-deletes custom category when services reference it", async () => {
  const res = createResponse();
  let countQuery;
  let updateQuery;
  let updateValue;
  const doc = makeDoc({ active: true });

  ServiceCategory.findById = async () => doc;
  Service.countDocuments = async (query) => {
    countQuery = query;
    return 2;
  };
  ServiceCategory.findOneAndUpdate = async (query, update) => {
    updateQuery = query;
    updateValue = update;
    return { ...doc, ...update.$set };
  };

  await deleteServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(countQuery, { customCategoryId: doc._id });
  assert.deepEqual(updateQuery, { _id: doc._id, source: "custom" });
  assert.deepEqual(updateValue, { $set: { active: false } });
  assert.equal(res.body.category.active, false);
  assert.equal(res.body.softDeleted, true);
});

test("soft-deletes custom category when only inactive services reference it", async () => {
  const res = createResponse();
  let deleteCalled = false;
  const doc = makeDoc();
  ServiceCategory.findById = async () => doc;
  Service.countDocuments = async () => 1;
  ServiceCategory.findOneAndUpdate = async (_query, update) => ({ ...doc, ...update.$set });
  ServiceCategory.deleteOne = async () => {
    deleteCalled = true;
    return { deletedCount: 1 };
  };

  await deleteServiceCategory(
    { user: barberA, params: { id: doc._id } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.softDeleted, true);
  assert.equal(res.body.category.active, false);
  assert.equal(deleteCalled, false);
});

test("cannot delete system category", async () => {
  const res = createResponse();
  let deleteCalled = false;
  const doc = makeDoc({
    source: "system",
    deleteOne: async () => { deleteCalled = true; },
  });

  ServiceCategory.findById = async () => doc;

  await deleteServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(deleteCalled, false);
});

test("cannot delete another barber's category", async () => {
  const res = createResponse();
  let deleteCalled = false;
  const doc = makeDoc({
    ownerId: barberB._id,
    deleteOne: async () => { deleteCalled = true; },
  });

  ServiceCategory.findById = async () => doc;

  await deleteServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(deleteCalled, false);
});

test("client cannot delete category", async () => {
  const res = createResponse();
  let deleteCalled = false;
  const doc = makeDoc({
    deleteOne: async () => { deleteCalled = true; },
  });

  ServiceCategory.findById = async () => doc;

  await deleteServiceCategory(
    {
      user: client,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(deleteCalled, false);
});

test("delete with invalid ObjectId returns 400", async () => {
  const res = createResponse();
  let findByIdCalled = false;

  ServiceCategory.findById = async () => {
    findByIdCalled = true;
    return null;
  };

  await deleteServiceCategory(
    {
      user: barberA,
      params: { id: "not-an-objectid" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(findByIdCalled, false);
});

test("delete non-existent category returns 404", async () => {
  const res = createResponse();

  ServiceCategory.findById = async () => null;

  await deleteServiceCategory(
    {
      user: barberA,
      params: { id: new mongoose.Types.ObjectId() },
    },
    res
  );

  assert.equal(res.statusCode, 404);
});

test("salon member cannot delete salon custom category", async () => {
  const res = createResponse();
  let deleteCalled = false;
  const doc = makeDoc({
    ownerType: "salon",
    ownerId: salonId,
    deleteOne: async () => { deleteCalled = true; },
  });

  Salon.findById = async () => salonDoc;
  ServiceCategory.findById = async () => doc;

  await deleteServiceCategory(
    {
      user: salonMember,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(deleteCalled, false);
});

test("salon owner can delete salon custom category", async () => {
  const res = createResponse();
  let deleteQuery;
  const doc = makeDoc({ ownerType: "salon", ownerId: salonId });

  Salon.findById = async () => salonDoc;
  ServiceCategory.findById = async () => doc;
  Service.countDocuments = async () => 0;
  ServiceCategory.deleteOne = async (query) => {
    deleteQuery = query;
    return { deletedCount: 1 };
  };

  await deleteServiceCategory(
    {
      user: salonOwner,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(deleteQuery, { _id: doc._id, source: "custom" });
});
