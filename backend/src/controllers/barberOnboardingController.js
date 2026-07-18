import {
  BarberOnboardingStatusError,
  getBarberOnboardingStatus,
  updateBarberOnboardingWorkplace,
} from "../services/onboarding/barberOnboardingStatusService.js";
import { finalizeBarberOnboarding } from "../services/onboarding/barberOnboardingFinalizationService.js";

const defaultDependencies = {
  getBarberOnboardingStatus,
  updateBarberOnboardingWorkplace,
  finalizeBarberOnboarding,
};

const allowedWorkplaces = ["independent", "salon", "both", null];

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

const isEmptyOnboardingBody = (body) => {
  if (body === undefined) return true;
  if (!isPlainObject(body)) return false;
  try {
    return Reflect.ownKeys(body).length === 0;
  } catch {
    return false;
  }
};

const handleError = (res, error) => {
  if (error instanceof BarberOnboardingStatusError) {
    const body = { code: error.code, message: error.message };
    if (error.code === "ONBOARDING_REQUIREMENTS_INCOMPLETE" && Array.isArray(error.missing)) {
      body.missing = [...error.missing];
    }
    return res.status(error.statusCode).json(body);
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

  const finalizeMyBarberOnboarding = async (req, res) => {
    if (!requireBarber(req, res)) return undefined;
    if (!isEmptyOnboardingBody(req.body)) {
      return errorResponse(res, 400, "INVALID_ONBOARDING_REQUEST", "Invalid onboarding request");
    }
    try {
      return res.json(await dependencies.finalizeBarberOnboarding(req.user._id));
    } catch (error) {
      if (error instanceof BarberOnboardingStatusError) return handleError(res, error);
      return res.status(500).json({ message: "Could not finalize onboarding" });
    }
  };

  return {
    getMyBarberOnboarding,
    updateMyBarberOnboardingWorkplace,
    finalizeMyBarberOnboarding,
  };
};

export const {
  getMyBarberOnboarding,
  updateMyBarberOnboardingWorkplace,
  finalizeMyBarberOnboarding,
} = createBarberOnboardingController();
