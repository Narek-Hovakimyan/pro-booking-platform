import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import Notification from "../models/Notification.js";
import Booking from "../models/Booking.js";

import { runBookingReminders } from "./bookingReminderService.js";

const originalMethods = {
  bookingFind: Booking.find,
  bookingFindOneAndUpdate: Booking.findOneAndUpdate,
  notificationCreate: Notification.create,
};

afterEach(() => {
  Booking.find = originalMethods.bookingFind;
  Booking.findOneAndUpdate = originalMethods.bookingFindOneAndUpdate;
  Notification.create = originalMethods.notificationCreate;
});

const matchesQuery = (booking, query) =>
  Object.entries(query).every(([key, value]) => {
    if (value === null) return booking[key] == null;
    return booking[key] === value;
  });

const setBookings = (bookings) => {
  Booking.find = async () => bookings;
  Booking.findOneAndUpdate = async (query, update) => {
    const booking = bookings.find((item) => matchesQuery(item, query));

    if (!booking) return null;

    for (const [key, value] of Object.entries(update.$set || {})) {
      booking[key] = value;
    }

    return booking;
  };
};

const createBooking = (overrides = {}) => ({
  _id: "booking-1",
  barberId: "64b000000000000000000001",
  barberName: "John Barber",
  clientId: "64b000000000000000000002",
  clientName: "Jane Client",
  bookingDate: "2026-05-08",
  time: "10:00",
  status: "accepted",
  reminder24hSentAt: null,
  reminder2hSentAt: null,
  async save() {
    this.saved = true;
    return this;
  },
  ...overrides,
});

test("server does not auto-start the legacy booking reminder cron", async () => {
  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

  assert.equal(serverSource.includes('import("../cron/bookingReminders.js")'), false);
  assert.equal(serverSource.includes("cron/bookingReminders"), false);
});

// --- 24h reminder tests ---

test("24h reminder creates client and barber notifications for accepted booking", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
    barberName: "John Barber",
    clientName: "Jane Client",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // Now is 2026-05-07T11:00 -> booking is in 23h (within 24h window)
  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  assert.equal(result.remindersSent, 1);
  assert.ok(booking.reminder24hSentAt instanceof Date);
  assert.equal(notifications.length, 2);

  const clientNotif = notifications.find(
    (n) => n.userId === booking.clientId
  );
  const barberNotif = notifications.find(
    (n) => n.userId === booking.barberId
  );

  assert.ok(clientNotif);
  assert.equal(clientNotif.type, "booking_reminder_24h");
  assert.deepEqual(clientNotif.data, { bookingId: booking._id });
  assert.equal(
    clientNotif.message,
    "Reminder: your appointment with John Barber is tomorrow at 10:00."
  );

  assert.ok(barberNotif);
  assert.equal(barberNotif.type, "booking_reminder_24h");
  assert.deepEqual(barberNotif.data, { bookingId: booking._id });
  assert.equal(
    barberNotif.message,
    "Reminder: you have an appointment with Jane Client tomorrow at 10:00."
  );
});

test("24h reminder uses fallback names when barberName or clientName is missing", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "14:30",
    barberName: undefined,
    clientName: undefined,
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T15:00:00+04:00"));

  assert.equal(result.remindersSent, 1);

  const clientNotif = notifications.find(
    (n) => n.userId === booking.clientId
  );
  const barberNotif = notifications.find(
    (n) => n.userId === booking.barberId
  );

  assert.ok(clientNotif);
  assert.equal(
    clientNotif.message,
    "Reminder: your appointment with your barber is tomorrow at 14:30."
  );
  assert.ok(barberNotif);
  assert.equal(
    barberNotif.message,
    "Reminder: you have an appointment with your client tomorrow at 14:30."
  );
});

// --- 2h reminder tests ---

test("2h reminder creates client and barber notifications for accepted booking", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // Now is 2026-05-08T08:00 -> booking is in 2h (within 2h window)
  const result = await runBookingReminders(new Date("2026-05-08T08:00:00+04:00"));

  assert.equal(result.remindersSent, 1);
  assert.ok(booking.reminder2hSentAt instanceof Date);
  assert.equal(notifications.length, 2);

  const clientNotif = notifications.find(
    (n) => n.userId === booking.clientId
  );
  const barberNotif = notifications.find(
    (n) => n.userId === booking.barberId
  );

  assert.ok(clientNotif);
  assert.equal(clientNotif.type, "booking_reminder_2h");
  assert.deepEqual(clientNotif.data, { bookingId: booking._id });
  assert.equal(clientNotif.message, "Your appointment starts in 2 hours.");

  assert.ok(barberNotif);
  assert.equal(barberNotif.type, "booking_reminder_2h");
  assert.deepEqual(barberNotif.data, { bookingId: booking._id });
  assert.equal(barberNotif.message, "Your appointment starts in 2 hours.");
});

// --- Idempotency tests ---

test("24h reminder is not duplicated if reminder24hSentAt already set", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
    reminder24hSentAt: new Date("2026-05-07T09:00:00+04:00"),
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
  assert.equal(notifications.length, 0);
});

test("2h reminder is not duplicated if reminder2hSentAt already set", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
    reminder2hSentAt: new Date("2026-05-08T07:00:00+04:00"),
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-08T08:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
  assert.equal(notifications.length, 0);
});

test("24h reminder is not sent if 2h reminder was already sent (prevents overlap)", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
    reminder2hSentAt: new Date("2026-05-08T08:00:00+04:00"),
    reminder24hSentAt: null,
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // This is the same window where both 2h and 24h would apply
  const result = await runBookingReminders(new Date("2026-05-08T08:30:00+04:00"));

  assert.equal(result.remindersSent, 0);
  assert.equal(notifications.length, 0);
});

