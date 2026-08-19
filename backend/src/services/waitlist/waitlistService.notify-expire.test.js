import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import WaitlistEntry from "../../models/WaitlistEntry.js";
import Notification from "../../models/Notification.js";
import User from "../../models/User.js";
import {
  barberId,
  clientId,
  createMockEntry,
  futureDate,
  installWaitlistTestClock,
  mockFindOneAndUpdateForEntries,
  otherSalonId,
  otherServiceId,
  pastDate,
  resetWaitlistServiceModelMocks,
  resetWaitlistTestClock,
  salonId,
  serviceId,
} from "./waitlistService.testUtils.js";
import {
  expirePastWaitlistEntries,
  notifyMatchingWaitlistEntries,
} from "./waitlistService.js";

beforeEach(() => {
  installWaitlistTestClock();
});

afterEach(() => {
  resetWaitlistTestClock();
  resetWaitlistServiceModelMocks();
});

test("notifyMatchingWaitlistEntries notifies matching active entries", async () => {
  const mockEntry = createMockEntry({ _id: "entry-to-notify" });
  let notificationCreated = null;

  WaitlistEntry.find = async (query) => {
    assert.equal(String(query.barberId), barberId);
    assert.equal(query.date, futureDate);
    assert.equal(query.status, "active");
    return [mockEntry];
  };
  mockFindOneAndUpdateForEntries([mockEntry]);

  User.findById = () => ({
    select: async () => ({ name: "John Barber" }),
  });

  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 1);
  assert.equal(mockEntry.status, "notified");
  assert.ok(mockEntry.notifiedAt);
  assert.ok(notificationCreated);
  assert.equal(notificationCreated.userId, clientId);
  assert.equal(notificationCreated.type, "waitlist_slot_available");
  assert.ok(notificationCreated.message.includes("John Barber"));
  assert.ok(notificationCreated.message.includes(futureDate));

  // Verify notification data contains only safe fields
  assert.ok(notificationCreated.data, "notification should have data");
  assert.equal(
    String(notificationCreated.data.waitlistId),
    String(mockEntry._id),
    "data.waitlistId should match entry._id"
  );
  assert.equal(
    String(notificationCreated.data.barberId),
    barberId,
    "data.barberId should match barberId"
  );
  assert.equal(
    String(notificationCreated.data.serviceId),
    serviceId,
    "data.serviceId should match serviceId"
  );
  assert.equal(notificationCreated.data.salonId, undefined, "salonId should be undefined when entry has none");
  // Private fields must not be present
  assert.equal(notificationCreated.data.clientId, undefined);
  assert.equal(notificationCreated.data.clientName, undefined);
  assert.equal(notificationCreated.data.clientPhone, undefined);
  assert.equal(notificationCreated.data.note, undefined);
  assert.equal(notificationCreated.data.consultation, undefined);
  assert.equal(notificationCreated.data.treatmentRecord, undefined);
  assert.equal(notificationCreated.data.referenceImages, undefined);
});

test("notification data contains only safe fields when entry has salonId", async () => {
  const mockEntry = createMockEntry({
    _id: "entry-with-salon",
    salonId,
  });
  let notificationCreated = null;

  WaitlistEntry.find = async () => [mockEntry];
  mockFindOneAndUpdateForEntries([mockEntry]);
  User.findById = () => ({
    select: async () => ({ name: "John Barber" }),
  });
  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    salonId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 1);

  // Verify safe data fields with salon present
  assert.ok(notificationCreated.data, "notification should have data");
  assert.equal(String(notificationCreated.data.waitlistId), String(mockEntry._id));
  assert.equal(String(notificationCreated.data.barberId), barberId);
  assert.equal(String(notificationCreated.data.salonId), salonId);
  assert.equal(String(notificationCreated.data.serviceId), serviceId);
  // Private fields must not be present
  assert.equal(notificationCreated.data.clientId, undefined);
  assert.equal(notificationCreated.data.clientName, undefined);
  assert.equal(notificationCreated.data.clientPhone, undefined);
  assert.equal(notificationCreated.data.note, undefined);
  assert.equal(notificationCreated.data.consultation, undefined);
  assert.equal(notificationCreated.data.treatmentRecord, undefined);
  assert.equal(notificationCreated.data.referenceImages, undefined);
});

