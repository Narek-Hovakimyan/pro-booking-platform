import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Notification from "../../models/Notification.js";
import {
  REMINDER_LEAD_MINUTES,
  getEventStart,
  sendEventReminders,
} from "./eventReminders.js";
import {
  createEventReminderDispatchService,
  DEFAULT_EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS,
} from "./eventReminderDispatchService.js";

const originalMethods = {
  notificationCreate: Notification.create,
  notificationFindOne: Notification.findOne,
};

afterEach(() => {
  Notification.create = originalMethods.notificationCreate;
  Notification.findOne = originalMethods.notificationFindOne;
});

const createRegistration = (overrides = {}) => ({
  _id: `registration-${Math.random().toString(36).slice(2, 9)}`,
  userId: "64b000000000000000000001",
  barberId: null,
  status: "approved",
  reminderSentAt: null,
  eventId: {
    _id: "64b000000000000000000010",
    title: "Masterclass",
    date: "2099-07-02",
    time: "13:59",
    status: "upcoming",
  },
  ...overrides,
});

const cloneRegistration = (registration) => ({
  ...registration,
  eventId: registration.eventId ? { ...registration.eventId } : registration.eventId,
});

const createQuery = (value) => ({
  populate() {
    return this;
  },
  lean: async () => value,
});

const createRegistrationModel = (initialRegistrations = []) => {
  const registrations = initialRegistrations.map(cloneRegistration);

  const matches = (registration, filter) =>
    Object.entries(filter).every(([key, value]) => {
      if (key === "$or") {
        return value.some((entry) => matches(registration, entry));
      }
      if (value === null) {
        return registration[key] === null || registration[key] === undefined;
      }
      return String(registration[key]) === String(value);
    });

  return {
    registrations,
    find(query) {
      return createQuery(registrations.filter((registration) => matches(registration, query)));
    },
    findOne(query) {
      return createQuery(
        registrations.find((registration) => matches(registration, query)) || null
      );
    },
    async findOneAndUpdate(query, update) {
      const registration = registrations.find((entry) => matches(entry, query));
      if (!registration) return null;

      for (const [key, value] of Object.entries(update.$set || {})) {
        registration[key] = value;
      }

      return cloneRegistration(registration);
    },
  };
};

const createDispatchModel = (initialDispatches = []) => {
  const dispatches = initialDispatches.map((dispatch) => ({ ...dispatch }));
  let duplicateOnUpsert = false;

  const matches = (dispatch, filter) =>
    Object.entries(filter).every(([key, value]) => {
      if (key === "$or") {
        return value.some((entry) => matches(dispatch, entry));
      }
      if (value && typeof value === "object" && "$lte" in value) {
        return dispatch[key] <= value.$lte;
      }
      if (value && typeof value === "object" && "$in" in value) {
        return value.$in.some((entry) => String(entry) === String(dispatch[key]));
      }
      return String(dispatch[key]) === String(value);
    });

  const applyUpdate = (dispatch, update, isInsert) => {
    for (const [key, value] of Object.entries(update.$setOnInsert || {})) {
      if (isInsert) dispatch[key] = value;
    }
    for (const [key, value] of Object.entries(update.$set || {})) {
      dispatch[key] = value;
    }
    for (const [key, value] of Object.entries(update.$inc || {})) {
      dispatch[key] = (dispatch[key] || 0) + value;
    }
    dispatch.updatedAt = new Date("2099-07-01T09:55:00.000Z");
    return dispatch;
  };

  return {
    dispatches,
    setDuplicateOnUpsert(value) {
      duplicateOnUpsert = value;
    },
    async findOne(filter) {
      return dispatches.find((dispatch) => matches(dispatch, filter)) || null;
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const existing = dispatches.find((dispatch) => matches(dispatch, filter));

      if (existing) {
        return applyUpdate(existing, update, false);
      }

      if (!options.upsert) {
        return null;
      }

      if (duplicateOnUpsert) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }

      const created = applyUpdate(
        {
          _id: `dispatch-${dispatches.length + 1}`,
          eventRegistrationId: filter.eventRegistrationId,
          userId: filter.userId,
          status: "claimed",
          claimToken: "",
          claimedAt: null,
          sentAt: null,
          attempts: 0,
          failureCode: "",
        },
        update,
        true
      );

      dispatches.push(created);
      return created;
    },
  };
};

