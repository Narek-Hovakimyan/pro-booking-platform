import path from "path";

import mongoose from "mongoose";

import PortfolioPhoto from "../../models/PortfolioPhoto.js";

const portfolioUploadsDir = path.resolve(process.cwd(), "uploads", "portfolio");
const portfolioUrlPrefix = "/uploads/portfolio/";
const imageFields = {
  before: "beforeUrl",
  after: "afterUrl",
};

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

  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return absolutePath;
};

const filenameToPortfolioUrl = (filename) => `${portfolioUrlPrefix}${filename}`;

const getFilenameFromPortfolioUrl = (url) => {
  if (typeof url !== "string" || !url.startsWith(portfolioUrlPrefix)) {
    return null;
  }

  const filename = url.slice(portfolioUrlPrefix.length);
  return isSafePortfolioFilename(filename) ? filename : null;
};

const sendPortfolioFile = (res, absolutePath) =>
  res.sendFile(absolutePath, (error) => {
    if (!error) return;
    if (res.headersSent) return;

    if (error.code === "ENOENT") {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    return res.status(500).json({ message: "Could not serve portfolio image" });
  });

export const servePublicPortfolioImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const absolutePath = getSafePortfolioPath(filename);

    if (!absolutePath) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    const imageUrl = filenameToPortfolioUrl(filename);
    const photo = await PortfolioPhoto.findOne({
      active: true,
      isPublic: true,
      consentConfirmed: true,
      $or: [{ beforeUrl: imageUrl }, { afterUrl: imageUrl }],
    })
      .select("_id")
      .lean();

    if (!photo) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    return sendPortfolioFile(res, absolutePath);
  } catch {
    return res.status(500).json({ message: "Could not serve portfolio image" });
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

    const photo = await PortfolioPhoto.findById(id);

    if (!photo || photo.active === false) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    if (String(photo.barberId) !== String(req.user?._id)) {
      return res.status(403).json({ message: "Not authorized to view this image" });
    }

    const filename = getFilenameFromPortfolioUrl(photo[imageField]);
    const absolutePath = getSafePortfolioPath(filename);

    if (!absolutePath) {
      return res.status(404).json({ message: "Portfolio image not found" });
    }

    return sendPortfolioFile(res, absolutePath);
  } catch {
    return res.status(500).json({ message: "Could not serve portfolio image" });
  }
};
