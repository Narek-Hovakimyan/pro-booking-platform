import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

import Booking from "../../models/Booking.js";
import BookingCreateIdempotencyOperation from "../../models/BookingCreateIdempotencyOperation.js";

const MAX_KEY_LENGTH = 200;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const createError = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    return result;
  }, {});
};

const normalizeText = (value) => (value == null ? "" : String(value).trim());

const semanticConsent = (consent = {}) => ({
  accepted: consent?.accepted === true,
  textVersion: normalizeText(consent?.textVersion),
});

const referenceInputFingerprint = async ({ referenceImages = [], referenceUploads = [] }) => {
  if (!referenceUploads.length) {
    return referenceImages.map((referenceImage) => hash(String(referenceImage)));
  }
  return Promise.all(referenceUploads.map(async (file) => {
    let content = file?.buffer;
    if (!Buffer.isBuffer(content) && file?.path) {
      content = await readFile(file.path);
    }
    return {
      content: Buffer.isBuffer(content)
        ? hash(content)
        : hash(JSON.stringify({
            originalname: file?.originalname || "",
            mimetype: file?.mimetype || "",
            size: Number(file?.size) || 0,
          })),
      mimetype: normalizeText(file?.mimetype),
      size: Number(file?.size) || 0,
    };
  }));
};

export const normalizeBookingCreateIdempotencyKey = (value) => {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > MAX_KEY_LENGTH ||
    !KEY_PATTERN.test(value.trim())
  ) {
    throw createError("Idempotency-Key must be a valid non-empty token", 400);
  }
  return value.trim();
};

export const createBookingCreateIdempotencyContext = async ({
  key,
  actorId,
  body,
  barberId,
  clientId,
  serviceId,
  salonId,
  bookingDate,
  dayKey,
  time,
  createdBy,
  consultation,
  consent,
  referenceImages,
  referenceUploads,
}) => ({
  actorId,
  createdBy,
  keyHash: hash(key),
  requestFingerprint: hash(JSON.stringify(canonicalize({
    actorId: String(actorId),
    barberId: String(barberId),
    clientId: clientId ? String(clientId) : null,
    serviceId: String(serviceId),
    salonId: salonId ? String(salonId) : null,
    bookingDate: normalizeText(bookingDate),
    dayKey: normalizeText(dayKey),
    time: normalizeText(time),
    createdBy: normalizeText(createdBy),
    clientName: normalizeText(body.clientName),
    clientPhone: normalizeText(body.clientPhone || body.phone),
    phone: normalizeText(body.phone),
    note: normalizeText(body.note),
    promotionCode: normalizeText(
      body.promotionCode || body.voucherCode || body.voucher_code
    ),
    consultation,
    consent: semanticConsent(consent),
    references: await referenceInputFingerprint({ referenceImages, referenceUploads }),
  }))),
});

const operationFilter = ({ actorId, keyHash }) => ({ actorId, keyHash });

export const findBookingCreateIdempotencyOperation = (context, session = null) => {
  const query = BookingCreateIdempotencyOperation.findOne(
    operationFilter(context),
    null,
    session ? { session } : undefined
  );
  return typeof query?.select === "function"
    ? query.select("+keyHash +requestFingerprint")
    : query;
};

export const assertMatchingBookingCreateIdempotencyOperation = (operation, context) => {
  if (operation.requestFingerprint !== context.requestFingerprint) {
    throw createError("Idempotency-Key was already used with a different request", 409);
  }
  return operation;
};

export const createBookingCreateIdempotencyOperation = (context, bookingId, session) =>
  BookingCreateIdempotencyOperation.create(
    [{ ...operationFilter(context), requestFingerprint: context.requestFingerprint, bookingId, status: "completed" }],
    { session }
  ).then(([operation]) => operation);

export const isDuplicateBookingCreateIdempotencyOperationError = (error) =>
  error?.code === 11000;

export const createBookingCreateIdempotencyLifecycle = async ({
  key,
  actorId,
  request,
}) => {
  if (!key) {
    return {
      findReplay: async () => null,
      findReplayResult: async () => null,
      persist: async () => {},
      isDuplicateError: () => false,
    };
  }

  const context = await createBookingCreateIdempotencyContext({
    key,
    actorId,
    ...request,
  });
  const findReplay = async (session = null) => {
    const operation = await findBookingCreateIdempotencyOperation(context, session);
    if (!operation) return null;
    assertMatchingBookingCreateIdempotencyOperation(operation, context);
    const booking = await Booking.findById(
      operation.bookingId,
      null,
      session ? { session } : undefined
    );
    const bookingActorId = context.createdBy === "barber"
      ? booking?.barberId
      : booking?.clientId;
    return booking
      && String(bookingActorId) === String(context.actorId)
      ? { status: 201, booking, payment: null, idempotencyReplay: true }
      : { status: 503, body: { message: "Booking creation is temporarily unavailable" } };
  };
  const findReplayResult = async (session = null) => {
    try {
      return await findReplay(session);
    } catch (error) {
      const status = Number(error?.statusCode);
      if (!Number.isInteger(status) || status < 400 || status >= 500) throw error;
      return { status, body: { message: error.message } };
    }
  };

  return {
    findReplay,
    findReplayResult,
    persist: (bookingId, session) =>
      createBookingCreateIdempotencyOperation(context, bookingId, session),
    isDuplicateError: isDuplicateBookingCreateIdempotencyOperationError,
  };
};
