import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BarberProfileMutationPayloadError,
  validateBarberProfileMutationPayload,
} from "./barberProfileMutationPayload.js";

const assertRejectsWithCode = (body, code = "BARBER_PROFILE_FIELDS_INVALID", options) =>
  assert.throws(
    () => validateBarberProfileMutationPayload(body, options),
    (error) => error instanceof BarberProfileMutationPayloadError && error.code === code
  );

const getRejectError = (body, options) => {
  try {
    validateBarberProfileMutationPayload(body, options);
  } catch (error) {
    return error;
  }
  throw new Error("Expected payload validation to fail");
};

const createThrowingProxy = (target, trapName, message = `raw ${trapName} trap`) =>
  new Proxy(target, {
    [trapName]() {
      throw new Error(message);
    },
  });

const assertRejectsWithoutRawMessage = (body, code, rawMessage) => {
  const error = getRejectError(body);
  assert.equal(error instanceof BarberProfileMutationPayloadError, true);
  assert.equal(error.code, code);
  assert.equal(error.message.includes(rawMessage), false);
};

test("accepts valid plain and null-prototype partial payloads without mutation", () => {
  const nullPrototypeBody = Object.assign(Object.create(null), {
    name: "  Narek  ",
    phone: "  +37400000000  ",
    city: "  Yerevan  ",
    profession: "barber",
    barberType: "men",
    bio: "  Bio  ",
    address: "  Owner address  ",
    instagram: "  @narek  ",
    galleryImages: [
      " /uploads/avatars/a.jpg ",
      "/uploads/avatars/a.jpg",
      "https://example.com/b.jpg",
      "",
    ],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "19:00",
      hasBreak: true,
      breakStart: "13:00",
      breakEnd: "14:00",
    },
    specialty: "women",
    salon: "ignored",
    salons: [{ salon: "ignored" }],
    addressContext: { source: "users/me" },
  });
  const beforeKeys = Reflect.ownKeys(nullPrototypeBody);
  const result = validateBarberProfileMutationPayload(nullPrototypeBody);

  assert.deepEqual(result.userUpdates, {
    name: "Narek",
    phone: "+37400000000",
    city: "Yerevan",
    profession: "barber",
    barberType: "men",
  });
  assert.deepEqual(result.profileUpdates, {
    city: "Yerevan",
    bio: "Bio",
    address: "Owner address",
    instagram: "@narek",
    galleryImages: ["/uploads/avatars/a.jpg", "https://example.com/b.jpg"],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "19:00",
      hasBreak: true,
      breakStart: "13:00",
      breakEnd: "14:00",
    },
  });
  assert.deepEqual(Reflect.ownKeys(nullPrototypeBody), beforeKeys);
  assert.notEqual(result.userUpdates, nullPrototypeBody);
  assert.notEqual(result.profileUpdates.galleryImages, nullPrototypeBody.galleryImages);
});

test("empty payload returns fresh empty update objects", () => {
  const result = validateBarberProfileMutationPayload({});

  assert.deepEqual(result, { userUpdates: {}, profileUpdates: {} });
  assert.notEqual(result.userUpdates, result.profileUpdates);
});

test("rejects unsafe top-level payload shapes and descriptors", () => {
  assertRejectsWithCode(null, "INVALID_BARBER_PROFILE_REQUEST");
  assertRejectsWithCode([], "INVALID_BARBER_PROFILE_REQUEST");
  assertRejectsWithCode("name", "INVALID_BARBER_PROFILE_REQUEST");
  assertRejectsWithCode(() => {}, "INVALID_BARBER_PROFILE_REQUEST");
  assertRejectsWithCode(new Date(), "INVALID_BARBER_PROFILE_REQUEST");
  assertRejectsWithCode(new (class Payload {})(), "INVALID_BARBER_PROFILE_REQUEST");
  assertRejectsWithCode(Object.create({ name: "Inherited" }), "INVALID_BARBER_PROFILE_REQUEST");

  const inheritedGetter = Object.create({
    get name() {
      throw new Error("getter invoked");
    },
  });
  assertRejectsWithCode(inheritedGetter, "INVALID_BARBER_PROFILE_REQUEST");

  const ownAccessor = {};
  Object.defineProperty(ownAccessor, "name", {
    enumerable: true,
    get() {
      throw new Error("getter invoked");
    },
  });
  assertRejectsWithCode(ownAccessor);

  const nonEnumerable = {};
  Object.defineProperty(nonEnumerable, "name", { enumerable: false, value: "Narek" });
  assertRejectsWithCode(nonEnumerable);
  assertRejectsWithCode({ [Symbol("name")]: "Narek" });
});

