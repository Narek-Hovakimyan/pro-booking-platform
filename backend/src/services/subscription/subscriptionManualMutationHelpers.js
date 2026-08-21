export const createWithOptionalSession = async (Model, payload, session) => {
  if (!session) return Model.create(payload);
  const [document] = await Model.create([payload], { session });
  return document;
};

export const isSubscriptionOwnerDuplicateKeyError = (error) => {
  if (error?.code !== 11000) return false;
  const keyPattern = error.keyPattern || {};
  return (keyPattern.ownerType === 1 && keyPattern.ownerId === 1) || /ownerType_1_ownerId_1/.test(error.message || "");
};
