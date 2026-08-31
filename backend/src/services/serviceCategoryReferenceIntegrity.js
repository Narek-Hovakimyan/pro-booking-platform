import mongoose from "mongoose";

import Service from "../models/Service.js";
import ServiceCategory from "../models/ServiceCategory.js";
import Salon from "../models/Salon.js";
import { canManageSalonRequest } from "../utils/salonPermissions.js";

const defaultMongooseStartSession = mongoose.startSession;

export class ServiceCategoryReferenceIntegrityError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const withSession = async (query, session) =>
  (query && typeof query.session === "function" ? query.session(session) : query);

const runTransaction = (callback) => {
  if (
    mongoose.connection.readyState === 0 &&
    mongoose.startSession !== defaultMongooseStartSession
  ) {
    // Existing isolated controller tests replace mongoose.startSession. Keep that
    // test seam while still using Mongoose's transaction wrapper and retry reset.
    return mongoose.connection.transaction.call(
      {
        startSession: mongoose.startSession,
        base: mongoose.connection.base,
      },
      callback
    );
  }
  return mongoose.connection.transaction(callback);
};

const assertCategoryOwner = async (category, barberId, session) => {
  if (category.ownerType === "barber") {
    if (String(category.ownerId) !== String(barberId)) {
      throw new ServiceCategoryReferenceIntegrityError(
        403,
        "Not authorized to use this custom category"
      );
    }
    return;
  }

  if (category.ownerType === "salon") {
    const salon = await withSession(Salon.findById(category.ownerId), session);
    if (!salon || !canManageSalonRequest(salon, barberId)) {
      throw new ServiceCategoryReferenceIntegrityError(
        403,
        "Not authorized to use this custom category"
      );
    }
    return;
  }

  throw new ServiceCategoryReferenceIntegrityError(400, "Invalid custom category");
};

export const validateCustomCategoryForBarber = async (
  customCategoryId,
  barberId,
  { allowExistingInactive = false } = {}
) => {
  if (customCategoryId === null || customCategoryId === "") {
    return { value: null };
  }
  if (!mongoose.Types.ObjectId.isValid(customCategoryId)) {
    return { error: "Invalid custom category", code: 400 };
  }

  const category = await ServiceCategory.findById(customCategoryId);
  if (!category) {
    return { error: "Invalid custom category", code: 400 };
  }
  if (category.source !== "custom") {
    return {
      error: "customCategoryId must reference a custom category",
      code: 400,
    };
  }

  try {
    await assertCategoryOwner(category, barberId);
  } catch (error) {
    if (error instanceof ServiceCategoryReferenceIntegrityError) {
      return { error: error.message, code: error.statusCode };
    }
    throw error;
  }

  if (!category.active && !allowExistingInactive) {
    return { error: "Invalid custom category", code: 400 };
  }
  return { value: category._id };
};

const lockCategoryForReference = async ({
  customCategoryId,
  barberId,
  allowExistingInactive,
  session,
}) => {
  const category = await withSession(ServiceCategory.findById(customCategoryId), session);
  if (!category || category.source !== "custom") {
    throw new ServiceCategoryReferenceIntegrityError(400, "Invalid custom category");
  }

  await assertCategoryOwner(category, barberId, session);

  if (!category.active && !allowExistingInactive) {
    throw new ServiceCategoryReferenceIntegrityError(400, "Invalid custom category");
  }

  // Every category-reference mutation writes this category inside its transaction.
  // Delete/deactivate writes the same document, so Mongo serializes competing paths.
  const lockResult = await withSession(
    ServiceCategory.updateOne(
      {
        _id: category._id,
        source: "custom",
        ...(allowExistingInactive ? {} : { active: true }),
      },
      { $currentDate: { updatedAt: true } },
      { session }
    ),
    session
  );

  if ((lockResult?.matchedCount ?? lockResult?.n) !== 1) {
    throw new ServiceCategoryReferenceIntegrityError(400, "Invalid custom category");
  }

  return category;
};

export const persistServiceWithCategoryReference = async ({
  customCategoryId,
  barberId,
  allowExistingInactive = false,
  persist,
}) => {
  let result;
  await runTransaction(async (session) => {
      const category = await lockCategoryForReference({
        customCategoryId,
        barberId,
        allowExistingInactive,
        session,
      });
      result = await persist({ session, customCategoryId: category._id });
  });
  return result;
};

export const updateCategoryWithReferenceIntegrity = async ({ categoryId, updates }) => {
  let result;
  await runTransaction(async (session) => {
    const category = await withSession(ServiceCategory.findById(categoryId), session);
    if (!category || category.source !== "custom") {
      throw new ServiceCategoryReferenceIntegrityError(404, "Category not found");
    }

    const lockResult = await withSession(
      ServiceCategory.updateOne(
        { _id: category._id, source: "custom" },
        { $currentDate: { updatedAt: true } },
        { session }
      ),
      session
    );
    if ((lockResult?.matchedCount ?? lockResult?.n) !== 1) {
      throw new ServiceCategoryReferenceIntegrityError(404, "Category not found");
    }

    result = await withSession(
      ServiceCategory.findOneAndUpdate(
        { _id: category._id, source: "custom" },
        { $set: updates },
        { new: true, session }
      ),
      session
    );
    if (!result) {
      throw new ServiceCategoryReferenceIntegrityError(404, "Category not found");
    }
  });
  return result;
};

export const deleteCategoryWithReferenceIntegrity = async ({ categoryId }) => {
  let result;
  await runTransaction(async (session) => {
      const category = await withSession(ServiceCategory.findById(categoryId), session);
      if (!category) {
        throw new ServiceCategoryReferenceIntegrityError(404, "Category not found");
      }

      const lockResult = await withSession(
        ServiceCategory.updateOne(
          { _id: category._id, source: "custom" },
          { $currentDate: { updatedAt: true } },
          { session }
        ),
        session
      );
      if ((lockResult?.matchedCount ?? lockResult?.n) !== 1) {
        throw new ServiceCategoryReferenceIntegrityError(404, "Category not found");
      }

      const servicesUsing = await withSession(
        Service.countDocuments({ customCategoryId: category._id }),
        session
      );
      if (servicesUsing > 0) {
        const disabled = await withSession(ServiceCategory.findOneAndUpdate(
          { _id: category._id, source: "custom" },
          { $set: { active: false } },
          { new: true, session }
        ), session);
        if (!disabled) throw new ServiceCategoryReferenceIntegrityError(404, "Category not found");
        result = { category: disabled, softDeleted: true };
        return;
      }

      const deleted = await withSession(ServiceCategory.deleteOne(
        { _id: category._id, source: "custom" },
        { session }
      ), session);
      if ((deleted?.deletedCount ?? deleted?.n) !== 1) {
        throw new ServiceCategoryReferenceIntegrityError(404, "Category not found");
      }
      result = { category, softDeleted: false };
  });
  return result;
};
