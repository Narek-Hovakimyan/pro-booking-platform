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

    if (query.status === "completed" && query.updatedAt) {
      return createLeanQuery([
        {
          _id: "completed-staff",
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
    new Date("2026-06-05T09:00:00.000Z")
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
    assert.deepEqual(query.barberId, { $in: [staffBarberId] });
  }

  const staffOnlyQueries = bookingFindQueries.filter((query) => query.barberId);
  for (const query of staffOnlyQueries) {
    assert.deepEqual(query.barberId, { $in: [staffBarberId] });
  }

  assert.deepEqual(reviewQueries, [{ barberId: { $in: [staffBarberId] } }]);
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
