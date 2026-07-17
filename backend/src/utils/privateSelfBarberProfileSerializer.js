import { getDefaultSchedule } from "./barberProfileUtils.js";

const toPlainObject = (value) => {
  if (!value) return {};
  if (typeof value.toObject === "function") {
    try {
      const plain = value.toObject();
      return plain && typeof plain === "object" ? plain : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value : {};
};

const ownValue = (source, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
};

const idValue = (...values) => values.find((value) => value !== undefined && value !== null) || "";

const stringValue = (value, fallback = "") => (typeof value === "string" ? value : fallback);

const deriveSpecialty = (user) => {
  const profession = ownValue(user, "profession");
  const barberType = ownValue(user, "barberType");
  const specialty = ownValue(user, "specialty");

  if (profession !== "barber") return "unisex";
  if (["men", "women", "unisex"].includes(barberType)) return barberType;
  if (["men", "women", "unisex"].includes(specialty)) return specialty;
  return "unisex";
};

export const serializePrivateSelfBarberProfile = ({ user, profile }) => {
  const plainUser = toPlainObject(user);
  const plainProfile = toPlainObject(profile);
  const profileId = idValue(ownValue(plainProfile, "id"), ownValue(plainProfile, "_id"));
  const barberId = idValue(
    ownValue(plainProfile, "barberId"),
    ownValue(plainUser, "id"),
    ownValue(plainUser, "_id")
  );
  const userAvatarUrl = stringValue(ownValue(plainUser, "avatarUrl"));
  const profileImageUrl = stringValue(ownValue(plainProfile, "imageUrl"), userAvatarUrl);
  const galleryImages = Array.isArray(ownValue(plainProfile, "galleryImages"))
    ? ownValue(plainProfile, "galleryImages").filter((item) => typeof item === "string")
    : [];

  return {
    _id: profileId,
    id: profileId,
    barberId,
    name: stringValue(ownValue(plainUser, "name")),
    phone: stringValue(ownValue(plainUser, "phone")),
    city: stringValue(ownValue(plainProfile, "city"), stringValue(ownValue(plainUser, "city"))),
    profession: stringValue(ownValue(plainUser, "profession"), "barber"),
    barberType: stringValue(ownValue(plainUser, "barberType")),
    specialty: deriveSpecialty(plainUser),
    avatarUrl: userAvatarUrl,
    imageUrl: profileImageUrl,
    bio: stringValue(ownValue(plainProfile, "bio")),
    address: stringValue(ownValue(plainProfile, "address")),
    instagram: stringValue(ownValue(plainProfile, "instagram")),
    galleryImages: [...galleryImages],
    defaultSchedule: { ...getDefaultSchedule(plainProfile) },
  };
};