test("bounds top-level Proxy reflection failures as invalid requests", () => {
  assertRejectsWithoutRawMessage(
    createThrowingProxy({}, "getPrototypeOf", "raw top-level prototype trap"),
    "INVALID_BARBER_PROFILE_REQUEST",
    "raw top-level prototype trap"
  );
  assertRejectsWithoutRawMessage(
    createThrowingProxy({}, "ownKeys", "raw top-level ownKeys trap"),
    "INVALID_BARBER_PROFILE_REQUEST",
    "raw top-level ownKeys trap"
  );
  assertRejectsWithoutRawMessage(
    createThrowingProxy({ name: "Narek" }, "getOwnPropertyDescriptor", "raw top-level descriptor trap"),
    "INVALID_BARBER_PROFILE_REQUEST",
    "raw top-level descriptor trap"
  );
});

test("rejects operators, dotted keys, prototype pollution keys, identity, protected, and unknown fields", () => {
  for (const body of [
    { $set: { name: "Narek" } },
    { "profile.name": "Narek" },
    { ["__proto__"]: "x" },
    { constructor: "x" },
    { prototype: "x" },
    { barberId: "other" },
    { userId: "other" },
    { salonName: "Injected Salon" },
    { certifications: [] },
    { depositSettings: {} },
    { salonId: "salon" },
    { subscription: {} },
    { unknownFutureField: true },
  ]) {
    assertRejectsWithCode(body);
  }
});

test("rejects invalid field values and accepts trims/clear semantics", () => {
  assertRejectsWithCode({ name: "   " });
  assertRejectsWithCode({ phone: "" });
  assertRejectsWithCode({ phone: "1".repeat(33) });
  assertRejectsWithCode({ profession: "owner" });
  assertRejectsWithCode({ barberType: "staff" });
  assertRejectsWithCode({ city: null });
  assertRejectsWithCode({ bio: 123 });

  assert.deepEqual(validateBarberProfileMutationPayload({ city: "  " }), {
    userUpdates: { city: "" },
    profileUpdates: { city: "" },
  });
});

test("sanitizes image aliases and rejects invalid or conflicting media", () => {
  assert.deepEqual(
    validateBarberProfileMutationPayload({
      avatarUrl: " /uploads/avatars/a.jpg ",
      imageUrl: "/uploads/avatars/a.jpg",
    }),
    {
      userUpdates: { avatarUrl: "/uploads/avatars/a.jpg" },
      profileUpdates: { imageUrl: "/uploads/avatars/a.jpg" },
    }
  );
  assert.deepEqual(
    validateBarberProfileMutationPayload(
      { avatarUrl: "javascript:alert(1)" },
      { uploadedAvatarPath: "/uploads/avatars/upload.webp" }
    ),
    {
      userUpdates: { avatarUrl: "/uploads/avatars/upload.webp" },
      profileUpdates: { imageUrl: "/uploads/avatars/upload.webp" },
    }
  );

  assertRejectsWithCode({ avatarUrl: "javascript:alert(1)" }, "BARBER_PROFILE_MEDIA_INVALID");
  assertRejectsWithCode(
    { avatarUrl: "/uploads/avatars/a.jpg", imageUrl: "/uploads/avatars/b.jpg" },
    "BARBER_PROFILE_MEDIA_INVALID"
  );
});

