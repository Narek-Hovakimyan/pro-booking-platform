import mongoose from "mongoose";
import Salon from "../models/Salon.js";
import Voucher from "../models/Voucher.js";
import { canManageSalonRequest } from "../utils/salonPermissions.js";
import {
  getMemberRelationshipType,
} from "../services/salon/salonRelationshipService.js";

const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));

const sameId = (left, right) =>
  String(left || "") === String(right || "");

/* ── Helpers ─────────────────────────────────────────────────── */

/**
 * Check that the user can manage promotions for this salon.
 * Returns { error, code } or null on success.
 */
const assertManageSalon = async (userId, salonId) => {
  if (!isValidObjectId(salonId)) {
    return { error: "Invalid salon ID", code: 400 };
  }
  const salon = await Salon.findById(salonId).select("ownerId admins").lean();
  if (!salon) {
    return { error: "Salon not found", code: 404 };
  }
  if (!canManageSalonRequest(salon, userId)) {
    return { error: "Only salon owner or admin can manage promotions", code: 403 };
  }
  return null;
};

/* ── Handlers ────────────────────────────────────────────────── */

/**
 * GET /api/salons/:salonId/promotions
 * Returns all promotions (vouchers with ownerType="salon") for this salon.
 */
export const getSalonPromotions = async (req, res) => {
  try {
    const { salonId } = req.params;
    const accessErr = await assertManageSalon(req.user._id, salonId);
    if (accessErr) {
      return res.status(accessErr.code).json({ message: accessErr.error });
    }

    const promotions = await Voucher.find({ ownerType: "salon", ownerId: salonId })
      .sort({ createdAt: -1 })
      .populate("applicableServiceIds", "name price")
      .populate("applicableBarberIds", "name")
      .lean();

    return res.json(promotions);
  } catch (error) {
    console.error("Could not fetch promotions", error);
    return res.status(500).json({ message: "Could not fetch promotions" });
  }
};

/**
 * POST /api/salons/:salonId/promotions
 * Create a new promotion (salon-scoped voucher) for this salon.
 */
export const createSalonPromotion = async (req, res) => {
  try {
    const { salonId } = req.params;
    const accessErr = await assertManageSalon(req.user._id, salonId);
    if (accessErr) {
      return res.status(accessErr.code).json({ message: accessErr.error });
    }

    const {
      code,
      title,
      description,
      discountType,
      discountValue,
      type,
      serviceId,
      applicableServiceIds,
      applicableBarberIds,
      startDate,
      endDate,
      maxUses,
      active,
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "title is required" });
    }
    if (!discountType || !["fixed", "percentage"].includes(discountType)) {
      return res.status(400).json({ message: "discountType must be 'fixed' or 'percentage'" });
    }
    if (discountValue === undefined || discountValue === null || Number(discountValue) <= 0) {
      return res.status(400).json({ message: "discountValue must be greater than 0" });
    }
    if (discountType === "percentage" && (Number(discountValue) > 100)) {
      return res.status(400).json({ message: "Percentage discount cannot exceed 100" });
    }

    // Generate or validate code
    let promoCode;
    const codeAlphanumeric = /^[A-Z0-9]+$/;
    if (code) {
      const normalized = String(code).toUpperCase().trim();
      if (normalized.length < 3 || normalized.length > 20) {
        return res.status(400).json({ message: "Code must be 3-20 characters" });
      }
      if (!codeAlphanumeric.test(normalized)) {
        return res.status(400).json({ message: "Code must be alphanumeric" });
      }
      const existing = await Voucher.findOne({
        ownerType: "salon",
        ownerId: salonId,
        code: normalized,
      }).select("_id").lean();
      if (existing) {
        return res.status(400).json({ message: "A promotion with this code already exists" });
      }
      promoCode = normalized;
    } else {
      // Auto-generate
      const crypto = await import("crypto");
      const generateCode = () =>
        Array.from(crypto.randomBytes(8), (byte) =>
          "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[byte % 36]
        ).join("");
      let attempts = 0;
      while (attempts < 10) {
        const candidate = generateCode();
        const existing = await Voucher.findOne({
          ownerType: "salon",
          ownerId: salonId,
          code: candidate,
        }).select("_id").lean();
        if (!existing) {
          promoCode = candidate;
          break;
        }
        attempts++;
      }
      if (!promoCode) {
        return res.status(500).json({ message: "Could not generate unique code" });
      }
    }

    // Validate applicableBarberIds are accepted staff members of this salon
    const validBarberIds = [];
    if (applicableBarberIds && Array.isArray(applicableBarberIds)) {
      for (const bid of applicableBarberIds) {
        if (!isValidObjectId(bid)) continue;
        const relType = await getMemberRelationshipType(bid, salonId);
        // Only include accepted staff (not chair_renter)
        if (relType && relType.relationshipType === "staff" && relType.relationshipStatus === "accepted") {
          validBarberIds.push(bid);
        }
      }
    }

    const promotion = await Voucher.create({
      ownerType: "salon",
      ownerId: salonId,
      code: promoCode,
      title: title.trim(),
      description: description?.trim() || "",
      discountType,
      type: "amount", // internal type kept as "amount" for compat
      amount: Number(discountValue),
      serviceId: serviceId || null,
      applicableServiceIds: applicableServiceIds && Array.isArray(applicableServiceIds) ? applicableServiceIds : [],
      applicableBarberIds: validBarberIds,
      startDate: startDate ? new Date(startDate) : null,
      expiresAt: endDate ? new Date(endDate) : null,
      maxUses: maxUses !== undefined && maxUses !== null ? Number(maxUses) : Number.MAX_SAFE_INTEGER,
      active: active !== undefined ? Boolean(active) : true,
      visibility: "public",
    });

    return res.status(201).json(promotion);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "A promotion with this code already exists" });
    }
    console.error("Could not create promotion", error);
    return res.status(500).json({ message: "Could not create promotion" });
  }
};

