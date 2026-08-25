import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import BarberProfile from "../../models/BarberProfile.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import { serializeAuthUser } from "../../services/auth/authResponseService.js";
import { getMyProfile, updateMyProfile } from "./userController.js";
import { serializeMyProfileResponse } from "./userSerializers.js";

const originalUserFindByIdAndUpdate = User.findByIdAndUpdate;
const originalBarberProfileFindOne = BarberProfile.findOne;
const originalBarberProfileFindOneAndUpdate = BarberProfile.findOneAndUpdate;
const originalSalonFind = Salon.find;
const originalSalonFindById = Salon.findById;

afterEach(() => {
  User.findByIdAndUpdate = originalUserFindByIdAndUpdate;
  BarberProfile.findOne = originalBarberProfileFindOne;
  BarberProfile.findOneAndUpdate = originalBarberProfileFindOneAndUpdate;
  Salon.find = originalSalonFind;
  Salon.findById = originalSalonFindById;
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

const legacyBarber = {
  _id: "64d000000000000000000001",
  name: "Legacy Barber",
  phone: "+37400111222",
  email: "barber@example.com",
  emailVerified: true,
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  city: "Yerevan",
  avatarUrl: "https://example.com/avatar.png",
  role: "barber",
  salon: "64d000000000000000000010",
  salonStatus: "approved",
  salons: [
    {
      salon: "64d000000000000000000010",
      status: "approved",
      isPrimary: false,
      relationshipType: "staff",
      relationshipStatus: "accepted",
      worksAsSpecialist: true,
    },
    {
      salon: "64d000000000000000000011",
      status: "approved",
      relationshipType: "chair_renter",
      relationshipStatus: "accepted",
      worksAsSpecialist: true,
      isPrimary: true,
    },
  ],
  profession: "hair_stylist",
  barberType: "women",
  specialty: "unisex",
  workHistory: [{ salonName: "Previous salon" }],
  favoriteBarbers: ["64d000000000000000000020"],
  favoriteSalons: ["64d000000000000000000010"],
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  password: "private-password",
  authVersion: 7,
  googleId: "private-google-id",
};

const enrichedApprovedSalon = {
  _id: "64d000000000000000000010",
  id: "64d000000000000000000010",
  name: "Primary Salon",
  status: "approved",
  isPrimary: true,
};

const secondApprovedSalon = {
  _id: "64d000000000000000000011",
  id: "64d000000000000000000011",
  name: "Second Salon",
};

const selectedSalons = () => ({
  select: async () => [enrichedApprovedSalon, secondApprovedSalon],
});

const assertCanonicalEndpointFields = (response, user) => {
  const authUser = serializeAuthUser(user);
  for (const [key, value] of Object.entries(authUser)) {
    assert.deepEqual(response[key], value, `preserves canonical ${key}`);
  }
  assert.equal(response.password, undefined);
  assert.equal(response.authVersion, undefined);
  assert.equal(response.googleId, undefined);
  assert.equal(response.resetPasswordTokenHash, undefined);
  assert.equal(response.emailVerificationTokenHash, undefined);
};

test("GET /users/me uses canonical memberships over conflicting legacy salon state", async () => {
  const user = {
    ...legacyBarber,
    salon: "64d000000000000000000099",
    salonStatus: "approved",
  };
  BarberProfile.findOne = async () => ({ bio: "Bio" });
  Salon.find = selectedSalons;

  const res = createResponse();
  await getMyProfile({ user }, res);

  assert.equal(res.statusCode, 200);
  assertCanonicalEndpointFields(res.body, user);
  assert.deepEqual(res.body.salons, user.salons);
  assert.equal(res.body.approvedSalons.length, 2);
  assert.equal(res.body.primarySalon.name, "Second Salon");
  assert.equal(res.body.primarySalon._id, secondApprovedSalon._id);
});

test("GET /users/me falls back to the first approved salon when none is primary", async () => {
  const user = {
    ...legacyBarber,
    salons: legacyBarber.salons.map((membership) => ({ ...membership, isPrimary: false })),
  };
  BarberProfile.findOne = async () => null;
  Salon.find = selectedSalons;

  const res = createResponse();
  await getMyProfile({ user }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.approvedSalons.length, 2);
  assert.equal(res.body.primarySalon._id, enrichedApprovedSalon._id);
});

test("PUT /users/me returns the canonical auth contract through the update serializer path", async () => {
  const user = { ...legacyBarber, authVersion: 7 };
  const updatedUser = { ...user, city: "Gyumri" };
  User.findByIdAndUpdate = async () => updatedUser;
  BarberProfile.findOneAndUpdate = async () => ({
    barberId: user._id,
    city: "Gyumri",
    bio: "Updated bio",
  });
  Salon.find = selectedSalons;

  const res = createResponse();
  await updateMyProfile({
    user,
    body: { city: "Gyumri", bio: "Updated bio" },
  }, res);

  assert.equal(res.statusCode, 200);
  assertCanonicalEndpointFields(res.body, updatedUser);
  assert.deepEqual(res.body.salons, updatedUser.salons);
  assert.equal(res.body.bio, "Updated bio");
  assert.equal(res.body.city, "Gyumri");
  assert.equal(res.body.primarySalon.name, "Second Salon");
});

test("GET /users/me matches auth-session legacy-only raw membership fallback", async () => {
  const user = {
    ...legacyBarber,
    salons: [],
    salon: "64d000000000000000000010",
    salonStatus: "approved",
  };
  const legacySalon = { ...enrichedApprovedSalon };
  BarberProfile.findOne = async () => null;
  Salon.findById = () => ({ select: async () => legacySalon });

  const res = createResponse();
  await getMyProfile({ user }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.salons, serializeAuthUser(user).salons);
  assert.deepEqual(res.body.salons, [{
    salon: user.salon,
    status: "approved",
    isPrimary: true,
  }]);
  assert.deepEqual(res.body.approvedSalons, [{
    ...legacySalon,
    status: "approved",
    isPrimary: true,
    joinedAt: user.createdAt,
  }]);
  assert.equal(res.body.primarySalon.name, "Primary Salon");
});

test("GET and PUT /users/me keep client endpoint payloads onboarding-free", async () => {
  const user = {
    _id: "64d000000000000000000002",
    name: "Client",
    phone: "+37400999888",
    role: "client",
  };
  const getRes = createResponse();
  await getMyProfile({ user }, getRes);

  assert.equal(getRes.statusCode, 200);
  assertCanonicalEndpointFields(getRes.body, user);
  assert.equal("specialistOnboarding" in getRes.body, false);

  const updatedUser = { ...user, city: "Gyumri" };
  User.findByIdAndUpdate = async () => updatedUser;
  const putRes = createResponse();
  await updateMyProfile({ user, body: { city: "Gyumri" } }, putRes);

  assert.equal(putRes.statusCode, 200);
  assertCanonicalEndpointFields(putRes.body, updatedUser);
  assert.equal("specialistOnboarding" in putRes.body, false);
});

test("GET and PUT /users/me preserve the canonical legacy barber auth contract", () => {
  const authUser = serializeAuthUser(legacyBarber);
  const response = serializeMyProfileResponse({
    user: legacyBarber,
    profile: {
      bio: "Bio",
      address: "Address",
      instagram: "@barber",
      imageUrl: "https://example.com/profile.png",
      galleryImages: ["https://example.com/gallery.png"],
    },
    salonsData: [enrichedApprovedSalon],
  });

  for (const [key, value] of Object.entries(authUser)) {
    assert.deepEqual(response[key], value, `preserves canonical ${key}`);
  }
  assert.deepEqual(response.salons, authUser.salons);
  assert.deepEqual(response.approvedSalons, [enrichedApprovedSalon]);
  assert.deepEqual(response.primarySalon, enrichedApprovedSalon);
  assert.equal(response.bio, "Bio");
  assert.equal(response.address, "Address");
  assert.equal(response.instagram, "@barber");
  assert.equal(response.password, undefined);
  assert.equal(response.authVersion, undefined);
  assert.equal(response.googleId, undefined);
});

test("GET and PUT /users/me keep client auth payloads free of specialist onboarding", () => {
  const client = {
    _id: "64d000000000000000000002",
    name: "Client",
    phone: "+37400999888",
    role: "client",
  };
  const authUser = serializeAuthUser(client);
  const response = serializeMyProfileResponse({ user: client });

  assert.deepEqual(response, {
    ...authUser,
    approvedSalons: [],
    primarySalon: null,
    salonName: "",
    bio: "",
    address: "",
    instagram: "",
    imageUrl: "",
    galleryImages: [],
    defaultSchedule: {
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    },
  });
  assert.equal("specialistOnboarding" in response, false);
});

test("GET and PUT /users/me preserve explicit default barber onboarding", () => {
  const user = {
    ...legacyBarber,
    specialistOnboarding: {
      version: 1,
      status: "not_started",
      currentStep: "professional_basics",
      workplace: null,
      completedAt: null,
    },
  };
  const authUser = serializeAuthUser(user);
  const response = serializeMyProfileResponse({ user });

  assert.deepEqual(response.specialistOnboarding, authUser.specialistOnboarding);
});
