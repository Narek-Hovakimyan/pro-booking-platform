import EventRegistration from "../../models/EventRegistration.js";
import EventReminderDispatch from "../../models/EventReminderDispatch.js";
import Notification from "../../models/Notification.js";
import { createNotification } from "./notificationService.js";
import { eventReminderDispatchService } from "./eventReminderDispatchService.js";


export const REMINDER_LEAD_MINUTES = 24 * 60;
export const REMINDER_WINDOW_MINUTES = 10;
const EVENT_REMINDER_IDEMPOTENCY_NAMESPACE = "event-reminder:v2";
const LEASE_LOST_ERROR_CODE = "scheduler_lease_lost";

export const getEventStart = (event) => {
  if (!event?.date || !event?.time) return null;

  const startsAt = new Date(`${event.date}T${event.time}:00+04:00`);


  return Number.isNaN(startsAt.getTime()) ? null : startsAt;
};

const getEventReminderNotificationData = (event, registration) => {
  const eventId = event?._id || event?.id;
  const eventRegistrationId = registration?._id || registration?.id;
  const data = {};

  if (eventId) data.eventId = eventId;
  if (eventRegistrationId) data.eventRegistrationId = eventRegistrationId;

  return Object.keys(data).length > 0 ? data : undefined;
};

const getEffectiveRecipientId = (registration) =>
  registration?.userId || registration?.barberId || null;

const getReminderMessage = (event) =>
  `Reminder: Your event '${event.title}' starts tomorrow at ${event.time}.`;

const isReminderInWindow = (startsAt, now) => {
  const reminderWindowStart = new Date(
    now.getTime() + REMINDER_LEAD_MINUTES * 60 * 1000
  );
  const reminderWindowEnd = new Date(
    reminderWindowStart.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000
  );

  return startsAt >= reminderWindowStart && startsAt <= reminderWindowEnd;
};

const getReminderContext = (registration, now) => {
  const event = registration?.eventId;
  const recipientId = getEffectiveRecipientId(registration);
  const startsAt = getEventStart(event);

  if (!recipientId || registration?.status !== "approved") {
    return null;
  }
  if (!event || event.status !== "upcoming" || !startsAt) {
    return null;
  }
  if (!isReminderInWindow(startsAt, now)) {
    return null;
  }

  return {
    recipientId,
    event,
    message: getReminderMessage(event),
  };
};

const loadCurrentRegistration = async (registrationModel, registrationId) =>
  registrationModel
    .findOne({ _id: registrationId })
    .populate("eventId", "title date time status")
    .lean();

const finalizeLegacyReminder = async ({
  registrationModel,
  registrationId,
  expectedUserId,
  now,
  withFencedWrite,
}) => {
  return withFencedWrite(async ({ session }) => {
    const currentRegistration = await registrationModel
      .findOne(
        { _id: registrationId },
        null,
        session ? { session } : undefined
      )
      .populate("eventId", "title date time status")
      .lean();
    const currentContext = getReminderContext(currentRegistration, now);

    if (
      !currentContext ||
      String(currentContext.recipientId) !== String(expectedUserId)
    ) {
      return false;
    }

    const updatedRegistration = await registrationModel.findOneAndUpdate(
      {
        _id: registrationId,
        status: "approved",
        reminderSentAt: null,
        $or: [{ userId: expectedUserId }, { userId: null, barberId: expectedUserId }],
      },
      { $set: { reminderSentAt: new Date(now) } },
      { returnDocument: "after", session }
    );

    return Boolean(updatedRegistration);
  });
};

const getFailureCode = (error) => {
  if (typeof error?.code === "string" && /^[a-z0-9_]+$/.test(error.code)) {
    return error.code;
  }

  return "notification_error";
};

const isLeaseFenceError = (error) => error?.code === LEASE_LOST_ERROR_CODE;

const createAssertOwned = (leaseContext) =>
  typeof leaseContext?.assertOwned === "function"
    ? async () => leaseContext.assertOwned()
    : async () => {};

const createWithFencedWrite = (leaseContext) =>
  typeof leaseContext?.withFencedWrite === "function"
    ? async (write) => leaseContext.withFencedWrite(write)
    : async (write) => write({});

const hasValidClaimToken = (value) =>
  typeof value === "string" && value.trim().length > 0;

const normalizeIdentityValue = (value) => {
  if (value == null) {
    return null;
  }

  const normalizedValue = String(value).trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
};

const createReminderIdentity = ({ eventRegistrationId, userId }) => {
  const normalizedRegistrationId = normalizeIdentityValue(eventRegistrationId);
  const normalizedUserId = normalizeIdentityValue(userId);

  if (!normalizedRegistrationId || !normalizedUserId) {
    return null;
  }

  return {
    eventRegistrationId: normalizedRegistrationId,
    userId: normalizedUserId,
  };
};

const hasMatchingReminderIdentity = (left, right) =>
  Boolean(
    left &&
      right &&
      left.eventRegistrationId === right.eventRegistrationId &&
      left.userId === right.userId
  );

const createReminderIdempotencyKey = (identity) =>
  `${EVENT_REMINDER_IDEMPOTENCY_NAMESPACE}:${identity.eventRegistrationId}:${identity.userId}`;

const resolveQueryResult = async (value) =>
  value && typeof value.lean === "function" ? value.lean() : value;