test("notified entries are not notified twice", async () => {
  // The function only queries for status "active", so "notified" entries won't be found
  WaitlistEntry.find = async () => [];

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
  });

  assert.equal(count, 0);
});

test("salonId matching works: entry with matching salonId is notified", async () => {
  const mockEntry = createMockEntry({ _id: "entry-salon-match", salonId });

  WaitlistEntry.find = async () => [mockEntry];
  mockFindOneAndUpdateForEntries([mockEntry]);
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async (payload) => payload;

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    salonId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 1);
  assert.equal(mockEntry.status, "notified");
});

test("salonId matching works: entry with different salonId is not notified", async () => {
  const mockEntry = createMockEntry({ _id: "entry-salon-no-match", salonId: otherSalonId });

  WaitlistEntry.find = async () => [mockEntry];

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    salonId,
    date: futureDate,
    serviceId,
  });

  assert.equal(count, 0);
  assert.equal(mockEntry.status, "active");
});

test("salonId matching works: entry without salonId is notified when salonId is provided", async () => {
  const mockEntry = createMockEntry({ _id: "entry-no-salon", salonId: null });

  WaitlistEntry.find = async () => [mockEntry];
  mockFindOneAndUpdateForEntries([mockEntry]);
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async (payload) => payload;

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    salonId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 1);
  assert.equal(mockEntry.status, "notified");
});

test("salonId matching works: entry with salonId is not notified when opening has no salonId", async () => {
  const mockEntry = createMockEntry({ _id: "entry-salon-with-no-opening-salon", salonId });

  WaitlistEntry.find = async () => [mockEntry];

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 0);
  assert.equal(mockEntry.status, "active");
});

test("serviceId matching works: entry with matching serviceId is notified", async () => {
  const mockEntry = createMockEntry({ _id: "entry-service-match", serviceId });

  WaitlistEntry.find = async () => [mockEntry];
  mockFindOneAndUpdateForEntries([mockEntry]);
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async (payload) => payload;

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 1);
  assert.equal(mockEntry.status, "notified");
});

test("serviceId matching works: entry with different serviceId is not notified", async () => {
  const mockEntry = createMockEntry({ _id: "entry-service-no-match", serviceId: otherServiceId });

  WaitlistEntry.find = async () => [mockEntry];
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
  });

  assert.equal(count, 0);
  assert.equal(mockEntry.status, "active");
});

test("serviceId matching works: entry with same serviceId is preferred over different", async () => {
  const matchingEntry = createMockEntry({ _id: "entry-match", serviceId });
  const nonMatchingEntry = createMockEntry({ _id: "entry-no-match", serviceId: otherServiceId });

  WaitlistEntry.find = async () => [nonMatchingEntry, matchingEntry];
  mockFindOneAndUpdateForEntries([nonMatchingEntry, matchingEntry]);
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async (payload) => payload;

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 1);
  assert.equal(matchingEntry.status, "notified");
  assert.equal(nonMatchingEntry.status, "active");
});

test("preferred time window matching works: slot inside window is notified", async () => {
  const mockEntry = createMockEntry({
    _id: "entry-time-match",
    preferredStartTime: "09:00",
    preferredEndTime: "12:00",
  });

  WaitlistEntry.find = async () => [mockEntry];
  mockFindOneAndUpdateForEntries([mockEntry]);
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async (payload) => payload;

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 1);
  assert.equal(mockEntry.status, "notified");
});

test("preferred time window matching works: slot outside window is not notified", async () => {
  const mockEntry = createMockEntry({
    _id: "entry-time-no-match",
    preferredStartTime: "13:00",
    preferredEndTime: "16:00",
  });

  WaitlistEntry.find = async () => [mockEntry];

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 0);
  assert.equal(mockEntry.status, "active");
});

test("preferred time window matching works: entries without a window match any slot time", async () => {
  const mockEntry = createMockEntry({ _id: "entry-without-time-window" });

  WaitlistEntry.find = async () => [mockEntry];
  mockFindOneAndUpdateForEntries([mockEntry]);
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async (payload) => payload;

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "18:00",
  });

  assert.equal(count, 1);
  assert.equal(mockEntry.status, "notified");
});

