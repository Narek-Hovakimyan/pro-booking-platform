import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";
import {
  cancelSalonJoinRequestBySalonLifecycle,
  cancelSalonJoinRequestLifecycle,
  decideSalonJoinRequestLifecycle,
  requestSalonJoinLifecycle,
} from "./salonJoinRequestLifecycleService.js";

const originalMethods = {
  startSession: mongoose.startSession,
  salonFindById: Salon.findById,
  requestFindById: SalonJoinRequest.findById,
  requestFindOne: SalonJoinRequest.findOne,
  requestFindOneAndUpdate: SalonJoinRequest.findOneAndUpdate,
  requestCreate: SalonJoinRequest.create,
  userFindById: User.findById,
};

const ownerId = "64b100000000000000000001";
const adminId = "64b100000000000000000002";
const barberId = "64b100000000000000000003";
const otherBarberId = "64b100000000000000000004";
const salonId = "64b100000000000000000011";
const requestId = "64b100000000000000000099";

let salons;
let users;
let requests;
let commits;
let throwAfterTransaction;
let duplicateOnCreate;
let sessionCalls;

const clone = (value) => JSON.parse(JSON.stringify(value));

class Query {
  constructor(resolve) {
    this.resolve = resolve;
    this.populates = [];
  }

  populate(path) {
    this.populates.push(typeof path === "string" ? path : path?.path);
    return this;
  }

  sort() {
    return this;
  }

  session() {
    sessionCalls += 1;
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.resolve())
      .then((doc) => {
        if (!doc) return doc;
        if (this.populates.includes("salonId") && doc.salonId === salonId) {
          doc.salonId = salons.get(salonId);
        }
        if (this.populates.includes("barberId") && doc.barberId === barberId) {
          doc.barberId = users.get(barberId);
        }
        if (this.populates.includes("barberId") && doc.barberId === ownerId) {
          doc.barberId = users.get(ownerId);
        }
        return doc;
      })
      .then(resolve, reject);
  }
}

const same = (left, right) => String(left) === String(right);

const matches = (doc, query) =>
  Object.entries(query).every(([key, expected]) => {
    const actual = doc[key];
    if (expected && typeof expected === "object" && "$in" in expected) {
      return expected.$in.includes(actual);
    }
    return same(actual, expected);
  });

const makeSalon = (overrides = {}) => ({
  _id: salonId,
  name: "Lifecycle Salon",
  ownerId,
  admins: [],
  ...overrides,
});

const makeUser = (overrides = {}) => ({
  _id: barberId,
  name: "Lifecycle Barber",
  role: "barber",
  salon: null,
  salonStatus: "none",
  salons: [],
  workHistory: [],
  async save() {
    return this;
  },
  ...overrides,
});

const makeRequest = (overrides = {}) => ({
  _id: requestId,
  salonId,
  barberId,
  status: "pending",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  async populate() {
    if (this.salonId === salonId) this.salonId = salons.get(salonId);
    if (this.barberId === barberId) this.barberId = users.get(barberId);
    return this;
  },
  toObject() {
    return { ...this };
  },
  ...overrides,
});

beforeEach(() => {
  salons = new Map([[salonId, makeSalon()]]);
  users = new Map([[barberId, makeUser()]]);
  requests = [];
  commits = 0;
  throwAfterTransaction = null;
  duplicateOnCreate = false;
  sessionCalls = 0;
  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      const requestSnapshots = requests.map((request) => [request, clone(request)]);
      const userSnapshots = [...users.values()].map((user) => [
        user,
        {
          salon: user.salon,
          salonStatus: user.salonStatus,
          salons: clone(user.salons || []),
          workHistory: clone(user.workHistory || []),
        },
      ]);

      const restore = () => {
        requestSnapshots.forEach(([request, snapshot]) => {
          Object.assign(request, snapshot);
        });
        userSnapshots.forEach(([user, snapshot]) => {
          Object.assign(user, snapshot);
        });
      };

      try {
        await callback();
        if (throwAfterTransaction) throw throwAfterTransaction;
      } catch (error) {
        restore();
        throw error;
      }
      commits += 1;
    },
    async endSession() {},
  });

  Salon.findById = (id) => new Query(() => salons.get(String(id)) || null);
  User.findById = (id) => new Query(() => users.get(String(id)) || null);
  SalonJoinRequest.findById = (id) =>
    new Query(() => requests.find((request) => same(request._id, id)) || null);
  SalonJoinRequest.findOne = (query) =>
    new Query(() => requests.find((request) => matches(request, query)) || null);
  SalonJoinRequest.findOneAndUpdate = (query, update) =>
    new Query(() => {
      const request = requests.find((item) => matches(item, query));
      if (!request) return null;
      Object.assign(request, update.$set || {});
      return request;
    });
  SalonJoinRequest.create = async (docs) => {
    if (
      duplicateOnCreate ||
      requests.some((request) =>
        request.status === "pending" &&
        same(request.salonId, docs[0].salonId) &&
        same(request.barberId, docs[0].barberId)
      )
    ) {
      const error = new Error("E11000 duplicate key");
      error.code = 11000;
      throw error;
    }
    const created = makeRequest({ _id: requestId, ...docs[0] });
    requests.push(created);
    return [created];
  };
});