const defaultFindNotificationByIdentity = async (identity) =>
  resolveQueryResult(
    Notification.findOne({
      userId: identity.userId,
      type: "event_reminder",
      "data.eventRegistrationId": identity.eventRegistrationId,
    })
  );

export const sendEventReminders = async (now = new Date(), deps = {}) => {
  const registrationModel = deps.registrationModel || EventRegistration;
  const dispatchModel = deps.dispatchModel || EventReminderDispatch;
  const dispatchService = deps.dispatchService || eventReminderDispatchService;
  const createNotificationFn = deps.createNotification || createNotification;
  const findNotificationByIdentity =
    deps.findNotificationByIdentity ||
    (createNotificationFn === createNotification
      ? defaultFindNotificationByIdentity
      : async () => null);
  const assertOwned = createAssertOwned(deps.leaseContext);
  const withFencedWrite = createWithFencedWrite(deps.leaseContext);

  const registrations = await registrationModel.find({
    status: "approved",
    reminderSentAt: null,
  })
    .populate("eventId", "title date time status")
    .lean();

  let sentCount = 0;

  registrationLoop: for (const registration of registrations) {
    const context = getReminderContext(registration, now);
    if (!context) {
      continue;
    }

    const reminderIdentity = createReminderIdentity({
      eventRegistrationId: registration._id,
      userId: context.recipientId,
    });
    if (!reminderIdentity) {
      continue;
    }

    let claimResult;

    try {
      claimResult = await withFencedWrite(({ session }) =>
        dispatchService.claim({
          eventRegistrationId: reminderIdentity.eventRegistrationId,
          userId: reminderIdentity.userId,
          session,
        })
      );
    } catch (error) {
      if (isLeaseFenceError(error)) {
        break;
      }

      throw error;
    }

    if (!claimResult.claimed) {
      if (claimResult.reason === "sent") {
        let finalized;

        try {
          finalized = await finalizeLegacyReminder({
            registrationModel,
            registrationId: reminderIdentity.eventRegistrationId,
            expectedUserId: reminderIdentity.userId,
            now,
            withFencedWrite,
          });
        } catch (error) {
          if (isLeaseFenceError(error)) {
            break;
          }

          throw error;
        }

        if (finalized) {
          sentCount += 1;
        }
      }
      continue;
    }

    if (!hasValidClaimToken(claimResult.dispatch?.claimToken)) {
      continue;
    }

    try {
      const currentRegistration = await loadCurrentRegistration(
        registrationModel,
        registration._id
      );
      const currentContext = getReminderContext(currentRegistration, now);

      if (
        !currentContext ||
        !hasMatchingReminderIdentity(
          reminderIdentity,
          createReminderIdentity({
            eventRegistrationId: currentRegistration?._id,
            userId: currentContext?.recipientId,
          })
        )
      ) {
        await withFencedWrite(({ session }) =>
          dispatchService.markFailed({
            eventRegistrationId: reminderIdentity.eventRegistrationId,
            userId: reminderIdentity.userId,
            claimToken: claimResult.dispatch.claimToken,
            failureCode: "registration_invalid",
            session,
          })
        );
        continue;
      }

      const currentReminderIdentity = createReminderIdentity({
        eventRegistrationId: currentRegistration._id,
        userId: currentContext.recipientId,
      });
      if (!currentReminderIdentity) {
        await withFencedWrite(({ session }) =>
          dispatchService.markFailed({
            eventRegistrationId: reminderIdentity.eventRegistrationId,
            userId: reminderIdentity.userId,
            claimToken: claimResult.dispatch.claimToken,
            failureCode: "registration_invalid",
            session,
          })
        );
        continue;
      }

      const existingNotification = await findNotificationByIdentity(
        currentReminderIdentity
      );

      if (!existingNotification) {
        await withFencedWrite(({ session, afterCommit }) =>
          createNotificationFn({
            userId: currentContext.recipientId,
            type: "event_reminder",
            message: currentContext.message,
            data: getEventReminderNotificationData(
              currentContext.event,
              currentRegistration
            ),
            idempotencyKey: createReminderIdempotencyKey(currentReminderIdentity),
            session,
            afterCommit,
          })
        );
      }

      const markSentResult = await withFencedWrite(({ session }) =>
        dispatchService.markSent({
          eventRegistrationId: currentReminderIdentity.eventRegistrationId,
          userId: currentReminderIdentity.userId,
          claimToken: claimResult.dispatch.claimToken,
          session,
        })
      );

      if (!markSentResult.markedSent) {
        continue;
      }

      const finalized = await finalizeLegacyReminder({
        registrationModel,
        registrationId: currentReminderIdentity.eventRegistrationId,
        expectedUserId: currentReminderIdentity.userId,
        now,
        withFencedWrite,
      });

      if (finalized) {
        sentCount += 1;
      }
    } catch (error) {
      if (isLeaseFenceError(error)) {
        break registrationLoop;
      }

      try {
        await assertOwned();
      } catch (assertError) {
        if (isLeaseFenceError(assertError)) {
          break registrationLoop;
        }

        throw assertError;
      }

      await withFencedWrite(({ session }) =>
        dispatchService.markFailed({
          eventRegistrationId: reminderIdentity.eventRegistrationId,
          userId: reminderIdentity.userId,
          claimToken: claimResult.dispatch.claimToken,
          failureCode: getFailureCode(error),
          session,
        })
      );
    }
  }

  return sentCount;
};
