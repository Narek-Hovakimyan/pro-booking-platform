import { randomUUID } from "crypto";
import { constants as fsConstants, promises as fs } from "fs";
import os from "os";
import path from "path";

import {
  MEDIA_STORE_ERROR_CODES,
  MediaStore,
  MediaStoreError,
} from "./mediaStore.js";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const STORAGE_KEY_PATTERN = new RegExp("^" + UUID_PATTERN + "(?:\\.[a-z0-9]{1,16})?$");
const STAGE_KEY_PATTERN = new RegExp("^" + UUID_PATTERN + "\\.stage$");
const UNAVAILABLE_CODES = new Set(["EACCES", "EISDIR", "ENOENT", "ENOSPC", "ENOTDIR", "EROFS"]);
const DIRECTORY_FLAGS =
  fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;
const READ_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;
const CREATE_FLAGS =
  fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
const SAFETY_SUPPORTED =
  Number.isInteger(fsConstants.O_NOFOLLOW) &&
  Number.isInteger(fsConstants.O_DIRECTORY);

const normalizeRoot = (root) => path.resolve(root || path.join(os.tmpdir(), "media-store"));
const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;
const contained = (base, target) => {
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const normalizeExtension = (extension = "") => {
  const normalized = String(extension || "").trim().toLowerCase();
  if (!normalized) return "";
  const value = normalized.startsWith(".") ? normalized : "." + normalized;
  if (!/^\.[a-z0-9]{1,16}$/.test(value)) {
    throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.INVALID_KEY, { operation: "stage" });
  }
  return value;
};

const assertKey = (key, pattern, operation) => {
  if (
    typeof key !== "string" ||
    !key ||
    path.isAbsolute(key) ||
    key.includes("/") ||
    key.includes("\\") ||
    !pattern.test(key)
  ) {
    throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.INVALID_KEY, { operation });
  }
  return key;
};

const mapFsError = (error, operation, fallbackCode) => {
  if (error instanceof MediaStoreError) return error;
  if (error?.code === "EEXIST") {
    return new MediaStoreError(MEDIA_STORE_ERROR_CODES.KEY_COLLISION, { operation, cause: error });
  }
  if (error?.code === "ELOOP") {
    return new MediaStoreError(MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED, { operation, cause: error });
  }
  if (error?.code === "ENOENT" && operation !== "stage") {
    return new MediaStoreError(MEDIA_STORE_ERROR_CODES.NOT_FOUND, { operation, cause: error });
  }
  if (UNAVAILABLE_CODES.has(error?.code)) {
    return new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE, {
      operation,
      retryable: true,
      cause: error,
    });
  }
  return new MediaStoreError(fallbackCode, { operation, cause: error });
};

export class LocalMediaStore extends MediaStore {
  #rootsPromise;

  constructor(options = {}) {
    super();
    this.provider = "local";
    this.root = normalizeRoot(options.root);
    this.activeRoot = path.resolve(options.activeRoot || path.join(this.root, "objects"));
    this.stagingRoot = path.resolve(options.stagingRoot || path.join(this.root, "staging"));
    this.uuidFactory = options.uuidFactory || randomUUID;
    this.platform = options.platform || process.platform;
    this.ownerUid = process.geteuid?.();
    this.procFdRoot = "/proc/self/fd";
  }

  async stage({ buffer, stream, extension = "" } = {}) {
    const operation = "stage";
    const storageKey = this.uuidFactory() + normalizeExtension(extension);
    assertKey(storageKey, STORAGE_KEY_PATTERN, operation);
    const stageKey = storageKey.slice(0, 36) + ".stage";
    let handle;
    let roots;
    let created = false;

    try {
      roots = await this.#roots(operation);
      handle = await this.#openNew(roots.staging, stageKey);
      created = true;
      if (stream) await this.#writeStream(handle, stream);
      else await handle.writeFile(buffer ?? "");
      const stat = await this.#regularFile(handle, operation);
      await handle.close();
      handle = null;
      return { provider: this.provider, storageKey, stageKey, bytes: stat.size };
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (created && roots) await this.#unlink(roots.staging, stageKey);
      throw mapFsError(error, operation, MEDIA_STORE_ERROR_CODES.WRITE_FAILED);
    }
  }

  async close() {
    const rootsPromise = this.#rootsPromise;
    this.#rootsPromise = undefined;
    if (!rootsPromise) return;
    const roots = await rootsPromise.catch(() => null);
    if (roots) {
      await Promise.all(
        Object.values(roots).map(({ handle }) => handle.close().catch(() => {}))
      );
    }
  }

