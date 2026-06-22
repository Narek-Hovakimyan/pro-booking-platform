import Booking from "../models/Booking.js";
import ClientRelationship from "../models/ClientRelationship.js";
import User from "../models/User.js";
import {
  getArmeniaDateKey,
  getArmeniaMinutesOfDay,
  timeToMinutes,
} from "../utils/bookingDateTime.js";

export class BarberClientError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "BarberClientError";
    this.statusCode = statusCode;
  }
}

const upcomingStatuses = new Set(["pending", "accepted", "confirmed"]);
const hiddenLastBookingStatuses = new Set(["rejected", "expired"]);

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const runLeanQuery = async (query, fields) => {
  if (!query) return [];
  const selectable = typeof query.select === "function" ? query.select : null;
  const selected = selectable
    ? selectable.call(query, fields)
    : query;

  if (selected && typeof selected.lean === "function") {
    return selected.lean();
  }

  return selected;
};

const getBookingDateKey = (booking) =>
  booking?.bookingDate || booking?.dayKey || "";

const getBookingMinutes = (booking) => {
  const minutes = timeToMinutes(booking?.time || "");
  return minutes === null ? -1 : minutes;
};

const compareBookingsAsc = (left, right) => {
  const dateCompare = getBookingDateKey(left).localeCompare(getBookingDateKey(right));
  if (dateCompare !== 0) return dateCompare;
  return getBookingMinutes(left) - getBookingMinutes(right);
};

const compareBookingsDesc = (left, right) => -compareBookingsAsc(left, right);

const isFutureBooking = (booking, todayKey, nowMinutes) => {
  const dateKey = getBookingDateKey(booking);
  if (!dateKey) return false;
  if (dateKey > todayKey) return true;
  if (dateKey < todayKey) return false;

  const bookingMinutes = timeToMinutes(booking?.time || "");
  return bookingMinutes !== null && bookingMinutes >= nowMinutes;
};

const formatBookingSummary = (booking) => {
  if (!booking) return null;

  return {
    bookingId: getIdString(booking._id || booking.id),
    date: getBookingDateKey(booking),
    time: booking.time || "",
    status: booking.status || "",
    serviceName: booking.serviceName || "Service",
  };
};

const getLatestSnapshotName = (bookings) => {
  const booking = [...bookings]
    .sort(compareBookingsDesc)
    .find((item) => String(item?.clientName || "").trim());

  return String(booking?.clientName || "").trim();
};

const getLatestSnapshotPhone = (bookings) => {
  const booking = [...bookings]
    .sort(compareBookingsDesc)
    .find((item) =>
      String(item?.clientPhone || item?.phone || "").trim()
    );

  return String(booking?.clientPhone || booking?.phone || "").trim();
};

const getMostBookedService = (bookings) => {
  const countServices = (items) => {
    const counts = new Map();

    for (const booking of items) {
      const serviceName = String(booking?.serviceName || "").trim();
      if (!serviceName) continue;
      counts.set(serviceName, (counts.get(serviceName) || 0) + 1);
    }

    return counts;
  };

  let counts = countServices(
    bookings.filter((booking) => booking.status === "completed")
  );

  if (counts.size === 0) {
    counts = countServices(
      bookings.filter((booking) => booking.status !== "rejected")
    );
  }

  const [serviceName, count] = [...counts.entries()].sort(
    ([leftName, leftCount], [rightName, rightCount]) =>
      rightCount - leftCount || leftName.localeCompare(rightName)
  )[0] || [];

  return serviceName ? { serviceName, count } : null;
};

const getLastBooking = (bookings, todayKey, nowMinutes) => {
  const nonFutureBookings = bookings.filter(
    (booking) => !isFutureBooking(booking, todayKey, nowMinutes)
  );
  const preferred = nonFutureBookings.filter(
    (booking) => !hiddenLastBookingStatuses.has(booking.status)
  );

  return [...(preferred.length > 0 ? preferred : nonFutureBookings)]
    .sort(compareBookingsDesc)[0] || null;
};

const getNextBooking = (bookings, todayKey, nowMinutes) =>
  bookings
    .filter(
      (booking) =>
        upcomingStatuses.has(booking.status) &&
        isFutureBooking(booking, todayKey, nowMinutes)
    )
    .sort(compareBookingsAsc)[0] || null;

const sortClientSummaries = (left, right) => {
  const leftHasUpcoming = Boolean(left.nextBooking);
  const rightHasUpcoming = Boolean(right.nextBooking);

  if (leftHasUpcoming !== rightHasUpcoming) {
    return leftHasUpcoming ? -1 : 1;
  }

  const leftLastDate = left.lastBooking?.date || "";
  const rightLastDate = right.lastBooking?.date || "";
  const dateCompare = rightLastDate.localeCompare(leftLastDate);

  if (dateCompare !== 0) return dateCompare;

  return left.clientName.localeCompare(right.clientName);
};

const serializeLoyalty = (relationship) => ({
  isVip: Boolean(relationship?.isVip),
  internalNote: String(relationship?.internalNote || ""),
  updatedAt: relationship?.updatedAt || null,
});

