export const APPLICATION_STATUSES = [
  "pending",
  "reviewed",
  "accepted",
  "rejected",
];

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
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
};
