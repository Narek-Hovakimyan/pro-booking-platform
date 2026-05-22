export const ALLOWED_SALON_JOB_UPDATE_FIELDS = [
  "title",
  "role",
  "customRole",
  "employmentType",
  "salary",
  "requirements",
  "description",
  "contactInfo",
];

const getId = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

export const pickSalonJobFields = (payload = {}) => {
  const selected = {};

  for (const field of ALLOWED_SALON_JOB_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      selected[field] = payload[field];
    }
  }

  return selected;
};

export const serializeSalonJob = (job) => {
  if (!job) return null;

  const salon = job.salonId;

  return {
    id: getId(job),
    title: job.title,
    role: job.role,
    customRole: job.customRole || "",
    employmentType: job.employmentType,
    salary: job.salary || "",
    requirements: job.requirements || "",
    description: job.description || "",
    contactInfo: job.contactInfo || "",
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    salon: salon
      ? {
          id: getId(salon),
          name: salon.name || "",
          city: salon.city || "",
          address: salon.address || "",
          imageUrl: salon.imageUrl || "",
        }
      : null,
  };
};