test("past date entries are ignored by notifyMatchingWaitlistEntries", async () => {
  let findCalled = false;

  WaitlistEntry.find = async () => {
    findCalled = true;
    return [createMockEntry({ _id: "past-entry", date: pastDate })];
  };

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: pastDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 0);
  assert.equal(findCalled, false);
});

test("notifyMatchingWaitlistEntries requires barberId and date", async () => {
  let findCalled = false;

  WaitlistEntry.find = async () => {
    findCalled = true;
    return [];
  };

  assert.equal(await notifyMatchingWaitlistEntries({ barberId, serviceId }), 0);
  assert.equal(await notifyMatchingWaitlistEntries({ date: futureDate, serviceId }), 0);
  assert.equal(findCalled, false);
});

test("concurrent notifyMatchingWaitlistEntries calls only notify once", async () => {
  const mockEntry = createMockEntry({ _id: "entry-concurrent-notify" });
  let notificationCount = 0;
  let notificationPayloads = [];
  let claimed = false;

  WaitlistEntry.find = async () => [mockEntry];
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (claimed || query.status !== "active") {
      return null;
    }

    claimed = true;
    Object.assign(mockEntry, update.$set || {});
    return mockEntry;
  };
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async (payload) => {
    notificationCount += 1;
    notificationPayloads.push(payload);
    return payload;
  };

  const counts = await Promise.all([
    notifyMatchingWaitlistEntries({ barberId, date: futureDate, serviceId, time: "10:00" }),
    notifyMatchingWaitlistEntries({ barberId, date: futureDate, serviceId, time: "10:00" }),
  ]);

  assert.equal(counts[0] + counts[1], 1);
  assert.equal(notificationCount, 1);
  assert.equal(
    notificationPayloads[0].internalHash,
    createHash("sha256")
      .update(`waitlist-slot-available:${mockEntry._id}:${futureDate}:10:00`)
      .digest("hex")
  );
  assert.equal(mockEntry.status, "notified");
});

test("notifyMatchingWaitlistEntries forwards session and afterCommit through all writes", async () => {
  const mockEntry = createMockEntry({ _id: "entry-session-notify" });
  const session = { id: "waitlist-session" };
  const afterCommit = (callback) => {
    calls.afterCommitCallback = callback;
  };
  const stableNow = new Date("2026-08-01T08:00:00.000Z");
  const calls = {};

  WaitlistEntry.find = async (query, projection, options) => {
    calls.findOptions = options;
    return [mockEntry];
  };
  WaitlistEntry.findOneAndUpdate = async (query, update, options) => {
    calls.claimQuery = query;
    calls.claimOptions = options;
    Object.assign(mockEntry, update.$set || {});
    return mockEntry;
  };
  User.findById = (id, projection, options) => {
    calls.userOptions = options;
    return {
      select: async () => ({ name: "Jane Barber" }),
    };
  };
  Notification.create = async (payload, options) => {
    calls.notificationPayload = payload[0];
    calls.notificationOptions = options;
    return [payload[0]];
  };

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "10:00",
    session,
    afterCommit,
    now: stableNow,
  });

  assert.equal(count, 1);
  assert.equal(mockEntry.notifiedAt.toISOString(), stableNow.toISOString());
  assert.equal(calls.findOptions.session, session);
  assert.equal(calls.userOptions.session, session);
  assert.equal(calls.claimOptions.session, session);
  assert.equal(calls.notificationOptions.session, session);
  assert.equal(typeof calls.afterCommitCallback, "function");
  assert.equal(
    calls.notificationPayload.internalHash,
    createHash("sha256")
      .update(`waitlist-slot-available:${mockEntry._id}:${futureDate}:10:00`)
      .digest("hex")
  );
});

