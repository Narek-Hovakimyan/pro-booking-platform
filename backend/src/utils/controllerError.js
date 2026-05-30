export const getControllerErrorStatusCode = (
  error,
  { duplicateKeyStatus = 409, fallbackStatus = 500 } = {}
) => {
  if (error?.code === 11000) return duplicateKeyStatus;
  if (error?.statusCode) return error.statusCode;
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return 400;
  }
  return fallbackStatus;
};

export const sendControllerError = (
  res,
  error,
  fallbackMessage,
  { duplicateKeyMessage, duplicateKeyStatus = 409, fallbackStatus = 500 } = {}
) => {
  const statusCode = getControllerErrorStatusCode(error, {
    duplicateKeyStatus,
    fallbackStatus,
  });

  if (statusCode === 500) {
    console.error(fallbackMessage, error);
  }

  const message =
    statusCode === 500
      ? fallbackMessage
      : error?.code === 11000 && duplicateKeyMessage
        ? duplicateKeyMessage
        : error?.message || fallbackMessage;

  return res.status(statusCode).json({ message });
};

/**
 * Escape regex metacharacters so user input is treated as literal text.
 * Use before passing untrusted search terms to $regex to prevent ReDoS.
 */
export const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Normalize a user-provided search term:
 * - trim whitespace
 * - cap length at 100 characters
 * - returns empty string if empty/whitespace only
 * Returns an object { term, isTooLong }.
 */
export const normalizeSearch = (raw) => {
  const term = String(raw || "").trim().slice(0, 100);
  const isTooLong = String(raw || "").trim().length > 100;
  return { term, isTooLong };
};
