export const JOIN_APPLICATION_POLICIES = Object.freeze([
  "closed",
  "job_only",
  "open",
]);

export const LEGACY_JOIN_APPLICATION_POLICY = "open";

const policySet = new Set(JOIN_APPLICATION_POLICIES);

export const isJoinApplicationPolicy = (value) =>
  typeof value === "string" && policySet.has(value);

export const getEffectiveJoinApplicationPolicy = (salonOrPolicy) => {
  const value =
    salonOrPolicy && typeof salonOrPolicy === "object"
      ? salonOrPolicy.joinApplicationPolicy
      : salonOrPolicy;

  return isJoinApplicationPolicy(value) ? value : LEGACY_JOIN_APPLICATION_POLICY;
};

export const canCreateDirectSalonJoinRequest = (salonOrPolicy) =>
  getEffectiveJoinApplicationPolicy(salonOrPolicy) === "open";
