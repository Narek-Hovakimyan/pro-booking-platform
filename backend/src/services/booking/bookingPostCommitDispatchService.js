import { randomUUID } from "node:crypto";

import Booking from "../../models/Booking.js";
import BookingPostCommitDispatch from "../../models/BookingPostCommitDispatch.js";
import { createNotification } from "../notification/notificationService.js";
import { formatBookedMessage } from "../../utils/bookingUtils.js";
import { getBookingNotificationData } from "../../utils/bookingNotificationData.js";
import { getClientName } from "./bookingControllerHelpers.js";
import { emitBookingUpdated } from "./bookingSideEffectsService.js";

export const BOOKING_CREATED_DISPATCH_EVENT = "booking_created";
export const DEFAULT_BOOKING_POST_COMMIT_LEASE_MS = 5 * 60 * 1000;
export const DEFAULT_BOOKING_POST_COMMIT_RETRY_MS = 30 * 1000;
export const DEFAULT_BOOKING_POST_COMMIT_BATCH_SIZE = 25;

const DUPLICATE_KEY_CODE = 11000;
const isDuplicateKeyError = (error) => error?.code === DUPLICATE_KEY_CODE;
const isDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());
const notificationKey = (bookingId) =>
  `booking-post-commit:${String(bookingId)}:${BOOKING_CREATED_DISPATCH_EVENT}:notification`;

const transactionWrite = async (leaseContext, write) => {
  if (leaseContext?.withFencedWrite) return leaseContext.withFencedWrite(write);
  return write({ session: null, afterCommit: null });
};

const assertLeaseOwnership = async (leaseContext) => {
  if (leaseContext?.assertOwned) await leaseContext.assertOwned();
};

