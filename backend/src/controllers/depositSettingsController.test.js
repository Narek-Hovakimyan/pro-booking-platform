import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import BarberProfile from "../models/BarberProfile.js";
import Salon from "../models/Salon.js";
import User from "../models/User.js";
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
