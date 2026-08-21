import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";
import { Writable } from "node:stream";

import BarberProfile from "../../models/BarberProfile.js";
import MediaObject from "../../models/MediaObject.js";
import User from "../../models/User.js";
import { LocalMediaStore } from "../../services/media/localMediaStore.js";
import { resolveMediaStageKeys } from "../../services/media/mediaStore.js";
import { serveProfileMedia } from "./profileMediaController.js";

const originalMethods = {
  mediaFindOne: MediaObject.findOne,
  mediaExists: MediaObject.exists,
  userExists: User.exists,
  profileExists: BarberProfile.exists,
};
const mediaStore = new LocalMediaStore({ root: `${process.cwd()}/uploads/.profile-media-store` });
const storageKeys = new Set();

afterEach(async () => {
  MediaObject.findOne = originalMethods.mediaFindOne;
  MediaObject.exists = originalMethods.mediaExists;
  User.exists = originalMethods.userExists;
  BarberProfile.exists = originalMethods.profileExists;
  await Promise.all([...storageKeys].map((key) => mediaStore.delete(key).catch(() => {})));
  storageKeys.clear();
});

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const streamResponse = () => {
  const chunks = [];
  const res = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  res.statusCode = 200;
  res.status = function status(code) { this.statusCode = code; return this; };
  res.json = function json(body) { this.body = body; return this; };
  res.setHeader = function setHeader(name, value) { this.headers = { ...(this.headers || {}), [name]: value }; };
  res.type = function type(value) { this.contentType = value; return this; };
  res.sendFile = () => { throw new Error("legacy fallback was not expected"); };
  res.readBody = () => Buffer.concat(chunks).toString();
  return res;
};

const managedMedia = async ({ mediaClass = "profile-avatar", ownerModel = "User", status = "active" } = {}) => {
  const { storageKey, stageKey } = resolveMediaStageKeys({ extension: ".png", uuidFactory: randomUUID });
  await mediaStore.stage({ buffer: Buffer.from("managed-media"), storageKey, stageKey });
  await mediaStore.promote({ storageKey, stageKey });
  storageKeys.add(storageKey);
  return {
    _id: randomUUID(), ownerModel, ownerId: "owner", mediaClass, status,
    access: "public", legacyUrl: "/uploads/avatars/managed.png", storageKey, contentType: "image/png",
  };
};

test("active managed media serves only while bound to its owner avatar", async () => {
  const media = await managedMedia();
  MediaObject.findOne = () => ({ lean: async () => media });
  User.exists = async () => ({ _id: "owner" });
  BarberProfile.exists = async () => null;
  const res = streamResponse();

  await serveProfileMedia({ params: { kind: "avatars", filename: "managed.png" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.readBody(), "managed-media");
});

test("active but unbound managed media returns 404", async () => {
  const media = await managedMedia();
  MediaObject.findOne = () => ({ lean: async () => media });
  User.exists = async () => null;
  BarberProfile.exists = async () => null;
  const res = response();

  await serveProfileMedia({ params: { kind: "avatars", filename: "managed.png" } }, res);

  assert.equal(res.statusCode, 404);
});

test("delete-pending managed media is not exposed through legacy fallback", async () => {
  MediaObject.findOne = () => ({ lean: async () => null });
  MediaObject.exists = async () => ({ _id: "pending" });
  const res = response();

  await serveProfileMedia({ params: { kind: "avatars", filename: "managed.png" } }, res);

  assert.equal(res.statusCode, 404);
});

test("wrong managed owner, class, or reference fails closed", async () => {
  for (const overrides of [
    { ownerModel: "Booking" },
    { mediaClass: "profile-certification" },
    {},
  ]) {
    const media = await managedMedia(overrides);
    MediaObject.findOne = () => ({ lean: async () => media });
    User.exists = async () => null;
    BarberProfile.exists = async () => null;
    const res = response();
    await serveProfileMedia({ params: { kind: "avatars", filename: "managed.png" } }, res);
    assert.equal(res.statusCode, 404);
  }
});

test("profile media controller rejects path traversal before media lookup", async () => {
  const res = response();

  await serveProfileMedia({ params: { kind: "avatars", filename: "../other-user.png" } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "Profile media not found" });
});

test("profile media controller rejects unsupported media paths", async () => {
  const res = response();

  await serveProfileMedia({ params: { kind: "portfolio", filename: "photo.png" } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "Profile media not found" });
});
