import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Store,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import ProfessionalBasicsStep from "@/barber/components/onboarding/ProfessionalBasicsStep";
import PersonalScheduleView from "@/barber/components/schedule/PersonalScheduleView";
import {
  finalizeMyBarberOnboarding,
  getMyBarberOnboarding,
  updateMyBarberOnboardingWorkplace,
} from "@/shared/api/barberOnboarding";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import { isOnboardingComplete } from "@/shared/utils/barberOnboardingRoutes";

const workplaceOptions = [
  {
    value: "independent",
    label: "Independent",
    description: "Use your own profile, address, services, and personal schedule.",
    icon: MapPin,
  },
  {
    value: "salon",
    label: "Salon",
    description: "Connect with an existing salon while keeping onboarding personal.",
    icon: Store,
  },
  {
    value: "both",
    label: "Both",
    description: "Work independently now and keep salon access available later.",
    icon: BriefcaseBusiness,
  },
];

const validWorkplaces = new Set(workplaceOptions.map((option) => option.value));

const stepCopy = {
  professional_basics: {
    title: "Tell clients who you are",
    description: "Start with the core profile details required for booking.",
  },
  workplace: {
    title: "Choose how you work",
    description: "This choice only sets your onboarding path. Salon approval can happen later.",
  },
  personal_schedule: {
    title: "Set your personal schedule",
    description: "Your independent availability stays separate from salon schedules.",
  },
  review: {
    title: "Review and finish",
    description: "Confirm the required details before opening the admin workspace.",
  },
};

const getSavedWorkplace = (status) => {
  const workplace = status?.state?.workplace;
  return validWorkplaces.has(workplace) ? workplace : "";
};

const canFinalizeStatus = (status) =>
  status?.progress?.readyForFinalization === true ||
  status?.allowedActions?.includes("FINALIZE_ONBOARDING");

const getMissingRequirements = (status) => {
  if (Array.isArray(status?.missing)) return status.missing;
  if (Array.isArray(status?.progress?.missing)) return status.progress.missing;
  return [];
};

