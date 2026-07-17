import assert from "node:assert/strict";
import { test } from "node:test";

import { serializePrivateSelfBarberProfile } from "./privateSelfBarberProfileSerializer.js";

const user = {
  _id: "user-1",
  id: "user-id",
  name: "Narek",
  phone: "+37400000000",
  email: "private@example.com",
  password: "secret",
  role: "barber",
  city: "Yerevan",
  profession: "barber",
  barberType: "women",
  specialty: "men",
  avatarUrl: "/uploads/avatars/user.jpg",
  salon: "salon-private",
  salonStatus: "approved",
  workHistory: [{ salonName: "Private" }],
  subscription: { plan: "private" },
  createdAt: new Date("2026-01-01"),
  __v: 1,
};

const profile = {
  _id: "profile-1",
  id: "profile-id",
  barberId: "user-1",
  city: "Gyumri",
  bio: "Bio",
  address: "Owner address",
  instagram: "@narek",
  imageUrl: "/uploads/avatars/profile.jpg",
  galleryImages: ["/uploads/avatars/a.jpg"],
  defaultSchedule: {
    startTime: "10:00",
    endTime: "19:00",
    hasBreak: true,
    breakStart: "13:00",
    breakEnd: "14:00",
  },
  certifications: [{ title: "Private" }],
  depositSettings: { enabled: true },
  updatedAt: new Date("2026-01-02"),
  unknownFutureField: "private",
};

test("serializes explicit private self fields from plain inputs without mutation", () => {
  const result = serializePrivateSelfBarberProfile({ user, profile });

  assert.deepEqual(result, {
    _id: "profile-id",
    id: "profile-id",
    barberId: "user-1",
    name: "Narek",
    phone: "+37400000000",
    city: "Gyumri",
    profession: "barber",
    barberType: "women",
    specialty: "women",
    avatarUrl: "/uploads/avatars/user.jpg",
    imageUrl: "/uploads/avatars/profile.jpg",
    bio: "Bio",
    address: "Owner address",
    instagram: "@narek",
    galleryImages: ["/uploads/avatars/a.jpg"],
    defaultSchedule: {
      startTime: "10:00",
      endTime: "19:00",
      hasBreak: true,
      breakStart: "13:00",
      breakEnd: "14:00",
    },
  });
  assert.equal(result.email, undefined);
  assert.equal(result.certifications, undefined);
  assert.equal(result.depositSettings, undefined);
  assert.equal(result.salonStatus, undefined);
  assert.equal(result.workHistory, undefined);
  assert.equal(result.subscription, undefined);
  assert.equal(result.createdAt, undefined);
  assert.equal(result.updatedAt, undefined);
  assert.equal(result.__v, undefined);
  assert.equal(result.unknownFutureField, undefined);
  assert.notEqual(result.galleryImages, profile.galleryImages);
  assert.notEqual(result.defaultSchedule, profile.defaultSchedule);
  assert.deepEqual(profile.galleryImages, ["/uploads/avatars/a.jpg"]);
});

test("supports Mongoose-style inputs and missing profile fallback", () => {
  const result = serializePrivateSelfBarberProfile({
    user: { toObject: () => ({ ...user, barberType: "", specialty: "men" }) },
    profile: { toObject: () => ({ barberId: "user-1", galleryImages: ["one", 2] }) },
  });

  assert.equal(result.barberId, "user-1");
  assert.equal(result.name, "Narek");
  assert.equal(result.city, "Yerevan");
  assert.equal(result.specialty, "men");
  assert.deepEqual(result.galleryImages, ["one"]);
  assert.deepEqual(result.defaultSchedule, {
    startTime: "09:00",
    endTime: "18:00",
    hasBreak: false,
    breakStart: "",
    breakEnd: "",
  });
});

test("does not fall back to raw document after conversion failure", () => {
  const result = serializePrivateSelfBarberProfile({
    user: {
      name: "Raw Name",
      toObject() {
        throw new Error("conversion failed");
      },
    },
    profile: null,
  });

  assert.equal(result.name, "");
  assert.equal(result.phone, "");
  assert.deepEqual(result.galleryImages, []);
});