// --- Status filter tests ---

test("pending booking does not get reminders", async () => {
  const booking = createBooking({
    status: "pending",
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
  assert.equal(notifications.length, 0);
});

test("rejected booking does not get reminders", async () => {
  const booking = createBooking({
    status: "rejected",
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
});

test("cancelled booking does not get reminders", async () => {
  const booking = createBooking({
    status: "cancelled",
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
});

test("completed booking does not get reminders", async () => {
  const booking = createBooking({
    status: "completed",
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
});

test("expired booking does not get reminders", async () => {
  const booking = createBooking({
    status: "expired",
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
});

// --- Past booking test ---

test("past booking does not get reminders", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-07",
    time: "09:00",
    status: "accepted",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // Now is 2026-05-07T10:00 -> booking was at 09:00, already started
  const result = await runBookingReminders(new Date("2026-05-07T10:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
  assert.equal(notifications.length, 0);
});

// --- Window boundary tests ---

test("booking outside 24h window does not get 24h reminder", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-09",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // Now is 2026-05-07T10:00 -> booking is in 48h (outside 24h window)
  const result = await runBookingReminders(new Date("2026-05-07T10:00:00+04:00"));

  assert.equal(result.remindersSent, 0);
  assert.equal(notifications.length, 0);
});

test("booking exactly at 24h boundary gets reminder", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // Now is 2026-05-07T10:00 -> booking is exactly 24h from now
  const result = await runBookingReminders(new Date("2026-05-07T10:00:00+04:00"));

  assert.equal(result.remindersSent, 1);
  assert.equal(notifications.length, 2);
});

test("booking exactly at 2h boundary gets 2h reminder (not 24h)", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  // Now is 2026-05-08T08:00 -> booking is exactly 2h from now
  const result = await runBookingReminders(new Date("2026-05-08T08:00:00+04:00"));

  assert.equal(result.remindersSent, 1);
  assert.ok(booking.reminder2hSentAt instanceof Date);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].type, "booking_reminder_2h");
});

test("multiple accepted bookings each get their own reminders", async () => {
  const booking1 = createBooking({
    _id: "booking-a",
    bookingDate: "2026-05-08",
    time: "10:00",
    barberId: "64b100000000000000000001",
    clientId: "64b200000000000000000002",
    barberName: "Alice",
    clientName: "Bob",
  });
  const booking2 = createBooking({
    _id: "booking-b",
    bookingDate: "2026-05-08",
    time: "10:30",
    barberId: "64b300000000000000000003",
    clientId: "64b400000000000000000004",
    barberName: "Charlie",
    clientName: "Diana",
  });
  const notifications = [];

  setBookings([booking1, booking2]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  assert.equal(result.remindersSent, 2);
  assert.ok(booking1.reminder24hSentAt instanceof Date);
  assert.ok(booking2.reminder24hSentAt instanceof Date);
  assert.equal(notifications.length, 4);
});

test("booking with no clientId still sends barber notification", async () => {
  const booking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
    clientId: null,
    barberName: "Solo Barber",
    clientName: "Guest",
  });
  const notifications = [];

  setBookings([booking]);
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const result = await runBookingReminders(new Date("2026-05-07T11:00:00+04:00"));

  // 1 reminder because only barber got notified (no clientId)
  assert.equal(result.remindersSent, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, booking.barberId);
});

test("concurrent runs do not duplicate 24h reminders", async () => {
  const storedBooking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];
  let findCalls = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => {
    releaseFinds = resolve;
  });

  Booking.find = async () => {
    findCalls++;
    if (findCalls === 2) releaseFinds();
    await bothFindsStarted;
    return [createBooking({ ...storedBooking })];
  };
  Booking.findOneAndUpdate = async (query, update) => {
    if (!matchesQuery(storedBooking, query)) return null;

    for (const [key, value] of Object.entries(update.$set || {})) {
      storedBooking[key] = value;
    }

    return { ...storedBooking };
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const results = await Promise.all([
    runBookingReminders(new Date("2026-05-07T11:00:00+04:00")),
    runBookingReminders(new Date("2026-05-07T11:00:00+04:00")),
  ]);

  assert.equal(results[0].remindersSent + results[1].remindersSent, 1);
  assert.ok(storedBooking.reminder24hSentAt instanceof Date);
  assert.equal(notifications.length, 2);
  assert.equal(
    notifications.filter((notification) => notification.type === "booking_reminder_24h").length,
    2
  );
});

test("concurrent runs do not duplicate 2h reminders", async () => {
  const storedBooking = createBooking({
    bookingDate: "2026-05-08",
    time: "10:00",
  });
  const notifications = [];
  let findCalls = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => {
    releaseFinds = resolve;
  });

  Booking.find = async () => {
    findCalls++;
    if (findCalls === 2) releaseFinds();
    await bothFindsStarted;
    return [createBooking({ ...storedBooking })];
  };
  Booking.findOneAndUpdate = async (query, update) => {
    if (!matchesQuery(storedBooking, query)) return null;

    for (const [key, value] of Object.entries(update.$set || {})) {
      storedBooking[key] = value;
    }

    return { ...storedBooking };
  };
  Notification.create = async (payload) => {
    notifications.push(payload);
    return payload;
  };

  const results = await Promise.all([
    runBookingReminders(new Date("2026-05-08T08:00:00+04:00")),
    runBookingReminders(new Date("2026-05-08T08:00:00+04:00")),
  ]);

  assert.equal(results[0].remindersSent + results[1].remindersSent, 1);
  assert.ok(storedBooking.reminder2hSentAt instanceof Date);
  assert.equal(notifications.length, 2);
  assert.equal(
    notifications.filter((notification) => notification.type === "booking_reminder_2h").length,
    2
  );
});
