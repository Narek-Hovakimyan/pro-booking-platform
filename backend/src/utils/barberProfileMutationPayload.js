import { MAX_PHONE_LENGTH } from "../models/User.js";
import { isTimeKey, sanitizeDefaultSchedule } from "./barberProfileUtils.js";
import { sanitizeMediaUrl } from "./mediaUrl.js";

export class BarberProfileMutationPayloadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BarberProfileMutationPayloadError";
    this.code = code;
  }
}

const userFields = new Set(["name", "phone", "city", "profession", "barberType", "avatarUrl", "imageUrl"]);
const profileFields = new Set(["bio", "address", "instagram", "galleryImages", "defaultSchedule"]);
const compatibilityNoOpFields = new Set(["specialty", "salon", "salonStatus", "salons", "approvedSalons", "primarySalon", "workHistory", "addressContext"]);
const forbiddenFields = new Set([
  "barberId",
  "userId",
  "profileId",
  "ownerId",
  "salonId",
  "salonName",
  "certification",
  "certifications",
  "depositSettings",
  "rating",
  "ratings",
  "reviewCount",
  "reviewTotal",
  "reviews",
  "membership",
  "membershipStatus",
  "staffPayment",
  "chairRental",
  "payment",
  "payments",
  "subscription",
  "subscriptions",
  "billing",
  "moderation",
  "status",
  "createdAt",
  "updatedAt",
  "__v",
]);
const professionValues = new Set(["barber", "hair_stylist", "nail_master", "makeup_artist", "cosmetologist", "lash_brow", "massage", "other"]);
const barberTypeValues = new Set(["men", "women", "unisex", ""]);
const defaultScheduleFields = new Set(["startTime", "endTime", "hasBreak", "breakStart", "breakEnd"]);

const fieldError = () =>
  new BarberProfileMutationPayloadError("BARBER_PROFILE_FIELDS_INVALID", "Invalid barber profile fields");

const requestError = () =>
  new BarberProfileMutationPayloadError("INVALID_BARBER_PROFILE_REQUEST", "Invalid barber profile request");

const mediaError = () =>
  new BarberProfileMutationPayloadError("BARBER_PROFILE_MEDIA_INVALID", "Invalid barber profile media");

const assertSafeKey = (key) => {
  if (typeof key !== "string") throw fieldError();
  if (key.startsWith("$") || key.includes(".") || key === "__proto__" || key === "constructor" || key === "prototype") {
    throw fieldError();
  }
};

const withBoundedInspection = (inspect, createError = fieldError) => {
  try {
    return inspect();
  } catch (error) {
    if (error instanceof BarberProfileMutationPayloadError) throw error;
    throw createError();
  }
};

const isArray = (value, createError = fieldError) =>
  withBoundedInspection(() => Array.isArray(value), createError);

const isPlainObject = (value, createError) => {
  if (!value || typeof value !== "object" || isArray(value, createError)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isArrayIndexKey = (key) => {
  if (typeof key !== "string" || key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 4294967295 && String(index) === key;
};

const readSafeEntries = (value, { topLevel = false } = {}) => {
  const createError = topLevel ? requestError : fieldError;
  return withBoundedInspection(() => {
    if (!isPlainObject(value, createError)) throw createError();
    return Reflect.ownKeys(value).map((key) => {
      assertSafeKey(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw fieldError();
      return [key, descriptor.value];
    });
  }, createError);
};

const readSafeArrayValues = (value) =>
  withBoundedInspection(() => {
    if (!isArray(value)) throw fieldError();
    if (Object.getPrototypeOf(value) !== Array.prototype) throw fieldError();

    const keys = Reflect.ownKeys(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) {
      throw fieldError();
    }
    const { value: length } = lengthDescriptor;
    if (!Number.isInteger(length) || length < 0) throw fieldError();

    const indexKeys = new Set();
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const key = keys[keyIndex];
      if (typeof key !== "string") throw fieldError();
      if (key === "length") continue;
      if (!isArrayIndexKey(key)) throw fieldError();
      indexKeys.add(Number(key));
    }
    if (indexKeys.size !== length) throw fieldError();

    const values = [];
    for (let index = 0; index < length; index += 1) {
      if (!indexKeys.has(index)) throw fieldError();
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !descriptor.enumerable ||
        !descriptor.writable ||
        !descriptor.configurable
      ) {
        throw fieldError();
      }
      values.push(descriptor.value);
    }
    return values;
  });

const assertSafeNestedValue = (value) => {
  if (!value || typeof value !== "object") return;
  if (isArray(value)) {
    const values = readSafeArrayValues(value);
    for (let index = 0; index < values.length; index += 1) {
      assertSafeNestedValue(values[index]);
    }
    return;
  }
  for (const [, nestedValue] of readSafeEntries(value)) {
    assertSafeNestedValue(nestedValue);
  }
};

const normalizeString = (value, { required = false } = {}) => {
  if (typeof value !== "string") throw fieldError();
  const trimmed = value.trim();
  if (required && !trimmed) throw fieldError();
  return trimmed;
};

const sanitizeMediaField = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return "";
  if (typeof value !== "string") throw mediaError();

  const trimmed = value.trim();
  if (!trimmed) return "";

  const sanitized = sanitizeMediaUrl(trimmed);
  if (!sanitized) throw mediaError();
  return sanitized;
};

const sanitizeGalleryImages = (value) => {
  const values = readSafeArrayValues(value);
  const seen = new Set();
  const result = [];
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (typeof item !== "string") throw mediaError();
    const sanitized = sanitizeMediaField(item);
    if (!sanitized || seen.has(sanitized)) continue;
    seen.add(sanitized);
    result.push(sanitized);
  }
  return result;
};

