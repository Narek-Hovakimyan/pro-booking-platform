import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { escapeRegex } from "../utils/controllerError.js";
import {
  closeSalonJob,
  createSalonJob,
  getSalonJobById,
  listMySalonJobs,
  listSalonJobs,
  updateSalonJob,
} from "./salons/salonJobController.js";
import Salon from "../models/Salon.js";
import SalonJobPost from "../models/SalonJobPost.js";

const ownerId = "64b000000000000000000001";
const adminId = "64b000000000000000000002";
const barberId = "64b000000000000000000003";
const clientId = "64b000000000000000000004";
const salonId = "64b000000000000000000010";
const otherSalonId = "64b000000000000000000011";
const jobId = "64b000000000000000000020";

const originalMethods = {
  salonFind: Salon.find,
  salonFindById: Salon.findById,
  jobCreate: SalonJobPost.create,
  jobFind: SalonJobPost.find,
  jobFindById: SalonJobPost.findById,
  jobFindOne: SalonJobPost.findOne,
};

afterEach(() => {
  Salon.find = originalMethods.salonFind;
  Salon.findById = originalMethods.salonFindById;
  SalonJobPost.create = originalMethods.jobCreate;
  SalonJobPost.find = originalMethods.jobFind;
  SalonJobPost.findById = originalMethods.jobFindById;
  SalonJobPost.findOne = originalMethods.jobFindOne;
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

const withSilencedConsoleError = async (task) => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await task();
  } finally {
    console.error = originalConsoleError;
  }
};

const createSalon = (overrides = {}) => ({
  _id: salonId,
  name: "Downtown Salon",
  city: "Yerevan",
  address: "Main 1",
  imageUrl: "/uploads/salons/salon.jpg",
  ownerId,
  admins: [adminId],
  ...overrides,
});

const createJob = (overrides = {}) => ({
  _id: jobId,
  salonId: createSalon(),
  createdBy: ownerId,
  title: "Looking for barber",
  role: "barber",
  customRole: "",
  employmentType: "full-time",
  salary: "",
  requirements: "",
  description: "",
  contactInfo: "",
  status: "active",
  createdAt: new Date("2099-01-01T10:00:00.000Z"),
  updatedAt: new Date("2099-01-01T10:00:00.000Z"),
  async save() {
    return this;
  },
  ...overrides,
});

const mockFindJobs = ({ expectedQuery, jobs }) => {
  SalonJobPost.find = (query) => {
    assert.deepEqual(query, expectedQuery);
    return {
      populate(path, select) {
        assert.equal(path, "salonId");
        assert.equal(select, "name city address imageUrl");
        return this;
      },
      sort(sortOptions) {
        assert.deepEqual(sortOptions, { createdAt: -1 });
        return this;
      },
      limit(limit) {
        assert.equal(limit, 50);
        return jobs;
      },
    };
  };
};

const mockFindOneJob = ({ expectedQuery, job }) => {
  SalonJobPost.findOne = (query) => {
    assert.deepEqual(query, expectedQuery);
    return {
      populate(path, select) {
        assert.equal(path, "salonId");
        assert.equal(select, "name city address imageUrl");
        return job;
      },
    };
  };
};

