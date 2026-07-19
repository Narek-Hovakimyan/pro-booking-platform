import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import ServiceCategory from "../../models/ServiceCategory.js";
import Service, { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from "../../models/Service.js";
import { canManageSalonRequest } from "../../utils/salonPermissions.js";
import { sendControllerError } from "../../utils/controllerError.js";

/* ── Helpers ────────────────────────────────────────────── */

const isBarber = (user) => user?.role === "barber";

const getIdString = (value) => (value?._id || value?.id || value)?.toString();

/**
 * Build the system category entries from the static SERVICE_CATEGORIES enum.
 */
const buildSystemCategories = () =>
  SERVICE_CATEGORIES.map((key, idx) => ({
    id: `system:${key}`,
    key,
    name: key,
    source: "system",
    ownerType: "global",
    sortOrder: idx,
  }));

/**
 * All system keys and labels lowercased for collision checking.
 */
const SYSTEM_KEYS_AND_LABELS = [
  ...new Set([
    ...SERVICE_CATEGORIES.map((k) => k.toLowerCase()),
    ...SERVICE_CATEGORY_LABELS.map((l) => l.trim().toLowerCase()),
  ]),
];

/**
 * Validate ownerType value.
 */
const isValidOwnerType = (ownerType) =>
  ownerType === "barber" || ownerType === "salon";

/**
 * Is the authenticated user allowed to act on behalf of the given owner?
 * - Barbers can act for themselves (ownerType=barber, ownerId=their id).
 * - Salon owner/admin can act for their salon (ownerType=salon, ownerId=salon id).
 *
 * Uses existing salonPermissions helpers for the salon check.
 */
const canManageOwner = async (user, ownerType, ownerId) => {
  const userId = getIdString(user._id);

  if (ownerType === "barber") {
    return isBarber(user) && getIdString(ownerId) === userId;
  }

  if (ownerType === "salon") {
    const salon = await Salon.findById(ownerId);
    if (!salon) return false;
    return canManageSalonRequest(salon, userId);
  }

  return false;
};

/**
 * Reject names that collide with system keys or labels (case-insensitive).
 */
const validateCustomName = (name) => {
  const trimmed = (name || "").trim();

  if (!trimmed) {
    return { error: "Category name is required", code: 400 };
  }

  if (trimmed.length > 100) {
    return { error: "Category name must be 100 characters or fewer", code: 400 };
  }

  const lower = trimmed.toLowerCase();

  if (SYSTEM_KEYS_AND_LABELS.includes(lower)) {
    return {
      error: `'${trimmed}' conflicts with a system category`,
      code: 400,
    };
  }

  return { error: null, name: trimmed };
};

/**
 * Require barber role. Sends 403 and returns false if not.
 */
const requireBarber = (req, res) => {
  if (!isBarber(req.user)) {
    res.status(403).json({ message: "Only barbers can manage categories" });
    return false;
  }
  return true;
};

/* ── Controllers ────────────────────────────────────────── */

/**
 * GET /api/service-categories
 *
 * Public:    No ownerType/ownerId → returns system categories only.
 * Protected: ownerType + ownerId requires authenticated user with permission.
 *            Anonymous owner-scoped queries return 401.
 *            Unauthorized owner-scoped queries return 403.
 */
export const listServiceCategories = async (req, res) => {
  try {
    const { ownerType, ownerId } = req.query;

    const systemCategories = buildSystemCategories();

    /* No owner scope — public, system categories only */
    if (!ownerType && !ownerId) {
      return res.json(systemCategories);
    }

    /* Owner scope requires both ownerType and ownerId */
    if (!ownerType || !ownerId) {
      return res.status(400).json({
        message:
          "Both ownerType and ownerId are required when filtering by owner",
      });
    }

    if (!isValidOwnerType(ownerType)) {
      return res
        .status(400)
        .json({ message: "ownerType must be 'barber' or 'salon'" });
    }

    /* Validate ownerId is a proper ObjectId before any DB operation */
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({ message: "Invalid ownerId" });
    }

    /* Anonymous user requesting owner-scoped list — 401 */
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required to list custom categories",
      });
    }

    /* Authenticated but not authorized for this owner scope */
    if (!(await canManageOwner(req.user, ownerType, ownerId))) {
      return res.status(403).json({
        message: `Not authorized to list categories for this ${ownerType}`,
      });
    }

    /* ── Fetch owner's custom categories ── */
    const customCategories = await ServiceCategory.find({
      source: "custom",
      ownerType,
      ownerId,
      active: true,
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    return res.json([
      ...systemCategories,
      ...customCategories.map((cat) => ({
        ...cat,
        id: cat._id,
      })),
    ]);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch service categories");
  }
};

/**
 * POST /api/service-categories
 *
 * Create a custom category owned by a barber or salon.
 * Body: { name, ownerType, ownerId }
 *
 * - source is always forced to "custom" (client-provided source is ignored).
 * - Name collision checked against system keys AND system labels (case-insensitive).
 * - Barber-scoped: ownerId must equal req.user._id.
 * - Salon-scoped: req.user must be salon owner or admin.
 */
