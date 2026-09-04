import mongoose from "mongoose";

import Salon from "../../models/Salon.js";
import SalonJobApplication from "../../models/SalonJobApplication.js";
import SalonJoinRequest from "../../models/SalonJoinRequest.js";
import User from "../../models/User.js";
import {
  JOB_ONBOARDING_MAPPING_VERSION,
  getJobOnboardingMapping,
} from "../../utils/salonJobApplicationUtils.js";
import { openCurrentWorkHistory, syncLegacySalonFields } from "../../utils/salonHelpers.js";

export class SalonJobOnboardingError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sessionQuery = (query, session) =>
  query?.session ? query.session(session) : query;

const sameId = (left, right) =>
  String(left?._id || left?.id || left || "") ===
  String(right?._id || right?.id || right || "");

const validOffer = (application) => {
  const offer = application?.onboardingOffer;
  const mapping = getJobOnboardingMapping(offer);

  if (!offer || !mapping || offer.mappingVersion !== JOB_ONBOARDING_MAPPING_VERSION) {
    return null;
  }

  if (
    !sameId(offer.salonId, application.salonId) ||
    !sameId(offer.jobPostId, application.jobId) ||
    offer.relationshipType !== mapping.relationshipType ||
    offer.relationshipStatus !== mapping.relationshipStatus ||
    offer.worksAsSpecialist !== mapping.worksAsSpecialist ||
    !offer.offeredAt
  ) {
    return null;
  }

  return offer;
};

const matchingEntries = (barber, salonId) =>
  (Array.isArray(barber?.salons) ? barber.salons : []).filter((entry) =>
    sameId(entry?.salon, salonId)
  );

const hasLegacyMembershipConflict = (barber, salonId) =>
  sameId(barber?.salon, salonId) && barber?.salonStatus && barber.salonStatus !== "none";

const matchesOfferMembership = (entry, offer) =>
  entry?.status === "approved" &&
  entry?.relationshipType === offer.relationshipType &&
  entry?.relationshipStatus === offer.relationshipStatus &&
  entry?.worksAsSpecialist === offer.worksAsSpecialist;

const pendingDirectRequestFilter = (salonId, barberId) => ({
  salonId,
  barberId,
  status: "pending",
  $or: [
    { source: "direct" },
    { source: { $exists: false } },
    { source: null },
  ],
});

const addMembershipForOffer = (barber, offer, salon) => {
  const existing = Array.isArray(barber.salons) ? barber.salons : [];
  const hasOtherApproved = existing.some((entry) => entry?.status === "approved");

  barber.salons = [
    ...existing,
    {
      salon: offer.salonId,
      status: "approved",
      joinedAt: new Date(),
      isPrimary: !hasOtherApproved,
      relationshipType: offer.relationshipType,
      relationshipStatus: "accepted",
      worksAsSpecialist: offer.worksAsSpecialist,
      staffPayment: { type: "none" },
    },
  ];
  syncLegacySalonFields(barber);
  openCurrentWorkHistory(barber, salon);
};

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

export const confirmSalonJobOnboarding = async ({ applicationId, applicantId }) =>
  runTransaction(async (session) => {
    const application = await sessionQuery(
      SalonJobApplication.findById(applicationId),
      session
    );

    if (!application) {
      throw new SalonJobOnboardingError(404, "Application not found");
    }
    if (!sameId(application.applicantId, applicantId)) {
      throw new SalonJobOnboardingError(403, "Not allowed to confirm this application");
    }
    if (application.status !== "accepted") {
      throw new SalonJobOnboardingError(409, "Application is not accepted");
    }

    const offer = validOffer(application);
    if (!offer) {
      throw new SalonJobOnboardingError(409, "Onboarding offer is unavailable");
    }

    const barber = await sessionQuery(User.findById(applicantId), session);
    if (!barber || barber.role !== "barber") {
      throw new SalonJobOnboardingError(403, "Only the applicant can confirm onboarding");
    }

    const entries = matchingEntries(barber, offer.salonId);
    if (application.onboardingStatus === "confirmed") {
      if (entries.length === 1 && matchesOfferMembership(entries[0], offer)) {
        return { application, idempotent: true };
      }
      throw new SalonJobOnboardingError(409, "Confirmed onboarding has invalid membership state");
    }
    if (application.onboardingStatus !== "pending_consent") {
      throw new SalonJobOnboardingError(409, "Onboarding is unavailable");
    }
    if (entries.length > 0 || hasLegacyMembershipConflict(barber, offer.salonId)) {
      throw new SalonJobOnboardingError(409, "Salon membership already exists");
    }

    const pendingDirectRequest = await sessionQuery(
      SalonJoinRequest.findOne(pendingDirectRequestFilter(offer.salonId, applicantId)),
      session
    );
    if (pendingDirectRequest) {
      throw new SalonJobOnboardingError(409, "A direct salon request is still pending");
    }

    const salon = await sessionQuery(Salon.findById(offer.salonId), session);
    if (!salon) {
      throw new SalonJobOnboardingError(409, "Salon is unavailable");
    }

    addMembershipForOffer(barber, offer, salon);
    application.onboardingStatus = "confirmed";
    application.onboardingConsent = {
      mappingVersion: JOB_ONBOARDING_MAPPING_VERSION,
      consentedAt: new Date(),
    };

    await barber.save({ session });
    await application.save({ session });

    return { application, idempotent: false };
  });
