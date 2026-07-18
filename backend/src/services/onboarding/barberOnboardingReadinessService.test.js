import assert from "node:assert/strict";
import { test } from "node:test";

import { createCanonicalPersonalSchedule } from "../../utils/personalScheduleUtils.js";
import { getBarberOnboardingReadiness } from "./barberOnboardingReadinessService.js";

const barberId = "64b000000000000000000001";
const user = {
  _id: barberId,
  name: "Narek",
  phone: "+37400111222",
  city: "Yerevan",
  profession: "barber",
  barberType: "men",
};
const state = (workplace) => ({ status: "in_progress", workplace });
const query = (value, capture, kind) => ({
  select(projection) {
    capture.push({ kind, projection });
    return this;
  },
  lean() { return value; },
});

const dependencies = ({ profile = { address: "Mashtots 1" }, schedule, capture = [] } = {}) => ({
  capture,
  BarberProfileModel: {
    findOne(filter) {
      capture.push({ kind: "profile", filter });
      return query(profile, capture, "profileProjection");
    },
  },
  ScheduleModel: {
    findOne(filter) {
      capture.push({ kind: "schedule", filter });
      return query(schedule === undefined
        ? { weeklySchedule: createCanonicalPersonalSchedule().weeklySchedule }
        : schedule, capture, "scheduleProjection");
    },
  },
});

test("readiness uses canonical independent profile and null-salon schedule facts without exposing data", async () => {
  const deps = dependencies();
  const result = await getBarberOnboardingReadiness(barberId, user, state("independent"), deps);

  assert.equal(result.readyForFinalization, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(deps.capture.find((entry) => entry.kind === "profile").filter, { barberId });
  assert.deepEqual(deps.capture.find((entry) => entry.kind === "schedule").filter, { barberId, salonId: null });
  assert.ok(deps.capture.some((entry) => entry.projection === "address"));
  assert.ok(deps.capture.some((entry) => entry.projection === "weeklySchedule"));
  assert.equal(JSON.stringify(result).includes("Mashtots"), false);
  assert.equal(JSON.stringify(result).includes("weeklySchedule"), false);
});

test("readiness skips profile reads for salon and distinguishes missing and invalid schedules", async () => {
  for (const [schedule, missing] of [
    [null, ["PERSONAL_SCHEDULE_REQUIRED"]],
    [{ weeklySchedule: { mon: { working: true } } }, ["PERSONAL_SCHEDULE_INVALID"]],
  ]) {
    const deps = dependencies({ schedule });
    const result = await getBarberOnboardingReadiness(barberId, user, state("salon"), deps);
    assert.deepEqual(result.missing, missing);
    assert.equal(deps.capture.some((entry) => entry.kind === "profile"), false);
  }
});

test("readiness treats only independent non-empty addresses as finalization facts and propagates reads", async () => {
  for (const profile of [null, { address: "  " }]) {
    const result = await getBarberOnboardingReadiness(
      barberId, user, state("independent"), dependencies({ profile })
    );
    assert.equal(result.readyForReview, true);
    assert.equal(result.readyForFinalization, false);
    assert.deepEqual(result.missing, ["INDEPENDENT_ADDRESS_REQUIRED"]);
  }

  const deps = dependencies();
  deps.ScheduleModel.findOne = () => { throw new Error("database unavailable"); };
  await assert.rejects(getBarberOnboardingReadiness(barberId, user, state("salon"), deps), /database unavailable/);

  const validationFailure = dependencies();
  validationFailure.validatePersonalWeeklySchedule = () => { throw new Error("validator unavailable"); };
  await assert.rejects(
    getBarberOnboardingReadiness(barberId, user, state("salon"), validationFailure),
    /validator unavailable/
  );
});

test("readiness treats both as independent-capable and ignores salon membership state", async () => {
  for (const salons of [
    [],
    [{ salon: "salon-1", status: "pending", worksAsSpecialist: true }],
    [{ salon: "salon-1", status: "rejected", worksAsSpecialist: true }],
    [{ salon: "salon-1", status: "approved", relationshipStatus: "pending", worksAsSpecialist: true }],
  ]) {
    const deps = dependencies();
    const result = await getBarberOnboardingReadiness(
      barberId,
      { ...user, salons },
      state("both"),
      deps
    );

    assert.equal(result.readyForFinalization, true);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(deps.capture.find((entry) => entry.kind === "profile").filter, { barberId });
    assert.deepEqual(deps.capture.find((entry) => entry.kind === "schedule").filter, { barberId, salonId: null });
  }
});

test("readiness requires both address and valid personal schedule for both finalization", async () => {
  for (const [deps, missing] of [
    [dependencies({ profile: null }), ["INDEPENDENT_ADDRESS_REQUIRED"]],
    [dependencies({ schedule: null }), ["PERSONAL_SCHEDULE_REQUIRED"]],
    [dependencies({ schedule: { weeklySchedule: { mon: { working: true } } } }), ["PERSONAL_SCHEDULE_INVALID"]],
  ]) {
    const result = await getBarberOnboardingReadiness(barberId, user, state("both"), deps);
    assert.equal(result.readyForFinalization, false);
    assert.deepEqual(result.missing, missing);
  }
});