test("validates gallery images and default schedule", () => {
  assertRejectsWithCode({ galleryImages: "not-array" });
  assertRejectsWithCode({ galleryImages: ["/uploads/avatars/a.jpg", 123] }, "BARBER_PROFILE_MEDIA_INVALID");
  assertRejectsWithCode({ galleryImages: ["javascript:alert(1)"] }, "BARBER_PROFILE_MEDIA_INVALID");

  assertRejectsWithCode({ defaultSchedule: [] });
  assertRejectsWithCode({ defaultSchedule: { startTime: "bad", endTime: "18:00" } });
  assertRejectsWithCode({ defaultSchedule: { startTime: "18:00", endTime: "09:00" } });
  assertRejectsWithCode({ defaultSchedule: { hasBreak: "true" } });
  assertRejectsWithCode({ defaultSchedule: { $set: "bad" } });
  assertRejectsWithCode({ defaultSchedule: { "start.time": "09:00" } });

  const accessorSchedule = {};
  Object.defineProperty(accessorSchedule, "startTime", {
    enumerable: true,
    get() {
      throw new Error("getter invoked");
    },
  });
  assertRejectsWithCode({ defaultSchedule: accessorSchedule });
});

test("bounds nested object Proxy reflection failures as invalid fields", () => {
  assertRejectsWithoutRawMessage(
    { defaultSchedule: createThrowingProxy({}, "getPrototypeOf", "raw schedule prototype trap") },
    "BARBER_PROFILE_FIELDS_INVALID",
    "raw schedule prototype trap"
  );
  assertRejectsWithoutRawMessage(
    { defaultSchedule: createThrowingProxy({}, "ownKeys", "raw schedule ownKeys trap") },
    "BARBER_PROFILE_FIELDS_INVALID",
    "raw schedule ownKeys trap"
  );
  assertRejectsWithoutRawMessage(
    {
      defaultSchedule: createThrowingProxy(
        { startTime: "09:00" },
        "getOwnPropertyDescriptor",
        "raw schedule descriptor trap"
      ),
    },
    "BARBER_PROFILE_FIELDS_INVALID",
    "raw schedule descriptor trap"
  );
});

test("rejects unsafe gallery array descriptors without invoking element accessors", () => {
  let getterCalls = 0;
  const accessorGallery = [];
  Object.defineProperty(accessorGallery, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("raw gallery getter");
    },
  });
  accessorGallery.length = 1;

  const error = getRejectError({ galleryImages: accessorGallery });
  assert.equal(getterCalls, 0);
  assert.equal(error instanceof BarberProfileMutationPayloadError, true);
  assert.equal(error.code, "BARBER_PROFILE_FIELDS_INVALID");
  assert.equal(error.message.includes("raw gallery getter"), false);

  const withSymbol = ["/uploads/avatars/a.jpg"];
  withSymbol[Symbol("hidden")] = true;
  assertRejectsWithCode({ galleryImages: withSymbol });

  const withExtraProperty = ["/uploads/avatars/a.jpg"];
  withExtraProperty.extra = true;
  assertRejectsWithCode({ galleryImages: withExtraProperty });

  const withNonEnumerable = ["/uploads/avatars/a.jpg"];
  Object.defineProperty(withNonEnumerable, "hidden", { enumerable: false, value: true });
  assertRejectsWithCode({ galleryImages: withNonEnumerable });

  const sparseGallery = [];
  sparseGallery[1] = "/uploads/avatars/a.jpg";
  assertRejectsWithCode({ galleryImages: sparseGallery });

  const customPrototypeGallery = ["/uploads/avatars/a.jpg"];
  Object.setPrototypeOf(customPrototypeGallery, { custom: true });
  assertRejectsWithCode({ galleryImages: customPrototypeGallery });

  const lengthDescriptor = Object.getOwnPropertyDescriptor([], "length");
  assert.equal("value" in lengthDescriptor, true);
  assert.throws(() => Object.defineProperty([], "length", { get: () => 1 }), TypeError);
});