/**
 * PATCH /api/salons/:salonId/promotions/:promotionId
 * Update promotion fields.
 */
export const updateSalonPromotion = async (req, res) => {
  try {
    const { salonId, promotionId } = req.params;
    const accessErr = await assertManageSalon(req.user._id, salonId);
    if (accessErr) {
      return res.status(accessErr.code).json({ message: accessErr.error });
    }

    if (!isValidObjectId(promotionId)) {
      return res.status(400).json({ message: "Invalid promotion ID" });
    }

    const promotion = await Voucher.findOne({ _id: promotionId, ownerType: "salon", ownerId: salonId });
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    // Protected fields
    if (req.body.ownerType !== undefined || req.body.ownerId !== undefined || req.body.code !== undefined) {
      return res.status(400).json({ message: "Cannot change ownerType, ownerId, or code" });
    }

    const { title, description, discountType, discountValue, applicableServiceIds, applicableBarberIds, startDate, endDate, maxUses, active } = req.body;

    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ message: "title cannot be empty" });
      promotion.title = title.trim();
    }
    if (description !== undefined) {
      promotion.description = String(description).trim();
    }
    if (discountType !== undefined) {
      if (!["fixed", "percentage"].includes(discountType)) {
        return res.status(400).json({ message: "discountType must be 'fixed' or 'percentage'" });
      }
      promotion.discountType = discountType;
    }
    if (discountValue !== undefined) {
      const val = Number(discountValue);
      if (!Number.isFinite(val) || val <= 0) {
        return res.status(400).json({ message: "discountValue must be greater than 0" });
      }
      if (promotion.discountType === "percentage" && val > 100) {
        return res.status(400).json({ message: "Percentage discount cannot exceed 100" });
      }
      promotion.amount = val;
    }
    if (active !== undefined) {
      promotion.active = Boolean(active);
    }
    if (maxUses !== undefined) {
      const parsed = Number(maxUses);
      if (parsed < 1 || !Number.isFinite(parsed)) {
        return res.status(400).json({ message: "maxUses must be >= 1" });
      }
      if (parsed < promotion.currentUses) {
        return res.status(400).json({ message: "maxUses cannot be below currentUses" });
      }
      promotion.maxUses = parsed;
    }
    if (applicableServiceIds !== undefined) {
      promotion.applicableServiceIds = Array.isArray(applicableServiceIds) ? applicableServiceIds : [];
    }
    if (applicableBarberIds !== undefined && Array.isArray(applicableBarberIds)) {
      const validBarberIds = [];
      for (const bid of applicableBarberIds) {
        if (!isValidObjectId(bid)) continue;
        const relType = await getMemberRelationshipType(bid, salonId);
        if (relType && relType.relationshipType === "staff" && relType.relationshipStatus === "accepted") {
          validBarberIds.push(bid);
        }
      }
      promotion.applicableBarberIds = validBarberIds;
    }
    if (startDate !== undefined) {
      promotion.startDate = startDate ? new Date(startDate) : null;
    }
    if (endDate !== undefined) {
      promotion.expiresAt = endDate ? new Date(endDate) : null;
    }

    await promotion.save();
    return res.json(promotion);
  } catch (error) {
    console.error("Could not update promotion", error);
    return res.status(500).json({ message: "Could not update promotion" });
  }
};

