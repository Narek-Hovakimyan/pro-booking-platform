import assert from "node:assert/strict";
import { describe, test } from "node:test";
import mongoose from "mongoose";
import User from "./User.js";

const phone = (suffix) => `umt${String(suffix).replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;

const runSaveHooks = async (user) => {
  await User.schema.s.hooks.execPre("save", user, []);
  return user;
};

const runFindOneAndUpdateHooks = async (initial, update) => {
  const query = User.findByIdAndUpdate(
    new mongoose.Types.ObjectId(),
    update,
    { returnDocument: "after", runValidators: true }
  );

  await User.schema.s.hooks.execPre("findOneAndUpdate", query, []);

  const finalUpdate = query.getUpdate() || {};
  const directUpdates = Object.fromEntries(
    Object.entries(finalUpdate).filter(([key]) => !key.startsWith("$"))
  );

  return {
    ...initial,
    ...directUpdates,
    ...(finalUpdate.$set || {}),
  };
};

describe("User profession/barberType invariants", () => {

  describe("pre('save') hook", () => {

    test("non-barber profession clears barberType", async () => {
      const user = await runSaveHooks(new User({
        name: "Nail Master",
        phone: phone("test-1"),
        password: "pass",
        role: "barber",
        profession: "nail_master",
        barberType: "men",
      }));
      assert.equal(user.barberType, "");
      assert.equal(user.specialty, "unisex");
    });

    test("barber profession with missing barberType defaults to unisex", async () => {
      const user = await runSaveHooks(new User({
        name: "Default Barber",
        phone: phone("test-2"),
        password: "pass",
        role: "barber",
        profession: "barber",
      }));
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
    });

    test("barber profession with barberType aligns specialty", async () => {
      const user = await runSaveHooks(new User({
        name: "Men Barber",
        phone: phone("test-3"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
      }));
      assert.equal(user.barberType, "men");
      assert.equal(user.specialty, "men");
    });

    test("existing barber clearing barberType resets to unisex", async () => {
      const user = await runSaveHooks(new User({
        name: "Cleared",
        phone: phone("test-4"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "",
      }));
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
    });

    test("barber profession with barberType=unisex aligns specialty=unisex", async () => {
      const user = await runSaveHooks(new User({
        name: "Unisex Barber",
        phone: phone("test-5"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
      }));
      assert.equal(user.barberType, "unisex");
      assert.equal(user.specialty, "unisex");
    });

    test("non-barber keeps specialty=unisex even with invalid specialty", async () => {
      const user = new User({
        name: "Invalid Specialty",
        phone: phone("test-6"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
      });
      user.specialty = "invalid";
      user.profession = "cosmetologist";
      await runSaveHooks(user);
      assert.equal(user.barberType, "");
      assert.equal(["men", "women", "unisex"].includes(user.specialty), true);
    });

  });

  describe("pre('init') backward compatibility", () => {

    test("old user with only specialty derives profession=barber and barberType from specialty", async () => {
      const user = User.hydrate({
        name: "Legacy",
        phone: phone("test-legacy-1"),
        password: "pass",
        role: "barber",
        specialty: "women",
        createdAt: new Date(),
      });
      assert.equal(user.profession, "barber");
      assert.equal(user.barberType, "women");
    });

    test("old user with specialty=men derives correctly", async () => {
      const user = User.hydrate({
        name: "Legacy Men",
        phone: phone("test-legacy-2"),
        password: "pass",
        role: "barber",
        specialty: "men",
        createdAt: new Date(),
      });
      assert.equal(user.profession, "barber");
      assert.equal(user.barberType, "men");
    });

    test("user with explicit profession is NOT overwritten by pre('init')", async () => {
      const user = User.hydrate({
        name: "Explicit Nail",
        phone: phone("test-legacy-3"),
        password: "pass",
        role: "barber",
        profession: "nail_master",
        barberType: "",
        specialty: "unisex",
      });
      assert.equal(user.profession, "nail_master");
      assert.equal(user.barberType, "");
    });

  });

  describe("findByIdAndUpdate (via pre('findOneAndUpdate'))", () => {

    test("update to non-barber profession clears barberType", async () => {
      const user = {
        name: "ToNail",
        phone: phone("test-upd-1"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "men",
        specialty: "men",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { profession: "nail_master" }
      );
      assert.equal(updated.barberType, "");
      assert.equal(updated.specialty, "men"); // specialty unchanged, was "men"
    });

    test("update to non-barber with barberType NEVER overrides specialty", async () => {
      const user = {
        name: "NailOverride",
        phone: phone("test-upd-5"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
        specialty: "unisex",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { profession: "nail_master", barberType: "men" }
      );
      // profession = non-barber → barberType cleared, specialty must NOT follow barberType
      assert.equal(updated.barberType, "", "barberType is cleared for non-barber");
      assert.notEqual(
        updated.specialty, "men",
        "specialty must NOT be set to 'men' when profession is non-barber"
      );
      // specialty keeps its previous database value ("unisex")
      assert.equal(updated.specialty, "unisex");
    });

    test("update to barber with empty barberType defaults to unisex", async () => {
      const user = {
        name: "ToBarberEmpty",
        phone: phone("test-upd-2"),
        password: "pass",
        role: "barber",
        profession: "nail_master",
        barberType: "",
        specialty: "unisex",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { profession: "barber", barberType: "" }
      );
      assert.equal(updated.barberType, "unisex");
      assert.equal(updated.specialty, "unisex");
    });

    test("update barberType aligns specialty", async () => {
      const user = {
        name: "UpdateBarberType",
        phone: phone("test-upd-3"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
        specialty: "unisex",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { barberType: "women" }
      );
      assert.equal(updated.barberType, "women");
      assert.equal(updated.specialty, "women");
    });

    test("update barberType=men aligns specialty=men", async () => {
      const user = {
        name: "UpdateBarberType2",
        phone: phone("test-upd-4"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "unisex",
        specialty: "unisex",
      };

      const updated = await runFindOneAndUpdateHooks(
        user,
        { barberType: "men" }
      );
      assert.equal(updated.barberType, "men");
      assert.equal(updated.specialty, "men");
    });

  });

  describe("pre('save') path: non-barber does not leak specialty", () => {

    test("save non-barber clears barberType, preserves valid legacy specialty", async () => {
      const user = new User({
        name: "SaveNail",
        phone: phone("test-save-1"),
        password: "pass",
        role: "barber",
        profession: "barber",
        barberType: "women",
        specialty: "women",
      });

      // Change to non-barber via save — barberType is cleared, but valid legacy specialty is preserved
      user.profession = "nail_master";
      user.barberType = "men";
      await runSaveHooks(user);

      assert.equal(user.barberType, "", "barberType cleared for non-barber");
      // Legacy specialty stays "women" (valid enum value) — only invalid specialties get normalized
      assert.equal(user.specialty, "women", "valid specialty preserved for backward compat");
    });

  });

  describe("upsertProfile response includes profession/barberType", () => {
    // This is tested via the controller-level responses already added
  });

});

describe("User platform admin role model", () => {
  const makeUser = (overrides = {}) =>
    new User({
      name: "Role Model User",
      phone: phone(overrides.role || overrides.platformRole || "role-model"),
      password: "password123",
      ...overrides,
    });

  test("business role rejects platform_admin", () => {
    const user = makeUser({ role: "platform_admin" });
    const error = user.validateSync();

    assert.ok(error?.errors?.role, "role validation error expected");
    assert.match(error.errors.role.message, /platform_admin/);
  });

  test("business role rejects user", () => {
    const user = makeUser({ role: "user" });
    const error = user.validateSync();

    assert.ok(error?.errors?.role, "role validation error expected");
    assert.match(error.errors.role.message, /user/);
  });

  test("platformRole rejects user", () => {
    const user = makeUser({ role: "client", platformRole: "user" });
    const error = user.validateSync();

    assert.ok(error?.errors?.platformRole, "platformRole validation error expected");
    assert.match(error.errors.platformRole.message, /superuser/);
  });

  test("existing client and barber business roles remain valid without platformRole", () => {
    const client = makeUser({ role: "client" });
    const barber = makeUser({ role: "barber" });

    assert.equal(client.platformRole, undefined);
    assert.equal(barber.platformRole, undefined);
    assert.equal(client.validateSync(), undefined);
    assert.equal(barber.validateSync(), undefined);
  });

  test("platformRole admin is rejected", () => {
    const user = makeUser({ role: "client", platformRole: "admin" });
    const error = user.validateSync();

    assert.ok(error?.errors?.platformRole, "platformRole validation error expected");
    assert.match(error.errors.platformRole.message, /superuser/);
  });

  test("platformRole null is rejected for new users", () => {
    const user = makeUser({ role: "client", platformRole: null });
    const error = user.validateSync();

    assert.ok(error?.errors?.platformRole, "platformRole validation error expected");
    assert.match(error.errors.platformRole.message, /superuser/);
  });

  test("legacy admin and null platformRole values do not block unrelated saves", () => {
    const oldAdmin = User.hydrate({
      _id: "64b000000000000000000011",
      name: "Old Admin",
      phone: phone("legacy-admin"),
      password: "password123",
      role: "client",
      platformRole: "admin",
    });
    oldAdmin.name = "Old Admin Renamed";

    const oldNull = User.hydrate({
      _id: "64b000000000000000000012",
      name: "Old Null",
      phone: phone("legacy-null"),
      password: "password123",
      role: "client",
      platformRole: null,
    });
    oldNull.name = "Old Null Renamed";

    assert.equal(oldAdmin.validateSync(), undefined);
    assert.equal(oldNull.validateSync(), undefined);
  });

  test("platformRole superuser is separate from business role", () => {
    const clientSuperuser = makeUser({ role: "client", platformRole: "superuser" });
    const barberSuperuser = makeUser({ role: "barber", platformRole: "superuser" });

    assert.equal(clientSuperuser.validateSync(), undefined);
    assert.equal(barberSuperuser.validateSync(), undefined);
    assert.equal(clientSuperuser.role, "client");
    assert.equal(barberSuperuser.role, "barber");
    assert.equal(clientSuperuser.platformRole, "superuser");
    assert.equal(barberSuperuser.platformRole, "superuser");
  });

  test("platformRole has partial unique index for one superuser", () => {
    assert.equal(User.schema.path("platformRole").options.default, undefined);
    assert.deepEqual(
      User.schema.indexes().find(([fields]) => fields.platformRole === 1),
      [
        { platformRole: 1 },
        {
          unique: true,
          partialFilterExpression: { platformRole: "superuser" },
        },
      ]
    );
  });
});

describe("User Google auth foundation", () => {
  test("googleId is hidden by default and has sparse unique index", () => {
    assert.equal(User.schema.path("googleId").options.select, false);
    assert.deepEqual(
      User.schema.indexes().find(([fields]) => fields.googleId === 1),
      [{ googleId: 1 }, { unique: true, sparse: true }]
    );
  });

  test("authProviders defaults to password and only allows supported providers", () => {
    const user = new User({
      name: "Provider User",
      phone: phone("provider-user"),
      password: "password123",
    });
    const invalidUser = new User({
      name: "Invalid Provider",
      phone: phone("invalid-provider"),
      password: "password123",
      authProviders: ["facebook"],
    });

    assert.deepEqual(user.authProviders, ["password"]);
    assert.equal(user.validateSync(), undefined);
    assert.ok(invalidUser.validateSync()?.errors?.["authProviders.0"]);
  });

  test("password remains required for password users but not Google-only users", () => {
    const passwordUser = new User({
      name: "Password User",
      phone: phone("password-required"),
      authProviders: ["password"],
    });
    const googleUser = new User({
      name: "Google User",
      phone: phone("google-no-password"),
      email: "google@example.com",
      googleId: "google-sub",
      authProviders: ["google"],
    });

    assert.ok(passwordUser.validateSync()?.errors?.password);
    assert.equal(googleUser.validateSync(), undefined);
  });
});

describe("User role-specific defaults", () => {
  test("new client users do not receive barber-only defaults", () => {
    const user = new User({
      name: "Clean Client",
      phone: phone("clean-client"),
      email: "clean-client@example.com",
      password: "password123",
      role: "client",
    });
    const raw = user.toObject();

    assert.equal(raw.role, "client");
    assert.deepEqual(raw.favoriteBarbers, []);
    assert.deepEqual(raw.favoriteSalons, []);
    assert.equal("profession" in raw, false);
    assert.equal("barberType" in raw, false);
    assert.equal("specialty" in raw, false);
    assert.equal("loyaltyDiscountSettings" in raw, false);
    assert.equal("workHistory" in raw, false);
    assert.equal("salons" in raw, false);
    assert.equal("salon" in raw, false);
    assert.equal("salonStatus" in raw, false);
  });

  test("new barber users keep barber defaults", async () => {
    const user = await runSaveHooks(new User({
      name: "Defaulted Barber",
      phone: phone("defaulted-barber"),
      email: "defaulted-barber@example.com",
      password: "password123",
      role: "barber",
    }));
    const raw = user.toObject();

    assert.equal(raw.role, "barber");
    assert.equal(raw.profession, "barber");
    assert.equal(raw.barberType, "unisex");
    assert.equal(raw.specialty, "unisex");
    assert.deepEqual(raw.salons, []);
    assert.equal(raw.salon, null);
    assert.equal(raw.salonStatus, "none");
    assert.deepEqual(raw.workHistory, []);
    assert.deepEqual(raw.loyaltyDiscountSettings, {
      enabled: false,
      thresholdCompletedBookings: 5,
      discountPercent: 10,
      maxDiscountPercent: 30,
    });
  });
});
