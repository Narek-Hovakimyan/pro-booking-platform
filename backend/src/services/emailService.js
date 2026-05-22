/**
 * Email verification service.
 *
 * In development/test, or when EMAIL_VERIFICATION_LOG_URL=true is set,
 * verification URLs are logged to the console. No real email is sent.
 *
 * In production with EMAIL_PROVIDER=resend and RESEND_API_KEY configured,
 * emails are sent via the Resend SDK.
 */
import { Resend } from "resend";

const RESEND_PROVIDER = "resend";

let createResendClient = (apiKey) => new Resend(apiKey);

export const setResendClientFactoryForTesting = (factory) => {
  createResendClient = factory || ((apiKey) => new Resend(apiKey));
};

/**
 * Build the verification URL for the given user and token.
 *
 * The URL points to the backend API endpoint so that email clients can
 * resolve it without needing a frontend SPA route.
 *
 * @param {string} token
 * @returns {string}
 */
const buildVerificationUrl = (token) => {
  const baseUrl =
    process.env.APP_PUBLIC_URL ||
    `http://localhost:${process.env.PORT || 5000}`;
  return `${baseUrl}/api/users/me/email/verify?token=${token}`;
};

/**
 * Build an HTML email body for verification.
 *
 * @param {Object} options
 * @param {string} options.userName
 * @param {string} options.verificationUrl
 * @returns {string}
 */
const buildVerificationHtml = ({ userName, verificationUrl }) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 480px; margin: 0 auto;">
    <h2 style="font-size: 20px; margin-bottom: 12px;">Verify your email</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #333;">
      Hi${userName ? ` ${userName}` : ""},
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #333;">
      Please click the button below to verify your email address.
    </p>
    <a
      href="${verificationUrl}"
      style="display: inline-block; margin: 16px 0 16px 0; padding: 10px 24px; background-color: #d97706; color: #fff; text-decoration: none; border-radius: 12px; font-size: 14px; font-weight: 600;"
    >
      Verify email
    </a>
    <p style="font-size: 14px; line-height: 1.6; color: #666;">
      If you did not request this, you can safely ignore this email.
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="font-size: 12px; color: #999;">
      HairBook – Find your perfect barber or hairdresser
    </p>
  </body>
</html>`;

/**
 * Build a plain-text email body for verification.
 *
 * @param {Object} options
 * @param {string} options.verificationUrl
 * @returns {string}
 */
const buildVerificationText = ({ verificationUrl }) =>
  `Please verify your email address by visiting this link:\n\n${verificationUrl}\n\nIf you did not request this, you can safely ignore this email.`;

const getResendConfig = () => {
  const provider = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.EMAIL_FROM || "";
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;
  const missing = [];

  if (provider !== RESEND_PROVIDER) missing.push("EMAIL_PROVIDER=resend");
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!from) missing.push("EMAIL_FROM");

  return {
    apiKey,
    from,
    isConfigured:
      provider === RESEND_PROVIDER &&
      Boolean(apiKey) &&
      Boolean(from),
    missing,
    provider,
    replyTo,
  };
};

const shouldLogVerificationUrl = () => {
  return (
    process.env.EMAIL_VERIFICATION_LOG_URL === "true" ||
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  );
};

const warnMissingProvider = ({ userId, missing }) => {
  console.warn(
    `[emailService] Email provider is not configured; verification email was not sent for user "${userId}". Missing env: ${missing.join(", ")}`
  );
};

/**
 * Send an email verification.
 *
 * @param {Object} options
 * @param {Object} options.user - The user model instance.
 * @param {string} options.token - The raw (unhashed) email verification token.
 * @param {import("express").Request} options.req - Express request (unused when APP_PUBLIC_URL is set).
 * @returns {Promise<{ delivered: boolean, provider: string, verificationUrl?: string, id?: string }>}
 */
export const sendEmailVerification = async ({ user, token, req: _req }) => {
  const verificationUrl = buildVerificationUrl(token);
  const resendConfig = getResendConfig();

  // ── Resend provider: send real email when fully configured ───
  if (resendConfig.isConfigured) {
    try {
      const resend = createResendClient(resendConfig.apiKey);

      const payload = {
        from: resendConfig.from,
        to: user.email,
        replyTo: resendConfig.replyTo,
        subject: "Verify your HairBook email",
        html: buildVerificationHtml({
          userName: user.name || "",
          verificationUrl,
        }),
        text: buildVerificationText({ verificationUrl }),
      };

      const response = await resend.emails.send(payload);

      return {
        delivered: true,
        provider: RESEND_PROVIDER,
        id: response?.data?.id || response?.id,
      };
    } catch {
      console.warn(
        `[emailService] Resend delivery failed for user "${user._id}". Check provider logs for details.`
      );
      return { delivered: false, provider: RESEND_PROVIDER };
    }
  }

  // ── Development / test: log the URL when delivery is unavailable ──
  if (shouldLogVerificationUrl()) {
    console.log(
      `[emailService] Verification URL: ${verificationUrl}`
    );
    return { delivered: false, provider: "log", verificationUrl };
  }

  // ── Production: provider not configured ──────────────────────
  warnMissingProvider({ userId: user._id, missing: resendConfig.missing });

  return { delivered: false, provider: "none", verificationUrl: "" };
};
