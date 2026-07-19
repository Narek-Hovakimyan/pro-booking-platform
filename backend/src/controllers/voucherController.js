import crypto from "crypto";
import mongoose from "mongoose";
import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import { calculateServiceDiscountedPrice } from "./services/serviceController.js";


import Voucher from "../models/Voucher.js";
import { canManageSalonRequest } from "../utils/salonPermissions.js";

const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));

const sameId = (left, right) =>
  String(left || "") === String(right || "");

const codeLength = 8;
const codeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateCode = () =>
  Array.from(crypto.randomBytes(codeLength), (byte) =>
    codeAlphabet[byte % codeAlphabet.length]
  ).join("");
const codeAlphanumeric = /^[A-Z0-9]+$/;
const minCodeLength = 4;
const maxCodeLength = 20;

/* ── Permission helpers ───────────────────────────────────── */

/**
 * Assert that req.user is a barber and can manage the voucher owner scope.
 * Returns { allowed, error }
 */
const assertOwnerAccess = async (req, ownerType, ownerId) => {
  if (!req.user || req.user.role !== "barber") {
    return { error: "Only barbers can manage vouchers", code: 403 };
  }

  const reqOwnerId = String(ownerId || "");

  if (ownerType === "barber") {
    if (!sameId(req.user._id, ownerId)) {
      return { error: "You can only manage barber-scoped vouchers for yourself", code: 403 };
    }
    return { allowed: true };
  }

  if (ownerType === "salon") {
    if (!isValidObjectId(reqOwnerId)) {
      return { error: "Invalid salon ID", code: 400 };
    }
    const salon = await Salon.findById(reqOwnerId).select("ownerId admins").lean();
    if (!salon) {
      return { error: "Salon not found", code: 404 };
    }
    if (!canManageSalonRequest(salon, req.user._id)) {
      return { error: "Only salon owner or admin can manage salon-scoped vouchers", code: 403 };
    }
    return { allowed: true };
  }

  return { error: "Invalid ownerType", code: 400 };
};

/* ── Validation helpers ──────────────────────────────────── */

const validateCreateInput = async (req) => {
  const { ownerType, ownerId, title, type, amount, serviceId, maxUses, expiresAt } = req.body;
  const errors = [];

  if (!ownerType || !["barber", "salon"].includes(ownerType)) {
    errors.push("ownerType must be 'barber' or 'salon'");
  }
  if (!ownerId) {
    errors.push("ownerId is required");
  }
  if (!title || !title.trim()) {
    errors.push("title is required");
  }
  if (!type || !["amount", "service"].includes(type)) {
    errors.push("type must be 'amount' or 'service'");
  }
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    errors.push("amount must be a valid non-negative number");
  } else if (type === "amount" && numericAmount <= 0) {
    errors.push("amount must be greater than 0");
  }
  if (type === "service" && !serviceId) {
    errors.push("serviceId is required when type is 'service'");
  }
  if (maxUses !== undefined && (Number(maxUses) < 1 || !Number.isFinite(Number(maxUses)))) {
    errors.push("maxUses must be >= 1");
  }
  if (expiresAt) {
    const expiry = new Date(expiresAt);
    if (isNaN(expiry.getTime())) {
      errors.push("expiresAt must be a valid date");
    } else if (expiry <= new Date()) {
      errors.push("expiresAt must be a future date");
    }
  }

  if (req.body.visibility !== undefined && !["private", "public"].includes(req.body.visibility)) {
    errors.push("visibility must be 'private' or 'public'");
  }

  return errors;
};

/* ── Handlers ─────────────────────────────────────────────── */

/**
 * POST /api/vouchers
 * Auth: barber only
 */