test("notifyMatchingWaitlistEntries claim rechecks matching fields and preserves concurrent cancellation", async () => {
  const mockEntry = createMockEntry({
    _id: "entry-cancelled-before-claim",
    preferredStartTime: "09:00",
    preferredEndTime: "12:00",
  });
  let notificationCalls = 0;

  WaitlistEntry.find = async () => [mockEntry];
  WaitlistEntry.findOneAndUpdate = async (query) => {
    assert.equal(query.status, "active");
    assert.equal(query.clientId, mockEntry.clientId);
    assert.equal(query.barberId, mockEntry.barberId);
    assert.equal(query.salonId, mockEntry.salonId);
    assert.equal(query.serviceId, mockEntry.serviceId);
    assert.equal(query.date, mockEntry.date);
    assert.equal(query.preferredStartTime, "09:00");
    assert.equal(query.preferredEndTime, "12:00");
    mockEntry.status = "cancelled";
    return null;
  };
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async () => {
    notificationCalls += 1;
  };

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
    time: "10:00",
  });

  assert.equal(count, 0);
  assert.equal(notificationCalls, 0);
  assert.equal(mockEntry.status, "cancelled");
});

test("notifyMatchingWaitlistEntries propagates notification failures for transactional callers", async () => {
  const mockEntry = createMockEntry({ _id: "entry-notification-fails" });
  const error = new Error("storage failure");

  WaitlistEntry.find = async () => [mockEntry];
  mockFindOneAndUpdateForEntries([mockEntry]);
  User.findById = () => ({
    select: async () => ({ name: "Jane Barber" }),
  });
  Notification.create = async () => {
    throw error;
  };

  await assert.rejects(
    () => notifyMatchingWaitlistEntries({
      barberId,
      date: futureDate,
      serviceId,
      time: "10:00",
      session: { id: "transaction" },
      afterCommit() {},
    }),
    error
  );
});

test("expirePastWaitlistEntries expires past active entries", async () => {
  const pastEntry = createMockEntry({ _id: "past-active-entry", date: pastDate });
  mockFindOneAndUpdateForEntries([pastEntry]);

  WaitlistEntry.find = async (query) => {
    assert.deepEqual(query.status, {
      $in: ["active", "notified", "offered"],
    });
    assert.ok(query.date.$lt);
    return [pastEntry];
  };

  const entries = await expirePastWaitlistEntries(new Date("2099-06-01"));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "expired");
  assert.ok(entries[0].expiredAt);
});

test("expirePastWaitlistEntries expires past notified entries", async () => {
  const pastEntry = createMockEntry({
    _id: "past-notified-entry",
    date: pastDate,
    status: "notified",
  });
  mockFindOneAndUpdateForEntries([pastEntry]);

  WaitlistEntry.find = async (query) => {
    assert.deepEqual(query.status, {
      $in: ["active", "notified", "offered"],
    });
    assert.ok(query.date.$lt);
    return [pastEntry];
  };

  const entries = await expirePastWaitlistEntries(new Date("2099-06-01"));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "expired");
  assert.ok(entries[0].expiredAt);
});

test("expirePastWaitlistEntries expires past offered entries", async () => {
  const pastEntry = createMockEntry({
    _id: "past-offered-entry",
    date: pastDate,
    status: "offered",
  });
  mockFindOneAndUpdateForEntries([pastEntry]);

  WaitlistEntry.find = async (query) => {
    assert.deepEqual(query.status, {
      $in: ["active", "notified", "offered"],
    });
    assert.ok(query.date.$lt);
    return [pastEntry];
  };

  const entries = await expirePastWaitlistEntries(new Date("2099-06-01"));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "expired");
  assert.ok(entries[0].expiredAt);
});

test("future date entries are not expired by expirePastWaitlistEntries", async () => {
  WaitlistEntry.find = async (query) => {
    assert.deepEqual(query.status, {
      $in: ["active", "notified", "offered"],
    });
    assert.ok(query.date.$lt);
    return [];
  };

  const entries = await expirePastWaitlistEntries(new Date(futureDate));
  assert.equal(entries.length, 0);
});

test("expirePastWaitlistEntries does not expire future offered entries", async () => {
  WaitlistEntry.find = async (query) => {
    assert.deepEqual(query.status, {
      $in: ["active", "notified", "offered"],
    });
    assert.ok(query.date.$lt);
    return [];
  };

  const entries = await expirePastWaitlistEntries(new Date(futureDate));
  assert.equal(entries.length, 0);
});

