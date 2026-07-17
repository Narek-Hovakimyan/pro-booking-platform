import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSelfBarberProfileMutationService,
  SelfBarberProfileMutationError,
} from "./selfBarberProfileMutationService.js";

const makeQuery = (result, record) => ({
  select(projection) {
    record.projection = projection;
    return Promise.resolve(result);
  },
});

const createDependencies = ({ userResult, profileResult, userError, profileError } = {}) => {
  const calls = {
    userFindOneAndUpdate: [],
    userFindOne: [],
    profileFindOneAndUpdate: [],
    profileFindOne: [],
    serialized: [],
  };
  const UserModel = {
    findOneAndUpdate(filter, update, options) {
      calls.userFindOneAndUpdate.push({ filter, update, options });
      if (userError) throw userError;
      return makeQuery(userResult, calls.userFindOneAndUpdate.at(-1));
    },
    findOne(filter) {
      calls.userFindOne.push({ filter });
      if (userError) throw userError;
      return makeQuery(userResult, calls.userFindOne.at(-1));
    },
  };
  const BarberProfileModel = {
    findOneAndUpdate(filter, update, options) {
      calls.profileFindOneAndUpdate.push({ filter, update, options });
      if (profileError) throw profileError;
      return makeQuery(profileResult, calls.profileFindOneAndUpdate.at(-1));
    },
    findOne(filter) {
      calls.profileFindOne.push({ filter });
      if (profileError) throw profileError;
      return makeQuery(profileResult, calls.profileFindOne.at(-1));
    },
  };
  const serializePrivateSelfBarberProfile = (payload) => {
    calls.serialized.push(payload);
    return { ok: true, payload };
  };
  const service = createSelfBarberProfileMutationService({
    UserModel,
    BarberProfileModel,
    serializePrivateSelfBarberProfile,
  });

  return { service, calls };
};

