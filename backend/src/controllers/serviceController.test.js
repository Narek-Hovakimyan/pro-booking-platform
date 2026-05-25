import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import {
  createService,
  deleteService,
  getServicesByBarber,
  updateService,
} from "./serviceController.js";
import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import ServiceCategory from "../models/ServiceCategory.js";

const originalServiceMethods = {
  create: Service.create,
  find: Service.find,
  findById: Service.findById,
};
const originalServiceCategoryMethods = {
  findById: ServiceCategory.findById,
};
const originalSalonMethods = {
  findById: Salon.findById,
};

const barberA = { _id: "barber-a", role: "barber" };
const barberB = { _id: "barber-b", role: "barber" };
const client = { _id: "client-a", role: "client" };
const salonId = new mongoose.Types.ObjectId();
const customCategoryId = new mongoose.Types.ObjectId();

afterEach(() => {
  Service.create = originalServiceMethods.create;
  Service.find = originalServiceMethods.find;
  Service.findById = originalServiceMethods.findById;
  ServiceCategory.findById = originalServiceCategoryMethods.findById;
  Salon.findById = originalSalonMethods.findById;
});

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

const makeCustomCategory = (overrides = {}) => ({
  _id: customCategoryId,
  source: "custom",
  active: true,
  ownerType: "barber",
  ownerId: barberA._id,
  ...overrides,
});

