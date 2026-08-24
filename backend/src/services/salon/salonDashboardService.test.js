import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Booking from "../../models/Booking.js";
import Review from "../../models/Review.js";
import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import Subscription from "../../models/Subscription.js";
import SubscriptionPlan from "../../models/SubscriptionPlan.js";
import SubscriptionSeat from "../../models/SubscriptionSeat.js";
import User from "../../models/User.js";
import {
  DashboardError,
  getSalonDashboard,
} from "./salonDashboardService.js";

const originalMethods = {
  bookingCountDocuments: Booking.countDocuments,
  bookingFind: Booking.find,
  reviewFind: Review.find,
  salonFindById: Salon.findById,
  joinRequestCountDocuments: SalonJoinRequest.countDocuments,
  subscriptionFind: Subscription.find,
  subscriptionFindOne: Subscription.findOne,
  subscriptionPlanFindOne: SubscriptionPlan.findOne,
  subscriptionSeatCountDocuments: SubscriptionSeat.countDocuments,
  subscriptionSeatFind: SubscriptionSeat.find,
  userFind: User.find,
  userFindById: User.findById,
};

const ownerId = "64b000000000000000000100";
const adminId = "64b000000000000000000101";
const outsiderId = "64b000000000000000000102";
const salonId = "64b000000000000000000103";
const staffBarberId = "64b000000000000000000104";
const chairRenterId = "64b000000000000000000105";

afterEach(() => {
  Booking.countDocuments = originalMethods.bookingCountDocuments;
  Booking.find = originalMethods.bookingFind;
  Review.find = originalMethods.reviewFind;
  Salon.findById = originalMethods.salonFindById;
  SalonJoinRequest.countDocuments = originalMethods.joinRequestCountDocuments;
  Subscription.find = originalMethods.subscriptionFind;
  Subscription.findOne = originalMethods.subscriptionFindOne;
  SubscriptionPlan.findOne = originalMethods.subscriptionPlanFindOne;
  SubscriptionSeat.countDocuments = originalMethods.subscriptionSeatCountDocuments;
  SubscriptionSeat.find = originalMethods.subscriptionSeatFind;
  User.find = originalMethods.userFind;
  User.findById = originalMethods.userFindById;
});

const createLeanQuery = (items) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  limit() {
    return this;
  },
  populate() {
    return this;
  },
  async lean() {
    return items;
  },
});

const configureDashboardMocks = (bookings) => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Owner Salon",
  });
  User.findById = () => ({
    select: async () => ({ _id: ownerId }),
  });
  User.find = () => ({
    select: async () => [
      {
        _id: staffBarberId,
        salons: [
          {
            salon: { toString: () => salonId },
            status: "approved",
            relationshipType: "staff",
          },
        ],
      },
    ],
  });
  Subscription.findOne = () => ({ lean: async () => null });
  Subscription.find = () => ({ lean: async () => [] });
  SubscriptionPlan.findOne = async () => ({ pricePerSeat: 100 });
  SubscriptionSeat.countDocuments = async () => 0;
  SubscriptionSeat.find = () => ({ lean: async () => [] });
  SalonJoinRequest.countDocuments = async () => 0;
  Booking.countDocuments = async () => 0;
  Booking.find = (query) => {
    const isMonthQuery = query.$or?.some(
      (condition) => condition.bookingDate?.$gte
    );
    return createLeanQuery(isMonthQuery ? bookings : []);
  };
  Review.find = () => createLeanQuery([]);
};