const defaultLoyaltyDiscountSettings = {
  enabled: false,
  thresholdCompletedBookings: 5,
  discountPercent: 10,
  maxDiscountPercent: 30,
};

export const normalizeLoyaltyDiscountSettings = (settings = {}) => {
  const enabled = Boolean(settings.enabled);
  const thresholdCompletedBookings = Number(
    settings.thresholdCompletedBookings ??
      defaultLoyaltyDiscountSettings.thresholdCompletedBookings
  );
  const discountPercent = Number(
    settings.discountPercent ?? defaultLoyaltyDiscountSettings.discountPercent
  );
  const maxDiscountPercent = Number(
    settings.maxDiscountPercent ??
      defaultLoyaltyDiscountSettings.maxDiscountPercent
  );

  if (
    !Number.isInteger(thresholdCompletedBookings) ||
    thresholdCompletedBookings < 1
  ) {
    throw new BarberClientError(400, "thresholdCompletedBookings must be at least 1");
  }

  if (!Number.isFinite(discountPercent) || discountPercent < 0) {
    throw new BarberClientError(400, "discountPercent must be at least 0");
  }

  if (!Number.isFinite(maxDiscountPercent) || maxDiscountPercent < 0) {
    throw new BarberClientError(400, "maxDiscountPercent must be at least 0");
  }

  if (maxDiscountPercent > 100) {
    throw new BarberClientError(400, "maxDiscountPercent must be 100 or less");
  }

  if (discountPercent > maxDiscountPercent) {
    throw new BarberClientError(400, "discountPercent cannot exceed maxDiscountPercent");
  }

  return {
    enabled,
    thresholdCompletedBookings,
    discountPercent,
    maxDiscountPercent,
  };
};

export const serializeLoyaltyDiscountSettings = (settings) =>
  normalizeLoyaltyDiscountSettings(settings || defaultLoyaltyDiscountSettings);

