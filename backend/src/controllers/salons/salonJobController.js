import Salon from "../../models/Salon.js";
import SalonJobPost from "../../models/SalonJobPost.js";
import { canUserManageSalon } from "../../services/salon/salonMembershipService.js";
import {
  pickSalonJobFields,
  serializeSalonJob,
} from "../../utils/salonJobUtils.js";
import { escapeRegex, normalizeSearch, sendControllerError } from "../../utils/controllerError.js";

const salonJobPopulate = "name city address imageUrl";

const getUserId = (user) => String(user?._id || user?.id || "");

const populateSalon = (query) => query.populate("salonId", salonJobPopulate);

const loadJobWithSalon = async (id, extraFilter = {}) =>
  populateSalon(SalonJobPost.findOne({ _id: id, ...extraFilter }));

const requireManageSalon = async (req, res, salonId) => {
  const salon = await Salon.findById(salonId);

  if (!salon) {
    res.status(404).json({ message: "Salon not found" });
    return null;
  }

  if (!canUserManageSalon(req.user, salon)) {
    res.status(403).json({ message: "Not allowed to manage jobs for this salon" });
    return null;
  }

  return salon;
};

const requireManageJob = async (req, res, jobId) => {
  const job = await SalonJobPost.findById(jobId);

  if (!job) {
    res.status(404).json({ message: "Job post not found" });
    return null;
  }

  const salon = await requireManageSalon(req, res, job.salonId);
  if (!salon) return null;

  return job;
};

export const createSalonJob = async (req, res) => {
  try {
    const salonId = req.body?.salonId;

    if (!salonId) {
      return res.status(400).json({ message: "salonId is required" });
    }

    const salon = await requireManageSalon(req, res, salonId);
    if (!salon) return undefined;

    const payload = {
      ...pickSalonJobFields(req.body),
      salonId,
      createdBy: getUserId(req.user),
      status: "active",
    };

    const job = await SalonJobPost.create(payload);
    job.salonId = salon;

    return res.status(201).json(serializeSalonJob(job));
  } catch (error) {
    return sendControllerError(res, error, "Could not create salon job post");
  }
};

export const listSalonJobs = async (req, res) => {
  try {
    const filter = { status: "active" };

    if (req.query.role) filter.role = req.query.role;
    if (req.query.salonId) filter.salonId = req.query.salonId;

    let query = filter;
    const rawCity = req.query.city;
    if (rawCity) {
      const { term, isTooLong } = normalizeSearch(rawCity);
      if (isTooLong) {
        return res.status(400).json({ message: "Search term is too long" });
      }
      if (!term) {
        // empty/whitespace-only — skip city filter
      } else {
        const salons = await Salon.find({
          city: { $regex: escapeRegex(term), $options: "i" },
        }).select("_id");
        const citySalonIds = salons.map((salon) => salon._id);

        query = {
          ...filter,
          salonId: filter.salonId
            ? { $in: citySalonIds.filter((id) => String(id) === String(filter.salonId)) }
            : { $in: citySalonIds },
        };
      }
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const jobs = await populateSalon(SalonJobPost.find(query))
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json(jobs.map(serializeSalonJob));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch salon job posts");
  }
};

export const listMySalonJobs = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    const salons = await Salon.find({
      $or: [{ ownerId: userId }, { admins: userId }],
    }).select("_id");
    const salonIds = salons.map((salon) => salon._id);
    const jobs = await populateSalon(SalonJobPost.find({ salonId: { $in: salonIds } }))
      .sort({ createdAt: -1 });

    return res.json(jobs.map(serializeSalonJob));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch your salon job posts");
  }
};

export const getSalonJobById = async (req, res) => {
  try {
    const job = await loadJobWithSalon(req.params.id, { status: "active" });

    if (!job) {
      return res.status(404).json({ message: "Job post not found" });
    }

    return res.json(serializeSalonJob(job));
  } catch (error) {
    return sendControllerError(res, error, "Could not fetch salon job post");
  }
};

export const updateSalonJob = async (req, res) => {
  try {
    const job = await requireManageJob(req, res, req.params.id);
    if (!job) return undefined;

    Object.assign(job, pickSalonJobFields(req.body));
    await job.save();

    const populatedJob = await loadJobWithSalon(job._id);
    return res.json(serializeSalonJob(populatedJob || job));
  } catch (error) {
    return sendControllerError(res, error, "Could not update salon job post");
  }
};

export const closeSalonJob = async (req, res) => {
  try {
    const job = await requireManageJob(req, res, req.params.id);
    if (!job) return undefined;

    job.status = "closed";
    await job.save();

    const populatedJob = await loadJobWithSalon(job._id);
    return res.json(serializeSalonJob(populatedJob || job));
  } catch (error) {
    return sendControllerError(res, error, "Could not close salon job post");
  }
};