export const createVoucher = async (req, res) => {
  try {
    const validationErrors = await validateCreateInput(req);
    if (validationErrors.length > 0) {
      return res.status(400).json({ message: validationErrors.join("; ") });
    }

    const { ownerType, ownerId, title, type, amount, serviceId, maxUses, expiresAt, code, visibility } = req.body;

    // Owner permission check
    const access = await assertOwnerAccess(req, ownerType, ownerId);
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    // If type=service, verify the service belongs to this barber
    if (type === "service") {
      if (!isValidObjectId(serviceId)) {
        return res.status(400).json({ message: "Invalid serviceId" });
      }
      const service = await Service.findOne({ _id: serviceId, barberId: req.user._id }).select("_id").lean();
      if (!service) {
        return res.status(400).json({ message: "Service not found or does not belong to you" });
      }
    }

    // Generate or validate code
    let voucherCode;
    if (code) {
      const normalized = String(code).toUpperCase().trim();
      if (normalized.length < minCodeLength || normalized.length > maxCodeLength) {
        return res.status(400).json({ message: `Code must be between ${minCodeLength} and ${maxCodeLength} characters` });
      }
      if (!codeAlphanumeric.test(normalized)) {
        return res.status(400).json({ message: "Code must be alphanumeric" });
      }
      // Check uniqueness
      const existing = await Voucher.findOne({ code: normalized }).select("_id").lean();
      if (existing) {
        return res.status(400).json({ message: "A voucher with this code already exists" });
      }
      voucherCode = normalized;
    } else {
      // Auto-generate unique code
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const candidate = generateCode();
        const existing = await Voucher.findOne({ code: candidate }).select("_id").lean();
        if (!existing) {
          voucherCode = candidate;
          break;
        }
        attempts++;
      }
      if (!voucherCode) {
        return res.status(500).json({ message: "Could not generate unique voucher code" });
      }
    }

    const voucher = await Voucher.create({
      ownerType,
      ownerId,
      code: voucherCode,
      title: title.trim(),
      type,
      amount: amount !== undefined ? Number(amount) : 0,
      serviceId: type === "service" ? serviceId : null,
      maxUses: maxUses !== undefined ? Number(maxUses) : 1,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      visibility: visibility !== undefined ? visibility : "private",
    });

    return res.status(201).json(voucher);
  } catch (error) {
    // Handle duplicate code from race condition
    if (error?.code === 11000 && error?.keyPattern?.code) {
      return res.status(400).json({ message: "A voucher with this code already exists" });
    }
    console.error("Could not create voucher", error);
    return res.status(500).json({ message: "Could not create voucher" });
  }
};

/**
 * GET /api/vouchers/owner/:ownerType/:ownerId
 * Auth: owner barber only
 */
export const getOwnerVouchers = async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;

    const access = await assertOwnerAccess(req, ownerType, ownerId);
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    const vouchers = await Voucher.find({ ownerType, ownerId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(vouchers);
  } catch (error) {
    console.error("Could not fetch vouchers", error);
    return res.status(500).json({ message: "Could not fetch vouchers" });
  }
};

/**
 * GET /api/vouchers/:id
 * Auth: owner barber only
 */
export const getVoucherById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid voucher ID" });
    }

    const voucher = await Voucher.findById(id).lean();
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    const access = await assertOwnerAccess(req, voucher.ownerType, voucher.ownerId);
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    return res.json(voucher);
  } catch (error) {
    console.error("Could not fetch voucher", error);
    return res.status(500).json({ message: "Could not fetch voucher" });
  }
};

/**
 * PUT /api/vouchers/:id
 * Auth: owner barber only
 */