const createDispatchService = ({
  dispatchModel,
  now = () => new Date("2099-07-01T09:55:00.000Z"),
  claimTokenFactory = (() => {
    let count = 0;
    return () => `claim-${++count}`;
  })(),
  staleClaimTimeoutMs = DEFAULT_EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS,
} = {}) =>
  createEventReminderDispatchService({
    model: dispatchModel,
    now,
    claimTokenFactory,
    staleClaimTimeoutMs,
  });

test("approved participant gets reminder once in the 24h window", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registrationModel = createRegistrationModel([createRegistration()]);
  const dispatchModel = createDispatchModel();
  const dispatchService = createDispatchService({ dispatchModel, now: () => now });
  const notifications = [];

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService,
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(sentCount, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_reminder");
  assert.equal(
    notifications[0].message,
    "Reminder: Your event 'Masterclass' starts tomorrow at 13:59."
  );
  assert.deepEqual(notifications[0].data, {
    eventId: registrationModel.registrations[0].eventId._id,
    eventRegistrationId: registrationModel.registrations[0]._id,
  });
  assert.equal(
    notifications[0].idempotencyKey,
    `event-reminder:v2:${registrationModel.registrations[0]._id}:${registrationModel.registrations[0].userId}`
  );
  assert.equal(registrationModel.registrations[0].reminderSentAt instanceof Date, true);
  assert.equal(dispatchModel.dispatches[0].status, "sent");
});

test("getEventStart parses Armenia time as UTC+04:00 independent of server timezone", () => {
  const startsAt = getEventStart({ date: "2099-07-02", time: "13:59" });

  assert.ok(startsAt instanceof Date);
  assert.equal(startsAt.getTime(), new Date("2099-07-02T09:59:00Z").getTime());
});

test("getEventStart returns null for missing date or time", () => {
  assert.equal(getEventStart({ date: "2099-07-02" }), null);
  assert.equal(getEventStart({ time: "13:59" }), null);
  assert.equal(getEventStart({}), null);
  assert.equal(getEventStart(null), null);
});

test("non-deliverable registration states are skipped", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registrationModel = createRegistrationModel([
    createRegistration({ status: "pending" }),
    createRegistration({ _id: "registration-rejected", status: "rejected" }),
    createRegistration({ _id: "registration-cancelled", status: "cancelled" }),
    createRegistration({
      _id: "registration-expired",
      eventId: { ...createRegistration().eventId, time: "10:30" },
    }),
  ]);
  const notifications = [];

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel: createDispatchModel(),
    dispatchService: createDispatchService({ dispatchModel: createDispatchModel(), now: () => now }),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(sentCount, 0);
  assert.equal(notifications.length, 0);
});

test("completed recipients are not resent after dispatch is sent", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration({ reminderSentAt: new Date(now) });
  const registrationModel = createRegistrationModel([registration]);
  const notifications = [];

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel: createDispatchModel(),
    dispatchService: createDispatchService({ dispatchModel: createDispatchModel(), now: () => now }),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(sentCount, 0);
  assert.equal(notifications.length, 0);
});

test("sent dispatch finalizes legacy reminder without creating another notification", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration();
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel([
    {
      _id: "dispatch-sent",
      eventRegistrationId: registration._id,
      userId: registration.userId,
      status: "sent",
      claimToken: "claim-sent",
      claimedAt: new Date("2099-07-01T09:50:00.000Z"),
      sentAt: new Date("2099-07-01T09:51:00.000Z"),
      attempts: 1,
      failureCode: "",
    },
  ]);
  const notifications = [];

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService: createDispatchService({ dispatchModel, now: () => now }),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(sentCount, 1);
  assert.equal(notifications.length, 0);
  assert.equal(registrationModel.registrations[0].reminderSentAt instanceof Date, true);
});

