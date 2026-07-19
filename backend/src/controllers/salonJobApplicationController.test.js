import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  applyToSalonJob,
  listJobApplications,
  listManagedSalonJobApplications,
  listMySalonJobApplications,
  updateSalonJobApplicationStatus,
} from "./salons/salonJobApplicationController.js";
import Salon from "../models/Salon.js";
import SalonJobApplication from "../models/SalonJobApplication.js";
import SalonJobPost from "../models/SalonJobPost.js";
import Notification from "../models/Notification.js";

const ownerId = "64b000000000000000000001";
const adminId = "64b000000000000000000002";
const barberId = "64b000000000000000000003";
const clientId = "64b000000000000000000004";
const otherBarberId = "64b000000000000000000005";
const unrelatedUserId = "64b000000000000000000006";
const salonId = "64b000000000000000000010";
const otherSalonId = "64b000000000000000000011";
const jobId = "64b000000000000000000020";
const applicationId = "64b000000000000000000030";

const originalMethods = {
  salonFind: Salon.find,
  salonFindById: Salon.findById,
  jobFindById: SalonJobPost.findById,
  applicationFind: SalonJobApplication.find,
  applicationFindById: SalonJobApplication.findById,
  applicationFindOne: SalonJobApplication.findOne,
  applicationCreate: SalonJobApplication.create,
  notificationCreate: Notification.create,
  consoleWarn: console.warn,
};

afterEach(() => {
  Salon.find = originalMethods.salonFind;
  Salon.findById = originalMethods.salonFindById;
  SalonJobPost.findById = originalMethods.jobFindById;
  SalonJobApplication.find = originalMethods.applicationFind;
  SalonJobApplication.findById = originalMethods.applicationFindById;
  SalonJobApplication.findOne = originalMethods.applicationFindOne;
  SalonJobApplication.create = originalMethods.applicationCreate;
  Notification.create = originalMethods.notificationCreate;
  console.warn = originalMethods.consoleWarn;
});

/* ── Helpers ── */

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

const createActiveJob = (overrides = {}) => ({
  _id: jobId,
  salonId,
  createdBy: ownerId,
  title: "Looking for barber",
  role: "barber",
  status: "active",
  ...overrides,
});

const createClosedJob = (overrides = {}) => ({
  _id: jobId,
  salonId,
  createdBy: ownerId,
  title: "Looking for barber",
  role: "barber",
  status: "closed",
  ...overrides,
});

const createBarberUser = (overrides = {}) => ({
  _id: barberId,
  role: "barber",
  phone: "+37499000000",
  ...overrides,
});

/**
 * Populate the application object in-place (simulating what Mongoose populate does).
 * This is used before serialization so the serializer sees populated refs.
 */
const mockPopulateApplication = (application) => {
  const app = { ...application };

  if (app.applicantId && typeof app.applicantId === "string") {
    app.applicantId = {
      _id: app.applicantId,
      name: "Test Barber",
      phone: "+37499000000",
      avatarUrl: "",
      city: "Yerevan",
    };
  }

  if (app.salonId && typeof app.salonId === "string") {
    app.salonId = createSalon();
  }

  if (app.jobId && typeof app.jobId === "string") {
    app.jobId = createActiveJob();
  }

  return app;
};

/**
 * Helper: returns a populate-ready thenable query object that resolves to the given result.
 */
const mockQuery = (result) => {
  const query = {
    populate() {
      return query;
    },
    sort() {
      return query;
    },
    limit() {
      return query;
    },
    then(resolve) {
      return Promise.resolve(result).then(resolve);
    },
    catch() {
      return query;
    },
  };

  return query;
};

/**
 * Helper: returns a query that chains populate/sort and resolves to an array of results.
 */
const mockArrayQuery = (results) => {
  const q = {
    populate() {
      return q;
    },
    sort() {
      return q;
    },
    limit() {
      return q;
    },
    then(resolve) {
      return Promise.resolve(results).then(resolve);
    },
  };

  return q;
};