export const updateVoucher = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid voucher ID" });
    }

    const voucher = await Voucher.findById(id);
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    // Owner permission check
    const access = await assertOwnerAccess(req, voucher.ownerType, voucher.ownerId);
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    // Protected fields — cannot change
    const protectedFields = ["ownerType", "ownerId", "code", "currentUses", "redemptionBookingIds"];
    for (const field of protectedFields) {
      if (req.body[field] !== undefined) {
        return res.status(400).json({ message: `Cannot change ${field}` });
      }
    }

    // Allowed mutable fields
    const { title, amount, serviceId, maxUses, active, expiresAt, visibility } = req.body;

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ message: "title cannot be empty" });
      }
      voucher.title = title.trim();
    }

    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ message: "amount must be a valid non-negative number" });
      }
      if (voucher.type === "amount" && parsedAmount <= 0) {
        return res.status(400).json({ message: "amount must be greater than 0" });
      }
      voucher.amount = parsedAmount;
    }

    if (serviceId !== undefined) {
      if (serviceId !== null && !isValidObjectId(serviceId)) {
        return res.status(400).json({ message: "Invalid serviceId" });
      }
      if (serviceId !== null) {
        const service = await Service.findOne({ _id: serviceId, barberId: req.user._id }).select("_id").lean();
        if (!service) {
          return res.status(400).json({ message: "Service not found or does not belong to you" });
        }
      }
      voucher.serviceId = serviceId;
    }

    if (maxUses !== undefined) {
      const parsed = Number(maxUses);
      if (parsed < 1 || !Number.isFinite(parsed)) {
        return res.status(400).json({ message: "maxUses must be >= 1" });
      }
      if (parsed < voucher.currentUses) {
        return res.status(400).json({ message: "maxUses cannot be set below currentUses" });
      }
      voucher.maxUses = parsed;
    }

    if (active !== undefined) {
      voucher.active = Boolean(active);
    }

    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        voucher.expiresAt = null;
      } else {
        const expiry = new Date(expiresAt);
        if (isNaN(expiry.getTime())) {
          return res.status(400).json({ message: "expiresAt must be a valid date" });
        }
        if (expiry <= new Date()) {
          return res.status(400).json({ message: "expiresAt must be a future date" });
        }
        voucher.expiresAt = expiry;
      }
    }

    if (visibility !== undefined) {
      if (!["private", "public"].includes(visibility)) {
        return res.status(400).json({ message: "visibility must be 'private' or 'public'" });
      }
      voucher.visibility = visibility;
    }

    await voucher.save();
    return res.json(voucher);
  } catch (error) {
    console.error("Could not update voucher", error);
    return res.status(500).json({ message: "Could not update voucher" });
  }
};

/**
 * DELETE /api/vouchers/:id
 * Auth: owner barber only
 * Soft delete: sets active=false
 */
export const deleteVoucher = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid voucher ID" });
    }

    const voucher = await Voucher.findById(id).lean();
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    const access = await assertOwnerAccess(req, voucher.ownerType, voucher.ownerId);
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    await Voucher.findByIdAndUpdate(id, { $set: { active: false } });
    return res.json({ message: "Voucher deactivated" });
  } catch (error) {
    console.error("Could not delete voucher", error);
    return res.status(500).json({ message: "Could not delete voucher" });
  }
};

/**
 * POST /api/vouchers/validate
 * Auth: any authenticated user (client or barber)
 * Returns safe public payload + capped discountPreview
 */
