import fs from "fs";
import path from "path";

import multer from "multer";

const avatarUploadDir = path.join(process.cwd(), "uploads", "avatars");
const certificationUploadDir = path.join(process.cwd(), "uploads", "certifications");
const eventUploadDir = path.join(process.cwd(), "uploads", "events");
const certificateFileUploadDir = path.join(process.cwd(), "uploads", "certificate-files");
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const allowedCertificateTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const allowedCertificateExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);


fs.mkdirSync(avatarUploadDir, { recursive: true });
fs.mkdirSync(certificationUploadDir, { recursive: true });
fs.mkdirSync(eventUploadDir, { recursive: true });
fs.mkdirSync(certificateFileUploadDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, avatarUploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

    callback(null, safeName);
  },
});

const certificationStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, certificationUploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `cert-${Date.now()}${extension}`;

    callback(null, safeName);
  },
});

const eventImageStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, eventUploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `event-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

    callback(null, safeName);
  },
});

const certificateFileStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, certificateFileUploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `certfile-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

    callback(null, safeName);
  },
});

const imageFileFilter = (_req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedImageTypes.has(file.mimetype) || !allowedImageExtensions.has(extension)) {
    callback(new Error("Image must be a JPEG, PNG, or WEBP image"));
    return;
  }

  callback(null, true);
};

const certificateFileFilter = (_req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedCertificateTypes.has(file.mimetype) || !allowedCertificateExtensions.has(extension)) {
    callback(new Error("Certificate file must be a PDF, JPEG, PNG, or WEBP"));
    return;
  }

  callback(null, true);
};


export const uploadCertificateFile = multer({
  storage: certificateFileStorage,
  fileFilter: certificateFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export const uploadCertificationImage = multer({
  storage: certificationStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export const uploadEventImage = multer({
  storage: eventImageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export const handleAvatarUpload = (req, res, next) => {
  uploadAvatar.single("avatar")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    res.status(400).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Avatar image must be 5MB or smaller"
          : error.message || "Could not upload avatar",
    });
  });
};

export const handleCertificationImageUpload = (req, res, next) => {
  uploadCertificationImage.single("certificateImage")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    res.status(400).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Certificate image must be 5MB or smaller"
          : error.message || "Could not upload certificate image",
    });
  });
};

export const handleEventImageUpload = (req, res, next) => {
  uploadEventImage.single("eventImage")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    res.status(400).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Event image must be 5MB or smaller"
          : error.message || "Could not upload event image",
    });
  });
};

export const handleCertificateFileUpload = (req, res, next) => {
  uploadCertificateFile.single("certificateFile")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    res.status(400).json({
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Certificate file must be 10MB or smaller"
          : error.message || "Could not upload certificate file",
    });
  });
};

const isPathInsideUploads = (absolutePath) => {
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const relativeToUploads = path.relative(uploadsRoot, absolutePath);

  return (
    relativeToUploads &&
    !relativeToUploads.startsWith("..") &&
    !path.isAbsolute(relativeToUploads)
  );
};

export const deleteUploadedFile = (filePath) => {
  if (!filePath) return;

  const normalizedFilePath = filePath.replace(/^\/+/, "");
  const absolutePath = path.resolve(process.cwd(), normalizedFilePath);

  if (!isPathInsideUploads(absolutePath)) return;


  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch {
    // Silently fail if file doesn't exist
  }
};