test("barber can create their own service using req.user._id", async () => {
  const res = createResponse();
  let createdPayload;

  Service.create = async (payload) => {
    createdPayload = payload;
    return { _id: "service-a", ...payload };
  };

  await createService(
    {
      user: barberA,
      body: {
        barberId: barberA._id,
        name: " Beard Trim ",
        price: 0,
        duration: 20,
        active: true,
        category: "beard",
        tags: [" Trim ", "trim", "Line Up"],
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.barberId, barberA._id);
  assert.equal(createdPayload.name, "Beard Trim");
  assert.equal(createdPayload.price, 0);
  assert.equal(createdPayload.category, "beard");
  assert.deepEqual(createdPayload.tags, ["trim", "line up"]);
  assert.equal(res.body.barberId, barberA._id);
});

test("barber can create service with valid barber-owned customCategoryId", async () => {
  const res = createResponse();
  let createdPayload;

  ServiceCategory.findById = async () => makeCustomCategory();
  Service.create = async (payload) => {
    createdPayload = payload;
    return { _id: "service-a", ...payload };
  };

  await createService(
    {
      user: barberA,
      body: {
        name: "Custom Cut",
        price: 5000,
        duration: 30,
        category: "other",
        customCategoryId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(String(createdPayload.customCategoryId), String(customCategoryId));
  assert.equal(createdPayload.category, "other");
});

test("barber can create service with valid salon-owned customCategoryId when salon admin", async () => {
  const res = createResponse();
  let createdPayload;

  ServiceCategory.findById = async () =>
    makeCustomCategory({ ownerType: "salon", ownerId: salonId });
  Salon.findById = async () => ({
    _id: salonId,
    ownerId: barberB._id,
    admins: [barberA._id],
  });
  Service.create = async (payload) => {
    createdPayload = payload;
    return { _id: "service-a", ...payload };
  };

  await createService(
    {
      user: barberA,
      body: {
        name: "Salon Custom",
        price: 5000,
        duration: 30,
        category: "other",
        customCategoryId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(String(createdPayload.customCategoryId), String(customCategoryId));
});

test("barber cannot create a service for another barber", async () => {
  const res = createResponse();
  let createCalled = false;

  Service.create = async () => {
    createCalled = true;
  };

  await createService(
    {
      user: barberA,
      body: {
        barberId: barberB._id,
        name: "Cut",
        price: 5000,
        duration: 30,
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createCalled, false);
});

test("barber cannot create service with another barber's customCategoryId", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.findById = async () => makeCustomCategory({ ownerId: barberB._id });
  Service.create = async () => {
    createCalled = true;
  };

  await createService(
    {
      user: barberA,
      body: {
        name: "Custom Cut",
        price: 5000,
        duration: 30,
        category: "other",
        customCategoryId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createCalled, false);
});

test("barber cannot create service with unauthorized salon customCategoryId", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.findById = async () =>
    makeCustomCategory({ ownerType: "salon", ownerId: salonId });
  Salon.findById = async () => ({ _id: salonId, ownerId: barberB._id, admins: [] });
  Service.create = async () => {
    createCalled = true;
  };

  await createService(
    {
      user: barberA,
      body: {
        name: "Salon Custom",
        price: 5000,
        duration: 30,
        category: "other",
        customCategoryId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createCalled, false);
});

test("create rejects system ServiceCategory as customCategoryId", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.findById = async () => makeCustomCategory({ source: "system" });
  Service.create = async () => {
    createCalled = true;
  };

  await createService(
    {
      user: barberA,
      body: {
        name: "System Ref",
        price: 5000,
        duration: 30,
        customCategoryId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test("create rejects inactive customCategoryId", async () => {
  const res = createResponse();
  let createCalled = false;

  ServiceCategory.findById = async () => makeCustomCategory({ active: false });
  Service.create = async () => {
    createCalled = true;
  };

  await createService(
    {
      user: barberA,
      body: {
        name: "Inactive Ref",
        price: 5000,
        duration: 30,
        customCategoryId,
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test("create rejects invalid customCategoryId", async () => {
  const res = createResponse();
  let findCategoryCalled = false;
  let createCalled = false;

  ServiceCategory.findById = async () => {
    findCategoryCalled = true;
  };
  Service.create = async () => {
    createCalled = true;
  };

  await createService(
    {
      user: barberA,
      body: {
        name: "Bad Ref",
        price: 5000,
        duration: 30,
        customCategoryId: "not-an-objectid",
      },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(findCategoryCalled, false);
  assert.equal(createCalled, false);
});

test("create validates required service fields", async () => {
  const invalidBodies = [
    { name: "", price: 5000, duration: 30 },
    { name: "Cut", price: "", duration: 30 },
    { name: "Cut", price: null, duration: 30 },
    { name: "Cut", price: -1, duration: 30 },
    { name: "Cut", price: 5000, duration: 0 },
    { name: "Cut", price: 5000, duration: 30, active: "true" },
    { name: "Cut", price: 5000, duration: 30, category: "fitness" },
    { name: "Cut", price: 5000, duration: 30, tags: "trim" },
    { name: "Cut", price: 5000, duration: 30, tags: ["a".repeat(33)] },
  ];

  Service.create = async () => {
    throw new Error("create should not be called");
  };

  for (const body of invalidBodies) {
    const res = createResponse();

    await createService(
      {
        user: barberA,
        body,
      },
      res
    );

    assert.equal(res.statusCode, 400);
  }
});

test("only service owner barber can update a service", async () => {
  const res = createResponse();
  const service = {
    _id: "service-a",
    barberId: barberA._id,
    name: "Cut",
    price: 5000,
    duration: 30,
    active: true,
    save: async function save() {
      return this;
    },
  };

  Service.findById = async () => service;

  await updateService(
    {
      user: barberA,
      params: { id: service._id },
    body: { name: "Fresh Cut", price: 7000, duration: 45, active: false },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.name, "Fresh Cut");
  assert.equal(res.body.price, 7000);
  assert.equal(res.body.duration, 45);
  assert.equal(res.body.active, false);
});

test("barber can update service category and tags", async () => {
  const res = createResponse();
  const service = {
    _id: "service-a",
    barberId: barberA._id,
    name: "Cut",
    price: 5000,
    duration: 30,
    active: true,
    save: async function save() {
      return this;
    },
  };

  Service.findById = async () => service;

  await updateService(
    {
      user: barberA,
      params: { id: service._id },
      body: { category: "nails", tags: ["Gel", " manicure "] },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.category, "nails");
  assert.deepEqual(res.body.tags, ["gel", "manicure"]);
});

test("barber can update service to valid customCategoryId", async () => {
  const res = createResponse();
  const service = {
    _id: "service-a",
    barberId: barberA._id,
    name: "Cut",
    price: 5000,
    duration: 30,
    active: true,
    customCategoryId: null,
    save: async function save() {
      return this;
    },
  };

  Service.findById = async () => service;
  ServiceCategory.findById = async () => makeCustomCategory();

  await updateService(
    {
      user: barberA,
      params: { id: service._id },
      body: { customCategoryId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(String(res.body.customCategoryId), String(customCategoryId));
});

test("barber can clear service customCategoryId", async () => {
  const res = createResponse();
  const service = {
    _id: "service-a",
    barberId: barberA._id,
    name: "Cut",
    price: 5000,
    duration: 30,
    active: true,
    customCategoryId,
    save: async function save() {
      return this;
    },
  };

  Service.findById = async () => service;

  await updateService(
    {
      user: barberA,
      params: { id: service._id },
      body: { customCategoryId: null },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.customCategoryId, null);
});

test("barber can clear service customCategoryId with empty string", async () => {
  const res = createResponse();
  const service = {
    _id: "service-a",
    barberId: barberA._id,
    name: "Cut",
    price: 5000,
    duration: 30,
    active: true,
    customCategoryId,
    save: async function save() {
      return this;
    },
  };

  Service.findById = async () => service;

  await updateService(
    {
      user: barberA,
      params: { id: service._id },
      body: { customCategoryId: "" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.customCategoryId, null);
});

test("barber cannot update service to another owner's customCategoryId", async () => {
  const res = createResponse();
  const service = {
    _id: "service-a",
    barberId: barberA._id,
    name: "Cut",
    price: 5000,
    duration: 30,
    active: true,
    save: async function save() {
      throw new Error("save should not be called");
    },
  };

  Service.findById = async () => service;
  ServiceCategory.findById = async () => makeCustomCategory({ ownerId: barberB._id });

  await updateService(
    {
      user: barberA,
      params: { id: service._id },
      body: { customCategoryId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("update validates service fields when provided", async () => {
  const invalidBodies = [
    { name: " " },
    { price: "" },
    { price: null },
    { price: -1 },
    { duration: 0 },
    { active: "false" },
    { category: "trainer" },
    { tags: [42] },
  ];

  for (const body of invalidBodies) {
    const res = createResponse();

    Service.findById = async () => ({
      _id: "service-a",
      barberId: barberA._id,
      save: async () => {
        throw new Error("save should not be called");
      },
    });

    await updateService(
      {
        user: barberA,
        params: { id: "service-a" },
        body,
      },
      res
    );

    assert.equal(res.statusCode, 400);
  }
});

test("barber cannot update another barber's service", async () => {
  const res = createResponse();

  Service.findById = async () => ({
    _id: "service-a",
    barberId: barberB._id,
  });

  await updateService(
    {
      user: barberA,
      params: { id: "service-a" },
      body: { name: "Fresh Cut" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("barber cannot delete another barber's service", async () => {
  const res = createResponse();
  let deleteCalled = false;

  Service.findById = async () => ({
    _id: "service-a",
    barberId: barberB._id,
    deleteOne: async () => {
      deleteCalled = true;
    },
  });

  await deleteService(
    {
      user: barberA,
      params: { id: "service-a" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(deleteCalled, false);
});

test("barber can delete their own service", async () => {
  const res = createResponse();
  let deleteCalled = false;

  Service.findById = async () => ({
    _id: "service-a",
    barberId: barberA._id,
    deleteOne: async () => {
      deleteCalled = true;
    },
  });

  await deleteService(
    {
      user: barberA,
      params: { id: "service-a" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(deleteCalled, true);
});

test("client cannot create, update, or delete services", async () => {
  for (const handler of [createService, updateService, deleteService]) {
    const res = createResponse();

    await handler(
      {
        user: client,
        params: { id: "service-a" },
        body: { name: "Cut", price: 5000, duration: 30 },
      },
      res
    );

    assert.equal(res.statusCode, 403);
  }
});

test("fetching services by barber still works", async () => {
  const res = createResponse();
  const services = [{ _id: "service-a", barberId: barberA._id, name: "Cut" }];
  let findQuery;

  Service.find = (query) => {
    findQuery = query;
    return {
      populate() {
        return services;
      },
    };
  };

  await getServicesByBarber(
    {
      params: { barberId: barberA._id },
    },
    res
  );

  assert.deepEqual(findQuery, { barberId: barberA._id });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, services);
});

test("GET services by barber returns populated customCategoryId when service has one", async () => {
  const res = createResponse();
  const customCategory = {
    _id: customCategoryId,
    name: "Bridal Updo",
    ownerType: "barber",
    ownerId: barberA._id,
    active: true,
    sortOrder: 0,
  };
  const services = [
    {
      _id: "service-a",
      barberId: barberA._id,
      name: "Custom Service",
      category: "other",
      customCategoryId: customCategory,
    },
  ];

  Service.find = () => ({
    populate() {
      return services;
    },
  });

  await getServicesByBarber(
    {
      params: { barberId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].customCategoryId._id, customCategoryId);
  assert.equal(res.body[0].customCategoryId.name, "Bridal Updo");
});

test("GET services by barber returns null customCategoryId for system-category service", async () => {
  const res = createResponse();
  const services = [
    {
      _id: "service-b",
      barberId: barberA._id,
      name: "Basic Cut",
      category: "haircut",
      customCategoryId: null,
    },
  ];

  Service.find = () => ({
    populate() {
      return services;
    },
  });

  await getServicesByBarber(
    {
      params: { barberId: barberA._id },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].customCategoryId, null);
});
