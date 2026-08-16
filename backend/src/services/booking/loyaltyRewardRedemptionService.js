import LoyaltyRewardRedemption from "../../models/LoyaltyRewardRedemption.js";

const duplicateKeyCode = 11000;

export class LoyaltyRewardUnavailableError extends Error {
  constructor(message = "This loyalty reward is no longer available") {
    super(message);
    this.name = "LoyaltyRewardUnavailableError";
    this.statusCode = 400;
    this.code = "LOYALTY_REWARD_UNAVAILABLE";
  }
}

const scopeFilter = ({ barberId, clientId, milestone }) => ({
  barberId,
  clientId,
  milestone,
});

const isDuplicateKeyError = (error) =>
  error?.code === duplicateKeyCode ||
  (error?.name === "MongoServerError" && error?.code === duplicateKeyCode);

const getOptions = (session, extra = {}) => ({
  ...extra,
  ...(session ? { session } : {}),
});

export const getLoyaltyMilestone = (loyaltyDiscount) => {
  if (
    !loyaltyDiscount?.applied ||
    !Number.isInteger(loyaltyDiscount?.eligibleCompletedBookings) ||
    loyaltyDiscount.eligibleCompletedBookings < 1
  ) {
    return null;
  }

  const threshold = Number(loyaltyDiscount.ruleSnapshot?.thresholdCompletedBookings);
  if (!Number.isInteger(threshold) || threshold < 1) return null;

  const milestone = Math.floor(
    loyaltyDiscount.eligibleCompletedBookings / threshold
  );
  return milestone > 0 ? milestone : null;
};

export const isLoyaltyRewardAvailable = async ({
  barberId,
  clientId,
  milestone,
  session,
} = {}) => {
  if (!barberId || !clientId || !Number.isInteger(milestone) || milestone < 1) {
    return false;
  }

  const redemption = await LoyaltyRewardRedemption.findOne(
    scopeFilter({ barberId, clientId, milestone }),
    null,
    getOptions(session)
  );
  return !redemption || redemption.status === "restored";
};

export const claimLoyaltyReward = async ({
  barberId,
  clientId,
  milestone,
  bookingId,
  session,
} = {}) => {
  if (!barberId || !clientId || !bookingId || !Number.isInteger(milestone) || milestone < 1) {
    throw new LoyaltyRewardUnavailableError();
  }

  const filter = {
    ...scopeFilter({ barberId, clientId, milestone }),
    $or: [
      { status: "restored" },
      { status: "claimed", bookingId },
    ],
  };
  const now = new Date();

  try {
    const redemption = await LoyaltyRewardRedemption.findOneAndUpdate(
      filter,
      {
        $set: {
          status: "claimed",
          bookingId,
          claimedAt: now,
          restoredAt: null,
          consumedAt: null,
        },
        $setOnInsert: scopeFilter({ barberId, clientId, milestone }),
      },
      getOptions(session, { new: true, upsert: true, setDefaultsOnInsert: true })
    );

    if (redemption) return redemption;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  throw new LoyaltyRewardUnavailableError();
};

export const restoreLoyaltyRewardForBooking = async ({
  barberId,
  clientId,
  bookingId,
  session,
} = {}) => {
  if (!barberId || !clientId || !bookingId) return null;

  return LoyaltyRewardRedemption.findOneAndUpdate(
    {
      barberId,
      clientId,
      bookingId,
      status: "claimed",
    },
    {
      $set: {
        status: "restored",
        bookingId: null,
        restoredAt: new Date(),
      },
      $unset: { consumedAt: 1 },
    },
    getOptions(session, { new: true })
  );
};

export const consumeLoyaltyRewardForBooking = async ({
  barberId,
  clientId,
  bookingId,
  session,
} = {}) => {
  if (!barberId || !clientId || !bookingId) return null;

  const consumed = await LoyaltyRewardRedemption.findOneAndUpdate(
    {
      barberId,
      clientId,
      bookingId,
      status: "claimed",
    },
    {
      $set: {
        status: "consumed",
        consumedAt: new Date(),
      },
    },
    getOptions(session, { new: true })
  );

  if (consumed) return consumed;

  return LoyaltyRewardRedemption.findOne(
    { barberId, clientId, bookingId, status: "consumed" },
    null,
    getOptions(session)
  );
};

export const __loyaltyRewardRedemptionTestHooks = {
  claimLoyaltyReward,
  restoreLoyaltyRewardForBooking,
  consumeLoyaltyRewardForBooking,
};