export const getBarberClients = async ({
  requester,
  now = new Date(),
} = {}) => {
  if (!requester) {
    throw new BarberClientError(401, "Not authenticated");
  }

  if (requester.role !== "barber") {
    throw new BarberClientError(403, "Only barbers can access clients");
  }

  const barberId = getIdString(requester._id || requester.id);
  const bookings = await runLeanQuery(
    Booking.find({
      barberId,
      clientId: { $ne: null },
    }),
    "_id clientId clientName clientPhone phone serviceName price bookingDate dayKey time status barberId"
  );
  const bookingsByClientId = new Map();

  for (const booking of bookings || []) {
    if (getIdString(booking?.barberId) !== barberId) continue;

    const clientId = getIdString(booking?.clientId);
    if (!clientId) continue;

    bookingsByClientId.set(clientId, [
      ...(bookingsByClientId.get(clientId) || []),
      booking,
    ]);
  }

  const clientIds = [...bookingsByClientId.keys()];
  const users = clientIds.length > 0
    ? await runLeanQuery(User.find({ _id: { $in: clientIds } }), "name")
    : [];
  const usersById = new Map(
    (users || []).map((user) => [getIdString(user?._id || user?.id), user])
  );
  const relationships = clientIds.length > 0
    ? await runLeanQuery(
        ClientRelationship.find({ barberId, clientId: { $in: clientIds } }),
        "clientId isVip internalNote updatedAt"
      )
    : [];
  const relationshipsByClientId = new Map(
    (relationships || []).map((relationship) => [
      getIdString(relationship?.clientId),
      relationship,
    ])
  );
  const todayKey = getArmeniaDateKey(now);
  const nowMinutes = getArmeniaMinutesOfDay(now);

  return clientIds
    .map((clientId) => {
      const clientBookings = bookingsByClientId.get(clientId) || [];
      const completedBookings = clientBookings.filter(
        (booking) => booking.status === "completed"
      );
      const user = usersById.get(clientId);
      const lastBooking = getLastBooking(clientBookings, todayKey, nowMinutes);
      const nextBooking = getNextBooking(clientBookings, todayKey, nowMinutes);
      const totalSpent = completedBookings.reduce((sum, booking) => {
        const price = Number(booking?.price || 0);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      const clientName =
        String(user?.name || "").trim() ||
        getLatestSnapshotName(clientBookings) ||
        "Client";

      return {
        clientId,
        clientName,
        phone: getLatestSnapshotPhone(clientBookings),
        lastBooking: formatBookingSummary(lastBooking),
        nextBooking: formatBookingSummary(nextBooking),
        completedBookingsCount: completedBookings.length,
        totalSpent,
        mostBookedService: getMostBookedService(clientBookings),
        bookingCount: clientBookings.length,
        loyalty: serializeLoyalty(relationshipsByClientId.get(clientId)),
        messagePath: `/messages/${clientId}`,
      };
    })
    .sort(sortClientSummaries);
};

export const updateBarberClientLoyalty = async ({
  requester,
  clientId,
  updates = {},
} = {}) => {
  if (!requester) {
    throw new BarberClientError(401, "Not authenticated");
  }

  if (requester.role !== "barber") {
    throw new BarberClientError(403, "Only barbers can update clients");
  }

  const barberId = getIdString(requester._id || requester.id);
  const targetClientId = getIdString(clientId);

  if (!targetClientId) {
    throw new BarberClientError(400, "clientId is required");
  }

  const payload = {};

  if (updates.isVip !== undefined) {
    if (typeof updates.isVip !== "boolean") {
      throw new BarberClientError(400, "isVip must be a boolean");
    }
    payload.isVip = updates.isVip;
  }

  if (updates.internalNote !== undefined) {
    if (typeof updates.internalNote !== "string") {
      throw new BarberClientError(400, "internalNote must be a string");
    }

    const internalNote = updates.internalNote.trim();
    if (internalNote.length > 1000) {
      throw new BarberClientError(400, "internalNote must be 1000 characters or fewer");
    }
    payload.internalNote = internalNote;
  }

  if (Object.keys(payload).length === 0) {
    throw new BarberClientError(400, "No loyalty updates provided");
  }

  const existingBooking = await Booking.findOne({
    barberId,
    clientId: targetClientId,
  }).select("_id");

  if (!existingBooking) {
    throw new BarberClientError(404, "Client not found for this barber");
  }

  const relationship = await ClientRelationship.findOneAndUpdate(
    { barberId, clientId: targetClientId },
    {
      $set: {
        ...payload,
        updatedBy: barberId,
      },
      $setOnInsert: {
        barberId,
        clientId: targetClientId,
      },
    },
    {
      new: true,
      runValidators: true,
      upsert: true,
    }
  ).select("isVip internalNote updatedAt");

  return serializeLoyalty(relationship);
};

export const getBarberLoyaltyDiscountSettings = async ({ requester } = {}) => {
  if (!requester) {
    throw new BarberClientError(401, "Not authenticated");
  }

  if (requester.role !== "barber") {
    throw new BarberClientError(403, "Only barbers can manage loyalty discounts");
  }

  const barber = await User.findById(requester._id || requester.id).select(
    "role loyaltyDiscountSettings"
  );

  if (!barber || barber.role !== "barber") {
    throw new BarberClientError(404, "Barber not found");
  }

  return serializeLoyaltyDiscountSettings(barber.loyaltyDiscountSettings);
};

export const updateBarberLoyaltyDiscountSettings = async ({
  requester,
  updates = {},
} = {}) => {
  if (!requester) {
    throw new BarberClientError(401, "Not authenticated");
  }

  if (requester.role !== "barber") {
    throw new BarberClientError(403, "Only barbers can manage loyalty discounts");
  }

  const current = await User.findById(requester._id || requester.id).select(
    "role loyaltyDiscountSettings"
  );

  if (!current || current.role !== "barber") {
    throw new BarberClientError(404, "Barber not found");
  }

  const normalized = normalizeLoyaltyDiscountSettings({
    ...serializeLoyaltyDiscountSettings(current.loyaltyDiscountSettings),
    ...updates,
  });

  const updated = await User.findByIdAndUpdate(
    requester._id || requester.id,
    { $set: { loyaltyDiscountSettings: normalized } },
    { new: true, runValidators: true }
  ).select("loyaltyDiscountSettings");

  return serializeLoyaltyDiscountSettings(updated?.loyaltyDiscountSettings || normalized);
};

export const calculateLoyaltyDiscountForBooking = async ({
  barber,
  barberId,
  clientId,
  serviceDiscountedPrice,
  hasVoucher = false,
} = {}) => {
  const settings = serializeLoyaltyDiscountSettings(
    barber?.loyaltyDiscountSettings
  );
  const basePrice = Number(serviceDiscountedPrice || 0);

  const emptyDiscount = {
    applied: false,
    percent: 0,
    amount: 0,
    eligibleCompletedBookings: 0,
    ruleSnapshot: null,
    finalPrice: Math.max(0, Number.isFinite(basePrice) ? basePrice : 0),
  };

  if (
    !settings.enabled ||
    hasVoucher ||
    !clientId ||
    !barberId ||
    !Number.isFinite(basePrice) ||
    basePrice <= 0
  ) {
    return emptyDiscount;
  }

  const completedBookings = await Booking.countDocuments({
    barberId,
    clientId,
    status: "completed",
  });

  if (completedBookings < settings.thresholdCompletedBookings) {
    return {
      ...emptyDiscount,
      eligibleCompletedBookings: completedBookings,
    };
  }

  const percent = Math.min(
    settings.discountPercent,
    settings.maxDiscountPercent
  );
  const amount = Math.min(basePrice, Math.round((basePrice * percent) / 100));

  return {
    applied: amount > 0,
    percent,
    amount,
    eligibleCompletedBookings: completedBookings,
    ruleSnapshot: {
      thresholdCompletedBookings: settings.thresholdCompletedBookings,
      discountPercent: settings.discountPercent,
      maxDiscountPercent: settings.maxDiscountPercent,
      scope: "barber",
    },
    finalPrice: Math.max(0, basePrice - amount),
  };
};