export const validateVoucherCode = async (req, res) => {
  try {
    const { code, barberId, salonId, serviceId } = req.body;

    if (!code) {
      return res.status(400).json({ message: "Voucher code is required" });
    }

    const normalizedCode = String(code).toUpperCase().trim();
    const voucher = await Voucher.findOne({ code: normalizedCode }).lean();
    if (!voucher) {
      return res.status(400).json({ message: "Invalid voucher code" });
    }

    // Active check
    if (!voucher.active) {
      return res.status(400).json({ message: "This voucher is no longer active" });
    }

    // Expiry check
    if (voucher.expiresAt) {
      const now = new Date();
      if (now > new Date(voucher.expiresAt)) {
        return res.status(400).json({ message: "This voucher has expired" });
      }
    }

    if (voucher.startDate && new Date() < new Date(voucher.startDate)) {
      return res.status(400).json({ message: "This promotion is not yet active" });
    }

    // Usage check
    if (voucher.currentUses >= voucher.maxUses) {
      return res.status(400).json({ message: "This voucher has been fully redeemed" });
    }

    // Owner context check
    if (voucher.ownerType === "barber") {
      if (!barberId) {
        return res.status(400).json({ message: "barberId is required for barber-scoped vouchers" });
      }
      if (!sameId(voucher.ownerId, barberId)) {
        return res.status(400).json({ message: "This voucher does not apply to this barber" });
      }
    }

    if (voucher.ownerType === "salon") {
      if (!salonId) {
        return res.status(400).json({ message: "salonId is required for salon-scoped vouchers" });
      }
      if (!sameId(voucher.ownerId, salonId)) {
        return res.status(400).json({ message: "This voucher does not apply to this salon" });
      }
    }

    // Service-specific check
    if (voucher.serviceId) {
      if (!serviceId) {
        return res.status(400).json({ message: "serviceId is required for service-specific vouchers" });
      }
      if (!sameId(voucher.serviceId, serviceId)) {
        return res.status(400).json({ message: "This voucher does not apply to this service" });
      }
    }

    if (voucher.applicableServiceIds && voucher.applicableServiceIds.length > 0) {
      if (!serviceId) {
        return res.status(400).json({ message: "serviceId is required for this promotion" });
      }
      const matches = voucher.applicableServiceIds.some((id) => sameId(id, serviceId));
      if (!matches) {
        return res.status(400).json({ message: "This promotion does not apply to this service" });
      }
    }

    if (voucher.applicableBarberIds && voucher.applicableBarberIds.length > 0) {
      if (!barberId) {
        return res.status(400).json({ message: "barberId is required for this promotion" });
      }
      const matches = voucher.applicableBarberIds.some((id) => sameId(id, barberId));
      if (!matches) {
        return res.status(400).json({ message: "This promotion does not apply to this barber" });
      }
    }

    if (!serviceId) {
      return res.status(400).json({ message: "serviceId is required" });
    }

    // Verify the requested service exists and is active
    const service = await Service.findOne({ _id: serviceId, active: true })
      .select("price discountType discountValue")
      .lean();
    if (!service) {
      return res.status(400).json({ message: "Service not found or inactive" });
    }
    // discountPreview is capped against the service's discounted price (not raw price)
    const { discountedPrice: serviceDiscountedPrice } = calculateServiceDiscountedPrice(service);
    const discountPreview =
      voucher.discountType === "percentage"
        ? Math.round(
            (serviceDiscountedPrice * Math.min(Number(voucher.amount), 100)) / 100
          )
        : Math.min(Number(voucher.amount), serviceDiscountedPrice);


    return res.json({
      valid: true,
      voucher: {
        id: voucher._id,
        code: voucher.code,
        title: voucher.title,
        type: voucher.type,
        amount: voucher.amount,
        discountType: voucher.discountType || "fixed",
        serviceId: voucher.serviceId,
        applicableServiceIds: voucher.applicableServiceIds || [],
        applicableBarberIds: voucher.applicableBarberIds || [],
        ownerType: voucher.ownerType,
        ownerId: voucher.ownerId,
        maxUses: voucher.maxUses,
        currentUses: voucher.currentUses,
        startDate: voucher.startDate,
        expiresAt: voucher.expiresAt,
      },
      discountPreview,
    });
  } catch (error) {
    console.error("Could not validate voucher", error);
    return res.status(500).json({ message: "Could not validate voucher" });
  }
};

/**
 * GET /api/vouchers/public/:ownerType/:ownerId
 * Auth: none (public)
 * Returns only safe fields for public, active, non-expired, non-exhausted vouchers.
 */
export const getPublicVouchers = async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;

    if (!["barber", "salon"].includes(ownerType)) {
      return res.status(400).json({ message: "ownerType must be 'barber' or 'salon'" });
    }

    if (!isValidObjectId(ownerId)) {
      return res.status(400).json({ message: "Invalid ownerId" });
    }

    const now = new Date();
    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

    const safeVouchers = await Voucher.aggregate([
      {
        $match: {
          ownerType,
          ownerId: ownerObjectId,
          visibility: "public",
          active: true,
          $expr: { $lt: ["$currentUses", "$maxUses"] },
        },
      },
      {
        $match: {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: now } },
          ],
        },
      },
      {
        $project: {
          code: 1,
          title: 1,
          type: 1,
          amount: 1,
          serviceId: 1,
          expiresAt: 1,
          maxUses: 1,
          currentUses: 1,
          visibility: 1,
          _id: 0,
        },
      },
    ]);

    return res.json(safeVouchers);
  } catch (error) {
    console.error("Could not fetch public vouchers", error);
    return res.status(500).json({ message: "Could not fetch public vouchers" });
  }
};