test("expirePastWaitlistEntries does not query closed statuses", async () => {
  const closedStatuses = ["converted", "rejected", "cancelled", "expired"];

  WaitlistEntry.find = async (query) => {
    for (const status of closedStatuses) {
      assert.equal(query.status.$in.includes(status), false);
    }
    assert.ok(query.date.$lt);
    return [];
  };

  const entries = await expirePastWaitlistEntries(new Date("2099-06-01"));
  assert.equal(entries.length, 0);
});

test("expirePastWaitlistEntries propagates fenced session and uses CAS eligibility", async () => {
  const pastEntry = createMockEntry({ _id: "past-session-entry", date: pastDate });
  const session = { id: "lease-session" };
  const calls = [];

  WaitlistEntry.find = async () => [pastEntry];
  WaitlistEntry.findOneAndUpdate = async (query, update, options) => {
    calls.push({ query, update, options });
    Object.assign(pastEntry, update.$set);
    return pastEntry;
  };

  const entries = await expirePastWaitlistEntries({
    now: new Date("2099-06-01"),
    leaseContext: {
      withFencedWrite: (write) => write({ session }),
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.session, session);
  assert.deepEqual(calls[0].query.status, { $in: ["active", "notified", "offered"] });
  assert.equal(calls[0].query.date.$lt, "2099-06-01");
  assert.equal(pastEntry.status, "expired");
});

test("expirePastWaitlistEntries skips entries changed concurrently", async () => {
  const pastEntry = createMockEntry({ _id: "past-concurrent-entry", date: pastDate });

  WaitlistEntry.find = async () => [pastEntry];
  WaitlistEntry.findOneAndUpdate = async () => null;

  const entries = await expirePastWaitlistEntries(new Date("2099-06-01"));

  assert.equal(entries.length, 0);
  assert.equal(pastEntry.status, "active");
});

test("expirePastWaitlistEntries stops immediately on lease loss", async () => {
  const firstEntry = createMockEntry({ _id: "past-first-entry", date: pastDate });
  const secondEntry = createMockEntry({ _id: "past-second-entry", date: pastDate });
  const error = new Error("lease lost");
  error.code = "scheduler_lease_lost";
  let calls = 0;

  WaitlistEntry.find = async () => [firstEntry, secondEntry];

  await assert.rejects(
    () =>
      expirePastWaitlistEntries({
        now: new Date("2099-06-01"),
        leaseContext: {
          withFencedWrite: async () => {
            calls += 1;
            throw error;
          },
        },
      }),
    error
  );

  assert.equal(calls, 1);
});

test("expirePastWaitlistEntries lets a new owner recover an abandoned entry", async () => {
  const pastEntry = createMockEntry({ _id: "past-recovery-entry", date: pastDate });
  const staleError = new Error("lease lost");
  staleError.code = "scheduler_lease_lost";
  let staleCalls = 0;

  WaitlistEntry.find = async () => [pastEntry];

  await assert.rejects(
    () =>
      expirePastWaitlistEntries({
        now: new Date("2099-06-01"),
        leaseContext: {
          withFencedWrite: async () => {
            staleCalls += 1;
            throw staleError;
          },
        },
      }),
    staleError
  );

  mockFindOneAndUpdateForEntries([pastEntry]);
  const recovered = await expirePastWaitlistEntries({
    now: new Date("2099-06-01"),
    leaseContext: {
      withFencedWrite: (write) => write({ session: { owner: "new" } }),
    },
  });

  assert.equal(staleCalls, 1);
  assert.equal(recovered.length, 1);
  assert.equal(pastEntry.status, "expired");
});

test("no matching active entries returns 0", async () => {
  WaitlistEntry.find = async () => [];

  const count = await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
  });

  assert.equal(count, 0);
});

test("only active entries are notified (query filters by status)", async () => {
  // The service queries WaitlistEntry.find with { status: "active" },
  // so notified entries are never fetched. We verify the query filter.
  let queryFilter = null;

  WaitlistEntry.find = (query) => {
    queryFilter = query;
    return [];
  };

  await notifyMatchingWaitlistEntries({
    barberId,
    date: futureDate,
    serviceId,
  });

  assert.ok(queryFilter);
  assert.equal(queryFilter.status, "active");
});
