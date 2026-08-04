import Booking from "../../models/Booking.js";
import User from "../../models/User.js";
import { getRelationshipType, isWorkingSpecialist } from "./salonRelationshipService.js";
import {
  appointmentDateAggregationStages,
  reportAppointmentDateField,
} from "./salonReportDateRange.js";
import {
  getStaffEarningsBreakdown,
  revenueAmountExpression,
} from "./salonReportEarnings.js";

/**
 * Get approved salon member IDs grouped by relationship type.
 * Reuses the same privacy model as salon dashboard.
 */
export const getSalonMembers = async (salonId) => {
  const users = await User.find({
    role: "barber",
    $or: [
      { "salons.salon": salonId, "salons.status": "approved" },
      { salon: salonId, salonStatus: "approved" },
    ],
  }).select("_id name avatarUrl salons salon salonStatus");

  const staffIds = [];
  const chairRenterIds = [];
  const membersById = {};

  for (const user of users) {
    let salonEntry = (user.salons || []).find(
      (s) => s.salon?.toString() === salonId.toString() && s.status === "approved"
    );

    if (
      !salonEntry &&
      user.salonStatus === "approved" &&
      String(user.salon || "") === String(salonId)
    ) {
      salonEntry = {
        salon: salonId,
        status: "approved",
        relationshipType: "staff",
        relationshipStatus: "accepted",
      };
    }

    const relationshipType = getRelationshipType(salonEntry);

    if (relationshipType === "chair_renter") {
      chairRenterIds.push(user._id);
      membersById[String(user._id)] = {
        _id: user._id,
        name: user.name,
        avatarUrl: user.avatarUrl || "",
        relationshipType: "chair_renter",
      };
    } else if (isWorkingSpecialist(salonEntry)) {
      staffIds.push(user._id);
      membersById[String(user._id)] = {
        _id: user._id,
        name: user.name,
        avatarUrl: user.avatarUrl || "",
        relationshipType: "staff",
        relationshipStatus: "accepted",
        staffPayment: salonEntry.staffPayment || { type: "none" },
      };
    }
  }

  return { staffIds, chairRenterIds, membersById };
};

/**
 * Count bookings by status in a given date range for given barber IDs.
 */
export const getStatusBreakdown = async (salonId, barberIds, from, to) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        salonId,
        barberId: { $in: barberIds },
      },
    },
    ...appointmentDateAggregationStages(from, to),
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ];

  const results = await Booking.aggregate(pipeline);
  return results.map((r) => ({ status: r._id, count: r.count }));
};

/**
 * Get booking counts by day for given barber IDs in date range.
 */
export const getByDayBreakdown = async (salonId, barberIds, from, to) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        salonId,
        barberId: { $in: barberIds },
      },
    },
    ...appointmentDateAggregationStages(from, to),
    {
      $group: {
        _id: `$${reportAppointmentDateField}`,
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        cancelled: {
          $sum: {
            $cond: [
              { $in: ["$status", ["cancelled", "late_cancelled"]] },
              1,
              0,
            ],
          },
        },
        noShow: {
          $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] },
        },
        pending: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        revenue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "completed"] },
              revenueAmountExpression,
              0,
            ],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ];

  return await Booking.aggregate(pipeline);
};

/**
 * Get per-staff breakdown for given barber IDs in date range.
 */
export const getByStaffBreakdown = async (salonId, barberIds, membersById, from, to) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        salonId,
        barberId: { $in: barberIds },
      },
    },
    ...appointmentDateAggregationStages(from, to),
    {
      $group: {
        _id: "$barberId",
        totalBookings: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        cancelled: {
          $sum: {
            $cond: [
              { $in: ["$status", ["cancelled", "late_cancelled"]] },
              1,
              0,
            ],
          },
        },
        noShow: {
          $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] },
        },
        revenue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "completed"] },
              revenueAmountExpression,
              0,
            ],
          },
        },
        completedBookingDates: {
          $addToSet: {
            $cond: [
              { $eq: ["$status", "completed"] },
              `$${reportAppointmentDateField}`,
              null,
            ],
          },
        },
        uniqueClients: { $addToSet: "$clientId" },
      },
    },
    { $sort: { completed: -1 } },
  ];

  const results = await Booking.aggregate(pipeline);

  return results.map((r) => {
    const member = membersById[String(r._id)];
    const grossRevenue = Number(r.revenue || 0);
    const earningsBreakdown = getStaffEarningsBreakdown(
      grossRevenue,
      member?.staffPayment,
      {
        from,
        to,
        completedBookingDates: (r.completedBookingDates || []).filter(Boolean),
      }
    );

    return {
      barberId: r._id,
      barberName: member?.name || "Unknown",
      avatarUrl: member?.avatarUrl || "",
      totalBookings: r.totalBookings,
      completed: r.completed,
      cancelled: r.cancelled,
      noShow: r.noShow,
      revenue: r.revenue,
      uniqueClients: r.uniqueClients.length,
      ...earningsBreakdown,
    };
  });
};

/**
 * Get top services for given barber IDs in date range.
 */
export const getTopServices = async (salonId, barberIds, from, to) => {
  if (barberIds.length === 0) return [];

  const pipeline = [
    {
      $match: {
        salonId,
        barberId: { $in: barberIds },
        serviceName: { $exists: true, $ne: "" },
      },
    },
    ...appointmentDateAggregationStages(from, to),
    {
      $group: {
        _id: "$serviceName",
        count: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "completed"] },
              revenueAmountExpression,
              0,
            ],
          },
        },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ];

  return await Booking.aggregate(pipeline);
};