afterEach(() => {
  mongoose.startSession = originalMethods.startSession;
  Salon.findById = originalMethods.salonFindById;
  SalonJoinRequest.findById = originalMethods.requestFindById;
  SalonJoinRequest.findOne = originalMethods.requestFindOne;
  SalonJoinRequest.findOneAndUpdate = originalMethods.requestFindOneAndUpdate;
  SalonJoinRequest.create = originalMethods.requestCreate;
  User.findById = originalMethods.userFindById;
});

test("first request creates pending membership and owner notification", async () => {
  const result = await requestSalonJoinLifecycle({
    salonId,
    barber: users.get(barberId),
  });

  assert.equal(result.statusCode, 201);
  assert.equal(result.request.status, "pending");
  assert.equal(users.get(barberId).salons[0].status, "pending");
  assert.equal(users.get(barberId).salons[0].relationshipType, "staff");
  assert.equal(users.get(barberId).salons[0].worksAsSpecialist, true);
  assert.equal(users.get(barberId).salons[0].staffPayment.type, "none");
  assert.equal(result.notification.type, "salon_join_requested");
  assert.equal(commits, 1);
});

test("duplicate pending request returns idempotently without notification", async () => {
  requests.push(makeRequest());
  users.get(barberId).salons.push({ salon: salonId, status: "pending" });

  const result = await requestSalonJoinLifecycle({
    salonId,
    barber: users.get(barberId),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.request._id, requestId);
  assert.equal(result.notification, null);
  assert.equal(requests.length, 1);
});

test("rejected and cancelled requests reopen to pending with stale fields cleared", async () => {
  for (const status of ["rejected", "cancelled"]) {
    requests = [makeRequest({ status })];
    users.get(barberId).salons = [{
      salon: salonId,
      status: "rejected",
      relationshipType: "chair_renter",
      relationshipStatus: "rejected",
      worksAsSpecialist: false,
      staffPayment: { type: "fixed", fixedAmount: 5000 },
    }];

    const result = await requestSalonJoinLifecycle({
      salonId,
      barber: users.get(barberId),
    });

    assert.equal(result.request.status, "pending");
    assert.equal(users.get(barberId).salons[0].status, "pending");
    assert.equal(users.get(barberId).salons[0].relationshipType, "staff");
    assert.equal(users.get(barberId).salons[0].relationshipStatus, "pending");
    assert.equal(users.get(barberId).salons[0].worksAsSpecialist, true);
    assert.equal(users.get(barberId).salons[0].staffPayment.type, "none");
  }
});

test("accepted request and approved canonical membership block rerequest", async () => {
  requests.push(makeRequest({ status: "accepted" }));
  await assert.rejects(
    () => requestSalonJoinLifecycle({ salonId, barber: users.get(barberId) }),
    /You already work in this salon/
  );

  requests = [];
  users.get(barberId).salons = [{ salon: salonId, status: "approved" }];
  await assert.rejects(
    () => requestSalonJoinLifecycle({ salonId, barber: users.get(barberId) }),
    /You already work in this salon/
  );
});

test("duplicate create conflict rereads pending request once", async () => {
  const pending = makeRequest();
  duplicateOnCreate = true;
  let pendingReads = 0;
  SalonJoinRequest.findOne = (query) =>
    new Query(() => {
      if (query.status === "pending") {
        pendingReads += 1;
        return pendingReads === 1 ? null : pending;
      }
      return null;
    });

  const result = await requestSalonJoinLifecycle({
    salonId,
    barber: users.get(barberId),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.request, pending);
  assert.equal(result.notification, null);
  assert.equal(pendingReads, 2);
  assert.ok(sessionCalls > 0);
});

test("own cancellation is idempotent, does not mutate memberships, and foreign cancellation is blocked", async () => {
  const request = makeRequest();
  requests.push(request);
  users.get(barberId).salons = [
    { salon: salonId, status: "approved", worksAsSpecialist: true },
    { salon: "64b100000000000000000012", status: "pending" },
  ];

  const cancelled = await cancelSalonJoinRequestLifecycle({ requestId, barberId });
  assert.equal(cancelled.request.status, "cancelled");
  assert.equal(users.get(barberId).salons.length, 2);
  assert.equal(users.get(barberId).salons[0].status, "approved");
  assert.equal(users.get(barberId).salons[0].worksAsSpecialist, true);

  const repeated = await cancelSalonJoinRequestLifecycle({ requestId, barberId });
  assert.equal(repeated.request.status, "cancelled");
  assert.equal(users.get(barberId).salons.length, 2);

  request.status = "pending";
  await assert.rejects(
    () => cancelSalonJoinRequestLifecycle({ requestId, barberId: otherBarberId }),
    /You can only cancel your own request/
  );
});

test("self-scoped cancellation by salon uses the latest exact request", async () => {
  const latestRequest = makeRequest({ _id: "64b100000000000000000098" });
  let queryFilter;
  let sortFilter;

  SalonJoinRequest.findOne = (query) => {
    queryFilter = query;
    return {
      sort(sort) {
        sortFilter = sort;
        return new Query(() => latestRequest);
      },
    };
  };
  SalonJoinRequest.findOneAndUpdate = (query, update) => {
    assert.deepEqual(query, {
      _id: latestRequest._id,
      barberId,
      status: "pending",
    });
    latestRequest.status = update.$set.status;
    return new Query(() => latestRequest);
  };

  const result = await cancelSalonJoinRequestBySalonLifecycle({ salonId, barberId });

  assert.deepEqual(queryFilter, { salonId, barberId });
  assert.deepEqual(sortFilter, { updatedAt: -1, createdAt: -1, _id: -1 });
  assert.equal(result.request.status, "cancelled");

  const repeated = await cancelSalonJoinRequestBySalonLifecycle({ salonId, barberId });
  assert.equal(repeated.request.status, "cancelled");
});

test("self-scoped cancellation by salon rejects final states, missing requests, and other barbers", async () => {
  for (const status of ["accepted", "rejected"]) {
    requests = [makeRequest({ status })];
    await assert.rejects(
      () => cancelSalonJoinRequestBySalonLifecycle({ salonId, barberId }),
      (error) => error.statusCode === 400 && error.message === "Only pending requests can be cancelled"
    );
  }

  requests = [];
  await assert.rejects(
    () => cancelSalonJoinRequestBySalonLifecycle({ salonId, barberId }),
    (error) => error.statusCode === 404
  );

  requests = [makeRequest({ barberId: otherBarberId })];
  await assert.rejects(
    () => cancelSalonJoinRequestBySalonLifecycle({ salonId, barberId }),
    (error) => error.statusCode === 404
  );
});

test("accept and reject require manager authority and block self decisions", async () => {
  requests.push(makeRequest());

  await assert.rejects(
    () => decideSalonJoinRequestLifecycle({ requestId, status: "accepted", actorId: otherBarberId }),
    /Only salon owner or admin/
  );

  requests[0] = makeRequest({ barberId: ownerId });
  users.set(ownerId, makeUser({ _id: ownerId }));
  await assert.rejects(
    () => decideSalonJoinRequestLifecycle({ requestId, status: "rejected", actorId: ownerId }),
    /You cannot manage your own join request/
  );
});

test("owner and admin may decide another barber request", async () => {
  requests.push(makeRequest());
  const accepted = await decideSalonJoinRequestLifecycle({
    requestId,
    status: "accepted",
    actorId: ownerId,
  });

  assert.equal(accepted.request.status, "accepted");
  assert.equal(users.get(barberId).salons.length, 1);
  assert.equal(users.get(barberId).salons[0].status, "approved");

  salons.set(salonId, makeSalon({ admins: [adminId] }));
  requests[0] = makeRequest();
  users.set(barberId, makeUser());
  const rejected = await decideSalonJoinRequestLifecycle({
    requestId,
    status: "rejected",
    actorId: adminId,
  });

  assert.equal(rejected.request.status, "rejected");
});

test("repeated same decision is idempotent and conflicting final decision is 409", async () => {
  requests.push(makeRequest({ status: "accepted" }));

  const repeated = await decideSalonJoinRequestLifecycle({
    requestId,
    status: "accepted",
    actorId: ownerId,
  });
  assert.equal(repeated.notification, null);

  await assert.rejects(
    () => decideSalonJoinRequestLifecycle({ requestId, status: "rejected", actorId: ownerId }),
    (error) => error.statusCode === 409
  );
});

test("accepted membership is canonical staff specialist and created once", async () => {
  requests.push(makeRequest());
  users.get(barberId).salons = [
    {
      salon: salonId,
      status: "pending",
      relationshipType: "chair_renter",
      relationshipStatus: "rejected",
      worksAsSpecialist: false,
      staffPayment: { type: "fixed", fixedAmount: 1000 },
    },
    { salon: salonId, status: "rejected" },
  ];

  const result = await decideSalonJoinRequestLifecycle({
    requestId,
    status: "accepted",
    actorId: ownerId,
  });
  const memberships = users.get(barberId).salons.filter((entry) => same(entry.salon, salonId));

  assert.equal(result.notification.type, "salon_join_accepted");
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].status, "approved");
  assert.equal(memberships[0].relationshipType, "staff");
  assert.equal(memberships[0].relationshipStatus, "accepted");
  assert.equal(memberships[0].worksAsSpecialist, true);
  assert.equal(memberships[0].staffPayment.type, "none");
});

