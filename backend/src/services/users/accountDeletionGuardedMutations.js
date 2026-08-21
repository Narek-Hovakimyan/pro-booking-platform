import {
  assertAccountDeletionFencesOpen,
  runWithAccountDeletionFence,
} from "./accountDeletionFenceService.js";

export const guardBookingMutation = ({ barberId, clientId, isManualBooking, session }) =>
  assertAccountDeletionFencesOpen({
    userIds: [barberId, isManualBooking ? null : clientId],
    session,
  });

export const guardSubscriptionMutation = ({ payerId, ownerType, ownerId, session }) =>
  assertAccountDeletionFencesOpen({
    userIds: [payerId, ownerType === "barber" ? ownerId : null],
    session,
  });

export const runAccountDeletionGuardedMutation = ({ userId, operation }) =>
  runWithAccountDeletionFence({ userId, operation });
