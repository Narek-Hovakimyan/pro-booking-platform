import Notification from "../../models/Notification.js";
import { getIO } from "../../socket.js";
import { createHash } from "node:crypto";

let getIOForNotifications = getIO;

const DUPLICATE_KEY_CODE = 11000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const normalizeIdempotencyKey = (idempotencyKey) => {
  if (idempotencyKey === undefined) {
    return undefined;
  }

  if (
    typeof idempotencyKey !== "string" ||
    idempotencyKey.trim().length === 0 ||
    idempotencyKey.trim().length > 512 ||
    !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey.trim())
  ) {
    throw new TypeError("idempotencyKey must be a valid non-empty token");
  }

  return idempotencyKey.trim();
};

const buildInternalHash = (idempotencyKey) => {
  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);

  if (normalizedKey === undefined) {
    return undefined;
  }

  return createHash("sha256").update(normalizedKey).digest("hex");
};

const sanitizeNotification = (notification) => {
  if (!notification || typeof notification !== "object") return notification;

  const plainNotification =
    typeof notification.toObject === "function"
      ? notification.toObject()
      : { ...notification };

  delete plainNotification.internalHash;
  return plainNotification;
};

const persistNotification = async (payload, internalHash, session) => {
  const notificationPayload = internalHash
    ? { ...payload, internalHash }
    : payload;

  try {
    return {
      notification: await Notification.create(notificationPayload, session ? { session } : undefined),
      created: true,
    };
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY_CODE || !internalHash) {
      throw error;
    }

    const existingNotification = await Notification.findOne(
      { internalHash },
      null,
      session ? { session } : undefined
    ).select("+internalHash");

    if (!existingNotification) {
      throw error;
    }

    return {
      notification: existingNotification,
      created: false,
    };
  }
};

export const createNotification = async ({
  userId,
  type,
  message,
  data,
  idempotencyKey,
  session,
  afterCommit,
}) => {
  const payload = { userId, type, message };
  const internalHash = buildInternalHash(idempotencyKey);

  if (data && typeof data === "object") {
    payload.data = data;
  }

  const { notification, created } = await persistNotification(
    payload,
    internalHash,
    session
  );
  const publicNotification = sanitizeNotification(notification);

  const emitNotification = () => {
    const io = getIOForNotifications();

    if (!io || !created) {
      return;
    }

    try {
      io.to(`user:${userId}`).emit("notification", publicNotification);
    } catch {
      // Durable notification creation succeeded, so socket fan-out failures stay non-fatal.
    }
  };

  if (session && typeof afterCommit === "function") {
    afterCommit(emitNotification);
  } else if (!session) {
    emitNotification();
  }

  return publicNotification;
};

export const __notificationServiceTestHooks = {
  setGetIO(nextGetIO) {
    getIOForNotifications = nextGetIO || getIO;
  },
  resetGetIO() {
    getIOForNotifications = getIO;
  },
  sanitizeNotification,
};
