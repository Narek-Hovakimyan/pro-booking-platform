export const APPLICATION_STATUSES = [
  "pending",
  "reviewed",
  "accepted",
  "rejected",
];

export const JOB_ONBOARDING_MAPPING_VERSION = 1;

const specialistRoles = new Set([
  "barber",
  "hairdresser",
  "nail-artist",
  "makeup-artist",
]);

const staffEmploymentTypes = new Set([
  "full-time",
  "part-time",
  "contract",
  "commission",
]);

export const getJobOnboardingMapping = ({ role, employmentType } = {}) => {
  if (specialistRoles.has(role) && staffEmploymentTypes.has(employmentType)) {
    return {
      relationshipType: "staff",
      relationshipStatus: "accepted",
      worksAsSpecialist: true,
    };
  }

  if (role === "receptionist" && staffEmploymentTypes.has(employmentType)) {
    return {
      relationshipType: "staff",
      relationshipStatus: "accepted",
      worksAsSpecialist: false,
    };
  }

  if (specialistRoles.has(role) && employmentType === "rent-chair") {
    return {
      relationshipType: "chair_renter",
      relationshipStatus: "accepted",
      worksAsSpecialist: true,
    };
  }

  return null;
};

export const buildJobOnboardingOffer = (job, offeredAt = new Date()) => {
  const mapping = getJobOnboardingMapping(job);
  if (!mapping || !job?._id || !job?.salonId) return null;

  return {
    salonId: job.salonId,
    jobPostId: job._id,
    role: job.role,
    employmentType: job.employmentType,
    ...mapping,
    mappingVersion: JOB_ONBOARDING_MAPPING_VERSION,
    offeredAt,
  };
};

const serializeOnboardingOffer = (offer) => {
  if (!offer) return null;

  return {
    salonId: getId(offer.salonId),
    jobPostId: getId(offer.jobPostId),
    role: offer.role || "",
    employmentType: offer.employmentType || "",
    relationshipType: offer.relationshipType || "",
    relationshipStatus: offer.relationshipStatus || "",
    worksAsSpecialist: Boolean(offer.worksAsSpecialist),
    mappingVersion: offer.mappingVersion,
    offeredAt: offer.offeredAt || null,
  };
};

const getId = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const serializeUser = (user) => {
  if (!user) return null;

  return {
    id: getId(user),
    name: user.name || "",
    phone: user.phone || "",
    avatarUrl: user.avatarUrl || "",
    city: user.city || "",
  };
};

const serializeSalon = (salon) => {
  if (!salon) return null;

  return {
    id: getId(salon),
    name: salon.name || "",
    city: salon.city || "",
    address: salon.address || "",
    imageUrl: salon.imageUrl || "",
  };
};

const serializeJob = (job) => {
  if (!job) return null;

  return {
    id: getId(job),
    title: job.title || "",
    role: job.role || "",
    employmentType: job.employmentType || "",
    status: job.status || "",
  };
};

export const serializeApplication = (application) => {
  if (!application) return null;

  const applicant = application.applicantId;
  const salon = application.salonId;
  const job = application.jobId;

  return {
    id: getId(application),
    job: job ? (job.title ? serializeJob(job) : getId(job)) : null,
    salon: salon
      ? salon.name
        ? serializeSalon(salon)
        : getId(salon)
      : null,
    applicant: applicant
      ? applicant.name
        ? serializeUser(applicant)
        : getId(applicant)
      : null,
    message: application.message,
    experience: application.experience || "",
    contactInfo: application.contactInfo || "",
    status: application.status,
    reviewedAt: application.reviewedAt || null,
    acceptedAt: application.acceptedAt || null,
    rejectedAt: application.rejectedAt || null,
    statusUpdatedBy: application.statusUpdatedBy
      ? getId(application.statusUpdatedBy)
      : null,
    onboardingStatus: application.onboardingStatus || null,
    onboardingOffer: serializeOnboardingOffer(application.onboardingOffer),
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
};
