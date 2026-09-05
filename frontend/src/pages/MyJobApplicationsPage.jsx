import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Scissors,
  XCircle,
} from "lucide-react";

import JobOnboardingConsentCard from "@/features/jobs/components/JobOnboardingConsentCard";
import { fetchMyJobApplications } from "@/shared/api/salonJobs";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    icon: Clock,
  },
  reviewed: {
    label: "Reviewed",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    icon: CheckCircle2,
  },
  accepted: {
    label: "Accepted",
    className: "bg-green-50 text-green-700 border-green-200",
    dotClass: "bg-green-500",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
    icon: XCircle,
  },
};

const ROLE_LABELS = {
  barber: "Barber",
  hairdresser: "Hairdresser",
  "nail-artist": "Nail artist",
  "makeup-artist": "Makeup artist",
  receptionist: "Receptionist",
  other: "Other",
};

const getApplicationId = (application) => application?.id || application?._id || "";

function getRoleLabel(job) {
  if (job?.role === "other" && job?.customRole) {
    return `Other: ${job.customRole}`;
  }

  return ROLE_LABELS[job?.role] || job?.role || "Role not specified";
}

function getSalonLocation(salon) {
  return [salon?.city, salon?.address].filter(Boolean).join(", ");
}

function formatDate(dateString) {
  if (!dateString) return "";

  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export default function MyJobApplicationsPage() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchApplications() {
      setIsLoading(true);
      setError("");

      try {
        const { data } = await fetchMyJobApplications();

        if (isMounted) {
          setApplications(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load your applications."
          );
          setApplications([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchApplications();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleBrowseJobs = useCallback(() => {
    navigate("/jobs");
  }, [navigate]);

  const replaceApplication = useCallback((nextApplication) => {
    const nextId = getApplicationId(nextApplication);
    if (!nextId) return;

    setApplications((currentApplications) =>
      currentApplications.map((currentApplication) =>
        getApplicationId(currentApplication) === nextId
          ? nextApplication
          : currentApplication
      )
    );
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-neutral-100" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded-lg bg-neutral-100" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Card className="rounded-2xl sm:rounded-3xl" key={item}>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="h-5 w-24 animate-pulse rounded-full bg-neutral-100" />
                <div className="space-y-2">
                  <div className="h-6 w-3/4 animate-pulse rounded-lg bg-neutral-100" />
                  <div className="h-4 w-1/2 animate-pulse rounded-lg bg-neutral-100" />
                </div>
                <div className="h-4 w-full animate-pulse rounded-lg bg-neutral-100" />
                <div className="h-4 w-2/3 animate-pulse rounded-lg bg-neutral-100" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            My Applications
          </h1>
        </div>
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
        <Button onClick={handleBrowseJobs} type="button" variant="outline">
          Browse jobs
        </Button>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            My Applications
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Track the status of your job applications.
          </p>
        </div>
        <EmptyState
          actionLabel="Browse jobs"
          description="You have not applied to any jobs yet."
          onAction={handleBrowseJobs}
          title="No applications yet"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
          My Applications
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Track the status of your job applications.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {applications.map((application) => {
          const job = application?.job || {};
          const salon = application?.salon || {};
          const salonLocation = getSalonLocation(salon);
          const statusKey = application?.status || "pending";
          const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;
          const StatusIcon = statusConfig.icon;
          const decisionDate =
            statusKey === "accepted"
              ? application.acceptedAt
              : statusKey === "rejected"
                ? application.rejectedAt
                : statusKey === "reviewed"
                  ? application.reviewedAt
                  : null;

          return (
            <Card
              className="rounded-2xl transition-shadow hover:shadow-md sm:rounded-3xl"
              key={getApplicationId(application)}
            >
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusConfig.className}`}
                  >
                    <StatusIcon className="h-3.5 w-3.5" />
                    {statusConfig.label}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-neutral-400">
                    <Calendar className="h-3 w-3" />
                    {formatDate(application.createdAt)}
                  </span>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-neutral-950">
                    {job?.title || "Job"}
                  </h2>
                  <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                    <Scissors aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span>{getRoleLabel(job)}</span>
                  </p>
                </div>

                <div className="space-y-1 rounded-2xl border border-neutral-200 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                    <BriefcaseBusiness aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span>{salon?.name || "Salon"}</span>
                  </p>
                  {salonLocation && (
                    <p className="flex items-start gap-2 text-sm text-neutral-500">
                      <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{salonLocation}</span>
                    </p>
                  )}
                </div>

                {application?.message && (
                  <p className="line-clamp-2 text-sm leading-6 text-neutral-600">
                    {application.message}
                  </p>
                )}

                {application?.experience && (
                  <p className="text-sm text-neutral-500">
                    <span className="font-medium text-neutral-700">Experience:</span>{" "}
                    {application.experience}
                  </p>
                )}

                {decisionDate && (
                  <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <Clock className="h-3 w-3" />
                    {statusConfig.label}: {formatDate(decisionDate)}
                  </p>
                )}

                <JobOnboardingConsentCard
                  application={application}
                  onApplicationConfirmed={replaceApplication}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button onClick={handleBrowseJobs} type="button" variant="outline">
          Browse more jobs
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
