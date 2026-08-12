import crypto from "crypto";
import mongoose from "mongoose";

import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import { canManageSalonRequest } from "../utils/salonPermissions.js";
import { calculateServiceDiscountedPrice } from "./serviceValidation.js";

export const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));

const sameId = (left, right) =>
  String(left || "") === String(right || "");

const codeLength = 8;
const codeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const codeAlphanumeric = /^[A-Z0-9]+$/;
const minCodeLength = 4;
const maxCodeLength = 20;

export const generateVoucherCode = () =>
  Array.from(crypto.randomBytes(codeLength), (byte) =>
    codeAlphabet[byte % codeAlphabet.length]
  ).join("");

export const validateManualVoucherCode = (code) => {
  const normalized = String(code).toUpperCase().trim();

  if (normalized.length < minCodeLength || normalized.length > maxCodeLength) {
    return {
      error: `Code must be between ${minCodeLength} and ${maxCodeLength} characters`,
    };
  }

  if (!codeAlphanumeric.test(normalized)) {
    return { error: "Code must be alphanumeric" };
  }

  return { value: normalized };
};

export const validateVoucherCreateInput = (body) => {
  const { ownerType, ownerId, title, type, amount, serviceId, maxUses, expiresAt } = body;
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

  if (body.visibility !== undefined && !["private", "public"].includes(body.visibility)) {
    errors.push("visibility must be 'private' or 'public'");
  }

  return errors;
};

export const assertVoucherOwnerAccess = async ({
  user,
  ownerType,
  ownerId,
  SalonModel = Salon,
}) => {
  if (!user || user.role !== "barber") {
    return { error: "Only barbers can manage vouchers", code: 403 };
  }

  const reqOwnerId = String(ownerId || "");

  if (ownerType === "barber") {
    if (!sameId(user._id, ownerId)) {
      return {
        error: "You can only manage barber-scoped vouchers for yourself",
        code: 403,
      };
    }
    return { allowed: true };
  }

  if (ownerType === "salon") {
    if (!isValidObjectId(reqOwnerId)) {
      return { error: "Invalid salon ID", code: 400 };
    }
    const salon = await SalonModel.findById(reqOwnerId).select("ownerId admins").lean();
    if (!salon) {
      return { error: "Salon not found", code: 404 };
    }
    if (!canManageSalonRequest(salon, user._id)) {
      return {
        error: "Only salon owner or admin can manage salon-scoped vouchers",
        code: 403,
      };
    }
    return { allowed: true };
  }

  return { error: "Invalid ownerType", code: 400 };
};

export const validateManagedVoucherServiceReference = async ({
  serviceId,
  barberId,
  ServiceModel = Service,
}) => {
  if (!isValidObjectId(serviceId)) {
    return { error: "Invalid serviceId", code: 400 };
  }

  const service = await ServiceModel.findOne({
    _id: serviceId,
    barberId,
  }).select("_id").lean();

  if (!service) {
    return { error: "Service not found or does not belong to you", code: 400 };
  }

  return { service };
};

export const validateVoucherApplicability = ({
  voucher,
  barberId,
  salonId,
  serviceId,
}) => {
  if (!voucher.active) {
    return { error: "This voucher is no longer active", code: 400 };
  }

  if (voucher.expiresAt) {
    const now = new Date();
    if (now > new Date(voucher.expiresAt)) {
      return { error: "This voucher has expired", code: 400 };
    }
  }

  if (voucher.startDate && new Date() < new Date(voucher.startDate)) {
    return { error: "This promotion is not yet active", code: 400 };
  }

  if (voucher.currentUses >= voucher.maxUses) {
    return { error: "This voucher has been fully redeemed", code: 400 };
  }

  if (voucher.ownerType === "barber") {
    if (!barberId) {
      return {
        error: "barberId is required for barber-scoped vouchers",
        code: 400,
      };
    }
    if (!sameId(voucher.ownerId, barberId)) {
      return { error: "This voucher does not apply to this barber", code: 400 };
    }
  }

  if (voucher.ownerType === "salon") {
    if (!salonId) {
      return {
        error: "salonId is required for salon-scoped vouchers",
        code: 400,
      };
    }
    if (!sameId(voucher.ownerId, salonId)) {
      return { error: "This voucher does not apply to this salon", code: 400 };
    }
  }

  if (voucher.serviceId) {
    if (!serviceId) {
      return {
        error: "serviceId is required for service-specific vouchers",
        code: 400,
      };
    }
    if (!sameId(voucher.serviceId, serviceId)) {
      return { error: "This voucher does not apply to this service", code: 400 };
    }
  }

  if (voucher.applicableServiceIds && voucher.applicableServiceIds.length > 0) {
    if (!serviceId) {
      return { error: "serviceId is required for this promotion", code: 400 };
    }
    const matches = voucher.applicableServiceIds.some((id) => sameId(id, serviceId));
    if (!matches) {
      return {
        error: "This promotion does not apply to this service",
        code: 400,
      };
    }
  }

  if (voucher.applicableBarberIds && voucher.applicableBarberIds.length > 0) {
    if (!barberId) {
      return { error: "barberId is required for this promotion", code: 400 };
    }
    const matches = voucher.applicableBarberIds.some((id) => sameId(id, barberId));
    if (!matches) {
      return {
        error: "This promotion does not apply to this barber",
        code: 400,
      };
    }
  }

  if (!serviceId) {
    return { error: "serviceId is required", code: 400 };
  }

  return { allowed: true };
};

export const getActiveVoucherService = async ({
  serviceId,
  ServiceModel = Service,
}) => {
  const service = await ServiceModel.findOne({ _id: serviceId, active: true })
    .select("price discountType discountValue")
    .lean();

  if (!service) {
    return { error: "Service not found or inactive", code: 400 };
  }

  return { service };
};

export const calculateVoucherDiscountPreview = ({ voucher, service }) => {
  const { discountedPrice: serviceDiscountedPrice } =
    calculateServiceDiscountedPrice(service);

  return voucher.discountType === "percentage"
    ? Math.round(
        (serviceDiscountedPrice * Math.min(Number(voucher.amount), 100)) / 100
      )
    : Math.min(Number(voucher.amount), serviceDiscountedPrice);
};
