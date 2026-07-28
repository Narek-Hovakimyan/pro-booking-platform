import { randomUUID } from "node:crypto";

import EventReminderDispatch from "../../models/EventReminderDispatch.js";

export const DEFAULT_EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

const CLAIMED_STATUS = "claimed";
const SENT_STATUS = "sent";
const FAILED_STATUS = "failed";
const DUPLICATE_KEY_CODE = 11000;
const FAILURE_CODE_PATTERN = /^[a-z0-9_]+$/;
const CLAIM_TOKEN_SELECTION = "+claimToken";

const notClaimed = (reason = "not_claimed") => ({
  claimed: false,
  dispatch: null,
  reason,
});

const claimed = (dispatch) => ({
  claimed: true,
  dispatch,
});

const notUpdated = (resultKey, reason = "not_updated") => ({
  [resultKey]: false,
  dispatch: null,
  reason,
});

const updated = (resultKey, dispatch) => ({
  [resultKey]: true,
  dispatch,
});

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const validateDate = (name, value) => {
  if (!isValidDate(value)) {
    throw new TypeError(`${name} must be a valid Date`);
  }

  return value;
};

const validatePositiveMs = (name, value) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }

  return value;
};

const validateIdentity = (name, value) => {
  if (value == null || String(value).trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty identifier`);
  }

  return value;
};

const validateClaimToken = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("claimToken must be a non-empty string");
  }

  return value;
};

const sanitizeFailureCode = (value) => {
  if (typeof value === "string" && FAILURE_CODE_PATTERN.test(value)) {
    return value;
  }

  return "unknown_error";
};

const withClaimTokenSelection = (operationResult) =>
  operationResult && typeof operationResult.select === "function"
    ? operationResult.select(CLAIM_TOKEN_SELECTION)
    : operationResult;

const normalizeDispatch = (document) => {
  const source =
    document && typeof document.toObject === "function" ? document.toObject() : document;

  if (!source || typeof source !== "object") {
    return null;
  }

  try {
    return {
      _id: source._id,
      eventRegistrationId: validateIdentity(
        "eventRegistrationId",
        source.eventRegistrationId
      ),
      userId: validateIdentity("userId", source.userId),
      status: source.status,
      claimToken: typeof source.claimToken === "string" ? source.claimToken : "",
      claimedAt: source.claimedAt ? validateDate("claimedAt", source.claimedAt) : null,
      sentAt: source.sentAt ? validateDate("sentAt", source.sentAt) : null,
      attempts: Number.isSafeInteger(source.attempts) ? source.attempts : 0,
      failureCode: typeof source.failureCode === "string" ? source.failureCode : "",
      createdAt: source.createdAt ? validateDate("createdAt", source.createdAt) : undefined,
      updatedAt: source.updatedAt ? validateDate("updatedAt", source.updatedAt) : undefined,
    };
  } catch {
    return null;
  }
};

const parseTimeoutMs = (value) => {
  const numeric = Number(value);

  return Number.isSafeInteger(numeric) && numeric > 0
    ? numeric
    : DEFAULT_EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS;
};

export const createEventReminderDispatchService = ({
  model = EventReminderDispatch,
  now = () => new Date(),
  claimTokenFactory = randomUUID,
  staleClaimTimeoutMs = DEFAULT_EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS,
} = {}) => {
  if (
    !model ||
    typeof model.findOne !== "function" ||
    typeof model.findOneAndUpdate !== "function"
  ) {
    throw new TypeError("model must provide findOne and findOneAndUpdate");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (typeof claimTokenFactory !== "function") {
    throw new TypeError("claimTokenFactory must be a function");
  }

  const validatedTimeoutMs = validatePositiveMs(
    "staleClaimTimeoutMs",
    staleClaimTimeoutMs
  );

  const claim = async ({ eventRegistrationId, userId, session } = {}) => {
    const normalizedRegistrationId = validateIdentity(
      "eventRegistrationId",
      eventRegistrationId
    );
    const normalizedUserId = validateIdentity("userId", userId);
    const claimToken = validateClaimToken(claimTokenFactory());
    const currentTime = validateDate("now", now());
    const staleBefore = new Date(currentTime.getTime() - validatedTimeoutMs);

    try {
      const claimedDocument = await withClaimTokenSelection(
        model.findOneAndUpdate(
          {
            eventRegistrationId: normalizedRegistrationId,
            userId: normalizedUserId,
            $or: [
              { status: FAILED_STATUS },
              { status: CLAIMED_STATUS, claimedAt: { $lte: staleBefore } },
            ],
          },
          {
            $set: {
              status: CLAIMED_STATUS,
              claimToken,
              claimedAt: currentTime,
              sentAt: null,
              failureCode: "",
            },
            $inc: { attempts: 1 },
          },
          { new: true, returnDocument: "after", runValidators: true, session }
        )
      );

      const reclaimedDispatch = normalizeDispatch(claimedDocument);
      if (reclaimedDispatch?.claimToken === claimToken) {
        return claimed(reclaimedDispatch);
      }

      const insertedDocument = await withClaimTokenSelection(
        model.findOneAndUpdate(
          {
            eventRegistrationId: normalizedRegistrationId,
            userId: normalizedUserId,
          },
          {
            $setOnInsert: {
              eventRegistrationId: normalizedRegistrationId,
              userId: normalizedUserId,
              status: CLAIMED_STATUS,
              claimToken,
              claimedAt: currentTime,
              sentAt: null,
              attempts: 1,
              failureCode: "",
            },
          },
          {
            upsert: true,
            new: true,
            returnDocument: "after",
            runValidators: true,
            session,
          }
        )
      );

      const insertedDispatch = normalizeDispatch(insertedDocument);
      if (insertedDispatch?.claimToken === claimToken) {
        return claimed(insertedDispatch);
      }

      const existingDocument = await model.findOne(
        {
          eventRegistrationId: normalizedRegistrationId,
          userId: normalizedUserId,
        },
        null,
        { session }
      );
      const existingDispatch = normalizeDispatch(existingDocument);

      if (!existingDispatch) {
        return notClaimed("storage_error");
      }
      if (existingDispatch.status === SENT_STATUS) {
        return notClaimed("sent");
      }
      if (
        existingDispatch.status === CLAIMED_STATUS &&
        existingDispatch.claimedAt &&
        existingDispatch.claimedAt.getTime() > staleBefore.getTime()
      ) {
        return notClaimed("active");
      }

      return notClaimed("contended");
    } catch (error) {
      return notClaimed(error?.code === DUPLICATE_KEY_CODE ? "contended" : "storage_error");
    }
  };

  const markSent = async ({
    eventRegistrationId,
    userId,
    claimToken,
    session,
  } = {}) => {
    const normalizedRegistrationId = validateIdentity(
      "eventRegistrationId",
      eventRegistrationId
    );
    const normalizedUserId = validateIdentity("userId", userId);
    const normalizedClaimToken = validateClaimToken(claimToken);
    const currentTime = validateDate("now", now());

    try {
      const updatedDocument = await withClaimTokenSelection(
        model.findOneAndUpdate(
          {
            eventRegistrationId: normalizedRegistrationId,
            userId: normalizedUserId,
            status: CLAIMED_STATUS,
            claimToken: normalizedClaimToken,
          },
          {
            $set: {
              status: SENT_STATUS,
              sentAt: currentTime,
              failureCode: "",
            },
          },
          { new: true, returnDocument: "after", runValidators: true, session }
        )
      );

      const dispatch = normalizeDispatch(updatedDocument);
      if (
        !dispatch ||
        dispatch.status !== SENT_STATUS ||
        dispatch.claimToken !== normalizedClaimToken
      ) {
        return notUpdated("markedSent", "not_owner");
      }

      return updated("markedSent", dispatch);
    } catch {
      return notUpdated("markedSent", "storage_error");
    }
  };

  const markFailed = async ({
    eventRegistrationId,
    userId,
    claimToken,
    failureCode,
    session,
  } = {}) => {
    const normalizedRegistrationId = validateIdentity(
      "eventRegistrationId",
      eventRegistrationId
    );
    const normalizedUserId = validateIdentity("userId", userId);
    const normalizedClaimToken = validateClaimToken(claimToken);
    const normalizedFailureCode = sanitizeFailureCode(failureCode);

    try {
      const updatedDocument = await withClaimTokenSelection(
        model.findOneAndUpdate(
          {
            eventRegistrationId: normalizedRegistrationId,
            userId: normalizedUserId,
            status: CLAIMED_STATUS,
            claimToken: normalizedClaimToken,
          },
          {
            $set: {
              status: FAILED_STATUS,
              failureCode: normalizedFailureCode,
            },
          },
          { new: true, returnDocument: "after", runValidators: true, session }
        )
      );

      const dispatch = normalizeDispatch(updatedDocument);
      if (
        !dispatch ||
        dispatch.status !== FAILED_STATUS ||
        dispatch.claimToken !== normalizedClaimToken
      ) {
        return notUpdated("markedFailed", "not_owner");
      }

      return updated("markedFailed", dispatch);
    } catch {
      return notUpdated("markedFailed", "storage_error");
    }
  };

  return {
    claim,
    markSent,
    markFailed,
    staleClaimTimeoutMs: validatedTimeoutMs,
  };
};

export const eventReminderDispatchService = createEventReminderDispatchService({
  staleClaimTimeoutMs: parseTimeoutMs(process.env.EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS),
});
