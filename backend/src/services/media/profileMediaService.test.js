import assert from "node:assert/strict";
import test from "node:test";

import {
  addProfileCertificationAtomically,
  ProfileAvatarConflictError,
  clearUserAvatarAtomically,
  replaceBarberProfileAvatarAtomically,
  replaceUserAvatarAtomically,
} from "./profileMediaService.js";

const ownerId = "507f1f77bcf86cd799439011";
const file = { filename: "avatar.png", originalname: "avatar.png", mimetype: "image/png", buffer: Buffer.from("avatar") };

const createState = ({ avatarUrl = "/uploads/avatars/old.png" } = {}) => {
  const users = new Map([[ownerId, { _id: ownerId, avatarUrl }]]);
  const media = [{ _id: "old", ownerModel: "User", ownerId, legacyUrl: avatarUrl, mediaClass: "profile-avatar", status: "active" }];
  let id = 0;
  const match = (doc, filter) => Object.entries(filter).every(([key, value]) =>
    value?.$in ? value.$in.includes(doc[key]) : doc[key] === value
  );
  const apply = (doc, update) => Object.assign(doc, update.$set || {});
  return {
    users,
    media,
    UserModel: {
      async findOneAndUpdate(filter, update) {
        const user = users.get(filter._id);
        if (!user || user.avatarUrl !== filter.avatarUrl) return null;
        return { ...apply(user, update) };
      },
      async findById(idValue) { return users.get(idValue) ? { ...users.get(idValue) } : null; },
    },
    MediaObjectModel: {
      async create(doc) { const next = { ...doc, _id: `new-${++id}` }; media.push(next); return next; },
      async findOneAndUpdate(filter, update) {
        const item = media.find((entry) => match(entry, filter));
        return item ? { ...apply(item, update) } : null;
      },
      async findByIdAndUpdate(idValue, update) {
        const item = media.find((entry) => entry._id === idValue);
        return item ? { ...apply(item, update) } : null;
      },
    },
  };
};

const mediaStore = {
  provider: "test",
  async stage() {},
  async promote() {},
};
const session = () => ({ async withTransaction(task) { await task(); }, async endSession() {} });

test("replacement atomically activates new avatar and retires only the prior owner object", async () => {
  const state = createState();
  const user = await replaceUserAvatarAtomically({ ...state, ownerId, expectedAvatarUrl: "/uploads/avatars/old.png", file, mediaStore, startSession: async () => session() });
  assert.equal(user.avatarUrl, "/uploads/avatars/avatar.png");
  assert.equal(state.media.find((entry) => entry._id === "old").status, "delete-pending");
  assert.equal(state.media.find((entry) => entry._id === "new-1").status, "active");
});

test("CAS conflict retires only the request-created staged object", async () => {
  const state = createState({ avatarUrl: "/uploads/avatars/winner.png" });
  await assert.rejects(
    replaceUserAvatarAtomically({ ...state, ownerId, expectedAvatarUrl: "/uploads/avatars/old.png", file, mediaStore, startSession: async () => session() }),
    ProfileAvatarConflictError
  );
  assert.equal(state.media.find((entry) => entry._id === "old").status, "active");
  assert.equal(state.media.find((entry) => entry._id === "new-1").status, "delete-pending");
});

const unknownCommit = () => Object.assign(new Error("unknown commit"), {
  errorLabels: ["UnknownTransactionCommitResult"],
});
const unknownSession = (error) => ({
  async withTransaction() { throw error; },
  async endSession() {},
});

test("unknown user-avatar commit with a failed reread never retires staged media", async () => {
  const state = createState();
  state.UserModel.findById = async () => { throw new Error("reread unavailable"); };
  const error = unknownCommit();

  await assert.rejects(
    replaceUserAvatarAtomically({ ...state, ownerId, expectedAvatarUrl: "/uploads/avatars/old.png", file, mediaStore, startSession: async () => unknownSession(error) }),
    (received) => received === error && received.profileMediaCommitOutcomeUnknown === true
  );
  assert.equal(state.media.find((entry) => entry._id === "new-1").status, "staged");
});

