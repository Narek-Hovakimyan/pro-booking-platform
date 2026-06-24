import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";
import {
  ReportError,
  getSalonReportCsvExport,
  getSalonReport,
} from "./salonReportService.js";

const originalMethods = {
  salonFindById: Salon.findById,
  userFind: User.find,
  userFindById: User.findById,
  bookingAggregate: Booking.aggregate,
  bookingFind: Booking.find,
  subscriptionFindOne: Subscription.findOne,
};

const salonId = "salon-1";
const salonBId = "salon-2";
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

const futureDate = new Date("2099-01-01T00:00:00.000Z");
const pastDate = new Date("2000-01-01T00:00:00.000Z");

const makeLeanQuery = (results) => ({
  select: () => ({
    lean: async () => results,
  }),
});

const makeSubscription = (overrides = {}) => ({
  _id: overrides._id || "subscription-1",
  ownerType: "salon",
  ownerId: salonId,
  status: "active",
  currentPeriodEnd: futureDate,
  ...overrides,
});

const setSubscriptionFindOneMock = (subscriptions = [makeSubscription()]) => {
  Subscription.findOne = async (query) =>
    subscriptions.find(
      (subscription) =>
        sameId(subscription.ownerType, query.ownerType) &&
        sameId(subscription.ownerId, query.ownerId) &&
        query.status?.$in?.includes(subscription.status)
    ) || null;
};

