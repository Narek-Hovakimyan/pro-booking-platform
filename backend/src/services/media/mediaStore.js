export const MEDIA_STORE_ERROR_CODES = Object.freeze({
  INVALID_KEY: "INVALID_KEY",
  KEY_COLLISION: "KEY_COLLISION",
  NOT_FOUND: "NOT_FOUND",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
  UNSUPPORTED_SAFETY: "UNSUPPORTED_SAFETY",
  SYMLINK_DETECTED: "SYMLINK_DETECTED",
  WRITE_FAILED: "WRITE_FAILED",
  PROMOTE_FAILED: "PROMOTE_FAILED",
  READ_FAILED: "READ_FAILED",
  DELETE_FAILED: "DELETE_FAILED",
});

const INTERNAL_CAUSES = new WeakMap();
const PATH_VALUE_KEYS = new Set([
  "cwd",
  "dest",
  "destination",
  "dir",
  "filename",
  "path",
  "root",
]);
const ABSOLUTE_PATH_PATTERN = /(?:[a-zA-Z]:[\\/]|\\\\|\/)(?:[^\s"'<>()[\]{}]*)/g;

const DEFAULT_MESSAGES = Object.freeze({
  [MEDIA_STORE_ERROR_CODES.INVALID_KEY]: "Invalid media storage key",
  [MEDIA_STORE_ERROR_CODES.KEY_COLLISION]: "Media storage key already exists",
  [MEDIA_STORE_ERROR_CODES.NOT_FOUND]: "Media object was not found",
  [MEDIA_STORE_ERROR_CODES.NOT_IMPLEMENTED]: "Media store operation is not implemented",
  [MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE]: "Media storage is unavailable",
  [MEDIA_STORE_ERROR_CODES.UNSUPPORTED_SAFETY]: "Media storage safety is unsupported",
  [MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED]: "Media storage path is not allowed",
  [MEDIA_STORE_ERROR_CODES.WRITE_FAILED]: "Could not stage media object",
  [MEDIA_STORE_ERROR_CODES.PROMOTE_FAILED]: "Could not promote media object",
  [MEDIA_STORE_ERROR_CODES.READ_FAILED]: "Could not read media object",
  [MEDIA_STORE_ERROR_CODES.DELETE_FAILED]: "Could not delete media object",
});

const DEFAULT_STATUSES = Object.freeze({
  [MEDIA_STORE_ERROR_CODES.INVALID_KEY]: 400,
  [MEDIA_STORE_ERROR_CODES.KEY_COLLISION]: 409,
  [MEDIA_STORE_ERROR_CODES.NOT_FOUND]: 404,
  [MEDIA_STORE_ERROR_CODES.NOT_IMPLEMENTED]: 501,
  [MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE]: 503,
  [MEDIA_STORE_ERROR_CODES.UNSUPPORTED_SAFETY]: 503,
  [MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED]: 400,
});

const redactString = (value) => String(value).replace(ABSOLUTE_PATH_PATTERN, "[redacted]");

const sanitizeCause = (value, seen = new WeakSet()) => {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[redacted]";
  seen.add(value);

  if (value instanceof Error) {
    const sanitized = {};
    if (value.name) sanitized.name = redactString(value.name);
    if (value.code != null) sanitized.code = value.code;
    if (value.errno != null) sanitized.errno = value.errno;
    if (value.syscall) sanitized.syscall = redactString(value.syscall);
    if (value.message) sanitized.message = redactString(value.message);
    if ("cause" in value) {
      sanitized.cause = sanitizeCause(value.cause, seen);
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key in sanitized) continue;
      sanitized[key] = PATH_VALUE_KEYS.has(key)
        ? "[redacted]"
        : sanitizeCause(entry, seen);
    }
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeCause(entry, seen));
  }

  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = PATH_VALUE_KEYS.has(key)
      ? "[redacted]"
      : sanitizeCause(entry, seen);
  }
  return sanitized;
};

export class MediaStoreError extends Error {
  constructor(code, options = {}) {
    const safeCode = Object.values(MEDIA_STORE_ERROR_CODES).includes(code)
      ? code
      : MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE;

    super(redactString(options.message || DEFAULT_MESSAGES[safeCode]));
    this.name = "MediaStoreError";
    this.code = safeCode;
    this.operation = options.operation || "";
    this.status = options.status || DEFAULT_STATUSES[safeCode] || 500;
    this.retryable = Boolean(options.retryable);
    if (options.cause !== undefined) {
      INTERNAL_CAUSES.set(this, options.cause);
      this.cause = sanitizeCause(options.cause);
    }
  }

  toJSON() {
    const payload = {
      code: this.code,
      message: this.message,
      operation: this.operation,
      status: this.status,
      retryable: this.retryable,
    };
    if (this.cause !== undefined) payload.cause = this.cause;
    return payload;
  }
}

export class MediaStore {
  async stage() {
    throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.NOT_IMPLEMENTED, {
      operation: "stage",
    });
  }

  async promote() {
    throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.NOT_IMPLEMENTED, {
      operation: "promote",
    });
  }

  async createReadStream() {
    throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.NOT_IMPLEMENTED, {
      operation: "createReadStream",
    });
  }

  async delete() {
    throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.NOT_IMPLEMENTED, {
      operation: "delete",
    });
  }
}

export const isMediaStoreError = (error) => error instanceof MediaStoreError;