test("uses trusted ID only with exact user and profile filters for combined update", async () => {
  const user = { _id: "trusted", role: "barber" };
  const profile = { barberId: "trusted" };
  const { service, calls } = createDependencies({ userResult: user, profileResult: profile });
  const result = await service({
    trustedBarberId: "trusted",
    userUpdates: { name: "Narek" },
    profileUpdates: { bio: "Bio" },
    barberId: "body-id",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.userFindOneAndUpdate[0], {
    filter: { _id: "trusted", role: "barber" },
    update: { $set: { name: "Narek" } },
    options: { returnDocument: "after", runValidators: true },
    projection: "name phone city profession barberType specialty avatarUrl role",
  });
  assert.deepEqual(calls.profileFindOneAndUpdate[0], {
    filter: { barberId: "trusted" },
    update: { $set: { bio: "Bio" }, $setOnInsert: { barberId: "trusted" } },
    options: { returnDocument: "after", runValidators: true, upsert: true },
    projection: "barberId bio city address instagram imageUrl galleryImages defaultSchedule",
  });
  assert.deepEqual(calls.serialized[0], { user, profile });
});

test("supports user-only updates without profile writes or upserts", async () => {
  const user = { _id: "trusted", role: "barber", phone: "1" };
  const profile = { barberId: "trusted", bio: "Bio" };
  const userOnly = createDependencies({ userResult: user, profileResult: profile });
  await userOnly.service({ trustedBarberId: "trusted", userUpdates: { phone: "1" } });
  assert.equal(userOnly.calls.userFindOneAndUpdate.length, 1);
  assert.equal(userOnly.calls.userFindOne.length, 0);
  assert.equal(userOnly.calls.profileFindOneAndUpdate.length, 0);
  assert.deepEqual(userOnly.calls.profileFindOne[0], {
    filter: { barberId: "trusted" },
    projection: "barberId bio city address instagram imageUrl galleryImages defaultSchedule",
  });
  assert.deepEqual(userOnly.calls.serialized[0], { user, profile });
});

test("supports profile-only updates with trusted user reads and exact upsert filters", async () => {
  const user = { _id: "trusted", role: "barber" };
  const profile = { barberId: "trusted", address: "A" };
  const profileOnly = createDependencies({ userResult: user, profileResult: profile });
  await profileOnly.service({ trustedBarberId: "trusted", profileUpdates: { address: "A" } });
  assert.equal(profileOnly.calls.userFindOneAndUpdate.length, 0);
  assert.deepEqual(profileOnly.calls.userFindOne[0], {
    filter: { _id: "trusted", role: "barber" },
    projection: "name phone city profession barberType specialty avatarUrl role",
  });
  assert.deepEqual(profileOnly.calls.profileFindOneAndUpdate[0], {
    filter: { barberId: "trusted" },
    update: { $set: { address: "A" }, $setOnInsert: { barberId: "trusted" } },
    options: { returnDocument: "after", runValidators: true, upsert: true },
    projection: "barberId bio city address instagram imageUrl galleryImages defaultSchedule",
  });
  assert.equal(profileOnly.calls.profileFindOne.length, 0);
  assert.deepEqual(profileOnly.calls.serialized[0], { user, profile });
});

test("supports empty and no-op-only updates without writes or profile creation", async () => {
  for (const payload of [
    { trustedBarberId: "trusted" },
    { trustedBarberId: "trusted", userUpdates: {}, profileUpdates: {} },
  ]) {
    const user = { _id: "trusted", role: "barber" };
    const profile = null;
    const deps = createDependencies({ userResult: user, profileResult: profile });
    const result = await deps.service(payload);

    assert.equal(result.ok, true);
    assert.equal(deps.calls.userFindOneAndUpdate.length, 0);
    assert.equal(deps.calls.profileFindOneAndUpdate.length, 0);
    assert.deepEqual(deps.calls.userFindOne[0], {
      filter: { _id: "trusted", role: "barber" },
      projection: "name phone city profession barberType specialty avatarUrl role",
    });
    assert.deepEqual(deps.calls.profileFindOne[0], {
      filter: { barberId: "trusted" },
      projection: "barberId bio city address instagram imageUrl galleryImages defaultSchedule",
    });
    assert.deepEqual(deps.calls.serialized[0], { user, profile });
  }
});

test("returns bounded failures for missing user and raw write errors", async () => {
  const missing = createDependencies({ userResult: null, profileResult: {} });
  await assert.rejects(
    () => missing.service({ trustedBarberId: "trusted", profileUpdates: { bio: "Bio" } }),
    (error) =>
      error instanceof SelfBarberProfileMutationError &&
      error.code === "BARBER_PROFILE_NOT_FOUND" &&
      error.statusCode === 404
  );
  assert.equal(missing.calls.profileFindOneAndUpdate.length, 0);

  const userFailure = createDependencies({ userError: new Error("duplicate key raw detail") });
  await assert.rejects(
    () => userFailure.service({ trustedBarberId: "trusted", userUpdates: { phone: "1" } }),
    (error) =>
      error instanceof SelfBarberProfileMutationError &&
      error.code === "BARBER_PROFILE_MUTATION_FAILED" &&
      !error.message.includes("duplicate")
  );

  const profileFailure = createDependencies({
    userResult: { _id: "trusted" },
    profileError: new Error("raw profile detail"),
  });
  await assert.rejects(
    () => profileFailure.service({ trustedBarberId: "trusted", profileUpdates: { bio: "Bio" } }),
    (error) =>
      error instanceof SelfBarberProfileMutationError &&
      error.code === "BARBER_PROFILE_MUTATION_FAILED" &&
      !error.message.includes("raw profile")
  );
  assert.equal(profileFailure.calls.userFindOne.length, 1);
});

test("missing trusted user in read-first flows returns bounded failure without profile writes", async () => {
  for (const payload of [
    { trustedBarberId: "trusted" },
    { trustedBarberId: "trusted", profileUpdates: { bio: "Bio" } },
  ]) {
    const missing = createDependencies({ userResult: null, profileResult: {} });
    await assert.rejects(
      () => missing.service(payload),
      (error) =>
        error instanceof SelfBarberProfileMutationError &&
        error.code === "BARBER_PROFILE_NOT_FOUND" &&
        error.statusCode === 404 &&
        !error.message.includes("role")
    );
    assert.equal(missing.calls.profileFindOneAndUpdate.length, 0);
    assert.equal(missing.calls.profileFindOne.length, 0);
  }
});
