import Booking from "../../models/Booking.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import {
  getArmeniaDateKey,
  isDateKey,
  timeToMinutes,
} from "../../utils/bookingDateTime.js";
import { isSalonAdmin, isSalonOwner } from "../../utils/salonPermissions.js";
import {
  getRelationshipType,
  isWorkingSpecialist,
} from "./salonRelationshipService.js";
import { getPaidAccessByBarberIdsForSalon } from "../subscriptionService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_VIEWS = new Set(["day", "week"]);

export class SalonCalendarError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "SalonCalendarError";
    this.statusCode = statusCode;
  }
}

const getUtcDateParts = (dateKey) => {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map(Number);

  return { year, month, day };
};

const formatUtcDateKey = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getDateKeysForView = (dateKey, view) => {
  if (!isDateKey(dateKey)) {
    throw new SalonCalendarError(400, "date must be a valid YYYY-MM-DD calendar date");
  }

  if (!CALENDAR_VIEWS.has(view)) {
    throw new SalonCalendarError(400, "view must be day or week");
  }

  if (view === "day") {
    return [dateKey];
  }

  const { year, month, day } = getUtcDateParts(dateKey);
  const selectedDate = new Date(Date.UTC(year, month - 1, day));
  const weekStart = new Date(selectedDate.getTime() - selectedDate.getUTCDay() * DAY_MS);

  return Array.from({ length: 7 }, (_, index) =>
    formatUtcDateKey(new Date(weekStart.getTime() + index * DAY_MS))
  );
};

const getApprovedSalonEntry = (barber, salonId) => {
  const approvedEntry = (barber?.salons || []).find(
    (entry) =>
      String(entry?.salon?._id || entry?.salon) === String(salonId) &&
      entry?.status === "approved"
  );

  if (approvedEntry) {
    return approvedEntry;
  }

  if (
    String(barber?.salon?._id || barber?.salon) === String(salonId) &&
    barber?.salonStatus === "approved"
  ) {
    return {
      salon: salonId,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "accepted",
    };
  }

  return null;
};

const getStaffMembers = async (salonId) => {
  const barbers = await User.find({
    role: "barber",
    $or: [
      { "salons.salon": salonId, "salons.status": "approved" },
      { salon: salonId, salonStatus: "approved" },
    ],
  }).select("_id name avatarUrl salons salon salonStatus");

  const paidAccessMap = await getPaidAccessByBarberIdsForSalon(
    barbers.map((barber) => barber._id),
    salonId
  );

  return barbers
    .map((barber) => {
      if (paidAccessMap.get(String(barber._id)) !== true) return null;

      const approvedSalonEntry = getApprovedSalonEntry(barber, salonId);
      if (!approvedSalonEntry) return null;

      const relationshipType = getRelationshipType(approvedSalonEntry);
      if (relationshipType !== "staff" || !isWorkingSpecialist(approvedSalonEntry)) {
        return null;
      }

      return {
        id: String(barber._id),
        name: barber.name || "Staff member",
        avatarUrl: barber.avatarUrl || "",
        relationshipType: "staff",
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
};

const minutesToTime = (minutes) => {
  const safeMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
  const mins = String(safeMinutes % 60).padStart(2, "0");

  return `${hours}:${mins}`;
};

const getEndTime = (booking) => {
  const startMinutes = timeToMinutes(booking?.time);
  const duration = Number(booking?.duration || 0);

  if (startMinutes === null || !Number.isFinite(duration)) {
    return "";
  }

  return minutesToTime(startMinutes + duration);
};

const buildSummary = (bookings) => {
  const summary = {
    totalBookings: bookings.length,
    pendingCount: 0,
    acceptedCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
  };

  for (const booking of bookings) {
    switch (booking.status) {
      case "pending":
        summary.pendingCount += 1;
        break;
      case "accepted":
      case "confirmed":
        summary.acceptedCount += 1;
        break;
      case "completed":
        summary.completedCount += 1;
        break;
      case "cancelled":
      case "late_cancelled":
        summary.cancelledCount += 1;
        break;
      case "no_show":
        summary.noShowCount += 1;
        break;
      default:
        break;
    }
  }

  return summary;
};

const serializeBooking = (booking, staffById) => {
  const barberId = String(booking?.barberId?._id || booking?.barberId || "");
  const clientId = String(booking?.clientId?._id || booking?.clientId || "");
  const duration = Number(booking?.duration || 0);

  return {
    id: String(booking._id),
    barberId,
    barberName: booking?.barberId?.name || staffById.get(barberId)?.name || "Staff member",
    clientId,
    clientName: booking?.clientName || booking?.clientId?.name || "Client",
    serviceName: booking?.serviceName || booking?.serviceId?.name || "Service",
    date: booking?.bookingDate || booking?.dayKey || "",
    startTime: booking?.time || "",
    endTime: booking?.endTime || getEndTime(booking),
    duration,
    status: booking?.status || "pending",
    price: Number(booking?.price || 0),
  };
};

export const getSalonCalendar = async (
  salonId,
  requestingUserId,
  { date, view = "day", barberId = "" } = {}
) => {
  const salon = await Salon.findById(salonId);
  if (!salon) {
    throw new SalonCalendarError(404, "Salon not found");
  }

  const requester = await User.findById(requestingUserId).select("_id");
  if (!requester) {
    throw new SalonCalendarError(401, "Authentication required");
  }

  const isOwner = isSalonOwner(salon, requestingUserId);
  const isAdmin = isSalonAdmin(salon, requestingUserId);

  if (!isOwner && !isAdmin) {
    throw new SalonCalendarError(403, "Only salon owner or admin can access the salon calendar");
  }

  const selectedDate = date || getArmeniaDateKey(new Date());
  const dateKeys = getDateKeysForView(selectedDate, view);
  const staff = await getStaffMembers(salonId);
  const staffIds = staff.map((member) => member.id);
  const staffById = new Map(staff.map((member) => [member.id, member]));

  if (barberId && !staffById.has(String(barberId))) {
    throw new SalonCalendarError(
      400,
      "Selected barber must be an approved staff member in this salon"
    );
  }

  const filteredStaffIds = barberId ? [String(barberId)] : staffIds;

  if (filteredStaffIds.length === 0) {
    return {
      salon: {
        id: salon._id,
        name: salon.name,
        city: salon.city,
        address: salon.address,
        phone: salon.phone,
        imageUrl: salon.imageUrl || "",
      },
      view,
      date: selectedDate,
      staff,
      bookings: [],
      summary: buildSummary([]),
    };
  }

  const rawBookings = await Booking.find({
    salonId,
    barberId: { $in: filteredStaffIds },
    $or: [{ bookingDate: { $in: dateKeys } }, { dayKey: { $in: dateKeys } }],
  })
    .sort({ bookingDate: 1, dayKey: 1, time: 1, createdAt: 1 })
    .populate("barberId", "name")
    .populate("clientId", "name")
    .populate("serviceId", "name")
    .lean();

  const bookings = rawBookings.map((booking) => serializeBooking(booking, staffById));

  return {
    salon: {
      id: salon._id,
      name: salon.name,
      city: salon.city,
      address: salon.address,
      phone: salon.phone,
      imageUrl: salon.imageUrl || "",
    },
    view,
    date: selectedDate,
    staff,
    bookings,
    summary: buildSummary(bookings),
  };
};
