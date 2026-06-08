export const sameId = (left, right) =>
  String(left || "") === String(right || "");

export const isSalonOwner = (salon, userId) =>
  sameId(salon?.ownerId, userId);

export const isSalonAdmin = (salon, userId) =>
  Array.isArray(salon?.admins) &&
  salon.admins.some((adminId) => sameId(adminId, userId));

export const canManageSalonRequest = (salon, userId) =>
  isSalonOwner(salon, userId) || isSalonAdmin(salon, userId);

/** Alias for canManageSalonRequest — clearer name for owner/admin permission check. */
export const canManageSalon = canManageSalonRequest;

/**
 * Check if a user can remove a barber from a salon.
 * Owner can remove anyone except themselves.
 * Admin can remove regular barbers only (not owner, not other admins).
 */
export const canRemoveBarber = (salon, userId, targetBarberId) => {
  if (isSalonOwner(salon, userId)) {
    // Owner cannot remove themselves
    return !sameId(userId, targetBarberId);
  }

  if (isSalonAdmin(salon, userId)) {
    // Admin cannot remove owner, other admins, or themselves
    return (
      !isSalonOwner(salon, targetBarberId) &&
      !isSalonAdmin(salon, targetBarberId) &&
      !sameId(userId, targetBarberId)
    );
  }

  return false;
};
