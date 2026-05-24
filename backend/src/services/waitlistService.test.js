import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import WaitlistEntry from "../models/WaitlistEntry.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import {
  barberId,
  clientId,
  createMockEntry,
  futureDate,
  mockFindOneAndUpdateForEntries,
  mockValidWaitlistRelationships,
  mockWaitlistApprovalFlow,
  mockWaitlistFindWithSafePopulate,
  otherBarberId,
  otherClientId,
  otherSalonId,
  pastDate,
  resetWaitlistServiceModelMocks,
  salonId,
  serviceId,
  waitlistEntryId,
} from "./waitlistService.testUtils.js";
import {
  createWaitlistEntry,
  cancelWaitlistEntry,
  getClientWaitlistEntries,
  getBarberWaitlistEntries,
  approveWaitlistEntry,
  rejectWaitlistEntry,
} from "./waitlistService.js";

afterEach(() => {
  resetWaitlistServiceModelMocks();
});

// ─── 1. client can create waitlist entry ───

test("client can create waitlist entry", async () => {
  let createdEntry = null;

  mockValidWaitlistRelationships();
  WaitlistEntry.findOne = async () => null;
  WaitlistEntry.create = async (payload) => {
    createdEntry = { _id: "new-entry-1", ...payload };
    return createdEntry;
  };

  const entry = await createWaitlistEntry({
    clientId,
    barberId,
    serviceId,
    date: futureDate,
  });

  assert.ok(entry);
  assert.equal(entry.clientId, clientId);
  assert.equal(entry.barberId, barberId);
  assert.equal(entry.serviceId, serviceId);
  assert.equal(entry.date, futureDate);
  assert.equal(entry.status, "active");
});

test("client can create waitlist entry with all optional fields", async () => {
  let createdEntry = null;

  mockValidWaitlistRelationships();
  WaitlistEntry.findOne = async () => null;
  WaitlistEntry.create = async (payload) => {
    createdEntry = { _id: "new-entry-2", ...payload };
    return createdEntry;
  };

  const entry = await createWaitlistEntry({
    clientId,
    barberId,
    salonId,
    serviceId,
    date: futureDate,
    preferredStartTime: "10:00",
    preferredEndTime: "14:00",
    note: "Any time in this window works",
  });

  assert.ok(entry);
  assert.equal(entry.salonId, salonId);
  assert.equal(entry.preferredStartTime, "10:00");
  assert.equal(entry.preferredEndTime, "14:00");
  assert.equal(entry.note, "Any time in this window works");
});

// ─── 2. duplicate active entry is blocked ───

test("duplicate active entry is blocked", async () => {
  const existingEntry = createMockEntry({ status: "active" });

  mockValidWaitlistRelationships();
  WaitlistEntry.findOne = async (query) =>
    query.status?.$in?.includes(existingEntry.status) ? existingEntry : null;

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: futureDate,
      }),
    (err) => {
      assert.equal(err.code, "DUPLICATE_WAITLIST_ENTRY");
      return true;
    }
  );
});

test("duplicate notified entry is blocked", async () => {
  const existingEntry = createMockEntry({ status: "notified" });

  mockValidWaitlistRelationships();
  WaitlistEntry.findOne = async (query) =>
    query.status?.$in?.includes(existingEntry.status) ? existingEntry : null;

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: futureDate,
      }),
    (err) => {
      assert.equal(err.code, "DUPLICATE_WAITLIST_ENTRY");
      return true;
    }
  );
});

test("duplicate offered entry is blocked", async () => {
  const existingEntry = createMockEntry({ status: "offered" });

  mockValidWaitlistRelationships();
  WaitlistEntry.findOne = async (query) =>
    query.status?.$in?.includes(existingEntry.status) ? existingEntry : null;

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: futureDate,
      }),
    (err) => {
      assert.equal(err.code, "DUPLICATE_WAITLIST_ENTRY");
      return true;
    }
  );
});

test("duplicate converted rejected cancelled and expired entries are allowed", async () => {
  const closedStatuses = ["converted", "rejected", "cancelled", "expired"];

  for (const status of closedStatuses) {
    mockValidWaitlistRelationships();
    WaitlistEntry.findOne = async (query) => {
      assert.equal(query.status.$in.includes(status), false);
      return null;
    };
    WaitlistEntry.create = async (payload) => ({
      _id: `new-entry-${status}`,
      ...payload,
    });

    const entry = await createWaitlistEntry({
      clientId,
      barberId,
      serviceId,
      date: futureDate,
    });

    assert.equal(entry.status, "active");
  }
});

