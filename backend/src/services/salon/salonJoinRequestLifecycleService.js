import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";
import {
  barberFields,
  closeCurrentWorkHistory,
  openCurrentWorkHistory,
  syncLegacySalonFields,
} from "../../utils/salonHelpers.js";
import {
  canManageSalonRequest,
  sameId,
} from "../../utils/salonPermissions.js";
import { canCreateDirectSalonJoinRequest } from "../../utils/salonJoinApplicationPolicy.js";

const DIRECT_REQUEST_SOURCE = "direct";
const MAX_PENDING_DIRECT_JOIN_REQUESTS = 3;
const DIRECT_REAPPLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export class SalonJoinRequestLifecycleError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sessionQuery = (query, session) =>
  query?.session ? query.session(session) : query;

const findMatchingSalonEntries = (barber, salonId) =>
  (Array.isArray(barber?.salons) ? barber.salons : []).filter((entry) =>
    sameId(entry?.salon, salonId)
  );

const hasApprovedMembership = (barber, salonId) =>
  findMatchingSalonEntries(barber, salonId).some(
    (entry) => entry?.status === "approved"
  );

const isDirectRequest = (request) => request?.source !== "job";

const pendingDirectRequestFilter = (barberId) => ({
  barberId,
  status: "pending",
  $or: [
    { source: DIRECT_REQUEST_SOURCE },
    { source: { $exists: false } },
    { source: null },
  ],
});

const countPendingDirectRequests = (barberId, session) =>
  sessionQuery(
    SalonJoinRequest.countDocuments(pendingDirectRequestFilter(barberId)),
    session
  );

const getDirectReapplyAvailableAt = (request) => {
  const value = request?.directReapplyAvailableAt;
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
};

const assertDirectReapplyAllowed = (request, now = new Date()) => {
  const availableAt = getDirectReapplyAvailableAt(request);
  if (availableAt && availableAt > now) {
    throw new SalonJoinRequestLifecycleError(
      429,
      "You can reapply to this salon after the cooldown period"
    );
  }
};

const clearPendingFields = (entry) => {
  entry.relationshipType = "staff";
  entry.relationshipStatus = "pending";
  entry.worksAsSpecialist = true;
  entry.relationshipRequestedBy = undefined;
  entry.relationshipRequestedAt = undefined;
  entry.relationshipRespondedAt = undefined;
  entry.staffPayment = { type: "none" };
};

const clearRejectedFields = (entry) => {
  entry.relationshipType = "staff";
  entry.relationshipStatus = "rejected";
  entry.worksAsSpecialist = false;
  entry.relationshipRequestedBy = undefined;
  entry.relationshipRequestedAt = undefined;
  entry.relationshipRespondedAt = undefined;
  entry.staffPayment = { type: "none" };
};

const normalizePendingMembership = (barber, salonId) => {
  barber.salons = Array.isArray(barber.salons) ? barber.salons : [];
  const matching = findMatchingSalonEntries(barber, salonId);

  if (matching.some((entry) => entry?.status === "approved")) {
    throw new SalonJoinRequestLifecycleError(400, "You already work in this salon");
  }

  const otherEntries = barber.salons.filter((entry) => !sameId(entry?.salon, salonId));
  const entry = matching[0] || { salon: salonId, isPrimary: false };
  entry.salon = salonId;
  entry.status = "pending";
  entry.joinedAt = null;
  entry.isPrimary = false;
  clearPendingFields(entry);

  barber.salons = [...otherEntries, entry];
  syncLegacySalonFields(barber);
};

const normalizeRejectedMembership = (barber, salonId) => {
  barber.salons = Array.isArray(barber.salons) ? barber.salons : [];
  const matching = findMatchingSalonEntries(barber, salonId);

  if (matching.some((entry) => entry?.status === "approved")) {
    throw new SalonJoinRequestLifecycleError(409, "Salon membership is already approved");
  }

  const otherEntries = barber.salons.filter((entry) => !sameId(entry?.salon, salonId));
  const entry = matching[0] || { salon: salonId, isPrimary: false };
  entry.salon = salonId;
  entry.status = "rejected";
  entry.joinedAt = null;
  entry.isPrimary = false;
  clearRejectedFields(entry);

  barber.salons = [...otherEntries, entry];
  syncLegacySalonFields(barber);
};

const normalizeAcceptedMembership = (barber, salon) => {
  const salonId = salon._id || salon;
  barber.salons = Array.isArray(barber.salons) ? barber.salons : [];
  const matching = findMatchingSalonEntries(barber, salonId);
  const entry = matching[0] || { salon: salonId };
  const otherEntries = barber.salons.filter((item) => !sameId(item?.salon, salonId));
  const hasOtherApproved = otherEntries.some((item) => item?.status === "approved");

  entry.salon = salonId;
  entry.status = "approved";
  entry.joinedAt = entry.joinedAt || new Date();
  entry.isPrimary = !hasOtherApproved;
  entry.relationshipType = "staff";
  entry.relationshipStatus = "accepted";
  entry.worksAsSpecialist = true;
  entry.relationshipRequestedBy = undefined;
  entry.relationshipRequestedAt = undefined;
  entry.relationshipRespondedAt = undefined;
  entry.staffPayment = { type: "none" };

  barber.salons = [...otherEntries, entry];
  syncLegacySalonFields(barber);
  openCurrentWorkHistory(barber, salon);
};

