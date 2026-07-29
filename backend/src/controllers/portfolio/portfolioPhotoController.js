import mongoose from "mongoose";

import PortfolioPhoto from "../../models/PortfolioPhoto.js";
import Service from "../../models/Service.js";
import { deleteUploadedFile } from "../../middleware/uploadMiddleware.js";
import {
  createPortfolioPhotoWithMedia,
  deletePortfolioPhotoWithMedia,
  hasBoundPortfolioMedia,
} from "../../services/portfolio/portfolioMediaService.js";
import { isMediaStoreError } from "../../services/media/mediaStore.js";

const isBarber = (user) => user?.role === "barber";
const getId = (doc) => doc?._id ?? doc?.id ?? doc;
const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id);

const sanitizePortfolioPhoto = (photo) => {
  const value = typeof photo?.toObject === "function" ? photo.toObject() : { ...photo };
  delete value.beforeMediaObjectId;
  delete value.afterMediaObjectId;
  value.id = String(value._id ?? value.id);
  return value;
};

const collectUploadedFiles = (req) => {
  const files = [];
  if (req.files?.beforeImage?.[0]) files.push(req.files.beforeImage[0]);
  if (req.files?.afterImage?.[0]) files.push(req.files.afterImage[0]);
  return files;
};

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
  return { valid: true };
};

const sanitizeTags = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(",").map((tag) => tag.trim());
  return arr
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0 && tag.length <= 50)
    .slice(0, 20);
};

const resolveApprovedSalonId = (user, salonId) => {
  if (!salonId) return null;

  const approvedSalonIds = [
    ...(Array.isArray(user?.salons)
      ? user.salons
          .filter((entry) => entry?.status === "approved")
          .map((entry) => String(entry.salon))
      : []),
  ];
  if (user?.salon && user?.salonStatus === "approved") {
    approvedSalonIds.push(String(user.salon));
  }
  return approvedSalonIds.includes(String(salonId)) ? salonId : null;
};

const normalizeVisibility = ({ isPublic, consentConfirmed }, defaults = {}) => ({
  isPublic:
    isPublic === undefined
      ? defaults.isPublic ?? true
      : isPublic === true || isPublic === "true",
  consentConfirmed:
    consentConfirmed === undefined
      ? defaults.consentConfirmed ?? false
      : consentConfirmed === true || consentConfirmed === "true",
});

const respondMediaError = (res, error, fallbackMessage) => {
  if (error?.transactionRequired) {
    return res.status(error.statusCode || 503).json({ message: error.message });
  }
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400) {
    return res.status(error.statusCode).json({ message: error.message || fallbackMessage });
  }
  if (isMediaStoreError(error)) {
    return res
      .status(error.status || 503)
      .json({ message: error.message || fallbackMessage });
  }
  return res.status(500).json({ message: fallbackMessage });
};

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

    return res.json(photos.map((photo) => sanitizePortfolioPhoto(photo)));
  } catch {
    return res.status(500).json({ message: "Could not fetch portfolio photos" });
  }
};