export default function BarberOnboardingPage() {
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id || currentUser?._id;
  const mountedRef = useRef(false);
  const tokenRef = useRef(0);
  const [status, setStatus] = useState(null);
  const [selectedWorkplace, setSelectedWorkplace] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState("");

  const isActive = useCallback(
    (token) => mountedRef.current && tokenRef.current === token,
    []
  );

  const applyStatus = useCallback(
    (data) => {
      setStatus(data);
      setSelectedWorkplace(getSavedWorkplace(data));
      if (isOnboardingComplete(data)) {
        navigate("/admin", { replace: true });
      }
    },
    [navigate]
  );

  useEffect(() => {
    mountedRef.current = true;
    const token = ++tokenRef.current;

    async function loadStatus() {
      setIsLoading(true);
      setError("");

      try {
        const data = await getMyBarberOnboarding();
        if (!isActive(token)) return;
        applyStatus(data);
      } catch {
        if (isActive(token)) {
          setError("Could not load onboarding status. Please try again.");
        }
      } finally {
        if (isActive(token)) setIsLoading(false);
      }
    }

    loadStatus();

    return () => {
      mountedRef.current = false;
      tokenRef.current += 1;
    };
  }, [applyStatus, isActive]);

  const savedWorkplace = getSavedWorkplace(status);
  const currentStep = isOnboardingComplete(status)
    ? "completed"
    : status?.state?.currentStep || "professional_basics";
  const copy = stepCopy[currentStep] || stepCopy.review;
  const isReadyForFinalization = canFinalizeStatus(status);
  const missingRequirements = getMissingRequirements(status);
  const needsIndependentAddress =
    currentStep === "review" &&
    missingRequirements.includes("INDEPENDENT_ADDRESS_REQUIRED");
  const canFinalize = isReadyForFinalization && !isLoading && !isSaving && !isFinalizing;
  const canSave = validWorkplaces.has(selectedWorkplace) &&
    !isLoading &&
    !isSaving &&
    !isFinalizing;

  const selectedOption = useMemo(
    () => workplaceOptions.find((option) => option.value === selectedWorkplace),
    [selectedWorkplace]
  );

  const handleChildStatusChange = useCallback(
    (nextStatus) => {
      if (!mountedRef.current) return;
      setError("");
      applyStatus(nextStatus);
    },
    [applyStatus]
  );

  const handleWorkplaceSubmit = async (event) => {
    event.preventDefault();
    if (!canSave) {
      setError("Choose how you work before continuing.");
      return;
    }

    const token = ++tokenRef.current;
    setIsSaving(true);
    setError("");
    const workplaceToSave = selectedWorkplace;

    try {
      await updateMyBarberOnboardingWorkplace(workplaceToSave);
      if (!isActive(token)) return;
      const data = await getMyBarberOnboarding();
      if (!isActive(token)) return;
      applyStatus(data);
    } catch {
      if (isActive(token)) {
        setError("Could not save your workplace choice. Please try again.");
      }
    } finally {
      if (isActive(token)) {
        setIsSaving(false);
      }
    }
  };

  const handleFinalize = async () => {
    if (!canFinalize) return;

    const token = ++tokenRef.current;
    setIsFinalizing(true);
    setError("");

    try {
      await finalizeMyBarberOnboarding();
      if (!isActive(token)) return;
      const data = await getMyBarberOnboarding();
      if (!isActive(token)) return;
      applyStatus(data);
      if (!isOnboardingComplete(data)) {
        setError("Onboarding could not be confirmed complete. Please try again.");
      }
    } catch {
      if (isActive(token)) {
        setError("Could not finalize onboarding. Please review the missing steps.");
      }
    } finally {
      if (isActive(token)) {
        setIsFinalizing(false);
      }
    }
  };

  const renderWorkplaceStep = () => (
    <form className="space-y-5" onSubmit={handleWorkplaceSubmit}>
      {savedWorkplace && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Saved selection:{" "}
            {workplaceOptions.find((option) => option.value === savedWorkplace)?.label}
          </span>
        </div>
      )}

      <fieldset className="space-y-3" disabled={isSaving || isFinalizing}>
        <legend className="sr-only">Workplace type</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {workplaceOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedWorkplace === option.value;

            return (
              <label
                className={cn(
                  "flex cursor-pointer flex-col rounded-2xl border bg-white p-4 transition",
                  isSelected
                    ? "border-brand-500 shadow-sm ring-2 ring-brand-100"
                    : "border-neutral-200 hover:border-neutral-300"
                )}
                key={option.value}
              >
                <input
                  checked={isSelected}
                  className="sr-only"
                  name="workplace"
                  onChange={() => {
                    setSelectedWorkplace(option.value);
                    setError("");
                  }}
                  type="radio"
                  value={option.value}
                />
                <span className="flex items-center justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full border",
                      isSelected
                        ? "border-brand-600 bg-brand-600"
                        : "border-neutral-300 bg-white"
                    )}
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-4 text-base font-bold text-neutral-950">
                  {option.label}
                </span>
                <span className="mt-2 text-sm leading-6 text-neutral-600">
                  {option.description}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-neutral-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500">
          {selectedOption
            ? `${selectedOption.label} will continue to the next onboarding step.`
            : "Select one option to continue."}
        </p>
        <Button className="gap-2" disabled={!canSave} type="submit" variant="primary">
          {isSaving ? "Saving..." : "Save and continue"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-neutral-950">
              {isReadyForFinalization ? "Ready to finish onboarding" : "Review your setup"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              {isReadyForFinalization
                ? "Your basics, workplace choice, address, and personal schedule are ready."
                : "Finish the required steps before opening the admin workspace."}
            </p>
          </div>
        </div>
      </div>

      {missingRequirements.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Missing: {missingRequirements.join(", ")}
        </div>
      )}

      {needsIndependentAddress && (
        <ProfessionalBasicsStep
          mode="address"
          onStatusChange={handleChildStatusChange}
        />
      )}

      <Button
        disabled={!canFinalize}
        onClick={handleFinalize}
        type="button"
        variant="primary"
      >
        {isFinalizing ? "Finishing..." : "Finish onboarding"}
      </Button>
    </div>
  );

  const renderStep = () => {
    if (isLoading) {
      return (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          Loading onboarding status...
        </div>
      );
    }

    if (currentStep === "professional_basics") {
      return <ProfessionalBasicsStep onStatusChange={handleChildStatusChange} />;
    }

    if (currentStep === "workplace") {
      return renderWorkplaceStep();
    }

    if (currentStep === "personal_schedule") {
      return (
        <PersonalScheduleView
          currentUserId={currentUserId}
          embedded
          onStatusChange={handleChildStatusChange}
        />
      );
    }

    return renderReviewStep();
  };

  const shouldFrameStep =
    isLoading || currentStep === "workplace" || currentStep === "review";

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50/80 to-neutral-50 px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
            Barber onboarding
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {copy.title}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-neutral-600 sm:text-base">
            {copy.description}
          </p>
        </div>

        {shouldFrameStep ? (
          <Card>
            <CardContent className="space-y-5">
              {error && (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}
              {renderStep()}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {error && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            )}
            {renderStep()}
          </div>
        )}
      </div>
    </div>
  );
}