const saveDoc = (doc, session) =>
  doc?.save ? doc.save({ session }) : Promise.resolve(doc);

const populateRequest = async (request, session) => {
  if (!request?.populate) return request;
  await request.populate({ path: "salonId", options: { session } });
  return request;
};

const readPendingRequest = (salonId, barberId) =>
  runTransaction((session) =>
    sessionQuery(
      SalonJoinRequest.findOne({ salonId, barberId, status: "pending" })
        .populate({ path: "salonId", options: { session } }),
      session
    )
  );

const runTransaction = async (callback) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

export const cancelAcceptedSalonJoinRequests = ({ salonId, barberId, session }) =>
  SalonJoinRequest.updateMany(
    { salonId, barberId, status: "accepted" },
    { $set: { status: "cancelled" } },
    { session }
  );

export const requestSalonJoinLifecycle = async ({ salonId, barber }) => {
  const barberId = barber?._id;
  let notification = null;

  try {
    const result = await runTransaction(async (session) => {
      const salon = await sessionQuery(Salon.findById(salonId), session);

      if (!salon) {
        throw new SalonJoinRequestLifecycleError(404, "Salon not found");
      }

      const barberDoc = await sessionQuery(User.findById(barberId), session);

      if (!barberDoc || barberDoc.role !== "barber") {
        throw new SalonJoinRequestLifecycleError(404, "Barber not found");
      }

      if (hasApprovedMembership(barberDoc, salon._id)) {
        throw new SalonJoinRequestLifecycleError(400, "You already work in this salon");
      }

      const acceptedRequest = await sessionQuery(
        SalonJoinRequest.findOne({
          salonId: salon._id,
          barberId,
          status: "accepted",
        }),
        session
      );

      const pendingRequest = await sessionQuery(
        SalonJoinRequest.findOne({
          salonId: salon._id,
          barberId,
          status: "pending",
        }).populate("salonId"),
        session
      );

      if (pendingRequest) {
        return {
          request: pendingRequest,
          salonStatus: barberDoc.salonStatus || "pending",
          statusCode: 200,
        };
      }

      if (!canCreateDirectSalonJoinRequest(salon)) {
        throw new SalonJoinRequestLifecycleError(
          403,
          "This salon is not accepting direct join requests"
        );
      }

      const closedRequest = acceptedRequest || await sessionQuery(
        SalonJoinRequest.findOne({
          salonId: salon._id,
          barberId,
          status: { $in: ["rejected", "cancelled"] },
        }).sort({ updatedAt: -1 }),
        session
      );

      let request;

      if (closedRequest && !isDirectRequest(closedRequest)) {
        throw new SalonJoinRequestLifecycleError(
          409,
          "This request must be reopened through its original application"
        );
      }

      if (closedRequest) {
        assertDirectReapplyAllowed(closedRequest);
      }

      const pendingDirectCount = await countPendingDirectRequests(barberId, session);
      if (pendingDirectCount >= MAX_PENDING_DIRECT_JOIN_REQUESTS) {
        throw new SalonJoinRequestLifecycleError(
          429,
          "You already have the maximum number of pending direct salon requests"
        );
      }

      if (closedRequest) {
        request = await sessionQuery(
          SalonJoinRequest.findOneAndUpdate(
            { _id: closedRequest._id, status: closedRequest.status },
            {
              $set: {
                status: "pending",
                source: DIRECT_REQUEST_SOURCE,
                directReapplyAvailableAt: null,
              },
            },
            { new: true, session }
          ).populate("salonId"),
          session
        );
      } else {
        [request] = await SalonJoinRequest.create(
          [{
            salonId: salon._id,
            barberId,
            status: "pending",
            source: DIRECT_REQUEST_SOURCE,
            directReapplyAvailableAt: null,
          }],
          { session }
        );
        await populateRequest(request, session);
      }

      normalizePendingMembership(barberDoc, salon._id);
      await saveDoc(barberDoc, session);
      notification = {
        userId: salon.ownerId,
        type: "salon_join_requested",
        message: `${barber.name} wants to join ${salon.name}`,
      };

      return {
        request,
        salonStatus: "pending",
        statusCode: 201,
      };
    });

    return { ...result, notification };
  } catch (error) {
    if (error?.code === 11000) {
      const pendingRequest = await readPendingRequest(salonId, barberId);
      if (pendingRequest) {
        return {
          request: pendingRequest,
          salonStatus: "pending",
          statusCode: 200,
          notification: null,
        };
      }
    }

    throw error;
  }
};