test("getSalonDashboard excludes chair renters from owner booking and revenue metrics", async () => {
  const bookingCountQueries = [];
  const bookingFindQueries = [];
  const reviewQueries = [];

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [adminId],
    name: "Owner Salon",
    city: "Yerevan",
    address: "Main 1",
    phone: "+37410000000",
    imageUrl: "/uploads/salon.jpg",
  });

  User.findById = () => ({
    select: async () => ({ _id: ownerId }),
  });

  User.find = () => ({
    select: async () => [
      {
        _id: staffBarberId,
        salons: [
          { salon: { toString: () => salonId }, status: "approved", relationshipType: "staff" },
        ],
        salon: salonId,
        salonStatus: "approved",
      },
      {
        _id: chairRenterId,
        salons: [
          {
            salon: { toString: () => salonId },
            status: "approved",
            relationshipType: "chair_renter",
          },
        ],
        salon: salonId,
        salonStatus: "approved",
      },
    ],
  });

  Subscription.findOne = () => ({
    lean: async () => ({
      _id: "subscription-1",
      ownerType: "salon",
      ownerId: salonId,
      status: "active",
      seatCount: 2,
      currentPeriodEnd: new Date("2026-06-30T00:00:00.000Z"),
      totalPrice: 200,
      pricePerSeat: 100,
    }),
  });
  Subscription.find = () => ({
    lean: async () => [{ _id: "subscription-1", status: "active" }],
  });
  SubscriptionPlan.findOne = async () => ({ pricePerSeat: 100 });
  SubscriptionSeat.countDocuments = async () => 2;
  SubscriptionSeat.find = () => ({
    lean: async () => [
      { barberId: staffBarberId, status: "active" },
      { barberId: chairRenterId, status: "active" },
    ],
  });
  SalonJoinRequest.countDocuments = async () => 1;

  Booking.countDocuments = async (query) => {
    bookingCountQueries.push(query);

    if (query.status === "pending") return 2;
    return 1;
  };

  Booking.find = (query) => {
    bookingFindQueries.push(query);

    if (query.startTime?.$gte) {
      return createLeanQuery([
        {
          _id: "upcoming-staff",
          barberId: { name: "Staff Barber" },
          clientId: { name: "Client", phone: "555" },
          serviceId: { name: "Cut" },
          bookingDate: "2026-06-05",
          startTime: "10:00",
          status: "confirmed",
        },
      ]);
    }

    if (query.status === "completed" && query.$or) {
      return createLeanQuery([
        {
          _id: "today-completed-staff",
          barberId: staffBarberId,
          status: "completed",
          price: 120,
        },
      ]);
    }

    return createLeanQuery([
      {
        _id: "month-staff",
        barberId: staffBarberId,
        status: "completed",
        bookingDate: "2026-06-05",
        price: 120,
      },
    ]);
  };

  Review.find = (query) => {
    reviewQueries.push(query);
    return createLeanQuery([{ barberId: staffBarberId, rating: 5 }]);
  };

  const result = await getSalonDashboard(
    salonId,
    ownerId,
    new Date("2026-05-31T20:30:00.000Z")
  );

  assert.deepEqual(result.staffSummary, {
    totalApprovedStaff: 1,
    totalChairRenters: 1,
    totalPendingRequests: 1,
    activeSeatMembers: 2,
    staffWithoutSeat: 0,
    chairRentersWithoutSeat: 0,
  });
  assert.equal(result.bookingSummary.todayBookings, 1);
  assert.equal(result.bookingSummary.pendingBookings, 2);
  assert.equal(result.revenueSummary.todayRevenue, 120);
  assert.equal(result.revenueSummary.monthRevenue, 120);
  assert.equal(result.reviewSummary.totalReviews, 1);
  assert.equal(result.reviewSummary.averageRating, 5);
  assert.equal(result.upcomingBookings.length, 1);
  assert.equal(result.upcomingBookings[0].barberName, "Staff Barber");

  for (const query of bookingCountQueries) {
    assert.equal(query.salonId, salonId);
    assert.deepEqual(query.barberId, { $in: [staffBarberId] });
  }

  const staffOnlyQueries = bookingFindQueries.filter((query) => query.barberId);
  for (const query of staffOnlyQueries) {
    assert.equal(query.salonId, salonId);
    assert.deepEqual(query.barberId, { $in: [staffBarberId] });
  }

  assert.deepEqual(reviewQueries, [{
    barberId: { $in: [staffBarberId] },
    bookingId: { $in: ["month-staff"] },
  }]);

  const monthQueries = bookingFindQueries.filter((query) =>
    query.$or?.some((condition) => condition.bookingDate?.$gte)
  );
  assert.equal(monthQueries.length, 2);
  for (const query of monthQueries) {
    assert.deepEqual(query.bookingDate, undefined);
    assert.deepEqual(query.updatedAt, undefined);
    assert.deepEqual(query.$or[0].bookingDate, {
      $gte: "2026-06-01",
      $lt: "2026-07-01",
    });
  }
});

