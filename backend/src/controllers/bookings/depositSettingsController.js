import BarberProfile from "../../models/BarberProfile.js";
import User from "../../models/User.js";
import Salon from "../../models/Salon.js";
import { isAcceptedStaffMember } from "../../services/salon/salonRelationshipService.js";
import { canManageSalon, sameId } from "../../utils/salonPermissions.js";

export const MAX_NO_SHOW_POLICY_TEXT_LENGTH = 1000;

const parseOptionalNonNegativeNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : Number.NaN;
};

const normalizeDepositSettings = (body = {}, currentSettings = {}) => {
  const minimumBookingPrice = body.minimumBookingPrice !== undefined
    ? parseOptionalNonNegativeNumber(body.minimumBookingPrice)
    : (currentSettings?.minimumBookingPrice ?? null);

  return {
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : currentSettings?.enabled || false,
    mode: body.mode || currentSettings?.mode || "percentage",
    value: body.value !== undefined ? Number(body.value) : currentSettings?.value || 0,
    minimumBookingPrice,
    noShowPolicyText: body.noShowPolicyText !== undefined
      ? String(body.noShowPolicyText).trim()
      : (currentSettings?.noShowPolicyText || ""),
  };
};

/**
 * Validate deposit settings values.
 */
const validateDepositSettings = (settings) => {
  const errors = [];
  const value = Number(settings.value);
  const minimumBookingPrice = settings.minimumBookingPrice;

  if (settings.enabled === true) {
    const mode = settings.mode || "percentage";

    if (!Number.isFinite(value)) {
      errors.push("Deposit value must be a valid number");
    }

    if (mode === "percentage") {
      if (Number.isFinite(value) && (value <= 0 || value > 100)) {
        errors.push("Percentage deposit value must be > 0 and <= 100");
      }
    } else if (mode === "fixed") {
      if (Number.isFinite(value) && value < 0) {
        errors.push("Fixed deposit value must be >= 0");
      }
    } else {
      errors.push("Deposit mode must be 'percentage' or 'fixed'");
    }
  } else if (!Number.isFinite(value)) {
    errors.push("Deposit value must be a valid number");
  }

  if (
    minimumBookingPrice !== null &&
    minimumBookingPrice !== undefined &&
    (!Number.isFinite(Number(minimumBookingPrice)) || Number(minimumBookingPrice) < 0)
  ) {
    errors.push("minimumBookingPrice must be a valid non-negative number");
  }

  if (
    settings.noShowPolicyText &&
    settings.noShowPolicyText.length > MAX_NO_SHOW_POLICY_TEXT_LENGTH
  ) {
    errors.push(`No-show policy text must be ${MAX_NO_SHOW_POLICY_TEXT_LENGTH} characters or less`);
  }

  return errors;
};

/**
 * Calculate deposit amount from settings and final price.
 * Returns { depositAmount, depositRequired }.
 */
export const calculateDeposit = (depositSettings, finalPrice) => {
  if (!depositSettings || !depositSettings.enabled) {
    return { depositRequired: false, depositAmount: 0 };
  }

  if (!finalPrice || finalPrice <= 0) {
    return { depositRequired: false, depositAmount: 0 };
  }

  // Check minimum booking price threshold
  if (depositSettings.minimumBookingPrice && finalPrice < depositSettings.minimumBookingPrice) {
    return { depositRequired: false, depositAmount: 0 };
  }

  let depositAmount = 0;

  if (depositSettings.mode === "percentage") {
    const pct = Math.min(depositSettings.value, 100);
    depositAmount = Math.round((finalPrice * pct) / 100);
  } else {
    // fixed
    depositAmount = Math.min(depositSettings.value, finalPrice);
  }

  // Deposit cannot exceed final price
  depositAmount = Math.min(depositAmount, finalPrice);
  depositAmount = Math.max(0, depositAmount);

  return {
    depositRequired: depositAmount > 0,
    depositAmount,
  };
};

