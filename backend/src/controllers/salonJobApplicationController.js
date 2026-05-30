import Salon from "../models/Salon.js";
import SalonJobPost from "../models/SalonJobPost.js";
import SalonJobApplication from "../models/SalonJobApplication.js";
import { canUserManageSalon } from "../services/salon/salonMembershipService.js";
import { serializeApplication } from "../utils/salonJobApplicationUtils.js";
import { createNotification } from "./notificationController.js";
import { sendControllerError } from "../utils/controllerError.js";

const getUserId = (user) => String(user?._id || user?.id || "");
const getId = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const userFields = "name phone avatarUrl city";

const applyApplicantPopulate = (query) =>
  query
    .populate("applicantId", userFields)
    .populate("salonId", "name city address imageUrl")
    .populate("jobId", "title role employmentType status");

const applicationStatusMessages = {
  reviewed: "Your job application was reviewed.",
  accepted: "Your job application was accepted.",
  rejected: "Your job application was rejected.",
  pending: "Your job application status was updated.",
};

const getJobApplicationNotificationData = (application, job = null) => {
  const data = {};
  const jobApplicationId = getId(application);
  const jobId = getId(application?.jobId) || getId(job);
  const salonId = getId(application?.salonId) || getId(job?.salonId);

  if (jobApplicationId) data.jobApplicationId = jobApplicationId;
  if (jobId) data.jobId = jobId;
  if (salonId) data.salonId = salonId;

  return Object.keys(data).length > 0 ? data : undefined;
};

const notifyApplicationStatusChange = async (application, status) => {
  try {
    await createNotification({
      userId: application.applicantId,
      type: "salon_job_application_status",
      message: applicationStatusMessages[status],
      data: getJobApplicationNotificationData(application),
    });
  } catch (error) {
    console.warn(
      "Salon job application notification failed (non-fatal):",
      error.message
    );
  }
};

const notifyApplicationSubmitted = async ({ application, job, applicant }) => {
  try {
    const salon = await Salon.findById(job.salonId);
    const applicantId = getId(application.applicantId);
    const recipientIds = new Set();

    [salon?.ownerId, ...(salon?.admins || []), job.createdBy].forEach((userId) => {
      const recipientId = getId(userId);

      if (recipientId && recipientId !== applicantId) {
        recipientIds.add(recipientId);
      }
    });

    const data = getJobApplicationNotificationData(application, job);
    const applicantName = applicant?.name || "A specialist";
    const jobTitle = job.title || "a salon job";
    const message = `${applicantName} applied to ${jobTitle}`;

    await Promise.all(
      [...recipientIds].map((userId) =>
        createNotification({
          userId,
          type: "salon_job_application_submitted",
          message,
          data,
        })
      )
    );
  } catch (error) {
    console.warn(
      "Salon job application submitted notification failed (non-fatal):",
      error.message
    );
  }
};

/* ── Helpers ── */

const requireManagementRole = (req, res) => {
  if (req.user?.role !== "barber") {
    res.status(403).json({ message: "Not allowed to manage this salon" });
    return false;
  }

  return true;
};

const requireManageSalon = async (req, res, salonId) => {
  if (!requireManagementRole(req, res)) return null;

  const salon = await Salon.findById(salonId);

  if (!salon) {
    res.status(404).json({ message: "Salon not found" });
    return null;
  }

  if (!canUserManageSalon(req.user, salon)) {
    res.status(403).json({ message: "Not allowed to manage this salon" });
    return null;
  }

  return salon;
};

const requireManageApplicationSalon = async (req, res, applicationId) => {
  const application = await SalonJobApplication.findById(applicationId);

  if (!application) {
    res.status(404).json({ message: "Application not found" });
    return null;
  }

  const salon = await requireManageSalon(req, res, application.salonId);
  if (!salon) return null;

  return application;
};

/* ── Apply ── */

