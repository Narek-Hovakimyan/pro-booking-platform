import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import {
  ReportError,
  getSalonReport,
} from "./salonReportService.js";

const originalMethods = {
  salonFindById: Salon.findById,
  userFind: User.find,
  userFindById: User.findById,
  bookingAggregate: Booking.aggregate,
  bookingFind: Booking.find,
};

const salonId = "salon-1";
const ownerId = "owner-1";
const adminId = "admin-1";
const memberId = "member-1";
const outsiderId = "outsider-1";
const staffOneId = "staff-1";
const staffTwoId = "staff-2";
const chairRenterId = "chair-renter-1";
const pendingStaffId = "pending-staff-1";
const rejectedStaffId = "rejected-staff-1";
const legacyStaffId = "legacy-staff-1";
const clientIdClient = "client-1";

const makeLeanQuery = (results) => ({
  select: () => ({
    lean: async () => results,
  }),
});

const makeStaffUser = (userId, relationshipType, relationshipStatus) => ({
  _id: userId,
  name: userId === staffOneId ? "Staff One" : "Staff Two",
  avatarUrl: "",
  role: "barber",
  salons: [
    {
      salon: { toString: () => salonId },
      status: "approved",
      ...(relationshipType ? { relationshipType } : {}),
      ...(relationshipStatus ? { relationshipStatus } : {}),
    },
  ],
  salon: salonId,
  salonStatus: "approved",
});

const makeChairRenterUser = () => ({
  _id: chairRenterId,
  name: "Chair Renter",
  avatarUrl: "",
  role: "barber",
  salons: [
    {
      salon: { toString: () => salonId },
      status: "approved",
      relationshipType: "chair_renter",
      relationshipStatus: "accepted",
    },
  ],
  salon: salonId,
  salonStatus: "approved",
});

const makePendingStaffUser = () => ({
  _id: pendingStaffId,
  name: "Pending Staff",
  avatarUrl: "",
  role: "barber",
  salons: [
    {
      salon: { toString: () => salonId },
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "pending",
    },
  ],
  salon: salonId,
  salonStatus: "approved",
});

const makeRejectedStaffUser = () => ({
  _id: rejectedStaffId,
  name: "Rejected Staff",
  avatarUrl: "",
  role: "barber",
  salons: [
    {
      salon: { toString: () => salonId },
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "rejected",
    },
  ],
  salon: salonId,
  salonStatus: "approved",
});

const makeLegacyStaffUser = () => ({
  _id: legacyStaffId,
  name: "Legacy Staff",
  avatarUrl: "",
  role: "barber",
  salon: salonId,
  salonStatus: "approved",
});

const fromDate = "2026-01-01";
const toDate = "2026-06-30";

const setupOwnerReportAccess = (members = [makeStaffUser(staffOneId, "staff", "accepted")]) => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({ select: async () => members });
};

const getAppointmentDate = (booking) => booking.bookingDate || booking.dayKey || "";

const bookingMatchesReportQuery = (booking, query) => {
  const date = getAppointmentDate(booking);
  const bookingDateRange = query.$or?.[0]?.bookingDate || {};
  const dayKeyRange = query.$or?.[1]?.dayKey || {};

  if (booking.bookingDate) {
    return date >= bookingDateRange.$gte && date <= bookingDateRange.$lte;
  }

  return date >= dayKeyRange.$gte && date <= dayKeyRange.$lte;
};

const getAggregateGroupId = (pipeline) =>
  pipeline.find((stage) => stage.$group)?.$group?._id;

const assertPipelineUsesAppointmentRange = (pipeline, from, to) => {
  assert.equal(JSON.stringify(pipeline).includes("createdAt"), false);
  assert.deepEqual(
    pipeline.find((stage) => stage.$match?.reportAppointmentDate)?.$match
      ?.reportAppointmentDate,
    { $gte: from, $lte: to }
  );
};

afterEach(() => {
  Salon.findById = originalMethods.salonFindById;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
  Booking.aggregate = originalMethods.bookingAggregate;
  Booking.find = originalMethods.bookingFind;
});

test("owner can fetch reports", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
    city: "Yerevan",
    address: "123",
    phone: "555",
    imageUrl: "",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [
      makeStaffUser(staffOneId, "staff", "accepted"),
      makeStaffUser(staffTwoId, "staff", "accepted"),
    ],
  });
  Booking.aggregate = async () => [];
  Booking.find = () =>
    makeLeanQuery([
      { _id: "b1", barberId: staffOneId, status: "completed", price: 100, clientId: clientIdClient },
    ]);

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
  });

  assert.ok(result.salon);
  assert.equal(result.salon.id, salonId);
  assert.equal(result.salon.name, "Test Salon");
  assert.ok(result.range);
  assert.equal(result.range.from, fromDate);
  assert.equal(result.range.to, toDate);
  assert.ok(result.summary);
  assert.equal(result.summary.totalBookings, 1);
  assert.equal(result.summary.completedBookings, 1);
  assert.equal(result.summary.totalRevenue, 100);
});

