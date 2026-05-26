import mongoose from "mongoose";
import PortfolioPhoto from "../models/PortfolioPhoto.js";
import Service from "../models/Service.js";
import { deleteUploadedFile } from "../middleware/uploadMiddleware.js";

/* ── Helpers ────────────────────────────────────────── */

const isBarber = (user) => user?.role === "barber";

const getId = (doc) => doc?._id ?? doc?.id ?? doc;

const getUserId = (user) => String(getId(user));

const formatPhoto = (photo) => ({
  ...photo.toObject(),
  id: photo._id.toString(),
});

const isValidObjectId = (id) =>
  id && mongoose.Types.ObjectId.isValid(id);

const collectUploadedFiles = (req) => {
  const files = [];
  if (req.files?.beforeImage?.[0]) files.push(req.files.beforeImage[0]);
  if (req.files?.afterImage?.[0]) files.push(req.files.afterImage[0]);
  return files;
};

/**
 * Clean up uploaded portfolio files.
 * Uses file.filename + known path prefix instead of multer's absolute
 * file.path, which is not compatible with deleteUploadedFile's
 * expected path format (uploads-relative or leading-slash relative).
 */
const cleanupUploadedFiles = (req) => {
  for (const file of collectUploadedFiles(req)) {
    deleteUploadedFile(`/uploads/portfolio/${file.filename}`);
  }
};

const buildPublicQuery = (barberId) => ({
  barberId: getId(barberId),
  active: true,
  isPublic: true,
  consentConfirmed: true,
});

/* ── Helper: validate serviceId belongs to barber ───── */

const validateServiceOwnership = async (serviceId, barberId) => {
  if (!serviceId) return null;

  const service = await Service.findById(serviceId).select("barberId active").lean();
  if (!service) {
    return { valid: false, message: "Service not found" };
  }
  if (String(service.barberId) !== String(barberId)) {
    return { valid: false, message: "Service does not belong to this barber" };
  }
  if (!service.active) {
    return { valid: false, message: "Service is not active" };
  }
  return { valid: true, service };
};

/* ── Helper: sanitize tags ──────────────────────────── */

const sanitizeTags = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(",").map((s) => s.trim());
  return arr
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s.length <= 50)
    .slice(0, 20);
};

/* ── 1. GET /api/portfolio/barber/:barberId ────────── */

export const getPortfolioByBarber = async (req, res) => {
  try {
    const { barberId } = req.params;
    if (!barberId) {
      return res.status(400).json({ message: "barberId is required" });
    }
    if (!isValidObjectId(barberId)) {
      return res.status(400).json({ message: "Invalid barberId" });
    }

    const photos = await PortfolioPhoto.find(buildPublicQuery(barberId))
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    return res.json(photos.map((p) => ({ ...p, id: p._id.toString() })));
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch portfolio photos" });
  }
};

/* ── 2. GET /api/portfolio/me ───────────────────────── */

export const getMyPortfolio = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can view their portfolio" });
    }

    const photos = await PortfolioPhoto.find({ barberId: req.user._id })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    return res.json(photos.map((p) => ({ ...p, id: p._id.toString() })));
  } catch (error) {
    return res.status(500).json({ message: "Could not fetch portfolio photos" });
  }
};

/* ── 3. POST /api/portfolio ─────────────────────────── */

export const addPortfolioPhoto = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can add portfolio photos" });
    }

    const beforeFile = req.files?.beforeImage?.[0];
    const afterFile = req.files?.afterImage?.[0];

    if (!beforeFile || !afterFile) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        message: "Both beforeImage and afterImage files are required",
      });
    }

    const {
      salonId,
      serviceId,
      category,
      caption,
      tags: rawTags,
      isPublic: rawIsPublic,
      consentConfirmed: rawConsentConfirmed,
    } = req.body;

    // Default isPublic to true (matches mongoose schema default) when not provided
    const isPublic =
      rawIsPublic === undefined ? true : (rawIsPublic === true || rawIsPublic === "true");
    const consentConfirmed =
      rawConsentConfirmed === true || rawConsentConfirmed === "true";

    // Enforce consent for public photos
    if (isPublic && !consentConfirmed) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        message:
          "consentConfirmed must be true when isPublic is true",
      });
    }

    const barberId = req.user._id;

    // Validate serviceId if provided
    if (serviceId) {
      if (!isValidObjectId(serviceId)) {
        cleanupUploadedFiles(req);
        return res.status(400).json({ message: "Invalid serviceId" });
      }
      const validation = await validateServiceOwnership(serviceId, barberId);
      if (validation && !validation.valid) {
        cleanupUploadedFiles(req);
        if (validation.message === "Service not found") {
          return res.status(400).json({ message: validation.message });
        }
        return res.status(403).json({ message: validation.message });
      }
    }

    // Validate salonId format if provided
    if (salonId) {
      if (!isValidObjectId(salonId)) {
        cleanupUploadedFiles(req);
        return res.status(400).json({ message: "Invalid salonId" });
      }
    }

    // sanitize salonId — only allow if user is associated with that salon
    let resolvedSalonId = null;
    if (salonId) {
      const userSalonIds = [
        ...(Array.isArray(req.user.salons)
          ? req.user.salons
              .filter((entry) => entry?.status === "approved")
              .map((entry) => String(entry.salon))
          : []),
      ];
      // Also check legacy single salon field
      if (req.user.salon && req.user.salonStatus === "approved") {
        userSalonIds.push(String(req.user.salon));
      }
      if (userSalonIds.includes(String(salonId))) {
        resolvedSalonId = salonId;
      }
      // If not associated, silently drop salonId (do not error — allow unassociated uploads)
    }

    // Auto-assign sortOrder
    const lastPhoto = await PortfolioPhoto.findOne({ barberId })
      .sort({ sortOrder: -1 })
      .select("sortOrder")
      .lean();
    const sortOrder = lastPhoto ? Number(lastPhoto.sortOrder || 0) + 1 : 0;

    const beforeUrl = `/uploads/portfolio/${beforeFile.filename}`;
    const afterUrl = `/uploads/portfolio/${afterFile.filename}`;

    const photo = await PortfolioPhoto.create({
      barberId,
      salonId: resolvedSalonId,
      serviceId: serviceId || null,
      category: String(category || "").trim(),
      caption: String(caption || "").trim(),
      tags: sanitizeTags(rawTags),
      sortOrder,
      beforeUrl,
      afterUrl,
      isPublic,
      consentConfirmed,
    });

    return res.status(201).json(formatPhoto(photo));
  } catch (error) {
    // Clean up files on any unexpected error
    cleanupUploadedFiles(req);
    return res.status(500).json({ message: "Could not add portfolio photo" });
  }
};