export const createBookingPostCommitDispatchService = ({
  model = BookingPostCommitDispatch,
  bookingModel = Booking,
  createNotificationFn = createNotification,
  emitBookingUpdatedFn = emitBookingUpdated,
  getClientNameFn = getClientName,
  now = () => new Date(),
  leaseTokenFactory = randomUUID,
  leaseMs = DEFAULT_BOOKING_POST_COMMIT_LEASE_MS,
  retryMs = DEFAULT_BOOKING_POST_COMMIT_RETRY_MS,
} = {}) => {
  if (!model?.create || !model?.findOneAndUpdate || !model?.find) {
    throw new TypeError("model must support dispatch persistence");
  }
  if (!bookingModel?.findById) throw new TypeError("bookingModel must support findById");
  if (typeof createNotificationFn !== "function" || typeof emitBookingUpdatedFn !== "function") {
    throw new TypeError("delivery dependencies must be functions");
  }
  if (typeof now !== "function" || typeof leaseTokenFactory !== "function") {
    throw new TypeError("time and lease token dependencies must be functions");
  }

  const enqueue = async ({ bookingId, session } = {}) => {
    if (!bookingId) throw new TypeError("bookingId is required");
    const payload = {
      bookingId,
      eventType: BOOKING_CREATED_DISPATCH_EVENT,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now(),
    };
    try {
      const created = await model.create([payload], { session });
      return Array.isArray(created) ? created[0] : created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      return model.findOne({ bookingId, eventType: BOOKING_CREATED_DISPATCH_EVENT }, null, { session });
    }
  };

  const claim = async ({ dispatchId, session } = {}) => {
    if (!dispatchId) return null;
    const currentTime = now();
    if (!isDate(currentTime)) throw new TypeError("now must return a valid Date");
    const leaseToken = leaseTokenFactory();
    if (typeof leaseToken !== "string" || !leaseToken) throw new TypeError("leaseTokenFactory must return a token");
    const operation = model.findOneAndUpdate(
      {
        _id: dispatchId,
        eventType: BOOKING_CREATED_DISPATCH_EVENT,
        $or: [
          { status: "pending", nextAttemptAt: { $lte: currentTime } },
          { status: "failed", nextAttemptAt: { $lte: currentTime } },
          { status: "processing", leaseExpiresAt: { $lte: currentTime } },
        ],
      },
      {
        $set: {
          status: "processing",
          leaseToken,
          leaseExpiresAt: new Date(currentTime.getTime() + leaseMs),
          lastFailureCode: "",
        },
        $inc: { attempts: 1 },
      },
      { new: true, returnDocument: "after", runValidators: true, session }
    );
    return typeof operation?.select === "function"
      ? operation.select("+leaseToken")
      : operation;
  };

  const markDelivered = async ({ dispatch, session } = {}) => {
    const currentTime = now();
    return model.findOneAndUpdate(
      {
        _id: dispatch?._id,
        status: "processing",
        leaseToken: dispatch?.leaseToken,
      },
      {
        $set: { status: "delivered", deliveredAt: currentTime },
        $unset: { leaseToken: "", leaseExpiresAt: "" },
      },
      { new: true, returnDocument: "after", runValidators: true, session }
    );
  };

  const markFailed = async ({ dispatch, session } = {}) => {
    const currentTime = now();
    return model.findOneAndUpdate(
      {
        _id: dispatch?._id,
        status: "processing",
        leaseToken: dispatch?.leaseToken,
      },
      {
        $set: {
          status: "failed",
          nextAttemptAt: new Date(currentTime.getTime() + retryMs),
          lastFailureCode: "delivery_failed",
        },
        $unset: { leaseToken: "", leaseExpiresAt: "" },
      },
      { new: true, returnDocument: "after", runValidators: true, session }
    );
  };

  const deliver = async ({ dispatchId, requester = null, leaseContext = null } = {}) => {
    const dispatch = await transactionWrite(leaseContext, ({ session }) =>
      claim({ dispatchId, session })
    );
    if (!dispatch) return { delivered: false, reason: "not_claimed" };

    try {
      await assertLeaseOwnership(leaseContext);
      const booking = await bookingModel.findById(dispatch.bookingId);
      if (!booking) {
        await transactionWrite(leaseContext, ({ session }) => markDelivered({ dispatch, session }));
        return { delivered: true, reason: "booking_missing" };
      }

      if (booking.createdBy !== "barber") {
        const clientName = await getClientNameFn(booking, requester);
        await transactionWrite(leaseContext, ({ session, afterCommit }) =>
          createNotificationFn({
            userId: booking.barberId,
            type: BOOKING_CREATED_DISPATCH_EVENT,
            message: formatBookedMessage(clientName, booking),
            data: getBookingNotificationData(booking),
            idempotencyKey: notificationKey(booking._id),
            session,
            afterCommit,
          })
        );
      }

      await assertLeaseOwnership(leaseContext);
      emitBookingUpdatedFn(booking, "created");
      const completed = await transactionWrite(leaseContext, ({ session }) =>
        markDelivered({ dispatch, session })
      );
      return completed ? { delivered: true } : { delivered: false, reason: "claim_lost" };
    } catch (error) {
      try {
        await assertLeaseOwnership(leaseContext);
        await transactionWrite(leaseContext, ({ session }) => markFailed({ dispatch, session }));
      } catch {
        // A later lease owner can recover this still-processing dispatch.
      }
      return { delivered: false, reason: "delivery_failed" };
    }
  };

  const recover = async ({ leaseContext = null, batchSize = DEFAULT_BOOKING_POST_COMMIT_BATCH_SIZE } = {}) => {
    const currentTime = now();
    const limit = Number.isSafeInteger(batchSize) && batchSize > 0
      ? batchSize
      : DEFAULT_BOOKING_POST_COMMIT_BATCH_SIZE;
    const due = await model.find({
      eventType: BOOKING_CREATED_DISPATCH_EVENT,
      $or: [
        { status: "pending", nextAttemptAt: { $lte: currentTime } },
        { status: "failed", nextAttemptAt: { $lte: currentTime } },
        { status: "processing", leaseExpiresAt: { $lte: currentTime } },
      ],
    }).sort({ nextAttemptAt: 1, _id: 1 }).limit(limit);
    let delivered = 0;
    for (const dispatch of due) {
      await assertLeaseOwnership(leaseContext);
      const result = await deliver({ dispatchId: dispatch._id, leaseContext });
      if (result.delivered) delivered += 1;
    }
    return { delivered, scanned: due.length };
  };

  return { enqueue, deliver, recover };
};

const defaultBookingPostCommitDispatchService = createBookingPostCommitDispatchService();
let activeBookingPostCommitDispatchService = defaultBookingPostCommitDispatchService;

export const __bookingPostCommitDispatchTestHooks = {
  setService(nextService) {
    activeBookingPostCommitDispatchService = nextService || defaultBookingPostCommitDispatchService;
  },
  resetService() {
    activeBookingPostCommitDispatchService = defaultBookingPostCommitDispatchService;
  },
};

export const enqueueBookingCreatedPostCommitDispatch = (args) =>
  activeBookingPostCommitDispatchService.enqueue(args);

export const deliverBookingCreatedPostCommitDispatch = (args) =>
  activeBookingPostCommitDispatchService.deliver(args);

export const recoverBookingPostCommitDispatches = (args) =>
  activeBookingPostCommitDispatchService.recover(args);