  async promote({ stageKey, storageKey } = {}) {
    const operation = "promote";
    let stage;
    let temporary;
    let roots;
    let temporaryKey;
    let published = false;

    try {
      assertKey(stageKey, STAGE_KEY_PATTERN, operation);
      assertKey(storageKey, STORAGE_KEY_PATTERN, operation);
      if (stageKey.slice(0, 36) !== storageKey.split(".")[0]) {
        throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.INVALID_KEY, { operation });
      }

      roots = await this.#roots(operation);
      stage = await this.#openExisting(roots.staging, stageKey);
      const stageStat = await this.#regularFile(stage, operation);
      temporaryKey = ".promote-" + this.uuidFactory();
      temporary = await this.#openNew(roots.active, temporaryKey);
      await this.#copy(stage, temporary);
      const temporaryStat = await this.#regularFile(temporary, operation);
      if (!(await this.#matches(roots.staging, stageKey, stageStat))) {
        throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED, { operation });
      }
      if (!(await this.#matches(roots.active, temporaryKey, temporaryStat))) {
        throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED, { operation });
      }

      await fs.link(this.#at(roots.active, temporaryKey), this.#at(roots.active, storageKey));
      published = true;
      if (!(await this.#matches(roots.active, storageKey, temporaryStat))) {
        throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED, { operation });
      }
      await fs.unlink(this.#at(roots.staging, stageKey));
      await fs.unlink(this.#at(roots.active, temporaryKey));
      await temporary.close();
      await stage.close();
      temporary = null;
      stage = null;
      return { provider: this.provider, storageKey, promoted: true };
    } catch (error) {
      if (temporary) await temporary.close().catch(() => {});
      if (stage) await stage.close().catch(() => {});
      if (roots && temporaryKey) await this.#unlink(roots.active, temporaryKey);
      if (roots && published) await this.#unlink(roots.active, storageKey);
      throw mapFsError(error, operation, MEDIA_STORE_ERROR_CODES.PROMOTE_FAILED);
    }
  }

  async createReadStream(storageKey) {
    const operation = "createReadStream";
    let handle;
    try {
      assertKey(storageKey, STORAGE_KEY_PATTERN, operation);
      const roots = await this.#roots(operation);
      handle = await this.#openExisting(roots.active, storageKey);
      await this.#regularFile(handle, operation);
      const stream = handle.createReadStream({ autoClose: true });
      handle = null;
      return stream;
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      throw mapFsError(error, operation, MEDIA_STORE_ERROR_CODES.READ_FAILED);
    }
  }

  async delete(storageKey) {
    const operation = "delete";
    let handle;
    let tombstone;
    let roots;
    let tombstoneKey;
    let reserved = false;
    let tombstoned = false;

    try {
      assertKey(storageKey, STORAGE_KEY_PATTERN, operation);
      roots = await this.#roots(operation);
      handle = await this.#openExisting(roots.active, storageKey, true);
      if (!handle) return { provider: this.provider, storageKey, deleted: false };
      const stat = await this.#regularFile(handle, operation);
      tombstoneKey = ".delete-" + this.uuidFactory();
      tombstone = await this.#openNew(roots.active, tombstoneKey);
      reserved = true;
      await tombstone.close();
      tombstone = null;
      if (!(await this.#matches(roots.active, storageKey, stat))) {
        throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED, { operation });
      }
      await fs.rename(this.#at(roots.active, storageKey), this.#at(roots.active, tombstoneKey));
      tombstoned = true;
      reserved = false;
      await handle.close();
      handle = null;
      tombstone = await this.#openExisting(roots.active, tombstoneKey);
      const tombstoneStat = await this.#regularFile(tombstone, operation);
      if (!sameIdentity(stat, tombstoneStat)) {
        throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED, { operation });
      }
      await tombstone.close();
      tombstone = null;
      await fs.unlink(this.#at(roots.active, tombstoneKey));
      tombstoned = false;
      return { provider: this.provider, storageKey, deleted: true };
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (tombstone) await tombstone.close().catch(() => {});
      if (roots && reserved) await this.#unlink(roots.active, tombstoneKey);
      if (error?.code === "ENOENT" && !tombstoned) {
        return { provider: this.provider, storageKey, deleted: false };
      }
      throw mapFsError(error, operation, MEDIA_STORE_ERROR_CODES.DELETE_FAILED);
    }
  }

  async #roots(operation) {
    await this.#assertSafetySupport(operation);
    try {
      if (!this.#rootsPromise) this.#rootsPromise = this.#initialize();
      const roots = await this.#rootsPromise;
      await Promise.all(Object.values(roots).map((directory) => this.#assertPinned(directory, operation)));
      return roots;
    } catch (error) {
      throw mapFsError(error, operation, MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE);
    }
  }

  async #assertSafetySupport(operation) {
    if (this.platform !== "linux" || !SAFETY_SUPPORTED || !Number.isInteger(this.ownerUid)) {
      throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.UNSUPPORTED_SAFETY, { operation });
    }
    let handle;
    try {
      handle = await fs.open(this.procFdRoot, DIRECTORY_FLAGS);
      if (!(await handle.stat()).isDirectory()) throw new Error("descriptor bridge unavailable");
    } catch (error) {
      throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.UNSUPPORTED_SAFETY, { operation, cause: error });
    } finally {
      if (handle) await handle.close().catch(() => {});
    }
  }

  async #initialize() {
    const activeSegments = this.#segments(this.activeRoot);
    const stagingSegments = this.#segments(this.stagingRoot);
    let root;
    let active;
    let staging;
    try {
      root = await this.#openAbsolute(this.root);
      await this.#privateDirectory(root);
      active = await this.#openRelative(root, activeSegments);
      staging = await this.#openRelative(root, stagingSegments);
      const rootStat = await this.#privateDirectory(root);
      const activeStat = await this.#privateDirectory(active);
      const stagingStat = await this.#privateDirectory(staging);
      if (sameIdentity(rootStat, activeStat) || sameIdentity(rootStat, stagingStat) ||
          sameIdentity(activeStat, stagingStat)) {
        throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE);
      }
      return {
        root: { handle: root, ...rootStat },
        active: { handle: active, ...activeStat },
        staging: { handle: staging, ...stagingStat },
      };
    } catch (error) {
      await Promise.all([root, active, staging].filter(Boolean).map((handle) => handle.close().catch(() => {})));
      throw error;
    }
  }