test("admin can fetch reports", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [adminId],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: adminId }]);
  User.find = () => ({ select: async () => [] });
  Booking.aggregate = async () => [];
  Booking.find = () => makeLeanQuery([]);

  const result = await getSalonReport(salonId, adminId, {
    from: fromDate,
    to: toDate,
  });

  assert.ok(result.salon);
  assert.equal(result.summary.totalBookings, 0);
});

test("normal member cannot fetch reports", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: memberId }]);

  await assert.rejects(
    () =>
      getSalonReport(salonId, memberId, { from: fromDate, to: toDate }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});

test("non-member cannot fetch reports", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: outsiderId }]);

  await assert.rejects(
    () =>
      getSalonReport(salonId, outsiderId, { from: fromDate, to: toDate }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});

test("accepted staff bookings included", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [makeStaffUser(staffOneId, "staff", "accepted")],
  });
  Booking.aggregate = async (pipeline) => {
    if (getAggregateGroupId(pipeline) === "$status") {
      return [{ _id: "completed", count: 1 }];
    }
    return [];
  };
  Booking.find = () =>
    makeLeanQuery([
      { _id: "b1", barberId: staffOneId, status: "completed", price: 50, clientId: clientIdClient },
    ]);

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
  });

  assert.equal(result.summary.totalBookings, 1);
  assert.equal(result.summary.completedBookings, 1);
  assert.equal(result.summary.totalRevenue, 50);
  assert.ok(result.byStatus.some((s) => s.status === "completed" && s.count === 1));
});

test("chair_renter excluded", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [
      makeStaffUser(staffOneId, "staff", "accepted"),
      makeChairRenterUser(),
    ],
  });
  Booking.aggregate = async () => [];

  let bookingFindBarberIds = null;
  Booking.find = (query) => {
    bookingFindBarberIds = query.barberId?.$in || null;
    return makeLeanQuery([]);
  };

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
  });

  assert.ok(bookingFindBarberIds);
  assert.ok(bookingFindBarberIds.some((id) => String(id) === staffOneId));
  assert.ok(!bookingFindBarberIds.some((id) => String(id) === chairRenterId));
  assert.equal(result.summary.totalBookings, 0);
});

test("pending staff excluded", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [
      makeStaffUser(staffOneId, "staff", "accepted"),
      makePendingStaffUser(),
    ],
  });
  Booking.aggregate = async () => [];

  let bookingFindBarberIds = null;
  Booking.find = (query) => {
    bookingFindBarberIds = query.barberId?.$in || null;
    return makeLeanQuery([]);
  };

  await getSalonReport(salonId, ownerId, { from: fromDate, to: toDate });

  assert.ok(bookingFindBarberIds);
  assert.ok(bookingFindBarberIds.some((id) => String(id) === staffOneId));
  assert.ok(!bookingFindBarberIds.some((id) => String(id) === pendingStaffId));
});

test("rejected staff excluded", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [
      makeStaffUser(staffOneId, "staff", "accepted"),
      makeRejectedStaffUser(),
    ],
  });
  Booking.aggregate = async () => [];

  let bookingFindBarberIds = null;
  Booking.find = (query) => {
    bookingFindBarberIds = query.barberId?.$in || null;
    return makeLeanQuery([]);
  };

  await getSalonReport(salonId, ownerId, { from: fromDate, to: toDate });

  assert.ok(bookingFindBarberIds);
  assert.ok(bookingFindBarberIds.some((id) => String(id) === staffOneId));
  assert.ok(!bookingFindBarberIds.some((id) => String(id) === rejectedStaffId));
});

test("legacy accepted staff included safely", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [makeLegacyStaffUser()],
  });
  Booking.aggregate = async () => [];

  let bookingFindBarberIds = null;
  Booking.find = (query) => {
    bookingFindBarberIds = query.barberId?.$in || null;
    return makeLeanQuery([]);
  };

  await getSalonReport(salonId, ownerId, { from: fromDate, to: toDate });

  assert.ok(bookingFindBarberIds);
  assert.ok(bookingFindBarberIds.some((id) => String(id) === legacyStaffId));
});