test("same combination with different closed status is not blocked", async () => {
  mockValidWaitlistRelationships();
  WaitlistEntry.findOne = async () => null;
  let createdEntry = null;
  WaitlistEntry.create = async (payload) => {
    createdEntry = { _id: "new-entry-3", ...payload };
    return createdEntry;
  };

  // Create a cancelled entry first (simulated)
  // Then try to create a new active one - should succeed because findOne returns null
  const entry = await createWaitlistEntry({
    clientId,
    barberId,
    serviceId,
    date: futureDate,
  });

  assert.ok(entry);
  assert.equal(entry.status, "active");
});

test("duplicate check uses the exact preferred time window", async () => {
  let duplicateQuery = null;

  mockValidWaitlistRelationships();
  WaitlistEntry.findOne = async (query) => {
    duplicateQuery = query;
    return null;
  };
  WaitlistEntry.create = async (payload) => ({ _id: "new-entry-4", ...payload });

  await createWaitlistEntry({
    clientId,
    barberId,
    serviceId,
    date: futureDate,
  });

  assert.equal(duplicateQuery.preferredStartTime, "");
  assert.equal(duplicateQuery.preferredEndTime, "");
  assert.deepEqual(duplicateQuery.status, {
    $in: ["active", "notified", "offered"],
  });
});

test("concurrent duplicate active waitlist entries create only one entry", async () => {
  const createdEntries = [];

  mockValidWaitlistRelationships();
  WaitlistEntry.findOne = async (query) =>
    createdEntries.find(
      (entry) =>
        String(entry.clientId) === String(query.clientId) &&
        String(entry.barberId) === String(query.barberId) &&
        String(entry.salonId || "") === String(query.salonId || "") &&
        String(entry.serviceId) === String(query.serviceId) &&
        entry.date === query.date &&
        entry.preferredStartTime === query.preferredStartTime &&
        entry.preferredEndTime === query.preferredEndTime &&
        query.status?.$in?.includes(entry.status)
    ) || null;
  WaitlistEntry.create = async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const entry = { _id: `entry-${createdEntries.length + 1}`, ...payload };
    createdEntries.push(entry);
    return entry;
  };

  const requests = [1, 2].map(() =>
    createWaitlistEntry({
      clientId,
      barberId,
      salonId,
      serviceId,
      date: futureDate,
      preferredStartTime: "10:00",
      preferredEndTime: "12:00",
    })
  );

  const results = await Promise.allSettled(requests);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "DUPLICATE_WAITLIST_ENTRY");
  assert.equal(createdEntries.length, 1);
});

test("waitlist create rejects service that does not belong to barber", async () => {
  mockValidWaitlistRelationships({ serviceExists: false });

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: futureDate,
      }),
    /Service is not available for this barber/
  );
});

test("waitlist create rejects salon without approved or manageable barber relationship", async () => {
  mockValidWaitlistRelationships({
    barber: {
      _id: barberId,
      id: barberId,
      role: "barber",
      salons: [{ salon: otherSalonId, status: "approved" }],
    },
    salon: { _id: salonId, ownerId: otherBarberId, admins: [] },
  });

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        salonId,
        serviceId,
        date: futureDate,
      }),
    /Barber does not work in selected salon/
  );
});

test("waitlist create allows manageable salon relationship", async () => {
  let createdEntry = null;

  mockValidWaitlistRelationships({
    barber: {
      _id: barberId,
      id: barberId,
      role: "barber",
      salons: [],
    },
    salon: { _id: salonId, ownerId: barberId, admins: [] },
  });
  WaitlistEntry.findOne = async () => null;
  WaitlistEntry.create = async (payload) => {
    createdEntry = { _id: "managed-entry", ...payload };
    return createdEntry;
  };

  const entry = await createWaitlistEntry({
    clientId,
    barberId,
    salonId,
    serviceId,
    date: futureDate,
  });

  assert.equal(entry._id, "managed-entry");
  assert.equal(String(entry.salonId), salonId);
});

