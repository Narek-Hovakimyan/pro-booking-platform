import mongoose from "mongoose";

const TRANSACTION_CAPABLE_TOPOLOGIES = new Set([
  "ReplicaSetWithPrimary", "Sharded", "LoadBalanced",
]);

const logicalSessionTimeout = (description) => {
  if (Number.isInteger(description?.logicalSessionTimeoutMinutes)) return description.logicalSessionTimeoutMinutes;
  if (!description?.servers?.values) return null;
  let timeout = null;
  for (const server of description.servers.values()) {
    if (!Number.isInteger(server?.logicalSessionTimeoutMinutes)) continue;
    timeout = timeout == null ? server.logicalSessionTimeoutMinutes : Math.min(timeout, server.logicalSessionTimeoutMinutes);
  }
  return timeout;
};

export const connectionSupportsBookingTransactions = (connection = mongoose.connection) => {
  if (connection?.readyState !== 1 || typeof connection?.startSession !== "function") return false;
  const description = connection?.client?.topology?.description;
  return Boolean(description?.type && TRANSACTION_CAPABLE_TOPOLOGIES.has(description.type) && Number.isInteger(logicalSessionTimeout(description)));
};

export const createBookingMutationHooks = (hooks) => ({
  ...hooks,
  supportsTransactions() { return connectionSupportsBookingTransactions(); },
  async startSession() {
    if (!connectionSupportsBookingTransactions()) return null;
    const session = await mongoose.connection.startSession();
    return typeof session?.withTransaction === "function" ? session : null;
  },
});

export const createBookingRecord = async ({ Booking, payload, session }) => {
  if (!session) return Booking.create(payload);
  if (typeof Booking.findOneAndUpdate === "function" && payload?._id) {
    return Booking.findOneAndUpdate({ _id: payload._id }, { $setOnInsert: payload }, {
      new: true, upsert: true, session, setDefaultsOnInsert: true,
    });
  }
  const created = await Booking.create([payload], { session });
  return Array.isArray(created) ? created[0] : created;
};