const makeStaffUser = (
  userId,
  relationshipType,
  relationshipStatus,
  overrides = {}
) => ({
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
      ...overrides,
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

const getTestBookingRevenue = (booking) => {
  const finalPrice = Number(booking?.finalPrice);
  const hasDiscountMarker = Boolean(
    booking?.promotionId ||
      booking?.voucherId ||
      booking?.promotionCode ||
      booking?.voucherCode ||
      Number(booking?.discountAmount || booking?.voucherDiscount || 0) > 0
  );

  if (
    hasDiscountMarker &&
    booking?.finalPrice !== undefined &&
    booking?.finalPrice !== null &&
    Number.isFinite(finalPrice)
  ) {
    return finalPrice;
  }

  const price = Number(booking?.price || booking?.totalPrice || 0);
  return Number.isFinite(price) ? price : 0;
};

const bookingMatchesReportQuery = (booking, query) => {
  const date = getAppointmentDate(booking);
  const bookingDateRange = query.$or?.[0]?.bookingDate || {};
  const dayKeyRange = query.$or?.[1]?.dayKey || {};

  if (booking.bookingDate) {
    return date >= bookingDateRange.$gte && date <= bookingDateRange.$lte;
  }

  return date >= dayKeyRange.$gte && date <= dayKeyRange.$lte;
};

const sameId = (left, right) => String(left || "") === String(right || "");

const bookingMatchesSalonReportQuery = (booking, query) => {
  const barberIds = query.barberId?.$in || [];
  return (
    sameId(booking.salonId, query.salonId) &&
    barberIds.some((id) => sameId(id, booking.barberId)) &&
    bookingMatchesReportQuery(booking, query)
  );
};

const bookingMatchesAggregatePipeline = (booking, pipeline) => {
  const match = pipeline[0]?.$match || {};
  const barberIds = match.barberId?.$in || [];
  const range = pipeline.find((stage) => stage.$match?.reportAppointmentDate)
    ?.$match?.reportAppointmentDate;

  if (!sameId(booking.salonId, match.salonId)) return false;
  if (!barberIds.some((id) => sameId(id, booking.barberId))) return false;
  if (match.serviceName && !booking.serviceName) return false;

  const date = getAppointmentDate(booking);
  return date >= range.$gte && date <= range.$lte;
};

const aggregateReportBookings = (bookings, pipeline) => {
  const groupId = getAggregateGroupId(pipeline);
  const matched = bookings.filter((booking) =>
    bookingMatchesAggregatePipeline(booking, pipeline)
  );

  if (groupId === "$status") {
    return Object.values(
      matched.reduce((groups, booking) => {
        groups[booking.status] ||= { _id: booking.status, count: 0 };
        groups[booking.status].count++;
        return groups;
      }, {})
    );
  }

  if (groupId === "$reportAppointmentDate") {
    return Object.values(
      matched.reduce((groups, booking) => {
        const key = getAppointmentDate(booking);
        groups[key] ||= {
          _id: key,
          total: 0,
          completed: 0,
          cancelled: 0,
          noShow: 0,
          pending: 0,
          revenue: 0,
        };
        groups[key].total++;
        if (booking.status === "completed") {
          groups[key].completed++;
          groups[key].revenue += getTestBookingRevenue(booking);
        }
        if (["cancelled", "late_cancelled"].includes(booking.status)) {
          groups[key].cancelled++;
        }
        if (booking.status === "no_show") groups[key].noShow++;
        if (booking.status === "pending") groups[key].pending++;
        return groups;
      }, {})
    );
  }

  if (groupId === "$barberId") {
    return Object.values(
      matched.reduce((groups, booking) => {
        groups[booking.barberId] ||= {
          _id: booking.barberId,
          totalBookings: 0,
          completed: 0,
          cancelled: 0,
          noShow: 0,
          revenue: 0,
          completedBookingDates: [],
          uniqueClients: [],
        };
        groups[booking.barberId].totalBookings++;
        if (booking.status === "completed") {
          groups[booking.barberId].completed++;
          groups[booking.barberId].revenue += getTestBookingRevenue(booking);
          const completedDate = getAppointmentDate(booking);
          if (
            completedDate &&
            !groups[booking.barberId].completedBookingDates.includes(completedDate)
          ) {
            groups[booking.barberId].completedBookingDates.push(completedDate);
          }
        }
        if (["cancelled", "late_cancelled"].includes(booking.status)) {
          groups[booking.barberId].cancelled++;
        }
        if (booking.status === "no_show") groups[booking.barberId].noShow++;
        if (!groups[booking.barberId].uniqueClients.includes(booking.clientId)) {
          groups[booking.barberId].uniqueClients.push(booking.clientId);
        }
        return groups;
      }, {})
    );
  }

  if (groupId === "$serviceName") {
    return Object.values(
      matched.reduce((groups, booking) => {
        groups[booking.serviceName] ||= {
          _id: booking.serviceName,
          count: 0,
          revenue: 0,
        };
        groups[booking.serviceName].count++;
        if (booking.status === "completed") {
          groups[booking.serviceName].revenue += getTestBookingRevenue(booking);
        }
        return groups;
      }, {})
    );
  }

  return [];
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

const assertClose = (actual, expected) => {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `expected ${actual} to be close to ${expected}`
  );
};

const setupEarningsReport = async ({ members, bookings, from = "2026-06-15", to = "2026-06-15" }) => {
  setupOwnerReportAccess(members);
  Booking.aggregate = async (pipeline) => aggregateReportBookings(bookings, pipeline);
  Booking.find = (query) =>
    makeLeanQuery(bookings.filter((booking) => bookingMatchesSalonReportQuery(booking, query)));

  return getSalonReport(salonId, ownerId, { from, to });
};

const setupCsvExport = ({
  members = [makeStaffUser(staffOneId, "staff", "accepted")],
  bookings = [],
  salonName = "Test Salon",
  requesterId = ownerId,
  admins = [],
  from = "2026-06-15",
  to = "2026-06-15",
  format = "csv",
  barberId = "",
} = {}) => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins,
    name: salonName,
  });
  User.findById = () => makeLeanQuery([{ _id: requesterId }]);
  User.find = () => ({ select: async () => members });
  Booking.aggregate = async (pipeline) => aggregateReportBookings(bookings, pipeline);
  Booking.find = (query) =>
    makeLeanQuery(bookings.filter((booking) => bookingMatchesSalonReportQuery(booking, query)));

  return getSalonReportCsvExport(salonId, requesterId, {
    format,
    from,
    to,
    barberId,
  });
};