test("reject with approved membership returns 409 unchanged", async () => {
  requests.push(makeRequest());
  const approved = { salon: salonId, status: "approved", worksAsSpecialist: true };
  users.get(barberId).salons = [approved];

  await assert.rejects(
    () => decideSalonJoinRequestLifecycle({ requestId, status: "rejected", actorId: ownerId }),
    (error) => error.statusCode === 409
  );

  assert.equal(requests[0].status, "pending");
  assert.deepEqual(users.get(barberId).salons[0], approved);
});

test("reject removes duplicate non-approved eligibility for the salon", async () => {
  requests.push(makeRequest());
  users.get(barberId).salons = [
    {
      salon: salonId,
      status: "pending",
      relationshipType: "chair_renter",
      relationshipStatus: "pending",
      worksAsSpecialist: true,
      staffPayment: { type: "fixed", fixedAmount: 1000 },
    },
    {
      salon: salonId,
      status: "rejected",
      relationshipType: "chair_renter",
      relationshipStatus: "accepted",
      worksAsSpecialist: true,
    },
  ];

  await decideSalonJoinRequestLifecycle({ requestId, status: "rejected", actorId: ownerId });

  const memberships = users.get(barberId).salons.filter((entry) => same(entry.salon, salonId));
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].status, "rejected");
  assert.equal(memberships[0].relationshipType, "staff");
  assert.equal(memberships[0].relationshipStatus, "rejected");
  assert.equal(memberships[0].worksAsSpecialist, false);
  assert.equal(memberships[0].staffPayment.type, "none");
  assert.notEqual(users.get(barberId).salonStatus, "approved");
});

