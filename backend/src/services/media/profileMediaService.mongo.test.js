import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import MediaObject from "../../models/MediaObject.js";
import BarberProfile from "../../models/BarberProfile.js";
import User from "../../models/User.js";
import {
  addProfileCertificationAtomically,
  clearBarberProfileAvatarAtomically,
  clearUserAvatarAtomically,
  deleteProfileCertificationAtomically,
  replaceProfileCertificationMediaAtomically,
  replaceBarberProfileAvatarAtomically,
  replaceUserAvatarAtomically,
} from "./profileMediaService.js";

const enabled = process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" && Boolean(process.env.MONGO_URI);
const store = { provider: "test", async stage() {}, async promote() {} };
const file = (name) => ({ filename: name, originalname: name, mimetype: "image/png", buffer: Buffer.from(name) });

const connect = async () => {
  const uri = new URL(process.env.MONGO_URI);
  uri.pathname = `/profile_media_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.deleteMany({}), BarberProfile.deleteMany({}), MediaObject.deleteMany({})]);
  await Promise.all([User.createIndexes(), BarberProfile.createIndexes(), MediaObject.createIndexes()]);
};
const createUser = () => User.create({ name: "Avatar User", phone: `+374${Date.now()}${Math.floor(Math.random() * 1000)}`, password: "secret", avatarUrl: "/uploads/avatars/old.png" });
const createProfile = (user, imageUrl = "/uploads/avatars/profile-old.png") =>
  BarberProfile.create({ barberId: user._id, imageUrl });
const certification = (id = new mongoose.Types.ObjectId(), imageUrl = "") => ({
  _id: id,
  title: "Cutting",
  issuedBy: "Academy",
  issueDate: new Date("2020-01-01"),
  expiryDate: null,
  imageUrl,
  description: "",
});

afterEach(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
});

test("real Mongo replacement commits user, activation, and retirement together", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  const old = await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-avatar", access: "public", ownerModel: "User", ownerId: user._id, legacyUrl: user.avatarUrl });
  const saved = await replaceUserAvatarAtomically({ ownerId: user._id, expectedAvatarUrl: user.avatarUrl, file: file("new.png"), mediaStore: store });
  assert.equal(saved.avatarUrl, "/uploads/avatars/new.png");
  assert.equal((await MediaObject.findById(old._id)).status, "delete-pending");
  assert.equal((await MediaObject.findOne({ legacyUrl: saved.avatarUrl })).status, "active");
});

test("real Mongo concurrent replacements have one winner and one cleanup candidate", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  const results = await Promise.allSettled([
    replaceUserAvatarAtomically({ ownerId: user._id, expectedAvatarUrl: user.avatarUrl, file: file("a.png"), mediaStore: store }),
    replaceUserAvatarAtomically({ ownerId: user._id, expectedAvatarUrl: user.avatarUrl, file: file("b.png"), mediaStore: store }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await MediaObject.countDocuments({ status: "active", mediaClass: "profile-avatar" }), 1);
  assert.equal(await MediaObject.countDocuments({ status: "delete-pending", mediaClass: "profile-avatar" }), 1);
});

test("real Mongo activation failure rolls back the user CAS and queues the staged object", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  const failingMediaModel = {
    create: MediaObject.create.bind(MediaObject),
    findByIdAndUpdate: MediaObject.findByIdAndUpdate.bind(MediaObject),
    findOneAndUpdate: async (filter, ...rest) => {
      if (filter?.status === "staged") throw new Error("injected activation failure");
      return MediaObject.findOneAndUpdate(filter, ...rest);
    },
  };
  await assert.rejects(
    replaceUserAvatarAtomically({ ownerId: user._id, expectedAvatarUrl: user.avatarUrl, file: file("rollback.png"), mediaStore: store, MediaObjectModel: failingMediaModel }),
    /injected activation failure/
  );
  assert.equal((await User.findById(user._id)).avatarUrl, "/uploads/avatars/old.png");
  assert.equal((await MediaObject.findOne({ legacyUrl: "/uploads/avatars/rollback.png" })).status, "delete-pending");
});

test("real Mongo clear CAS-retires only its owned avatar", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  const media = await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-avatar", access: "public", ownerModel: "User", ownerId: user._id, legacyUrl: user.avatarUrl });
  const saved = await clearUserAvatarAtomically({ ownerId: user._id, expectedAvatarUrl: user.avatarUrl });
  assert.equal(saved.avatarUrl, "");
  assert.equal((await MediaObject.findById(media._id)).status, "delete-pending");
});

test("real Mongo barber profile replacement atomically swaps both owned references", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  user.role = "barber";
  await user.save();
  const profile = await createProfile(user);
  const old = await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-avatar", access: "public", ownerModel: "User", ownerId: user._id, legacyUrl: profile.imageUrl });
  const saved = await replaceBarberProfileAvatarAtomically({ ownerId: user._id, expectedUserAvatarUrl: user.avatarUrl, expectedProfileImageUrl: profile.imageUrl, file: file("barber-new.png"), mediaStore: store });
  assert.equal(saved.user.avatarUrl, "/uploads/avatars/barber-new.png");
  assert.equal(saved.profile.imageUrl, saved.user.avatarUrl);
  assert.equal((await MediaObject.findById(old._id)).status, "delete-pending");
});

test("real Mongo barber profile concurrent replacement has one winner and never retires it", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  user.role = "barber";
  await user.save();
  const profile = await createProfile(user);
  await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-avatar", access: "public", ownerModel: "User", ownerId: user._id, legacyUrl: profile.imageUrl });
  const results = await Promise.allSettled([
    replaceBarberProfileAvatarAtomically({ ownerId: user._id, expectedUserAvatarUrl: user.avatarUrl, expectedProfileImageUrl: profile.imageUrl, file: file("barber-a.png"), mediaStore: store }),
    replaceBarberProfileAvatarAtomically({ ownerId: user._id, expectedUserAvatarUrl: user.avatarUrl, expectedProfileImageUrl: profile.imageUrl, file: file("barber-b.png"), mediaStore: store }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const saved = await BarberProfile.findOne({ barberId: user._id });
  const winner = await MediaObject.findOne({ legacyUrl: saved.imageUrl });
  assert.equal(winner.status, "active");
});

test("real Mongo barber profile rollback and clear leave no cross-owner retirement", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  user.role = "barber";
  await user.save();
  const profile = await createProfile(user);
  const old = await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-avatar", access: "public", ownerModel: "User", ownerId: user._id, legacyUrl: profile.imageUrl });
  const other = await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-avatar", access: "public", ownerModel: "User", ownerId: new mongoose.Types.ObjectId(), legacyUrl: profile.imageUrl });
  const failingMediaModel = { create: MediaObject.create.bind(MediaObject), findByIdAndUpdate: MediaObject.findByIdAndUpdate.bind(MediaObject), findOneAndUpdate: async (filter, ...rest) => filter?.status === "staged" ? Promise.reject(new Error("injected activation failure")) : MediaObject.findOneAndUpdate(filter, ...rest) };
  await assert.rejects(replaceBarberProfileAvatarAtomically({ ownerId: user._id, expectedUserAvatarUrl: user.avatarUrl, expectedProfileImageUrl: profile.imageUrl, file: file("barber-rollback.png"), mediaStore: store, MediaObjectModel: failingMediaModel }), /injected activation failure/);
  assert.equal((await BarberProfile.findById(profile._id)).imageUrl, profile.imageUrl);
  await clearBarberProfileAvatarAtomically({ ownerId: user._id, expectedUserAvatarUrl: user.avatarUrl, expectedProfileImageUrl: profile.imageUrl });
  assert.equal((await MediaObject.findById(old._id)).status, "delete-pending");
  assert.equal((await MediaObject.findById(other._id)).status, "active");
});

test("real Mongo certification add stages then atomically activates owned media", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  const cert = certification();
  const result = await addProfileCertificationAtomically({ ownerId: user._id, certification: cert, file: file("cert-add.png"), mediaStore: store });
  assert.equal(String(result.certification._id), String(cert._id));
  assert.equal(result.certification.imageUrl, "/uploads/certifications/cert-add.png");
  assert.equal((await MediaObject.findOne({ legacyUrl: result.certification.imageUrl })).status, "active");
});

test("real Mongo certification replacement has one CAS winner and retires only the old owner media", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  const cert = certification(new mongoose.Types.ObjectId(), "/uploads/certifications/old.png");
  await BarberProfile.create({ barberId: user._id, certifications: [cert] });
  const old = await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-certification", access: "public", ownerModel: "User", ownerId: user._id, legacyUrl: cert.imageUrl });
  const results = await Promise.allSettled([
    replaceProfileCertificationMediaAtomically({ ownerId: user._id, certId: cert._id, expectedImageUrl: cert.imageUrl, file: file("cert-a.png"), mediaStore: store }),
    replaceProfileCertificationMediaAtomically({ ownerId: user._id, certId: cert._id, expectedImageUrl: cert.imageUrl, file: file("cert-b.png"), mediaStore: store }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await MediaObject.findById(old._id)).status, "delete-pending");
  const profile = await BarberProfile.findOne({ barberId: user._id });
  assert.equal((await MediaObject.findOne({ legacyUrl: profile.certifications.id(cert._id).imageUrl })).status, "active");
});

test("real Mongo certification rollback and delete are atomic and cross-owner safe", { skip: !enabled }, async () => {
  await connect();
  const user = await createUser();
  const cert = certification(new mongoose.Types.ObjectId(), "/uploads/certifications/delete.png");
  await BarberProfile.create({ barberId: user._id, certifications: [cert] });
  const owned = await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-certification", access: "public", ownerModel: "User", ownerId: user._id, legacyUrl: cert.imageUrl });
  const other = await MediaObject.create({ provider: "test", storageKey: `${new mongoose.Types.ObjectId()}.png`, status: "active", mediaClass: "profile-certification", access: "public", ownerModel: "User", ownerId: new mongoose.Types.ObjectId(), legacyUrl: cert.imageUrl });
  const failing = { create: MediaObject.create.bind(MediaObject), findByIdAndUpdate: MediaObject.findByIdAndUpdate.bind(MediaObject), findOneAndUpdate: async (filter, ...rest) => filter?.status === "staged" ? Promise.reject(new Error("injected activation failure")) : MediaObject.findOneAndUpdate(filter, ...rest) };
  await assert.rejects(replaceProfileCertificationMediaAtomically({ ownerId: user._id, certId: cert._id, expectedImageUrl: cert.imageUrl, file: file("cert-rollback.png"), mediaStore: store, MediaObjectModel: failing }), /injected activation failure/);
  assert.equal((await BarberProfile.findOne({ barberId: user._id })).certifications.id(cert._id).imageUrl, cert.imageUrl);
  await deleteProfileCertificationAtomically({ ownerId: user._id, certId: cert._id, expectedImageUrl: cert.imageUrl });
  assert.equal((await BarberProfile.findOne({ barberId: user._id })).certifications.id(cert._id), null);
  assert.equal((await MediaObject.findById(owned._id)).status, "delete-pending");
  assert.equal((await MediaObject.findById(other._id)).status, "active");
});
