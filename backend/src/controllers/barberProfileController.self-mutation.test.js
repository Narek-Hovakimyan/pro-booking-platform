import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  createBarberProfileSelfMutationController,
} from "./barberProfileController.js";
import { BarberProfileMutationPayloadError } from "../utils/barberProfileMutationPayload.js";

const uploadsDir = path.resolve(process.cwd(), "uploads", "avatars");
const createdFiles = new Set();

afterEach(() => {
  for (const filePath of createdFiles) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore test cleanup
    }
    createdFiles.delete(filePath);
  }
});

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const createUploadedAvatar = (filename) => {
  fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, "avatar");
  createdFiles.add(filePath);
  return { filename };
};

const createThrowingProxy = (target, trapName, message) =>
  new Proxy(target, {
    [trapName]() {
      throw new Error(message);
    },
  });

test("successful authenticated self mutation uses trusted user id and returns service response", async () => {
  const calls = [];
  const controller = createBarberProfileSelfMutationController({
    mutateSelfBarberProfile: async (payload) => {
      calls.push(payload);
      return {
        name: "Narek",
        phone: "+37400000000",
        address: "Owner address",
        certifications: undefined,
        depositSettings: undefined,
      };
    },
  });
  const res = createResponse();

  await controller(
    {
      user: { _id: "trusted" },
      params: { barberId: "trusted" },
      body: {
        name: " Narek ",
        specialty: "unisex",
        salon: "ignored",
        workHistory: [],
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [
    {
      trustedBarberId: "trusted",
      userUpdates: { name: "Narek" },
      profileUpdates: {},
    },
  ]);
  assert.equal(res.body.address, "Owner address");
  assert.equal(res.body.certifications, undefined);
  assert.equal(res.body.depositSettings, undefined);
});

test("route id mismatch returns bounded 403 before validation or service call", async () => {
  let validateCalled = false;
  let serviceCalled = false;
  const controller = createBarberProfileSelfMutationController({
    validateBarberProfileMutationPayload: () => {
      validateCalled = true;
      return { userUpdates: {}, profileUpdates: {} };
    },
    mutateSelfBarberProfile: async () => {
      serviceCalled = true;
      return {};
    },
  });
  const res = createResponse();

  await controller(
    { user: { _id: "trusted" }, params: { barberId: "other" }, body: { name: "Narek" } },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: "BARBER_PROFILE_FORBIDDEN",
    message: "You can edit only your own barber profile",
  });
  assert.equal(validateCalled, false);
  assert.equal(serviceCalled, false);
});

test("invalid body, forbidden fields, invalid media, and service failures map to bounded errors", async () => {
  for (const [body, expectedCode] of [
    [null, "INVALID_BARBER_PROFILE_REQUEST"],
    [{ barberId: "other" }, "BARBER_PROFILE_FIELDS_INVALID"],
    [{ avatarUrl: "javascript:alert(1)" }, "BARBER_PROFILE_MEDIA_INVALID"],
  ]) {
    let serviceCalled = false;
    const controller = createBarberProfileSelfMutationController({
      mutateSelfBarberProfile: async () => {
        serviceCalled = true;
        return {};
      },
    });
    const res = createResponse();

    await controller({ user: { _id: "trusted" }, params: { barberId: "trusted" }, body }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, expectedCode);
    assert.equal(serviceCalled, false);
  }

  const controller = createBarberProfileSelfMutationController({
    mutateSelfBarberProfile: async () => {
      throw new Error("raw database detail");
    },
  });
  const res = createResponse();
  await controller({ user: { _id: "trusted" }, params: { barberId: "trusted" }, body: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    code: "BARBER_PROFILE_MUTATION_FAILED",
    message: "Could not save barber profile",
  });
});

test("uploaded avatar overrides body media and is cleaned after validation or service failure", async () => {
  const successFile = createUploadedAvatar("controller-success.webp");
  const calls = [];
  const controller = createBarberProfileSelfMutationController({
    mutateSelfBarberProfile: async (payload) => {
      calls.push(payload);
      return { imageUrl: "/uploads/avatars/controller-success.webp" };
    },
  });
  const successRes = createResponse();
  await controller(
    {
      user: { _id: "trusted" },
      params: { barberId: "trusted" },
      file: successFile,
      body: { avatarUrl: "javascript:alert(1)", imageUrl: "javascript:alert(1)" },
    },
    successRes
  );
  assert.equal(successRes.statusCode, 200);
  assert.deepEqual(calls[0].userUpdates, {
    avatarUrl: "/uploads/avatars/controller-success.webp",
  });
  assert.equal(fs.existsSync(path.join(uploadsDir, successFile.filename)), true);

  const failureFile = createUploadedAvatar("controller-failure.webp");
  const failingController = createBarberProfileSelfMutationController({
    mutateSelfBarberProfile: async () => {
      throw new Error("raw write failure");
    },
  });
  const failureRes = createResponse();
  await failingController(
    {
      user: { _id: "trusted" },
      params: { barberId: "trusted" },
      file: failureFile,
      body: { name: "Narek" },
    },
    failureRes
  );
  assert.equal(failureRes.statusCode, 500);
  assert.equal(fs.existsSync(path.join(uploadsDir, failureFile.filename)), false);
  createdFiles.delete(path.join(uploadsDir, failureFile.filename));

  const cleanupFailureController = createBarberProfileSelfMutationController({
    validateBarberProfileMutationPayload: () => {
      throw new BarberProfileMutationPayloadError(
        "BARBER_PROFILE_FIELDS_INVALID",
        "Invalid barber profile fields"
      );
    },
  });
  const cleanupFailureRes = createResponse();
  await cleanupFailureController(
    {
      user: { _id: "trusted" },
      params: { barberId: "trusted" },
      file: { filename: "../../outside.webp" },
      body: { name: "Narek" },
    },
    cleanupFailureRes
  );
  assert.equal(cleanupFailureRes.statusCode, 400);
  assert.equal(cleanupFailureRes.body.code, "BARBER_PROFILE_FIELDS_INVALID");
});

test("nested accessor payload maps to bounded 400 without service call and cleans upload", async () => {
  let getterCalls = 0;
  let serviceCalled = false;
  const galleryImages = [];
  Object.defineProperty(galleryImages, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("raw nested getter");
    },
  });
  galleryImages.length = 1;

  const file = createUploadedAvatar("controller-nested-accessor.webp");
  const controller = createBarberProfileSelfMutationController({
    mutateSelfBarberProfile: async () => {
      serviceCalled = true;
      return {};
    },
  });
  const res = createResponse();

  await controller(
    {
      user: { _id: "trusted" },
      params: { barberId: "trusted" },
      file,
      body: { galleryImages },
    },
    res
  );

  assert.equal(getterCalls, 0);
  assert.equal(serviceCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    code: "BARBER_PROFILE_FIELDS_INVALID",
    message: "Invalid barber profile fields",
  });
  assert.equal(JSON.stringify(res.body).includes("raw nested getter"), false);
  assert.equal(fs.existsSync(path.join(uploadsDir, file.filename)), false);
  createdFiles.delete(path.join(uploadsDir, file.filename));
});