export const getMyPortfolio = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can view their portfolio" });
    }

    const photos = await PortfolioPhoto.find({ barberId: req.user._id })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    return res.json(photos.map((photo) => sanitizePortfolioPhoto(photo)));
  } catch {
    return res.status(500).json({ message: "Could not fetch portfolio photos" });
  }
};

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
    const visibility = normalizeVisibility({
      isPublic: rawIsPublic,
      consentConfirmed: rawConsentConfirmed,
    });
    if (visibility.isPublic && !visibility.consentConfirmed) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        message: "consentConfirmed must be true when isPublic is true",
      });
    }

    const barberId = req.user._id;
    if (serviceId) {
      if (!isValidObjectId(serviceId)) {
        cleanupUploadedFiles(req);
        return res.status(400).json({ message: "Invalid serviceId" });
      }
      const validation = await validateServiceOwnership(serviceId, barberId);
      if (validation && !validation.valid) {
        cleanupUploadedFiles(req);
        return res
          .status(validation.message === "Service not found" ? 400 : 403)
          .json({ message: validation.message });
      }
    }
    if (salonId && !isValidObjectId(salonId)) {
      cleanupUploadedFiles(req);
      return res.status(400).json({ message: "Invalid salonId" });
    }

    const lastPhoto = await PortfolioPhoto.findOne({ barberId })
      .sort({ sortOrder: -1 })
      .select("sortOrder")
      .lean();
    const sortOrder = lastPhoto ? Number(lastPhoto.sortOrder || 0) + 1 : 0;
    const photoId = new mongoose.Types.ObjectId();
    const payload = {
      _id: photoId,
      barberId,
      salonId: resolveApprovedSalonId(req.user, salonId),
      serviceId: serviceId || null,
      category: String(category || "").trim(),
      caption: String(caption || "").trim(),
      tags: sanitizeTags(rawTags),
      sortOrder,
      beforeUrl: `/uploads/portfolio/${beforeFile.filename}`,
      afterUrl: `/uploads/portfolio/${afterFile.filename}`,
      isPublic: visibility.isPublic,
      consentConfirmed: visibility.consentConfirmed,
    };

    let photo;
    try {
      photo = await createPortfolioPhotoWithMedia({
        payload,
        filesByKind: {
          before: beforeFile,
          after: afterFile,
        },
      });
    } catch (error) {
      return respondMediaError(res, error, "Could not add portfolio photo");
    } finally {
      cleanupUploadedFiles(req);
    }

    return res.status(201).json(sanitizePortfolioPhoto(photo));
  } catch {
    cleanupUploadedFiles(req);
    return res.status(500).json({ message: "Could not add portfolio photo" });
  }
};

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
    const visibility = normalizeVisibility(
      {
        isPublic: rawIsPublic,
        consentConfirmed: rawConsentConfirmed,
      },
      {
        isPublic: photo.isPublic,
        consentConfirmed: photo.consentConfirmed,
      }
    );
    if (visibility.isPublic && !visibility.consentConfirmed) {
      return res.status(400).json({
        message: "consentConfirmed must be true when isPublic is true",
      });
    }

    if (serviceId !== undefined && String(serviceId) !== String(photo.serviceId || "")) {
      if (serviceId) {
        if (!isValidObjectId(serviceId)) {
          return res.status(400).json({ message: "Invalid serviceId" });
        }
        const validation = await validateServiceOwnership(serviceId, req.user._id);
        if (validation && !validation.valid) {
          return res
            .status(validation.message === "Service not found" ? 400 : 403)
            .json({ message: validation.message });
        }
      }
    }
    if (salonId !== undefined && salonId && !isValidObjectId(salonId)) {
      return res.status(400).json({ message: "Invalid salonId" });
    }

    if (salonId !== undefined) {
      photo.salonId = resolveApprovedSalonId(req.user, salonId);
    }
    if (category !== undefined) photo.category = String(category || "").trim();
    if (caption !== undefined) photo.caption = String(caption || "").trim();
    if (rawTags !== undefined) photo.tags = sanitizeTags(rawTags);
    if (sortOrder !== undefined) photo.sortOrder = Number(sortOrder) || 0;
    if (serviceId !== undefined) photo.serviceId = serviceId || null;
    photo.isPublic = visibility.isPublic;
    photo.consentConfirmed = visibility.consentConfirmed;

    await photo.save();
    return res.json(sanitizePortfolioPhoto(photo));
  } catch {
    return res.status(500).json({ message: "Could not update portfolio photo" });
  }
};

export const deletePortfolioPhoto = async (req, res) => {
  try {
    if (!isBarber(req.user)) {
      return res.status(403).json({ message: "Only barbers can delete portfolio photos" });
    }

    const { id } = req.params;
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid portfolio photo id" });
    }

    const photo = await PortfolioPhoto.findById(id).select(
      "+beforeMediaObjectId +afterMediaObjectId"
    );
    if (!photo) {
      return res.status(404).json({ message: "Portfolio photo not found" });
    }
    if (String(photo.barberId) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only delete your own portfolio photos" });
    }
    if (photo.active === false) {
      return res.json({ message: "Portfolio photo deleted" });
    }

    if (!hasBoundPortfolioMedia(photo, "before") && !hasBoundPortfolioMedia(photo, "after")) {
      photo.active = false;
      await photo.save();
      return res.json({ message: "Portfolio photo deleted" });
    }

    try {
      await deletePortfolioPhotoWithMedia({ photo });
    } catch (error) {
      return respondMediaError(res, error, "Could not delete portfolio photo");
    }

    return res.json({ message: "Portfolio photo deleted" });
  } catch {
    return res.status(500).json({ message: "Could not delete portfolio photo" });
  }
};