test("concurrent workers share one recipient dispatch and only deliver once", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration();
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel();
  const dispatchService = createDispatchService({ dispatchModel, now: () => now });
  let notificationCalls = 0;

  const results = await Promise.all([
    sendEventReminders(now, {
      registrationModel,
      dispatchModel,
      dispatchService,
      createNotification: async (payload) => {
        notificationCalls += 1;
        return payload;
      },
    }),
    sendEventReminders(now, {
      registrationModel,
      dispatchModel,
      dispatchService,
      createNotification: async (payload) => {
        notificationCalls += 1;
        return payload;
      },
    }),
  ]);

  assert.deepEqual(results.sort((a, b) => a - b), [0, 1]);
  assert.equal(notificationCalls, 1);
  assert.equal(dispatchModel.dispatches.length, 1);
  assert.equal(dispatchModel.dispatches[0].status, "sent");
});

test("concurrent sent-dispatch recovery finalizes reminder once without notifying", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration();
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel([
    {
      _id: "dispatch-sent-concurrent",
      eventRegistrationId: registration._id,
      userId: registration.userId,
      status: "sent",
      claimToken: "claim-sent-concurrent",
      claimedAt: new Date("2099-07-01T09:50:00.000Z"),
      sentAt: new Date("2099-07-01T09:51:00.000Z"),
      attempts: 1,
      failureCode: "",
    },
  ]);
  const dispatchService = createDispatchService({ dispatchModel, now: () => now });
  let notificationCalls = 0;

  const results = await Promise.all([
    sendEventReminders(now, {
      registrationModel,
      dispatchModel,
      dispatchService,
      createNotification: async (payload) => {
        notificationCalls += 1;
        return payload;
      },
    }),
    sendEventReminders(now, {
      registrationModel,
      dispatchModel,
      dispatchService,
      createNotification: async (payload) => {
        notificationCalls += 1;
        return payload;
      },
    }),
  ]);

  assert.deepEqual(results.sort((a, b) => a - b), [0, 1]);
  assert.equal(notificationCalls, 0);
  assert.equal(registrationModel.registrations[0].reminderSentAt instanceof Date, true);
});

test("duplicate-key claim races fail closed without notifying", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registrationModel = createRegistrationModel([createRegistration()]);
  const dispatchModel = createDispatchModel();
  dispatchModel.setDuplicateOnUpsert(true);
  const dispatchService = createDispatchService({ dispatchModel, now: () => now });
  const notifications = [];

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService,
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(sentCount, 0);
  assert.equal(notifications.length, 0);
  assert.equal(dispatchModel.dispatches.length, 0);
});

test("stale claimed dispatch recovers after notification already persisted", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration();
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel([
    {
      _id: "dispatch-1",
      eventRegistrationId: registration._id,
      userId: registration.userId,
      status: "claimed",
      claimToken: "stale-claim",
      claimedAt: new Date(now.getTime() - 10 * 60 * 1000),
      sentAt: null,
      attempts: 1,
      failureCode: "",
    },
  ]);
  const dispatchService = createDispatchService({
    dispatchModel,
    now: () => now,
    staleClaimTimeoutMs: 60 * 1000,
    claimTokenFactory: () => "fresh-claim",
  });
  const notifications = [];

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService,
    createNotification: async (payload) => {
      notifications.push(payload);
      return { _id: "notification-1", ...payload };
    },
  });

  assert.equal(sentCount, 1);
  assert.equal(notifications.length, 1);
  assert.equal(dispatchModel.dispatches[0].status, "sent");
  assert.equal(dispatchModel.dispatches[0].attempts, 2);
});

