import BarberProfile from "../../models/BarberProfile.js";
import EventCertificate from "../../models/EventCertificate.js";
import { deleteUploadedFile } from "../../middleware/uploadMiddleware.js";
import { sendControllerError } from "../../utils/controllerError.js";
import {
  getPublicEventCertificatePayload,
  getUploadedCertImagePath,
  normalizeCertifications,
  parseCertificationDate,
  isFutureDate,
} from "../../utils/barberProfileUtils.js";
import {
  BarberProfileConflictError,
  isBarberProfileDuplicateConflict,
} from "../../utils/barberProfileDuplicateConflict.js";

// --- Certification CRUD ---

export const getCertifications = async (req, res) => {
  try {
    const profile = await BarberProfile.findOne({
      barberId: req.params.barberId,
    });

    const { certifications, changed } = normalizeCertifications(profile);

    if (profile && changed) {
      await profile.save();
    }

    return res.json(certifications);
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch certifications");
  }
};

export const getEventCertificates = async (req, res) => {
  try {
    const certificates = await EventCertificate.find({
      userId: req.params.barberId,
      status: "issued",
    })
      .select("certificateId eventTitle organizerName salonName eventDate issuedAt status revokedAt certificateType fileUrl fileType originalFileName")
      .sort({ issuedAt: -1 })
      .lean();

    return res.json(certificates.map(getPublicEventCertificatePayload));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch event certificates");
  }
};

export const addCertification = async (req, res) => {
  try {
    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Only barbers can manage certifications" });
    }

    const { title, issuedBy, issueDate, expiryDate, description } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!issuedBy || !issuedBy.trim()) {
      return res.status(400).json({ message: "Issued by is required" });
    }

    if (!issueDate) {
      return res.status(400).json({ message: "Issue date is required" });
    }

    const parsedIssueDate = parseCertificationDate(issueDate, "Issue date");

    if (parsedIssueDate.error) {
      return res.status(400).json({ message: parsedIssueDate.error });
    }

    const issueDateObj = parsedIssueDate.value;

    if (isFutureDate(issueDateObj)) {
      return res.status(400).json({ message: "Issue date cannot be in the future" });
    }

    let expiryDateObj = null;

    if (expiryDate) {
      const parsedExpiryDate = parseCertificationDate(expiryDate, "Expiry date");

      if (parsedExpiryDate.error) {
        return res.status(400).json({ message: parsedExpiryDate.error });
      }

      expiryDateObj = parsedExpiryDate.value;

      if (expiryDateObj <= issueDateObj) {
        return res.status(400).json({ message: "Expiry date must be after issue date" });
      }
    }

    const imageUrl = getUploadedCertImagePath(req.file);

    let profile = await BarberProfile.findOne({ barberId: req.user._id });
    const certification = {
      title: title.trim(),
      issuedBy: issuedBy.trim(),
      issueDate: issueDateObj,
      expiryDate: expiryDateObj,
      imageUrl,
      description: description?.trim() || "",
    };

    if (!profile) {
      try {
        const newProfile = await BarberProfile.create({
          barberId: req.user._id,
          certifications: [certification],
        });

        return res.status(201).json(
          newProfile.certifications[newProfile.certifications.length - 1]
        );
      } catch (error) {
        if (!isBarberProfileDuplicateConflict(error)) throw error;

        profile = await BarberProfile.findOne({ barberId: req.user._id });
        if (!profile) throw new BarberProfileConflictError();
      }
    }

    normalizeCertifications(profile);

    profile.certifications.push(certification);

    await profile.save();

    return res.status(201).json(
      profile.certifications[profile.certifications.length - 1]
    );
  } catch (error) {
    if (error instanceof BarberProfileConflictError) {
      return res.status(409).json({
        code: "BARBER_PROFILE_CONFLICT",
        message: "Could not save barber profile",
      });
    }

    return res.status(500).json({ message: "Could not add certification" });
  }
};

export const updateCertification = async (req, res) => {
  try {
    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Only barbers can manage certifications" });
    }

    const { certId } = req.params;
    const { title, issuedBy, issueDate, expiryDate, description } = req.body;

    const profile = await BarberProfile.findOne({ barberId: req.user._id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    normalizeCertifications(profile);

    const cert = profile.certifications.id(certId);

    if (!cert) {
      return res.status(404).json({ message: "Certification not found" });
    }

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ message: "Title cannot be empty" });
      }
      cert.title = title.trim();
    }

    if (issuedBy !== undefined) {
      if (!issuedBy.trim()) {
        return res.status(400).json({ message: "Issued by cannot be empty" });
      }
      cert.issuedBy = issuedBy.trim();
    }

    let nextIssueDate = cert.issueDate;
    let nextExpiryDate = cert.expiryDate || null;

    if (issueDate !== undefined) {
      const parsedIssueDate = parseCertificationDate(issueDate, "Issue date");

      if (parsedIssueDate.error) {
        return res.status(400).json({ message: parsedIssueDate.error });
      }

      if (isFutureDate(parsedIssueDate.value)) {
        return res.status(400).json({ message: "Issue date cannot be in the future" });
      }

      nextIssueDate = parsedIssueDate.value;
    }

    if (expiryDate !== undefined) {
      if (expiryDate) {
        const parsedExpiryDate = parseCertificationDate(expiryDate, "Expiry date");

        if (parsedExpiryDate.error) {
          return res.status(400).json({ message: parsedExpiryDate.error });
        }

        nextExpiryDate = parsedExpiryDate.value;
      } else {
        nextExpiryDate = null;
      }
    }

    if (nextExpiryDate && nextExpiryDate <= nextIssueDate) {
      return res.status(400).json({ message: "Expiry date must be after issue date" });
    }

    if (issueDate !== undefined) {
      cert.issueDate = nextIssueDate;
    }

    if (expiryDate !== undefined) {
      cert.expiryDate = nextExpiryDate;
    }

    if (description !== undefined) {
      cert.description = description?.trim() || "";
    }

    // Handle image upload - replace old image if new one uploaded
    if (req.file) {
      // Delete old image file if exists
      if (cert.imageUrl) {
        deleteUploadedFile(cert.imageUrl);
      }
      cert.imageUrl = getUploadedCertImagePath(req.file);
    }

    await profile.save();

    return res.json(cert);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update certification",
    });
  }
};

export const deleteCertification = async (req, res) => {
  try {
    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Only barbers can manage certifications" });
    }

    const { certId } = req.params;

    const profile = await BarberProfile.findOne({ barberId: req.user._id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    normalizeCertifications(profile);

    const cert = profile.certifications.id(certId);

    if (!cert) {
      return res.status(404).json({ message: "Certification not found" });
    }

    // Delete associated image file
    if (cert.imageUrl) {
      deleteUploadedFile(cert.imageUrl);
    }

    profile.certifications.pull(certId);
    await profile.save();

    return res.json({ message: "Certification deleted" });
  } catch (error) {
    return sendControllerError(res, error, "Could not delete certification");
  }
};