test("waitlist create validates preferred time windows", async () => {
  mockValidWaitlistRelationships();

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: futureDate,
        preferredStartTime: "10:99",
      }),
    /preferredStartTime must be HH:mm/
  );

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: futureDate,
        preferredEndTime: "late",
      }),
    /preferredEndTime must be HH:mm/
  );

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: futureDate,
        preferredStartTime: "15:00",
        preferredEndTime: "14:00",
      }),
    /preferredStartTime must be before or equal to preferredEndTime/
  );
});

test("waitlist create rejects invalid date format", async () => {
  let serviceLookupCalled = false;
  Service.findOne = async () => {
    serviceLookupCalled = true;
    return null;
  };

  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: "06/15/2099",
      }),
    /date must be a valid YYYY-MM-DD calendar date/
  );

  assert.equal(serviceLookupCalled, false);
});

test("waitlist create rejects impossible date", async () => {
  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: "2099-02-30",
      }),
    /date must be a valid YYYY-MM-DD calendar date/
  );
});

test("waitlist create rejects past date", async () => {
  await assert.rejects(
    () =>
      createWaitlistEntry({
        clientId,
        barberId,
        serviceId,
        date: pastDate,
      }),
    /date cannot be in the past/
  );
});

// ─── 3. client can list own waitlist entries ───

test("client can list own waitlist entries", async () => {
  const mockEntries = [
    createMockEntry({
      _id: "entry-1",
      barberId: { _id: barberId, name: "Jane Barber" },
      salonId: { _id: salonId, name: "Downtown Salon" },
      serviceId: { _id: serviceId, name: "Haircut" },
    }),
    createMockEntry({
      _id: "entry-2",
      barberId: { _id: barberId, name: "Jane Barber" },
      serviceId: { _id: serviceId, name: "Haircut" },
    }),
  ];

  mockWaitlistFindWithSafePopulate({
    expectedQuery: { clientId },
    entries: mockEntries,
  });

  const entries = await getClientWaitlistEntries(clientId);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]._id, "entry-1");
  assert.equal(entries[1]._id, "entry-2");
  assert.equal(entries[0].barberId.name, "Jane Barber");
  assert.equal(entries[0].salonId.name, "Downtown Salon");
  assert.equal(entries[0].serviceId.name, "Haircut");
  assert.equal(entries[0].barberId.email, undefined);
  assert.equal(entries[0].barberId.phone, undefined);
  assert.equal(entries[0].barberId.password, undefined);
});

// ─── 4. client can cancel own active entry ───

test("client can cancel own active entry", async () => {
  let savedEntry = null;

  WaitlistEntry.findOne = async (query) => {
    if (
      String(query._id) === waitlistEntryId &&
      String(query.clientId) === clientId &&
      query.status?.$in?.includes("active")
    ) {
      const entry = createMockEntry();
      entry.save = async function () {
        this.saveCalled = true;
        savedEntry = this;
        return this;
      };
      return entry;
    }
    return null;
  };

  const entry = await cancelWaitlistEntry(waitlistEntryId, clientId);
  assert.ok(entry);
  assert.equal(entry.status, "cancelled");
  assert.ok(entry.cancelledAt);
  assert.ok(entry.saveCalled);
  assert.ok(savedEntry);
});

test("client can cancel own notified entry", async () => {
  let savedEntry = null;

  WaitlistEntry.findOne = async (query) => {
    if (
      String(query._id) === waitlistEntryId &&
      String(query.clientId) === clientId &&
      query.status?.$in?.includes("notified")
    ) {
      const entry = createMockEntry({ status: "notified" });
      entry.save = async function () {
        this.saveCalled = true;
        savedEntry = this;
        return this;
      };
      return entry;
    }
    return null;
  };

  const entry = await cancelWaitlistEntry(waitlistEntryId, clientId);
  assert.ok(entry);
  assert.equal(entry.status, "cancelled");
  assert.ok(entry.cancelledAt);
  assert.ok(entry.saveCalled);
  assert.ok(savedEntry);
});