test("stale retry reuses existing durable notification after title and time edits", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration({
    eventId: {
      ...createRegistration().eventId,
      title: "Rescheduled Masterclass",
      time: "14:02",
    },
  });
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel([
    {
      _id: "dispatch-existing-notification",
      eventRegistrationId: registration._id,
      userId: registration.userId,
      status: "claimed",
      claimToken: "stale-claim",
      claimedAt: new Date(now.getTime() - 10 * 60 * 1000),
      sentAt: null,
      attempts: 1,
      failureCode: "",
    },
  ]);
  const dispatchService = createDispatchService({
    dispatchModel,
    now: () => now,
    staleClaimTimeoutMs: 60 * 1000,
    claimTokenFactory: () => "fresh-claim",
  });
  let notificationCalls = 0;
  let lookupCalls = 0;

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService,
    findNotificationByIdentity: async (identity) => {
      lookupCalls += 1;
      assert.deepEqual(identity, {
        eventRegistrationId: registration._id,
        userId: registration.userId,
      });
      return {
        _id: "notification-existing",
        userId: registration.userId,
        type: "event_reminder",
        data: {
          eventRegistrationId: registration._id,
          eventId: registration.eventId._id,
        },
      };
    },
    createNotification: async () => {
      notificationCalls += 1;
      throw new Error("should not create duplicate reminder");
    },
  });

  assert.equal(sentCount, 1);
  assert.equal(lookupCalls, 1);
  assert.equal(notificationCalls, 0);
  assert.equal(dispatchModel.dispatches[0].status, "sent");
  assert.equal(registrationModel.registrations[0].reminderSentAt instanceof Date, true);
});

test("existing durable notification completes reminder without a second send when identity is unchanged", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration();
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel([
    {
      _id: "dispatch-existing-same-identity",
      eventRegistrationId: registration._id,
      userId: registration.userId,
      status: "claimed",
      claimToken: "stale-claim",
      claimedAt: new Date(now.getTime() - 10 * 60 * 1000),
      sentAt: null,
      attempts: 1,
      failureCode: "",
    },
  ]);
  const dispatchService = createDispatchService({
    dispatchModel,
    now: () => now,
    staleClaimTimeoutMs: 60 * 1000,
    claimTokenFactory: () => "fresh-claim",
  });
  let notificationCalls = 0;

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService,
    findNotificationByIdentity: async () => ({
      _id: "notification-existing-same-identity",
      userId: registration.userId,
      type: "event_reminder",
      data: {
        eventRegistrationId: registration._id,
        eventId: registration.eventId._id,
      },
    }),
    createNotification: async () => {
      notificationCalls += 1;
      return null;
    },
  });

  assert.equal(sentCount, 1);
  assert.equal(notificationCalls, 0);
  assert.equal(dispatchModel.dispatches[0].status, "sent");
});

test("notification failure marks dispatch failed without finalizing legacy timestamp", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration();
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel();
  const dispatchService = createDispatchService({ dispatchModel, now: () => now });

  const error = new Error("socket not relevant");
  error.code = "provider_down";

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService,
    createNotification: async () => {
      throw error;
    },
  });

  assert.equal(sentCount, 0);
  assert.equal(dispatchModel.dispatches[0].status, "failed");
  assert.equal(dispatchModel.dispatches[0].failureCode, "provider_down");
  assert.equal(registrationModel.registrations[0].reminderSentAt, null);
});

test("sent-dispatch recovery fails closed when registration is no longer valid", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration();
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel([
    {
      _id: "dispatch-sent-invalid",
      eventRegistrationId: registration._id,
      userId: registration.userId,
      status: "sent",
      claimToken: "claim-sent-invalid",
      claimedAt: new Date("2099-07-01T09:50:00.000Z"),
      sentAt: new Date("2099-07-01T09:51:00.000Z"),
      attempts: 1,
      failureCode: "",
    },
  ]);
  registrationModel.registrations[0].eventId.status = "cancelled";
  const notifications = [];

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService: createDispatchService({ dispatchModel, now: () => now }),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(sentCount, 0);
  assert.equal(notifications.length, 0);
  assert.equal(registrationModel.registrations[0].reminderSentAt, null);
});

