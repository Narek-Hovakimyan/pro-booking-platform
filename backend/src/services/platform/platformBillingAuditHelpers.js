import PlatformAuditLog from "../../models/PlatformAuditLog.js";

const createPlatformAuditLog = async ({
  actorId,
  action,
  salonId,
  targetUserId,
  subscriptionId,
  paymentAttemptId,
  oldValue,
  newValue,
  note,
  requestIp,
}) => {
  return PlatformAuditLog.create({
    actorId,
    action,
    salonId: salonId || null,
    targetUserId: targetUserId || null,
    subscriptionId: subscriptionId || null,
    paymentAttemptId: paymentAttemptId || null,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    note: note || "",
    requestIp: requestIp || "",
  });
};

export const createAuditLogOrRollback = async (payload, rollback) => {
  try {
    return await createPlatformAuditLog(payload);
  } catch (error) {
    if (rollback) {
      try {
        await rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  }
};