test("salon dashboard isolates bookings, revenue, reviews, upcoming clients, and pending alerts by salon", async () => {
  const salonBId = "64b000000000000000000106";
  const bookings = [
    {
      _id: "salon-a-completed",
      barberId: staffBarberId,
      salonId,
      status: "completed",
      bookingDate: "2026-06-05",
      dayKey: "2026-06-05",
      price: 100,
      clientId: { name: "Salon A client" },
    },
    {
      _id: "salon-a-upcoming",
      barberId: staffBarberId,
      salonId,
      status: "confirmed",
      bookingDate: "2026-06-06",
      dayKey: "2026-06-06",
      startTime: new Date("2026-06-06T10:00:00.000Z"),
      clientId: { name: "Salon A upcoming client" },
      serviceId: { name: "Salon A service" },
    },
    {
      _id: "salon-a-pending",
      barberId: staffBarberId,
      salonId,
      status: "pending",
      bookingDate: "2026-06-06",
      dayKey: "2026-06-06",
      clientId: { name: "Salon A pending client" },
    },
    {
      _id: "salon-b-completed",
      barberId: staffBarberId,
      salonId: salonBId,
      status: "completed",
      bookingDate: "2026-06-05",
      dayKey: "2026-06-05",
      price: 900,
      clientId: { name: "Salon B client" },
    },
    {
      _id: "salon-b-upcoming",
      barberId: staffBarberId,
      salonId: salonBId,
      status: "confirmed",
      bookingDate: "2026-06-06",
      dayKey: "2026-06-06",
      startTime: new Date("2026-06-06T09:00:00.000Z"),
      clientId: { name: "Salon B upcoming client" },
      serviceId: { name: "Salon B service" },
    },
    {
      _id: "salon-b-pending",
      barberId: staffBarberId,
      salonId: salonBId,
      status: "pending",
      bookingDate: "2026-06-06",
      dayKey: "2026-06-06",
      clientId: { name: "Salon B pending client" },
    },
    {
      _id: "independent-completed",
      barberId: staffBarberId,
      salonId: null,
      status: "completed",
      bookingDate: "2026-06-05",
      dayKey: "2026-06-05",
      price: 700,
      clientId: { name: "Independent client" },
    },
    {
      _id: "independent-upcoming",
      barberId: staffBarberId,
      salonId: null,
      status: "confirmed",
      bookingDate: "2026-06-06",
      dayKey: "2026-06-06",
      startTime: new Date("2026-06-06T08:00:00.000Z"),
      clientId: { name: "Independent upcoming client" },
      serviceId: { name: "Independent service" },
    },
    {
      _id: "independent-pending",
      barberId: staffBarberId,
      salonId: null,
      status: "pending",
      bookingDate: "2026-06-06",
      dayKey: "2026-06-06",
      clientId: { name: "Independent pending client" },
    },
  ];
  const reviews = [
    { bookingId: "salon-a-completed", barberId: staffBarberId, rating: 5 },
    { bookingId: "salon-b-completed", barberId: staffBarberId, rating: 1 },
    { bookingId: "independent-completed", barberId: staffBarberId, rating: 1 },
  ];
  const bookingFindQueries = [];
  const reviewQueries = [];
  const now = new Date("2026-06-05T09:00:00.000Z");

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Salon A",
  });
  User.findById = () => ({ select: async () => ({ _id: ownerId }) });
  User.find = () => ({
    select: async () => [{
      _id: staffBarberId,
      salons: [{ salon: salonId, status: "approved", relationshipType: "staff" }],
    }],
  });
  Subscription.findOne = () => ({
    lean: async () => ({
      _id: "subscription-a",
      status: "active",
      seatCount: 1,
      currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
      totalPrice: 100,
      pricePerSeat: 100,
    }),
  });
  Subscription.find = () => ({ lean: async () => [{ _id: "subscription-a", status: "active" }] });
  SubscriptionPlan.findOne = async () => ({ pricePerSeat: 100 });
  SubscriptionSeat.countDocuments = async () => 1;
  SubscriptionSeat.find = () => ({ lean: async () => [{ barberId: staffBarberId, status: "active" }] });
  SalonJoinRequest.countDocuments = async () => 0;

  const matchesSalonA = (booking, query) =>
    query.salonId === salonId &&
    String(booking.barberId) === staffBarberId &&
    String(booking.salonId) === salonId;

  Booking.countDocuments = async (query) => {
    let scoped = bookings.filter((booking) => matchesSalonA(booking, query));
    const exactDate = Array.isArray(query.status?.$in)
      ? query.$or?.find((condition) => typeof condition.bookingDate === "string")?.bookingDate
      : undefined;
    if (exactDate) {
      scoped = scoped.filter((booking) => booking.bookingDate === exactDate || booking.dayKey === exactDate);
    }
    if (query.status === "pending") {
      return scoped.filter((booking) => booking.status === "pending").length;
    }
    if (query.status === "confirmed") {
      return scoped.filter((booking) => booking.status === "confirmed").length;
    }
    if (Array.isArray(query.status?.$in)) {
      return scoped.filter((booking) => query.status.$in.includes(booking.status)).length;
    }
    return 0;
  };
  Booking.find = (query) => {
    bookingFindQueries.push(query);
    let result = bookings.filter((booking) => matchesSalonA(booking, query));
    if (query.status === "completed") {
      result = result.filter((booking) => booking.status === "completed");
    }
    if (query.startTime?.$gte) {
      result = result.filter((booking) => booking.status === "confirmed");
    }
    if (query.$or?.some((condition) => condition.bookingDate?.$gte)) {
      result = result.filter((booking) => booking.bookingDate.startsWith("2026-06"));
    }
    return createLeanQuery(result);
  };
  Review.find = (query) => {
    reviewQueries.push(query);
    const bookingIds = query.bookingId?.$in || reviews.map((review) => review.bookingId);
    return createLeanQuery(reviews.filter((review) => bookingIds.includes(review.bookingId)));
  };

  const result = await getSalonDashboard(salonId, ownerId, now);

  assert.equal(result.bookingSummary.todayBookings, 1);
  assert.equal(result.bookingSummary.upcomingBookingsCount, 1);
  assert.equal(result.bookingSummary.pendingBookings, 1);
  assert.equal(result.bookingSummary.completedThisMonth, 1);
  assert.equal(result.revenueSummary.todayRevenue, 100);
  assert.equal(result.revenueSummary.monthRevenue, 100);
  assert.deepEqual(result.reviewSummary, { averageRating: 5, totalReviews: 1 });
  assert.deepEqual(result.upcomingBookings.map((booking) => booking.clientName), [
    "Salon A upcoming client",
  ]);
  assert.deepEqual(result.alerts.map((alert) => alert.type), ["pending_bookings"]);
  assert.ok(bookingFindQueries.length > 0);
  for (const query of bookingFindQueries) assert.equal(query.salonId, salonId);
  assert.deepEqual(reviewQueries, [{
    barberId: { $in: [staffBarberId] },
    bookingId: { $in: ["salon-a-completed", "salon-a-upcoming", "salon-a-pending"] },
  }]);
});

