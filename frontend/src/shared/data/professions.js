/**
 * Shared helpers for displaying a specialist's profession / barberType.
 *
 * Display rule:
 *   barber + men          → "Men's barber"
 *   barber + women        → "Women's hairdresser"
 *   barber + unisex/""    → "Unisex"
 *   hair_stylist          → "Hair stylist"
 *   nail_master           → "Nail master"
 *   makeup_artist         → "Makeup artist"
 *   cosmetologist         → "Cosmetologist"
 *   lash_brow             → "Lash & brow"
 *   massage               → "Massage"
 *   other                 → "Other specialist"
 *
 * Legacy fallback when no profession is set:
 *   specialty === "men"   → "Men's barber" (💈)
 *   specialty === "women" → "Women's hairdresser" (💇‍♀️)
 *   specialty === "unisex"→ "Unisex" (✂️)
 */

const PROFESSION_LABELS = {
  hair_stylist: "Hair stylist",
  nail_master: "Nail master",
  makeup_artist: "Makeup artist",
  cosmetologist: "Cosmetologist",
  lash_brow: "Lash & brow",
  massage: "Massage",
  other: "Other specialist",
};

const BARBER_TYPE_LABELS = {
  men: "Men's barber",
  women: "Women's hairdresser",
  unisex: "Unisex",
};

const PROFESSION_EMOJI = {
  hair_stylist: "💇",
  nail_master: "💅",
  makeup_artist: "💄",
  cosmetologist: "✨",
  lash_brow: "👁️",
  massage: "💆",
  other: "🔧",
};

const BARBER_TYPE_EMOJI = {
  men: "💈",
  women: "💇‍♀️",
  unisex: "✂️",
};

const SPECIALTY_LEGACY_LABELS = {
  men: "Men's barber",
  women: "Women's hairdresser",
  unisex: "Unisex",
};

const SPECIALTY_LEGACY_EMOJI = {
  men: "💈",
  women: "💇‍♀️",
  unisex: "✂️",
};

// Badge style tokens (Tailwind classes for bg/text/ring)
const PROFESSION_STYLES = {
  hair_stylist: "bg-purple-50 text-purple-700 ring-purple-200",
  nail_master: "bg-pink-50 text-pink-700 ring-pink-200",
  makeup_artist: "bg-rose-50 text-rose-700 ring-rose-200",
  cosmetologist: "bg-teal-50 text-teal-700 ring-teal-200",
  lash_brow: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  massage: "bg-sky-50 text-sky-700 ring-sky-200",
  other: "bg-neutral-100 text-neutral-700 ring-neutral-200",
};

const BARBER_TYPE_STYLES = {
  men: "bg-blue-50 text-blue-700 ring-blue-200",
  women: "bg-pink-50 text-pink-700 ring-pink-200",
  unisex: "bg-purple-50 text-purple-700 ring-purple-200",
};

const SPECIALTY_LEGACY_STYLES = {
  men: "bg-blue-50 text-blue-700 ring-blue-200",
  women: "bg-pink-50 text-pink-700 ring-pink-200",
  unisex: "bg-purple-50 text-purple-700 ring-purple-200",
};

/**
 * Return the display label for a specialist.
 * Accepts { profession, barberType, specialty } or any object with those keys.
 */
export function getSpecialistProfessionLabel(item = {}) {
  const { profession, barberType, specialty } = item;

  if (profession && profession !== "barber") {
    return PROFESSION_LABELS[profession] || "Other specialist";
  }

  if (profession === "barber") {
    return BARBER_TYPE_LABELS[barberType] || "Unisex";
  }

  // No profession → legacy fallback
  return SPECIALTY_LEGACY_LABELS[specialty] || "Unisex";
}

/**
 * Return the emoji icon for a specialist.
 * Accepts { profession, barberType, specialty } or any object with those keys.
 */
export function getSpecialistProfessionIcon(item = {}) {
  const { profession, barberType, specialty } = item;

  if (profession && profession !== "barber") {
    return PROFESSION_EMOJI[profession] || "🔧";
  }

  if (profession === "barber") {
    return BARBER_TYPE_EMOJI[barberType] || "✂️";
  }

  return SPECIALTY_LEGACY_EMOJI[specialty] || "✂️";
}

/**
 * Return the Tailwind badge style token for a specialist.
 * Accepts { profession, barberType, specialty } or any object with those keys.
 */
export function getSpecialistProfessionStyle(item = {}) {
  const { profession, barberType, specialty } = item;

  if (profession && profession !== "barber") {
    return PROFESSION_STYLES[profession] || "bg-neutral-100 text-neutral-700 ring-neutral-200";
  }

  if (profession === "barber") {
    return BARBER_TYPE_STYLES[barberType] || "bg-purple-50 text-purple-700 ring-purple-200";
  }

  return SPECIALTY_LEGACY_STYLES[specialty] || "bg-purple-50 text-purple-700 ring-purple-200";
}

/**
 * Return { label, icon, className } or null if nothing to display.
 * Accepts { profession, barberType, specialty } or any object with those keys.
 */
export function getSpecialistProfessionDisplay(item = {}) {
  const label = getSpecialistProfessionLabel(item);
  if (!label) return null;
  return {
    label,
    icon: getSpecialistProfessionIcon(item),
    className: getSpecialistProfessionStyle(item),
  };
}
