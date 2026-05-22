import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createService,
  deleteService,
  getServicesByBarber,
  updateService,
} from "./serviceController.js";
import Service from "../models/Service.js";

const originalServiceMethods = {
  create: Service.create,
  find: Service.find,
  findById: Service.findById,
};

const barberA = { _id: "barber-a", role: "barber" };
const barberB = { _id: "barber-b", role: "barber" };
const client = { _id: "client-a", role: "client" };

afterEach(() => {
  Service.create = originalServiceMethods.create;
  Service.find = originalServiceMethods.find;
  Service.findById = originalServiceMethods.findById;
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

  Service.find = async (query) => {
    findQuery = query;
    return services;
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