  #segments(target) {
    if (!contained(this.root, target)) {
      throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE);
    }
    const relative = path.relative(this.root, target);
    const segments = relative ? relative.split(path.sep) : [];
    if (!segments.length || segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE);
    }
    return segments;
  }

  async #openAbsolute(target) {
    const rootPath = path.parse(target).root;
    const segments = target.slice(rootPath.length).split(path.sep).filter(Boolean);
    let current = await fs.open(rootPath, DIRECTORY_FLAGS);
    try {
      for (const segment of segments) {
        const next = await this.#openDirectory(current, segment);
        await current.close();
        current = next;
      }
      return current;
    } catch (error) {
      await current.close().catch(() => {});
      throw error;
    }
  }

  async #openRelative(root, segments) {
    let current = root;
    let owned = false;
    try {
      for (const segment of segments) {
        const next = await this.#openDirectory(current, segment);
        if (owned) await current.close();
        current = next;
        owned = true;
        await this.#privateDirectory(current);
      }
      return current;
    } catch (error) {
      if (owned) await current.close().catch(() => {});
      throw error;
    }
  }

  async #openDirectory(parent, name) {
    const target = this.#at(parent, name);
    try {
      return await fs.open(target, DIRECTORY_FLAGS);
    } catch (error) {
      if (error?.code === "ELOOP") {
        throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED);
      }
      if (error?.code === "ENOTDIR") {
        const stat = await fs.lstat(target).catch(() => null);
        if (stat?.isSymbolicLink()) {
          throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.SYMLINK_DETECTED);
        }
      }
      if (error?.code !== "ENOENT") throw error;
      try {
        await fs.mkdir(target, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
      }
      return fs.open(target, DIRECTORY_FLAGS);
    }
  }

  async #assertPinned(directory, operation) {
    const stat = await this.#privateDirectory(directory.handle);
    if (!sameIdentity(stat, directory)) {
      throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE, { operation });
    }
  }

  async #privateDirectory(handle) {
    const stat = await handle.stat();
    if (!stat.isDirectory() || stat.uid !== this.ownerUid || (stat.mode & 0o077) !== 0) {
      throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE);
    }
    return stat;
  }

  #at(directory, name) {
    return path.join(this.procFdRoot, String(directory.handle ? directory.handle.fd : directory.fd), name);
  }

  async #openNew(directory, name) {
    return fs.open(this.#at(directory, name), CREATE_FLAGS, 0o600);
  }

  async #openExisting(directory, name, allowMissing = false) {
    try {
      return await fs.open(this.#at(directory, name), READ_FLAGS);
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async #regularFile(handle, operation) {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.NOT_FOUND, { operation });
    if (stat.uid !== this.ownerUid || (stat.mode & 0o077) !== 0) {
      throw new MediaStoreError(MEDIA_STORE_ERROR_CODES.STORAGE_UNAVAILABLE, { operation });
    }
    return stat;
  }

  async #matches(directory, name, expected) {
    let handle;
    try {
      handle = await this.#openExisting(directory, name);
      const stat = await this.#regularFile(handle, "verify");
      return sameIdentity(stat, expected);
    } finally {
      if (handle) await handle.close().catch(() => {});
    }
  }

  async #writeStream(handle, stream) {
    for await (const chunk of stream) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      for (let offset = 0; offset < data.length;) {
        const result = await handle.write(data, offset, data.length - offset);
        if (!result.bytesWritten) throw new Error("stream write failed");
        offset += result.bytesWritten;
      }
    }
  }

  async #copy(source, destination) {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    for (;;) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
      if (!bytesRead) return;
      for (let offset = 0; offset < bytesRead;) {
        const result = await destination.write(buffer, offset, bytesRead - offset);
        if (!result.bytesWritten) throw new Error("copy write failed");
        offset += result.bytesWritten;
      }
      position += bytesRead;
    }
  }

  async #unlink(directory, name) {
    if (!name) return;
    await fs.unlink(this.#at(directory, name)).catch(() => {});
  }
}

export default LocalMediaStore;