test("malformed reminder identity fails closed without claim or notification", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registration = createRegistration({ _id: "   " });
  const registrationModel = createRegistrationModel([registration]);
  const dispatchModel = createDispatchModel();
  const dispatchService = createDispatchService({ dispatchModel, now: () => now });
  let notificationCalls = 0;

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService,
    createNotification: async () => {
      notificationCalls += 1;
      return null;
    },
  });

  assert.equal(sentCount, 0);
  assert.equal(notificationCalls, 0);
  assert.equal(dispatchModel.dispatches.length, 0);
  assert.equal(registrationModel.registrations[0].reminderSentAt, null);
});

test("cancellation, reschedule, invalid status, or recipient changes after claim do not notify stale users", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const cases = [
    {
      name: "cancelled",
      mutate(registration) {
        registration.eventId.status = "cancelled";
      },
    },
    {
      name: "rescheduled",
      mutate(registration) {
        registration.eventId.time = "16:30";
      },
    },
    {
      name: "rejected",
      mutate(registration) {
        registration.status = "rejected";
      },
    },
    {
      name: "recipient_changed",
      mutate(registration) {
        registration.userId = "64b000000000000000000099";
      },
    },
  ];

  for (const testCase of cases) {
    const registration = createRegistration({ _id: `registration-${testCase.name}` });
    const registrationModel = createRegistrationModel([registration]);
    const dispatchModel = createDispatchModel();
    const dispatchService = createDispatchService({ dispatchModel, now: () => now });
    const notifications = [];
    let mutated = false;

    const originalFindOne = registrationModel.findOne.bind(registrationModel);
    registrationModel.findOne = (query) => ({
      populate() {
        return this;
      },
      lean: async () => {
        const result = await originalFindOne(query).lean();
        if (!mutated && result) {
          testCase.mutate(registrationModel.registrations[0]);
          mutated = true;
        }
        return cloneRegistration(
          registrationModel.registrations.find((entry) => String(entry._id) === String(query._id))
        );
      },
    });

    const sentCount = await sendEventReminders(now, {
      registrationModel,
      dispatchModel,
      dispatchService,
      createNotification: async (payload) => {
        notifications.push(payload);
        return payload;
      },
    });

    assert.equal(sentCount, 0, testCase.name);
    assert.equal(notifications.length, 0, testCase.name);
    assert.equal(dispatchModel.dispatches[0].status, "failed", testCase.name);
    assert.equal(dispatchModel.dispatches[0].failureCode, "registration_invalid");
    assert.equal(registrationModel.registrations[0].reminderSentAt, null, testCase.name);
  }
});

test("missing recipients are skipped and do not create claims", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registrationModel = createRegistrationModel([
    createRegistration({ userId: null, barberId: null }),
  ]);
  const dispatchModel = createDispatchModel();

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService: createDispatchService({ dispatchModel, now: () => now }),
    createNotification: async () => {
      throw new Error("should not run");
    },
  });

  assert.equal(sentCount, 0);
  assert.equal(dispatchModel.dispatches.length, 0);
});

test("legacy fallback recipient is supported and finalized only after send", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const registrationModel = createRegistrationModel([
    createRegistration({ userId: null, barberId: "64b000000000000000000077" }),
  ]);
  const dispatchModel = createDispatchModel();
  const notifications = [];

  const sentCount = await sendEventReminders(now, {
    registrationModel,
    dispatchModel,
    dispatchService: createDispatchService({ dispatchModel, now: () => now }),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(sentCount, 1);
  assert.equal(String(notifications[0].userId), "64b000000000000000000077");
  assert.equal(registrationModel.registrations[0].reminderSentAt instanceof Date, true);
});

test("production stale-claim timeout stays positive", () => {
  assert.equal(DEFAULT_EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS > 0, true);
  assert.equal(REMINDER_LEAD_MINUTES, 24 * 60);
});