const createApplication = (overrides = {}) => ({
  _id: applicationId,
  jobId,
  salonId,
  applicantId: barberId,
  message: "I am interested in this position",
  experience: "5 years of experience",
  contactInfo: "+37499000000",
  status: "pending",
  reviewedAt: null,
  acceptedAt: null,
  rejectedAt: null,
  statusUpdatedBy: null,
  createdAt: new Date("2099-01-01T10:00:00.000Z"),
  updatedAt: new Date("2099-01-01T10:00:00.000Z"),
  async save() {
    return this;
  },
  ...overrides,
});

/* ── applyToSalonJob ── */

test("barber can apply to active job", async () => {
  const res = createResponse();
  let createdPayload = null;

  SalonJobPost.findById = async () => createActiveJob();
  SalonJobApplication.findOne = async () => null;
  SalonJobApplication.create = async (payload) => {
    createdPayload = payload;
    return createApplication({ ...payload, _id: applicationId });
  };
  Salon.findById = async () => createSalon();
  Notification.create = async (payload) => payload;
  // CRITICAL: NOT async — must return a raw thenable so applyApplicantPopulate
  // can chain .populate() on it before await
  SalonJobApplication.findById = () => mockQuery(mockPopulateApplication(createApplication({ _id: applicationId })));

  await applyToSalonJob(
    {
      user: createBarberUser(),
      params: { id: jobId },
      body: {
        message: "I am interested",
        experience: "3 years",
        contactInfo: "+37499000001",
      },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.jobId, jobId);
  assert.equal(createdPayload.salonId, salonId);
  assert.equal(createdPayload.applicantId, barberId);
  assert.equal(createdPayload.message, "I am interested");
  assert.equal(createdPayload.experience, "3 years");
  assert.equal(createdPayload.contactInfo, "+37499000001");
  assert.equal(res.body.id, applicationId);
});

test("applying to a job notifies salon owner with application metadata", async () => {
  const res = createResponse();
  const notifications = [];

  SalonJobPost.findById = async () => createActiveJob();
  Salon.findById = async () => createSalon({ admins: [] });
  SalonJobApplication.findOne = async () => null;
  SalonJobApplication.create = async (payload) =>
    createApplication({ ...payload, _id: applicationId });
  SalonJobApplication.findById = () => mockQuery(mockPopulateApplication(createApplication({ _id: applicationId })));
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await applyToSalonJob(
    {
      user: createBarberUser({ name: "Test Barber" }),
      params: { id: jobId },
      body: { message: "I am interested" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(notifications, [
    {
      userId: ownerId,
      type: "salon_job_application_submitted",
      message: "Test Barber applied to Looking for barber",
      data: {
        jobApplicationId: applicationId,
        jobId,
        salonId,
      },
    },
  ]);
});

test("applying to a job notifies salon admins", async () => {
  const res = createResponse();
  const notifications = [];

  SalonJobPost.findById = async () => createActiveJob();
  Salon.findById = async () => createSalon();
  SalonJobApplication.findOne = async () => null;
  SalonJobApplication.create = async (payload) =>
    createApplication({ ...payload, _id: applicationId });
  SalonJobApplication.findById = () => mockQuery(mockPopulateApplication(createApplication({ _id: applicationId })));
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await applyToSalonJob(
    {
      user: createBarberUser({ name: "Test Barber" }),
      params: { id: jobId },
      body: { message: "I am interested" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(
    notifications.map((notification) => notification.userId).sort(),
    [adminId, ownerId].sort()
  );
  assert.ok(
    notifications.every(
      (notification) =>
        notification.type === "salon_job_application_submitted" &&
        notification.data.jobApplicationId === applicationId &&
        notification.data.jobId === jobId &&
        notification.data.salonId === salonId
    )
  );
});

test("applying to a job notifies distinct job creator", async () => {
  const res = createResponse();
  const notifications = [];

  SalonJobPost.findById = async () =>
    createActiveJob({ createdBy: otherBarberId });
  Salon.findById = async () => createSalon({ admins: [] });
  SalonJobApplication.findOne = async () => null;
  SalonJobApplication.create = async (payload) =>
    createApplication({ ...payload, _id: applicationId });
  SalonJobApplication.findById = () => mockQuery(mockPopulateApplication(createApplication({ _id: applicationId })));
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await applyToSalonJob(
    {
      user: createBarberUser({ name: "Test Barber" }),
      params: { id: jobId },
      body: { message: "I am interested" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(
    notifications.map((notification) => notification.userId).sort(),
    [otherBarberId, ownerId].sort()
  );
});

test("application submitted notification dedupes manager recipients", async () => {
  const res = createResponse();
  const notifications = [];

  SalonJobPost.findById = async () =>
    createActiveJob({ createdBy: ownerId });
  Salon.findById = async () => createSalon({ admins: [ownerId] });
  SalonJobApplication.findOne = async () => null;
  SalonJobApplication.create = async (payload) =>
    createApplication({ ...payload, _id: applicationId });
  SalonJobApplication.findById = () => mockQuery(mockPopulateApplication(createApplication({ _id: applicationId })));
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await applyToSalonJob(
    {
      user: createBarberUser({ name: "Test Barber" }),
      params: { id: jobId },
      body: { message: "I am interested" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(
    notifications.map((notification) => notification.userId),
    [ownerId]
  );
});

test("application submitted notification skips applicant recipient", async () => {
  const res = createResponse();
  const notifications = [];

  SalonJobPost.findById = async () =>
    createActiveJob({ createdBy: barberId });
  Salon.findById = async () =>
    createSalon({ ownerId: barberId, admins: [barberId] });
  SalonJobApplication.findOne = async () => null;
  SalonJobApplication.create = async (payload) =>
    createApplication({ ...payload, _id: applicationId });
  SalonJobApplication.findById = () => mockQuery(mockPopulateApplication(createApplication({ _id: applicationId })));
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  await applyToSalonJob(
    {
      user: createBarberUser({ name: "Test Barber" }),
      params: { id: jobId },
      body: { message: "I am interested" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(notifications, []);
});

test("client cannot apply", async () => {
  const res = createResponse();
  let createCalled = false;

  SalonJobPost.findById = async () => createActiveJob();
  SalonJobApplication.create = async () => {
    createCalled = true;
    return null;
  };

  await applyToSalonJob(
    {
      user: { _id: clientId, role: "client" },
      params: { id: jobId },
      body: { message: "I want this job" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(createCalled, false);
});

test("closed job cannot receive application", async () => {
  const res = createResponse();

  SalonJobPost.findById = async () => createClosedJob();

  await applyToSalonJob(
    {
      user: createBarberUser(),
      params: { id: jobId },
      body: { message: "I want this job" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    "This job post is no longer accepting applications"
  );
});

test("duplicate application returns 409", async () => {
  const res = createResponse();
  let createCalled = false;

  SalonJobPost.findById = async () => createActiveJob();
  SalonJobApplication.findOne = async () => createApplication();
  SalonJobApplication.create = async () => {
    createCalled = true;
    return null;
  };

  await applyToSalonJob(
    {
      user: createBarberUser(),
      params: { id: jobId },
      body: { message: "I want this job" },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "You already applied to this job");
  assert.equal(createCalled, false);
});

test("duplicate key error maps to 409", async () => {
  const res = createResponse();

  SalonJobPost.findById = async () => createActiveJob();
  SalonJobApplication.findOne = async () => null;
  SalonJobApplication.create = async () => {
    const error = new Error("Duplicate key");
    error.code = 11000;
    throw error;
  };

  await applyToSalonJob(
    {
      user: createBarberUser(),
      params: { id: jobId },
      body: { message: "I want this job" },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.message, "You already applied to this job");
});

test("application falls back to user phone for contactInfo", async () => {
  const res = createResponse();
  let createdPayload = null;

  SalonJobPost.findById = async () => createActiveJob();
  SalonJobApplication.findOne = async () => null;
  SalonJobApplication.create = async (payload) => {
    createdPayload = payload;
    return createApplication({ ...payload, _id: applicationId });
  };
  Salon.findById = async () => createSalon();
  Notification.create = async (payload) => payload;
  SalonJobApplication.findById = () => mockQuery(mockPopulateApplication(createApplication({ _id: applicationId })));

  await applyToSalonJob(
    {
      user: createBarberUser(),
      params: { id: jobId },
      body: { message: "I am interested" },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createdPayload.contactInfo, "+37499000000");
});

test("missing message returns 400", async () => {
  const res = createResponse();

  // Must mock SalonJobPost.findById to avoid real DB call
  // But the controller checks message before calling findById?
  // No — it checks role first, then finds job by id, then checks message.
  // So we need the job mock, and the findOne mock too (it's needed before message check? No, message check is before findOne)
  SalonJobPost.findById = async () => createActiveJob();

  await applyToSalonJob(
    {
      user: createBarberUser(),
      params: { id: jobId },
      body: {},
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Message is required");
});

/* ── listJobApplications ── */

test("owner can list applications for a job", async () => {
  const res = createResponse();

  SalonJobPost.findById = async () => createActiveJob();
  Salon.findById = async () => createSalon();

  const raw = createApplication({ _id: applicationId });
  const populated = mockPopulateApplication(raw);

  SalonJobApplication.find = () => mockArrayQuery([populated]);

  await listJobApplications(
    {
      user: { _id: ownerId, role: "barber" },
      params: { id: jobId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, applicationId);
  assert.equal(res.body[0].applicant.name, "Test Barber");
});

test("admin can list applications for a job", async () => {
  const res = createResponse();

  SalonJobPost.findById = async () => createActiveJob();
  Salon.findById = async () => createSalon();

  const raw = createApplication({ _id: applicationId });
  const populated = mockPopulateApplication(raw);

  SalonJobApplication.find = () => mockArrayQuery([populated]);

  await listJobApplications(
    {
      user: { _id: adminId, role: "barber" },
      params: { id: jobId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
});

test("regular barber cannot list applications", async () => {
  const res = createResponse();

  SalonJobPost.findById = async () => createActiveJob();
  // Return a salon the barber does NOT own/admin
  Salon.findById = async () => createSalon();

  await listJobApplications(
    {
      user: { _id: barberId, role: "barber" },
      params: { id: jobId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

test("client cannot list applications for a job if not owner/admin", async () => {
  const res = createResponse();
  let salonLookupCalled = false;
  let applicationsLookupCalled = false;

  SalonJobPost.findById = async () => createActiveJob();
  Salon.findById = async () => {
    salonLookupCalled = true;
    return createSalon();
  };
  SalonJobApplication.find = () => {
    applicationsLookupCalled = true;
    return mockArrayQuery([]);
  };

  await listJobApplications(
    {
      user: { _id: clientId, role: "client" },
      params: { id: jobId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(salonLookupCalled, false);
  assert.equal(applicationsLookupCalled, false);
});

test("unrelated owner/admin cannot list applications", async () => {
  const res = createResponse();

  SalonJobPost.findById = async () => createActiveJob();
  // Return the same salon (same _id), but with ownerId set to someone else
  // so the unrelatedOwnerId user cannot manage it
  Salon.findById = async () =>
    createSalon({ ownerId: unrelatedUserId, admins: [] });

  await listJobApplications(
    {
      user: { _id: otherBarberId, role: "barber" },
      params: { id: jobId },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

/* ── listMySalonJobApplications ── */

test("barber can list own submissions", async () => {
  const res = createResponse();

  const raw = createApplication({ _id: applicationId });
  const populated = mockPopulateApplication(raw);

  SalonJobApplication.find = () => mockArrayQuery([populated]);

  await listMySalonJobApplications(
    {
      user: { _id: barberId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].applicant.name, "Test Barber");
});

test("client cannot list own submissions", async () => {
  const res = createResponse();

  await listMySalonJobApplications(
    {
      user: { _id: clientId, role: "client" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
});

/* ── listManagedSalonJobApplications ── */

test("owner can list managed applications", async () => {
  const res = createResponse();
  let salonQuery = null;

  Salon.find = (query) => {
    salonQuery = query;
    return {
      select: async () => [{ _id: salonId }],
    };
  };

  const raw = createApplication({ _id: applicationId });
  const populated = mockPopulateApplication(raw);

  SalonJobApplication.find = (query) => {
    assert.deepEqual(query, { salonId: { $in: [salonId] } });
    return mockArrayQuery([populated]);
  };

  await listManagedSalonJobApplications(
    {
      user: { _id: ownerId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.deepEqual(salonQuery, {
    $or: [{ ownerId }, { admins: ownerId }],
  });
});

test("client cannot list managed applications", async () => {
  const res = createResponse();
  let salonLookupCalled = false;
  let applicationsLookupCalled = false;

  Salon.find = () => {
    salonLookupCalled = true;
    return {
      select: async () => [{ _id: salonId }],
    };
  };
  SalonJobApplication.find = () => {
    applicationsLookupCalled = true;
    return mockArrayQuery([]);
  };

  await listManagedSalonJobApplications(
    {
      user: { _id: ownerId, role: "client" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(salonLookupCalled, false);
  assert.equal(applicationsLookupCalled, false);
});

test("user with no manageable salons gets empty array", async () => {
  const res = createResponse();

  Salon.find = () => ({
    select: async () => [],
  });

  await listManagedSalonJobApplications(
    {
      user: { _id: barberId, role: "barber" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

/* ── updateSalonJobApplicationStatus ── */

const setupStatusUpdateTest = ({ initialStatus, newStatus }) => {
  const res = createResponse();
  const app = createApplication({ status: initialStatus });

  SalonJobApplication.findById = async () => app;
  Salon.findById = async () => createSalon();

  // After save(), re-fetch with populate
  const save = app.save.bind(app);

  app.save = async function () {
    await save.call(this);
    this.status = newStatus;
    this.statusUpdatedBy = ownerId;
    return this;
  };

  return { res, app };
};

const mockStatusUpdateDependencies = (app = createApplication()) => {
  let findByIdCalls = 0;

  SalonJobApplication.findById = () => {
    findByIdCalls++;
    const result = findByIdCalls === 1
      ? app
      : mockPopulateApplication(app);

    return mockQuery(result);
  };
  Salon.findById = async () => createSalon();

  return app;
};

test("owner can update to reviewed", async () => {
  const res = createResponse();
  const app = createApplication();
  let callCount = 0;

  SalonJobApplication.findById = () => {
    callCount++;
    const raw = callCount === 1
      ? app
      : { ...app, status: "reviewed", statusUpdatedBy: ownerId, reviewedAt: new Date() };
    return mockQuery(mockPopulateApplication(raw));
  };
  Salon.findById = async () => createSalon();
  Notification.create = async (payload) => payload;

  await updateSalonJobApplicationStatus(
    {
      user: { _id: ownerId, role: "barber" },
      params: { applicationId },
      body: { status: "reviewed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "reviewed");
  assert.equal(res.body.statusUpdatedBy, ownerId);
});

test("status update creates notification for applicant", async () => {
  const res = createResponse();
  const app = mockStatusUpdateDependencies();
  let notificationPayload = null;

  Notification.create = async (payload) => {
    notificationPayload = payload;
    return payload;
  };

  await updateSalonJobApplicationStatus(
    {
      user: { _id: ownerId, role: "barber" },
      params: { applicationId },
      body: { status: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(app.status, "accepted");
  assert.deepEqual(notificationPayload, {
    userId: barberId,
    type: "salon_job_application_status",
    message: "Your job application was accepted.",
    data: {
      jobApplicationId: applicationId,
      jobId,
      salonId,
    },
  });
});

for (const [status, message] of [
  ["reviewed", "Your job application was reviewed."],
  ["accepted", "Your job application was accepted."],
  ["rejected", "Your job application was rejected."],
]) {
  test(`${status} status notification message is correct`, async () => {
    const res = createResponse();
    mockStatusUpdateDependencies();
    let notificationPayload = null;

    Notification.create = async (payload) => {
      notificationPayload = payload;
      return payload;
    };

    await updateSalonJobApplicationStatus(
      {
        user: { _id: ownerId, role: "barber" },
        params: { applicationId },
        body: { status },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(notificationPayload.message, message);
  });
}

test("unauthorized status update does not create notification", async () => {
  const res = createResponse();
  const app = createApplication();
  let notificationCreated = false;

  SalonJobApplication.findById = async () => app;
  Salon.findById = async () => createSalon();
  Notification.create = async () => {
    notificationCreated = true;
    return null;
  };

  await updateSalonJobApplicationStatus(
    {
      user: { _id: barberId, role: "barber" },
      params: { applicationId },
      body: { status: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(notificationCreated, false);
});

test("notification failure does not undo status update", async () => {
  const res = createResponse();
  const app = mockStatusUpdateDependencies();

  Notification.create = async () => {
    throw new Error("Notification failed");
  };
  console.warn = () => {};

  await updateSalonJobApplicationStatus(
    {
      user: { _id: ownerId, role: "barber" },
      params: { applicationId },
      body: { status: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(app.status, "accepted");
  assert.equal(res.body.status, "accepted");
});

test("same status update does not create notification", async () => {
  const res = createResponse();
  mockStatusUpdateDependencies(createApplication({ status: "reviewed" }));
  let notificationCreated = false;

  Notification.create = async () => {
    notificationCreated = true;
    return null;
  };

  await updateSalonJobApplicationStatus(
    {
      user: { _id: ownerId, role: "barber" },
      params: { applicationId },
      body: { status: "reviewed" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(notificationCreated, false);
});

test("owner can update to accepted", async () => {
  const res = createResponse();
  const app = createApplication();
  let callCount = 0;

  SalonJobApplication.findById = () => {
    callCount++;
    const raw = callCount === 1
      ? app
      : { ...app, status: "accepted", statusUpdatedBy: ownerId, acceptedAt: new Date() };
    return mockQuery(mockPopulateApplication(raw));
  };
  Salon.findById = async () => createSalon();
  Notification.create = async (payload) => payload;

  await updateSalonJobApplicationStatus(
    {
      user: { _id: ownerId, role: "barber" },
      params: { applicationId },
      body: { status: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "accepted");
});

test("owner can update to rejected", async () => {
  const res = createResponse();
  const app = createApplication();
  let callCount = 0;

  SalonJobApplication.findById = () => {
    callCount++;
    const raw = callCount === 1
      ? app
      : { ...app, status: "rejected", statusUpdatedBy: ownerId, rejectedAt: new Date() };
    return mockQuery(mockPopulateApplication(raw));
  };
  Salon.findById = async () => createSalon();
  Notification.create = async (payload) => payload;

  await updateSalonJobApplicationStatus(
    {
      user: { _id: ownerId, role: "barber" },
      params: { applicationId },
      body: { status: "rejected" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "rejected");
});

test("regular barber cannot update status", async () => {
  const res = createResponse();
  const app = createApplication();

  SalonJobApplication.findById = async () => app;
  // Return a salon the barber cannot manage
  Salon.findById = async () => createSalon();

  await updateSalonJobApplicationStatus(
    {
      user: { _id: barberId, role: "barber" },
      params: { applicationId },
      body: { status: "reviewed" },
    },
    res
  );

  // requireManageSalon sends 403 when canUserManageSalon returns false
  assert.equal(res.statusCode, 403);
});

test("client cannot update application status", async () => {
  const res = createResponse();
  const app = createApplication();
  let salonLookupCalled = false;
  let saveCalled = false;

  app.save = async () => {
    saveCalled = true;
    return app;
  };
  SalonJobApplication.findById = async () => app;
  Salon.findById = async () => {
    salonLookupCalled = true;
    return createSalon();
  };

  await updateSalonJobApplicationStatus(
    {
      user: { _id: ownerId, role: "client" },
      params: { applicationId },
      body: { status: "reviewed" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(salonLookupCalled, false);
  assert.equal(saveCalled, false);
});

test("invalid status is rejected", async () => {
  const res = createResponse();
  const app = createApplication();

  SalonJobApplication.findById = async () => app;
  Salon.findById = async () => createSalon();

  await updateSalonJobApplicationStatus(
    {
      user: { _id: ownerId, role: "barber" },
      params: { applicationId },
      body: { status: "invalid-status" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
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

test("listMySalonJobApplications unexpected error returns 500 generic without leaking raw message", async () => {
  const res = createResponse();

  SalonJobApplication.find = () => {
    throw new Error("secret job applications db path");
  };

  await withSilencedConsoleError(async () => {
    await listMySalonJobApplications(
      { user: { _id: barberId, role: "barber" } },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Could not fetch your applications");
});