beforeEach(() => {
  setSubscriptionFindOneMock();
});

afterEach(() => {
  Salon.findById = originalMethods.salonFindById;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
  Booking.aggregate = originalMethods.bookingAggregate;
  Booking.find = originalMethods.bookingFind;
  Subscription.findOne = originalMethods.subscriptionFindOne;
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

test("no salon subscription denied", async () => {
  setupOwnerReportAccess();
  setSubscriptionFindOneMock([]);

  await assert.rejects(
    () => getSalonReport(salonId, ownerId, { from: fromDate, to: toDate }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "SALON_SUBSCRIPTION_REQUIRED");
      return true;
    }
  );
});

test("cancelled or expired salon subscription denied", async () => {
  setupOwnerReportAccess();

  for (const subscription of [
    makeSubscription({ status: "cancelled" }),
    makeSubscription({ status: "active", currentPeriodEnd: pastDate }),
  ]) {
    setSubscriptionFindOneMock([subscription]);

    await assert.rejects(
      () => getSalonReport(salonId, ownerId, { from: fromDate, to: toDate }),
      (error) => {
        assert.ok(error instanceof ReportError);
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, "SALON_SUBSCRIPTION_REQUIRED");
        return true;
      }
    );
  }
});

test("active salon subscription allowed", async () => {
  setupOwnerReportAccess();
  setSubscriptionFindOneMock([makeSubscription({ status: "active" })]);
  Booking.aggregate = async () => [];
  Booking.find = () => makeLeanQuery([]);

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
  });

  assert.equal(result.summary.totalBookings, 0);
});

test("trialing salon subscription allowed", async () => {
  setupOwnerReportAccess();
  setSubscriptionFindOneMock([makeSubscription({ status: "trialing" })]);
  Booking.aggregate = async () => [];
  Booking.find = () => makeLeanQuery([]);

  const result = await getSalonReport(salonId, ownerId, {
    from: fromDate,
    to: toDate,
  });

  assert.equal(result.summary.totalBookings, 0);
});

test("another salon active subscription denied", async () => {
  setupOwnerReportAccess();
  setSubscriptionFindOneMock([
    makeSubscription({ _id: "subscription-2", ownerId: salonBId }),
  ]);

  await assert.rejects(
    () => getSalonReport(salonId, ownerId, { from: fromDate, to: toDate }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "SALON_SUBSCRIPTION_REQUIRED");
      return true;
    }
  );
});

test("personal barber subscription does not unlock salon reports", async () => {
  setupOwnerReportAccess();
  setSubscriptionFindOneMock([
    makeSubscription({
      _id: "barber-subscription",
      ownerType: "barber",
      ownerId,
    }),
  ]);

  await assert.rejects(
    () => getSalonReport(salonId, ownerId, { from: fromDate, to: toDate }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "SALON_SUBSCRIPTION_REQUIRED");
      return true;
    }
  );
});

test("CSV export rejects unsupported or missing format", async () => {
  await assert.rejects(
    () => setupCsvExport({ format: "pdf" }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "UNSUPPORTED_REPORT_EXPORT_FORMAT");
      return true;
    }
  );

  await assert.rejects(
    () =>
      getSalonReportCsvExport(salonId, ownerId, {
        from: fromDate,
        to: toDate,
      }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "UNSUPPORTED_REPORT_EXPORT_FORMAT");
      return true;
    }
  );
});

