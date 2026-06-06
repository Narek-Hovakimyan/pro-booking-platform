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
