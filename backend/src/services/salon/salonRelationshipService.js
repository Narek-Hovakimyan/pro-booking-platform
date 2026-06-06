import User from "../../models/User.js";
import { sameId } from "../../utils/salonPermissions.js";

export const relationshipTypes = new Set(["staff", "chair_renter"]);
export const relationshipStatuses = new Set(["pending", "accepted", "rejected"]);

export const getRelationshipType = (membership) =>
  membership?.relationshipType || "staff";

export const getRelationshipStatus = (membership) =>
  membership?.relationshipStatus || "accepted";

export const isAcceptedStaffMember = (membership) =>
  membership?.status === "approved" &&
  getRelationshipType(membership) === "staff" &&
  getRelationshipStatus(membership) === "accepted";

export const serializeRelationshipFields = (membership = {}) => ({
  relationshipType: getRelationshipType(membership),
  relationshipStatus: getRelationshipStatus(membership),
  relationshipRequestedBy: membership.relationshipRequestedBy || null,
  relationshipRequestedAt: membership.relationshipRequestedAt || null,
  relationshipRespondedAt: membership.relationshipRespondedAt || null,
});

export const getMemberRelationshipType = async (barberId, salonId) => {
  const barber = await User.findById(barberId).select(
    "_id role salons salon salonStatus"
  );

  if (!barber || barber.role !== "barber") return null;

  const salonEntry = (barber.salons || []).find(
    (entry) => sameId(entry?.salon, salonId) && entry?.status === "approved"
  );

  if (salonEntry) {
    return serializeRelationshipFields(salonEntry);
  }

  if (barber.salonStatus === "approved" && sameId(barber.salon, salonId)) {
    return {
      relationshipType: "staff",
      relationshipStatus: "accepted",
      relationshipRequestedBy: null,
      relationshipRequestedAt: null,
      relationshipRespondedAt: null,
    };
  }

  return null;
};
