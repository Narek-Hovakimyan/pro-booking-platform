const ownValue = (value, field) => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
};

const findDataMethod = (value, field) => {
  try {
    let current = value;
    while (current) {
      const descriptor = Object.getOwnPropertyDescriptor(current, field);
      if (descriptor) return "value" in descriptor ? descriptor.value : null;
      current = Object.getPrototypeOf(current);
    }
  } catch {
    return null;
  }
  return null;
};

const toPlainObject = (value) => {
  if (!value || typeof value !== "object") return null;
  const toObject = findDataMethod(value, "toObject");

  if (typeof toObject !== "function") return value;

  try {
    const plain = toObject.call(value);
    return plain && typeof plain === "object" ? plain : null;
  } catch {
    return null;
  }
};

const text = (value) => typeof value === "string" ? value : "";
const safeId = (value) => ownValue(value, "id") || ownValue(value, "_id") || null;

const serializeDefaultSchedule = (value) => {
  const schedule = toPlainObject(value);

  return {
    startTime: text(ownValue(schedule, "startTime")) || "09:00",
    endTime: text(ownValue(schedule, "endTime")) || "18:00",
    hasBreak: ownValue(schedule, "hasBreak") === true,
    breakStart: text(ownValue(schedule, "breakStart")),
    breakEnd: text(ownValue(schedule, "breakEnd")),
  };
};

const serializeGallery = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

const serializeReferenceId = (value, depth = 0) => {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!value || typeof value !== "object") return null;

  const directId = ownValue(value, "id") || ownValue(value, "_id");
  if (typeof directId === "string" || typeof directId === "number") return directId;
  if (depth === 0 && directId && directId !== value) {
    return serializeReferenceId(directId, depth + 1);
  }

  const plainValue = toPlainObject(value);
  const plainId = plainValue && (
    ownValue(plainValue, "id") || ownValue(plainValue, "_id")
  );
  if (typeof plainId === "string" || typeof plainId === "number") return plainId;
  if (depth === 0 && plainId && plainId !== value && plainId !== directId) {
    return serializeReferenceId(plainId, depth + 1);
  }

  const toHexString = findDataMethod(value, "toHexString");
  if (typeof toHexString !== "function") return null;

  try {
    const id = toHexString.call(value);
    return typeof id === "string" && /^[a-f\d]{24}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
};

const serializePublicSalonReference = (value) => {
  const salon = toPlainObject(value);
  if (!salon) return null;

  const id = safeId(salon);
  const serialized = {
    _id: ownValue(salon, "_id") || id,
    id,
    name: text(ownValue(salon, "name")),
    city: text(ownValue(salon, "city")),
    address: text(ownValue(salon, "address")),
    phone: text(ownValue(salon, "phone")),
    imageUrl: text(ownValue(salon, "imageUrl")) || text(ownValue(salon, "image")),
    image: text(ownValue(salon, "image")) || text(ownValue(salon, "imageUrl")),
  };

  for (const field of ["averageRating", "totalReviews", "reviewsCount"]) {
    const fieldValue = ownValue(salon, field);
    if (fieldValue !== undefined) serialized[field] = fieldValue;
  }

  const isPrimary = ownValue(salon, "isPrimary");
  if (typeof isPrimary === "boolean") serialized.isPrimary = isPrimary;

  return serialized;
};

const serializePublicSalons = (value) =>
  Array.isArray(value)
    ? value.map(serializePublicSalonReference).filter(Boolean)
    : [];

const basePublicBarber = (barber, profile) => {
  const user = toPlainObject(barber) || {};
  const publicProfile = toPlainObject(profile) || {};
  const id = safeId(user);

  return {
    _id: ownValue(user, "_id") || id,
    id,
    name: text(ownValue(user, "name")),
    role: "barber",
    profession: text(ownValue(user, "profession")) || "barber",
    barberType: text(ownValue(user, "barberType")),
    specialty: text(ownValue(user, "specialty")) || "unisex",
    city: text(ownValue(publicProfile, "city")) || text(ownValue(user, "city")),
    bio: text(ownValue(publicProfile, "bio")),
    instagram: text(ownValue(publicProfile, "instagram")),
    avatarUrl: text(ownValue(user, "avatarUrl")),
    imageUrl: text(ownValue(publicProfile, "imageUrl")) || text(ownValue(user, "avatarUrl")),
    galleryImages: serializeGallery(ownValue(publicProfile, "galleryImages")),
    defaultSchedule: serializeDefaultSchedule(ownValue(publicProfile, "defaultSchedule")),
  };
};

export const serializePublicBarberDirectory = ({
  barber,
  profile,
  salonName = "",
  salon = null,
  salons = [],
  approvedSalons = [],
  primarySalon = null,
}) => ({
  ...basePublicBarber(barber, profile),
  salonName: text(salonName),
  salon: serializePublicSalonReference(salon),
  salons: serializePublicSalons(salons),
  approvedSalons: serializePublicSalons(approvedSalons),
  primarySalon: serializePublicSalonReference(primarySalon),
});

export const serializePublicBarberCard = (options) =>
  serializePublicBarberDirectory(options);

export const serializePublicBarberProfile = ({ barber, profile, salon, barberId }) => {
  const publicBarber = basePublicBarber(barber, profile);
  const user = toPlainObject(barber) || {};
  const publicProfile = toPlainObject(profile) || {};
  const workHistory = ownValue(user, "workHistory");

  return {
    _id: ownValue(publicProfile, "_id") || publicBarber._id,
    id: safeId(publicProfile) || publicBarber.id,
    barberId: barberId || ownValue(publicProfile, "barberId") || publicBarber.id,
    ...publicBarber,
    salon: serializePublicSalonReference(salon),
    salonName: text(ownValue(salon, "name")),
    workHistory: Array.isArray(workHistory)
      ? workHistory.map((entry) => {
        const item = toPlainObject(entry) || {};
        return {
          salon: serializeReferenceId(ownValue(item, "salon")),
          salonName: text(ownValue(item, "salonName")),
          startDate: ownValue(item, "startDate") || null,
          endDate: ownValue(item, "endDate") || null,
          isCurrent: ownValue(item, "isCurrent") === true,
        };
      })
      : [],
  };
};

export const serializePublicBarberProfileRecord = (profile) => {
  const value = toPlainObject(profile) || {};
  const id = safeId(value);

  return {
    _id: ownValue(value, "_id") || id,
    id,
    barberId: ownValue(value, "barberId") || null,
    salonName: text(ownValue(value, "salonName")),
    bio: text(ownValue(value, "bio")),
    city: text(ownValue(value, "city")),
    instagram: text(ownValue(value, "instagram")),
    imageUrl: text(ownValue(value, "imageUrl")),
    galleryImages: serializeGallery(ownValue(value, "galleryImages")),
    defaultSchedule: serializeDefaultSchedule(ownValue(value, "defaultSchedule")),
  };
};
