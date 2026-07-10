import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import EventRegistration from "../../models/EventRegistration.js";
import Notification from "../../models/Notification.js";
import {
  REMINDER_LEAD_MINUTES,
  getEventStart,
  sendEventReminders,
} from "./eventReminders.js";


const originalMethods = {
  registrationFind: EventRegistration.find,
  registrationFindOneAndUpdate: EventRegistration.findOneAndUpdate,
  notificationCreate: Notification.create,
};

afterEach(() => {
  EventRegistration.find = originalMethods.registrationFind;
  EventRegistration.findOneAndUpdate = originalMethods.registrationFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
});

const createQuery = (value) => ({
  populate() {
    return this;
  },
  lean: async () => value,
});

const createRegistration = (overrides = {}) => ({
  _id: `registration-${Math.random().toString(36).slice(2, 9)}`,
  userId: "64b000000000000000000001",
  status: "approved",
  reminderSentAt: null,
  eventId: {
    _id: "64b000000000000000000010",
    title: "Masterclass",
    date: "2099-07-02",
    time: "14:00",
    status: "upcoming",
  },
  ...overrides,
});

const matchesQuery = (registration, query = {}) =>
  Object.entries(query).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("$ne" in value) {
        return registration[key] !== value.$ne;
      }
      return false;
    }

    // MongoDB { field: null } matches both null and missing (undefined) fields
    if (value === null) {
      return registration[key] === null || registration[key] === undefined;
    }

    return registration[key] === value;
  });

/**
 * Check whether a registration matches a findOneAndUpdate filter that
 * may contain an $or array. Returns true if the registration would be
 * considered eligible for the atomic claim.
 */
const matchesFindOneAndUpdateFilter = (registration, query) => {
  for (const [key, value] of Object.entries(query)) {
    if (key === "$or" && Array.isArray(value)) {
      const orMatch = value.some((condition) => {
        for (const [orKey, orVal] of Object.entries(condition)) {
          if (orVal && typeof orVal === "object" && "$exists" in orVal) {
            if (orVal.$exists === false) {
              if (registration[orKey] === undefined) return true;
            }
            return false;
          }
          if (registration[orKey] !== orVal) return false;
        }
        return true;
      });
      if (!orMatch) return false;
    } else if (registration[key] !== value) {
      return false;
    }
  }
  return true;
};

test("approved participant gets reminder once in the 24h window", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const notifications = [];
  let findOneAndUpdateCalled = false;

  const registrations = [
    createRegistration({
      eventId: {
        _id: "64b000000000000000000010",
        title: "Masterclass",
        date: "2099-07-02",
        time: "13:59",
        status: "upcoming",
      },
    }),
  ];
  EventRegistration.find = (query) =>
    createQuery(registrations.filter((r) => matchesQuery(r, query)));
  EventRegistration.findOneAndUpdate = async (query, update, options) => {
    const match = registrations.find((r) => matchesFindOneAndUpdateFilter(r, query));
    if (!match) return null;
    findOneAndUpdateCalled = true;
    return { ...match, ...update.$set };
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const sentCount = await sendEventReminders(now);

  assert.equal(sentCount, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "event_reminder");
  assert.deepEqual(notifications[0].data, {
    eventId: registrations[0].eventId._id,
    eventRegistrationId: registrations[0]._id,
  });
  assert.equal(findOneAndUpdateCalled, true);
  assert.equal(
    notifications[0].message,
    "Reminder: Your event 'Masterclass' starts tomorrow at 13:59."
  );
});

test("pending, rejected, cancelled, and waitlisted users do not get reminders", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const notifications = [];

  const registrations = [
      createRegistration({ status: "pending" }),
      createRegistration({ status: "rejected" }),
      createRegistration({ status: "cancelled" }),
      createRegistration({ status: "waitlisted" }),
    ];
  EventRegistration.find = (query) =>
    createQuery(registrations.filter((r) => matchesQuery(r, query)));
  EventRegistration.findOneAndUpdate = async () => null;
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const sentCount = await sendEventReminders(now);

  assert.equal(sentCount, 0);
  assert.equal(notifications.length, 0);
});

test("getEventStart parses Armenia time as UTC+04:00 independent of server timezone", () => {
  // Event at 13:59 Armenia time should be 09:59 UTC
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


test("reminder is not duplicated when reminderSentAt already exists", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const notifications = [];

  const registrations = [
      createRegistration({
        reminderSentAt: new Date(now.getTime() - REMINDER_LEAD_MINUTES * 60 * 1000),
      }),
    ];
  EventRegistration.find = (query) =>
    createQuery(registrations.filter((r) => matchesQuery(r, query)));
  // find() filters by reminderSentAt: null, so no registrations are returned
  EventRegistration.findOneAndUpdate = async () => null;
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const sentCount = await sendEventReminders(now);

  assert.equal(sentCount, 0);
  assert.equal(notifications.length, 0);
});

test("reminder notification is sent only once when same registration is processed twice", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  let claimCount = 0;
  const notifications = [];

  const registration = createRegistration({
    eventId: {
      title: "Masterclass",
      date: "2099-07-02",
      time: "13:59",
      status: "upcoming",
    },
  });

  let claimed = false;

  EventRegistration.find = (query) => {
    if (query.reminderSentAt === null && !claimed) {
      return createQuery([registration]);
    }
    return createQuery([]);
  };

  EventRegistration.findOneAndUpdate = async (query, update) => {
    if (query._id === registration._id && !claimed && matchesFindOneAndUpdateFilter(registration, query)) {
      claimed = true;
      claimCount++;
      return { ...registration, ...(update.$set || {}) };
    }
    return null;
  };

  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // First run — should send reminder
  const sentCount1 = await sendEventReminders(now);
  assert.equal(sentCount1, 1);

  // Second run — should NOT send duplicate
  const sentCount2 = await sendEventReminders(now);
  assert.equal(sentCount2, 0);

  // Only one notification total
  assert.equal(notifications.length, 1);
  assert.equal(claimCount, 1);
});

test("reminder is sent when reminderSentAt field is missing", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const notifications = [];

  // Registration object without reminderSentAt field at all
  const registrations = [
    {
      _id: "no-field-reg-1",
      userId: "64b000000000000000000001",
      status: "approved",
      eventId: {
        _id: "64b000000000000000000010",
        title: "Masterclass",
        date: "2099-07-02",
        time: "13:59",
        status: "upcoming",
      },
      // reminderSentAt deliberately omitted — field does not exist
    },
  ];
  EventRegistration.find = (query) =>
    createQuery(registrations.filter((r) => matchesQuery(r, query)));
  EventRegistration.findOneAndUpdate = async (query, update) => {
    const match = matchesFindOneAndUpdateFilter(registrations[0], query);
    if (!match) return null;
    return { ...registrations[0], ...update.$set };
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const sentCount = await sendEventReminders(now);

  assert.equal(sentCount, 1);
  assert.equal(notifications.length, 1);
});

test("findOneAndUpdate returning null does not create notification", async () => {
  const now = new Date("2099-07-01T09:55:00Z");
  const notifications = [];

  // Registration passes find() but findOneAndUpdate always returns null
  const registrations = [
    createRegistration({
      eventId: {
        title: "Masterclass",
        date: "2099-07-02",
        time: "13:59",
        status: "upcoming",
      },
    }),
  ];
  EventRegistration.find = (query) =>
    createQuery(registrations.filter((r) => matchesQuery(r, query)));
  EventRegistration.findOneAndUpdate = async () => null;
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const sentCount = await sendEventReminders(now);

  assert.equal(sentCount, 0);
  assert.equal(notifications.length, 0);
});
