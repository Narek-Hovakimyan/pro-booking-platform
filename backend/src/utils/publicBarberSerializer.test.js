import assert from "node:assert/strict";
import { test } from "node:test";

import mongoose from "mongoose";

import {
  serializePublicBarberCard,
  serializePublicBarberDirectory,
  serializePublicBarberProfile,
  serializePublicBarberProfileRecord,
} from "./publicBarberSerializer.js";

const barber = {
  _id: "barber-1",
  name: "Narek",
  role: "barber",
  phone: "+37400000000",
  email: "private@example.com",
  city: "Yerevan",
  profession: "barber",
  barberType: "men",
  favoriteBarbers: ["private"],
  specialistOnboarding: { status: "completed" },
  loyaltyDiscountSettings: { enabled: true },
  unknownFutureField: "private",
};

const profile = {
  _id: "profile-1",
  barberId: "barber-1",
  city: "Gyumri",
  bio: "Public bio",
  instagram: "public_handle",
  address: "Private Street 1",
  imageUrl: "/profile.jpg",
  galleryImages: ["one.jpg"],
  defaultSchedule: { startTime: "10:00", endTime: "19:00", hasBreak: true },
  depositSettings: { enabled: true },
  certifications: [{ title: "Private" }],
  __v: 4,
  unknownFutureField: "private",
};

test("public directory and card serializers allowlist safe fields without mutation", () => {
  const privateSalonMembership = {
    _id: "salon-1",
    name: "Public Salon",
    city: "Yerevan",
    address: "Salon Street 1",
    isPrimary: true,
    status: "approved",
    joinedAt: new Date("2025-01-01"),
    relationshipType: "chair_renter",
    staffPayment: { fixedAmount: 5000 },
    ownerId: "owner-private",
    admins: ["admin-private"],
    unknownFutureField: "private",
  };
  const input = {
    barber: { ...barber },
    profile: { ...profile },
    salon: privateSalonMembership,
    salons: [privateSalonMembership],
    approvedSalons: [privateSalonMembership],
    primarySalon: privateSalonMembership,
  };
  const first = serializePublicBarberDirectory(input);
  const second = serializePublicBarberCard(input);

  assert.equal(first.city, "Gyumri");
  assert.equal(first.bio, "Public bio");
  assert.equal(first.address, undefined);
  assert.equal(first.phone, undefined);
  assert.equal(first.email, undefined);
  assert.equal(first.favoriteBarbers, undefined);
  assert.equal(first.specialistOnboarding, undefined);
  assert.equal(first.loyaltyDiscountSettings, undefined);
  assert.equal(first.depositSettings, undefined);
  assert.equal(first.unknownFutureField, undefined);
  assert.notEqual(first.galleryImages, second.galleryImages);
  assert.notEqual(first.defaultSchedule, second.defaultSchedule);
  assert.deepEqual(input.profile.galleryImages, ["one.jpg"]);

  for (const salon of [first.salon, first.salons[0], first.approvedSalons[0], first.primarySalon]) {
    assert.equal(salon.address, "Salon Street 1");
    assert.equal(salon.isPrimary, true);
    assert.equal(salon.status, undefined);
    assert.equal(salon.joinedAt, undefined);
    assert.equal(salon.relationshipType, undefined);
    assert.equal(salon.staffPayment, undefined);
    assert.equal(salon.ownerId, undefined);
    assert.equal(salon.admins, undefined);
    assert.equal(salon.unknownFutureField, undefined);
  }
  assert.notEqual(first.salons, second.salons);
  assert.notEqual(first.salons[0], second.salons[0]);
});

test("public profile serializers support Mongoose-style documents and omit private fields", () => {
  const mongooseStyleProfile = {
    toObject() { return { ...profile }; },
  };
  const detail = serializePublicBarberProfile({
    barber,
    profile: mongooseStyleProfile,
    barberId: "barber-1",
  });
  const record = serializePublicBarberProfileRecord(mongooseStyleProfile);

  assert.equal(detail.name, "Narek");
  assert.equal(detail.instagram, "public_handle");
  assert.equal(detail.address, undefined);
  assert.equal(detail.phone, undefined);
  assert.equal(detail.depositSettings, undefined);
  assert.equal(detail.certifications, undefined);
  assert.equal(record.city, "Gyumri");
  assert.equal(record.address, undefined);
  assert.equal(record.__v, undefined);
  assert.equal(record.unknownFutureField, undefined);
});

test("public profile omits salon moderation state and reduces populated work-history salons", () => {
  const populatedSalon = {
    _id: "salon-1",
    name: "Private Salon Name",
    address: "Private Salon Street",
    ownerId: "owner-private",
    admins: ["admin-private"],
    members: ["member-private"],
    staffPayment: { fixedAmount: 5000 },
    unknownFutureField: "private",
  };
  const sourceBarber = {
    ...barber,
    salonStatus: "pending",
    workHistory: [{
      salon: populatedSalon,
      salonName: "Public Salon",
      startDate: new Date("2024-01-01"),
      endDate: null,
      isCurrent: true,
      relationshipType: "chair_renter",
    }],
  };

  const results = [];
  for (const salonStatus of ["pending", "rejected"]) {
    const result = serializePublicBarberProfile({
      barber: { ...sourceBarber, salonStatus },
      profile,
      barberId: "barber-1",
    });

    assert.equal(result.salonStatus, undefined);
    assert.equal(result.workHistory[0].salon, "salon-1");
    assert.equal(result.workHistory[0].relationshipType, undefined);
    assert.equal(result.workHistory[0].salon.address, undefined);
    assert.notEqual(result.workHistory, sourceBarber.workHistory);
    assert.notEqual(result.workHistory[0], sourceBarber.workHistory[0]);
    results.push(result);
  }
  assert.notEqual(results[0].workHistory, results[1].workHistory);
  assert.notEqual(results[0].workHistory[0], results[1].workHistory[0]);
  assert.equal(sourceBarber.workHistory[0].salon, populatedSalon);

  const objectId = new mongoose.Types.ObjectId();
  const objectIdResult = serializePublicBarberProfile({
    barber: {
      ...barber,
      workHistory: [{ salon: objectId, salonName: "ObjectId Salon" }],
    },
    profile,
    barberId: "barber-1",
  });
  assert.equal(objectIdResult.workHistory[0].salon, String(objectId));
});

test("public serializers tolerate missing data and never invoke an address getter", () => {
  const hostileProfile = { city: "Yerevan" };
  Object.defineProperty(hostileProfile, "address", {
    get() { throw new Error("address getter must not run"); },
  });

  const result = serializePublicBarberDirectory({ barber: null, profile: hostileProfile });
  const profileResult = serializePublicBarberProfileRecord(null);

  assert.equal(result.address, undefined);
  assert.equal(result.city, "Yerevan");
  assert.deepEqual(result.galleryImages, []);
  assert.equal(profileResult.address, undefined);
  assert.deepEqual(profileResult.galleryImages, []);
});