test("dashboard pending counts and alerts exclude past Armenia bookings", async () => {
  const pendingQueries = [];
  configureDashboardMocks([]);
  Booking.countDocuments = async (query) => {
    if (query.status === "pending") pendingQueries.push(query);
    return 0;
  };

  const result = await getSalonDashboard(
    salonId,
    ownerId,
    new Date("2026-05-07T10:00:00+04:00")
  );

  assert.equal(result.bookingSummary.pendingBookings, 0);
  assert.equal(pendingQueries.length, 2);
  for (const query of pendingQueries) {
    assert.equal(query.salonId, salonId);
    assert.deepEqual(query.barberId, { $in: [staffBarberId] });
    assert.equal(query.status, "pending");
    assert.ok(query.$or.some((condition) => condition.bookingDate === "2026-05-07"));
    assert.ok(query.$or.some((condition) => condition.bookingDate?.$gt === "2026-05-07"));
  }
});

test("dashboard monthly metrics use Armenia appointment months and completedAt fallback", async () => {
  const bookings = [
    {
      _id: "august-appointment",
      barberId: staffBarberId,
      status: "completed",
      createdAt: new Date("2026-07-31T12:00:00.000Z"),
      updatedAt: new Date("2026-09-03T12:00:00.000Z"),
      bookingDate: "2026-08-15",
      dayKey: "2026-08-15",
      price: 100,
      finalPrice: 70,
      promotionId: "promotion-1",
    },
    {
      _id: "september-appointment",
      barberId: staffBarberId,
      status: "completed",
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
      bookingDate: "2026-09-01",
      dayKey: "2026-09-01",
      price: 90,
    },
    {
      _id: "august-cancelled",
      barberId: staffBarberId,
      status: "cancelled",
      createdAt: new Date("2026-08-20T12:00:00.000Z"),
      bookingDate: "2026-08-20",
      dayKey: "2026-08-20",
      price: 80,
    },
    {
      _id: "august-rejected",
      barberId: staffBarberId,
      status: "rejected",
      createdAt: new Date("2026-08-21T12:00:00.000Z"),
      bookingDate: "2026-08-21",
      dayKey: "2026-08-21",
      price: 60,
    },
    {
      _id: "completed-fallback",
      barberId: staffBarberId,
      status: "completed",
      bookingDate: "",
      dayKey: "",
      completedAt: new Date("2026-08-31T19:59:59.000Z"),
      price: 40,
    },
    {
      _id: "outside-armenia-month",
      barberId: staffBarberId,
      status: "completed",
      bookingDate: "",
      dayKey: "",
      completedAt: new Date("2026-08-31T20:00:00.000Z"),
      price: 500,
    },
  ];

  configureDashboardMocks(bookings);

  const august = await getSalonDashboard(
    salonId,
    ownerId,
    new Date("2026-08-01T00:30:00.000Z")
  );
  assert.equal(august.bookingSummary.completedThisMonth, 2);
  assert.equal(august.bookingSummary.cancelledThisMonth, 1);
  assert.equal(august.bookingSummary.rejectedThisMonth, 1);
  assert.equal(august.revenueSummary.monthRevenue, 110);
  assert.deepEqual(Object.keys(august.revenueSummary).sort(), [
    "monthRevenue",
    "todayRevenue",
  ]);

  const september = await getSalonDashboard(
    salonId,
    ownerId,
    new Date("2026-09-01T00:30:00.000Z")
  );
  assert.equal(september.bookingSummary.completedThisMonth, 2);
  assert.equal(september.revenueSummary.monthRevenue, 590);
  assert.deepEqual(Object.keys(september.revenueSummary).sort(), [
    "monthRevenue",
    "todayRevenue",
  ]);
});