const validateTimeIfPresent = (value) => {
  if (value === undefined || value === "") return;
  if (typeof value !== "string" || !isTimeKey(value)) throw fieldError();
};

const sanitizeSchedule = (value) => {
  const schedule = {};

  for (const [key, fieldValue] of readSafeEntries(value)) {
    if (!defaultScheduleFields.has(key)) throw fieldError();
    if (key === "hasBreak") {
      if (typeof fieldValue !== "boolean") throw fieldError();
      schedule.hasBreak = fieldValue;
      continue;
    }
    if (typeof fieldValue !== "string") throw fieldError();
    const trimmed = fieldValue.trim();
    validateTimeIfPresent(trimmed);
    schedule[key] = trimmed;
  }

  try {
    return sanitizeDefaultSchedule(schedule);
  } catch {
    throw fieldError();
  }
};

const applyBodyMedia = (payload, bodyImageUrl, bodyAvatarUrl, uploadedAvatarPath) => {
  const uploadedImage = sanitizeMediaField(uploadedAvatarPath);
  if (uploadedImage !== undefined && uploadedImage !== "") {
    payload.userUpdates.avatarUrl = uploadedImage;
    payload.profileUpdates.imageUrl = uploadedImage;
    return;
  }

  const imageUrl = sanitizeMediaField(bodyImageUrl);
  const avatarUrl = sanitizeMediaField(bodyAvatarUrl);
  if (imageUrl === undefined && avatarUrl === undefined) return;

  const selectedMedia = imageUrl !== undefined ? imageUrl : avatarUrl;
  if (imageUrl !== undefined && avatarUrl !== undefined && imageUrl !== avatarUrl) {
    throw mediaError();
  }

  payload.userUpdates.avatarUrl = selectedMedia;
  payload.profileUpdates.imageUrl = selectedMedia;
};

export const validateBarberProfileMutationPayload = (body, options = {}) => {
  const payload = {
    userUpdates: {},
    profileUpdates: {},
  };
  let bodyImageUrl;
  let bodyAvatarUrl;

  for (const [key, value] of readSafeEntries(body, { topLevel: true })) {
    if (forbiddenFields.has(key)) throw fieldError();
    if (compatibilityNoOpFields.has(key)) {
      assertSafeNestedValue(value);
      continue;
    }
    if (!userFields.has(key) && !profileFields.has(key)) throw fieldError();

    if (key === "name") payload.userUpdates.name = normalizeString(value, { required: true });
    if (key === "phone") {
      const phone = normalizeString(value, { required: true });
      if (phone.length > MAX_PHONE_LENGTH) throw fieldError();
      payload.userUpdates.phone = phone;
    }
    if (key === "city") {
      const city = normalizeString(value);
      payload.userUpdates.city = city;
      payload.profileUpdates.city = city;
    }
    if (key === "profession") {
      if (typeof value !== "string" || !professionValues.has(value)) throw fieldError();
      payload.userUpdates.profession = value;
    }
    if (key === "barberType") {
      if (typeof value !== "string" || !barberTypeValues.has(value)) throw fieldError();
      payload.userUpdates.barberType = value;
    }
    if (key === "avatarUrl") bodyAvatarUrl = value;
    if (key === "imageUrl") bodyImageUrl = value;
    if (key === "bio") payload.profileUpdates.bio = normalizeString(value);
    if (key === "address") payload.profileUpdates.address = normalizeString(value);
    if (key === "instagram") payload.profileUpdates.instagram = normalizeString(value);
    if (key === "galleryImages") payload.profileUpdates.galleryImages = sanitizeGalleryImages(value);
    if (key === "defaultSchedule") payload.profileUpdates.defaultSchedule = sanitizeSchedule(value);
  }

  applyBodyMedia(payload, bodyImageUrl, bodyAvatarUrl, options.uploadedAvatarPath);

  return {
    userUpdates: { ...payload.userUpdates },
    profileUpdates: {
      ...payload.profileUpdates,
      ...(payload.profileUpdates.galleryImages
        ? { galleryImages: [...payload.profileUpdates.galleryImages] }
        : {}),
      ...(payload.profileUpdates.defaultSchedule
        ? { defaultSchedule: { ...payload.profileUpdates.defaultSchedule } }
        : {}),
    },
  };
};