/**
 * POST /api/salons/:salonId/promotions/validate
 * Public/client validation endpoint for a salon promotion code.
 * Body: { code, serviceId?, barberId? }
 */
export const validateSalonPromotion = async (req, res) => {
  try {
    const { salonId } = req.params;
    const { code, serviceId, barberId } = req.body;

    if (!code) {
      return res.status(400).json({ message: "Promotion code is required" });
    }

    if (!isValidObjectId(salonId)) {
      return res.status(400).json({ message: "Invalid salon ID" });
    }

    const normalizedCode = String(code).toUpperCase().trim();
    const voucher = await Voucher.findOne({ code: normalizedCode, ownerType: "salon", ownerId: salonId }).lean();
    if (!voucher) {
      return res.status(400).json({ message: "Invalid promotion code" });
    }

    // Active check
    if (!voucher.active) {
      return res.status(400).json({ message: "This promotion is no longer active" });
    }

    // Expiry check
    if (voucher.expiresAt && new Date() > new Date(voucher.expiresAt)) {
      return res.status(400).json({ message: "This promotion has expired" });
    }

    // Start date check
    if (voucher.startDate && new Date() < new Date(voucher.startDate)) {
      return res.status(400).json({ message: "This promotion is not yet active" });
    }

    // Usage check
    if (voucher.currentUses >= voucher.maxUses) {
      return res.status(400).json({ message: "This promotion has been fully redeemed" });
    }

    // Service restriction
    if (voucher.applicableServiceIds && voucher.applicableServiceIds.length > 0) {
      if (!serviceId) {
        return res.status(400).json({ message: "serviceId is required for this promotion" });
      }
      const matches = voucher.applicableServiceIds.some((sid) => sameId(sid, serviceId));
      if (!matches) {
        return res.status(400).json({ message: "This promotion does not apply to this service" });
      }
    }

    // Barber restriction
    if (voucher.applicableBarberIds && voucher.applicableBarberIds.length > 0) {
      if (!barberId) {
        return res.status(400).json({ message: "barberId is required for this promotion" });
      }
      const matches = voucher.applicableBarberIds.some((bid) => sameId(bid, barberId));
      if (!matches) {
        return res.status(400).json({ message: "This promotion does not apply to this barber" });
      }
    }

    // Calculate discount preview if serviceId is provided
    let discountAmount = 0;
    let finalPrice = null;
    if (serviceId) {
      const Service = (await import("../models/Service.js")).default;
      const serviceQuery = { _id: serviceId, active: true };
      if (barberId && isValidObjectId(barberId)) {
        serviceQuery.barberId = barberId;
      }
      const service = await Service.findOne(serviceQuery)
        .select("price discountType discountValue")
        .lean();
      if (service) {
        // Get the service discounted price
        const { calculateServiceDiscountedPrice } = await import("./serviceController.js");
        const { discountedPrice } = calculateServiceDiscountedPrice(service);
        const servicePrice = discountedPrice;

        if (voucher.discountType === "percentage") {
          const pct = Math.min(Number(voucher.amount), 100);
          discountAmount = Math.round((servicePrice * pct) / 100);
        } else {
          discountAmount = Math.min(Number(voucher.amount), servicePrice);
        }
        finalPrice = Math.max(0, servicePrice - discountAmount);
      }
    }

    return res.json({
      valid: true,
      promotion: {
        id: voucher._id,
        code: voucher.code,
        title: voucher.title,
        description: voucher.description,
        discountType: voucher.discountType,
        discountValue: voucher.amount,
        startDate: voucher.startDate,
        endDate: voucher.expiresAt,
        expiresAt: voucher.expiresAt,
        maxUses: voucher.maxUses,
        currentUses: voucher.currentUses,
      },
      discountAmount,
      finalPrice,
    });
  } catch (error) {
    console.error("Could not validate promotion", error);
    return res.status(500).json({ message: "Could not validate promotion" });
  }
};