test("bounds gallery array Proxy reflection failures without invoking element accessors", () => {
  let getterCalls = 0;
  const gallery = [];
  Object.defineProperty(gallery, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("raw gallery getter");
    },
  });
  gallery.length = 1;

  assertRejectsWithoutRawMessage(
    { galleryImages: createThrowingProxy(gallery, "getPrototypeOf", "raw gallery prototype trap") },
    "BARBER_PROFILE_FIELDS_INVALID",
    "raw gallery prototype trap"
  );
  assert.equal(getterCalls, 0);

  assertRejectsWithoutRawMessage(
    { galleryImages: createThrowingProxy(["/uploads/avatars/a.jpg"], "ownKeys", "raw gallery ownKeys trap") },
    "BARBER_PROFILE_FIELDS_INVALID",
    "raw gallery ownKeys trap"
  );
  assertRejectsWithoutRawMessage(
    {
      galleryImages: createThrowingProxy(
        ["/uploads/avatars/a.jpg"],
        "getOwnPropertyDescriptor",
        "raw gallery descriptor trap"
      ),
    },
    "BARBER_PROFILE_FIELDS_INVALID",
    "raw gallery descriptor trap"
  );
});

test("rejects unsafe compatibility arrays without persisting or returning ignored values", () => {
  let getterCalls = 0;
  const accessorSalons = [];
  Object.defineProperty(accessorSalons, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("raw salons getter");
    },
  });
  accessorSalons.length = 1;

  const error = getRejectError({ salons: accessorSalons });
  assert.equal(getterCalls, 0);
  assert.equal(error instanceof BarberProfileMutationPayloadError, true);
  assert.equal(error.code, "BARBER_PROFILE_FIELDS_INVALID");
  assert.equal(error.message.includes("raw salons getter"), false);

  const workHistory = [{ title: "ignored" }];
  const result = validateBarberProfileMutationPayload({
    salons: [{ salon: "ignored" }],
    approvedSalons: [],
    workHistory,
  });
  assert.deepEqual(result, { userUpdates: {}, profileUpdates: {} });
  assert.equal("salons" in result.userUpdates, false);
  assert.equal("workHistory" in result.profileUpdates, false);
});

test("bounds compatibility array Proxy reflection failures without persisting ignored fields", () => {
  const error = getRejectError({
    salons: createThrowingProxy([{ salon: "ignored" }], "ownKeys", "raw salons ownKeys trap"),
  });

  assert.equal(error instanceof BarberProfileMutationPayloadError, true);
  assert.equal(error.code, "BARBER_PROFILE_FIELDS_INVALID");
  assert.equal(error.message.includes("raw salons ownKeys trap"), false);

  const result = validateBarberProfileMutationPayload({
    salons: [{ salon: "ignored" }],
  });
  assert.deepEqual(result, { userUpdates: {}, profileUpdates: {} });
  assert.equal("salons" in result.userUpdates, false);
  assert.equal("salons" in result.profileUpdates, false);
});

test("bounds revoked compatibility Proxy array classification failures", () => {
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();

  const error = getRejectError({ salons: proxy });
  assert.equal(error instanceof BarberProfileMutationPayloadError, true);
  assert.equal(error.code, "BARBER_PROFILE_FIELDS_INVALID");
  assert.equal(error.message.includes("Cannot perform 'IsArray'"), false);
});

test("bounds revoked gallery Proxy array classification failures before media sanitization", () => {
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();

  const error = getRejectError({ galleryImages: proxy });
  assert.equal(error instanceof BarberProfileMutationPayloadError, true);
  assert.equal(error.code, "BARBER_PROFILE_FIELDS_INVALID");
  assert.equal(error.message.includes("Cannot perform 'IsArray'"), false);
});

test("bounds revoked approvedSalons Proxy array classification failures", () => {
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();

  const error = getRejectError({ approvedSalons: proxy });
  assert.equal(error instanceof BarberProfileMutationPayloadError, true);
  assert.equal(error.code, "BARBER_PROFILE_FIELDS_INVALID");
  assert.equal(error.message.includes("Cannot perform 'IsArray'"), false);
});

test("accepts dense gallery arrays with stable sanitization without source mutation", () => {
  const galleryImages = [
    " /uploads/avatars/a.jpg ",
    "/uploads/avatars/a.jpg",
    "https://example.com/b.jpg",
    "",
  ];
  const before = [...galleryImages];

  const result = validateBarberProfileMutationPayload({ galleryImages });

  assert.deepEqual(galleryImages, before);
  assert.deepEqual(result.profileUpdates.galleryImages, [
    "/uploads/avatars/a.jpg",
    "https://example.com/b.jpg",
  ]);
  assert.notEqual(result.profileUpdates.galleryImages, galleryImages);
});
