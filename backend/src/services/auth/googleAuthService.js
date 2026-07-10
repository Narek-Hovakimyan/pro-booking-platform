import { OAuth2Client } from "google-auth-library";
import { normalizeEmail } from "../utils/emailVerification.js";

let createGoogleClient = () => new OAuth2Client();

export const setGoogleAuthClientFactoryForTesting = (factory) => {
  createGoogleClient = factory || (() => new OAuth2Client());
};

export const verifyGoogleIdToken = async (idToken) => {
  const token = typeof idToken === "string" ? idToken.trim() : "";

  if (!token) {
    throw new Error("Google ID token is required");
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();

  if (!clientId) {
    throw new Error("Google client ID is not configured");
  }

  let payload;

  try {
    const ticket = await createGoogleClient().verifyIdToken({
      idToken: token,
      audience: clientId,
    });
    payload = ticket?.getPayload?.();
  } catch {
    throw new Error("Invalid Google ID token");
  }

  const googleId = typeof payload?.sub === "string" ? payload.sub.trim() : "";
  const email = normalizeEmail(payload?.email);
  const emailVerified = payload?.email_verified === true;

  if (!googleId) {
    throw new Error("Google account identifier is missing");
  }

  if (!email) {
    throw new Error("Google email is missing");
  }

  if (!emailVerified) {
    throw new Error("Google email is not verified");
  }

  return {
    googleId,
    email,
    emailVerified,
    name: typeof payload?.name === "string" ? payload.name.trim() : "",
    picture: typeof payload?.picture === "string" ? payload.picture.trim() : "",
  };
};