test("relationship confirmation controls dashboard private movement", async () => {
  let relationshipType = "staff";
  let relationshipStatus;

  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Owner Salon",
  });
  User.findById = () => ({
    select: async () => ({ _id: ownerId }),
  });
  User.find = () => ({
    select: async () => [
      {
        _id: staffBarberId,
        salons: [
          {
            salon: { toString: () => salonId },
            status: "approved",
            relationshipType,
            ...(relationshipStatus ? { relationshipStatus } : {}),
          },
        ],
        salon: salonId,
        salonStatus: "approved",
      },
    ],
  });
  SubscriptionPlan.findOne = async () => ({ pricePerSeat: 100 });
  Subscription.findOne = () => ({ lean: async () => null });
  Subscription.find = () => ({ lean: async () => [] });
  SubscriptionSeat.countDocuments = async () => 0;
  SubscriptionSeat.find = () => ({ lean: async () => [] });
  SalonJoinRequest.countDocuments = async () => 0;
  Booking.countDocuments = async () => 1;
  Booking.find = () =>
    createLeanQuery([
      { _id: "booking-1", barberId: staffBarberId, status: "completed", price: 100 },
    ]);
  Review.find = () => createLeanQuery([]);

  const initialResult = await getSalonDashboard(salonId, ownerId);
  assert.equal(initialResult.staffSummary.totalApprovedStaff, 1);
  assert.equal(initialResult.staffSummary.totalChairRenters, 0);
  assert.equal(initialResult.bookingSummary.todayBookings, 1);

  relationshipType = "staff";
  relationshipStatus = "pending";
  const pendingStaffResult = await getSalonDashboard(salonId, ownerId);
  assert.equal(pendingStaffResult.staffSummary.totalApprovedStaff, 0);
  assert.equal(pendingStaffResult.staffSummary.totalChairRenters, 0);
  assert.equal(pendingStaffResult.bookingSummary.todayBookings, 0);
  assert.equal(pendingStaffResult.revenueSummary.todayRevenue, 0);

  relationshipType = "staff";
  relationshipStatus = "rejected";
  const rejectedStaffResult = await getSalonDashboard(salonId, ownerId);
  assert.equal(rejectedStaffResult.staffSummary.totalApprovedStaff, 0);
  assert.equal(rejectedStaffResult.staffSummary.totalChairRenters, 0);
  assert.equal(rejectedStaffResult.bookingSummary.todayBookings, 0);
  assert.equal(rejectedStaffResult.revenueSummary.todayRevenue, 0);

  relationshipStatus = "accepted";
  const acceptedStaffResult = await getSalonDashboard(salonId, ownerId);
  assert.equal(acceptedStaffResult.staffSummary.totalApprovedStaff, 1);
  assert.equal(acceptedStaffResult.staffSummary.totalChairRenters, 0);
  assert.equal(acceptedStaffResult.bookingSummary.todayBookings, 1);

  relationshipType = "chair_renter";
  relationshipStatus = "accepted";
  const chairRenterResult = await getSalonDashboard(salonId, ownerId);
  assert.equal(chairRenterResult.staffSummary.totalApprovedStaff, 0);
  assert.equal(chairRenterResult.staffSummary.totalChairRenters, 1);
  assert.equal(chairRenterResult.bookingSummary.todayBookings, 0);
  assert.equal(chairRenterResult.revenueSummary.todayRevenue, 0);

  relationshipType = "staff";
  relationshipStatus = undefined;
  const revertedResult = await getSalonDashboard(salonId, ownerId);
  assert.equal(revertedResult.staffSummary.totalApprovedStaff, 1);
  assert.equal(revertedResult.staffSummary.totalChairRenters, 0);
  assert.equal(revertedResult.bookingSummary.todayBookings, 1);
});

