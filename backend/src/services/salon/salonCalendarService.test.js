import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import {
  getSalonCalendar,
  SalonCalendarError,
} from "./salonCalendarService.js";

const ownerId = "64c000000000000000000100";
const adminId = "64c000000000000000000101";
const memberId = "64c000000000000000000102";
const outsiderId = "64c000000000000000000103";
const salonId = "64c000000000000000000104";
const staffOneId = "64c000000000000000000105";
const staffTwoId = "64c000000000000000000106";
const chairRenterId = "64c000000000000000000107";

const originalMethods = {
  bookingFind: Booking.find,
  salonFindById: Salon.findById,
  userFind: User.find,
  userFindById: User.findById,
};

const makeSelectQuery = (result) => ({
  select: async () => result,
});

const makeLeanQuery = (result) => ({
  sort() {
    return this;
  },
  populate() {
    return this;
  },
  async lean() {
    return result;
  },
});

const makeBarber = (id, relationshipType = "staff", relationshipStatus) => ({
  _id: id,
  name: `Barber ${String(id).slice(-3)}`,
  avatarUrl: "",
  salon: salonId,
  salonStatus: "approved",
  salons: [
    {
      salon: salonId,
      status: "approved",
      relationshipType,
      ...(relationshipStatus ? { relationshipStatus } : {}),
    },
  ],
});

const createBooking = (overrides = {}) => ({
  _id: overrides._id || `booking-${Math.random()}`,
  salonId,
  barberId: { _id: staffOneId, name: "Staff One" },
  clientId: { _id: "client-1", name: "Client One" },
  serviceId: { _id: "service-1", name: "Haircut" },
  serviceName: "Haircut",
  bookingDate: "2026-06-10",
  dayKey: "2026-06-10",
  time: "10:00",
  duration: 60,
  status: "pending",
  price: 5000,
  ...overrides,
});

afterEach(() => {
  Booking.find = originalMethods.bookingFind;
  Salon.findById = originalMethods.salonFindById;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
});

const installBaseMocks = ({
  requesterId = ownerId,
  bookings = [],
} = {}) => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [adminId],
    name: "Salon Prime",
    city: "Yerevan",
    address: "Main 1",
    phone: "+37410000000",
    imageUrl: "/uploads/salon.jpg",
  });

  User.findById = () => makeSelectQuery({ _id: requesterId });
  User.find = () =>
    makeSelectQuery([
      makeBarber(staffOneId, "staff"),
      makeBarber(staffTwoId, "staff"),
      makeBarber(chairRenterId, "chair_renter"),
    ]);
  Booking.find = () => makeLeanQuery(bookings);
};

test("owner can fetch calendar", async () => {
  installBaseMocks({
    requesterId: ownerId,
    bookings: [createBooking()],
  });

  const result = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });

  assert.equal(result.salon.name, "Salon Prime");
  assert.equal(result.bookings.length, 1);
});

test("admin can fetch calendar", async () => {
  installBaseMocks({
    requesterId: adminId,
    bookings: [createBooking()],
  });

  const result = await getSalonCalendar(salonId, adminId, {
    date: "2026-06-10",
    view: "day",
  });

  assert.equal(result.bookings.length, 1);
});

test("normal member cannot fetch calendar", async () => {
  installBaseMocks({ requesterId: memberId });

  await assert.rejects(
    () =>
      getSalonCalendar(salonId, memberId, {
        date: "2026-06-10",
        view: "day",
      }),
    (error) => {
      assert.ok(error instanceof SalonCalendarError);
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});

test("non-member cannot fetch calendar", async () => {
  installBaseMocks({ requesterId: outsiderId });

  await assert.rejects(
    () =>
      getSalonCalendar(salonId, outsiderId, {
        date: "2026-06-10",
        view: "day",
      }),
    (error) => {
      assert.ok(error instanceof SalonCalendarError);
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});

test("staff bookings appear", async () => {
  installBaseMocks({
    bookings: [
      createBooking({
        _id: "staff-booking",
        barberId: { _id: staffOneId, name: "Staff One" },
        clientId: { _id: "client-1", name: "Client One" },
        time: "09:30",
        duration: 45,
      }),
    ],
  });

  const result = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });

  assert.equal(result.bookings[0].barberId, staffOneId);
  assert.equal(result.bookings[0].clientName, "Client One");
  assert.equal(result.bookings[0].serviceName, "Haircut");
});

test("chair_renter bookings are excluded from results", async () => {
  let bookingQuery = null;
  installBaseMocks({
    bookings: [createBooking()],
  });
  Booking.find = (query) => {
    bookingQuery = query;
    return makeLeanQuery([createBooking()]);
  };

  await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });

  assert.deepEqual(bookingQuery.barberId, { $in: [staffOneId, staffTwoId] });
});

test("chair_renter not in staff list", async () => {
  installBaseMocks();

  const result = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });

  assert.deepEqual(
    result.staff.map((member) => member.id),
    [staffOneId, staffTwoId]
  );
});

