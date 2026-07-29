import path from "path";
import { pipeline } from "stream/promises";

import mongoose from "mongoose";

import {
  hasBoundPortfolioMedia,
  openPortfolioPhotoMedia,
} from "../../services/portfolio/portfolioMediaService.js";
import PortfolioPhoto from "../../models/PortfolioPhoto.js";

const portfolioUploadsDir = path.resolve(process.cwd(), "uploads", "portfolio");
const portfolioUrlPrefix = "/uploads/portfolio/";
const imageFields = Object.freeze({
  before: "beforeUrl",
  after: "afterUrl",
});
const hasAnyBoundPortfolioMedia = (photo) =>
  hasBoundPortfolioMedia(photo, "before") || hasBoundPortfolioMedia(photo, "after");

const isSafePortfolioFilename = (filename) =>
  typeof filename === "string" &&
  filename.length <= 255 &&
  filename === path.basename(filename) &&
  !filename.includes("..") &&
  !filename.includes("/") &&
  !filename.includes("\\") &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(filename);

const getSafePortfolioPath = (filename) => {
  if (!isSafePortfolioFilename(filename)) return null;

  const absolutePath = path.resolve(portfolioUploadsDir, filename);
  const relativePath = path.relative(portfolioUploadsDir, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  return absolutePath;
};

const getFilenameFromPortfolioUrl = (url) => {
  if (typeof url !== "string" || !url.startsWith(portfolioUrlPrefix)) return null;
  const filename = url.slice(portfolioUrlPrefix.length);
  return isSafePortfolioFilename(filename) ? filename : null;
};

const applyMediaHeaders = (res, contentType) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", "inline");
  if (contentType) res.type(contentType);
};

const sendPortfolioFile = (res, absolutePath) => {
  applyMediaHeaders(res);
  return res.sendFile(absolutePath, (error) => {
    if (!error || res.headersSent) return;
    if (error.code === "ENOENT") {
      return res.status(404).json({ message: "Portfolio image not found" });
    }
    return res.status(500).json({ message: "Could not serve portfolio image" });
  });
};

const streamPortfolioMedia = async (res, media) => {
  applyMediaHeaders(res, media.contentType);
  await pipeline(media.stream, res);
};

const findPublicPortfolioPhoto = async (filename) => {
  for (const kind of Object.keys(imageFields)) {
    const photo = await PortfolioPhoto.findOne({
      active: true,
      isPublic: true,
      consentConfirmed: true,
      [imageFields[kind]]: `/uploads/portfolio/${filename}`,
    })
      .select("+beforeMediaObjectId +afterMediaObjectId")
      .lean();
    if (photo) return { kind, photo };
  }
  return null;
};

export const servePublicPortfolioImage = async (req, res) => {
  try {
    const { filename } = req.params;
    if (!isSafePortfolioFilename(filename)) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    const resolved = await findPublicPortfolioPhoto(filename);
    if (!resolved?.photo) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    const { kind, photo } = resolved;
    if (!hasAnyBoundPortfolioMedia(photo)) {
      const absolutePath = getSafePortfolioPath(filename);
      if (!absolutePath) {
        return res.status(404).json({ message: "Portfolio image not found" });
      }
      return sendPortfolioFile(res, absolutePath);
    }

    const media = await openPortfolioPhotoMedia({ photo, kind });
    if (!media) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    await streamPortfolioMedia(res, media);
    return res;
  } catch {
    if (!res.headersSent) {
      return res.status(500).json({ message: "Could not serve portfolio image" });
    }
    return res;
  }
};

export const serveOwnerPortfolioImage = async (req, res) => {
  try {
    const { id, kind } = req.params;
    const imageField = imageFields[kind];

    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Not authorized to view this image" });
    }
    if (!imageField || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    const photo = await PortfolioPhoto.findById(id).select(
      "+beforeMediaObjectId +afterMediaObjectId"
    );
    if (!photo || photo.active === false) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }
    if (String(photo.barberId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not authorized to view this image" });
    }

    const filename = getFilenameFromPortfolioUrl(photo[imageField]);
    if (!hasAnyBoundPortfolioMedia(photo)) {
      const absolutePath = getSafePortfolioPath(filename);
      if (!absolutePath) {
        return res.status(404).json({ message: "Portfolio image not found" });
      }
      return sendPortfolioFile(res, absolutePath);
    }

    const media = await openPortfolioPhotoMedia({ photo, kind });
    if (!media) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    await streamPortfolioMedia(res, media);
    return res;
  } catch {
    if (!res.headersSent) {
      return res.status(500).json({ message: "Could not serve portfolio image" });
    }
    return res;
  }
};
