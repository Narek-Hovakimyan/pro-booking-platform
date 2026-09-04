import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import SalonJobApplication from "../../models/SalonJobApplication.js";
import SalonJobPost from "../../models/SalonJobPost.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";
import {
  SalonJobOnboardingError,
  confirmSalonJobOnboarding,
} from "./salonJobOnboardingService.js";

const applicantId = "64b000000000000000000003";
const otherId = "64b000000000000000000004";
const salonId = "64b000000000000000000010";
const jobId = "64b000000000000000000020";
const applicationId = "64b000000000000000000030";

const originals = {
  startSession: mongoose.startSession,
  applicationFindById: SalonJobApplication.findById,
  jobFindById: SalonJobPost.findById,
  requestFindOne: SalonJoinRequest.findOne,
  userFindById: User.findById,
  salonFindById: Salon.findById,
};

afterEach(() => {
  mongoose.startSession = originals.startSession;
  SalonJobApplication.findById = originals.applicationFindById;
  SalonJobPost.findById = originals.jobFindById;
  SalonJoinRequest.findOne = originals.requestFindOne;
  User.findById = originals.userFindById;
  Salon.findById = originals.salonFindById;
});

const query = (value) => ({ session: () => query(value), then: (resolve) => Promise.resolve(value).then(resolve) });

const offer = (overrides = {}) => ({
  salonId,
  jobPostId: jobId,
  role: "barber",
  employmentType: "full-time",
  relationshipType: "staff",
  relationshipStatus: "accepted",
  worksAsSpecialist: true,
  mappingVersion: 1,
  offeredAt: new Date("2030-01-01"),
  ...overrides,
});

const application = (overrides = {}) => ({
  _id: applicationId,
  applicantId,
  salonId,
  jobId,
  status: "accepted",
  onboardingStatus: "pending_consent",
  onboardingOffer: offer(),
  async save() { return this; },
  ...overrides,
});

const barber = (overrides = {}) => ({
  _id: applicantId,
  role: "barber",
  salon: null,
  salonStatus: "none",
  salons: [],
  workHistory: [],
  async save() { return this; },
  ...overrides,
});

const setup = ({ app = application(), user = barber(), pendingRequest = null, salon = { _id: salonId, name: "Salon" } } = {}) => {
  mongoose.startSession = async () => ({
    async withTransaction(callback) { await callback(); },
    async endSession() {},
  });
  SalonJobApplication.findById = () => query(app);
  User.findById = () => query(user);
  SalonJoinRequest.findOne = () => query(pendingRequest);
  Salon.findById = () => query(salon);
  return { app, user };
};

test("applicant confirmation creates exactly the offered specialist staff membership", async () => {
  const { app, user } = setup();
  const result = await confirmSalonJobOnboarding({ applicationId, applicantId });

  assert.equal(result.idempotent, false);
  assert.equal(app.onboardingStatus, "confirmed");
  assert.equal(app.onboardingConsent.mappingVersion, 1);
  assert.deepEqual(user.salons.map(({ salon, status, relationshipType, relationshipStatus, worksAsSpecialist }) => ({ salon, status, relationshipType, relationshipStatus, worksAsSpecialist })), [{ salon: salonId, status: "approved", relationshipType: "staff", relationshipStatus: "accepted", worksAsSpecialist: true }]);
});

test("same confirmed application is idempotent only with the matching membership", async () => {
  const app = application({ onboardingStatus: "confirmed" });
  const user = barber({ salons: [{ salon: salonId, status: "approved", relationshipType: "staff", relationshipStatus: "accepted", worksAsSpecialist: true }] });
  setup({ app, user });
  const result = await confirmSalonJobOnboarding({ applicationId, applicantId });
  assert.equal(result.idempotent, true);
  assert.equal(user.salons.length, 1);
});

test("confirmed application without matching membership fails closed", async () => {
  setup({ app: application({ onboardingStatus: "confirmed" }) });
  await assert.rejects(
    confirmSalonJobOnboarding({ applicationId, applicantId }),
    (error) => error instanceof SalonJobOnboardingError && error.statusCode === 409
  );
});

test("another user cannot confirm the applicant's offer", async () => {
  setup();
  await assert.rejects(
    confirmSalonJobOnboarding({ applicationId, applicantId: otherId }),
    (error) => error instanceof SalonJobOnboardingError && error.statusCode === 403
  );
});

