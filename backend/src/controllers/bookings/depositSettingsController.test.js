import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import BarberProfile from "../../models/BarberProfile.js";
import Salon from "../../models/Salon.js";
import User from "../../models/User.js";
import {
  calculateDeposit,
  getMyDepositSettings,
  updateMyDepositSettings,
  updateStaffDepositSettingsBySalonOwner,
} from "./depositSettingsController.js";

const originalMethods = {
  barberProfileFindOne: BarberProfile.findOne,
  salonFindById: Salon.findById,
  userFindById: User.findById,
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

const createRequestLogger = () => {
  const calls = [];
  return {
    calls,
    error(...args) {
      calls.push(args);
    },
  };
};

const assertNoSensitiveLeak = (value) => {
  const logged = JSON.stringify(value);
  assert.equal(logged.includes("hidden@example.com"), false);
  assert.equal(logged.includes("+37400000000"), false);
  assert.equal(logged.includes("payer-secret"), false);
  assert.equal(logged.includes("secret-token"), false);
  assert.equal(logged.includes("authorization"), false);
  assert.equal(logged.includes("private policy text"), false);
  assert.equal(logged.includes("customer policy text"), false);
};

const createRequest = (overrides = {}) => ({
  user: { _id: "barber-1", role: "barber" },
  params: {},
  body: {},
  id: "req-1",
  ...overrides,
});

const createProfile = (settings = {}) => ({
  depositSettings: {
    enabled: false,
    mode: "percentage",
    value: 0,
    minimumBookingPrice: null,
    noShowPolicyText: "",
    ...settings,
  },
  saveCalled: false,
  async save() {
    this.saveCalled = true;
    return this;
  },
});

afterEach(() => {
  BarberProfile.findOne = originalMethods.barberProfileFindOne;
  Salon.findById = originalMethods.salonFindById;
  User.findById = originalMethods.userFindById;
});

describe("calculateDeposit", () => {
  it("returns depositRequired=false when settings are disabled", () => {
    const result = calculateDeposit({ enabled: false }, 100);
    assert.deepEqual(result, { depositRequired: false, depositAmount: 0 });
  });

  it("returns depositRequired=false when settings is null", () => {
    const result = calculateDeposit(null, 100);
    assert.deepEqual(result, { depositRequired: false, depositAmount: 0 });
  });

  it("returns depositRequired=false when finalPrice is 0", () => {
    const result = calculateDeposit({ enabled: true, mode: "percentage", value: 10 }, 0);
    assert.deepEqual(result, { depositRequired: false, depositAmount: 0 });
  });

  it("calculates percentage deposit correctly", () => {
    const result = calculateDeposit({ enabled: true, mode: "percentage", value: 20 }, 200);
    assert.deepEqual(result, { depositRequired: true, depositAmount: 40 });
  });

  it("calculates fixed deposit correctly", () => {
    const result = calculateDeposit({ enabled: true, mode: "fixed", value: 50 }, 200);
    assert.deepEqual(result, { depositRequired: true, depositAmount: 50 });
  });

  it("caps fixed deposit at finalPrice", () => {
    const result = calculateDeposit({ enabled: true, mode: "fixed", value: 500 }, 200);
    assert.deepEqual(result, { depositRequired: true, depositAmount: 200 });
  });

  it("caps percentage at 100%", () => {
    const result = calculateDeposit({ enabled: true, mode: "percentage", value: 150 }, 200);
    assert.deepEqual(result, { depositRequired: true, depositAmount: 200 });
  });

  it("respects minimumBookingPrice threshold (below threshold)", () => {
    const result = calculateDeposit(
      { enabled: true, mode: "fixed", value: 50, minimumBookingPrice: 100 },
      50
    );
    assert.deepEqual(result, { depositRequired: false, depositAmount: 0 });
  });

  it("respects minimumBookingPrice threshold (at or above threshold)", () => {
    const result = calculateDeposit(
      { enabled: true, mode: "fixed", value: 50, minimumBookingPrice: 100 },
      150
    );
    assert.deepEqual(result, { depositRequired: true, depositAmount: 50 });
  });

  it("deposit calculated from discounted finalPrice", () => {
    // Suppose final price is 100 after a 50% discount on a 200 service
    const result = calculateDeposit({ enabled: true, mode: "percentage", value: 10 }, 100);
    assert.deepEqual(result, { depositRequired: true, depositAmount: 10 });
  });

  it("deposit is 0 for percentage of 0", () => {
    const result = calculateDeposit({ enabled: true, mode: "percentage", value: 0 }, 100);
    assert.deepEqual(result, { depositRequired: false, depositAmount: 0 });
  });

  it("deposit is 0 for fixed of 0", () => {
    const result = calculateDeposit({ enabled: true, mode: "fixed", value: 0 }, 100);
    assert.deepEqual(result, { depositRequired: false, depositAmount: 0 });
  });
});

describe("deposit settings controller", () => {
  it("rejects invalid numeric value with 400", async () => {
    const profile = createProfile();
    BarberProfile.findOne = async () => profile;
    const res = createResponse();

    await updateMyDepositSettings(
      {
        user: { _id: "barber-1", role: "barber" },
        body: { enabled: true, mode: "percentage", value: "abc" },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /valid number/);
    assert.equal(profile.saveCalled, false);
  });

  it("rejects invalid minimumBookingPrice with 400", async () => {
    const profile = createProfile();
    BarberProfile.findOne = async () => profile;
    const res = createResponse();

    await updateMyDepositSettings(
      {
        user: { _id: "barber-1", role: "barber" },
        body: { enabled: true, mode: "fixed", value: 10, minimumBookingPrice: "nope" },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /minimumBookingPrice/);
    assert.equal(profile.saveCalled, false);
  });

  it("rejects percentage over 100", async () => {
    const profile = createProfile();
    BarberProfile.findOne = async () => profile;
    const res = createResponse();

    await updateMyDepositSettings(
      {
        user: { _id: "barber-1", role: "barber" },
        body: { enabled: true, mode: "percentage", value: 101 },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /<= 100/);
  });

  it("rejects fixed negative value", async () => {
    const profile = createProfile();
    BarberProfile.findOne = async () => profile;
    const res = createResponse();

    await updateMyDepositSettings(
      {
        user: { _id: "barber-1", role: "barber" },
        body: { enabled: true, mode: "fixed", value: -1 },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, />= 0/);
  });

  it("rejects unsupported requiredFor option", async () => {
    const profile = createProfile();
    BarberProfile.findOne = async () => profile;
    const res = createResponse();

    await updateMyDepositSettings(
      {
        user: { _id: "barber-1", role: "barber" },
        body: {
          enabled: true,
          mode: "percentage",
          value: 20,
          requiredFor: "new_clients",
        },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal("requiredFor" in res.body.depositSettings, false);
  });

  it("rejects too-long noShowPolicyText", async () => {
    const profile = createProfile();
    BarberProfile.findOne = async () => profile;
    const res = createResponse();

    await updateMyDepositSettings(
      {
        user: { _id: "barber-1", role: "barber" },
        body: {
          enabled: true,
          mode: "fixed",
          value: 10,
          noShowPolicyText: "x".repeat(1001),
        },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /1000 characters/);
  });

  it("client cannot access own deposit settings route controller", async () => {
    const res = createResponse();

    await getMyDepositSettings(
      { user: { _id: "client-1", role: "client" } },
      res
    );

    assert.equal(res.statusCode, 403);
  });

  it("barber can access own deposit settings", async () => {
    BarberProfile.findOne = async () => createProfile({ enabled: true, value: 25 });
    const res = createResponse();

    await getMyDepositSettings(
      { user: { _id: "barber-1", role: "barber" } },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.depositSettings.enabled, true);
    assert.equal(res.body.depositSettings.value, 25);
  });

  it("logs structured safe context and preserves 500 response for own deposit read errors", async () => {
    const error = new Error("db failed");
    BarberProfile.findOne = async () => {
      throw error;
    };
    const reqLog = createRequestLogger();
    const req = createRequest({
      user: { _id: "barber-500", role: "barber", email: "hidden@example.com" },
      id: "req-read-1",
      log: reqLog,
    });
    const res = createResponse();

    await getMyDepositSettings(req, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Could not fetch deposit settings" });
    assert.equal(reqLog.calls.length, 1);
    const [context, message] = reqLog.calls[0];
    assert.equal(message, "Could not fetch deposit settings");
    assert.equal(context.event, "deposit_settings.fetch_failed");
    assert.equal(context.requestId, "req-read-1");
    assert.equal(context.userId, "barber-500");
    assert.equal(context.err, error);
    assert.equal("email" in context, false);
    assertNoSensitiveLeak(reqLog.calls);
  });

  it("preserves 500 response when deposit update logger is absent", async () => {
    BarberProfile.findOne = async () => {
      throw new Error("save lookup failed");
    };
    const res = createResponse();

    await updateMyDepositSettings(
      createRequest({
        user: {
          _id: "barber-no-log",
          role: "barber",
          email: "hidden@example.com",
          phone: "+37400000000",
          token: "secret-token",
        },
        body: {
          enabled: true,
          mode: "fixed",
          value: 10,
          noShowPolicyText: "customer policy text",
        },
        log: undefined,
      }),
      res
    );

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Could not update deposit settings" });
  });

  it("preserves 500 response when deposit update logger throws", async () => {
    BarberProfile.findOne = async () => {
      throw new Error("lookup failed");
    };
    const res = createResponse();

    await updateMyDepositSettings(
      createRequest({
        user: { _id: "barber-logger-throws", role: "barber" },
        id: "req-update-1",
        body: { enabled: true, mode: "fixed", value: 10 },
        log: {
          error() {
            throw new Error("logger exploded");
          },
        },
      }),
      res
    );

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Could not update deposit settings" });
  });

  const setupStaffUpdate = ({ relationshipType = "staff", relationshipStatus = "accepted" } = {}) => {
    const profile = createProfile();
    Salon.findById = async () => ({
      _id: "salon-1",
      ownerId: "owner-1",
      admins: [],
    });
    User.findById = async () => ({
      _id: "barber-1",
      role: "barber",
      salons: [
        {
          salon: "salon-1",
          status: "approved",
          relationshipType,
          relationshipStatus,
        },
      ],
    });
    BarberProfile.findOne = async () => profile;
    return profile;
  };

  it("owner can update accepted staff deposit settings", async () => {
    const profile = setupStaffUpdate();
    const res = createResponse();

    await updateStaffDepositSettingsBySalonOwner(
      {
        user: { _id: "owner-1", role: "barber" },
        params: { salonId: "salon-1", barberId: "barber-1" },
        body: { enabled: true, mode: "percentage", value: 20 },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(profile.saveCalled, true);
    assert.equal(res.body.depositSettings.value, 20);
  });

  it("logs structured safe context and preserves 500 response for staff deposit update errors", async () => {
    Salon.findById = async () => ({
      _id: "salon-1",
      ownerId: "owner-1",
      admins: [],
    });
    User.findById = async () => ({
      _id: "barber-2",
      role: "barber",
      salons: [
        {
          salon: "salon-1",
          status: "approved",
          relationshipType: "staff",
          relationshipStatus: "accepted",
        },
      ],
    });
    const error = new Error("write failed");
    BarberProfile.findOne = async () => {
      throw error;
    };
    const reqLog = createRequestLogger();
    const req = createRequest({
      user: { _id: "owner-1", role: "barber", phone: "+37400000000" },
      params: { salonId: "salon-1", barberId: "barber-2" },
      body: {
        enabled: true,
        mode: "fixed",
        value: 15,
        noShowPolicyText: "private policy text",
      },
      id: "req-staff-1",
      log: reqLog,
    });
    const res = createResponse();

    await updateStaffDepositSettingsBySalonOwner(req, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Could not update staff deposit settings" });
    assert.equal(reqLog.calls.length, 1);
    const [context, message] = reqLog.calls[0];
    assert.equal(message, "Could not update staff deposit settings");
    assert.equal(context.event, "deposit_settings.staff_update_failed");
    assert.equal(context.requestId, "req-staff-1");
    assert.equal(context.userId, "owner-1");
    assert.equal(context.salonId, "salon-1");
    assert.equal(context.barberId, "barber-2");
    assert.equal(context.err, error);
    assertNoSensitiveLeak(reqLog.calls);
  });

  it("owner cannot update chair renter deposit settings", async () => {
    const profile = setupStaffUpdate({ relationshipType: "chair_renter" });
    const res = createResponse();

    await updateStaffDepositSettingsBySalonOwner(
      {
        user: { _id: "owner-1", role: "barber" },
        params: { salonId: "salon-1", barberId: "barber-1" },
        body: { enabled: true, mode: "percentage", value: 20 },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(profile.saveCalled, false);
  });

  it("owner cannot update pending staff deposit settings", async () => {
    const profile = setupStaffUpdate({ relationshipStatus: "pending" });
    const res = createResponse();

    await updateStaffDepositSettingsBySalonOwner(
      {
        user: { _id: "owner-1", role: "barber" },
        params: { salonId: "salon-1", barberId: "barber-1" },
        body: { enabled: true, mode: "percentage", value: 20 },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(profile.saveCalled, false);
  });

  it("owner cannot update rejected staff deposit settings", async () => {
    const profile = setupStaffUpdate({ relationshipStatus: "rejected" });
    const res = createResponse();

    await updateStaffDepositSettingsBySalonOwner(
      {
        user: { _id: "owner-1", role: "barber" },
        params: { salonId: "salon-1", barberId: "barber-1" },
        body: { enabled: true, mode: "percentage", value: 20 },
      },
      res
    );

    assert.equal(res.statusCode, 403);
    assert.equal(profile.saveCalled, false);
  });
});