test("reopen clears all stale duplicate entries and is blocked by any approved duplicate", async () => {
  requests.push(makeRequest({ status: "cancelled" }));
  users.get(barberId).salons = [
    { salon: salonId, status: "pending", relationshipType: "chair_renter" },
    { salon: salonId, status: "rejected", worksAsSpecialist: false },
  ];

  const result = await requestSalonJoinLifecycle({ salonId, barber: users.get(barberId) });

  let memberships = users.get(barberId).salons.filter((entry) => same(entry.salon, salonId));
  assert.equal(result.request.status, "pending");
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].status, "pending");
  assert.equal(memberships[0].relationshipType, "staff");

  requests = [makeRequest({ status: "rejected" })];
  users.get(barberId).salons = [
    { salon: salonId, status: "rejected" },
    { salon: salonId, status: "approved" },
  ];

  await assert.rejects(
    () => requestSalonJoinLifecycle({ salonId, barber: users.get(barberId) }),
    /You already work in this salon/
  );

  memberships = users.get(barberId).salons.filter((entry) => same(entry.salon, salonId));
  assert.equal(memberships.length, 2);
});

test("two accepts create one canonical membership and duplicate notifications are not produced", async () => {
  requests.push(makeRequest());
  const first = await decideSalonJoinRequestLifecycle({ requestId, status: "accepted", actorId: ownerId });
  const second = await decideSalonJoinRequestLifecycle({ requestId, status: "accepted", actorId: ownerId });
  const memberships = users.get(barberId).salons.filter((entry) => same(entry.salon, salonId));

  assert.equal(first.notification.type, "salon_join_accepted");
  assert.equal(second.notification, null);
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].status, "approved");
});

test("accept versus reject cannot both succeed", async () => {
  requests.push(makeRequest());
  await decideSalonJoinRequestLifecycle({ requestId, status: "accepted", actorId: ownerId });

  await assert.rejects(
    () => decideSalonJoinRequestLifecycle({ requestId, status: "rejected", actorId: ownerId }),
    (error) => error.statusCode === 409
  );

  assert.equal(requests[0].status, "accepted");
});

test("rollback preserves request and membership state when transaction fails", async () => {
  requests.push(makeRequest());
  users.get(barberId).salons = [{ salon: salonId, status: "pending" }];
  throwAfterTransaction = new Error("commit failed");

  await assert.rejects(
    () => decideSalonJoinRequestLifecycle({ requestId, status: "accepted", actorId: ownerId }),
    /commit failed/
  );

  assert.equal(requests[0].status, "pending");
  assert.equal(users.get(barberId).salons.length, 1);
  assert.equal(users.get(barberId).salons[0].status, "pending");
});