test("CSV export uses report owner/admin and salon subscription checks", async () => {
  setSubscriptionFindOneMock([]);

  await assert.rejects(
    () => setupCsvExport(),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "SALON_SUBSCRIPTION_REQUIRED");
      return true;
    }
  );

  setSubscriptionFindOneMock([makeSubscription({ ownerId: salonBId })]);

  await assert.rejects(
    () => setupCsvExport(),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "SALON_SUBSCRIPTION_REQUIRED");
      return true;
    }
  );

  setSubscriptionFindOneMock([
    makeSubscription({ ownerType: "barber", ownerId }),
  ]);

  await assert.rejects(
    () => setupCsvExport(),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "SALON_SUBSCRIPTION_REQUIRED");
      return true;
    }
  );

  setSubscriptionFindOneMock();

  await assert.rejects(
    () => setupCsvExport({ requesterId: memberId }),
    (error) => {
      assert.ok(error instanceof ReportError);
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  const adminExport = await setupCsvExport({
    requesterId: adminId,
    admins: [adminId],
  });

  assert.equal(adminExport.contentType, "text/csv; charset=utf-8");
  assert.match(adminExport.filename, /^salon-reports-test-salon-/);
});

test("CSV export reuses report filtering and safe earnings fields", async () => {
  const exportData = await setupCsvExport({
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "commission",
          commissionStaffPercent: 50,
          commissionSalonPercent: 50,
          notes: "private note",
          updatedBy: "admin-1",
        },
      }),
      makeChairRenterUser(),
      makeStaffUser(staffTwoId, "staff", "accepted", {
        worksAsSpecialist: false,
      }),
    ],
    bookings: [
      {
        _id: "included",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 100,
        serviceName: "Haircut",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
      {
        _id: "other-salon",
        salonId: salonBId,
        barberId: staffOneId,
        status: "completed",
        price: 900,
        serviceName: "Color",
        clientId: "client-2",
        bookingDate: "2026-06-15",
      },
      {
        _id: "chair-renter",
        salonId,
        barberId: chairRenterId,
        status: "completed",
        price: 800,
        serviceName: "Rental",
        clientId: "client-3",
        bookingDate: "2026-06-15",
      },
      {
        _id: "non-specialist",
        salonId,
        barberId: staffTwoId,
        status: "completed",
        price: 700,
        serviceName: "Color",
        clientId: "client-4",
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.match(exportData.content, /Gross revenue,100/);
  assert.match(exportData.content, /Staff earnings total,50/);
  assert.match(exportData.content, /Staff One,1,1,100,50,50,Commission 50\/50,50,50,,,calculated/);
  assert.equal(exportData.content.includes("Chair Renter"), false);
  assert.equal(exportData.content.includes("Staff Two"), false);
  assert.equal(exportData.content.includes("900"), false);
  assert.equal(exportData.content.includes("800"), false);
  assert.equal(exportData.content.includes("700"), false);
  assert.equal(exportData.content.includes("staffPayment"), false);
  assert.equal(exportData.content.includes("private note"), false);
  assert.equal(exportData.content.includes("admin-1"), false);
  assert.equal(exportData.content.includes(clientIdClient), false);
});

test("CSV export escapes values and prevents spreadsheet injection", async () => {
  const injectableStaff = {
    ...makeStaffUser(staffOneId, "staff", "accepted"),
    name: '=Staff, "One"\nNext',
  };
  const exportData = await setupCsvExport({
    salonName: '+Salon, "Main"\nHQ',
    members: [injectableStaff],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 100,
        serviceName: "@Service",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.match(exportData.content, /"'\+Salon, ""Main""\r?\nHQ"/);
  assert.match(exportData.content, /"'=Staff, ""One""\r?\nNext"/);
  assert.match(exportData.content, /'@Service,1,100/);
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

test("reports isolate bookings by requested salonId across summary and breakdowns", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [adminId],
    name: "Test Salon",
  });
  User.findById = () => makeLeanQuery([{ _id: ownerId }]);
  User.find = () => ({
    select: async () => [
      makeStaffUser(staffOneId, "staff", "accepted"),
      makeChairRenterUser(),
      makeStaffUser(ownerId, "staff", "accepted", { worksAsSpecialist: false }),
    ],
  });

  const bookings = [
    {
      _id: "salon-a-booking",
      salonId,
      barberId: staffOneId,
      status: "completed",
      price: 100,
      serviceName: "Haircut",
      clientId: clientIdClient,
      bookingDate: "2026-06-15",
    },
    {
      _id: "salon-b-booking",
      salonId: salonBId,
      barberId: staffOneId,
      status: "completed",
      price: 900,
      serviceName: "Color",
      clientId: "client-2",
      bookingDate: "2026-06-15",
    },
    {
      _id: "chair-renter-booking",
      salonId,
      barberId: chairRenterId,
      status: "completed",
      price: 500,
      serviceName: "Rental Service",
      clientId: "client-3",
      bookingDate: "2026-06-15",
    },
    {
      _id: "non-working-owner-booking",
      salonId,
      barberId: ownerId,
      status: "completed",
      price: 300,
      serviceName: "Owner Service",
      clientId: "client-4",
      bookingDate: "2026-06-15",
    },
  ];

  Booking.aggregate = async (pipeline) => aggregateReportBookings(bookings, pipeline);
  Booking.find = (query) =>
    makeLeanQuery(bookings.filter((booking) => bookingMatchesSalonReportQuery(booking, query)));

  const result = await getSalonReport(salonId, ownerId, {
    from: "2026-06-15",
    to: "2026-06-15",
  });

  assert.equal(result.summary.totalBookings, 1);
  assert.equal(result.summary.completedBookings, 1);
  assert.equal(result.summary.totalRevenue, 100);
  assert.deepEqual(result.byStatus, [{ status: "completed", count: 1 }]);
  assert.equal(result.byDay.length, 1);
  assert.equal(result.byDay[0].total, 1);
  assert.equal(result.byDay[0].revenue, 100);
  assert.equal(result.byStaff.length, 1);
  assert.equal(result.byStaff[0].barberId, staffOneId);
  assert.equal(result.byStaff[0].totalBookings, 1);
  assert.equal(result.byStaff[0].grossRevenue, 100);
  assert.equal(result.summary.grossRevenue, 100);
  assert.equal(result.summary.staffEarningsTotal, 0);
  assert.equal(result.summary.salonEarningsTotal, 100);
  assert.deepEqual(result.topServices, [{ _id: "Haircut", count: 1, revenue: 100 }]);
});

test("earnings calculate a 50/50 commission split from completed revenue", async () => {
  const result = await setupEarningsReport({
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "commission",
          commissionStaffPercent: 50,
          commissionSalonPercent: 50,
          notes: "private note",
          updatedBy: "admin-1",
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 120,
        serviceName: "Haircut",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.equal(result.byStaff[0].grossRevenue, 120);
  assert.equal(result.byStaff[0].staffEarnings, 60);
  assert.equal(result.byStaff[0].salonEarnings, 60);
  assert.equal(result.byStaff[0].paymentType, "commission");
  assert.equal(result.byStaff[0].commissionStaffPercent, 50);
  assert.equal(result.byStaff[0].commissionSalonPercent, 50);
  assert.equal(result.byStaff[0].fixedAmount, null);
  assert.equal(result.byStaff[0].fixedPeriod, "");
  assert.equal(result.byStaff[0].earningsCalculationStatus, "calculated");
  assert.equal(result.byStaff[0].staffPayment, undefined);
  assert.equal(result.byStaff[0].notes, undefined);
  assert.equal(result.byStaff[0].updatedBy, undefined);
  assert.equal(result.summary.grossRevenue, 120);
  assert.equal(result.summary.staffEarningsTotal, 60);
  assert.equal(result.summary.salonEarningsTotal, 60);
  assert.equal(result.summary.fixedPayNotProratedCount, 0);
});

test("earnings calculate a 70/30 commission split from completed revenue", async () => {
  const result = await setupEarningsReport({
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "commission",
          commissionStaffPercent: 70,
          commissionSalonPercent: 30,
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 200,
        serviceName: "Color",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.equal(result.byStaff[0].staffEarnings, 140);
  assert.equal(result.byStaff[0].salonEarnings, 60);
  assert.equal(result.summary.staffEarningsTotal, 140);
  assert.equal(result.summary.salonEarningsTotal, 60);
});

test("earnings for none payment type leave gross revenue with salon", async () => {
  const result = await setupEarningsReport({
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: { type: "none" },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 80,
        serviceName: "Trim",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.equal(result.byStaff[0].grossRevenue, 80);
  assert.equal(result.byStaff[0].staffEarnings, 0);
  assert.equal(result.byStaff[0].salonEarnings, 80);
  assert.equal(result.byStaff[0].paymentType, "none");
  assert.equal(result.byStaff[0].earningsCalculationStatus, "not_configured");
  assert.equal(result.summary.staffEarningsTotal, 0);
  assert.equal(result.summary.salonEarningsTotal, 80);
});

test("daily fixed pay uses unique completed booking dates", async () => {
  const result = await setupEarningsReport({
    from: "2026-06-15",
    to: "2026-06-16",
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "fixed",
          fixedAmount: 100,
          fixedPeriod: "daily",
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 120,
        serviceName: "Color",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
      {
        _id: "b2",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 80,
        serviceName: "Trim",
        clientId: "client-2",
        bookingDate: "2026-06-16",
      },
    ],
  });

  assert.equal(result.byStaff[0].grossRevenue, 200);
  assert.equal(result.byStaff[0].staffEarnings, 200);
  assert.equal(result.byStaff[0].salonEarnings, 0);
  assert.equal(result.byStaff[0].paymentType, "fixed");
  assert.equal(result.byStaff[0].fixedAmount, 100);
  assert.equal(result.byStaff[0].fixedPeriod, "daily");
  assert.equal(result.byStaff[0].fixedProratedDays, 2);
  assert.equal(result.byStaff[0].fixedProrationUnits, 2);
  assert.equal(result.byStaff[0].earningsCalculationStatus, "calculated_prorated");
  assert.equal(result.summary.fixedPayNotProratedCount, 0);
  assert.equal(result.summary.fixedPayProratedCount, 1);
});

test("daily fixed pay counts multiple completed bookings on same day once", async () => {
  const result = await setupEarningsReport({
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "fixed",
          fixedAmount: 100,
          fixedPeriod: "daily",
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 120,
        serviceName: "Color",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
      {
        _id: "b2",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 80,
        serviceName: "Trim",
        clientId: "client-2",
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.equal(result.byStaff[0].staffEarnings, 100);
  assert.equal(result.byStaff[0].fixedProratedDays, 1);
  assert.equal(result.byStaff[0].fixedProrationUnits, 1);
});

test("weekly fixed pay prorates by inclusive report range days", async () => {
  const result = await setupEarningsReport({
    from: "2026-06-15",
    to: "2026-06-17",
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "fixed",
          fixedAmount: 700,
          fixedPeriod: "weekly",
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 500,
        serviceName: "Color",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.equal(result.byStaff[0].fixedProratedDays, 3);
  assertClose(result.byStaff[0].fixedProrationUnits, 3 / 7);
  assertClose(result.byStaff[0].staffEarnings, 300);
  assertClose(result.byStaff[0].salonEarnings, 200);
});

test("monthly fixed pay prorates by actual calendar-month overlap", async () => {
  const result = await setupEarningsReport({
    from: "2026-01-16",
    to: "2026-01-31",
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "fixed",
          fixedAmount: 3100,
          fixedPeriod: "monthly",
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 2000,
        serviceName: "Color",
        clientId: clientIdClient,
        bookingDate: "2026-01-16",
      },
    ],
  });

  assert.equal(result.byStaff[0].fixedProratedDays, 16);
  assertClose(result.byStaff[0].fixedProrationUnits, 16 / 31);
  assertClose(result.byStaff[0].staffEarnings, 1600);
  assertClose(result.byStaff[0].salonEarnings, 400);
});

test("monthly fixed pay handles leap-year February", async () => {
  const result = await setupEarningsReport({
    from: "2024-02-15",
    to: "2024-02-29",
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "fixed",
          fixedAmount: 2900,
          fixedPeriod: "monthly",
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 2000,
        serviceName: "Color",
        clientId: clientIdClient,
        bookingDate: "2024-02-15",
      },
    ],
  });

  assert.equal(result.byStaff[0].fixedProratedDays, 15);
  assertClose(result.byStaff[0].fixedProrationUnits, 15 / 29);
  assertClose(result.byStaff[0].staffEarnings, 1500);
  assertClose(result.byStaff[0].salonEarnings, 500);
});

test("fixed pay without completed bookings returns zero staff earnings", async () => {
  const result = await setupEarningsReport({
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "fixed",
          fixedAmount: 100,
          fixedPeriod: "daily",
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "pending",
        price: 200,
        serviceName: "Color",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.equal(result.byStaff[0].grossRevenue, 0);
  assert.equal(result.byStaff[0].staffEarnings, 0);
  assert.equal(result.byStaff[0].salonEarnings, 0);
  assert.equal(result.byStaff[0].fixedProratedDays, 0);
  assert.equal(result.summary.fixedPayProratedCount, 0);
});

test("fixed pay salon earnings does not go below zero", async () => {
  const result = await setupEarningsReport({
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "fixed",
          fixedAmount: 500,
          fixedPeriod: "daily",
        },
      }),
    ],
    bookings: [
      {
        _id: "b1",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 100,
        serviceName: "Trim",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.equal(result.byStaff[0].staffEarnings, 500);
  assert.equal(result.byStaff[0].salonEarnings, 0);
});

test("earnings use only completed bookings for the requested salon and staff", async () => {
  const result = await setupEarningsReport({
    members: [
      makeStaffUser(staffOneId, "staff", "accepted", {
        staffPayment: {
          type: "commission",
          commissionStaffPercent: 50,
          commissionSalonPercent: 50,
        },
      }),
      makeChairRenterUser(),
      makeStaffUser(staffTwoId, "staff", "accepted", { worksAsSpecialist: false }),
    ],
    bookings: [
      {
        _id: "completed",
        salonId,
        barberId: staffOneId,
        status: "completed",
        price: 100,
        serviceName: "Haircut",
        clientId: clientIdClient,
        bookingDate: "2026-06-15",
      },
      {
        _id: "pending",
        salonId,
        barberId: staffOneId,
        status: "pending",
        price: 500,
        serviceName: "Haircut",
        clientId: "client-2",
        bookingDate: "2026-06-15",
      },
      {
        _id: "other-salon",
        salonId: salonBId,
        barberId: staffOneId,
        status: "completed",
        price: 900,
        serviceName: "Color",
        clientId: "client-3",
        bookingDate: "2026-06-15",
      },
      {
        _id: "chair-renter",
        salonId,
        barberId: chairRenterId,
        status: "completed",
        price: 700,
        serviceName: "Color",
        clientId: "client-4",
        bookingDate: "2026-06-15",
      },
      {
        _id: "non-specialist",
        salonId,
        barberId: staffTwoId,
        status: "completed",
        price: 600,
        serviceName: "Color",
        clientId: "client-5",
        bookingDate: "2026-06-15",
      },
    ],
  });

  assert.equal(result.byStaff.length, 1);
  assert.equal(result.byStaff[0].barberId, staffOneId);
  assert.equal(result.byStaff[0].grossRevenue, 100);
  assert.equal(result.byStaff[0].staffEarnings, 50);
  assert.equal(result.byStaff[0].salonEarnings, 50);
  assert.equal(result.summary.grossRevenue, 100);
  assert.equal(result.summary.staffEarningsTotal, 50);
  assert.equal(result.summary.salonEarningsTotal, 50);
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
