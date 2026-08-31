import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import mongoose from "mongoose";

import Service from "../models/Service.js";
import ServiceCategory from "../models/ServiceCategory.js";
import {
  deleteCategoryWithReferenceIntegrity,
  persistServiceWithCategoryReference,
  updateCategoryWithReferenceIntegrity,
} from "./serviceCategoryReferenceIntegrity.js";

const enabled =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true" &&
  Boolean(process.env.MONGO_URI);
const failpointEnabled = enabled && process.env.MONGO_TRANSACTION_FAILPOINT_TESTS === "true";

const connectIsolatedDb = async (suffix) => {
  const uri = new URL(process.env.MONGO_URI);
  const databaseName = uri.pathname.replace(/^\/+|\/+$/g, "") || "hairbook_ci_test";
  uri.pathname = `/category_reference_${suffix}_${process.pid}`;
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([Service.deleteMany({}), ServiceCategory.deleteMany({})]);
};

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.db.admin().command({
      configureFailPoint: "failCommand",
      mode: "off",
    }).catch(() => {});
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
});

const createCategory = async () => {
  const barberId = new mongoose.Types.ObjectId();
  const category = await ServiceCategory.create({
    name: `Race Category ${Date.now()}-${Math.random()}`,
    normalizedName: `race-category-${Date.now()}-${Math.random()}`,
    source: "custom",
    ownerType: "barber",
    ownerId: barberId,
    createdBy: barberId,
    active: true,
  });
  return { barberId, category };
};

const createServiceForCategory = ({ barberId, categoryId }) =>
  persistServiceWithCategoryReference({
    customCategoryId: categoryId,
    barberId,
    persist: ({ session, customCategoryId }) =>
      Service.create(
        [{
          barberId,
          name: "Race-safe service",
          price: 1000,
          duration: 30,
          customCategoryId,
        }],
        { session }
      ),
  });

const forceOneTransientCommitFailure = async (t) => {
  try {
    await mongoose.connection.db.admin().command({
      configureFailPoint: "failCommand",
      mode: { times: 1 },
      data: {
        // Commit fails only after the first callback has executed its real
        // explicit mutation. The driver labels it transient and re-runs the
        // complete transaction through mongoose.connection.transaction.
        failCommands: ["commitTransaction"],
        errorCode: 251,
        errorLabels: ["TransientTransactionError"],
        failInternalCommands: true,
      },
    });
  } catch (error) {
    if (error.codeName === "CommandNotFound" || error.code === 59) {
      t.skip("MongoDB test commands are not enabled");
      return false;
    }
    throw error;
  }
  return true;
};

test("replica-set retry rolls back then reissues real service assignment", { skip: !failpointEnabled }, async (t) => {
  await connectIsolatedDb("retry_assignment");
  const { barberId, category } = await createCategory();
  const service = await Service.create({
    barberId,
    name: "Retry-safe assignment",
    price: 1000,
    duration: 30,
  });
  const originalUpdateOne = ServiceCategory.updateOne;
  const originalFindOneAndUpdate = Service.findOneAndUpdate;
  let lockWrites = 0;
  let assignmentWrites = 0;
  ServiceCategory.updateOne = function trackedUpdateOne(...args) {
    lockWrites += 1;
    return originalUpdateOne.apply(this, args);
  };
  Service.findOneAndUpdate = async function trackedAssignment(...args) {
    assignmentWrites += 1;
    if (assignmentWrites === 2) {
      const outsideTransaction = await Service.findById(service._id);
      assert.ok(outsideTransaction.customCategoryId == null);
    }
    return originalFindOneAndUpdate.apply(this, args);
  };

  try {
    if (!(await forceOneTransientCommitFailure(t))) return;
    await persistServiceWithCategoryReference({
      customCategoryId: category._id,
      barberId,
      persist: ({ session, customCategoryId }) => {
        return Service.findOneAndUpdate(
          { _id: service._id, barberId },
          { $set: { customCategoryId } },
          { new: true, session }
        );
      },
    });
  } finally {
    ServiceCategory.updateOne = originalUpdateOne;
    Service.findOneAndUpdate = originalFindOneAndUpdate;
  }

  const stored = await Service.findById(service._id);
  assert.equal(lockWrites, 2);
  assert.equal(assignmentWrites, 2);
  assert.equal(String(stored.customCategoryId), String(category._id));
});