test("barberId filter works for staff", async () => {
  let bookingQuery = null;
  installBaseMocks({
    bookings: [
      createBooking({
        _id: "staff-two-booking",
        barberId: { _id: staffTwoId, name: "Staff Two" },
      }),
    ],
  });
  Booking.find = (query) => {
    bookingQuery = query;
    return makeLeanQuery([
      createBooking({
        _id: "staff-two-booking",
        barberId: { _id: staffTwoId, name: "Staff Two" },
      }),
    ]);
  };

  const result = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
    barberId: staffTwoId,
  });

  assert.deepEqual(bookingQuery.barberId, { $in: [staffTwoId] });
  assert.deepEqual(result.bookings.map((booking) => booking.barberId), [staffTwoId]);
});

test("barberId filter rejects chair_renter", async () => {
  installBaseMocks();

  await assert.rejects(
    () =>
      getSalonCalendar(salonId, ownerId, {
        date: "2026-06-10",
        view: "day",
        barberId: chairRenterId,
      }),
    (error) => {
      assert.ok(error instanceof SalonCalendarError);
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("week view includes correct date range", async () => {
  let bookingQuery = null;
  installBaseMocks({
    bookings: [
      createBooking({ _id: "week-start", bookingDate: "2026-06-07", dayKey: "2026-06-07" }),
      createBooking({ _id: "week-end", bookingDate: "2026-06-13", dayKey: "2026-06-13" }),
    ],
  });
  Booking.find = (query) => {
    bookingQuery = query;
    return makeLeanQuery([
      createBooking({ _id: "week-start", bookingDate: "2026-06-07", dayKey: "2026-06-07" }),
      createBooking({ _id: "week-end", bookingDate: "2026-06-13", dayKey: "2026-06-13" }),
    ]);
  };

  const result = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "week",
  });

  const dateKeys = bookingQuery.$or[0].bookingDate.$in;
  assert.deepEqual(dateKeys, [
    "2026-06-07",
    "2026-06-08",
    "2026-06-09",
    "2026-06-10",
    "2026-06-11",
    "2026-06-12",
    "2026-06-13",
  ]);
  assert.deepEqual(
    result.bookings.map((booking) => booking.date),
    ["2026-06-07", "2026-06-13"]
  );
});

test("summary counts statuses correctly", async () => {
  installBaseMocks({
    bookings: [
      createBooking({ _id: "pending", status: "pending" }),
      createBooking({ _id: "accepted", status: "accepted", barberId: { _id: staffTwoId, name: "Staff Two" } }),
      createBooking({ _id: "confirmed", status: "confirmed" }),
      createBooking({ _id: "completed", status: "completed" }),
      createBooking({ _id: "cancelled", status: "cancelled" }),
      createBooking({ _id: "late-cancelled", status: "late_cancelled" }),
      createBooking({ _id: "no-show", status: "no_show" }),
    ],
  });

  const result = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });

  assert.deepEqual(result.summary, {
    totalBookings: 7,
    pendingCount: 1,
    acceptedCount: 2,
    completedCount: 1,
    cancelledCount: 2,
    noShowCount: 1,
  });
});

test("relationship confirmation controls calendar private movement", async () => {
  let relationshipType = "staff";
  let relationshipStatus;

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Salon Prime",
    city: "Yerevan",
  });
  User.findById = () => makeSelectQuery({ _id: ownerId });
  User.find = () =>
    makeSelectQuery([makeBarber(staffOneId, relationshipType, relationshipStatus)]);
  Booking.find = () =>
    makeLeanQuery([
      createBooking({
        _id: "dynamic-booking",
        barberId: { _id: staffOneId, name: "Staff One" },
      }),
    ]);

  const initialResult = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });
  assert.equal(initialResult.staff.length, 1);
  assert.equal(initialResult.bookings.length, 1);

  relationshipType = "staff";
  relationshipStatus = "pending";
  const pendingStaffResult = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });
  assert.equal(pendingStaffResult.staff.length, 0);
  assert.equal(pendingStaffResult.bookings.length, 0);

  relationshipType = "staff";
  relationshipStatus = "rejected";
  const rejectedStaffResult = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });
  assert.equal(rejectedStaffResult.staff.length, 0);
  assert.equal(rejectedStaffResult.bookings.length, 0);

  relationshipType = "staff";
  relationshipStatus = "accepted";
  const acceptedStaffResult = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });
  assert.equal(acceptedStaffResult.staff.length, 1);
  assert.equal(acceptedStaffResult.bookings.length, 1);

  relationshipType = "chair_renter";
  relationshipStatus = "accepted";
  const chairRenterResult = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });
  assert.equal(chairRenterResult.staff.length, 0);
  assert.equal(chairRenterResult.bookings.length, 0);

  relationshipType = "staff";
  relationshipStatus = undefined;
  const revertedResult = await getSalonCalendar(salonId, ownerId, {
    date: "2026-06-10",
    view: "day",
  });
  assert.equal(revertedResult.staff.length, 1);
  assert.equal(revertedResult.bookings.length, 1);
});
