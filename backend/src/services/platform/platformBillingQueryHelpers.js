import User from "../../models/User.js";
import { BILLING_OWNER_SUMMARY_FIELDS } from "./platformBillingConstants.js";
import { getIdString } from "./platformBillingCalculations.js";

/* ── Owner lookup helper ─────────────────────────────── */

export const getOwnerMap = async (ownerIds) => {
  const uniqueIds = [...new Set(ownerIds.map((id) => getIdString(id)))];
  if (uniqueIds.length === 0) return {};

  const owners = await User.find({ _id: { $in: uniqueIds } })
    .select(BILLING_OWNER_SUMMARY_FIELDS)
    .lean();

  const map = {};
  for (const owner of owners) {
    map[getIdString(owner._id)] = owner;
  }
  return map;
};
