import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { salonHasActiveSubscription } from "../subscriptionService.js";
import { isSalonAdmin, isSalonOwner } from "../../utils/salonPermissions.js";
import {
  appointmentDateQuery,
  parseDateRange,
} from "./salonReportDateRange.js";
import {
  getByDayBreakdown,
  getByStaffBreakdown,
  getSalonMembers,
  getStatusBreakdown,
  getTopServices,
} from "./salonReportAggregations.js";
import { buildSalonReportCsv, safeFilenamePart } from "./salonReportCsv.js";
import { getBookingRevenueAmount } from "./salonReportEarnings.js";

export { buildSalonReportCsv };

export class ReportError extends Error {
  constructor(statusCode, message, code = "") {
    super(message);
    this.name = "ReportError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const getSalonReportCsvExport = async (
  salonId,
  requestingUserId,
  { format, from, to, barberId = "" } = {}
) => {
  if (format !== "csv") {
    throw new ReportError(
      400,
      "Unsupported report export format. Use format=csv.",
      "UNSUPPORTED_REPORT_EXPORT_FORMAT"
    );
  }

  const report = await getSalonReport(salonId, requestingUserId, {
    from,
    to,
    barberId,
  });
  const filenameSalon = safeFilenamePart(report.salon?.name || report.salon?.id);

  return {
    content: buildSalonReportCsv(report),
    contentType: "text/csv; charset=utf-8",
    filename: `salon-reports-${filenameSalon}-${report.range.from}-to-${report.range.to}.csv`,
  };
};

/**
 * Main report fetch function.
 */
export const getSalonReport = async (
  salonId,
  requestingUserId,
  { from, to, barberId = "" } = {}
) => {
  const salon = await Salon.findById(salonId);
  if (!salon) {
    throw new ReportError(404, "Salon not found");
  }

  // Authorization: only owner/admin
  const requester = await User.findById(requestingUserId).select("_id");
  if (!requester) {
    throw new ReportError(401, "Authentication required");
  }

  const isOwner = isSalonOwner(salon, requestingUserId);
  const isAdmin = isSalonAdmin(salon, requestingUserId);

  if (!isOwner && !isAdmin) {
    throw new ReportError(403, "Only salon owner or admin can access reports");
  }

  const hasSalonSubscription = await salonHasActiveSubscription(salon._id);
  if (!hasSalonSubscription) {
    throw new ReportError(
      403,
      "An active salon subscription is required to access reports",
      "SALON_SUBSCRIPTION_REQUIRED"
    );
  }

  parseDateRange(from, to, ReportError);

  // Get accepted staff members only
  const { staffIds, membersById } = await getSalonMembers(salonId);

  // If barberId filter is provided, validate it's an accepted staff member
  let effectiveStaffIds = staffIds;
  if (barberId) {
    if (!staffIds.some((id) => String(id) === String(barberId))) {
      throw new ReportError(
        400,
        "Selected barber must be an approved staff member with accepted status in this salon"
      );
    }
    effectiveStaffIds = [barberId];
  }

  // Run all aggregations in parallel
  const [statusBreakdown, byDay, byStaff, topServices, allBookings] =
    await Promise.all([
      getStatusBreakdown(salon._id, effectiveStaffIds, from, to),
      getByDayBreakdown(salon._id, effectiveStaffIds, from, to),
      getByStaffBreakdown(salon._id, effectiveStaffIds, membersById, from, to),
      getTopServices(salon._id, effectiveStaffIds, from, to),
      // Fetch all bookings in range for summary
      Booking.find({
          salonId: salon._id,
          barberId: { $in: effectiveStaffIds },
          ...appointmentDateQuery(from, to),
        })
        .select(
          "status price finalPrice promotionId voucherId promotionCode voucherCode discountAmount voucherDiscount clientId barberId"
        )
        .lean(),
    ]);

  // Build summary from all bookings
  let completedBookings = 0;
  let pendingBookings = 0;
  let acceptedBookings = 0;
  let cancelledBookings = 0;
  let noShowBookings = 0;
  let lateCancelledBookings = 0;
  let totalRevenue = 0;
  const uniqueClientSet = new Set();

  for (const booking of allBookings) {
    switch (booking.status) {
      case "completed":
        completedBookings++;
        totalRevenue += getBookingRevenueAmount(booking);
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "pending":
        pendingBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "accepted":
      case "confirmed":
        acceptedBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "cancelled":
        cancelledBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "late_cancelled":
        lateCancelledBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      case "no_show":
        noShowBookings++;
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
      default:
        if (booking.clientId) uniqueClientSet.add(String(booking.clientId));
        break;
    }
  }

  const totalBookings = allBookings.length;
  const averageBookingValue =
    completedBookings > 0 ? totalRevenue / completedBookings : 0;
  const staffEarningsTotal = byStaff.reduce(
    (sum, staff) => sum + Number(staff.staffEarnings || 0),
    0
  );
  const salonEarningsTotal = byStaff.reduce(
    (sum, staff) => sum + Number(staff.salonEarnings || 0),
    0
  );
  const fixedPayNotProratedCount = byStaff.filter(
    (staff) => staff.earningsCalculationStatus === "fixed_not_prorated"
  ).length;
  const fixedPayProratedCount = byStaff.filter(
    (staff) =>
      staff.earningsCalculationStatus === "calculated_prorated" &&
      Number(staff.fixedProrationUnits || 0) > 0
  ).length;

  return {
    salon: {
      id: salon._id,
      name: salon.name,
      city: salon.city,
      address: salon.address,
      phone: salon.phone,
      imageUrl: salon.imageUrl,
    },
    range: {
      from,
      to,
    },
    summary: {
      totalBookings,
      completedBookings,
      pendingBookings,
      acceptedBookings,
      cancelledBookings: cancelledBookings + lateCancelledBookings,
      noShowBookings,
      lateCancelledBookings,
      totalRevenue,
      grossRevenue: totalRevenue,
      staffEarningsTotal,
      salonEarningsTotal,
      fixedPayNotProratedCount,
      fixedPayProratedCount,
      averageBookingValue,
      uniqueClients: uniqueClientSet.size,
    },
    byStatus: statusBreakdown,
    byDay,
    byStaff,
    topServices,
  };
};