/**
 * GET /api/barbers/me/deposit-settings
 * Authenticated barber only.
 */
export const getMyDepositSettings = async (req, res) => {
  try {
    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Only barbers can access deposit settings" });
    }

    const profile = await BarberProfile.findOne({ barberId: req.user._id });

    if (!profile) {
      return res.status(404).json({ message: "Barber profile not found" });
    }

    return res.json({
      depositSettings: profile.depositSettings || {
        enabled: false,
        mode: "percentage",
        value: 0,
        minimumBookingPrice: null,
        noShowPolicyText: "",
      },
    });
  } catch (error) {
    console.error("Could not fetch deposit settings", error);
    return res.status(500).json({ message: "Could not fetch deposit settings" });
  }
};

/**
 * PATCH /api/barbers/me/deposit-settings
 * Authenticated barber only.
 */
export const updateMyDepositSettings = async (req, res) => {
  try {
    if (req.user?.role !== "barber") {
      return res.status(403).json({ message: "Only barbers can update deposit settings" });
    }

    const profile = await BarberProfile.findOne({ barberId: req.user._id });

    if (!profile) {
      return res.status(404).json({ message: "Barber profile not found" });
    }

    const newSettings = normalizeDepositSettings(req.body, profile.depositSettings);

    // Validate
    const errors = validateDepositSettings(newSettings);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    profile.depositSettings = newSettings;
    await profile.save();

    return res.json({
      message: "Deposit settings updated",
      depositSettings: profile.depositSettings,
    });
  } catch (error) {
    console.error("Could not update deposit settings", error);
    return res.status(500).json({ message: "Could not update deposit settings" });
  }
};

/**
 * PATCH /api/salons/:salonId/staff/:barberId/deposit-settings
 * Salon owner/admin can update deposit settings for accepted staff (NOT chair_renter).
 */
export const updateStaffDepositSettingsBySalonOwner = async (req, res) => {
  try {
    const { salonId, barberId } = req.params;

    // Verify salon exists
    const salon = await Salon.findById(salonId);
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    // Verify requester is salon owner or admin
    if (!canManageSalon(salon, req.user._id)) {
      return res.status(403).json({ message: "Only salon owner or admin can update staff deposit settings" });
    }

    // Verify barber exists
    const barber = await User.findById(barberId);
    if (!barber || barber.role !== "barber") {
      return res.status(404).json({ message: "Barber not found" });
    }

    // Verify barber is approved member of this salon
    const approvedEntry = (barber.salons || []).find(
      (entry) => sameId(entry?.salon, salon._id) && entry?.status === "approved"
    );
    const isLegacyStaff = barber.salonStatus === "approved" && sameId(barber.salon, salon._id);

    if (!approvedEntry && !isLegacyStaff) {
      return res.status(400).json({ message: "Barber is not an approved member of this salon" });
    }

    // Chair renters and unconfirmed staff control their own deposit settings.
    const entry = approvedEntry || {
      salon: salon._id,
      status: "approved",
      relationshipType: "staff",
      relationshipStatus: "accepted",
    };
    if (!isAcceptedStaffMember(entry)) {
      return res.status(403).json({
        message: "Only accepted staff deposit settings can be modified by salon owner or admin.",
      });
    }

    // Get barber profile
    const profile = await BarberProfile.findOne({ barberId });
    if (!profile) {
      return res.status(404).json({ message: "Barber profile not found" });
    }

    const newSettings = normalizeDepositSettings(req.body, profile.depositSettings);

    const errors = validateDepositSettings(newSettings);
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join("; ") });
    }

    profile.depositSettings = newSettings;
    await profile.save();

    return res.json({
      message: "Staff deposit settings updated",
      depositSettings: profile.depositSettings,
    });
  } catch (error) {
    console.error("Could not update staff deposit settings", error);
    return res.status(500).json({ message: "Could not update staff deposit settings" });
  }
};