export const applyToSalonJob = async (req, res) => {
  try {
    if (req.user.role !== "barber") {
      return res.status(403).json({
        message: "Only professionals can apply to jobs",
      });
    }

    const job = await SalonJobPost.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: "Job post not found" });
    }

    if (job.status !== "active") {
      return res.status(400).json({
        message: "This job post is no longer accepting applications",
      });
    }

    const applicantId = getUserId(req.user);
    const { message, experience, contactInfo } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Check duplicate application before attempting create
    const existing = await SalonJobApplication.findOne({
      jobId: job._id,
      applicantId,
    });

    if (existing) {
      return res.status(409).json({
        message: "You already applied to this job",
      });
    }

    const application = await SalonJobApplication.create({
      jobId: job._id,
      salonId: job.salonId,
      applicantId,
      message: message.trim(),
      experience: (experience || "").trim(),
      contactInfo: (contactInfo || "").trim() || req.user.phone || "",
    });

    await notifyApplicationSubmitted({
      application,
      job,
      applicant: req.user,
    });

    const populated = await applyApplicantPopulate(
      SalonJobApplication.findById(application._id)
    );

    return res.status(201).json(serializeApplication(populated));
  } catch (error) {
    // Handle duplicate key race condition
    if (error.code === 11000) {
      return res.status(409).json({
        message: "You already applied to this job",
      });
    }

    return sendControllerError(res, error, "Could not submit application");
  }
};

/* ── List applications for a specific job (owner/admin only) ── */

export const listJobApplications = async (req, res) => {
  try {
    const job = await SalonJobPost.findById(req.params.id);

    if (!job) {
      return res.status(404).json({ message: "Job post not found" });
    }

    const salon = await requireManageSalon(req, res, job.salonId);
    if (!salon) return undefined;

    const applications = await applyApplicantPopulate(
      SalonJobApplication.find({ jobId: job._id })
    )
      .sort({ createdAt: -1 });

    return res.json(applications.map(serializeApplication));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch applications");
  }
};

/* ── List own submissions (barber) ── */

export const listMySalonJobApplications = async (req, res) => {
  try {
    if (req.user.role !== "barber") {
      return res.status(403).json({
        message: "Only professionals can view their applications",
      });
    }

    const applications = await applyApplicantPopulate(
      SalonJobApplication.find({ applicantId: getUserId(req.user) })
    )
      .sort({ createdAt: -1 });

    return res.json(applications.map(serializeApplication));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch your applications");
  }
};

/* ── List managed applications (owner/admin for any of their salons) ── */

export const listManagedSalonJobApplications = async (req, res) => {
  try {
    if (!requireManagementRole(req, res)) return undefined;

    const userId = getUserId(req.user);
    const salons = await Salon.find({
      $or: [{ ownerId: userId }, { admins: userId }],
    }).select("_id");

    const salonIds = salons.map((salon) => salon._id);

    if (salonIds.length === 0) {
      return res.json([]);
    }

    const applications = await applyApplicantPopulate(
      SalonJobApplication.find({ salonId: { $in: salonIds } })
    )
      .sort({ createdAt: -1 });

    return res.json(applications.map(serializeApplication));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch managed applications");
  }
};

/* ── Update application status (owner/admin only) ── */

export const updateSalonJobApplicationStatus = async (req, res) => {
  try {
    const application = await requireManageApplicationSalon(
      req,
      res,
      req.params.applicationId
    );

    if (!application) return undefined;

    const { status } = req.body;

    const validStatuses = ["pending", "reviewed", "accepted", "rejected"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const previousStatus = application.status;

    application.status = status;
    application.statusUpdatedBy = getUserId(req.user);

    // Set the matching timestamp without clearing older ones
    const now = new Date();

    if (status === "reviewed") application.reviewedAt = now;
    if (status === "accepted") application.acceptedAt = now;
    if (status === "rejected") application.rejectedAt = now;

    await application.save();

    if (previousStatus !== status) {
      await notifyApplicationStatusChange(application, status);
    }

    const populated = await applyApplicantPopulate(
      SalonJobApplication.findById(application._id)
    );

    return res.json(serializeApplication(populated));
  } catch (error) {
    return sendControllerError(res, error, "Could not update application status");
  }
};
