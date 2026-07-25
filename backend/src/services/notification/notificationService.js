import Notification from "../../models/Notification.js";
import { getIO } from "../../socket.js";
import { createHash } from "node:crypto";

let getIOForNotifications = getIO;

const DUPLICATE_KEY_CODE = 11000;

const normalizeData = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      const nestedValue = value[key];

      if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
        accumulator[key] = normalizeData(nestedValue);
        return accumulator;
      }

      accumulator[key] = nestedValue;
      return accumulator;
    }, {});
};

const buildInternalHash = ({ idempotencyKey, userId, type, message, data }) => {
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
    return undefined;
  }

  const normalizedPayload = JSON.stringify({
    idempotencyKey: idempotencyKey.trim(),
    userId: String(userId),
    type,
    message,
    data: normalizeData(data),
  });

  return createHash("sha256").update(normalizedPayload).digest("hex");
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

const persistNotification = async (payload, internalHash) => {
  const notificationPayload = internalHash
    ? { ...payload, internalHash }
    : payload;

  try {
    return {
      notification: await Notification.create(notificationPayload),
      created: true,
    };
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY_CODE || !internalHash) {
      throw error;
    }

    const existingNotification = await Notification.findOne({ internalHash }).select(
      "+internalHash"
    );

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
}) => {
  const payload = { userId, type, message };
  const internalHash = buildInternalHash({
    idempotencyKey,
    userId,
    type,
    message,
    data,
  });

  if (data && typeof data === "object") {
    payload.data = data;
  }

  const { notification, created } = await persistNotification(payload, internalHash);
  const publicNotification = sanitizeNotification(notification);
  const io = getIOForNotifications();

  if (io && created) {
    try {
      io.to(`user:${userId}`).emit("notification", publicNotification);
    } catch {
      // Durable notification creation succeeded, so socket fan-out failures stay non-fatal.
    }
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