test("owner can create job", async () => {
  const res = createResponse();
  const salon = createSalon();
  let createdPayload = null;

  Salon.findById = async () => salon;
  SalonJobPost.create = async (payload) => {
    createdPayload = payload;
    return createJob({ ...payload, _id: jobId });
  };

  await createSalonJob(
    {
      user: { _id: ownerId, role: "barber" },
      body: {
        salonId,
        title: "Looking for nail artist",
        role: "nail-artist",
        salary: "Commission",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.salonId, salonId);
  assert.equal(createdPayload.createdBy, ownerId);
  assert.equal(createdPayload.status, "active");
  assert.equal(res.body.title, "Looking for nail artist");
  assert.equal(res.body.salon.name, "Downtown Salon");
});

test("salon admin can create job", async () => {
  const res = createResponse();

  Salon.findById = async () => createSalon();
  SalonJobPost.create = async (payload) => createJob({ ...payload, _id: jobId });

  await createSalonJob(
    {
      user: { _id: adminId, role: "barber" },
      body: { salonId, title: "Looking for receptionist", role: "receptionist" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.role, "receptionist");
});

test("regular barber cannot create", async () => {
  const res = createResponse();
  let createCalled = false;

  Salon.findById = async () => createSalon();
  SalonJobPost.create = async () => {
    createCalled = true;
    return null;
  };

  await createSalonJob(
    {
      user: { _id: barberId, role: "barber" },
      body: { salonId, title: "Looking for barber", role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createCalled, false);
});

test("client cannot create", async () => {
  const res = createResponse();

  Salon.findById = async () => createSalon();

  await createSalonJob(
    {
      user: { _id: clientId, role: "client" },
      body: { salonId, title: "Looking for hairdresser", role: "hairdresser" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("public list returns only active jobs", async () => {
  const res = createResponse();
  const activeJob = createJob();

  mockFindJobs({
    expectedQuery: { status: "active" },
    jobs: [activeJob],
  });

  await listSalonJobs({ query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].status, "active");
});

test("listSalonJobs unexpected error returns generic 500 without leaking raw message", async () => {
  const res = createResponse();

  SalonJobPost.find = () => {
    throw new Error("raw salon job db failure");
  };

  await withSilencedConsoleError(async () => {
    await listSalonJobs({ query: {} }, res);
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch salon job posts");
  assert.equal(res.body.message.includes("raw salon job db failure"), false);
});

test("list filters by role", async () => {
  const res = createResponse();

  mockFindJobs({
    expectedQuery: { status: "active", role: "nail-artist" },
    jobs: [createJob({ role: "nail-artist" })],
  });

  await listSalonJobs({ query: { role: "nail-artist" } }, res);

  assert.equal(res.body[0].role, "nail-artist");
});

test("list filters by salonId", async () => {
  const res = createResponse();

  mockFindJobs({
    expectedQuery: { status: "active", salonId },
    jobs: [createJob()],
  });

  await listSalonJobs({ query: { salonId } }, res);

  assert.equal(res.body[0].salon.id, salonId);
});

test("list filters by city with escaped regex", async () => {
  const res = createResponse();
  let salonFindQuery = null;

  Salon.find = (query) => {
    salonFindQuery = query;
    return {
      select: async () => [{ _id: salonId }],
    };
  };
  mockFindJobs({
    expectedQuery: { status: "active", salonId: { $in: [salonId] } },
    jobs: [createJob()],
  });

  await listSalonJobs({ query: { city: "yer" } }, res);

  assert.deepEqual(salonFindQuery, {
    city: { $regex: escapeRegex("yer"), $options: "i" },
  });
  assert.equal(res.body.length, 1);
});

test("list treats regex metacharacters in city as literal text", async () => {
  const res = createResponse();
  let salonFindQuery = null;

  Salon.find = (query) => {
    salonFindQuery = query;
    return {
      select: async () => [{ _id: salonId }],
    };
  };
  mockFindJobs({
    expectedQuery: { status: "active", salonId: { $in: [salonId] } },
    jobs: [createJob()],
  });

  await listSalonJobs({ query: { city: "Yerevan." } }, res);

  assert.deepEqual(salonFindQuery, {
    city: { $regex: escapeRegex("Yerevan."), $options: "i" },
  });
  // The dot is escaped, so it matches literal "." not any char
  assert.notEqual(salonFindQuery.city.$regex, "Yerevan.");
  assert.equal(salonFindQuery.city.$regex.includes("\\."), true);
  assert.equal(res.body.length, 1);
});

test("list rejects city longer than 100 chars with 400", async () => {
  const res = createResponse();
  const longCity = "a".repeat(101);

  await listSalonJobs({ query: { city: longCity } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Search term is too long");
});

test("list with empty/whitespace city does not add city filter", async () => {
  const res = createResponse();

  mockFindJobs({
    expectedQuery: { status: "active" },
    jobs: [createJob()],
  });

  await listSalonJobs({ query: { city: "   " } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
});

test("list combines city and salonId filters", async () => {
  const res = createResponse();

  Salon.find = () => ({
    select: async () => [{ _id: salonId }, { _id: otherSalonId }],
  });
  mockFindJobs({
    expectedQuery: { status: "active", salonId: { $in: [salonId] } },
    jobs: [createJob()],
  });

  await listSalonJobs({ query: { city: "yer", salonId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
});

test("list with city filter also respects role filter", async () => {
  const res = createResponse();

  Salon.find = () => ({
    select: async () => [{ _id: salonId }],
  });
  mockFindJobs({
    expectedQuery: { status: "active", role: "barber", salonId: { $in: [salonId] } },
    jobs: [createJob()],
  });

  await listSalonJobs({ query: { city: "yerevan", role: "barber" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
});

test("get active job by id works", async () => {
  const res = createResponse();

  mockFindOneJob({
    expectedQuery: { _id: jobId, status: "active" },
    job: createJob(),
  });

  await getSalonJobById({ params: { id: jobId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, jobId);
});

test("get closed job returns 404", async () => {
  const res = createResponse();

  mockFindOneJob({
    expectedQuery: { _id: jobId, status: "active" },
    job: null,
  });

  await getSalonJobById({ params: { id: jobId } }, res);

  assert.equal(res.statusCode, 404);
});

test("owner/admin can update", async () => {
  const res = createResponse();
  const job = createJob({ salonId });

  SalonJobPost.findById = async () => job;
  Salon.findById = async () => createSalon();
  mockFindOneJob({
    expectedQuery: { _id: jobId },
    job: createJob({ title: "Updated title" }),
  });

  await updateSalonJob(
    {
      user: { _id: ownerId, role: "barber" },
      params: { id: jobId },
      body: { title: "Updated title", salary: "High commission" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(job.title, "Updated title");
  assert.equal(job.salary, "High commission");
  assert.equal(res.body.title, "Updated title");
});

test("cannot change salonId/createdBy by update", async () => {
  const res = createResponse();
  const job = createJob({ salonId, createdBy: ownerId });

  SalonJobPost.findById = async () => job;
  Salon.findById = async () => createSalon();
  mockFindOneJob({
    expectedQuery: { _id: jobId },
    job,
  });

  await updateSalonJob(
    {
      user: { _id: ownerId, role: "barber" },
      params: { id: jobId },
      body: {
        salonId: otherSalonId,
        createdBy: clientId,
        title: "Still editable",
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(job.salonId, salonId);
  assert.equal(job.createdBy, ownerId);
  assert.equal(job.title, "Still editable");
});

test("non-owner cannot update", async () => {
  const res = createResponse();
  const job = createJob({ salonId });

  SalonJobPost.findById = async () => job;
  Salon.findById = async () => createSalon();

  await updateSalonJob(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: jobId },
      body: { title: "Nope" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(job.title, "Looking for barber");
});

test("owner/admin can close", async () => {
  const res = createResponse();
  const job = createJob({ salonId });

  SalonJobPost.findById = async () => job;
  Salon.findById = async () => createSalon();
  mockFindOneJob({
    expectedQuery: { _id: jobId },
    job,
  });

  await closeSalonJob(
    {
      user: { _id: adminId, role: "barber" },
      params: { id: jobId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(job.status, "closed");
});

test("non-owner cannot close", async () => {
  const res = createResponse();
  const job = createJob({ salonId });

  SalonJobPost.findById = async () => job;
  Salon.findById = async () => createSalon();

  await closeSalonJob(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: jobId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(job.status, "active");
});

test("/mine returns jobs for owned/admin salons", async () => {
  const res = createResponse();
  let salonQuery = null;

  Salon.find = (query) => {
    salonQuery = query;
    return {
      select: async () => [{ _id: salonId }, { _id: otherSalonId }],
    };
  };
  SalonJobPost.find = (query) => {
    assert.deepEqual(query, { salonId: { $in: [salonId, otherSalonId] } });
    return {
      populate(path, select) {
        assert.equal(path, "salonId");
        assert.equal(select, "name city address imageUrl");
        return this;
      },
      sort(sortOptions) {
        assert.deepEqual(sortOptions, { createdAt: -1 });
        return [createJob(), createJob({ _id: "job-2", salonId: createSalon({ _id: otherSalonId }) })];
      },
    };
  };

  await listMySalonJobs({ user: { _id: ownerId, role: "barber" } }, res);

  assert.deepEqual(salonQuery, {
    $or: [{ ownerId }, { admins: ownerId }],
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
});