test("Proxy inspection failure maps to bounded 400 without service call and cleans upload", async () => {
  let serviceCalled = false;
  const file = createUploadedAvatar("controller-proxy-inspection.webp");
  const controller = createBarberProfileSelfMutationController({
    mutateSelfBarberProfile: async () => {
      serviceCalled = true;
      return {};
    },
  });
  const res = createResponse();

  await controller(
    {
      user: { _id: "trusted" },
      params: { barberId: "trusted" },
      file,
      body: {
        defaultSchedule: createThrowingProxy({}, "getPrototypeOf", "raw proxy trap leak"),
      },
    },
    res
  );

  assert.equal(serviceCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    code: "BARBER_PROFILE_FIELDS_INVALID",
    message: "Invalid barber profile fields",
  });
  assert.equal(JSON.stringify(res.body).includes("raw proxy trap leak"), false);
  assert.equal(fs.existsSync(path.join(uploadsDir, file.filename)), false);
  createdFiles.delete(path.join(uploadsDir, file.filename));
});

test("revoked compatibility Proxy maps to bounded 400 without service call and cleans upload", async () => {
  let serviceCalled = false;
  const priorFile = createUploadedAvatar("controller-prior-avatar.webp");
  const file = createUploadedAvatar("controller-revoked-proxy.webp");
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();
  const controller = createBarberProfileSelfMutationController({
    mutateSelfBarberProfile: async () => {
      serviceCalled = true;
      return {};
    },
  });
  const res = createResponse();

  await controller(
    {
      user: { _id: "trusted" },
      params: { barberId: "trusted" },
      file,
      body: { salons: proxy },
    },
    res
  );

  assert.equal(serviceCalled, false);
  assert.deepEqual(res.body, {
    code: "BARBER_PROFILE_FIELDS_INVALID",
    message: "Invalid barber profile fields",
  });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.stringify(res.body).includes("Cannot perform 'IsArray'"), false);
  assert.equal(fs.existsSync(path.join(uploadsDir, file.filename)), false);
  assert.equal(fs.existsSync(path.join(uploadsDir, priorFile.filename)), true);
  createdFiles.delete(path.join(uploadsDir, file.filename));
});