test("pending direct requests and existing memberships block without mutation", async () => {
  const first = setup({ pendingRequest: { _id: "request" } });
  await assert.rejects(confirmSalonJobOnboarding({ applicationId, applicantId }), /direct salon request/);
  assert.equal(first.app.onboardingStatus, "pending_consent");

  const second = setup({ user: barber({ salons: [{ salon: salonId, status: "rejected" }] }) });
  await assert.rejects(confirmSalonJobOnboarding({ applicationId, applicantId }), /membership already exists/);
  assert.equal(second.app.onboardingStatus, "pending_consent");
});

test("blocked and legacy accepted applications cannot be reconstructed from mutable job data", async () => {
  setup({ app: application({ onboardingStatus: "blocked", onboardingOffer: undefined }) });
  await assert.rejects(confirmSalonJobOnboarding({ applicationId, applicantId }), /offer is unavailable/);

  setup({ app: application({ onboardingStatus: undefined, onboardingOffer: undefined }) });
  await assert.rejects(confirmSalonJobOnboarding({ applicationId, applicantId }), /offer is unavailable/);
});

test("receptionist and specialist rent-chair offers retain their exact mappings", async () => {
  const receptionist = setup({ app: application({ onboardingOffer: offer({ role: "receptionist", relationshipType: "staff", worksAsSpecialist: false }) }) });
  await confirmSalonJobOnboarding({ applicationId, applicantId });
  assert.equal(receptionist.user.salons[0].worksAsSpecialist, false);

  const chair = setup({ app: application({ onboardingOffer: offer({ employmentType: "rent-chair", relationshipType: "chair_renter" }) }) });
  await confirmSalonJobOnboarding({ applicationId, applicantId });
  assert.equal(chair.user.salons[0].relationshipType, "chair_renter");
});

test("rejected application and incompatible offer fail before membership mutation", async () => {
  const rejected = setup({ app: application({ status: "rejected" }) });
  await assert.rejects(confirmSalonJobOnboarding({ applicationId, applicantId }), /not accepted/);
  assert.equal(rejected.user.salons.length, 0);

  const invalid = setup({ app: application({ onboardingOffer: offer({ role: "other" }) }) });
  await assert.rejects(confirmSalonJobOnboarding({ applicationId, applicantId }), /offer is unavailable/);
  assert.equal(invalid.user.salons.length, 0);
});

const clone = (value) => {
  const { save, ...serializable } = value || {};
  return structuredClone(serializable);
};

const createDeferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

// This harness models Mongo transaction snapshots, commit write-conflicts, and
// driver callback retries. It intentionally commits only staged document saves.
const createTransactionalHarness = ({
  applications = [application()],
  users = [barber()],
  salon = { _id: salonId, name: "Salon" },
  pendingRequest = null,
  failApplicationSave = false,
  pauseAfterUserReads = 0,
} = {}) => {
  const data = {
    applications: new Map(applications.map((item) => [String(item._id), clone(item)])),
    users: new Map(users.map((item) => [String(item._id), clone(item)])),
  };
  const versions = new Map([
    ...[...data.applications.keys()].map((id) => [`applications:${id}`, 0]),
    ...[...data.users.keys()].map((id) => [`users:${id}`, 0]),
  ]);
  const readsReady = createDeferred();
  let userReads = 0;
  let failNextApplicationSave = failApplicationSave;

  const makeSession = () => {
    let snapshots;
    let staged;

    const read = async (collection, id) => {
      const key = `${collection}:${id}`;
      if (!snapshots.has(key)) {
        snapshots.set(key, {
          value: data[collection].has(id) ? clone(data[collection].get(id)) : null,
          version: versions.get(key) || 0,
        });
      }
      if (collection === "users" && pauseAfterUserReads) {
        userReads += 1;
        if (userReads === pauseAfterUserReads) readsReady.resolve();
        if (userReads <= pauseAfterUserReads) await readsReady.promise;
      }
      const snapshot = snapshots.get(key);
      if (!snapshot.value) return null;
      const document = snapshot.value;
      document.save = async () => {
        if (collection === "applications" && failNextApplicationSave) {
          failNextApplicationSave = false;
          throw new Error("injected application save failure");
        }
        staged.set(key, clone(document));
        return document;
      };
      return document;
    };

    const queryFor = (collection, id) => {
      let session = null;
      return {
        session(value) { session = value; return this; },
        then(resolve, reject) {
          return Promise.resolve(session.read(collection, String(id))).then(resolve, reject);
        },
      };
    };

    return {
      read,
      async withTransaction(callback) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          snapshots = new Map();
          staged = new Map();
          try {
            await callback();
            for (const key of staged.keys()) {
              if ((versions.get(key) || 0) !== snapshots.get(key).version) {
                throw Object.assign(new Error("write conflict"), { retryable: true });
              }
            }
            for (const [key, value] of staged) {
              const [collection, id] = key.split(":");
              data[collection].set(id, clone(value));
              versions.set(key, (versions.get(key) || 0) + 1);
            }
            return;
          } catch (error) {
            if (error.retryable && attempt < 2) continue;
            throw error;
          }
        }
      },
      async endSession() {},
      queryFor,
    };
  };

  mongoose.startSession = async () => makeSession();
  SalonJobApplication.findById = (id) => ({
    session(session) { return session.queryFor("applications", id).session(session); },
  });
  User.findById = (id) => ({
    session(session) { return session.queryFor("users", id).session(session); },
  });
  SalonJoinRequest.findOne = () => ({ session: async () => pendingRequest });
  Salon.findById = () => ({ session: async () => clone(salon) });

  return {
    application: (id = applicationId) => data.applications.get(String(id)),
    user: (id = applicantId) => data.users.get(String(id)),
  };
};

