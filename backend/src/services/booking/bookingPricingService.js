import Voucher from "../../models/Voucher.js";
import { calculateServiceDiscountedPrice } from "../../controllers/services/serviceController.js";
import { calculateLoyaltyDiscountForBooking } from "../barberClientService.js";
import { getLogger } from "../../config/logger.js";

const sameId = (left, right) =>
  String(left || "") === String(right || "");

const SAFE_ID_PATTERN = /^[a-f\d]{24}$/i;
const VOUCHER_LOG_EVENT = "booking.voucher_secondary_write_failed";

const getSafeLogId = (value) => {
  const normalized = String(value || "");
  return SAFE_ID_PATTERN.test(normalized) ? normalized : undefined;
};

const logVoucherMutationFailure = ({ operation, voucherId, bookingId }) => {
  try {
    getLogger?.()?.warn?.(
      {
        err: { name: "Error" },
        event: VOUCHER_LOG_EVENT,
        operation,
        voucherId: getSafeLogId(voucherId),
        bookingId: getSafeLogId(bookingId),
      },
      VOUCHER_LOG_EVENT
    );
  } catch {}
};

const runVoucherSecondaryWrite = async ({
  operation,
  voucherId,
  bookingId,
  update,
}) => {
  try {
    await Voucher.findByIdAndUpdate(voucherId, update);
  } catch {
    logVoucherMutationFailure({ operation, voucherId, bookingId });
  }
};

/**
 * Calculate voucher discount amount (pure calculation).
 */
export const calculateVoucherDiscount = ({ voucher, servicePrice }) => {
  const voucherAmount = Number(voucher.amount);
  const discountType = voucher.discountType || "fixed";

  if (discountType === "percentage") {
    const pct = Math.min(voucherAmount, 100);
    return Math.round((servicePrice * pct) / 100);
  }

  return Math.min(voucherAmount, servicePrice);
};

/**
 * Validate a voucher for booking without claiming.
 * Returns { voucher, voucherDiscount, finalPrice } or null if no code.
 * Throws with statusCode if invalid.
 */
export const validateVoucherForBooking = async ({
  voucherCode: rawCode,
  barberId,
  salonId,
  serviceId,
  servicePrice,
  session,
}) => {
  const code = String(rawCode || "").toUpperCase().trim();
  if (!code) return null;

  const voucher = await Voucher.findOne(
    { code },
    null,
    session ? { session } : undefined
  );
  if (!voucher) {
    throw Object.assign(new Error("Invalid voucher code"), { statusCode: 400 });
  }
  if (!voucher.active) {
    throw Object.assign(new Error("This voucher is no longer active"), { statusCode: 400 });
  }
  if (voucher.expiresAt && new Date() > new Date(voucher.expiresAt)) {
    throw Object.assign(new Error("This voucher has expired"), { statusCode: 400 });
  }
  if (voucher.currentUses >= voucher.maxUses) {
    throw Object.assign(new Error("This voucher has been fully redeemed"), { statusCode: 400 });
  }

  if (voucher.ownerType === "barber") {
    if (!sameId(voucher.ownerId, barberId)) {
      throw Object.assign(new Error("This voucher does not apply to this barber"), { statusCode: 400 });
    }
  }
  if (voucher.ownerType === "salon") {
    if (!salonId || !sameId(voucher.ownerId, salonId)) {
      throw Object.assign(new Error("This voucher does not apply to this salon"), { statusCode: 400 });
    }
  }

  if (voucher.serviceId) {
    if (!sameId(voucher.serviceId, serviceId)) {
      throw Object.assign(new Error("This voucher does not apply to this service"), { statusCode: 400 });
    }
  }
  if (voucher.applicableServiceIds && voucher.applicableServiceIds.length > 0) {
    const matchesService = voucher.applicableServiceIds.some(
      (sid) => sameId(sid, serviceId)
    );
    if (!matchesService) {
      throw Object.assign(new Error("This promotion does not apply to this service"), { statusCode: 400 });
    }
  }

  if (voucher.applicableBarberIds && voucher.applicableBarberIds.length > 0) {
    const matchesBarber = voucher.applicableBarberIds.some(
      (bid) => sameId(bid, barberId)
    );
    if (!matchesBarber) {
      throw Object.assign(new Error("This promotion does not apply to this barber"), { statusCode: 400 });
    }
  }

  if (voucher.startDate) {
    const now = new Date();
    if (now < new Date(voucher.startDate)) {
      throw Object.assign(new Error("This promotion is not yet active"), { statusCode: 400 });
    }
  }

  const voucherDiscount = calculateVoucherDiscount({ voucher, servicePrice });
  const finalPrice = Math.max(0, servicePrice - voucherDiscount);

  return { voucher, voucherDiscount, finalPrice };
};

/**
 * Atomically claim a voucher use for booking creation.
 * Returns { voucher, voucherDiscount, finalPrice } or throws.
 */
