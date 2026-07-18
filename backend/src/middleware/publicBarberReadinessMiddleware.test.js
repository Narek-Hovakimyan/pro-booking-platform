import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import BarberProfile from "../models/BarberProfile.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { requirePublicBarberReadiness } from "./publicBarberReadinessMiddleware.js";
import { createCanonicalPersonalSchedule } from "../utils/personalScheduleUtils.js";

const originals = {
  barberProfileFind: BarberProfile.find,
  scheduleFind: Schedule.find,
  serviceFind: Service.find,
  userFind: User.find,
};

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

const createFindChain = (result) => ({
  select() {
    return this;
  },
  async lean() {
    return result;
  },
});

afterEach(() => {
  BarberProfile.find = originals.barberProfileFind;
  Schedule.find = originals.scheduleFind;
  Service.find = originals.serviceFind;
  User.find = originals.userFind;
});

test("requirePublicBarberReadiness hides unready public barber", async () => {
  const res = createResponse();
  let nextCalled = false;

  User.find = () => createFindChain([
    {
      _id: "barber-unready",
      role: "barber",
      specialistOnboarding: {
        version: 1,
        status: "completed",
        currentStep: null,
        workplace: "independent",
        completedAt: new Date("2026-07-16T10:00:00.000Z"),
      },
    },
  ]);
  BarberProfile.find = async () => [{ barberId: "barber-unready", address: "Ready Street 1" }];
  Schedule.find = async () => [{
    barberId: "barber-unready",
    weeklySchedule: createCanonicalPersonalSchedule().weeklySchedule,
  }];
  Service.find = async () => [];

  await requirePublicBarberReadiness(
    { params: { barberId: "barber-unready" } },
    res,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "Barber not found" });
});

test("requirePublicBarberReadiness lets the owning barber view their own services", async () => {
  const res = createResponse();
  let nextCalled = false;
  let userFindCalled = false;

  User.find = () => {
    userFindCalled = true;
    return createFindChain([]);
  };

  await requirePublicBarberReadiness(
    {
      params: { barberId: "barber-self" },
      user: { _id: "barber-self", role: "barber" },
    },
    res,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(userFindCalled, false);
});
