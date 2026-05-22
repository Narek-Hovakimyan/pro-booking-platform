import Salon from "../../models/Salon.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";

const membershipUserFields = "salon salonStatus salons role";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const toUniqueIdStrings = (values) =>
  Array.from(
    new Set(values.map((value) => getIdString(value)).filter(Boolean))
  );

const getUserId = (user) => getIdString(user?._id || user?.id || user);

const loadMembershipUser = async (user) => {
  if (!user) return null;

  if (
    Array.isArray(user.salons) ||
    Object.prototype.hasOwnProperty.call(user, "salon") ||
    Object.prototype.hasOwnProperty.call(user, "salonStatus")
  ) {
    return user;
  }

  const userId = getUserId(user);

  if (!userId) return null;

  return User.findById(userId).select(membershipUserFields);
};

export const getUserSalonIds = (user) => {
  const salonIds = Array.isArray(user?.salons)
    ? user.salons.map((entry) => entry?.salon)
    : [];

  if (user?.salon) {
    salonIds.push(user.salon);
  }

  return toUniqueIdStrings(salonIds);
};

export const getApprovedUserSalonIds = (user) => {
  const approvedSalonIds = Array.isArray(user?.salons)
    ? user.salons
        .filter((entry) => entry?.status === "approved")
        .map((entry) => entry?.salon)
    : [];

  if (user?.salonStatus === "approved" && user?.salon) {
    approvedSalonIds.push(user.salon);
  }

  return toUniqueIdStrings(approvedSalonIds);
};

export const getPrimaryApprovedSalonId = (user) => {
  const approvedEntries = Array.isArray(user?.salons)
    ? user.salons.filter((entry) => entry?.status === "approved")
    : [];
  const primaryEntry = approvedEntries.find((entry) => entry?.isPrimary);

  if (primaryEntry?.salon) return getIdString(primaryEntry.salon);
  if (approvedEntries.length === 1) return getIdString(approvedEntries[0].salon);
  if (user?.salonStatus === "approved" && user?.salon) {
    return getIdString(user.salon);
  }

  return null;
};

export const isUserApprovedForSalon = (user, salonId) =>
  getApprovedUserSalonIds(user).includes(getIdString(salonId));

export const isUserSalonOwner = (salon, userId) =>
  getIdString(salon?.ownerId) === getIdString(userId);

export const isUserSalonAdmin = (salon, userId) =>
  Array.isArray(salon?.admins) &&
  salon.admins.some((adminId) => getIdString(adminId) === getIdString(userId));

export const canUserManageSalon = (user, salon) => {
  const userId = getUserId(user);

  return isUserSalonOwner(salon, userId) || isUserSalonAdmin(salon, userId);
};

export const hasAcceptedSalonJoinRequest = async (userId, salonId) => {
  const acceptedJoinRequest = await SalonJoinRequest.findOne({
    barberId: getIdString(userId),
    salonId: getIdString(salonId),
    status: "accepted",
  });

  return Boolean(acceptedJoinRequest);
};

const getAcceptedSalonJoinRequestSalonIds = async (userId) => {
  const requestUserId = getIdString(userId);

  if (!requestUserId) return [];

  const salonIds = await SalonJoinRequest.find({
    barberId: requestUserId,
    status: "accepted",
  }).distinct("salonId");

  return toUniqueIdStrings(salonIds);
};

export const canUserCreateEventForSalon = async (user, salon) => {
  if (canUserManageSalon(user, salon)) {
    return true;
  }

  if (user?.role !== "barber") {
    return false;
  }

  const membershipUser = await loadMembershipUser(user);
  const salonId = getIdString(salon);

  if (isUserApprovedForSalon(membershipUser, salonId)) {
    return true;
  }

  return hasAcceptedSalonJoinRequest(getUserId(user), salonId);
};

export const getManageableSalonQuery = async (user) => {
  const userId = getUserId(user);
  const membershipUser = await loadMembershipUser(user);
  const membershipSalonIds = new Set(getApprovedUserSalonIds(membershipUser));

  const acceptedSalonIds = await getAcceptedSalonJoinRequestSalonIds(userId);
  acceptedSalonIds.forEach((salonId) => membershipSalonIds.add(salonId));

  const query = {
    $or: [{ ownerId: userId }, { admins: userId }],
  };

  if (membershipSalonIds.size > 0) {
    query.$or.push({ _id: { $in: Array.from(membershipSalonIds) } });
  }

  return query;
};

export const findManageableSalonsForUser = async (userId) => {
  const query = await getManageableSalonQuery(userId);
  return Salon.find(query).sort({ name: 1 });
};

export const userHasAnyManageableSalon = async (user) => {
  if (user?.role !== "barber") {
    return false;
  }

  const [managedSalon, membershipUser, acceptedSalonIds] = await Promise.all([
    Salon.findOne({
      $or: [{ ownerId: getUserId(user) }, { admins: getUserId(user) }],
    }).select("_id"),
    loadMembershipUser(user),
    getAcceptedSalonJoinRequestSalonIds(getUserId(user)),
  ]);

  return Boolean(
    managedSalon ||
      acceptedSalonIds.length > 0 ||
      getApprovedUserSalonIds(membershipUser).length > 0
  );
};