test("client cannot cancel offered entry via cancel endpoint", async () => {
  WaitlistEntry.findOne = async (query) => {
    assert.equal(query.status.$in.includes("offered"), false);
    return null;
  };

  await assert.rejects(
    () => cancelWaitlistEntry(waitlistEntryId, clientId),
    (err) => {
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});

test("client cannot cancel converted rejected cancelled or expired entries", async () => {
  const closedStatuses = ["converted", "rejected", "cancelled", "expired"];

  WaitlistEntry.findOne = async (query) => {
    for (const status of closedStatuses) {
      assert.equal(query.status.$in.includes(status), false);
    }
    return null;
  };

  await assert.rejects(
    () => cancelWaitlistEntry(waitlistEntryId, clientId),
    (err) => {
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});

// ─── 5. client cannot cancel someone else's entry ───

test("client cannot cancel someone else's entry", async () => {
  WaitlistEntry.findOne = async () => null;

  await assert.rejects(
    () => cancelWaitlistEntry(waitlistEntryId, otherClientId),
    (err) => {
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});

test("barber can reject own active waitlist entry", async () => {
  const entry = createMockEntry();
  let notificationCreated = null;

  WaitlistEntry.findById = async () => entry;
  mockFindOneAndUpdateForEntries([entry]);
  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  const rejectedEntry = await rejectWaitlistEntry({ entryId: waitlistEntryId, barberId });

  assert.equal(rejectedEntry.status, "rejected");
  assert.ok(rejectedEntry.rejectedAt);
  assert.equal(notificationCreated.userId, clientId);
  assert.equal(notificationCreated.type, "waitlist_rejected");
});

test("non-owner barber cannot reject waitlist entry", async () => {
  WaitlistEntry.findById = async () => createMockEntry();

  await assert.rejects(
    () => rejectWaitlistEntry({ entryId: waitlistEntryId, barberId: otherBarberId }),
    (err) => {
      assert.equal(err.code, "FORBIDDEN");
      return true;
    }
  );
});

test("reject sends client notification", async () => {
  const entry = createMockEntry();
  let notificationCreated = null;

  WaitlistEntry.findById = async () => entry;
  mockFindOneAndUpdateForEntries([entry]);
  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  await rejectWaitlistEntry({ entryId: waitlistEntryId, barberId });

  assert.ok(notificationCreated);
  assert.equal(notificationCreated.userId, clientId);
  assert.match(notificationCreated.message, /No suitable time/i);
});

test("reject succeeds if client notification fails after rejected", async () => {
  const entry = createMockEntry();
  const logs = [];

  console.warn = (...args) => logs.push(args);
  WaitlistEntry.findById = async () => entry;
  mockFindOneAndUpdateForEntries([entry]);
  Notification.create = async () => {
    throw new Error("notification service unavailable");
  };

  const rejectedEntry = await rejectWaitlistEntry({ entryId: waitlistEntryId, barberId });

  assert.equal(rejectedEntry.status, "rejected");
  assert.ok(rejectedEntry.rejectedAt);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "Waitlist notification failed (non-fatal):");
  assert.equal(logs[0][1], "notification service unavailable");
});

test("barber can approve own active waitlist entry", async () => {
  const { entry, getCreatedBooking } = mockWaitlistApprovalFlow();

  const result = await approveWaitlistEntry({
    entryId: waitlistEntryId,
    barberId,
    time: "15:30",
  });

  assert.equal(result.entry.status, "converted");
  assert.equal(result.booking._id, getCreatedBooking()._id);
  assert.equal(entry.status, "converted");
});

test("approve creates accepted booking", async () => {
  const { getCreatedBooking } = mockWaitlistApprovalFlow();

  await approveWaitlistEntry({
    entryId: waitlistEntryId,
    barberId,
    time: "15:30",
  });

  const booking = getCreatedBooking();
  assert.equal(booking.status, "accepted");
  assert.equal(booking.createdBy, "barber");
  assert.equal(booking.clientId, clientId);
  assert.equal(booking.barberId, barberId);
  assert.equal(booking.serviceId, serviceId);
  assert.equal(booking.bookingDate, futureDate);
  assert.equal(booking.time, "15:30");
  assert.equal(booking.duration, 30);
  assert.equal(booking.price, 50);
});

test("approve marks waitlist converted and stores convertedBooking", async () => {
  const { entry, getCreatedBooking } = mockWaitlistApprovalFlow();

  await approveWaitlistEntry({
    entryId: waitlistEntryId,
    barberId,
    time: "15:30",
  });

  assert.equal(entry.status, "converted");
  assert.ok(entry.convertedAt);
  assert.equal(entry.convertedBooking, getCreatedBooking()._id);
});

test("approve sends client notification", async () => {
  let notificationCreated = null;

  mockWaitlistApprovalFlow();
  Notification.create = async (payload) => {
    notificationCreated = payload;
    return payload;
  };

  await approveWaitlistEntry({
    entryId: waitlistEntryId,
    barberId,
    time: "15:30",
  });

  assert.equal(notificationCreated.userId, clientId);
  assert.equal(notificationCreated.type, "waitlist_approved");
  assert.match(notificationCreated.message, new RegExp(`${futureDate} at 15:30`));
});

test("approve notification failure does not reopen converted waitlist entry", async () => {
  const { entry } = mockWaitlistApprovalFlow();
  Notification.create = async () => {
    throw new Error("notification failed");
  };

  await assert.rejects(
    () => approveWaitlistEntry({ entryId: waitlistEntryId, barberId, time: "15:30" }),
    /notification failed/
  );

  assert.equal(entry.status, "converted");
  assert.ok(entry.convertedAt);
  assert.ok(entry.convertedBooking);
});

test("approve blocks duplicate conversion", async () => {
  const entry = createMockEntry();
  let claimed = false;

  mockWaitlistApprovalFlow({ entry });
  WaitlistEntry.findOneAndUpdate = async (query, update) => {
    if (String(query._id) !== String(entry._id)) return null;
    if (Array.isArray(query.status?.$in)) {
      if (claimed || !query.status.$in.includes(entry.status)) return null;
      claimed = true;
    } else if (query.status && entry.status !== query.status) {
      return null;
    }

    Object.assign(entry, update.$set || {});
    return entry;
  };

  await approveWaitlistEntry({ entryId: waitlistEntryId, barberId, time: "15:30" });

  await assert.rejects(
    () => approveWaitlistEntry({ entryId: waitlistEntryId, barberId, time: "15:30" }),
    (err) => {
      assert.equal(err.code, "INVALID_STATUS");
      return true;
    }
  );
});

test("approve rejects overlapping time", async () => {
  mockWaitlistApprovalFlow({
    activeBookings: [
      {
        _id: "existing-booking",
        status: "accepted",
        bookingDate: futureDate,
        time: "15:45",
        duration: 30,
      },
    ],
  });

  await assert.rejects(
    () => approveWaitlistEntry({ entryId: waitlistEntryId, barberId, time: "15:30" }),
    /This time is already booked/
  );
});

test("approve allows time outside preferred range", async () => {
  const { getCreatedBooking } = mockWaitlistApprovalFlow({
    entry: createMockEntry({
      preferredStartTime: "09:00",
      preferredEndTime: "10:00",
    }),
  });

  await approveWaitlistEntry({ entryId: waitlistEntryId, barberId, time: "15:30" });

  assert.equal(getCreatedBooking().time, "15:30");
});

test("approve allows time outside schedule hours if overlap-free", async () => {
  const { getCreatedBooking } = mockWaitlistApprovalFlow();

  await approveWaitlistEntry({ entryId: waitlistEntryId, barberId, time: "22:00" });

  assert.equal(getCreatedBooking().time, "22:00");
});

// ─── 6. barber can list waitlist entries for own barberId ───

test("barber can list waitlist entries for own barberId", async () => {
  const mockEntries = [
    createMockEntry({
      _id: "entry-1",
      clientId: { _id: clientId, name: "Client A" },
      salonId: { _id: salonId, name: "Downtown Salon" },
      serviceId: { _id: serviceId, name: "Haircut" },
    }),
    createMockEntry({
      _id: "entry-2",
      clientId: { _id: otherClientId, name: "Client B" },
      serviceId: { _id: serviceId, name: "Haircut" },
    }),
  ];

  mockWaitlistFindWithSafePopulate({
    expectedQuery: { barberId },
    entries: mockEntries,
  });

  const entries = await getBarberWaitlistEntries(barberId);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].clientId.name, "Client A");
  assert.equal(entries[0].salonId.name, "Downtown Salon");
  assert.equal(entries[0].serviceId.name, "Haircut");
  assert.equal(entries[0].clientId.email, undefined);
  assert.equal(entries[0].clientId.phone, undefined);
  assert.equal(entries[0].clientId.password, undefined);
});

// ─── 7. unrelated barber cannot list (tested at controller level) ───

// The controller handles the permission check; the service itself has no permission check.
// This is tested via controller authorization logic.
// Notify/expire/offer/accept/decline tests moved to dedicated files.
