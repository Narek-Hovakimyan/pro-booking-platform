import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Store,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  finalizeMyBarberOnboarding,
  getMyBarberOnboarding,
  updateMyBarberOnboardingWorkplace,
} from "@/shared/api/barberOnboarding";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import {
  getOnboardingStepRoute,
  isOnboardingComplete,
} from "@/shared/utils/barberOnboardingRoutes";

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
    description: "Continue to salon settings to connect with an existing salon.",
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

const getSavedWorkplace = (status) => {
  const workplace = status?.state?.workplace;
  return validWorkplaces.has(workplace) ? workplace : "";
};

const getOnboardingPageRedirect = (status) => {
  if (isOnboardingComplete(status)) {
    return "/admin";
  }

  const stepRoute = getOnboardingStepRoute(status?.state?.currentStep);
  if (stepRoute !== "/onboarding" && getSavedWorkplace(status)) {
    return stepRoute;
  }

  return null;
};

const canFinalizeStatus = (status) =>
  status?.progress?.readyForFinalization === true ||
  status?.allowedActions?.includes("FINALIZE_ONBOARDING");

export default function BarberOnboardingPage() {
  const navigate = useNavigate();
  const isMountedRef = useRef(false);
  const saveRequestIdRef = useRef(0);
  const [status, setStatus] = useState(null);
  const [selectedWorkplace, setSelectedWorkplace] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    isMountedRef.current = true;
    let isMounted = true;

    async function loadStatus() {
      setIsLoading(true);
      setError("");

      try {
        const data = await getMyBarberOnboarding();
        if (!isMounted) return;
        setStatus(data);
        setSelectedWorkplace(getSavedWorkplace(data));
        const redirectPath = getOnboardingPageRedirect(data);
        if (redirectPath) {
          navigate(redirectPath, { replace: true });
        }
      } catch {
        if (isMounted) {
          setError("Could not load onboarding status. Please try again.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadStatus();

    return () => {
      isMounted = false;
      isMountedRef.current = false;
      saveRequestIdRef.current += 1;
    };
  }, [navigate]);

  const savedWorkplace = getSavedWorkplace(status);
  const isReadyForFinalization = canFinalizeStatus(status);
  const canFinalize = isReadyForFinalization && !isLoading && !isSaving && !isFinalizing;
  const canSave = validWorkplaces.has(selectedWorkplace) &&
    !isLoading &&
    !isSaving &&
    !isFinalizing;

  const selectedOption = useMemo(
    () => workplaceOptions.find((option) => option.value === selectedWorkplace),
    [selectedWorkplace]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSave) {
      setError("Choose how you work before continuing.");
      return;
    }

    setIsSaving(true);
    setError("");
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    const workplaceToSave = selectedWorkplace;
    const isActiveSave = () =>
      isMountedRef.current && saveRequestIdRef.current === requestId;

    try {
      await updateMyBarberOnboardingWorkplace(workplaceToSave);
      if (!isActiveSave()) return;
      const data = await getMyBarberOnboarding();
      if (!isActiveSave()) return;
      setStatus(data);
      setSelectedWorkplace(getSavedWorkplace(data));
      const redirectPath = getOnboardingPageRedirect(data);
      if (redirectPath) {
        navigate(redirectPath);
      }
    } catch {
      if (isActiveSave()) {
        setError("Could not save your workplace choice. Please try again.");
      }
    } finally {
      if (isActiveSave()) {
        setIsSaving(false);
      }
    }
  };

  const handleFinalize = async () => {
    if (!canFinalize) return;

    setIsFinalizing(true);
    setError("");
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    const isActiveFinalize = () =>
      isMountedRef.current && saveRequestIdRef.current === requestId;

    try {
      await finalizeMyBarberOnboarding();
      if (!isActiveFinalize()) return;
      const data = await getMyBarberOnboarding();
      if (!isActiveFinalize()) return;
      setStatus(data);
      setSelectedWorkplace(getSavedWorkplace(data));
      if (isOnboardingComplete(data)) {
        navigate("/admin");
      } else {
        setError("Onboarding could not be confirmed complete. Please try again.");
      }
    } catch {
      if (isActiveFinalize()) {
        setError("Could not finalize onboarding. Please review the missing steps.");
      }
    } finally {
      if (isActiveFinalize()) {
        setIsFinalizing(false);
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
          Barber onboarding
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
          Choose how you work
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-neutral-600 sm:text-base">
          This choice only sets your onboarding path. Salon approval can happen later.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              Loading onboarding status...
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {savedWorkplace && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Saved selection:{" "}
                    {workplaceOptions.find((option) => option.value === savedWorkplace)?.label}
                  </span>
                </div>
              )}

              {isReadyForFinalization && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700">
                      <ClipboardCheck className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold text-neutral-950">
                        Ready to finish onboarding
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-neutral-600">
                        Your basics, workplace choice, address, and personal schedule are ready.
                      </p>
                      <Button
                        className="mt-4"
                        disabled={isFinalizing}
                        onClick={handleFinalize}
                        type="button"
                        variant="primary"
                      >
                        {isFinalizing ? "Finishing..." : "Finish onboarding"}
                      </Button>
                    </div>
                  </div>
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
                <Button
                  className="gap-2"
                  disabled={!canSave}
                  type="submit"
                  variant="primary"
                >
                  {isSaving ? "Saving..." : "Save and continue"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
