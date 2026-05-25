import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import mongoose from "mongoose";

import Salon from "../models/Salon.js";
import ServiceCategory from "../models/ServiceCategory.js";
import Service, { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from "../models/Service.js";
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
const originalCountDocuments = Service.countDocuments;
const originalSalonFindById = Salon.findById;

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
  Service.countDocuments = originalCountDocuments;
  Salon.findById = originalSalonFindById;
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

test("barber can create their own custom category", async () => {
  const res = createResponse();
  let createdPayload;

  ServiceCategory.findOne = async () => null;
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
});

test("create forces source to custom even if client sends system", async () => {
  const res = createResponse();
  let createdPayload;

  ServiceCategory.findOne = async () => null;
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
  ServiceCategory.findOne = async () => null;
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
});

test("salon admin can create salon custom category", async () => {
  const res = createResponse();

  Salon.findById = async () => salonDoc;
  ServiceCategory.findOne = async () => null;
  ServiceCategory.create = async (payload) => {
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

/* ── updateServiceCategory ──────────────────────────────── */

test("barber can update their own custom category name", async () => {
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
});

test("can soft-disable custom category", async () => {
  const res = createResponse();
  const doc = makeDoc({ active: true });

  ServiceCategory.findById = async () => doc;

  await updateServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
      body: { active: false },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(doc.active, false);
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
  let deleteCalled = false;
  const doc = makeDoc({
    deleteOne: async () => { deleteCalled = true; },
  });

  ServiceCategory.findById = async () => doc;
  Service.countDocuments = async () => 0;

  await deleteServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(deleteCalled, true);
});

test("soft-deletes custom category when services reference it", async () => {
  const res = createResponse();
  let saved = false;
  let countQuery;
  const doc = makeDoc({
    active: true,
    save: async function () {
      saved = true;
      return this;
    },
  });

  ServiceCategory.findById = async () => doc;
  Service.countDocuments = async (query) => {
    countQuery = query;
    return 2;
  };

  await deleteServiceCategory(
    {
      user: barberA,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(countQuery, { customCategoryId: doc._id, active: true });
  assert.equal(doc.active, false);
  assert.equal(saved, true);
  assert.equal(res.body.softDeleted, true);
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
  let deleteCalled = false;
  const doc = makeDoc({
    ownerType: "salon",
    ownerId: salonId,
    deleteOne: async () => { deleteCalled = true; },
  });

  Salon.findById = async () => salonDoc;
  ServiceCategory.findById = async () => doc;
  Service.countDocuments = async () => 0;

  await deleteServiceCategory(
    {
      user: salonOwner,
      params: { id: doc._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(deleteCalled, true);
});