test("unknown barber-avatar commit with mismatched reread never retires staged media", async () => {
  const state = createState();
  state.UserModel.findById = async () => ({ _id: ownerId, avatarUrl: "/uploads/avatars/other.png" });
  state.UserModel.findOne = async () => null;
  state.MediaObjectModel.findById = async (id) => state.media.find((entry) => entry._id === id);
  const BarberProfileModel = { findOne: async () => ({ barberId: ownerId, imageUrl: "/uploads/avatars/other.png" }) };
  const error = unknownCommit();

  await assert.rejects(
    replaceBarberProfileAvatarAtomically({
      ...state, ownerId, expectedUserAvatarUrl: "/uploads/avatars/old.png",
      expectedProfileImageUrl: "/uploads/avatars/profile-old.png", file, mediaStore,
      BarberProfileModel, startSession: async () => unknownSession(error),
    }),
    (received) => received === error && received.profileMediaCommitOutcomeUnknown === true
  );
  assert.equal(state.media.find((entry) => entry._id === "new-1").status, "staged");
});

test("unknown avatar commit proven absent queues only its staged media for cleanup", async () => {
  const state = createState();
  state.UserModel.findOne = async () => null;
  state.MediaObjectModel.findById = async (id) => state.media.find((entry) => entry._id === id);
  const error = unknownCommit();

  await assert.rejects(
    replaceUserAvatarAtomically({
      ...state, ownerId, expectedAvatarUrl: "/uploads/avatars/old.png", file, mediaStore,
      BarberProfileModel: { findOne: async () => null }, startSession: async () => unknownSession(error),
    }),
    (received) => received === error && received.profileMediaCommitOutcomeUnknown === undefined
  );
  assert.equal(state.media.find((entry) => entry._id === "new-1").status, "delete-pending");
});

test("clear CAS-removes the exact current avatar and leaves another user's object intact", async () => {
  const state = createState();
  state.media.push({ _id: "other", ownerModel: "User", ownerId: "other", legacyUrl: "/uploads/avatars/old.png", mediaClass: "profile-avatar", status: "active" });
  const user = await clearUserAvatarAtomically({ ...state, ownerId, expectedAvatarUrl: "/uploads/avatars/old.png", startSession: async () => session() });
  assert.equal(user.avatarUrl, "");
  assert.equal(state.media.find((entry) => entry._id === "old").status, "delete-pending");
  assert.equal(state.media.find((entry) => entry._id === "other").status, "active");
});

test("committed certification never receives destructive compensation after verification is unavailable", async () => {
  const media = [];
  let nextId = 0;
  let pendingWrites = 0;
  const certId = "cert-1";
  const stagedFile = { ...file, filename: "cert.png" };
  const result = await addProfileCertificationAtomically({
    ownerId,
    certification: { _id: certId, title: "Cutting" },
    file: stagedFile,
    mediaStore,
    startSession: async () => session(),
    BarberProfileModel: {
      async findOneAndUpdate(_filter, update) {
        return {
          barberId: ownerId,
          certifications: [{ ...update.$push.certifications }],
        };
      },
      async findOne() {
        throw new Error("post-commit reread unavailable");
      },
    },
    MediaObjectModel: {
      async create(doc) {
        const created = { ...doc, _id: `cert-${++nextId}` };
        media.push(created);
        return created;
      },
      async findOneAndUpdate(filter, update) {
        const item = media.find((entry) => entry._id === filter._id && entry.status === filter.status);
        if (!item) return null;
        Object.assign(item, update.$set);
        return { ...item };
      },
      async findByIdAndUpdate(_id, update) {
        if (update.$set?.status === "delete-pending") pendingWrites += 1;
      },
    },
  });

  assert.equal(result.certification.imageUrl, "/uploads/certifications/cert.png");
  assert.equal(media[0].status, "active");
  assert.equal(pendingWrites, 0);
});
