import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import BarberProfile from "../../models/BarberProfile.js";
import Schedule from "../../models/Schedule.js";
import Service from "../../models/Service.js";
import User from "../../models/User.js";
import { createCanonicalPersonalSchedule } from "../../utils/personalScheduleUtils.js";
import {
  getPublicBarberReadiness,
  getPublicBarberReadinessByIds,
} from "./publicBarberReadinessService.js";

const originals = {
  barberProfileFind: BarberProfile.find,
  scheduleFind: Schedule.find,
  serviceFind: Service.find,
  userFind: User.find,
};

const workingSchedule = createCanonicalPersonalSchedule().weeklySchedule;
const nonWorkingSchedule = Object.fromEntries(
  Object.entries(workingSchedule).map(([day, value]) => [
    day,
    { ...value, working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  ])
);

const createFindChain = (result) => ({
  select() {
    return this;
  },
  async lean() {
    return result;
  },
});

const completedState = (workplace = "independent") => ({
  version: 1,
  status: "completed",
  currentStep: null,
  workplace,
  completedAt: new Date("2026-07-16T10:00:00.000Z"),
});

afterEach(() => {
  BarberProfile.find = originals.barberProfileFind;
  Schedule.find = originals.scheduleFind;
  Service.find = originals.serviceFind;
  User.find = originals.userFind;
});

test("readiness keeps legacy-compatible independent barbers public only when address, schedule, and active service exist", async () => {
  User.find = () => createFindChain([{ _id: "legacy-barber", role: "barber" }]);
  BarberProfile.find = async () => [{ barberId: "legacy-barber", address: "Legacy Street 1" }];
  Schedule.find = async () => [{ barberId: "legacy-barber", weeklySchedule: workingSchedule }];
  Service.find = async () => [{ barberId: "legacy-barber" }];

  const readiness = await getPublicBarberReadiness("legacy-barber");

  assert.equal(readiness.onboardingReady, true);
  assert.equal(readiness.hasActiveService, true);
  assert.equal(readiness.independentReady, true);
  assert.deepEqual([...readiness.eligibleSalonIds], []);
  assert.equal(readiness.publicReady, true);
});

test("readiness requires finalized v1 onboarding, active service, address, and working schedule for independent barbers", async () => {
  User.find = () => createFindChain([
    {
      _id: "ready-v1",
      role: "barber",
      specialistOnboarding: completedState("independent"),
    },
    {
      _id: "unfinalized-v1",
      role: "barber",
      specialistOnboarding: {
        ...completedState("independent"),
        status: "in_progress",
        currentStep: "review",
        completedAt: null,
      },
    },
    {
      _id: "no-service-v1",
      role: "barber",
      specialistOnboarding: completedState("independent"),
    },
    {
      _id: "no-address-v1",
      role: "barber",
      specialistOnboarding: completedState("independent"),
    },
    {
      _id: "no-schedule-v1",
      role: "barber",
      specialistOnboarding: completedState("independent"),
    },
  ]);
  BarberProfile.find = async () => [
    { barberId: "ready-v1", address: "Ready Street 1" },
    { barberId: "unfinalized-v1", address: "Ready Street 2" },
    { barberId: "no-service-v1", address: "Ready Street 3" },
    { barberId: "no-schedule-v1", address: "Ready Street 4" },
  ];
  Schedule.find = async () => [
    { barberId: "ready-v1", weeklySchedule: workingSchedule },
    { barberId: "unfinalized-v1", weeklySchedule: workingSchedule },
    { barberId: "no-service-v1", weeklySchedule: workingSchedule },
    { barberId: "no-address-v1", weeklySchedule: workingSchedule },
    { barberId: "no-schedule-v1", weeklySchedule: nonWorkingSchedule },
  ];
  Service.find = async () => [
    { barberId: "ready-v1" },
    { barberId: "unfinalized-v1" },
    { barberId: "no-address-v1" },
    { barberId: "no-schedule-v1" },
  ];

  const readiness = await getPublicBarberReadinessByIds([
    "ready-v1",
    "unfinalized-v1",
    "no-service-v1",
    "no-address-v1",
    "no-schedule-v1",
  ]);

  assert.equal(readiness.get("ready-v1").publicReady, true);
  assert.equal(readiness.get("unfinalized-v1").publicReady, false);
  assert.equal(readiness.get("no-service-v1").hasActiveService, false);
  assert.equal(readiness.get("no-service-v1").publicReady, false);
  assert.equal(readiness.get("no-address-v1").independentReady, false);
  assert.equal(readiness.get("no-address-v1").publicReady, false);
  assert.equal(readiness.get("no-schedule-v1").independentReady, false);
  assert.equal(readiness.get("no-schedule-v1").publicReady, false);
});

test("readiness allows approved specialist salon memberships and keeps eligibility scoped per salon", async () => {
  User.find = () => createFindChain([
    {
      _id: "salon-ready",
      role: "barber",
      specialistOnboarding: completedState("salon"),
      salons: [
        { salon: "salon-a", status: "approved", worksAsSpecialist: true },
        { salon: "salon-b", status: "approved", worksAsSpecialist: false },
      ],
    },
  ]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Service.find = async () => [{ barberId: "salon-ready" }];

  const readiness = await getPublicBarberReadiness("salon-ready");

  assert.equal(readiness.onboardingReady, true);
  assert.equal(readiness.hasActiveService, true);
  assert.equal(readiness.independentReady, false);
  assert.deepEqual([...readiness.eligibleSalonIds], ["salon-a"]);
  assert.equal(readiness.publicReady, true);
});

test("readiness rejects pending, rejected, and non-specialist salon memberships", async () => {
  User.find = () => createFindChain([
    {
      _id: "pending-barber",
      role: "barber",
      specialistOnboarding: completedState("salon"),
      salons: [{ salon: "salon-a", status: "approved", relationshipStatus: "pending", worksAsSpecialist: true }],
    },
    {
      _id: "rejected-barber",
      role: "barber",
      specialistOnboarding: completedState("salon"),
      salons: [{ salon: "salon-a", status: "approved", relationshipStatus: "rejected", worksAsSpecialist: true }],
    },
    {
      _id: "non-specialist-barber",
      role: "barber",
      specialistOnboarding: completedState("salon"),
      salons: [{ salon: "salon-a", status: "approved", worksAsSpecialist: false }],
    },
  ]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Service.find = async () => [
    { barberId: "pending-barber" },
    { barberId: "rejected-barber" },
    { barberId: "non-specialist-barber" },
  ];

  const readiness = await getPublicBarberReadinessByIds([
    "pending-barber",
    "rejected-barber",
    "non-specialist-barber",
  ]);

  for (const barberId of ["pending-barber", "rejected-barber", "non-specialist-barber"]) {
    assert.deepEqual([...readiness.get(barberId).eligibleSalonIds], []);
    assert.equal(readiness.get(barberId).publicReady, false);
  }
});

test("readiness keeps unrelated canonical salon memberships from qualifying another salon", async () => {
  User.find = () => createFindChain([
    {
      _id: "cross-salon-barber",
      role: "barber",
      specialistOnboarding: completedState("salon"),
      salons: [{ salon: "salon-b", status: "approved", worksAsSpecialist: true }],
      salon: "salon-a",
      salonStatus: "approved",
    },
  ]);
  BarberProfile.find = async () => [];
  Schedule.find = async () => [];
  Service.find = async () => [{ barberId: "cross-salon-barber" }];

  const readiness = await getPublicBarberReadiness("cross-salon-barber");

  assert.deepEqual([...readiness.eligibleSalonIds], ["salon-b"]);
  assert.equal(readiness.eligibleSalonIds.has("salon-a"), false);
  assert.equal(readiness.publicReady, true);
});