export const createServiceCategory = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return;

    const { name: rawName, ownerType, ownerId } = req.body;

    /* ── Validate name ── */
    const nameResult = validateCustomName(rawName);
    if (nameResult.error) {
      return res.status(nameResult.code).json({ message: nameResult.error });
    }
    const trimmedName = nameResult.name;

    /* ── Validate ownerType ── */
    if (!ownerType || !isValidOwnerType(ownerType)) {
      return res
        .status(400)
        .json({ message: "ownerType must be 'barber' or 'salon'" });
    }

    /* ── Validate ownerId ── */
    if (!ownerId) {
      return res.status(400).json({ message: "ownerId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({ message: "Invalid ownerId" });
    }

    /* ── Authorization ── */
    if (!(await canManageOwner(req.user, ownerType, ownerId))) {
      return res.status(403).json({
        message: `Not authorized to create categories for this ${ownerType}`,
      });
    }

    /* ── Check duplicate name (active only, case-insensitive) ── */
    const existingActive = await ServiceCategory.findOne({
      source: "custom",
      ownerType,
      ownerId,
      active: true,
      name: { $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });

    if (existingActive) {
      return res.status(409).json({
        message: "A custom category with this name already exists",
      });
    }

    /* ── Determine next sortOrder for this owner scope ── */
    const lastCategory = await ServiceCategory.findOne({
      source: "custom",
      ownerType,
      ownerId,
      active: true,
    })
      .sort({ sortOrder: -1 })
      .select("sortOrder")
      .lean();

    const nextSortOrder = lastCategory
      ? Number(lastCategory.sortOrder || 0) + 1
      : 0;

    /* ── Create (ignore client-provided sortOrder) ── */
    const category = await ServiceCategory.create({
      name: trimmedName,
      source: "custom",
      ownerType,
      ownerId,
      createdBy: req.user._id,
      sortOrder: nextSortOrder,
    });

    return res.status(201).json(category);
  } catch (error) {
    /* Handle duplicate name error from unique index (fallback) */
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ message: "A custom category with this name already exists" });
    }

    return res.status(400).json({
      message: error.message || "Could not create service category",
    });
  }
};

/**
 * PUT /api/service-categories/:id
 *
 * Update a custom category (name, sortOrder, active).
 * System categories cannot be updated via API.
 */
export const updateServiceCategory = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return;

    const { id } = req.params;

    /* Validate ObjectId format early */
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const category = await ServiceCategory.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (category.source !== "custom") {
      return res
        .status(403)
        .json({ message: "System categories cannot be modified via API" });
    }

    /* ── Authorization ── */
    if (!(await canManageOwner(req.user, category.ownerType, category.ownerId))) {
      return res.status(403).json({
        message: "Not authorized to update this category",
      });
    }

    const updates = {};
    const { name, sortOrder, active } = req.body;

    if (name !== undefined) {
      const nameResult = validateCustomName(name);
      if (nameResult.error) {
        return res.status(nameResult.code).json({ message: nameResult.error });
      }

      /* Check duplicate on other active custom names for same owner */
      const duplicate = await ServiceCategory.findOne({
        _id: { $ne: category._id },
        source: "custom",
        ownerType: category.ownerType,
        ownerId: category.ownerId,
        active: true,
        name: { $regex: `^${nameResult.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      });

      if (duplicate) {
        return res.status(409).json({
          message: "A custom category with this name already exists",
        });
      }

      updates.name = nameResult.name;
    }

    if (sortOrder !== undefined) {
      updates.sortOrder = Number(sortOrder) || 0;
    }

    if (active !== undefined) {
      updates.active = Boolean(active);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    Object.assign(category, updates);
    const updated = await category.save();

    return res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ message: "A custom category with this name already exists" });
    }

    return res.status(400).json({
      message: error.message || "Could not update service category",
    });
  }
};

/**
 * DELETE /api/service-categories/:id
 *
 * - System categories: 403.
 * - Custom category with no referencing services: hard-deleted.
 * - Custom category with referencing services: soft-disabled (active=false)
 *   so existing service references remain valid.
 *
 */
export const deleteServiceCategory = async (req, res) => {
  try {
    if (!requireBarber(req, res)) return;

    const { id } = req.params;

    /* Validate ObjectId format early */
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const category = await ServiceCategory.findById(id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (category.source !== "custom") {
      return res
        .status(403)
        .json({ message: "System categories cannot be deleted via API" });
    }

    /* ── Authorization ── */
    if (!(await canManageOwner(req.user, category.ownerType, category.ownerId))) {
      return res.status(403).json({
        message: "Not authorized to delete this category",
      });
    }

    /* Keep referenced custom categories available for existing services. */
    const servicesUsing = await Service.countDocuments({
      customCategoryId: category._id,
      active: true,
    });

    if (servicesUsing > 0) {
      /* Soft-disable: keep the record so service references stay valid */
      category.active = false;
      await category.save();

      return res.json({
        message: "Category disabled — some services still reference it",
        category,
        softDeleted: true,
      });
    }

    /* No services reference it — safe to hard-delete */
    await category.deleteOne();

    return res.json({ message: "Category deleted" });
  } catch (error) {
    return sendControllerError(res, error, "Could not delete service category");
  }
};