test("barberId filter works for accepted staff", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [
      makeStaffUser(staffOneId, "staff", "accepted"),
      makeStaffUser(staffTwoId, "staff", "accepted"),
    ],
  });
  Booking.aggregate = async () => [];

  let bookingFindBarberIds = null;
  Booking.find = (query) => {
    bookingFindBarberIds = query.barberId?.$in || null;
    return makeLeanQuery([
      { _id: "b1", barberId: staffOneId, status: "completed", price: 100, clientId: clientIdClient },
    ]);
  };

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
    barberId: staffOneId,
  });

  assert.ok(bookingFindBarberIds);
  assert.equal(bookingFindBarberIds.length, 1);
  assert.equal(String(bookingFindBarberIds[0]), staffOneId);
  assert.equal(result.summary.totalBookings, 1);
});

test("barberId filter rejects chair_renter", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [
      makeStaffUser(staffOneId, "staff", "accepted"),
      makeChairRenterUser(),
    ],
  });

  await assert.rejects(
    () =>
      getSalonReport(salonId, ownerId, {
        from: fromDate,
        to: toDate,
        barberId: chairRenterId,
      }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("summary uses appointment date range instead of booking createdAt", async () => {
  setupOwnerReportAccess();
  Booking.aggregate = async () => [];

  let capturedQuery = null;
  const bookings = [
    {
      _id: "appointment-inside-created-outside",
      barberId: staffOneId,
      status: "completed",
      price: 100,
      clientId: clientIdClient,
      bookingDate: "2026-06-15",
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    },
    {
      _id: "appointment-outside-created-inside",
      barberId: staffOneId,
      status: "completed",
      price: 900,
      clientId: "client-2",
      bookingDate: "2026-06-20",
      createdAt: new Date("2026-06-15T12:00:00.000Z"),
    },
  ];

  Booking.find = (query) => {
    capturedQuery = query;
    return makeLeanQuery(bookings.filter((booking) => bookingMatchesReportQuery(booking, query)));
  };

  const result = await getSalonReport(salonId, ownerId, {
    from: "2026-06-15",
    to: "2026-06-15",
  });

  assert.equal(capturedQuery.createdAt, undefined);
  assert.equal(result.summary.totalBookings, 1);
  assert.equal(result.summary.completedBookings, 1);
  assert.equal(result.summary.totalRevenue, 100);
});

test("summary falls back to dayKey only when bookingDate is missing", async () => {
  setupOwnerReportAccess();
  Booking.aggregate = async () => [];

  const bookings = [
    {
      _id: "day-key-fallback",
      barberId: staffOneId,
      status: "completed",
      price: 70,
      clientId: clientIdClient,
      bookingDate: "",
      dayKey: "2026-06-15",
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    },
    {
      _id: "booking-date-wins",
      barberId: staffOneId,
      status: "completed",
      price: 500,
      clientId: "client-2",
      bookingDate: "2026-06-20",
      dayKey: "2026-06-15",
      createdAt: new Date("2026-06-15T12:00:00.000Z"),
    },
  ];

  Booking.find = (query) =>
    makeLeanQuery(bookings.filter((booking) => bookingMatchesReportQuery(booking, query)));

  const result = await getSalonReport(salonId, ownerId, {
    from: "2026-06-15",
    to: "2026-06-15",
  });

  assert.equal(result.summary.totalBookings, 1);
  assert.equal(result.summary.totalRevenue, 70);
});

test("status breakdown uses appointment date range", async () => {
  setupOwnerReportAccess();
  let statusPipeline = null;

  Booking.aggregate = async (pipeline) => {
    if (getAggregateGroupId(pipeline) === "$status") {
      statusPipeline = pipeline;
      return [{ _id: "completed", count: 1 }];
    }
    return [];
  };
  Booking.find = () => makeLeanQuery([]);

  const result = await getSalonReport(salonId, ownerId, {
    from: "2026-06-15",
    to: "2026-06-15",
  });

  assertPipelineUsesAppointmentRange(statusPipeline, "2026-06-15", "2026-06-15");
  assert.deepEqual(result.byStatus, [{ status: "completed", count: 1 }]);
});

test("daily breakdown groups and filters by appointment date", async () => {
  setupOwnerReportAccess();
  let dayPipeline = null;

  Booking.aggregate = async (pipeline) => {
    if (getAggregateGroupId(pipeline) === "$reportAppointmentDate") {
      dayPipeline = pipeline;
      return [
        {
          _id: "2026-06-15",
          total: 1,
          completed: 1,
          cancelled: 0,
          noShow: 0,
          pending: 0,
          revenue: 100,
        },
      ];
    }
    return [];
  };
  Booking.find = () => makeLeanQuery([]);

  const result = await getSalonReport(salonId, ownerId, {
    from: "2026-06-15",
    to: "2026-06-15",
  });

  assertPipelineUsesAppointmentRange(dayPipeline, "2026-06-15", "2026-06-15");
  assert.equal(result.byDay[0]._id, "2026-06-15");
});

test("staff breakdown uses appointment date range", async () => {
  setupOwnerReportAccess();
  let staffPipeline = null;

  Booking.aggregate = async (pipeline) => {
    if (getAggregateGroupId(pipeline) === "$barberId") {
      staffPipeline = pipeline;
      return [
        {
          _id: staffOneId,
          totalBookings: 1,
          completed: 1,
          cancelled: 0,
          noShow: 0,
          revenue: 100,
          uniqueClients: [clientIdClient],
        },
      ];
    }
    return [];
  };
  Booking.find = () => makeLeanQuery([]);

  const result = await getSalonReport(salonId, ownerId, {
    from: "2026-06-15",
    to: "2026-06-15",
  });

  assertPipelineUsesAppointmentRange(staffPipeline, "2026-06-15", "2026-06-15");
  assert.equal(result.byStaff[0].barberId, staffOneId);
  assert.equal(result.byStaff[0].totalBookings, 1);
});

test("top services uses appointment date range", async () => {
  setupOwnerReportAccess();
  let servicesPipeline = null;

  Booking.aggregate = async (pipeline) => {
    if (getAggregateGroupId(pipeline) === "$serviceName") {
      servicesPipeline = pipeline;
      return [{ _id: "Haircut", count: 1, revenue: 100 }];
    }
    return [];
  };
  Booking.find = () => makeLeanQuery([]);

  const result = await getSalonReport(salonId, ownerId, {
    from: "2026-06-15",
    to: "2026-06-15",
  });

  assertPipelineUsesAppointmentRange(servicesPipeline, "2026-06-15", "2026-06-15");
  assert.deepEqual(result.topServices, [{ _id: "Haircut", count: 1, revenue: 100 }]);
});

test("revenue counts completed only", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [makeStaffUser(staffOneId, "staff", "accepted")],
  });
  Booking.aggregate = async () => [];
  Booking.find = () =>
    makeLeanQuery([
      { _id: "b1", barberId: staffOneId, status: "completed", price: 100, clientId: clientIdClient },
      { _id: "b2", barberId: staffOneId, status: "cancelled", price: 50, clientId: clientIdClient },
      { _id: "b3", barberId: staffOneId, status: "pending", price: 75, clientId: clientIdClient },
      { _id: "b4", barberId: staffOneId, status: "no_show", price: 60, clientId: clientIdClient },
      { _id: "b5", barberId: staffOneId, status: "late_cancelled", price: 80, clientId: clientIdClient },
    ]);

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
  });

  assert.equal(result.summary.totalBookings, 5);
  assert.equal(result.summary.totalRevenue, 100);
  assert.equal(result.summary.averageBookingValue, 100);
});