const cancelRequestInTransaction = async ({ request, barberId, session }) => {
  if (!request) {
    throw new SalonJoinRequestLifecycleError(404, "Pending request not found");
  }

  if (!sameId(request.barberId, barberId)) {
    throw new SalonJoinRequestLifecycleError(403, "You can only cancel your own request");
  }

  if (request.status === "cancelled") {
    return {
      request,
      salonStatus: "none",
    };
  }

  if (request.status !== "pending") {
    throw new SalonJoinRequestLifecycleError(400, "Only pending requests can be cancelled");
  }

  const directReapplyAvailableAt = isDirectRequest(request)
    ? new Date(Date.now() + DIRECT_REAPPLY_COOLDOWN_MS)
    : null;
  const claimedRequest = await sessionQuery(
    SalonJoinRequest.findOneAndUpdate(
      { _id: request._id, barberId, status: "pending" },
      {
        $set: {
          status: "cancelled",
          ...(directReapplyAvailableAt ? { directReapplyAvailableAt } : {}),
        },
      },
      { new: true, session }
    ),
    session
  );

  if (!claimedRequest) {
    throw new SalonJoinRequestLifecycleError(409, "Salon request has already been decided");
  }

  return {
    request: claimedRequest,
    salonStatus: "none",
  };
};

export const cancelSalonJoinRequestLifecycle = async ({ requestId, barberId }) =>
  runTransaction(async (session) => {
    const request = await sessionQuery(SalonJoinRequest.findById(requestId), session);
    return cancelRequestInTransaction({ request, barberId, session });
  });

export const cancelSalonJoinRequestBySalonLifecycle = async ({ salonId, barberId }) =>
  runTransaction(async (session) => {
    const request = await sessionQuery(
      SalonJoinRequest.findOne({ salonId, barberId })
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 }),
      session
    );
    return cancelRequestInTransaction({ request, barberId, session });
  });

export const decideSalonJoinRequestLifecycle = async ({
  requestId,
  status,
  actorId,
}) => {
  let notification = null;

  const result = await runTransaction(async (session) => {
    const request = await sessionQuery(
      SalonJoinRequest.findById(requestId).populate("salonId").populate("barberId", barberFields),
      session
    );

    if (!request) {
      throw new SalonJoinRequestLifecycleError(404, "Pending request not found");
    }

    const salon = request.salonId;

    if (!canManageSalonRequest(salon, actorId)) {
      throw new SalonJoinRequestLifecycleError(403, "Only salon owner or admin can manage requests");
    }

    if (sameId(actorId, request.barberId?._id || request.barberId)) {
      throw new SalonJoinRequestLifecycleError(403, "You cannot manage your own join request");
    }

    if (request.status === status) {
      return { request, status };
    }

    if (request.status !== "pending") {
      throw new SalonJoinRequestLifecycleError(409, "Salon request has already been decided");
    }

    const barberId = request.barberId?._id || request.barberId;
    const barber = await sessionQuery(User.findById(barberId), session);

    if (!barber) {
      throw new SalonJoinRequestLifecycleError(404, "Barber not found");
    }

    if (status === "rejected" && hasApprovedMembership(barber, salon._id)) {
      throw new SalonJoinRequestLifecycleError(409, "Salon membership is already approved");
    }

    const directReapplyAvailableAt =
      status === "rejected" && isDirectRequest(request)
        ? new Date(Date.now() + DIRECT_REAPPLY_COOLDOWN_MS)
        : null;
    const claimedRequest = await sessionQuery(
      SalonJoinRequest.findOneAndUpdate(
        { _id: request._id, status: "pending" },
        {
          $set: {
            status,
            ...(directReapplyAvailableAt ? { directReapplyAvailableAt } : {}),
          },
        },
        { new: true, session }
      ).populate("salonId").populate("barberId", barberFields),
      session
    );

    if (!claimedRequest) {
      const currentRequest = await sessionQuery(SalonJoinRequest.findById(request._id), session);
      if (currentRequest?.status === status) {
        return { request: currentRequest, status };
      }
      throw new SalonJoinRequestLifecycleError(409, "Salon request has already been decided");
    }

    if (status === "accepted") {
      normalizeAcceptedMembership(barber, salon);
    } else {
      normalizeRejectedMembership(barber, salon._id);
      closeCurrentWorkHistory(barber, salon._id);
    }

    await saveDoc(barber, session);
    notification = {
      userId: barber._id,
      type: status === "accepted" ? "salon_join_accepted" : "salon_join_rejected",
      message: `Your request to join ${salon.name} was ${status}`,
    };

    return {
      request: claimedRequest,
      status,
    };
  });

  return { ...result, notification };
};