/* ── 4. PUT /api/portfolio/:id ──────────────────────── */

export const updatePortfolioPhoto = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can update portfolio photos" });
    }

    const { id } = req.params;
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid portfolio photo id" });
    }

    const photo = await PortfolioPhoto.findById(id);
    if (!photo) {
      return res.status(404).json({ message: "Portfolio photo not found" });
    }

    if (String(photo.barberId) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only update your own portfolio photos" });
    }

    const {
      salonId,
      serviceId,
      category,
      caption,
      tags: rawTags,
      sortOrder,
      isPublic: rawIsPublic,
      consentConfirmed: rawConsentConfirmed,
    } = req.body;

    const isPublic =
      rawIsPublic !== undefined
        ? rawIsPublic === true || rawIsPublic === "true"
        : photo.isPublic;
    const consentConfirmed =
      rawConsentConfirmed !== undefined
        ? rawConsentConfirmed === true || rawConsentConfirmed === "true"
        : photo.consentConfirmed;

    // Enforce consent for public photos
    if (isPublic && !consentConfirmed) {
      return res.status(400).json({
        message: "consentConfirmed must be true when isPublic is true",
      });
    }

    const barberId = req.user._id;

    // Validate serviceId if changed
    if (serviceId !== undefined && String(serviceId) !== String(photo.serviceId || "")) {
      if (serviceId) {
        if (!isValidObjectId(serviceId)) {
          return res.status(400).json({ message: "Invalid serviceId" });
        }
        const validation = await validateServiceOwnership(serviceId, barberId);
        if (validation && !validation.valid) {
          if (validation.message === "Service not found") {
            return res.status(400).json({ message: validation.message });
          }
          return res.status(403).json({ message: validation.message });
        }
      }
    }

    // Validate salonId format if provided
    if (salonId !== undefined && salonId) {
      if (!isValidObjectId(salonId)) {
        return res.status(400).json({ message: "Invalid salonId" });
      }
    }

    // salonId handling for update
    if (salonId !== undefined) {
      if (salonId) {
        const userSalonIds = [
          ...(Array.isArray(req.user.salons)
            ? req.user.salons
                .filter((entry) => entry?.status === "approved")
                .map((entry) => String(entry.salon))
            : []),
        ];
        if (req.user.salon && req.user.salonStatus === "approved") {
          userSalonIds.push(String(req.user.salon));
        }
        if (userSalonIds.includes(String(salonId))) {
          photo.salonId = salonId;
        } else {
          photo.salonId = null;
        }
      } else {
        photo.salonId = null;
      }
    }

    if (category !== undefined) photo.category = String(category || "").trim();
    if (caption !== undefined) photo.caption = String(caption || "").trim();
    if (rawTags !== undefined) photo.tags = sanitizeTags(rawTags);
    if (sortOrder !== undefined) photo.sortOrder = Number(sortOrder) || 0;
    if (serviceId !== undefined) photo.serviceId = serviceId || null;
    photo.isPublic = isPublic;
    photo.consentConfirmed = consentConfirmed;

    await photo.save();

    return res.json(formatPhoto(photo));
  } catch (error) {
    return res.status(500).json({ message: "Could not update portfolio photo" });
  }
};

/* ── 5. DELETE /api/portfolio/:id (soft-delete) ─────── */

export const deletePortfolioPhoto = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can delete portfolio photos" });
    }

    const { id } = req.params;
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid portfolio photo id" });
    }

    const photo = await PortfolioPhoto.findById(id);
    if (!photo) {
      return res.status(404).json({ message: "Portfolio photo not found" });
    }

    if (String(photo.barberId) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only delete your own portfolio photos" });
    }

    // Soft-delete: set active to false
    photo.active = false;
    await photo.save();

    // Note: files are intentionally NOT deleted to allow rollback/audit.
    return res.json({ message: "Portfolio photo deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Could not delete portfolio photo" });
  }
};