test("reports use finalPrice for completed booking revenue", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [makeStaffUser(staffOneId, "staff", "accepted")],
  });
  Booking.aggregate = async () => [];
  Booking.find = () =>
    makeLeanQuery([
      {
        _id: "b1",
        barberId: staffOneId,
        status: "completed",
        price: 100,
        finalPrice: 65,
        promotionId: "promotion-1",
        clientId: clientIdClient,
      },
      {
        _id: "b2",
        barberId: staffOneId,
        status: "completed",
        price: 40,
        finalPrice: 0,
        promotionId: "promotion-2",
        clientId: clientIdClient,
      },
      {
        _id: "b3",
        barberId: staffOneId,
        status: "completed",
        price: 25,
        clientId: clientIdClient,
      },
    ]);

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
  });

  assert.equal(result.summary.totalRevenue, 90);
  assert.equal(result.summary.averageBookingValue, 30);
});

test("top services are calculated correctly", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [makeStaffUser(staffOneId, "staff", "accepted")],
  });
  Booking.aggregate = async (pipeline) => {
    if (getAggregateGroupId(pipeline) === "$serviceName") {
      return [
        { _id: "Haircut", count: 5, revenue: 250 },
        { _id: "Color", count: 3, revenue: 450 },
        { _id: "Shave", count: 2, revenue: 60 },
      ];
    }
    return [];
  };
  Booking.find = () =>
    makeLeanQuery([
      { _id: "b1", barberId: staffOneId, status: "completed", price: 50, clientId: clientIdClient },
    ]);

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
  });

  assert.equal(result.topServices.length, 3);
  assert.equal(result.topServices[0]._id, "Haircut");
  assert.equal(result.topServices[0].count, 5);
  assert.equal(result.topServices[1]._id, "Color");
  assert.equal(result.topServices[1].count, 3);
  assert.equal(result.topServices[2]._id, "Shave");
  assert.equal(result.topServices[2].count, 2);
});