test("transaction rollback leaves no membership or consent and a retry starts pending", async () => {
  const harness = createTransactionalHarness({ failApplicationSave: true });

  await assert.rejects(
    confirmSalonJobOnboarding({ applicationId, applicantId }),
    /injected application save failure/
  );
  assert.equal(harness.user().salons.length, 0);
  assert.equal(harness.application().onboardingStatus, "pending_consent");
  assert.equal(harness.application().onboardingConsent, undefined);

  await confirmSalonJobOnboarding({ applicationId, applicantId });
  assert.equal(harness.user().salons.length, 1);
  assert.equal(harness.application().onboardingStatus, "confirmed");
});

test("overlapping confirmations of one application commit one membership and converge idempotently", async () => {
  const harness = createTransactionalHarness({ pauseAfterUserReads: 2 });
  const results = await Promise.allSettled([
    confirmSalonJobOnboarding({ applicationId, applicantId }),
    confirmSalonJobOnboarding({ applicationId, applicantId }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(harness.user().salons.filter((entry) => entry.salon === salonId).length, 1);
  assert.equal(harness.application().onboardingStatus, "confirmed");
  assert.equal(harness.application().onboardingConsent.mappingVersion, 1);
});

test("overlapping accepted applications for one salon leave one confirmed winner", async () => {
  const secondApplicationId = "64b000000000000000000031";
  const second = application({ _id: secondApplicationId, jobId: "64b000000000000000000021" });
  second.onboardingOffer = offer({ jobPostId: second.jobId });
  const harness = createTransactionalHarness({
    applications: [application(), second],
    pauseAfterUserReads: 2,
  });
  const results = await Promise.allSettled([
    confirmSalonJobOnboarding({ applicationId, applicantId }),
    confirmSalonJobOnboarding({ applicationId: secondApplicationId, applicantId }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(harness.user().salons.filter((entry) => entry.salon === salonId).length, 1);
  const applications = [harness.application(applicationId), harness.application(secondApplicationId)];
  assert.equal(applications.filter((item) => item.onboardingStatus === "confirmed").length, 1);
  assert.equal(applications.filter((item) => item.onboardingConsent).length, 1);
});

test("accepted immutable offers remain confirmable after job closure and policy changes", async () => {
  for (const joinApplicationPolicy of ["closed", "job_only", "open"]) {
    const closedJob = { _id: jobId, status: "closed" };
    const harness = createTransactionalHarness({
      salon: { _id: salonId, name: "Salon", joinApplicationPolicy },
    });
    assert.equal(closedJob.status, "closed");
    SalonJobPost.findById = async () => {
      throw new Error("confirmation must not reload a closed job post");
    };
    await confirmSalonJobOnboarding({ applicationId, applicantId });
    assert.equal(harness.application().onboardingStatus, "confirmed");
    assert.equal(harness.user().salons.length, 1);
  }
});