export const claimVoucherForBooking = async ({
  voucherCode: rawCode,
  barberId,
  salonId,
  serviceId,
  servicePrice,
  bookingId,
  session,
}) => {
  const preview = await validateVoucherForBooking({
    voucherCode: rawCode,
    barberId,
    salonId,
    serviceId,
    servicePrice,
    session,
  });
  const voucher = preview.voucher;

  const claimFilter = {
    _id: voucher._id,
    active: true,
    currentUses: { $lt: voucher.maxUses },
  };
  if (voucher.expiresAt) {
    claimFilter.expiresAt = { $gt: new Date() };
  }

  const claimed = await Voucher.findOneAndUpdate(
    claimFilter,
    {
      $inc: { currentUses: 1 },
      ...(bookingId ? { $addToSet: { redemptionBookingIds: bookingId } } : {}),
    },
    { new: false, ...(session ? { session } : {}) }
  );

  if (!claimed) {
    throw Object.assign(new Error("This promotion is no longer available"), { statusCode: 400 });
  }

  const voucherDiscount = calculateVoucherDiscount({ voucher: claimed, servicePrice });
  const finalPrice = Math.max(0, servicePrice - voucherDiscount);

  return { voucher: claimed, voucherDiscount, finalPrice };
};

/**
 * Build the full booking pricing quote.
 * Used by both quote endpoint and create booking flow.
 *
 * @param {Object} params
 * @param {Object} params.barber - User document (for loyalty settings)
 * @param {string} params.barberId
 * @param {string} params.clientId
 * @param {Object} params.service - Service document
 * @param {string} params.serviceId
 * @param {string} params.salonId
 * @param {string} [params.voucherCode]
 * @param {boolean} [params.claimVoucher=false] - If true, atomically claim; otherwise validate only
 * @returns {Object} pricing object with originalPrice, serviceDiscountAmount, serviceDiscountedPrice,
 *                   voucherClaim, voucherDiscountAmount, loyaltyDiscount, finalPrice
 */
export const buildBookingPricing = async ({
  barber,
  barberId,
  clientId,
  service,
  serviceId,
  salonId,
  voucherCode,
  claimVoucher = false,
  bookingId,
  session,
}) => {
  const parsedServicePrice = Number(service.price || 0);
  const originalPrice = Number.isFinite(parsedServicePrice)
    ? Math.max(0, parsedServicePrice)
    : 0;
  const {
    discountAmount: serviceDiscountAmount,
    discountedPrice: serviceDiscountedPrice,
  } = calculateServiceDiscountedPrice(service);

  let voucherClaim = null;
  if (voucherCode) {
    const voucherPayload = {
      voucherCode,
      barberId,
      salonId,
      serviceId,
      servicePrice: serviceDiscountedPrice,
      bookingId,
      session,
    };
    voucherClaim = claimVoucher
      ? await claimVoucherForBooking(voucherPayload)
      : await validateVoucherForBooking(voucherPayload);
  }

  const loyaltyDiscount = await calculateLoyaltyDiscountForBooking({
    barber,
    barberId,
    clientId,
    serviceDiscountedPrice,
    hasVoucher: Boolean(voucherClaim),
  });
  const finalPrice = voucherClaim
    ? voucherClaim.finalPrice
    : loyaltyDiscount.finalPrice;

  return {
    originalPrice,
    serviceDiscountAmount,
    serviceDiscountedPrice,
    voucherClaim,
    voucherDiscountAmount: voucherClaim?.voucherDiscount || 0,
    loyaltyDiscount,
    finalPrice,
  };
};

/**
 * Rollback a voucher claim if booking creation fails.
 */
export const rollbackVoucherClaim = async (voucherId) => {
  if (!voucherId) return;
  await runVoucherSecondaryWrite({
    operation: "rollback_claim",
    voucherId,
    update: {
      $inc: { currentUses: -1 },
    },
  });
};

/**
 * Record booking ID in voucher's redemption list after successful creation.
 */
export const recordVoucherRedemption = async (voucherId, bookingId) => {
  if (!voucherId || !bookingId) return;
  await runVoucherSecondaryWrite({
    operation: "record_redemption",
    voucherId,
    bookingId,
    update: {
      $addToSet: { redemptionBookingIds: bookingId },
    },
  });
};

/**
 * Restore voucher use when a booking with voucherDiscount is cancelled/rejected.
 */
export const restoreVoucherOnCancel = async (booking, previousStatus) => {
  if (!booking.voucherId || !booking.voucherDiscount) return;
  const terminalStatuses = new Set(["cancelled", "rejected"]);
  if (terminalStatuses.has(previousStatus)) return;

  await runVoucherSecondaryWrite({
    operation: "restore_on_cancel",
    voucherId: booking.voucherId,
    bookingId: booking._id,
    update: {
      $inc: { currentUses: -1 },
      $pull: { redemptionBookingIds: booking._id },
    },
  });
};
