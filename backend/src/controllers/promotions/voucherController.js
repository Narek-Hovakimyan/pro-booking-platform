import mongoose from "mongoose";
import Service from "../../models/Service.js";
import Voucher from "../../models/Voucher.js";
import { resolveVoucherForBooking } from "../../services/booking/bookingPricingService.js";
import {
  assertVoucherOwnerAccess,
  calculateVoucherDiscountPreview,
  generateVoucherCode,
  getActiveVoucherService,
  isValidObjectId,
  resolveVoucherValidationContext,
  validateManagedVoucherServiceReference,
  validateManualVoucherCode,
  validateVoucherCreateInput,
} from "../../services/voucherValidation.js";

const logRequestError = (req, context, message) => {
  try {
    req.log?.error(context, message);
  } catch {
    // Logging must not affect response behavior.
  }
};

/* ── Handlers ─────────────────────────────────────────────── */

/**
 * POST /api/vouchers
 * Auth: barber only
 */
export const createVoucher = async (req, res) => {
  try {
    const validationErrors = validateVoucherCreateInput(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ message: validationErrors.join("; ") });
    }

    const { ownerType, ownerId, title, type, amount, serviceId, maxUses, expiresAt, code, visibility } = req.body;

    // Owner permission check
    const access = await assertVoucherOwnerAccess({
      user: req.user,
      ownerType,
      ownerId,
    });
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    // If type=service, verify the service belongs to this barber
    if (type === "service") {
      const serviceValidation = await validateManagedVoucherServiceReference({
        serviceId,
        barberId: req.user._id,
        ServiceModel: Service,
      });
      if (serviceValidation.error) {
        return res.status(serviceValidation.code).json({ message: serviceValidation.error });
      }
    }

    // Generate or validate code
    let voucherCode;
    if (code) {
      const manualCodeValidation = validateManualVoucherCode(code);
      if (manualCodeValidation.error) {
        return res.status(400).json({ message: manualCodeValidation.error });
      }
      const normalized = manualCodeValidation.value;
      // Check uniqueness
      const existing = await Voucher.findOne({ ownerType, ownerId, code: normalized }).select("_id").lean();
      if (existing) {
        return res.status(400).json({ message: "A voucher with this code already exists" });
      }
      voucherCode = normalized;
    } else {
      // Auto-generate unique code
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const candidate = generateVoucherCode();
        const existing = await Voucher.findOne({ ownerType, ownerId, code: candidate }).select("_id").lean();
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
    logRequestError(
      req,
      { err: error, event: "voucher.create_failed", ownerType: req.body?.ownerType },
      "Could not create voucher"
    );
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

    const access = await assertVoucherOwnerAccess({
      user: req.user,
      ownerType,
      ownerId,
    });
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    const vouchers = await Voucher.find({ ownerType, ownerId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(vouchers);
  } catch (error) {
    logRequestError(
      req,
      {
        err: error,
        event: "voucher.owner_fetch_failed",
        ownerType: req.params?.ownerType,
        ownerId: req.params?.ownerId,
      },
      "Could not fetch vouchers"
    );
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

    const access = await assertVoucherOwnerAccess({
      user: req.user,
      ownerType: voucher.ownerType,
      ownerId: voucher.ownerId,
    });
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    return res.json(voucher);
  } catch (error) {
    logRequestError(
      req,
      { err: error, event: "voucher.fetch_failed", voucherId: req.params?.id },
      "Could not fetch voucher"
    );
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
    const access = await assertVoucherOwnerAccess({
      user: req.user,
      ownerType: voucher.ownerType,
      ownerId: voucher.ownerId,
    });
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
        const serviceValidation = await validateManagedVoucherServiceReference({
          serviceId,
          barberId: req.user._id,
          ServiceModel: Service,
        });
        if (serviceValidation.error) {
          return res.status(serviceValidation.code).json({ message: serviceValidation.error });
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
    logRequestError(
      req,
      { err: error, event: "voucher.update_failed", voucherId: req.params?.id },
      "Could not update voucher"
    );
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

    const access = await assertVoucherOwnerAccess({
      user: req.user,
      ownerType: voucher.ownerType,
      ownerId: voucher.ownerId,
    });
    if (access.error) {
      return res.status(access.code).json({ message: access.error });
    }

    await Voucher.findByIdAndUpdate(id, { $set: { active: false } });
    return res.json({ message: "Voucher deactivated" });
  } catch (error) {
    logRequestError(
      req,
      { err: error, event: "voucher.delete_failed", voucherId: req.params?.id },
      "Could not delete voucher"
    );
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

    const context = await resolveVoucherValidationContext({ barberId, salonId, serviceId });
    if (!context) return res.status(400).json({ message: "Invalid voucher code" });

    let voucher;
    try {
      voucher = await resolveVoucherForBooking({
        voucherCode: code,
        barberId: context.barberId,
        salonId: context.salonId,
        serviceId: context.serviceId,
      });
    } catch (error) {
      if (error?.statusCode === 400) {
        return res.status(400).json({ message: "Invalid voucher code" });
      }
      throw error;
    }
    if (!voucher) return res.status(400).json({ message: "Invalid voucher code" });

    const activeService = await getActiveVoucherService({
      serviceId: context.serviceId,
      ServiceModel: Service,
    });
    if (activeService.error) {
      return res.status(activeService.code).json({ message: activeService.error });
    }
    const discountPreview = calculateVoucherDiscountPreview({
      voucher,
      service: activeService.service,
    });

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
    logRequestError(
      req,
      { err: error, event: "voucher.validate_failed" },
      "Could not validate voucher"
    );
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
    const { salonId, barberId, serviceId } = req.query || {};
    if (!["barber", "salon"].includes(ownerType)) {
      return res.status(400).json({ message: "ownerType must be 'barber' or 'salon'" });
    }

    if (!isValidObjectId(ownerId)) {
      return res.status(400).json({ message: "Invalid ownerId" });
    }

    const now = new Date();
    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);
    const hasBookingScope = Boolean(salonId || barberId || serviceId);
    let scopeStages = [];

    if (hasBookingScope) {
      if (!barberId || !serviceId) return res.json([]);

      const context = await resolveVoucherValidationContext({
        salonId,
        barberId,
        serviceId,
      });
      if (
        !context ||
        (ownerType === "barber" && String(context.barberId) !== String(ownerId)) ||
        (ownerType === "salon" && String(context.salonId || "") !== String(ownerId))
      ) {
        return res.json([]);
      }

      const serviceObjectId = new mongoose.Types.ObjectId(context.serviceId);
      const barberObjectId = new mongoose.Types.ObjectId(context.barberId);
      scopeStages = [
        { $match: { $or: [{ serviceId: null }, { serviceId: serviceObjectId }] } },
        {
          $match: {
            $or: [
              { applicableServiceIds: { $exists: false } },
              { applicableServiceIds: { $size: 0 } },
              { applicableServiceIds: serviceObjectId },
            ],
          },
        },
        {
          $match: {
            $or: [
              { applicableBarberIds: { $exists: false } },
              { applicableBarberIds: { $size: 0 } },
              { applicableBarberIds: barberObjectId },
            ],
          },
        },
      ];
    }

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
      { $match: { $or: [{ startDate: null }, { startDate: { $lte: now } }] } },
      ...scopeStages,
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
    logRequestError(
      req,
      {
        err: error,
        event: "voucher.public_fetch_failed",
        ownerType: req.params?.ownerType,
        ownerId: req.params?.ownerId,
      },
      "Could not fetch public vouchers"
    );
    return res.status(500).json({ message: "Could not fetch public vouchers" });
  }
};
