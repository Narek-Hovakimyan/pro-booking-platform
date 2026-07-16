import {
  BarberOnboardingStatusError,
  getBarberOnboardingStatus,
  updateBarberOnboardingWorkplace,
} from "../services/onboarding/barberOnboardingStatusService.js";

const defaultDependencies = {
  getBarberOnboardingStatus,
  updateBarberOnboardingWorkplace,
};

const allowedWorkplaces = ["independent", "salon", null];

const errorResponse = (res, statusCode, code, message) =>
  res.status(statusCode).json({ code, message });

const requireBarber = (req, res) => {
  if (req.user?.role === "barber") return true;
  errorResponse(res, 403, "BARBER_ROLE_REQUIRED", "Barber role required");
  return false;
};

const isPlainObject = (value) => {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const readWorkplaceBody = (body) => {
  if (!isPlainObject(body)) {
    return { valid: false, code: "INVALID_ONBOARDING_REQUEST" };
  }

  let keys;
  try {
    keys = Reflect.ownKeys(body);
  } catch {
    return { valid: false, code: "INVALID_ONBOARDING_REQUEST" };
  }

  if (keys.length !== 1 || keys[0] !== "workplace") {
    return { valid: false, code: "INVALID_ONBOARDING_REQUEST" };
  }

  const descriptor = Object.getOwnPropertyDescriptor(body, "workplace");
  if (!descriptor || !("value" in descriptor)) {
    return { valid: false, code: "INVALID_ONBOARDING_REQUEST" };
  }

  if (!allowedWorkplaces.includes(descriptor.value)) {
    return { valid: false, code: "INVALID_WORKPLACE" };
  }

  return { valid: true, workplace: descriptor.value };
};

const handleError = (res, error) => {
  if (error instanceof BarberOnboardingStatusError) {
    return errorResponse(res, error.statusCode, error.code, error.message);
  }

  return res.status(500).json({ message: "Could not process onboarding status" });
};

export const createBarberOnboardingController = (dependencies = defaultDependencies) => {
  const getMyBarberOnboarding = async (req, res) => {
    if (!requireBarber(req, res)) return undefined;

    try {
      const result = await dependencies.getBarberOnboardingStatus(req.user._id);
      return res.json(result);
    } catch (error) {
      return handleError(res, error);
    }
  };

  const updateMyBarberOnboardingWorkplace = async (req, res) => {
    if (!requireBarber(req, res)) return undefined;

    const body = readWorkplaceBody(req.body);
    if (!body.valid) {
      return errorResponse(
        res,
        400,
        body.code,
        body.code === "INVALID_WORKPLACE" ? "Invalid workplace" : "Invalid onboarding request"
      );
    }

    try {
      const result = await dependencies.updateBarberOnboardingWorkplace(
        req.user._id,
        body.workplace
      );
      return res.json(result);
    } catch (error) {
      return handleError(res, error);
    }
  };

  return { getMyBarberOnboarding, updateMyBarberOnboardingWorkplace };
};

export const {
  getMyBarberOnboarding,
  updateMyBarberOnboardingWorkplace,
} = createBarberOnboardingController();
