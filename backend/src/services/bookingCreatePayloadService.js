/**
 * Parse consultation and consent from booking create request body.
 * Handles plain objects and JSON-stringified FormData values.
 *
 * @param {Object} body - req.body
 * @returns {Object} { consultation, consent } — both validated objects
 * @throws {Error} with statusCode 400 if invalid
 */
export const parseConsultationAndConsent = (body) => {
  const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  let consultation = body.consultation || {};
  let consent = body.consent || {};

  try {
    if (typeof consultation === "string") consultation = JSON.parse(consultation);
  } catch {
    const error = new Error("Invalid consultation JSON");
    error.statusCode = 400;
    throw error;
  }
  if (!isPlainObject(consultation)) {
    const error = new Error("Invalid consultation JSON");
    error.statusCode = 400;
    throw error;
  }

  try {
    if (typeof consent === "string") consent = JSON.parse(consent);
  } catch {
    const error = new Error("Invalid consent JSON");
    error.statusCode = 400;
    throw error;
  }
  if (!isPlainObject(consent)) {
    const error = new Error("Invalid consent JSON");
    error.statusCode = 400;
    throw error;
  }

  if (consent.accepted === true) {
    if (!consent.textVersion || !consent.textVersion.trim()) {
      const error = new Error("Consent requires a non-empty textVersion");
      error.statusCode = 400;
      throw error;
    }
    consent.acceptedAt = new Date(); // server-authoritative timestamp
  } else {
    consent.accepted = false;
    consent.acceptedAt = null;
  }

  return { consultation, consent };
};