test("getSalonDashboard allows salon admin access", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [adminId],
    name: "Owner Salon",
  });

  User.findById = () => ({
    select: async () => ({ _id: adminId }),
  });

  User.find = () => ({
    select: async () => [],
  });
  SubscriptionPlan.findOne = async () => ({ pricePerSeat: 100 });
  Subscription.findOne = () => ({ lean: async () => null });
  Subscription.find = () => ({ lean: async () => [] });
  SubscriptionSeat.countDocuments = async () => 0;
  SubscriptionSeat.find = () => ({ lean: async () => [] });
  SalonJoinRequest.countDocuments = async () => 0;
  Booking.countDocuments = async () => 0;
  Booking.find = () => createLeanQuery([]);
  Review.find = () => createLeanQuery([]);

  const result = await getSalonDashboard(
    salonId,
    adminId,
    new Date("2026-06-05T09:00:00.000Z")
  );

  assert.equal(result.salon.id, salonId);
  assert.equal(result.staffSummary.totalApprovedStaff, 0);
});

test("getSalonDashboard rejects non-owner non-admin users", async () => {
  Salon.findById = async () => ({
    _id: salonId,
    ownerId,
    admins: [],
    name: "Owner Salon",
  });

  User.findById = () => ({
    select: async () => ({ _id: outsiderId }),
  });

  await assert.rejects(
    () => getSalonDashboard(salonId, outsiderId),
    (error) => {
      assert.ok(error instanceof DashboardError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.message, "Only salon owner or admin can access the dashboard");
      return true;
    }
  );
});