test("replica-set retry rolls back then reissues real category deactivation and deletion", { skip: !failpointEnabled }, async (t) => {
  await connectIsolatedDb("retry_category_mutations");
  const { category: deactivated } = await createCategory();
  const originalUpdateOne = ServiceCategory.updateOne;
  const originalFindOneAndUpdate = ServiceCategory.findOneAndUpdate;
  let deactivateLocks = 0;
  let deactivationWrites = 0;
  ServiceCategory.updateOne = function trackedUpdateOne(...args) {
    deactivateLocks += 1;
    return originalUpdateOne.apply(this, args);
  };
  ServiceCategory.findOneAndUpdate = async function trackedDeactivation(...args) {
    deactivationWrites += 1;
    if (deactivationWrites === 2) {
      const outsideTransaction = await ServiceCategory.findById(deactivated._id);
      assert.equal(outsideTransaction.active, true);
    }
    return originalFindOneAndUpdate.apply(this, args);
  };

  try {
    if (!(await forceOneTransientCommitFailure(t))) return;
    await updateCategoryWithReferenceIntegrity({
      categoryId: deactivated._id,
      updates: { active: false },
    });
  } finally {
    ServiceCategory.updateOne = originalUpdateOne;
    ServiceCategory.findOneAndUpdate = originalFindOneAndUpdate;
  }

  assert.equal(deactivateLocks, 2);
  assert.equal(deactivationWrites, 2);
  assert.equal((await ServiceCategory.findById(deactivated._id)).active, false);

  const { category: deleted } = await createCategory();
  let deleteLocks = 0;
  const originalDeleteOne = ServiceCategory.deleteOne;
  let deleteWrites = 0;
  ServiceCategory.updateOne = function trackedDeleteLock(...args) {
    deleteLocks += 1;
    return originalUpdateOne.apply(this, args);
  };
  ServiceCategory.deleteOne = async function trackedDelete(...args) {
    deleteWrites += 1;
    if (deleteWrites === 2) {
      assert.ok(await ServiceCategory.findById(deleted._id));
    }
    return originalDeleteOne.apply(this, args);
  };
  try {
    if (!(await forceOneTransientCommitFailure(t))) return;
    await deleteCategoryWithReferenceIntegrity({ categoryId: deleted._id });
  } finally {
    ServiceCategory.updateOne = originalUpdateOne;
    ServiceCategory.deleteOne = originalDeleteOne;
  }

  assert.equal(deleteLocks, 2);
  assert.equal(deleteWrites, 2);
  assert.equal(await ServiceCategory.findById(deleted._id), null);
});

test("replica-set delete versus assignment never leaves a dangling category reference", { skip: !enabled }, async () => {
  await connectIsolatedDb("delete_assignment");
  const { barberId, category } = await createCategory();

  await Promise.allSettled([
    deleteCategoryWithReferenceIntegrity({ categoryId: category._id }),
    createServiceForCategory({ barberId, categoryId: category._id }),
  ]);

  const [storedCategory, references] = await Promise.all([
    ServiceCategory.findById(category._id),
    Service.countDocuments({ customCategoryId: category._id }),
  ]);
  assert.ok(storedCategory || references === 0);
  if (references > 0) {
    assert.ok(storedCategory);
    assert.equal(storedCategory.source, "custom");
  }
});

test("replica-set deactivate versus assignment leaves either a valid reference or no assignment", { skip: !enabled }, async () => {
  await connectIsolatedDb("deactivate_assignment");
  const { barberId, category } = await createCategory();

  await Promise.allSettled([
    updateCategoryWithReferenceIntegrity({
      categoryId: category._id,
      updates: { active: false },
    }),
    createServiceForCategory({ barberId, categoryId: category._id }),
  ]);

  const [storedCategory, references] = await Promise.all([
    ServiceCategory.findById(category._id),
    Service.countDocuments({ customCategoryId: category._id }),
  ]);
  assert.ok(storedCategory || references === 0);
  if (references > 0) {
    assert.ok(storedCategory);
    assert.equal(storedCategory.source, "custom");
  }
});
