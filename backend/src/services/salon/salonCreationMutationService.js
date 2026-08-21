import { runAccountDeletionGuardedMutation } from "../users/accountDeletionGuardedMutations.js";

export const createSalonWithDeletionFence = async ({
  userId, salonPayload, ownerWorksAsSpecialist, Salon, User, openCurrentWorkHistory,
}) => runAccountDeletionGuardedMutation({
  userId,
  operation: async (session) => {
    const created = session ? await Salon.create([salonPayload], { session }) : await Salon.create(salonPayload);
    const salon = Array.isArray(created) ? created[0] : created;
    const userQuery = User.findById(userId);
    const user = session ? await userQuery.session(session) : await userQuery;
    if (!user) throw new Error("Account is no longer available");
    user.salons = user.salons || [];
    const hasPrimary = user.salons.some((membership) => membership.isPrimary);
    user.salons.push({
      salon: salon._id, status: "approved", joinedAt: new Date(), isPrimary: !hasPrimary,
      relationshipType: "staff", relationshipStatus: "accepted",
      worksAsSpecialist: ownerWorksAsSpecialist !== false,
    });
    if (!hasPrimary) {
      user.salon = salon._id;
      user.salonStatus = "approved";
    }
    if (ownerWorksAsSpecialist !== false) openCurrentWorkHistory(user, salon);
    await user.save({ session });
    return { salon, user };
  },
});
