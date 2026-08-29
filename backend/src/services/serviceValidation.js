import { SERVICE_CATEGORIES } from "../models/Service.js";

/**
 * Calculate the discounted price for a service based on its discount settings.
 *
 * Rules:
 * - "none": discount = 0
 * - "percent": discount = Math.round(price * discountValue / 100)
 * - "fixed": discount = Math.min(discountValue, price)
 * - discountedPrice = Math.max(0, price - discountAmount)
 *
 * @param {object} service - A Service document or plain object with price, discountType, discountValue.
 * @returns {{ discountAmount: number, discountedPrice: number }}
 */
export const calculateServiceDiscountedPrice = (service) => {
  const price = Number(service?.price ?? 0);
  const discountType = service?.discountType || "none";
  const discountValue = Number(service?.discountValue ?? 0);
  let discountAmount = 0;

  if (discountType === "percent" && discountValue > 0) {
    discountAmount = Math.round(price * discountValue / 100);
  } else if (discountType === "fixed" && discountValue > 0) {
    discountAmount = Math.min(discountValue, price);
  }

  const discountedPrice = Math.max(0, price - discountAmount);
  return { discountAmount, discountedPrice };
};

const isBlankNumberInput = (value) =>
  value === null || (typeof value === "string" && !value.trim());

const maxServiceTags = 10;
const maxServiceTagLength = 32;

const sanitizeTags = (tags) => {
  if (tags === undefined) return { value: undefined };
  if (!Array.isArray(tags)) return { error: "Tags must be an array" };

  const nextTags = [];
  const seenTags = new Set();

  for (const tag of tags) {
    if (typeof tag !== "string") {
      return { error: "Tags must be strings" };
    }

    const normalizedTag = tag.trim().toLowerCase();

    if (!normalizedTag) continue;
    if (normalizedTag.length > maxServiceTagLength) {
      return { error: `Tags must be ${maxServiceTagLength} characters or less` };
    }
    if (seenTags.has(normalizedTag)) continue;

    seenTags.add(normalizedTag);
    nextTags.push(normalizedTag);
  }

  if (nextTags.length > maxServiceTags) {
    return { error: `Use ${maxServiceTags} tags or fewer` };
  }

  return { value: nextTags };
};

export const validateServicePayload = (
  body,
  { partial = false, existing = null } = {}
) => {
  const source = body || {};
  const validationSource = partial && existing
    ? { ...existing, ...source }
    : source;
  const next = {};

  if (!partial || source.name !== undefined) {
    const name = validationSource.name;
    if (typeof name !== "string" || !name.trim()) {
      return { error: "Service name is required" };
    }
    next.name = name.trim();
  }

  // Price: required for single services; optional for packages using sum mode
  if (!partial || source.price !== undefined) {
    const isSumPrice =
      validationSource.type === "package" && validationSource.packagePriceMode === "sum";

    if (source.price === undefined && isSumPrice) {
      // Price will be auto-calculated later — skip validation
    } else {
      const price = source.price !== undefined ? source.price : validationSource.price;
      if (isBlankNumberInput(price)) {
        return { error: "Price must be a non-negative number" };
      }

      const parsedPrice = Number(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return { error: "Price must be a non-negative number" };
      }
      next.price = parsedPrice;
    }
  }

  // Duration: required for single services; optional for packages using sum mode
  if (!partial || source.duration !== undefined) {
    const isSumDuration =
      validationSource.type === "package" && validationSource.packageDurationMode === "sum";

    if (source.duration === undefined && isSumDuration) {
      // Duration will be auto-calculated later — skip validation
    } else {
      const duration = source.duration !== undefined ? source.duration : validationSource.duration;
      if (isBlankNumberInput(duration)) {
        return { error: "Duration must be a positive number" };
      }

      const parsedDuration = Number(duration);
      if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
        return { error: "Duration must be a positive number" };
      }
      next.duration = parsedDuration;
    }
  }

  if (source.description !== undefined) {
    next.description = String(source.description || "").trim();
  }

  if (!partial || source.category !== undefined) {
    const category = String(validationSource.category || "other").trim();

    if (!SERVICE_CATEGORIES.includes(category)) {
      return { error: "Invalid service category" };
    }

    next.category = category;
  }

  if (source.tags !== undefined) {
    const { value, error } = sanitizeTags(source.tags);

    if (error) return { error };
    next.tags = value;
  }

  if (source.active !== undefined) {
    if (typeof source.active !== "boolean") {
      return { error: "Active must be a boolean" };
    }
    next.active = source.active;
  }

  // ── Discount fields ──
  if (!partial || source.discountType !== undefined || source.discountValue !== undefined) {
    const parsedDiscountValue = source.discountValue !== undefined
      ? Number(source.discountValue)
      : undefined;
    const discountType = source.discountType !== undefined
      ? source.discountType
      : (parsedDiscountValue === 0
        ? "none"
        : (existing?.discountType || "none"));
    const discountValue = parsedDiscountValue !== undefined
      ? parsedDiscountValue
      : (source.discountType === "none"
        ? 0
        : Number(existing?.discountValue ?? 0));

    if (!["none", "percent", "fixed"].includes(discountType)) {
      return { error: "discountType must be 'none', 'percent', or 'fixed'" };
    }

    if (discountType === "none") {
      if (discountValue !== 0) {
        return { error: "discountValue must be 0 when discountType is 'none'" };
      }
    } else if (discountType === "percent") {
      if (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue > 100) {
        return { error: "discountValue must be between 1 and 100 for percent discount" };
      }
    } else if (discountType === "fixed") {
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        return { error: "discountValue must be greater than 0 for fixed discount" };
      }
      // Validate against price — resolved price may come from body or will be validated later
      const priceForValidation = next.price !== undefined
        ? next.price
        : (source.price !== undefined ? source.price : existing?.price);
      if (priceForValidation !== undefined && Number(priceForValidation) >= 0) {
        if (discountValue > Number(priceForValidation)) {
          return { error: "discountValue cannot exceed the service price for fixed discount" };
        }
      }
    }

    next.discountType = discountType;
    next.discountValue = discountValue;
  }

  // ── Package fields ──
  if (!partial || source.type !== undefined) {
    if (source.type !== undefined && !["single", "package"].includes(source.type)) {
      return { error: "Type must be 'single' or 'package'" };
    }
    next.type = source.type || "single";
  }

  return { value: next };
};
