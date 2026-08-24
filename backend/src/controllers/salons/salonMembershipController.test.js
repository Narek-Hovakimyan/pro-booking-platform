import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Notification from "../../models/Notification.js";
import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import { __notificationServiceTestHooks } from "../../services/notification/notificationService.js";
import {
  cancelJoinRequestBySalon,
  decideJoinRequest,
  getOwnerJoinRequests,
  leaveSalon,
} from "./salonMembershipController.js";

const originalMethods = {
  mongooseStartSession: mongoose.startSession,
  notificationCreate: Notification.create,
  joinRequestFindById: SalonJoinRequest.findById,
  joinRequestFindOne: SalonJoinRequest.findOne,
  joinRequestFindOneAndUpdate: SalonJoinRequest.findOneAndUpdate,
  joinRequestUpdateMany: SalonJoinRequest.updateMany,
  userFindById: User.findById,
  salonFindById: Salon.findById,
  salonFind: Salon.find,
  joinRequestFind: SalonJoinRequest.find,
  seatFind: SubscriptionSeat.find,
};

const ownerId = "64b000000000000000000020";
const adminId = "64b000000000000000000021";
const barberId = "64b000000000000000000022";
const salonId = "64b000000000000000000011";
const requestId = "64b000000000000000000099";

afterEach(() => {
  mongoose.startSession = originalMethods.mongooseStartSession;
  Notification.create = originalMethods.notificationCreate;
  SalonJoinRequest.findById = originalMethods.joinRequestFindById;
  SalonJoinRequest.findOne = originalMethods.joinRequestFindOne;
  SalonJoinRequest.findOneAndUpdate = originalMethods.joinRequestFindOneAndUpdate;
  SalonJoinRequest.updateMany = originalMethods.joinRequestUpdateMany;
  User.findById = originalMethods.userFindById;
  Salon.findById = originalMethods.salonFindById;
  Salon.find = originalMethods.salonFind;
  SalonJoinRequest.find = originalMethods.joinRequestFind;
  SubscriptionSeat.find = originalMethods.seatFind;
  __notificationServiceTestHooks.resetGetIO();
});

const mockSession = () => {
  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      await callback();
    },
    async endSession() {},
  });
};

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

const createRequestDoc = ({ targetBarberId = barberId, admins = [] } = {}) => {
  const request = {
    _id: requestId,
    status: "pending",
    salonId: {
      _id: salonId,
      name: "Owner Salon",
      ownerId,
      admins,
    },
    barberId: {
      _id: targetBarberId,
      name: "Target Barber",
    },
    async save() {
      return request;
    },
    toObject() {
      return { ...request };
    },
  };

  return request;
};

const mockFindRequest = (request) => {
  mockSession();
  SalonJoinRequest.findById = (id) => {
    assert.equal(id, requestId);
    return {
      populate() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(request).then(resolve, reject);
      },
    };
  };
  SalonJoinRequest.findOneAndUpdate = (query, update) => {
    assert.equal(String(query._id), requestId);
    assert.equal(query.status, "pending");
    request.status = update.$set.status;
    return {
      populate() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(request).then(resolve, reject);
      },
    };
  };
};

