import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { confirmJobOnboarding } from "@/shared/api/salonJobs";

const ROLE_LABELS = {
  barber: "Barber",
  hairdresser: "Hairdresser",
  "nail-artist": "Nail artist",
  "makeup-artist": "Makeup artist",
  receptionist: "Receptionist",
};

const EMPLOYMENT_LABELS = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  commission: "Commission",
  "rent-chair": "Rent chair",
};

const SPECIALIST_ROLES = new Set([
  "barber",
  "hairdresser",
  "nail-artist",
  "makeup-artist",
]);

const STAFF_EMPLOYMENT_TYPES = new Set([
  "full-time",
  "part-time",
  "contract",
  "commission",
]);

const getApplicationId = (application) => application?.id || application?._id || "";

const hasIdentifier = (value) =>
  typeof value === "string" && value.trim().length > 0;

const hasValidOfferedAt = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !Number.isNaN(Date.parse(value));

const getExpectedMapping = (offer) => {
  if (SPECIALIST_ROLES.has(offer?.role)) {
    if (STAFF_EMPLOYMENT_TYPES.has(offer.employmentType)) {
      return {
        relationshipType: "staff",
        relationshipStatus: "accepted",
        worksAsSpecialist: true,
      };
    }

    if (offer.employmentType === "rent-chair") {
      return {
        relationshipType: "chair_renter",
        relationshipStatus: "accepted",
        worksAsSpecialist: true,
      };
    }
  }

  if (
    offer?.role === "receptionist" &&
    STAFF_EMPLOYMENT_TYPES.has(offer.employmentType)
  ) {
    return {
      relationshipType: "staff",
      relationshipStatus: "accepted",
      worksAsSpecialist: false,
    };
  }

  return null;
};

const getRelationshipLabel = (offer) => {
  const mapping = getExpectedMapping(offer);

  if (!mapping) return "";

  if (mapping.relationshipType === "chair_renter") {
    return "Chair renter — specialist";
  }
  if (mapping.worksAsSpecialist === false) {
    return "Salon staff — non-specialist";
  }

  return "Salon staff — specialist";
};

const hasSafeOffer = (offer) => {
  const mapping = getExpectedMapping(offer);

  return Boolean(
    hasIdentifier(offer?.salonId) &&
      hasIdentifier(offer?.jobPostId) &&
      offer?.relationshipStatus === "accepted" &&
      offer?.mappingVersion === 1 &&
      hasValidOfferedAt(offer?.offeredAt) &&
      typeof offer?.worksAsSpecialist === "boolean" &&
      mapping &&
      offer.relationshipType === mapping.relationshipType &&
      offer.relationshipStatus === mapping.relationshipStatus &&
      offer.worksAsSpecialist === mapping.worksAsSpecialist
  );
};

export default function JobOnboardingConsentCard({ application, onApplicationConfirmed }) {
  const applicationId = getApplicationId(application);
  const [submittingId, setSubmittingId] = useState("");
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const currentApplicationIdRef = useRef("");

  useLayoutEffect(() => {
    mountedRef.current = true;
    currentApplicationIdRef.current = applicationId;

    return () => {
      mountedRef.current = false;
      currentApplicationIdRef.current = "";
    };
  }, [applicationId]);

  if (application?.status !== "accepted") return null;

  const offer = application.onboardingOffer;
  const onboardingStatus = application.onboardingStatus;
  const isPendingConsent = onboardingStatus === "pending_consent" && hasSafeOffer(offer);
  const isSubmitting = submittingId === applicationId;
  const errorMessage = error?.applicationId === applicationId ? error.message : "";

  const confirm = async () => {
    if (!isPendingConsent || isSubmitting || !applicationId) return;

    const requestedId = applicationId;
    setSubmittingId(requestedId);
    setError(null);

    try {
      const response = await confirmJobOnboarding(requestedId);
      if (!mountedRef.current || currentApplicationIdRef.current !== requestedId) return;

      const confirmedApplication = response?.data?.application;
      if (!confirmedApplication || getApplicationId(confirmedApplication) !== requestedId) {
        setError({
          applicationId: requestedId,
          message: "Could not confirm salon onboarding.",
        });
        return;
      }

      onApplicationConfirmed?.(confirmedApplication);
    } catch (requestError) {
      if (mountedRef.current && currentApplicationIdRef.current === requestedId) {
        setError({
          applicationId: requestedId,
          message:
            requestError?.response?.data?.message ||
            "Could not confirm salon onboarding.",
        });
      }
    } finally {
      if (mountedRef.current && currentApplicationIdRef.current === requestedId) {
        setSubmittingId("");
      }
    }
  };

  if (onboardingStatus === "confirmed") {
    return (
      <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
        Salon onboarding confirmed.
      </p>
    );
  }

  if (onboardingStatus === "blocked") {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
        Automatic salon onboarding is unavailable for this job arrangement. Contact the salon for next steps.
      </p>
    );
  }

  if (!isPendingConsent) {
    return (
      <p className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700" role="status">
        Automatic salon onboarding is unavailable for this older application. Contact the salon for next steps.
      </p>
    );
  }

  return (
    <section aria-labelledby={`onboarding-title-${applicationId}`} className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-3">
      <div>
        <h3 className="font-semibold text-blue-950" id={`onboarding-title-${applicationId}`}>
          Your job application was accepted
        </h3>
        <p className="mt-1 text-sm text-blue-900">
          Salon membership has not been created yet. Confirm to activate your salon relationship.
        </p>
      </div>
      <dl className="grid gap-2 text-sm text-blue-950">
        <div className="flex justify-between gap-3">
          <dt className="font-medium">Role</dt>
          <dd className="text-right">{ROLE_LABELS[offer.role] || offer.role}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-medium">Employment</dt>
          <dd className="text-right">{EMPLOYMENT_LABELS[offer.employmentType] || offer.employmentType}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-medium">Salon relationship</dt>
          <dd className="text-right">{getRelationshipLabel(offer)}</dd>
        </div>
      </dl>
      {errorMessage && (
        <p className="text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
      <Button aria-busy={isSubmitting} disabled={isSubmitting} onClick={confirm} type="button">
        {isSubmitting ? "Confirming salon onboarding…" : "Confirm salon onboarding"}
      </Button>
    </section>
  );
}