test("owner can accept another barber join request", async () => {
  const request = createRequestDoc();
  const savedBarber = {
    _id: barberId,
    salons: [{ salon: salonId, status: "pending", isPrimary: false }],
    workHistory: [],
    async save() {
      return savedBarber;
    },
  };
  const notifications = [];

  mockFindRequest(request);
  User.findById = async (id) => {
    assert.equal(String(id), barberId);
    return savedBarber;
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };
  __notificationServiceTestHooks.setGetIO(() => null);

  const res = createResponse();
  await decideJoinRequest(
    {
      user: { _id: ownerId, role: "barber" },
      params: { requestId },
      body: { status: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(request.status, "accepted");
  assert.equal(savedBarber.salons[0].status, "approved");
  assert.equal(savedBarber.salons[0].isPrimary, true);
  assert.equal(notifications.length, 1);
});

test("admin can reject another barber join request", async () => {
  const request = createRequestDoc({ admins: [adminId] });
  const savedBarber = {
    _id: barberId,
    salons: [{ salon: salonId, status: "pending", isPrimary: false }],
    async save() {
      return savedBarber;
    },
  };

  mockFindRequest(request);
  User.findById = async () => savedBarber;
  Notification.create = async (payload) => payload;
  __notificationServiceTestHooks.setGetIO(() => null);

  const res = createResponse();
  await decideJoinRequest(
    {
      user: { _id: adminId, role: "barber" },
      params: { requestId },
      body: { status: "rejected" },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(request.status, "rejected");
  assert.equal(savedBarber.salons[0].status, "rejected");
});

test("owner self-approval is blocked", async () => {
  mockFindRequest(createRequestDoc({ targetBarberId: ownerId }));
  User.findById = () => {
    throw new Error("self decision should stop before fetching barber");
  };

  const res = createResponse();
  await decideJoinRequest(
    {
      user: { _id: ownerId, role: "barber" },
      params: { requestId },
      body: { status: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "You cannot manage your own join request");
});

test("admin self-rejection is blocked", async () => {
  mockFindRequest(createRequestDoc({ targetBarberId: adminId, admins: [adminId] }));
  User.findById = () => {
    throw new Error("self decision should stop before fetching barber");
  };

  const res = createResponse();
  await decideJoinRequest(
    {
      user: { _id: adminId, role: "barber" },
      params: { requestId },
      body: { status: "rejected" },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "You cannot manage your own join request");
});

test("former admin cannot approve or reject requests", async () => {
  mockFindRequest(createRequestDoc({ admins: [] }));

  for (const status of ["accepted", "rejected"]) {
    const res = createResponse();
    await decideJoinRequest(
      {
        user: { _id: adminId, role: "barber" },
        params: { requestId },
        body: { status },
      },
      res
    );
    assert.equal(res.statusCode, 403);
  }
});

test("transaction errors are bounded and do not send notifications", async () => {
  const request = createRequestDoc();
  const savedBarber = {
    _id: barberId,
    salons: [{ salon: salonId, status: "pending", isPrimary: false }],
    workHistory: [],
    async save() {
      return savedBarber;
    },
  };

  mockFindRequest(request);
  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      await callback();
      throw new Error("MongoServerError: transaction internals");
    },
    async endSession() {},
  });
  User.findById = async () => savedBarber;
  Notification.create = () => {
    throw new Error("notification must wait for commit");
  };

  const res = createResponse();
  await decideJoinRequest(
    {
      user: { _id: ownerId, role: "barber" },
      params: { requestId },
      body: { status: "accepted" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Could not update salon request");
});

test("cancel by salon validates malformed values before querying", async () => {
  SalonJoinRequest.findOne = () => {
    throw new Error("query must not run");
  };

  for (const invalidSalonId of [
    undefined,
    "not-an-id",
    [salonId],
    { $ne: salonId },
  ]) {
    const res = createResponse();
    await cancelJoinRequestBySalon(
      {
        user: { _id: barberId, role: "barber" },
        params: { salonId: invalidSalonId },
        body: { barberId: ownerId },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid salonId");
  }
});

test("cancel by salon uses the authenticated barber instead of request body identity", async () => {
  mockSession();
  let queryFilter;
  SalonJoinRequest.findOne = (query) => {
    queryFilter = query;
    return {
      sort() {
        return this;
      },
      session() {
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(null).then(resolve, reject);
      },
    };
  };

  const res = createResponse();
  await cancelJoinRequestBySalon(
    {
      user: { _id: ownerId, role: "barber" },
      params: { salonId },
      body: { barberId },
    },
    res
  );

  assert.deepEqual(queryFilter, { salonId, barberId: ownerId });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "Pending request not found" });
});

test("cancel by salon returns no request identifier", async () => {
  const request = {
    _id: requestId,
    barberId,
    salonId,
    status: "pending",
  };
  mockSession();
  SalonJoinRequest.findOne = () => ({
    sort() {
      return this;
    },
    session() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(request).then(resolve, reject);
    },
  });
  SalonJoinRequest.findOneAndUpdate = () => ({
    session() {
      return this;
    },
    then(resolve, reject) {
      request.status = "cancelled";
      return Promise.resolve(request).then(resolve, reject);
    },
  });

  const res = createResponse();
  await cancelJoinRequestBySalon(
    {
      user: { _id: barberId, role: "barber" },
      params: { salonId },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { salonStatus: "none" });
});

test("admin leaving removes salon authority and is idempotent", async () => {
  const salon = {
    _id: salonId,
    ownerId,
    admins: [adminId],
    name: "Owner Salon",
    async save() {
      return this;
    },
  };
  const barber = {
    _id: adminId,
    name: "Former Admin",
    role: "barber",
    salons: [{ salon: salonId, status: "approved", isPrimary: true }],
    salon: salonId,
    salonStatus: "approved",
    workHistory: [],
    async save() {
      return this;
    },
  };
  const acceptedRequest = { salonId, barberId: adminId, status: "accepted" };

  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      await callback();
    },
    async endSession() {},
  });
  Salon.findById = async () => salon;
  User.findById = async () => barber;
  SalonJoinRequest.updateMany = async (filter, update, options) => {
    assert.deepEqual(filter, { salonId, barberId: adminId, status: "accepted" });
    assert.equal(update.$set.status, "cancelled");
    assert.ok(options.session);
    acceptedRequest.status = update.$set.status;
    return { modifiedCount: 1 };
  };
  SubscriptionSeat.find = () => ({
    populate() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve([]).then(resolve, reject);
    },
  });
  Notification.create = async (payload) => payload;
  __notificationServiceTestHooks.setGetIO(() => null);

  const first = createResponse();
  const second = createResponse();
  await Promise.all([
    leaveSalon(
      { user: { _id: adminId, role: "barber" }, body: { salonId } },
      first
    ),
    leaveSalon(
      { user: { _id: adminId, role: "barber" }, body: { salonId } },
      second
    ),
  ]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.deepEqual(salon.admins, []);
  assert.equal(acceptedRequest.status, "cancelled");
});

test("leave does not save a removed membership when accepted-request invalidation fails", async () => {
  const salon = { _id: salonId, ownerId, admins: [], name: "Owner Salon" };
  let saved = false;
  const barber = {
    _id: barberId,
    role: "barber",
    salons: [{ salon: salonId, status: "approved", isPrimary: true }],
    salon: salonId,
    salonStatus: "approved",
    workHistory: [],
    async save() {
      saved = true;
      return this;
    },
  };

  mockSession();
  Salon.findById = async () => salon;
  User.findById = async () => barber;
  SalonJoinRequest.updateMany = async () => {
    throw new Error("join request invalidation failed");
  };

  const res = createResponse();
  await leaveSalon(
    { user: { _id: barberId, role: "barber" }, body: { salonId } },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(saved, false);
});

test("former admin cannot list requests or applicant contact data", async () => {
  Salon.find = async () => [];
  SalonJoinRequest.find = () => ({
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve([]).then(resolve, reject);
    },
  });
  const res = createResponse();

  await getOwnerJoinRequests(
    { user: { _id: adminId, role: "barber" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});
